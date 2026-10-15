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
  resetKimiCatalogCache,
  toKimiPickerModels,
} from '../lib/oauth/kimi/catalog.js'
import { exerciseLiveCatalog } from './catalog-lifecycle.ts'

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

test('refreshKimiCatalog caches per token hash and expires only after the stored TTL', async () => {
  resetKimiCatalogCache()
  const token = `catalog-cache-${Date.now()}`
  const now = 1_700_000_000_000
  let body = JSON.stringify({ data: [{ id: 'live-a' }, { id: 'live-b' }] })
  let ok = true
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return { ok, json: async () => JSON.parse(body) }
  }
  const first = await refreshKimiCatalog({ accessToken: token }, { fetchFn, now })
  assert.deepEqual(first.map((m) => m.id), ['live-a', 'live-b'])
  assert.deepEqual(kimiCatalogModels().map((m) => m.id), ['live-a', 'live-b'], 'cache serves later readers')

  // A negative ttl does not expire an entry that is still inside its stored TTL.
  assert.equal((await refreshKimiCatalog({ accessToken: token }, {
    fetchFn: async () => { throw new Error('must not fetch') },
    now,
    ttlMs: -1,
  })).length, 2)
  assert.equal(calls, 1)

  // Once the clock passes the stored expiry, a failing hop serves the previous
  // rows and does not mark them fresh again.
  ok = false
  body = 'not json'
  assert.deepEqual((await refreshKimiCatalog({ accessToken: token }, {
    fetchFn,
    now: now + KIMI_CATALOG_TTL_MS,
  })).map((m) => m.id), ['live-a', 'live-b'])
  assert.equal(calls, 2)
  ok = true
  body = JSON.stringify({ data: [{ id: 'live-c' }] })
  assert.deepEqual((await refreshKimiCatalog({ accessToken: token }, {
    fetchFn,
    now: now + KIMI_CATALOG_TTL_MS,
  })).map((m) => m.id), ['live-c'])
  assert.equal(calls, 3, 'the failed read did not refresh the expiry')

  // A different token never reads the first token's cache.
  body = JSON.stringify({ data: [{ id: 'other' }] })
  assert.deepEqual((await refreshKimiCatalog({ accessToken: token + '-x' }, { fetchFn, now })).map((m) => m.id), ['other'])
  resetKimiCatalogCache()
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

test('kimi catalog refresh keeps publish order, account identity, and the real TTL', async () => {
  const json = (kind) => ({
    ok: true,
    json: async () => ({
      data: [{
        id: kind === 'a' ? 'live-only-a' : 'live-only-b',
        context_length: kind === 'a' ? 100_000 : 200_000,
      }],
    }),
  })
  await exerciseLiveCatalog({
    label: 'kimi',
    ttlMs: KIMI_CATALOG_TTL_MS,
    windows: { a: 100_000, b: 200_000 },
    reset: resetKimiCatalogCache,
    models: kimiCatalogModels,
    refresh: ({ token, now, ttlMs, fetch }) => refreshKimiCatalog({ accessToken: token }, {
      now,
      ttlMs,
      fetchFn: async () => {
        const kind = await fetch()
        if (kind === 'fail') return { ok: false, json: async () => ({}) }
        if (kind === 'empty') return { ok: true, json: async () => ({ data: [] }) }
        return json(kind)
      },
    }),
  })
})
