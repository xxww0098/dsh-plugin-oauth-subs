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
  syncHarnessModels,
} from '../lib/oauth/models.js'
import {
  OLLAMA_CHAT_URL,
  OLLAMA_ME_URL,
  OLLAMA_MODELS,
  OLLAMA_REASONING,
  OLLAMA_SHOW_URL,
  OLLAMA_TAGS_URL,
  OLLAMA_USAGE_URL,
  inferOllamaInput,
  isOllamaOpaqueAccount,
  isOllamaRetiredModel,
  ollamaContextWindow,
  ollamaDefaultAccount,
  ollamaInput,
  ollamaShowContextLength,
  ollamaShowInput,
  ollamaSnapshotContextWindow,
  ollamaSession,
  ollamaSourceLabel,
  parseOllamaApiKey,
  parseOllamaMe,
} from '../lib/oauth/ollama/index.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { QuotaStore, parseOllamaUsage } from '../lib/oauth/quota.js'
import {
  OLLAMA_IMPORT_EMPTY,
  importOllamaAuth,
  resolveOllamaLocalCredentials,
} from '../lib/oauth/ollama/import.js'
import {
  ollamaCatalogModels,
  refreshOllamaCatalog,
  resetOllamaCatalogCache,
  toOllamaPickerModels,
} from '../lib/oauth/ollama/catalog.js'
import {
  OLLAMA_STABLE_SESSION,
  applyOllamaCache,
  ollamaCacheHeaders,
  ollamaCacheSessionId,
  resetOllamaPins,
} from '../lib/oauth/ollama/cache.js'
import { createProxy } from '../lib/oauth/proxy.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('parseOllamaApiKey rejects empty and registry public keys', () => {
  assert.equal(parseOllamaApiKey('  sk-ollama-test-key  '), 'sk-ollama-test-key')
  assert.throws(() => parseOllamaApiKey('short'), /empty/)
  assert.throws(() => parseOllamaApiKey('-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----'), /registry public key/)
})

test('ollama session round-trip keeps source and never stores a plan slug', () => {
  const session = ollamaSession({ accessToken: 'sk-ollama-round-trip', source: 'paste' })
  assert.equal(session.source, 'paste')
  assert.equal(session.accessToken, 'sk-ollama-round-trip')
  assert.equal(session.refreshToken, 'sk-ollama-round-trip')
  assert.equal(session.account, ollamaDefaultAccount('sk-ollama-round-trip'))
  assert.equal(session.planType, undefined)
  const pub = publicSession('ollama', session)
  assert.equal(pub.account, session.account)
  assert.equal(pub.method, 'paste')
  assert.equal(pub.methodLabel, 'key')
  assert.equal(pub.planLabel, undefined)
  assert.equal(ollamaSourceLabel('env'), 'env')
  assert.notEqual(accountIdOf('ollama', session), accountIdOf('ollama', ollamaSession({
    accessToken: 'sk-ollama-other-key',
    source: 'env',
  })))
})

test('catalog is Completions at /ollama, not /ollama/v1', () => {
  const ids = ownedProviderIds('oauth')
  assert.equal(ids.includes('oauth-ollama'), true)
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { ollama: true },
  })
  const route = providers['oauth-ollama']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/ollama')
  assert.equal(route.baseURL.endsWith('/ollama'), true)
  assert.equal(route.baseURL.endsWith('/ollama/v1'), false)
  for (const model of route.models) {
    const keys = Object.keys(model.reasoningEfforts ?? {})
    for (const key of keys) {
      assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
    }
    assert.equal(Object.hasOwn(model.reasoningEfforts, 'none'), false)
  }
  assert.deepEqual(route.models.find((model) => model.id === 'gpt-oss:120b').reasoningEfforts, OLLAMA_REASONING)
  assert.equal(route.models.find((model) => model.id === 'gpt-oss:120b').reasoningEfforts.off, 'none')
  resetOllamaCatalogCache()
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  assert.equal(catalog['oauth-ollama'].models.length, 19)
  assert.equal(catalog['oauth-ollama'].models.length, OLLAMA_MODELS.length)
})

