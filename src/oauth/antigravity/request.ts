/**
 * OpenAI chat/completions ↔ daily-cloudcode-pa generateContent (hub).
 * Body always includes project + model + userAgent: "antigravity".
 */

import { antigravityRequestId, ANTIGRAVITY_BODY_USER_AGENT } from './index.js'
import {
  antigravitySessionIdOf,
  pinAntigravitySystemInstruction,
  pinAntigravityThinking,
  pinAntigravityTools,
} from './cache.js'

export {
  ANTIGRAVITY_STABLE_SESSION,
  resetAntigravitySystemPins,
} from './cache.js'

/**
 * Gemini 3 / Cloud Code require the original `thoughtSignature` on each
 * functionCall part when that history is sent back. DSH has no first-class
 * field; we stamp extra keys on OpenAI tool_calls (echo if DSH keeps them)
 * and keep a per-session map keyed by tool id and name+args.
 * https://ai.google.dev/gemini-api/docs/thought-signatures
 */
const THOUGHT_SIGNATURES = new Map()
const THOUGHT_SIGNATURE_SESSION_CAP = 64
const THOUGHT_SIGNATURES_PER_SESSION = 256

export function resetAntigravityThoughtSignatures() {
  THOUGHT_SIGNATURES.clear()
}

function asCount(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.round(value)
  if (typeof value === 'string' && value.trim()) {
    const next = Number(value)
    if (Number.isFinite(next) && next >= 0) return Math.round(next)
  }
  return undefined
}

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function tryJson(value) {
  if (value && typeof value === 'object') return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    return JSON.parse(value)
  } catch {
    return { text: value }
  }
}

function stableJson(value) {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

/** Cloud Code / Gemini REST: part-level thoughtSignature (also accept snake / nested). */
export function thoughtSignatureOf(...sources) {
  for (const source of sources) {
    if (!isPlainObject(source)) continue
    const direct = trimmed(source.thoughtSignature) ?? trimmed(source.thought_signature)
    if (direct) return direct
    const extra = isPlainObject(source.extra_content)
      ? source.extra_content
      : isPlainObject(source.extra_body) ? source.extra_body : undefined
    const google = isPlainObject(extra?.google) ? extra.google : extra
    const fromExtra = trimmed(google?.thought_signature) ?? trimmed(google?.thoughtSignature)
    if (fromExtra) return fromExtra
    const fromFn = thoughtSignatureOf(source.function, source.functionCall)
    if (fromFn) return fromFn
  }
  return undefined
}

function signatureCallKey(name, args) {
  const n = trimmed(name)
  if (!n) return undefined
  return `${n}\0${stableJson(args ?? {})}`
}

function rememberThoughtSignature(sessionId, { id, name, args, signature } = {}) {
  if (!sessionId || !signature) return
  let bucket = THOUGHT_SIGNATURES.get(sessionId)
  if (!bucket) {
    if (THOUGHT_SIGNATURES.size >= THOUGHT_SIGNATURE_SESSION_CAP) {
      const first = THOUGHT_SIGNATURES.keys().next().value
      THOUGHT_SIGNATURES.delete(first)
    }
    bucket = new Map()
    THOUGHT_SIGNATURES.set(sessionId, bucket)
  }
  const ck = signatureCallKey(name, args)
  if (ck) bucket.set(ck, signature)
  if (trimmed(id)) bucket.set(`id:${id}`, signature)
  while (bucket.size > THOUGHT_SIGNATURES_PER_SESSION) {
    bucket.delete(bucket.keys().next().value)
  }
}

function lookupThoughtSignature(sessionId, { id, name, args } = {}) {
  const bucket = THOUGHT_SIGNATURES.get(sessionId)
  if (!bucket) return undefined
  const ck = signatureCallKey(name, args)
  return (ck && bucket.get(ck)) || (trimmed(id) && bucket.get(`id:${id}`)) || undefined
}

function attachThoughtSignatureFields(target, signature) {
  if (!signature) return target
  target.thoughtSignature = signature
  target.thought_signature = signature
  target.extra_content = { google: { thought_signature: signature } }
  return target
}

function isClaudeModel(model) {
  return String(model ?? '').startsWith('claude-')
}

function isGptOssModel(model) {
  return String(model ?? '').startsWith('gpt-oss-')
}

function usesLegacyToolParameters(model) {
  return isClaudeModel(model) || isGptOssModel(model)
}

function toolCallIdNeeded(model) {
  return usesLegacyToolParameters(model)
}

/** Gemini 3 / gemini-pro-agent need thoughtSignature on functionCall groups. */
export function geminiRequiresThoughtSignature(model) {
  const id = String(model ?? '')
  if (!id.startsWith('gemini-')) return false
  const match = id.match(/^gemini-(\d+)/)
  if (match) return Number.parseInt(match[1], 10) >= 3
  return true
}

/** Claude / GPT-OSS custom-tool bridge: [A-Za-z0-9_-], cap 64. */
export function sanitizeAntigravityToolCallId(id, fallbackName) {
  const cleaned = String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '_')
  const capped = cleaned.slice(0, 64)
  if (capped) return capped
  const fallback = String(fallbackName ?? 'tool').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
  return fallback || 'tool'
}

