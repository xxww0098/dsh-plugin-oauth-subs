import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { accountIdOf, publicSession, saveSession, listStoredSessions } from '../lib/oauth/store.js'
import {
  HARNESS_COMPLETIONS_API,
  assertDshServiceableProvider,
  buildProviders,
  catalogProviders,
  familyOfProvider,
  ownedProviderIds,
} from '../lib/oauth/models.js'
import {
  CLINE_ACCESS_TOKEN_PREFIX,
  CLINE_API_BASE,
  CLINE_CHAT_URL,
  CLINE_CLIENT_TYPE,
  CLINE_CORE_VERSION,
  CLINE_COST_SCALE,
  CLINE_MODELS,
  CLINE_PLAN_LIMITS_URL,
  CLINE_REASONING,
  CLINE_REFRESH_URL,
  CLINE_REGISTER_URL,
  CLINE_USER_AGENT,
  CLINE_WORKOS_AUTHENTICATE_URL,
  CLINE_WORKOS_CLIENT_ID,
  CLINE_WORKOS_DEVICE_URL,
  clineDefaultAccount,
  clineDeviceSpec,
  clineSessionFromAuthData,
  clineUpstreamHeaders,
  formatClineAccessToken,
  isClinePermanentRefreshError,
  normalizeClineAccessToken,
  refreshCline,
  registerClineTokens,
} from '../lib/oauth/cline/index.js'
import { CLINE_IMPORT_EMPTY, clineSessionFromProvidersFile, importClineAuth } from '../lib/oauth/cline/import.js'
import { applyClineCache, clineCacheHeaders, clineCacheSessionId, resetClinePins } from '../lib/oauth/cline/cache.js'
import { applyClineMaxCompletionTokens, applyClineStreamUsage, applyClineThinking, mapClineUsage, unwrapClineEnvelope } from '../lib/oauth/cline/request.js'
import { CLINE_CATALOG_TTL_MS, clineCatalogModels, refreshClineCatalog, resetClineCatalogCache, toClinePickerModels } from '../lib/oauth/cline/catalog.js'
import { clineCapUsd, clineCreditUsd, fetchClineQuota, parseClineBalance, parseClinePlan, parseClinePlanLimits, parseClineUsage } from '../lib/oauth/cline/quota.js'
import { DeviceFlowManager } from '../lib/oauth/grok/device-flow.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { createProxy } from '../lib/oauth/proxy.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('device login posts client_id to WorkOS and registers with Cline', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), body: String(init.body ?? "") })
    if (String(url) === CLINE_WORKOS_DEVICE_URL) {
      return json({
        device_code: 'dev-code',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://api.workos.com/device',
        verification_uri_complete: 'https://api.workos.com/device?user_code=WDJB-MJHT',
        interval: 0.01,
        expires_in: 30,
      })
    }
    if (String(url) === CLINE_WORKOS_AUTHENTICATE_URL) {
      return json({ access_token: 'workos-access-raw', refresh_token: 'workos-refresh', token_type: 'Bearer', expires_in: 3600 })
    }
    if (String(url) === CLINE_REGISTER_URL) {
      return json({
        success: true,
        data: {
          accessToken: 'workos-access-raw',
          refreshToken: 'workos-refresh',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          userInfo: { subject: 'user_1', email: 'ada@example.com', name: 'Ada', clineUserId: 'usr-01ABC', accounts: null },
        },
      })
    }
    return json({}, 404)
  }
  const devices = new DeviceFlowManager()
  const attempt = await devices.start('cline', clineDeviceSpec({ fetchFn }))
  assert.equal(attempt.userCode, 'WDJB-MJHT')
  assert.equal(attempt.verificationUrl, 'https://api.workos.com/device?user_code=WDJB-MJHT')
  const tokens = await attempt.waitToken()
  const session = await registerClineTokens(tokens, { fetchFn })
  const deviceCall = calls.find((row) => row.url === CLINE_WORKOS_DEVICE_URL)
  assert.equal(deviceCall.body, `client_id=${CLINE_WORKOS_CLIENT_ID}`)
  const pollCall = calls.find((row) => row.url === CLINE_WORKOS_AUTHENTICATE_URL)
  assert.match(pollCall.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code/)
  const registerCall = calls.find((row) => row.url === CLINE_REGISTER_URL)
  assert.deepEqual(JSON.parse(registerCall.body), { accessToken: 'workos-access-raw', refreshToken: 'workos-refresh' })
  assert.equal(session.accessToken, 'workos:workos-access-raw')
  assert.equal(session.account, 'ada@example.com')
  assert.equal(session.userId, 'usr-01ABC')
  assert.equal(session.source, 'oauth')
})