test('static OLLAMA_MODELS windows and input match the Cloud /api/show snapshot', () => {
  const snapshot = {
    'deepseek-v4-flash:0731': { window: 1_048_576, vision: false },
    'deepseek-v4-pro:0813': { window: 1_048_576, vision: false },
    'gemma4:31b': { window: 262_144, vision: true },
    'glm-5.1': { window: 202_752, vision: false },
    'glm-5.2': { window: 1_048_576, vision: false },
    'glm-5.3': { window: 1_048_576, vision: false },
    'glm-5.3-flash': { window: 1_048_576, vision: true },
    'gpt-oss:120b': { window: 131_072, vision: false },
    'gpt-oss:20b': { window: 131_072, vision: false },
    'kimi-k2.6': { window: 262_144, vision: true },
    'kimi-k2.7-code': { window: 262_144, vision: true },
    'kimi-k3': { window: 1_048_576, vision: true },
    'minimax-m2.7': { window: 196_608, vision: false },
    'minimax-m3': { window: 512_000, vision: true },
    'mistral-large-3:675b': { window: 262_144, vision: true },
    'nemotron-3-nano:30b': { window: 262_144, vision: false },
    'nemotron-3-super': { window: 262_144, vision: false },
    'nemotron-3-ultra': { window: 262_144, vision: false },
    'qwen3.5:397b': { window: 262_144, vision: true },
  }
  assert.equal(OLLAMA_MODELS.length, 19)
  assert.deepEqual(OLLAMA_MODELS.map((model) => model.id), Object.keys(snapshot))
  for (const model of OLLAMA_MODELS) {
    const row = snapshot[model.id]
    assert.equal(model.contextWindow, row.window)
    assert.equal(ollamaSnapshotContextWindow(model.id), row.window)
    assert.equal(ollamaContextWindow(model.id), row.window)
    assert.deepEqual(model.input, row.vision ? ['text', 'image'] : ['text'])
    assert.equal(model.input.includes('audio'), false)
    assert.equal(isOllamaRetiredModel(model.id), false)
  }
  assert.deepEqual(OLLAMA_MODELS.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(OLLAMA_MODELS.find((model) => model.id === 'glm-5.3').input, ['text'])
  assert.deepEqual(OLLAMA_MODELS.find((model) => model.id === 'qwen3.5:397b').input, ['text', 'image'])
  assert.deepEqual(OLLAMA_MODELS.find((model) => model.id === 'kimi-k3').input, ['text', 'image'])
  assert.deepEqual(OLLAMA_MODELS.find((model) => model.id === 'mistral-large-3:675b').input, ['text', 'image'])
  assert.deepEqual(OLLAMA_MODELS.find((model) => model.id === 'gpt-oss:120b').input, ['text'])
  assert.deepEqual(inferOllamaInput('gemma4:31b'), ['text', 'image'])
  assert.deepEqual(inferOllamaInput('glm-5.3-flash'), ['text'])
  assert.equal(ollamaShowContextLength({ model_info: { 'glm.context_length': 1_048_576 } }), 1_048_576)
  assert.equal(ollamaContextWindow('new-cloud-model'), 128_000)
})

test('ollamaShowInput reads capabilities; missing array falls back to name regex', () => {
  assert.deepEqual(ollamaShowInput({ capabilities: ['completion', 'vision'] }), ['text', 'image'])
  assert.deepEqual(ollamaShowInput({ capabilities: ['VISION'] }), ['text', 'image'])
  assert.deepEqual(ollamaShowInput({ capabilities: ['completion'] }), ['text'])
  assert.deepEqual(ollamaShowInput({ capabilities: ['completion', 'audio'] }), ['text'])
  assert.equal(ollamaShowInput({ details: {} }), undefined)
  assert.equal(ollamaShowInput(null), undefined)
  assert.deepEqual(ollamaInput('glm-5.3-flash', { capabilities: ['vision'] }), ['text', 'image'])
  assert.deepEqual(ollamaInput('glm-5.3-flash', { details: {} }), ['text'])
  assert.deepEqual(ollamaInput('gemma4:31b', { details: {} }), ['text', 'image'])
})

const LIVE_OLLAMA_USAGE = {
  activity: { cost: '0.00000', period: { type: 'last_4_weeks' }, models: [] },
  limits: {
    session: { usage: 0, models: [] },
    weekly: {
      usage: 0.095,
      models: [
        { name: 'glm-5.3-flash', request_count: 1294 },
        { name: 'web search', request_count: 3 },
        { name: 'web fetch', request_count: 2 },
      ],
    },
  },
}

const LIVE_OLLAMA_ME = {
  ID: 'user-1',
  Email: 'cloud@ollama.local',
  Name: 'Cloud User',
  Plan: 'pro',
}

async function ollamaCloudFetch(url, init) {
  const href = String(url)
  assert.equal(href.includes('127.0.0.1:11434'), false)
  assert.equal(href.includes('localhost:11434'), false)
  if (href === OLLAMA_USAGE_URL) {
    assert.equal(init?.method ?? 'GET', 'GET')
    return json(LIVE_OLLAMA_USAGE)
  }
  if (href === OLLAMA_ME_URL) {
    assert.equal(init?.method, 'POST')
    const auth = String(init?.headers?.authorization ?? '')
    const email = auth.includes('account-b') ? 'b@ollama.local' : 'a@ollama.local'
    return json({ ...LIVE_OLLAMA_ME, Email: email })
  }
  if (href === OLLAMA_TAGS_URL || href === OLLAMA_SHOW_URL) return json({ models: [] })
  throw new Error(`unexpected ${href}`)
}

test('parseOllamaUsage maps 0 / 0.095 fractions to remaining 100 and 90.5', () => {
  const parsed = parseOllamaUsage(LIVE_OLLAMA_USAGE, LIVE_OLLAMA_ME)
  assert.equal(parsed.planType, 'pro')
  assert.equal(formatPlanLabel(parsed.planType, 'ollama'), 'Pro')
  assert.equal(parsed.account, 'cloud@ollama.local')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].kind, 'primary')
  assert.equal(parsed.rows[0].usedPercent, 0)
  assert.equal(parsed.rows[0].remainingPercent, 100)
  assert.equal(parsed.rows[0].resetAt, undefined)
  assert.equal(parsed.rows[1].kind, 'weekly')
  assert.equal(parsed.rows[1].usedPercent, 9.5)
  assert.equal(parsed.rows[1].remainingPercent, 90.5)
  assert.equal(parsed.rows[1].resetAt, undefined)
  assert.match(parsed.rows[1].note, /glm-5\.3-flash × 1294/)
  const empty = parseOllamaUsage(undefined, undefined)
  assert.deepEqual(empty.rows, [])
  assert.equal(empty.planType, undefined)
  const meOnly = parseOllamaUsage({ limits: {} }, { Name: 'Only Name', Plan: 'max' })
  assert.equal(meOnly.account, 'Only Name')
  assert.equal(meOnly.planType, 'max')
  assert.deepEqual(meOnly.rows, [])
  assert.equal(parseOllamaMe({ Email: 'a@b.c', Plan: 'pro' }).account, 'a@b.c')
  assert.equal(isOllamaOpaqueAccount('ollama-3f67f6bb'), true)
  assert.equal(isOllamaOpaqueAccount('cloud@ollama.local'), false)
})

