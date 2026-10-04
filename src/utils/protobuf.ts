/**
 * Protobuf wire primitives whose copies across family decoders were
 * byte-identical. Deliberately-different variants stay in their family
 * modules: cursor/proto.ts readVarint always resolves (never undefined) and
 * returns an offset key; devin/proto.ts readVarint is a BigInt superset with
 * a 70-group cap. Only the grok gRPC-web decoders share the strict Number
 * form below.
 */

export const WIRE_VARINT = 0
export const WIRE_FIXED64 = 1
export const WIRE_LEN = 2
export const WIRE_FIXED32 = 5

/**
 * Read one base-128 varint as a Number. Returns the value and the offset
 * past the last consumed byte, or undefined when the bytes run out or the
 * varint exceeds 63 shift bits (a malformed message — callers treat
 * undefined as decode failure, unlike the always-resolving cursor/devin
 * readers).
 */
export function readVarint(bytes, offset) {
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
