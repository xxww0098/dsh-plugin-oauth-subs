import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  BUILDER_ID_START_URL,
  KIRO_PORTAL_URL,
  KIRO_USAGE_VERSION,
  allocateKiroMachineId,
  canonicalizeKiroMethod,
  exchangeKiroSocialCode,
  isKiroCredential,
  kiroAccountId,
  kiroAccountKind,
  kiroEffectiveProfileArn,
  kiroMethodLabel,
  kiroSession,
  kiroSessionFromImport,
  KIRO_CALLBACK_PATHS,
  kiroSocialFlow,
  kiroSocialRedirectUri,
  kiroSocialTokenRedirectUri,
  kiroUsageUrl,
  refreshKiro,
  validateKiroApiKey,
  validateKiroIdpEndpoint,
  validateKiroRefreshToken,
} from '../lib/oauth/kiro/index.js'
import { registerKiroOidcClient, kiroIdcSession } from '../lib/oauth/kiro/idc-flow.js'
import { parseKiroUsage } from '../lib/oauth/quota.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { OAuthFlowManager } from '../lib/oauth/flow.js'
import { AuthController } from '../lib/oauth/controller.js'
import { accountIdOf, listAccounts, saveSession } from '../lib/oauth/store.js'
import { buildProviders, catalogProviders, describeCatalog } from '../lib/oauth/models.js'
import { importKiroAuth, sessionFromKiroAuth } from '../lib/oauth/import-auth.js'

const RT = `rt_${'x'.repeat(120)}`
const KEY = 'ksk_live_example1'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('canonicalizeKiroMethod maps aliases including Entra and Builder ID', () => {
  assert.equal(canonicalizeKiroMethod('builder-id'), 'idc')
  assert.equal(canonicalizeKiroMethod('enterprise'), 'idc')
  assert.equal(canonicalizeKiroMethod('entra-id'), 'external_idp')
  assert.equal(canonicalizeKiroMethod('azuread'), 'external_idp')
  assert.equal(canonicalizeKiroMethod('github'), 'social')
  assert.equal(canonicalizeKiroMethod('oauth'), 'social')
  assert.equal(canonicalizeKiroMethod('ksk'), 'api_key')
  assert.equal(canonicalizeKiroMethod(undefined, { tokenEndpoint: 'https://login.microsoftonline.com/t/oauth2/v2.0/token' }), 'external_idp')
})

test('kiro social authorize URL omits the callback path on redirect_uri', () => {
  const flow = kiroSocialFlow()
  assert.equal(flow.listen.host, 'localhost')
  assert.deepEqual(flow.callbackPaths, [...KIRO_CALLBACK_PATHS])
  const callback = 'http://localhost:3128/oauth/callback'
  const url = new URL(flow.buildAuthorizeUrl({
    state: 'st',
    pkce: { challenge: 'ch' },
    redirectUri: callback,
  }))
  assert.equal(`${url.origin}${url.pathname}`, `${KIRO_PORTAL_URL}/signin`)
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3128')
  assert.equal(url.searchParams.get('redirect_uri'), kiroSocialRedirectUri(callback))
  assert.notEqual(url.searchParams.get('redirect_uri'), callback)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('redirect_from'), 'KiroIDE')
})

test('kiro API key and truncated refresh tokens are rejected', () => {
  assert.equal(validateKiroApiKey(KEY), KEY)
  assert.throws(() => validateKiroApiKey('sk-not-kiro'), /ksk_/)
  assert.equal(validateKiroRefreshToken(RT), RT)
  assert.throws(() => validateKiroRefreshToken(`${'short'.repeat(5)}...`), /truncated/)
  assert.throws(() => validateKiroRefreshToken('too-short'), /truncated/)
})

test('Entra token endpoint allow-list is microsoftonline https only', () => {
  const ok = validateKiroIdpEndpoint('https://login.microsoftonline.com/contoso/oauth2/v2.0/token')
  assert.equal(ok.startsWith('https://login.microsoftonline.com/'), true)
  assert.throws(() => validateKiroIdpEndpoint('http://login.microsoftonline.com/t/token'), /https/)
  assert.throws(() => validateKiroIdpEndpoint('https://evil.example/token'), /microsoftonline/)
})

