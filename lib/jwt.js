/** Minimal JWT payload decoding for claims extraction (no signature verification). */

/**
 * Decode a JWT payload without verifying the signature. Used only to read
 * account claims from tokens issued over the provider's own TLS channel
 * during a code exchange we initiated — never to authorize anything.
 */
export function decodeJwtPayload(token) {
  if (typeof token !== 'string' || token.length === 0) return undefined
  const parts = token.split('.')
  if (parts.length < 2) return undefined
  let parsed
  try {
    parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
  return parsed
}
