import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import {
  RETRY_BACKOFF_MS,
  UPSTREAM_ATTEMPTS,
  UpstreamFailure,
  answerFailure,
  connectCodeStatus,
  retryDelayMs,
  setUpstreamLog,
  upstreamRequest,
} from '../lib/oauth/upstream.js'
import { LoginRequiredError, TokenManager } from '../lib/oauth/tokens.js'
import { clineQuotaFailure } from '../lib/oauth/cline/request.js'
import { createProxy } from '../lib/oauth/proxy.js'
import { outboundFetch } from '../lib/utils/outbound.js'
import { RequestError } from '../lib/utils/http.js'

const hang = () => new Promise(() => {})
const transport = (message = 'fetch failed: ECONNRESET') => new UpstreamFailure(502, message, { code: 'transport' })

/**
 * Mocked clock at 0 with jitter pinned to the base backoff. `settle` steps the
 * clock in 100ms ticks, draining real I/O between ticks, until `promise`
 * settles; it returns the outcome and the mocked time it settled at.
 */
function withClock(run) {
  return async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
    const random = mock.method(Math, 'random', () => 0)
    const errorLog = mock.method(console, 'error', () => {})
    try {
      await run(errorLog)
    } finally {
      errorLog.mock.restore()
      random.mock.restore()
      mock.timers.reset()
    }
  }
}

async function settle(promise, limitMs = 600_000) {
  let outcome
  promise.then((value) => { outcome = { value } }, (error) => { outcome = { error } })
  for (let elapsed = 0; ; elapsed += 100) {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
    if (outcome) return { ...outcome, at: Date.now() }
    if (elapsed >= limitMs) throw new Error(`still pending at ${Date.now()}ms`)
    mock.timers.tick(100)
  }
}

const request = (options = {}) => upstreamRequest({ family: 'ollama', stream: true, ...options })

test('retry backoff jitters below the base so concurrent requests never retry in lockstep', () => {
  assert.deepEqual(RETRY_BACKOFF_MS, [1000, 4000])
  assert.equal(retryDelayMs(0, () => 0), 1000, 'jitter floor at attempt 0 is the full base')
  assert.equal(retryDelayMs(1, () => 0), 4000)
  assert.equal(retryDelayMs(0, () => 0.5), 875)
  const delayed = retryDelayMs(0, () => 0.99)
  assert.ok(delayed >= 750 && delayed <= 1000, `shrink-only jitter stays within the base: ${delayed}`)
})

test('a stall before the response head is cut at 120s, retried once, and answered 504 before the host 300s watchdog', withClock(async () => {
  let calls = 0
  const { error, at } = await settle(request().run(() => { calls += 1; return hang() }))
  // 120s + 1s backoff + 120s; a third attempt would need 241 + 4 + 120 > 270.
  assert.equal(calls, 2)
  assert.equal(at, 241_000)
  assert.equal(error.status, 504)
  assert.equal(error.message, 'ollama upstream: no output within 270s (2 attempts): no first byte within 120s')
}))

test('the first touch ends the first-byte window; pre-output silence after it is bounded by the budget', withClock(async () => {
  let calls = 0
  const { error, at } = await settle(request().run(async (attempt) => {
    calls += 1
    attempt.touch() // a preamble frame, nothing committed
    return hang()
  }))
  assert.equal(calls, 1, 'no second attempt fits 270s once the first one used it all')
  assert.equal(at, 270_000)
  assert.equal(error.status, 504)
  assert.match(error.message, /no output within 270s \(1 attempts\): no output within 270s/)
}))

test('the budget starts at startedAt, so the session wait counts', withClock(async () => {
  const stalled = await settle(request({ startedAt: -200_000 }).run(hang))
  assert.equal(stalled.at, 70_000, 'the budget fires before the 120s first-byte window')
  assert.equal(stalled.error.status, 504)

  let calls = 0
  const fast = await settle(request({ startedAt: Date.now() - 200_000 }).run(async () => { calls += 1; throw transport() }))
  assert.equal(calls, 1, '200s + 1s + 120s does not fit 270s')
  assert.equal(fast.error.status, 502)
  assert.equal(fast.error.message, 'ollama upstream failed 1 times: fetch failed: ECONNRESET')
}))

