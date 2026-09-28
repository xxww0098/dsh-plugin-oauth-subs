import assert from 'node:assert/strict'
import { once } from 'node:events'
import http2 from 'node:http2'
import net from 'node:net'
import { mock, test } from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { cursorUnaryRpc, runCursorAgent } from '../lib/oauth/cursor/h2-session.js'
import { clearCursorH2Pool, cursorH2Connect, dialCursorProxy } from '../lib/oauth/cursor/upstream-proxy.js'
import { configureCursorUpstreamProxy } from '../lib/oauth/cursor/index.js'
import { configureOutbound } from '../lib/utils/outbound.js'
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

/** Server message field 3 closes a model step: live it follows the last tool call of a batch (17ms after a lone call, with the last of three). */
function stepCheckpointFrame() {
  return frameConnect(encodeMessage(3, Buffer.alloc(0)))
}

function mcpCallFrame(name: string, id: string, args: Record<string, unknown> = {}) {
  return frameConnect(encodeMessage(2, encodeMessage(11, Buffer.concat([
    encodeString(1, name),
    ...Object.entries(args).map(([key, value]) => encodeMessage(2, Buffer.concat([encodeString(1, key), encodeBytes(2, encodeProtoValue(value))]))),
    encodeString(3, id),
    encodeString(5, name),
  ]))))
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
    await run({ server, url, connectFn, peers })
  } finally {
    for (const client of clients) client.destroy()
    for (const peer of peers) peer.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function connectErrorFrame(code: string, message: string) {
  return frameConnect(Buffer.from(JSON.stringify({ error: { code, message } })), true)
}

async function withCursorProxy(options, run) {
  const proxy = createProxy({ port: 0, apiKey: 'local-test-key', ...options })
  const server = await proxy.listen()
  try {
    await run((body = {}) => fetch('http://127.0.0.1:' + server.address().port + '/cursor/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: 'Bearer local-test-key' },
      body: JSON.stringify({ model: 'sonnet-4.5', stream: true, messages: [{ role: 'user', content: 'hello' }], ...body }),
    }))
  } finally {
    await proxy.close()
  }
}

test('Cursor proxy drops the stream on a post-output failure: no error block, no [DONE], no retry', async () => {
  let calls = 0
  await withCursorProxy({
    tokens: { cursor: { session: async () => session } },
    cursorRpc: async (current, request, { onEvent }) => {
      calls += 1
      assert.equal(current.accessToken, session.accessToken)
      assert.ok(Buffer.isBuffer(request.requestBytes))
      await onEvent({ kind: 'interaction', text: 'partial answer' })
      // Let the committed chunk reach the socket before the break.
      await new Promise((resolve) => setTimeout(resolve, 20))
      throw new Error('cursor Connect stream truncated at EOF')
    },
  }, async (post) => {
    const errorLog = mock.method(console, 'error', () => {})
    try {
      const response = await post()
      assert.equal(response.status, 200)
      await assert.rejects(response.text(), /terminated/)
    } finally {
      errorLog.mock.restore()
    }
  })
  assert.equal(calls, 1)
})

test('Cursor peer that never sends DATA (or never connects) answers 504 before any head', async () => {
  const errorLog = mock.method(console, 'error', () => {})
  try {
    await withH2Peer(async ({ server, url, connectFn }) => {
      let streams = 0
      server.on('stream', (peer) => {
        streams += 1
        peer.on('error', () => {})
        peer.respond({ ':status': 200 })
      })
      await withCursorProxy({
        tokens: { cursor: { session: async () => session } },
        upstreamTimeouts: { firstByteMs: 200, budgetMs: 400 },
        cursorRpc: (current, request, options) => runCursorAgent(current, request, { ...options, url, connectFn }),
      }, async (post) => {
        const response = await post()
        assert.equal(response.status, 504)
        assert.match((await response.json()).error, /no first byte within 0\.2s/)
      })
      assert.equal(streams, 1)
    })
    await withCursorProxy({
      tokens: { cursor: { session: async () => session } },
      upstreamTimeouts: { firstByteMs: 200, budgetMs: 400 },
      cursorRpc: (current, request, options) => runCursorAgent(current, request, { ...options, connectFn: () => new Promise(() => {}) }),
    }, async (post) => {
      assert.equal((await post()).status, 504)
    })
  } finally {
    errorLog.mock.restore()
  }
})

