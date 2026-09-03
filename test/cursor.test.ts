import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { parseCursorPeriodUsage } from '../lib/oauth/quota.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { accountIdOf, listAccounts, listStoredSessions, publicSession, saveSession } from '../lib/oauth/store.js'
import {
  HARNESS_COMPLETIONS_API,
  buildProviders,
  catalogProviders,
  describeCatalog,
  ownedProviderIds,
  syncHarnessModels,
} from '../lib/oauth/models.js'
import {
  cursorCatalogModels,
  cursorPickerFamilyId,
  cursorSourceIsFast,
  inferCursorContextWindow,
  inferCursorMaxOutputTokens,
  isCursorInternalModel,
  refreshCursorCatalog,
  resetCursorCatalogCache,
  toCursorPickerModels,
} from '../lib/oauth/cursor/catalog.js'
import {
  decodeAvailableModelsResponse,
  decodeGetUsableModelsResponse,
  encodeAvailableModelsRequest,
  encodeAvailableModelsResponse,
  encodeGetUsableModelsResponse,
  frameConnect,
} from '../lib/oauth/cursor/proto.js'
import {
  CURSOR_GET_EMAIL_URL,
  CURSOR_GET_ME_URL,
  CURSOR_LOGIN_URL,
  CURSOR_MODELS,
  CURSOR_POLL_URL,
  CURSOR_REASONING,
  CURSOR_REFRESH_URL,
  CURSOR_STRIPE_PROFILE_URL,
  CURSOR_USAGE_URL,
  completeCursorLogin,
  createCursorPkce,
  cursorAccessStillValid,
  cursorAccountFromToken,
  cursorLoginParams,
  cursorSession,
  cursorSourceLabel,
  displayCursorAccount,
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
  peelCursorFastSuffix,
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

async function writeVscdb(dir, { accessToken, refreshToken, cachedEmail } = {}) {
  const { DatabaseSync } = await import('node:sqlite')
  const dbPath = join(dir, 'state.vscdb')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)')
  const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)')
  if (accessToken) insert.run('cursorAuth/accessToken', accessToken)
  if (refreshToken) insert.run('cursorAuth/refreshToken', refreshToken)
  if (cachedEmail) insert.run('cursorAuth/cachedEmail', cachedEmail)
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

test('JWT with only WorkOS sub is not a display account', () => {
  const opaque = 'grok|user_01TESTOPAQUEID0001'
  const token = jwt({ sub: opaque, exp: Math.floor(Date.now() / 1000) + 3600 })
  assert.equal(cursorAccountFromToken(token), undefined)
  assert.equal(displayCursorAccount({ accessToken: token, account: opaque }), undefined)
  assert.equal(displayCursorAccount({ accessToken: token, account: 'cursor' }), undefined)
  const session = cursorSession({ accessToken: token, refreshToken: 'rt-opaque' })
  const pub = publicSession('cursor', session)
  assert.equal(pub.account, undefined)
  assert.equal(accountIdOf('cursor', session), session.account)
})

test('JWT email or preferred_username wins over sub', () => {
  assert.equal(cursorAccountFromToken(jwt({
    email: 'named@x',
    sub: 'grok|user_01TESTOPAQUEID0002',
  })), 'named@x')
  assert.equal(cursorAccountFromToken(jwt({
    preferred_username: 'alice',
    sub: 'auth0|abc',
  })), 'alice')
  const session = cursorSession({
    accessToken: jwt({ email: 'named@x', sub: 'auth0|abc', exp: Math.floor(Date.now() / 1000) + 3600 }),
    refreshToken: 'rt-named',
  })
  assert.equal(publicSession('cursor', session).account, 'named@x')
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
  resetCursorCatalogCache()
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
  assert.equal(first.quota.rows.length, 2)
  assert.equal(first.quota.rows.every((row) => row.kind === 'product'), true)
  assert.equal(first.quota.rows.find((row) => row.product === 'auto').usedPercent, 0)
  assert.equal(second.quota.rows.find((row) => row.product === 'auto').usedPercent, 0)
  assert.equal(second.methodLabel, 'IDE')
})

