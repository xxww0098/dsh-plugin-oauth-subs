import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { KIMI_INPUT, KIMI_MODELS, KIMI_REASONING } from '../lib/oauth/kimi/index.js'
import {
  KIMI_CATALOG_TTL_MS,
  kimiCatalogModels,
  kimiCatalogTokenHash,
  kimiReasoningEffortsOf,
  refreshKimiCatalog,
  toKimiPickerModels,
} from '../lib/oauth/kimi/catalog.js'

test('kimiCatalogTokenHash is the 16-hex sha256 prefix and coerces non-strings', () => {
  const expected = createHash('sha256').update('tok').digest('hex').slice(0, 16)
  assert.equal(kimiCatalogTokenHash('tok'), expected)
  assert.equal(kimiCatalogTokenHash(123), createHash('sha256').update('123').digest('hex').slice(0, 16))
  assert.equal(kimiCatalogTokenHash(undefined), createHash('sha256').update('').digest('hex').slice(0, 16))
  // Different tokens hash differently: the cache key rotates with the login.
  assert.notEqual(kimiCatalogTokenHash('a'), kimiCatalogTokenHash('b'))
})

test('kimiCatalogModels serves the offline table until a refresh caches rows', () => {
  assert.deepEqual(kimiCatalogModels(), [...KIMI_MODELS])
})

test('toKimiPickerModels takes data-wrapped or bare arrays and dedupes blank ids', () => {
  const models = toKimiPickerModels({ data: [
    { id: 'kimi-k2', display_name: ' K2 ', context_length: '131072' },
    { id: 'kimi-k2' },
    { id: '  ' },
    {},
  ] })
  assert.equal(models.length, 1)
  assert.deepEqual(models[0], {
    id: 'kimi-k2',
    name: 'K2',
    contextWindow: 131_072,
    maxTokens: models[0].maxTokens,
    input: [...KIMI_INPUT],
    reasoningEfforts: { ...KIMI_REASONING },
  })
  assert.deepEqual(toKimiPickerModels({ data: null }), [])
  assert.deepEqual(toKimiPickerModels('nope'), [])
})

test('toKimiPickerModels names, windows, and inputs fall back per row', () => {
  // Rows come back sorted by id — look them up, never assume input order.
  const byId = new Map(toKimiPickerModels([
    { id: 'k3-256k' },
    { id: 'k3', display_name: 'k3' },
    { id: 'fresh', display_name: '', context_length: 0 },
    { id: 'visionless', supports_image_in: false, context_length: 99_999.5 },
  ]).map((model) => [model.id, model]))
  // Known id keeps the offline name; a literal k3 display becomes Kimi K3.
  assert.equal(byId.get('k3-256k').name, KIMI_MODELS.find((m) => m.id === 'k3-256k')?.name)
  assert.equal(byId.get('k3').name, 'Kimi K3')
  // Blank display on an unknown id degrades to the id itself; unusable
  // context falls back to the offline window, then the 262_144 floor.
  assert.equal(byId.get('fresh').name, 'fresh')
  assert.equal(byId.get('fresh').contextWindow, 262_144)
  assert.equal(byId.get('visionless').contextWindow, 99_999)
  assert.equal(byId.get('visionless').input.includes('image'), false)
  assert.deepEqual(byId.get('k3-256k').input, [...KIMI_INPUT])
})

test('kimiReasoningEffortsOf maps upstream effort gates onto the wire vocabulary', () => {
  assert.equal(kimiReasoningEffortsOf({ supports_thinking_type: 'no' }), undefined)
  assert.equal(kimiReasoningEffortsOf({ supports_reasoning: false }), undefined)
  // Ungated row: every KIMI_REASONING level plus off.
  assert.deepEqual(kimiReasoningEffortsOf({}), { ...KIMI_REASONING })
  // A thinking-only model has no off level.
  assert.equal(kimiReasoningEffortsOf({ supports_thinking_type: 'only' }).off, undefined)
  // camelCase mirrors, allow-listed wires, and a default effort survive. The
  // gate is on WIRES: levels sharing an allowed wire (minimal/low -> low,
  // medium/high -> high) light up together; max-only keeps xhigh/max out.
  const gated = kimiReasoningEffortsOf({
    supportsThinkingType: 'supported',
    thinkEfforts: { support: true, valid_efforts: ['low'], default_effort: 'low' },
  })
  assert.deepEqual(gated, { off: 'off', minimal: 'low', low: 'low' })
  const maxOnly = kimiReasoningEffortsOf({
    supports_thinking_type: 'supported',
    think_efforts: { support: true, valid_efforts: ['max'] },
  })
  assert.deepEqual(maxOnly, { off: 'off', xhigh: 'max', max: 'max' })
  // An efforts object that does not declare support is ignored.
  assert.deepEqual(kimiReasoningEffortsOf({ think_efforts: { valid_efforts: ['low'] } }), { ...KIMI_REASONING })
})

test('refreshKimiCatalog without a token returns the offline table untouched', async () => {
  assert.deepEqual(await refreshKimiCatalog({ accessToken: '' }), [...KIMI_MODELS])
  assert.deepEqual(await refreshKimiCatalog({ accessToken: '  ' }), [...KIMI_MODELS])
})

test('refreshKimiCatalog caches per token hash, TTL, and serves stale on failure', async () => {
  const token = `catalog-cache-${Date.now()}`
  let body = JSON.stringify({ data: [{ id: 'live-a' }, { id: 'live-b' }] })
  let ok = true
  const fetchFn = async () => ({ ok, json: async () => JSON.parse(body) })
  const first = await refreshKimiCatalog({ accessToken: token }, { fetchFn })
  assert.deepEqual(first.map((m) => m.id), ['live-a', 'live-b'])
  assert.deepEqual(kimiCatalogModels().map((m) => m.id), ['live-a', 'live-b'], 'cache serves later readers')

  // Fresh cache short-circuits: the fetch stub is never consulted.
  assert.equal((await refreshKimiCatalog({ accessToken: token }, {
    fetchFn: async () => { throw new Error('must not fetch') },
  })).length, 2)

  // After the TTL lapses, a failing hop still serves the stale rows (line 119).
  await refreshKimiCatalog({ accessToken: token }, { fetchFn, ttlMs: -1 })
  ok = false
  body = 'not json'
  assert.deepEqual((await refreshKimiCatalog({ accessToken: token }, { fetchFn, ttlMs: -1 })).map((m) => m.id), ['live-a', 'live-b'])

  // A different token never reads the first token's cache.
  ok = true
  body = JSON.stringify({ data: [{ id: 'other' }] })
  assert.deepEqual((await refreshKimiCatalog({ accessToken: token + '-x' }, { fetchFn })).map((m) => m.id), ['other'])
})

test('refreshKimiCatalog falls back to the offline table on empty, error, or throw', async () => {
  const cases = [
    { ok: true, json: async () => ({ data: [] }) },
    { ok: false, json: async () => ({}) },
  ]
  for (const response of cases) {
    assert.deepEqual(
      await refreshKimiCatalog({ accessToken: 'fallback-token' }, { fetchFn: async () => response }),
      [...KIMI_MODELS],
    )
  }
  assert.deepEqual(
    await refreshKimiCatalog({ accessToken: 'fallback-token' }, { fetchFn: async () => { throw new Error('offline') } }),
    [...KIMI_MODELS],
  )
})

test('KIMI_CATALOG_TTL_MS stays the documented five minutes', () => {
  assert.equal(KIMI_CATALOG_TTL_MS, 5 * 60_000)
})
