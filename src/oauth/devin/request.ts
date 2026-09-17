/**
 * DSH OpenAI-Completions body ↔ Devin GetChatMessage (Connect/protobuf).
 *
 * Mapping (from the exa protos + the reference client):
 *   system / developer   → request.prompt (one string, joined — it IS the
 *                          Cascade system prompt; DSH's extra snapshots join
 *                          in order so the stable leading system stays first)
 *   user                 → ChatMessagePrompt{ source: USER(1) }
 *   assistant            → ChatMessagePrompt{ source: SYSTEM(2), prompt,
 *                          thinking, signature, tool_calls }
 *   tool                 → ChatMessagePrompt{ source: TOOL(4), tool_call_id }
 *   tools[]              → ChatToolDefinition{ json_schema_string }
 *   model + effort       → chat_model_uid via catalog `variants` (effort is a
 *                          uid suffix upstream, not a parameter)
 *
 * `message_id`s are deterministic UUIDs off the cascade so history rebuilds
 * keep stable ids (same shape the reference client uses).
 */

import { devinModelById } from './catalog.js'
import { devinCascadeId, devinExecutionId, deterministicDevinId } from './cache.js'
import {
  DEVIN_SOURCE_SYSTEM,
  DEVIN_SOURCE_TOOL,
  DEVIN_SOURCE_USER,
  encodeChatMessagePrompt,
  encodeCompletionConfiguration,
  encodeDevinMetadata,
  DEVIN_STOP_REASON_MAX_TOKENS,
  DEVIN_STOP_REASON_FUNCTION_CALL,
} from './proto.js'
import {
  DEVIN_IDE_NAME,
  DEVIN_IDE_VERSION,
  DEVIN_EXTENSION_NAME,
  DEVIN_EXTENSION_VERSION,
  DEVIN_LOCALE,
  DEVIN_STOP_PATTERNS,
} from './index.js'

function textOf(value) {
  return typeof value === 'string' ? value : ''
}

/** OpenAI message content → { text, images[] } (data-URL / raw base64). */
function partsOf(content) {
  if (typeof content === 'string') return { text: content, images: [] }
  if (!Array.isArray(content)) return { text: '', images: [] }
  let text = ''
  const images = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'text' || part.type === 'input_text') {
      text += textOf(part.text)
    } else if (part.type === 'image_url' || part.type === 'input_image') {
      const url = textOf(part.image_url?.url ?? part.image_url ?? part.url)
      const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
      if (match) {
        images.push({ base64Data: match[2], mimeType: match[1] })
      } else if (url && !/^https?:/i.test(url)) {
        images.push({ base64Data: url, mimeType: 'image/png' })
      }
      // Remote http(s) image URLs are not downloaded; the CLI passes base64.
    }
  }
  return { text, images }
}

function toolCallsOf(message) {
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
  return calls.map((call) => ({
    id: textOf(call?.id),
    name: textOf(call?.function?.name ?? call?.name),
    argumentsJson: typeof call?.function?.arguments === 'string'
      ? call.function.arguments
      : JSON.stringify(call?.function?.arguments ?? {}),
  }))
}

/**
 * Resolve the picker id + DSH reasoning_effort to a backend chat_model_uid.
 * A raw `*-low`-style uid passes through untouched; a family row resolves via
 * the catalog's `variants` map (defaultUid when effort is unset/unknown).
 */
export function devinWireModelId(model, reasoningEffort) {
  const id = textOf(model).trim()
  if (!id) return undefined
  const row = devinModelById(id)
  if (!row) return id
  const effort = textOf(reasoningEffort).trim().toLowerCase()
  if (effort && row.variants?.[effort]) return row.variants[effort]
  // The catalog advertises variants as reasoningEfforts values, so DSH may
  // echo the backend uid itself back in reasoning_effort.
  if (effort && Object.values(row.variants ?? {}).includes(effort)) return effort
  return row.defaultUid ?? id
}

function devinToolChoice(choice) {
  if (choice === undefined || choice === null) return { optionName: 'auto' }
  if (typeof choice === 'string') {
    if (choice === 'auto' || choice === 'none' || choice === 'required') return { optionName: choice }
    return { toolName: choice }
  }
  if (typeof choice === 'object') {
    const name = textOf(choice.function?.name ?? choice.name)
    if (name) return { toolName: name }
  }
  return { optionName: 'auto' }
}

function devinTools(tools) {
  if (!Array.isArray(tools)) return []
  return tools.map((tool) => ({
    name: textOf(tool?.function?.name ?? tool?.name),
    description: textOf(tool?.function?.description ?? tool?.description),
    jsonSchemaString: JSON.stringify(tool?.function?.parameters ?? tool?.parameters ?? {}),
    strict: tool?.function?.strict === true || tool?.strict === true,
  })).filter((tool) => tool.name.length > 0)
}

