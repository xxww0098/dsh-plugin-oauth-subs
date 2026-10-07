import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  OAUTH_CREDENTIAL_REF,
  HARNESS_ANTHROPIC_API,
  HARNESS_COMPLETIONS_API,
  HARNESS_RESPONSES_API,
  assertDshServiceableProvider,
  buildProviders,
  catalogKeys,
  catalogProviders,
  describeCatalog,
  modelKey,
  FAMILY_IDS,
  RETIRED_FAMILY_IDS,
  ownedProviderIds,
  OPENCODE_GO_API_KEY_ENV,
  withDefaultEffort,
} from '../lib/oauth/models.js'
import { ModelSwitch } from '../lib/oauth/model-switch.js'
import {
  compactionTmpPath,
  filterProviders,
  peekPiAiProviders,
  ensureOpencodeGoRoute,
  syncHarnessModels,
} from '../lib/oauth/harness-sync.js'
import { OPENCODE_GO_BUILTIN_ROUTE_ID, OPENCODE_GO_EXTRA_MODELS, OPENCODE_GO_EXTRA_ROUTE, OPENCODE_GO_ROUTES } from '../lib/apikey/opencode-go/models.js'
import { KIRO_MODELS, KIRO_REASONING_GPT } from '../lib/oauth/kiro/index.js'

const GO_SESSION = { 'x-opencode-session': 'dsh-opencode-go' }
const GO_BUILTIN = { apiKeyEnv: OPENCODE_GO_API_KEY_ENV, headers: GO_SESSION }

function createPiAiSettings(initialProviders = {}) {
  const sections = {
    'llm-pi-ai': { providers: structuredClone(initialProviders) },
  }
  const ops = []
  return {
    ops,
    get section() {
      return sections['llm-pi-ai']
    },
    describe() {
      return [{ ns: 'llm-pi-ai', value: structuredClone(sections['llm-pi-ai']) }]
    },
    async mutate(target, mutations) {
      if (target !== 'llm-pi-ai') throw new Error(`unknown settings namespace ${target}`)
      const section = sections['llm-pi-ai']
      const next = { providers: { ...section.providers } }
      for (const row of mutations) {
        const key = row.path?.[1]
        if (row.path?.[0] !== 'providers' || typeof key !== 'string') throw new Error('bad path')
        if (row.op === 'unset') {
          delete next.providers[key]
        } else if (row.op === 'set') {
          assertDshServiceableProvider(key, row.value)
          next.providers[key] = structuredClone(row.value)
        }
      }
      section.providers = next.providers
      ops.push({ target, mutations })
    },
  }
}

const GLM_CURRENT = ['oauth-glm/glm-5.3', 'oauth-glm/glm-5.3-flash', 'oauth-glm/glm-5-turbo']
const GLM_VARIANT_KEYS = ['oauth-glm/glm-5.3-1m', 'oauth-glm/glm-5.3-flash-1m']
const GLM_STALE = ['oauth-glm/glm-4.7', 'oauth-glm/glm-5', 'oauth-glm/glm-5.1', 'oauth-glm/glm-5.2']

