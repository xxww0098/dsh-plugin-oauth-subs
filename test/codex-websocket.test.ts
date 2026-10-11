import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import {
  closeCodexWebSockets,
  codexWebSocketCooling,
  deepCovers,
  planCodexContinuation,
  stableJson,
} from '../lib/oauth/codex/websocket.js'
import { forward } from '../lib/oauth/passthrough.js'

// ---------------------------------------------------------------------------
// Unit: continuation planning
// ---------------------------------------------------------------------------

const assistantItem = {
  type: 'message', id: 'msg_1', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
}

function continuationFixture() {
  const fullInput = [{ type: 'message', role: 'user', content: 'hi' }]
  return {
    bodyNoInput: stableJson({ model: 'gpt-5.6', instructions: 'You are a helpful assistant.', store: false, stream: true, prompt_cache_key: 'conv-1', include: ['reasoning.encrypted_content'] }),
    baselineItems: [...fullInput, assistantItem],
    lastResponseId: 'resp_1',
    fullInput,
  }
}

test('stableJson ignores key order', () => {
  assert.equal(stableJson({ b: 1, a: { d: 2, c: [3, { z: 4, y: 5 }] } }), stableJson({ a: { c: [3, { y: 5, z: 4 }], d: 2 }, b: 1 }))
})

test('deepCovers allows host replay extras, nothing else', () => {
  assert.ok(deepCovers(assistantItem, { ...assistantItem, phase: 'main' }))
  assert.ok(!deepCovers(assistantItem, { ...assistantItem, status: 'in_progress' }))
  assert.ok(!deepCovers(assistantItem, { ...assistantItem, content: [{ ...assistantItem.content[0], text: 'Changed' }] }))
  assert.ok(!deepCovers(assistantItem, undefined))
})

test('planCodexContinuation sends the tail when the prefix covers the stored turn', () => {
  const fixture = continuationFixture()
  const newUser = { type: 'message', role: 'user', content: 'again' }
  const payload = {
    model: 'gpt-5.6',
    instructions: 'You are a helpful assistant.',
    store: false,
    stream: true,
    prompt_cache_key: 'conv-1',
    include: ['reasoning.encrypted_content'],
    input: [...fixture.fullInput, { ...assistantItem, phase: 'main' }, newUser],
  }
  const delta = planCodexContinuation(payload, fixture)
  assert.deepEqual(delta, { previousResponseId: 'resp_1', input: [newUser] })
})

test('planCodexContinuation refuses a changed body or a rewritten prefix', () => {
  const fixture = continuationFixture()
  const base = (input) => ({
    model: 'gpt-5.6', instructions: 'You are a helpful assistant.', store: false, stream: true,
    prompt_cache_key: 'conv-1', include: ['reasoning.encrypted_content'], input,
  })
  // Reasoning effort changed → the stored turn is no longer this conversation.
  assert.equal(planCodexContinuation({ ...base(fixture.baselineItems), reasoning: { effort: 'high' } }, fixture), undefined)
  // Tools changed.
  assert.equal(planCodexContinuation({ ...base(fixture.baselineItems), tools: [{ type: 'function', name: 'f' }] }, fixture), undefined)
  // History was rewritten (compaction) or truncated.
  assert.equal(planCodexContinuation(base([{ type: 'message', role: 'user', content: 'other' }, ...fixture.baselineItems.slice(1)]), fixture), undefined)
  assert.equal(planCodexContinuation(base(fixture.baselineItems.slice(1)), fixture), undefined)
})

// ---------------------------------------------------------------------------
// Mock upstream: WebSocket upgrade + SSE POST on one loopback origin
// ---------------------------------------------------------------------------

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

class MockWsConnection {
  socket: import('node:net').Socket
  buffer = Buffer.alloc(0)
  messages: any[] = []
  onMessage: (message: any, connection: MockWsConnection) => void = () => {}