test('snapshot shows quota on every ollama account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-ollama-'))
  const authPath = join(dir, 'auth.json')
  const sessionA = ollamaSession({ accessToken: 'sk-ollama-account-a', source: 'paste' })
  const sessionB = ollamaSession({ accessToken: 'sk-ollama-account-b', source: 'env' })
  await saveSession('ollama', sessionA, authPath)
  await saveSession('ollama', sessionB, authPath)
  const yaml = { providers: {} }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    ollamaAutoImport: false,
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
    fetchFn: ollamaCloudFetch,
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.ollama.loggedIn, true)
  assert.equal(snap.accounts.ollama.accounts.length, 2)
  assert.equal(snap.accounts.ollama.accounts.every((row) => row.quota?.status === 'ready'), true)
  for (const row of snap.accounts.ollama.accounts) {
    assert.equal(row.quota.planLabel, 'Pro')
    assert.equal(row.quota.rows[0].remainingPercent, 100)
    assert.equal(row.quota.rows[1].remainingPercent, 90.5)
    assert.equal(isOllamaOpaqueAccount(row.account), false)
    assert.match(row.account, /@ollama\.local$/)
  }
  assert.deepEqual(snap.accounts.ollama.accounts.map((row) => row.account).sort(), [
    'a@ollama.local',
    'b@ollama.local',
  ])
  assert.equal(snap.catalog.some((row) => row.provider === 'oauth-ollama'), true)
  assert.equal(snap.providers.some((row) => row.provider === 'oauth-ollama'), true)
  const synced = await controller.sync()
  assert.equal(yaml.providers['oauth-ollama'].api, HARNESS_COMPLETIONS_API)
  assert.equal(yaml.providers['oauth-ollama'].baseURL, 'http://127.0.0.1:8318/ollama')
  assert.deepEqual(synced.routes.find((row) => row.provider === 'oauth-ollama').models, yaml.providers['oauth-ollama'].models.map((model) => model.id))
})