test('access token carries the workos: prefix exactly once', () => {
  assert.equal(formatClineAccessToken('jwt'), 'workos:jwt')
  assert.equal(formatClineAccessToken('workos:jwt'), 'workos:jwt')
  assert.equal(normalizeClineAccessToken('workos:jwt'), 'jwt')
  assert.equal(normalizeClineAccessToken('jwt'), 'jwt')
  assert.equal(CLINE_ACCESS_TOKEN_PREFIX, 'workos:')
})

test('session round-trip keeps the prefix, never leaks the token, refreshes with grantType', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cline-store-'))
  const authPath = join(dir, 'auth.json')
  const session = clineSessionFromAuthData({
    accessToken: 'jwt-a',
    refreshToken: 'ref-a',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userInfo: { subject: 'user_1', email: 'ada@example.com', name: 'Ada', clineUserId: 'usr-01ABC', accounts: null },
  }, {})
  await saveSession('cline', session, authPath)
  const rows = await listStoredSessions('cline', authPath)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'ada@example.com')
  const pub = publicSession('cline', session)
  assert.equal(pub.account, 'ada@example.com')
  assert.equal(pub.methodLabel, 'OAuth')
  assert.equal(JSON.stringify(pub).includes('jwt-a'), false)
  assert.equal(accountIdOf('cline', session), 'ada@example.com')

  const refreshCalls = []
  const refreshed = await refreshCline(session, async (url, init) => {
    refreshCalls.push({ url: String(url), body: JSON.parse(String(init.body)) })
    return json({
      success: true,
      data: {
        accessToken: 'jwt-b',
        refreshToken: 'ref-b',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 7200_000).toISOString(),
        userInfo: { subject: 'user_1', email: 'ada@example.com', name: 'Ada', clineUserId: 'usr-01ABC', accounts: null },
      },
    })
  })
  assert.equal(refreshCalls[0].url, CLINE_REFRESH_URL)
  assert.deepEqual(refreshCalls[0].body, { refreshToken: 'ref-a', grantType: 'refresh_token' })
  assert.equal(refreshed.accessToken, 'workos:jwt-b')
  assert.equal(refreshed.refreshToken, 'ref-b')
})

test('refresh rejection is permanent: HTTP 401 and success:false', async () => {
  const session = clineSessionFromAuthData({
    accessToken: 'jwt-a',
    refreshToken: 'ref-a',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userInfo: { email: 'ada@example.com', clineUserId: 'usr-01ABC' },
  }, {})
  const unauthorized = await refreshCline(session, async () => json({ error: 'Unauthorized' }, 401)).catch((error) => error)
  assert.equal(isClinePermanentRefreshError(unauthorized), true)
  const rejected = await refreshCline(session, async () => json({ success: false, error: 'invalid refresh token' })).catch((error) => error)
  assert.equal(isClinePermanentRefreshError(rejected), true)
  const transient = await refreshCline(session, async () => json({ error: 'boom' }, 500)).catch((error) => error)
  assert.equal(isClinePermanentRefreshError(transient), false)
})

