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
  COPILOT_API_ORIGIN,
  COPILOT_CHAT_VERSION,
  COPILOT_CLIENT_ID,
  COPILOT_DEVICE_URL,
  COPILOT_EXCHANGE_URL,
  COPILOT_INTEGRATION_ID,
  COPILOT_MODELS,
  COPILOT_QUOTA_URL,
  COPILOT_REASONING,
  COPILOT_TOKEN_URL,
  COPILOT_USER_AGENT,
  completeCopilotDevice,
  copilotChatUrl,
  copilotDefaultAccount,
  copilotDeviceSpec,
  copilotSession,
  copilotSourceLabel,
  copilotUpstreamHeaders,
  exchangeCopilotToken,
  isCopilotPermanentRefreshError,
  parseCopilotApiKey,
  refreshCopilot,
} from '../lib/oauth/copilot/index.js'
import { COPILOT_IMPORT_EMPTY, importCopilotAuth } from '../lib/oauth/copilot/import.js'
import {
  applyCopilotCache,
  copilotCacheHeaders,
  copilotCacheSessionId,
  copilotHasVision,
  copilotInitiatorOf,
  resetCopilotPins,
} from '../lib/oauth/copilot/cache.js'
import { applyCopilotThinking, mapCopilotUsage } from '../lib/oauth/copilot/request.js'
import { toCopilotPickerModels, resetCopilotCatalogCache } from '../lib/oauth/copilot/catalog.js'
import { DeviceFlowManager } from '../lib/oauth/grok/device-flow.js'
import { parseCopilotUsage } from '../lib/oauth/quota.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { createProxy } from '../lib/oauth/proxy.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function exchangePayload(token = 'tid=session-token') {
  return {
    token,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
    refresh_in: 1500,
    endpoints: { api: COPILOT_API_ORIGIN },
  }
}

test('device auth request is JSON client_id + read:user', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), body: String(init.body ?? ''), type: init.headers?.['content-type'] })
    if (String(url) === COPILOT_DEVICE_URL) {
      return json({
        device_code: 'dev',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://github.com/login/device',
        interval: 0.01,
        expires_in: 30,
      })
    }
    return json({ error: 'authorization_pending' })
  }
  const devices = new DeviceFlowManager()
  const attempt = await devices.start('copilot', { ...copilotDeviceSpec({ fetchFn }), fetchFn })
  assert.equal(attempt.userCode, 'WDJB-MJHT')
  assert.equal(attempt.verificationUrl, 'https://github.com/login/device')
  const first = calls.find((row) => row.url === COPILOT_DEVICE_URL)
  assert.ok(first)
  assert.equal(first.type, 'application/json')
  assert.deepEqual(JSON.parse(first.body), { client_id: COPILOT_CLIENT_ID, scope: 'read:user' })
  attempt.cancel()
})

test('token poll treats authorization_pending and slow_down then returns tokens', async () => {
  let polls = 0
  const fetchFn = async (url) => {
    if (String(url).includes('/device/code')) {
      return json({
        device_code: 'dev',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://github.com/login/device',
        interval: 0.01,
        expires_in: 30,
      })
    }
    polls += 1
    if (polls === 1) return json({ error: 'authorization_pending' })
    if (polls === 2) return json({ error: 'slow_down' })
    return json({ access_token: 'ghu_tok', refresh_token: 'ghu_ref', expires_in: 3600 })
  }
  const devices = new DeviceFlowManager()
  const attempt = await devices.start('copilot', { ...copilotDeviceSpec({ fetchFn }), fetchFn })
  const tokens = await attempt.waitToken()
  assert.equal(tokens.access_token, 'ghu_tok')
  assert.ok(polls >= 3)
})

test('exchange uses Iv1 token then tid=; gho_ 404 falls back to raw bearer', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), auth: init.headers?.authorization })
    if (String(url) === COPILOT_EXCHANGE_URL && String(init.headers?.authorization).includes('ghu_ok')) {
      return json(exchangePayload('tid=from-ghu'))
    }
    return json({ message: 'Not Found' }, 404)
  }
  const ok = await exchangeCopilotToken('ghu_ok', { fetchFn })
  assert.equal(ok.token, 'tid=from-ghu')
  const fallback = await exchangeCopilotToken('gho_opencode', { fetchFn })
  assert.equal(fallback.token, 'gho_opencode')
  await assert.rejects(exchangeCopilotToken('ghu_bad', { fetchFn }), /copilot/)
})

