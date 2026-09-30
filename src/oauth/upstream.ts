/**
 * Upstream attempt primitive: the one owner of per-attempt timers, the
 * pre-output budget, retries and the failure → HTTP mapping for every hop.
 * The proxy has to give up before the host's 300s stream watchdog, with a
 * status the host classifies correctly (SERVER/TIMEOUT/TRANSPORT retry;
 * QUOTA_EXCEEDED/AUTH do not).
 */

import type { ServerResponse } from 'node:http'
import { RequestError, describeError, sendJson } from '../utils/http.js'
import { appendPrivateLine } from '../utils/private-text.js'

/**
 * Per attempt the first byte (response head included) must arrive within
 * `firstByteMs`; everything before output — `tokens.session()` included —
 * shares `budgetMs`; once output flows, `idleMs` of silence destroys it.
 * `firstOutputMs` (0 = off; a family opts in) bounds how long the first try
 * may stream without client output — preamble frames do not count.
 */
export const UPSTREAM_TIMEOUTS = { firstByteMs: 120_000, budgetMs: 270_000, idleMs: 270_000, firstOutputMs: 0 }

let logPath: string | undefined

/**
 * Retries and mid-response failures are also appended here: the host only
 * records "terminated", and stderr is not kept. ponytail: one global sink,
 * set once by the plugin; one rotation to `.1` past 1 MB.
 */
export function setUpstreamLog(path: string | undefined) {
  logPath = path
}

function logUpstream(line: string) {
  console.error(`[oauth-subs] ${line}`)
  if (logPath) void appendPrivateLine(logPath, `${new Date().toISOString()} ${line}`).catch(() => {})
}
/** Upstream attempts before the client is told the request failed. */
export const UPSTREAM_ATTEMPTS = 3
export const RETRY_BACKOFF_MS = [1000, 4000]
/**
 * OpenAI/Anthropic SDK backoff shrinks the delay by up to 25% at random, so
 * concurrent proxy requests never retry in lockstep against a recovering
 * upstream. (pi-ai, senpi's engine, jitters the same way.)
 */
const RETRY_JITTER = 0.25

/**
 * Delay before the next retry: the backoff schedule with shrink-only jitter
 * (never longer than the base, so tests and callers can bound the wait).
 */
export function retryDelayMs(failedAttempt, random = Math.random) {
  const base = RETRY_BACKOFF_MS[Math.min(Math.max(failedAttempt, 0), RETRY_BACKOFF_MS.length - 1)]
  return Math.round(base * (1 - random() * RETRY_JITTER))
}

/**
 * `transport` (socket fault, preamble-only EOF) and `timeout` are retried
 * before output; `http` is the upstream's own answer and `quota` a family's
 * known usage-cap answer — both forwarded once, never replayed: the host paces
 * its own retries.
 */
export type UpstreamFailureCode = 'transport' | 'timeout' | 'http' | 'quota'

export class UpstreamFailure extends RequestError {
  code: UpstreamFailureCode
  retryAfter?: string
  retryAfterMs?: string
  payload?: unknown

  constructor(status: number, message: string, { code, retryAfter, retryAfterMs, payload }: { code: UpstreamFailureCode, retryAfter?: string, retryAfterMs?: string, payload?: unknown }) {
    super(status, message)
    this.name = 'UpstreamFailure'
    this.code = code
    if (retryAfter) this.retryAfter = retryAfter
    if (retryAfterMs) this.retryAfterMs = retryAfterMs
    if (payload !== undefined) this.payload = payload
  }
}

export interface Attempt {
  /** Retry number: 0 for the first try; a 401 refresh retry keeps it. */
  index: number
  /** Aborts on client disconnect, first-byte timeout, budget or idle timeout. */
  signal: AbortSignal
  /** Call once per upstream chunk: the first call ends the first-byte window and starts the idle clock. */
  touch(): void
  /** True once the client response head is out — nothing can be retried after that. */
  committed(): boolean
}

/** A family's known usage-cap answer: the host reads the prefix as QUOTA_EXCEEDED and does not retry. */
export function quotaFailure(detail: string) {
  return new UpstreamFailure(429, `usage limit reached: ${detail}`, { code: 'quota' })
}

