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
  OPENCODE_ANON_TOKEN,
  OPENCODE_CHAT_URL,
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_GO_ORIGIN,
  OPENCODE_MODELS,
  OPENCODE_MODELS_DEV_URL,
  OPENCODE_MODELS_URL,
  OPENCODE_REASONING_GLM,
  OPENCODE_REASONING_MUSE,
  OPENCODE_RESPONSES_URL,
  OPENCODE_ZEN_FREE,
  isOpencodeGoSlug,
  isOpencodeResponsesModel,
  isOpencodeZenFreeSlug,
  opencodeSession,
  opencodeSourceLabel,
  opencodeUpstreamHeaders,
  parseOpencodeApiKey,
  refreshOpencode,
} from '../lib/oauth/opencode/index.js'
import {
  OPENCODE_STABLE_SESSION,
  applyOpencodeCache,
  opencodeCacheHeaders,
  opencodeCacheSessionId,
} from '../lib/oauth/opencode/cache.js'
import { OPENCODE_IMPORT_EMPTY, importOpencodeAuth } from '../lib/oauth/opencode/import.js'
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

const GO_KEY = 'sk-opencode-go-test-key-xx'
const PROXY_KEY = 'proxy-key-opencode-test-xx'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('keyed session never uses the anonymous sentinel', () => {
  const session = opencodeSession({ accessToken: GO_KEY })
  assert.notEqual(session.accessToken, OPENCODE_ANON_TOKEN)
  assert.equal(session.accessToken, GO_KEY)
  assert.equal(session.source, 'paste')
  assert.equal(session.planType, 'go')
  assert.match(session.account, /^opencode-[0-9a-f]{8}$/)
  const pub = publicSession('opencode', session)
  assert.equal(pub.planLabel, 'Go Free')
  assert.equal(pub.method, 'paste')
  assert.equal(Object.hasOwn(pub, 'accessToken'), false)
  assert.equal(opencodeSourceLabel('paste'), undefined)
  assert.equal(opencodeSourceLabel('env'), 'env')
  assert.equal(formatPlanLabel('go', 'opencode'), 'Go Free')
  assert.equal(formatPlanLabel('free', 'opencode'), 'Go Free')
  assert.throws(() => parseOpencodeApiKey(OPENCODE_ANON_TOKEN), /sentinel/)
  assert.throws(() => opencodeSession(), /empty/)
})

test('refresh keeps the key and never expires', async () => {
  const next = await refreshOpencode(opencodeSession({ accessToken: GO_KEY }))
  assert.equal(next.accessToken, GO_KEY)
  assert.equal(next.source, 'paste')
  assert.ok(next.expiresAt > Date.now() + 365 * 24 * 60 * 60_000)
})

test('catalog is Completions at /opencode on the Go floor, not Zen free', () => {
  const ids = ownedProviderIds('oauth')
  assert.equal(ids.includes('oauth-opencode'), true)
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { opencode: true },
  })
  const route = providers['oauth-opencode']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.displayName, 'OAuth · OpenCode Go Free')
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/opencode')
  assert.equal(route.compat.supportsReasoningEffort, true)
  assert.equal(route.compat.thinkingFormat, 'openai')
  const flash = route.models.find((model) => model.id === OPENCODE_DEFAULT_MODEL)
  assert.deepEqual(flash.reasoningEfforts, OPENCODE_REASONING_GLM)
  assert.deepEqual(flash.input, ['text', 'image'])
  assert.equal(route.models.some((model) => model.id === 'glm-5.3-flash'), true)
  assert.equal(route.models.some((model) => model.id === 'mimo-v2.5'), true)
  for (const id of OPENCODE_ZEN_FREE) {
    assert.equal(route.models.some((model) => model.id === id), false)
  }
  assert.equal(OPENCODE_CHAT_URL.startsWith(OPENCODE_GO_ORIGIN), true)
  assert.equal(OPENCODE_MODELS_URL, `${OPENCODE_GO_ORIGIN}/models`)
  assert.equal(OPENCODE_CHAT_URL.includes('/zen/v1/'), false)
  resetOpencodeCatalogCache()
  assert.equal(catalogProviders({ prefix: 'oauth', origin: 'http://x' })['oauth-opencode'].models.length, OPENCODE_MODELS.length)
})