test('buildProviders only emits logged-in families with DSH api ids', () => {
  const both = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { codex: true, grok: true } })
  assert.equal(both['oauth-codex'].api, HARNESS_RESPONSES_API)
  assert.equal(both['oauth-codex'].api, 'openai-responses')
  assert.equal(both['oauth-codex'].apiKeyEnv, OAUTH_CREDENTIAL_REF)
  assert.equal(both['oauth-codex'].baseURL, 'http://127.0.0.1:8318/codex/v1')
  assert.equal(both['oauth-grok'].displayName.includes('Grok'), true)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.6').contextWindow, 256_000)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.6-fast'), undefined)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.7').contextWindow, 256_000)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.7').maxTokens, 32_768)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.7-fast'), undefined)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.7-build-fast').name, 'Grok 4.7 Fast')
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.7-build-fast').contextWindow, 256_000)
  assert.deepEqual(both['oauth-grok'].models.find((model) => model.id === 'grok-4.7').reasoningEfforts, {
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
  })
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.5').contextWindow, 256_000)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4'), undefined)
  assert.deepEqual(both['oauth-grok'].models.find((model) => model.id === 'grok-4.6').reasoningEfforts, {
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
  })
  assert.deepEqual(both['oauth-grok'].models.find((model) => model.id === 'grok-4.5').reasoningEfforts, {
    low: 'low',
    medium: 'medium',
    high: 'high',
  })
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.6').maxTokens, 32_768)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.5').reasoningEfforts.off, null)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.5').reasoningEfforts.max, undefined)
  assert.deepEqual(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-astra').reasoningEfforts, {
    off: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  })
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-astra-fast').reasoningEfforts.max, 'max')
  // One default-window row per model: the 872K ceiling is reached by editing
  // the base row's custom context, not by a `-900k` sibling row.
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-astra-900k'), undefined)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-astra-ultra'), undefined)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-astra').contextWindow, 258_000)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-astra-fast').contextWindow, 258_000)
  assert.deepEqual(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-sol').reasoningEfforts, {
    off: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  })
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-sol-fast').reasoningEfforts.max, 'max')
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-sol-900k'), undefined)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-sol-ultra'), undefined)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-luna').contextWindow, 258_000)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-6-luna-fast').reasoningEfforts.max, 'max')
  assert.deepEqual(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol').reasoningEfforts, {
    off: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  })
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol-fast').reasoningEfforts.max, 'max')
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol-900k'), undefined)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol-ultra'), undefined)
  const none = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { codex: false, grok: false } })
  assert.deepEqual(Object.keys(none), [])
  const chat = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { glm: true, kiro: true, antigravity: true, cursor: true, ollama: true, kimi: true, copilot: true },
  })
  assert.equal(chat['oauth-glm'].api, HARNESS_ANTHROPIC_API)
  assert.equal(chat['oauth-glm'].baseURL, 'http://127.0.0.1:8318/glm')
  assert.deepEqual(chat['oauth-glm'].compat, { forceAdaptiveThinking: true, allowEmptySignature: true })
  assert.equal(chat['oauth-kiro'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-kiro'].compat.supportsReasoningEffort, true)
  assert.equal(chat['oauth-kiro'].models.length, KIRO_MODELS.length)
  assert.equal(chat['oauth-antigravity'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-cursor'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-cursor'].baseURL, 'http://127.0.0.1:8318/cursor')
  assert.equal(chat['oauth-cursor'].baseURL.endsWith('/cursor/v1'), false)
  // composer-2.5 takes no effort parameter upstream — no picker efforts.
  assert.equal(chat['oauth-cursor'].models.find((model) => model.id === 'composer-2.5').reasoningEfforts, false)
  assert.equal(chat['oauth-cursor'].models.find((model) => model.id === 'grok-4.7').reasoningEfforts.xhigh, 'xhigh')
  assert.equal(chat['oauth-ollama'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-ollama'].baseURL, 'http://127.0.0.1:8318/ollama')
  assert.equal(chat['oauth-ollama'].baseURL.endsWith('/ollama/v1'), false)
  assert.equal(chat['oauth-ollama'].models.length, 18)
  assert.equal(Object.hasOwn(chat['oauth-ollama'].models.find((model) => model.id === 'gpt-oss:120b').reasoningEfforts, 'none'), false)
  assert.equal(chat['oauth-ollama'].models.find((model) => model.id === 'gpt-oss:120b').reasoningEfforts.off, 'none')
  assert.equal(chat['oauth-ollama'].models.some((model) => model.id === 'kimi-k3'), true)
  assert.equal(chat['oauth-ollama'].models.some((model) => model.id === 'qwen3.5:397b'), false)
  assert.deepEqual(chat['oauth-ollama'].models.find((model) => model.id === 'gemma4:31b').input, ['text', 'image'])
  assert.deepEqual(chat['oauth-ollama'].models.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(chat['oauth-ollama'].models.find((model) => model.id === 'glm-5.3').input, ['text'])
  assert.deepEqual(chat['oauth-ollama'].models.find((model) => model.id === 'kimi-k3').input, ['text', 'image'])
  assert.deepEqual(chat['oauth-ollama'].models.find((model) => model.id === 'mistral-large-3:675b').input, ['text', 'image'])
  assert.deepEqual(chat['oauth-ollama'].models.find((model) => model.id === 'gpt-oss:120b').input, ['text'])
  assert.equal(chat['oauth-kimi'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-kimi'].api, 'openai-completions')
  assert.equal(chat['oauth-kimi'].baseURL, 'http://127.0.0.1:8318/kimi')
  assert.equal(chat['oauth-kimi'].baseURL.endsWith('/kimi/v1'), false)
  assert.equal(chat['oauth-kimi'].models.some((model) => model.id === 'k3'), true)
  assert.equal(chat['oauth-opencode'], undefined)
  assert.equal(chat['oauth-copilot'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-copilot'].api, 'openai-completions')
  assert.equal(chat['oauth-copilot'].baseURL, 'http://127.0.0.1:8318/copilot')
  assert.equal(chat['oauth-copilot'].baseURL.endsWith('/copilot/v1'), false)
  assert.equal(chat['oauth-copilot'].compat.supportsReasoningEffort, true)
  assert.equal(chat['oauth-copilot'].compat.thinkingFormat, 'openai')
  assert.equal(chat['oauth-copilot'].displayName, 'Subs · GitHub Copilot · Chat')
  assert.equal(chat['oauth-copilot'].models.some((model) => model.id === 'gpt-4.1'), true)
  assert.deepEqual(chat['oauth-copilot'].models.find((model) => model.id === 'gpt-5.5').reasoningEfforts, {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
  })
  assert.equal(chat['oauth-codex'], undefined)
})

test('syncHarnessModels unsets owned routes then sets the live catalog', async () => {
  const ops = []
  const settings = {
    mutate: async (target, mutations) => {
      ops.push({ target, mutations })
    },
  }
  const result = await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true, grok: false },
  })
  assert.equal(ops[0].target, 'llm-pi-ai')
  assert.equal(FAMILY_IDS.includes('opencode'), false)
  assert.deepEqual([...RETIRED_FAMILY_IDS], ['opencode', 'anthropic'])
  assert.equal(ownedProviderIds('oauth').includes('oauth-opencode'), true)
  assert.equal(FAMILY_IDS.includes('anthropic'), false)
  assert.equal(ownedProviderIds('oauth').includes('oauth-anthropic'), true)
  const unset = ops[0].mutations.filter((row) => row.op === 'unset').map((row) => row.path.join('.'))
  assert.deepEqual(unset, ownedProviderIds('oauth').map((id) => `providers.${id}`))
  assert.equal(unset.includes('providers.oauth-opencode'), true)
  const set = ops[0].mutations.filter((row) => row.op === 'set')
  assert.equal(set.length, 1)
  assert.deepEqual(set[0].path, ['providers', 'oauth-codex'])
  // settings.yaml `name` is the picker label: "<agent>/<model id>" alias,
  // while the catalog/describeCatalog names stay pretty for the Models page.
  assert.equal(set[0].value.models.find((model) => model.id === 'gpt-6-sol').name, 'Codex/gpt-6-sol')
  assert.equal(result.routes[0].models.includes('gpt-6-astra'), true)
  assert.equal(result.routes[0].models.includes('gpt-6-astra-fast'), true)
  // No `-900k` route rows: the 872K ceiling is a per-row custom context.
  assert.equal(result.routes[0].models.includes('gpt-6-astra-900k'), false)
  assert.equal(result.routes[0].models.includes('gpt-6-astra-ultra'), false)
  assert.equal(result.routes[0].models.includes('gpt-6-sol'), true)
  assert.equal(result.routes[0].models.includes('gpt-6-sol-fast'), true)
  assert.equal(result.routes[0].models.includes('gpt-6-sol-900k'), false)
  assert.equal(result.routes[0].models.includes('gpt-6-sol-ultra'), false)
  assert.equal(result.routes[0].models.includes('gpt-6-luna-900k'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.3-codex'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.3-codex-spark'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.4'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.4-mini-fast'), false)
  assert.deepEqual(result.routes[0].models.includes('gpt-5.5'), true)
  assert.deepEqual(result.routes[0].models.includes('gpt-5.5-fast'), true)
  assert.equal(result.routes[0].models.includes('gpt-5.3-codex-fast'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.6-sol-900k'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.6-sol-ultra'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.5-900k'), false)
})

test('filterProviders keeps only selected keys', () => {
  const providers = buildProviders({ prefix: 'oauth', origin: 'http://x', loggedIn: { codex: true, grok: true } })
  const filtered = filterProviders(providers, [modelKey('oauth-grok', 'grok-4.5')])
  assert.equal(filtered['oauth-codex'], undefined)
  assert.deepEqual(filtered['oauth-grok'].models.map((m) => m.id), ['grok-4.5'])
})

test('ensureOpencodeGoRoute writes only the supplemental route and takes the old auto profile back', async () => {
  const empty = createPiAiSettings()
  const first = await ensureOpencodeGoRoute(empty)
  assert.equal(first.status, 'written')
  assert.deepEqual(first.routes, OPENCODE_GO_ROUTES.map((route) => route.id))
  // DSH's installed opencode-go catalog (the other 27 official models) is only
  // registered by llm-pi-ai when a profile names it; the plugin never adds one.
  assert.equal(empty.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
  const extra = empty.section.providers[OPENCODE_GO_EXTRA_ROUTE.id]
  assert.equal(extra.api, 'openai-completions')
  assert.equal(extra.baseURL, 'https://opencode.ai/zen/go/v1')
  assert.deepEqual(extra.headers, GO_SESSION)
  assert.deepEqual(extra.models.map((model) => model.id), OPENCODE_GO_EXTRA_MODELS.map((model) => model.id))
  // Pick a row by id: new catalog rows insert at the front, so index 0 is not stable.
  const longcat = extra.models.find((model) => model.id === 'longcat-2.5-preview-free')
  assert.equal(longcat.name, 'OpenCode Go/longcat-2.5-preview-free')
  assert.deepEqual(longcat.input, ['text', 'image'])
  assert.equal(longcat.reasoningEfforts, false)
  assert.deepEqual(longcat.compat, {
    supportsStore: false,
    supportsDeveloperRole: false,
    maxTokensField: 'max_tokens',
    requiresReasoningContentOnAssistantMessages: true,
    thinkingFormat: 'deepseek',
  })
  assert.equal(empty.ops.length, 1)

  assert.equal((await ensureOpencodeGoRoute(empty)).status, 'present')
  assert.equal(empty.ops.length, 1)

  // The exact auto-written built-in profile of older plugin versions is removed.
  const legacy = createPiAiSettings({ 'opencode-go': GO_BUILTIN })
  const cleaned = await ensureOpencodeGoRoute(legacy)
  assert.equal(cleaned.status, 'written')
  assert.deepEqual(cleaned.routes, [OPENCODE_GO_BUILTIN_ROUTE_ID, ...OPENCODE_GO_ROUTES.map((route) => route.id)])
  assert.equal(legacy.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)

  // A bare apiKeyEnv profile is what DSH's own Models page writes — not ours.
  const userBare = createPiAiSettings({ 'opencode-go': { apiKeyEnv: OPENCODE_GO_API_KEY_ENV } })
  await ensureOpencodeGoRoute(userBare)
  assert.deepEqual(userBare.section.providers['opencode-go'], { apiKeyEnv: OPENCODE_GO_API_KEY_ENV })

  // An existing user-configured built-in profile is never overwritten.
  const custom = createPiAiSettings({ 'opencode-go': { displayName: 'Mine' } })
  const second = await ensureOpencodeGoRoute(custom)
  assert.equal(second.status, 'written')
  assert.deepEqual(second.routes, OPENCODE_GO_ROUTES.map((route) => route.id))
  assert.deepEqual(custom.section.providers['opencode-go'], { displayName: 'Mine' })

  assert.deepEqual(await ensureOpencodeGoRoute({ mutate: async () => {} }), { status: 'unreadable' })
  assert.deepEqual(await ensureOpencodeGoRoute(undefined), { status: 'unavailable' })
})

test('ensureOpencodeGoRoute follows the picker for the supplemental route only', async () => {
  const settings = createPiAiSettings()
  await ensureOpencodeGoRoute(settings)
  const off = await ensureOpencodeGoRoute(settings, { selected: [] })
  assert.equal(off.status, 'written')
  assert.deepEqual(off.routes, OPENCODE_GO_ROUTES.map((route) => route.id))
  const cleared = await peekPiAiProviders(settings)
  assert.equal(cleared[OPENCODE_GO_EXTRA_ROUTE.id], undefined)
  assert.equal(cleared[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)

  const on = await ensureOpencodeGoRoute(settings, { selected: [OPENCODE_GO_EXTRA_ROUTE.id + '/deepseek-v4.1-flash'] })
  assert.equal(on.status, 'written')
  assert.deepEqual(on.routes, [OPENCODE_GO_EXTRA_ROUTE.id])
  const restored = await peekPiAiProviders(settings)
  assert.deepEqual(restored[OPENCODE_GO_EXTRA_ROUTE.id].models.map((model) => model.id), ['deepseek-v4.1-flash'])
  assert.equal(restored[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
})

test('an empty reasoningEfforts dict is refused like DSH does', () => {
  assert.throws(() => assertDshServiceableProvider('x', {
    api: HARNESS_COMPLETIONS_API,
    models: [{ id: 'm', reasoningEfforts: {} }],
  }), /empty reasoningEfforts/)
})

test('ensureOpencodeGoRoute serves nothing without a key and takes its own route back', async () => {
  const settings = createPiAiSettings()
  assert.deepEqual(await ensureOpencodeGoRoute(settings, { apiKeySet: false }), { status: 'present' })
  assert.deepEqual(settings.section.providers, {})

  await ensureOpencodeGoRoute(settings)
  assert.equal(settings.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
  assert.equal(settings.section.providers[OPENCODE_GO_EXTRA_ROUTE.id] !== undefined, true)

  const cleared = await ensureOpencodeGoRoute(settings, { apiKeySet: false })
  assert.equal(cleared.status, 'written')
  assert.deepEqual(cleared.routes, OPENCODE_GO_ROUTES.map((route) => route.id))
  assert.deepEqual(settings.section.providers, {})

  // The old auto-written built-in profile is taken back with no key too.
  const legacy = createPiAiSettings({ 'opencode-go': GO_BUILTIN })
  const cleaned = await ensureOpencodeGoRoute(legacy, { apiKeySet: false })
  assert.equal(cleaned.status, 'written')
  assert.deepEqual(cleaned.routes, [OPENCODE_GO_BUILTIN_ROUTE_ID])
  assert.deepEqual(legacy.section.providers, {})

  // A user-shaped built-in profile — including DSH's own bare apiKeyEnv — is
  // never taken back.
  const bare = createPiAiSettings({ 'opencode-go': { apiKeyEnv: OPENCODE_GO_API_KEY_ENV } })
  assert.deepEqual(await ensureOpencodeGoRoute(bare, { apiKeySet: false }), { status: 'present' })
  assert.deepEqual(bare.section.providers['opencode-go'], { apiKeyEnv: OPENCODE_GO_API_KEY_ENV })

  const mine = createPiAiSettings({
    'opencode-go': { apiKeyEnv: OPENCODE_GO_API_KEY_ENV, models: [{ id: 'my-model' }] },
  })
  assert.deepEqual(await ensureOpencodeGoRoute(mine, { apiKeySet: false }), { status: 'present' })
  assert.deepEqual(mine.section.providers['opencode-go'].models.map((model) => model.id), ['my-model'])
})

test('catalogProviders lists only the supplemental Go route; the picker locks it without a key', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const keys = catalogKeys(catalog)
  assert.deepEqual(keys.filter((key) => key.startsWith('opencode-go')), OPENCODE_GO_ROUTES.flatMap((route) => route.models.map((model) => route.id + '/' + model.id)))
  const locked = describeCatalog(catalog, { loggedIn: { codex: true } })
  const go = locked.find((row) => row.family === 'opencode-go-flash')
  assert.equal(go.loggedIn, false)
  assert.equal(go.displayName, 'Subs · OpenCode Go · Chat')
  assert.equal(go.models.length, OPENCODE_GO_EXTRA_MODELS.length)
  assert.equal(go.models.length, 26)
  assert.deepEqual(catalog['opencode-go-flash'].models.find((model) => model.id === 'space-bunny').reasoningEfforts.max, 'max')
  assert.equal(catalog['opencode-go-responses'].models.length, 6)
  assert.equal(catalog['opencode-go-responses'].models.find((model) => model.id === 'gpt-6-luna').reasoningEfforts.off, 'none')
  assert.equal(go.models[0].enabled, true)
  const unlocked = describeCatalog(catalog, { loggedIn: { 'opencode-go-flash': true } })
  assert.equal(unlocked.find((row) => row.family === 'opencode-go-flash').loggedIn, true)
})

test('setFamily toggles the supplemental OpenCode Go route like any picker family', async () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const models = new ModelSwitch()
  await models.ready
  const key = 'opencode-go-flash/deepseek-v4.1-flash'
  models.disabled = new Set([key])
  await models.setFamily('opencode-go-flash', true, catalog)
  assert.equal(models.isEnabled(key), true)
  assert.equal(models.status(catalog).selected.includes(key), true)
})

test('catalogProviders always lists both families; Fast siblings only, large windows are ceilings', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const keys = catalogKeys(catalog)
  assert.equal(keys.includes('oauth-codex/gpt-6-astra'), true)
  assert.equal(keys.includes('oauth-codex/gpt-6-astra-fast'), true)
  assert.equal(keys.includes('oauth-codex/gpt-6-astra-900k'), false)
  assert.equal(keys.includes('oauth-codex/gpt-6-astra-ultra'), false)
  assert.equal(keys.includes('oauth-codex/gpt-6-sol'), true)
  assert.equal(keys.includes('oauth-codex/gpt-6-sol-fast'), true)
  assert.equal(keys.includes('oauth-codex/gpt-6-sol-900k'), false)
  assert.equal(keys.includes('oauth-codex/gpt-6-sol-ultra'), false)
  assert.equal(keys.includes('oauth-codex/gpt-6-luna-900k'), false)
  assert.equal(keys.includes('oauth-codex/gpt-5.5'), true)
  assert.equal(keys.includes('oauth-codex/gpt-5.5-fast'), true)
  assert.equal(keys.includes('oauth-codex/gpt-5.6-sol-900k'), false)
  assert.equal(keys.includes('oauth-codex/gpt-5.6-sol-ultra'), false)
  assert.equal(keys.includes('oauth-codex/gpt-5.4-900k'), false)
  assert.equal(keys.includes('oauth-codex/gpt-5.5-900k'), false)
  assert.equal(keys.includes('oauth-codex/gpt-5.4-mini-900k'), false)
  assert.equal(keys.includes('oauth-glm/glm-5.3-1m'), false)
  assert.equal(keys.includes('oauth-glm/glm-5.3-flash-1m'), false)
  assert.equal(keys.includes('oauth-grok/grok-4.6'), true)
  assert.equal(keys.includes('oauth-grok/grok-4'), false)
  assert.equal(keys.includes('oauth-grok/grok-4.6-fast'), false)
  assert.equal(keys.includes('oauth-grok/grok-4.7'), true)
  assert.equal(keys.includes('oauth-grok/grok-4.7-build-fast'), true)
  assert.equal(keys.includes('oauth-grok/grok-4.7-fast'), false)
  const described = describeCatalog(catalog, {
    enabledKeys: ['oauth-codex/gpt-5.5'],
    loggedIn: { codex: true, grok: false },
  })
  const gpt = described.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.5')
  const astra = described.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-6-astra')
  const grok = described.find((row) => row.family === 'grok')
  assert.equal(gpt.enabled, true)
  // Rows without a large sibling carry their own window as the ceiling.
  assert.equal(gpt.window, '258K')
  assert.equal(gpt.windowMax, '258K')
  assert.equal(gpt.contextMax, 258_000)
  // Rows with `maxContextWindow` keep the default window while the vendor's
  // large window becomes the custom-context ceiling.
  assert.equal(astra.window, '258K')
  assert.equal(astra.windowMax, '872K')
  assert.equal(astra.contextMax, 872_000)
  assert.equal(grok.loggedIn, false)
  assert.equal(grok.models.find((m) => m.id === 'grok-4.5').enabled, false)
  assert.equal(grok.models.find((m) => m.id === 'grok-4.7-build-fast').fast, true)
  assert.equal(grok.models.find((m) => m.id === 'grok-4.7').fast, false)
  assert.equal(grok.models.find((m) => m.id === 'grok-4'), undefined)
})

test('ModelSwitch persists disabled keys; stale variant keys stay unknown', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-models-'))
  const path = join(dir, 'models.json')
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const first = new ModelSwitch({ path })
  await first.ready
  // With no opt-in rows left, everything defaults on and selectedForSync
  // collapses to undefined (no filter); status() spells the full list out.
  assert.equal(first.selectedForSync(catalog), undefined)
  const initial = first.status(catalog).selected
  assert.equal(initial.includes('oauth-codex/gpt-5.5'), true)
  // `-900k` / `-1m` rows no longer exist: the keys are unknown, not opt-in.
  assert.equal(initial.includes('oauth-codex/gpt-5.6-sol-900k'), false)
  assert.equal(initial.includes('oauth-glm/glm-5.3-1m'), false)
  assert.equal(initial.includes('oauth-glm/glm-5.3'), true)
  await first.toggle('oauth-codex/gpt-5.5-fast', false, catalog)
  assert.equal(first.status(catalog).selected.includes('oauth-codex/gpt-5.5-fast'), false)
  assert.equal(first.status(catalog).selected.includes('oauth-codex/gpt-5.5'), true)
  await assert.rejects(first.toggle('oauth-codex/gpt-5.6-sol-900k', true, catalog), /unknown model/)
  const raw = JSON.parse(await readFile(path, 'utf8'))
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  assert.equal(raw.disabled.includes('oauth-codex/gpt-5.5-fast'), true)
  // A stale enabled entry for a removed variant key (older versions wrote
  // these) never resurrects the row: the catalog does not know the key.
  await writeFile(path, `${JSON.stringify({ disabled: [], enabled: ['oauth-codex/gpt-6-sol-900k'] })}\n`, { mode: 0o600 })
  const second = new ModelSwitch({ path })
  await second.ready
  const secondSelected = second.status(catalog).selected
  assert.equal(secondSelected.includes('oauth-codex/gpt-6-sol-900k'), false)
  assert.equal(secondSelected.includes('oauth-codex/gpt-6-sol'), true)
  await second.setFamily('grok', false, catalog)
  assert.equal(second.status(catalog).disabled.some((key) => key.startsWith('oauth-grok/')), true)
  await second.setAll(true, catalog)
  assert.equal(second.selectedForSync(catalog), undefined)
})

test('ModelSwitch rejects a symbolic-link settings path', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-models-'))
  const target = join(dir, 'target.json')
  const path = join(dir, 'models.json')
  await writeFile(target, '{"disabled":[],"enabled":[]}', { mode: 0o600 })
  await symlink(target, path)
  const models = new ModelSwitch({ path })
  await assert.rejects(models.ready, /symbolic link/)
})

test('ModelSwitch still accepts a readable legacy 0644 settings file', { skip: process.platform === 'win32' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-models-'))
  const path = join(dir, 'models.json')
  await writeFile(path, '{"disabled":["oauth-codex/gpt-5.5"],"enabled":[]}')
  await chmod(path, 0o644)
  const models = new ModelSwitch({ path })
  await models.ready
  assert.equal(models.disabled.has('oauth-codex/gpt-5.5'), true)
})

test('ModelSwitch setContext persists custom windows and caps at the row maximum', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-models-'))
  const path = join(dir, 'models.json')
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const first = new ModelSwitch({ path })
  await first.ready
  // gpt-6-astra: 258K default, 872K ceiling; glm-5.3: 400K default, 1M ceiling.
  await first.setContext('oauth-codex/gpt-6-astra', 400_000, catalog)
  await first.setContext('oauth-glm/glm-5.3', 900_000, catalog)
  assert.equal(first.contextOf('oauth-codex/gpt-6-astra'), 400_000)
  assert.equal(first.contextOf('oauth-glm/glm-5.3-flash'), undefined)
  const raw = JSON.parse(await readFile(path, 'utf8'))
  assert.deepEqual(raw.contexts, { 'oauth-codex/gpt-6-astra': 400_000, 'oauth-glm/glm-5.3': 900_000 })
  const second = new ModelSwitch({ path })
  await second.ready
  assert.equal(second.contextOf('oauth-codex/gpt-6-astra'), 400_000)
  // The vendor ceiling itself is a legal value; one token above is not.
  await second.setContext('oauth-codex/gpt-6-astra', 872_000, catalog)
  await assert.rejects(second.setContext('oauth-codex/gpt-6-astra', 872_001, catalog), /between 4096 and 872000/)
  await assert.rejects(second.setContext('oauth-glm/glm-5.3', 1_000_001, catalog), /between 4096 and 1000000/)
  // Rows without a large window cap at their own catalog window.
  await assert.rejects(second.setContext('oauth-codex/gpt-5.5', 400_000, catalog), /between 4096 and 258000/)
  // Same value is a no-op; reset removes exactly that entry.
  await second.setContext('oauth-codex/gpt-6-astra', 872_000, catalog)
  await second.setContext('oauth-codex/gpt-6-astra', null, catalog)
  assert.equal(second.contextOf('oauth-codex/gpt-6-astra'), undefined)
  assert.equal(second.contextOf('oauth-glm/glm-5.3'), 900_000)
  // Validation errors surface through the RPC.
  await assert.rejects(second.setContext('oauth-codex/unknown-id', 400_000, catalog), /unknown model/)
  await assert.rejects(second.setContext('oauth-codex/gpt-5.5', 4_095, catalog), /between/)
  await assert.rejects(second.setContext('oauth-codex/gpt-5.5', 1.5, catalog), /between/)
  await assert.rejects(second.setContext('oauth-codex/gpt-5.5', Number.NaN, catalog), /between/)
  // 恢复默认窗口 clears every override at once.
  await second.resetContexts()
  assert.deepEqual(second.contexts, {})
  const third = new ModelSwitch({ path })
  await third.ready
  assert.deepEqual(third.contexts, {})
  // A context choice is not an enable choice: leftover 全关 recovery keeps working.
  const models = new ModelSwitch()
  await models.ready
  models.disabled = new Set(catalog['oauth-glm'].models.map((m) => `oauth-glm/${m.id}`))
  await models.setContext('oauth-glm/glm-5.3', 300_000, catalog)
  const changed = await models.recoverEmptyLoggedInFamilies(catalog, { glm: true, codex: false, grok: false })
  assert.equal(changed, true)
  assert.equal(models.isEnabled('oauth-glm/glm-5.3'), true)
  assert.equal(models.contextOf('oauth-glm/glm-5.3'), 300_000)
})

test('ModelSwitch drops invalid persisted context entries on load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-models-'))
  const path = join(dir, 'models.json')
  await writeFile(path, `${JSON.stringify({
    disabled: [],
    enabled: [],
    contexts: {
      'oauth-codex/gpt-5.5': 400_000,
      'oauth-codex/gpt-5.5-tiny': 1_000,
      'oauth-codex/gpt-5.5-huge': 99_999_999,
      'oauth-codex/gpt-5.5-frac': 400_000.5,
      'no-slash': 400_000,
    },
  })}\n`, { mode: 0o600 })
  const models = new ModelSwitch({ path })
  await models.ready
  assert.deepEqual(models.contexts, { 'oauth-codex/gpt-5.5': 400_000 })
})

test('custom input contexts override windows per model key', () => {
  const contexts = {
    'oauth-codex/gpt-6-astra': 400_000,
    'oauth-codex/gpt-6-astra-fast': 300_000,
    'oauth-glm/glm-5.3': 300_000,
    'oauth-codex/not-in-catalog': 400_000,
  }
  const providers = buildProviders({ prefix: 'oauth', origin: 'http://x', loggedIn: { codex: true, glm: true }, contexts })
  const codex = providers['oauth-codex'].models
  assert.equal(codex.find((m) => m.id === 'gpt-6-astra').contextWindow, 400_000)
  // Key-exact: the `-fast` twin is its own key and keeps its catalog window
  // unless overridden itself.
  assert.equal(codex.find((m) => m.id === 'gpt-6-astra-fast').contextWindow, 300_000)
  assert.equal(codex.find((m) => m.id === 'gpt-6-sol').contextWindow, 258_000)
  assert.equal(providers['oauth-glm'].models.find((m) => m.id === 'glm-5.3').contextWindow, 300_000)
  assert.equal(providers['oauth-glm'].models.find((m) => m.id === 'glm-5.3-flash').contextWindow, 400_000)

  // describeCatalog takes the un-overridden catalog and applies `contexts`
  // itself, so the catalog default and ceiling stay visible next to the
  // effective window.
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const described = describeCatalog(catalog, { contexts })
  const glm = described.find((row) => row.family === 'glm').models
  assert.equal(glm.find((m) => m.id === 'glm-5.3').window, '300K')
  assert.equal(glm.find((m) => m.id === 'glm-5.3').custom, true)
  assert.equal(glm.find((m) => m.id === 'glm-5.3').windowMax, '1M')
  assert.equal(glm.find((m) => m.id === 'glm-5.3-flash').custom, false)
  assert.equal(glm.find((m) => m.id === 'glm-5.3-flash').window, '400K')
  const describedCodex = described.find((row) => row.family === 'codex').models
  assert.equal(describedCodex.find((m) => m.id === 'gpt-6-astra').window, '400K')
  assert.equal(describedCodex.find((m) => m.id === 'gpt-6-astra-fast').window, '300K')
  assert.equal(describedCodex.find((m) => m.id === 'gpt-6-astra-fast').custom, true)
})

test('syncHarnessModels writes custom windows and compaction headroom follows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-patch-'))
  const patchPath = join(dir, 'cordis.patch.yml')
  const ops = []
  await syncHarnessModels({
    settings: { mutate: async (target, mutations) => { ops.push({ target, mutations }) } },
    patchPath,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true },
    contexts: { 'oauth-codex/gpt-6-astra': 400_000 },
  })
  const set = ops[0].mutations.find((row) => row.op === 'set' && row.path[1] === 'oauth-codex')
  assert.equal(set.value.models.find((m) => m.id === 'gpt-6-astra').contextWindow, 400_000)
  // 400K sits under the ~640K policy threshold: headroom scales to 10% of
  // the custom window, not the catalog one.
  const patch = await readFile(patchPath, 'utf8')
  assert.match(patch, /provider: "oauth-codex", model: "gpt-6-astra", headroomTokens: 40000/)
})

