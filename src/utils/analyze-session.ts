/**
 * Parse a DeepSeek Harness session.jsonl (or a JSON array of events) and
 * report Codex / Grok cache affinity, token spend, and transport faults.
 *
 * DSH writes usage on both `assistant/message` and a later `assistant/chunk`
 * of type `usage`. Counts are taken from `assistant/message` only, keyed by
 * turn+step, so a 42-step turn is not billed twice.
 *
 * Zero-cache after warmup is NOT automatically an affinity miss. Compaction
 * and a request/header rebuild rewrite the prompt prefix; the next call is a
 * cold write of the new prefix. Affinity miss = reuse < 10% (including xAI's
 * 512-token block on the wrong shard) with no such rewrite, while the previous
 * prompt should have hit.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import { describeError } from './http.js'

const STREAM_ENDED = /stream ended before a terminal response event/i
const FETCH_FAILED = /fetch failed/i
const TRANSPORT = /\bTRANSPORT\b/
const STREAM_IDLE = /stream idle timeout/i

export const CACHE_KINDS = Object.freeze({
  cold_start: 'cold_start',
  delta: 'delta',
  compaction: 'compaction',
  rebuild: 'rebuild',
  prefix_break: 'prefix_break',
  affinity_miss: 'affinity_miss',
})

export const TOOL_CAUSES = Object.freeze({
  host_timeout: 'host_timeout',
  cascade_abort: 'cascade_abort',
  invalid: 'invalid',
  other: 'other',
})

const HOST_TIMEOUT = /timed out after (\d+)\s*ms/i
const CASCADE_ABORT = /aborted before completion|resolve aborted|read aborted|grep was aborted|search aborted|caller cancellation/i
const INVALID_ARGS = /pattern rejected|regex parse error|unclosed group/i

export function classifyToolError(message) {
  const text = String(message ?? '')
  const timeout = text.match(HOST_TIMEOUT)
  if (timeout) return { cause: TOOL_CAUSES.host_timeout, timeoutMs: Number(timeout[1]) }
  if (CASCADE_ABORT.test(text)) return { cause: TOOL_CAUSES.cascade_abort, timeoutMs: null }
  if (INVALID_ARGS.test(text)) return { cause: TOOL_CAUSES.invalid, timeoutMs: null }
  return { cause: TOOL_CAUSES.other, timeoutMs: null }
}

export function parseSessionEvents(text) {
  const trimmed = String(text ?? '').replace(/^\uFEFF/, '').trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) throw new Error('JSON root must be an array of events')
    return parsed
  }
  const events: any[] = []
  const lines = trimmed.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      events.push(JSON.parse(line))
    } catch (error) {
      throw new Error(`invalid JSONL on line ${i + 1}: ${describeError(error)}`)
    }
  }
  return events
}

function usageOf(event) {
  if (event?.type === 'assistant/message') {
    return event.data?.usage ?? event.data?.message?.usage ?? null
  }
  if (event?.type === 'assistant/chunk' && event.data?.chunk?.type === 'usage') {
    return event.data.chunk.usage ?? null
  }
  return null
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function stepKey(event) {
  const turn = event.data?.turn
  const step = event.data?.step
  if (turn == null || step == null) return null
  return `${turn}:${step}`
}

function headerConfig(events) {
  const header = events.find((event) => event.type === 'request/header')
  const config = header?.data?.header?.config ?? header?.data?.config ?? {}
  const context = events.find((event) => event.type === 'request/context')?.data ?? {}
  return {
    provider: config.provider ?? context.provider ?? null,
    model: config.model ?? context.model ?? null,
    reasoningEffort: config.reasoningEffort ?? null,
    maxTokens: config.maxTokens ?? null,
    contextWindow: context.contextWindow ?? null,
    adapterDefaults: header?.data?.header?.adapterDefaults ?? null,
  }
}

function collectCalls(events) {
  const byKey = new Map()
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const usage = usageOf(event)
    if (!usage) continue
    const key = stepKey(event) ?? `seq:${event.seq ?? byKey.size}`
    if (byKey.has(key)) continue
    byKey.set(key, {
      key,
      turn: event.data?.turn ?? null,
      step: event.data?.step ?? null,
      time: event.time ?? null,
      inputTokens: num(usage.inputTokens),
      outputTokens: num(usage.outputTokens),
      cacheReadTokens: num(usage.cacheReadTokens),
      cacheWriteTokens: num(usage.cacheWriteTokens),
      hasCacheField: Object.prototype.hasOwnProperty.call(usage, 'cacheReadTokens'),
    })
  }
  return [...byKey.values()].sort((a, b) => {
    const turn = (a.turn ?? 0) - (b.turn ?? 0)
    if (turn) return turn
    return (a.step ?? 0) - (b.step ?? 0)
  })
}

function toolArgsOf(data) {
  const args = data?.args ?? data?.arguments ?? data?.input
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { pattern: null, path: null }
  const pattern = typeof args.pattern === 'string' ? args.pattern : null
  const path = typeof args.path === 'string'
    ? args.path
    : typeof args.file_path === 'string'
      ? args.file_path
      : null
  return { pattern, path }
}

function collectToolErrors(events) {
  const errors: any[] = []
  let lastStep = null
  for (const event of events) {
    if (typeof event.data?.step === 'number') lastStep = event.data.step
    if (event.type !== 'tool/code-dispatch' || !event.data?.isError) continue
    const content = event.data.content
    const text = Array.isArray(content)
      ? content.map((part) => part?.text ?? '').join('\n')
      : String(content ?? '')
    const { cause, timeoutMs } = classifyToolError(text)
    const { pattern, path } = toolArgsOf(event.data)
    errors.push({
      kind: 'tool',
      name: event.data.name ?? 'unknown',
      message: text.slice(0, 240),
      cause,
      timeoutMs,
      pattern,
      path,
      step: lastStep,
      time: event.time ?? null,
    })
  }
  return errors
}

function countToolCauses(errors) {
  const counts = { host_timeout: 0, cascade_abort: 0, invalid: 0, other: 0 }
  for (const error of errors) {
    if (counts[error.cause] == null) counts.other += 1
    else counts[error.cause] += 1
  }
  return counts
}

/** Failure text nested in `stream` frames: terminal `finish` reasons on
 * assistant/attempt and assistant/message. Top-level error fields miss these. */