test('isOpencodeGoSlug drops Zen free slugs and keeps Go ids', () => {
  assert.equal(isOpencodeGoSlug('glm-5.3-flash'), true)
  assert.equal(isOpencodeGoSlug('opencode-go/mimo-v2.5'), true)
  assert.equal(isOpencodeGoSlug('ox-alpha-free'), true)
  assert.equal(isOpencodeGoSlug('muse-spark-1.3-contributor'), true)
  assert.equal(isOpencodeZenFreeSlug('big-pickle'), true)
  assert.equal(isOpencodeZenFreeSlug('ling-3.0-flash-fin-free'), true)
  assert.equal(isOpencodeZenFreeSlug('mimo-v2.5-free'), true)
  assert.equal(isOpencodeZenFreeSlug('muse-spark-1.3-contributor-free'), true)
  assert.equal(isOpencodeGoSlug('big-pickle'), false)
  assert.equal(isOpencodeGoSlug('ling-3.0-flash-fin-free'), false)
  assert.equal(isOpencodeGoSlug(''), false)
  assert.equal(OPENCODE_MODELS.some((model) => OPENCODE_ZEN_FREE.has(model.id)), false)
})

test('live catalog keeps Go ids, drops Zen free, and hops /zen/go/v1/models', async () => {
  resetOpencodeCatalogCache()
  const models = toOpencodePickerModels({
    data: [
      { id: 'ling-3.0-flash-fin-free' },
      { id: 'big-pickle' },
      { id: 'glm-5.3-flash' },
      { id: 'mimo-v2.5-free' },
      { id: 'mimo-v2.5' },
      { id: 'mimo-v2.5' },
      { id: 'ox-alpha-free' },
    ],
  })
  assert.deepEqual(models.map((model) => model.id), ['glm-5.3-flash', 'mimo-v2.5', 'ox-alpha-free'])

  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers })
    assert.equal(Object.hasOwn(init.headers ?? {}, 'authorization'), false)
    if (String(url) === OPENCODE_MODELS_DEV_URL) return json({ 'opencode-go': { models: {} } })
    return json({
      data: [
        { id: 'big-pickle' },
        { id: 'ling-3.0-flash-fin-free' },
        { id: 'glm-5.3-flash' },
        { id: 'kimi-k2.7-code' },
      ],
    })
  }
  const live = await refreshOpencodeCatalog({ fetchFn, force: true })
  assert.equal(calls.some((row) => row.url === OPENCODE_MODELS_URL), true)
  assert.equal(calls.some((row) => row.url.includes('/zen/v1/models')), false)
  assert.equal(calls.some((row) => row.url === OPENCODE_MODELS_DEV_URL), true)
  assert.deepEqual(live.map((model) => model.id), ['glm-5.3-flash', 'kimi-k2.7-code'])
  assert.equal(live.some((model) => model.id === 'big-pickle'), false)

  resetOpencodeCatalogCache()
  const empty = await refreshOpencodeCatalog({
    fetchFn: async () => json({ data: [{ id: 'big-pickle' }, { id: 'ling-3.0-flash-fin-free' }] }),
    force: true,
  })
  assert.equal(empty.length, OPENCODE_MODELS.length)
  assert.equal(empty.some((model) => model.id === 'glm-5.3-flash'), true)
  assert.equal(empty.some((model) => model.id === 'big-pickle'), false)
})

