/**
 * Minimal protobuf + Connect-RPC v1 framing for the Devin/Cascade subset this
 * hop sends and reads: GetChatMessage (server stream), GetUserJwt,
 * GetCliModelConfigs, GetUserStatus. Field numbers come from the exa.* protos
 * the Devin CLI 3000.10.31 binary implements, cross-checked against oh-my-pi
 * `pi-catalog`'s vendored copies. Do not vendor the generated tree.
 *
 * Verified live: GetCliModelConfigs / GetUserStatus (unary `application/proto`),
 * GetChatMessage (Connect+proto, gzip frames, JSON end trailer).
 */

import { gunzipSync, gzipSync } from 'node:zlib'

const WIRE_VARINT = 0
const WIRE_LEN = 2
const WIRE_FIXED64 = 1
const WIRE_FIXED32 = 5

export const CONNECT_FLAG_GZIP = 0x01
export const CONNECT_FLAG_END = 0x02
/**
 * The 4-byte length prefix is peer-controlled (up to 4 GiB). Cap it so a
 * corrupt stream fails fast instead of buffering gigabytes.
 */
export const MAX_CONNECT_FRAME_PAYLOAD = 16 * 1024 * 1024

export function encodeVarint(value) {
  let n = typeof value === 'bigint' ? value : BigInt(Math.max(0, Math.floor(Number(value) || 0)))
  const out: any[] = []
  while (n > 0x7fn) {
    out.push(Number(n & 0x7fn) | 0x80)
    n >>= 7n
  }
  out.push(Number(n & 0x7fn))
  return Buffer.from(out)
}

export function encodeKey(field, wire) {
  return encodeVarint(BigInt(field) * 8n + BigInt(wire))
}

export function encodeBytes(field, value) {
  const payload = Buffer.isBuffer(value) ? value : Buffer.from(value ?? [])
  return Buffer.concat([encodeKey(field, WIRE_LEN), encodeVarint(payload.length), payload])
}

export function encodeString(field, value) {
  return encodeBytes(field, Buffer.from(String(value ?? ''), 'utf8'))
}

export function encodeBool(field, value) {
  return Buffer.concat([encodeKey(field, WIRE_VARINT), encodeVarint(value ? 1 : 0)])
}

export function encodeUint(field, value) {
  return Buffer.concat([encodeKey(field, WIRE_VARINT), encodeVarint(value)])
}

export function encodeDouble(field, value) {
  const buf = Buffer.alloc(8)
  buf.writeDoubleLE(Number.isFinite(value) ? value : 0, 0)
  return Buffer.concat([encodeKey(field, WIRE_FIXED64), buf])
}

export function encodeMessage(field, bytes) {
  return encodeBytes(field, bytes ?? Buffer.alloc(0))
}

export function readVarint(buf, offset = 0) {
  let n = 0
  let shift = 0n
  let big = 0n
  let i = offset
  while (i < buf.length) {
    const b = buf[i++]
    big |= BigInt(b & 0x7f) << shift
    n += (b & 0x7f) * 2 ** Number(shift)
    shift += 7n
    if ((b & 0x80) === 0) return { value: n, bigint: big, offset: i }
    if (shift > 70n) break
  }
  return { value: n, bigint: big, offset: i }
}

export function decodeFields(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? [])
  const fields: any[] = []
  let offset = 0
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset)
    if (tag.offset === offset) break
    offset = tag.offset
    const field = Number(tag.bigint >> 3n)
    const wire = Number(tag.bigint & 7n)
    if (wire === WIRE_VARINT) {
      const next = readVarint(bytes, offset)
      fields.push({ field, wire, varint: next.value, bigint: next.bigint })
      offset = next.offset
    } else if (wire === WIRE_LEN) {
      const len = readVarint(bytes, offset)
      const start = len.offset
      const end = start + Number(len.bigint)
      fields.push({ field, wire, bytes: bytes.subarray(start, Math.min(end, bytes.length)) })
      offset = Math.min(end, bytes.length)
    } else if (wire === WIRE_FIXED64) {
      fields.push({ field, wire, bytes: bytes.subarray(offset, offset + 8) })
      offset += 8
    } else if (wire === WIRE_FIXED32) {
      fields.push({ field, wire, bytes: bytes.subarray(offset, offset + 4) })
      offset += 4
    } else {
      break
    }
  }
  return fields
}

