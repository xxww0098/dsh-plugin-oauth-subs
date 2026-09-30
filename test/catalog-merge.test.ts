import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { assertCatalog } from '../lib/catalog/index.js'
import { mergeCatalogRows } from '../lib/catalog/merge.js'
import { fetchKiroLiveModels } from '../lib/oauth/kiro/catalog.js'

/**
 * The merge contract scripts/models.ts applies to each catalog key
 * (docs/models.md 合并规则). Fixtures are tiny literal rows, never the shipped
 * catalog, so a model refresh cannot turn these red.
 */

const row = (id, extra = {}) => ({ id, name: id.toUpperCase(), contextWindow: 100_000, maxTokens: 8_000, ...extra })

test('source fields overwrite; fields the source does not carry keep the catalog value', () => {
  const existing = [row('a', { input: ['text'], reasoningEfforts: { high: 'high' } })]
  const result = mergeCatalogRows(existing, [{ id: 'a', contextWindow: 200_000, maxTokens: undefined }])
  assert.deepEqual(result.rows, [row('a', { contextWindow: 200_000, input: ['text'], reasoningEfforts: { high: 'high' } })])
  assert.deepEqual(result.changed, [{ id: 'a', field: 'contextWindow', from: 100_000, to: 200_000 }])
})

test('name is curated: a source name never renames an existing row', () => {
  const result = mergeCatalogRows([row('gpt-6-sol', { name: 'GPT-6 Sol' })], [{ id: 'gpt-6-sol', name: 'GPT-6-Sol', contextWindow: 100_000 }])
  assert.equal(result.rows[0].name, 'GPT-6 Sol')
  assert.deepEqual(result.changed, [])
})

test('equality is semantic: effort key order, input order, and an omitted input all compare equal', () => {
  const existing = [row('a', { reasoningEfforts: { low: 'low', high: 'high' } }), row('b')]
  const result = mergeCatalogRows(existing, [
    { id: 'a', reasoningEfforts: { high: 'high', low: 'low' } },
    { id: 'b', input: ['image', 'text'] },
  ])
  assert.deepEqual(result.changed, [])
  assert.equal(result.rows[0], existing[0], 'untouched rows keep identity')
})

test('a keep rule reports the source value and leaves the catalog value', () => {
  const result = mergeCatalogRows([row('luna', { contextWindow: 258_000 })], [{ id: 'luna', contextWindow: 1_050_000, maxTokens: 9_000 }], {
    keep: [{ ids: ['luna'], fields: ['contextWindow'], why: 'default tier' }],
  })
  assert.equal(result.rows[0].contextWindow, 258_000)
  assert.equal(result.rows[0].maxTokens, 9_000)
  assert.deepEqual(result.kept, [{ id: 'luna', field: 'contextWindow', from: 258_000, to: 1_050_000, why: 'default tier' }])
})

test('existing order is the picker order; new rows go on top in source order through newRow', () => {
  const result = mergeCatalogRows([row('b'), row('a')], [{ id: 'z', contextWindow: 5 }, { id: 'a' }, { id: 'y', contextWindow: 6 }, { id: 'b' }], {
    newRow: (incoming) => ({ maxTokens: 1, ...incoming }),
  })
  assert.deepEqual(result.rows.map((r) => r.id), ['z', 'y', 'b', 'a'])
  assert.deepEqual(result.added, [{ maxTokens: 1, id: 'z', contextWindow: 5 }, { maxTokens: 1, id: 'y', contextWindow: 6 }])
})

test('a row the source dropped is reported missing and only removed with prune', () => {
  const kept = mergeCatalogRows([row('a'), row('gone')], [{ id: 'a' }])
  assert.deepEqual(kept.missing, ['gone'])
  assert.deepEqual(kept.rows.map((r) => r.id), ['a', 'gone'])
  const pruned = mergeCatalogRows([row('a'), row('gone')], [{ id: 'a' }], { prune: true })
  assert.deepEqual(pruned.removed, ['gone'])
  assert.deepEqual(pruned.rows.map((r) => r.id), ['a'])
})

test('a new id with no metadata is unresolved, not added', () => {
  const result = mergeCatalogRows([row('a')], [{ id: 'a' }, { id: 'glm-9', name: undefined }])
  assert.deepEqual(result.unresolved, [{ id: 'glm-9' }])
  assert.deepEqual(result.rows.map((r) => r.id), ['a'])
})

test('skip drops a source id with its reason; add:false reports new ids without writing them', () => {
  const result = mergeCatalogRows([row('a')], [{ id: 'alias', contextWindow: 1 }, { id: 'hidden', contextWindow: 2 }, { id: 'a', contextWindow: 3 }], {
    skip: [{ ids: ['alias'], why: 'duplicate id' }],
    add: false,
  })
  assert.deepEqual(result.skipped, [{ id: 'alias', why: 'duplicate id' }])
  assert.deepEqual(result.notAdded.map((r) => r.id), ['hidden'])
  assert.deepEqual(result.rows, [row('a', { contextWindow: 3 })], 'existing rows still refresh')
})

test('assertCatalog accepts the shipped catalog and rejects a row the loader would refuse', () => {
  const shipped = JSON.parse(readFileSync(fileURLToPath(new URL('../lib/catalog/models.json', import.meta.url)), 'utf8'))
  assertCatalog(shipped)
  const broken = { ...shipped, grok: [{ ...shipped.grok[0], reasoningEfforts: { ultra: 'ultra' } }] }
  assert.throws(() => assertCatalog(broken), /reasoningEfforts key "ultra"/)
  const { codex: _dropped, ...missing } = shipped
  assert.throws(() => assertCatalog(missing), /"codex": missing top-level key/)
})

test('kiro discovery asks the requested origin (governance list for the refresh script)', async () => {
  const seen: string[] = []
  const session = { accessToken: 'tok', expiresAt: Date.now() + 3_600_000, profileArn: 'arn:aws:codewhisperer:us-east-1:1:profile/X', region: 'us-east-1' }
  const models = await fetchKiroLiveModels(session, {
    origin: 'KIRO_CONSOLE',
    fetchFn: async (url) => {
      seen.push(String(url))
      return new Response(JSON.stringify({ models: [{ modelId: 'claude-opus-5.5' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  assert.deepEqual(models.map((m) => m.modelId), ['claude-opus-5.5'])
  const listed = seen.filter((href) => href.includes('List-Available-Models'))
  assert.ok(listed.length > 0 && listed.every((href) => new URL(href).searchParams.get('origin') === 'KIRO_CONSOLE'))
})
