import assert from 'node:assert/strict'
import { once } from 'node:events'
import http2 from 'node:http2'
import { test } from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { cursorUnaryRpc, runCursorAgent } from '../lib/oauth/cursor/h2-session.js'
import { createProxy } from '../lib/oauth/proxy.js'
import {
  decodeAgentServerMessage,
  decodeFields,
  encodeBytes,
  encodeMessage,
  encodeProtoValue,
  encodeString,
  encodeUint32,
  fieldBytes,
  fieldString,
  fieldVarint,
  frameConnect,
  splitConnectFrames,
} from '../lib/oauth/cursor/proto.js'

const session = { accessToken: 'offline-test-token' }
const built = { requestBytes: Buffer.alloc(0) }

function textFrame(text: string) {
  return frameConnect(encodeMessage(1, encodeMessage(1, encodeString(1, text))))
}

function turnEndedFrame() {
  return frameConnect(encodeMessage(1, encodeMessage(14, Buffer.alloc(0))))
}

async function withH2Peer(run) {
  const server = http2.createServer()
  const peers = new Set<http2.ServerHttp2Session>()
  const clients = new Set<http2.ClientHttp2Session>()
  server.on('session', (peer) => {
    peers.add(peer)
    peer.on('error', () => {})
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  const connectFn = () => {
    const client = http2.connect(url)
    clients.add(client)
    return client
  }
  try {
    await run({ server, url, connectFn })
  } finally {
    for (const client of clients) client.destroy()
    for (const peer of peers) peer.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('Cursor proxy reports post-output transport failure as an error, not answer text', async t => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'local-test-key',
    tokens: { cursor: { session: async () => session } },
    cursorRpc: async (current, request, { onEvent }) => {
      assert.equal(current.accessToken, session.accessToken)
      assert.ok(Buffer.isBuffer(request.requestBytes))
      await onEvent({ kind: 'interaction', text: 'partial answer' })
      throw new Error('cursor Connect stream truncated at EOF')
    },
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/cursor/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: 'Bearer local-test-key' },
    body: JSON.stringify({ model: 'sonnet-4.5', stream: true, messages: [{ role: 'user', content: 'hello' }] }),
  })
  const text = await response.text()
  const chunks = text.split('\n\n').filter(block => block.startsWith('data: ') && block !== 'data: [DONE]')
    .map(block => JSON.parse(block.slice(6)))
  assert.ok(chunks.some(chunk => chunk.choices?.[0]?.delta?.content === 'partial answer'))
  assert.match(chunks.find(chunk => chunk.error)?.error.message ?? '', /Connect stream truncated/)
  assert.equal(text.includes('[DONE]'), false)
})

test('Cursor rejects EOF inside a Connect header or payload instead of completing', async () => {
  const frame = textFrame('incomplete answer')
  for (const length of [1, 4, 5, frame.length - 1]) {
    await withH2Peer(async ({ server, url, connectFn }) => {
      const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
      const run = runCursorAgent(session, built, { url, connectFn })
      const rejected = assert.rejects(run, /truncated.*Connect|Connect.*truncated/i)
      const [peer] = await accepted
      peer.on('error', () => {})
      peer.respond({ ':status': 200 })
      await once(peer, 'data', { signal: AbortSignal.timeout(1000) })
      peer.end(frame.subarray(0, length))
      await rejected
    })
  }
})

test('Cursor abort closes the upstream stream and ignores remaining frames in the same chunk', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const controller = new AbortController()
    const reason = new Error('offline cancellation reason')
    const seen = []
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
    const run = runCursorAgent(session, built, {
      url,
      connectFn,
      signal: controller.signal,
      onEvent(event) {
        seen.push(event.text)
        controller.abort(reason)
      },
    })
    const rejected = assert.rejects(run, error => error === reason)
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    await once(peer, 'data', { signal: AbortSignal.timeout(1000) })
    const closed = once(peer, 'close', { signal: AbortSignal.timeout(1000) })
    peer.write(Buffer.concat([textFrame('first'), textFrame('after-abort')]))
    await rejected
    assert.deepEqual(seen, ['first'])
    await closed
    assert.equal(peer.destroyed, true)
  })
})