test('Cursor Connect error before output answers its own status, once; unauthenticated refreshes once', async () => {
  const errorLog = mock.method(console, 'error', () => {})
  try {
    for (const [code, status] of [['resource_exhausted', 429], ['invalid_argument', 400], ['unavailable', 503], ['internal', 502]] as const) {
      await withH2Peer(async ({ server, url, connectFn }) => {
        let streams = 0
        server.on('stream', (peer) => {
          streams += 1
          peer.on('error', () => {})
          peer.respond({ ':status': 200 })
          // An empty update first must not commit the head either.
          peer.end(Buffer.concat([frameConnect(encodeMessage(1, Buffer.alloc(0))), connectErrorFrame(code, `offline ${code}`)]))
        })
        await withCursorProxy({
          tokens: { cursor: { session: async () => session } },
          cursorRpc: (current, request, options) => runCursorAgent(current, request, { ...options, url, connectFn }),
        }, async (post) => {
          const response = await post()
          assert.equal(response.status, status, code)
          assert.equal((await response.json()).error.message, `offline ${code}`)
        })
        assert.equal(streams, 1, code)
      })
    }

    const fresh = { accessToken: 'offline-fresh-token' }
    const refreshed = []
    await withH2Peer(async ({ server, url, connectFn }) => {
      server.on('stream', (peer, headers) => {
        peer.on('error', () => {})
        peer.respond({ ':status': 200 })
        if (String(headers.authorization).includes(session.accessToken)) peer.end(connectErrorFrame('unauthenticated', 'offline expired'))
        else peer.end(Buffer.concat([textFrame('after refresh'), turnEndedFrame()]))
      })
      await withCursorProxy({
        tokens: {
          cursor: {
            session: async () => session,
            sourceOf: (current) => (current === session ? { id: 'acct' } : undefined),
            refreshNow: async (id, failed) => {
              refreshed.push([id, failed])
              return { session: fresh }
            },
          },
        },
        cursorRpc: (current, request, options) => runCursorAgent(current, request, { ...options, url, connectFn }),
      }, async (post) => {
        const response = await post()
        assert.equal(response.status, 200)
        const text = await response.text()
        assert.match(text, /after refresh/)
        assert.match(text, /\[DONE\]/)
      })
    })
    assert.deepEqual(refreshed, [['acct', session.accessToken]])
  } finally {
    errorLog.mock.restore()
  }
})

test('Cursor non-200 head is forwarded with its status instead of parsed as Connect frames', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    server.on('stream', (peer) => {
      peer.on('error', () => {})
      peer.respond({ ':status': 403 })
      peer.end('{"code":"permission_denied","message":"offline forbidden"}')
    })
    await assert.rejects(runCursorAgent(session, built, { url, connectFn }), (error: any) => {
      assert.equal(error.status, 403)
      assert.match(error.message, /offline forbidden/)
      return true
    })
  })
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

    // An MCP exec is surfaced as an OpenAI tool call; the step's checkpoint ends the run.
    peer.write(mcpCallFrame('run_code', 'call-1', { code: '2 + 3' }))
    peer.write(stepCheckpointFrame())
    const result = await run
    assert.equal(result.collected.toolCalls.length, 1)
    assert.equal(result.collected.toolCalls[0].function.name, 'run_code')
    assert.equal(result.collected.toolCalls[0].function.arguments, '{"code":"2 + 3"}')
  })
})

