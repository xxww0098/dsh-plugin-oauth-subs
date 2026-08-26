import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyFastMode } from '../lib/fast-mode.js'
import { normalizeCodexResponsesBody } from '../lib/codex-request.js'

test('lifts developer/system input into required instructions', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-luna',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
    ],
  })
  assert.equal(out.instructions, 'You are DSH.')
  assert.deepEqual(out.input, [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }])
  assert.deepEqual(out.include, ['reasoning.encrypted_content'])
})

test('defaults instructions when none are present', () => {
  const out = normalizeCodexResponsesBody({ model: 'gpt-5.5', input: [{ role: 'user', content: 'hi' }] })
  assert.equal(out.instructions, 'You are a helpful assistant.')
})

test('maps ultra effort to max and strips pro mode', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-sol',
    reasoning: { effort: 'ultra', mode: 'pro', summary: 'auto' },
  })
  assert.deepEqual(out.reasoning, { effort: 'max', summary: 'auto' })
})

test('drops prompt_cache_options and default service_tier', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.5',
    service_tier: 'default',
    prompt_cache_options: { mode: 'explicit' },
  })
  assert.equal(out.service_tier, undefined)
  assert.equal(out.prompt_cache_options, undefined)
})

test('Ultra alias becomes max on the Codex wire', () => {
  const out = normalizeCodexResponsesBody(applyFastMode({
    model: 'gpt-5.6-sol-ultra',
    reasoning: { effort: 'high', summary: 'auto' },
  }))
  assert.equal(out.model, 'gpt-5.6-sol')
  assert.equal(out.reasoning.effort, 'max')
})