test('refresh posts copilot_internal; 401 is permanent', async () => {
  const fetchFn = async () => json({ message: 'Bad credentials' }, 401)
  const session = copilotSession({
    accessToken: 'tid=old',
    refreshToken: 'ghu_ref',
    expiresAt: Date.now() - 1000,
    githubToken: 'ghu_ref',
    source: 'oauth',
  })
  try {
    await refreshCopilot(session, fetchFn)
    assert.fail('expected refresh to throw')
  } catch (error) {
    assert.equal(isCopilotPermanentRefreshError(error), true)
  }
})

test('completeCopilotDevice exchanges ghu_ for tid=', async () => {
  const fetchFn = async (url) => {
    if (String(url) === COPILOT_EXCHANGE_URL) return json(exchangePayload('tid=device'))
    return json({})
  }
  const session = await completeCopilotDevice({
    access_token: 'ghu_device',
    refresh_token: 'ghu_refresh',
  }, { fetchFn })
  assert.equal(session.accessToken, 'tid=device')
  assert.equal(session.githubToken, 'ghu_device')
  assert.equal(session.source, 'oauth')
})

test('import hosts.json and never put the token in publicSession', async () => {
  const home = await mkdtemp(join(tmpdir(), 'copilot-cli-'))
  const dir = join(home, '.config', 'github-copilot')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'hosts.json'), JSON.stringify({
    'github.com': { oauth_token: 'ghu_secret_hosts' },
  }))
  const fetchFn = async (url) => {
    if (String(url) === COPILOT_EXCHANGE_URL) return json(exchangePayload('tid=imported'))
    if (String(url).includes('/user')) return json({ login: 'octocat' })
    return json({})
  }
  const result = await importCopilotAuth({ home, env: {}, allowEnv: false, fetchFn })
  assert.equal(result.source, 'cli')
  assert.equal(result.session.accessToken, 'tid=imported')
  const pub = publicSession('copilot', result.session)
  assert.equal(pub.methodLabel, 'CLI')
  assert.equal(JSON.stringify(pub).includes('ghu_secret'), false)
  assert.equal(JSON.stringify(pub).includes('tid='), false)
  assert.equal(Object.hasOwn(pub, 'accessToken'), false)
  assert.equal(Object.hasOwn(pub, 'refreshToken'), false)
})

test('pasted ghu_ is a key source with opaque account', () => {
  const key = copilotSession({
    accessToken: parseCopilotApiKey('ghu_paste_key_xx'),
    githubToken: 'ghu_paste_key_xx',
    source: 'paste',
  })
  const pub = publicSession('copilot', key)
  assert.equal(pub.account, copilotDefaultAccount('ghu_paste_key_xx'))
  assert.equal(pub.methodLabel, 'key')
  assert.equal(JSON.stringify(pub).includes('ghu_paste_key_xx'), false)
  assert.equal(copilotSourceLabel('env'), 'env')
  assert.equal(formatPlanLabel('pro', 'copilot'), 'Pro')
})

test('catalog is Completions at /copilot, not a custom api string', () => {
  const ids = ownedProviderIds('oauth')
  assert.equal(ids.includes('oauth-copilot'), true)
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { copilot: true },
  })
  const route = providers['oauth-copilot']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.api, 'openai-completions')
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/copilot')
  assert.equal(route.baseURL.endsWith('/copilot/v1'), false)
  assert.equal(route.displayName, 'OAuth · Copilot')
  for (const model of route.models) {
    for (const key of Object.keys(model.reasoningEfforts ?? {})) {
      assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
    }
  }
  assert.deepEqual(route.models.find((model) => model.id === 'gpt-5.5').reasoningEfforts, COPILOT_REASONING)
  assert.equal(catalogProviders({ prefix: 'oauth', origin: 'http://x' })['oauth-copilot'].models.length, COPILOT_MODELS.length)
})