function streamFailureTexts(data) {
  if (!Array.isArray(data?.stream)) return []
  const out: string[] = []
  for (const frame of data.stream) {
    const failure = frame?.chunk?.reason?.failure
    if (failure?.message) out.push(failure.message)
    if (failure?.code) out.push(failure.code)
  }
  return out
}

/**
 * `data.message` on tool/user events is often a serialized envelope whose
 * `content`/`arguments` carry payload text — editing docs/error.md once
 * tripped TRANSPORT/STREAM_IDLE on log quotes, not an upstream fault. Parsed
 * envelopes scan with payload keys stripped; bare strings scan as-is.
 */
function transportScanText(value) {
  const text = typeof value === 'string' ? value : (() => { try { return JSON.stringify(value) } catch { return '' } })()
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const rest = { ...parsed }
      delete rest.content
      delete rest.arguments
      delete rest.parts
      return JSON.stringify(rest)
    }
  } catch { /* not JSON — scan as-is */ }
  return text
}

function collectTransportFaults(events) {
  const faults: any[] = []
  for (const event of events) {
    if (event.type === 'assistant/chunk' || event.type === 'tool-call-chunks' || event.type === 'reasoning-chunks') {
      continue
    }
    const haystack = [
      event.data?.error,
      event.data?.message,
      event.data?.text,
      event.data?.detail,
      ...streamFailureTexts(event.data),
    ].filter(Boolean).map(transportScanText).join('\n')
    if (!haystack) continue
    if (STREAM_ENDED.test(haystack) || FETCH_FAILED.test(haystack) || TRANSPORT.test(haystack) || STREAM_IDLE.test(haystack)) {
      faults.push({
        kind: 'transport',
        type: event.type,
        message: haystack.slice(0, 240),
        time: event.time ?? null,
      })
    }
  }
  return faults
}

function collectPrefixMarkers(events) {
  const compaction: number[] = []
  const rebuild: number[] = []
  let headers = 0
  for (const event of events) {
    if (typeof event.time !== 'number') continue
    if (typeof event.type === 'string' && event.type.startsWith('compaction/')) {
      compaction.push(event.time)
      continue
    }
    if (event.type === 'request/header') {
      headers += 1
      if (headers > 1) rebuild.push(event.time)
    }
  }
  return { compaction, rebuild }
}

function inWindow(times, start, end) {
  return times.some((time) => time > start && time <= end)
}

function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Label each call: cold start, ordinary delta, compaction rewrite,
 * adapter rebuild, unexplained prefix break, or true affinity miss.
 */
