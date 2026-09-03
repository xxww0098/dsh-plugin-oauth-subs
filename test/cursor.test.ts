import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { parseCursorPeriodUsage } from '../lib/oauth/quota.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { accountIdOf, listStoredSessions, publicSession, saveSession } from '../lib/oauth/store.js'
import {
  HARNESS_COMPLETIONS_API,
  buildProviders,
  catalogProviders,
  ownedProviderIds,
} from '../lib/oauth/models.js'
import {
  CURSOR_LOGIN_URL,
  CURSOR_MODELS,
  CURSOR_POLL_URL,
  CURSOR_REASONING,
  CURSOR_REFRESH_URL,
  completeCursorLogin,
  createCursorPkce,
  cursorAccessStillValid,
  cursorLoginParams,
  cursorSession,
  cursorSourceLabel,
  parseCursorTokenResponse,
  pollCursorAuth,
  refreshCursorTokens,
} from '../lib/oauth/cursor/index.js'
import {
  CURSOR_IMPORT_EMPTY,
  cursorVscdbPaths,
  importCursorAuth,
  readCursorKeychainTokens,
  readCursorVscdbTokens,
  resolveCursorLocalCredentials,
  windowsUsernameFromEnv,
} from '../lib/oauth/cursor/import.js'
import { resetCursorRefreshGuard } from '../lib/oauth/cursor/refresh-guard.js'
import {
  CURSOR_STABLE_SESSION,
  applyCursorCache,
  cursorCacheHeaders,
  cursorCacheSessionId,
  cursorConversationId,
  pinCursorSystemPrefix,
  resetCursorSystemPins,
} from '../lib/oauth/cursor/cache.js'
import { openaiToCursor } from '../lib/oauth/cursor/request.js'
import { decodeAgentClientMessage } from '../lib/oauth/cursor/proto.js'

function jwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.x`
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function validAccess(email = 'cli@cursor.local', extra = {}) {
  return jwt({ email, exp: Math.floor(Date.now() / 1000) + 3600, ...extra })
}

function expiredAccess(email = 'stale@cursor.local') {
  return jwt({ email, exp: Math.floor(Date.now() / 1000) - 120 })
}

async function writeVscdb(dir, { accessToken, refreshToken } = {}) {
  const { DatabaseSync } = await import('node:sqlite')
  const dbPath = join(dir, 'state.vscdb')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)')
  const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)')
  if (accessToken) insert.run('cursorAuth/accessToken', accessToken)
  if (refreshToken) insert.run('cursorAuth/refreshToken', refreshToken)
  db.close()
  return dbPath
}

function emptyImport(overrides = {}) {
  return {
    env: {},
    platform: 'linux',
    home: tmpdir(),
    execFileFn: async () => ({ stdout: '' }),
    readVscdbFn: async () => ({}),
    fetchFn: async () => { throw new Error('import must not hit the network in this case') },
    ...overrides,
  }
}

test('cursor PKCE login URL is loginDeepControl with challenge and uuid', () => {
  const pkce = createCursorPkce()
  const started = cursorLoginParams({ ...pkce, uuid: 'login-uuid-1' })
  assert.equal(started.loginUrl.startsWith(`${CURSOR_LOGIN_URL}?`), true)
  const url = new URL(started.loginUrl)
  assert.equal(url.searchParams.get('challenge'), pkce.challenge)
  assert.equal(url.searchParams.get('uuid'), 'login-uuid-1')
  assert.equal(url.searchParams.get('mode'), 'login')
  assert.equal(url.searchParams.get('redirectTarget'), 'cli')
})

test('cursor poll waits on 404 then stores tokens', async () => {
  let calls = 0
  const tokens = await pollCursorAuth('u1', 'verifier', {
    sleep: async () => undefined,
    fetchFn: async (url) => {
      calls += 1
      assert.equal(String(url).startsWith(CURSOR_POLL_URL), true)
      if (calls === 1) return new Response('', { status: 404 })
      return json({ accessToken: validAccess('poll@x'), refreshToken: 'rt-poll' })
    },
  })
  assert.equal(calls, 2)
  assert.equal(tokens.refreshToken, 'rt-poll')
  assert.equal(cursorAccessStillValid(tokens.accessToken), true)
})

test('cursor refresh parses exchange_user_api_key', async () => {
  resetCursorRefreshGuard()
  const next = validAccess('refresh@x')
  const tokens = await refreshCursorTokens('rt-old', {
    fetchFn: async (url, init) => {
      assert.equal(url, CURSOR_REFRESH_URL)
      assert.equal(init.method, 'POST')
      assert.equal(init.headers.authorization, 'Bearer rt-old')
      assert.equal(init.body, '{}')
      return json({ accessToken: next, refreshToken: 'rt-new' })
    },
  })
  assert.equal(tokens.accessToken, next)
  assert.equal(tokens.refreshToken, 'rt-new')
})

test('cursor session round-trip keeps source for doctor/status', () => {
  const session = cursorSession({
    accessToken: validAccess('round@x'),
    refreshToken: 'rt-round',
    source: 'cli_keychain',
    planType: 'pro',
  })
  assert.equal(session.source, 'cli_keychain')
  assert.equal(session.account, 'round@x')
  const pub = publicSession('cursor', session)
  assert.equal(pub.account, 'round@x')
  assert.equal(pub.method, 'cli_keychain')
  assert.equal(pub.methodLabel, 'CLI')
  assert.equal(pub.planLabel, 'Pro')
  assert.equal(cursorSourceLabel('ide_vscdb'), 'IDE')
  assert.equal(cursorSourceLabel('env'), 'env')
  assert.equal(cursorSourceLabel('pkce'), 'PKCE')
})

test('cursor catalog is Completions at /cursor, not /cursor/v1', () => {
  const ids = ownedProviderIds('oauth')
  assert.equal(ids.includes('oauth-cursor'), true)
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { cursor: true },
  })
  const route = providers['oauth-cursor']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/cursor')
  assert.equal(route.baseURL.endsWith('/cursor/v1'), false)
  for (const model of route.models) {
    const keys = Object.keys(model.reasoningEfforts ?? {})
    for (const key of keys) {
      assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
    }
  }
  assert.deepEqual(route.models.find((model) => model.id === 'composer-2').reasoningEfforts, CURSOR_REASONING)
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  assert.equal(catalog['oauth-cursor'].models.length, CURSOR_MODELS.length)
})

test('snapshot shows quota on every cursor account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cursor-'))
  const authPath = join(dir, 'auth.json')
  const sessionA = cursorSession({
    accessToken: validAccess('a@x'), refreshToken: 'rt-a', source: 'pkce', account: 'a@x',
  })
  const sessionB = cursorSession({
    accessToken: validAccess('b@x'), refreshToken: 'rt-b', source: 'ide_vscdb', account: 'b@x',
  })
  await saveSession('cursor', sessionA, authPath)
  await saveSession('cursor', sessionB, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    cursorAutoImport: false,
    fetchFn: async (_url, init) => {
      const auth = String(init?.headers?.authorization ?? '')
      const which = auth.includes(sessionB.accessToken) ? 'b@x' : 'a@x'
      return json({
        planUsage: { totalPercentUsed: which === 'b@x' ? 10 : 40, includedSpend: 1, limit: 10 },
        membershipType: 'pro',
        email: which,
      })
    },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.catalog.some((row) => row.family === 'cursor'), true)
  const roster = snap.accounts.cursor.accounts
  assert.equal(roster.length, 2)
  const first = roster.find((row) => row.account === 'a@x')
  const second = roster.find((row) => row.account === 'b@x')
  assert.equal(first.quota.status, 'ready')
  assert.equal(second.quota.status, 'ready')
  assert.equal(first.quota.rows[0].remainingPercent, 60)
  assert.equal(second.quota.rows[0].remainingPercent, 90)
  assert.equal(second.methodLabel, 'IDE')
})

test('parseCursorPeriodUsage maps planUsage.totalPercentUsed', () => {
  const parsed = parseCursorPeriodUsage({
    planUsage: { totalPercentUsed: 27, includedSpend: 2.7, limit: 10 },
    membershipType: 'proplus',
    email: 'q@x',
  })
  assert.equal(parsed.planType, 'proplus')
  assert.equal(formatPlanLabel(parsed.planType, 'cursor'), 'Pro+')
  assert.equal(parsed.account, 'q@x')
  assert.equal(parsed.rows[0].remainingPercent, 73)
})

test('cursor cache sanitizer and sticky conversation id across two turns', () => {
  resetCursorSystemPins()
  assert.equal(cursorCacheSessionId('session 772f7f3a/foo'), 'session-772f7f3a-foo')
  assert.equal(cursorCacheSessionId(''), undefined)
  const first = applyCursorCache({
    session_id: 'sess-cursor',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    model: 'composer-2',
  })
  assert.equal(first.payload.prompt_cache_key, undefined)
  assert.equal(first.payload.prompt_cache_retention, undefined)
  assert.equal(first.cacheSessionId, 'sess-cursor:composer-2')
  assert.deepEqual(cursorCacheHeaders(), {})
  const second = cursorConversationId({ session_id: 'sess-cursor', model: 'composer-2' })
  assert.equal(second, first.cacheSessionId)
  assert.notEqual(
    cursorConversationId({ model: 'composer-2' }),
    cursorConversationId({ model: 'gpt-5.5' }),
  )
  assert.equal(cursorConversationId({}), CURSOR_STABLE_SESSION)
  assert.equal(/^-\d+$/.test(cursorConversationId({})), false)
  const pin = pinCursorSystemPrefix('sess-cursor:composer-2', 'You are DSH.')
  const extra = pinCursorSystemPrefix('sess-cursor:composer-2', 'You are DSH.\nSnapshot')
  assert.equal(pin.pinned, 'You are DSH.')
  assert.equal(extra.pinned, 'You are DSH.')
  assert.equal(extra.extra, 'Snapshot')
  resetCursorSystemPins()
})

test('cursor hop Completions → AgentClientMessage keeps model, user, tools, conversation id', () => {
  resetCursorSystemPins()
  const built = openaiToCursor({
    model: 'composer-2',
    session_id: 'sess-hop',
    messages: [
      { role: 'system', content: 'You are DSH.' },
      { role: 'user', content: 'list files' },
    ],
    tools: [{
      type: 'function',
      function: { name: 'glob', description: 'find files', parameters: { type: 'object' } },
    }],
    reasoning_effort: 'high',
  })
  const decoded = decodeAgentClientMessage(built.requestBytes)
  assert.equal(built.conversationId, 'sess-hop:composer-2')
  assert.equal(decoded.conversationId, 'sess-hop:composer-2')
  assert.equal(decoded.modelId, 'composer-2')
  assert.equal(decoded.userText, 'list files')
  assert.equal(decoded.tools.some((tool) => tool.name === 'glob'), true)
  assert.equal(decoded.hasConversationState, true)
  resetCursorSystemPins()
})

test('keychain hit prefers a still-valid access token with zero network', async () => {
  const access = validAccess('key@x')
  const session = await resolveCursorLocalCredentials(emptyImport({
    platform: 'darwin',
    execFileFn: async (_cmd, args) => {
      const service = args[args.indexOf('-s') + 1]
      if (service === 'cursor-access-token') return { stdout: `${access}\n` }
      if (service === 'cursor-refresh-token') return { stdout: 'rt-keychain\n' }
      throw new Error(`unexpected service ${service}`)
    },
  }))
  assert.equal(session.source, 'cli_keychain')
  assert.equal(session.accessToken, access)
  assert.equal(session.account, 'key@x')
})

test('vscdb hit uses ItemTable tokens when Keychain is empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-vscdb-'))
  const access = validAccess('ide@x')
  const dbPath = await writeVscdb(dir, { accessToken: access, refreshToken: 'rt-ide' })
  const fromFile = await readCursorVscdbTokens({ paths: [dbPath], platform: 'linux', env: {}, home: dir })
  assert.equal(fromFile.accessToken, access)
  assert.equal(fromFile.refreshToken, 'rt-ide')
  const imported = await importCursorAuth(emptyImport({
    platform: 'linux',
    readVscdbFn: async () => ({ accessToken: access, refreshToken: 'rt-ide' }),
  }))
  assert.equal(imported.source, 'ide_vscdb')
  assert.equal(imported.session.accessToken, access)
  assert.equal(imported.session.account, 'ide@x')
})

test('expired access refreshes Keychain then vscdb when refresh tokens differ', async () => {
  resetCursorRefreshGuard()
  const stale = expiredAccess('stale@x')
  const next = validAccess('fresh@x')
  let refreshCalls = 0
  const session = await resolveCursorLocalCredentials(emptyImport({
    platform: 'darwin',
    execFileFn: async (_cmd, args) => {
      const service = args[args.indexOf('-s') + 1]
      if (service === 'cursor-access-token') return { stdout: stale }
      if (service === 'cursor-refresh-token') return { stdout: 'rt-stale' }
      throw new Error(service)
    },
    readVscdbFn: async () => ({ accessToken: stale, refreshToken: 'rt-ide-other' }),
    fetchFn: async (url, init) => {
      refreshCalls += 1
      assert.equal(url, CURSOR_REFRESH_URL)
      if (init.headers.authorization === 'Bearer rt-stale') {
        return new Response('nope', { status: 401 })
      }
      assert.equal(init.headers.authorization, 'Bearer rt-ide-other')
      return json({ accessToken: next, refreshToken: 'rt-ide-other' })
    },
  }))
  assert.equal(session.source, 'ide_vscdb')
  assert.equal(session.accessToken, next)
  assert.equal(refreshCalls, 2)
})

test('empty machine throws cursor-import-empty, not a stack', async () => {
  await assert.rejects(
    () => importCursorAuth(emptyImport()),
    (error) => error.code === CURSOR_IMPORT_EMPTY && error.message === CURSOR_IMPORT_EMPTY,
  )
})

test('CURSOR_ACCESS_TOKEN env wins and does not refresh', async () => {
  const access = validAccess('env@x')
  const session = await resolveCursorLocalCredentials(emptyImport({
    env: { CURSOR_ACCESS_TOKEN: access },
    fetchFn: async () => { throw new Error('env import must not refresh') },
  }))
  assert.equal(session.source, 'env')
  assert.equal(session.accessToken, access)
})

test('WSL username parsing does not walk other Users', () => {
  assert.equal(windowsUsernameFromEnv({ USERPROFILE: 'C:\\Users\\alice', USERNAME: 'alice' }), 'alice')
  assert.equal(windowsUsernameFromEnv({ USERPROFILE: 'C:\\Users\\Public', USERNAME: 'alice' }), 'alice')
  assert.equal(windowsUsernameFromEnv({ USERNAME: 'Public' }), undefined)
  assert.equal(windowsUsernameFromEnv({ USERNAME: 'Default' }), undefined)
  const paths = cursorVscdbPaths({
    platform: 'linux',
    home: '/home/alice',
    env: {
      WSL_DISTRO_NAME: 'Ubuntu',
      USERPROFILE: 'C:\\Users\\alice',
      USERNAME: 'alice',
    },
  })
  assert.equal(paths.some((path) => path.includes('/mnt/c/Users/alice/AppData/Roaming/Cursor/')), true)
  assert.equal(paths.some((path) => /\/mnt\/c\/Users\/(Public|Default|bob)\//.test(path)), false)
  assert.equal(paths.filter((path) => path.includes('/mnt/c/Users/')).length, 1)
})

test('readCursorKeychainTokens is darwin-only and concurrent', async () => {
  const seen = []
  const tokens = await readCursorKeychainTokens({
    platform: 'darwin',
    execFileFn: async (_cmd, args) => {
      seen.push(args[args.indexOf('-s') + 1])
      return { stdout: seen[seen.length - 1] === 'cursor-access-token' ? 'acc' : 'ref' }
    },
  })
  assert.deepEqual(seen.sort(), ['cursor-access-token', 'cursor-refresh-token'])
  assert.equal(tokens.accessToken, 'acc')
  assert.equal(tokens.refreshToken, 'ref')
  assert.deepEqual(await readCursorKeychainTokens({ platform: 'linux' }), {})
})

test('empty-roster auto-import saves CLI source; PKCE is not overwritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cursor-auto-'))
  const authPath = join(dir, 'auth.json')
  const access = validAccess('auto@x')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    cursorAutoImport: true,
    cursorImport: emptyImport({
      platform: 'darwin',
      execFileFn: async (_cmd, args) => {
        const service = args[args.indexOf('-s') + 1]
        return { stdout: service === 'cursor-access-token' ? access : 'rt-auto' }
      },
    }),
    fetchFn: async () => json({
      planUsage: { totalPercentUsed: 5, includedSpend: 0, limit: 10 },
      membershipType: 'pro',
      email: 'auto@x',
    }),
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.cursor.loggedIn, true)
  assert.equal(snap.accounts.cursor.accounts[0].methodLabel, 'CLI')

  const pkce = cursorSession({
    accessToken: validAccess('auto@x'),
    refreshToken: 'rt-pkce',
    source: 'pkce',
    account: 'auto@x',
  })
  await saveSession('cursor', pkce, authPath)
  const imported = await controller.importFrom('cursor')
  assert.equal(imported.source, 'pkce')
  const rows = await listStoredSessions('cursor', authPath)
  assert.equal(rows[0].session.source, 'pkce')
  assert.equal(accountIdOf('cursor', rows[0].session), 'auto@x')
})

test('parseCursorTokenResponse and completeCursorLogin tag pkce', async () => {
  const parsed = parseCursorTokenResponse({ accessToken: 'a', refreshToken: 'r' })
  const session = await completeCursorLogin(parsed)
  assert.equal(session.source, 'pkce')
  assert.equal(session.refreshToken, 'r')
})