test('ensureOpencodeGoRoute applies custom contexts to the supplemental route', async () => {
  const settings = createPiAiSettings()
  const key = `${OPENCODE_GO_EXTRA_ROUTE.id}/${OPENCODE_GO_EXTRA_MODELS[0].id}`
  await ensureOpencodeGoRoute(settings, { contexts: { [key]: 300_000 } })
  assert.equal(settings.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models[0].contextWindow, 300_000)
  assert.equal(settings.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models[1].contextWindow, OPENCODE_GO_EXTRA_MODELS[1].contextWindow)
})

test('syncHarnessModels honors a persisted selected subset', async () => {
  const ops = []
  const result = await syncHarnessModels({
    settings: { mutate: async (target, mutations) => { ops.push({ target, mutations }) } },
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true, grok: true },
    selected: ['oauth-codex/gpt-5.5', 'oauth-grok/grok-4.6'],
  })
  const set = ops[0].mutations.filter((row) => row.op === 'set')
  assert.deepEqual(set.map((row) => row.path[1]).sort(), ['oauth-codex', 'oauth-grok'])
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-codex').models, ['gpt-5.5'])
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-grok').models, ['grok-4.6'])
})

test('setFamily enables current GLM catalog keys and leaves retired ids in disabled', async () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const models = new ModelSwitch()
  await models.ready
  models.disabled = new Set([...GLM_CURRENT, ...GLM_STALE])
  await models.setFamily('glm', true, catalog)
  for (const key of GLM_CURRENT) {
    assert.equal(models.isEnabled(key), true)
    assert.equal(models.disabled.has(key), false)
  }
  for (const key of GLM_STALE) {
    assert.equal(models.disabled.has(key), true)
  }
  assert.equal(models.status(catalog).selected.includes('oauth-glm/glm-5.3'), true)
  assert.equal(models.status(catalog).selected.includes('oauth-glm/glm-5.3-flash'), true)
  assert.equal(models.status(catalog).selected.includes('oauth-glm/glm-5-turbo'), true)
  // 全选 turns every current GLM key on; `-1m` variant keys no longer exist
  // in the catalog, so they never appear in a selection.
  for (const key of GLM_VARIANT_KEYS) assert.equal(models.status(catalog).selected.includes(key), false)
})

