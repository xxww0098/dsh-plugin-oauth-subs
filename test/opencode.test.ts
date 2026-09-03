import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
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
  OPENCODE_ACCOUNT,
  OPENCODE_ANON_TOKEN,
  OPENCODE_CHAT_URL,
  OPENCODE_RESPONSES_URL,
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_MODELS,
  OPENCODE_MODELS_DEV_URL,
  OPENCODE_MODELS_URL,
  OPENCODE_REASONING_DEEPSEEK,
  OPENCODE_REASONING_LAGUNA,
  OPENCODE_REASONING_MUSE,
  OPENCODE_REASONING_TOGGLE,
  isOpencodeFreeSlug,
  isOpencodeResponsesModel,
  opencodeSession,
  opencodeSourceLabel,
  opencodeUpstreamHeaders,
  refreshOpencode,
} from '../lib/oauth/opencode/index.js'
import {
  OPENCODE_STABLE_SESSION,
  applyOpencodeCache,
  opencodeCacheHeaders,
  opencodeCacheSessionId,
} from '../lib/oauth/opencode/cache.js'
import {
  opencodeCatalogModels,
  opencodePickerInput,
  overlayOpencodeModelsDev,
  refreshOpencodeCatalog,
  resetOpencodeCatalogCache,
  toOpencodePickerModels,
} from '../lib/oauth/opencode/catalog.js'
import {
  OPENCODE_MIN_OUTPUT_TOKENS,
  applyOpencodeThinking,
  chatToOpencodeResponses,
  createOpencodeResponsesChatStream,
  foldOpencodeReasoningContent,
  opencodeResponsesToChat,
  parseOpencodeSseBlocks,
} from '../lib/oauth/opencode/request.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { QuotaStore, fetchOpencodeQuota } from '../lib/oauth/quota.js'
import { createProxy } from '../lib/oauth/proxy.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('anonymous session uses a sentinel that is never a public token', () => {
  const session = opencodeSession()
  assert.equal(session.accessToken, OPENCODE_ANON_TOKEN)
  assert.equal(session.refreshToken, OPENCODE_ANON_TOKEN)
  assert.equal(session.account, OPENCODE_ACCOUNT)
  assert.equal(session.source, 'anonymous')
  assert.equal(session.planType, 'free')
  const pub = publicSession('opencode', session)
  assert.equal(pub.account, OPENCODE_ACCOUNT)
  assert.equal(pub.planLabel, 'Free')
  assert.equal(pub.method, 'anonymous')
  assert.equal(pub.methodLabel, undefined)
  assert.equal(Object.hasOwn(pub, 'accessToken'), false)
  assert.equal(Object.hasOwn(pub, 'refreshToken'), false)
  assert.equal(opencodeSourceLabel('anonymous'), undefined)
  assert.equal(formatPlanLabel('free', 'opencode'), 'Free')
})

test('refresh keeps the sentinel and never expires', async () => {
  const next = await refreshOpencode(opencodeSession())
  assert.equal(next.accessToken, OPENCODE_ANON_TOKEN)
  assert.equal(next.source, 'anonymous')
  assert.ok(next.expiresAt > Date.now() + 365 * 24 * 60 * 60_000)
})

test('catalog is Completions at /opencode, not a custom api string', () => {
  const ids = ownedProviderIds('oauth')
  assert.equal(ids.includes('oauth-opencode'), true)
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { opencode: true },
  })
  const route = providers['oauth-opencode']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.api, 'openai-completions')
  assert.equal(route.displayName, 'OAuth · OpenCode Free')
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/opencode')
  assert.equal(route.baseURL.endsWith('/opencode/v1'), false)
  assert.equal(route.compat.supportsReasoningEffort, true)
  assert.equal(route.compat.thinkingFormat, 'openai')
  const laguna = route.models.find((model) => model.id === OPENCODE_DEFAULT_MODEL)
  assert.deepEqual(laguna.reasoningEfforts, OPENCODE_REASONING_LAGUNA)
  assert.deepEqual(laguna.input, ['text'])
  assert.equal(laguna.contextWindow, 256_000)
  assert.equal(laguna.maxTokens, 32_000)
  const mimo = route.models.find((model) => model.id === 'mimo-v2.5-free')
  assert.equal(Object.hasOwn(mimo, 'reasoningEfforts'), false)
  assert.deepEqual(mimo.input, ['text', 'image'])
  assert.equal(mimo.input.includes('audio'), false)
  const muse = route.models.find((model) => model.id === 'muse-spark-1.2-contributor-free')
  assert.deepEqual(muse.reasoningEfforts, OPENCODE_REASONING_MUSE)
  assert.deepEqual(muse.input, ['text', 'image'])
  assert.equal(muse.input.includes('video'), false)
  assert.equal(muse.input.includes('pdf'), false)
  assert.equal(route.models.some((model) => model.id === OPENCODE_DEFAULT_MODEL), true)
  assert.equal(route.models.some((model) => model.id === 'hy3-free'), false)
  assert.equal(route.models.some((model) => model.id === 'big-pickle'), false)
  assert.equal(route.models.some((model) => model.id === 'ox-alpha-free'), false)
  resetOpencodeCatalogCache()
  assert.equal(catalogProviders({ prefix: 'oauth', origin: 'http://x' })['oauth-opencode'].models.length, OPENCODE_MODELS.length)
})