test('non-streaming requests get the remaining budget as their first-byte window', withClock(async () => {
  const slow = await settle(request({ stream: false }).run(() => new Promise((resolve) => setTimeout(() => resolve('whole body'), 200_000))))
  assert.equal(slow.value, 'whole body', 'a long non-streamed generation is not cut at 120s')
  const stalled = await settle(request({ stream: false }).run(hang))
  assert.equal(stalled.at - slow.at, 270_000)
  assert.equal(stalled.error.status, 504)
}))

test('after the head is out the budget no longer applies; 270s of silence fails the one attempt for destroy', withClock(async (errorLog) => {
  const response = { headersSent: false }
  const long = await settle(request({ response }).run(async (attempt) => {
    attempt.touch()
    response.headersSent = true
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100_000))
      attempt.touch()
    }
    return 'done'
  }))
  assert.equal(long.value, 'done', 'a 400s stream with steady output is not cut by the 270s budget')

  let calls = 0
  const committed = { headersSent: false }
  const started = Date.now()
  const idle = await settle(request({ response: committed }).run(async (attempt) => {
    calls += 1
    attempt.touch()
    committed.headersSent = true
    return hang()
  }))
  assert.equal(calls, 1, 'committed output cannot be replayed')
  assert.equal(idle.at - started, 270_000)
  assert.equal(idle.error.code, 'timeout')
  assert.match(errorLog.mock.calls.at(-1).arguments[0], /ollama upstream failed mid-response: upstream sent no data for 270s/)
}))

test('a first-output window drops a first try that streams no output; the retry keeps the rest of the budget', withClock(async () => {
  let calls = 0
  const response = { headersSent: false }
  const { value, at } = await settle(request({ response, timeouts: { firstOutputMs: 90_000 } }).run(async (attempt) => {
    calls += 1
    attempt.touch() // a preamble frame is not output
    if (calls === 1) return hang()
    await new Promise((resolve) => setTimeout(resolve, 150_000)) // slow but healthy: not cut again
    response.headersSent = true
    return 'ok'
  }))
  assert.equal(calls, 2)
  assert.equal(value, 'ok')
  assert.equal(at, 241_000, '90s + 1s backoff + 150s')
}))

test('retries and mid-response failures are also appended to the upstream log, with their timing', withClock(async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'upstream-log-')), 'upstream.log')
  setUpstreamLog(path)
  try {
    const response = { headersSent: false }
    let calls = 0
    await settle(request({ response }).run(async (attempt) => {
      calls += 1
      if (calls === 1) throw transport()
      attempt.touch()
      response.headersSent = true
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      throw new TypeError('terminated', { cause: { code: 'UND_ERR_SOCKET' } })
    }))
    let text = ''
    for (let i = 0; i < 500 && !text.includes('mid-response'); i++) text = await readFile(path, 'utf8').catch(() => '')
    assert.match(text, /ollama retrying upstream \(attempt 2\/3\) in 1000ms: fetch failed: ECONNRESET/)
    assert.match(text, /ollama upstream failed mid-response: terminated: UND_ERR_SOCKET \(6s in, 5s since its last data\)/)
  } finally {
    setUpstreamLog(undefined)
  }
}))

test('transport faults retry on the backoff schedule; three of them answer 502 with the proxyExhausted wording', withClock(async () => {
  const seen = []
  const { error, at } = await settle(request().run(async (attempt) => {
    seen.push([attempt.index, Date.now()])
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) })
  }))
  assert.deepEqual(seen, [[0, 0], [1, 1000], [2, 5000]])
  assert.equal(at, 5000)
  assert.equal(error.status, 502)
  assert.equal(error.message, `ollama upstream failed ${UPSTREAM_ATTEMPTS} times: fetch failed: ECONNRESET`)

  let calls = 0
  const recovered = await settle(request().run(async () => {
    calls += 1
    if (calls === 1) throw transport('stream ended with no output events (2950B, silent 3ms)')
    return 'ok'
  }))
  assert.equal(recovered.value, 'ok')
  assert.equal(recovered.at - at, 1000)
}))