test('Cursor waits for the event consumer before delivering the next frame or finishing', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const seen = []
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
    let settled = false
    const outcome = runCursorAgent(session, built, {
      url,
      connectFn,
      async onEvent(event) {
        if (!event.text) return
        seen.push(event.text)
        if (event.text === 'first') {
          entered.resolve()
          await release.promise
        }
      },
    }).then(
      (value) => { settled = true; return { value } },
      (error) => { settled = true; return { error } },
    )
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    await once(peer, 'data', { signal: AbortSignal.timeout(1000) })
    peer.end(Buffer.concat([textFrame('first'), textFrame('second'), turnEndedFrame()]))
    try {
      await entered.promise
      assert.deepEqual(seen, ['first'])
      assert.equal(settled, false)
    } finally {
      release.resolve()
    }
    const result = await outcome
    assert.equal(result.error, undefined)
    assert.equal(result.value.collected.text, 'firstsecond')
    assert.deepEqual(seen, ['first', 'second'])
  })
})

test('Cursor propagates an asynchronous consumer failure and closes the upstream stream', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const failure = new Error('offline downstream write failed')
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
    const run = runCursorAgent(session, built, {
      url,
      connectFn,
      async onEvent() { throw failure },
    })
    const rejected = assert.rejects(run, (error) => error === failure)
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    await once(peer, 'data', { signal: AbortSignal.timeout(1000) })
    const closed = once(peer, 'close', { signal: AbortSignal.timeout(1000) })
    peer.end(Buffer.concat([textFrame('first'), turnEndedFrame()]))
    await rejected
    await closed
    assert.equal(peer.destroyed, true)
  })
})

test('Cursor abort during a blocked consumer closes promptly and observes its later rejection', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const controller = new AbortController()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const seen = []
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
    const run = runCursorAgent(session, built, {
      url,
      connectFn,
      signal: controller.signal,
      async onEvent(event) {
        seen.push(event.text)
        entered.resolve()
        await release.promise
      },
    })
    const rejected = assert.rejects(run, /aborted/i)
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    await once(peer, 'data', { signal: AbortSignal.timeout(1000) })
    const closed = once(peer, 'close', { signal: AbortSignal.timeout(1000) })
    peer.write(Buffer.concat([textFrame('first'), textFrame('after-abort')]))
    try {
      await entered.promise
      controller.abort()
      await rejected
      await closed
      release.reject(new Error('offline pending write cancelled'))
      await nextTurn()
      assert.deepEqual(seen, ['first'])
      assert.equal(peer.destroyed, true)
    } finally {
      release.resolve()
    }
  })
})

test('Cursor rejects already-aborted calls without opening an HTTP2 session', async (t) => {
  const controller = new AbortController()
  const reason = new Error('offline cancellation')
  controller.abort(reason)
  const options = {
    signal: controller.signal,
    connectFn: () => assert.fail('an already-aborted call opened a connection'),
  }
  await t.test('Run', async () => {
    await assert.rejects(runCursorAgent(session, built, options), (error) => error === reason)
  })
  await t.test('unary', async () => {
    await assert.rejects(cursorUnaryRpc({ session, path: '/offline', ...options }), (error) => error === reason)
  })
})

test('Cursor unary timeout closes a peer that never ends its response', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
    const run = cursorUnaryRpc({ session, url, connectFn, path: '/offline', timeoutMs: 250 })
    const rejected = assert.rejects(run, /cursor unary timeout/)
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    peer.resume()
    const closed = once(peer, 'close', { signal: AbortSignal.timeout(1000) })
    await rejected
    await closed
    assert.equal(peer.destroyed, true)
  })
})

function clientFrameReader(peer) {
  const frames = []
  const waiters = []
  let rest = Buffer.alloc(0)
  peer.on('data', (chunk) => {
    rest = Buffer.concat([rest, chunk])
    const parsed = splitConnectFrames(rest)
    rest = parsed.rest
    for (const frame of parsed.frames) frames.push(decodeFields(frame.payload))
    for (const wake of waiters.splice(0)) wake()
  })
  return async (predicate) => {
    const deadline = Date.now() + 2000
    for (;;) {
      const index = frames.findIndex(predicate)
      if (index >= 0) return frames.splice(index, 1)[0]
      if (Date.now() > deadline) throw new Error('timed out waiting for an H2 client frame')
      await new Promise((resolve) => waiters.push(resolve))
    }
  }
}