test('recoverEmptyLoggedInFamilies enables current GLM keys after leftover 全关', async () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const models = new ModelSwitch()
  await models.ready
  models.disabled = new Set([...GLM_CURRENT, ...GLM_STALE])
  const changed = await models.recoverEmptyLoggedInFamilies(catalog, { glm: true, codex: false, grok: false })
  assert.equal(changed, true)
  for (const key of GLM_CURRENT) assert.equal(models.isEnabled(key), true)
  for (const key of GLM_STALE) assert.equal(models.disabled.has(key), true)
  // Recovery never surfaces removed variant keys: unknown to the catalog.
  for (const key of GLM_VARIANT_KEYS) assert.equal(models.status(catalog).selected.includes(key), false)
  const loggedOut = await models.recoverEmptyLoggedInFamilies(catalog, { glm: false, codex: false, grok: false })
  assert.equal(loggedOut, false)
})

test('GLM catalog is the plan trio; Codex stays image-capable', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const glm = catalog['oauth-glm'].models
  assert.deepEqual(glm.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  // Base rows sit at the plan's 400K input cap; the official 1M window is
  // the row's custom-context ceiling, no longer a `-1m` sibling row.
  assert.equal(glm.find((model) => model.id === 'glm-5.3').contextWindow, 400_000)
  assert.equal(glm.find((model) => model.id === 'glm-5.3-1m'), undefined)
  assert.equal(glm.find((model) => model.id === 'glm-5.3-flash-1m'), undefined)
  assert.deepEqual(glm.find((model) => model.id === 'glm-5.3').input, ['text'])
  assert.deepEqual(glm.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(glm.find((model) => model.id === 'glm-5-turbo').input, ['text'])
  assert.deepEqual(glm.find((model) => model.id === 'glm-5.3').reasoningEfforts, {
    low: 'low',
    high: 'high',
    max: 'max',
  })
  // Legacy / not-on-plan ids stay out of the picker: 5.2 + 5.1 auto-route to
  // 5.3, FlashX is not yet on the plan.
  assert.equal(glm.find((model) => model.id === 'glm-5.2'), undefined)
  assert.equal(glm.find((model) => model.id === 'glm-5.3-flashx'), undefined)
  assert.equal(glm.find((model) => model.id === 'glm-5-turbo').maxTokens, 32_768)
  assert.equal(glm.find((model) => model.id === 'glm-5-turbo').reasoningEfforts, false)
  assert.equal(catalog['oauth-glm'].compat?.forceAdaptiveThinking, true)
  assert.equal(catalog['oauth-glm'].compat?.allowEmptySignature, true)
  assert.equal(catalog['oauth-glm'].compat?.supportsReasoningEffort, undefined)
  assert.equal(catalog['oauth-glm'].compat?.thinkingFormat, undefined)
  assert.equal(glm.find((model) => model.id === 'glm-5.3-flash').name, 'GLM-5.3-Flash')
  assert.deepEqual(catalog['oauth-codex'].models.find((model) => model.id === 'gpt-5.5').input, ['text', 'image'])
  const described = describeCatalog(catalog).find((row) => row.family === 'glm')
  assert.deepEqual(described.models.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(described.models.find((model) => model.id === 'glm-5.3').input, ['text'])
  // Every row carries its effective window as the display tag — the click
  // target for the custom input-context editor — plus its ceiling.
  assert.equal(described.models.find((model) => model.id === 'glm-5.3').window, '400K')
  assert.equal(described.models.find((model) => model.id === 'glm-5.3').windowMax, '1M')
  assert.equal(described.models.find((model) => model.id === 'glm-5.3').contextMax, 1_000_000)
  assert.equal(described.models.find((model) => model.id === 'glm-5-turbo').window, '200K')
  assert.equal(described.models.find((model) => model.id === 'glm-5-turbo').windowMax, '200K')
  assert.equal(described.models.find((model) => model.id === 'glm-5.3').custom, false)
  // Codex rows without a large sibling are tagged too (edit entry per row).
  const describedCodex = describeCatalog(catalog).find((row) => row.family === 'codex')
  assert.equal(describedCodex.models.find((model) => model.id === 'gpt-5.5').window, '258K')
  assert.equal(describedCodex.models.find((model) => model.id === 'gpt-5.5').windowMax, '258K')
  assert.equal(describedCodex.models.find((model) => model.id === 'gpt-6-astra').window, '258K')
  assert.equal(describedCodex.models.find((model) => model.id === 'gpt-6-astra').windowMax, '872K')
})

test('glmModels override replaces the GLM catalog', () => {
  const catalog = catalogProviders({
    prefix: 'oauth',
    origin: 'http://x',
    glmModels: [{
      id: 'glm-5.3-flash',
      name: 'GLM-5.3-Flash Free',
      contextWindow: 1_000_000,
      maxTokens: 128_000,
      reasoningEfforts: { low: 'low', high: 'high', max: 'max' },
      input: ['text', 'image'],
    }],
  })
  const glm = catalog['oauth-glm'].models
  assert.deepEqual(glm.map((model) => model.id), ['glm-5.3-flash'])
  assert.equal(glm[0].name, 'GLM-5.3-Flash Free')
  assert.equal(glm.find((model) => model.id === 'glm-5.3'), undefined)
  assert.equal(glm.find((model) => model.id === 'glm-5-turbo'), undefined)
})

test('Antigravity catalog is cloudcode-pa Claude / Gemini / GPT-OSS', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const rows = catalog['oauth-antigravity'].models
  assert.equal(rows.some((model) => model.id === 'claude-sonnet-4-6'), true)
  assert.equal(rows.some((model) => model.id === 'gemini-pro-agent'), true)
  assert.equal(rows.some((model) => model.id === 'gemini-3.6-flash-high'), true)
  assert.equal(rows.some((model) => model.id === 'gemini-3.7-flash-high'), true)
  assert.equal(rows.some((model) => model.id === 'gemini-3.8-flash-high'), true)
  assert.equal(rows.some((model) => model.id === 'gemini-3.8-flash'), false)
  assert.equal(rows.some((model) => model.id === 'gpt-oss-120b-medium'), true)
  assert.deepEqual(rows.find((model) => model.id === 'gpt-oss-120b-medium').input, ['text'])
  assert.equal(catalog['oauth-antigravity'].compat.supportsReasoningEffort, true)
})

test('logged-in GLM 3/3 persist writes oauth-glm and a subsequent get shows it', async () => {
  const settings = createPiAiSettings({ 'oauth-codex': { api: 'openai-responses', models: [{ id: 'gpt-5.5' }] } })
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  const selected = catalogKeys(catalog).filter((key) => key.startsWith('oauth-glm/'))
  assert.deepEqual(selected, [
    'oauth-glm/glm-5.3',
    'oauth-glm/glm-5.3-flash',
    'oauth-glm/glm-5-turbo',
  ])
  const result = await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { glm: true },
    selected,
  })
  const set = settings.ops[0].mutations.filter((row) => row.op === 'set')
  const glm = set.find((row) => row.path[1] === 'oauth-glm')
  assert.equal(glm.value.api, HARNESS_ANTHROPIC_API)
  assert.equal(glm.value.baseURL, 'http://127.0.0.1:8318/glm')
  assert.equal(glm.value.compat.forceAdaptiveThinking, true)
  assert.equal(glm.value.compat.allowEmptySignature, true)
  assert.equal(glm.value.compat.thinkingFormat, undefined)
  assert.equal(glm.value.compat.supportsReasoningEffort, undefined)
  assert.deepEqual(glm.value.models.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-glm').models, ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  const stored = await peekPiAiProviders(settings)
  assert.equal(stored['oauth-glm'].api, 'anthropic-messages')
  assert.deepEqual(stored['oauth-glm'].models.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  assert.equal(stored['oauth-codex'], undefined)
})

test('logged-in Antigravity with leftover disabled keys still sets the enabled model', async () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  const agKeys = catalogKeys(catalog).filter((key) => key.startsWith('oauth-antigravity/'))
  const keep = 'oauth-antigravity/gemini-3.7-flash-high'
  const settings = createPiAiSettings()
  const result = await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { antigravity: true },
    selected: [keep],
  })
  assert.ok(agKeys.includes(keep))
  assert.ok(agKeys.length > 1)
  const stored = await peekPiAiProviders(settings)
  assert.equal(stored['oauth-antigravity'].api, HARNESS_COMPLETIONS_API)
  assert.deepEqual(stored['oauth-antigravity'].models.map((model) => model.id), ['gemini-3.7-flash-high'])
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-antigravity').models, ['gemini-3.7-flash-high'])
})

