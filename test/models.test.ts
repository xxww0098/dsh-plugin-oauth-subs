import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  OAUTH_CREDENTIAL_REF,
  HARNESS_COMPLETIONS_API,
  HARNESS_RESPONSES_API,
  ModelSwitch,
  buildProviders,
  catalogKeys,
  catalogProviders,
  describeCatalog,
  filterProviders,
  modelKey,
  ownedProviderIds,
  peekPiAiProviders,
  syncHarnessModels,
} from '../lib/oauth/models.js'
import { KIRO_MODELS } from '../lib/oauth/kiro/index.js'

const DSH_APIS = new Set(['openai-completions', 'openai-responses', 'anthropic-messages'])

function createPiAiSettings(initialProviders = {}) {
  const section = { providers: structuredClone(initialProviders) }
  const ops = []
  return {
    ops,
    section,
    get(name) {
      if (name !== 'llm-pi-ai') return undefined
      return structuredClone(section)
    },
    async mutate(target, mutations) {
      if (target !== 'llm-pi-ai') throw new Error(`unknown settings namespace ${target}`)
      const next = { providers: { ...section.providers } }
      for (const row of mutations) {
        const key = row.path?.[1]
        if (row.path?.[0] !== 'providers' || typeof key !== 'string') throw new Error('bad path')
        if (row.op === 'unset') {
          delete next.providers[key]
        } else if (row.op === 'set') {
          if (!DSH_APIS.has(row.value?.api)) {
            throw new Error(`llm-pi-ai: provider "${key}" api must be openai-completions | openai-responses | anthropic-messages`)
          }
          next.providers[key] = structuredClone(row.value)
        }
      }
      section.providers = next.providers
      ops.push({ target, mutations })
    },
  }
}

const GLM_CURRENT = ['oauth-glm/glm-5.3', 'oauth-glm/glm-5.3-flash', 'oauth-glm/glm-5-turbo']
const GLM_STALE = ['oauth-glm/glm-4.7', 'oauth-glm/glm-5', 'oauth-glm/glm-5.1', 'oauth-glm/glm-5.2']