test('catalog is Completions at /cline with declared effort keys only', () => {
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { cline: true },
    clineModels: CLINE_MODELS,
  })
  const route = providers['oauth-cline']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/cline')
  assert.equal(route.compat.supportsReasoningEffort, true)
  assert.equal(route.compat.thinkingFormat, 'openai')
  assert.equal(route.models.length, CLINE_MODELS.length)
  for (const model of route.models) {
    assert.ok(model.contextWindow > 0)
    assert.ok(model.maxTokens > 0)
    assert.ok(model.name)
    for (const key of Object.keys(model.reasoningEfforts ?? {})) {
      assert.ok(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(key))
    }
    assert.equal(model.input.every((part) => part === 'text' || part === 'image'), true)
  }
  assert.equal(familyOfProvider('oauth-cline'), 'cline')
  assert.ok(ownedProviderIds('oauth').includes('oauth-cline'))
  assert.equal(catalogProviders({ prefix: 'oauth', origin: 'http://x', clineModels: CLINE_MODELS })['oauth-cline'].models.length, CLINE_MODELS.length)
  assert.equal(CLINE_REASONING.off, undefined)
  assert.equal(CLINE_REASONING.max, 'xhigh')
})

test('live catalog merges the recommended + free buckets and falls back to the seed', async () => {
  resetClineCatalogCache()
  const feed = {
    recommended: [{ id: 'anthropic/claude-opus-5', name: 'claude-opus-5' }, { id: 'new/lab-model', name: 'lab-model' }],
    free: [{ id: 'cline-free/deepseek-v4.1-flash', name: 'Deepseek-v4.1-Flash' }],
    clinePass: [{ id: 'cline-pass/glm-5.3', name: 'cline-pass/glm-5.3' }],
  }
  const merged = toClinePickerModels(feed)
  assert.deepEqual(merged.map((model) => model.id), ['anthropic/claude-opus-5', 'new/lab-model', 'cline-free/deepseek-v4.1-flash'])
  assert.equal(merged[0].contextWindow, 1_000_000)
  assert.equal(merged[1].contextWindow, 128_000)
  assert.equal(merged[1].maxTokens, 8_192)
  assert.equal(merged[2].name, 'DeepSeek V4.1 Flash (free)')
  const live = await refreshClineCatalog(null, { fetchFn: async () => json(feed) })
  assert.equal(live.length, 3)
  assert.equal(clineCatalogModels().length, 3)
  resetClineCatalogCache()
  assert.equal(clineCatalogModels().length, CLINE_MODELS.length)
  assert.equal(CLINE_CATALOG_TTL_MS > 0, true)
})

test('cache strips Codex/Grok fields and pins X-Task-ID, never Date.now', () => {
  resetClinePins()
  const { payload, cacheSessionId } = applyClineCache({
    model: 'anthropic/claude-opus-5',
    messages: [{ role: 'system', content: 'sys v1' }, { role: 'user', content: 'hi' }],
    session_id: 'dsh/session 1',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    prompt_cache_options: { mode: 'explicit' },
  })
  assert.equal(cacheSessionId, 'dsh-session-1')
  assert.equal(payload.session_id, undefined)
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.prompt_cache_options, undefined)
  assert.deepEqual(clineCacheHeaders(cacheSessionId), { 'X-Task-ID': 'dsh-session-1' })
  assert.deepEqual(clineCacheHeaders(undefined), { 'X-Task-ID': 'dsh-cline' })
  assert.equal(clineCacheSessionId(undefined), undefined)
  const headers = clineUpstreamHeaders({ accessToken: 'workos:jwt' }, 'dsh-session-1')
  assert.equal(headers.authorization, 'Bearer workos:jwt')
  assert.equal(headers['X-Task-ID'], 'dsh-session-1')
  assert.equal(headers['X-CLIENT-TYPE'], CLINE_CLIENT_TYPE)
  assert.equal(headers['X-CORE-VERSION'], CLINE_CORE_VERSION)
  assert.equal(headers['user-agent'], CLINE_USER_AGENT)
  assert.equal(Object.hasOwn(headers, 'session-id'), false)
  assert.equal(Object.hasOwn(headers, 'x-grok-conv-id'), false)
  assert.equal(Object.hasOwn(headers, 'prompt_cache_key'), false)
  assert.equal(Object.hasOwn(headers, 'x-initiator'), false)
})