test('kiro account ids keep Social / Builder / IdC / Entra / API key apart', () => {
  const social = kiroSession({ accessToken: 'a', refreshToken: RT, authMethod: 'social', account: 'dev@x' })
  const builder = kiroSession({
    accessToken: 'a', refreshToken: RT, authMethod: 'idc', startUrl: BUILDER_ID_START_URL, account: 'dev@x',
  })
  const enterprise = kiroSession({
    accessToken: 'a', refreshToken: RT, authMethod: 'idc', startUrl: 'https://d-123.awsapps.com/start', account: 'dev@x',
  })
  const entra = kiroSession({
    accessToken: 'a',
    refreshToken: RT,
    authMethod: 'external_idp',
    tokenEndpoint: 'https://login.microsoftonline.com/t/oauth2/v2.0/token',
    clientId: 'cid',
    account: 'dev@x',
  })
  const key = kiroSession({ accessToken: KEY, authMethod: 'api_key', account: 'dev@x' })
  assert.equal(kiroAccountKind(social), 'social')
  assert.equal(kiroAccountKind(builder), 'builder')
  assert.equal(kiroAccountKind(enterprise), 'idc')
  assert.equal(kiroAccountKind(entra), 'entra')
  assert.equal(kiroAccountKind(key), 'key')
  assert.equal(kiroMethodLabel(builder), 'Builder')
  assert.equal(kiroMethodLabel(enterprise), 'IdC')
  assert.equal(kiroAccountId(social), 'dev@x@social')
  assert.equal(accountIdOf('kiro', builder), 'dev@x@builder')
  assert.equal(accountIdOf('kiro', enterprise), 'dev@x@idc')
  assert.equal(accountIdOf('kiro', entra), 'dev@x@entra')
  assert.equal(accountIdOf('kiro', key), 'dev@x@key')
})

test('kiroSessionFromImport reads kiro.rs camelCase and rejects truncated RTs', () => {
  const session = kiroSessionFromImport({
    authMethod: 'social',
    accessToken: 'at',
    refreshToken: RT,
    email: 'a@x',
    subscriptionTitle: 'KIRO PRO+',
    profileArn: 'arn:aws:codewhisperer:us-east-1:1:profile/X',
  })
  assert.equal(session.authMethod, 'social')
  assert.equal(session.account, 'a@x')
  assert.equal(session.planType, 'KIRO PRO+')
  assert.equal(isKiroCredential({ authMethod: 'idc', refreshToken: RT }), true)
  assert.throws(() => kiroSessionFromImport({
    authMethod: 'social',
    refreshToken: 'abc...def',
    accessToken: 'at',
  }), /truncated/)
})

test('kiroUsageUrl never sends the Builder ID placeholder ARN', () => {
  const arn = kiroEffectiveProfileArn({
    profileArn: 'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX',
  })
  assert.equal(arn, undefined)
  const url = kiroUsageUrl('us-east-1')
  assert.equal(url.includes('profileArn'), false)
  assert.equal(url.includes('isEmailRequired=true'), true)
})

test('parseKiroUsage sums trial + bonus and reads email / plan', () => {
  const parsed = parseKiroUsage({
    subscriptionInfo: { subscriptionTitle: 'KIRO PRO+' },
    userInfo: { email: 'alice@example.com' },
    nextDateReset: 1_800_000_000,
    usageBreakdownList: [{
      currentUsageWithPrecision: 10,
      usageLimitWithPrecision: 100,
      freeTrialInfo: {
        freeTrialStatus: 'ACTIVE',
        currentUsageWithPrecision: 5,
        usageLimitWithPrecision: 20,
      },
      bonuses: [{ status: 'ACTIVE', currentUsage: 2, usageLimit: 10 }],
    }],
  })
  assert.equal(parsed.account, 'alice@example.com')
  assert.equal(parsed.planType, 'KIRO PRO+')
  assert.equal(parsed.rows[0].used, 17)
  assert.equal(parsed.rows[0].total, 130)
  assert.equal(parsed.rows[0].remaining, 113)
  assert.equal(parsed.rows[0].kind, 'cycle')
})