/**
 * Cloud Code 400s if maxOutputTokens exceeds the runtime-id cap.
 * https://github.com/Rahularya01/pi-antigravity (getMaxOutputTokens)
 */
const RUNTIME_MAX_OUTPUT_TOKENS = Object.freeze({
  'gemini-3.8-flash': 65_536,
  'gemini-3.8-flash-low': 65_536,
  'gemini-3.8-flash-medium': 65_536,
  'gemini-3.8-flash-high': 65_536,
  'gemini-3.7-flash': 65_536,
  'gemini-3.7-flash-tiered': 65_536,
  'gemini-3.7-flash-low': 65_536,
  'gemini-3.7-flash-medium': 65_536,
  'gemini-3.7-flash-high': 65_536,
  'gemini-3.6-flash': 65_536,
  'gemini-3.6-flash-low': 65_536,
  'gemini-3.6-flash-medium': 65_536,
  'gemini-3.6-flash-high': 65_536,
  'gemini-3.5-flash': 65_536,
  'gemini-3.5-flash-extra-low': 65_536,
  'gemini-3.5-flash-low': 65_536,
  'gemini-3-flash-agent': 65_536,
  'gemini-3-flash': 65_536,
  'gemini-3.1-pro': 65_535,
  'gemini-3.1-pro-low': 65_535,
  'gemini-3.1-pro-high': 65_535,
  'gemini-pro-agent': 65_535,
  'claude-opus-4-6': 64_000,
  'claude-opus-4-6-thinking': 64_000,
  'claude-sonnet-4-6': 64_000,
  'gpt-oss-120b': 32_768,
  'gpt-oss-120b-medium': 32_768,
})

export function antigravityMaxOutputTokens(model) {
  const id = String(model ?? '')
  if (RUNTIME_MAX_OUTPUT_TOKENS[id] !== undefined) return RUNTIME_MAX_OUTPUT_TOKENS[id]
  if (id.startsWith('claude-')) return 64_000
  if (id.startsWith('gpt-oss-')) return 32_768
  if (id.startsWith('gemini-3.1-pro') || id === 'gemini-pro-agent') return 65_535
  if (id.startsWith('gemini-')) return 65_536
  return 8192
}

function clampMaxOutputTokens(model, requested) {
  const cap = antigravityMaxOutputTokens(model)
  const n = Number(requested)
  if (Number.isFinite(n) && n > 0) return Math.min(Math.round(n), cap)
  return cap
}

