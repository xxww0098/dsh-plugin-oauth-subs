import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createProxy } from '../lib/oauth/proxy.js'
import { classifySseFrame } from '../lib/oauth/responses-sse.js'
import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_USAGE_URL, ANTHROPIC_MODELS, ANTHROPIC_BETA, ANTHROPIC_USER_AGENT, ANTHROPIC_SCOPE, anthropicFlowFor, anthropicSession, anthropicUpstreamHeaders, exchangeAnthropicCode } from '../lib/oauth/anthropic/index.js'
import { OAuthEndpointError, isPermanentRefreshFailure } from '../lib/oauth/tokens.js'
import { applyAnthropicCache, anthropicConversationId, ANTHROPIC_STABLE_SESSION } from '../lib/oauth/anthropic/cache.js'
import { normalizeAnthropicMessagesBody } from '../lib/oauth/anthropic/request.js'
import { fetchAnthropicQuota, parseAnthropicUsage } from '../lib/oauth/anthropic/quota.js'
import {
  importAnthropicAuth,
  ANTHROPIC_IMPORT_EMPTY,
  ANTHROPIC_IMPORT_LOCKED,
  anthropicKeychainAccount,
  anthropicKeychainService,
  isAnthropicImportedSource,
  rereadAnthropicImport,
  readAnthropicKeychainTokens,
} from '../lib/oauth/anthropic/import.js'
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

test('quota: parses the OAuth usage endpoint scoped Fable meter', () => {
  const parsed = parseAnthropicUsage({
    five_hour: { utilization: 11, resets_at: '2026-09-27T09:39:59.972728+00:00' },
    seven_day: { utilization: 3, resets_at: '2026-10-03T00:59:59.972750+00:00' },
    limits: [
      { kind: 'session', percent: 11, resets_at: '2026-09-27T09:39:59.972728+00:00' },
      { kind: 'weekly_all', percent: 3, resets_at: '2026-10-03T00:59:59.972750+00:00' },
      {
        kind: 'weekly_scoped', group: 'weekly', percent: 0, is_active: false,
        resets_at: '2026-10-03T01:00:00+00:00',
        scope: { model: { id: null, display_name: 'Fable' }, surface: null },
      },
    ],
  })
  assert.equal(parsed.rows.length, 3)
  assert.equal(parsed.rows[0].kind, 'primary')
  assert.equal(parsed.rows[1].kind, 'weekly')
  const fable = parsed.rows[2]
  assert.equal(fable.key, 'anthropic-7d-fable')
  assert.equal(fable.kind, 'weekly_scoped')
  assert.equal(fable.product, 'Fable')
  assert.equal(fable.usedPercent, 0)
  assert.equal(fable.remainingPercent, 100)
  assert.equal(fable.resetAt, Date.parse('2026-10-03T01:00:00+00:00'))

  const fallback = parseAnthropicUsage({ five_hour: { utilization: 25 }, seven_day: { utilization: 50 } })
  assert.deepEqual(fallback.rows.map((row) => row.kind), ['primary', 'weekly'])
  assert.deepEqual(parseAnthropicUsage({ limits: [{ kind: 'weekly_scoped', percent: 20, scope: {} }] }).rows, [])
})

test('quota: legacy seven_day_* fields fill scoped meters not covered by limits[]', () => {
  const parsed = parseAnthropicUsage({
    seven_day: { utilization: 6, resets_at: '2026-10-03T00:59:59Z' },
    seven_day_sonnet: { utilization: 41, resets_at: '2026-10-03T00:59:59Z' },
    seven_day_opus: null,
    seven_day_overage_included: { utilization: 12, resets_at: '2026-10-03T01:00:00Z' },
  })
  assert.deepEqual(parsed.rows.map((row) => row.key), ['anthropic-7d', 'anthropic-7d-sonnet', 'anthropic-7d-fable'])
  const fable = parsed.rows[2]
  assert.equal(fable.kind, 'weekly_scoped')
  assert.equal(fable.product, 'Fable')
  assert.equal(fable.usedPercent, 12)
  assert.equal(fable.remainingPercent, 88)

  // limits[] wins over the same-named legacy field.
  const deduped = parseAnthropicUsage({
    seven_day_overage_included: { utilization: 99 },
    limits: [{ kind: 'weekly_scoped', percent: 2, scope: { model: { display_name: 'Fable' } } }],
  })
  assert.deepEqual(deduped.rows.map((row) => row.product), ['Fable'])
  assert.equal(deduped.rows[0].usedPercent, 2)
})

