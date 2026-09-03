/**
 * OpenAI chat/completions ↔ AWS CodeWhisperer GenerateAssistantResponse.
 *
 * Wire shape matches Kiro IDE / kiro-proxy PROTOCOL.md:
 *   POST https://q.<region>.amazonaws.com/
 *   X-Amz-Target: AmazonCodeWhispererStreamingService.GenerateAssistantResponse
 *   Content-Type: application/x-amz-json-1.0
 *   Body: conversationState + profileArn
 * Response is application/vnd.amazon.eventstream.
 */

import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'
import {
  KIRO_CONTEXT_WINDOW,
  KIRO_DEFAULT_REGION,
  KIRO_MODELS,
  kiroUsageHeaders,
  kiroUsageHost,
} from './index.js'
import { kiroConversationId, pinKiroSystemPrefix } from './cache.js'

export { KIRO_STABLE_SESSION, kiroConversationId, pinKiroSystemPrefix, resetKiroSystemPins } from './cache.js'
/** Official kiro.rs ack after a parked system user turn. Byte-stable; never Date.now(). */
export const KIRO_SYSTEM_ACK = 'I will follow these instructions.'
export const KIRO_CHAT_ORIGIN = 'AI_EDITOR'
export const KIRO_AMZ_TARGET = 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse'
export const KIRO_EVENTSTREAM_TYPE = 'application/vnd.amazon.eventstream'
export const KIRO_AMZ_JSON_TYPE = 'application/x-amz-json-1.0'

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const KIRO_PAYLOAD_WRAPPERS = Object.freeze([
  'assistantResponseEvent',
  'metadataEvent',
  'messageMetadataEvent',
  'contextUsageEvent',
  'meteringEvent',
  'toolUseEvent',
  'thinkingEvent',
  'reasoningEvent',
])

/** Kiro accepts 1–64 of `[A-Za-z0-9_.:-]`. Piped OpenAI Responses ids 400. */
export const KIRO_TOOL_USE_ID_PATTERN = /^[a-zA-Z0-9_.:-]{1,64}$/

export const KIRO_REASON_CODES = Object.freeze({
  CONTENT_LENGTH_EXCEEDS_THRESHOLD: 'CONTENT_LENGTH_EXCEEDS_THRESHOLD',
  INPUT_TOO_LONG: 'Input is too long',
  MONTHLY_REQUEST_COUNT: 'MONTHLY_REQUEST_COUNT',
  INSUFFICIENT_MODEL_CAPACITY: 'INSUFFICIENT_MODEL_CAPACITY',
  USER_REQUEST_RATE_EXCEEDED: 'USER_REQUEST_RATE_EXCEEDED',
  REQUEST_BODY_INVALID: 'REQUEST_BODY_INVALID',
})

/** Live AWS often wraps the payload as `{ [eventType]: { … } }`. */
export function unwrapKiroEventPayload(payload, type) {
  if (!isPlainObject(payload)) return {}
  if (type && isPlainObject(payload[type])) return payload[type]
  for (const key of KIRO_PAYLOAD_WRAPPERS) {
    if (isPlainObject(payload[key])) return payload[key]
  }
  return payload
}

export function kiroContextWindowOf(model) {
  const id = typeof model === 'string' ? model.trim() : ''
  const row = KIRO_MODELS.find((item) => item.id === id)
  return row?.contextWindow || KIRO_CONTEXT_WINDOW
}

function kiroOsName() {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return process.platform
}

export function kiroChatUrl(session = {}) {
  return `https://${kiroUsageHost(session.apiRegion || session.region || KIRO_DEFAULT_REGION)}/`
}

/** Quota keeps accept: application/json. Chat must ask for the event stream. */
export function kiroChatHeaders(session) {
  return {
    ...kiroUsageHeaders(session),
    accept: KIRO_EVENTSTREAM_TYPE,
    'content-type': KIRO_AMZ_JSON_TYPE,
    'x-amz-target': KIRO_AMZ_TARGET,
    'x-amzn-kiro-agent-mode': 'vibe',
  }
}

function flattenContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content == null ? '' : String(content)
  return content.map((item) => {
    if (typeof item === 'string') return item
    if (item?.type === 'text' && item.text) return item.text
    return ''
  }).filter(Boolean).join('\n')
}

function tryJson(value) {
  if (isPlainObject(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? parsed : { result: parsed }
  } catch {
    return { result: value }
  }
}

function openaiToolsToKiro(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined
  const mapped = tools.flatMap((tool) => {
    const fn = tool?.function ?? tool
    const name = trimmed(fn?.name)
    if (!name) return []
    return [{
      toolSpecification: {
        name,
        ...(trimmed(fn.description) ? { description: fn.description } : {}),
        inputSchema: { json: fn.parameters ?? { type: 'object', properties: {} } },
      },
    }]
  })
  return mapped.length ? mapped : undefined
}

/**
 * IDs Kiro already accepts stay (after the existing call_/toolu_/tool_
 * → tooluse_ prefix). Compound OpenAI Responses ids (`call_…|fc_…`,
 * over 64 chars) get a stable sha256 remap so the matching tool_result
 * uses the same wire id. Same map both ways — never Date.now().
 */
export function normalizeToolUseId(id) {
  const raw = trimmed(id)
  if (!raw) return undefined
  if (raw.startsWith('tooluse_') && KIRO_TOOL_USE_ID_PATTERN.test(raw)) return raw
  const prefixed = raw.startsWith('tooluse_') ? raw : `tooluse_${raw.replace(/^(toolu_|call_|tool_)/, '')}`
  if (KIRO_TOOL_USE_ID_PATTERN.test(prefixed)) return prefixed
  const digest = createHash('sha256').update(raw).digest('base64url').slice(0, 32)
  return `tooluse_${digest}`
}

/**
 * Concurrent tools can interleave: assistant(A) / user text / assistant(B)
 * / toolResult(A). AWS 400s a tool_use without an immediately following
 * tool_result. Pure reorder by id — no fabricate, no drop of a result
 * whose call exists. Well-formed transcripts stay unchanged.
 */
export function relocateDisplacedToolResults(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages ?? []
  const pending = [...messages]
  const out = []
  while (pending.length) {
    const message = pending.shift()
    out.push(message)
    if (message?.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue
    for (const call of message.tool_calls) {
      const id = trimmed(call?.id)
      if (!id) continue
      const at = pending.findIndex((row) => row?.role === 'tool' && trimmed(row.tool_call_id) === id)
      if (at >= 0) out.push(...pending.splice(at, 1))
    }
  }
  return out
}

function assistantHistoryMessage(message) {
  const content = flattenContent(message?.content)
  const row = { content }
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    row.toolUses = message.tool_calls.flatMap((call) => {
      const name = trimmed(call?.function?.name ?? call?.name)
      const toolUseId = normalizeToolUseId(call?.id)
      if (!name || !toolUseId) return []
      const args = call.function?.arguments ?? call.input
      return [{
        toolUseId,
        name,
        input: typeof args === 'string' ? tryJson(args) : (isPlainObject(args) ? args : {}),
      }]
    })
  }
  if (!row.content && !row.toolUses) row.content = '.'
  return { assistantResponseMessage: row }
}

function userHistoryMessage(content, { modelId, origin, toolResults } = {}) {
  const context = {}
  if (toolResults?.length) context.toolResults = toolResults
  return {
    userInputMessage: {
      content: content || (toolResults?.length ? '' : '.'),
      userInputMessageContext: context,
      origin: origin || KIRO_CHAT_ORIGIN,
      modelId,
    },
  }
}

function pushKiroSystemPair(history, text, { modelId, origin } = {}) {
  if (!text) return
  history.push(userHistoryMessage(text, { modelId, origin }))
  history.push({ assistantResponseMessage: { content: KIRO_SYSTEM_ACK } })
}

function lastHistoryHasToolUses(history) {
  const last = history.at(-1)?.assistantResponseMessage
  return Boolean(last?.toolUses?.length)
}

/**
 * Extra DSH snapshots stay a suffix user+ack pair. On a tool-result
 * turn the last history item is the assistant with `toolUses` and
 * `toolResults` sit on current — never insert the ack between them
 * (AWS 400: tool_result without a matching previous tool_use).
 */
function parkKiroSystemExtra(history, extra, { modelId, origin, currentHasToolResults } = {}) {
  if (!extra) return
  if (currentHasToolResults && lastHistoryHasToolUses(history)) {
    const pair = []
    pushKiroSystemPair(pair, extra, { modelId, origin })
    history.splice(history.length - 1, 0, ...pair)
    return
  }
  pushKiroSystemPair(history, extra, { modelId, origin })
}

/**
 * DSH `developer` (and any other unknown role) → system, same as GLM.
 * Official wire has no system field (kiro.rs / kiro-proxy PROTOCOL.md):
 * park system as the first history user + canned assistant pair so the
 * current turn stays just the new user text. conversationId is the DSH
 * pin plus model — never Date.now().
 */
export function openaiToKiro(payload, { conversationId, profileArn, origin = KIRO_CHAT_ORIGIN } = {}) {
  const modelId = trimmed(payload?.model)
  if (!modelId) throw new Error('kiro generateAssistantResponse requires a model')
  const messages = relocateDisplacedToolResults(Array.isArray(payload?.messages) ? payload.messages : [])
  const history = []
  const systemParts = []
  let pendingUser
  let pendingAssistant
  let pendingToolResults = []

  const flushUser = () => {
    if (!pendingUser && !pendingToolResults.length) return
    history.push(userHistoryMessage(pendingUser || '', {
      modelId,
      origin,
      toolResults: pendingToolResults.length ? pendingToolResults : undefined,
    }))
    pendingUser = undefined
    pendingToolResults = []
  }

  const flushAssistant = () => {
    if (!pendingAssistant) return
    history.push(pendingAssistant)
    pendingAssistant = undefined
  }

  for (const message of messages) {
    const role = message?.role
    if (role === 'system' || role === 'developer' || (typeof role === 'string' && role !== 'user' && role !== 'assistant' && role !== 'tool')) {
      const text = flattenContent(message?.content)
      if (text) systemParts.push(text)
      continue
    }
    if (role === 'user') {
      flushAssistant()
      flushUser()
      pendingUser = flattenContent(message?.content)
      continue
    }
    if (role === 'assistant') {
      // Previous tool_use must hit history before the tool_results that
      // belong to it. flushUser-first inverted that pair on the second
      // tool round (live 400: unexpected tool_use_id). Opening user text
      // still flushes first — flushAssistant is a no-op then.
      flushAssistant()
      flushUser()
      pendingAssistant = assistantHistoryMessage(message)
      continue
    }
    if (role === 'tool') {
      const toolUseId = normalizeToolUseId(message?.tool_call_id)
      if (!toolUseId) continue
      pendingToolResults.push({
        toolUseId,
        content: [{ json: tryJson(message?.content) }],
        status: 'success',
      })
    }
  }

  flushAssistant()

  const resolvedId = kiroConversationId(payload, conversationId)
  const { pinned, extra } = pinKiroSystemPrefix(resolvedId, systemParts.join('\n'))
  const parked = []
  pushKiroSystemPair(parked, pinned, { modelId, origin })
  const fullHistory = parked.concat(history)
  parkKiroSystemExtra(fullHistory, extra, {
    modelId,
    origin,
    currentHasToolResults: pendingToolResults.length > 0,
  })

  const userContext = { envState: { operatingSystem: kiroOsName() } }
  const tools = openaiToolsToKiro(payload?.tools)
  if (tools) userContext.tools = tools
  if (pendingToolResults.length) userContext.toolResults = pendingToolResults

  let content = pendingUser ?? ''
  if (!content && !pendingToolResults.length) {
    content = trimmed(payload?.input) || '.'
  }

  const body = {
    conversationState: {
      conversationId: resolvedId,
      history: fullHistory,
      currentMessage: {
        userInputMessage: {
          content,
          userInputMessageContext: userContext,
          origin,
          modelId,
        },
      },
      chatTriggerType: 'MANUAL',
      agentTaskType: 'vibe',
    },
  }
  const arn = trimmed(profileArn)
  if (arn) body.profileArn = arn
  return body
}

function parseEventHeaders(buffer) {
  const headers = {}
  let offset = 0
  while (offset < buffer.length) {
    const nameLen = buffer[offset]
    offset += 1
    if (offset + nameLen + 1 > buffer.length) break
    const name = buffer.subarray(offset, offset + nameLen).toString('utf8')
    offset += nameLen
    const type = buffer[offset]
    offset += 1
    if (type === 0) {
      headers[name] = true
      continue
    }
    if (type === 1) {
      headers[name] = false
      continue
    }
    if (type === 2) {
      if (offset + 1 > buffer.length) break
      headers[name] = buffer.readInt8(offset)
      offset += 1
      continue
    }
    if (type === 3) {
      if (offset + 2 > buffer.length) break
      headers[name] = buffer.readInt16BE(offset)
      offset += 2
      continue
    }
    if (type === 4) {
      if (offset + 4 > buffer.length) break
      headers[name] = buffer.readInt32BE(offset)
      offset += 4
      continue
    }
    if (type === 5 || type === 8) {
      if (offset + 8 > buffer.length) break
      headers[name] = buffer.readBigInt64BE(offset)
      offset += 8
      continue
    }
    if (type === 6 || type === 7) {
      if (offset + 2 > buffer.length) break
      const valueLen = buffer.readUInt16BE(offset)
      offset += 2
      if (offset + valueLen > buffer.length) break
      const raw = buffer.subarray(offset, offset + valueLen)
      headers[name] = type === 7 ? raw.toString('utf8') : raw
      offset += valueLen
      continue
    }
    if (type === 9) {
      if (offset + 16 > buffer.length) break
      headers[name] = buffer.subarray(offset, offset + 16)
      offset += 16
      continue
    }
    break
  }
  return headers
}

function decodePayload(text) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export class KiroEventStreamParser {
  constructor() {
    this.buf = Buffer.alloc(0)
  }

  feed(chunk) {
    this.buf = Buffer.concat([this.buf, Buffer.from(chunk ?? '')])
    const events = []
    while (this.buf.length >= 12) {
      const totalLen = this.buf.readUInt32BE(0)
      if (totalLen < 16 || totalLen > 16 * 1024 * 1024) break
      if (this.buf.length < totalLen) break
      const headersLen = this.buf.readUInt32BE(4)
      const headerEnd = 12 + headersLen
      const payloadEnd = totalLen - 4
      if (headerEnd > payloadEnd) {
        this.buf = this.buf.subarray(totalLen)
        continue
      }
      const headers = parseEventHeaders(this.buf.subarray(12, headerEnd))
      const payload = decodePayload(this.buf.subarray(headerEnd, payloadEnd).toString('utf8'))
      events.push({
        type: headers[':event-type'] || headers[':exception-type'] || headers[':message-type'],
        messageType: headers[':message-type'],
        payload,
      })
      this.buf = this.buf.subarray(totalLen)
    }
    return events
  }
}

export function parseKiroEventStream(buffer) {
  const buf = Buffer.from(buffer ?? '')
  if (buf.length && (buf[0] === 0x7b || buf[0] === 0x5b)) {
    try {
      return [{ type: 'exception', messageType: 'exception', payload: JSON.parse(buf.toString('utf8')) }]
    } catch {
      // fall through to frame parse
    }
  }
  return new KiroEventStreamParser().feed(buf)
}

export function mergeKiroText(previous, chunk) {
  if (!chunk) return { text: previous, delta: '' }
  if (chunk.startsWith(previous)) return { text: chunk, delta: chunk.slice(previous.length) }
  return { text: previous + chunk, delta: chunk }
}

export function thinkingTextFromPayload(type, data) {
  if (!isPlainObject(data)) return undefined
  const typed = typeof type === 'string' && /thinking|reasoning/i.test(type)
    ? (trimmed(data.text) || trimmed(data.thinking) || trimmed(data.content) || trimmed(data.reasoningContent))
    : undefined
  if (typed) return typed
  // Native thinking events carry `text` / `signature`, not assistant `content`.
  if (typeof data.text === 'string' && data.content === undefined && !data.toolUseId && !data.name) {
    return data.text
  }
  return trimmed(data.thinking) || trimmed(data.reasoningContent)
}

export function collectKiroEvents(events) {
  let text = ''
  let thinking = ''
  const toolCalls = new Map()
  let usage
  let contextPercentage
  let error
  for (const event of events ?? []) {
    const type = event?.type
    const data = unwrapKiroEventPayload(event?.payload, type)
    const thought = thinkingTextFromPayload(type, data)
    if (thought) {
      thinking = mergeKiroText(thinking, thought).text
      continue
    }
    if (type === 'assistantResponseEvent' || typeof data.content === 'string') {
      const chunk = typeof data.content === 'string' ? data.content : ''
      if (chunk) text = mergeKiroText(text, chunk).text
    }
    if (type === 'toolUseEvent') {
      const id = trimmed(data.toolUseId ?? data.tool_use_id)
      if (id) {
        if (!toolCalls.has(id)) toolCalls.set(id, { id, name: trimmed(data.name) ?? 'tool', parts: [] })
        const row = toolCalls.get(id)
        if (trimmed(data.name)) row.name = data.name
        if (!data.stop && data.input !== undefined && data.input !== '') {
          row.parts.push(typeof data.input === 'string' ? data.input : JSON.stringify(data.input))
        }
      }
    }
    const nextUsage = usageFromPayload(data)
    if (hasRealKiroUsage(nextUsage)) usage = nextUsage
    const percent = contextPercentFromPayload(data)
    if (percent !== undefined) contextPercentage = percent
    if (type === 'exception' || type === 'invalidStateEvent' || event?.messageType === 'exception') {
      error = trimmed(data.message) || trimmed(data.reason) || trimmed(data.Message) || JSON.stringify(data)
    }
  }
  return {
    text,
    thinking,
    toolCalls: [...toolCalls.values()].map((row) => ({
      id: row.id,
      type: 'function',
      function: { name: row.name, arguments: row.parts.join('') || '{}' },
    })),
    usage,
    contextPercentage,
    error,
  }
}

export function kiroToOpenai(eventsOrBody, { model, id = `chatcmpl-${Date.now()}` } = {}) {
  const events = Array.isArray(eventsOrBody) ? eventsOrBody : parseKiroEventStream(eventsOrBody)
  const collected = collectKiroEvents(events)
  const message = { role: 'assistant', content: collected.text || null }
  if (collected.thinking) message.reasoning_content = collected.thinking
  if (collected.toolCalls.length) message.tool_calls = collected.toolCalls
  return {
    id,
    object: 'chat.completion',
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: collected.toolCalls.length ? 'tool_calls' : 'stop',
    }],
    usage: resolveKiroUsage(collected, model),
    ...(collected.error ? { error: { message: collected.error } } : {}),
  }
}

