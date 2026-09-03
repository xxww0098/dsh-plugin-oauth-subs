import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { accountIdOf, listStoredSessions, publicSession, saveSession } from '../lib/oauth/store.js'
import {
  HARNESS_COMPLETIONS_API,
  buildProviders,
  catalogProviders,
  ownedProviderIds,
} from '../lib/oauth/models.js'
import {
  KIMI_CHAT_URL,
  KIMI_CLIENT_ID,
  KIMI_DEVICE_URL,
  KIMI_MODELS,
  KIMI_REASONING,
  KIMI_TOKEN_URL,
  kimiDefaultAccount,
  kimiDeviceSpec,
  kimiSession,
  kimiSourceLabel,
  parseKimiApiKey,
  refreshKimi,
} from '../lib/oauth/kimi/index.js'
import { KIMI_IMPORT_EMPTY, importKimiAuth, kimiSessionFromCliFile } from '../lib/oauth/kimi/import.js'
import { applyKimiCache, kimiCacheHeaders, kimiCacheSessionId, resetKimiPins } from '../lib/oauth/kimi/cache.js'
import { applyKimiThinking } from '../lib/oauth/kimi/request.js'
import { DeviceFlowManager } from '../lib/oauth/grok/device-flow.js'
import { parseKimiUsage } from '../lib/oauth/quota.js'
import { createProxy } from '../lib/oauth/proxy.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('device auth request is client_id only (no scope)', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), body: String(init.body ?? ''), headers: init.headers })
    if (String(url).includes('device_authorization')) {
      return json({
        device_code: 'dev',
        user_code: 'KIMI-CODE',
        verification_uri: 'https://auth.kimi.com/device',
        verification_uri_complete: 'https://auth.kimi.com/device?user_code=KIMI-CODE',
        interval: 0.01,
        expires_in: 30,
      })
    }
    return json({ error: 'authorization_pending' }, 400)
  }
  const devices = new DeviceFlowManager()
  const attempt = await devices.start('kimi', { ...kimiDeviceSpec({ fetchFn }), fetchFn })
  assert.equal(attempt.userCode, 'KIMI-CODE')
  assert.equal(attempt.verificationUrl, 'https://auth.kimi.com/device?user_code=KIMI-CODE')
  const first = calls.find((row) => row.url === KIMI_DEVICE_URL)
  assert.ok(first)
  assert.equal(first.body, `client_id=${KIMI_CLIENT_ID}`)
  assert.equal(first.body.includes('scope'), false)
  attempt.cancel()
})

test('token poll treats authorization_pending and slow_down then returns tokens', async () => {
  let polls = 0
  const fetchFn = async (url) => {
    if (String(url).includes('device_authorization')) {
      return json({
        device_code: 'dev',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://auth.kimi.com/device',
        interval: 0.01,
        expires_in: 30,
      })
    }
    polls += 1
    if (polls === 1) return json({ error: 'authorization_pending' }, 400)
    if (polls === 2) return json({ error: 'slow_down' }, 400)
    return json({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600 })
  }
  const devices = new DeviceFlowManager()
  const attempt = await devices.start('kimi', { ...kimiDeviceSpec({ fetchFn }), fetchFn })
  const tokens = await attempt.waitToken()
  assert.equal(tokens.access_token, 'tok')
  assert.ok(polls >= 3)
})

test('refresh posts refresh_token; 401 invalid_grant is permanent', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push(String(init.body ?? ''))
    return json({ error: 'invalid_grant' }, 401)
  }
  const session = kimiSession({
    accessToken: 'old',
    refreshToken: 'ref',
    expiresAt: Date.now() - 1000,
    source: 'oauth',
  })
  await assert.rejects(refreshKimi(session, fetchFn), /kimi/)
  assert.equal(calls[0].includes('grant_type=refresh_token'), true)
  assert.equal(calls[0].includes(`client_id=${KIMI_CLIENT_ID}`), true)
  const { isKimiPermanentRefreshError } = await import('../lib/oauth/kimi/index.js')
  try {
    await refreshKimi(session, fetchFn)
  } catch (error) {
    assert.equal(isKimiPermanentRefreshError(error), true)
  }
})

