/**
 * Test-only Kiro eventstream encoder, moved from src/oauth/kiro/request.ts.
 * Only tests fabricate upstream \`application/vnd.amazon.eventstream\` bodies;
 * the plugin itself only decodes them, so the encoder lives next to its users.
 */

import { crc32 } from 'node:zlib'

function encodeOneHeader(name, type, valueBuf) {
  const nameBuf = Buffer.from(name)
  const row = Buffer.alloc(1 + nameBuf.length + 1 + valueBuf.length)
  row[0] = nameBuf.length
  nameBuf.copy(row, 1)
  row[1 + nameBuf.length] = type
  valueBuf.copy(row, 1 + nameBuf.length + 1)
  return row
}

function encodeEventHeaders(headers: Record<string, any>) {
  const parts: any[] = []
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
