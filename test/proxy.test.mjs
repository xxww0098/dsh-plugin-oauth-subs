import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { test } from 'node:test'
import { createProxy, describeError, hasOutputEvent, STREAM_ATTEMPTS, codexCacheSessionId } from '../lib/proxy.js'
import { CODEX_API_URL } from '../lib/codex.js'

function rawRequest(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    request.end(body)
  })
}

test('proxy requires the local bearer and forwards Codex Responses', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: init.body?.toString() })
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    bind: '0.0.0.0',
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: {
        session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }),
      },
      grok: {
        session: async () => { throw new Error('not logged in') },
      },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  assert.equal(server.address().address, '127.0.0.1')
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      body: '{"model":"gpt-5.3-codex"}',
    })
    assert.equal(denied.status, 401)

    const ok = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"gpt-5.3-codex","prompt_cache_key":"session-cache-1"}',
    })
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), '{"id":"resp"}')
    assert.equal(seen[0].url, CODEX_API_URL)
    assert.equal(seen[0].headers.authorization, 'Bearer codex-tok')
    assert.equal(seen[0].headers['chatgpt-account-id'], 'acct')
    assert.equal(seen[0].headers.originator, 'codex_cli_rs')
    assert.equal(seen[0].headers['user-agent'], 'codex_cli_rs/0.147.0')
    assert.equal(seen[0].headers['openai-version'], '0.147.0')
    assert.equal(seen[0].headers['session-id'], 'session-cache-1')
    assert.equal(seen[0].headers['x-client-request-id'], 'session-cache-1')
  } finally {
    await proxy.close()
  }
})

test('proxy asks upstream for SSE when the body streams', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push(init.headers)
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => { throw new Error('not logged in') } },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const post = (body) => fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body,
    })
    await post('{"model":"gpt-5.3-codex","stream":true}')
    assert.equal(seen[0].accept, 'text/event-stream')
    await post('{"model":"gpt-5.3-codex"}')
    assert.equal(seen[1].accept, 'application/json')
  } finally {
    await proxy.close()
  }
})

test('proxy peels -fast and injects service_tier on GPT; strips it on Codex', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push(JSON.parse(init.body.toString()))
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'grok-tok' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.5-fast"}',
    })
    assert.equal(seen[0].model, 'gpt-5.5')
    assert.equal(seen[0].service_tier, 'priority')
    assert.equal(seen[0].instructions, 'You are a helpful assistant.')

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.3-codex","service_tier":"priority"}',
    })
    assert.equal(seen[1].model, 'gpt-5.3-codex')
    assert.equal(seen[1].service_tier, undefined)

    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"grok-4.6-fast"}',
    })
    assert.deepEqual(seen[2], { model: 'grok-4.6', service_tier: 'priority' })

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.6-sol-900k-fast"}',
    })
    assert.equal(seen[3].model, 'gpt-5.6-sol')
    assert.equal(seen[3].service_tier, 'priority')

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-5.6-luna-fast',
        reasoning: { effort: 'max' },
        input: [
          { role: 'developer', content: 'sys' },
          { role: 'user', content: 'go' },
        ],
      }),
    })
    assert.equal(seen[4].model, 'gpt-5.6-luna')
    assert.equal(seen[4].service_tier, 'priority')
    assert.equal(seen[4].instructions, 'sys')
    assert.equal(seen[4].reasoning.effort, 'max')
    assert.deepEqual(seen[4].input, [{ role: 'user', content: 'go' }])
  } finally {
    await proxy.close()
  }
})

test('proxy health remains public and the removed HTTP management plane stays unreachable', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    tokens: {
      codex: { session: async () => { throw new Error('no') } },
      grok: { session: async () => { throw new Error('no') } },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal((await health.json()).ok, true)
    const manage = await fetch(`http://127.0.0.1:${port}/v0/oauth/status`, {
      headers: { authorization: 'Bearer k' },
    })
    assert.equal(manage.status, 404)
    const preflight = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, { method: 'OPTIONS' })
    assert.equal(preflight.status, 401)
    assert.equal(preflight.headers.get('access-control-allow-origin'), null)
  } finally {
    await proxy.close()
  }
})

