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
  OLLAMA_MODELS,
  OLLAMA_REASONING,
  OLLAMA_TAGS_URL,
  inferOllamaContextWindow,
  inferOllamaInput,
  isOllamaRetiredModel,
  ollamaDefaultAccount,
  ollamaSession,
  ollamaSourceLabel,
  parseOllamaApiKey,
} from '../lib/oauth/ollama/index.js'
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

test('static OLLAMA_MODELS is the 19-row Cloud snapshot and matches infer helpers', () => {
  const ids = [
    'deepseek-v4-flash:0731',
    'deepseek-v4-pro:0813',
    'gemma4:31b',
    'glm-5.1',
    'glm-5.2',
    'glm-5.3',
    'glm-5.3-flash',
    'gpt-oss:120b',
    'gpt-oss:20b',
    'kimi-k2.6',
    'kimi-k2.7-code',
    'kimi-k3',
    'minimax-m2.7',
    'minimax-m3',
    'mistral-large-3:675b',
    'nemotron-3-nano:30b',
    'nemotron-3-super',
    'nemotron-3-ultra',
    'qwen3.5:397b',
  ]
  assert.equal(OLLAMA_MODELS.length, 19)
  assert.deepEqual(OLLAMA_MODELS.map((model) => model.id), ids)
  for (const model of OLLAMA_MODELS) {
    assert.equal(model.contextWindow, inferOllamaContextWindow(model.id))
    assert.deepEqual(model.input, inferOllamaInput(model.id))
    assert.equal(isOllamaRetiredModel(model.id), false)
  }
  assert.deepEqual(inferOllamaInput('gemma4:31b'), ['text', 'image'])
  assert.equal(inferOllamaContextWindow('qwen3.5:397b'), 262_144)
  assert.equal(inferOllamaContextWindow('kimi-k3'), 256_000)
  assert.equal(inferOllamaContextWindow('glm-5.1'), 200_000)
  assert.equal(inferOllamaContextWindow('mistral-large-3:675b'), 200_000)
  assert.equal(inferOllamaContextWindow('minimax-m2.7'), 200_000)
  assert.equal(inferOllamaContextWindow('nemotron-3-ultra'), 128_000)
  assert.equal(inferOllamaContextWindow('deepseek-v4-pro:0813'), 128_000)
})

test('snapshot shows oauth-ollama when logged in; quota stays idle', async () => {
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
    fetchFn: async () => json({ models: [] }),
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.ollama.loggedIn, true)
  assert.equal(snap.accounts.ollama.accounts.length, 2)
  assert.equal(snap.accounts.ollama.accounts.every((row) => row.quota?.status === 'idle'), true)
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

  const session = ollamaSession({ accessToken: 'sk-ollama-tags', source: 'paste' })
  const live = await refreshOllamaCatalog(session, {
    fetchFn: async (url) => {
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
  assert.equal(ollamaCatalogModels().length, live.length)

  resetOllamaCatalogCache()
  const fallback = await refreshOllamaCatalog(session, {
    fetchFn: async () => json({ models: [] }),
  })
  assert.deepEqual(fallback.map((model) => model.id), OLLAMA_MODELS.map((model) => model.id))
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