test('system snapshots park at the suffix so the first system blob keeps hitting', () => {
  resetClinePins()
  const first = applyClineCache({ session_id: 's1', messages: [{ role: 'system', content: 'base' }, { role: 'user', content: 'a' }] })
  const second = applyClineCache({ session_id: 's1', messages: [{ role: 'system', content: 'base\nmore' }, { role: 'user', content: 'a' }] })
  assert.deepEqual(first.payload.messages.map((m) => m.role), ['system', 'user'])
  assert.deepEqual(second.payload.messages, [
    { role: 'system', content: 'base' },
    { role: 'user', content: 'a' },
    { role: 'system', content: 'more' },
  ])
})

test('an incompatible system head re-pins instead of serving the stale prompt', () => {
  resetClinePins()
  // DSH sends no session_id, so the pin key is the family constant — a model
  // switch or a new session must not inherit the previous system head.
  const first = applyClineCache({ messages: [{ role: 'system', content: 'model A prompt' }, { role: 'user', content: 'a' }] })
  const second = applyClineCache({ messages: [{ role: 'system', content: 'model B prompt' }, { role: 'user', content: 'a' }] })
  assert.deepEqual(second.payload.messages, [
    { role: 'system', content: 'model B prompt' },
    { role: 'user', content: 'a' },
  ])
  const third = applyClineCache({ messages: [{ role: 'system', content: 'model B prompt\nmore' }, { role: 'user', content: 'a' }] })
  assert.deepEqual(third.payload.messages, [
    { role: 'system', content: 'model B prompt' },
    { role: 'user', content: 'a' },
    { role: 'system', content: 'more' },
  ])
})

test('completions hop renames max_tokens for reasoning-era ids, asks for usage, maps cache reads', () => {
  assert.deepEqual(
    applyClineMaxCompletionTokens({ model: 'openai/gpt-5.4', max_tokens: 100 }),
    { model: 'openai/gpt-5.4', max_completion_tokens: 100 },
  )
  assert.deepEqual(applyClineMaxCompletionTokens({ model: 'spacexai/grok-4.7', max_tokens: 100 }), { model: 'spacexai/grok-4.7', max_tokens: 100 })
  assert.deepEqual(applyClineStreamUsage({ stream: true }), { stream: true, stream_options: { include_usage: true } })
  assert.deepEqual(applyClineStreamUsage({ stream: false }), { stream: false })
  assert.deepEqual(
    applyClineThinking({ model: 'anthropic/claude-opus-5', reasoning_effort: 'high' }),
    { model: 'anthropic/claude-opus-5', reasoning_effort: 'high' },
  )
  assert.deepEqual(applyClineThinking({ model: 'anthropic/claude-opus-5', reasoning_effort: 'max' }), { model: 'anthropic/claude-opus-5', reasoning_effort: 'xhigh' })
  assert.deepEqual(applyClineThinking({ model: 'unknown/model', reasoning_effort: 'high' }), { model: 'unknown/model' })
  const mapped = mapClineUsage({ prompt_tokens: 10, cache_read_input_tokens: 4 })
  assert.equal(mapped.prompt_tokens_details.cached_tokens, 4)
})