const MODELS_DEV_GO = {
  'opencode-go': {
    models: {
      'glm-5.3-flash': {
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['low', 'high', 'max'] }],
        modalities: { input: ['text', 'image', 'video', 'pdf'] },
        limit: { context: 1000000, output: 131072 },
      },
      'mimo-v2.5': {
        reasoning: true,
        reasoning_options: [],
        modalities: { input: ['text', 'image', 'audio', 'video'] },
        limit: { context: 1000000, output: 128000 },
      },
      'muse-spark-1.3-contributor': {
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['minimal', 'low', 'medium', 'high', 'xhigh'] }],
        modalities: { input: ['text', 'image', 'video', 'pdf'] },
        limit: { context: 1048576, output: 131072 },
      },
      'big-pickle': {
        reasoning: true,
        modalities: { input: ['text'] },
        limit: { context: 200000, output: 32000 },
      },
    },
  },
  opencode: {
    models: {
      'ling-3.0-flash-fin-free': {
        reasoning: true,
        reasoning_options: [{ type: 'toggle' }],
        modalities: { input: ['text'] },
        limit: { context: 262144, output: 32768 },
      },
    },
  },
}

test('models.dev overlay uses opencode-go and does not add Zen free slugs', () => {
  assert.deepEqual(opencodePickerInput(['text', 'image', 'audio', 'video']), ['text', 'image'])
  const go = toOpencodePickerModels({
    data: [
      { id: 'glm-5.3-flash' },
      { id: 'mimo-v2.5' },
      { id: 'muse-spark-1.3-contributor' },
      { id: 'ling-3.0-flash-fin-free' },
    ],
  })
  const rows = overlayOpencodeModelsDev(go, MODELS_DEV_GO)
  assert.deepEqual(rows.map((model) => model.id), ['glm-5.3-flash', 'mimo-v2.5', 'muse-spark-1.3-contributor'])
  const byId = Object.fromEntries(rows.map((model) => [model.id, model]))
  assert.deepEqual(byId['glm-5.3-flash'].reasoningEfforts, OPENCODE_REASONING_GLM)
  assert.deepEqual(byId['glm-5.3-flash'].input, ['text', 'image'])
  assert.equal(Object.hasOwn(byId['mimo-v2.5'], 'reasoningEfforts'), false)
  assert.deepEqual(byId['mimo-v2.5'].input, ['text', 'image'])
  assert.deepEqual(byId['muse-spark-1.3-contributor'].reasoningEfforts, OPENCODE_REASONING_MUSE)
})

test('hop maps reasoning_effort and never sends thinking with it', () => {
  const flash = applyOpencodeThinking({
    model: 'glm-5.3-flash',
    reasoning_effort: 'high',
    thinking: { type: 'enabled' },
  })
  assert.equal(flash.reasoning_effort, 'high')
  assert.equal(flash.thinking, undefined)

  const off = applyOpencodeThinking({ model: 'hy3', reasoning_effort: 'off' })
  assert.equal(off.reasoning_effort, 'none')

  const noMap = applyOpencodeThinking({ model: 'mimo-v2.5', reasoning_effort: 'high' })
  assert.equal(noMap.reasoning_effort, undefined)
})

test('isOpencodeResponsesModel treats Luna / Grok 4.x / Muse as Responses', () => {
  assert.equal(isOpencodeResponsesModel('muse-spark-1.3-contributor'), true)
  assert.equal(isOpencodeResponsesModel('gpt-5.6-luna'), true)
  assert.equal(isOpencodeResponsesModel('grok-4.6'), true)
  assert.equal(isOpencodeResponsesModel('glm-5.3-flash'), false)
  assert.equal(isOpencodeResponsesModel('mimo-v2.5'), false)
})

const MUSE_RESPONSES_FIXTURE = {
  id: 'resp_muse_spark',
  object: 'response',
  model: 'muse-spark-1.3-contributor',
  status: 'completed',
  output: [
    { type: 'reasoning', summary: [{ type: 'summary_text', text: 'think' }] },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'pong' }] },
  ],
  usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
}