function numberField(object, ...keys) {
  for (const key of keys) {
    const value = object[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value)
      if (Number.isFinite(n)) return n
    }
  }
  return undefined
}

export function mapKiroUsage(tokens) {
  if (!isPlainObject(tokens)) return undefined
  const cacheRead = numberField(tokens, 'cacheReadInputTokens', 'cache_read_input_tokens')
  const cacheWrite = numberField(tokens, 'cacheWriteInputTokens', 'cache_write_input_tokens') ?? 0
  const uncached = numberField(tokens, 'uncachedInputTokens', 'uncached_input_tokens') ?? 0
  const output = numberField(tokens, 'outputTokens', 'output_tokens') ?? 0
  const cached = cacheRead ?? 0
  const prompt = uncached + cached + cacheWrite
  const usage = {
    prompt_tokens: prompt,
    completion_tokens: output,
    total_tokens: numberField(tokens, 'totalTokens', 'total_tokens') ?? (prompt + output),
  }
  if (cacheRead !== undefined) usage.prompt_tokens_details = { cached_tokens: cacheRead }
  return usage
}

function usageFromPayload(data) {
  if (!isPlainObject(data)) return undefined
  const nested = isPlainObject(data.tokenUsage)
    ? data.tokenUsage
    : isPlainObject(data.token_usage) ? data.token_usage : undefined
  if (nested) return mapKiroUsage(nested)
  if (
    numberField(data, 'uncachedInputTokens', 'uncached_input_tokens') !== undefined
    || numberField(data, 'cacheReadInputTokens', 'cache_read_input_tokens') !== undefined
    || numberField(data, 'outputTokens', 'output_tokens') !== undefined
    || numberField(data, 'totalTokens', 'total_tokens') !== undefined
  ) {
    return mapKiroUsage(data)
  }
  return undefined
}