test('non-streaming completions are unwrapped out of the success/data envelope', async () => {
  assert.deepEqual(
    unwrapClineEnvelope({ success: true, data: { choices: [{ index: 0 }] } }),
    { choices: [{ index: 0 }] },
  )
  assert.deepEqual(unwrapClineEnvelope({ success: false, error: 'nope' }), { success: false, error: 'nope' })
  assert.deepEqual(unwrapClineEnvelope({ choices: [] }), { choices: [] })
  const dir = await mkdtemp(join(tmpdir(), 'cline-envelope-'))
  const authPath = join(dir, 'auth.json')
  const session = clineSessionFromAuthData({
    accessToken: 'jwt-a',
    refreshToken: 'ref-a',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userInfo: { email: 'one@example.com', clineUserId: 'usr-01ONE' },
  }, {})
  await saveSession('cline', session, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    clineAutoImport: false,
    fetchFn: async () => json({
      success: true,
      data: { id: 'gen-1', model: 'openai/gpt-6-astra', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 3, cache_read_tokens: 2 } },
    }),
  })
  const proxy = createProxy({ port: 0, apiKey: 'proxy-key-envelope-test', tokens: controller.tokens, fetchFn: async () => json({
    success: true,
    data: { id: 'gen-1', model: 'openai/gpt-6-astra', choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }], usage: { prompt_tokens: 3, cache_read_tokens: 2 } },
  }) })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/cline/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-envelope-test', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-6-astra', messages: [{ role: 'user', content: 'hi' }], stream: false }),
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.success, undefined)
    assert.equal(body.choices[0].message.content, 'ok')
    assert.equal(body.usage.prompt_tokens_details.cached_tokens, 2)
  } finally {
    await proxy.close()
  }
})

test('quota reads the credit balance in USD plus the plan, and never invents a percent', async () => {
  const balance = parseClineBalance({ success: true, data: { userId: 'usr-01ABC', balance: 5_000_000 } })
  assert.equal(balance.usd, 5)
  assert.equal(clineCreditUsd(500000), 0.5)
  assert.equal(clineCreditUsd('2500000'), 2.5)
  assert.equal(parseClineBalance({ success: false, error: 'nope' }), undefined)
  assert.equal(parseClinePlan({ success: true, data: { plan: { displayName: 'ClinePass' }, currentPeriodEnd: '2026-10-01T00:00:00Z' } }).planType, 'ClinePass')
  assert.equal(parseClinePlan({ success: false, error: 'no plan history found for user' }), undefined)
  assert.equal(formatPlanLabel('usage-billing', 'cline'), 'Usage-Billing')
  assert.equal(formatPlanLabel('clinepass', 'cline'), 'ClinePass')
  const parsed = parseClineUsage(
    { success: true, data: { id: 'usr-01ABC', email: 'ada@example.com', displayName: 'Ada', organizations: [] } },
    { usd: 5, userId: 'usr-01ABC' },
    undefined,
  )
  assert.equal(parsed.account, 'ada@example.com')
  assert.equal(parsed.planType, 'usage-billing')
  assert.deepEqual(parsed.rows, [{ key: 'credits', kind: 'prepaid', remaining: 5, unit: 'usd' }])
  assert.equal(parsed.rows[0].remainingPercent, undefined)
  const fetched = await fetchClineQuota(
    { accessToken: 'workos:jwt-a' },
    async (url) => {
      const href = String(url)
      if (href.endsWith('/users/me')) return json({ success: true, data: { id: 'usr-01ABC', email: 'ada@example.com', organizations: [] } })
      if (href.endsWith('/usr-01ABC/balance')) return json({ success: true, data: { userId: 'usr-01ABC', balance: 1_500_000 } })
      if (href.endsWith('/users/me/plan')) return json({ success: false, error: 'no plan history found for user' }, 404)
      return json({}, 404)
    },
  )
  assert.equal(fetched.rows[0].remaining, 1.5)
  assert.equal(fetched.planType, 'usage-billing')
})

test('ClinePass plan caps come from entitlements in 1e-8 USD units', () => {
  // Live /plans catalog shape; 1e9 / 1e8 = $10.
  const plan = parseClinePlan({
    success: true,
    data: {
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      plan: {
        displayName: 'Cline Pass (Annual)',
        isActive: true,
        entitlements: {
          cline_pass: {
            enabled: true,
            inferenceCapThreshold: {
              last5HoursUsageCostUSDPerUser: 1_000_000_000,
              last7daysUsageCostUSDPerUser: 2_500_000_000,
              last30daysUsageCostUSDPerUser: 5_000_000_000,
            },
          },
        },
      },
    },
  })
  assert.equal(plan.planType, 'Cline Pass (Annual)')
  assert.deepEqual(plan.caps, { five_hour: 10, weekly: 25, monthly: 50 })
  assert.equal(clineCapUsd(1_000_000_000), 10)
  assert.equal(clineCapUsd(0), undefined)
  assert.equal(clineCapUsd('nope'), undefined)
  assert.equal(CLINE_COST_SCALE, 100_000_000)
  // No entitlements (credit account) ⇒ no caps, and planType still resolves.
  const credit = parseClinePlan({ success: true, data: { plan: { displayName: 'Cline Pass' } } })
  assert.equal(credit.caps, undefined)
})

