import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { CATALOG_KEYS, catalogPricing, catalogRate, catalogRateTable, catalogRateTimeOfDay, catalogRows } from '../lib/catalog/index.js'
import { commandCodePricing } from '../lib/apikey/command-code/catalog.js'
import { buildProviders, catalogProviders, describeCatalog } from '../lib/oauth/models.js'
import { CURSOR_MODELS } from '../lib/oauth/cursor/index.js'

/**
 * src/catalog/rates.json pins the Models-tab price tooltip: USD per 1M tokens
 * for each model's primary upstream. Command Code is copied from its CLI
 * bundle (command-code@1.69.0 display-rates tables); every other family is
 * written by `npm run rates` from the sources in docs/models.md. The tests pin
 * the file's contract, the catalog coverage, and that nothing leaks into
 * route rows.
 */

const rates = JSON.parse(readFileSync(fileURLToPath(new URL('../lib/catalog/rates.json', import.meta.url)), 'utf8'))

test('rates.json covers every command-code catalog row, and only catalog ids', () => {
  const ids = new Set(catalogRows('command-code').map((row) => row.id))
  const keys = Object.keys(rates['command-code'])
  assert.equal(keys.length, ids.size)
  for (const key of keys) assert.ok(ids.has(key), `rates.json id "${key}" has no catalog row`)
})

test('rate rows stay non-negative finite USD numbers; tod bands carry both sides', () => {
  for (const [key, table] of Object.entries<any>(rates)) {
    if (key === 'timeOfDay') continue
    for (const [id, row] of Object.entries<any>(table)) {
      for (const field of ['in', 'out', ...('cacheRead' in row ? ['cacheRead'] : [])]) {
        assert.equal(typeof row[field], 'number', `${key}/${id}.${field}`)
        assert.ok(Number.isFinite(row[field]) && row[field] >= 0, `${key}/${id}.${field} non-negative`)
      }
      assert.equal('tod.peak' in row, 'tod.offPeak' in row, `${key}/${id} tod bands come in pairs`)
    }
  }
})

test('every family with catalog rows ships a price table keyed by its own ids or their -fast twins', () => {
  for (const key of CATALOG_KEYS) {
    if (key === 'ollamaRetired') continue
    const ids = new Set(catalogRows(key).map((row) => row.id))
    const table = catalogRateTable(key)
    assert.ok(table && Object.keys(table).length > 0, `${key} has no rates.json rows`)
    for (const id of Object.keys(table)) {
      assert.ok(ids.has(id) || (id.endsWith('-fast') && ids.has(id.slice(0, -5))), `${key} rate id "${id}" is not a catalog row or its -fast twin`)
    }
  }
})

test('fast model prices match the upstream kD display-rates row', () => {
  // command-code@1.69.0 kD: deepseek-v4.1-flash-fast in .16 / out .58 / cacheRead .016,
  // peak .32 / 1.16 / .032 (cache-hit reads are 5.33× the plain row, not 2×).
  const fast = catalogRate('command-code/deepseek/deepseek-v4.1-flash-fast')
  assert.deepEqual(
    { in: fast.in, out: fast.out, cacheRead: fast.cacheRead },
    { in: 0.16, out: 0.58, cacheRead: 0.016 },
  )
  assert.deepEqual(fast.tod.peak, { in: 0.32, out: 1.16, cacheRead: 0.032 })
  assert.deepEqual(fast.tod.offPeak, { in: 0.16, out: 0.58, cacheRead: 0.016 })

  const plain = catalogRate('command-code/deepseek/deepseek-v4.1-flash')
  assert.deepEqual(
    { in: plain.in, out: plain.out, cacheRead: plain.cacheRead },
    { in: 0.15, out: 0.6, cacheRead: 0.003 },
  )
})

test('non-gateway rows carry provider-lane prices (lD) and tier info', () => {
  // lD anthropic rows: sonnet-5-5 in $2 / out $10 / cache-hit $.20, writes priced.
  const sonnet = catalogRate('command-code/claude-sonnet-5-5')
  assert.deepEqual(
    { in: sonnet.in, out: sonnet.out, cacheRead: sonnet.cacheRead, cacheWrite: sonnet.cacheWrite, cacheWrite1h: sonnet.cacheWrite1h },
    { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5, cacheWrite1h: 4 },
  )
  // lD openai rows keep their over-threshold context tier (272K).
  const astra = catalogRate('command-code/gpt-6-astra')
  assert.equal(astra.tierThreshold, 272000)
  assert.deepEqual(astra.tiers, [{ in: 20, out: 75, cacheRead: 2 }])
})

test('time-of-day schedule mirrors the CLI constants', () => {
  const tod = catalogRateTimeOfDay()
  assert.equal(tod.effectiveFrom, '2026-08-16')
  assert.deepEqual(tod.peakWindowsUtc, [[1, 4], [6, 10]])
  assert.deepEqual([...tod.peakDaysUtc], [1, 2, 3, 4, 5])
})

test('catalogRate resolves <family>/<id> and refuses unknown ids', () => {
  assert.equal(catalogRate('command-code/deepseek/deepseek-v4.1-flash-fast').in, 0.16)
  assert.equal(catalogRate('command-code/not-a-model'), undefined)
  // The same model id is priced per family, never shared across families.
  assert.notDeepEqual(catalogRate('kiro/gpt-5.6-sol'), catalogRate('command-code/gpt-5.6-sol'))
  assert.equal(Object.keys(catalogRateTable('command-code')).length, 87)
})