test('parseCursorPeriodUsage emits two used-percent product bars, not spend cap', () => {
  const parsed = parseCursorPeriodUsage({
    planUsage: {
      totalPercentUsed: 44,
      autoPercentUsed: 51,
      apiPercentUsed: 0,
      includedSpend: 40000,
      limit: 40000,
    },
    membershipType: 'pro',
    billingCycleEnd: '2026-10-01T00:00:00.000Z',
    email: 'q@x',
  })
  assert.equal(parsed.planType, 'pro')
  assert.equal(formatPlanLabel(parsed.planType, 'cursor'), 'Pro')
  assert.equal(parsed.account, 'q@x')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows.every((row) => row.kind === 'product'), true)
  assert.equal(parsed.rows.some((row) => row.kind === 'cycle'), false)
  const composer = parsed.rows.find((row) => row.product === 'auto')
  const api = parsed.rows.find((row) => row.product === 'api')
  assert.equal(composer.usedPercent, 51)
  assert.equal(composer.remainingPercent, 49)
  assert.equal(api.usedPercent, 0)
  assert.equal(api.remainingPercent, 100)
  assert.equal(composer.used, undefined)
  assert.equal(composer.total, undefined)
  assert.equal(api.used, undefined)
  assert.equal(api.total, undefined)
  assert.equal(JSON.stringify(parsed).includes('40000'), false)
  assert.equal(composer.resetAt, Date.parse('2026-10-01T00:00:00.000Z'))
  assert.equal(api.resetAt, composer.resetAt)
})

test('parseCursorPeriodUsage keeps a sub-1 API percent visible and prefers stripe Ultra', () => {
  const parsed = parseCursorPeriodUsage({
    planUsage: {
      autoPercentUsed: 55.123,
      apiPercentUsed: 0.454,
      totalPercentUsed: 47.313,
    },
    spendLimitUsage: { limitType: 'user' },
  }, {
    stripe: { membershipType: 'ultra', individualMembershipType: 'ultra' },
  })
  assert.equal(parsed.planType, 'ultra')
  assert.equal(formatPlanLabel(parsed.planType, 'cursor'), 'Ultra')
  assert.equal(parsed.account, undefined)
  const composer = parsed.rows.find((row) => row.product === 'auto')
  const api = parsed.rows.find((row) => row.product === 'api')
  assert.equal(composer.usedPercent, 55)
  assert.equal(composer.remainingPercent, 45)
  assert.equal(api.usedPercent, 1)
  assert.equal(api.remainingPercent, 99)
  const zero = parseCursorPeriodUsage({
    planUsage: { autoPercentUsed: 0, apiPercentUsed: 0 },
  })
  assert.equal(zero.planType, 'Pro')
  assert.equal(zero.rows[0].usedPercent, 0)
  assert.equal(zero.rows[0].remainingPercent, 100)
  assert.equal(zero.rows[1].usedPercent, 0)
  assert.equal(zero.rows[1].remainingPercent, 100)
})

test('parseCursorPeriodUsage always emits both bars at 0% when percents are missing', () => {
  const parsed = parseCursorPeriodUsage({
    planUsage: { totalPercentUsed: 0, includedSpend: 0, limit: 40000 },
    membershipType: 'proplus',
  })
  assert.equal(formatPlanLabel(parsed.planType, 'cursor'), 'Pro+')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].usedPercent, 0)
  assert.equal(parsed.rows[1].usedPercent, 0)
  assert.equal(parsed.rows[0].total, undefined)
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
  assert.equal(first.payload.service_tier, undefined)
  assert.equal(first.cacheSessionId, 'sess-cursor:composer-2')
  assert.deepEqual(cursorCacheHeaders(), {})
  const second = cursorConversationId({ session_id: 'sess-cursor', model: 'composer-2' })
  assert.equal(second, first.cacheSessionId)
  assert.equal(
    cursorConversationId({ session_id: 'sess-cursor', model: 'gpt-5.5-fast' }),
    cursorConversationId({ session_id: 'sess-cursor', model: 'gpt-5.5' }),
  )
  assert.equal(peelCursorFastSuffix('gpt-5.5-fast').modelId, 'gpt-5.5')
  assert.equal(peelCursorFastSuffix('gpt-5.5-fast').requestedFast, true)
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

