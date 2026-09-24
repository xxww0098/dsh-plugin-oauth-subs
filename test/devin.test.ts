import assert from 'node:assert/strict'
import { chmod, mkdtemp, writeFile } from 'node:fs/promises'
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
  DEVIN_API_URL,
  DEVIN_AUTHORIZE_URL,
  DEVIN_CHAT_PATH,
  DEVIN_MODELS,
  DEVIN_MODELS_PATH,
  DEVIN_TOKEN_PATH,
  DEVIN_USER_JWT_PATH,
  DEVIN_USER_STATUS_PATH,
  DEVIN_WEBAPP_URL,
  devinSession,
  devinSourceLabel,
  exchangeDevinCode,
  isDevinOpaqueAccount,
  isDevinPermanentRefreshError,
  isDevinSessionToken,
  normalizeDevinToken,
  pickDevinHumanAccount,
  refreshDevin,
} from '../lib/oauth/devin/index.js'
import { DEVIN_IMPORT_EMPTY, importDevinAuth } from '../lib/oauth/devin/import.js'
import {
  applyDevinCache,
  devinCacheSessionId,
  devinCascadeId,
  devinExecutionId,
  deterministicDevinId,
} from '../lib/oauth/devin/cache.js'
import {
  createDevinOpenaiStream,
  devinBasicAuth,
  devinMetadataBytes,
  devinToOpenai,
  devinWireModelId,
  mapDevinUsage,
  openaiToDevin,
} from '../lib/oauth/devin/request.js'
import {
  decodeFields,
  decodeGetCliModelConfigsResponse,
  decodeGetUserStatusResponse,
  decodeUnaryBody,
  encodeMessage,
  encodeString,
  encodeUint,
  fieldBytes,
  frameConnect,
  splitConnectFrames,
  unframePayload,
} from '../lib/oauth/devin/proto.js'
import {
  devinCatalogModels,
  devinModelById,
  refreshDevinCatalog,
  resetDevinCatalog,
  setDevinCatalogModels,
  toDevinPickerModels,
} from '../lib/oauth/devin/catalog.js'
import { DevinTransportError, runDevinChat } from '../lib/oauth/devin/transport.js'
import { parseDevinUserStatus } from '../lib/oauth/quota.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { createProxy } from '../lib/oauth/proxy.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Hand-built GetUserStatusResponse matching proto.ts decodeGetUserStatusResponse. */
function devinStatusBytes({
  email = 'ada@example.com',
  name = 'Ada',
  teamId = 'devin-team$account-xyz',
  userId = 'user-abc123',
  teamsTier = 16,
  planName = 'Devin Pro',
  dailyRemaining = 80,
  weeklyRemaining = 60,
  dailyReset = 1_700_000_000,
  weeklyReset = 1_700_100_000,
  displayName = 'Devin Team',
} = {}) {
  const planInfo = Buffer.concat([
    encodeUint(1, teamsTier),
    encodeString(2, planName),
    encodeMessage(33, encodeString(8, displayName)),
  ])
  const planStatus = Buffer.concat([
    encodeMessage(1, planInfo),
    encodeUint(14, dailyRemaining),
    encodeUint(15, weeklyRemaining),
    encodeUint(17, dailyReset),
    encodeUint(18, weeklyReset),
  ])
  const userStatus = Buffer.concat([
    encodeString(3, name),
    encodeString(5, teamId),
    encodeString(7, email),
    encodeUint(10, teamsTier),
    encodeMessage(13, planStatus),
    encodeString(36, userId),
  ])
  return Buffer.concat([encodeMessage(1, userStatus), encodeMessage(2, planInfo)])
}

/** Hand-built ClientModelConfig entry for GetCliModelConfigsResponse. */
function devinConfig({ label, uid, familyLabel, familyUid, defaultInFamily = false, images = false, ctx = 262_000, out = 128_000 }) {
  const info = Buffer.concat([
    encodeString(17, uid),
    encodeUint(4, ctx),
    encodeUint(13, out),
    encodeString(23, familyUid ?? String(familyLabel ?? '').toLowerCase().replace(/[\s.]+/g, '-')),
  ])
  const family = Buffer.concat([encodeString(1, familyLabel ?? '')])
  const parts = [
    encodeString(1, label),
    encodeString(22, uid),
    encodeMessage(23, info),
    encodeMessage(30, family),
  ]
  if (defaultInFamily) parts.push(encodeUint(31, 1))
  if (images) parts.push(encodeUint(5, 1))
  return Buffer.concat(parts)
}

test('normalizeDevinToken prefixes once; session mirrors token as refresh', () => {
  assert.equal(normalizeDevinToken('abc'), 'devin-session-token$abc')
  assert.equal(normalizeDevinToken('devin-session-token$abc'), 'devin-session-token$abc')
  assert.equal(normalizeDevinToken('  devin-session-token$abc  '), 'devin-session-token$abc')
  assert.equal(normalizeDevinToken(''), undefined)
  const session = devinSession({ accessToken: 'abc', account: 'ada@example.com', source: 'pkce' })
  assert.equal(session.accessToken, 'devin-session-token$abc')
  assert.equal(session.refreshToken, 'devin-session-token$abc')
  assert.ok(session.expiresAt > Date.now())
  assert.equal(devinSourceLabel('cli_toml'), 'CLI')
  assert.equal(devinSourceLabel('paste'), 'key')
  assert.equal(devinSourceLabel('pkce'), 'PKCE')
})