function functionCallPart(call, sessionId, message, model) {
  const name = trimmed(call?.function?.name)
  if (!name) return undefined
  const args = tryJson(call.function?.arguments)
  const shared = Array.isArray(message?.tool_calls) && message.tool_calls.length === 1
    ? thoughtSignatureOf(message)
    : undefined
  const signature = thoughtSignatureOf(call)
    ?? shared
    ?? lookupThoughtSignature(sessionId, { id: call?.id, name, args })
  const functionCall = { name, args }
  if (toolCallIdNeeded(model)) {
    functionCall.id = sanitizeAntigravityToolCallId(call?.id, name)
  }
  const part = { functionCall }
  if (signature) {
    part.thoughtSignature = signature
    rememberThoughtSignature(sessionId, { id: call?.id, name, args, signature })
  }
  return part
}

/**
 * Gemini `FunctionResponse.response` is a singular protobuf Struct.
 * Arrays / null / number / bool must be wrapped or cloudcode-pa returns 400:
 * "Unknown name \"response\" … Proto field is not repeating, cannot start list."
 */
export function functionResponsePayload(value) {
  if (isPlainObject(value)) return value
  if (typeof value === 'string') {
    if (!value.trim()) return {}
    try {
      const parsed = JSON.parse(value)
      if (isPlainObject(parsed)) return parsed
      return { result: parsed }
    } catch {
      return { text: value }
    }
  }
  if (value == null) return {}
  return { result: value }
}

function functionResponsePart(message, model) {
  const name = trimmed(message?.name) ?? 'tool'
  const functionResponse = {
    name,
    response: functionResponsePayload(message?.content),
  }
  if (toolCallIdNeeded(model)) {
    functionResponse.id = sanitizeAntigravityToolCallId(message?.tool_call_id, name)
  }
  return { functionResponse }
}

function toolResultText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === 'string' ? item : trimmed(item?.text) ?? ''))
      .filter(Boolean)
      .join('\n')
  }
  if (content == null) return ''
  return String(content)
}

function rememberDroppedToolCall(dropped, rawId, name, args) {
  let argsText = '{}'
  try {
    argsText = JSON.stringify(args ?? {})
  } catch {
    argsText = '{}'
  }
  if (rawId) {
    dropped.set(String(rawId), argsText)
    dropped.set(sanitizeAntigravityToolCallId(rawId, name), argsText)
  } else {
    dropped.set(`empty:${name}`, argsText)
  }
}

function droppedToolArgs(dropped, rawId, name) {
  const sanitized = sanitizeAntigravityToolCallId(rawId, name)
  return dropped.get(rawId)
    ?? dropped.get(sanitized)
    ?? (rawId === '' ? dropped.get(`empty:${name}`) : undefined)
}

function observationPart(name, droppedArgs, responseText) {
  const label = droppedArgs === '{}' ? `\`${name}\`` : `\`${name}\` (${droppedArgs})`
  return { text: `[Observation from ${label}:\n${responseText}]` }
}

function isFunctionResponseTurn(content) {
  return content?.role === 'user'
    && Array.isArray(content.parts)
    && content.parts.length > 0
    && content.parts.every((part) => isPlainObject(part?.functionResponse))
}

function imagePart(url) {
  const raw = trimmed(url)
  if (!raw) return undefined
  const match = /^data:([^;]+);base64,(.+)$/.exec(raw)
  if (match) return { inlineData: { mimeType: match[1], data: match[2] } }
  return { fileData: { fileUri: raw } }
}

export function partsFromContent(content) {
  if (typeof content === 'string' && content) return [{ text: content }]
  if (!Array.isArray(content)) return content == null || content === '' ? [] : [{ text: String(content) }]
  const parts = []
  for (const item of content) {
    if (typeof item === 'string' && item) parts.push({ text: item })
    else if (item?.type === 'text' && item.text) parts.push({ text: item.text })
    else if (item?.type === 'image_url') {
      const part = imagePart(item.image_url?.url ?? item.image_url)
      if (part) parts.push(part)
    }
  }
  return parts
}