const seconds = (ms) => `${ms / 1000}s`
const timeout = (message) => new UpstreamFailure(504, message, { code: 'timeout' })

/** Abortable wait on the global timer (mockable, unlike node:timers/promises). */
function sleep(ms, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const onAbort = () => { clearTimeout(timer); reject(signal!.reason) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * `startedAt` is when the route handler received the request, so the wait for
 * `tokens.session()` counts against the budget. `response` is only read for
 * `headersSent` (the commit point). Non-streaming bodies arrive in one piece,
 * so their first-byte window is the remaining budget.
 */
export function upstreamRequest({ family, signal, startedAt = Date.now(), stream, response, timeouts }: {
  family: string
  signal?: AbortSignal
  startedAt?: number
  stream: boolean
  response?: Pick<ServerResponse, 'headersSent'>
  timeouts?: Partial<typeof UPSTREAM_TIMEOUTS>
}) {
  const { firstByteMs, budgetMs, idleMs, firstOutputMs } = { ...UPSTREAM_TIMEOUTS, ...timeouts }
  const committed = () => response?.headersSent === true

  const open = (index: number) => {
    const own = new AbortController()
    const attemptSignal = signal ? AbortSignal.any([signal, own.signal]) : own.signal
    let reason: UpstreamFailure | undefined
    const fail = (failure: UpstreamFailure) => {
      if (attemptSignal.aborted) return
      reason = failure
      own.abort(failure)
    }
    const budget = setTimeout(() => {
      if (!committed()) fail(timeout(`no output within ${seconds(budgetMs)}`))
    }, startedAt + budgetMs - Date.now())
    let firstByte = stream ? setTimeout(() => fail(timeout(`no first byte within ${seconds(firstByteMs)}`)), firstByteMs) : undefined
    // First try only: a sick attempt is dropped before it commits, while the
    // retry keeps the rest of the budget for a prompt that is merely slow.
    const firstOutput = stream && index === 0 && firstOutputMs > 0
      ? setTimeout(() => { if (!committed()) fail(timeout(`no output within ${seconds(firstOutputMs)}`)) }, firstOutputMs)
      : undefined
    let lastData = Date.now()
    let idle
    let onAbort
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(attemptSignal.reason)
      if (attemptSignal.aborted) onAbort()
      else attemptSignal.addEventListener('abort', onAbort, { once: true })
    })
    const attempt: Attempt = {
      index,
      signal: attemptSignal,
      touch() {
        lastData = Date.now()
        clearTimeout(firstByte)
        firstByte = undefined
        clearTimeout(idle)
        idle = setTimeout(() => fail(timeout(`upstream sent no data for ${seconds(idleMs)}`)), idleMs)
      },
      committed,
    }
    return {
      attempt,
      aborted,
      reason: () => reason,
      silentMs: () => Date.now() - lastData,
      close() {
        clearTimeout(budget)
        clearTimeout(firstByte)
        clearTimeout(firstOutput)
        clearTimeout(idle)
        attemptSignal.removeEventListener('abort', onAbort)
      },
    }
  }

  return {
    /**
     * Run `fn` until it settles, retrying transport faults and timeouts before
     * output while `elapsed + backoff + firstByteMs` still fits the budget.
     * `refresh` runs once on an upstream 401; `true` retries immediately.
     */
    async run<T>(fn: (attempt: Attempt) => Promise<T>, { refresh }: { refresh?: () => Promise<boolean> } = {}): Promise<T> {
      let failures = 0
      let refreshed = false
      for (;;) {
        const current = open(failures)
        let failure
        try {
          const work = fn(current.attempt)
          // A hop that ignores the signal must not hold the request past its timers.
          work.catch(() => {})
          return await Promise.race([work, current.aborted])
        } catch (error) {
          failure = current.reason() ?? error
        } finally {
          current.close()
        }
        if (signal?.aborted) throw failure
        if (committed()) {
          logUpstream(`${family} upstream failed mid-response: ${describeError(failure)} (${seconds(Date.now() - startedAt)} in, ${seconds(current.silentMs())} since its last data)`)
          throw failure
        }
        if (failure instanceof UpstreamFailure && failure.code === 'http' && failure.status === 401 && refresh && !refreshed) {
          refreshed = true
          if (await refresh().catch(() => false)) continue
        }
        if (failure instanceof UpstreamFailure ? (failure.code === 'http' || failure.code === 'quota') : failure instanceof RequestError) throw failure
        const last = failure instanceof UpstreamFailure ? failure : new UpstreamFailure(502, describeError(failure), { code: 'transport' })
        failures += 1
        const wait = retryDelayMs(failures - 1)
        if (failures < UPSTREAM_ATTEMPTS && Date.now() - startedAt + wait + firstByteMs <= budgetMs) {
          logUpstream(`${family} retrying upstream (attempt ${failures + 1}/${UPSTREAM_ATTEMPTS}) in ${wait}ms: ${last.message}`)
          await sleep(wait, signal)
          continue
        }
        if (last.code === 'timeout') {
          throw timeout(`${family} upstream: no output within ${seconds(budgetMs)} (${failures} attempts): ${last.message}`)
        }
        throw new UpstreamFailure(502, `${family} upstream failed ${failures} times: ${last.message}`, { code: 'transport' })
      }
    },
  }
}

