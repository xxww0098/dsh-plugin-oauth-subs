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

test('parks a wholly different leading developer so conversation history still leads', () => {
  resetGrokSystemPins()
  normalizeGrokResponsesBody({
    model: 'grok-4.6',
    session_id: 'sess-grok',
    input: [
      { role: 'system', content: 'You are DSH.' },
      { role: 'user', content: 'hi' },
    ],
  })
  const out = normalizeGrokResponsesBody({
    model: 'grok-4.6',
    session_id: 'sess-grok',
    input: [
      { role: 'system', content: 'Session header rebuilt.' },
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
    ],
  })
  assert.equal(out.input[0].role, 'system')
  assert.equal(out.input[0].content, 'You are DSH.')
  assert.equal(out.input[1].role, 'user')
  assert.equal(out.input[2].role, 'assistant')
  assert.equal(out.input[3].role, 'developer')
  assert.deepEqual(out.input[3].content, [{ type: 'input_text', text: 'Session header rebuilt.' }])
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

test('leaves non-array input alone', () => {
  const payload = { model: 'grok-4.6', session_id: 'sess-grok', input: 'just text' }
  assert.deepEqual(normalizeGrokResponsesBody(payload), payload)
})