test('import kimi-code.json and never put the key in publicSession', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kimi-cli-'))
  const file = join(home, '.kimi-code', 'credentials', 'kimi-code.json')
  await mkdir(join(home, '.kimi-code', 'credentials'), { recursive: true })
  await writeFile(file, JSON.stringify({
    access_token: 'sk-secret-access',
    refresh_token: 'sk-secret-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }))
  const result = await importKimiAuth({ home, env: {}, allowEnv: false })
  assert.equal(result.source, 'cli')
  assert.equal(result.session.accessToken, 'sk-secret-access')
  const pub = publicSession('kimi', result.session)
  assert.equal(pub.methodLabel, 'CLI')
  assert.equal(JSON.stringify(pub).includes('sk-secret'), false)
  assert.equal(Object.hasOwn(pub, 'accessToken'), false)
  assert.equal(Object.hasOwn(pub, 'refreshToken'), false)
})

test('kimi-code.json parse and KIMI_API_KEY key source', () => {
  const session = kimiSessionFromCliFile({
    access_token: 'cli-access',
    refresh_token: 'cli-refresh',
    expires_at: 1_700_000_000,
  })
  assert.equal(session.source, 'cli')
  assert.equal(session.expiresAt, 1_700_000_000_000)
  const key = kimiSession({ accessToken: parseKimiApiKey('sk-kimi-paste-key'), source: 'paste' })
  const pub = publicSession('kimi', key)
  assert.equal(pub.account, kimiDefaultAccount('sk-kimi-paste-key'))
  assert.equal(pub.methodLabel, 'key')
  assert.equal(JSON.stringify(pub).includes('sk-kimi-paste-key'), false)
  assert.equal(kimiSourceLabel('env'), 'env')
})

test('catalog is Completions at /kimi, not a custom api string', () => {
  const ids = ownedProviderIds('oauth')
  assert.equal(ids.includes('oauth-kimi'), true)
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { kimi: true },
  })
  const route = providers['oauth-kimi']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.api, 'openai-completions')
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/kimi')
  assert.equal(route.baseURL.endsWith('/kimi/v1'), false)
  for (const model of route.models) {
    for (const key of Object.keys(model.reasoningEfforts ?? {})) {
      assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
    }
  }
  assert.deepEqual(route.models.find((model) => model.id === 'k3').reasoningEfforts, KIMI_REASONING)
  assert.equal(catalogProviders({ prefix: 'oauth', origin: 'http://x' })['oauth-kimi'].models.length, KIMI_MODELS.length)
})

test('cache strips Codex/Grok fields and parks extra system', () => {
  resetKimiPins()
  const first = applyKimiCache({
    session_id: 'sess-kimi',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    messages: [{ role: 'system', content: 'You are Kimi.' }, { role: 'user', content: 'hi' }],
  })
  assert.equal(first.cacheSessionId, 'sess-kimi')
  assert.equal(first.payload.prompt_cache_key, undefined)
  assert.equal(first.payload.session_id, undefined)
  const extra = applyKimiCache({
    session_id: 'sess-kimi',
    messages: [
      { role: 'system', content: 'You are Kimi.\nSnapshot' },
      { role: 'user', content: 'hi' },
    ],
  })
  assert.equal(extra.payload.messages[0].content, 'You are Kimi.')
  assert.equal(extra.payload.messages.at(-1).role, 'system')
  assert.deepEqual(kimiCacheHeaders(), {})
  assert.equal(kimiCacheSessionId('session 1'), 'session-1')
  resetKimiPins()
})

test('thinking maps DSH effort onto thinking.effort', () => {
  const on = applyKimiThinking({ model: 'k3', reasoning_effort: 'low' })
  assert.deepEqual(on.thinking, { type: 'enabled', effort: 'low' })
  assert.equal(Object.hasOwn(on, 'reasoning_effort'), false)
  const off = applyKimiThinking({ model: 'k3', reasoning_effort: 'off' })
  assert.deepEqual(off.thinking, { type: 'disabled' })
})

