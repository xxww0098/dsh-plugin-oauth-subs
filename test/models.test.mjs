import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  OAUTH_CREDENTIAL_REF,
  ModelSwitch,
  buildProviders,
  catalogKeys,
  catalogProviders,
  describeCatalog,
  filterProviders,
  modelKey,
  ownedProviderIds,
  syncHarnessModels,
} from '../lib/models.js'

test('buildProviders only emits logged-in families with openai-responses', () => {
  const both = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { codex: true, grok: true } })
  assert.equal(both['oauth-codex'].api, 'openai-responses')
  assert.equal(both['oauth-codex'].apiKeyEnv, OAUTH_CREDENTIAL_REF)
  assert.equal(both['oauth-codex'].baseURL, 'http://127.0.0.1:8318/codex/v1')
  assert.equal(both['oauth-grok'].displayName.includes('Grok'), true)
  const none = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { codex: false, grok: false } })
  assert.deepEqual(Object.keys(none), [])
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
  assert.deepEqual(result.routes[0].models.includes('gpt-5.3-codex'), true)
  assert.deepEqual(result.routes[0].models.includes('gpt-5.5'), true)
  assert.deepEqual(result.routes[0].models.includes('gpt-5.5-fast'), true)
  assert.equal(result.routes[0].models.includes('gpt-5.3-codex-fast'), false)
})

test('filterProviders keeps only selected keys', () => {
  const providers = buildProviders({ prefix: 'oauth', origin: 'http://x', loggedIn: { codex: true, grok: true } })
  const filtered = filterProviders(providers, [modelKey('oauth-grok', 'grok-4')])
  assert.equal(filtered['oauth-codex'], undefined)
  assert.deepEqual(filtered['oauth-grok'].models.map((m) => m.id), ['grok-4'])
})

test('catalogProviders always lists both families with Fast siblings', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const keys = catalogKeys(catalog)
  assert.equal(keys.includes('oauth-codex/gpt-5.5'), true)
  assert.equal(keys.includes('oauth-codex/gpt-5.5-fast'), true)
  assert.equal(keys.includes('oauth-grok/grok-4.6'), true)
  assert.equal(keys.includes('oauth-grok/grok-4.6-fast'), true)
  const described = describeCatalog(catalog, {
    enabledKeys: ['oauth-codex/gpt-5.5'],
    loggedIn: { codex: true, grok: false },
  })
  const gpt = described.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.5')
  const grok = described.find((row) => row.family === 'grok')
  assert.equal(gpt.enabled, true)
  assert.equal(grok.loggedIn, false)
  assert.equal(grok.models.find((m) => m.id === 'grok-4').enabled, false)
})

test('ModelSwitch persists disabled keys and defaults new models on', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-models-'))
  const path = join(dir, 'models.json')
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  const first = new ModelSwitch({ path })
  await first.ready
  assert.equal(first.selectedForSync(catalog), undefined)
  await first.toggle('oauth-codex/gpt-5.5-fast', false, catalog)
  assert.equal(first.status(catalog).selected.includes('oauth-codex/gpt-5.5-fast'), false)
  assert.equal(first.status(catalog).selected.includes('oauth-codex/gpt-5.5'), true)
  const raw = JSON.parse(await readFile(path, 'utf8'))
  assert.deepEqual(raw.disabled, ['oauth-codex/gpt-5.5-fast'])
  const second = new ModelSwitch({ path })
  await second.ready
  assert.equal(second.selectedForSync(catalog).includes('oauth-codex/gpt-5.5-fast'), false)
  await second.setFamily('grok', false, catalog)
  assert.equal(second.status(catalog).disabled.some((key) => key.startsWith('oauth-grok/')), true)
  await second.setAll(true, catalog)
  assert.equal(second.selectedForSync(catalog), undefined)
})

test('syncHarnessModels honors a persisted selected subset', async () => {
  const ops = []
  const result = await syncHarnessModels({
    settings: { mutate: async (target, mutations) => { ops.push({ target, mutations }) } },
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { codex: true, grok: true },
    selected: ['oauth-codex/gpt-5.5', 'oauth-grok/grok-4.6-fast'],
  })
  const set = ops[0].mutations.filter((row) => row.op === 'set')
  assert.deepEqual(set.map((row) => row.path[1]).sort(), ['oauth-codex', 'oauth-grok'])
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-codex').models, ['gpt-5.5'])
  assert.deepEqual(result.routes.find((row) => row.provider === 'oauth-grok').models, ['grok-4.6-fast'])
})