test('Cursor Run collects every MCP call of a step and ends at the step checkpoint, not at the first call', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(2000) })
    const run = runCursorAgent(session, { requestBytes: Buffer.alloc(0), tools: [] }, { url, connectFn })
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    let done = false
    void run.then(() => { done = true }, () => { done = true })
    peer.write(mcpCallFrame('get_weather', 'call-a', { city: 'Paris' }))
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(done, false, 'the second call of the batch had not arrived yet')
    peer.write(mcpCallFrame('get_time', 'call-b', { city: 'Tokyo' }))
    peer.write(stepCheckpointFrame())
    const { collected } = await run
    assert.deepEqual(collected.toolCalls.map((call) => `${call.id} ${call.function.name} ${call.function.arguments}`), [
      'call-a get_weather {"city":"Paris"}',
      'call-b get_time {"city":"Tokyo"}',
    ])
  })
})

test('Cursor Run without a step checkpoint still hands over its MCP calls once the batch grace has passed', async () => {
  await withH2Peer(async ({ server, url, connectFn }) => {
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(2000) })
    const run = runCursorAgent(session, { requestBytes: Buffer.alloc(0), tools: [] }, { url, connectFn, toolBatchGraceMs: 80 })
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    peer.write(mcpCallFrame('get_weather', 'call-a', { city: 'Paris' }))
    const { collected } = await run
    assert.equal(collected.toolCalls.length, 1)
  })
})

test('Cursor server messages expose MCP args and native exec cases', () => {
  assert.equal(decodeAgentServerMessage(encodeMessage(3, Buffer.from([8, 1]))).kind, 'checkpoint')
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


function connectForwarder(targetPort, seen = [], sockets = new Set(), answered: Promise<unknown> = Promise.resolve()) {
  const proxy = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => sockets.delete(socket))
    let head = Buffer.alloc(0)
    const onData = async (chunk) => {
      head = Buffer.concat([head, chunk])
      const at = head.indexOf('\r\n\r\n')
      if (at < 0) return
      socket.off('data', onData)
      seen.push(head.subarray(0, at).toString('latin1'))
      await answered
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      const upstream = net.connect(targetPort, '127.0.0.1')
      sockets.add(upstream)
      upstream.on('error', () => {})
      upstream.once('close', () => sockets.delete(upstream))
      const rest = head.subarray(at + 4)
      socket.pipe(upstream)
      upstream.pipe(socket)
      if (rest.length) upstream.write(rest)
    }
    socket.on('data', onData)
  })
  proxy.listen(0, '127.0.0.1')
  return once(proxy, 'listening').then(() => proxy)
}

async function proxiedH2Peer(t, onStream) {
  const server = http2.createServer()
  const peers = new Set()
  server.on('session', (peer) => {
    peers.add(peer)
    peer.on('error', () => {})
  })
  server.on('stream', onStream)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const h2port = server.address().port
  const sockets = new Set()
  const seen = []
  const proxy = await connectForwarder(h2port, seen, sockets)
  t.after(() => {
    for (const peer of peers) peer.destroy()
    for (const socket of sockets) socket.destroy()
    server.close()
    proxy.close()
    configureCursorUpstreamProxy(undefined)
  })
  configureCursorUpstreamProxy(`http://127.0.0.1:${proxy.address().port}`)
  return { h2port, seen }
}

test('Cursor unary RPC tunnels through an HTTP CONNECT upstream proxy', async (t) => {
  const { h2port, seen } = await proxiedH2Peer(t, (peer) => {
    peer.respond({ ':status': 200 })
    peer.end(Buffer.from('pong'))
  })
  const body = await cursorUnaryRpc({
    session,
    url: `http://127.0.0.1:${h2port}`,
    path: '/x',
    connectFn: cursorH2Connect,
    timeoutMs: 5000,
  })
  assert.equal(body.toString(), 'pong')
  assert.match(seen[0], new RegExp(`^CONNECT 127\\.0\\.0\\.1:${h2port} HTTP/1\\.1`))
})