export function fieldBytes(fields, number) {
  return fields.filter((row) => row.field === number && row.bytes).map((row) => row.bytes)
}

export function fieldString(fields, number) {
  const row = fields.find((item) => item.field === number && item.bytes)
  return row ? row.bytes.toString('utf8') : undefined
}

export function fieldVarint(fields, number) {
  const row = fields.find((item) => item.field === number && item.varint !== undefined)
  return row?.varint
}

/** int64/uint64 past 2^53 stays a BigInt; small values come back as Number. */
export function fieldBigint(fields, number) {
  const row = fields.find((item) => item.field === number && item.bigint !== undefined)
  return row?.bigint
}

export function fieldBool(fields, number) {
  const row = fieldVarint(fields, number)
  return row === undefined ? undefined : row !== 0
}

/* ---- Metadata (codeium_common.proto) ------------------------------------ */

export function encodeDevinMetadata({ apiKey, userJwt, ideName, ideVersion, extensionName, extensionVersion, locale, os, modelDisplays }: any = {}) {
  const parts: any[] = []
  if (ideName) parts.push(encodeString(1, ideName))
  if (extensionVersion) parts.push(encodeString(2, extensionVersion))
  if (apiKey) parts.push(encodeString(3, apiKey))
  if (locale) parts.push(encodeString(4, locale))
  if (os) parts.push(encodeString(5, os))
  if (ideVersion) parts.push(encodeString(7, ideVersion))
  if (extensionName) parts.push(encodeString(12, extensionName))
  if (userJwt) parts.push(encodeString(21, userJwt))
  // supported_model_displays: packed DisplayOption enum the CLI advertises on
  // catalog RPCs (MITM: bytes 03 04 06 07 08; the vendored proto only names
  // 0-4 — the tail values are newer server-side entries).
  if (modelDisplays?.length) parts.push(encodeBytes(30, Buffer.from(modelDisplays)))
  return Buffer.concat(parts)
}

/* ---- AuthService/GetUserJwt (auth.proto) --------------------------------- */

export function encodeGetUserJwtRequest(metadataBytes) {
  return encodeMessage(1, metadataBytes)
}

export function decodeGetUserJwtResponse(buf) {
  const fields = decodeFields(buf)
  return {
    userJwt: fieldString(fields, 1),
    customApiServerUrl: fieldString(fields, 2),
  }
}

/* ---- ChatMessagePrompt / tools (chat.proto + codeium_common.proto) -------- */

export const DEVIN_SOURCE_USER = 1
export const DEVIN_SOURCE_SYSTEM = 2
export const DEVIN_SOURCE_TOOL = 4

export function encodeChatToolCall({ id, name, argumentsJson }: any = {}) {
  const parts: any[] = []
  if (id) parts.push(encodeString(1, id))
  if (name) parts.push(encodeString(2, name))
  if (argumentsJson !== undefined) parts.push(encodeString(3, argumentsJson ?? ''))
  return Buffer.concat(parts)
}

export function decodeChatToolCall(buf) {
  const fields = decodeFields(buf)
  return {
    id: fieldString(fields, 1),
    name: fieldString(fields, 2),
    argumentsJson: fieldString(fields, 3),
  }
}

export function encodeImageData({ base64Data, mimeType }: any = {}) {
  return Buffer.concat([
    encodeString(1, base64Data ?? ''),
    encodeString(2, mimeType ?? ''),
  ])
}

export function encodeChatMessagePrompt({
  messageId,
  source,
  prompt,
  toolCalls = [],
  toolCallId,
  toolResultIsError,
  images = [],
  thinking,
  signature,
}: any = {}) {
  const parts: any[] = []
  if (messageId) parts.push(encodeString(1, messageId))
  if (source !== undefined) parts.push(encodeUint(2, source))
  if (prompt !== undefined) parts.push(encodeString(3, prompt ?? ''))
  for (const call of toolCalls) parts.push(encodeMessage(6, encodeChatToolCall(call)))
  if (toolCallId) parts.push(encodeString(7, toolCallId))
  if (toolResultIsError) parts.push(encodeBool(9, true))
  for (const image of images) parts.push(encodeMessage(10, encodeImageData(image)))
  if (thinking) parts.push(encodeString(11, thinking))
  if (signature) parts.push(encodeString(12, signature))
  return Buffer.concat(parts)
}