function stopPatterns(payload) {
  const extra = []
  const stop = payload?.stop ?? payload?.stop_sequences
  for (const value of Array.isArray(stop) ? stop : stop == null ? [] : [stop]) {
    const text = textOf(value).trim()
    if (text && !DEVIN_STOP_PATTERNS.includes(text)) extra.push(text)
  }
  return extra.length ? [...DEVIN_STOP_PATTERNS, ...extra] : [...DEVIN_STOP_PATTERNS]
}

function maxTokensOf(payload, modelRow) {
  const requested = Number(payload?.max_completion_tokens ?? payload?.max_tokens)
  const cap = Number(modelRow?.maxTokens)
  if (Number.isFinite(requested) && requested > 0) {
    return Number.isFinite(cap) && cap > 0 ? Math.min(requested, cap) : requested
  }
  return Number.isFinite(cap) && cap > 0 ? cap : 64_000
}

/**
 * Build the GetChatMessageRequest fields (submessages already encoded) plus
 * the conversation ids the transport needs. `metadata` is applied at send
 * time by the transport (it carries the per-request user_jwt).
 */
export function openaiToDevin(payload, { cascadeId, executionId } = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const messages = Array.isArray(source.messages) ? source.messages : []
  const cascade = cascadeId ?? devinCascadeId(source)
  const row = devinModelById(textOf(source.model))
  const chatModelUid = devinWireModelId(source.model, source.reasoning_effort)

  const system = []
  const prompts = []
  for (const [index, message] of messages.entries()) {
    if (!message || typeof message !== 'object') continue
    const role = textOf(message.role)
    if (role === 'system' || role === 'developer') {
      const { text } = partsOf(message.content)
      if (text.trim()) system.push(text)
      continue
    }
    if (role === 'assistant') {
      const { text } = partsOf(message.content)
      const toolCalls = toolCallsOf(message)
      const thinking = textOf(message.reasoning_content ?? message.thinking)
      prompts.push(encodeChatMessagePrompt({
        messageId: textOf(message.id) || `bot-${deterministicDevinId(`${cascade}\0${index}\0assistant`)}`,
        source: DEVIN_SOURCE_SYSTEM,
        prompt: text,
        toolCalls,
        thinking: thinking || undefined,
      }))
      continue
    }
    if (role === 'tool' || role === 'function') {
      const { text, images } = partsOf(message.content)
      prompts.push(encodeChatMessagePrompt({
        messageId: deterministicDevinId(`${cascade}\0${index}\0tool\0${textOf(message.tool_call_id)}`),
        source: DEVIN_SOURCE_TOOL,
        prompt: text,
        toolCallId: textOf(message.tool_call_id) || undefined,
        images,
      }))
      continue
    }
    // user (and anything else) rides the USER channel, like the reference.
    const { text, images } = partsOf(message.content)
    prompts.push(encodeChatMessagePrompt({
      messageId: deterministicDevinId(`${cascade}\0${index}\0user`),
      source: DEVIN_SOURCE_USER,
      prompt: text,
      images,
    }))
  }

  const fields = {
    prompt: system.join('\n\n'),
    chatMessagePrompts: prompts,
    chatModelUid,
    cascadeId: cascade,
    executionId: executionId ?? devinExecutionId(),
    configuration: encodeCompletionConfiguration({
      maxTokens: maxTokensOf(source, row),
      temperature: Number.isFinite(Number(source.temperature)) ? Number(source.temperature) : 0.4,
      topP: Number.isFinite(Number(source.top_p)) ? Number(source.top_p) : 1,
      stopPatterns: stopPatterns(source),
    }),
    tools: devinTools(source.tools),
    toolChoice: devinToolChoice(source.tool_choice),
  }

  return { fields, cascadeId: cascade, chatModelUid }
}

/**
 * The real CLI sends `Authorization: Basic <apiKey>-<sessionId>` where the
 * session id is the session token itself (MITM capture). metadata.api_key
 * alone is accepted, but the header keeps the hop's fingerprint faithful.
 */
export function devinBasicAuth(session) {
  const key = session?.accessToken
  return typeof key === 'string' && key ? `Basic ${key}-${key}` : undefined
}

/** Wire Metadata message for every Devin RPC (chat, catalog, status, jwt). */
export function devinMetadataBytes(session, { userJwt, modelDisplays } = {}) {
  return encodeDevinMetadata({
    apiKey: session?.accessToken,
    userJwt,
    ideName: DEVIN_IDE_NAME,
    ideVersion: DEVIN_IDE_VERSION,
    extensionName: DEVIN_EXTENSION_NAME,
    extensionVersion: DEVIN_EXTENSION_VERSION,
    locale: DEVIN_LOCALE,
    os: process.platform,
    modelDisplays,
  })
}

/* ---- collected response → chat.completion -------------------------------- */

