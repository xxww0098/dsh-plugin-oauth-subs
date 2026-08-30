import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeCodexResponsesBody } from '../lib/oauth/codex/request.js'

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

test('strips pro mode and leaves the effort alone', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-sol',
    reasoning: { effort: 'max', mode: 'pro', summary: 'auto' },
  })
  assert.deepEqual(out.reasoning, { effort: 'max', summary: 'auto' })
})

test('drops public-only fields and default service_tier', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.5',
    service_tier: 'default',
    max_output_tokens: 128000,
    prompt_cache_options: { mode: 'explicit' },
    prompt_cache_retention: '24h',
  })
  assert.equal(out.service_tier, undefined)
  assert.equal(out.max_output_tokens, undefined)
  assert.equal(out.prompt_cache_options, undefined)
  assert.equal(out.prompt_cache_retention, undefined)
})

test('strips duplicate leading developer once instructions already exist', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-terra',
    instructions: 'You are DSH.',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
    ],
  })
  assert.equal(out.instructions, 'You are DSH.')
  assert.deepEqual(out.input, [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }])
})

test('parks extra leading developer text at the input suffix so history can cache', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-terra',
    instructions: 'You are DSH.',
    input: [
      { role: 'developer', content: 'You are DSH.\n\nPlan: toggle all skills.' },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
    ],
  })
  assert.equal(out.instructions, 'You are DSH.')
  assert.equal(out.input[0].role, 'user')
  assert.equal(out.input[1].role, 'assistant')
  assert.equal(out.input[2].role, 'developer')
  assert.deepEqual(out.input[2].content, [{ type: 'input_text', text: 'Plan: toggle all skills.' }])
})

test('lifts a run of leading developer items then parks the extra at the suffix', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-terra',
    instructions: 'You are DSH.',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'developer', content: 'Plan: toggle all skills.' },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
    ],
  })
  assert.equal(out.instructions, 'You are DSH.')
  assert.equal(out.input[0].role, 'user')
  assert.equal(out.input[1].role, 'assistant')
  assert.equal(out.input[2].role, 'developer')
  assert.deepEqual(out.input[2].content, [{ type: 'input_text', text: 'Plan: toggle all skills.' }])
})

test('parks a wholly different leading developer so conversation history still leads', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-terra',
    instructions: 'You are DSH.',
    input: [
      { role: 'system', content: 'Session header rebuilt.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
    ],
  })
  assert.equal(out.instructions, 'You are DSH.')
  assert.equal(out.input[0].role, 'user')
  assert.equal(out.input[1].role, 'assistant')
  assert.equal(out.input[2].role, 'developer')
  assert.deepEqual(out.input[2].content, [{ type: 'input_text', text: 'Session header rebuilt.' }])
})

test('does not lift a developer item after the conversation has started', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-terra',
    instructions: 'You are DSH.',
    input: [
      { role: 'user', content: 'hi' },
      { role: 'developer', content: 'Plan: later' },
    ],
  })
  assert.deepEqual(out.input, [
    { role: 'user', content: 'hi' },
    { role: 'developer', content: 'Plan: later' },
  ])
})

test('does not duplicate extra when instructions already contain the lifted prefix', () => {
  const out = normalizeCodexResponsesBody({
    model: 'gpt-5.6-terra',
    instructions: 'You are DSH.\n\nPlan: already in instructions.',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: 'hi' },
    ],
  })
  assert.equal(out.instructions, 'You are DSH.\n\nPlan: already in instructions.')
  assert.deepEqual(out.input, [{ role: 'user', content: 'hi' }])
})