test('formatPlanLabel maps Kiro slugs without colliding with Codex Pro 20x', () => {
  assert.equal(formatPlanLabel('KIRO PRO+', 'kiro'), 'Pro+')
  assert.equal(formatPlanLabel('pro', 'kiro'), 'Pro')
  assert.equal(formatPlanLabel('pro', 'codex'), 'Pro 20x')
  assert.equal(formatPlanLabel('kiro_free', 'kiro'), 'Free')
  assert.equal(formatPlanLabel('KIRO POWERED', 'kiro'), 'Powered')
})

test('Kiro catalog matches kiro.dev models minus Auto, with native ids', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const kiro = catalog['oauth-kiro']
  assert.deepEqual(kiro.models.map((model) => model.id), [
    'gpt-5.6-sol',
    'gpt-5.6-terra',
    'gpt-5.6-luna',
    'claude-opus-5',
    'claude-opus-4.8',
    'claude-opus-4.7',
    'claude-opus-4.6',
    'claude-opus-4.5',
    'claude-sonnet-5',
    'claude-sonnet-4.6',
    'claude-sonnet-4.5',
    'claude-sonnet-4',
    'claude-haiku-4.5',
    'deepseek-3.2',
    'minimax-m2.5',
    'glm-5',
    'minimax-m2.1',
    'qwen3-coder-next',
  ])
  assert.equal(kiro.models.find((model) => model.id === 'claude-sonnet-4-8'), undefined)
  assert.equal(kiro.models.find((model) => model.id === 'auto'), undefined)
  assert.equal(kiro.models.find((model) => model.id === 'claude-opus-5').contextWindow, 1_000_000)
  assert.equal(kiro.models.find((model) => model.id === 'claude-sonnet-5').name, 'Claude Sonnet 5')
  assert.deepEqual(kiro.models.find((model) => model.id === 'claude-opus-4.8').input, ['text', 'image'])
  assert.deepEqual(kiro.models.find((model) => model.id === 'gpt-5.6-sol').input, ['text', 'image'])
  assert.deepEqual(kiro.models.find((model) => model.id === 'glm-5').input, ['text'])
  assert.deepEqual(kiro.models.find((model) => model.id === 'deepseek-3.2').input, ['text'])
  assert.deepEqual(kiro.models.find((model) => model.id === 'qwen3-coder-next').input, ['text'])
  assert.deepEqual(kiro.models.find((model) => model.id === 'gpt-5.6-sol').reasoningEfforts, {
    none: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  })
  assert.deepEqual(kiro.models.find((model) => model.id === 'claude-opus-5').reasoningEfforts, {
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'max',
    xhigh: 'xhigh',
  })
  assert.deepEqual(kiro.models.find((model) => model.id === 'claude-sonnet-4.6').reasoningEfforts, {
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'max',
  })
  assert.equal(kiro.models.find((model) => model.id === 'claude-sonnet-4.6').reasoningEfforts.xhigh, undefined)
  assert.equal(kiro.models.find((model) => model.id === 'claude-haiku-4.5').reasoningEfforts, false)
  assert.equal(kiro.models.find((model) => model.id === 'glm-5').reasoningEfforts, false)
  assert.equal(kiro.compat.supportsReasoningEffort, true)
  assert.equal(kiro.api, 'openai-completions')
  const described = describeCatalog(catalog).find((row) => row.family === 'kiro')
  assert.equal(described.displayName.includes('Kiro'), true)
  const loggedOut = buildProviders({ prefix: 'oauth', origin: 'http://x', loggedIn: { kiro: false } })
  assert.equal(loggedOut['oauth-kiro'], undefined)
})