test('logged-in Kiro persist writes oauth-kiro with the kiro.dev catalog', async () => {
  const settings = createPiAiSettings()
  const result = await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { kiro: true },
  })
  const stored = await peekPiAiProviders(settings)
  assert.equal(stored['oauth-kiro'].api, HARNESS_COMPLETIONS_API)
  assert.deepEqual(stored['oauth-kiro'].models.map((model) => model.id), KIRO_MODELS.map((model) => model.id))
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-kiro').models, KIRO_MODELS.map((model) => model.id))
  assert.equal(stored['oauth-kiro'].reasoning, undefined)
  assert.equal(stored['oauth-kiro'].compat.supportsReasoningEffort, true)
  assert.deepEqual(stored['oauth-kiro'].models.find((model) => model.id === 'gpt-5.6-sol').input, ['text', 'image'])
  assert.deepEqual(stored['oauth-kiro'].models.find((model) => model.id === 'gpt-5.6-sol').reasoningEfforts, {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  })
  assert.deepEqual(stored['oauth-kiro'].models.find((model) => model.id === 'glm-5').input, ['text'])
  assert.equal(stored['oauth-kiro'].models.find((model) => model.id === 'glm-5').reasoningEfforts, false)
  assert.equal(Object.hasOwn(KIRO_REASONING_GPT, 'off'), true)
  assert.equal(Object.hasOwn(KIRO_REASONING_GPT, 'none'), false)
  assert.equal(KIRO_REASONING_GPT.off, 'none')
  assert.equal(Object.hasOwn(stored['oauth-kiro'].models.find((model) => model.id === 'gpt-5.6-sol').reasoningEfforts, 'none'), false)
})

