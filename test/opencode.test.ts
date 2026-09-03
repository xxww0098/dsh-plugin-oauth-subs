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
  OPENCODE_DEFAULT_MODEL,
  OPENCODE_MODELS,
  OPENCODE_MODELS_URL,
  isOpencodeFreeSlug,
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
  refreshOpencodeCatalog,
  resetOpencodeCatalogCache,
  toOpencodePickerModels,
} from '../lib/oauth/opencode/catalog.js'
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
  assert.equal(route.compat, undefined)
  for (const model of route.models) {
    assert.equal(model.reasoningEfforts, false)
    assert.deepEqual(model.input, ['text'])
  }
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
    assert.equal(Object.hasOwn(init.headers, 'authorization'), false)
    return json({ data: [{ id: 'laguna-s-2.1-free' }, { id: 'ox-alpha-free' }, { id: 'nemotron-3-ultra-free' }] })
  }
  const live = await refreshOpencodeCatalog({ fetchFn, force: true })
  assert.equal(calls[0].url, OPENCODE_MODELS_URL)
  assert.deepEqual(live.map((model) => model.id), ['laguna-s-2.1-free', 'nemotron-3-ultra-free'])
  assert.equal(opencodeCatalogModels().length, 2)

  resetOpencodeCatalogCache()
  const empty = await refreshOpencodeCatalog({
    fetchFn: async () => json({ data: [{ id: 'ox-alpha-free' }] }),
    force: true,
  })
  assert.equal(empty.length, OPENCODE_MODELS.length)
  assert.equal(empty.some((model) => model.id === 'hy3-free'), false)
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
    assert.equal(responses.status, 501)

    const chat = await fetch(`http://127.0.0.1:${port}/opencode/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer proxy-key-opencode-test-xx', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENCODE_DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        prompt_cache_key: 'codex-style',
        session_id: 'sess-opencode',
      }),
    })
    assert.equal(chat.status, 200)
    assert.equal(hops[0].url, OPENCODE_CHAT_URL)
    const sent = JSON.parse(hops[0].body)
    assert.equal(sent.prompt_cache_key, undefined)
    assert.equal(sent.session_id, undefined)
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

test('saving a second anonymous session stays one account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-opencode-dup-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('opencode', opencodeSession(), authPath)
  await saveSession('opencode', opencodeSession(), authPath)
  const rows = await listStoredSessions('opencode', authPath)
  assert.equal(rows.length, 1)
})