test('exchangeKiroSocialCode posts landed callback path and login_option', async () => {
  const registered = 'http://localhost:3128/oauth/callback'
  let seen
  const session = await exchangeKiroSocialCode('code-1', 'verifier', registered, {
    callback: { pathname: '/signin/callback', loginOption: 'Google' },
    fetchFn: async (url, init) => {
      seen = { url: String(url), body: JSON.parse(init.body), headers: init.headers }
      return json({
        accessToken: 'at',
        refreshToken: RT,
        expiresIn: 3600,
        profileArn: 'arn:aws:codewhisperer:us-east-1:1:profile/X',
      })
    },
  })
  assert.equal(seen.body.redirect_uri, 'http://localhost:3128/signin/callback?login_option=google')
  assert.equal(seen.body.redirect_uri, kiroSocialTokenRedirectUri(registered, {
    pathname: '/signin/callback',
    loginOption: 'Google',
  }))
  assert.equal(Object.keys(seen.body).sort().join(','), 'code,code_verifier,redirect_uri')
  assert.equal(KIRO_USAGE_VERSION, '1.0.0')
  assert.match(seen.headers['user-agent'], /^KiroIDE-1\.0\.0-[0-9a-f]{64}$/i)
  assert.equal(seen.headers.accept, 'application/json, text/plain, */*')
  assert.equal(session.authMethod, 'social')
  assert.equal(session.accessToken, 'at')
  assert.equal(session.machineId, seen.headers['user-agent'].slice('KiroIDE-1.0.0-'.length))
})

test('exchangeKiroSocialCode reuses a machineId allocated before the browser opens', async () => {
  const machineId = allocateKiroMachineId()
  assert.match(machineId, /^[0-9a-f]{64}$/)
  assert.equal(allocateKiroMachineId(machineId), machineId)
  let seen
  const session = await exchangeKiroSocialCode('code-m', 'verifier', 'http://localhost:3128/oauth/callback', {
    machineId,
    callback: { pathname: '/oauth/callback', loginOption: 'google' },
    fetchFn: async (_url, init) => {
      seen = { body: JSON.parse(init.body), ua: init.headers['user-agent'] }
      return json({ accessToken: 'at', refreshToken: RT, expiresIn: 3600 })
    },
  })
  assert.equal(session.machineId, machineId)
  assert.equal(seen.ua, `KiroIDE-1.0.0-${machineId}`)
  assert.equal(seen.body.redirect_uri, 'http://localhost:3128/oauth/callback?login_option=google')
})

test('kiro social authorize stays origin-only; token uses landed callback', async () => {
  const registered = 'http://localhost:4649/oauth/callback'
  const authorizeRedirect = new URL(kiroSocialFlow().buildAuthorizeUrl({
    state: 'st',
    pkce: { challenge: 'ch' },
    redirectUri: registered,
  })).searchParams.get('redirect_uri')
  let tokenRedirect
  await exchangeKiroSocialCode('code-2', 'verifier', registered, {
    callback: { pathname: '/oauth/callback', loginOption: 'github' },
    fetchFn: async (_url, init) => {
      tokenRedirect = JSON.parse(init.body).redirect_uri
      return json({ accessToken: 'at', refreshToken: RT, expiresIn: 3600 })
    },
  })
  assert.equal(authorizeRedirect, 'http://localhost:4649')
  assert.equal(authorizeRedirect, kiroSocialRedirectUri(registered))
  assert.equal(tokenRedirect, 'http://localhost:4649/oauth/callback?login_option=github')
  assert.notEqual(tokenRedirect, authorizeRedirect)
  assert.equal(String(authorizeRedirect).includes('127.0.0.1'), false)
  assert.equal(String(tokenRedirect).includes('127.0.0.1'), false)
})

