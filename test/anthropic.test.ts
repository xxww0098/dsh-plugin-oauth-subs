import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createProxy, hasOutputEvent } from '../lib/oauth/proxy.js'
import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_MODELS, ANTHROPIC_BETA, ANTHROPIC_USER_AGENT, anthropicSession, anthropicUpstreamHeaders, exchangeAnthropicCode, isAnthropicPermanentRefreshError } from '../lib/oauth/anthropic/index.js'
import { OAuthEndpointError } from '../lib/oauth/codex/index.js'
import { applyAnthropicCache, anthropicConversationId, ANTHROPIC_STABLE_SESSION } from '../lib/oauth/anthropic/cache.js'
import { normalizeAnthropicMessagesBody } from '../lib/oauth/anthropic/request.js'
import { fetchAnthropicQuota, parseAnthropicRateLimitHeaders } from '../lib/oauth/anthropic/quota.js'
import { importAnthropicAuth, ANTHROPIC_IMPORT_EMPTY } from '../lib/oauth/anthropic/import.js'
import { accountIdOf, listAccounts, publicSession, saveSession } from '../lib/oauth/store.js'
import { FAMILY_IDS, familyOfProvider, buildProviders } from '../lib/oauth/models.js'

const TOKENS = {
  access_token: 'sk-ant-oat01-example',
  refresh_token: 'ref-abcdefgh',
  expires_in: 3600,
}

test('anthropicSession builds the store shape and refresh hydrates identity', () => {
  const session = anthropicSession(TOKENS)
  assert.equal(session.accessToken, 'sk-ant-oat01-example')
  assert.equal(session.refreshToken, 'ref-abcdefgh')
  assert.ok(session.expiresAt > Date.now())
  assert.throws(() => anthropicSession({ access_token: '', refresh_token: 'r', expires_in: 1 }))

  // Refresh responses carry no profile: hydrated identity rides the fallback.
  const refreshed = anthropicSession({
    access_token: 'sk-ant-oat01-next',
    refresh_token: TOKENS.refresh_token,
    expires_in: 3600,
  }, { ...session, account: 'user@example.test', accountId: 'acc-uuid-1' })
  assert.equal(refreshed.accessToken, 'sk-ant-oat01-next')
  assert.equal(refreshed.account, 'user@example.test')
  assert.equal(refreshed.accountId, 'acc-uuid-1', 'a refresh without a profile must keep the hydrated identity')
})

test('exchange posts state + verifier to the platform token endpoint', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) })
    return Response.json(TOKENS)
  }
  const session = await exchangeAnthropicCode('abc', 'verifier', 'http://localhost:53692/callback', 'state-1', fetchFn)
  assert.equal(seen[0].url, 'https://platform.claude.com/v1/oauth/token')
  assert.equal(seen[0].body.grant_type, 'authorization_code')
  assert.equal(seen[0].body.state, 'state-1')
  assert.equal(seen[0].body.code_verifier, 'verifier')
  assert.equal(session.accessToken, 'sk-ant-oat01-example')
})

test('store round-trip: profile uuid is the id, the email is the label, secrets stay private', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'anthropic-store-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const authPath = join(dir, 'auth.json')
  const session = { ...anthropicSession(TOKENS), accountId: 'acc-uuid-1', account: 'user@example.test' }
  assert.equal(accountIdOf('anthropic', session), 'acc-uuid-1')
  assert.equal(accountIdOf('anthropic', anthropicSession(TOKENS)), 'anthropic-abcdefgh', 'without a profile the refresh suffix ids the account')
  await saveSession('anthropic', session, authPath)
  const rows = await listAccounts('anthropic', authPath)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].account, 'user@example.test')
  const pub = publicSession('anthropic', session)
  assert.equal(JSON.stringify(pub).includes('sk-ant-oat01'), false, 'access token never leaves the vault')
  assert.equal(JSON.stringify(pub).includes('acc-uuid-1'), false, 'opaque account id never leaves the vault')
  assert.equal(JSON.stringify(pub).includes('ref-1'), false)
})

test('upstream headers carry the claude-code oauth identity', () => {
  const headers = anthropicUpstreamHeaders({ accessToken: 'sk-ant-oat01-example' })
  assert.equal(headers.authorization, 'Bearer sk-ant-oat01-example')
  assert.equal(headers['anthropic-beta'], ANTHROPIC_BETA)
  assert.equal(headers['anthropic-beta'], 'claude-code-20250219,oauth-2025-04-20')
  assert.equal(headers['user-agent'], ANTHROPIC_USER_AGENT)
  assert.equal(headers['x-app'], 'cli')
  assert.equal(headers['anthropic-version'], '2023-06-01')
})