test('plan usage-limits map onto the DSH 5h / weekly / monthly rows', () => {
  const limits = parseClinePlanLimits({
    success: true,
    data: {
      limits: [
        { type: 'five_hour', percentUsed: 4.25, resetsAt: '2026-09-19T15:00:00Z' },
        { type: 'weekly', percentUsed: 1, resetsAt: '2026-09-26T00:00:00Z' },
        { type: 'monthly', percentUsed: 140, resetsAt: 'not-a-date' },
        { type: 'daily', percentUsed: 5 },
        { type: 'five_hour', percentUsed: 'nope' },
      ],
    },
  })
  assert.deepEqual(limits.map((row) => row.type), ['five_hour', 'weekly', 'monthly'])
  assert.equal(limits[0].usedPercent, 4.3)
  assert.equal(limits[0].resetAt, Date.parse('2026-09-19T15:00:00Z'))
  assert.equal(limits[2].usedPercent, 100)
  assert.equal(limits[2].resetAt, undefined)
  assert.deepEqual(parseClinePlanLimits({ success: false, error: 'no plan history found for user' }), [])
})

test('subscriber quota draws three remaining bars with real caps; credit account draws none', async () => {
  const plan = parseClinePlan({
    success: true,
    data: {
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      plan: {
        displayName: 'Cline Pass (Annual)',
        entitlements: { cline_pass: { inferenceCapThreshold: { last5HoursUsageCostUSDPerUser: 1_000_000_000 } } },
      },
    },
  })
  const limits = parseClinePlanLimits({
    success: true,
    data: { limits: [{ type: 'five_hour', percentUsed: 25, resetsAt: '2026-09-19T15:00:00Z' }] },
  })
  const parsed = parseClineUsage(
    { success: true, data: { id: 'usr-01ABC', email: 'pass@example.com', organizations: [] } },
    { usd: 0, userId: 'usr-01ABC' },
    plan,
    limits,
  )
  assert.equal(parsed.rows.length, 1)
  assert.deepEqual(parsed.rows[0], {
    key: 'five_hour',
    kind: 'primary',
    windowMinutes: 300,
    usedPercent: 25,
    remainingPercent: 75,
    resetAt: Date.parse('2026-09-19T15:00:00Z'),
    used: 2.5,
    total: 10,
    unit: 'usd',
  })

  // Endpoint-level: the same rows over the wire, and no cap ⇒ no invented total.
  const calls = []
  const subscriber = await fetchClineQuota({ accessToken: 'workos:jwt' }, async (url) => {
    const href = String(url)
    calls.push(href)
    if (href.endsWith('/users/me')) return json({ success: true, data: { id: 'usr-01ABC', email: 'pass@example.com' } })
    if (href.endsWith('/balance')) return json({ success: true, data: { userId: 'usr-01ABC', balance: 0 } })
    if (href === CLINE_PLAN_LIMITS_URL) {
      return json({ success: true, data: { limits: [{ type: 'weekly', percentUsed: 40, resetsAt: '2026-09-26T00:00:00Z' }] } })
    }
    if (href.endsWith('/users/me/plan')) return json({ success: true, data: { plan: { displayName: 'Cline Pass' } } })
    return json({}, 404)
  })
  assert.equal(calls.includes(CLINE_PLAN_LIMITS_URL), true)
  assert.equal(subscriber.rows.length, 1)
  assert.equal(subscriber.rows[0].remainingPercent, 60)
  assert.equal(subscriber.rows[0].used, undefined)
  assert.equal(subscriber.rows[0].total, undefined)
  assert.equal(subscriber.planType, 'Cline Pass')

  // Credit account: both plan reads 404 ⇒ balance row only, no bars.
  const credit = await fetchClineQuota({ accessToken: 'workos:jwt' }, async (url) => {
    const href = String(url)
    if (href.endsWith('/users/me')) return json({ success: true, data: { id: 'usr-01ABC', email: 'credit@example.com' } })
    if (href.endsWith('/balance')) return json({ success: true, data: { userId: 'usr-01ABC', balance: 340_000 } })
    return json({ data: null, error: 'no plan history found for user', success: false }, 404)
  })
  assert.deepEqual(credit.rows, [{ key: 'credits', kind: 'prepaid', remaining: 0.34, unit: 'usd' }])
  assert.equal(credit.planType, 'usage-billing')
})