test('opaque ids never surface; human account prefers email/name', () => {
  assert.equal(isDevinOpaqueAccount('user-2825f4bb4a3a42d297b1f6caea8a9ee7'), true)
  assert.equal(isDevinOpaqueAccount('devin-team$account-4dabc'), true)
  assert.equal(isDevinOpaqueAccount('devin'), true)
  assert.equal(isDevinOpaqueAccount('ada@example.com'), false)
  assert.equal(pickDevinHumanAccount('devin-team$account-x', 'user-abc12345678901234', 'ada@example.com'), 'ada@example.com')
  const session = devinSession({ accessToken: 'x', account: 'user-2825f4bb4a3a42d297b1f6caea8a9ee7' })
  assert.equal(publicSession('devin', session).account, undefined)
  const human = devinSession({ accessToken: 'x', account: 'ada@example.com' })
  assert.equal(publicSession('devin', human).account, 'ada@example.com')
})

test('PKCE flow builds the CLI continue URL and exchanges on api.devin.ai', async () => {
  const { devinFlow } = await import('../lib/oauth/devin/index.js')
  const url = devinFlow.buildAuthorizeUrl({
    redirectUri: 'http://127.0.0.1:59653/callback',
    state: 'st',
    pkce: { challenge: 'ch' },
  })
  assert.ok(url.startsWith(`${DEVIN_WEBAPP_URL}/auth/cli/continue?`))
  const params = new URL(url).searchParams
  assert.equal(params.get('cli_pkce_marker'), '1')
  assert.equal(params.get('code_challenge_method'), 'S256')
  assert.equal(params.get('code_challenge'), 'ch')
  assert.equal(params.get('prompt'), 'select_account')
  assert.ok(DEVIN_AUTHORIZE_URL.startsWith('https://app.devin.ai'))

  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) })
    return json({ token: 'devin-session-token$live' })
  }
  const session = await exchangeDevinCode('code-1', 'verifier-1', { fetchFn })
  assert.equal(calls[0].url, `${DEVIN_API_URL}${DEVIN_TOKEN_PATH}`)
  assert.deepEqual(calls[0].body, { code: 'code-1', code_verifier: 'verifier-1', cli_pkce_marker: 1 })
  assert.equal(session.accessToken, 'devin-session-token$live')
  assert.equal(session.source, 'pkce')
})

test('refreshDevin extends a live token via status probe; 401 is permanent', async () => {
  const fresh = devinSession({ accessToken: 'tok', expiresAt: Date.now() + 60_000 })
  assert.equal(await refreshDevin(fresh, { fetchFn: async () => json({}) }), fresh)

  const expired = devinSession({ accessToken: 'tok', expiresAt: Date.now() - 1000 })
  const ok = await refreshDevin(expired, { statusFn: async () => ({}) })
  assert.ok(ok.expiresAt > Date.now())
  try {
    await refreshDevin(expired, { statusFn: async () => { throw new Error('HTTP 401') } })
    assert.fail('expected refresh to throw')
  } catch (error) {
    assert.equal(isDevinPermanentRefreshError(error), true)
  }
  assert.equal(isDevinPermanentRefreshError(new Error('expired; sign in again')), true)
  assert.equal(isDevinPermanentRefreshError(new Error('socket hangup')), false)
})

test('import reads credentials.toml; token never reaches publicSession', async () => {
  const home = await mkdtemp(join(tmpdir(), 'devin-cli-'))
  const file = join(home, 'credentials.toml')
  await writeFile(file, [
    'windsurf_api_key = "devin-session-token$secret_import"',
    'api_server_url = "https://server.codeium.com"',
    'devin_webapp_host = "https://app.devin.ai"',
    'devin_api_url = "https://api.devin.ai"',
    '',
  ].join('\n'))
  await chmod(file, 0o600)
  const result = await importDevinAuth({ paths: [file] })
  assert.equal(result.source, 'cli_toml')
  assert.equal(result.session.accessToken, 'devin-session-token$secret_import')
  assert.equal(result.session.apiServer, 'https://server.codeium.com')
  const pub = publicSession('devin', result.session)
  assert.equal(pub.methodLabel, 'CLI')
  assert.equal(JSON.stringify(pub).includes('secret_import'), false)
  assert.equal(Object.hasOwn(pub, 'accessToken'), false)

  const empty = await mkdtemp(join(tmpdir(), 'devin-empty-'))
  await assert.rejects(importDevinAuth({ paths: [join(empty, 'credentials.toml')] }), new RegExp(DEVIN_IMPORT_EMPTY))
})

test('connect frames round-trip and trailer errors parse', () => {
  const payload = Buffer.from('{"hello":"devin"}')
  const frame = frameConnect(payload, { compress: true })
  const end = frameConnect(Buffer.from('{"error":{"code":"unauthenticated","message":"bad token"}}'), { compress: false, end: true })
  const { frames, rest } = splitConnectFrames(Buffer.concat([frame, end]))
  assert.equal(rest.length, 0)
  assert.equal(frames.length, 2)
  assert.equal(frames[0].compressed, true)
  assert.equal(frames[0].end, false)
  assert.equal(unframePayload(frames[0]).toString(), payload.toString())
  assert.equal(frames[1].end, true)
  // splitConnectFrames leaves a partial frame in `rest`
  const partial = splitConnectFrames(frame.subarray(0, 7))
  assert.equal(partial.frames.length, 0)
  assert.ok(partial.rest.length > 0)
})