function dereferenceSchema(schema, rootDefs = {}, visited = new Set()) {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map((item) => dereferenceSchema(item, rootDefs, visited))
  if (visited.has(schema)) return schema
  visited.add(schema)
  const defs = { ...rootDefs }
  if (isPlainObject(schema.$defs)) Object.assign(defs, schema.$defs)
  if (isPlainObject(schema.definitions)) Object.assign(defs, schema.definitions)
  if (typeof schema.$ref === 'string') {
    const match = schema.$ref.match(/^#\/(?:\$defs|definitions)\/(.+)$/)
    if (match?.[1] && defs[match[1]] !== undefined) {
      const resolved = dereferenceSchema(defs[match[1]], defs, visited)
      if (isPlainObject(resolved)) {
        const { $ref: _, ...rest } = schema
        const restCleaned = dereferenceSchema(rest, defs, visited)
        return isPlainObject(restCleaned) ? { ...resolved, ...restCleaned } : resolved
      }
      return resolved
    }
  }
  const out = {}
  for (const [key, value] of Object.entries(schema)) {
    out[key] = dereferenceSchema(value, defs, visited)
  }
  return out
}

function ensureRootObjectSchema(schema) {
  if (!isPlainObject(schema)) return { type: 'object', properties: {} }
  if (!schema.type) return { ...schema, type: 'object', properties: schema.properties || {} }
  return schema
}

function stripMetaSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
  const omit = new Set(['$schema', '$id', '$anchor', '$dynamicAnchor', '$vocabulary', '$comment', '$defs', 'definitions'])
  const out = {}
  for (const [key, value] of Object.entries(schema)) {
    if (!omit.has(key)) out[key] = stripMetaSchema(value)
  }
  return out
}

/**
 * Protobuf Schema keys Cloud Code's Claude/GPT custom-tool bridge accepts.
 * additionalProperties / anyOf / $ref / format / nullable → 400 Unknown name.
 */
const CUSTOM_TOOL_SCHEMA_ALLOW = new Set(['type', 'description', 'properties', 'required', 'items', 'enum'])

function normalizeCustomToolType(value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return undefined
  return value.find((entry) => typeof entry === 'string' && entry !== 'null')
}

function normalizeCustomToolSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(normalizeCustomToolSchema)
  const out = {}
  for (const [key, value] of Object.entries(schema)) {
    if (!CUSTOM_TOOL_SCHEMA_ALLOW.has(key)) continue
    if (key === 'type') {
      const normalizedType = normalizeCustomToolType(value)
      if (normalizedType !== undefined) out.type = normalizedType
      continue
    }
    if (key === 'properties' && isPlainObject(value)) {
      const props = {}
      for (const [propName, propSchema] of Object.entries(value)) {
        props[propName] = normalizeCustomToolSchema(propSchema)
      }
      out.properties = props
      continue
    }
    if (key === 'enum' && Array.isArray(value) && !value.every((entry) => typeof entry === 'string')) {
      continue
    }
    out[key] = normalizeCustomToolSchema(value)
  }
  return out
}

function jsonSchemaOf(parameters) {
  if (!parameters) return undefined
  return stripMetaSchema(ensureRootObjectSchema(dereferenceSchema(parameters)))
}

function toolDeclarations(tools, model) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined
  const legacy = usesLegacyToolParameters(model)
  const declarations = tools.flatMap((tool) => {
    const fn = tool?.function ?? tool
    const name = trimmed(fn?.name)
    if (!name) return []
    const schema = jsonSchemaOf(fn.parameters)
    const decl = {
      name,
      ...(trimmed(fn.description) ? { description: fn.description } : {}),
    }
    if (schema) {
      if (legacy) decl.parameters = normalizeCustomToolSchema(schema)
      else decl.parametersJsonSchema = schema
    }
    return [decl]
  })
  return declarations.length ? [{ functionDeclarations: declarations }] : undefined
}

function geminiToolChoiceMode(toolChoice) {
  const value = typeof toolChoice === 'string' ? toolChoice : toolChoice?.type
  if (value === 'none') return 'NONE'
  if (value === 'required' || value === 'any' || value === 'function') return 'ANY'
  return 'AUTO'
}

