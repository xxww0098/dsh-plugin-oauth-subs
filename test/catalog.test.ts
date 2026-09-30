import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { CATALOG_EFFORT_KEYS, CATALOG_KEYS, catalogRows } from '../lib/catalog/index.js'
import { DSH_THINKING_LEVELS, FAMILY_IDS, APIKEY_FAMILY_IDS } from '../lib/oauth/models.js'
import { OLLAMA_RETIRED_MODELS } from '../lib/apikey/ollama/index.js'

/**
 * The unified catalog JSON (src/catalog/models.json) is the single source of
 * the static per-family rows. These tests pin its contract: the top-level key
 * set matches what the wiring expects, every family a picker can toggle has
 * rows, the DSH closed sets stay in sync between the loader's local copy and
 * src/oauth/models.ts, and the loader actually feeds the family exports.
 */

/** OpenCode Go picker families are route ids, not one family key. */
const OPENCODE_GO_ROUTE_KEYS = ['opencode-go-flash', 'opencode-go-responses']

test('catalog JSON top-level keys are exactly the expected set', () => {
  const raw = JSON.parse(readFileSync(fileURLToPath(new URL('../lib/catalog/models.json', import.meta.url)), 'utf8'))
  assert.deepEqual(Object.keys(raw).sort(), [...CATALOG_KEYS].sort())
})

test('every picker family has non-empty static rows', () => {
  for (const family of FAMILY_IDS) {
    assert.ok(catalogRows(family).length > 0, `${family} has no rows`)
  }
  for (const key of ['ollamaRetired', 'command-code', ...OPENCODE_GO_ROUTE_KEYS]) {
    assert.ok(catalogRows(key).length > 0, `${key} has no rows`)
  }
})

test('every apikey picker route id has a catalog key', () => {
  for (const id of APIKEY_FAMILY_IDS) {
    assert.ok(CATALOG_KEYS.includes(id), `apikey route ${id} missing a catalog key`)
  }
})

test('loader effort keys stay in sync with DSH_THINKING_LEVELS', () => {
  assert.deepEqual([...CATALOG_EFFORT_KEYS], [...DSH_THINKING_LEVELS])
})

test('rows are validated: unique ids, closed-set efforts, input kinds, numeric floors', () => {
  for (const key of CATALOG_KEYS) {
    if (key === 'ollamaRetired') continue
    const rows = catalogRows(key)
    const ids = new Set(rows.map((row) => row.id))
    assert.equal(ids.size, rows.length, `${key} has duplicate model ids`)
    for (const row of rows) {
      assert.equal(typeof row.id, 'string', `${key}/${row.id} id`)
      assert.equal(typeof row.name, 'string', `${key}/${row.id} name`)
      assert.ok(Number.isInteger(row.contextWindow) && row.contextWindow > 0, `${key}/${row.id} contextWindow`)
      if (row.maxTokens !== undefined) {
        assert.ok(Number.isInteger(row.maxTokens) && row.maxTokens > 0, `${key}/${row.id} maxTokens`)
      }
      if (row.input !== undefined) {
        for (const kind of row.input) assert.ok(['text', 'image'].includes(kind), `${key}/${row.id} input ${kind}`)
      }
      const efforts = row.reasoningEfforts
      if (efforts !== undefined && efforts !== false) {
        for (const level of Object.keys(efforts)) {
          assert.ok(CATALOG_EFFORT_KEYS.includes(level), `${key}/${row.id} effort key ${level} outside the closed set`)
          assert.ok(efforts[level] === null || typeof efforts[level] === 'string', `${key}/${row.id} effort wire value`)
        }
      }
    }
  }
})

test('rows are frozen at load', () => {
  const rows = catalogRows('codex')
  assert.ok(Object.isFrozen(rows), 'array is frozen')
  assert.ok(Object.isFrozen(rows[0]), 'row is frozen')
  assert.ok(Object.isFrozen(rows[0].input), 'input array is frozen')
})

test('ollamaRetired rows back OLLAMA_RETIRED_MODELS', () => {
  assert.deepEqual([...OLLAMA_RETIRED_MODELS].sort(), [...catalogRows('ollamaRetired')].sort())
})

test('unknown key is refused', () => {
  assert.throws(() => catalogRows('not-a-family'), /has no key/)
})