test('decodeUnaryBody handles raw proto, connect frame, and gzip', async () => {
  const raw = encodeString(1, 'plain')
  assert.equal(decodeUnaryBody(raw).toString(), raw.toString())
  const { gzipSync } = await import('node:zlib')
  assert.equal(decodeUnaryBody(gzipSync(raw)).toString(), raw.toString())
  const framed = frameConnect(raw, { compress: true })
  assert.equal(decodeUnaryBody(framed).toString(), raw.toString())
})

test('GetUserStatus decode feeds quota rows with ms resets and plan', () => {
  const decoded = decodeGetUserStatusResponse(devinStatusBytes())
  assert.equal(decoded.userStatus.email, 'ada@example.com')
  assert.equal(decoded.userStatus.userId, 'user-abc123')
  assert.equal(decoded.userStatus.teamsTier, 16)
  assert.equal(decoded.userStatus.planStatus.planInfo.planName, 'Devin Pro')
  const parsed = parseDevinUserStatus(decoded)
  assert.equal(parsed.account, 'ada@example.com')
  assert.equal(parsed.planType, 'Devin Pro')
  assert.equal(formatPlanLabel(parsed.planType, 'devin'), 'Pro')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].kind, 'primary')
  assert.equal(parsed.rows[0].remainingPercent, 80)
  assert.equal(parsed.rows[0].resetAt, 1_700_000_000_000)
  assert.equal(parsed.rows[1].kind, 'weekly')
  assert.equal(parsed.rows[1].remainingPercent, 60)
})

test('picker collapse keeps variants, defaults, and modifier buckets', () => {
  const configs = [
    { label: 'SWE-2 Medium', modelUid: 'swe-2-medium', familyLabel: 'SWE-2' },
    { label: 'SWE-2 High', modelUid: 'swe-2-high', familyLabel: 'SWE-2', isDefaultInFamily: true },
    { label: 'SWE-2 Max', modelUid: 'swe-2-max', familyLabel: 'SWE-2' },
    { label: 'SWE-2 High Fast', modelUid: 'swe-2-high-fast', familyLabel: 'SWE-2' },
    { label: 'SWE-2 Medium Fast', modelUid: 'swe-2-medium-fast', familyLabel: 'SWE-2' },
    { label: 'GPT-5.6 Sol No Thinking', modelUid: 'gpt-5-6-sol-none', familyLabel: 'GPT-5.6 Sol' },
    { label: 'GPT-5.6 Sol High', modelUid: 'gpt-5-6-sol-high', familyLabel: 'GPT-5.6 Sol', supportsImages: true },
    { label: 'Disabled Row', modelUid: 'gone-1', familyLabel: 'Gone', disabled: true },
  ]
  const rows = toDevinPickerModels(configs)
  const swe = rows.find((row) => row.id === 'swe-2')
  assert.ok(swe)
  assert.equal(swe.name, 'SWE-2')
  assert.deepEqual(swe.variants, { medium: 'swe-2-medium', high: 'swe-2-high', max: 'swe-2-max' })
  assert.equal(swe.defaultUid, 'swe-2-high')
  const sweFast = rows.find((row) => row.id === 'swe-2-fast')
  assert.ok(sweFast)
  assert.equal(sweFast.name, 'SWE-2 Fast')
  assert.deepEqual(sweFast.variants, { high: 'swe-2-high-fast', medium: 'swe-2-medium-fast' })
  const sol = rows.find((row) => row.id === 'gpt-5-6-sol')
  assert.deepEqual(sol.variants, { off: 'gpt-5-6-sol-none', high: 'gpt-5-6-sol-high' })
  assert.deepEqual(sol.input, ['text', 'image'])
  assert.equal(rows.some((row) => row.id === 'gone'), false)
  for (const row of rows) {
    for (const key of Object.keys(row.reasoningEfforts || {})) {
      assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
    }
  }
})

test('static Devin floor mirrors the live GetCliModelConfigs picker rows', () => {
  resetDevinCatalog()
  try {
    // 2026-09-23 live probe: 598 configs -> 580 family-bearing -> 81 picker rows.
    assert.equal(DEVIN_MODELS.length, 81)
    const ids = new Set(DEVIN_MODELS.map((row) => row.id))
    assert.equal(ids.size, 81)
    // Families the previous 17-row floor did not cover.
    for (const id of [
      'claude-opus-4.5', 'claude-opus-4.6-1m', 'claude-opus-4.8-fast', 'claude-opus-5-5',
      'claude-sonnet-4.6-thinking', 'deepseek-v4-pro', 'fusion', 'gemini-3.1-pro',
      'glm-5.2-1m', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.5-thinking-fast', 'gpt-5.6-terra',
      'grok-4-7', 'kimi-k2.6', 'nemotron-3-ultra', 'swe-1.6-fast',
    ]) {
      assert.ok(ids.has(id), `missing live picker id ${id}`)
    }
    // Picker id comes from the backend family uid (dots included), not a slug.
    assert.ok(ids.has('swe-1.7'))
    assert.equal(ids.has('swe-1-7'), false)
    // No-effort families carry the backend uid as an explicit default.
    assert.equal(devinModelById('claude-opus-4.6').defaultUid, 'claude-opus-4-6')
    assert.equal(devinModelById('kimi-k2.6').defaultUid, 'kimi-k2-6')
    assert.equal(devinModelById('swe-1.6-fast').defaultUid, 'swe-1-6-fast')
    assert.equal(devinModelById('gpt-5.4-thinking-fast').defaultUid, 'gpt-5-4-none-priority')
    // Fusion configs carry no maxOutputTokens upstream; the floor must not invent one.
    assert.equal(devinModelById('fusion').maxTokens, undefined)
    // Every key/value stays in the DSH closed sets; values are backend uids.
    for (const row of DEVIN_MODELS) {
      assert.ok(row.contextWindow > 0)
      assert.ok(row.input.every((part) => part === 'text' || part === 'image'))
      for (const key of Object.keys(row.reasoningEfforts || {})) {
        assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
      }
    }
    assert.equal(devinModelById('gpt-5-3-codex-medium-priority').id, 'gpt-5.3-codex-fast')
  } finally {
    resetDevinCatalog()
  }
})

