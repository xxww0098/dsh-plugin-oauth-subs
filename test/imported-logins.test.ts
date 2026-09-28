import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { ImportedLoginStale, TokenManager } from '../lib/oauth/tokens.js'
import { getStoredSession, saveSession } from '../lib/oauth/store.js'
import { codexImported } from '../lib/oauth/import-auth.js'
import { cursorImported } from '../lib/oauth/cursor/import.js'
import { clineImported } from '../lib/oauth/cline/import.js'
import { kimiImported } from '../lib/oauth/kimi/import.js'

// Refresh timers are unref'd (tokens.ts waitFor); keep the loop alive.
const keepalive = setInterval(() => {}, 60_000)
after(() => clearInterval(keepalive))

function jwt(payload) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part(payload)}.sig`
}

const CURSOR_PREEMPT_MS = 5 * 60_000

/**
 * One row per read-only family: `write(tag, expiresAt, account?)` puts a login
 * into the vendor CLI's own store, `seed` is what the reader needs to find it
 * again, `hook` is the family's real `imported` hook pointed at that store.
 * `otherAccount` is set where the store names its account.
 */
const FAMILIES = [
  {
    provider: 'codex',
    otherAccount: 'acct-codex-other',
    async setup(dir) {
      await mkdir(join(dir, '.codex'), { recursive: true })
      const file = join(dir, '.codex', 'auth.json')
      return {
        hook: codexImported,
        seed: { source: file },
        write: (tag, expiresAt, account = 'acct-codex') => writeFile(file, JSON.stringify({
          tokens: {
            access_token: jwt({ exp: Math.floor(expiresAt / 1000), tag }),
            refresh_token: `rt-codex-${tag}`,
            id_token: jwt({ email: 'codex@example.test', 'https://api.openai.com/auth': { chatgpt_account_id: account } }),
          },
          last_refresh: new Date(0).toISOString(),
        })),
      }
    },
  },
  {
    provider: 'cursor',
    otherAccount: 'auth0|cursor-other',
    async setup() {
      const store: any = {}
      return {
        hook: cursorImported({
          platform: 'darwin',
          execFileFn: async (_cmd, args) => {
            const service = args[args.indexOf('-s') + 1]
            return { stdout: service === 'cursor-access-token' ? store.access : store.refresh }
          },
        }),
        seed: { source: 'cli_keychain' },
        write: async (tag, expiresAt, account = 'auth0|cursor-user') => {
          store.access = jwt({ sub: account, exp: Math.floor((expiresAt + CURSOR_PREEMPT_MS) / 1000), tag })
          store.refresh = `rt-cursor-${tag}`
        },
      }
    },
  },
  {
    provider: 'cline',
    otherAccount: 'usr-cline-other',
    async setup(dir, t) {
      const previous = process.env.CLINE_HOME
      process.env.CLINE_HOME = dir
      t.after(() => { if (previous === undefined) delete process.env.CLINE_HOME; else process.env.CLINE_HOME = previous })
      await mkdir(join(dir, 'data', 'settings'), { recursive: true })
      return {
        hook: clineImported,
        seed: {},
        write: (tag, expiresAt, account = 'usr-cline') => writeFile(join(dir, 'data', 'settings', 'providers.json'), JSON.stringify({
          providers: { cline: { settings: { auth: {
            accessToken: `workos:access-${tag}`,
            refreshToken: `rt-cline-${tag}`,
            expiresAt,
            accountId: account,
            metadata: { userInfo: { email: 'cline@example.test' } },
          } } } },
        })),
      }
    },
  },
  {
    provider: 'kimi',
    async setup(dir, t) {
      const previous = { code: process.env.KIMI_CODE_HOME, share: process.env.KIMI_SHARE_DIR }
      process.env.KIMI_CODE_HOME = dir
      process.env.KIMI_SHARE_DIR = join(dir, 'share')
      t.after(() => {
        for (const [key, value] of [['KIMI_CODE_HOME', previous.code], ['KIMI_SHARE_DIR', previous.share]]) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      })
      await mkdir(join(dir, 'credentials'), { recursive: true })
      return {
        hook: kimiImported,
        seed: {},
        write: (tag, expiresAt) => writeFile(join(dir, 'credentials', 'kimi-code.json'), JSON.stringify({
          access_token: `access-kimi-${tag}`,
          refresh_token: `rt-kimi-${tag}`,
          expires_at: expiresAt / 1000,
        })),
      }
    },
  },
]

async function importedLogin(t, family, { storedExpiresAt }) {
  const dir = await mkdtemp(join(tmpdir(), `imported-${family.provider}-`))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const authPath = join(dir, 'auth.json')
  const store = await family.setup(join(dir, 'cli'), t)
  await mkdir(join(dir, 'cli'), { recursive: true })
  await store.write('old', Date.now() + 3_600_000)
  const imported = await store.hook.reread(store.seed)
  assert.ok(store.hook.is(imported), `${family.provider}: the import is recognised as the CLI's`)
  const saved = await saveSession(family.provider, { ...imported, account: `${family.provider}-label`, expiresAt: storedExpiresAt }, authPath)
  const calls = { refresh: 0, reread: 0, removed: 0 }
  const manager = new TokenManager({
    provider: family.provider,
    authPath,
    displayName: family.provider,
    preemptMs: 2 * 60_000,
    refresh: async () => { calls.refresh++; throw new Error('an imported login must never be exchanged') },
    imported: { ...store.hook, reread: (session) => { calls.reread++; return store.hook.reread(session) } },
    onRemoved: () => { calls.removed++ },
  })
  return { store, manager, calls, authPath, id: saved.id, saved }
}

