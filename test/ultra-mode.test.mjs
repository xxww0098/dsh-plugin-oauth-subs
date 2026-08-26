import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyFastMode } from '../lib/fast-mode.js'
import {
  isUltraBase,
  isUltraKey,
  peelUltraSuffix,
  withUltraVariants,
} from '../lib/ultra-mode.js'

test('only GPT-5.6 Sol / Terra / Luna accept Ultra', () => {
  assert.equal(isUltraBase('gpt-5.6-sol'), true)
  assert.equal(isUltraBase('gpt-5.6-terra'), true)
  assert.equal(isUltraBase('gpt-5.6-luna'), true)
  assert.equal(isUltraBase('gpt-5.6-sol-2026-07-09'), true)
  assert.equal(isUltraBase('gpt-5.5'), false)
  assert.equal(isUltraBase('gpt-5.4'), false)
  assert.equal(isUltraBase('gpt-5.3-codex'), false)
  assert.equal(isUltraBase('grok-4.6'), false)
  assert.equal(isUltraKey('oauth-codex/gpt-5.6-sol-ultra'), true)
  assert.equal(isUltraKey('oauth-codex/gpt-5.6-sol-900k'), false)
})

test('peelUltraSuffix only strips host-side -ultra on 5.6 bases', () => {
  assert.deepEqual(peelUltraSuffix('gpt-5.6-sol-ultra'), { model: 'gpt-5.6-sol', requestedUltra: true })
  assert.deepEqual(peelUltraSuffix('gpt-5.6-luna-ultra'), { model: 'gpt-5.6-luna', requestedUltra: true })
  assert.deepEqual(peelUltraSuffix('gpt-5.5-ultra'), { model: 'gpt-5.5-ultra', requestedUltra: false })
})

test('applyFastMode peels -ultra and sets reasoning.effort', () => {
  assert.deepEqual(
    applyFastMode({ model: 'gpt-5.6-sol-ultra', input: 'hi' }),
    { model: 'gpt-5.6-sol', input: 'hi', reasoning: { effort: 'ultra' } },
  )
  assert.deepEqual(
    applyFastMode({
      model: 'gpt-5.6-terra-ultra',
      reasoning: { effort: 'high', summary: 'auto' },
    }),
    {
      model: 'gpt-5.6-terra',
      reasoning: { effort: 'ultra', summary: 'auto' },
    },
  )
  assert.equal(applyFastMode({ model: 'gpt-5.6-sol' }).reasoning, undefined)
})

test('withUltraVariants adds Ultra siblings only for 5.6', () => {
  const catalog = withUltraVariants([
    { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
    { id: 'gpt-5.5', name: 'GPT-5.5' },
  ])
  assert.deepEqual(catalog.map((row) => row.id), [
    'gpt-5.6-sol',
    'gpt-5.6-sol-ultra',
    'gpt-5.5',
  ])
})