test('live GetCliModelConfigs decode + refresh replaces the catalog', async () => {
  resetDevinCatalog()
  try {
    const body = encodeMessage(1, devinConfig({
      label: 'SWE-9 High', uid: 'swe-9-high', familyLabel: 'SWE-9', defaultInFamily: true, images: true,
    }))
    const fetchFn = async (url, init) => {
      assert.equal(String(url), `https://server.codeium.com${DEVIN_MODELS_PATH}`)
      assert.equal(init.headers['content-type'], 'application/proto')
      return new Response(body, { status: 200, headers: { 'content-type': 'application/proto' } })
    }
    const rows = await refreshDevinCatalog(devinSession({ accessToken: 'x' }), { fetchFn })
    const swe9 = rows.find((row) => row.id === 'swe-9')
    assert.ok(swe9)
    assert.equal(swe9.defaultUid, 'swe-9-high')
    assert.equal(devinCatalogModels(), rows)
    assert.equal(devinModelById('swe-9-high').id, 'swe-9')
    setDevinCatalogModels([])
    assert.equal(devinCatalogModels(), DEVIN_MODELS)
  } finally {
    resetDevinCatalog()
  }
})

test('cache strips codex fields; cascade id is deterministic per pin', () => {
  const { payload, cacheSessionId } = applyDevinCache({
    session_id: 'sess-1',
    prompt_cache_key: 'pck-1',
    prompt_cache_retention: '24h',
    service_tier: 'priority',
    model: 'swe-2',
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(cacheSessionId, 'devin-pck-1')
  for (const key of ['session_id', 'prompt_cache_key', 'prompt_cache_retention', 'service_tier']) {
    assert.equal(Object.hasOwn(payload, key), false)
  }
  assert.equal(applyDevinCache({ model: 'swe-2' }).cacheSessionId, undefined)
  assert.equal(devinCacheSessionId(''), undefined)
  assert.equal(devinCacheSessionId('a b!c'), 'devin-a-b-c')
  const cascade = devinCascadeId({ prompt_cache_key: 'pck-1' })
  assert.match(cascade, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(cascade, devinCascadeId({ prompt_cache_key: 'pck-1' }))
  assert.notEqual(devinExecutionId(), devinExecutionId())
})

test('openaiToDevin encodes system→prompt, effort→uid, tools; decode round-trips', () => {
  setDevinCatalogModels(toDevinPickerModels([
    { label: 'SWE-2 Medium', modelUid: 'swe-2-medium', familyLabel: 'SWE-2' },
    { label: 'SWE-2 High', modelUid: 'swe-2-high', familyLabel: 'SWE-2', isDefaultInFamily: true },
  ]))
  try {
    const built = openaiToDevin({
      model: 'swe-2',
      reasoning_effort: 'medium',
      max_tokens: 99,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You are terse.' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello', tool_calls: [{ id: 'call_1', function: { name: 'fs.read', arguments: '{"p":1}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: 'file body' },
      ],
      tools: [{ type: 'function', function: { name: 'fs.read', description: 'read', parameters: { type: 'object' } } }],
      tool_choice: 'auto',
    }, { cascadeId: 'cascade-x' })
    assert.equal(built.chatModelUid, 'swe-2-medium')
    assert.equal(devinWireModelId('swe-2', 'high'), 'swe-2-high')
    assert.equal(devinWireModelId('swe-2', 'swe-2-medium'), 'swe-2-medium') // uid echo
    assert.equal(devinWireModelId('swe-2', undefined), 'swe-2-high') // family default
    assert.equal(devinWireModelId('swe-2-high', undefined), 'swe-2-high') // raw uid passthrough
    assert.equal(built.fields.prompt, 'You are terse.')
    assert.equal(built.fields.chatMessagePrompts.length, 3)
    assert.equal(built.fields.tools.length, 1)

    // Decode the request envelope to verify field placement.
    const fields = decodeFields(Buffer.concat([
      encodeString(2, built.fields.prompt),
      ...built.fields.chatMessagePrompts.map((p) => encodeMessage(3, p)),
      encodeString(16, built.fields.cascadeId),
      encodeString(21, built.fields.chatModelUid),
      encodeString(22, built.fields.executionId),
    ]))
    assert.equal(fields.find((f) => f.field === 2).bytes.toString(), 'You are terse.')
    assert.equal(fields.find((f) => f.field === 16).bytes.toString(), 'cascade-x')
    assert.equal(fields.find((f) => f.field === 21).bytes.toString(), 'swe-2-medium')
    const prompt0 = decodeFields(fields.filter((f) => f.field === 3)[0].bytes)
    assert.equal(prompt0.find((f) => f.field === 3).bytes.toString(), 'hi')
    assert.equal(prompt0.find((f) => f.field === 2).varint, 1) // USER
    const prompt1 = decodeFields(fields.filter((f) => f.field === 3)[1].bytes)
    assert.equal(prompt1.find((f) => f.field === 2).varint, 2) // SYSTEM (assistant)
    const prompt2 = decodeFields(fields.filter((f) => f.field === 3)[2].bytes)
    assert.equal(prompt2.find((f) => f.field === 2).varint, 4) // TOOL
    assert.equal(prompt2.find((f) => f.field === 7).bytes.toString(), 'call_1')
  } finally {
    resetDevinCatalog()
  }
})

test('metadata carries the real CLI fingerprint: chisel + cli version + os', () => {
  const bytes = devinMetadataBytes(devinSession({ accessToken: 'devin-session-token$k' }), { userJwt: 'jwt-1' })
  const fields = decodeFields(bytes)
  const byField = (n) => fields.find((f) => f.field === n)?.bytes?.toString()
  assert.equal(byField(3), 'devin-session-token$k')
  assert.equal(byField(1), 'chisel')
  assert.equal(byField(12), 'chisel')
  assert.equal(byField(7), '3000.10.31')
  assert.equal(byField(2), '3000.10.31')
  assert.equal(byField(4), 'en')
  assert.equal(byField(5), process.platform)
  assert.equal(byField(21), 'jwt-1')
  assert.equal(devinBasicAuth({ accessToken: 'tok' }), 'Basic tok-tok')
  assert.equal(devinBasicAuth(devinSession({ accessToken: 'tok' })), 'Basic devin-session-token$tok-devin-session-token$tok')
  assert.equal(devinBasicAuth({}), undefined)
})

test('devinToOpenai maps finish reasons and cache usage', () => {
  const body = devinToOpenai({
    text: 'done',
    thinking: 'hmm',
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 3 },
    stopReason: 1,
    messageId: 'm1',
  }, { model: 'swe-2', id: 'id-1' })
  assert.equal(body.object, 'chat.completion')
  assert.equal(body.choices[0].finish_reason, 'stop')
  assert.equal(body.choices[0].message.content, 'done')
  assert.equal(body.choices[0].message.reasoning_content, 'hmm')
  assert.equal(body.usage.prompt_tokens_details.cached_tokens, 4)
  assert.equal(body.usage.prompt_cache_write_tokens, 3)
  const tools = devinToOpenai({ text: '', toolCalls: [{ id: 'c1', name: 'fs.read', argumentsJson: '{}' }] }, {})
  assert.equal(tools.choices[0].finish_reason, 'tool_calls')
  assert.equal(tools.choices[0].message.tool_calls[0].function.name, 'fs.read')
  assert.equal(mapDevinUsage(undefined), undefined)
})

test('stream mapper emits role, content, tool arg deltas, finish, DONE', () => {
  const mapper = createDevinOpenaiStream({ model: 'swe-2', id: 's1' })
  const first = mapper.push({ type: 'thinking', delta: 'think' })
  assert.match(first[0], /"role":"assistant"/)
  assert.match(first[1], /"reasoning_content":"think"/)
  const text = mapper.push({ type: 'text', delta: 'hi' })
  assert.match(text[0], /"content":"hi"/)
  const callA = mapper.push({ type: 'tool', call: { id: 'c1', name: 'fs.read', argumentsJson: '{"a"' } })
  assert.match(callA[0], /"arguments":"{\\"a\\""/)
  const callB = mapper.push({ type: 'tool', call: { id: 'c1', argumentsJson: '{"a":1}' } })
  assert.match(callB[0], /"arguments":":1\}"/) // only the new tail
  mapper.push({ type: 'usage', usage: { inputTokens: 5, outputTokens: 1 } })
  mapper.push({ type: 'stop', reason: 10 })
  const tail = mapper.finish()
  assert.match(tail[0], /"finish_reason":"tool_calls"/)
  assert.match(tail[0], /"prompt_tokens":5/)
  assert.equal(tail.at(-1), 'data: [DONE]\n\n')
})

test('proxy serves /devin/v1/models and chat via runFn; responses is 501', async () => {
  const seen = []
  const devinChat = async (session, built, { onEvent } = {}) => {
    seen.push(built)
    if (typeof onEvent === 'function') {
      await onEvent({ type: 'text', delta: 'PONG' })
      await onEvent({ type: 'usage', usage: { inputTokens: 3, outputTokens: 1 } })
      await onEvent({ type: 'stop', reason: 1 })
    }
    return { text: 'PONG', thinking: '', toolCalls: [], usage: { inputTokens: 3, outputTokens: 1 }, stopReason: 1 }
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'proxy-key-devin-test-xx',
    devinChat,
    tokens: { devin: { session: async () => devinSession({ accessToken: 'x' }) } },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer proxy-key-devin-test-xx', 'content-type': 'application/json' }
  try {
    const models = await fetch(`http://127.0.0.1:${port}/devin/v1/models`, { headers })
    assert.equal(models.status, 200)
    const list = await models.json()
    assert.equal(list.object, 'list')
    assert.ok(list.data.some((row) => row.id === 'swe-2'))

    const res = await fetch(`http://127.0.0.1:${port}/devin/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'swe-2',
        messages: [{ role: 'user', content: 'ping' }],
        prompt_cache_key: 'codex-key',
        session_id: 'sess-9',
      }),
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.choices[0].message.content, 'PONG')
    assert.equal(body.choices[0].finish_reason, 'stop')
    assert.equal(body.usage.prompt_tokens, 3)
    // DSH cache fields became a deterministic cascade_id, not forwarded fields
    assert.equal(seen[0].fields.cascadeId, deterministicDevinId('devin-codex-key'))

    const sse = await fetch(`http://127.0.0.1:${port}/devin/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'swe-2', stream: true, messages: [{ role: 'user', content: 'ping' }] }),
    })
    assert.equal(sse.status, 200)
    assert.match(sse.headers.get('content-type') ?? '', /text\/event-stream/)
    const sseText = await sse.text()
    assert.match(sseText, /"content":"PONG"/)
    assert.match(sseText, /data: \[DONE\]/)

    const responses = await fetch(`http://127.0.0.1:${port}/devin/v1/responses`, {
      method: 'POST', headers, body: '{}',
    })
    assert.equal(responses.status, 501)
  } finally {
    await proxy.close()
  }
})

test('controller snapshot exposes devin; refreshQuota wires GetUserStatus', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devin-ctrl-'))
  const authPath = join(dir, 'auth.json')
  const fetchFn = async (url) => {
    if (String(url).endsWith(DEVIN_USER_STATUS_PATH)) {
      return new Response(devinStatusBytes(), { status: 200, headers: { 'content-type': 'application/proto' } })
    }
    if (String(url).endsWith(DEVIN_MODELS_PATH)) return new Response(Buffer.alloc(0), { status: 200 })
    return json({})
  }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn,
    devinAutoImport: false,
    devinDiscover: async () => DEVIN_MODELS,
  })
  const empty = await controller.snapshot()
  assert.equal(empty.catalog.find((row) => row.family === 'devin').loggedIn, false)

  await saveSession('devin', devinSession({
    accessToken: 'devin-session-token$ctrl',
    account: 'ada@example.com',
    planType: 'Devin Pro',
    source: 'cli_toml',
  }), authPath)
  const snap = await controller.snapshot()
  const group = snap.catalog.find((row) => row.family === 'devin')
  assert.equal(group.loggedIn, true)
  assert.equal(group.displayName, 'OAuth · Devin')
  const account = snap.accounts.devin.accounts[0]
  assert.equal(account.account, 'ada@example.com')
  assert.equal(account.methodLabel, 'CLI')
  assert.ok(account.quota)
  assert.equal(account.quota.rows.length, 2)
  assert.equal(JSON.stringify(snap.accounts).includes('devin-session-token$'), false)

  const quota = await controller.refreshQuota('devin')
  assert.equal(quota.rows.length, 2)
  assert.equal(quota.planType, 'Devin Pro')
})

test('buildProviders exposes oauth-devin as completions at /devin', () => {
  assert.equal(ownedProviderIds('oauth').includes('oauth-devin'), true)
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { devin: true },
  })
  const route = providers['oauth-devin']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/devin')
  assert.equal(route.displayName, 'OAuth · Devin')
  assert.equal(route.compat.supportsReasoningEffort, true)
  for (const model of route.models) {
    for (const key of Object.keys(model.reasoningEfforts ?? {})) {
      assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
    }
  }
  assert.equal(catalogProviders({ prefix: 'oauth', origin: 'http://x' })['oauth-devin'].models.length, DEVIN_MODELS.length)
  assert.equal(accountIdOf('devin', devinSession({ accessToken: 't', account: 'a@b.c' })), accountIdOf('devin', devinSession({ accessToken: 't2', account: 'a@b.c' })))
})