test('chatToOpencodeResponses builds Go Responses from a Completions body', () => {
  const thought = applyOpencodeThinking({
    model: 'muse-spark-1.3-contributor',
    messages: [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'ping' },
    ],
    max_tokens: 1,
    reasoning_effort: 'xhigh',
    thinking: { type: 'enabled' },
    stream: true,
    prompt_cache_key: 'codex-style',
  })
  const { payload: cached } = applyOpencodeCache(thought)
  const sent = chatToOpencodeResponses(cached)
  assert.equal(sent.model, 'muse-spark-1.3-contributor')
  assert.deepEqual(sent.input, [
    { role: 'system', content: 'be brief' },
    { role: 'user', content: 'ping' },
  ])
  assert.equal(sent.max_output_tokens, OPENCODE_MIN_OUTPUT_TOKENS)
  assert.deepEqual(sent.reasoning, { effort: 'xhigh' })
  assert.equal(sent.prompt_cache_key, undefined)
})

test('opencodeResponsesToChat turns a Go Responses fixture into a chat completion', () => {
  const chat = opencodeResponsesToChat(MUSE_RESPONSES_FIXTURE)
  assert.equal(chat.object, 'chat.completion')
  assert.equal(chat.choices[0].message.content, 'pong')
  assert.equal(chat.choices[0].message.reasoning_content, 'think')
})

test('Responses SSE maps to chat.completion.chunk', () => {
  const mapper = createOpencodeResponsesChatStream({
    model: 'gpt-5.6-luna',
    id: 'chatcmpl-opencode',
  })
  const sse = [
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"pong"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}',
    '',
  ].join('\n')
  const { events } = parseOpencodeSseBlocks(`${sse}\n`)
  const chunks = events.map((event) => mapper.push(event)).filter(Boolean)
  assert.equal(chunks[0].object, 'chat.completion.chunk')
  assert.equal(chunks[0].choices[0].delta.content, 'pong')
})

test('foldOpencodeReasoningContent fills empty MiMo content from reasoning', () => {
  const folded = foldOpencodeReasoningContent({
    object: 'chat.completion',
    choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'only think' } }],
  })
  assert.equal(folded.choices[0].message.content, 'only think')
})

test('cache strips Codex/Grok fields and stamps official x-opencode-session', () => {
  const { payload, cacheSessionId } = applyOpencodeCache({
    session_id: 'sess-opencode',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    model: OPENCODE_DEFAULT_MODEL,
  })
  assert.equal(cacheSessionId, 'sess-opencode')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.session_id, undefined)
  assert.deepEqual(opencodeCacheHeaders('sess-opencode'), { 'x-opencode-session': 'sess-opencode' })
  assert.equal(Object.hasOwn(opencodeCacheHeaders(), 'session-id'), false)
  assert.equal(Object.hasOwn(opencodeCacheHeaders(), 'x-grok-conv-id'), false)
  assert.equal(applyOpencodeCache({}).cacheSessionId, OPENCODE_STABLE_SESSION)
  assert.equal(opencodeCacheSessionId('session 1'), 'session-1')
})

test('quota is idle-shaped Go with empty rows and no network', async () => {
  const session = opencodeSession({ accessToken: GO_KEY, account: 'go-user' })
  const parsed = await fetchOpencodeQuota(session)
  assert.equal(parsed.planType, 'go')
  assert.equal(parsed.account, 'go-user')
  assert.deepEqual(parsed.rows, [])
  const store = new QuotaStore({ fetchFn: async () => { throw new Error('no opencode usage API') } })
  const quota = await store.refresh('opencode', 'go-user', session)
  assert.equal(quota.status, 'ready')
  assert.equal(quota.planLabel, 'Go Free')
})