test('logged-in GLM + Kiro persist together: anthropic GLM without completions compat, 18 Kiro rows', async () => {
  const settings = createPiAiSettings()
  const result = await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { glm: true, kiro: true },
  })
  const stored = await peekPiAiProviders(settings)
  const glm = stored['oauth-glm']
  const kiro = stored['oauth-kiro']
  assert.equal(glm.api, HARNESS_ANTHROPIC_API)
  assert.equal(glm.baseURL, 'http://127.0.0.1:8318/glm')
  assert.deepEqual(glm.compat, { forceAdaptiveThinking: true, allowEmptySignature: true })
  assert.equal(kiro.api, HARNESS_COMPLETIONS_API)
  assert.equal(kiro.compat.supportsReasoningEffort, true)
  assert.equal(kiro.compat.thinkingFormat, 'openai')
  assert.equal(kiro.models.length, KIRO_MODELS.length)
  assert.ok(KIRO_MODELS.length >= 18)
  assert.equal(KIRO_MODELS.some((model) => model.id === 'auto'), false)
  assert.ok(KIRO_MODELS.some((model) => model.id === 'claude-fable-5.1'))
  assert.ok(KIRO_MODELS.some((model) => model.id === 'claude-fable-5'))
  assert.deepEqual(kiro.models.map((model) => model.id), KIRO_MODELS.map((model) => model.id))
  assert.deepEqual(kiro.models.find((model) => model.id === 'gpt-5.6-sol').reasoningEfforts, {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  })
  assertDshServiceableProvider('oauth-glm', glm)
  assertDshServiceableProvider('oauth-kiro', kiro)
  assert.deepEqual(result.routes.map((row) => row.provider).sort(), ['oauth-glm', 'oauth-kiro'])
})