test('cache: DSH fields are stripped, the conversation id never reaches upstream', () => {
  const { payload, cacheSessionId } = applyAnthropicCache({
    model: 'claude-opus-5-5',
    max_tokens: 128,
    stream: true,
    session_id: 'dsh-session-1',
    prompt_cache_key: 'dsh-session-1',
    prompt_cache_retention: 'long',
    metadata: { user_id: 'conv-9' },
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(payload.session_id, undefined)
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.metadata.user_id, 'conv-9', 'anthropic metadata.user_id is a real field and stays')
  assert.equal(cacheSessionId, 'conv-9')
  assert.equal(anthropicConversationId({}), ANTHROPIC_STABLE_SESSION)
  const { payload: fallbackBody } = applyAnthropicCache({ session_id: 'dsh-session-1', messages: [] })
  assert.ok(!JSON.stringify(fallbackBody).includes('dsh-session-1'), 'the stripped DSH id is never stamped into the body')
})

test('request: max_tokens is required and codex service tiers are dropped', () => {
  assert.equal(normalizeAnthropicMessagesBody({ model: 'claude-opus-5-5' }).max_tokens, 64_000)
  assert.equal(normalizeAnthropicMessagesBody({ model: 'm', max_tokens: 16 }).max_tokens, 16)
  assert.equal(normalizeAnthropicMessagesBody({ model: 'm', max_tokens: 16, service_tier: 'priority' }).service_tier, undefined)
  assert.equal(normalizeAnthropicMessagesBody({ model: 'm', max_tokens: 16, service_tier: 'auto' }).service_tier, 'auto')
})

test('catalog: subscription rows with the right ladders and windows', () => {
  const ids = ANTHROPIC_MODELS.map((model) => model.id)
  assert.ok(ids.includes('claude-opus-5-5'))
  assert.ok(ids.includes('claude-haiku-4-5'))
  const byId = new Map(ANTHROPIC_MODELS.map((model) => [model.id, model]))
  // Adaptive ladder: Opus 5 / Sonnet 5 / Fable add xhigh (pi-ai thinkingLevelMap).
  assert.equal(byId.get('claude-opus-5-5').reasoningEfforts.xhigh, 'xhigh')
  assert.equal(byId.get('claude-sonnet-5').reasoningEfforts.xhigh, 'xhigh')
  // 4.6 family stops at max.
  assert.equal(byId.get('claude-opus-4-6').reasoningEfforts.xhigh, undefined)
  assert.equal(byId.get('claude-opus-4-6').reasoningEfforts.max, 'max')
  // Classic thinking rows carry no effort ladder.
  assert.equal(byId.get('claude-haiku-4-5').reasoningEfforts, undefined)
  assert.equal(byId.get('claude-opus-4-5').contextWindow, 200_000)
  assert.equal(byId.get('claude-opus-5-5').contextWindow, 1_000_000)
  for (const model of ANTHROPIC_MODELS) {
    assert.deepEqual(model.input, ['text', 'image'])
  }
})

test('models wiring: family suffix and harness route', () => {
  assert.ok(FAMILY_IDS.includes('anthropic'))
  assert.equal(familyOfProvider('oauth-subs-anthropic'), 'anthropic')
  const providers = buildProviders({
    prefix: 'oauth-subs',
    origin: 'http://127.0.0.1:1',
    loggedIn: { anthropic: true },
  })
  const route = providers['oauth-subs-anthropic']
  assert.equal(route.api, 'anthropic-messages')
  assert.equal(route.baseURL, 'http://127.0.0.1:1/anthropic')
  assert.ok(route.models.some((model) => model.id === 'claude-opus-5-5'))
  // 32768 request budget clamp, not the vendor cap.
  assert.equal(route.models.find((model) => model.id === 'claude-opus-5-5').maxTokens, 32_768)
})

test('quota: unified rate-limit headers on 200 and 429', async () => {
  const headers = {
    'anthropic-ratelimit-unified-5h-utilization': '0.29',
    'anthropic-ratelimit-unified-5h-reset': '2026-09-27T05:00:00Z',
    'anthropic-ratelimit-unified-7d-utilization': '0.46',
  }
  const parsed = parseAnthropicRateLimitHeaders(new Headers(headers))
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].kind, 'primary')
  assert.equal(parsed.rows[0].usedPercent, 29)
  assert.equal(parsed.rows[0].remainingPercent, 71)
  assert.equal(parsed.rows[0].resetAt, Date.parse('2026-09-27T05:00:00Z'))
  assert.equal(parsed.rows[1].resetAt, undefined, 'a missing reset header is omitted, not invented')
  assert.deepEqual(parseAnthropicRateLimitHeaders(new Headers()).rows, [])

  let calls = 0
  const fetchFn = async (url, init) => {
    calls += 1
    assert.equal(String(url), ANTHROPIC_MESSAGES_URL)
    const body = JSON.parse(init.body)
    assert.equal(body.max_tokens, 1)
    assert.equal(body.model, 'claude-haiku-4-5')
    assert.equal(init.headers.authorization, 'Bearer sk-ant-oat01-example')
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200, headers })
  }
  const quota = await fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, fetchFn)
  assert.equal(calls, 1)
  assert.equal(quota.rows.length, 2)

  const exhausted = await fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () =>
    new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
      status: 429,
      headers: { 'anthropic-ratelimit-unified-5h-utilization': '1' },
    }))
  assert.equal(exhausted.subscriptionStatus, 'rate_limited')
  assert.equal(exhausted.rows[0].usedPercent, 100)

  await assert.rejects(
    fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () => Response.json({ id: 'msg_2' })),
    /no unified rate-limit headers/,
  )
})