export function annotateCacheCalls(calls, events) {
  const { compaction, rebuild } = collectPrefixMarkers(events)
  let prevBilled = 0
  let prevTime = Number.NEGATIVE_INFINITY
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]
    const billed = call.inputTokens + call.cacheReadTokens
    const reuse = prevBilled === 0 ? null : call.cacheReadTokens / prevBilled
    const t = typeof call.time === 'number' ? call.time : prevTime
    const compacted = inWindow(compaction, prevTime, t)
    const rebuilt = inWindow(rebuild, prevTime, t)
    let kind
    if (i === 0) {
      kind = call.cacheReadTokens === 0 ? CACHE_KINDS.cold_start : CACHE_KINDS.delta
    } else if (reuse !== null && reuse < 0.85 && compacted) {
      kind = CACHE_KINDS.compaction
    } else if (call.cacheReadTokens === 0 && rebuilt) {
      kind = CACHE_KINDS.rebuild
    } else if (reuse !== null && reuse < 0.5 && rebuilt) {
      kind = CACHE_KINDS.rebuild
    } else if (reuse !== null && reuse < 0.1) {
      kind = CACHE_KINDS.affinity_miss
    } else if (call.cacheReadTokens === 0 && reuse === null) {
      kind = CACHE_KINDS.affinity_miss
    } else if (reuse !== null && reuse < 0.85) {
      kind = CACHE_KINDS.prefix_break
    } else {
      kind = CACHE_KINDS.delta
    }
    call.billedTokens = billed
    call.hit = hitRate(call.cacheReadTokens, call.inputTokens)
    call.reuse = reuse
    call.kind = kind
    prevBilled = billed
    prevTime = t
  }
  return calls
}

function uncachedBreakdown(calls) {
  const sums = {
    cold_start: 0,
    delta: 0,
    compaction: 0,
    rebuild: 0,
    prefix_break: 0,
    affinity_miss: 0,
  }
  for (const call of calls) {
    const key = sums[call.kind] == null ? 'delta' : call.kind
    sums[key] += call.inputTokens
  }
  return sums
}

function hitRate(cache, uncached) {
  const total = cache + uncached
  return total === 0 ? 0 : cache / total
}

export function callHitRate(call) {
  return hitRate(call.cacheReadTokens, call.inputTokens)
}

/**
 * @param {string} text
 * @returns {object}
 */
export function analyzeSession(text) {
  const events = parseSessionEvents(text)
  const session = events.find((event) => event.type === 'session') ?? {}
  const config = headerConfig(events)
  const calls = annotateCacheCalls(collectCalls(events), events)
  const inputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0)
  const outputTokens = calls.reduce((sum, call) => sum + call.outputTokens, 0)
  const cacheReadTokens = calls.reduce((sum, call) => sum + call.cacheReadTokens, 0)
  const cacheWriteTokens = calls.reduce((sum, call) => sum + call.cacheWriteTokens, 0)
  const zeroCache = calls.filter((call) => call.cacheReadTokens === 0)
  const zeroAfterWarmup = zeroCache.filter((call) => (call.step ?? 1) > 1)
  const affinityMisses = calls.filter((call) => call.kind === CACHE_KINDS.affinity_miss)
  const compactionCalls = calls.filter((call) => call.kind === CACHE_KINDS.compaction)
  const rebuildCalls = calls.filter((call) => call.kind === CACHE_KINDS.rebuild)
  const toolErrors = collectToolErrors(events)
  const toolCauseCounts = countToolCauses(toolErrors)
  const transportFaults = collectTransportFaults(events)
  const times = events.map((event) => event.time).filter((time) => typeof time === 'number')
  const callTimes = calls.map((call) => call.time).filter((time) => typeof time === 'number')
  const weightedHit = hitRate(cacheReadTokens, inputTokens)
  const reuseValues = calls.map((call) => call.reuse).filter((value) => typeof value === 'number')
  const prefixReuseMedian = median(reuseValues)
  const healthy = weightedHit >= 0.8 && affinityMisses.length === 0 && transportFaults.length === 0

  const steps = events
    .filter((event) => event.type === 'step/start')
    .map((event) => event.data?.step)
    .filter((step) => typeof step === 'number')
  const maxStep = steps.length ? Math.max(...steps) : calls.length

  return {
    sessionId: session.id ?? null,
    cwd: session.cwd ?? null,
    agentPreset: session.agentPreset ?? null,
    eventCount: events.length,
    ...config,
    calls,
    callCount: calls.length,
    maxStep,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    billedInputTokens: inputTokens + cacheReadTokens,
    weightedCacheHit: weightedHit,
    prefixReuseMedian,
    zeroCacheCount: zeroCache.length,
    zeroCacheAfterWarmup: zeroAfterWarmup.length,
    affinityMissCount: affinityMisses.length,
    compactionCallCount: compactionCalls.length,
    rebuildCallCount: rebuildCalls.length,
    uncachedBreakdown: uncachedBreakdown(calls),
    toolErrors,
    toolCauseCounts,
    transportFaults,
    durationMs: callTimes.length >= 2 ? callTimes[callTimes.length - 1] - callTimes[0] : 0,
    wallMs: times.length >= 2 ? Math.max(...times) - Math.min(...times) : 0,
    healthy,
    verdict: healthy
      ? 'cache affinity looks healthy'
      : affinityMisses.length
        ? 'cache affinity regression: later calls missed the shard'
        : transportFaults.length
          ? 'transport faults in the session'
          : 'cache hit below 80%',
  }
}