test('DSH refuses completions-only compat on an anthropic-messages GLM route', async () => {
  const settings = createPiAiSettings({
    'oauth-codex': { api: 'openai-responses', models: [{ id: 'gpt-5.5' }] },
  })
  await assert.rejects(settings.mutate('llm-pi-ai', [
    { op: 'unset', path: ['providers', 'oauth-kiro'] },
    {
      op: 'set',
      path: ['providers', 'oauth-glm'],
      value: {
        api: HARNESS_ANTHROPIC_API,
        baseURL: 'http://127.0.0.1:8318/glm',
        compat: { supportsReasoningEffort: true },
        models: [{ id: 'glm-5.3', reasoningEfforts: { low: 'low', high: 'high', max: 'max' } }],
      },
    },
    {
      op: 'set',
      path: ['providers', 'oauth-kiro'],
      value: {
        api: HARNESS_COMPLETIONS_API,
        compat: { supportsReasoningEffort: true, thinkingFormat: 'openai' },
        models: KIRO_MODELS.map((model) => ({ id: model.id, reasoningEfforts: model.reasoningEfforts })),
      },
    },
  ]), /sets compat "supportsReasoningEffort".*no model on the route speaks a protocol that takes it/)
  assert.equal(settings.section.providers['oauth-codex'].api, 'openai-responses')
  assert.equal(settings.section.providers['oauth-glm'], undefined)
  assert.equal(settings.section.providers['oauth-kiro'], undefined)
})

test('DSH refuses a vendor none key on reasoningEfforts', async () => {
  const settings = createPiAiSettings()
  await assert.rejects(settings.mutate('llm-pi-ai', [{
    op: 'set',
    path: ['providers', 'oauth-kiro'],
    value: {
      api: HARNESS_COMPLETIONS_API,
      models: [{ id: 'gpt-5.6-sol', reasoningEfforts: { none: 'none', low: 'low' } }],
    },
  }]), /reasoningEfforts key "none"/)
})

test('syncHarnessModels does not set provider-level reasoning', async () => {
  const settings = createPiAiSettings()
  await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true, grok: true },
  })
  const stored = await peekPiAiProviders(settings)
  assert.equal(stored['oauth-codex'].reasoning, undefined)
  assert.equal(stored['oauth-grok'].reasoning, undefined)
})

test('syncHarnessModels rejects a silent drop after mutate', async () => {
  const settings = {
    async mutate() {},
    describe() {
      return [{ ns: 'llm-pi-ai', value: { providers: {} } }]
    },
  }
  await assert.rejects(
    syncHarnessModels({
      settings,
      prefix: 'oauth',
      origin: 'http://127.0.0.1:8318',
      loggedIn: { glm: true },
    }),
    /did not persist providers\.oauth-glm/,
  )
})

test('cacheRetention long rides only the Completions routes and survives sync', async () => {
  const all = { codex: true, grok: true, glm: true, kiro: true, antigravity: true, cursor: true, ollama: true, kimi: true, copilot: true, devin: true, cline: true }
  const providers = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: all })
  const completions = Object.keys(providers).filter((id) => providers[id].api === HARNESS_COMPLETIONS_API).sort()
  assert.deepEqual(completions, ['oauth-antigravity', 'oauth-cline', 'oauth-copilot', 'oauth-cursor', 'oauth-devin', 'oauth-kimi', 'oauth-kiro', 'oauth-ollama'])
  for (const [id, value] of Object.entries(providers)) {
    assert.equal(value.cacheRetention, value.api === HARNESS_COMPLETIONS_API ? 'long' : undefined, id)
  }
  // OpenCode Go direct routes are not ours to retune.
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  for (const route of OPENCODE_GO_ROUTES) assert.equal(catalog[route.id].cacheRetention, undefined)

  const settings = createPiAiSettings()
  await syncHarnessModels({ settings, prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: all })
  const stored = await peekPiAiProviders(settings)
  for (const id of completions) assert.equal(stored[id].cacheRetention, 'long', id)
  assert.equal(stored['oauth-codex'].cacheRetention, undefined)
})

test('syncHarnessModels rejects a host that drops cacheRetention', async () => {
  const stored = {}
  const settings = {
    async mutate(_ns, ops) {
      for (const op of ops) {
        if (op.op !== 'set') continue
        const { cacheRetention, ...rest } = op.value
        stored[op.path[1]] = rest
      }
    },
    describe() {
      return [{ ns: 'llm-pi-ai', value: { providers: stored } }]
    },
  }
  await assert.rejects(
    syncHarnessModels({ settings, prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { ollama: true } }),
    /did not persist providers\.oauth-ollama\.cacheRetention/,
  )
})

test('bare api openai is refused by the DSH union and leaves the store unchanged', async () => {
  const settings = createPiAiSettings({ 'oauth-codex': { api: 'openai-responses', models: [{ id: 'gpt-5.5' }] } })
  await assert.rejects(settings.mutate('llm-pi-ai', [
    { op: 'unset', path: ['providers', 'oauth-codex'] },
    { op: 'set', path: ['providers', 'oauth-glm'], value: { api: 'openai', models: [{ id: 'glm-5.3' }] } },
  ]), /openai-completions/)
  assert.equal(settings.section.providers['oauth-codex'].api, 'openai-responses')
  assert.equal(settings.section.providers['oauth-glm'], undefined)
})

test('route maxTokens is a capped request budget, not the vendor ceiling', async () => {
  const settings = createPiAiSettings()
  await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true, grok: true, devin: true },
  })
  const stored = await peekPiAiProviders(settings)
  // Codex/gpt-6 rows advertise 128k output upstream; the route reserves 32768.
  assert.equal(stored['oauth-codex'].models.find((m) => m.id === 'gpt-6-luna').maxTokens, 32_768)
  // Grok clamps its advertised 1M cap to the 500k window; the route still reserves 32768.
  assert.equal(stored['oauth-grok'].models.find((m) => m.id === 'grok-4.7').maxTokens, 32_768)
  // Rows smaller than the budget keep their real value.
  assert.equal(stored['oauth-devin'].models.find((m) => m.id === 'swe-2').maxTokens, 32_768)
})

async function patchFile(content = '[]\n') {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-patch-'))
  const path = join(dir, 'cordis.patch.yml')
  await writeFile(path, content)
  return path
}

function parsePolicyRows(text) {
  return [...text.matchAll(/- \{ provider: "([^"]+)", model: "([^"]+)", headroomTokens: (\d+) \}/g)]
    .map(([, provider, model, headroomTokens]) => ({ provider, model, headroomTokens: Number(headroomTokens) }))
}

test('every synced route leaves a usable compaction threshold', async () => {
  const loggedIn = Object.fromEntries(FAMILY_IDS.map((id) => [id, true]))
  const settings = createPiAiSettings()
  const patchPath = await patchFile()
  await syncHarnessModels({
    settings,
    patchPath,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn,
  })
  const policies = parsePolicyRows(await readFile(patchPath, 'utf8'))
  const headroomOf = (provider, model) =>
    policies.find((row) => row.provider === provider && row.model === model)?.headroomTokens ?? 65_536
  const stored = await peekPiAiProviders(settings)
  for (const [provider, value] of Object.entries(stored)) {
    for (const model of value.models) {
      const reserved = model.maxTokens ?? 0
      const threshold = Math.floor(Math.min(
        model.contextWindow * 0.8,
        model.contextWindow - reserved - headroomOf(provider, model.id),
      ))
      assert.ok(
        threshold >= model.contextWindow * 0.5,
        `${provider}/${model.id} compaction threshold ${threshold} < 50% of ${model.contextWindow}`,
      )
    }
  }
})