export function encodeChatToolDefinition({ name, description, jsonSchemaString, strict }: any = {}) {
  const parts = [
    encodeString(1, name ?? ''),
    encodeString(2, description ?? ''),
    encodeString(3, jsonSchemaString ?? '{}'),
  ]
  if (strict) parts.push(encodeBool(12, true))
  return Buffer.concat(parts)
}

export function encodeChatToolChoice({ optionName, toolName }: any = {}) {
  if (toolName) return encodeString(2, toolName)
  return encodeString(1, optionName ?? 'auto')
}

/** PromptCacheOptions { type = 1 } — CACHE_CONTROL_TYPE_EPHEMERAL = 1. */
export function encodePromptCacheOptions(type = 1) {
  return encodeUint(1, type)
}

/* ---- GetChatMessage (api_server.proto) ------------------------------------ */

export const DEVIN_REQUEST_TYPE_CASCADE = 5
export const DEVIN_PLANNER_MODE_DEFAULT = 1

export function encodeCompletionConfiguration({
  maxTokens = 64_000,
  temperature = 0.4,
  topP = 1,
  stopPatterns = [],
}: any = {}) {
  const parts = [
    encodeUint(1, 1), // num_completions
    encodeUint(2, maxTokens),
    encodeUint(3, 200), // max_newlines
    encodeDouble(5, temperature),
    encodeDouble(6, temperature), // first_temperature
    encodeUint(7, 50), // top_k
    encodeDouble(8, topP),
  ]
  for (const pattern of stopPatterns) parts.push(encodeString(9, pattern))
  parts.push(encodeDouble(11, 1)) // fim_eot_prob_threshold
  return Buffer.concat(parts)
}

export function encodeGetChatMessageRequest({
  metadata,
  prompt,
  chatMessagePrompts = [],
  chatModelUid,
  configuration,
  tools = [],
  toolChoice,
  cascadeId,
  executionId,
  plannerMode = DEVIN_PLANNER_MODE_DEFAULT,
  requestType = DEVIN_REQUEST_TYPE_CASCADE,
}: any = {}) {
  const parts = [
    encodeMessage(1, metadata),
    encodeString(2, prompt ?? ''),
  ]
  for (const entry of chatMessagePrompts) parts.push(encodeMessage(3, entry))
  parts.push(encodeUint(7, requestType))
  if (configuration) parts.push(encodeMessage(8, configuration))
  for (const tool of tools) parts.push(encodeMessage(10, encodeChatToolDefinition(tool)))
  parts.push(encodeBool(11, true)) // disable_parallel_tool_calls
  parts.push(encodeMessage(12, encodeChatToolChoice(toolChoice ?? { optionName: 'auto' })))
  parts.push(encodeMessage(13, encodePromptCacheOptions(1)))
  if (cascadeId) parts.push(encodeString(16, cascadeId))
  parts.push(encodeUint(20, plannerMode))
  if (chatModelUid) parts.push(encodeString(21, chatModelUid))
  if (executionId) parts.push(encodeString(22, executionId))
  return Buffer.concat(parts)
}

export const DEVIN_STOP_REASON_MAX_TOKENS = 3
export const DEVIN_STOP_REASON_FUNCTION_CALL = 10
export const DEVIN_STOP_REASON_ERROR = 13

function decodeModelUsageStats(buf) {
  const fields = decodeFields(buf)
  return {
    modelUid: fieldString(fields, 9),
    inputTokens: Number(fieldBigint(fields, 2) ?? 0n),
    outputTokens: Number(fieldBigint(fields, 3) ?? 0n),
    cacheWriteTokens: Number(fieldBigint(fields, 4) ?? 0n),
    cacheReadTokens: Number(fieldBigint(fields, 5) ?? 0n),
  }
}