export function formatReport(report) {
  const pct = (report.weightedCacheHit * 100).toFixed(1)
  const reuse = report.prefixReuseMedian == null ? '—' : `${(report.prefixReuseMedian * 100).toFixed(1)}%`
  const breakdown = report.uncachedBreakdown ?? {}
  const causes = report.toolCauseCounts ?? countToolCauses(report.toolErrors)
  const lines = [
    `session     ${report.sessionId ?? '(unknown)'}`,
    `provider    ${report.provider ?? '—'}  model ${report.model ?? '—'}`,
    `effort      ${report.reasoningEffort ?? '—'}  maxTokens ${report.maxTokens ?? '—'}  window ${report.contextWindow ?? '—'}`,
    `calls       ${report.callCount}  steps ${report.maxStep}  duration ${(report.durationMs / 1000).toFixed(1)}s`,
    `uncached    ${report.inputTokens.toLocaleString('en-US')}`,
    `cache read  ${report.cacheReadTokens.toLocaleString('en-US')}`,
    `output      ${report.outputTokens.toLocaleString('en-US')}`,
    `hit         ${pct}%  prefix-reuse median ${reuse}`,
    `zero-cache  ${report.zeroCacheCount} (after warmup ${report.zeroCacheAfterWarmup})  affinity-miss ${report.affinityMissCount ?? 0}`,
    `rewrite     compaction ${report.compactionCallCount ?? 0}  rebuild ${report.rebuildCallCount ?? 0}`,
    `uncached as cold ${breakdown.cold_start ?? 0}  rebuild ${breakdown.rebuild ?? 0}  compaction ${breakdown.compaction ?? 0}  delta ${breakdown.delta ?? 0}  affinity ${breakdown.affinity_miss ?? 0}`,
    `tools       ${report.toolErrors.length} errors  host-timeout ${causes.host_timeout}  cascade ${causes.cascade_abort}  invalid ${causes.invalid}  transport ${report.transportFaults.length}`,
    `verdict     ${report.healthy ? 'HEALTHY' : 'REGRESSION'} — ${report.verdict}`,
  ]
  return lines.join('\n')
}

// ── Directory mode: many sessions, one aggregate per provider ─────────────

const ZSTD_MAGIC = 0xfd2fb528
const SESSION_FILE = /^session.*\.jsonl(\.zstd)?$/
const IDLE_TIMEOUT_300 = /stream idle timeout/i
const PROXY_EXHAUSTED = /upstream failed \d+ times/
const PROXY_504 = /no output within/
const COLD_POOL_MS = 4_000
const TTFB_SLOW_MS = 120_000
const SILENCE_LONG_MS = 110_000
const TOP_FAILURES = 20
export const CALL_INDEX_BUCKETS = Object.freeze(['0-39', '40-79', '80-119', '120-159', '160-199', '200+'])

/**
 * DSH appends one zstd frame per write. `zstdDecompressSync(buf)` returns only
 * the first frame (209 B of a 1265-frame file), so walk the frames by consumed
 * input. A truncated tail frame (session still being written) is dropped.
 */
export function decodeSessionBuffer(buf: Buffer) {
  if (buf.length < 4 || buf.readUInt32LE(0) !== ZSTD_MAGIC) return buf.toString('utf8')
  const parts: Buffer[] = []
  let offset = 0
  while (offset < buf.length) {
    let out
    try {
      // @types/node lacks the `{ info: true }` overload.
      out = (zstdDecompressSync as any)(buf.subarray(offset), { info: true })
    } catch {
      break
    }
    if (!out.engine.bytesWritten) break
    parts.push(out.buffer)
    offset += out.engine.bytesWritten
  }
  return Buffer.concat(parts).toString('utf8')
}