test('import reads ~/.cline providers.json without a token fragment as the id', async () => {
  const home = await mkdtemp(join(tmpdir(), 'cline-import-'))
  const settingsDir = join(home, '.cline', 'data', 'settings')
  await mkdir(settingsDir, { recursive: true })
  await writeFile(join(settingsDir, 'providers.json'), JSON.stringify({
    version: 1,
    lastUsedProvider: 'cline',
    providers: {
      cline: {
        settings: {
          provider: 'cline',
          auth: {
            accessToken: 'workos:cli-jwt',
            refreshToken: 'cli-refresh',
            expiresAt: Date.now() + 3600_000,
            accountId: 'usr-01CLI',
            metadata: { tokenType: 'Bearer', provider: 'cline', userInfo: { email: 'cli@example.com', clineUserId: 'usr-01CLI' } },
          },
        },
        tokenSource: 'oauth',
      },
    },
  }))
  const session = await importClineAuth({ home, env: {} })
  assert.equal(session.source, 'cli')
  assert.equal(session.session.accessToken, 'workos:cli-jwt')
  assert.equal(session.session.account, 'cli@example.com')
  assert.equal(accountIdOf('cline', session.session), 'cli@example.com')
  assert.equal(clineSessionFromProvidersFile({ providers: { cline: { settings: { auth: {} } } } }), undefined)
  const missing = await importClineAuth({ home: join(home, 'nope'), env: {} }).catch((error) => error)
  assert.equal(missing.message, CLINE_IMPORT_EMPTY)
  assert.equal(clineDefaultAccount('workos:not-a-jwt'), 'cline-account')
})

test('sync writes the live cline catalog, not the offline seed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cline-sync-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('cline', clineSessionFromAuthData({
    accessToken: 'jwt-a',
    refreshToken: 'ref-a',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userInfo: { email: 'one@example.com', clineUserId: 'usr-01ONE' },
  }, {}), authPath)
  const providers = {}
  const operations = []
  const settings = {
    get: (name) => (name === 'llm-pi-ai' ? { providers: structuredClone(providers) } : undefined),
    mutate: async (target, mutations) => {
      assert.equal(target, 'llm-pi-ai')
      operations.push(...mutations)
      for (const row of mutations) {
        const key = row.path?.[1]
        if (row.op === 'unset') delete providers[key]
        else if (row.op === 'set') {
          // The same gate the host runs before its atomic mutate.
          assertDshServiceableProvider(key, row.value)
          providers[key] = structuredClone(row.value)
        }
      }
    },
  }
  const liveFeed = {
    recommended: [{ id: 'openai/gpt-6-astra', name: 'gpt-6-astra' }, { id: 'new/lab-model', name: 'lab-model' }],
    free: [{ id: 'cline-free/deepseek-v4.1-flash', name: 'Deepseek-v4.1-Flash' }],
  }
  resetClineCatalogCache()
  await refreshClineCatalog(null, { fetchFn: async () => json(liveFeed) })
  const live = clineCatalogModels()
  assert.equal(live.length, 3)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings,
    clineAutoImport: false,
    fetchFn: async () => json({}, 404),
  })
  await controller.sync()
  resetClineCatalogCache()
  const route = providers['oauth-cline']
  assert.ok(route, 'oauth-cline route must be written')
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/cline')
  assert.deepEqual(route.models.map((model) => model.id), live.map((model) => model.id))
  assert.equal(operations.some((row) => row.op === 'set' && row.path?.[1] === 'oauth-cline'), true)
})