export function decodeGetChatMessageResponse(buf) {
  const fields = decodeFields(buf)
  const usageBytes = fieldBytes(fields, 7)[0]
  return {
    messageId: fieldString(fields, 1),
    deltaText: fieldString(fields, 3),
    deltaTokens: fieldVarint(fields, 4),
    stopReason: fieldVarint(fields, 5),
    deltaToolCalls: fieldBytes(fields, 6).map(decodeChatToolCall),
    usage: usageBytes ? decodeModelUsageStats(usageBytes) : undefined,
    deltaThinking: fieldString(fields, 9),
    deltaSignature: fieldString(fields, 10),
    actualModelUid: fieldString(fields, 23),
  }
}

/* ---- GetCliModelConfigs (api_server.proto) -------------------------------- */

export function encodeGetCliModelConfigsRequest(metadataBytes) {
  return encodeMessage(1, metadataBytes)
}

function decodeModelInfo(buf) {
  const fields = decodeFields(buf)
  return {
    modelUid: fieldString(fields, 17),
    maxTokens: fieldVarint(fields, 4),
    maxOutputTokens: fieldVarint(fields, 13),
    modelFamilyUid: fieldString(fields, 23),
    isModelRouter: fieldBool(fields, 25),
  }
}

function decodeClientModelConfig(buf) {
  const fields = decodeFields(buf)
  const infoBytes = fieldBytes(fields, 23)[0]
  const familyBytes = fieldBytes(fields, 30)[0]
  const family = familyBytes ? decodeFields(familyBytes) : []
  return {
    label: fieldString(fields, 1),
    modelUid: fieldString(fields, 22),
    disabled: fieldBool(fields, 4) === true,
    supportsImages: fieldBool(fields, 5) === true,
    isPremium: fieldBool(fields, 7) === true,
    isBeta: fieldBool(fields, 9) === true,
    isRecommended: fieldBool(fields, 11) === true,
    maxTokens: fieldVarint(fields, 18),
    description: fieldString(fields, 27),
    isDefaultInFamily: fieldBool(fields, 31) === true,
    modelInfo: infoBytes ? decodeModelInfo(infoBytes) : undefined,
    familyLabel: fieldString(family, 1),
    familyDefault: fieldBool(family, 3) === true,
  }
}

export function decodeGetCliModelConfigsResponse(buf) {
  const fields = decodeFields(buf)
  return fieldBytes(fields, 1).map(decodeClientModelConfig)
}

/* ---- SeatManagementService/GetUserStatus (seat_management.proto) ---------- */

export function encodeGetUserStatusRequest(metadataBytes) {
  return encodeMessage(1, metadataBytes)
}

function decodeTimestamp(buf) {
  const fields = decodeFields(buf)
  const seconds = fieldBigint(fields, 1)
  return seconds === undefined ? undefined : Number(seconds) * 1000
}

function decodeDevinPlanInfo(buf) {
  const fields = decodeFields(buf)
  return {
    canUseCli: fieldBool(fields, 2),
    webappHost: fieldString(fields, 5),
    apiUrl: fieldString(fields, 7),
    accountDisplayName: fieldString(fields, 8),
  }
}

function decodePlanInfo(buf) {
  const fields = decodeFields(buf)
  const devinBytes = fieldBytes(fields, 33)[0]
  return {
    teamsTier: fieldVarint(fields, 1),
    planName: fieldString(fields, 2),
    devinInfo: devinBytes ? decodeDevinPlanInfo(devinBytes) : undefined,
    isDevin: fieldBool(fields, 34),
    hideDailyQuota: fieldBool(fields, 36) === true,
    hideWeeklyQuota: fieldBool(fields, 37) === true,
  }
}