/** Plain session.jsonl or DSH's multi-frame session*.jsonl.zstd. */
export function readSessionText(path: string) {
  return decodeSessionBuffer(readFileSync(path))
}

function sessionFiles(dir: string, since: number | null, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) sessionFiles(path, since, out)
    // mtime is the last append: an older file holds no event inside the window.
    else if (SESSION_FILE.test(name) && (since == null || stat.mtimeMs >= since)) out.push(path)
  }
  return out
}

/** Absolute frame times: `{ time }` chunks and `{ time0, dt[] }` chunk runs. */
function frameTimes(frames) {
  const out: number[] = []
  for (const frame of frames) {
    if (typeof frame?.time === 'number') {
      out.push(frame.time)
    } else if (typeof frame?.time0 === 'number') {
      let time = frame.time0
      out.push(time)
      for (const dt of Array.isArray(frame.dt) ? frame.dt : []) out.push(time += num(dt))
    }
  }
  return out.sort((a, b) => a - b)
}

/** Terminal `finish` failure of an attempt: nested in assistant/attempt, or a
 * top-level assistant/chunk in older sessions. */
function attemptFailure(event) {
  const frames = event.type === 'assistant/attempt' ? event.data?.stream : [event.data]
  for (const frame of Array.isArray(frames) ? frames : []) {
    const failure = frame?.chunk?.type === 'finish' ? frame.chunk.reason?.failure : null
    if (failure) return { code: failure.code ?? '?', message: String(failure.message ?? '') }
  }
  return null
}

/**
 * One session → calls, host retries, and failed attempts. An attempt starts at
 * `step/start` or `llm/retry-started`; its frames are the message's `stream`,
 * or (older sessions) the top-level chunk events since that start. A failed
 * attempt followed by `llm/retry` is a retry, otherwise it is terminal.
 */
function sessionRecords(events) {
  let provider = null
  let model = null
  const starts = new Map()
  const frames = new Map()
  const pending = new Map()
  const seen = new Set()
  const perProvider = new Map()
  const retries: any[] = []
  const failures: any[] = []
  for (const event of events) {
    const key = stepKey(event)
    const type = event.type
    const failure = type === 'assistant/attempt' || type === 'assistant/chunk' ? attemptFailure(event) : null
    if (failure) failures.push(pending.set(key, { ...failure, provider, model, time: event.time }).get(key))
    if (type === 'request/header') {
      const config = event.data?.header?.config ?? event.data?.config ?? {}
      if (config.provider) {
        provider = config.provider
        model = config.model ?? null
      }
    } else if (type === 'step/start' || type === 'llm/retry-started') {
      if (key) {
        starts.set(key, event.time)
        frames.set(key, [])
        pending.delete(key)
      }
    } else if (type === 'assistant/chunk' || (typeof type === 'string' && type.endsWith('-chunks'))) {
      if (key) frames.get(key)?.push(type === 'assistant/chunk' ? { time: event.time } : { time0: event.time0, dt: event.data?.dt })
    } else if (type === 'llm/retry') {
      const retried = event.data?.failure ?? {}
      retries.push({ provider: event.data?.provider ?? provider, model, code: retried.code ?? '?', message: String(retried.message ?? ''), time: event.time })
      if (pending.has(key)) pending.get(key).retried = true
    } else if (type === 'assistant/message') {
      const usage = usageOf(event)
      const callKey = key ?? `seq:${event.seq}`
      if (!usage || seen.has(callKey)) continue
      seen.add(callKey)
      const source = event.data?.message?.source ?? {}
      const callProvider = source.provider ?? provider ?? '(unknown)'
      const stream = Array.isArray(event.data?.stream) && event.data.stream.length ? event.data.stream : frames.get(key) ?? []
      const times = frameTimes(stream)
      const start = starts.get(key)
      let silenceMs: number | null = null
      for (let i = 1; i < times.length; i++) silenceMs = Math.max(silenceMs ?? 0, times[i] - times[i - 1])
      const list = perProvider.get(callProvider) ?? perProvider.set(callProvider, []).get(callProvider)
      list.push({
        provider: callProvider,
        model: source.model ?? model ?? '(unknown)',
        time: event.time ?? null,
        start: typeof start === 'number' ? start : null,
        index: list.length,
        ttfbMs: times.length && typeof start === 'number' && times[0] >= start ? times[0] - start : null,
        silenceMs,
        inputTokens: num(usage.inputTokens),
        outputTokens: num(usage.outputTokens),
        cacheReadTokens: num(usage.cacheReadTokens),
        cacheWriteTokens: num(usage.cacheWriteTokens),
      })
    }
  }
  const calls: any[] = []
  for (const list of perProvider.values()) calls.push(...annotateCacheCalls(list, events))
  return { calls, retries, failures: failures.filter((failure) => !failure.retried) }
}