export function openaiToAntigravity(payload, { projectId, sessionId } = {}) {
  const project = trimmed(projectId)
  if (!project) throw new Error('antigravity generateContent requires project_id')
  const model = trimmed(payload?.model)
  if (!model) throw new Error('antigravity generateContent requires a model')
  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  const systemParts = []
  const contents = []
  const pinnedSession = antigravitySessionIdOf(payload, sessionId)
  const requiresSig = geminiRequiresThoughtSignature(model)
  const droppedToolCallIds = new Map()

  for (const message of messages) {
    const role = message?.role
    if (role === 'system' || role === 'developer') {
      systemParts.push(...partsFromContent(message.content))
      continue
    }
    if (role === 'tool') {
      const name = trimmed(message?.name) ?? 'tool'
      const rawId = typeof message?.tool_call_id === 'string' ? message.tool_call_id : ''
      const droppedArgs = requiresSig ? droppedToolArgs(droppedToolCallIds, rawId, name) : undefined
      if (droppedArgs !== undefined) {
        contents.push({ role: 'user', parts: [observationPart(name, droppedArgs, toolResultText(message))] })
        continue
      }
      const part = functionResponsePart(message, model)
      const last = contents[contents.length - 1]
      if (isFunctionResponseTurn(last)) last.parts.push(part)
      else contents.push({ role: 'user', parts: [part] })
      continue
    }
    const parts = []
    const built = []
    if (Array.isArray(message?.tool_calls)) {
      for (const call of message.tool_calls) {
        const part = functionCallPart(call, pinnedSession, message, model)
        if (part) built.push({ part, call })
      }
    }
    const groupIsSigned = built.length > 0 && Boolean(built[0].part.thoughtSignature)
    if (requiresSig && built.length && !groupIsSigned) {
      for (const { part, call } of built) {
        rememberDroppedToolCall(droppedToolCallIds, call?.id, part.functionCall.name, part.functionCall.args)
      }
    } else {
      for (const { part } of built) parts.push(part)
    }
    parts.push(...partsFromContent(message?.content))
    if (parts.length === 0) continue
    contents.push({ role: role === 'assistant' ? 'model' : 'user', parts })
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: trimmed(payload?.input) ?? '' }] })
  }
  const pinned = pinAntigravitySystemInstruction(pinnedSession, systemParts)
  if (pinned.extra) contents.push({ role: 'user', parts: [{ text: pinned.extra }] })
  if (contents[0]?.role === 'model') {
    contents.unshift({ role: 'user', parts: [{ text: 'Hello' }] })
  }

  const request = {
    contents,
    sessionId: pinnedSession,
  }
  if (pinned.parts.length) request.systemInstruction = { role: 'user', parts: pinned.parts }
  const tools = pinAntigravityTools(pinnedSession, toolDeclarations(payload?.tools, model))
  if (tools) request.tools = tools
  const thinking = pinAntigravityThinking(pinnedSession, trimmed(payload?.reasoning_effort))
  const generationConfig = {
    maxOutputTokens: clampMaxOutputTokens(model, payload?.max_tokens),
  }
  if (thinking) generationConfig.thinkingConfig = thinking
  request.generationConfig = generationConfig
  if (isClaudeModel(model)) {
    request.toolConfig = { functionCallingConfig: { mode: 'VALIDATED' } }
  } else if (tools) {
    request.toolConfig = { functionCallingConfig: { mode: geminiToolChoiceMode(payload?.tool_choice) } }
  }

  return {
    model,
    project,
    userAgent: ANTIGRAVITY_BODY_USER_AGENT,
    requestType: 'agent',
    requestId: antigravityRequestId(),
    request,
  }
}

function finishReason(raw) {
  const value = String(raw ?? '').toUpperCase()
  if (value === 'MAX_TOKENS') return 'length'
  if (value.includes('TOOL') || value === 'MALFORMED_FUNCTION_CALL') return 'tool_calls'
  if (!value || value === 'STOP' || value === 'END_TURN') return 'stop'
  return 'stop'
}