export function mapDevinUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined
  const prompt = Number(usage.inputTokens ?? 0)
  const completion = Number(usage.outputTokens ?? 0)
  const cached = Number(usage.cacheReadTokens ?? 0)
  const out = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  }
  if (cached > 0) out.prompt_tokens_details = { cached_tokens: cached }
  if (Number(usage.cacheWriteTokens ?? 0) > 0) {
    out.prompt_cache_write_tokens = Number(usage.cacheWriteTokens)
  }
  return out
}

export function devinStopReasonToFinish(reason, hasToolCalls) {
  if (hasToolCalls) return 'tool_calls'
  if (reason === DEVIN_STOP_REASON_MAX_TOKENS) return 'length'
  if (reason === DEVIN_STOP_REASON_FUNCTION_CALL) return 'tool_calls'
  return 'stop'
}

/**
 * `collected` is what runDevinChat accumulated:
 *   { text, thinking, toolCalls:[{id,name,argumentsJson}], usage, stopReason, messageId }
 */
export function devinToOpenai(collected, { model, id } = {}) {
  const toolCalls = Array.isArray(collected?.toolCalls) ? collected.toolCalls : []
  const message = {
    role: 'assistant',
    content: collected?.text ?? '',
    tool_calls: toolCalls.map((call, index) => ({
      id: call.id || `call_${index}`,
      type: 'function',
      function: { name: call.name ?? '', arguments: call.argumentsJson ?? '' },
    })),
  }
  if (toolCalls.length === 0) delete message.tool_calls
  if (collected?.thinking) message.reasoning_content = collected.thinking
  const body = {
    id: id ?? `chatcmpl-devin-${Date.now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: devinStopReasonToFinish(collected?.stopReason, toolCalls.length > 0),
    }],
  }
  const usage = mapDevinUsage(collected?.usage)
  if (usage) body.usage = usage
  return body
}

/* ---- OpenAI SSE mapper ---------------------------------------------------- */

/**
 * Translate Devin stream events into OpenAI chat.completion.chunk SSE. Events
 * come from runDevinChat: {type:'text'|'thinking'|'tool'|'usage'|'done', …}.
 */
export function createDevinOpenaiStream({ model, id } = {}) {
  const completionId = id ?? `chatcmpl-devin-${Date.now().toString(36)}`
  const created = Math.floor(Date.now() / 1000)
  const toolIndexes = new Map()
  const toolArgsSent = new Map()
  let nextToolIndex = 0
  let latestUsage
  let stopReason
  let sentRole = false
  let text = ''
  let thinking = ''

  function chunk(delta, finishReason, usage) {
    const choice = { index: 0, delta }
    if (finishReason !== undefined) choice.finish_reason = finishReason
    const body = {
      id: completionId,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [choice],
    }
    if (usage) body.usage = usage
    return `data: ${JSON.stringify(body)}\n\n`
  }

  function toolIndex(callId) {
    if (!toolIndexes.has(callId)) toolIndexes.set(callId, nextToolIndex++)
    return toolIndexes.get(callId)
  }

  return {
    id: completionId,
    text: () => text,
    thinking: () => thinking,
    push(event) {
      if (!event || typeof event !== 'object') return []
      const chunks = []
      if (!sentRole) {
        sentRole = true
        chunks.push(chunk({ role: 'assistant' }))
      }
      if (event.type === 'thinking' && event.delta) {
        thinking += event.delta
        chunks.push(chunk({ reasoning_content: event.delta }))
      } else if (event.type === 'text' && event.delta) {
        text += event.delta
        chunks.push(chunk({ content: event.delta }))
      } else if (event.type === 'tool' && event.call) {
        const call = event.call
        const index = toolIndex(call.id || `call_${nextToolIndex}`)
        const toolCall = { index, type: 'function' }
        if (call.id) toolCall.id = call.id
        if (call.name) toolCall.function = { name: call.name }
        if (call.argumentsJson) {
          // The upstream field is cumulative; OpenAI wants the new tail only.
          const sent = toolArgsSent.get(call.id) ?? ''
          const delta = call.argumentsJson.startsWith(sent)
            ? call.argumentsJson.slice(sent.length)
            : call.argumentsJson
          toolArgsSent.set(call.id, call.argumentsJson)
          toolCall.function = { ...(toolCall.function ?? {}), arguments: delta }
        }
        chunks.push(chunk({ tool_calls: [toolCall] }))
      } else if (event.type === 'usage' && event.usage) {
        latestUsage = event.usage
      } else if (event.type === 'stop') {
        stopReason = event.reason
      }
      return chunks
    },
    finish() {
      const chunks = []
      if (!sentRole) chunks.push(chunk({ role: 'assistant' }))
      const finishReason = devinStopReasonToFinish(stopReason, toolIndexes.size > 0)
      chunks.push(chunk({}, finishReason, latestUsage ? mapDevinUsage(latestUsage) : undefined))
      chunks.push('data: [DONE]\n\n')
      return chunks
    },
  }
}