test('isOpencodeFreeSlug keeps anonymous *-free and drops Go-keyed / UA-gated', () => {
  assert.equal(isOpencodeFreeSlug('laguna-s-2.1-free'), true)
  assert.equal(isOpencodeFreeSlug('opencode/laguna-s-2.1-free'), true)
  assert.equal(isOpencodeFreeSlug('ox-alpha-free'), false)
  assert.equal(isOpencodeFreeSlug('big-pickle'), false)
  assert.equal(isOpencodeFreeSlug('gpt-5'), false)
  assert.equal(isOpencodeFreeSlug(''), false)
})

test('live catalog keeps *-free, drops keyed and non-free, falls back to the floor', async () => {
  resetOpencodeCatalogCache()
  const models = toOpencodePickerModels({
    data: [
      { id: 'laguna-s-2.1-free', context_window: 200_000 },
      { id: 'ox-alpha-free' },
      { id: 'big-pickle' },
      { id: 'hy3-free' },
      { id: 'mimo-v2.5-free' },
      { id: 'mimo-v2.5-free' },
    ],
  })
  assert.deepEqual(models.map((model) => model.id), ['hy3-free', 'laguna-s-2.1-free', 'mimo-v2.5-free'])
  assert.equal(models.find((model) => model.id === 'laguna-s-2.1-free').contextWindow, 200_000)

  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers })
    assert.equal(Object.hasOwn(init.headers ?? {}, 'authorization'), false)
    if (String(url) === OPENCODE_MODELS_DEV_URL) return json({ opencode: { models: {} } })
    return json({ data: [{ id: 'laguna-s-2.1-free' }, { id: 'ox-alpha-free' }, { id: 'nemotron-3-ultra-free' }] })
  }
  const live = await refreshOpencodeCatalog({ fetchFn, force: true })
  assert.equal(calls.some((row) => row.url === OPENCODE_MODELS_URL), true)
  assert.equal(calls.some((row) => row.url === OPENCODE_MODELS_DEV_URL), true)
  assert.deepEqual(live.map((model) => model.id), ['laguna-s-2.1-free', 'nemotron-3-ultra-free'])
  assert.equal(opencodeCatalogModels().length, 2)
  assert.deepEqual(live.find((model) => model.id === 'laguna-s-2.1-free').reasoningEfforts, OPENCODE_REASONING_LAGUNA)

  resetOpencodeCatalogCache()
  const empty = await refreshOpencodeCatalog({
    fetchFn: async () => json({ data: [{ id: 'ox-alpha-free' }] }),
    force: true,
  })
  assert.equal(empty.length, OPENCODE_MODELS.length)
  assert.equal(empty.some((model) => model.id === 'hy3-free'), false)
})