/** Failure text safe to aggregate: no paths, ids, or tokens; digit runs folded. */
export function normalizeFailureMessage(message) {
  return String(message ?? '')
    .replace(/(?:~|\/(?:Users|home|Volumes|private|tmp|var))\/[^\s'"`)]*/g, '<path>')
    .replace(/\b[0-9a-f]{8,}(?:-[0-9a-f]{4,})*\b/gi, '<h>')
    .replace(/\b(?=[\w-]*\d)(?=[\w-]*[a-z])[\w-]{20,}/gi, '<t>')
    .replace(/\d{3,}/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function quantile(sorted: number[], fraction) {
  return sorted.length ? sorted[Math.floor(fraction * (sorted.length - 1))] : null
}

function sortedValues(calls, field) {
  return calls.map((call) => call[field]).filter((value) => typeof value === 'number').sort((a, b) => a - b)
}

function callIndexBucket(index) {
  if (index >= 200) return '200+'
  const low = Math.floor(index / 40) * 40
  return `${low}-${low + 39}`
}

function groupStats({ calls, retries, failures }) {
  const inputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0)
  const cacheReadTokens = calls.reduce((sum, call) => sum + call.cacheReadTokens, 0)
  const cacheWriteTokens = calls.reduce((sum, call) => sum + call.cacheWriteTokens, 0)

  const buckets = Object.fromEntries(CALL_INDEX_BUCKETS.map((name) => [name, { calls: 0, input: 0, read: 0 }]))
  for (const call of calls) {
    const bucket = buckets[callIndexBucket(call.index)]
    bucket.calls += 1
    bucket.input += call.inputTokens
    bucket.read += call.cacheReadTokens
  }

  const retryCodes = {}
  for (const retry of retries) retryCodes[retry.code] = (retryCodes[retry.code] ?? 0) + 1
  const failedAttempts = [...retries, ...failures]
  const matching = (pattern) => failedAttempts.filter((attempt) => pattern.test(attempt.message)).length

  const failureGroups = new Map()
  for (const failure of failures) {
    const message = normalizeFailureMessage(failure.message)
    const key = `${failure.code}\0${message}`
    const group = failureGroups.get(key) ?? failureGroups.set(key, { code: failure.code, message, n: 0 }).get(key)
    group.n += 1
  }

  const ttfb = sortedValues(calls, 'ttfbMs')
  const silence = sortedValues(calls, 'silenceMs')
  const idle = sortedValues(calls, 'poolIdleMs')
  const coldTtfb = sortedValues(calls.filter((call) => call.poolIdleMs > COLD_POOL_MS), 'ttfbMs')
  const warmTtfb = sortedValues(calls.filter((call) => call.poolIdleMs != null && call.poolIdleMs <= COLD_POOL_MS), 'ttfbMs')
  const coldP50 = quantile(coldTtfb, 0.5)
  const warmP50 = quantile(warmTtfb, 0.5)

  return {
    calls: calls.length,
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    weightedCacheHit: hitRate(cacheReadTokens, inputTokens),
    uncachedBreakdown: uncachedBreakdown(calls),
    hitByCallIndex: Object.fromEntries(Object.entries(buckets).map(([name, bucket]) => [
      name,
      { calls: bucket.calls, hit: hitRate(bucket.read, bucket.input) },
    ])),
    retries: retryCodes,
    idleTimeout300: matching(IDLE_TIMEOUT_300),
    proxyExhausted: matching(PROXY_EXHAUSTED),
    proxy504: matching(PROXY_504),
    terminalFailures: failures.length,
    failures: [...failureGroups.values()].sort((a, b) => b.n - a.n).slice(0, TOP_FAILURES),
    ttfbMs: {
      n: ttfb.length,
      p50: quantile(ttfb, 0.5),
      p95: quantile(ttfb, 0.95),
      p99: quantile(ttfb, 0.99),
      max: ttfb.at(-1) ?? null,
      over120s: ttfb.filter((value) => value > TTFB_SLOW_MS).length,
    },
    silenceMs: {
      p99: quantile(silence, 0.99),
      max: silence.at(-1) ?? null,
      over110s: silence.filter((value) => value > SILENCE_LONG_MS).length,
    },
    poolIdle: {
      n: idle.length,
      over4sShare: idle.length ? idle.filter((value) => value > COLD_POOL_MS).length / idle.length : null,
      p75Ms: quantile(idle, 0.75),
    },
    coldPenaltyMs: coldP50 != null && warmP50 != null ? coldP50 - warmP50 : null,
  }
}

/**
 * Pool idle = this request's start minus the latest response end on the same
 * provider at or before it, across sessions: the connection pool is per
 * process, so that is how long the most recently freed socket sat idle.
 */
function annotatePoolIdle(calls) {
  const ends = calls.map((call) => call.time).filter((time) => typeof time === 'number').sort((a, b) => a - b)
  for (const call of calls) {
    if (call.start == null) continue
    let low = 0
    let high = ends.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (ends[mid] <= call.start) low = mid + 1
      else high = mid
    }
    if (low) call.poolIdleMs = call.start - ends[low - 1]
  }
}

function toIso(ms) {
  return ms == null ? null : new Date(ms).toISOString()
}

/**
 * Aggregate every session under `root` whose events fall in [since, until).
 * The same session may exist as session.jsonl.zstd and session.v3/v4.jsonl.zstd;
 * only the highest `session.version` copy of each `session.id` counts.
 */
export function analyzeSessionDir(root: string, { since = null, until = null }: { since?: number | null, until?: number | null } = {}) {
  const inWindow = (time) => typeof time === 'number' && (since == null || time >= since) && (until == null || time < until)
  const sessions = new Map()
  let files = 0
  let unreadable = 0
  for (const path of sessionFiles(root, since)) {
    files += 1
    let events
    try {
      events = parseSessionEvents(readSessionText(path))
    } catch {
      unreadable += 1
      continue
    }
    const head = events.find((event) => event.type === 'session')
    const id = head?.id ?? path
    const version = num(head?.version) || Number(/\.v(\d+)\./.exec(path)?.[1] ?? 1)
    if ((sessions.get(id)?.version ?? -1) >= version) continue
    sessions.set(id, { version, ...sessionRecords(events) })
  }

  const providers = new Map()
  const models = new Map()
  const add = (kind, record) => {
    for (const [map, name] of [[providers, record.provider ?? '(unknown)'], [models, `${record.provider ?? '(unknown)'}/${record.model ?? '(unknown)'}`]]) {
      const group = map.get(name) ?? map.set(name, { calls: [], retries: [], failures: [] }).get(name)
      group[kind].push(record)
    }
  }
  for (const session of sessions.values()) {
    for (const kind of ['calls', 'retries', 'failures']) {
      for (const record of session[kind]) if (inWindow(record.time)) add(kind, record)
    }
  }
  for (const group of providers.values()) annotatePoolIdle(group.calls)

  const byCalls = (map) => Object.fromEntries([...map.entries()]
    .map(([name, group]) => [name, groupStats(group)])
    .sort((a, b) => (b[1].inputTokens + b[1].cacheReadTokens) - (a[1].inputTokens + a[1].cacheReadTokens)))
  return {
    window: { since: toIso(since), until: toIso(until) },
    files,
    sessions: sessions.size,
    duplicateFiles: files - unreadable - sessions.size,
    unreadableFiles: unreadable,
    providers: byCalls(providers),
    models: byCalls(models),
  }
}

const pct = (value) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`)
const secs = (ms) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`)

export function formatAggregate(report) {
  const lines = [
    `window      ${report.window.since ?? '—'} → ${report.window.until ?? '—'}`,
    `sessions    ${report.sessions} (${report.files} files, ${report.duplicateFiles} duplicate, ${report.unreadableFiles} unreadable)`,
    '',
    'provider                    calls  prompt     hit  ttfb p50/p95/p99/max       >120s  silence p99/max  >110s  idle>4s  idle p75  cold+',
  ]
  for (const [name, s] of Object.entries<any>(report.providers)) {
    lines.push([
      name.padEnd(26),
      String(s.calls).padStart(6),
      `${((s.inputTokens + s.cacheReadTokens) / 1e6).toFixed(0)}M`.padStart(7),
      pct(s.weightedCacheHit).padStart(7),
      `${secs(s.ttfbMs.p50)}/${secs(s.ttfbMs.p95)}/${secs(s.ttfbMs.p99)}/${secs(s.ttfbMs.max)}`.padStart(26),
      String(s.ttfbMs.over120s).padStart(6),
      `${secs(s.silenceMs.p99)}/${secs(s.silenceMs.max)}`.padStart(16),
      String(s.silenceMs.over110s).padStart(6),
      pct(s.poolIdle.over4sShare).padStart(8),
      secs(s.poolIdle.p75Ms).padStart(9),
      secs(s.coldPenaltyMs).padStart(6),
    ].join(' '))
  }
  lines.push('', 'faults')
  for (const [name, s] of Object.entries<any>(report.providers)) {
    const retries = Object.entries(s.retries).map(([code, n]) => `${code} ${n}`).join(', ')
    if (!retries && !s.terminalFailures) continue
    lines.push(`  ${name}: retries ${retries || '0'}; idle300 ${s.idleTimeout300}  exhausted ${s.proxyExhausted}  504 ${s.proxy504}  terminal ${s.terminalFailures}`)
    for (const failure of s.failures.slice(0, 5)) lines.push(`      ${String(failure.n).padStart(3)}× ${failure.code}: ${failure.message}`)
  }
  lines.push('', `hit by call index  ${CALL_INDEX_BUCKETS.join(' / ')}`)
  for (const [name, s] of Object.entries<any>(report.providers)) {
    lines.push(`  ${name.padEnd(26)} ${CALL_INDEX_BUCKETS.map((bucket) => {
      const b = s.hitByCallIndex[bucket]
      return b.calls ? `${pct(b.hit)} (${b.calls})` : '—'
    }).join(' / ')}`)
  }
  lines.push('', 'models')
  for (const [name, s] of Object.entries<any>(report.models)) {
    lines.push(`  ${name.padEnd(48)} ${String(s.calls).padStart(6)} ${pct(s.weightedCacheHit).padStart(7)}  ttfb p50 ${secs(s.ttfbMs.p50)}`)
  }
  return lines.join('\n')
}

const retryTotal = (s) => Object.values<number>(s.retries).reduce((sum, n) => sum + n, 0)

const COMPARED = {
  hit: (s) => s.weightedCacheHit,
  retriesPer1k: (s) => per1k(retryTotal(s), s),
  idleTimeout300Per1k: (s) => per1k(s.idleTimeout300, s),
  proxyExhaustedPer1k: (s) => per1k(s.proxyExhausted, s),
  proxy504Per1k: (s) => per1k(s.proxy504, s),
  terminalFailuresPer1k: (s) => per1k(s.terminalFailures, s),
  ttfbOver120sPer1k: (s) => per1k(s.ttfbMs.over120s, s),
  silenceOver110sPer1k: (s) => per1k(s.silenceMs.over110s, s),
  ttfbP50Ms: (s) => s.ttfbMs.p50,
  ttfbP95Ms: (s) => s.ttfbMs.p95,
  poolIdleOver4sShare: (s) => s.poolIdle.over4sShare,
  coldPenaltyMs: (s) => s.coldPenaltyMs,
}

function per1k(count, s) {
  return s.calls ? (1000 * count) / s.calls : null
}

/** Per-provider deltas `next − base`; counts normalized per 1k calls. */
export function compareReports(base, next) {
  const names = [...new Set([...Object.keys(next.providers), ...Object.keys(base.providers)])]
  const providers = {}
  for (const name of names) {
    const a = base.providers[name]
    const b = next.providers[name]
    const row: Record<string, any> = { calls: { base: a?.calls ?? 0, next: b?.calls ?? 0 } }
    for (const [metric, read] of Object.entries(COMPARED)) {
      const x = a ? read(a) : null
      const y = b ? read(b) : null
      row[metric] = { base: x, next: y, delta: x == null || y == null ? null : y - x }
    }
    providers[name] = row
  }
  return { base: base.window, next: next.window, providers }
}

export function formatComparison(diff) {
  const value = (metric, v) => {
    if (v == null) return '—'
    if (metric === 'hit' || metric === 'poolIdleOver4sShare') return `${(v * 100).toFixed(1)}`
    if (metric.endsWith('Ms')) return `${(v / 1000).toFixed(1)}s`
    return v.toFixed(1)
  }
  const lines = [`base ${diff.base.since ?? '—'} → ${diff.base.until ?? '—'}  vs  next ${diff.next.since ?? '—'} → ${diff.next.until ?? '—'}`]
  for (const [name, row] of Object.entries<any>(diff.providers)) {
    lines.push('', `${name}  calls ${row.calls.base} → ${row.calls.next}`)
    for (const metric of Object.keys(COMPARED)) {
      const { base, next, delta } = row[metric]
      if (base == null && next == null) continue
      const sign = delta != null && delta > 0 ? '+' : ''
      lines.push(`  ${metric.padEnd(24)} ${value(metric, base).padStart(8)} → ${value(metric, next).padStart(8)}  (${delta == null ? '—' : sign + value(metric, delta)})`)
    }
  }
  return lines.join('\n')
}
