import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KiroEventStreamParser,
  encodeKiroEventFrame,
  kiroToOpenai,
  parseKiroEventStream,
} from '../lib/oauth/kiro/request.js'

test('Kiro accepts complete frames across every byte boundary and preserves JSON exceptions', () => {
  const body = Buffer.concat([
    encodeKiroEventFrame('assistantResponseEvent', { content: '你好 🌍' }),
    encodeKiroEventFrame('metadataEvent', { tokenUsage: { cacheReadInputTokens: 42 } }),
  ])
  const expected = [
    { type: 'assistantResponseEvent', messageType: 'event', payload: { content: '你好 🌍' } },
    { type: 'metadataEvent', messageType: 'event', payload: { tokenUsage: { cacheReadInputTokens: 42 } } },
  ]
  for (let offset = 0; offset <= body.length; offset++) {
    const parser = new KiroEventStreamParser()
    const events = [...parser.feed(body.subarray(0, offset)), ...parser.feed(body.subarray(offset))]
    parser.finish()
    assert.deepEqual(events, expected, `split at byte ${offset}`)
  }
  const error = { message: 'offline upstream exception' }
  assert.deepEqual(parseKiroEventStream(Buffer.from(JSON.stringify(error))), [
    { type: 'exception', messageType: 'exception', payload: error },
  ])
})

test('Kiro never turns a truncated next frame into a successful completion', () => {
  const first = encodeKiroEventFrame('assistantResponseEvent', { content: 'partial answer' })
  const next = encodeKiroEventFrame('assistantResponseEvent', { content: ' lost tail' })
  for (const offset of [1, 11, 12, next.length - 1]) {
    const body = Buffer.concat([first, next.subarray(0, offset)])
    assert.throws(() => kiroToOpenai(body, { model: 'offline' }), /kiro eventstream.*truncated/i, `EOF after ${offset} bytes`)
  }
})

test('Kiro rejects headers longer than their frame without waiting for the body', () => {
  const prelude = Buffer.alloc(12)
  prelude.writeUInt32BE(1024, 0)
  prelude.writeUInt32BE(1024 - 15, 4)
  const parser = new KiroEventStreamParser()
  assert.throws(() => parser.feed(prelude), /kiro eventstream.*header length/i)
})

test('Kiro rejects impossible frame lengths as soon as the prelude arrives', () => {
  for (const length of [0, 15, 16 * 1024 * 1024 + 1, 0xffffffff]) {
    const prelude = Buffer.alloc(12)
    prelude.writeUInt32BE(length, 0)
    const parser = new KiroEventStreamParser()
    assert.throws(() => parser.feed(prelude), /kiro eventstream.*frame length/i, `length ${length}`)
  }
})