test('quota remaining bars and plan from /me; no invented reset', () => {
  const parsed = parseKimiUsage({
    usage: { used: 25, limit: 100, name: 'Current week' },
    limits: [{ detail: { used: 10, remaining: 90, limit: 100 }, window: { duration: 5, timeUnit: 'HOUR' } }],
  }, { email: 'user@kimi.com', user_level_name: 'Pro' })
  assert.equal(parsed.account, 'user@kimi.com')
  assert.equal(parsed.planType, 'Pro')
  assert.equal(parsed.rows[0].remainingPercent, 75)
  assert.equal(parsed.rows[1].kind, 'primary')
  assert.equal(parsed.rows[0].resetAt, undefined)
})

test('controller snapshot shows quota on every kimi account; hop is Completions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimi-ctrl-'))
  const authPath = join(dir, 'auth.json')
  const first = kimiSession({
    accessToken: 'tok-a',
    refreshToken: 'ref-a',
    expiresAt: Date.now() + 30 * 60_000,
    account: 'one@kimi.com',
    planType: 'Pro',
    source: 'oauth',
  })
  const second = kimiSession({
    accessToken: 'tok-b',
    refreshToken: 'ref-b',
    expiresAt: Date.now() + 30 * 60_000,
    account: 'two@kimi.com',
    source: 'cli',
  })
  await saveSession('kimi', first, authPath)
  await saveSession('kimi', second, authPath, { activate: false })
  const fetchFn = async (url) => {
    if (String(url).includes('/me')) {
      return json({ email: 'one@kimi.com', user_level_name: 'Pro' })
    }
    if (String(url).includes('/usages')) {
      return json({ usage: { used: 20, limit: 100 } })
    }
    if (String(url).includes('/models')) {
      return json({ data: [{ id: 'k3', display_name: 'Kimi K3', context_length: 262144, supports_image_in: true }] })
    }
    return json({})
  }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn,
    kimiAutoImport: false,
    kimiDiscover: async () => KIMI_MODELS,
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.kimi.accounts.length, 2)
  for (const row of snap.accounts.kimi.accounts) {
    assert.ok(row.quota)
    assert.equal(JSON.stringify(row).includes('tok-'), false)
  }
  const pub = publicSession('kimi', first)
  assert.notEqual(accountIdOf('kimi', first), accountIdOf('kimi', second))
  assert.equal(pub.account, 'one@kimi.com')
  const stored = await listStoredSessions('kimi', authPath)
  assert.equal(stored.length, 2)

  const hops = []
  const proxyFetch = async (url, init) => {
    hops.push({ url: String(url), body: init.body, headers: init.headers })
    return json({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'ok' } }] })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'proxy-key-kimi-test-xx',
    tokens: controller.tokens,
    fetchFn: proxyFetch,
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/kimi/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-kimi-test-xx', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'k3',
        messages: [{ role: 'user', content: 'hi' }],
        prompt_cache_key: 'codex-style',
        reasoning_effort: 'high',
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(hops[0].url, KIMI_CHAT_URL)
    const sent = JSON.parse(hops[0].body)
    assert.equal(sent.prompt_cache_key, undefined)
    assert.deepEqual(sent.thinking, { type: 'enabled', effort: 'high' })
    assert.equal(hops[0].headers.authorization, 'Bearer tok-a')
    assert.equal(Object.hasOwn(hops[0].headers, 'session-id'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'x-grok-conv-id'), false)
  } finally {
    await proxy.close()
  }
})

test('import empty when no CLI file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'kimi-empty-'))
  await assert.rejects(importKimiAuth({ home, env: {}, allowEnv: false }), (error) => {
    assert.equal(error.code, KIMI_IMPORT_EMPTY)
    return true
  })
})

test('device token URL is auth.kimi.com', () => {
  const spec = kimiDeviceSpec()
  assert.equal(spec.deviceCodeUrl, KIMI_DEVICE_URL)
  assert.equal(spec.tokenUrl, KIMI_TOKEN_URL)
  assert.equal(spec.restartOnExpired, true)
  assert.equal(spec.scope, undefined)
})