test('proxy rejects malformed and oversized request bodies before upstream fetch', async () => {
  let calls = 0
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    maxRequestBodyBytes: 16,
    fetchFn: async () => {
      calls += 1
      return new Response('{}', { status: 200 })
    },
    tokens: {
      codex: { session: async () => ({ accessToken: 'a', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'g' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer k', 'content-type': 'application/json' }
  try {
    const malformed = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers,
      body: '{',
    })
    assert.equal(malformed.status, 400)

    const scalar = await rawRequest(port, {
      method: 'POST',
      path: '/grok/v1/responses',
      headers,
      body: '"x"',
    })
    assert.equal(scalar.status, 400)

    const array = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers,
      body: '[]',
    })
    assert.equal(array.status, 400)

    const oversizedChunked = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers,
      body: '{"model":"this is too long"}',
    })
    assert.equal(oversizedChunked.status, 413)

    const oversizedDeclared = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers: { ...headers, 'content-length': '17' },
      body: '12345678901234567',
    })
    assert.equal(oversizedDeclared.status, 413)
    assert.equal(calls, 0)
  } finally {
    await proxy.close()
  }
})

test('proxy aborts the upstream request when the local client disconnects', async () => {
  let signal
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    fetchFn: async (_url, init) => {
      signal = init.signal
      started()
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
    },
    tokens: {
      codex: { session: async () => ({ accessToken: 'a', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'g' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/codex/v1/responses',
      headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    })
    request.on('error', () => undefined)
    request.end('{"model":"gpt-5.3-codex"}')
    await startedPromise
    request.destroy()
    await Promise.race([
      new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('upstream signal was not aborted')), 1_000)),
    ])
  } finally {
    await proxy.close()
  }
})

test('proxy skips upstream work after a disconnect during token loading', async () => {
  let releaseSession
  let sessionStarted
  const sessionStartedPromise = new Promise((resolve) => { sessionStarted = resolve })
  const sessionPromise = new Promise((resolve) => { releaseSession = resolve })
  let upstreamCalls = 0
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    fetchFn: async () => {
      upstreamCalls += 1
      return new Response('{}', { status: 200 })
    },
    tokens: {
      codex: {
        session: async () => {
          sessionStarted()
          return sessionPromise
        },
      },
      grok: { session: async () => ({ accessToken: 'g' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/codex/v1/responses',
      headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    })
    request.on('error', () => undefined)
    request.end('{"model":"gpt-5.3-codex"}')
    await sessionStartedPromise
    request.destroy()
    await new Promise((resolve) => setTimeout(resolve, 20))
    releaseSession({ accessToken: 'a', accountId: 'acct' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(upstreamCalls, 0)
  } finally {
    await proxy.close()
  }
})

// --- upstream stream resilience -------------------------------------------
// The 2026-08-26 incident: every failed Codex stream carried `response.created`
// and no output event, and the proxy ended the client response cleanly, which
// llm-pi-ai reports as "stream ended before a terminal response event".

const SSE = { 'content-type': 'text/event-stream' }
const sse = (...events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
const CREATED = { type: 'response.created', response: { id: 'r1' } }
const DELTA = { type: 'response.output_text.delta', delta: 'hi' }
const DONE = { type: 'response.completed', response: { id: 'r1' } }

function streamingUpstream(chunks, { failAfter } = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
      if (failAfter === undefined) controller.close()
      else setTimeout(() => controller.error(Object.assign(new Error('terminated'), { code: 'UND_ERR_SOCKET' })), failAfter)
    },
  }), { status: 200, headers: SSE })
}

async function withProxy(fetchFn, run) {
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => { throw new Error('not logged in') } },
    },
  })
  const server = await proxy.listen()
  const logs = []
  const consoleError = console.error
  console.error = (...args) => logs.push(args.join(' '))
  try {
    return await run(server.address().port, logs)
  } finally {
    console.error = consoleError
    await proxy.close()
  }
}

const post = (port, body = { model: 'gpt-5.6-luna', stream: true, input: [] }) => fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
  method: 'POST',
  headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

test('a stream that ends carrying only the preamble is retried, and the client sees one clean stream', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return calls === 1
      ? streamingUpstream([sse(CREATED)])
      : streamingUpstream([sse(CREATED, DELTA, DONE)])
  }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    const text = await response.text()
    assert.equal(calls, 2, 'the dead first attempt must be retried')
    assert.equal(response.status, 200)
    assert.equal(text.match(/response\.created/g).length, 1, 'the retried preamble must not reach the client twice')
    assert.match(text, /response\.completed/)
  })
})

