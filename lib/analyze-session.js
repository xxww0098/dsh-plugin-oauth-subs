/**
 * Parse a DeepSeek Harness session.jsonl (or a JSON array of events) and
 * report Codex / Grok cache affinity, token spend, and transport faults.
 *
 * DSH writes usage on both `assistant/message` and a later `assistant/chunk`
 * of type `usage`. Counts are taken from `assistant/message` only, keyed by
 * turn+step, so a 42-step turn is not billed twice.
 */

const STREAM_ENDED = /stream ended before a terminal response event/i
const FETCH_FAILED = /fetch failed/i
const TRANSPORT = /\bTRANSPORT\b/

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

function collectToolErrors(events) {
  const errors = []
  for (const event of events) {
    if (event.type === 'tool/code-dispatch' && event.data?.isError) {
      const content = event.data.content
      const text = Array.isArray(content)
        ? content.map((part) => part?.text ?? '').join('\n')
        : String(content ?? '')
      errors.push({
        kind: 'tool',
        name: event.data.name ?? 'unknown',
        message: text.slice(0, 240),
        time: event.time ?? null,
      })
    }
  }
  return errors
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

function hitRate(cache, uncached) {
  const total = cache + uncached
  return total === 0 ? 0 : cache / total
}

/**
 * @param {string} text
 * @returns {object}
 */
export function analyzeSession(text) {
  const events = parseSessionEvents(text)
  const session = events.find((event) => event.type === 'session') ?? {}
  const config = headerConfig(events)
  const calls = collectCalls(events)
  const inputTokens = calls.reduce((sum, call) => sum + call.inputTokens, 0)
  const outputTokens = calls.reduce((sum, call) => sum + call.outputTokens, 0)
  const cacheReadTokens = calls.reduce((sum, call) => sum + call.cacheReadTokens, 0)
  const cacheWriteTokens = calls.reduce((sum, call) => sum + call.cacheWriteTokens, 0)
  const zeroCache = calls.filter((call) => call.cacheReadTokens === 0)
  const zeroAfterWarmup = zeroCache.filter((call) => (call.step ?? 1) > 1)
  const toolErrors = collectToolErrors(events)
  const transportFaults = collectTransportFaults(events)
  const times = events.map((event) => event.time).filter((time) => typeof time === 'number')
  const callTimes = calls.map((call) => call.time).filter((time) => typeof time === 'number')
  const weightedHit = hitRate(cacheReadTokens, inputTokens)
  const healthy = weightedHit >= 0.8 && zeroAfterWarmup.length === 0 && transportFaults.length === 0

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
    zeroCacheCount: zeroCache.length,
    zeroCacheAfterWarmup: zeroAfterWarmup.length,
    toolErrors,
    transportFaults,
    durationMs: callTimes.length >= 2 ? callTimes[callTimes.length - 1] - callTimes[0] : 0,
    wallMs: times.length >= 2 ? Math.max(...times) - Math.min(...times) : 0,
    healthy,
    verdict: healthy
      ? 'cache affinity looks healthy'
      : zeroAfterWarmup.length
        ? 'cache affinity regression: later calls missed the shard'
        : transportFaults.length
          ? 'transport faults in the session'
          : 'cache hit below 80%',
  }
}

export function formatReport(report) {
  const pct = (report.weightedCacheHit * 100).toFixed(1)
  const lines = [
    `session     ${report.sessionId ?? '(unknown)'}`,
    `provider    ${report.provider ?? '—'}  model ${report.model ?? '—'}`,
    `effort      ${report.reasoningEffort ?? '—'}  maxTokens ${report.maxTokens ?? '—'}  window ${report.contextWindow ?? '—'}`,
    `calls       ${report.callCount}  steps ${report.maxStep}  duration ${(report.durationMs / 1000).toFixed(1)}s`,
    `uncached    ${report.inputTokens.toLocaleString('en-US')}`,
    `cache read  ${report.cacheReadTokens.toLocaleString('en-US')}`,
    `output      ${report.outputTokens.toLocaleString('en-US')}`,
    `hit         ${pct}%  zero-cache ${report.zeroCacheCount} (after warmup ${report.zeroCacheAfterWarmup})`,
    `tools       ${report.toolErrors.length} errors  transport ${report.transportFaults.length}`,
    `verdict     ${report.healthy ? 'HEALTHY' : 'REGRESSION'} — ${report.verdict}`,
  ]
  return lines.join('\n')
}