for (const family of FAMILIES) {
  test(`${family.provider}: a near-expiry import rereads the CLI store and never exchanges`, async (t) => {
    const { store, manager, calls, authPath, id } = await importedLogin(t, family, { storedExpiresAt: Date.now() + 10_000 })
    await store.write('new', Date.now() + 3_600_000)
    const session = await manager.session(id)
    assert.deepEqual({ refresh: calls.refresh, reread: calls.reread }, { refresh: 0, reread: 1 })
    const stored = (await getStoredSession(family.provider, id, authPath)).session
    assert.equal(stored.accessToken, session.accessToken)
    assert.match(String(stored.refreshToken), /new/)
    assert.ok(stored.expiresAt > Date.now() + 60_000)
    assert.equal(stored.account, `${family.provider}-label`, 'a reread replaces tokens, not the account label')
    assert.ok(manager.imported.is(stored), 'still an import after the reread')
  })

  test(`${family.provider}: a stale CLI store raises ImportedLoginStale and keeps the login`, async (t) => {
    const { store, manager, calls, authPath, id } = await importedLogin(t, family, { storedExpiresAt: Date.now() - 1000 })
    await store.write('dead', Date.now() - 60_000)
    const isStale = (error) => error instanceof ImportedLoginStale && error.status === 403
      && /imported login is stale; run .+ or use browser login/.test(error.message)
    await assert.rejects(() => manager.session(id), isStale)
    // The failure backoff: the next request replays the failure without rereading.
    await assert.rejects(() => manager.session(id), isStale)
    assert.deepEqual(calls, { refresh: 0, reread: 1, removed: 0 })
    // A post-401 refreshNow skips the backoff but still only rereads.
    await assert.rejects(() => manager.refreshNow(id), isStale)
    assert.deepEqual(calls, { refresh: 0, reread: 2, removed: 0 })
    assert.ok(await getStoredSession(family.provider, id, authPath), 'the login is not deleted')
  })
}

for (const family of FAMILIES.filter((row) => row.otherAccount)) {
  test(`${family.provider}: a reread that finds another account is stale and keeps the login`, async (t) => {
    const { store, manager, calls, authPath, id, saved } = await importedLogin(t, family, { storedExpiresAt: Date.now() + 10_000 })
    await store.write('switched', Date.now() + 3_600_000, family.otherAccount)
    const other = (error) => error instanceof ImportedLoginStale && /belongs to another account now; run .+ or use browser login/.test(error.message)
    await assert.rejects(() => manager.refreshNow(id), other)
    assert.deepEqual(calls, { refresh: 0, reread: 1, removed: 0 })
    const stored = (await getStoredSession(family.provider, id, authPath)).session
    assert.equal(stored.accessToken, saved.session.accessToken, 'the other account\u2019s tokens never land on this row')
  })
}

test('refreshNow on an import (post-401) rereads instead of exchanging', async (t) => {
  const family = FAMILIES.find((row) => row.provider === 'codex')
  const { store, manager, calls, id, saved } = await importedLogin(t, family, { storedExpiresAt: Date.now() + 3_600_000 })
  await store.write('rotated-by-cli', Date.now() + 3_600_000)
  const source = await manager.refreshNow(id, saved.session.accessToken)
  assert.match(source.session.refreshToken, /rotated-by-cli/)
  assert.deepEqual({ refresh: calls.refresh, reread: calls.reread }, { refresh: 0, reread: 1 })
})

test('the controller wires each read-only family, and only its imported sources', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'imported-wiring-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    readFileFn: () => { throw new Error('fixture has no installed package metadata') },
    cursorAutoImport: false,
    ollamaAutoImport: false,
    kimiAutoImport: false,
    copilotAutoImport: false,
  })
  const cases = {
    codex: [{ source: '/home/u/.codex/auth.json' }, {}],
    cursor: [{ source: 'cli_keychain' }, { source: 'pkce' }],
    cline: [{ source: 'cli' }, { source: 'oauth' }],
    kimi: [{ source: 'cli' }, { source: 'oauth' }],
  }
  for (const [provider, [imported, owned]] of Object.entries(cases)) {
    const hook = controller.tokens[provider].imported
    assert.equal(hook.is(imported), true, `${provider} import`)
    assert.equal(hook.is(owned), false, `${provider} plugin-owned login`)
  }
  assert.equal(controller.tokens.cursor.imported.is({ source: 'ide_vscdb' }), true)
  assert.equal(controller.tokens.cursor.imported.is({ source: 'env' }), false)
  // Excluded: Devin's refresh never exchanges; Copilot mints from a non-rotating GitHub token.
  assert.equal(controller.tokens.devin.imported, undefined)
  assert.equal(controller.tokens.copilot.imported, undefined)
})

test('a reread that finds nothing newer is not repeated on every request', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const dir = await mkdtemp(join(tmpdir(), 'imported-throttle-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const authPath = join(dir, 'auth.json')
  // Inside the preempt window but past the 15s adoption margin: the CLI has
  // not refreshed yet, so every reread returns the login unchanged.
  const saved = await saveSession('cursor', { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 25_000, account: 'u', source: 'cli_keychain' }, authPath)
  let rereads = 0
  const manager = new TokenManager({
    provider: 'cursor',
    authPath,
    displayName: 'Cursor',
    preemptMs: 5 * 60_000,
    refresh: async () => { throw new Error('an imported login must never be exchanged') },
    imported: { is: () => true, cli: 'cursor-agent', reread: async (session) => { rereads++; return { ...session } } },
  })
  for (let i = 0; i < 5; i++) await manager.session(saved.id)
  assert.equal(rereads, 1)
  t.mock.timers.tick(10_000)
  await manager.session(saved.id)
  assert.equal(rereads, 2)
})
