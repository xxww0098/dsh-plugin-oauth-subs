import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CODEX_LARGE_CONTEXT,
  applyContextMode,
  isCodex900kBase,
  isLargeContextId,
  peelContextSuffix,
  withContextVariants,
} from '../lib/context-mode.js'
import { applyFastMode } from '../lib/fast-mode.js'
import { withPickerVariants } from '../lib/models.js'

test('only gpt-5.4 and gpt-5.6 Sol/Terra/Luna get a 900K variant', () => {
  assert.equal(isCodex900kBase('gpt-5.6-sol'), true)
  assert.equal(isCodex900kBase('gpt-5.6-terra'), true)
  assert.equal(isCodex900kBase('gpt-5.6-luna'), true)
  assert.equal(isCodex900kBase('gpt-5.4'), true)
  assert.equal(isCodex900kBase('openai/gpt-5.6-sol-2026-07-09'), true)
  assert.equal(isCodex900kBase('gpt-5.5'), false)
  assert.equal(isCodex900kBase('gpt-5.4-mini'), false)
  assert.equal(isCodex900kBase('gpt-5.3-codex'), false)
  assert.equal(isCodex900kBase('gpt-5.6-sol-900k'), false)
})

test('peelContextSuffix strips a valid -900k alias only', () => {
  assert.deepEqual(peelContextSuffix('gpt-5.6-sol-900k'), { model: 'gpt-5.6-sol', requestedLarge: true })
  assert.deepEqual(peelContextSuffix('gpt-5.4-900k'), { model: 'gpt-5.4', requestedLarge: true })
  assert.deepEqual(peelContextSuffix('gpt-5.5-900k'), { model: 'gpt-5.5-900k', requestedLarge: false })
  assert.deepEqual(peelContextSuffix('gpt-5.6-sol'), { model: 'gpt-5.6-sol', requestedLarge: false })
  assert.equal(isLargeContextId('gpt-5.6-luna-900k'), true)
  assert.equal(isLargeContextId('gpt-5.6-luna'), false)
})

test('applyContextMode rewrites only the model id', () => {
  assert.deepEqual(
    applyContextMode({ model: 'gpt-5.6-terra-900k', input: 'hi' }),
    { model: 'gpt-5.6-terra', input: 'hi' },
  )
  assert.deepEqual(
    applyContextMode({ model: 'gpt-5.5-900k' }),
    { model: 'gpt-5.5-900k' },
  )
})

test('applyFastMode peels -900k then -fast before the wire', () => {
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.6-sol-900k', input: 'hi' }),
    { model: 'gpt-5.6-sol', input: 'hi' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.6-sol-900k-fast' }),
    { model: 'gpt-5.6-sol', service_tier: 'priority' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.6-sol-900k' }),
    { model: 'gpt-5.6-sol' },
  )
})

test('withContextVariants inserts 900K after eligible bases only', () => {
  const catalog = withContextVariants([
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: 272_000 },
    { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 272_000 },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextWindow: 272_000 },
  ])
  assert.deepEqual(catalog.map((row) => row.id), [
    'gpt-5.6-sol',
    'gpt-5.6-sol-900k',
    'gpt-5.5',
    'gpt-5.4-mini',
  ])
  assert.equal(catalog[1].contextWindow, CODEX_LARGE_CONTEXT)
  assert.equal(catalog[1].name, 'GPT-5.6 Sol 900K')
})

test('withPickerVariants order is base, 900K, Fast', () => {
  const catalog = withPickerVariants([
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: 272_000 },
    { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 272_000 },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', contextWindow: 272_000 },
  ])
  assert.deepEqual(catalog.map((row) => row.id), [
    'gpt-5.6-sol',
    'gpt-5.6-sol-900k',
    'gpt-5.6-sol-fast',
    'gpt-5.5',
    'gpt-5.5-fast',
    'gpt-5.3-codex',
  ])
})
