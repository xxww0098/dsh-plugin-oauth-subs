/**
 * gRPC-web decoder for grok.com GetGrokCreditsConfig.
 *
 * Live captures (2026-07/08): top-level field 1 is a nested credits message.
 *   field 1  fixed32  usage — either a 0–1 ratio or a 0–100 percent
 *   field 5  message  google.protobuf.Timestamp { seconds, nanos }
 *
 * CLI JSON at /v1/billing?format=credits often omits creditUsagePercent for
 * unified-billing SuperGrok / X Premium+ accounts. This endpoint still has
 * the weekly pool.
 */

export const GROK_WEB_EMPTY_FRAME = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00])

const WIRE_VARINT = 0
const WIRE_FIXED64 = 1
const WIRE_LEN = 2
const WIRE_FIXED32 = 5
const TRAILER_FLAG = 0x80

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

function readLength(bytes, offset, size) {
  if (offset + size > bytes.length) return undefined
  return { bytes: bytes.subarray(offset, offset + size), next: offset + size }
}

function decodeFields(bytes) {
  const fields = new Map()
  let offset = 0
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset)
    if (!tag) break
    const fieldNumber = Math.floor(tag.value / 8)
    const wireType = tag.value % 8
    offset = tag.next
    if (fieldNumber <= 0) return undefined
    let value
    if (wireType === WIRE_VARINT) {
      const next = readVarint(bytes, offset)
      if (!next) return undefined
      value = { wireType, value: next.value }
      offset = next.next
    } else if (wireType === WIRE_FIXED32) {
      const next = readLength(bytes, offset, 4)
      if (!next) return undefined
      value = { wireType, bytes: next.bytes }
      offset = next.next
    } else if (wireType === WIRE_FIXED64) {
      const next = readLength(bytes, offset, 8)
      if (!next) return undefined
      value = { wireType, bytes: next.bytes }
      offset = next.next
    } else if (wireType === WIRE_LEN) {
      const length = readVarint(bytes, offset)
      if (!length) return undefined
      const next = readLength(bytes, length.next, length.value)
      if (!next) return undefined
      value = { wireType, bytes: next.bytes }
      offset = next.next
    } else {
      return undefined
    }
    if (!fields.has(fieldNumber)) fields.set(fieldNumber, value)
  }
  return fields
}

function float32Le(field) {
  if (!field || field.wireType !== WIRE_FIXED32 || !field.bytes || field.bytes.length < 4) {
    return undefined
  }
  const value = Buffer.from(field.bytes).readFloatLE(0)
  return Number.isFinite(value) ? value : undefined
}

function timestampMs(field) {
  if (!field || field.wireType !== WIRE_LEN || !field.bytes) return undefined
  const nested = decodeFields(field.bytes)
  if (!nested) return undefined
  const seconds = nested.get(1)?.wireType === WIRE_VARINT ? nested.get(1).value : 0
  const nanos = nested.get(2)?.wireType === WIRE_VARINT ? nested.get(2).value : 0
  if (!seconds && !nanos) return undefined
  const stamp = seconds * 1000 + Math.round(nanos / 1e6)
  return stamp > 0 ? stamp : undefined
}

function asUsedPercent(value) {
  if (value === undefined || !Number.isFinite(value) || value < 0) return undefined
  if (value <= 1) return Math.max(0, Math.min(100, Math.round(value * 100)))
  if (value <= 100) return Math.max(0, Math.min(100, Math.round(value)))
  return undefined
}

function grpcFrames(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const data = []
  const trailers = {}
  let offset = 0
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset]
    const length = bytes.readUInt32BE(offset + 1)
    const start = offset + 5
    const end = start + length
    if (length < 0 || end > bytes.length) break
    const payload = bytes.subarray(start, end)
    if (flags & TRAILER_FLAG) {
      const text = payload.toString('utf8')
      for (const line of text.split(/\r?\n/)) {
        const cut = line.indexOf(':')
        if (cut <= 0) continue
        const key = line.slice(0, cut).trim().toLowerCase()
        const value = decodeURIComponent(line.slice(cut + 1).trim() || '')
        trailers[key] = value
      }
    } else {
      data.push(payload)
    }
    offset = end
  }
  return { data, trailers, framed: offset > 0 }
}

function looksLikeProtobuf(bytes) {
  if (!bytes.length) return false
  const fieldNumber = bytes[0] >> 3
  const wireType = bytes[0] & 0x07
  return fieldNumber > 0 && (wireType === 0 || wireType === 1 || wireType === 2 || wireType === 5)
}

export function decodeGrokCreditsFrame(buffer) {
  try {
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
    if (!bytes.length) return undefined
    const frames = grpcFrames(bytes)
    const status = frames.trailers['grpc-status']
    if (status && status !== '0') return undefined
    const payload = frames.data[0]
      ?? (frames.framed ? undefined : (looksLikeProtobuf(bytes) ? bytes : undefined))
    if (!payload || !payload.length) return undefined
    const top = decodeFields(payload)
    if (!top) return undefined
    const nested = top.get(1)?.wireType === WIRE_LEN ? decodeFields(top.get(1).bytes) : undefined
    const credits = nested ?? top
    if (!credits) return undefined
    const usedPercent = asUsedPercent(float32Le(credits.get(1)))
    const resetAt = timestampMs(credits.get(5)) ?? timestampMs(credits.get(4))
    if (usedPercent === undefined && resetAt === undefined) return undefined
    return { usedPercent, resetAt }
  } catch {
    return undefined
  }
}
