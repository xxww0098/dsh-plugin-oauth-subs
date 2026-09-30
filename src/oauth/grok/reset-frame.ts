/**
 * gRPC-web codec for grok.com reset cards (「重置卡」):
 *   POST grok.com/prod_mc_billing.ConsumerUiSvc/GetRemainingResets  (empty request)
 *   POST grok.com/prod_mc_billing.ConsumerUiSvc/RedeemReset         (token_id = field 10)
 *
 * The grok CLI (1.0.44) has no client for either RPC; grok.com's web usage page
 * does. References: stablyai/orca PR #18116 (live GetRemainingResets hex) and
 * diegosouzapw/OmniRoute dd263fe (redeem status mapping).
 *
 * Response: repeated top-level field 10 = ConsumerResetToken. orca's live
 * capture numbers the token fields 10 (id) / 20 (granted) / 30 (expires, a
 * google.protobuf.Timestamp); OmniRoute's notes say 1 / 2 / 3 with bare unix
 * seconds. Both shapes decode. An empty DATA frame + grpc-status 0 is a real
 * zero-card inventory.
 *
 * Token ids (`restok_…`) redeem a card for whoever holds the bearer, so they
 * never leave the host: the public id is a hash, resolved by re-listing.
 */

import { createHash } from 'node:crypto'

const WIRE_VARINT = 0
const WIRE_FIXED64 = 1
const WIRE_LEN = 2
const WIRE_FIXED32 = 5
const TRAILER_FLAG = 0x80
const FIELD_TOKEN = 10
const TOKEN_ID_FIELDS = [10, 1]
const TOKEN_GRANTED_FIELDS = [20, 2]
const TOKEN_EXPIRES_FIELDS = [30, 3]
const REDEEM_TOKEN_ID_FIELD = 10

function readVarint(bytes, offset) {
  let value = 0
  let shift = 0
  let index = offset
  while (index < bytes.length) {
    const byte = bytes[index]
    index += 1
    value += (byte & 0x7f) * 2 ** shift
    if ((byte & 0x80) === 0) return { value, next: index }
    shift += 7
    if (shift > 63) return undefined
  }
  return undefined
}

function encodeVarint(value) {
  const out: number[] = []
  let n = Math.floor(value)
  while (n > 0x7f) {
    out.push((n % 128) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
  return Buffer.from(out)
}

/** Every field in order (repeats kept); undefined on a malformed message. */
function walkFields(bytes) {
  const fields: any[] = []
  let offset = 0
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset)
    if (!tag) return undefined
    const field = Math.floor(tag.value / 8)
    const wireType = tag.value % 8
    offset = tag.next
    if (field <= 0) return undefined
    if (wireType === WIRE_VARINT) {
      const next = readVarint(bytes, offset)
      if (!next) return undefined
      fields.push({ field, wireType, value: next.value })
      offset = next.next
    } else if (wireType === WIRE_LEN) {
      const length = readVarint(bytes, offset)
      if (!length || length.next + length.value > bytes.length) return undefined
      fields.push({ field, wireType, bytes: bytes.subarray(length.next, length.next + length.value) })
      offset = length.next + length.value
    } else if (wireType === WIRE_FIXED64 || wireType === WIRE_FIXED32) {
      const size = wireType === WIRE_FIXED64 ? 8 : 4
      if (offset + size > bytes.length) return undefined
      offset += size
    } else {
      return undefined
    }
  }
  return fields
}

/** Unix seconds as a bare varint, or a Timestamp message { 1: seconds }. */
function stampMs(entry) {
  if (!entry) return undefined
  if (entry.wireType === WIRE_VARINT) return entry.value > 0 ? entry.value * 1000 : undefined
  if (entry.wireType !== WIRE_LEN) return undefined
  const seconds = walkFields(entry.bytes)?.find((row) => row.field === 1 && row.wireType === WIRE_VARINT)
  return seconds && seconds.value > 0 ? seconds.value * 1000 : undefined
}

function pick(fields, numbers, wireType?) {
  for (const number of numbers) {
    const hit = fields.find((row) => row.field === number && (wireType === undefined || row.wireType === wireType))
    if (hit) return hit
  }
  return undefined
}