test('cursor hop peels -fast to family modelId and sets RequestedModel fast param', () => {
  resetCursorSystemPins()
  const built = openaiToCursor({
    model: 'gpt-5.5-fast',
    session_id: 'sess-fast',
    reasoning_effort: 'high',
    service_tier: 'priority',
    messages: [{ role: 'user', content: 'hi' }],
  })
  const decoded = decodeAgentClientMessage(built.requestBytes)
  assert.equal(built.modelId, 'gpt-5.5')
  assert.equal(built.pickerModel, 'gpt-5.5-fast')
  assert.equal(decoded.modelId, 'gpt-5.5')
  assert.equal(decoded.modelId.endsWith('-fast'), false)
  assert.equal(decoded.maxMode, false)
  assert.deepEqual(decoded.parameters, [
    { id: 'reasoning', value: 'high' },
    { id: 'fast', value: 'true' },
  ])
  assert.equal(built.conversationId, 'sess-fast:gpt-5.5')
  assert.equal(decoded.conversationId, 'sess-fast:gpt-5.5')
  assert.equal(JSON.stringify(decoded).includes('service_tier'), false)
  const cached = applyCursorCache({
    model: 'gpt-5.5-fast',
    session_id: 'sess-fast',
    service_tier: 'priority',
  })
  assert.equal(cached.payload.model, 'gpt-5.5-fast')
  assert.equal(cached.payload.service_tier, undefined)
  assert.equal(cached.cacheSessionId, 'sess-fast:gpt-5.5')
  const plain = openaiToCursor({
    model: 'gpt-5.5',
    reasoning_effort: 'high',
    messages: [{ role: 'user', content: 'hi' }],
  })
  const plainDecoded = decodeAgentClientMessage(plain.requestBytes)
  assert.equal(plainDecoded.modelId, 'gpt-5.5')
  assert.deepEqual(plainDecoded.parameters, [{ id: 'reasoning', value: 'high' }])
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

test('vscdb import with cachedEmail sets that email', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-vscdb-email-'))
  const access = jwt({
    sub: 'auth0|opaqueimport',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  const dbPath = await writeVscdb(dir, {
    accessToken: access,
    refreshToken: 'rt-ide-email',
    cachedEmail: 'cached@x',
  })
  const fromFile = await readCursorVscdbTokens({ paths: [dbPath], platform: 'linux', env: {}, home: dir })
  assert.equal(fromFile.cachedEmail, 'cached@x')
  const imported = await importCursorAuth(emptyImport({
    platform: 'linux',
    readVscdbFn: async () => fromFile,
  }))
  assert.equal(imported.source, 'ide_vscdb')
  assert.equal(imported.session.account, 'cached@x')
  assert.equal(publicSession('cursor', imported.session).account, 'cached@x')
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

test('snapshot backfills opaque cursor vault when usage has email', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cursor-usage-'))
  const authPath = join(dir, 'auth.json')
  const opaque = 'grok|user_01TESTUSAGEBACKFILL'
  const access = jwt({ sub: opaque, exp: Math.floor(Date.now() / 1000) + 3600 })
  const session = cursorSession({
    accessToken: access,
    refreshToken: 'rt-usage',
    source: 'pkce',
    account: opaque,
  })
  await saveSession('cursor', session, authPath)
  assert.equal(accountIdOf('cursor', session), opaque)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    cursorAutoImport: false,
    fetchFn: async (url) => {
      if (String(url).includes('GetCurrentPeriodUsage')) {
        return json({
          planUsage: { autoPercentUsed: 12, apiPercentUsed: 0 },
          membershipType: 'pro',
          email: 'from-usage@x',
        })
      }
      return new Response('', { status: 404 })
    },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.cursor.account, 'from-usage@x')
  assert.equal(snap.accounts.cursor.accounts[0].account, 'from-usage@x')
  assert.equal(snap.accounts.cursor.accounts[0].id, 'from-usage@x')
  const roster = await listAccounts('cursor', authPath)
  assert.equal(roster[0].id, 'from-usage@x')
  assert.equal(roster.some((row) => row.id === opaque || row.account === opaque), false)
})

test('snapshot backfills opaque cursor vault from vscdb cachedEmail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cursor-cached-'))
  const authPath = join(dir, 'auth.json')
  const opaque = 'auth0|opaquevault'
  const access = jwt({ sub: opaque, exp: Math.floor(Date.now() / 1000) + 3600 })
  const session = cursorSession({
    accessToken: access,
    refreshToken: 'rt-cached',
    source: 'ide_vscdb',
    account: opaque,
  })
  await saveSession('cursor', session, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    cursorAutoImport: false,
    cursorImport: emptyImport({
      readVscdbFn: async () => ({
        accessToken: access,
        refreshToken: 'rt-cached',
        cachedEmail: 'from-ide@x',
      }),
    }),
    fetchFn: async () => json({
      planUsage: { autoPercentUsed: 8, apiPercentUsed: 0 },
      membershipType: 'pro',
    }),
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.cursor.account, 'from-ide@x')
  assert.equal(snap.accounts.cursor.accounts[0].account, 'from-ide@x')
  assert.equal(snap.accounts.cursor.accounts[0].id, 'from-ide@x')
  const roster = await listAccounts('cursor', authPath)
  assert.equal(roster[0].id, 'from-ide@x')
  assert.equal(roster.some((row) => row.id === opaque || row.account === opaque), false)
})

