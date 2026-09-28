import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { createProxy } from '../lib/oauth/proxy.js'
import { encodeKiroEventStream } from '../lib/oauth/kiro/request.js'

const kiroSession = (accessToken = 'test-token') => ({ accessToken, region: 'us-east-1', authMethod: 'social' })
const hello = (text = 'partial') => encodeKiroEventStream([{ type: 'assistantResponseEvent', payload: { content: text } }])

async function post(t: TestContext, fetchFn, { stream = true, tokens = { session: async () => kiroSession() }, upstreamTimeouts = undefined }: any = {}) {
  const proxy = createProxy({ port: 0, apiKey: 'local-test-key', tokens: { kiro: tokens }, fetchFn, upstreamTimeouts })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  return fetch('http://127.0.0.1:' + server.address().port + '/kiro/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer local-test-key', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-3.2', stream, messages: [{ role: 'user', content: 'read files' }] }),
  })
}

/** One fetchFn answer per upstream call, in order; counts the calls. */
function upstreamSequence(...answers: Array<() => Response>) {
  const calls: RequestInit[] = []
  const fetchFn = async (_url, init) => {
    calls.push(init)
    return answers[Math.min(calls.length, answers.length) - 1]()
  }
  return { fetchFn, calls }
}

function eventsOf(text: string) {
  return text.split('\n\n').filter(block => block.startsWith('data: ') && block !== 'data: [DONE]')
    .map(block => JSON.parse(block.slice(6)))
}

test('Kiro stall before the first frame answers 504 without an SSE head', async t => {
  const { fetchFn, calls } = upstreamSequence(() => new Response(new ReadableStream({ start() {} })))
  const response = await post(t, fetchFn, { upstreamTimeouts: { firstByteMs: 50, budgetMs: 300 } })
  assert.equal(response.status, 504)
  assert.match(response.headers.get('content-type') ?? '', /json/)
  assert.match((await response.json()).error, /no first byte within 0\.05s/)
  assert.equal(calls.length, 1, 'no retry fits the remaining budget')
})

test('Kiro drop after output destroys the response instead of ending it cleanly', async t => {
  const { fetchFn } = upstreamSequence(() => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(hello())
      setTimeout(() => controller.error(new Error('socket reset')), 20)
    },
  })))
  const response = await post(t, fetchFn)
  assert.equal(response.status, 200)
  await assert.rejects(response.text())
})

test('Kiro streaming exception after output destroys the response, never a successful stop', async t => {
  const { fetchFn } = upstreamSequence(() => new Response(encodeKiroEventStream([
    { type: 'assistantResponseEvent', payload: { content: 'partial answer' } },
    { type: 'exception', payload: { message: 'upstream failed' } },
  ])))
  // The destroy can land before the head flushes: either way the exchange breaks.
  await assert.rejects(post(t, fetchFn).then(response => response.text()))
})

// kiro.rs reads this in-stream exception as stop_reason max_tokens: the reply hit its output limit and the text so far is good.
const outputCap = () => encodeKiroEventStream([
  { type: 'assistantResponseEvent', payload: { content: 'partial answer' } },
  { type: 'ContentLengthExceededException', messageType: 'exception', payload: { message: 'Input is too long.' } },
])

test('Kiro output limit ends the stream with finish_reason length, not a broken exchange the host retries', async t => {
  const { fetchFn, calls } = upstreamSequence(() => new Response(outputCap()))
  const response = await post(t, fetchFn)
  assert.equal(response.status, 200)
  const events = eventsOf(await response.text())
  assert.equal(events.map(event => event.choices[0].delta?.content).filter(Boolean).join(''), 'partial answer')
  assert.equal(events.at(-1).choices[0].finish_reason, 'length')
  assert.equal(calls.length, 1)
})

test('Kiro output limit in a non-streaming reply is finish_reason length with the text kept', async t => {
  const { fetchFn } = upstreamSequence(() => new Response(outputCap()))
  const response = await post(t, fetchFn, { stream: false })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.choices[0].message.content, 'partial answer')
  assert.equal(body.choices[0].finish_reason, 'length')
})

test('Kiro truncation after visible output destroys the response', async t => {
  const valid = hello()
  const { fetchFn } = upstreamSequence(() => new Response(Buffer.concat([valid, valid.subarray(0, 11)])))
  // The destroy can land before the head flushes: either way the exchange breaks.
  await assert.rejects(post(t, fetchFn).then(response => response.text()))
})

