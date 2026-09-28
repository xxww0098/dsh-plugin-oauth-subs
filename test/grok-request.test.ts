import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resetGrokSystemPins } from '../lib/oauth/grok/cache.js'
import { normalizeGrokResponsesBody } from '../lib/oauth/grok/request.js'

test('pins leading developer as system and leaves conversation in input', () => {
  resetGrokSystemPins()
  const out = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    session_id: 'sess-grok',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
    ],
  })
  assert.equal(Object.hasOwn(out, 'instructions'), false)
  assert.equal(out.input[0].role, 'system')
  assert.equal(out.input[0].content, 'You are DSH.')
  assert.deepEqual(out.input[1], { role: 'user', content: [{ type: 'input_text', text: 'hi' }] })
  resetGrokSystemPins()
})

test('parks extra leading developer text at the input suffix so history can cache', () => {
  resetGrokSystemPins()
  normalizeGrokResponsesBody({
    model: 'grok-4.6',
    prompt_cache_key: 'sess-grok',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
    ],
  })
  const out = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    prompt_cache_key: 'sess-grok',
    input: [
      { role: 'developer', content: 'You are DSH.\n\nPlan: toggle all skills.' },
      { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
    ],
  })
  assert.equal(Object.hasOwn(out, 'instructions'), false)
  assert.equal(out.input[0].role, 'system')
  assert.equal(out.input[0].content, 'You are DSH.')
  assert.equal(out.input[1].role, 'user')
  assert.equal(out.input[2].role, 'assistant')
  assert.equal(out.input[3].role, 'developer')
  assert.deepEqual(out.input[3].content, [{ type: 'input_text', text: 'Plan: toggle all skills.' }])
  resetGrokSystemPins()
})

test('an unrelated system prompt on the same conv id re-pins instead of leading the chat', () => {
  // DSH's session-title request shares the chat's prompt_cache_key. When it
  // wins the race, the chat must not be sent the title prompt up front.
  resetGrokSystemPins()
  const main = 'You are an AI agent powered by DeepSeek Harness.\n\nYour working directory is /repo.'
  const titlePrompt = 'Create a concise title for an AI coding-assistant session.'
  const title = normalizeGrokResponsesBody({
    model: 'grok-4.7',
    prompt_cache_key: 'sess-grok',
    input: [{ role: 'system', content: titlePrompt }, { role: 'user', content: 'tps' }],
  })
  assert.deepEqual(title.input, [{ role: 'system', content: titlePrompt }, { role: 'user', content: 'tps' }])
  for (let step = 0; step < 2; step += 1) {
    const out = normalizeGrokResponsesBody({
      model: 'grok-4.7',
      prompt_cache_key: 'sess-grok',
      input: [{ role: 'system', content: main }, { role: 'user', content: 'tps' }],
    })
    assert.deepEqual(out.input, [{ role: 'system', content: main }, { role: 'user', content: 'tps' }])
  }
  resetGrokSystemPins()
})

test('does not lift into top-level instructions', () => {
  resetGrokSystemPins()
  const out = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    session_id: 'sess-grok',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: 'hi' },
    ],
  })
  assert.equal(out.instructions, undefined)
  resetGrokSystemPins()
})

test('dsh-grok fallback does not share a pin across keyless requests', () => {
  resetGrokSystemPins()
  const first = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    input: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: 'hi' },
    ],
  })
  const second = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    input: [
      { role: 'developer', content: 'Other snapshot.' },
      { role: 'user', content: 'hi' },
    ],
  })
  assert.equal(first.input[0].content, 'You are DSH.')
  assert.equal(second.input[0].content, 'Other snapshot.')
  assert.equal(second.input.at(-1).role, 'user')
  resetGrokSystemPins()
})

test('parks only a prepended snapshot, not the whole leading block', () => {
  resetGrokSystemPins()
  const base = 'BASE SYSTEM PROMPT\n\nSTABLE TAIL'
  normalizeGrokResponsesBody({
    model: 'grok-4.6',
    prompt_cache_key: 'sess-prepend',
    input: [
      { role: 'developer', content: `SNAP-1\n\n${base}` },
      { role: 'user', content: 'hi' },
    ],
  })
  const out = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    prompt_cache_key: 'sess-prepend',
    input: [
      { role: 'developer', content: `SNAP-2\n\n${base}` },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
    ],
  })
  assert.equal(out.input[0].content, `SNAP-1\n\n${base}`)
  assert.deepEqual(out.input.at(-1), { role: 'developer', content: [{ type: 'input_text', text: 'SNAP-2' }] })
  resetGrokSystemPins()
})

test('parks only the changed line of an in-place edit', () => {
  resetGrokSystemPins()
  normalizeGrokResponsesBody({
    model: 'grok-4.6',
    prompt_cache_key: 'sess-inplace',
    input: [
      { role: 'developer', content: 'BASE\n\nPlan: A\n\nTAIL' },
      { role: 'user', content: 'hi' },
    ],
  })
  const out = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    prompt_cache_key: 'sess-inplace',
    input: [
      { role: 'developer', content: 'BASE\n\nPlan: B\n\nTAIL' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
    ],
  })
  assert.equal(out.input[0].content, 'BASE\n\nPlan: A\n\nTAIL')
  assert.deepEqual(out.input.at(-1), { role: 'developer', content: [{ type: 'input_text', text: 'Plan: B' }] })
  resetGrokSystemPins()
})

test('leaves non-array input alone', () => {
  const payload = { model: 'grok-4.6', session_id: 'sess-grok', input: 'just text' }
  assert.deepEqual(normalizeGrokResponsesBody(payload), payload)
})

test('keeps the real grok-4.7-build-fast id and peels stale aliases', () => {
  const fast = normalizeGrokResponsesBody({
    model: 'grok-4.7-build-fast',
    service_tier: 'priority',
    input: 'just text',
  })
  assert.equal(fast.model, 'grok-4.7-build-fast')
  assert.equal(fast.service_tier, undefined)

  const stale = normalizeGrokResponsesBody({
    model: 'grok-4.6-fast',
    service_tier: 'priority',
    input: 'just text',
  })
  assert.equal(stale.model, 'grok-4.6')
  assert.equal(stale.service_tier, undefined)
})