test('OLLAMA_API_KEY import and empty-roster auto-import do not overwrite stored paste', async () => {
  assert.equal(await resolveOllamaLocalCredentials({ env: {} }), undefined)
  await assert.rejects(importOllamaAuth({ env: {} }), (error) => error.code === OLLAMA_IMPORT_EMPTY)
  const imported = await importOllamaAuth({ env: { OLLAMA_API_KEY: 'sk-ollama-from-env' } })
  assert.equal(imported.source, 'env')
  assert.equal(imported.session.accessToken, 'sk-ollama-from-env')

  const dir = await mkdtemp(join(tmpdir(), 'oauth-ollama-auto-'))
  const authPath = join(dir, 'auth.json')
  const previous = process.env.OLLAMA_API_KEY
  process.env.OLLAMA_API_KEY = 'sk-ollama-auto-env'
  try {
    const controller = new AuthController({
      authPath,
      prefix: 'oauth',
      origin: () => 'http://127.0.0.1:8318',
      settings: { mutate: async () => undefined },
      ollamaAutoImport: true,
      fetchFn: async () => json({ models: [] }),
    })
    const snap = await controller.snapshot()
    assert.equal(snap.accounts.ollama.loggedIn, true)
    assert.equal(snap.accounts.ollama.accounts[0].methodLabel, 'env')

    const paste = ollamaSession({ accessToken: 'sk-ollama-auto-env', source: 'paste' })
    await saveSession('ollama', paste, authPath)
    const result = await controller.importFrom('ollama')
    assert.equal(result.source, 'paste')
    const rows = await listStoredSessions('ollama', authPath)
    assert.equal(rows[0].session.source, 'paste')
  } finally {
    if (previous === undefined) delete process.env.OLLAMA_API_KEY
    else process.env.OLLAMA_API_KEY = previous
  }
})