function contextPercentFromPayload(data) {
  if (!isPlainObject(data)) return undefined
  return numberField(data, 'contextUsagePercentage', 'context_usage_percentage')
}

function hasRealKiroUsage(usage) {
  if (!isPlainObject(usage)) return false
  return usage.prompt_tokens > 0
    || usage.completion_tokens > 0
    || usage.total_tokens > 0
    || usage.prompt_tokens_details?.cached_tokens > 0
}

/** Live CodeWhisperer rarely sends metadataEvent. Fall back to contextUsageEvent % × window. */
export function kiroUsageFromContext(percent, model, text = '') {
  const pct = typeof percent === 'number' ? percent : Number(percent)
  if (!Number.isFinite(pct) || pct <= 0) return undefined
  const prompt = Math.max(0, Math.round(kiroContextWindowOf(model) * pct / 100))
  if (prompt <= 0) return undefined
  const completion = text ? Math.max(1, Math.ceil(String(text).length / 4)) : 0
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  }
}

export function resolveKiroUsage(collected, model) {
  if (hasRealKiroUsage(collected?.usage)) return collected.usage
  return kiroUsageFromContext(collected?.contextPercentage, model, collected?.text)
    ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
}

export function kiroToOpenaiChunk(delta, { model, id, done = false, finishReason = null, usage } = {}) {
  const chunk = {
    id,
    object: 'chat.completion.chunk',
    model,
    choices: [{
      index: 0,
      delta: delta ?? {},
      finish_reason: done ? (finishReason ?? 'stop') : null,
    }],
  }
  if (usage) chunk.usage = usage
  return chunk
}