function decodePlanStatus(buf) {
  const fields = decodeFields(buf)
  const planBytes = fieldBytes(fields, 1)[0]
  return {
    planInfo: planBytes ? decodePlanInfo(planBytes) : undefined,
    planStart: fieldBytes(fields, 2).map(decodeTimestamp)[0],
    planEnd: fieldBytes(fields, 3).map(decodeTimestamp)[0],
    availablePromptCredits: fieldVarint(fields, 8),
    usedPromptCredits: fieldVarint(fields, 6),
    dailyQuotaRemainingPercent: fieldVarint(fields, 14),
    weeklyQuotaRemainingPercent: fieldVarint(fields, 15),
    dailyQuotaResetAt: (() => {
      const v = fieldBigint(fields, 17)
      return v === undefined ? undefined : Number(v) * 1000
    })(),
    weeklyQuotaResetAt: (() => {
      const v = fieldBigint(fields, 18)
      return v === undefined ? undefined : Number(v) * 1000
    })(),
  }
}

function decodeUserStatus(buf) {
  const fields = decodeFields(buf)
  const planBytes = fieldBytes(fields, 13)[0]
  return {
    pro: fieldBool(fields, 1),
    name: fieldString(fields, 3),
    teamId: fieldString(fields, 5),
    email: fieldString(fields, 7),
    teamsTier: fieldVarint(fields, 10),
    planStatus: planBytes ? decodePlanStatus(planBytes) : undefined,
    userId: fieldString(fields, 36),
  }
}

export function decodeGetUserStatusResponse(buf) {
  const fields = decodeFields(buf)
  const userBytes = fieldBytes(fields, 1)[0]
  const planBytes = fieldBytes(fields, 2)[0]
  return {
    userStatus: userBytes ? decodeUserStatus(userBytes) : undefined,
    planInfo: planBytes ? decodePlanInfo(planBytes) : undefined,
  }
}

/* ---- Connect framing ------------------------------------------------------- */

/** Compress then frame: flag bit 0x01 marks a gzipped payload, 0x02 the JSON trailer. */
export function frameConnect(payload, { compress = true, end = false } = {}) {
  const body = compress ? gzipSync(Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? [])) : (payload ?? Buffer.alloc(0))
  const frame = Buffer.alloc(5 + body.length)
  frame[0] = (compress ? CONNECT_FLAG_GZIP : 0) | (end ? CONNECT_FLAG_END : 0)
  frame.writeUInt32BE(body.length, 1)
  body.copy(frame, 5)
  return frame
}

/**
 * Split a buffered chunk into Connect frames. Returns `{ frames, rest }`;
 * a declared payload over MAX_CONNECT_FRAME_PAYLOAD throws before buffering.
 */
export function splitConnectFrames(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? [])
  const frames: any[] = []
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset]
    const length = bytes.readUInt32BE(offset + 1)
    if (length > MAX_CONNECT_FRAME_PAYLOAD) {
      throw new Error(`Devin Connect frame length ${length} exceeds ${MAX_CONNECT_FRAME_PAYLOAD}-byte cap`)
    }
    if (offset + 5 + length > bytes.length) break
    frames.push({
      flags,
      end: (flags & CONNECT_FLAG_END) !== 0,
      compressed: (flags & CONNECT_FLAG_GZIP) !== 0,
      payload: bytes.subarray(offset + 5, offset + 5 + length),
    })
    offset += 5 + length
  }
  return { frames, rest: bytes.subarray(offset) }
}

export function unframePayload(frame) {
  if (!frame.compressed) return frame.payload
  try {
    return gunzipSync(frame.payload)
  } catch {
    return frame.payload
  }
}

/** Unary replies arrive as raw proto, a single Connect frame, or gzipped. */
export function decodeUnaryBody(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? [])
  try {
    return gunzipSync(bytes)
  } catch {
    // not gzip — try Connect framing, then raw proto
  }
  if (bytes.length >= 5) {
    try {
      const { frames } = splitConnectFrames(bytes)
      const hit = frames.find((frame) => !frame.end && frame.payload.length)
      if (hit) return unframePayload(hit)
    } catch {
      // fall through to raw
    }
  }
  return bytes
}

/** Connect end trailer: `{ error: { code, message } }` or `{}` on success. */
export function connectTrailerError(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return undefined
  let parsed
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return trimmed.slice(0, 300)
  }
  const error = parsed?.error
  if (!error) return undefined
  const message = [error.code, error.message].filter((part) => typeof part === 'string' && part.trim()).join(': ')
  return message || JSON.stringify(error).slice(0, 300)
}