test('refreshQuota GetEmail backfills opaque PKCE and stripe Ultra percents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cursor-refresh-'))
  const authPath = join(dir, 'auth.json')
  const opaque = 'auth0|user_01TESTGETEMAIL0001'
  const pkceAccess = jwt({
    sub: opaque,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://authentication.cursor.sh',
  })
  const ideAccess = jwt({
    sub: 'auth0|user_01TESTIDE0002',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  await saveSession('cursor', cursorSession({
    accessToken: pkceAccess,
    refreshToken: 'rt-pkce',
    source: 'pkce',
    account: opaque,
  }), authPath)
  await saveSession('cursor', cursorSession({
    accessToken: ideAccess,
    refreshToken: 'rt-ide',
    source: 'ide_vscdb',
    account: 'ide-user@example.test',
  }), authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    cursorAutoImport: false,
    cursorDiscover: async () => undefined,
    fetchFn: async (url, init) => {
      const href = String(url)
      const auth = String(init?.headers?.authorization ?? '')
      const pkce = auth.includes(pkceAccess)
      if (href === CURSOR_USAGE_URL) {
        return json(pkce
          ? {
            planUsage: {
              remaining: 2000,
              limit: 2000,
              autoPercentUsed: 0,
              apiPercentUsed: 0,
              totalPercentUsed: 0,
            },
            spendLimitUsage: { limitType: 'user' },
            displayMessage: "You've used 0% of your included usage",
          }
          : {
            planUsage: {
              autoPercentUsed: 55.123,
              apiPercentUsed: 0.454,
              totalPercentUsed: 47.313,
            },
            spendLimitUsage: { limitType: 'user' },
            displayMessage: "You've hit your usage limit",
          })
      }
      if (href === CURSOR_STRIPE_PROFILE_URL) {
        return json(pkce
          ? { membershipType: 'pro', individualMembershipType: 'pro' }
          : { membershipType: 'ultra', individualMembershipType: 'ultra' })
      }
      if (href === CURSOR_GET_EMAIL_URL) {
        return json({
          email: pkce ? 'pkce-user@example.test' : 'ide-user@example.test',
          signUpType: 'email',
          isRecentlyCreatedUser: false,
        })
      }
      if (href === CURSOR_GET_ME_URL) {
        throw new Error('GetMe is only for missing GetEmail')
      }
      return new Response('', { status: 404 })
    },
  })
  await controller.refreshQuota('cursor')
  const snap = await controller.snapshot()
  const roster = snap.accounts.cursor.accounts
  const pkceCard = roster.find((row) => row.account === 'pkce-user@example.test')
  const ideCard = roster.find((row) => row.account === 'ide-user@example.test')
  assert.ok(pkceCard)
  assert.ok(ideCard)
  assert.equal(pkceCard.planLabel, 'Pro')
  assert.equal(ideCard.planLabel, 'Ultra')
  assert.equal(pkceCard.quota.rows.find((row) => row.product === 'auto').remainingPercent, 100)
  assert.equal(pkceCard.quota.rows.find((row) => row.product === 'api').remainingPercent, 100)
  assert.equal(ideCard.quota.rows.find((row) => row.product === 'auto').remainingPercent, 45)
  assert.equal(ideCard.quota.rows.find((row) => row.product === 'api').remainingPercent, 99)
  assert.equal(ideCard.quota.rows.find((row) => row.product === 'api').usedPercent, 1)
  const stored = await listAccounts('cursor', authPath)
  assert.equal(stored.some((row) => row.id === opaque || row.account === opaque), false)
  assert.equal(stored.some((row) => /auth0\||grok\|user_/.test(String(row.id))), false)
  const pkceStored = (await listStoredSessions('cursor', authPath))
    .find((row) => row.session.cachedEmail === 'pkce-user@example.test')
  assert.ok(pkceStored)
  assert.equal(pkceStored.session.account, 'pkce-user@example.test')
})

