/**
 * DSH OpenAI Completions ↔ Cursor AgentService/Run.
 *
 * Native wire is Connect/protobuf over HTTP/2. Completions is the DSH api
 * because that wire is none of the three closed harness protocols.
 */

import { createHash } from 'node:crypto'
import {
  cursorConversationId,
  cursorStableId,
  peelCursorFastSuffix,
  pinCursorSystemPrefix,
} from './cache.js'
import { CURSOR_REASONING, cursorContextValueTokens } from './index.js'
import { cursorCatalogModels, cursorParamStyle } from './registry.js'
import {
  decodeAgentServerMessage,
  encodeAgentClientMessage,
  encodeAgentRunRequest,
  encodeConversationState,
  encodeJsonValueBytes,
  encodeRequestedModel,
  encodeUserMessage,
  frameConnect,
  splitConnectFrames,
} from './proto.js'

function textOf(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => part && (part.type === 'text' || typeof part.text === 'string'))
    .map((part) => part.text ?? '')
    .join('\n')
}

function parseToolArgs(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw !== 'string' || !raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    return { value: parsed }
  } catch {
    return { __raw: raw }
  }
}

function storeBlob(data, blobStore) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const id = createHash('sha256').update(bytes).digest()
  blobStore.set(id.toString('hex'), bytes)
  return id
}

function openaiTools(payload) {
  const tools: any[] = []
  for (const tool of payload?.tools ?? []) {
    const fn = tool?.function ?? tool
    const name = typeof fn?.name === 'string' ? fn.name : undefined
    if (!name) continue
    tools.push({
      name,
      toolName: name,
      providerIdentifier: 'dsh',
      description: typeof fn.description === 'string' ? fn.description : '',
      inputSchema: encodeJsonValueBytes(fn.parameters ?? {}),
    })
  }
  return tools
}

/** How the model calls an MCP tool: Cursor shows it MCP tools only through this one dynamic-call tool. */
const CURSOR_CALL = 'CallDynamicTool'
const CURSOR_CONTINUE = 'Continue.'
const CURSOR_NO_RESULT = 'Tool result unavailable'

function systemPromptOf(messages) {
  return (messages ?? [])
    .filter((msg) => msg?.role === 'system' || msg?.role === 'developer')
    .map((msg) => textOf(msg.content))
    .filter(Boolean)
    .join('\n')
}

function jsonOrText(text) {
  try { return JSON.parse(text) } catch { return text }
}

const CURSOR_IMAGE = /^data:(image\/(?:png|jpeg|gif|webp));base64,/i

/** `data:` image parts of an OpenAI user message as the JSON image parts Cursor reads (bytes as hex; live: red / blue read back). */
function cursorImages(content) {
  if (!Array.isArray(content)) return []
  const images: any[] = []
  for (const part of content) {
    const url = part?.type === 'image_url' ? (typeof part.image_url === 'string' ? part.image_url : part.image_url?.url) : undefined
    const head = typeof url === 'string' ? CURSOR_IMAGE.exec(url) : null
    if (!head) continue
    images.push({
      type: 'image',
      mimeType: head[1].toLowerCase(),
      image: { __type: 'Uint8Array', hex: Buffer.from(url.slice(head[0].length), 'base64').toString('hex') },
    })
  }
  return images
}

function cursorToolResult(id, text, isError) {
  return {
    type: 'tool-result',
    toolCallId: id,
    toolName: CURSOR_CALL,
    result: jsonOrText(text),
    experimental_content: [{ type: 'text', text }],
    ...(isError ? { isError: true } : {}),
  }
}

/**
 * The conversation as the AI-SDK JSON messages Cursor reads, and the words the
 * turn being answered is named by. Live 2026-09-29: the protobuf turn history
 * this hop used to send is ignored (a second turn did not know the first)
 * while these JSON messages in the state's root are read. After tool results
 * the turn goes on with a nudge: the raw result as the user's words made the
 * model ask what to do with it, the original question made it call the tools
 * again. Every call needs a result, so one the caller never resolved gets a
 * stand-in.
 */