export function collectAntigravityParts(body, { sessionId } = {}) {
  const response = body?.response ?? body
  const candidate = response?.candidates?.[0]
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
  let text = ''
  const toolCalls = []
  let pendingThoughtSig
  for (const part of parts) {
    if (!part) continue
    const partSig = thoughtSignatureOf(part, part.functionCall)
    if (part.thought) {
      if (partSig) pendingThoughtSig = partSig
      continue
    }
    if (typeof part.text === 'string') text += part.text
    if (part.functionCall?.name) {
      const signature = partSig ?? pendingThoughtSig
      pendingThoughtSig = undefined
      const call = {
        id: trimmed(part.functionCall.id)
          ? sanitizeAntigravityToolCallId(part.functionCall.id, part.functionCall.name)
          : `call_${toolCalls.length + 1}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args ?? {}),
        },
      }
      if (signature) {
        attachThoughtSignatureFields(call, signature)
        rememberThoughtSignature(sessionId, {
          id: call.id,
          name: part.functionCall.name,
          args: part.functionCall.args ?? {},
          signature,
        })
      }
      toolCalls.push(call)
    }
  }
  return {
    text,
    toolCalls,
    finishReason: finishReason(candidate?.finishReason),
    rawFinish: candidate?.finishReason,
    usage: response?.usageMetadata ?? body?.usageMetadata,
  }
}

/** Gemini usage plus CLI stats aliases (cache_read_tokens / cacheReadTokens). */
export function cachedTokensOf(usage) {
  if (usage == null || typeof usage !== 'object') return undefined
  const direct = asCount(
    usage.cachedContentTokenCount
    ?? usage.cached_content_token_count
    ?? usage.cachedTokenCount
    ?? usage.cached_tokens
    ?? usage.cache_read_tokens
    ?? usage.cacheReadTokens
    ?? usage.cacheReadInputTokens,
  )
  if (direct !== undefined) return direct
  const details = usage.cacheTokensDetails ?? usage.cache_tokens_details
  if (!Array.isArray(details)) return undefined
  let sum = 0
  let any = false
  for (const row of details) {
    const next = asCount(row?.tokenCount ?? row?.token_count)
    if (next === undefined) continue
    sum += next
    any = true
  }
  return any ? sum : undefined
}

/** OpenAI chat.completion usage. Thoughts count as completion tokens (and tok/s). */
export function mapAntigravityUsage(usage) {
  if (usage == null || typeof usage !== 'object') return undefined
  const prompt = usage.promptTokenCount ?? usage.prompt_token_count ?? 0
  const candidates = usage.candidatesTokenCount ?? usage.candidates_token_count ?? 0
  const thoughts = usage.thoughtsTokenCount ?? usage.thoughts_token_count ?? 0
  const completion = candidates + thoughts
  const mapped = {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: usage.totalTokenCount ?? usage.total_token_count ?? prompt + completion,
  }
  if (thoughts) {
    mapped.completion_tokens_details = { reasoning_tokens: thoughts }
  }
  const cached = cachedTokensOf(usage)
  if (cached !== undefined) {
    mapped.prompt_tokens_details = { cached_tokens: cached }
  }
  return mapped
}

/** Google SSE is cumulative; OpenAI deltas are suffixes. A shorter later frame is a reset. */
export function incrementalSuffix(next, previous) {
  const current = typeof next === 'string' ? next : ''
  const prior = typeof previous === 'string' ? previous : ''
  if (!current) return ''
  if (prior && current.startsWith(prior)) return current.slice(prior.length)
  return current
}

function openaiChunk({ id, model, delta, finish_reason, usage }) {
  const chunk = {
    id,
    object: 'chat.completion.chunk',
    model,
    choices: [{ index: 0, delta, finish_reason }],
  }
  if (usage) chunk.usage = usage
  return chunk
}

/**
 * Per-stream mapper: cumulative Google frames → incremental OpenAI chunks.
 * Thought parts stay out of `delta.content`; their tokens still land in usage.
 */
export function createAntigravityOpenaiStream({ model, id = `chatcmpl-${Date.now()}`, sessionId } = {}) {
  let emittedText = ''
  const emittedToolArgs = []
  let lastUsage
  let lastFinish = 'stop'
  let sawTools = false

  function applyEvent(body) {
    const collected = collectAntigravityParts(body, { sessionId })
    if (collected.usage) lastUsage = collected.usage
    if (collected.rawFinish) lastFinish = collected.finishReason
    if (collected.toolCalls.length) {
      sawTools = true
      lastFinish = 'tool_calls'
    }

    const delta = {}
    const textDelta = incrementalSuffix(collected.text, emittedText)
    if (textDelta) {
      delta.content = textDelta
      emittedText = collected.text
    }

    if (collected.toolCalls.length) {
      const calls = []
      for (let index = 0; index < collected.toolCalls.length; index++) {
        const call = collected.toolCalls[index]
        const prevArgs = emittedToolArgs[index]
        const args = call.function.arguments ?? ''
        const first = prevArgs === undefined
        const argDelta = incrementalSuffix(args, first ? '' : prevArgs)
        if (!first && !argDelta) continue
        emittedToolArgs[index] = args
        const next = {
          index,
          id: call.id,
          type: 'function',
          function: {
            name: call.function.name,
            arguments: argDelta,
          },
        }
        if (first && call.thoughtSignature) attachThoughtSignatureFields(next, call.thoughtSignature)
        calls.push(next)
      }
      if (calls.length) delta.tool_calls = calls
    }
    return delta
  }

  return {
    push(body) {
      const delta = applyEvent(body)
      if (!delta.content && !delta.tool_calls) return undefined
      return openaiChunk({ id, model, delta, finish_reason: null })
    },
    finish() {
      return openaiChunk({
        id,
        model,
        delta: {},
        finish_reason: sawTools ? 'tool_calls' : lastFinish,
        usage: mapAntigravityUsage(lastUsage),
      })
    },
  }
}

export function antigravityEventsToOpenaiChunks(events, opts) {
  const stream = createAntigravityOpenaiStream(opts)
  const chunks = []
  for (const event of events ?? []) {
    const chunk = stream.push(event)
    if (chunk) chunks.push(chunk)
  }
  chunks.push(stream.finish())
  return chunks
}

export function antigravityToOpenai(body, { model, id = `chatcmpl-${Date.now()}`, sessionId } = {}) {
  const collected = collectAntigravityParts(body, { sessionId })
  const message = { role: 'assistant', content: collected.text || null }
  if (collected.toolCalls.length) message.tool_calls = collected.toolCalls
  return {
    id,
    object: 'chat.completion',
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: collected.toolCalls.length ? 'tool_calls' : collected.finishReason,
    }],
    usage: mapAntigravityUsage(collected.usage),
  }
}

export function antigravityToOpenaiChunk(body, { model, id, done = false, sessionId } = {}) {
  const collected = collectAntigravityParts(body, { sessionId })
  const delta = {}
  if (collected.text) delta.content = collected.text
  if (collected.toolCalls.length) {
    delta.tool_calls = collected.toolCalls.map((call, index) => {
      const next = {
        index,
        id: call.id,
        type: 'function',
        function: call.function,
      }
      if (call.thoughtSignature) attachThoughtSignatureFields(next, call.thoughtSignature)
      return next
    })
  }
  const usage = mapAntigravityUsage(collected.usage)
  return {
    id,
    object: 'chat.completion.chunk',
    model,
    choices: [{
      index: 0,
      delta: done && !collected.text && !collected.toolCalls.length ? {} : delta,
      finish_reason: done ? (collected.toolCalls.length ? 'tool_calls' : collected.finishReason) : null,
    }],
    ...(usage ? { usage } : {}),
  }
}

export function parseAntigravitySseBlocks(buffer) {
  const events = []
  const chunks = String(buffer).split(/\r?\n\r?\n/)
  let rest = chunks.pop() ?? ''
  for (const block of chunks) {
    const data = block.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== '[DONE]')
      .join('\n')
    if (!data) continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // skip a partial or non-JSON frame
    }
  }
  return { events, rest }
}