const MODELS_DEV_EIGHT = {
  opencode: {
    models: {
      'deepseek-v4-flash-free': {
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['low', 'high', 'max'] }],
        modalities: { input: ['text'] },
        limit: { context: 200000, output: 128000 },
      },
      'laguna-s-2.1-free': {
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high'] }],
        modalities: { input: ['text'] },
        limit: { context: 256000, output: 32000 },
      },
      'ling-3.0-flash-fin-free': {
        reasoning: true,
        reasoning_options: [{ type: 'toggle' }],
        modalities: { input: ['text'] },
        limit: { context: 262144, output: 32768 },
      },
      'mimo-v2.5-free': {
        reasoning: true,
        reasoning_options: [],
        modalities: { input: ['text', 'image', 'audio', 'video'] },
        limit: { context: 200000, output: 32000 },
      },
      'muse-spark-1.2-contributor-free': {
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['minimal', 'low', 'medium', 'high', 'xhigh'] }],
        modalities: { input: ['text', 'image', 'video', 'pdf', 'audio'] },
        limit: { context: 1048576, output: 131072 },
      },
      'muse-spark-1.3-contributor-free': {
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['minimal', 'low', 'medium', 'high', 'xhigh'] }],
        modalities: { input: ['text', 'image', 'video', 'pdf', 'audio'] },
        limit: { context: 1048576, output: 131072 },
      },
      'nemotron-3-ultra-free': {
        reasoning: true,
        reasoning_options: [],
        modalities: { input: ['text'] },
        limit: { context: 1000000, output: 128000 },
      },
      'nemotron-3.5-lightning-free': {
        reasoning: true,
        reasoning_options: [],
        modalities: { input: ['text'] },
        limit: { context: 262144, output: 262144 },
      },
      'hy3-free': {
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
        modalities: { input: ['text', 'image'] },
        limit: { context: 200000, output: 16000 },
      },
      'kimi-k2.5-free': {
        reasoning: true,
        modalities: { input: ['text'] },
        limit: { context: 256000, output: 8000 },
      },
    },
  },
}

test('models.dev overlay maps the eight live rows and does not add delisted slugs', () => {
  assert.deepEqual(opencodePickerInput(['text', 'image', 'audio', 'video']), ['text', 'image'])
  assert.deepEqual(opencodePickerInput(['text']), ['text'])
  const zen = toOpencodePickerModels({
    data: OPENCODE_MODELS.map((model) => ({ id: model.id })),
  })
  const rows = overlayOpencodeModelsDev(zen, MODELS_DEV_EIGHT)
  assert.deepEqual(rows.map((model) => model.id), OPENCODE_MODELS.map((model) => model.id).slice().sort())
  assert.equal(rows.some((model) => model.id === 'hy3-free'), false)
  assert.equal(rows.some((model) => model.id === 'kimi-k2.5-free'), false)

  const byId = Object.fromEntries(rows.map((model) => [model.id, model]))
  assert.deepEqual(byId['deepseek-v4-flash-free'].reasoningEfforts, OPENCODE_REASONING_DEEPSEEK)
  assert.deepEqual(byId['deepseek-v4-flash-free'].input, ['text'])
  assert.equal(byId['deepseek-v4-flash-free'].contextWindow, 200_000)
  assert.equal(byId['deepseek-v4-flash-free'].maxTokens, 128_000)

  assert.deepEqual(byId['laguna-s-2.1-free'].reasoningEfforts, OPENCODE_REASONING_LAGUNA)
  assert.deepEqual(byId['laguna-s-2.1-free'].input, ['text'])
  assert.equal(byId['laguna-s-2.1-free'].contextWindow, 256_000)
  assert.equal(byId['laguna-s-2.1-free'].maxTokens, 32_000)

  assert.deepEqual(byId['ling-3.0-flash-fin-free'].reasoningEfforts, OPENCODE_REASONING_TOGGLE)
  assert.deepEqual(byId['ling-3.0-flash-fin-free'].input, ['text'])
  assert.equal(byId['ling-3.0-flash-fin-free'].contextWindow, 262_144)
  assert.equal(byId['ling-3.0-flash-fin-free'].maxTokens, 32_768)

  assert.equal(Object.hasOwn(byId['mimo-v2.5-free'], 'reasoningEfforts'), false)
  assert.deepEqual(byId['mimo-v2.5-free'].input, ['text', 'image'])
  assert.equal(byId['mimo-v2.5-free'].input.includes('audio'), false)
  assert.equal(byId['mimo-v2.5-free'].contextWindow, 200_000)
  assert.equal(byId['mimo-v2.5-free'].maxTokens, 32_000)

  for (const id of ['muse-spark-1.2-contributor-free', 'muse-spark-1.3-contributor-free']) {
    assert.deepEqual(byId[id].reasoningEfforts, OPENCODE_REASONING_MUSE)
    assert.deepEqual(byId[id].input, ['text', 'image'])
    assert.equal(byId[id].input.includes('audio'), false)
    assert.equal(byId[id].input.includes('video'), false)
    assert.equal(byId[id].input.includes('pdf'), false)
    assert.equal(byId[id].contextWindow, 1_048_576)
    assert.equal(byId[id].maxTokens, 131_072)
  }

  assert.equal(Object.hasOwn(byId['nemotron-3-ultra-free'], 'reasoningEfforts'), false)
  assert.deepEqual(byId['nemotron-3-ultra-free'].input, ['text'])
  assert.equal(byId['nemotron-3-ultra-free'].contextWindow, 1_000_000)
  assert.equal(byId['nemotron-3-ultra-free'].maxTokens, 128_000)

  assert.equal(Object.hasOwn(byId['nemotron-3.5-lightning-free'], 'reasoningEfforts'), false)
  assert.deepEqual(byId['nemotron-3.5-lightning-free'].input, ['text'])
  assert.equal(byId['nemotron-3.5-lightning-free'].contextWindow, 262_144)
  assert.equal(byId['nemotron-3.5-lightning-free'].maxTokens, 262_144)

  const down = overlayOpencodeModelsDev(zen, undefined)
  assert.deepEqual(down.find((model) => model.id === 'laguna-s-2.1-free').reasoningEfforts, OPENCODE_REASONING_LAGUNA)
})