test('parseCursorTokenResponse and completeCursorLogin tag pkce', async () => {
  const parsed = parseCursorTokenResponse({ accessToken: 'a', refreshToken: 'r' })
  const session = await completeCursorLogin(parsed)
  assert.equal(session.source, 'pkce')
  assert.equal(session.refreshToken, 'r')
})

test('cursor picker collapses effort/fast/thinking/max-mode and hides tab internals', () => {
  const rows = toCursorPickerModels([
    { id: 'default', name: 'Auto' },
    { id: 'default-fast', name: 'Auto Fast' },
    { id: 'gpt-5.5-none', name: 'GPT-5.5 272K None' },
    { id: 'gpt-5.5-high-fast', name: 'GPT-5.5 272K High Fast' },
    { id: 'gpt-5.5-1m-extra-high', name: 'GPT-5.5 1M Extra High' },
    { id: 'claude-4.6-opus-max-thinking', name: 'Opus 4.6 1M Max Thinking' },
    { id: 'claude-4.6-opus-high', name: 'Opus 4.6 1M' },
    { id: 'gpt-5.1-codex-max-high-fast', name: 'GPT-5.1 Codex Max High Fast' },
    { id: 'composer-2-fast', name: 'Composer 2 Fast' },
    { id: 'cursor-small', name: 'Tab' },
    { id: 'tab-completion', name: 'Tab completion' },
    { id: 'cursor-chat', name: 'Chat' },
  ])
  const ids = rows.map((row) => row.id)
  assert.equal(ids.includes('default'), true)
  assert.equal(rows.find((row) => row.id === 'default').name, 'Cursor Auto')
  assert.equal(ids.includes('gpt-5.5'), true)
  assert.equal(ids.includes('gpt-5.5-high-fast'), false)
  assert.equal(ids.includes('gpt-5.5-none'), false)
  assert.equal(ids.includes('gpt-5.5-1m-extra-high'), false)
  assert.equal(ids.includes('claude-4.6-opus-max-thinking'), false)
  assert.equal(ids.includes('gpt-5.1-codex-max-high-fast'), false)
  assert.equal(ids.includes('claude-4.6-opus'), true)
  assert.equal(ids.includes('gpt-5.1-codex-max'), true)
  assert.equal(ids.includes('composer-2'), true)
  assert.equal(ids.includes('gpt-5.5-fast'), true)
  assert.equal(ids.includes('composer-2-fast'), true)
  assert.equal(ids.includes('gpt-5.1-codex-max-fast'), true)
  assert.equal(ids.includes('claude-4.6-opus-fast'), false)
  assert.equal(ids.includes('default-fast'), false)
  assert.equal(rows.find((row) => row.id === 'gpt-5.5-fast').name, 'GPT-5.5 Fast')
  assert.equal(rows.find((row) => row.id === 'composer-2-fast').name, 'Composer 2 Fast')
  assert.equal(ids.filter((id) => id === 'gpt-5.5' || id === 'gpt-5.5-fast').length, 2)
  assert.equal(ids.some((id) => /tab|chat|cursor-small/.test(id)), false)
  assert.equal(isCursorInternalModel('cursor-small', 'Tab'), true)
  assert.equal(cursorPickerFamilyId('gpt-5.5-max-extra-high-fast'), 'gpt-5.5')
  assert.equal(cursorSourceIsFast('gpt-5.5-high-fast'), true)
  assert.equal(cursorSourceIsFast('composer-2-fast'), true)
  assert.equal(cursorSourceIsFast('gpt-5.5-high'), false)
  assert.equal(cursorSourceIsFast('default'), false)
  assert.equal(inferCursorContextWindow('grok-4.5', 'Grok 4.5'), 256_000)
  assert.equal(inferCursorMaxOutputTokens('gpt-5.5', 'GPT-5.5'), 128_000)
  assert.deepEqual(rows.find((row) => row.id === 'gpt-5.5').reasoningEfforts, CURSOR_REASONING)
  assert.equal(Object.hasOwn(rows.find((row) => row.id === 'gpt-5.5').reasoningEfforts, 'none'), false)
  const described = describeCatalog(catalogProviders({
    prefix: 'oauth',
    origin: 'http://x',
    cursorModels: rows,
  }))
  const cursor = described.find((row) => row.family === 'cursor')
  assert.equal(cursor.models.find((model) => model.id === 'gpt-5.5-fast').fast, true)
  assert.equal(cursor.models.find((model) => model.id === 'gpt-5.5').fast, false)
  assert.equal(cursor.models.find((model) => model.id === 'gpt-5.5-fast').enabled, true)
  const fromAvailable = toCursorPickerModels([], [
    { name: 'composer-2-fast', clientDisplayName: 'Composer 2 Fast' },
    { name: 'kimi-k2.5', clientDisplayName: 'Kimi K2.5' },
  ])
  assert.equal(fromAvailable.some((row) => row.id === 'composer-2-fast'), true)
  assert.equal(fromAvailable.some((row) => row.id === 'kimi-k2.5-fast'), false)
})