function cursorConversation(messages) {
  const list = (messages ?? []).filter((msg) => msg && msg.role !== 'system' && msg.role !== 'developer')
  // Only the latest image-bearing turn keeps its images (they go again with every Run).
  const imageAt = list.findLastIndex((msg) => msg.role === 'user' && cursorImages(msg.content).length > 0)
  const userMessage = (msg, index) => ({
    role: 'user',
    content: [{ type: 'text', text: textOf(msg.content) }, ...(index === imageAt ? cursorImages(msg.content) : [])],
  })
  let current = CURSOR_CONTINUE
  let currentMessage
  if (list.at(-1)?.role === 'user') {
    const index = list.length - 1
    const msg = list.pop()
    current = textOf(msg.content) || '.'
    // The turn's words ride the action; its images only exist in a message.
    if (index === imageAt) currentMessage = userMessage(msg, index)
  }
  const history: any[] = []
  let pending: string[] = []
  let results: any[] = []
  const closeResults = () => {
    for (const id of pending) results.push(cursorToolResult(id, CURSOR_NO_RESULT, true))
    pending = []
    if (results.length) history.push({ role: 'tool', content: results })
    results = []
  }
  for (const [index, msg] of list.entries()) {
    if (msg.role === 'tool') {
      const at = pending.indexOf(msg.tool_call_id)
      if (at < 0) continue
      pending.splice(at, 1)
      results.push(cursorToolResult(msg.tool_call_id, textOf(msg.content), msg.is_error === true))
      continue
    }
    closeResults()
    if (msg.role === 'user') {
      history.push(userMessage(msg, index))
    } else if (msg.role === 'assistant') {
      const content: any[] = []
      const text = textOf(msg.content)
      if (text) content.push({ type: 'text', text })
      for (const call of msg.tool_calls ?? []) {
        content.push({
          type: 'tool-call',
          toolCallId: call.id,
          toolName: CURSOR_CALL,
          args: { namespace: 'dsh', toolName: call.function?.name ?? 'tool', arguments: parseToolArgs(call.function?.arguments) },
        })
        pending.push(call.id)
      }
      if (content.length) history.push({ role: 'assistant', content })
    }
  }
  closeResults()
  if (currentMessage) history.push(currentMessage)
  return { history, current }
}

/**
 * The wire effort value for one family. reasoning_effort already arrives as
 * the vendor spelling (the row's reasoningEfforts values), so it passes
 * through when the family advertises it; a bare DSH key maps through the
 * family style. Anything else is omitted — the registry rejects unadvertised
 * values with 'Invalid parameters for registry model'.
 */
function vendorEffort(style, value) {
  if (typeof value !== 'string' || !value.trim() || !style?.effortParam) return undefined
  const key = value.trim()
  const efforts = style.efforts ?? {}
  if (Object.values(efforts).includes(key)) return key
  if (efforts[key]) return efforts[key]
  const legacy = CURSOR_REASONING[key]
  if (legacy && Object.values(efforts).includes(legacy)) return legacy
  return undefined
}

/**
 * The context parameter matching the picker row's advertised window. A wrong
 * or unadvertised value fails the same registry check, so only an exact match
 * is sent — otherwise the parameter is omitted and the registry default
 * applies.
 */
function cursorContextParameter(family, style) {
  const contexts = style?.contexts
  if (!contexts || contexts.length === 0) return undefined
  const row = cursorCatalogModels().find((model) => model.id === family)
  const window = row?.contextWindow
  if (!Number.isFinite(window)) return undefined
  const hit = [...contexts].find((value) => cursorContextValueTokens(value) === window)
  return hit ? { id: 'context', value: hit } : undefined
}

/**
 * RequestedModel.parameters for one picker model, verbatim from the family's
 * registry style (live AvailableModels first, static table otherwise). The
 * upstream registry validates the set: a wrong id or value fails the Run with
 * 'Invalid parameters for registry model', so unknown families send none.
 */