test('quota: reads every meter from the OAuth usage endpoint alone', async () => {
  const usagePayload = {
    limits: [
      { kind: 'session', percent: 11, resets_at: '2026-09-27T09:39:59Z' },
      { kind: 'weekly_all', percent: 3, resets_at: '2026-10-03T00:59:59Z' },
      { kind: 'weekly_scoped', percent: 0, resets_at: '2026-10-03T01:00:00Z', scope: { model: { display_name: 'Fable' } } },
    ],
  }
  const urls = []
  const fetchFn = async (url, init) => {
    const target = String(url)
    urls.push(target)
    assert.equal(init.headers.authorization, 'Bearer sk-ant-oat01-example')
    assert.equal(target, ANTHROPIC_USAGE_URL)
    return Response.json(usagePayload)
  }
  const quota = await fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, fetchFn)
  assert.deepEqual(urls, [ANTHROPIC_USAGE_URL])
  assert.equal(quota.rows.length, 3)
  assert.equal(quota.rows[0].usedPercent, 11, 'the usage endpoint is the primary source for every meter')
  assert.equal(quota.rows[2].product, 'Fable')

  // A non-200 with no readable meters fails — the caller keeps the previous
  // snapshot, so no in-function rescue is needed.
  await assert.rejects(
    fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () =>
      Response.json({ error: { type: 'rate_limit_error', message: 'Rate limited' } }, { status: 429 })),
    /OAuth usage limits unavailable \(HTTP 429\): Rate limited/,
  )
  await assert.rejects(
    fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () => { throw new Error('socket hangup') }),
    /socket hangup/,
  )

  // A 200 without meters means they are gone — empty rows, not an error.
  const empty = await fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () => Response.json({}))
  assert.deepEqual(empty.rows, [])
  assert.equal(empty.subscriptionStatus, 'active')

  const gone = await fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () =>
    Response.json({ limits: [{ kind: 'weekly_all', percent: 6, resets_at: '2026-10-03T00:59:59Z' }] }))
  assert.deepEqual(gone.rows.map((row) => row.key), ['anthropic-7d'])

  // limits[] and the legacy flat Fable windows describe the same meter — emit it once.
  const deduped = await fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () =>
    Response.json({
      limits: [{ kind: 'weekly_scoped', percent: 2, scope: { model: { display_name: 'Fable' } } }],
      fable_weekly: { utilization: 40 },
    }))
  assert.deepEqual(deduped.rows.map((row) => row.key), ['anthropic-7d-fable'])

  // orca's alternate flat Fable spellings map onto the same row.
  const aliased = await fetchAnthropicQuota({ accessToken: 'sk-ant-oat01-example' }, async () =>
    Response.json({ fable_weekly: { utilization: 40, resets_at: '2026-10-03T01:00:00Z' } }))
  assert.deepEqual(aliased.rows.map((row) => row.key), ['anthropic-7d-fable'])
  assert.equal(aliased.rows[0].usedPercent, 40)
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
    assert.equal(classifySseFrame(text.split('\n\n')[0]), 'output', 'message_start is output, not preamble')
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
  assert.equal(isPermanentRefreshFailure(new OAuthEndpointError('x', 400, 'invalid_grant')), true)
  assert.equal(isPermanentRefreshFailure(new OAuthEndpointError('x', 429, 'rate_limit_error')), false)
  assert.equal(isPermanentRefreshFailure(new Error('plain')), false)
})

