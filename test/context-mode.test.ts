import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyContextMode,
  codexMaxContextWindow,
  familyMaxContextWindow,
  formatWindow,
  isCodex900kBase,
  isLargeContextId,
  peelContextSuffix,
} from '../lib/utils/context-mode.js'
import { applyFastMode } from '../lib/utils/fast-mode.js'
import { withPickerVariants } from '../lib/oauth/models.js'

test('only GPT-6 and GPT-5.6 rows have a maxContextWindow ceiling', () => {
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

test('formatWindow labels binary-sized windows by their nominal size', () => {
  // Gemini rows carry 2^20; "1049K" reads like a different window.
  assert.equal(formatWindow(1_048_576), '1M')
  assert.equal(formatWindow(2_097_152), '2M')
  assert.equal(formatWindow(262_144), '256K')
  assert.equal(formatWindow(131_072), '128K')
  // Decimal windows keep their decimal label, even when also 1024-aligned.
  assert.equal(formatWindow(1_000_000), '1M')
  assert.equal(formatWindow(872_000), '872K')
  assert.equal(formatWindow(256_000), '256K')
  assert.equal(formatWindow(4096), '4K')
  assert.equal(formatWindow(202_752), '198K')
  // Neither decimal nor binary: nearest decimal K.
  assert.equal(formatWindow(200_500), '201K')
})

test('peelContextSuffix strips a valid -900k alias only', () => {
  assert.deepEqual(peelContextSuffix('gpt-5.6-sol-900k'), { model: 'gpt-5.6-sol', requestedLarge: true })
  assert.deepEqual(peelContextSuffix('gpt-6-luna-900k'), { model: 'gpt-6-luna', requestedLarge: true })
  assert.deepEqual(peelContextSuffix('gpt-5.5-900k'), { model: 'gpt-5.5-900k', requestedLarge: false })
  assert.deepEqual(peelContextSuffix('gpt-5.6-sol'), { model: 'gpt-5.6-sol', requestedLarge: false })
  assert.equal(isLargeContextId('gpt-5.6-luna-900k'), true)
  assert.equal(isLargeContextId('gpt-5.6-luna'), false)
})

test('peelContextSuffix strips the GLM -1m alias only', () => {
  assert.deepEqual(peelContextSuffix('glm-5.3-1m'), { model: 'glm-5.3', requestedLarge: true })
  assert.deepEqual(peelContextSuffix('glm-5.3-flash-1m'), { model: 'glm-5.3-flash', requestedLarge: true })
  assert.deepEqual(peelContextSuffix('glm-5-turbo-1m'), { model: 'glm-5-turbo-1m', requestedLarge: false })
  assert.deepEqual(peelContextSuffix('glm-5.3'), { model: 'glm-5.3', requestedLarge: false })
  // Codex alias on a GLM id does not peel: the base is not a Codex large row.
  assert.deepEqual(peelContextSuffix('glm-5.3-900k'), { model: 'glm-5.3-900k', requestedLarge: false })
  assert.equal(isLargeContextId('glm-5.3-flash-1m'), true)
  assert.equal(isLargeContextId('glm-5.3'), false)
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

test('applyFastMode peels the GLM -1m alias before the wire', () => {
  assert.deepEqual(
    applyFastMode({ model: 'glm-5.3-1m', max_tokens: 16 }),
    { model: 'glm-5.3', max_tokens: 16 },
  )
  assert.deepEqual(
    applyFastMode({ model: 'glm-5.3-flash-1m', stream: true }),
    { model: 'glm-5.3-flash', stream: true },
  )
})

test('codexMaxContextWindow reports each row max_context_window', () => {
  assert.equal(codexMaxContextWindow('gpt-6-astra'), 872_000)
  assert.equal(codexMaxContextWindow('gpt-6-sol'), 872_000)
  assert.equal(codexMaxContextWindow('gpt-6-luna'), 872_000)
  assert.equal(codexMaxContextWindow('gpt-5.6-sol'), 872_000)
  assert.equal(codexMaxContextWindow('gpt-5.6-terra'), 872_000)
  assert.equal(codexMaxContextWindow('gpt-5.6-luna'), 872_000)
  assert.equal(codexMaxContextWindow('gpt-5.5'), undefined)
  assert.equal(codexMaxContextWindow('gpt-5.4'), undefined)
})

test('withPickerVariants grows only Fast siblings; maxContextWindow stays a ceiling, not a row', () => {
  const catalog = withPickerVariants([
    { id: 'gpt-6-sol', name: 'GPT-6 Sol', maxContextWindow: 872_000 },
    { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', maxContextWindow: 872_000 },
    { id: 'gpt-5.5', name: 'GPT-5.5' },
  ])
  assert.deepEqual(catalog.map((row) => row.id), [
    'gpt-6-sol',
    'gpt-6-sol-fast',
    'gpt-5.6-luna',
    'gpt-5.6-luna-fast',
    'gpt-5.5',
    'gpt-5.5-fast',
  ])
  assert.equal(catalog[0].name, 'GPT-6 Sol')
  assert.equal(catalog[0].contextWindow, undefined)
  assert.equal(catalog[1].name, 'GPT-6 Sol Fast')
})

test('family ceilings are family-scoped; the four static floors carry none yet', () => {
  assert.equal(familyMaxContextWindow('codex', 'gpt-6-sol'), 872_000)
  assert.equal(familyMaxContextWindow('glm', 'glm-5.3'), 1_000_000)
  assert.equal(familyMaxContextWindow('copilot', 'gpt-5.5'), 1_050_000)
  // Devin / Cline / Command Code / Ollama sources expose a single window each,
  // so their floors declare no second window: the slot is wired, the data is not.
  for (const [family, id] of [
    ['devin', 'swe-2'],
    ['cline', 'anthropic/claude-sonnet-5.5'],
    ['command-code', 'claude-sonnet-5-5'],
    ['ollama', 'glm-5.3'],
  ]) {
    assert.equal(familyMaxContextWindow(family, id), undefined, `${family}/${id} declares no second window`)
  }
  // A Codex ceiling never answers for another family.
  assert.equal(familyMaxContextWindow('devin', 'gpt-6-sol'), undefined)
  assert.equal(familyMaxContextWindow('ollama', 'gpt-6-sol'), undefined)
})