test('runDevinChat frames the request and decodes Connect stream', async () => {
  // One data frame with deltaText + usage, then a clean end frame.
  const data = Buffer.concat([
    encodeString(1, 'msg-1'),
    encodeString(3, 'PONG'),
    encodeMessage(7, Buffer.concat([encodeUint(2, 11), encodeUint(3, 4), encodeUint(5, 7)])),
  ])
  const stream = Buffer.concat([
    frameConnect(data, { compress: true }),
    frameConnect(Buffer.from('{}'), { compress: false, end: true }),
  ])
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: Buffer.from(init.body) })
    if (String(url).endsWith('/exa.auth_pb.AuthService/GetUserJwt')) return new Response('nope', { status: 404 })
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(stream.subarray(0, 9)))
        controller.enqueue(new Uint8Array(stream.subarray(9)))
        controller.close()
      },
    }), { status: 200 })
  }
  const events = []
  const collected = await runDevinChat(
    devinSession({ accessToken: 'devin-session-token$k' }),
    openaiToDevin({ model: 'swe-2', messages: [{ role: 'user', content: 'ping' }] }, { cascadeId: 'c-1' }),
    { fetchFn, onEvent: (event) => events.push(event) },
  )
  assert.equal(collected.text, 'PONG')
  assert.equal(collected.messageId, 'msg-1')
  assert.equal(collected.usage.inputTokens, 11)
  assert.equal(collected.usage.cacheReadTokens, 7)
  assert.deepEqual(events.map((row) => row.type), ['text', 'usage'])
  const chat = calls.find((row) => row.url.endsWith(DEVIN_CHAT_PATH))
  assert.ok(chat)
  assert.equal(chat.headers['content-type'], 'application/connect+proto')
  assert.equal(chat.headers['connect-protocol-version'], '1')
  assert.equal(chat.headers['user-agent'], 'connect-go/1.18.1 (go1.26.3)')
  assert.equal(chat.headers.authorization, 'Basic devin-session-token$k-devin-session-token$k')
  // Request is a single gzipped Connect frame containing the proto envelope.
  const { frames } = splitConnectFrames(chat.body)
  assert.equal(frames.length, 1)
  const requestFields = decodeFields(unframePayload(frames[0]))
  assert.equal(requestFields.find((f) => f.field === 2).bytes.toString(), '') // prompt
  const meta = decodeFields(requestFields.find((f) => f.field === 1).bytes)
  assert.equal(meta.find((f) => f.field === 3).bytes.toString(), 'devin-session-token$k')
})