test('Cursor Run streams through an HTTP CONNECT upstream proxy', async (t) => {
  const { h2port } = await proxiedH2Peer(t, (peer) => {
    peer.respond({ ':status': 200 })
    peer.on('data', () => {})
    peer.end(Buffer.concat([textFrame('tunneled'), turnEndedFrame()]))
  })
  const { collected } = await runCursorAgent(session, built, {
    url: `http://127.0.0.1:${h2port}`,
    connectFn: cursorH2Connect,
  })
  assert.equal(collected.text, 'tunneled')
})

test('Cursor h2 dial falls back to the outbound proxy when no Cursor proxy is set', async (t) => {
  const server = http2.createServer()
  server.on('session', (peer) => peer.on('error', () => {}))
  server.on('stream', (peer) => {
    peer.respond({ ':status': 200 })
    peer.end(Buffer.from('via outbound'))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const h2port = server.address().port
  const sockets = new Set()
  const seen = []
  const forwarder = await connectForwarder(h2port, seen, sockets)
  configureCursorUpstreamProxy(undefined)
  const outbound = configureOutbound({ configUrl: `http://127.0.0.1:${forwarder.address().port}`, env: {} })
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    server.close()
    forwarder.close()
    await outbound.close()
    configureOutbound({ env: {} })
  })
  // A non-loopback host so NO_PROXY / loopback bypass does not apply; the
  // forwarder pipes every CONNECT to the local h2 peer.
  const body = await cursorUnaryRpc({
    session,
    url: `http://cursor.test:${h2port}`,
    path: '/x',
    connectFn: cursorH2Connect,
    timeoutMs: 5000,
  })
  assert.equal(body.toString(), 'via outbound')
  assert.match(seen[0], new RegExp(`^CONNECT cursor\\.test:${h2port} HTTP/1\\.1`))
})

test('Cursor direct h2 dial to a blackhole is rejected within the connect timeout', async (t) => {
  // Accepts TCP but never answers the TLS ClientHello: the h2 session never connects.
  const sockets = new Set<net.Socket>()
  const blackhole = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
  })
  blackhole.listen(0, '127.0.0.1')
  await once(blackhole, 'listening')
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    blackhole.close()
  })
  const started = Date.now()
  await assert.rejects(
    cursorUnaryRpc({
      session,
      url: `https://127.0.0.1:${blackhole.address().port}`,
      path: '/x',
      connectFn: (url) => cursorH2Connect(url, { timeoutMs: 200 }),
      timeoutMs: 0,
    }),
    /cursor h2 connect timeout after 200ms/,
  )
  assert.ok(Date.now() - started < 2000)
})

test('dialCursorProxy completes a SOCKS5 handshake', async (t) => {
  const frames = []
  const socks = net.createServer((socket) => {
    socket.on('error', () => {})
    socket.once('data', (greeting) => {
      frames.push(Buffer.from(greeting))
      socket.write(Buffer.from([0x05, 0x00]))
      socket.once('data', (request) => {
        frames.push(Buffer.from(request))
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
      })
    })
  })
  socks.listen(0, '127.0.0.1')
  await once(socks, 'listening')
  t.after(() => socks.close())
  const socket = await dialCursorProxy(
    `socks5://127.0.0.1:${socks.address().port}`,
    new URL('https://agentn.us.api5.cursor.sh'),
    { timeoutMs: 3000 },
  )
  assert.ok(socket.writable)
  socket.destroy()
  assert.deepEqual([...frames[0]], [0x05, 0x01, 0x00])
  const request = frames[1]
  assert.equal(request[0], 0x05)
  assert.equal(request[1], 0x01)
  assert.equal(request[3], 0x03)
  const hostLength = request[4]
  assert.equal(request.subarray(5, 5 + hostLength).toString(), 'agentn.us.api5.cursor.sh')
  assert.equal(request.readUInt16BE(5 + hostLength), 443)
})