function hopErrorBlob(parsed, text) {
  const raw = isPlainObject(parsed) ? parsed : {}
  return [typeof text === 'string' ? text : '', raw.reason, raw.message, raw.Message, raw.error?.message, raw.code]
    .filter((part) => typeof part === 'string' && part)
    .join('\n')
}

/**
 * Classify hop errors so DSH does not hammer a hard monthly quota as a
 * generic 429, or treat size / capacity as AUTH. 401/403 still become
 * 400 (subscription key stays valid) unless TokenManager already refreshed.
 */
export function classifyKiroHopError(status, parsed, text, { retryAfter } = {}) {
  const blob = hopErrorBlob(parsed, text)
  const headerRetry = retryAfter != null && String(retryAfter).trim() ? String(retryAfter).trim() : undefined
  if (blob.includes(KIRO_REASON_CODES.MONTHLY_REQUEST_COUNT)) {
    return { status: 400, code: 'kiro_quota', retryAfter: undefined }
  }
  if (blob.includes(KIRO_REASON_CODES.INSUFFICIENT_MODEL_CAPACITY)) {
    return { status: 503, code: 'kiro_capacity', retryAfter: headerRetry }
  }
  if (blob.includes(KIRO_REASON_CODES.USER_REQUEST_RATE_EXCEEDED)) {
    return { status: 429, code: 'kiro_rate', retryAfter: headerRetry }
  }
  if (
    status === 413
    || blob.includes(KIRO_REASON_CODES.CONTENT_LENGTH_EXCEEDS_THRESHOLD)
    || blob.includes(KIRO_REASON_CODES.INPUT_TOO_LONG)
    || /\bTOO_BIG\b/.test(blob)
  ) {
    return { status: status === 413 ? 413 : 400, code: 'kiro_too_big', retryAfter: undefined }
  }
  if (status === 401 || status === 403) {
    return { status: 400, code: 'kiro_upstream', retryAfter: undefined }
  }
  return { status: status >= 400 ? status : 502, code: 'kiro_upstream', retryAfter: headerRetry }
}