test('kiro social token redirect_uri keeps path when login_option is missing', () => {
  assert.equal(
    kiroSocialTokenRedirectUri('http://localhost:3128/oauth/callback', { pathname: '/oauth/callback' }),
    'http://localhost:3128/oauth/callback',
  )
  assert.equal(
    kiroSocialTokenRedirectUri('http://127.0.0.1:3128/oauth/callback', {
      pathname: '/signin/callback',
      loginOption: 'GitHub',
    }),
    'http://localhost:3128/signin/callback?login_option=github',
  )
  assert.equal(kiroSocialRedirectUri('http://127.0.0.1:3128/oauth/callback'), 'http://localhost:3128')
  assert.equal(kiroSocialRedirectUri('http://127.0.0.1:3128/oauth/callback').includes('127.0.0.1'), false)
})

test('Kiro Social loopback registers localhost and accepts / plus /oauth/callback', async () => {
  const flows = new OAuthFlowManager()

  const first = await flows.start('kiro', {
    ...kiroSocialFlow(),
    listen: { host: 'localhost', ports: [0] },
    timeoutMs: 8_000,
  })
  const redirect = new URL(first.authorizeUrl).searchParams.get('redirect_uri')
  assert.match(redirect, /^http:\/\/localhost:\d+$/)
  assert.equal(new URL(first.redirectUri).hostname, 'localhost')
  assert.equal(new URL(first.authorizeUrl).searchParams.get('redirect_from'), 'KiroIDE')
  const port = new URL(redirect).port
  const root = await fetch(`http://127.0.0.1:${port}/?code=from-root&state=${first.state}`)
  assert.equal(root.status, 200)
  assert.equal(await first.waitCode(), 'from-root')

  const second = await flows.start('kiro', {
    ...kiroSocialFlow(),
    listen: { host: 'localhost', ports: [0] },
    timeoutMs: 8_000,
  })
  const secondPort = new URL(second.redirectUri).port
  const callback = await fetch(`http://127.0.0.1:${secondPort}/oauth/callback?code=from-cb&state=${second.state}`)
  assert.equal(callback.status, 200)
  assert.equal(await second.waitCode(), 'from-cb')

  const third = await flows.start('kiro', {
    ...kiroSocialFlow(),
    listen: { host: 'localhost', ports: [0] },
    timeoutMs: 8_000,
  })
  const thirdPort = new URL(third.redirectUri).port
  const signin = await fetch(`http://127.0.0.1:${thirdPort}/signin/callback?code=from-signin&state=${third.state}&login_option=Google`)
  assert.equal(signin.status, 200)
  assert.equal(await third.waitCode(), 'from-signin')
  const landed = third.callback()
  assert.equal(landed.pathname, '/signin/callback')
  assert.equal(landed.loginOption, 'google')
  let tokenRedirect
  await exchangeKiroSocialCode('from-signin', third.pkce.verifier, third.redirectUri, {
    callback: landed,
    fetchFn: async (_url, init) => {
      tokenRedirect = JSON.parse(init.body).redirect_uri
      return json({ accessToken: 'at', refreshToken: RT, expiresIn: 3600 })
    },
  })
  assert.equal(tokenRedirect, `http://localhost:${thirdPort}/signin/callback?login_option=google`)
  assert.equal(String(tokenRedirect).includes('127.0.0.1'), false)
  assert.equal(new URL(third.authorizeUrl).searchParams.get('redirect_uri').includes('127.0.0.1'), false)
})

test('refreshKiro social / idc / entra hit the matching endpoints', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), body: init.body, type: init.headers['content-type'] })
    return json({ accessToken: 'next', access_token: 'next', refreshToken: RT, expiresIn: 3600 })
  }
  const social = await refreshKiro(kiroSession({
    accessToken: 'old', refreshToken: RT, authMethod: 'social',
  }), { fetchFn })
  assert.equal(social.accessToken, 'next')
  assert.equal(seen[0].url.includes('auth.desktop.kiro.dev/refreshToken'), true)
  const idc = await refreshKiro(kiroSession({
    accessToken: 'old',
    refreshToken: RT,
    authMethod: 'idc',
    clientId: 'cid',
    clientSecret: 'sec',
    startUrl: BUILDER_ID_START_URL,
  }), { fetchFn })
  assert.equal(idc.authMethod, 'idc')
  assert.equal(seen[1].url, 'https://oidc.us-east-1.amazonaws.com/token')
  assert.equal(JSON.parse(seen[1].body).grantType, 'refresh_token')
  const entra = await refreshKiro(kiroSession({
    accessToken: 'old',
    refreshToken: RT,
    authMethod: 'external_idp',
    clientId: 'cid',
    tokenEndpoint: 'https://login.microsoftonline.com/t/oauth2/v2.0/token',
  }), { fetchFn })
  assert.equal(entra.authMethod, 'external_idp')
  assert.equal(seen[2].type, 'application/x-www-form-urlencoded')
})