test('login: Claude.ai and Console authorize on different hosts', () => {
  const input = {
    redirectUri: 'http://localhost:1455/callback',
    state: 'state-1',
    pkce: { challenge: 'challenge-1' },
  }
  const claudeAi = new URL(anthropicFlowFor('claudeai').buildAuthorizeUrl(input))
  const consoleUrl = new URL(anthropicFlowFor('console').buildAuthorizeUrl(input))
  assert.equal(claudeAi.origin + claudeAi.pathname, 'https://claude.com/cai/oauth/authorize')
  assert.equal(consoleUrl.origin + consoleUrl.pathname, 'https://platform.claude.com/oauth/authorize')
  assert.equal(claudeAi.searchParams.get('code'), 'true')
  assert.equal(claudeAi.searchParams.get('scope'), ANTHROPIC_SCOPE)
  assert.match(ANTHROPIC_SCOPE, /user:plugins/)
  assert.equal(claudeAi.searchParams.get('redirect_uri'), input.redirectUri)
  assert.equal(ANTHROPIC_USER_AGENT, 'claude-cli/2.1.283')
})

test('import: a denied keychain read does not pretend the login is missing and does not write', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'anthropic-keychain-locked-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const calls: any[] = []
  const execFileFn = async (file, args) => {
    calls.push({ file, args })
    const error: any = new Error('User interaction is not allowed.')
    error.stderr = 'User interaction is not allowed.'
    throw error
  }
  await assert.rejects(importAnthropicAuth(undefined, {
    platform: 'darwin',
    env: { USER: 'tester' },
    home: dir,
    execFileFn,
  }), (error) => error.message === ANTHROPIC_IMPORT_LOCKED)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].args[0], 'find-generic-password')
  assert.equal(calls.some((call) => call.args.includes('add-generic-password')), false)
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

test('import reread: reads the same store and never exchanges or writes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'anthropic-reread-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const credentials = join(dir, '.credentials.json')
  const document = JSON.stringify({
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-reread',
      refreshToken: 'ref-reread',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['user:inference'],
      subscriptionType: 'max',
    },
  })
  await writeFile(credentials, document)
  const imported = await importAnthropicAuth([credentials])
  assert.equal(imported.session.source, credentials, 'the session remembers its store')
  assert.equal(isAnthropicImportedSource(credentials), true)
  assert.equal(isAnthropicImportedSource(undefined), false, 'a browser login is plugin-owned')
  const session = await rereadAnthropicImport(credentials)
  assert.equal(session.accessToken, 'sk-ant-oat01-reread')
  assert.equal(session.source, credentials)
  const { readFile } = await import('node:fs/promises')
  assert.equal(await readFile(credentials, 'utf8'), document, 'the store is never written')

  const services: any[] = []
  const keychain = await rereadAnthropicImport('keychain:Claude Code-credentials-abc12345', {
    platform: 'darwin',
    env: { USER: 'tester' },
    execFileFn: async (_file, args) => { services.push(args[args.indexOf('-s') + 1]); return { stdout: document } },
  })
  assert.equal(keychain.accessToken, 'sk-ant-oat01-reread')
  assert.deepEqual(services, ['Claude Code-credentials-abc12345'], 'rereads the exact item it imported')
})

const CLAUDE_KEYCHAIN_JSON = JSON.stringify({
  claudeAiOauth: {
    accessToken: 'sk-ant-oat01-keychain',
    refreshToken: 'ref-keychain',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['user:inference'],
  },
})

test('import: macOS reads the pinned Keychain item first, plaintext file stays the fallback', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'anthropic-keychain-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const calls: any[] = []
  const execFileFn = async (file, args, options) => {
    calls.push({ file, args, options })
    return { stdout: CLAUDE_KEYCHAIN_JSON }
  }
  const result = await importAnthropicAuth(undefined, {
    platform: 'darwin',
    env: { USER: 'tester' },
    home: dir,
    execFileFn,
  })
  assert.equal(result.session.accessToken, 'sk-ant-oat01-keychain')
  assert.equal(result.session.refreshToken, 'ref-keychain')
  assert.equal(result.source, 'keychain:Claude Code-credentials')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].file, 'security')
  assert.deepEqual(calls[0].args, [
    'find-generic-password',
    '-a',
    'tester',
    '-w',
    '-s',
    'Claude Code-credentials',
  ])
  assert.ok(calls[0].options.timeout > 0)
})