test('hop maps reasoning_effort and never sends thinking with it', () => {
  const laguna = applyOpencodeThinking({
    model: 'laguna-s-2.1-free',
    reasoning_effort: 'high',
    thinking: { type: 'enabled' },
  })
  assert.equal(laguna.reasoning_effort, 'high')
  assert.equal(laguna.thinking, undefined)

  const toggleOff = applyOpencodeThinking({ model: 'ling-3.0-flash-fin-free', reasoning_effort: 'off' })
  assert.equal(toggleOff.reasoning_effort, 'none')
  assert.equal(toggleOff.thinking, undefined)

  const noMap = applyOpencodeThinking({ model: 'mimo-v2.5-free', reasoning_effort: 'high' })
  assert.equal(noMap.reasoning_effort, undefined)
  assert.equal(noMap.thinking, undefined)
})

test('isOpencodeResponsesModel treats muse-spark* as Responses', () => {
  assert.equal(isOpencodeResponsesModel('muse-spark-1.3-contributor-free'), true)
  assert.equal(isOpencodeResponsesModel('muse-spark-1.2-contributor-free'), true)
  assert.equal(isOpencodeResponsesModel('opencode/muse-spark-1.4-contributor-free'), true)
  assert.equal(isOpencodeResponsesModel('laguna-s-2.1-free'), false)
  assert.equal(isOpencodeResponsesModel('mimo-v2.5-free'), false)
  assert.equal(isOpencodeResponsesModel(''), false)
})

const MUSE_RESPONSES_FIXTURE = {
  id: 'resp_muse_spark',
  object: 'response',
  model: 'muse-spark-1.3-contributor-free',
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'think' }] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'pong' }] },
  ],
  usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
}

test('chatToOpencodeResponses builds Zen Responses from a Completions body', () => {
  const thought = applyOpencodeThinking({
    model: 'muse-spark-1.3-contributor-free',
    messages: [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'ping' },
    ],
    max_tokens: 1,
    reasoning_effort: 'xhigh',
    thinking: { type: 'enabled' },
    tools: [{
      type: 'function',
      function: { name: 'echo', description: 'say', parameters: { type: 'object' } },
    }],
    stream: true,
    prompt_cache_key: 'codex-style',
  })
  const { payload: cached } = applyOpencodeCache(thought)
  const sent = chatToOpencodeResponses(cached)
  assert.equal(sent.model, 'muse-spark-1.3-contributor-free')
  assert.deepEqual(sent.input, [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'ping' },
  ])
  assert.equal(sent.max_output_tokens, OPENCODE_MIN_OUTPUT_TOKENS)
  assert.deepEqual(sent.reasoning, { effort: 'xhigh' })
  assert.equal(sent.reasoning_effort, undefined)
  assert.equal(sent.max_tokens, undefined)
  assert.equal(sent.messages, undefined)
  assert.equal(sent.thinking, undefined)
  assert.equal(sent.prompt_cache_key, undefined)
  assert.equal(sent.stream, true)
  assert.deepEqual(sent.tools, [{
    type: 'function',
    name: 'echo',
    description: 'say',
    parameters: { type: 'object' },
  }])
})