test('live tags expand catalog; empty tags keep static fallback; retired stay out', async () => {
  resetOllamaCatalogCache()
  assert.equal(isOllamaRetiredModel('glm-4.7'), true)
  assert.equal(isOllamaRetiredModel('minimax-m2.5'), true)
  assert.equal(isOllamaRetiredModel('gpt-oss:120b'), false)
  const filtered = toOllamaPickerModels({
    models: [
      { name: 'glm-4.7' },
      { name: 'gpt-oss:120b' },
      { name: 'kimi-k2.6' },
    ],
  })
  assert.deepEqual(filtered.map((model) => model.id), ['gpt-oss:120b', 'kimi-k2.6'])
  assert.equal(filtered.find((model) => model.id === 'gpt-oss:120b').contextWindow, 131_072)
  assert.equal(filtered.find((model) => model.id === 'kimi-k2.6').contextWindow, 262_144)

  const session = ollamaSession({ accessToken: 'sk-ollama-tags', source: 'paste' })
  const live = await refreshOllamaCatalog(session, {
    fetchFn: async (url) => {
      if (String(url) === OLLAMA_SHOW_URL) return json({ details: {} })
      assert.equal(url, OLLAMA_TAGS_URL)
      return json({
        models: [
          { name: 'gpt-oss:120b' },
          { name: 'glm-5.3' },
          { name: 'new-cloud-model' },
          { name: 'glm-4.7' },
        ],
      })
    },
  })
  assert.equal(live.some((model) => model.id === 'new-cloud-model'), true)
  assert.equal(live.some((model) => model.id === 'glm-4.7'), false)
  assert.equal(live.find((model) => model.id === 'glm-5.3').contextWindow, 1_048_576)
  assert.notEqual(live.find((model) => model.id === 'glm-5.3').contextWindow, 128_000)
  assert.equal(ollamaCatalogModels().length, live.length)

  resetOllamaCatalogCache()
  const fallback = await refreshOllamaCatalog(session, {
    fetchFn: async () => json({ models: [] }),
  })
  assert.deepEqual(fallback.map((model) => model.id), OLLAMA_MODELS.map((model) => model.id))
})

test('live show capabilities override a wrong static/regex input row', async () => {
  resetOllamaCatalogCache()
  const session = ollamaSession({ accessToken: 'sk-ollama-show-input', source: 'paste' })
  assert.deepEqual(inferOllamaInput('glm-5.3-flash'), ['text'])
  const shown = await refreshOllamaCatalog(session, {
    fetchFn: async (url, init) => {
      if (String(url) === OLLAMA_SHOW_URL) {
        const model = JSON.parse(String(init.body ?? '{}')).model
        if (model === 'glm-5.3-flash') return json({ capabilities: ['completion', 'vision'] })
        if (model === 'glm-5.3') return json({ capabilities: ['completion'] })
        if (model === 'qwen3.5:397b') return json({ capabilities: ['vision'] })
        if (model === 'gemma4:31b') return json({ capabilities: ['completion'] })
        return json({ details: {} })
      }
      assert.equal(url, OLLAMA_TAGS_URL)
      return json({
        models: [
          { name: 'glm-5.3-flash' },
          { name: 'glm-5.3' },
          { name: 'gemma4:31b' },
          { name: 'qwen3.5:397b' },
        ],
      })
    },
  })
  assert.deepEqual(shown.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(shown.find((model) => model.id === 'glm-5.3').input, ['text'])
  assert.deepEqual(shown.find((model) => model.id === 'gemma4:31b').input, ['text'])
  assert.deepEqual(shown.find((model) => model.id === 'qwen3.5:397b').input, ['text', 'image'])
})

test('live show model_info overrides snapshot; show-less tags keep snapshot not 128000', async () => {
  resetOllamaCatalogCache()
  const session = ollamaSession({ accessToken: 'sk-ollama-show', source: 'paste' })
  const shown = await refreshOllamaCatalog(session, {
    fetchFn: async (url, init) => {
      if (String(url) === OLLAMA_SHOW_URL) {
        const model = JSON.parse(String(init.body ?? '{}')).model
        if (model === 'glm-5.3') return json({ model_info: { 'glm.context_length': 999_999 } })
        return json({ model_info: {} })
      }
      assert.equal(url, OLLAMA_TAGS_URL)
      return json({ models: [{ name: 'glm-5.3' }, { name: 'gpt-oss:120b' }] })
    },
  })
  assert.equal(shown.find((model) => model.id === 'glm-5.3').contextWindow, 999_999)
  assert.equal(shown.find((model) => model.id === 'gpt-oss:120b').contextWindow, 131_072)

  resetOllamaCatalogCache()
  const noShow = await refreshOllamaCatalog(session, {
    fetchFn: async (url) => {
      if (String(url) === OLLAMA_SHOW_URL) return json({ details: {} })
      return json({ models: [{ name: 'glm-5.3' }] })
    },
  })
  assert.equal(noShow.find((model) => model.id === 'glm-5.3').contextWindow, 1_048_576)
  assert.notEqual(noShow.find((model) => model.id === 'glm-5.3').contextWindow, 128_000)

  const fromTags = toOllamaPickerModels({
    models: [{ name: 'glm-5.3', details: { context_length: 777_777 } }],
  })
  assert.equal(fromTags[0].contextWindow, 777_777)
})

test('useKey paste writes oauth-ollama and discovers tags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-ollama-key-'))
  const authPath = join(dir, 'auth.json')
  const yaml = { providers: {} }
  resetOllamaCatalogCache()
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    ollamaAutoImport: false,
    ollamaDiscover: refreshOllamaCatalog,
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
    fetchFn: async (url) => {
      if (String(url).includes('/api/me')) return json({ email: 'cloud@ollama.local' })
      return json({ models: [{ name: 'gpt-oss:120b' }, { name: 'live-only' }] })
    },
  })
  await controller.useKey('ollama', 'sk-ollama-paste-live')
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.ollama.loggedIn, true)
  assert.equal(snap.accounts.ollama.account, 'cloud@ollama.local')
  assert.equal(snap.catalog.find((row) => row.provider === 'oauth-ollama').models.some((model) => model.id === 'live-only'), true)
  await controller.sync()
  assert.equal(yaml.providers['oauth-ollama'].models.some((model) => model.id === 'live-only'), true)
})