/** Connect-RPC error code → the HTTP status the host classifies correctly. */
export function connectCodeStatus(code: string): number {
  switch (code) {
    case 'unauthenticated': return 401
    case 'permission_denied': return 403
    case 'resource_exhausted': return 429
    case 'unavailable': return 503
    case 'deadline_exceeded': return 504
    case 'invalid_argument':
    case 'failed_precondition':
    case 'out_of_range': return 400
    default: return 502
  }
}

/**
 * Before the head: a JSON error with the upstream's own payload and retry
 * headers when it has them. After the head: destroy, so the client sees a
 * broken stream — a clean EOF reads as a finished response.
 */
export function answerFailure(response: ServerResponse, error: any): void {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : new Error(String(error)))
    return
  }
  const body = error?.payload !== undefined ? error.payload : { error: describeError(error) }
  sendJson(response, typeof error?.status === 'number' ? error.status : 500, body, {
    'retry-after': error?.retryAfter,
    'retry-after-ms': error?.retryAfterMs,
  })
}

/**
 * Read an upstream body to EOF. A read that settles after the attempt's timers
 * fired never reaches the client, every chunk touches the idle clock, and the
 * reader is always cancelled and released — a throw must not pin the socket.
 */
export async function pumpBody(
  body: ReadableStream<Uint8Array> | null | undefined,
  { signal, touch }: { signal?: AbortSignal, touch?: () => void },
  onChunk: (chunk: Uint8Array) => unknown,
): Promise<void> {
  const reader = body?.getReader()
  if (!reader) return
  try {
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) return
      touch?.()
      await onChunk(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/**
 * Wait out a full write buffer. A destroyed response emits 'close', never
 * 'drain', so 'close', 'error' and the attempt signal end the wait too — a
 * gone client fails fast instead of pinning the upstream reader.
 */
export function waitForDrain(response: ServerResponse, signal?: AbortSignal): Promise<void> {
  if (response.destroyed) return Promise.reject(new Error('client disconnected'))
  return new Promise((resolve, reject) => {
    const settle = (error?: unknown) => {
      response.off('drain', onDrain)
      response.off('close', onClose)
      response.off('error', settle)
      signal?.removeEventListener('abort', onAbort)
      if (error === undefined) resolve()
      else reject(error)
    }
    const onDrain = () => settle()
    const onClose = () => settle(new Error('client disconnected before drain'))
    const onAbort = () => settle(signal!.reason)
    response.once('drain', onDrain)
    response.once('close', onClose)
    response.once('error', settle)
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const SSE_HEAD = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
}

/**
 * One `data:` frame of a translated OpenAI stream (`chunk` is serialised
 * unless it is already a string, e.g. `[DONE]`). The SSE head goes out with
 * the first frame, so everything before it can still answer as JSON.
 */
export async function writeSse(response: ServerResponse, chunk: unknown, signal?: AbortSignal): Promise<void> {
  if (response.destroyed) throw new Error('client disconnected before write')
  if (!response.headersSent) response.writeHead(200, SSE_HEAD)
  const data = typeof chunk === 'string' ? chunk : JSON.stringify(chunk)
  if (!response.write(`data: ${data}\n\n`)) await waitForDrain(response, signal)
}
