/**
 * OAuth token-endpoint error vocabulary. A leaf module (no imports) so family
 * modules can share it without value-importing tokens.js, which owns refresh
 * coalescing and imports the store.
 */

/** Grant errors every OAuth token endpoint uses for a dead login (RFC 6749 §5.2). */
const PERMANENT_REFRESH_CODES = ['invalid_grant', 'invalid_client', 'unauthorized_client']

export class OAuthEndpointError extends Error {
  declare status: any
  declare oauthCode: any

  constructor(message, status?, oauthCode?) {
    super(message)
    this.name = 'OAuthEndpointError'
    this.status = status
    this.oauthCode = oauthCode
  }
}

/** The OAuth error code in a token-endpoint body: `error` / `error_code`, or `error.code`. */
export function oauthCodeOf(body) {
  let parsed
  try { parsed = JSON.parse(body) } catch { return undefined }
  const error = parsed?.error
  const code = error && typeof error === 'object' ? error.code : error ?? parsed?.error_code
  return typeof code === 'string' && code.length > 0 ? code : undefined
}

export async function oauthError(response, label) {
  let body = ''
  try { body = await response.text() } catch { body = '' }
  const code = oauthCodeOf(body)
  try {
    const parsed = JSON.parse(body)
    const description = parsed.error_description ?? parsed.message
    if (typeof description === 'string' && description.length > 0) {
      return new OAuthEndpointError(`${label}: ${description}`, response.status, code)
    }
  } catch {
    // not JSON
  }
  return new OAuthEndpointError(`${label} request failed (HTTP ${response.status})${body ? `: ${body.slice(0, 240)}` : ''}`, response.status, code)
}

/**
 * The only test for "this login is gone": a structured 401 `status` or an
 * OAuth grant code — the shared ones plus the family's `extraCodes`. 403 /
 * 429 / 5xx and digits in message text are transient: deleting a login on
 * them logs the user out over a blip.
 */
export function isPermanentRefreshFailure(error, extraCodes: readonly string[] = []) {
  if (error?.status === 401) return true
  const code = error?.oauthCode
  return typeof code === 'string' && (PERMANENT_REFRESH_CODES.includes(code) || extraCodes.includes(code))
}