test('a genuine response.failed is forwarded, never retried away', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return streamingUpstream([sse(CREATED, { type: 'response.failed', response: { error: { code: 'server_error', message: 'boom' } } })])
  }
  await withProxy(fetchFn, async (port) => {
    const text = await (await post(port)).text()
    assert.equal(calls, 1, 'a terminal error event is an answer, not a transport fault')
    assert.match(text, /response\.failed/)
  })
})

test('a break after output has been committed reaches the client as a broken stream, not a clean end', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return streamingUpstream([sse(CREATED, DELTA)], { failAfter: 10 })
  }
  await withProxy(fetchFn, async (port, logs) => {
    const response = await post(port)
    await assert.rejects(response.text(), 'a clean EOF here reads as a completed response')
    assert.equal(calls, 1, 'committed bytes cannot be replayed, so no retry')
    assert.match(logs.join('\n'), /failed mid-response.*terminated.*committed=true/s)
  })
})

test('exhausting the retries answers with a real error instead of a silent EOF', async () => {
  let calls = 0
  const fetchFn = async () => { calls += 1; return streamingUpstream([sse(CREATED)]) }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    assert.equal(calls, STREAM_ATTEMPTS)
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /failed 3 times.*no output events/s)
  })
})

test('a pre-header fetch fault is retried too', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    if (calls === 1) throw new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
    return streamingUpstream([sse(CREATED, DELTA, DONE)])
  }
  await withProxy(fetchFn, async (port) => {
    assert.match(await (await post(port)).text(), /response\.completed/)
    assert.equal(calls, 2)
  })
})

test('a client disconnect during the silent window stops the proxy instead of retrying', async () => {
  let calls = 0
  const fetchFn = async (_url, init) => {
    calls += 1
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse(CREATED)))
        init.signal.addEventListener('abort', () => controller.error(init.signal.reason ?? new Error('aborted')), { once: true })
      },
    }), { status: 200, headers: SSE })
  }
  await withProxy(fetchFn, async (port) => {
    const abort = new AbortController()
    const inflight = fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-luna', stream: true, input: [] }),
      signal: abort.signal,
    }).then((r) => r.text())
    await new Promise((resolve) => setTimeout(resolve, 60))
    abort.abort()
    await assert.rejects(inflight)
    await new Promise((resolve) => setTimeout(resolve, 120))
    assert.equal(calls, 1, 'a disconnected client must not trigger upstream retries')
  })
})

test('non-streaming responses bypass the gate untouched', async () => {
  await withProxy(async () => new Response('{"id":"resp","object":"response"}', { status: 200, headers: { 'content-type': 'application/json' } }), async (port) => {
    const response = await post(port, { model: 'gpt-5.6-luna', stream: false, input: [] })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: 'resp', object: 'response' })
  })
})

test('hasOutputEvent treats only the preamble as retryable', () => {
  assert.equal(hasOutputEvent(sse(CREATED)), false)
  assert.equal(hasOutputEvent(sse(CREATED, { type: 'response.in_progress' })), false)
  assert.equal(hasOutputEvent(sse(CREATED, DELTA)), true)
  assert.equal(hasOutputEvent(sse(CREATED, { type: 'response.failed' })), true)
  assert.equal(hasOutputEvent(''), false)
})

test('describeError unwraps the undici cause behind "fetch failed"', () => {
  const error = new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
  assert.equal(describeError(error), 'fetch failed: UND_ERR_SOCKET')
  assert.equal(describeError(new Error('plain')), 'plain')
})

test('a streamed body that never looked like an SSE preamble is forwarded, not retried', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    assert.equal(calls, 1, 'an unrecognised body is the upstream answer, not a fault')
    assert.equal(await response.text(), '{"id":"resp"}')
  })
})

test('a streamed 200 with an empty body is retried', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return calls === 1
      ? new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200, headers: SSE })
      : streamingUpstream([sse(CREATED, DELTA, DONE)])
  }
  await withProxy(fetchFn, async (port) => {
    assert.match(await (await post(port)).text(), /response\.completed/)
    assert.equal(calls, 2)
  })
})

test('codexCacheSessionId sanitizes and clips instead of dropping the key', () => {
  assert.equal(codexCacheSessionId('session-cache-1'), 'session-cache-1')
  assert.equal(codexCacheSessionId('session 772f7f3a/foo'), 'session-772f7f3a-foo')
  const long = `session-${'a'.repeat(80)}`
  assert.equal(codexCacheSessionId(long).length, 64)
  assert.equal(codexCacheSessionId(''), undefined)
  assert.equal(codexCacheSessionId(null), undefined)
})