test('opencodeResponsesToChat turns a Zen Responses fixture into a chat completion', () => {
  const chat = opencodeResponsesToChat(MUSE_RESPONSES_FIXTURE)
  assert.equal(chat.object, 'chat.completion')
  assert.equal(chat.id, 'resp_muse_spark')
  assert.equal(chat.model, 'muse-spark-1.3-contributor-free')
  assert.equal(chat.choices[0].message.role, 'assistant')
  assert.equal(chat.choices[0].message.content, 'pong')
  assert.equal(chat.choices[0].message.reasoning_content, 'think')
  assert.equal(chat.choices[0].finish_reason, 'stop')
  assert.deepEqual(chat.usage, { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 })
})

test('Responses SSE maps to chat.completion.chunk', () => {
  const mapper = createOpencodeResponsesChatStream({
    model: 'muse-spark-1.3-contributor-free',
    id: 'chatcmpl-opencode',
  })
  const sse = [
    'event: response.created',
    'data: {"type":"response.created","response":{"id":"resp_stream"}}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"pong"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}',
    '',
  ].join('\n')
  const { events } = parseOpencodeSseBlocks(`${sse}\n`)
  const chunks = events.map((event) => mapper.push(event)).filter(Boolean)
  assert.equal(chunks[0].id, 'resp_stream')
  assert.equal(chunks[0].object, 'chat.completion.chunk')
  assert.equal(chunks[0].choices[0].delta.content, 'pong')
  assert.equal(chunks[1].choices[0].finish_reason, 'stop')
  assert.deepEqual(chunks[1].usage, { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 })
})

test('foldOpencodeReasoningContent fills empty MiMo content from reasoning', () => {
  const folded = foldOpencodeReasoningContent({
    object: 'chat.completion',
    choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'only think' } }],
  })
  assert.equal(folded.choices[0].message.content, 'only think')
})

test('cache strips Codex/Grok fields and does not invent a sticky wire id', () => {
  const { payload, cacheSessionId } = applyOpencodeCache({
    session_id: 'sess-opencode',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    prompt_cache_options: { mode: 'explicit' },
    model: OPENCODE_DEFAULT_MODEL,
  })
  assert.equal(cacheSessionId, 'sess-opencode')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.prompt_cache_options, undefined)
  assert.equal(payload.session_id, undefined)
  assert.deepEqual(opencodeCacheHeaders(), {})
  assert.equal(Object.hasOwn(opencodeCacheHeaders(), 'session-id'), false)
  assert.equal(Object.hasOwn(opencodeCacheHeaders(), 'x-grok-conv-id'), false)
  assert.equal(applyOpencodeCache({}).cacheSessionId, OPENCODE_STABLE_SESSION)
  assert.equal(opencodeCacheSessionId('session 1'), 'session-1')
  assert.equal(opencodeCacheSessionId(''), undefined)
})

test('quota is idle-shaped Free with empty rows and no network', async () => {
  const parsed = await fetchOpencodeQuota(opencodeSession())
  assert.equal(parsed.planType, 'free')
  assert.equal(parsed.account, OPENCODE_ACCOUNT)
  assert.deepEqual(parsed.rows, [])
  const store = new QuotaStore({ fetchFn: async () => { throw new Error('no opencode usage API') } })
  const quota = await store.refresh('opencode', OPENCODE_ACCOUNT, opencodeSession())
  assert.equal(quota.status, 'ready')
  assert.equal(quota.planLabel, 'Free')
  assert.deepEqual(quota.rows, [])
})