test('import: a failed macOS Keychain probe falls back to the plaintext file', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'anthropic-keychain-fallback-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const configDir = join(dir, 'relocated')
  const credentials = join(configDir, '.credentials.json')
  await mkdir(configDir, { recursive: true })
  await writeFile(credentials, JSON.stringify({
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-file',
      refreshToken: 'ref-file',
      expiresAt: Date.now() + 3_600_000,
      scopes: ['user:inference'],
    },
  }))
  let probed = false
  const execFileFn = async () => {
    probed = true
    throw new Error('security: The specified item could not be found in the keychain.')
  }
  const result = await importAnthropicAuth(undefined, {
    platform: 'darwin',
    env: { USER: 'tester', CLAUDE_CONFIG_DIR: configDir },
    home: dir,
    execFileFn,
  })
  assert.equal(probed, true)
  assert.equal(result.session.accessToken, 'sk-ant-oat01-file')
  assert.equal(result.source, credentials)
})

test('import: non-darwin never probes the Keychain and honours CLAUDE_CONFIG_DIR', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'anthropic-config-dir-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const configDir = join(dir, 'claude-config')
  await mkdir(configDir, { recursive: true })
  await writeFile(join(configDir, '.credentials.json'), JSON.stringify({
    claudeAiOauth: {
      accessToken: 'sk-ant-oat01-linux',
      refreshToken: 'ref-linux',
      expiresAt: Date.now() + 3_600_000,
    },
  }))
  let probed = false
  const result = await importAnthropicAuth(undefined, {
    platform: 'linux',
    env: { CLAUDE_CONFIG_DIR: configDir },
    home: dir,
    execFileFn: async () => { probed = true; return { stdout: CLAUDE_KEYCHAIN_JSON } },
  })
  assert.equal(probed, false)
  assert.equal(result.session.accessToken, 'sk-ant-oat01-linux')
  assert.equal(result.source, join(configDir, '.credentials.json'))
})

test('keychain service / account mirror the pinned client RD() and tA()', () => {
  assert.equal(anthropicKeychainService({ env: {} }), 'Claude Code-credentials')
  assert.equal(
    anthropicKeychainService({ env: { CLAUDE_CONFIG_DIR: '/tmp/relocated' } }),
    `Claude Code-credentials-${createHash('sha256').update('/tmp/relocated').digest('hex').slice(0, 8)}`,
  )
  assert.match(
    anthropicKeychainService({ env: { CLAUDE_SECURESTORAGE_CONFIG_DIR: '/tmp/secure' } }),
    /^Claude Code-credentials-[0-9a-f]{8}$/,
  )
  assert.equal(
    anthropicKeychainService({ env: { CLAUDE_SECURESTORAGE_CONFIG_DIR: '' } }),
    'Claude Code-credentials',
  )
  assert.equal(
    anthropicKeychainService({ env: { CLAUDE_CODE_OAUTH_CLIENT_ID: 'custom-client' } }),
    'Claude Code-custom-oauth-credentials',
  )
  assert.equal(anthropicKeychainAccount({ env: { USER: 'tester' } }), 'tester')
  assert.equal(anthropicKeychainAccount({ env: { USER: 'bad user/name' } }), 'claude-code-user')
  // No USER in env falls through to the OS account name (tA()), never empty.
  assert.match(anthropicKeychainAccount({ env: {} }), /^[a-zA-Z0-9._-]+$/)
})

test('readAnthropicKeychainTokens: darwin only, non-JSON payload is not a login', async () => {
  let called = 0
  const execFileFn = async () => { called++; return { stdout: 'not json' } }
  assert.equal(await readAnthropicKeychainTokens({ platform: 'linux', execFileFn }), undefined)
  assert.equal(called, 0)
  assert.equal(await readAnthropicKeychainTokens({ platform: 'darwin', env: { USER: 'tester' }, execFileFn }), undefined)
  assert.equal(called, 1)
})
