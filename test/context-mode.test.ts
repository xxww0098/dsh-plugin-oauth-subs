import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyContextMode,
  codexLargeContext,
  isCodex900kBase,
  isLargeContextId,
  peelContextSuffix,
} from '../lib/utils/context-mode.js'
import { applyFastMode } from '../lib/utils/fast-mode.js'
import { withPickerVariants } from '../lib/oauth/models.js'

test('only GPT-6 and GPT-5.6 rows get a large-context variant', () => {
  assert.equal(isCodex900kBase('gpt-6-astra'), true)
  assert.equal(isCodex900kBase('gpt-6-sol'), true)
  assert.equal(isCodex900kBase('gpt-6-luna'), true)
  assert.equal(isCodex900kBase('gpt-5.6-sol'), true)
  assert.equal(isCodex900kBase('gpt-5.6-terra'), true)
  assert.equal(isCodex900kBase('gpt-5.6-luna'), true)
  assert.equal(isCodex900kBase('openai/gpt-5.6-sol-2026-07-09'), true)
  assert.equal(isCodex900kBase('gpt-5.5'), false)
  // retired: 400 "not supported when using Codex with a ChatGPT account"
  assert.equal(isCodex900kBase('gpt-5.4'), false)
  assert.equal(isCodex900kBase('gpt-5.3-codex'), false)
  assert.equal(isCodex900kBase('gpt-5.6-sol-900k'), false)
})

test('peelContextSuffix strips a valid -900k alias only', () => {
  assert.deepEqual(peelContextSuffix('gpt-5.6-sol-900k'), { model: 'gpt-5.6-sol', requestedLarge: true })
  assert.deepEqual(peelContextSuffix('gpt-6-luna-900k'), { model: 'gpt-6-luna', requestedLarge: true })
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

test('codexLargeContext reports each row max_context_window', () => {
  assert.equal(codexLargeContext('gpt-6-astra'), 872_000)
  assert.equal(codexLargeContext('gpt-6-sol'), 872_000)
  assert.equal(codexLargeContext('gpt-6-luna'), 872_000)
  assert.equal(codexLargeContext('gpt-5.6-sol'), 872_000)
  assert.equal(codexLargeContext('gpt-5.6-terra'), 872_000)
  assert.equal(codexLargeContext('gpt-5.6-luna'), 872_000)
  assert.equal(codexLargeContext('gpt-5.5'), undefined)
  assert.equal(codexLargeContext('gpt-5.4'), undefined)
})

test('withPickerVariants order is base, large context, Fast', () => {
  const catalog = withPickerVariants([
    { id: 'gpt-6-sol', name: 'GPT-6 Sol' },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' },
    { id: 'gpt-5.5', name: 'GPT-5.5' },
  ])
  assert.deepEqual(catalog.map((row) => row.id), [
    'gpt-6-sol',
    'gpt-6-sol-900k',
    'gpt-6-sol-fast',
    'gpt-5.6-luna',
    'gpt-5.6-luna-900k',
    'gpt-5.6-luna-fast',
    'gpt-5.5',
    'gpt-5.5-fast',
  ])
  assert.equal(catalog[1].name, 'GPT-6 Sol 872K')
  assert.equal(catalog[1].contextWindow, 872_000)
  assert.equal(catalog[6].name, 'GPT-5.5')
  assert.equal(catalog[7].name, 'GPT-5.5 Fast')
})