test('controller snapshot shows quota on the anonymous account; hop omits Authorization', async () => {
  resetOpencodeCatalogCache()
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-'))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    opencodeDiscover: async () => OPENCODE_MODELS,
  })
  const login = await controller.login('opencode')
  assert.equal(login.mode, 'anonymous')
  assert.equal(login.account.account, OPENCODE_ACCOUNT)
  assert.equal(Object.hasOwn(login.account, 'accessToken'), false)
  assert.equal(Object.hasOwn(login.account, 'refreshToken'), false)
  await assert.rejects(controller.importFrom('opencode'), /anonymous/)
  await assert.rejects(controller.useKey('opencode', 'sk-zen'), /anonymous/)

  const snap = await controller.snapshot()
  assert.equal(snap.accounts.opencode.loggedIn, true)
  assert.equal(snap.accounts.opencode.accounts.length, 1)
  const row = snap.accounts.opencode.accounts[0]
  assert.ok(row.quota)
  assert.equal(row.planLabel, 'Free')
  assert.equal(row.account, OPENCODE_ACCOUNT)
  assert.equal(Object.hasOwn(row, 'accessToken'), false)
  assert.equal(snap.catalog.some((item) => item.family === 'opencode'), true)
  assert.equal(snap.catalog.find((item) => item.family === 'opencode').loggedIn, true)
  const stored = await listStoredSessions('opencode', authPath)
  assert.equal(stored.length, 1)
  assert.equal(accountIdOf('opencode', stored[0].session), OPENCODE_ACCOUNT)

  const hops = []
  const proxyFetch = async (url, init) => {
    hops.push({ url: String(url), body: init.body, headers: init.headers })
    return json({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'ok' } }] })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'proxy-key-opencode-test-xx',
    tokens: controller.tokens,
    fetchFn: proxyFetch,
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const responses = await fetch(`http://127.0.0.1:${port}/opencode/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-opencode-test-xx', 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPENCODE_DEFAULT_MODEL }),
    })
    assert.equal(responses.status, 400)
    assert.match((await responses.text()), /Muse Spark/)

    const chat = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-opencode-test-xx', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENCODE_DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        prompt_cache_key: 'codex-style',
        session_id: 'sess-opencode',
        reasoning_effort: 'high',
        thinking: { type: 'enabled' },
      }),
    })
    assert.equal(chat.status, 200)
    assert.equal(hops[0].url, OPENCODE_CHAT_URL)
    const sent = JSON.parse(hops[0].body)
    assert.equal(sent.prompt_cache_key, undefined)
    assert.equal(sent.session_id, undefined)
    assert.equal(sent.reasoning_effort, 'high')
    assert.equal(sent.thinking, undefined)
    assert.equal(Object.hasOwn(hops[0].headers, 'authorization'), false)
    assert.equal(hops[0].headers.authorization, undefined)
    assert.equal(hops[0].headers['user-agent'], 'dsh-plugin-oauth-subs')
    assert.equal(Object.hasOwn(hops[0].headers, 'session-id'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'x-grok-conv-id'), false)
    const hopHeaders = opencodeUpstreamHeaders()
    assert.equal(Object.hasOwn(hopHeaders, 'authorization'), false)
  } finally {
    await proxy.close()
  }
})

test('Muse chat hop targets Zen Responses and other free models stay on Completions', async () => {
  resetOpencodeCatalogCache()
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-muse-'))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    opencodeDiscover: async () => OPENCODE_MODELS,
  })
  await controller.login('opencode')

  const hops = []
  const proxyFetch = async (url, init) => {
    hops.push({ url: String(url), body: init.body, headers: init.headers })
    assert.equal(Object.hasOwn(init.headers ?? {}, 'authorization'), false)
    const target = String(url)
    if (target === OPENCODE_RESPONSES_URL) {
      const sent = JSON.parse(init.body)
      if (sent.stream === true) {
        const sse = [
          'event: response.output_text.delta',
          'data: {"type":"response.output_text.delta","delta":"pong"}',
          '',
          'event: response.completed',
          'data: {"type":"response.completed","response":{"status":"completed"}}',
          '',
        ].join('\n')
        return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }
      return json(MUSE_RESPONSES_FIXTURE)
    }
    if (target === OPENCODE_CHAT_URL) {
      const sent = JSON.parse(init.body)
      if (sent.model === 'mimo-v2.5-free') {
        return json({
          id: 'chat-mimo',
          object: 'chat.completion',
          choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'mimo think' } }],
        })
      }
      return json({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'pong' } }] })
    }
    throw new Error(`unexpected url ${url}`)
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'proxy-key-opencode-muse-xx',
    tokens: controller.tokens,
    fetchFn: proxyFetch,
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const auth = { authorization: 'Bearer proxy-key-opencode-muse-xx', 'content-type': 'application/json' }
  try {
    const muse = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        model: 'muse-spark-1.3-contributor-free',
        messages: [{ role: 'user', content: 'ping' }],
        reasoning_effort: 'xhigh',
        max_tokens: 8,
        prompt_cache_key: 'codex-style',
      }),
    })
    assert.equal(muse.status, 200)
    assert.equal(hops[0].url, OPENCODE_RESPONSES_URL)
    const museSent = JSON.parse(hops[0].body)
    assert.deepEqual(museSent.input, [{ role: 'user', content: 'ping' }])
    assert.deepEqual(museSent.reasoning, { effort: 'xhigh' })
    assert.equal(museSent.max_output_tokens, OPENCODE_MIN_OUTPUT_TOKENS)
    assert.equal(museSent.messages, undefined)
    assert.equal(museSent.reasoning_effort, undefined)
    assert.equal(museSent.prompt_cache_key, undefined)
    assert.equal(Object.hasOwn(hops[0].headers, 'authorization'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'session-id'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'x-grok-conv-id'), false)
    const museBody = await muse.json()
    assert.equal(museBody.object, 'chat.completion')
    assert.equal(museBody.choices[0].message.content, 'pong')
    assert.equal(museBody.choices[0].message.reasoning_content, 'think')

    const streamed = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        model: 'muse-spark-1.2-contributor-free',
        messages: [{ role: 'user', content: 'ping' }],
        stream: true,
      }),
    })
    assert.equal(streamed.status, 200)
    assert.equal(hops[1].url, OPENCODE_RESPONSES_URL)
    assert.equal(JSON.parse(hops[1].body).stream, true)
    const sseText = await streamed.text()
    assert.match(sseText, /chat\.completion\.chunk/)
    assert.match(sseText, /"content":"pong"/)
    assert.match(sseText, /data: \[DONE\]/)

    const native = await fetch(`http://127.0.0.1:${port}/opencode/v1/responses`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        model: 'muse-spark-1.3-contributor-free',
        input: 'ping',
      }),
    })
    assert.equal(native.status, 200)
    assert.equal(hops[2].url, OPENCODE_RESPONSES_URL)
    const nativeBody = await native.json()
    assert.equal(nativeBody.object, 'response')
    assert.equal(nativeBody.output[1].content[0].text, 'pong')

    const laguna = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        model: OPENCODE_DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        reasoning_effort: 'low',
      }),
    })
    assert.equal(laguna.status, 200)
    assert.equal(hops[3].url, OPENCODE_CHAT_URL)
    assert.equal((await laguna.json()).choices[0].message.content, 'pong')

    const mimo = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        model: 'mimo-v2.5-free',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(mimo.status, 200)
    assert.equal(hops[4].url, OPENCODE_CHAT_URL)
    assert.equal((await mimo.json()).choices[0].message.content, 'mimo think')
  } finally {
    await proxy.close()
  }
})