test('Cursor Run answers requestContext and KV, then hands MCP calls to DSH', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(2000) })
    const run = runCursorAgent(session, { requestBytes: Buffer.alloc(0), tools: [] }, { url, connectFn })
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    const next = clientFrameReader(peer)

    // requestContextArgs must be answered with requestContextResult, not a throw.
    peer.write(frameConnect(encodeMessage(2, encodeMessage(10, Buffer.alloc(0)))))
    const contextReply = decodeFields(fieldBytes(await next((fields) => fieldBytes(fields, 2).length > 0), 2)[0])
    assert.ok(fieldBytes(contextReply, 10).length > 0, 'expected requestContextResult')

    // setBlobArgs must be answered with setBlobResult, not a getBlobResult.
    const blobId = Buffer.from('blob-id-1')
    peer.write(frameConnect(encodeMessage(4, Buffer.concat([
      encodeUint32(1, 3),
      encodeMessage(3, Buffer.concat([encodeBytes(1, blobId), encodeBytes(2, Buffer.from('payload'))])),
    ]))))
    const setReply = decodeFields(fieldBytes(await next((fields) => fieldBytes(fields, 3).length > 0), 3)[0])
    assert.equal(fieldVarint(setReply, 1), 3)
    assert.ok(fieldBytes(setReply, 3).length > 0, 'expected setBlobResult')

    // getBlobArgs returns the stored bytes.
    peer.write(frameConnect(encodeMessage(4, Buffer.concat([
      encodeUint32(1, 4),
      encodeMessage(2, encodeBytes(1, blobId)),
    ]))))
    const getReply = decodeFields(fieldBytes(await next((fields) => fieldBytes(fields, 3).length > 0), 3)[0])
    assert.equal(fieldVarint(getReply, 1), 4)
    const getResult = decodeFields(fieldBytes(getReply, 2)[0])
    assert.equal(fieldBytes(getResult, 1)[0].toString('utf8'), 'payload')

    // An MCP exec is surfaced as an OpenAI tool call and ends the run.
    peer.write(frameConnect(encodeMessage(2, encodeMessage(11, Buffer.concat([
      encodeString(1, 'run_code'),
      encodeMessage(2, Buffer.concat([encodeString(1, 'code'), encodeBytes(2, encodeProtoValue('2 + 3'))])),
      encodeString(3, 'call-1'),
      encodeString(5, 'run_code'),
    ])))))
    const result = await run
    assert.equal(result.collected.toolCalls.length, 1)
    assert.equal(result.collected.toolCalls[0].function.name, 'run_code')
    assert.equal(result.collected.toolCalls[0].function.arguments, '{"code":"2 + 3"}')
  })
})

test('Cursor server messages expose MCP args and native exec cases', () => {
  const mcp = encodeMessage(2, encodeMessage(11, Buffer.concat([
    encodeString(1, 'run_code'),
    encodeMessage(2, Buffer.concat([encodeString(1, 'code'), encodeBytes(2, encodeProtoValue('2 + 3'))])),
    encodeString(3, 'call-9'),
    encodeString(5, 'run_code'),
  ])))
  const msg = decodeAgentServerMessage(mcp)
  assert.equal(msg.kind, 'exec')
  assert.equal(msg.execCase, 'mcpArgs')
  assert.equal(msg.mcp.toolCallId, 'call-9')
  assert.deepEqual(msg.mcp.arguments, { code: '2 + 3' })

  const shell = encodeMessage(2, encodeMessage(2, Buffer.concat([
    encodeString(1, 'echo hi'),
    encodeString(2, '/tmp'),
  ])))
  const shellMsg = decodeAgentServerMessage(shell)
  assert.equal(shellMsg.execCase, 'shellArgs')
  assert.equal(shellMsg.execArgs.command, 'echo hi')
  assert.equal(shellMsg.execArgs.workingDirectory, '/tmp')
})