test('Kiro exception before output is a classified HTTP error, forwarded once', async t => {
  const { fetchFn, calls } = upstreamSequence(() => new Response(encodeKiroEventStream([
    { type: 'exception', payload: { message: 'upstream failed' } },
  ])))
  const response = await post(t, fetchFn)
  assert.equal(response.status, 502)
  const body = await response.json()
  assert.equal(body.error.message, 'upstream failed')
  assert.equal(body.error.code, 'kiro_upstream')
  assert.equal(calls.length, 1)
})

test('Kiro malformed frames before output are a transport fault: the reader is cancelled and the hop retried', async t => {
  let cancelled = false
  const invalid = Buffer.alloc(12)
  invalid.writeUInt32BE(1)
  const { fetchFn, calls } = upstreamSequence(
    () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(invalid) },
      cancel() { cancelled = true },
    })),
    () => new Response(hello('recovered')),
  )
  const response = await post(t, fetchFn)
  assert.equal(response.status, 200)
  assert.equal(eventsOf(await response.text())[0].choices[0].delta.content, 'recovered')
  assert.equal(cancelled, true)
  assert.equal(calls.length, 2)
})

test('Kiro non-streaming truncation is retried rather than answered empty', async t => {
  const { fetchFn, calls } = upstreamSequence(() => new Response(Buffer.alloc(11)), () => new Response(hello('whole')))
  const response = await post(t, fetchFn, { stream: false })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).choices[0].message.content, 'whole')
  assert.equal(calls.length, 2)
})

test('Kiro 401 refreshes exactly once, then retries with the new token', async t => {
  let refreshes = 0
  const first = kiroSession('stale')
  const tokens = {
    session: async () => first,
    sourceOf: (session) => session === first ? { id: 'acct' } : undefined,
    refreshNow: async (id, failed) => {
      refreshes += 1
      assert.deepEqual([id, failed], ['acct', 'stale'])
      return { session: kiroSession('fresh') }
    },
  }
  const { fetchFn, calls } = upstreamSequence(
    () => new Response(JSON.stringify({ message: 'expired token' }), { status: 401 }),
    () => new Response(hello('hello')),
  )
  const response = await post(t, fetchFn, { tokens })
  assert.equal(response.status, 200)
  assert.equal(eventsOf(await response.text())[0].choices[0].delta.content, 'hello')
  assert.equal(refreshes, 1)
  assert.deepEqual(calls.map(call => call.headers.authorization), ['Bearer stale', 'Bearer fresh'])
})

test('Kiro 403 that survives the refresh keeps the non-AUTH 400', async t => {
  let refreshes = 0
  const tokens = {
    session: async () => kiroSession(),
    sourceOf: () => ({ id: 'acct' }),
    refreshNow: async () => { refreshes += 1; return { session: kiroSession('fresh') } },
  }
  const { fetchFn, calls } = upstreamSequence(() => new Response(JSON.stringify({ message: 'expired token' }), { status: 403 }))
  const response = await post(t, fetchFn, { tokens, stream: false })
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error.message, 'expired token')
  assert.equal(body.error.code, 'kiro_upstream')
  assert.equal(refreshes, 1)
  assert.equal(calls.length, 2)
})

test('Kiro monthly quota answers 429 with the usage-limit wording, forwarded once', async t => {
  const { fetchFn, calls } = upstreamSequence(() => new Response(JSON.stringify({
    reason: 'MONTHLY_REQUEST_COUNT',
    message: 'You have reached the limit for monthly requests',
  }), { status: 400 }))
  const response = await post(t, fetchFn)
  assert.equal(response.status, 429)
  assert.deepEqual(await response.json(), { error: 'usage limit reached: You have reached the limit for monthly requests' })
  assert.equal(calls.length, 1)
})

test('Kiro streaming tools keep distinct indexes and string argument fragments', async t => {
  const { fetchFn } = upstreamSequence(() => new Response(encodeKiroEventStream([
    { type: 'toolUseEvent', payload: { toolUseId: 'a', name: 'Read', input: '{"path":' } },
    { type: 'toolUseEvent', payload: { toolUseId: 'b', name: 'Grep' } },
    { type: 'toolUseEvent', payload: { toolUseId: 'a', input: '"a.ts"}' } },
    { type: 'toolUseEvent', payload: { toolUseId: 'b', input: { pattern: 'b' } } },
    { type: 'toolUseEvent', payload: { toolUseId: 'a', stop: true } },
    { type: 'toolUseEvent', payload: { toolUseId: 'b', stop: true } },
  ])))
  const response = await post(t, fetchFn)
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