test('dialCursorProxy rejects a non-2xx CONNECT answer', async (t) => {
  const proxy = net.createServer((socket) => {
    socket.on('error', () => {})
    socket.once('data', () => socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'))
  })
  proxy.listen(0, '127.0.0.1')
  await once(proxy, 'listening')
  t.after(() => proxy.close())
  await assert.rejects(
    dialCursorProxy(`http://127.0.0.1:${proxy.address().port}`, new URL('https://agentn.us.api5.cursor.sh'), { timeoutMs: 3000 }),
    /407/,
  )
})

test('Cursor region error points at the upstream proxy knob', async () => {
  const end = frameConnect(Buffer.from(JSON.stringify({
    error: { code: 'failed_precondition', message: 'Model not available: This model provider is not supported in your region.' },
  })), true)
  await withH2Peer(async ({ server, url, connectFn }) => {
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
    const run = runCursorAgent(session, built, { url, connectFn })
    const rejected = assert.rejects(run, /CURSOR_PROXY/)
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    await once(peer, 'data', { signal: AbortSignal.timeout(1000) })
    peer.end(end)
    await rejected
  })
})

// Pooled h2 session: runs omit connectFn, so they dial through cursorH2Connect.
function answerEachRun(server, text = 'pooled') {
  let streams = 0
  server.on('stream', (peer) => {
    streams += 1
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    peer.once('data', () => peer.end(Buffer.concat([textFrame(text), turnEndedFrame()])))
  })
  return () => streams
}

test('Cursor pooled: 3 runs share 1 server session', async () => {
  await withH2Peer(async ({ server, url, peers }) => {
    const streams = answerEachRun(server)
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await runCursorAgent(session, built, { url })).collected.text, 'pooled')
    }
    assert.equal(streams(), 3)
    assert.equal(peers.size, 1)
  })
})

test('Cursor pooled: cancel resets only its stream (CANCEL) and the session is reused', async () => {
  await withH2Peer(async ({ server, url, peers }) => {
    const accepted = once(server, 'stream', { signal: AbortSignal.timeout(1000) })
    const controller = new AbortController()
    const run = runCursorAgent(session, built, { url, signal: controller.signal, onEvent: () => controller.abort() })
    const rejected = assert.rejects(run, /aborted/i)
    const [peer] = await accepted
    peer.on('error', () => {})
    peer.respond({ ':status': 200 })
    await once(peer, 'data', { signal: AbortSignal.timeout(1000) })
    const closed = once(peer, 'close', { signal: AbortSignal.timeout(1000) })
    peer.write(textFrame('first'))
    await rejected
    await closed
    assert.equal(peer.rstCode, http2.constants.NGHTTP2_CANCEL)
    answerEachRun(server, 'after cancel')
    assert.equal((await runCursorAgent(session, built, { url })).collected.text, 'after cancel')
    assert.equal(peers.size, 1)
  })
})

test('Cursor pooled: GOAWAY evicts the session and the next run dials a new one', async () => {
  await withH2Peer(async ({ server, url, peers }) => {
    answerEachRun(server)
    await runCursorAgent(session, built, { url })
    const client = await cursorH2Connect(url)
    const away = once(client, 'goaway', { signal: AbortSignal.timeout(1000) })
    for (const peer of peers) peer.goaway()
    await away
    await runCursorAgent(session, built, { url })
    assert.equal(peers.size, 2)
  })
})