test('mocked GetUsableModels expands cursor catalog and yaml beyond the static 5', async () => {
  resetCursorCatalogCache()
  const payload = frameConnect(encodeGetUsableModelsResponse([
    { id: 'composer-2', name: 'Composer 2' },
    { id: 'composer-1.5', name: 'Composer 1.5' },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
    { id: 'gpt-5.5', name: 'GPT-5.5' },
    { id: 'gpt-5.5-high-fast', name: 'GPT-5.5 272K High Fast' },
    { id: 'grok-4.5', name: 'Grok 4.5' },
    { id: 'default', name: 'Auto' },
    { id: 'claude-4.6-sonnet-medium', name: 'Sonnet 4.6 1M' },
    { id: 'claude-4.6-sonnet-medium-thinking', name: 'Sonnet 4.6 1M Thinking' },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
    { id: 'cursor-small', name: 'Tab' },
  ]))
  const decoded = decodeGetUsableModelsResponse(payload)
  assert.ok(decoded.length > CURSOR_MODELS.length)
  const available = decodeAvailableModelsResponse(encodeAvailableModelsResponse([
    { name: 'kimi-k2.5', clientDisplayName: 'Kimi K2.5', contextTokenLimit: 262_000 },
  ]))
  assert.equal(available[0].name, 'kimi-k2.5')
  assert.equal(encodeAvailableModelsRequest().length > 0, true)
  const session = cursorSession({
    accessToken: validAccess('live@x'),
    refreshToken: 'rt-live',
    source: 'pkce',
  })
  const models = await refreshCursorCatalog(session, {
    fetchUsable: async () => decoded,
    fetchAvailable: async () => available,
  })
  assert.ok(models.length > CURSOR_MODELS.length)
  assert.equal(models.some((model) => model.id === 'default'), true)
  assert.equal(models.find((model) => model.id === 'default').name, 'Cursor Auto')
  assert.equal(models.some((model) => model.id === 'claude-4.6-sonnet'), true)
  assert.equal(models.some((model) => model.id === 'gemini-3.1-pro'), true)
  assert.equal(models.some((model) => model.id === 'kimi-k2.5'), true)
  assert.equal(models.some((model) => model.id === 'cursor-small'), false)
  assert.deepEqual(cursorCatalogModels().map((model) => model.id), models.map((model) => model.id))
  const catalog = catalogProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    cursorModels: models,
  })
  assert.ok(catalog['oauth-cursor'].models.length > CURSOR_MODELS.length)
  assert.equal(catalog['oauth-cursor'].models.length, models.length)
  assert.equal(models.some((model) => model.id === 'gpt-5.5-fast'), true)
  assert.equal(models.some((model) => model.id === 'gpt-5.5-high-fast'), false)
  assert.equal(models.find((model) => model.id === 'gpt-5.5-fast').name, 'GPT-5.5 Fast')
  const yaml = { providers: {} }
  const result = await syncHarnessModels({
    settings: {
      mutate: async (_target, mutations) => {
        for (const op of mutations) {
          if (op.op === 'unset') delete yaml.providers[op.path[1]]
          if (op.op === 'set') yaml.providers[op.path[1]] = op.value
        }
      },
      get: async () => ({ providers: yaml.providers }),
    },
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { cursor: true },
    cursorModels: models,
  })
  const ids = yaml.providers['oauth-cursor'].models.map((model) => model.id)
  assert.deepEqual(ids, catalog['oauth-cursor'].models.map((model) => model.id))
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-cursor').models, ids)
  assert.ok(ids.length > CURSOR_MODELS.length)
  assert.equal(ids.includes('gpt-5.5-fast'), true)
  assert.equal(ids.includes('gpt-5.5-high-fast'), false)
  resetCursorCatalogCache()
})