test('runDevinChat surfaces trailer errors and empty streams', async () => {
  const err = Buffer.from(JSON.stringify({ error: { code: 'unauthenticated', message: 'bad token' } }))
  const failFetch = async () => new Response(Buffer.concat([
    frameConnect(err, { compress: false, end: true }),
  ]), { status: 200 })
  await assert.rejects(
    runDevinChat(devinSession({ accessToken: 'x' }), openaiToDevin({ model: 'swe-2', messages: [] }, {}), { fetchFn: failFetch }),
    DevinTransportError,
  )
  const emptyFetch = async () => new Response(Buffer.alloc(0), { status: 200 })
  await assert.rejects(
    runDevinChat(devinSession({ accessToken: 'x' }), openaiToDevin({ model: 'swe-2', messages: [] }, {}), { fetchFn: emptyFetch }),
    /empty body|without a message/,
  )
})

function fakeJwt(expSeconds) {
  const b64u = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${b64u({ alg: 'none' })}.${b64u({ exp: expSeconds })}.sig`
}

function okChatStream() {
  return new Response(Buffer.concat([
    frameConnect(encodeString(3, 'ok'), { compress: true }),
    frameConnect(Buffer.from('{}'), { compress: false, end: true }),
  ]), { status: 200 })
}

test('runDevinChat caches the minted user_jwt across calls', async () => {
  const jwt = fakeJwt(Math.floor(Date.now() / 1000) + 900)
  let jwtCalls = 0
  let chatCalls = 0
  const fetchFn = async (url) => {
    if (String(url).endsWith(DEVIN_USER_JWT_PATH)) {
      jwtCalls += 1
      return new Response(encodeString(1, jwt))
    }
    chatCalls += 1
    return okChatStream()
  }
  const session = devinSession({ accessToken: 'devin-session-token$jwt_cache_a' })
  const built = openaiToDevin({ model: 'swe-2', messages: [{ role: 'user', content: 'ping' }] }, { cascadeId: 'c-jwt' })
  await runDevinChat(session, built, { fetchFn })
  await runDevinChat(session, built, { fetchFn })
  assert.equal(jwtCalls, 1)
  assert.equal(chatCalls, 2)
})

test('runDevinChat retries token-only once when a cached jwt 401s', async () => {
  const jwt = fakeJwt(Math.floor(Date.now() / 1000) + 900)
  const bodies = []
  let chatCalls = 0
  const fetchFn = async (url, init) => {
    if (String(url).endsWith(DEVIN_USER_JWT_PATH)) return new Response(encodeString(1, jwt))
    chatCalls += 1
    bodies.push(Buffer.from(init.body))
    return chatCalls === 1 ? new Response('unauthorized', { status: 401 }) : okChatStream()
  }
  const session = devinSession({ accessToken: 'devin-session-token$jwt_retry' })
  const built = openaiToDevin({ model: 'swe-2', messages: [{ role: 'user', content: 'ping' }] }, { cascadeId: 'c-retry' })
  const collected = await runDevinChat(session, built, { fetchFn })
  assert.equal(chatCalls, 2)
  assert.equal(collected.text, 'ok')
  const metadataOf = (body) => decodeFields(fieldBytes(decodeFields(unframePayload(splitConnectFrames(body).frames[0])), 1)[0])
  assert.ok(metadataOf(bodies[0]).find((f) => f.field === 21))
  assert.equal(metadataOf(bodies[1]).find((f) => f.field === 21), undefined)
})

test('an expired minted jwt is not reused', async () => {
  const stale = fakeJwt(Math.floor(Date.now() / 1000) - 60)
  let jwtCalls = 0
  const fetchFn = async (url) => {
    if (String(url).endsWith(DEVIN_USER_JWT_PATH)) {
      jwtCalls += 1
      return new Response(encodeString(1, stale))
    }
    return okChatStream()
  }
  const session = devinSession({ accessToken: 'devin-session-token$jwt_cache_stale' })
  const built = openaiToDevin({ model: 'swe-2', messages: [{ role: 'user', content: 'ping' }] }, { cascadeId: 'c-stale' })
  await runDevinChat(session, built, { fetchFn })
  await runDevinChat(session, built, { fetchFn })
  assert.equal(jwtCalls, 2)
})

test('importFrom rejects an unknown provider instead of importing Grok', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devin-unknown-'))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn: async () => json({}),
    devinAutoImport: false,
  })
  await assert.rejects(controller.importFrom('devin-typo'), /unknown provider devin-typo/)
  const store = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(authPath, 'utf8').catch(() => '{}')))
  assert.equal(store['devin-typo'], undefined)
  assert.equal(store.grok, undefined)
})

test('importFrom(devin) stores the credentials.toml session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'devin-ctrl-import-'))
  const authPath = join(dir, 'auth.json')
  const file = join(dir, 'credentials.toml')
  await writeFile(file, 'windsurf_api_key = "devin-session-token$ctrl_import"\n')
  await chmod(file, 0o600)
  const fetchFn = async (url) => {
    if (String(url).endsWith(DEVIN_USER_STATUS_PATH)) {
      return new Response(devinStatusBytes(), { status: 200, headers: { 'content-type': 'application/proto' } })
    }
    return json({})
  }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn,
    devinAutoImport: false,
    devinImport: { paths: [file] },
    devinDiscover: async () => DEVIN_MODELS,
  })
  const result = await controller.importFrom('devin')
  assert.equal(result.source, 'cli_toml')
  const rows = await listStoredSessions('devin', authPath)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'ada@example.com')
  assert.equal(rows[0].session.accessToken, 'devin-session-token$ctrl_import')
  assert.equal(rows[0].active, true)
})

test('auto-import proceeds when the devin slot holds a foreign-shaped session', async () => {
  // A stale host can park another family's session under `devin` (observed:
  // Grok tokens written by the pre-devin import fallthrough). It must not
  // count as a devin login and must not block the credentials.toml import.
  assert.equal(isDevinSessionToken('devin-session-token$x'), true)
  assert.equal(isDevinSessionToken('eyJ0eXAiOiJhdCtqd3Qi'), false)
  const dir = await mkdtemp(join(tmpdir(), 'devin-foreign-'))
  const authPath = join(dir, 'auth.json')
  const file = join(dir, 'credentials.toml')
  await writeFile(file, 'windsurf_api_key = "devin-session-token$auto_import"\n')
  await chmod(file, 0o600)
  await saveSession('devin', {
    accessToken: 'eyJ0eXAiOiJhdCtqd3Qi.foreign',
    refreshToken: 'foreign-refresh',
    expiresAt: Date.now() + 3_600_000,
    account: 'foreign@x.ai',
    tokenEndpoint: 'https://auth.x.ai/oauth2/token',
  }, authPath)
  const fetchFn = async (url) => {
    if (String(url).endsWith(DEVIN_USER_STATUS_PATH)) {
      return new Response(devinStatusBytes(), { status: 200, headers: { 'content-type': 'application/proto' } })
    }
    return json({})
  }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn,
    devinAutoImport: true,
    devinImport: { paths: [file] },
    devinDiscover: async () => DEVIN_MODELS,
  })
  await controller.snapshot()
  const rows = await listStoredSessions('devin', authPath)
  const real = rows.find((row) => isDevinSessionToken(row.session.accessToken))
  assert.ok(real)
  assert.equal(real.id, 'ada@example.com')
  assert.equal(real.active, true)
  // The foreign row stays parked (quota refresh may rewrite its display
  // account); it self-purges on the first real refresh-401.
  assert.equal(rows.some((row) => row.session.accessToken === 'eyJ0eXAiOiJhdCtqd3Qi.foreign'), true)
})

test('forwardDevin replays socket-level failures until the stream commits', async () => {
  const headers = { authorization: 'Bearer proxy-key-devin-retry', 'content-type': 'application/json' }
  const make = (devinChat) => createProxy({
    port: 0,
    apiKey: 'proxy-key-devin-retry',
    devinChat,
    tokens: { devin: { session: async () => devinSession({ accessToken: 'x' }) } },
  })
  const post = (port, body) => fetch(`http://127.0.0.1:${port}/devin/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  // Two ECONNRESETs then a healthy stream: the run survives.
  let calls = 0
  const flaky = async () => {
    calls += 1
    if (calls < 3) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
    return { text: 'PONG', thinking: '', toolCalls: [], stopReason: 1 }
  }
  const proxy = await (await make(flaky)).listen()
  try {
    const res = await post(proxy.address().port, { model: 'swe-2', messages: [{ role: 'user', content: 'ping' }] })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).choices[0].message.content, 'PONG')
    assert.equal(calls, 3)
  } finally {
    proxy.close()
  }

  // A permanent 403 answer is not replayed.
  calls = 0
  const forbidden = async () => {
    calls += 1
    throw new DevinTransportError('Devin chat failed (HTTP 403): forbidden', { status: 403 })
  }
  const denied = await (await make(forbidden)).listen()
  try {
    const res = await post(denied.address().port, { model: 'swe-2', messages: [{ role: 'user', content: 'ping' }] })
    assert.equal(res.status, 403)
    assert.equal(calls, 1)
  } finally {
    denied.close()
  }
})