test('proxy: /anthropic/v1/messages forwards with the oauth identity and strips DSH fields', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body.toString()) })
    return new Response('event: message_start\ndata: {"type":"message_start"}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      anthropic: { session: async () => ({ accessToken: 'sk-ant-oat01-live', accountId: 'uuid-1' }) },
      grok: { session: async () => { throw new Error('not logged in') } },
    },
  })
  const server = await proxy.listen()
  try {
    const ok = await fetch(`http://127.0.0.1:${server.address().port}/anthropic/v1/messages`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 128,
        stream: true,
        session_id: 'dsh-session-1',
        prompt_cache_key: 'dsh-session-1',
        metadata: { user_id: 'conv-9' },
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(ok.status, 200)
    const text = await ok.text()
    assert.ok(text.includes('message_start'))
    assert.ok(hasOutputEvent(text))
    assert.equal(seen[0].url, ANTHROPIC_MESSAGES_URL)
    assert.equal(seen[0].headers.authorization, 'Bearer sk-ant-oat01-live')
    assert.equal(seen[0].headers['anthropic-beta'], 'claude-code-20250219,oauth-2025-04-20')
    assert.equal(seen[0].headers['user-agent'], ANTHROPIC_USER_AGENT)
    assert.equal(seen[0].headers['x-app'], 'cli')
    assert.equal(seen[0].body.session_id, undefined)
    assert.equal(seen[0].body.prompt_cache_key, undefined)
    assert.equal(seen[0].body.metadata.user_id, 'conv-9')

    const models = await fetch(`http://127.0.0.1:${server.address().port}/anthropic/v1/models`, {
      headers: { authorization: 'Bearer secret-key' },
    })
    assert.equal(models.status, 200)
    const list = await models.json()
    assert.ok(list.data.some((model) => model.id === 'claude-opus-5-5'))
  } finally {
    await proxy.close()
  }
})

test('proxy: an anthropic 401 refreshes once and retries with the rotated token', async () => {
  const seen = []
  let calls = 0
  const fetchFn = async (url, init) => {
    calls += 1
    seen.push(init.headers)
    if (calls === 1) {
      return Response.json({ error: { message: 'token expired' } }, { status: 401 })
    }
    return Response.json({ id: 'msg_1', role: 'assistant', content: [] })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      anthropic: {
        session: async () => ({ accessToken: 'sk-ant-oat01-stale', accountId: 'uuid-1' }),
        sourceOf: (session) => ({ id: 'acc-1', session }),
        refreshNow: async () => ({ session: { accessToken: 'sk-ant-oat01-fresh', accountId: 'uuid-1' } }),
      },
      grok: { session: async () => { throw new Error('not logged in') } },
    },
  })
  const server = await proxy.listen()
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/anthropic/v1/messages`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 16, messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(response.status, 200)
    assert.equal(calls, 2)
    assert.equal(seen[0].authorization, 'Bearer sk-ant-oat01-stale')
    assert.equal(seen[1].authorization, 'Bearer sk-ant-oat01-fresh')
  } finally {
    await proxy.close()
  }
})

test('permanent refresh errors: invalid_grant is permanent, transient ones are not', () => {
  assert.equal(isAnthropicPermanentRefreshError(new OAuthEndpointError('x', 400, 'invalid_grant')), true)
  assert.equal(isAnthropicPermanentRefreshError(new OAuthEndpointError('x', 429, 'rate_limit_error')), false)
  assert.equal(isAnthropicPermanentRefreshError(new Error('plain')), false)
})

test('import: reads ~/.claude/.credentials.json and reports its own empty marker', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'anthropic-import-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const credentials = join(dir, '.credentials.json')
  await writeFile(credentials, JSON.stringify({
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-imported',
      refreshToken: 'ref-import',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['user:inference'],
    },
  }))
  const result = await importAnthropicAuth([credentials])
  assert.equal(result.session.accessToken, 'sk-ant-oat01-imported')
  assert.equal(result.source, credentials)

  const empty = join(dir, 'empty.json')
  await writeFile(empty, JSON.stringify({}))
  await assert.rejects(importAnthropicAuth([empty]), (error) => error.message === ANTHROPIC_IMPORT_EMPTY)
})