test('live picker drops disabled rows and keeps vision / effort', () => {
  resetCopilotCatalogCache()
  const models = toCopilotPickerModels({
    data: [
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        model_picker_enabled: true,
        capabilities: {
          limits: { max_context_window_tokens: 272000, max_output_tokens: 128000 },
          supports: { tool_calls: true, vision: true, reasoning_effort: ['low', 'medium', 'high'] },
        },
      },
      { id: 'hidden', model_picker_enabled: false, capabilities: { supports: { tool_calls: true } } },
      { id: 'blocked', policy: { state: 'disabled' }, capabilities: { supports: { tool_calls: true } } },
      { id: 'no-tools', model_picker_enabled: true, capabilities: { supports: { tool_calls: false } } },
    ],
  })
  assert.deepEqual(models.map((model) => model.id), ['gpt-5.5'])
  assert.deepEqual(models[0].input, ['text', 'image'])
  assert.deepEqual(models[0].reasoningEfforts, COPILOT_REASONING)
})

test('cache strips Codex/Grok fields and parks extra system', () => {
  resetCopilotPins()
  const first = applyCopilotCache({
    session_id: 'sess-copilot',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    messages: [{ role: 'system', content: 'You are Copilot.' }, { role: 'user', content: 'hi' }],
  })
  assert.equal(first.cacheSessionId, 'sess-copilot')
  assert.equal(first.payload.prompt_cache_key, undefined)
  assert.equal(first.payload.session_id, undefined)
  const extra = applyCopilotCache({
    session_id: 'sess-copilot',
    messages: [
      { role: 'system', content: 'You are Copilot.\nSnapshot' },
      { role: 'user', content: 'hi' },
    ],
  })
  assert.equal(extra.payload.messages[0].content, 'You are Copilot.')
  assert.equal(extra.payload.messages.at(-1).role, 'system')
  assert.deepEqual(copilotCacheHeaders('sess-copilot'), { 'x-interaction-id': 'sess-copilot' })
  assert.equal(Object.hasOwn(copilotCacheHeaders('sess-copilot'), 'session-id'), false)
  assert.equal(copilotCacheSessionId('session 1'), 'session-1')
  assert.equal(copilotHasVision([{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,xx' } }] }]), true)
  assert.equal(copilotInitiatorOf([{ role: 'user', content: 'hi' }]), 'user')
  assert.equal(copilotInitiatorOf([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'ok' }]), 'agent')
  resetCopilotPins()
})

test('thinking keeps advertised reasoning_effort and strips GPT max_tokens', () => {
  const on = applyCopilotThinking({ model: 'gpt-5.5', reasoning_effort: 'high', max_tokens: 128 })
  assert.equal(on.reasoning_effort, 'high')
  assert.equal(Object.hasOwn(on, 'max_tokens'), false)
  const off = applyCopilotThinking({ model: 'gpt-5.5', reasoning_effort: 'off' })
  assert.equal(Object.hasOwn(off, 'reasoning_effort'), false)
  const claude = applyCopilotThinking({ model: 'claude-sonnet-4.6', reasoning_effort: 'high', max_tokens: 64 })
  assert.equal(Object.hasOwn(claude, 'reasoning_effort'), false)
  assert.equal(claude.max_tokens, 64)
  assert.equal(mapCopilotUsage({ prompt_tokens: 10, cache_read_input_tokens: 4 }).prompt_tokens_details.cached_tokens, 4)
})

test('quota remaining bars and plan from copilot_internal/user', () => {
  const parsed = parseCopilotUsage({
    login: 'octocat',
    copilot_plan: 'pro',
    quota_reset_date: '2026-10-01T00:00:00Z',
    quota_snapshots: {
      premium_interactions: { percent_remaining: 83.3, unlimited: false },
      chat: { unlimited: true },
    },
  })
  assert.equal(parsed.account, 'octocat')
  assert.equal(parsed.planType, 'pro')
  assert.equal(formatPlanLabel(parsed.planType, 'copilot'), 'Pro')
  assert.equal(parsed.rows[0].remainingPercent, 83.3)
  assert.equal(parsed.rows[1].unlimited, true)
  assert.equal(typeof parsed.rows[0].resetAt, 'number')
})

test('controller snapshot shows quota on every copilot account; hop is Completions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'copilot-ctrl-'))
  const authPath = join(dir, 'auth.json')
  const first = copilotSession({
    accessToken: 'tid=a',
    refreshToken: 'ghu_a',
    expiresAt: Date.now() + 30 * 60_000,
    account: 'one',
    planType: 'pro',
    source: 'oauth',
    githubToken: 'ghu_a',
  })
  const second = copilotSession({
    accessToken: 'tid=b',
    refreshToken: 'ghu_b',
    expiresAt: Date.now() + 30 * 60_000,
    account: 'two',
    source: 'cli',
    githubToken: 'ghu_b',
  })
  await saveSession('copilot', first, authPath)
  await saveSession('copilot', second, authPath, { activate: false })
  const fetchFn = async (url, init) => {
    if (String(url) === COPILOT_QUOTA_URL) {
      const token = String(init.headers?.authorization ?? '')
      const login = token.includes('ghu_b') ? 'two' : 'one'
      return json({
        login,
        copilot_plan: 'pro',
        quota_snapshots: { premium_interactions: { percent_remaining: 70 } },
      })
    }
    if (String(url).includes('/user')) return json({ login: 'one' })
    if (String(url).includes('/models')) {
      return json({
        data: [{
          id: 'gpt-4.1',
          name: 'GPT-4.1',
          model_picker_enabled: true,
          capabilities: { supports: { tool_calls: true, vision: true } },
        }],
      })
    }
    return json({})
  }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn,
    copilotAutoImport: false,
    copilotDiscover: async () => COPILOT_MODELS,
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.copilot.accounts.length, 2)
  for (const row of snap.accounts.copilot.accounts) {
    assert.ok(row.quota)
    assert.equal(JSON.stringify(row).includes('tid='), false)
    assert.equal(JSON.stringify(row).includes('ghu_'), false)
  }
  const pub = publicSession('copilot', first)
  assert.notEqual(accountIdOf('copilot', first), accountIdOf('copilot', second))
  assert.equal(pub.account, 'one')
  const stored = await listStoredSessions('copilot', authPath)
  assert.equal(stored.length, 2)

  const hops = []
  const proxyFetch = async (url, init) => {
    hops.push({ url: String(url), body: init.body, headers: init.headers })
    return json({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'ok' } }] })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'proxy-key-copilot-test-xx',
    tokens: controller.tokens,
    fetchFn: proxyFetch,
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/copilot/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-copilot-test-xx', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'hi' }],
        prompt_cache_key: 'codex-style',
        reasoning_effort: 'high',
        max_tokens: 99,
        session_id: 'sess-copilot',
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(hops[0].url, copilotChatUrl(first))
    const sent = JSON.parse(hops[0].body)
    assert.equal(sent.prompt_cache_key, undefined)
    assert.equal(sent.session_id, undefined)
    assert.equal(sent.reasoning_effort, 'high')
    assert.equal(Object.hasOwn(sent, 'max_tokens'), false)
    assert.equal(hops[0].headers.authorization, 'Bearer tid=a')
    assert.equal(hops[0].headers['copilot-integration-id'], COPILOT_INTEGRATION_ID)
    assert.equal(hops[0].headers['user-agent'], COPILOT_USER_AGENT)
    assert.equal(hops[0].headers['x-interaction-id'], 'sess-copilot')
    assert.equal(hops[0].headers['x-initiator'], 'user')
    assert.equal(Object.hasOwn(hops[0].headers, 'session-id'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'x-grok-conv-id'), false)
    const blocked = await fetch(`http://127.0.0.1:${port}/copilot/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-copilot-test-xx', 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(blocked.status, 501)
  } finally {
    await proxy.close()
  }
})

test('import empty when no CLI file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'copilot-empty-'))
  await assert.rejects(importCopilotAuth({ home, env: {}, allowEnv: false }), (error) => {
    assert.equal(error.code, COPILOT_IMPORT_EMPTY)
    return true
  })
})

test('device spec is github.com JSON with Iv1 client', () => {
  const spec = copilotDeviceSpec()
  assert.equal(spec.clientId, COPILOT_CLIENT_ID)
  assert.equal(spec.deviceCodeUrl, COPILOT_DEVICE_URL)
  assert.equal(spec.tokenUrl, COPILOT_TOKEN_URL)
  assert.equal(spec.restartOnExpired, true)
  assert.equal(spec.jsonBody, true)
  assert.equal(spec.scope, 'read:user')
  const headers = copilotUpstreamHeaders({ accessToken: 'tid=x' }, 'sess-1', { vision: true, initiator: 'agent' })
  assert.equal(headers['x-interaction-id'], 'sess-1')
  assert.equal(headers['x-initiator'], 'agent')
  assert.equal(headers['copilot-vision-request'], 'true')
  assert.equal(headers['copilot-integration-id'], COPILOT_INTEGRATION_ID)
  assert.equal(COPILOT_CHAT_VERSION, '0.35.0')
})
