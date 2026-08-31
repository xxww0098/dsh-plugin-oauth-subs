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

import { crc32 } from 'node:zlib'
import { KIRO_DEFAULT_REGION, kiroUsageHeaders, kiroUsageHost } from './index.js'
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

function normalizeToolUseId(id) {
  const raw = trimmed(id)
  if (!raw) return undefined
  if (raw.startsWith('tooluse_')) return raw
  return `tooluse_${raw.replace(/^(toolu_|call_|tool_)/, '')}`
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
  const messages = Array.isArray(payload?.messages) ? payload.messages : []
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
      flushUser()
      flushAssistant()
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
  pushKiroSystemPair(fullHistory, extra, { modelId, origin })

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

export function collectKiroEvents(events) {
  let text = ''
  const toolCalls = new Map()
  let usage
  let error
  for (const event of events ?? []) {
    const type = event?.type
    const data = isPlainObject(event?.payload) ? event.payload : {}
    if (type === 'assistantResponseEvent') {
      const chunk = typeof data.content === 'string' ? data.content : ''
      text = mergeKiroText(text, chunk).text
      continue
    }
    if (type === 'toolUseEvent') {
      const id = trimmed(data.toolUseId ?? data.tool_use_id)
      if (!id) continue
      if (!toolCalls.has(id)) toolCalls.set(id, { id, name: trimmed(data.name) ?? 'tool', parts: [] })
      const row = toolCalls.get(id)
      if (trimmed(data.name)) row.name = data.name
      if (data.stop) continue
      if (data.input !== undefined && data.input !== '') {
        row.parts.push(typeof data.input === 'string' ? data.input : JSON.stringify(data.input))
      }
      continue
    }
    const usageRaw = isPlainObject(data.tokenUsage)
      ? data.tokenUsage
      : isPlainObject(data.token_usage) ? data.token_usage : undefined
    if (usageRaw) usage = mapKiroUsage(usageRaw)
    if (type === 'metadataEvent' || type === 'metadata') continue
    if (type === 'exception' || type === 'invalidStateEvent' || event?.messageType === 'exception') {
      error = trimmed(data.message) || trimmed(data.reason) || trimmed(data.Message) || JSON.stringify(data)
    }
  }
  return {
    text,
    toolCalls: [...toolCalls.values()].map((row) => ({
      id: row.id,
      type: 'function',
      function: { name: row.name, arguments: row.parts.join('') || '{}' },
    })),
    usage,
    error,
  }
}

export function kiroToOpenai(eventsOrBody, { model, id = `chatcmpl-${Date.now()}` } = {}) {
  const events = Array.isArray(eventsOrBody) ? eventsOrBody : parseKiroEventStream(eventsOrBody)
  const collected = collectKiroEvents(events)
  const message = { role: 'assistant', content: collected.text || null }
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
    usage: collected.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
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
  const uncached = numberField(tokens, 'uncachedInputTokens', 'uncached_input_tokens') ?? 0
  const output = numberField(tokens, 'outputTokens', 'output_tokens') ?? 0
  const cached = cacheRead ?? 0
  const usage = {
    prompt_tokens: uncached + cached,
    completion_tokens: output,
    total_tokens: numberField(tokens, 'totalTokens', 'total_tokens') ?? (uncached + cached + output),
  }
  if (cacheRead !== undefined) usage.prompt_tokens_details = { cached_tokens: cacheRead }
  return usage
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

export function kiroClientErrorStatus(status) {
  if (status === 401 || status === 403) return 400
  return status >= 400 ? status : 502
}

export function kiroClientErrorBody(status, parsed, text) {
  const raw = isPlainObject(parsed) ? parsed : {}
  const message = trimmed(raw.message)
    || trimmed(raw.error?.message)
    || trimmed(raw.Message)
    || (typeof text === 'string' && text.trim() ? text.trim().slice(0, 800) : undefined)
    || `kiro upstream ${status}`
  return {
    error: {
      message,
      type: 'invalid_request_error',
      code: 'kiro_upstream',
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