test('buildProviders only emits logged-in families with DSH api ids', () => {
  const both = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { codex: true, grok: true } })
  assert.equal(both['oauth-codex'].api, HARNESS_RESPONSES_API)
  assert.equal(both['oauth-codex'].api, 'openai-responses')
  assert.equal(both['oauth-codex'].apiKeyEnv, OAUTH_CREDENTIAL_REF)
  assert.equal(both['oauth-codex'].baseURL, 'http://127.0.0.1:8318/codex/v1')
  assert.equal(both['oauth-grok'].displayName.includes('Grok'), true)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.6').contextWindow, 500_000)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.6-fast'), undefined)
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.5').contextWindow, 500_000)
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
  assert.equal(both['oauth-grok'].models.find((model) => model.id === 'grok-4.6').maxTokens, 500_000)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.5').reasoningEfforts.off, null)
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.5').reasoningEfforts.max, undefined)
  assert.deepEqual(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol').reasoningEfforts, {
    off: null,
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  })
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol-fast').reasoningEfforts.max, 'max')
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol-900k').reasoningEfforts.max, 'max')
  assert.equal(both['oauth-codex'].models.find((model) => model.id === 'gpt-5.6-sol-ultra'), undefined)
  const none = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { codex: false, grok: false } })
  assert.deepEqual(Object.keys(none), [])
  const chat = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { glm: true, kiro: true, antigravity: true },
  })
  assert.equal(chat['oauth-glm'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-kiro'].api, HARNESS_COMPLETIONS_API)
  assert.equal(chat['oauth-kiro'].compat.supportsReasoningEffort, true)
  assert.equal(chat['oauth-antigravity'].api, HARNESS_COMPLETIONS_API)
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
  const unset = ops[0].mutations.filter((row) => row.op === 'unset').map((row) => row.path.join('.'))
  assert.deepEqual(unset, ownedProviderIds('oauth').map((id) => `providers.${id}`))
  const set = ops[0].mutations.filter((row) => row.op === 'set')
  assert.equal(set.length, 1)
  assert.deepEqual(set[0].path, ['providers', 'oauth-codex'])
  assert.equal(result.routes[0].models.includes('gpt-5.3-codex'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.3-codex-spark'), true)
  assert.equal(result.routes[0].models.includes('gpt-5.4-mini-fast'), false)
  assert.deepEqual(result.routes[0].models.includes('gpt-5.5'), true)
  assert.deepEqual(result.routes[0].models.includes('gpt-5.5-fast'), true)
  assert.equal(result.routes[0].models.includes('gpt-5.3-codex-fast'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.6-sol-900k'), true)
  assert.equal(result.routes[0].models.includes('gpt-5.6-sol-ultra'), false)
  assert.equal(result.routes[0].models.includes('gpt-5.5-900k'), false)
})

test('filterProviders keeps only selected keys', () => {
  const providers = buildProviders({ prefix: 'oauth', origin: 'http://x', loggedIn: { codex: true, grok: true } })
  const filtered = filterProviders(providers, [modelKey('oauth-grok', 'grok-4.5')])
  assert.equal(filtered['oauth-codex'], undefined)
  assert.deepEqual(filtered['oauth-grok'].models.map((m) => m.id), ['grok-4.5'])
})

test('catalogProviders always lists both families with Fast and 900K siblings', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const keys = catalogKeys(catalog)
  assert.equal(keys.includes('oauth-codex/gpt-5.5'), true)
  assert.equal(keys.includes('oauth-codex/gpt-5.5-fast'), true)
  assert.equal(keys.includes('oauth-codex/gpt-5.6-sol-900k'), true)
  assert.equal(keys.includes('oauth-codex/gpt-5.6-sol-ultra'), false)
  assert.equal(keys.includes('oauth-codex/gpt-5.4-900k'), true)
  assert.equal(keys.includes('oauth-codex/gpt-5.5-900k'), false)
  assert.equal(keys.includes('oauth-codex/gpt-5.4-mini-900k'), false)
  assert.equal(keys.includes('oauth-grok/grok-4.6'), true)
  assert.equal(keys.includes('oauth-grok/grok-4'), false)
  assert.equal(keys.includes('oauth-grok/grok-4.6-fast'), false)
  const described = describeCatalog(catalog, {
    enabledKeys: ['oauth-codex/gpt-5.5'],
    loggedIn: { codex: true, grok: false },
  })
  const gpt = described.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.5')
  const large = described.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.6-sol-900k')
  const grok = described.find((row) => row.family === 'grok')
  assert.equal(gpt.enabled, true)
  assert.equal(large.large, true)
  assert.equal(large.enabled, false)
  assert.equal(grok.loggedIn, false)
  assert.equal(grok.models.find((m) => m.id === 'grok-4.5').enabled, false)
  assert.equal(grok.models.find((m) => m.id === 'grok-4'), undefined)
})

test('ModelSwitch persists disabled keys and defaults 900K off', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-models-'))
  const path = join(dir, 'models.json')
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const first = new ModelSwitch({ path })
  await first.ready
  const initial = first.selectedForSync(catalog)
  assert.equal(initial.includes('oauth-codex/gpt-5.5'), true)
  assert.equal(initial.includes('oauth-codex/gpt-5.6-sol-900k'), false)
  await first.toggle('oauth-codex/gpt-5.5-fast', false, catalog)
  assert.equal(first.status(catalog).selected.includes('oauth-codex/gpt-5.5-fast'), false)
  assert.equal(first.status(catalog).selected.includes('oauth-codex/gpt-5.5'), true)
  await first.toggle('oauth-codex/gpt-5.6-sol-900k', true, catalog)
  assert.equal(first.status(catalog).selected.includes('oauth-codex/gpt-5.6-sol-900k'), true)
  const raw = JSON.parse(await readFile(path, 'utf8'))
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  assert.equal(raw.disabled.includes('oauth-codex/gpt-5.5-fast'), true)
  assert.equal(raw.enabled.includes('oauth-codex/gpt-5.6-sol-900k'), true)
  const second = new ModelSwitch({ path })
  await second.ready
  assert.equal(second.selectedForSync(catalog).includes('oauth-codex/gpt-5.5-fast'), false)
  assert.equal(second.selectedForSync(catalog).includes('oauth-codex/gpt-5.6-sol-900k'), true)
  await second.setFamily('grok', false, catalog)
  assert.equal(second.status(catalog).disabled.some((key) => key.startsWith('oauth-grok/')), true)
  await second.setAll(true, catalog)
  assert.equal(second.selectedForSync(catalog), undefined)
  assert.equal(second.status(catalog).selected.includes('oauth-codex/gpt-5.4-900k'), true)
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
  const loggedOut = await models.recoverEmptyLoggedInFamilies(catalog, { glm: false, codex: false, grok: false })
  assert.equal(loggedOut, false)
})

test('GLM catalog is three models with official input types; Codex stays image-capable', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const glm = catalog['oauth-glm'].models
  assert.deepEqual(glm.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  assert.deepEqual(glm.find((model) => model.id === 'glm-5.3').input, ['text'])
  assert.deepEqual(glm.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(glm.find((model) => model.id === 'glm-5-turbo').input, ['text'])
  assert.deepEqual(glm.find((model) => model.id === 'glm-5.3').reasoningEfforts, {
    low: 'low',
    high: 'high',
    max: 'max',
  })
  assert.equal(glm.find((model) => model.id === 'glm-5-turbo').reasoningEfforts, false)
  assert.equal(catalog['oauth-glm'].compat.thinkingFormat, 'openai')
  assert.equal(glm.find((model) => model.id === 'glm-5.3-flash').name, 'GLM-5.3-Flash')
  assert.deepEqual(catalog['oauth-codex'].models.find((model) => model.id === 'gpt-5.5').input, ['text', 'image'])
  const described = describeCatalog(catalog).find((row) => row.family === 'glm')
  assert.deepEqual(described.models.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(described.models.find((model) => model.id === 'glm-5.3').input, ['text'])
})

test('Antigravity catalog is cloudcode-pa Claude / Gemini / GPT-OSS', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const rows = catalog['oauth-antigravity'].models
  assert.equal(rows.some((model) => model.id === 'claude-sonnet-4-6'), true)
  assert.equal(rows.some((model) => model.id === 'gemini-pro-agent'), true)
  assert.equal(rows.some((model) => model.id === 'gpt-oss-120b-medium'), true)
  assert.deepEqual(rows.find((model) => model.id === 'gpt-oss-120b-medium').input, ['text'])
  assert.equal(catalog['oauth-antigravity'].compat.supportsReasoningEffort, true)
})

test('logged-in GLM 3/3 persist writes oauth-glm and a subsequent get shows it', async () => {
  const settings = createPiAiSettings({ 'oauth-codex': { api: 'openai-responses', models: [{ id: 'gpt-5.5' }] } })
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  const selected = catalogKeys(catalog).filter((key) => key.startsWith('oauth-glm/'))
  assert.deepEqual(selected, GLM_CURRENT)
  const result = await syncHarnessModels({
    settings,
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { glm: true },
    selected,
  })
  const set = settings.ops[0].mutations.filter((row) => row.op === 'set')
  const glm = set.find((row) => row.path[1] === 'oauth-glm')
  assert.equal(glm.value.api, HARNESS_COMPLETIONS_API)
  assert.equal(glm.value.baseURL, 'http://127.0.0.1:8318/glm/v1')
  assert.equal(glm.value.compat.thinkingFormat, 'openai')
  assert.deepEqual(glm.value.models.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-glm').models, ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  const stored = await peekPiAiProviders(settings)
  assert.equal(stored['oauth-glm'].api, 'openai-completions')
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
  assert.equal(agKeys.length, 13)
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
  assert.deepEqual(stored['oauth-kiro'].models.find((model) => model.id === 'glm-5').input, ['text'])
  assert.equal(stored['oauth-kiro'].models.find((model) => model.id === 'glm-5').reasoningEfforts, false)
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
    get() {
      return { providers: {} }
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

test('bare api openai is refused by the DSH union and leaves the store unchanged', async () => {
  const settings = createPiAiSettings({ 'oauth-codex': { api: 'openai-responses', models: [{ id: 'gpt-5.5' }] } })
  await assert.rejects(settings.mutate('llm-pi-ai', [
    { op: 'unset', path: ['providers', 'oauth-codex'] },
    { op: 'set', path: ['providers', 'oauth-glm'], value: { api: 'openai', models: [{ id: 'glm-5.3' }] } },
  ]), /openai-completions/)
  assert.equal(settings.section.providers['oauth-codex'].api, 'openai-responses')
  assert.equal(settings.section.providers['oauth-glm'], undefined)
})
