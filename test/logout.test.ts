import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { clearSignedOutMark, markSignedOut, signedOut } from '../lib/oauth/account-marks.js'
import { AuthController } from '../lib/oauth/controller.js'
import { listStoredSessions, loadStore, saveSession } from '../lib/oauth/store.js'

// Signing out must leave nothing behind that still works as a login: not the
// vault entry, not a stale "signed out" mark that outlives the next login, not
// a cached quota reading, not a key mirrored into the host.

const FAR = () => Date.now() + 3600_000

function codexSession(tag: string) {
  return {
    accessToken: `FAKE-${tag}-ACCESS-0123456789abcdefghijklmnop`,
    refreshToken: `FAKE-${tag}-REFRESH-0123456789abcdefghijklmnop`,
    expiresAt: FAR(),
    accountId: `acct-${tag}`,
    account: `${tag}@x`,
    emailAddress: `${tag}@x`,
  }
}

function makeController(authPath: string, extra: Record<string, unknown> = {}) {
  return new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async () => new Response(JSON.stringify({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 1 } } }), { status: 200 }),
    ...extra,
  })
}

async function tmpAuth() {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-logout-'))
  return { dir, authPath: join(dir, 'auth.json') }
}

test('a family is marked signed out only when its last account is gone', async () => {
  const { authPath } = await tmpAuth()
  const a = await saveSession('codex', codexSession('A'), authPath)
  const b = await saveSession('codex', codexSession('B'), authPath, { activate: false })
  const controller = makeController(authPath)

  await controller.logout('codex', a!.id)
  assert.deepEqual(await signedOut({ authPath } as any), [], 'one account is still signed in: the family has not been left')
  assert.equal((await listStoredSessions('codex', authPath)).length, 1)

  await controller.logout('codex', b!.id)
  assert.deepEqual(await signedOut({ authPath } as any), ['codex'])
  assert.deepEqual(await listStoredSessions('codex', authPath), [])
})

test('a login clears that family\'s signed-out mark and no other', async () => {
  const { authPath } = await tmpAuth()
  await markSignedOut({ authPath } as any, 'codex')
  await markSignedOut({ authPath } as any, 'grok')
  assert.deepEqual((await signedOut({ authPath } as any)).sort(), ['codex', 'grok'])

  await saveSession('codex', codexSession('A'), authPath)
  assert.deepEqual(await signedOut({ authPath } as any), ['grok'], 'only the family that logged in is released')
})

test('concurrent marks and clears do not lose each other\'s change', async () => {
  const { authPath } = await tmpAuth()
  const ctl = { authPath } as any
  await Promise.all(['codex', 'grok', 'glm', 'kiro', 'cline'].map((id) => markSignedOut(ctl, id)))
  assert.deepEqual((await signedOut(ctl)).sort(), ['cline', 'codex', 'glm', 'grok', 'kiro'])
  await Promise.all([clearSignedOutMark(authPath, 'glm'), clearSignedOutMark(authPath, 'kiro'), markSignedOut(ctl, 'cursor')])
  assert.deepEqual((await signedOut(ctl)).sort(), ['cline', 'codex', 'cursor', 'grok'])
})

test('signed-out.json tolerates a torn or foreign file', async () => {
  const { dir, authPath } = await tmpAuth()
  const file = join(dir, 'signed-out.json')
  await writeFile(file, '{"not":"a list"}', { mode: 0o600 })
  assert.deepEqual(await signedOut({ authPath } as any), [])
  await writeFile(file, '["codex", 7, null, "grok"]', { mode: 0o600 })
  assert.deepEqual(await signedOut({ authPath } as any), ['codex', 'grok'], 'non-string entries are dropped, not trusted')
})

test('logout leaves no credential in auth.json and flushes the cached quota reading at once', async () => {
  const { dir, authPath } = await tmpAuth()
  const session = codexSession('Q')
  const saved = await saveSession('codex', session, authPath)
  const controller = makeController(authPath)
  controller.quota.cache.set(`codex\0${saved!.id}`, { status: 'ready', planType: 'plus', updatedAt: Date.now(), rows: [{ kind: 'primary', usedPercent: 3 }] })
  await controller.quota.flush()
  assert.match(await readFile(join(dir, 'quota-snapshot.json'), 'utf8'), /primary/, 'precondition: the reading reached disk')

  await controller.logout('codex', saved!.id)

  // No waiting for the 2s debounce: a reload right after logout must not see it.
  const snapshot = JSON.parse(await readFile(join(dir, 'quota-snapshot.json'), 'utf8'))
  assert.deepEqual(Object.keys(snapshot.entries ?? {}).filter((key) => key.startsWith('codex')), [])
  const auth = await readFile(authPath, 'utf8').catch(() => '')
  for (const secret of [session.accessToken, session.refreshToken]) assert.equal(auth.includes(secret), false)
})