test('empty-roster auto-enable writes sentinel, hops without Authorization, and persists oauth-opencode', async () => {
  resetOpencodeCatalogCache()
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-auto-'))
  const authPath = join(dir, 'auth.json')
  const yaml = { providers: {} }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    opencodeAutoEnable: true,
    opencodeDiscover: (opts) => refreshOpencodeCatalog({ ...opts, force: true }),
    fetchFn: async (url, init) => {
      if (String(url) === OPENCODE_MODELS_URL) {
        assert.equal(Object.hasOwn(init?.headers ?? {}, 'authorization'), false)
        assert.notEqual(init?.headers?.authorization, `Bearer ${OPENCODE_ANON_TOKEN}`)
        return json({
          data: [
            { id: 'laguna-s-2.1-free' },
            { id: 'mimo-v2.5-free' },
            { id: 'ox-alpha-free' },
            { id: 'big-pickle' },
          ],
        })
      }
      if (String(url) === OPENCODE_MODELS_DEV_URL) {
        assert.equal(Object.hasOwn(init?.headers ?? {}, 'authorization'), false)
        return json({
          opencode: {
            models: {
              'laguna-s-2.1-free': {
                reasoning: true,
                reasoning_options: [{ type: 'effort', values: ['low', 'medium', 'high'] }],
                modalities: { input: ['text'] },
                limit: { context: 256000, output: 32000 },
              },
              'mimo-v2.5-free': {
                reasoning: true,
                reasoning_options: [],
                modalities: { input: ['text', 'image', 'audio', 'video'] },
                limit: { context: 200000, output: 32000 },
              },
              'hy3-free': {
                reasoning: true,
                modalities: { input: ['text'] },
                limit: { context: 200000, output: 16000 },
              },
            },
          },
        })
      }
      throw new Error(`unexpected fetch ${url}`)
    },
    settings: {
      get: async (name) => name === 'llm-pi-ai' ? yaml : undefined,
      mutate: async (target, mutations) => {
        if (target !== 'llm-pi-ai') return
        for (const row of mutations) {
          const key = row.path?.[1]
          if (row.op === 'unset') delete yaml.providers[key]
          else if (row.op === 'set') yaml.providers[key] = row.value
        }
      },
    },
  })
  assert.equal((await listStoredSessions('opencode', authPath)).length, 0)
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.opencode.loggedIn, true)
  assert.equal(snap.accounts.opencode.accounts.length, 1)
  assert.equal(snap.accounts.opencode.accounts[0].account, OPENCODE_ACCOUNT)
  const stored = await listStoredSessions('opencode', authPath)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].session.accessToken, OPENCODE_ANON_TOKEN)
  assert.equal(stored[0].session.source, 'anonymous')

  const synced = await controller.sync()
  const route = yaml.providers['oauth-opencode']
  assert.ok(route)
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.api, 'openai-completions')
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/opencode')
  assert.equal(route.baseURL.endsWith('/opencode/v1'), false)
  assert.equal(route.apiKeyEnv, 'DSH_OAUTH_SUBS_API_KEY')
  assert.equal(route.compat.supportsReasoningEffort, true)
  assert.equal(route.compat.thinkingFormat, 'openai')
  assert.deepEqual(route.models.map((model) => model.id), ['laguna-s-2.1-free', 'mimo-v2.5-free'])
  assert.equal(synced.routes.some((row) => row.provider === 'oauth-opencode'), true)
  assert.deepEqual(route.models.find((model) => model.id === 'laguna-s-2.1-free').reasoningEfforts, OPENCODE_REASONING_LAGUNA)
  assert.equal(Object.hasOwn(route.models.find((model) => model.id === 'mimo-v2.5-free'), 'reasoningEfforts'), false)
  assert.deepEqual(route.models.find((model) => model.id === 'mimo-v2.5-free').input, ['text', 'image'])
  for (const model of route.models) {
    assert.equal(model.id.endsWith('-free'), true)
    assert.notEqual(model.id, 'hy3-free')
    assert.notEqual(model.id, 'big-pickle')
    assert.notEqual(model.id, 'ox-alpha-free')
    assert.equal(model.input.includes('audio'), false)
  }

  const hops = []
  const proxyFetch = async (url, init) => {
    hops.push({ url: String(url), headers: init.headers })
    assert.equal(Object.hasOwn(init.headers ?? {}, 'authorization'), false)
    assert.notEqual(init.headers?.authorization, `Bearer ${OPENCODE_ANON_TOKEN}`)
    return json({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'pong' } }] })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'proxy-key-opencode-auto-xx',
    tokens: controller.tokens,
    fetchFn: proxyFetch,
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const chat = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-opencode-auto-xx', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENCODE_DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(chat.status, 200)
    assert.equal((await chat.json()).choices[0].message.content, 'pong')
    assert.equal(hops[0].url, OPENCODE_CHAT_URL)
    assert.equal(Object.hasOwn(hops[0].headers, 'authorization'), false)
    assert.equal(hops[0].headers.authorization, undefined)
    assert.notEqual(hops[0].headers.authorization, 'Bearer anonymous')
    assert.equal(hops[0].headers['user-agent'], 'dsh-plugin-oauth-subs')
  } finally {
    await proxy.close()
  }

  const again = await controller.login('opencode')
  assert.equal(again.mode, 'anonymous')
  assert.equal((await listStoredSessions('opencode', authPath)).length, 1)
  resetOpencodeCatalogCache()
})

test('empty-roster auto-enable does not overwrite a stored opencode session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-keep-'))
  const authPath = join(dir, 'auth.json')
  const kept = { ...opencodeSession(), account: 'KeepMe' }
  await saveSession('opencode', kept, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    opencodeAutoEnable: true,
    settings: { mutate: async () => undefined },
  })
  await controller.snapshot()
  const login = await controller.login('opencode')
  assert.equal(login.account.account, 'KeepMe')
  const rows = await listStoredSessions('opencode', authPath)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].session.account, 'KeepMe')
})

test('saving a second anonymous session stays one account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-dup-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('opencode', opencodeSession(), authPath)
  await saveSession('opencode', opencodeSession(), authPath)
  const rows = await listStoredSessions('opencode', authPath)
  assert.equal(rows.length, 1)
})