test('upstream HTTP answers, quota answers and request errors are never replayed', withClock(async () => {
  for (const failure of [
    new UpstreamFailure(503, 'ollama upstream 503', { code: 'http', payload: { error: 'busy' } }),
    new UpstreamFailure(429, 'usage limit reached: daily cap', { code: 'quota' }),
    new RequestError(400, 'request body must contain JSON'),
    new LoginRequiredError('Codex is not logged in'),
  ]) {
    let calls = 0
    const { error } = await settle(request().run(async () => { calls += 1; throw failure }))
    assert.equal(error, failure)
    assert.equal(calls, 1, failure.message)
  }
}))

test('an upstream 401 refreshes once and retries immediately; a second 401 or a failed refresh is forwarded', withClock(async () => {
  const unauthorized = () => new UpstreamFailure(401, 'codex upstream 401', { code: 'http', payload: { error: { message: 'token revoked' } } })
  const seen = []
  let refreshes = 0
  const again = await settle(request().run(async (attempt) => {
    seen.push([attempt.index, Date.now()])
    throw unauthorized()
  }, { refresh: async () => { refreshes += 1; return true } }))
  assert.deepEqual(seen, [[0, 0], [0, 0]], 'no backoff, and the retry is not a counted attempt')
  assert.equal(refreshes, 1)
  assert.equal(again.error.status, 401)

  let calls = 0
  const refused = await settle(request().run(async () => { calls += 1; throw unauthorized() }, { refresh: async () => false }))
  assert.equal(calls, 1)
  assert.deepEqual(refused.error.payload, { error: { message: 'token revoked' } })
}))

test('a client disconnect stops the request without a retry', withClock(async () => {
  const client = new AbortController()
  let calls = 0
  const pending = request({ signal: client.signal }).run(async (attempt) => {
    calls += 1
    setTimeout(() => client.abort(new Error('client disconnected')), 5000)
    return new Promise((_, reject) => attempt.signal.addEventListener('abort', () => reject(attempt.signal.reason)))
  })
  const { error, at } = await settle(pending)
  assert.equal(error.message, 'client disconnected')
  assert.equal(at, 5000)
  assert.equal(calls, 1)
}))