test('Cursor pooled: concurrent runs do not interfere (cancel and Connect error stay per stream)', async () => {
  const errorLog = mock.method(console, 'error', () => {})
  try {
    await withH2Peer(async ({ server, url, peers }) => {
      const byName = new Map()
      server.on('stream', (peer) => {
        peer.on('error', () => {})
        peer.respond({ ':status': 200 })
        peer.once('data', (chunk) => byName.get(splitConnectFrames(chunk).frames[0].payload.toString())?.(peer))
      })
      const opened = (name) => new Promise<any>((resolve) => byName.set(name, resolve))
      const run = (name, options = {}) => runCursorAgent(session, { requestBytes: Buffer.from(name) }, { url, ...options })
      const [a, b, c] = [opened('a'), opened('b'), opened('c')]
      const controller = new AbortController()
      const runA = assert.rejects(run('a', { signal: controller.signal }), /aborted/i)
      const runB = run('b')
      const runC = assert.rejects(run('c'), (error: any) => error.status === 429)
      const [peerA, peerB, peerC] = await Promise.all([a, b, c])
      const closedA = once(peerA, 'close', { signal: AbortSignal.timeout(1000) })
      controller.abort()
      await runA
      await closedA
      assert.equal(peerA.rstCode, http2.constants.NGHTTP2_CANCEL)
      peerC.end(connectErrorFrame('resource_exhausted', 'offline quota'))
      await runC
      peerB.end(Buffer.concat([textFrame('b survives'), turnEndedFrame()]))
      assert.equal((await runB).collected.text, 'b survives')
      assert.equal(peers.size, 1)
    })
  } finally {
    errorLog.mock.restore()
  }
})

test('Cursor pooled: a stalled handshake is still bounded by the first-byte timer', async (t) => {
  // Accepts TCP but never answers the TLS ClientHello.
  const sockets = new Set<net.Socket>()
  const blackhole = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => {})
  })
  blackhole.listen(0, '127.0.0.1')
  await once(blackhole, 'listening')
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    blackhole.close()
  })
  const url = `https://127.0.0.1:${blackhole.address().port}`
  const errorLog = mock.method(console, 'error', () => {})
  try {
    await withCursorProxy({
      tokens: { cursor: { session: async () => session } },
      upstreamTimeouts: { firstByteMs: 200, budgetMs: 400 },
      cursorRpc: (current, request, options) => runCursorAgent(current, request, { ...options, url }),
    }, async (post) => {
      const started = Date.now()
      assert.equal((await post()).status, 504)
      assert.ok(Date.now() - started < 2000)
    })
  } finally {
    errorLog.mock.restore()
  }
})

test('Cursor pooled: a late dial is pooled, not handed to the caller that gave up; dials coalesce', async (t) => {
  const release = Promise.withResolvers<void>()
  const server = http2.createServer()
  const peers = new Set<http2.ServerHttp2Session>()
  server.on('session', (peer) => {
    peers.add(peer)
    peer.on('error', () => {})
  })
  const streams = answerEachRun(server, 'late')
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const h2port = server.address().port
  const sockets = new Set()
  const seen = []
  const proxy = await connectForwarder(h2port, seen, sockets, release.promise)
  configureCursorUpstreamProxy(`http://127.0.0.1:${proxy.address().port}`)
  t.after(() => {
    for (const peer of peers) peer.destroy()
    for (const socket of sockets) socket.destroy()
    server.close()
    proxy.close()
    configureCursorUpstreamProxy(undefined)
  })
  const url = `http://127.0.0.1:${h2port}`
  const controller = new AbortController()
  const gaveUp = assert.rejects(runCursorAgent(session, built, { url, signal: controller.signal }), /aborted/i)
  const waiting = runCursorAgent(session, built, { url })
  while (!seen.length) await new Promise((resolve) => setTimeout(resolve, 5))
  controller.abort()
  await gaveUp
  const landed = once(server, 'session', { signal: AbortSignal.timeout(1000) })
  release.resolve()
  await landed
  assert.equal((await waiting).collected.text, 'late')
  assert.equal((await runCursorAgent(session, built, { url })).collected.text, 'late')
  assert.equal(seen.length, 1)
  assert.equal(peers.size, 1)
  assert.equal(streams(), 2)
})

test('clearCursorH2Pool closes pooled sessions so the next run dials again', async () => {
  await withH2Peer(async ({ server, url, peers }) => {
    answerEachRun(server)
    await runCursorAgent(session, built, { url })
    clearCursorH2Pool()
    await runCursorAgent(session, built, { url })
    assert.equal(peers.size, 2)
  })
})