test('controller paste key hops Go Completions with Bearer and x-opencode-session', async () => {
  resetOpencodeCatalogCache()
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-'))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    opencodeDiscover: async () => OPENCODE_MODELS,
  })
  await assert.rejects(controller.login('opencode'), /paste form/)
  const login = await controller.useKey('opencode', GO_KEY)
  assert.equal(Object.hasOwn(login.account, 'accessToken'), false)
  assert.equal(login.account.planLabel, 'Go Free')

  const snap = await controller.snapshot()
  assert.equal(snap.accounts.opencode.loggedIn, true)
  assert.equal(snap.accounts.opencode.accounts.length, 1)
  const stored = await listStoredSessions('opencode', authPath)
  assert.equal(stored[0].session.accessToken, GO_KEY)
  assert.equal(accountIdOf('opencode', stored[0].session), stored[0].session.account)

  const hops = []
  const proxyFetch = async (url, init) => {
    hops.push({ url: String(url), body: init.body, headers: init.headers })
    return json({ id: 'chat', choices: [{ message: { role: 'assistant', content: 'ok' } }] })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: PROXY_KEY,
    tokens: controller.tokens,
    fetchFn: proxyFetch,
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const responses = await fetch(`http://127.0.0.1:${port}/opencode/v1/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${PROXY_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: OPENCODE_DEFAULT_MODEL }),
    })
    assert.equal(responses.status, 400)
    assert.match((await responses.text()), /Luna|Grok|Muse/)

    const chat = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${PROXY_KEY}`, 'content-type': 'application/json' },
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
    assert.equal(hops[0].url.startsWith('https://opencode.ai/zen/go/v1'), true)
    assert.equal(hops[0].url.includes('/zen/v1/'), false)
    const sent = JSON.parse(hops[0].body)
    assert.equal(sent.prompt_cache_key, undefined)
    assert.equal(sent.reasoning_effort, 'high')
    assert.equal(hops[0].headers.authorization, `Bearer ${GO_KEY}`)
    assert.equal(hops[0].headers['x-opencode-session'], 'sess-opencode')
    assert.equal(Object.hasOwn(hops[0].headers, 'session-id'), false)
    assert.equal(Object.hasOwn(hops[0].headers, 'x-grok-conv-id'), false)
  } finally {
    await proxy.close()
  }
})

test('Muse / Luna hop targets Go Responses; Completions stay off /zen/v1', async () => {
  resetOpencodeCatalogCache()
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-muse-'))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    opencodeDiscover: async () => OPENCODE_MODELS,
  })
  await controller.useKey('opencode', GO_KEY)

  const hops = []
  const proxyFetch = async (url, init) => {
    hops.push({ url: String(url), body: init.body, headers: init.headers })
    assert.equal(init.headers.authorization, `Bearer ${GO_KEY}`)
    const target = String(url)
    if (target === OPENCODE_RESPONSES_URL) return json(MUSE_RESPONSES_FIXTURE)
    if (target === OPENCODE_CHAT_URL) {
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
        model: 'muse-spark-1.3-contributor',
        messages: [{ role: 'user', content: 'ping' }],
        reasoning_effort: 'xhigh',
      }),
    })
    assert.equal(muse.status, 200)
    assert.equal(hops[0].url, OPENCODE_RESPONSES_URL)
    assert.equal(hops[0].url.includes('/zen/go/v1/responses'), true)
    const museBody = await muse.json()
    assert.equal(museBody.choices[0].message.content, 'pong')

    const flash = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        model: OPENCODE_DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(flash.status, 200)
    assert.equal(hops[1].url, OPENCODE_CHAT_URL)
    assert.equal(hops[1].url.includes('/zen/v1/chat'), false)
  } finally {
    await proxy.close()
  }
})