test('describeCatalog puts a price on rows of every family, including runtime -fast twins', () => {
  // Cursor's live picker grows -fast siblings for its fast families; mirror
  // both derivation kinds (stated multiplier + explicit "(Fast)" row) so the
  // twins' pricing lookups are exercised against rates.json.
  const composer = CURSOR_MODELS.find((row) => row.id === 'composer-2.5')
  const sol = CURSOR_MODELS.find((row) => row.id === 'gpt-5.6-sol')
  const catalog = catalogProviders({
    prefix: 'oauth', origin: 'http://127.0.0.1:8318',
    cursorModels: CURSOR_MODELS.concat(
      { ...sol, id: 'gpt-5.6-sol-fast', name: 'GPT-5.6 Sol Fast' },
      { ...composer, id: 'composer-2.5-fast', name: 'Composer 2.5 Fast' },
    ),
  })
  const groups = describeCatalog(catalog, { pricing: catalogPricing() })
  const priced = (family, id) => groups.find((g) => g.family === family)?.models.find((m) => m.id === id)?.pricing
  // One row per source kind: vendor registry, Bedrock mapping, Cursor docs,
  // Devin cost table by uid, and a Codex fastTier twin grown outside models.json.
  assert.ok(priced('kiro', 'claude-opus-5.5'))
  assert.ok(priced('cursor', 'composer-2.5'))
  assert.ok(priced('devin', 'swe-2'))
  assert.ok(priced('codex', 'gpt-5.5-fast'))
  assert.ok(priced('copilot', 'gpt-4.1'))
  assert.equal(priced('codex', 'gpt-5.5-fast').in > priced('codex', 'gpt-5.5').in, true, 'priority twin is dearer than its base row')
  // Cursor fast variants: an explicit "(Fast)" docs row when the table has one,
  // else the base row × the multiplier its notes state ("Fast mode is available
  // at 2x pricing"). Notes without a number ("higher rates") stay coinless.
  const solPrice = priced('cursor', 'gpt-5.6-sol')
  const solFastPrice = priced('cursor', 'gpt-5.6-sol-fast')
  assert.ok(solPrice && solFastPrice, 'cursor derived fast row carries pricing')
  assert.deepEqual(
    { in: solFastPrice.in, out: solFastPrice.out, cacheRead: solFastPrice.cacheRead, cacheWrite: solFastPrice.cacheWrite },
    { in: solPrice.in * 2, out: solPrice.out * 2, cacheRead: solPrice.cacheRead * 2, cacheWrite: solPrice.cacheWrite * 2 },
  )
  assert.ok(priced('cursor', 'composer-2.5-fast'), 'explicit (Fast) docs row is used as-is')
  assert.equal(priced('cursor', 'gpt-5.5-fast'), undefined, 'no stated multiplier, no coin')
  // Grok's real backend Fast id prices off its base row × 2 — the upstream
  // picker's own description ("Fast variant. 2x the price.").
  const grok = priced('grok', 'grok-4.7')
  const grokFast = priced('grok', 'grok-4.7-build-fast')
  assert.ok(grok && grokFast, 'grok fast row carries pricing')
  assert.deepEqual(
    { in: grokFast.in, out: grokFast.out, cacheRead: grokFast.cacheRead, tiers: grokFast.tiers },
    {
      in: grok.in * 2, out: grok.out * 2, cacheRead: grok.cacheRead * 2,
      tiers: [{ in: grok.tiers[0].in * 2, out: grok.tiers[0].out * 2, cacheRead: grok.tiers[0].cacheRead * 2 }],
    },
  )
})

test('a rate without a published cache-read price loads without inventing one', () => {
  const row = Object.entries<any>(rates).flatMap(([key, table]) => (key === 'timeOfDay' ? [] : Object.entries<any>(table).map(([id, r]) => [key, id, r]))).find(([, , r]) => !('cacheRead' in r))
  assert.ok(row, 'fixture: at least one source row has no cache-read price')
  assert.equal('cacheRead' in catalogRate(`${row[0]}/${row[1]}`), false)
})

test('describeCatalog exposes pricing on Models-tab rows; route rows never carry it', () => {
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  const pricing = commandCodePricing()
  const group = describeCatalog(catalog, { pricing }).find((g) => g.family === 'command-code')
  const fast = group.models.find((m) => m.id === 'deepseek/deepseek-v4.1-flash-fast')
  assert.equal(fast.pricing.in, 0.16)
  assert.deepEqual(fast.pricing.tod.peak, { in: 0.32, out: 1.16, cacheRead: 0.032 })
  // without the map the field is absent entirely
  const bare = describeCatalog(catalog).find((g) => g.family === 'command-code')
  assert.equal('pricing' in bare.models[0], false)
  // never in a route row
  const routes = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { 'command-code': true } })
  assert.doesNotMatch(JSON.stringify(routes), /"pricing"/)
})

test('step-5-preview-free keeps the published free OpenCode Go price', () => {
  const row = catalogRate('opencode-go-flash/step-5-preview-free')
  assert.deepEqual({ in: row.in, out: row.out, cacheRead: row.cacheRead }, { in: 0, out: 0, cacheRead: 0 })
})

test('every catalog family key is allowed as a rates.json top-level key', () => {
  for (const key of Object.keys(rates)) {
    if (key === 'timeOfDay') continue
    assert.ok(CATALOG_KEYS.includes(key), `rates.json key "${key}" is not a catalog family`)
  }
})
