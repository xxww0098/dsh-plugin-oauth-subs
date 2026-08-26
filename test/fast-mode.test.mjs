import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyFastMode,
  isCodexSeries,
  modelSupportsFastMode,
  peelFastSuffix,
  withFastVariants,
} from '../lib/fast-mode.js'

test('GPT flagships support Fast; Codex-series and older Grok do not', () => {
  assert.equal(modelSupportsFastMode('gpt-5.5'), true)
  assert.equal(modelSupportsFastMode('openai/gpt-5.4'), true)
  assert.equal(modelSupportsFastMode('o3-mini'), true)
  assert.equal(modelSupportsFastMode('grok-4.6'), true)
  assert.equal(modelSupportsFastMode('x-ai/grok-4.6-latest'), true)
  assert.equal(modelSupportsFastMode('gpt-5.3-codex'), false)
  assert.equal(modelSupportsFastMode('gpt-5.3-codex-spark'), false)
  assert.equal(modelSupportsFastMode('grok-4'), false)
  assert.equal(modelSupportsFastMode('grok-4-fast-reasoning'), false)
  assert.equal(isCodexSeries('gpt-5.3-codex'), true)
})

test('peelFastSuffix only strips host-side -fast on eligible bases', () => {
  assert.deepEqual(peelFastSuffix('gpt-5.5-fast'), { model: 'gpt-5.5', requestedFast: true })
  assert.deepEqual(peelFastSuffix('grok-4.6-fast'), { model: 'grok-4.6', requestedFast: true })
  assert.deepEqual(peelFastSuffix('grok-4-fast-reasoning'), { model: 'grok-4-fast-reasoning', requestedFast: false })
  assert.deepEqual(peelFastSuffix('gpt-5.3-codex-fast'), { model: 'gpt-5.3-codex-fast', requestedFast: false })
})

test('applyFastMode injects priority, peels suffix, strips Codex service_tier', () => {
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.5', input: 'hi' }),
    { model: 'gpt-5.5', input: 'hi' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.5-fast', input: 'hi' }),
    { model: 'gpt-5.5', input: 'hi', service_tier: 'priority' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.5', service_tier: 'default' }),
    { model: 'gpt-5.5', service_tier: 'default' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.3-codex', service_tier: 'priority' }),
    { model: 'gpt-5.3-codex' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'grok-4', service_tier: 'priority' }),
    { model: 'grok-4' },
  )
  assert.equal(applyFastMode({ model: 'gpt-5.5' }).service_tier, undefined)
})

test('withFastVariants adds a Fast sibling only for eligible models', () => {
  const catalog = withFastVariants([
    { id: 'gpt-5.5', name: 'GPT-5.5' },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex' },
    { id: 'grok-4.6', name: 'Grok 4.6' },
    { id: 'grok-4', name: 'Grok 4' },
  ])
  assert.deepEqual(catalog.map((row) => row.id), [
    'gpt-5.5',
    'gpt-5.5-fast',
    'gpt-5.3-codex',
    'grok-4.6',
    'grok-4.6-fast',
    'grok-4',
  ])
})
