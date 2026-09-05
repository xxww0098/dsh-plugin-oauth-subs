import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyFastMode,
  modelSupportsFastMode,
  peelFastSuffix,
} from '../lib/utils/fast-mode.js'

test('Fast follows each Codex catalog row service_tiers, never Grok', () => {
  assert.equal(modelSupportsFastMode('gpt-6-astra'), true)
  assert.equal(modelSupportsFastMode('gpt-6-astra-900k'), true)
  assert.equal(modelSupportsFastMode('gpt-5.5'), true)
  assert.equal(modelSupportsFastMode('openai/gpt-5.4'), true)
  assert.equal(modelSupportsFastMode('gpt-5.6-luna'), true)
  assert.equal(modelSupportsFastMode('gpt-5.6-sol-900k'), true)
  assert.equal(modelSupportsFastMode('grok-4.6'), false)
  assert.equal(modelSupportsFastMode('x-ai/grok-4.6-latest'), false)
  // empty `service_tiers` upstream
  assert.equal(modelSupportsFastMode('gpt-5.4-mini'), false)
  assert.equal(modelSupportsFastMode('gpt-5.3-codex-spark'), false)
  // not served to ChatGPT accounts at all
  assert.equal(modelSupportsFastMode('gpt-5.3-codex'), false)
  assert.equal(modelSupportsFastMode('grok-4'), false)
  assert.equal(modelSupportsFastMode('grok-4-fast-reasoning'), false)
})

test('peelFastSuffix strips host-side -fast even on ineligible bases', () => {
  assert.deepEqual(peelFastSuffix('gpt-6-astra-fast'), { model: 'gpt-6-astra', requestedFast: true })
  assert.deepEqual(peelFastSuffix('gpt-6-astra-900k-fast'), { model: 'gpt-6-astra-900k', requestedFast: true })
  assert.deepEqual(peelFastSuffix('gpt-5.5-fast'), { model: 'gpt-5.5', requestedFast: true })
  assert.deepEqual(peelFastSuffix('grok-4.6-fast'), { model: 'grok-4.6', requestedFast: false })
  assert.deepEqual(peelFastSuffix('grok-4-fast-reasoning'), { model: 'grok-4-fast-reasoning', requestedFast: false })
  assert.deepEqual(peelFastSuffix('gpt-5.3-codex-fast'), { model: 'gpt-5.3-codex', requestedFast: false })
  assert.deepEqual(peelFastSuffix('gpt-5.4-mini-fast'), { model: 'gpt-5.4-mini', requestedFast: false })
  assert.deepEqual(peelFastSuffix('gpt-5.6-sol-900k-fast'), { model: 'gpt-5.6-sol-900k', requestedFast: true })
})

test('applyFastMode injects priority only for eligible Codex -fast', () => {
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
  assert.deepEqual(
    applyFastMode({ model: 'grok-4.6-fast' }),
    { model: 'grok-4.6' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'grok-4.6', service_tier: 'priority' }),
    { model: 'grok-4.6' },
  )
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.4-mini-fast' }),
    { model: 'gpt-5.4-mini' },
  )
  assert.equal(applyFastMode({ model: 'gpt-5.5' }).service_tier, undefined)
})
