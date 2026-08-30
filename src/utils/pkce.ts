/** PKCE (RFC 7636) and random-token helpers for the OAuth login flows. */

import { createHash, randomBytes } from 'node:crypto'

/** Base64url-encode without padding. */
export function base64url(buffer) {
  return buffer.toString('base64url')
}

/** Mint a fresh PKCE pair (32-byte verifier, S256 challenge). */
export function createPkce() {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

/** Mint a URL-safe random token (default 32 bytes) for OAuth `state`. */
export function randomToken(bytes = 32) {
  return base64url(randomBytes(bytes))
}

/** Mint lowercase-hex random bytes (for Grok's `nonce` parameter). */
export function randomHex(bytes = 8) {
  return randomBytes(bytes).toString('hex')
}