export function cursorModelParameters(payload: any = {}) {
  const family = peelCursorFastSuffix(payload.model).modelId
  const style = cursorParamStyle(family)
  if (!style) return []
  const parameters: any[] = []
  const context = cursorContextParameter(family, style)
  if (context) parameters.push(context)
  const effort = vendorEffort(style, payload.reasoning_effort)
  if (effort) parameters.push({ id: style.effortParam, value: effort })
  if (style.fast === true) {
    parameters.push({ id: 'fast', value: peelCursorFastSuffix(payload.model).requestedFast ? 'true' : 'false' })
  }
  return parameters
}

export function cursorWireModelId(model) {
  const raw = typeof model === 'string' && model.trim() ? model.trim() : 'composer-2'
  return peelCursorFastSuffix(raw).modelId || 'composer-2'
}

export function openaiToCursor(payload: any = {}, { conversationId }: any = {}) {
  const resolvedId = cursorConversationId(payload, conversationId)
  const { history, current } = cursorConversation(payload.messages)
  const { pinned, extra } = pinCursorSystemPrefix(resolvedId, systemPromptOf(payload.messages))
  const blobStore = new Map()
  const systemPrompt = extra ? `${pinned}\n\n${extra}` : pinned
  const rootPromptBlobs: any[] = []
  for (const text of [pinned, extra]) {
    if (text) rootPromptBlobs.push(storeBlob(Buffer.from(JSON.stringify({ role: 'system', content: text }), 'utf8'), blobStore))
  }
  for (const message of history) {
    rootPromptBlobs.push(storeBlob(Buffer.from(JSON.stringify(message), 'utf8'), blobStore))
  }

  const pickerModel = typeof payload.model === 'string' && payload.model.trim()
    ? payload.model.trim()
    : 'composer-2'
  const modelId = cursorWireModelId(pickerModel)
  const userMessage = encodeUserMessage({
    text: current,
    messageId: cursorStableId(resolvedId, 'user', current, history.length),
    mode: 1,
  })
  const conversationState = encodeConversationState({
    rootPromptBlobs,
    mode: 1,
    clientName: 'dsh',
  })
  const tools = openaiTools(payload)
  const requestBytes = encodeAgentClientMessage(encodeAgentRunRequest({
    conversationState,
    userMessage,
    requestedModel: encodeRequestedModel({
      modelId,
      maxMode: false,
      parameters: cursorModelParameters(payload),
    }),
    conversationId: resolvedId,
    mcpTools: tools,
  }))

  return {
    conversationId: resolvedId,
    modelId,
    pickerModel,
    systemPrompt,
    pinnedSystem: pinned,
    extraSystem: extra,
    userText: current,
    // Keep the encoded schema: requestContextResult re-advertises these to
    // Cursor's run handshake (McpToolDefinition), so name+description alone
    // would advertise empty schemas.
    tools,
    requestBytes,
    blobStore,
    stream: payload.stream === true,
  }
}

export function mapCursorUsage({ promptTokens, completionTokens, cachedTokens }: any = {}) {
  const prompt = Number.isFinite(promptTokens) ? promptTokens : 0
  const completion = Number.isFinite(completionTokens) ? completionTokens : 0
  const cached = Number.isFinite(cachedTokens) ? cachedTokens : 0
  const usage: any = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  }
  if (cached > 0) usage.prompt_tokens_details = { cached_tokens: cached }
  return usage
}

export function cursorToOpenai(collected, { model, id = `chatcmpl-${Date.now()}`, conversationId }: any = {}) {
  const toolCalls = collected.toolCalls ?? []
  const finish = toolCalls.length > 0 ? 'tool_calls' : (collected.finishReason ?? 'stop')
  return {
    id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model ?? 'cursor',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: collected.text ?? '',
        ...(collected.thinking ? { reasoning_content: collected.thinking } : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: finish,
    }],
    usage: mapCursorUsage(collected.usage),
    ...(conversationId ? { cursor_conversation_id: conversationId } : {}),
  }
}

export function cursorToOpenaiChunk(delta, { model, id, done = false, finishReason, usage }: any = {}) {
  return {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: done
        ? {}
        : {
          ...(delta.role ? { role: delta.role } : {}),
          ...(delta.text != null ? { content: delta.text } : {}),
          ...(delta.thinking != null ? { reasoning_content: delta.thinking } : {}),
          ...(delta.tool_calls ? { tool_calls: delta.tool_calls } : {}),
        },
      finish_reason: done ? (finishReason ?? 'stop') : null,
    }],
    ...(usage ? { usage: mapCursorUsage(usage) } : {}),
  }
}

