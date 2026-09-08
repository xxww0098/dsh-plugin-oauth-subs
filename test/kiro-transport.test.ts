import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { createProxy } from '../lib/oauth/proxy.js'
import { encodeKiroEventStream } from '../lib/oauth/kiro/request.js'

async function streamResponse(t: TestContext, body: BodyInit, stream = true) {
  const proxy = createProxy({
    port: 0,
    apiKey: 'local-test-key',
    tokens: { kiro: { session: async () => ({ accessToken: 'test-token', region: 'us-east-1', authMethod: 'social' }) } },
    fetchFn: async () => new Response(body),
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  return fetch('http://127.0.0.1:' + server.address().port + '/kiro/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer local-test-key', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-3.2', stream, messages: [{ role: 'user', content: 'read files' }] }),
  })
}

function eventsOf(text: string) {
  return text.split('\n\n').filter(block => block.startsWith('data: ') && block !== 'data: [DONE]')
    .map(block => JSON.parse(block.slice(6)))
}

test('Kiro streaming exception is an error, never a successful stop', async t => {
  const frames = encodeKiroEventStream([
    { type: 'assistantResponseEvent', payload: { content: 'partial answer' } },
    { type: 'exception', payload: { message: 'upstream failed' } },
  ])
  const response = await streamResponse(t, frames)
  const text = await response.text()
  const chunks = eventsOf(text)
  assert.match(chunks.find(chunk => chunk.error)?.error.message ?? '', /upstream failed/)
  assert.equal(chunks.some(chunk => chunk.choices?.[0]?.finish_reason), false)
  assert.equal(text.includes('[DONE]'), false)
})

test('Kiro malformed frames return an HTTP error and cancel unread upstream data', async t => {
  let cancelled = false
  const invalid = Buffer.alloc(12)
  invalid.writeUInt32BE(1)
  const response = await streamResponse(t, new ReadableStream({
    start(controller) { controller.enqueue(invalid) },
    cancel() { cancelled = true },
  }))
  assert.equal(response.status, 502)
  assert.match((await response.json()).error.message, /frame length/i)
  assert.equal(cancelled, true)
})

test('Kiro truncation after visible output cannot become a successful completion', async t => {
  const valid = encodeKiroEventStream([{ type: 'assistantResponseEvent', payload: { content: 'partial' } }])
  const response = await streamResponse(t, Buffer.concat([valid, valid.subarray(0, 11)]))
  const text = await response.text()
  const chunks = eventsOf(text)
  assert.equal(chunks[0].choices[0].delta.content, 'partial')
  assert.match(chunks.find(chunk => chunk.error)?.error.message ?? '', /truncated/i)
  assert.equal(text.includes('[DONE]'), false)
  assert.equal(chunks.some(chunk => chunk.choices?.[0]?.finish_reason), false)
})

test('Kiro non-streaming truncation is an upstream error rather than an empty answer', async t => {
  const response = await streamResponse(t, Buffer.alloc(11), false)
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /truncated/i)
})

test('Kiro streaming tools keep distinct indexes and string argument fragments', async t => {
  const response = await streamResponse(t, encodeKiroEventStream([
    { type: 'toolUseEvent', payload: { toolUseId: 'a', name: 'Read', input: '{"path":' } },
    { type: 'toolUseEvent', payload: { toolUseId: 'b', name: 'Grep' } },
    { type: 'toolUseEvent', payload: { toolUseId: 'a', input: '"a.ts"}' } },
    { type: 'toolUseEvent', payload: { toolUseId: 'b', input: { pattern: 'b' } } },
    { type: 'toolUseEvent', payload: { toolUseId: 'a', stop: true } },
    { type: 'toolUseEvent', payload: { toolUseId: 'b', stop: true } },
  ]))
  assert.equal(response.status, 200)
  const chunks = eventsOf(await response.text())
  const tools = new Map()
  for (const chunk of chunks) {
    for (const call of chunk.choices[0].delta.tool_calls ?? []) {
      const tool = tools.get(call.index) ?? { id: call.id, name: call.function.name, arguments: '' }
      assert.equal(typeof call.function.arguments, 'string')
      tool.arguments += call.function.arguments
      tools.set(call.index, tool)
    }
  }
  assert.deepEqual([...tools.values()], [
    { id: 'a', name: 'Read', arguments: '{"path":"a.ts"}' },
    { id: 'b', name: 'Grep', arguments: '{"pattern":"b"}' },
  ])
  assert.equal(chunks.at(-1).choices[0].finish_reason, 'tool_calls')
})