  constructor(socket: import('node:net').Socket) {
    this.socket = socket
    socket.on('data', (chunk: Buffer) => this.#push(chunk))
  }

  #push(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const frame = this.#take()
      if (!frame) return
      const { opcode, payload } = frame
      if (opcode === 1) {
        const message = JSON.parse(payload.toString('utf8'))
        this.messages.push(message)
        this.onMessage(message, this)
      } else if (opcode === 8) {
        // Echo the close so the client handshake completes.
        if (this.socket.writable) this.socket.write(Buffer.from([0x88, 0x02, payload[0] ?? 0x03, payload[1] ?? 0xe8]))
        this.socket.end()
        return
      } else if (opcode === 9) {
        if (this.socket.writable) this.socket.write(Buffer.from([0x8a, payload.length, ...payload]))
      }
    }
  }

  /** One masked client frame, or null when the buffer holds only a partial one. */
  #take(): { opcode: number, payload: Buffer } | null {
    const b = this.buffer
    if (b.length < 2) return null
    const opcode = b[0] & 0x0f
    const masked = (b[1] & 0x80) !== 0
    let length = b[1] & 0x7f
    let offset = 2
    if (length === 126) {
      if (b.length < offset + 2) return null
      length = b.readUInt16BE(offset)
      offset += 2
    } else if (length === 127) {
      if (b.length < offset + 8) return null
      length = Number(b.readBigUInt64BE(offset))
      offset += 8
    }
    const mask = masked ? 4 : 0
    if (b.length < offset + mask + length) return null
    let payload = b.subarray(offset + mask, offset + mask + length)
    if (masked) {
      const key = b.subarray(offset, offset + 4)
      const unmasked = Buffer.alloc(length)
      for (let i = 0; i < length; i++) unmasked[i] = payload[i] ^ key[i % 4]
      payload = unmasked
    }
    this.buffer = b.subarray(offset + mask + length)
    return { opcode, payload }
  }

  send(event: any) {
    if (!this.socket.writable) return
    const payload = Buffer.from(JSON.stringify(event))
    let header: Buffer
    if (payload.length < 126) header = Buffer.from([0x81, payload.length])
    else if (payload.length < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x81
      header[1] = 126
      header.writeUInt16BE(payload.length, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x81
      header[1] = 127
      header.writeBigUInt64BE(BigInt(payload.length), 2)
    }
    this.socket.write(Buffer.concat([header, payload]))
  }

  close() {
    if (!this.socket.writable) return
    this.socket.write(Buffer.from([0x88, 0x02, 0x03, 0xe8]))
    this.socket.end()
  }
}

interface UpstreamHarness {
  origin: string
  server: Server
  upgrades: IncomingMessage['headers'][]
  connections: MockWsConnection[]
  posts: number
  onUpgrade: (connection: MockWsConnection) => void
  onPost: (request: IncomingMessage, response: ServerResponse) => void
  close(): Promise<void>
}

async function startUpstream(): Promise<UpstreamHarness> {
  const harness: UpstreamHarness = {
    server: undefined as any,
    origin: '',
    upgrades: [],
    connections: [],
    posts: 0,
    onUpgrade: () => {},
    // A test that lands here unmocked must fail fast, not hang the fetch.
    onPost: (request, response) => { response.writeHead(501); response.end('sse not mocked') },
    close: undefined as any,
  }
  harness.server = createServer((request, response) => {
    harness.posts += 1
    request.resume()
    harness.onPost(request, response)
  })
  harness.server.on('upgrade', (request, socket) => {
    harness.upgrades.push(request.headers)
    const key = String(request.headers['sec-websocket-key'] ?? '')
    const accept = createHash('sha1').update(key + WS_GUID).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    const connection = new MockWsConnection(socket as import('node:net').Socket)
    harness.connections.push(connection)
    harness.onUpgrade(connection)
  })
  await new Promise<void>((resolve) => harness.server.listen(0, '127.0.0.1', resolve))
  harness.origin = `http://127.0.0.1:${(harness.server.address() as AddressInfo).port}`
  harness.close = async () => {
    for (const connection of harness.connections) {
      try { connection.socket.destroy() } catch { /* gone */ }
    }
    await new Promise<void>((resolve) => harness.server.close(() => resolve()))
  }
  return harness
}