test('controller snapshot shows quota on every cline account; hop is Completions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cline-ctrl-'))
  const authPath = join(dir, 'auth.json')
  const first = clineSessionFromAuthData({
    accessToken: 'jwt-a',
    refreshToken: 'ref-a',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userInfo: { email: 'one@example.com', name: 'One', clineUserId: 'usr-01ONE', subject: 'user_1' },
  }, {})
  const second = clineSessionFromAuthData({
    accessToken: 'jwt-b',
    refreshToken: 'ref-b',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userInfo: { email: 'two@example.com', name: 'Two', clineUserId: 'usr-01TWO', subject: 'user_2' },
  }, { source: 'cli' })
  await saveSession('cline', first, authPath)
  await saveSession('cline', second, authPath, { activate: false })
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    clineAutoImport: false,
    clineDiscover: async () => CLINE_MODELS,
    fetchFn: async (url) => {
      const href = String(url)
      if (href.endsWith('/users/me')) return json({ success: true, data: { id: 'usr-01ONE', email: 'one@example.com', organizations: [] } })
      if (href.includes('/balance')) return json({ success: true, data: { userId: 'usr-01ONE', balance: 2_000_000 } })
      if (href.endsWith('/users/me/plan')) return json({ success: false, error: 'no plan history found for user' }, 404)
      return json({}, 404)
    },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.cline.accounts.length, 2)
  assert.equal(snap.accounts.cline.loggedIn, true)
  for (const row of snap.accounts.cline.accounts) {
    assert.ok(row.quota)
    assert.equal(JSON.stringify(row).includes("jwt-"), false)
    assert.equal(JSON.stringify(row).includes("ref-"), false)
  }
  assert.equal(snap.catalog.some((row) => row.family === 'cline'), true)

  const hops = []
  const proxy = createProxy({
    port: 0,
    apiKey: 'proxy-key-cline-test-xx',
    tokens: controller.tokens,
    fetchFn: async (url, init) => {
      hops.push({ url: String(url), body: init.body, headers: init.headers })
      return json({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'ok' } }] })
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const listed = await fetch(`http://127.0.0.1:${port}/cline/v1/models`, { headers: { authorization: 'Bearer proxy-key-cline-test-xx' } })
    assert.equal(listed.status, 200)
    const list = await listed.json()
    assert.equal(list.data.length, CLINE_MODELS.length)
    const response = await fetch(`http://127.0.0.1:${port}/cline/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-cline-test-xx', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'anthropic/claude-opus-5',
        messages: [{ role: 'user', content: 'hi' }],
        session_id: 'dsh-session-9',
        prompt_cache_key: 'codex-style',
        reasoning_effort: 'high',
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(hops[0].url, CLINE_CHAT_URL)
    const sent = JSON.parse(hops[0].body)
    assert.equal(sent.prompt_cache_key, undefined)
    assert.equal(sent.session_id, undefined)
    assert.equal(sent.reasoning_effort, 'high')
    assert.equal(hops[0].headers.authorization, 'Bearer workos:jwt-a')
    assert.equal(hops[0].headers['X-Task-ID'], 'dsh-session-9')
    assert.equal(Object.hasOwn(hops[0].headers, 'session-id'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'x-grok-conv-id'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'x-initiator'), false)
    assert.equal(CLINE_CHAT_URL, `${CLINE_API_BASE}/chat/completions`)
    const responses = await fetch(`http://127.0.0.1:${port}/cline/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-cline-test-xx', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'anthropic/claude-opus-5', input: [] }),
    })
    assert.equal(responses.status, 501)
  } finally {
    await proxy.close()
  }
})