test('a retired family\'s vault is purged when the controller starts, and live families are untouched', async () => {
  const { authPath } = await tmpAuth()
  const live = await saveSession('codex', codexSession('L'), authPath)
  const store = JSON.parse(await readFile(authPath, 'utf8'))
  const stale = { accessToken: 'FAKE-RETIRED-ACCESS-0123456789abcdefghij', refreshToken: 'FAKE-RETIRED-REFRESH-0123456789abcdefghij', expiresAt: 1, account: 'old@x' }
  store.opencode = { activeId: 'old@x', accounts: { 'old@x': stale } }
  store.anthropic = { activeId: 'old@x', accounts: { 'old@x': stale } }
  await writeFile(authPath, JSON.stringify(store, null, 2), { mode: 0o600 })

  const controller = makeController(authPath)
  await controller.loginsReady

  const text = await readFile(authPath, 'utf8')
  assert.equal(text.includes('FAKE-RETIRED'), false, 'no retired credential survives on disk')
  assert.deepEqual(Object.keys(JSON.parse(text)), ['codex'])
  assert.equal((await listStoredSessions('codex', authPath))[0].id, live!.id)
})

test('purgeRetiredSessions reports what it removed and rewrites nothing when there is nothing to remove', async () => {
  const { authPath } = await tmpAuth()
  const { purgeRetiredSessions } = await import('../lib/oauth/store.js') as any
  assert.deepEqual(await purgeRetiredSessions(authPath), [], 'no file yet')
  await saveSession('grok', { accessToken: 'g', refreshToken: 'gr', expiresAt: FAR(), account: 'g@x' }, authPath)
  const before = await readFile(authPath, 'utf8')
  assert.deepEqual(await purgeRetiredSessions(authPath), [])
  assert.equal(await readFile(authPath, 'utf8'), before)
  const store = JSON.parse(before)
  store.opencode = { activeId: 'x', accounts: { x: { accessToken: 'o', refreshToken: 'or', expiresAt: 1, account: 'x' } } }
  await writeFile(authPath, JSON.stringify(store), { mode: 0o600 })
  assert.deepEqual(await purgeRetiredSessions(authPath), ['opencode'])
  assert.deepEqual(Object.keys(await loadStore(authPath)), ['grok'])
})

test('OpenCode Go: logging out the active account never leaves its key mirrored in the host', async () => {
  const { authPath } = await tmpAuth()
  const keys = new Map<string, string>()
  const credentials = {
    async describe(ref: string) { return { configured: keys.has(ref), writable: true } },
    async resolve(ref: string) { return keys.has(ref) ? { value: keys.get(ref), source: 'file' } : undefined },
    async set(ref: string, value: string) { keys.set(ref, value) },
    async unset(ref: string) { keys.delete(ref) },
  }
  const controller = makeController(authPath, {
    credentials,
    fetchFn: async () => new Response(JSON.stringify({ usage: { rolling: { usagePercent: 10, resetInSec: 30 } } }), { status: 200, headers: { 'content-type': 'text/javascript' } }),
  })
  await controller.saveOpencodeGo({ apiKey: 'sk-removed', cookie: 'Fe26.2a', workspace: 'wrk_a' })
  await controller.saveOpencodeGo({ cookie: 'Fe26.2b', workspace: 'wrk_b' })
  await controller.saveOpencodeGo({ apiKey: 'sk-kept', cookie: 'Fe26.2c', workspace: 'wrk_c' })
  await controller.switchAccount('opencode-go', 'wrk_a')
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-removed')

  // wrk_a goes; the next active account (wrk_b) is keyless, wrk_c still holds a key.
  await controller.logout('opencode-go', 'wrk_a')
  assert.notEqual(keys.get('OPENCODE_API_KEY'), 'sk-removed', 'the removed account\'s key must not stay in the host credential')
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-kept', 'chat keeps working on a key some stored account still holds')

  const vault = await readFile(join(authPath, '..', 'opencode-go.json'), 'utf8')
  assert.equal(vault.includes('sk-removed'), false)
})