export function kiroClientErrorStatus(status, parsed, text) {
  return classifyKiroHopError(status, parsed, text).status
}

export function kiroClientErrorBody(status, parsed, text) {
  const raw = isPlainObject(parsed) ? parsed : {}
  const classified = classifyKiroHopError(status, raw, text)
  const message = trimmed(raw.message)
    || trimmed(raw.error?.message)
    || trimmed(raw.Message)
    || trimmed(raw.reason)
    || (typeof text === 'string' && text.trim() ? text.trim().slice(0, 800) : undefined)
    || `kiro upstream ${classified.status}`
  return {
    error: {
      message,
      type: classified.status === 429 ? 'rate_limit_error' : 'invalid_request_error',
      code: classified.code,
    },
  }
}

function encodeOneHeader(name, type, valueBuf) {
  const nameBuf = Buffer.from(name)
  const row = Buffer.alloc(1 + nameBuf.length + 1 + valueBuf.length)
  row[0] = nameBuf.length
  nameBuf.copy(row, 1)
  row[1 + nameBuf.length] = type
  valueBuf.copy(row, 1 + nameBuf.length + 1)
  return row
}

function encodeEventHeaders(headers) {
  const parts = []
  for (const [name, spec] of Object.entries(headers)) {
    if (spec === true) {
      parts.push(encodeOneHeader(name, 0, Buffer.alloc(0)))
      continue
    }
    if (spec === false) {
      parts.push(encodeOneHeader(name, 1, Buffer.alloc(0)))
      continue
    }
    if (spec && typeof spec === 'object' && Number.isInteger(spec.type)) {
      parts.push(encodeOneHeader(name, spec.type, spec.value ?? Buffer.alloc(0)))
      continue
    }
    const valueBuf = Buffer.from(String(spec))
    const payload = Buffer.alloc(2 + valueBuf.length)
    payload.writeUInt16BE(valueBuf.length, 0)
    valueBuf.copy(payload, 2)
    parts.push(encodeOneHeader(name, 7, payload))
  }
  return Buffer.concat(parts)
}

export function encodeKiroEventFrame(type, payload, messageType = 'event') {
  const timestamp = Buffer.alloc(8)
  const headers = encodeEventHeaders({
    ':compacted': false,
    ':message-type': messageType,
    ...(type ? { ':event-type': type } : {}),
    ':content-type': 'application/json',
    ':event-id': { type: 9, value: Buffer.alloc(16) },
    timestamp: { type: 8, value: timestamp },
  })
  const payloadBuf = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload ?? {}))
  const prelude = Buffer.alloc(12)
  const totalLen = 12 + headers.length + payloadBuf.length + 4
  prelude.writeUInt32BE(totalLen, 0)
  prelude.writeUInt32BE(headers.length, 4)
  prelude.writeUInt32BE(crc32(prelude.subarray(0, 8)) >>> 0, 8)
  const head = Buffer.concat([prelude, headers, payloadBuf])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(head) >>> 0, 0)
  return Buffer.concat([head, tail])
}

export function encodeKiroEventStream(events) {
  return Buffer.concat((events ?? []).map((event) => (
    encodeKiroEventFrame(event.type, event.payload, event.messageType)
  )))
}