test('registerKiroOidcClient posts JSON camelCase to /client/register', async () => {
  let seen
  const registered = await registerKiroOidcClient({
    startUrl: BUILDER_ID_START_URL,
    fetchFn: async (url, init) => {
      seen = { url: String(url), body: JSON.parse(init.body) }
      return json({ clientId: 'cid', clientSecret: 'sec' })
    },
  })
  assert.equal(seen.url, 'https://oidc.us-east-1.amazonaws.com/client/register')
  assert.equal(seen.body.clientType, 'public')
  assert.equal(seen.body.issuerUrl, BUILDER_ID_START_URL)
  const session = kiroIdcSession({
    accessToken: 'at', refreshToken: RT, expiresIn: 3600,
  }, registered, { kind: 'builder' })
  assert.equal(session.kiroProvider, 'BuilderId')
  assert.equal(session.authMethod, 'idc')
})

test('controller snapshot lists Kiro catalog and quota on every account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  const later = Date.now() + 60 * 60_000
  await saveSession('kiro', kiroSession({
    accessToken: 'tok-a', refreshToken: `${RT}a`, authMethod: 'social', account: 'a@x',
  }), authPath)
  await saveSession('kiro', kiroSession({
    accessToken: 'tok-b', refreshToken: `${RT}b`, authMethod: 'social', account: 'b@x',
  }), authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async (_url, init) => {
      const auth = String(init?.headers?.authorization ?? '')
      const used = auth.includes('tok-b') ? 10 : 40
      return json({
        subscriptionInfo: { subscriptionTitle: 'KIRO PRO' },
        userInfo: { email: auth.includes('tok-b') ? 'b@x' : 'a@x' },
        usageBreakdownList: [{ currentUsageWithPrecision: used, usageLimitWithPrecision: 100 }],
      })
    },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.catalog.length, 5)
  assert.equal(snap.catalog.some((row) => row.family === 'kiro'), true)
  const roster = snap.accounts.kiro.accounts
  assert.equal(roster.length, 2)
  const first = roster.find((row) => row.account === 'a@x')
  const second = roster.find((row) => row.account === 'b@x')
  assert.equal(first.quota.status, 'ready')
  assert.equal(second.quota.status, 'ready')
  assert.equal(first.quota.rows[0].remainingPercent, 60)
  assert.equal(second.quota.rows[0].remainingPercent, 90)
  assert.equal(second.active, true)
  assert.equal(second.methodLabel, 'Social')
  assert.equal(second.quota.planLabel, 'Pro')
})

test('controller useKey stores a Kiro API key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async () => json({
      subscriptionInfo: { subscriptionTitle: 'KIRO FREE' },
      usageBreakdownList: [{ currentUsageWithPrecision: 0, usageLimitWithPrecision: 50 }],
    }),
  })
  const result = await controller.useKey('kiro', KEY, { mode: 'api_key' })
  assert.equal(result.method, 'api_key')
  const roster = await listAccounts('kiro', authPath)
  assert.equal(roster[0].methodLabel, 'API key')
})