/** Split a gRPC-web body into its data payload and trailer status/message. */
export function readGrokRpc(buffer, headerStatus?, headerMessage?) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? [])
  let payload = Buffer.alloc(0)
  let status: string | undefined
  let message: string | undefined
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset]
    const length = bytes.readUInt32BE(offset + 1)
    const end = offset + 5 + length
    if (end > bytes.length) break
    const chunk = bytes.subarray(offset + 5, end)
    if (flags & TRAILER_FLAG) {
      for (const line of chunk.toString('utf8').split(/\r?\n/)) {
        const cut = line.indexOf(':')
        if (cut <= 0) continue
        const key = line.slice(0, cut).trim().toLowerCase()
        const value = line.slice(cut + 1).trim()
        if (key === 'grpc-status') status = value
        if (key === 'grpc-message') message = safeDecode(value)
      }
    } else {
      payload = chunk
    }
    offset = end
  }
  return {
    payload,
    grpcStatus: status ?? (headerStatus ? String(headerStatus).trim() : undefined),
    grpcMessage: message ?? (headerMessage ? safeDecode(String(headerMessage)) : undefined),
  }
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

/** Public card id: stable per token, useless without the host's re-list. */
export function grokResetCardId(tokenId) {
  return `grok-${createHash('sha256').update(String(tokenId)).digest('hex').slice(0, 16)}`
}

/**
 * GetRemainingResets payload → live tokens, earliest expiry first. Expired
 * tokens are dropped; undefined when the message itself is malformed.
 */
export function decodeGrokResetTokens(payload, now = Date.now()) {
  const top = walkFields(Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? []))
  if (!top) return undefined
  const tokens: any[] = []
  for (const entry of top) {
    if (entry.field !== FIELD_TOKEN || entry.wireType !== WIRE_LEN) continue
    const inner = walkFields(entry.bytes)
    if (!inner) return undefined
    const idField = pick(inner, TOKEN_ID_FIELDS, WIRE_LEN)
    const tokenId = idField ? Buffer.from(idField.bytes).toString('utf8').trim() : ''
    if (!tokenId) continue
    const expiresAt = stampMs(pick(inner, TOKEN_EXPIRES_FIELDS))
    if (expiresAt !== undefined && expiresAt <= now) continue
    const grantedAt = stampMs(pick(inner, TOKEN_GRANTED_FIELDS))
    tokens.push({ tokenId, ...(grantedAt === undefined ? {} : { grantedAt }), ...(expiresAt === undefined ? {} : { expiresAt }) })
  }
  tokens.sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity))
  return tokens
}

/** Tokens → the shared resetCredits bank (ids hashed, token ids dropped). */
export function grokResetBank(tokens) {
  const credits = tokens.map((token) => ({
    id: grokResetCardId(token.tokenId),
    status: 'available',
    ...(token.expiresAt === undefined ? {} : { expiresAt: token.expiresAt }),
  }))
  const nextExpiresAt = credits.find((credit) => credit.expiresAt !== undefined)?.expiresAt
  return { availableCount: credits.length, credits, ...(nextExpiresAt === undefined ? {} : { nextExpiresAt }) }
}

/** One gRPC-web data frame. */
export function grokRpcFrame(payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(5)
  header.writeUInt32BE(payload.length, 1)
  return Buffer.concat([header, payload])
}

/** ConsumerRedeemResetReq { token_id = 10 }, framed. */
export function grokRedeemResetFrame(tokenId) {
  const body = Buffer.from(String(tokenId), 'utf8')
  return grokRpcFrame(Buffer.concat([encodeVarint((REDEEM_TOKEN_ID_FIELD << 3) | WIRE_LEN), encodeVarint(body.length), body]))
}

/**
 * RedeemReset status → outcome. 0 = reset; 9 "already …" = this token was
 * already spent (a retry after a lost answer — treat as done); 9 otherwise
 * or 3 "token_id" = no such card. Anything else is a failure.
 */
export function grokRedeemOutcome(grpcStatus, grpcMessage?) {
  if (grpcStatus === '0') return 'reset'
  const message = String(grpcMessage ?? '').toLowerCase()
  if (grpcStatus === '9') return message.includes('already') ? 'alreadyRedeemed' : 'noCredit'
  if (grpcStatus === '3' && message.includes('token_id')) return 'noCredit'
  return 'failed'
}