test('a reused keep-alive socket reset before the response head is retried once before output and succeeds', async () => {
  const sockets = new Set()
  let requests = 0
  const server = createServer((req, res) => {
    sockets.add(req.socket)
    requests += 1
    req.resume()
    // The second request lands on the kept-alive socket: reset it, as a
    // server that dropped an idle connection would.
    if (requests === 2) return req.socket.resetAndDestroy()
    res.end(`ok ${requests}`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/`
  const errorLog = mock.method(console, 'error', () => {})
  try {
    const post = (signal) => outboundFetch(url, { method: 'POST', body: '{}', signal }).then((r) => r.text())
    assert.equal(await post(), 'ok 1')
    let calls = 0
    const text = await request({ family: 'codex' }).run((attempt) => { calls += 1; return post(attempt.signal) })
    assert.equal(text, 'ok 3')
    assert.equal(calls, 2)
    assert.equal(sockets.size, 2, 'the retry dialed a fresh connection')
    assert.match(errorLog.mock.calls[0].arguments[0], /codex retrying upstream \(attempt 2\/3\).*(ECONNRESET|UND_ERR_SOCKET|other side closed)/)
  } finally {
    errorLog.mock.restore()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
})

test('connectCodeStatus maps Connect codes to statuses the host classifies', () => {
  assert.deepEqual(
    ['unauthenticated', 'permission_denied', 'resource_exhausted', 'unavailable', 'deadline_exceeded', 'invalid_argument', 'failed_precondition', 'out_of_range', 'internal', 'unknown'].map(connectCodeStatus),
    [401, 403, 429, 503, 504, 400, 400, 400, 502, 502],
  )
})

function fakeResponse({ headersSent = false } = {}) {
  return {
    headersSent,
    status: 0,
    headers: {},
    text: '',
    destroyed: undefined,
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true },
    end(text) { this.text = text },
    destroy(error) { this.destroyed = error },
  }
}

test('answerFailure answers JSON before the head (payload and retry headers kept) and destroys after it', () => {
  const forwarded = fakeResponse()
  answerFailure(forwarded, new UpstreamFailure(429, 'codex upstream 429', { code: 'http', payload: { error: { message: 'slow down' } }, retryAfter: '7', retryAfterMs: '700' }))
  assert.equal(forwarded.status, 429)
  assert.deepEqual(JSON.parse(forwarded.text), { error: { message: 'slow down' } })
  assert.equal(forwarded.headers['retry-after'], '7')
  assert.equal(forwarded.headers['retry-after-ms'], '700')

  const plain = fakeResponse()
  answerFailure(plain, new Error('boom'))
  assert.equal(plain.status, 500)
  assert.deepEqual(JSON.parse(plain.text), { error: 'boom' })
  assert.equal(plain.headers['retry-after'], undefined)

  const broken = fakeResponse({ headersSent: true })
  const failure = transport('terminated')
  answerFailure(broken, failure)
  assert.equal(broken.destroyed, failure)
  assert.equal(broken.status, 0, 'no second head')
})

test('TokenManager login-required errors are LoginRequiredError with status 403', async () => {
  const manager = new TokenManager({
    provider: 'codex',
    authPath: join(await mkdtemp(join(tmpdir(), 'osubs-upstream-')), 'auth.json'),
    displayName: 'Codex',
    refresh: async () => { throw new Error('never') },
  })
  await assert.rejects(manager.session(), (error) => error instanceof LoginRequiredError && error.status === 403 && error.message === 'Codex is not logged in')
})

// --- host classification contract -------------------------------------------
// Verbatim from the DSH host classifier (llm-pi-ai `classifyPiAiError`, 2026-09-28),
// in the host's order. Failures reach it as `<status> <JSON error>` text.

const QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED'
function classifyPiAiError(message) {
  if (/\b(?:401|403)\b/.test(message)) return 'AUTH'
  if (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE
  if (/\b429\b|rate.?limit/i.test(message)) return 'RATE_LIMIT'
  if (/\b413\b|failed to buffer the request body:\s*length limit exceeded|payload too large|request body too large/i.test(message)) return 'INVALID_REQUEST'
  if (/\b400\b|invalid.?request/i.test(message)) return 'INVALID_REQUEST'
  if (/\b5\d\d\b/.test(message)) return 'SERVER'
  if (/\btime(?:d)?\s*out\b|timeout/i.test(message)) return 'TIMEOUT'
  if (/stream ended (?:before|without)\b/i.test(message)) return 'TRANSPORT'
  if (/\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b/i.test(message)
    || /\b(?:other side closed|HTTP2 request did not get a response|WebSocket closed unexpectedly)\b/i.test(message)
    || /\bterminated\b|premature close/i.test(message)) return 'TRANSPORT'
  return 'PI_AI_ERROR'
}
function isQuotaExceededError(detail) {
  return /\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i.test(detail)
    || /\b(?:quota|usage[\s_-]+limit)[\s_-]+(?:exceeded|exhausted|reached)\b/i.test(detail)
    || /\bexceed(?:ed|s)?[\s_-]+(?:(?:your|the)[\s_-]+)?(?:current[\s_-]+)?quota\b/i.test(detail)
    || /\b(?:balance|credits?)[\s_-]+(?:exhausted|depleted)\b/i.test(detail)
    || /\bout[\s_-]+of[\s_-]+(?:credits?|budget)\b/i.test(detail)
}
/** `@deepseek-ai/dsh-llm-retry` normal mode retries exactly these. */
const HOST_RETRIED = new Set(['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'])

function hostMessage(error) {
  const response = fakeResponse()
  answerFailure(response, error)
  const body = JSON.parse(response.text)
  return `${response.status} ${JSON.stringify(body.error ?? body)}`
}

test('host classification contract: every proxy failure lands on the code the spec intends', withClock(async () => {
  const exhausted = await settle(upstreamRequest({ family: 'codex', stream: true }).run(async () => {
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) })
  }))
  const noOutput = await settle(upstreamRequest({ family: 'grok', stream: true }).run(hang))
  const preambleOnly = await settle(upstreamRequest({ family: 'codex', stream: true }).run(async () => {
    throw transport('stream ended with no output events (2950B, silent 403ms)')
  }))
  const cases = [
    ['transport faults exhausted', hostMessage(exhausted.error), 'SERVER'],
    ['no output within the budget', hostMessage(noOutput.error), 'SERVER'],
    ['preamble-only EOF exhausted', hostMessage(preambleOnly.error), 'SERVER'],
    ['stream destroyed after output', 'terminated', 'TRANSPORT'],
    ['Cline daily cap', hostMessage(clineQuotaFailure(429, { code: 'INFERENCE_CAP_ERROR', message: 'Error 429: Daily free limit reached on model google/gemini-3.8-flash. Try again in 1h 32m' })), QUOTA_EXCEEDED_CODE],
    ['not logged in', hostMessage(new LoginRequiredError('Codex is not logged in')), 'AUTH'],
    ['login expired', hostMessage(new LoginRequiredError('Codex login expired; sign in again')), 'AUTH'],
  ]
  for (const [label, message, code] of cases) {
    assert.equal(classifyPiAiError(message), code, `${label}: ${message}`)
  }
  for (const code of ['SERVER', 'TIMEOUT', 'TRANSPORT']) assert.ok(HOST_RETRIED.has(code))
  for (const code of [QUOTA_EXCEEDED_CODE, 'AUTH']) assert.ok(!HOST_RETRIED.has(code))
}))

// --- proxy wiring --------------------------------------------------------------

async function withProxy(tokens, fetchFn, run) {
  const proxy = createProxy({ port: 0, apiKey: 'k', tokens, fetchFn })
  const server = await proxy.listen()
  try {
    return await run(server.address().port)
  } finally {
    await proxy.close()
  }
}

const postJson = (port, path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
  method: 'POST',
  headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

test('proxy answers the Cline daily cap as a 429 usage-limit, forwarded once', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return new Response('{"code":"INFERENCE_CAP_ERROR","message":"Error 429: Daily free limit reached on model x. Try again in 1h"}', { status: 429, headers: { 'content-type': 'application/json' } })
  }
  const tokens = { cline: { session: async () => ({ accessToken: 'workos:tok', accountId: 'a' }) } }
  await withProxy(tokens, fetchFn, async (port) => {
    const response = await postJson(port, '/cline/v1/chat/completions', { model: 'google/gemini-3.8-flash', stream: true, messages: [] })
    assert.equal(response.status, 429)
    assert.deepEqual(await response.json(), { error: 'usage limit reached: Error 429: Daily free limit reached on model x. Try again in 1h' })
    assert.equal(calls, 1)
  })
  assert.equal(clineQuotaFailure(429, { error: { message: 'rate limited' } }), undefined, 'other 429s stay upstream answers')
})

test('host classification contract: Kiro monthly quota is QUOTA_EXCEEDED, a refused token after refresh is not AUTH', async () => {
  const cases = [
    [400, { reason: 'MONTHLY_REQUEST_COUNT', message: 'You have reached the limit for monthly requests' }, QUOTA_EXCEEDED_CODE],
    [403, { message: 'The bearer token included in the request is invalid.' }, 'INVALID_REQUEST'],
  ]
  for (const [status, answer, code] of cases) {
    const tokens = { kiro: {
      session: async () => ({ accessToken: 'tok', region: 'us-east-1', authMethod: 'social' }),
      sourceOf: () => ({ id: 'a' }),
      refreshNow: async () => ({ session: { accessToken: 'fresh', region: 'us-east-1', authMethod: 'social' } }),
    } }
    await withProxy(tokens, async () => new Response(JSON.stringify(answer), { status }), async (port) => {
      const response = await postJson(port, '/kiro/v1/chat/completions', { model: 'deepseek-3.2', stream: true, messages: [] })
      const body = await response.json()
      const message = `${response.status} ${JSON.stringify(body.error ?? body)}`
      assert.equal(classifyPiAiError(message), code, message)
    })
  }
})

test('proxy answers a missing login as 403 before any upstream call', async () => {
  let calls = 0
  const tokens = { ollama: { session: async () => { throw new LoginRequiredError('Ollama Cloud is not logged in') } } }
  await withProxy(tokens, async () => { calls += 1 }, async (port) => {
    const response = await postJson(port, '/ollama/v1/chat/completions', { model: 'm', stream: true, messages: [] })
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: 'Ollama Cloud is not logged in' })
    assert.equal(calls, 0)
  })
})