test('controller kiro Social login allocates machineId before opening the browser', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  const prior = allocateKiroMachineId()
  await saveSession('kiro', kiroSession({
    accessToken: 'old', refreshToken: RT, authMethod: 'social', account: 'old@x', machineId: prior,
  }), authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async () => { throw new Error('social login must not hit AWS before the browser') },
  })
  const result = await controller.login('kiro', { mode: 'social' })
  assert.equal(result.mode, 'pkce')
  assert.equal(result.machineId, prior)
  assert.equal(controller.flows.pending('kiro').machineId, prior)
  assert.match(result.authorizeUrl, /^https:\/\/app\.kiro\.dev\/signin\?/)
  const authorizeRedirect = new URL(result.authorizeUrl).searchParams.get('redirect_uri')
  assert.match(authorizeRedirect, /^http:\/\/localhost:\d+$/)
  await controller.cancel('kiro')
})

test('controller kiro Builder ID login registers an OIDC client then can cancel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const calls = []
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async (url, init = {}) => {
      const href = String(url)
      calls.push(href)
      if (href.endsWith('/client/register')) return json({ clientId: 'cid', clientSecret: 'sec' })
      if (href.endsWith('/device_authorization')) {
        return json({
          deviceCode: 'dc',
          userCode: 'ABCD-EFGH',
          verificationUri: 'https://view.awsapps.com/start/#/device',
          interval: 1,
          expiresIn: 600,
        })
      }
      return json({ error: 'authorization_pending' }, 400)
    },
  })
  const result = await controller.login('kiro', { mode: 'builder' })
  assert.equal(result.mode, 'device')
  assert.equal(result.userCode, 'ABCD-EFGH')
  assert.equal(result.kind, 'builder')
  assert.equal(calls.some((href) => href.endsWith('/client/register')), true)
  await controller.cancel('kiro')
})

test('sessionFromKiroAuth and importKiroAuth read a kiro.rs credentials dump', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kiro-imp-'))
  const path = join(dir, 'credentials.json')
  await writeFile(path, JSON.stringify({
    authMethod: 'social',
    accessToken: 'at',
    refreshToken: RT,
    email: 'imp@x',
    provider: 'Github',
  }))
  const imported = await importKiroAuth([path])
  assert.equal(imported.session.account, 'imp@x')
  assert.equal(imported.source, path)
  assert.equal(sessionFromKiroAuth({ foo: 1 }), undefined)
})

test('Kiro vault can hold one card per credential method', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = join(dir, 'auth.json')
  const later = Date.now() + 60 * 60_000
  const shared = { accessToken: 'at', refreshToken: RT, account: 'dev@x', expiresAt: later }
  await saveSession('kiro', kiroSession({ ...shared, authMethod: 'social' }), path)
  await saveSession('kiro', kiroSession({
    ...shared, authMethod: 'idc', startUrl: BUILDER_ID_START_URL, clientId: 'cid', clientSecret: 'sec',
  }), path)
  await saveSession('kiro', kiroSession({
    ...shared, authMethod: 'idc', startUrl: 'https://d-123.awsapps.com/start', clientId: 'cid', clientSecret: 'sec',
  }), path)
  await saveSession('kiro', kiroSession({
    ...shared,
    authMethod: 'external_idp',
    tokenEndpoint: 'https://login.microsoftonline.com/t/oauth2/v2.0/token',
    clientId: 'cid',
  }), path)
  await saveSession('kiro', kiroSession({ accessToken: KEY, authMethod: 'api_key', account: 'dev@x' }), path)
  const roster = await listAccounts('kiro', path)
  assert.equal(roster.length, 5)
  assert.deepEqual(roster.map((row) => row.methodLabel).sort(), ['API key', 'Builder', 'Entra', 'IdC', 'Social'])
  const ids = new Set(roster.map((row) => row.id))
  assert.equal(ids.size, 5)

  const controller = new AuthController({
    authPath: path,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async () => json({
      subscriptionInfo: { subscriptionTitle: 'KIRO PRO' },
      userInfo: { email: 'dev@x' },
      usageBreakdownList: [{ currentUsageWithPrecision: 1, usageLimitWithPrecision: 100 }],
    }),
  })
  const snap = await controller.snapshot()
  const cards = snap.accounts.kiro.accounts
  assert.equal(cards.length, 5)
  for (const card of cards) {
    assert.equal(card.quota.status, 'ready')
    assert.equal(card.account, 'dev@x')
  }
})
