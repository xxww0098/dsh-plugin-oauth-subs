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

const STREAM_ENDED = /stream ended before a terminal response event/i
const FETCH_FAILED = /fetch failed/i
const TRANSPORT = /\bTRANSPORT\b/

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
  const events = []
  const lines = trimmed.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      events.push(JSON.parse(line))
    } catch (error) {
      throw new Error(`invalid JSONL on line ${i + 1}: ${error.message}`)
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
  const errors = []
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

function collectTransportFaults(events) {
  const faults = []
  for (const event of events) {
    if (event.type === 'assistant/chunk' || event.type === 'tool-call-chunks' || event.type === 'reasoning-chunks') {
      continue
    }
    const haystack = [
      event.data?.error,
      event.data?.message,
      event.data?.text,
      event.data?.detail,
    ].filter(Boolean).map((value) => (typeof value === 'string' ? value : JSON.stringify(value))).join('\n')
    if (!haystack) continue
    if (STREAM_ENDED.test(haystack) || FETCH_FAILED.test(haystack) || TRANSPORT.test(haystack)) {
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
  const compaction = []
  const rebuild = []
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