test('proxy Completions hop is cloud /v1 with Bearer; no Codex/Grok headers', async () => {
  const seen = []
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async (url, init) => {
      seen.push({ url: String(url), headers: init.headers, body: init.body?.toString() })
      return new Response('{"id":"chat","choices":[]}', { status: 200, headers: { 'content-type': 'application/json' } })
    },
    tokens: {
      ollama: {
        session: async () => ollamaSession({ accessToken: 'sk-ollama-proxy', source: 'paste' }),
      },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/ollama/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-oss:120b',
        messages: [{ role: 'user', content: 'hi' }],
        prompt_cache_key: 'codex-style',
        session_id: 'sess-dsh',
      }),
    })
    assert.equal(ok.status, 200)
    assert.equal(seen[0].url, OLLAMA_CHAT_URL)
    assert.equal(seen[0].headers.authorization, 'Bearer sk-ollama-proxy')
    assert.equal(seen[0].headers['session-id'], undefined)
    assert.equal(seen[0].headers['x-client-request-id'], undefined)
    assert.equal(seen[0].headers['x-grok-conv-id'], undefined)
    const body = JSON.parse(seen[0].body)
    assert.equal(body.prompt_cache_key, undefined)
    assert.equal(body.session_id, undefined)
    assert.equal(body.model, 'gpt-oss:120b')

    const refused = await fetch(`http://127.0.0.1:${port}/ollama/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(refused.status, 501)
  } finally {
    await proxy.close()
  }
})

test('applyOllamaCache strips Codex/Grok fields and does not invent a wire id', () => {
  resetOllamaPins()
  assert.equal(ollamaCacheSessionId('session 772f7f3a/foo'), 'session-772f7f3a-foo')
  const { payload, cacheSessionId } = applyOllamaCache({
    model: 'gpt-oss:120b',
    session_id: 'sess-ollama',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(cacheSessionId, 'sess-ollama')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.session_id, undefined)
  assert.deepEqual(ollamaCacheHeaders(), {})
  assert.equal(Object.hasOwn(ollamaCacheHeaders(), 'session-id'), false)
  assert.equal(Object.hasOwn(ollamaCacheHeaders(), 'x-grok-conv-id'), false)
  const again = applyOllamaCache({ model: 'gpt-oss:120b', session_id: 'sess-ollama' })
  assert.equal(again.cacheSessionId, cacheSessionId)
  assert.equal(applyOllamaCache({ model: 'gpt-oss:120b' }).cacheSessionId, OLLAMA_STABLE_SESSION)
  assert.equal(/^-\d+$/.test(applyOllamaCache({}).cacheSessionId), false)
})

test('refreshQuota persists Email and replaceAccountId on ollama-hex vault id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-ollama-id-'))
  const authPath = join(dir, 'auth.json')
  const session = ollamaSession({ accessToken: 'sk-ollama-opaque-key', source: 'paste' })
  assert.equal(isOllamaOpaqueAccount(session.account), true)
  await saveSession('ollama', session, authPath)
  const before = await listStoredSessions('ollama', authPath)
  assert.equal(before[0].id, session.account)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    ollamaAutoImport: false,
    fetchFn: async (url, init) => {
      if (String(url) === OLLAMA_USAGE_URL) return json(LIVE_OLLAMA_USAGE)
      if (String(url) === OLLAMA_ME_URL) return json(LIVE_OLLAMA_ME)
      if (String(url).includes('11434')) throw new Error('localhost daemon is not this family')
      return json({ models: [] })
    },
  })
  const quota = await controller.refreshQuota('ollama')
  assert.equal(quota.status, 'ready')
  assert.equal(quota.planLabel, 'Pro')
  assert.equal(quota.rows[0].remainingPercent, 100)
  assert.equal(quota.rows[1].remainingPercent, 90.5)
  const rows = await listStoredSessions('ollama', authPath)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 'cloud@ollama.local')
  assert.equal(rows[0].session.account, 'cloud@ollama.local')
  assert.equal(rows[0].session.planType, 'pro')
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.ollama.account, 'cloud@ollama.local')
  assert.equal(snap.accounts.ollama.accounts[0].planLabel, 'Pro')
})

test('QuotaStore ollama fetches usage+me; missing usage does not crash; no session stays idle', async () => {
  const session = ollamaSession({ accessToken: 'sk-ollama-quota-store', source: 'paste' })
  const seen = []
  const store = new QuotaStore({
    fetchFn: async (url, init) => {
      const href = String(url)
      seen.push({ href, method: init?.method ?? 'GET' })
      assert.equal(href.includes('11434'), false)
      if (href === OLLAMA_USAGE_URL) return json(LIVE_OLLAMA_USAGE)
      if (href === OLLAMA_ME_URL) {
        assert.equal(init?.method, 'POST')
        return json(LIVE_OLLAMA_ME)
      }
      throw new Error(`unexpected ${href}`)
    },
    tokens: { ollama: { session: async () => session } },
  })
  const quota = await store.refresh('ollama')
  assert.equal(quota.status, 'ready')
  assert.notEqual(quota.status, 'idle')
  assert.equal(quota.planLabel, 'Pro')
  assert.equal(quota.account, 'cloud@ollama.local')
  assert.equal(quota.rows[0].remainingPercent, 100)
  assert.equal(quota.rows[1].remainingPercent, 90.5)
  assert.equal(seen.some((row) => row.href === OLLAMA_USAGE_URL && row.method === 'GET'), true)
  assert.equal(seen.some((row) => row.href === OLLAMA_ME_URL && row.method === 'POST'), true)

  const meOnly = new QuotaStore({
    fetchFn: async (url) => {
      if (String(url) === OLLAMA_USAGE_URL) return new Response('nope', { status: 500 })
      if (String(url) === OLLAMA_ME_URL) return json({ Plan: 'pro', Email: 'cloud@ollama.local' })
      throw new Error(`unexpected ${url}`)
    },
    tokens: { ollama: { session: async () => session } },
  })
  const partial = await meOnly.refresh('ollama')
  assert.equal(partial.status, 'ready')
  assert.equal(partial.planLabel, 'Pro')
  assert.deepEqual(partial.rows, [])

  let hits = 0
  const idle = new QuotaStore({
    fetchFn: async () => {
      hits += 1
      throw new Error('network should stay quiet')
    },
  })
  const empty = await idle.refresh('ollama')
  assert.equal(empty.status, 'idle')
  assert.equal(hits, 0)
})