test('refreshQuota discovery persists live cursor models into settings.yaml', async () => {
  resetCursorCatalogCache()
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cursor-live-'))
  const authPath = join(dir, 'auth.json')
  const session = cursorSession({
    accessToken: validAccess('yaml@x'),
    refreshToken: 'rt-yaml',
    source: 'pkce',
    account: 'yaml@x',
  })
  await saveSession('cursor', session, authPath)
  const yaml = { providers: {} }
  const decoded = decodeGetUsableModelsResponse(encodeGetUsableModelsResponse([
    { id: 'composer-2', name: 'Composer 2' },
    { id: 'composer-1.5', name: 'Composer 1.5' },
    { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
    { id: 'gpt-5.5', name: 'GPT-5.5' },
    { id: 'grok-4.5', name: 'Grok 4.5' },
    { id: 'default', name: 'Auto' },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro' },
  ]))
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    cursorAutoImport: false,
    cursorDiscover: (live) => refreshCursorCatalog(live, {
      fetchUsable: async () => decoded,
      fetchAvailable: async () => [],
    }),
    settings: {
      mutate: async (_target, mutations) => {
        for (const op of mutations) {
          if (op.op === 'unset') delete yaml.providers[op.path[1]]
          if (op.op === 'set') yaml.providers[op.path[1]] = op.value
        }
      },
      get: async () => ({ providers: yaml.providers }),
    },
    fetchFn: async () => json({
      planUsage: { totalPercentUsed: 44, autoPercentUsed: 51, apiPercentUsed: 0, includedSpend: 40000, limit: 40000 },
      membershipType: 'pro',
      email: 'yaml@x',
    }),
  })
  await controller.refreshQuota('cursor')
  const snap = await controller.snapshot()
  const cursorGroup = snap.catalog.find((row) => row.family === 'cursor')
  assert.ok(cursorGroup.models.length > CURSOR_MODELS.length)
  assert.equal(cursorGroup.models.some((model) => model.id === 'gemini-3.1-pro'), true)
  const ids = yaml.providers['oauth-cursor'].models.map((model) => model.id)
  assert.ok(ids.length > CURSOR_MODELS.length)
  assert.deepEqual(ids, cursorGroup.models.map((model) => model.id))
  const enabled = await controller.setModels({ key: 'oauth-cursor/gemini-3.1-pro', on: true })
  assert.equal(enabled.catalog.find((row) => row.family === 'cursor').models.find((model) => model.id === 'gemini-3.1-pro').enabled, true)
  assert.equal(yaml.providers['oauth-cursor'].models.some((model) => model.id === 'gemini-3.1-pro'), true)
  resetCursorCatalogCache()
})

test('empty GetUsableModels keeps the static five-row fallback', async () => {
  resetCursorCatalogCache()
  const session = cursorSession({
    accessToken: validAccess('empty@x'),
    refreshToken: 'rt-empty',
    source: 'pkce',
  })
  const models = await refreshCursorCatalog(session, {
    fetchUsable: async () => [],
    fetchAvailable: async () => [],
  })
  assert.equal(models.length, CURSOR_MODELS.length)
  assert.deepEqual(models.map((model) => model.id), CURSOR_MODELS.map((model) => model.id))
  assert.equal(models.some((model) => String(model.id).endsWith('-fast')), false)
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  assert.equal(catalog['oauth-cursor'].models.length, CURSOR_MODELS.length)
  assert.equal(catalog['oauth-cursor'].models.some((model) => String(model.id).endsWith('-fast')), false)
  resetCursorCatalogCache()
})