test('syncHarnessModels manages a marked compaction policy block in the profile patch', async () => {
  const settings = createPiAiSettings()
  const foreign = '- id: ui-settings\n  name: \'@deepseek-ai/dsh-client-ui-settings\'\n  config:\n    enabled: true\n'
  const patchPath = await patchFile(foreign)
  const result = await syncHarnessModels({
    settings,
    patchPath,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true, glm: true },
  })
  assert.equal(result.compaction.status, 'written')
  const text = await readFile(patchPath, 'utf8')
  assert.ok(text.startsWith(foreign), 'existing entries are preserved byte-for-byte')
  const policies = parsePolicyRows(text)
  assert.equal(policies.some((row) => row.provider === 'oauth-codex' && row.model === 'gpt-6-luna' && row.headroomTokens === 25_800), true)
  // 200K-window glm-5-turbo and 400K-window glm-5.3 rows get a scaled
  // headroom; the 1M `-1m` variants keep the 65536 default.
  assert.equal(policies.some((row) => row.provider === 'oauth-glm' && row.model === 'glm-5-turbo' && row.headroomTokens === 20_000), true)
  assert.equal(policies.some((row) => row.provider === 'oauth-glm' && row.model === 'glm-5.3' && row.headroomTokens === 40_000), true)
  assert.equal(policies.some((row) => row.model === 'glm-5.3-1m'), false)
  // Second sync is a no-op.
  const again = await syncHarnessModels({
    settings,
    patchPath,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true, glm: true },
  })
  assert.equal(again.compaction.status, 'unchanged')
  assert.equal(await readFile(patchPath, 'utf8'), text)
  // Disabling the families removes the managed block and nothing else.
  await syncHarnessModels({
    settings,
    patchPath,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: {},
  })
  const cleared = await readFile(patchPath, 'utf8')
  assert.equal(cleared.includes('compaction-basic'), false)
  assert.ok(cleared.includes('ui-settings'))
})

test('an entry DSH appended inside the compaction markers survives the next sync, moved above the block', async () => {
  const settings = createPiAiSettings()
  const patchPath = await patchFile('- id: ui-settings\n  config:\n    enabled: true\n')
  const sync = () => syncHarnessModels({ settings, patchPath, prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { codex: true } })
  await sync()
  // Live: saving a default model appends after our entry, before our closing comment.
  const saved = '- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: oauth-kiro\n    model: claude-opus-5.5\n    reasoningEffort: medium\n'
  const written = await readFile(patchPath, 'utf8')
  const end = written.indexOf('# <<< dsh-plugin-oauth-subs')
  await writeFile(patchPath, written.slice(0, end) + saved + '\n' + written.slice(end))
  await sync()
  const text = await readFile(patchPath, 'utf8')
  assert.ok(text.includes(saved), 'the default model is kept')
  assert.ok(text.indexOf(saved) < text.indexOf('# >>> dsh-plugin-oauth-subs'), 'and moved out of the managed block')
  assert.equal((await sync()).compaction.status, 'unchanged')
})

test('the compaction tmp name is unique per call and carries the pid', () => {
  const patchPath = join('profile', 'cordis.patch.yml')
  const first = compactionTmpPath(patchPath)
  const second = compactionTmpPath(patchPath)
  assert.ok(first.startsWith(`profile/cordis.patch.yml.tmp-${process.pid}-`), first)
  assert.ok(second.startsWith(`profile/cordis.patch.yml.tmp-${process.pid}-`), second)
  assert.notEqual(first, second)
})

test('a default effort maps each model to its own nearest level; a route with a non-reasoning model gets none', () => {
  const route = (models) => ({ api: HARNESS_COMPLETIONS_API, models })
  const top = { id: 'top', reasoningEfforts: { low: 'low', high: 'high', max: 'max' } }
  const upToHigh = { id: 'mid', reasoningEfforts: { off: 'none', low: 'low', medium: 'medium', high: 'high' } }
  const maxed = withDefaultEffort(route([top, upToHigh]), 'max')
  assert.equal(maxed.reasoning, 'max')
  assert.equal(maxed.models[0], top, 'a model that declares the level is untouched')
  assert.equal(maxed.models[1].reasoningEfforts.max, 'high', 'max falls back to the highest level below')
  // Downward first and never onto off; upward only when nothing lies below.
  assert.equal(withDefaultEffort(route([top]), 'medium').models[0].reasoningEfforts.medium, 'low')
  assert.equal(withDefaultEffort(route([top]), 'off').models[0].reasoningEfforts.off, 'low')
  assert.equal(withDefaultEffort(route([upToHigh]), 'off').models[0], upToHigh)
  // DSH fails a non-reasoning model's no-effort requests once its route has a default.
  const mixed = route([top, { id: 'plain', reasoningEfforts: false }])
  assert.equal(withDefaultEffort(mixed, 'max'), mixed)
  assert.equal(withDefaultEffort(route([top]), undefined).reasoning, undefined)
})

test('default efforts persist per family in models.json; 全部 unifies them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-effort-'))
  const switches = new ModelSwitch({ path: join(dir, 'models.json') })
  await switches.setEffort('max')
  await switches.setEffort('medium', ['kiro'])
  await assert.rejects(switches.setEffort('minimal'), /effort must be one of/)
  await assert.rejects(switches.setEffort('max', ['nope']), /model family ids/)
  const reloaded = new ModelSwitch({ path: join(dir, 'models.json') })
  await reloaded.ready
  assert.equal(reloaded.efforts.kiro, 'medium')
  assert.equal(reloaded.efforts.codex, 'max')
  await reloaded.setEffort('low')
  assert.equal(new Set(Object.values(reloaded.efforts)).size, 1, 'setting every family overrides single-family picks')
  await reloaded.setEffort(null, ['kiro'])
  assert.equal(reloaded.efforts.kiro, undefined)
})

test('each route takes its own family default effort, OpenCode Go included', async () => {
  const settings = createPiAiSettings()
  await syncHarnessModels({ settings, prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { grok: true, codex: true }, efforts: { grok: 'max' } })
  const grok = settings.section.providers['oauth-grok']
  assert.equal(grok.reasoning, 'max')
  assert.equal(grok.models.find((m) => m.id === 'grok-4.7').reasoningEfforts.max, 'xhigh')
  assert.equal(grok.models.find((m) => m.id === 'grok-4.5').reasoningEfforts.max, 'high')
  assert.equal(settings.section.providers['oauth-codex'].reasoning, undefined, 'a family without a pick keeps the provider default')

  // An effort-only change still rewrites an owned OpenCode Go route.
  const go = createPiAiSettings()
  await ensureOpencodeGoRoute(go, {})
  const reasoningOnly = OPENCODE_GO_ROUTES
    .filter((route) => route.models.every((m) => m.reasoningEfforts && typeof m.reasoningEfforts === 'object'))
    .map((route) => route.id)
  const efforts = Object.fromEntries(OPENCODE_GO_ROUTES.map((route) => [route.id, 'high']))
  const result = await ensureOpencodeGoRoute(go, { efforts })
  assert.deepEqual(result.routes ?? [], reasoningOnly)
  for (const route of OPENCODE_GO_ROUTES) {
    assert.equal(go.section.providers[route.id].reasoning, reasoningOnly.includes(route.id) ? 'high' : undefined)
  }
  assert.equal((await ensureOpencodeGoRoute(go, { efforts })).status, 'present')
})

test('syncHarnessModels does not touch a hand-maintained compaction override', async () => {
  const settings = createPiAiSettings()
  const manual = '- id: compaction-basic\n  name: \'@deepseek-ai/dsh-compaction-basic\'\n  config:\n    headroomTokens: 4096\n'
  const patchPath = await patchFile(manual)
  const result = await syncHarnessModels({
    settings,
    patchPath,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true },
  })
  assert.equal(result.compaction.status, 'manual-override')
  assert.equal(await readFile(patchPath, 'utf8'), manual)
})