test('empty roster does not auto-enable; env import writes a key and syncs Go models', async () => {
  resetOpencodeCatalogCache()
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-auto-'))
  const authPath = join(dir, 'auth.json')
  const yaml = { providers: {} }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    opencodeAutoImport: true,
    opencodeDiscover: (opts) => refreshOpencodeCatalog({ ...opts, force: true }),
    fetchFn: async (url, init) => {
      if (String(url) === OPENCODE_MODELS_URL) {
        assert.equal(Object.hasOwn(init?.headers ?? {}, 'authorization'), false)
        return json({
          data: [
            { id: 'big-pickle' },
            { id: 'ling-3.0-flash-fin-free' },
            { id: 'glm-5.3-flash' },
            { id: 'mimo-v2.5' },
            { id: 'ox-alpha-free' },
          ],
        })
      }
      if (String(url) === OPENCODE_MODELS_DEV_URL) {
        return json({
          'opencode-go': {
            models: {
              'glm-5.3-flash': {
                reasoning: true,
                reasoning_options: [{ type: 'effort', values: ['low', 'high', 'max'] }],
                modalities: { input: ['text', 'image'] },
                limit: { context: 1000000, output: 131072 },
              },
              'mimo-v2.5': {
                reasoning: true,
                reasoning_options: [],
                modalities: { input: ['text', 'image'] },
                limit: { context: 1000000, output: 128000 },
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
  const empty = await controller.snapshot()
  assert.equal(empty.accounts.opencode.loggedIn, false)
  assert.equal((await listStoredSessions('opencode', authPath)).length, 0)

  process.env.OPENCODE_API_KEY = GO_KEY
  try {
    const imported = await controller.importFrom('opencode')
    assert.equal(imported.source, 'env')
    assert.equal(imported.account.planLabel, 'Go Free')
    const stored = await listStoredSessions('opencode', authPath)
    assert.equal(stored[0].session.accessToken, GO_KEY)
    const snap = await controller.snapshot()
    assert.equal(snap.accounts.opencode.loggedIn, true)
    const synced = await controller.sync()
    const route = yaml.providers['oauth-opencode']
    assert.ok(route)
    assert.equal(route.api, HARNESS_COMPLETIONS_API)
    assert.deepEqual(route.models.map((model) => model.id), ['glm-5.3-flash', 'mimo-v2.5', 'ox-alpha-free'])
    assert.equal(route.models.some((model) => model.id === 'big-pickle'), false)
    assert.equal(route.models.some((model) => model.id === 'ling-3.0-flash-fin-free'), false)
    assert.equal(synced.routes.some((row) => row.provider === 'oauth-opencode'), true)
  } finally {
    delete process.env.OPENCODE_API_KEY
  }
})

test('empty-roster auto-import does not overwrite a stored opencode session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-keep-'))
  const authPath = join(dir, 'auth.json')
  const kept = opencodeSession({ accessToken: GO_KEY, account: 'KeepMe' })
  await saveSession('opencode', kept, authPath)
  process.env.OPENCODE_GO_API_KEY = 'sk-other-opencode-go-key-yy'
  try {
    const controller = new AuthController({
      authPath,
      prefix: 'oauth',
      origin: () => 'http://127.0.0.1:8318',
      opencodeAutoImport: true,
      settings: { mutate: async () => undefined },
    })
    await controller.snapshot()
    const rows = await listStoredSessions('opencode', authPath)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].session.account, 'KeepMe')
    assert.equal(rows[0].session.accessToken, GO_KEY)
  } finally {
    delete process.env.OPENCODE_GO_API_KEY
  }
})

test('leftover anonymous sentinel is dropped and not treated as logged in', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-anon-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('opencode', {
    accessToken: OPENCODE_ANON_TOKEN,
    refreshToken: OPENCODE_ANON_TOKEN,
    expiresAt: Date.now() + 1000,
    account: 'Anonymous',
    source: 'anonymous',
    planType: 'free',
  }, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.opencode.loggedIn, false)
  assert.equal((await listStoredSessions('opencode', authPath)).length, 0)
})

test('import without env is empty; hop headers omit Authorization until a key exists', async () => {
  await assert.rejects(importOpencodeAuth({ env: {} }), (error) => error.code === OPENCODE_IMPORT_EMPTY)
  const headers = opencodeUpstreamHeaders()
  assert.equal(Object.hasOwn(headers, 'authorization'), false)
  assert.equal(opencodeUpstreamHeaders(opencodeSession({ accessToken: GO_KEY })).authorization, `Bearer ${GO_KEY}`)
})