/** The hop's downstream: one POST handler that runs the passthrough forward(). */
async function startHop(upstream: UpstreamHarness, overrides: Record<string, any> = {}) {
  const session = { accessToken: 'test-token', accountId: 'acct-1' }
  const server = createServer((request, response) => {
    void forward(request, response, {
      url: `${upstream.origin}/backend-api/codex/responses`,
      session,
      tokens: {},
      headersOf: () => ({ authorization: `Bearer ${session.accessToken}` }),
      fetchFn: async (url: any, init: any) => fetch(url, init),
      family: 'codex',
      maxRequestBodyBytes: 1024 * 1024,
      startedAt: Date.now(),
      signal: undefined,
      ...overrides,
    }).catch((error) => {
      // A hop failure must reach the client as a status, not as a hang: the
      // real proxy answers it, and an unanswered response only shows up as a
      // five-minute fetch timeout.
      if (!response.headersSent) {
        response.writeHead(599, { 'content-type': 'text/plain' })
        response.end(`hop failed: ${error?.status ?? ''} ${error?.message ?? error}`)
      } else if (!response.destroyed) {
        response.destroy()
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    origin,
    async post(body: any) {
      const response = await fetch(origin, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return { status: response.status, text: await response.text() }
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function sseReply(response: ServerResponse, events: any[]) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' })
  for (const event of events) {
    response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  }
  response.end()
}


function enableWs(t) {
  process.env.DSH_CODEX_WEBSOCKET = 'on'
  t.after(() => { delete process.env.DSH_CODEX_WEBSOCKET })
}

const USER_ITEM = { type: 'message', role: 'user', content: 'hi' }
const NEW_USER_ITEM = { type: 'message', role: 'user', content: 'again' }

function requestBody(cacheSessionId: string, input: any[]) {
  return { model: 'gpt-5.6', stream: true, session_id: cacheSessionId, store: false, input }
}

function completed(id: string, output: any[] = [assistantItem]) {
  return { type: 'response.completed', response: { id, status: 'completed', output } }
}

test('codex websocket: full request, then a continuation delta on the same connection', async (t) => {
  t.after(() => closeCodexWebSockets())
  enableWs(t)
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  const seen: any[] = []
  upstream.onUpgrade = (connection) => {
    connection.onMessage = (message) => {
      seen.push(message)
      if (message.type !== 'response.create') return
      if (!message.previous_response_id) {
        connection.send({ type: 'codex.rate_limits', rate_limits: {} })
        connection.send({ type: 'response.created', response: { id: 'resp_1' } })
        connection.send({ type: 'response.output_text.delta', delta: 'Hello' })
        connection.send(completed('resp_1'))
      } else {
        connection.send(completed('resp_2'))
      }
    }
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())

  const first = await hop.post(requestBody('conv-delta', [USER_ITEM]))
  assert.equal(first.status, 200)
  assert.match(first.text, /event: codex\.rate_limits/)
  assert.match(first.text, /event: response\.completed/)

  const secondInput = [USER_ITEM, { ...assistantItem, phase: 'main' }, NEW_USER_ITEM]
  const second = await hop.post(requestBody('conv-delta', secondInput))
  assert.equal(second.status, 200)

  assert.equal(upstream.connections.length, 1, 'the pooled connection is reused')
  assert.equal(seen.length, 2)
  assert.equal(seen[0].previous_response_id, undefined)
  assert.equal(seen[0].instructions, 'You are a helpful assistant.')
  assert.equal(seen[0].store, false)
  assert.equal(seen[1].previous_response_id, 'resp_1')
  assert.deepEqual(seen[1].input, [NEW_USER_ITEM], 'only the tail rides the wire')
})

test('codex websocket: previous_response_not_found resends the full input once', async (t) => {
  t.after(() => closeCodexWebSockets())
  enableWs(t)
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  const seen: any[] = []
  upstream.onUpgrade = (connection) => {
    connection.onMessage = (message) => {
      if (message.type !== 'response.create') return
      seen.push(message)
      if (message.previous_response_id) {
        connection.send({ type: 'error', code: 'previous_response_not_found', message: 'unknown previous response' })
      } else {
        connection.send({ type: 'response.output_text.delta', delta: 'Hi' })
        connection.send(completed('resp_recovered'))
      }
    }
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())

  const first = await hop.post(requestBody('conv-recover', [USER_ITEM]))
  assert.equal(first.status, 200)
  const secondInput = [USER_ITEM, assistantItem, NEW_USER_ITEM]
  const second = await hop.post(requestBody('conv-recover', secondInput))
  assert.equal(second.status, 200)
  assert.match(second.text, /response_recovered|resp_recovered/)

  assert.deepEqual(seen.map((message) => message.previous_response_id ?? null), [null, 'resp_recovered', null])
  assert.equal(upstream.connections.length, 2, 'the failed connection was not pooled again')
})

test('codex websocket: connect failure cools the session and the retry rides SSE', async (t) => {
  t.after(() => closeCodexWebSockets())
  enableWs(t)
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  // No upgrade handler answers, so the WS handshake dies.
  upstream.server.removeAllListeners('upgrade')
  upstream.server.on('upgrade', (request, socket) => socket.destroy())
  upstream.onPost = (request, response) => {
    sseReply(response, [
      { type: 'response.created', response: { id: 'resp_sse' } },
      { type: 'response.output_text.delta', delta: 'sse' },
      completed('resp_sse'),
    ])
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())

  const answer = await hop.post(requestBody('conv-fallback', [USER_ITEM]))
  assert.equal(answer.status, 200)
  assert.match(answer.text, /event: response\.completed/)
  assert.equal(upstream.posts, 1, 'the SSE retry is the only HTTP upstream call')
  assert.ok(codexWebSocketCooling('conv-fallback'), 'the session cools down after the WS fault')

  const immediate = await hop.post(requestBody('conv-fallback', [USER_ITEM, assistantItem, NEW_USER_ITEM]))
  assert.equal(immediate.status, 200)
  assert.equal(upstream.posts, 2, 'inside the cooldown the hop does not touch WS again')
})

test('codex websocket: websocket_connection_limit_reached cools the session and the same attempt rides SSE', async (t) => {
  t.after(() => closeCodexWebSockets())
  enableWs(t)
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  upstream.onUpgrade = (connection) => {
    connection.onMessage = (message) => {
      if (message.type !== 'response.create') return
      // README 对话: the connection cap is a pre-commit fault, not a request error.
      connection.send({ type: 'error', code: 'websocket_connection_limit_reached', message: 'too many websocket connections' })
    }
  }
  upstream.onPost = (request, response) => {
    sseReply(response, [
      { type: 'response.created', response: { id: 'resp_limit_sse' } },
      { type: 'response.output_text.delta', delta: 'sse' },
      completed('resp_limit_sse'),
    ])
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())

  const answer = await hop.post(requestBody('conv-limit', [USER_ITEM]))
  assert.equal(answer.status, 200, `the connection cap must not surface as a request failure: ${answer.text}`)
  assert.match(answer.text, /resp_limit_sse/)
  assert.equal(upstream.posts, 1, 'the SSE wire answered inside the same attempt')
  assert.ok(codexWebSocketCooling('conv-limit'), 'the session cools down after the cap')
})

test('codex websocket: preamble-only stream is a retryable transport fault', async (t) => {
  t.after(() => closeCodexWebSockets())
  enableWs(t)
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  upstream.onUpgrade = (connection) => {
    connection.onMessage = () => {
      connection.send({ type: 'response.created', response: { id: 'resp_ghost' } })
      connection.close()
    }
  }
  upstream.onPost = (request, response) => {
    sseReply(response, [
      { type: 'response.created', response: { id: 'resp_sse' } },
      { type: 'response.output_text.delta', delta: 'sse' },
      completed('resp_sse'),
    ])
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())

  const answer = await hop.post(requestBody('conv-preamble', [USER_ITEM]))
  assert.equal(answer.status, 200)
  assert.match(answer.text, /event: response\.completed/)
  assert.equal(upstream.posts, 1)
})

test('codex websocket: response.done is renamed completed on the emitted wire', async (t) => {
  t.after(() => closeCodexWebSockets())
  enableWs(t)
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  upstream.onUpgrade = (connection) => {
    connection.onMessage = () => {
      connection.send({ type: 'response.output_text.delta', delta: 'x' })
      connection.send({ type: 'response.done', response: { id: 'resp_done', status: 'completed', output: [assistantItem] } })
    }
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())

  const answer = await hop.post(requestBody('conv-done', [USER_ITEM]))
  assert.equal(answer.status, 200)
  assert.match(answer.text, /event: response\.completed/)
  assert.doesNotMatch(answer.text, /event: response\.done/)
})

test('codex websocket: without DSH_CODEX_WEBSOCKET=on the hop stays on SSE', async (t) => {
  t.after(() => closeCodexWebSockets())
  delete process.env.DSH_CODEX_WEBSOCKET
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  upstream.onPost = (request, response) => {
    sseReply(response, [
      { type: 'response.created', response: { id: 'resp_sse' } },
      { type: 'response.output_text.delta', delta: 'sse' },
      completed('resp_sse'),
    ])
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())

  const answer = await hop.post(requestBody('conv-off', [USER_ITEM]))
  assert.equal(answer.status, 200)
  assert.match(answer.text, /event: response\.completed/)
  assert.equal(upstream.upgrades.length, 0)
  assert.equal(upstream.posts, 1)
})

test('codex websocket: the upgrade carries pi\'s header set', async (t) => {
  t.after(() => closeCodexWebSockets())
  enableWs(t)
  const upstream = await startUpstream()
  t.after(() => upstream.close())
  upstream.onUpgrade = (connection) => {
    connection.onMessage = () => {
      connection.send({ type: 'response.output_text.delta', delta: 'x' })
      connection.send(completed('resp_hdr'))
    }
  }
  const hop = await startHop(upstream)
  t.after(() => hop.close())
  await hop.post(requestBody('conv-headers', [USER_ITEM]))
  assert.equal(upstream.upgrades.length, 1)
  const headers = upstream.upgrades[0]
  assert.equal(headers['openai-beta'], 'responses_websockets=2026-02-06')
  assert.equal(headers['session-id'], 'conv-headers')
  assert.equal(headers['x-client-request-id'], 'conv-headers')
  assert.equal(headers['chatgpt-account-id'], 'acct-1')
  assert.equal(headers.authorization, 'Bearer test-token')
  assert.ok(String(headers['user-agent']).startsWith('codex_cli_rs/'))
})