export function createCursorOpenaiStream({ model, id, conversationId }) {
  const collected: any = { text: '', thinking: '', toolCalls: [], usage: {} }
  let started = false
  return {
    collected,
    conversationId,
    /**
     * The role chunk rides with the first content chunk: an error or an empty
     * update must not commit the client head before any output exists.
     */
    push(event) {
      const chunks: any[] = []
      if (event?.text) {
        collected.text += event.text
        chunks.push(cursorToOpenaiChunk({ text: event.text }, { model, id }))
      }
      if (event?.thinking) {
        collected.thinking += event.thinking
        chunks.push(cursorToOpenaiChunk({ thinking: event.thinking }, { model, id }))
      }
      if (event?.toolCall) {
        const call: any = {
          id: event.toolCall.id || `call_${collected.toolCalls.length + 1}`,
          type: 'function',
          function: {
            name: event.toolCall.name || 'tool',
            arguments: typeof event.toolCall.arguments === 'string'
              ? event.toolCall.arguments
              : JSON.stringify(event.toolCall.arguments ?? {}),
          },
        }
        collected.toolCalls.push(call)
        chunks.push(cursorToOpenaiChunk({
          tool_calls: [{ index: collected.toolCalls.length - 1, ...call }],
        }, { model, id }))
      }
      if (event?.tokens) {
        collected.usage.completionTokens = (collected.usage.completionTokens ?? 0) + event.tokens
      }
      if (event?.usage) {
        if (Number.isFinite(event.usage.promptTokens)) collected.usage.promptTokens = event.usage.promptTokens
        if (Number.isFinite(event.usage.completionTokens)) collected.usage.completionTokens = event.usage.completionTokens
        if (Number.isFinite(event.usage.cachedTokens)) collected.usage.cachedTokens = event.usage.cachedTokens
      }
      if (event?.cachedTokens) collected.usage.cachedTokens = event.cachedTokens
      if (event?.promptTokens) collected.usage.promptTokens = event.promptTokens
      if (chunks.length && !started) {
        started = true
        chunks.unshift(cursorToOpenaiChunk({ role: 'assistant', text: '' }, { model, id }))
      }
      return chunks
    },
    finish() {
      const finishReason = collected.toolCalls.length > 0 ? 'tool_calls' : 'stop'
      return cursorToOpenaiChunk({}, { model, id, done: true, finishReason, usage: collected.usage })
    },
  }
}

/**
 * Connect end-frame errors carry the human-readable reason in
 * `error.details[].debug.details.{title,detail}` (e.g. "Composer 2 is
 * retired: We're upgrading you to Composer 2.5…"); `error.message` is often
 * just "Error". Prefer the detail so the client sees why the run failed.
 */
function connectErrorMessage(parsed) {
  const detail = (parsed?.error?.details ?? []).find((entry) => entry?.debug?.details)
  const text = detail?.debug?.details
  if (text?.title) return text.detail ? `${text.title}: ${text.detail}` : text.title
  return parsed?.error?.message ?? parsed?.message
}

export function consumeCursorFrames(chunk, rest, onMessage) {
  const { frames, rest: leftover } = splitConnectFrames(Buffer.concat([
    rest ?? Buffer.alloc(0),
    Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk ?? []),
  ]))
  for (const frame of frames) {
    if (frame.end) {
      const text = frame.payload.toString('utf8').trim()
      if (text) {
        try {
          const parsed = JSON.parse(text)
          const message = connectErrorMessage(parsed)
          if (message) onMessage({ kind: 'error', message, code: parsed?.error?.code })
        } catch {
          onMessage({ kind: 'error', message: text.slice(0, 300) })
        }
      }
      continue
    }
    onMessage(decodeAgentServerMessage(frame.payload))
  }
  return leftover
}

export function firstConnectFrame(built) {
  return frameConnect(built.requestBytes)
}
