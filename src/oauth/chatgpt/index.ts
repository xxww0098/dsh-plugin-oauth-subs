/**
 * Sign in with ChatGPT — the official open-source client flow
 * (developers.openai.com/siwc/token-sharing-open-source).
 *
 * First sign-in registers a user/workspace-bound client with
 * `client_id=dynamic_agent_client`; the callback returns the issued
 * `oaiapp_…` client id, which every later exchange, refresh, revocation and
 * reauthorization uses. The resulting access token is a Bearer for the public
 * Responses API (`api.openai.com/v1/responses`) — never chatgpt.com
 * `backend-api`. No client secret, no partner key.
 *
 * Mirrors earendil-works/pi `auth/oauth/openai-chatgpt.ts`, openclaw
 * `extensions/openai/token-sharing-oauth.runtime.ts` and pingdotgg/t3code
 * `CodexChatGptAuth.ts` (see README 归因).
 */

import { createPublicKey, verify as verifySignature } from 'node:crypto'
import { catalogRows } from '../../catalog/index.js'
import { decodeJwtPayload } from '../../utils/jwt.js'
import { outboundFetch } from '../../utils/outbound.js'
import { randomToken } from '../../utils/pkce.js'
import { OAuthEndpointError, oauthError } from '../errors.js'

export const CHATGPT_ISSUER = 'https://auth.openai.com'
export const CHATGPT_AUTHORIZE_URL = `${CHATGPT_ISSUER}/api/accounts/authorize`
export const CHATGPT_TOKEN_URL = `${CHATGPT_ISSUER}/api/accounts/oauth/token`
export const CHATGPT_REVOKE_URL = `${CHATGPT_ISSUER}/api/accounts/oauth/revoke`
export const CHATGPT_JWKS_URL = `${CHATGPT_ISSUER}/.well-known/jwks.json`
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1'
export const CHATGPT_RESPONSES_URL = `${CHATGPT_RESOURCE}/responses`
export const CHATGPT_MODELS_URL = `${CHATGPT_RESOURCE}/models`
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage'

/** First-registration entrypoint only — never saved, never used for exchange. */
export const CHATGPT_DYNAMIC_CLIENT_ID = 'dynamic_agent_client'
/** Display metadata the user may edit on the consent page; kept constant across installs. */
export const CHATGPT_AGENT_NAME = 'DSH OAuth Subs'
export const CHATGPT_DIRECT_SCOPE = 'chatgpt.tokens.use.direct'
export const CHATGPT_SCOPE = `openid profile email offline_access resource.invoke ${CHATGPT_DIRECT_SCOPE}`
export const CHATGPT_CALLBACK_PATH = '/auth/callback'
/** Access tokens live one hour; refresh like the other hourly families. */
export const CHATGPT_PREEMPT_MS = 5 * 60_000
/** Clock skew tolerated on ID-token `exp` (t3code uses 5s). */
const ID_TOKEN_SKEW_MS = 5_000
const ISSUED_CLIENT_ID = /^oaiapp_[A-Za-z0-9_-]+$/

/** Refresh codes that mean the token set is dead (siwc errors-and-recovery, Refresh errors). */
export const CHATGPT_PERMANENT_REFRESH_CODES = [
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]

/**
 * Static floor until the account's own `GET /v1/models` answers (catalog.ts).
 * Rows live in `src/catalog/models.json` under `"chatgpt"`; provenance in README.
 */
export const CHATGPT_MODELS = catalogRows('chatgpt')

const CHATGPT_BY_ID = new Map(CHATGPT_MODELS.map((model) => [model.id, model]))

export function chatgptModel(modelId) {
  return CHATGPT_BY_ID.get(String(modelId ?? '').trim().toLowerCase())
}

/**
 * Loopback spec for OAuthFlowManager. `127.0.0.1` from the first registration
 * on (never `localhost`); only the port may vary between sign-ins, path stays
 * `/auth/callback`. The callback carries the issued client id beside `code`,
 * so `collect` hands both to the completion step, which validates them.
 */
export function chatgptFlow({ hostId, clientId = undefined, idTokenHint = undefined, loginHint = undefined, forceConsent = false }: any) {
  if (typeof hostId !== 'string' || !hostId) throw new Error('Sign in with ChatGPT needs an agent host id')
  const registering = !clientId
  // The attempt's OIDC nonce lives on the spec: the ID token is checked against it after exchange.
  const nonce = randomToken(32)
  return {
    callbackPath: CHATGPT_CALLBACK_PATH,
    listen: { host: '127.0.0.1', ports: [1455, 0] },
    nonce,
    registering,
    clientId: clientId ?? CHATGPT_DYNAMIC_CLIENT_ID,
    buildAuthorizeUrl({ redirectUri, state, pkce }) {
      const params = new URLSearchParams({
        client_id: clientId ?? CHATGPT_DYNAMIC_CLIENT_ID,
        ...(registering ? { agent_name_hint: CHATGPT_AGENT_NAME } : {}),
        ext_agent_host_id: hostId,
        ...(!registering && idTokenHint ? { id_token_hint: idTokenHint } : {}),
        ...(!registering && loginHint ? { login_hint: loginHint } : {}),
        // Re-consent only when the user explicitly re-enables plan use after a decline.
        ...(!registering && forceConsent ? { prompt: 'consent' } : {}),
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: CHATGPT_SCOPE,
        resource: CHATGPT_RESOURCE,
        state,
        nonce,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
      })
      return `${CHATGPT_AUTHORIZE_URL}?${params.toString()}`
    },
    collect(url) {
      const code = url.searchParams.get('code')
      if (!code) return undefined
      const issued = url.searchParams.getAll('client_id')
      return { code, clientIds: issued }
    },
  }
}

/**
 * The client id this attempt must exchange with. A new registration must
 * return exactly one issued `oaiapp_` id; a reauthorization may omit it but
 * can never replace the selected registration's id.
 */
export function chatgptCallbackClientId(result, { registering, clientId }) {
  const returned = Array.isArray(result?.clientIds) ? result.clientIds.map((id) => String(id).trim()).filter(Boolean) : []
  if (returned.length > 1) throw new Error('ChatGPT returned more than one OAuth client id; start sign-in again')
  const [issued] = returned
  if (registering) {
    if (!issued || !ISSUED_CLIENT_ID.test(issued)) {
      throw new Error('ChatGPT registration did not return an issued client id; start sign-in again')
    }
    return issued
  }
  if (issued !== undefined && issued !== clientId) {
    throw new Error('ChatGPT returned a different client id for this account; start sign-in again')
  }
  return clientId
}

function scopesOf(value) {
  return typeof value === 'string' ? value.trim().split(/\s+/).filter(Boolean) : []
}

function earliestRefreshAt(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value * 1000
  if (typeof value === 'string' && value.trim()) {
    const at = Date.parse(value)
    return Number.isFinite(at) ? at : undefined
  }
  return undefined
}

async function postToken(body, fetchFn) {
  const response = await fetchFn(CHATGPT_TOKEN_URL, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) throw await oauthError(response, 'chatgpt')
  const data = await response.json()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('chatgpt token endpoint returned a non-object response')
  }
  return data
}

function idClaims(payload) {
  const email = typeof payload?.email === 'string' && payload.email.trim() ? payload.email.trim() : undefined
  const auth = payload?.['https://api.openai.com/auth']
  const plan = auth && typeof auth === 'object' ? auth.chatgpt_plan_type : undefined
  return {
    ...(email ? { emailAddress: email } : {}),
    ...(typeof plan === 'string' && plan.trim() ? { planType: plan.trim() } : {}),
  }
}

/**
 * Token response → stored session. `previous` is the session a refresh
 * rotates: refresh may omit the unchanged ID token or scope, but never the
 * access token, the rotating refresh token or the expiry.
 */
export function chatgptSession(tokens, { clientId, hostId, subject, previous = undefined }: any) {
  const access = typeof tokens.access_token === 'string' ? tokens.access_token.trim() : ''
  if (!access) throw new Error('chatgpt token endpoint returned no access token')
  const refresh = typeof tokens.refresh_token === 'string' && tokens.refresh_token.trim()
    ? tokens.refresh_token.trim()
    : undefined
  if (!refresh) throw new Error('chatgpt token endpoint returned no refresh token')
  if (typeof tokens.token_type === 'string' && tokens.token_type.toLowerCase() !== 'bearer') {
    throw new Error(`chatgpt token endpoint returned token_type ${tokens.token_type}`)
  }
  if (typeof tokens.expires_in !== 'number' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) {
    throw new Error('chatgpt token endpoint returned no usable expires_in')
  }
  // OAuth refresh may omit an unchanged scope; never infer a grant from what was requested.
  const scopes = tokens.scope === undefined && previous ? [...(previous.scopes ?? [])] : scopesOf(tokens.scope)
  if (!scopes.includes(CHATGPT_DIRECT_SCOPE)) {
    // Consent declined, or plan use later disabled: the token cannot pay for
    // inference, so the login is not usable. 401 marks a refresh permanent.
    throw new OAuthEndpointError(
      'chatgpt: ChatGPT plan use is not enabled for this app; sign in again and allow "Use your ChatGPT plan"',
      401,
      'chatgpt_plan_use_disabled',
    )
  }
  const idToken = typeof tokens.id_token === 'string' && tokens.id_token.trim() ? tokens.id_token.trim() : previous?.idToken
  const claims = idClaims(decodeJwtPayload(idToken))
  const email = claims.emailAddress ?? previous?.emailAddress
  const planType = claims.planType ?? previous?.planType
  const earliest = earliestRefreshAt(tokens.earliest_refresh_at)
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    ...(idToken ? { idToken } : {}),
    clientId,
    hostId,
    subject,
    scopes,
    ...(email ? { emailAddress: email, account: email } : {}),
    ...(planType ? { planType } : {}),
    ...(previous?.accountKey ? { accountKey: previous.accountKey } : {}),
    ...(earliest !== undefined ? { earliestRefreshAt: earliest } : {}),
  }
}

function base64urlJson(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * Verify a sign-in ID token: RS256 signature against OpenAI's published JWKS,
 * issuer, audience = the issued client id, expiry and this attempt's nonce.
 * Returns the verified payload; `sub` is the (client-scoped) account identity.
 */
export async function verifyChatgptIdToken(idToken, { clientId, nonce, fetchFn = outboundFetch, now = Date.now() }: any) {
  const parts = typeof idToken === 'string' ? idToken.split('.') : []
  if (parts.length !== 3) throw new Error('ChatGPT returned a malformed ID token; start sign-in again')
  const header = base64urlJson(parts[0])
  const payload = base64urlJson(parts[1])
  if (!header || !payload) throw new Error('ChatGPT returned a malformed ID token; start sign-in again')
  if (header.alg !== 'RS256') throw new Error(`ChatGPT ID token uses unsupported alg ${String(header.alg)}`)
  const response = await fetchFn(CHATGPT_JWKS_URL, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`ChatGPT signing keys unavailable (HTTP ${response.status}); start sign-in again`)
  const jwks = await response.json()
  const keys = Array.isArray(jwks?.keys) ? jwks.keys.filter((key) => key && key.kty === 'RSA') : []
  const jwk = header.kid ? keys.find((key) => key.kid === header.kid) : keys.length === 1 ? keys[0] : undefined
  if (!jwk) throw new Error('ChatGPT ID token signing key not found; start sign-in again')
  const valid = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url'),
  )
  if (!valid) throw new Error('ChatGPT ID token signature is invalid; start sign-in again')
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  const problems = [
    payload.iss !== CHATGPT_ISSUER && 'issuer',
    !audiences.includes(clientId) && 'audience',
    audiences.length > 1 && payload.azp !== clientId && 'authorized party',
    payload.azp !== undefined && payload.azp !== clientId && 'authorized party',
    !(typeof payload.exp === 'number' && payload.exp * 1000 > now - ID_TOKEN_SKEW_MS) && 'expiry',
    payload.nonce !== nonce && 'nonce',
    !(typeof payload.sub === 'string' && payload.sub) && 'subject',
  ].filter(Boolean)
  if (problems.length > 0) {
    throw new Error(`ChatGPT sign-in identity could not be verified (${[...new Set(problems)].join(', ')}); start sign-in again`)
  }
  return payload
}

/**
 * Authorization-code exchange + identity check → `{ tokens, identity }`.
 * `expectedSubject` is set on a reauthorization: the new identity must be
 * the selected registration's. The session is built separately
 * (`chatgptSession`) so a grant without plan use still keeps its registration.
 */
export async function redeemChatgptCode({ code, verifier, redirectUri, clientId, nonce, expectedSubject = undefined, fetchFn = outboundFetch }: any) {
  const tokens = await postToken(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    resource: CHATGPT_RESOURCE,
  }), fetchFn)
  if (typeof tokens.id_token !== 'string' || !tokens.id_token.trim()) {
    throw new Error('ChatGPT did not return an ID token; start sign-in again')
  }
  const identity = await verifyChatgptIdToken(tokens.id_token.trim(), { clientId, nonce, fetchFn })
  if (expectedSubject && identity.sub !== expectedSubject) {
    throw new Error('ChatGPT signed in a different account than the one selected; reconnect with the original account or add a new one')
  }
  return { tokens, identity }
}

/** Whether a token response grants ChatGPT plan use (a valid ID token alone does not). */
export function chatgptPlanUseGranted(tokens) {
  return scopesOf(tokens?.scope).includes(CHATGPT_DIRECT_SCOPE)
}

/** No quota endpoint exists for this flow; usage lives in ChatGPT Settings → Usage. */
export function chatgptQuota(session) {
  return {
    ...(typeof session?.planType === 'string' && session.planType ? { planType: session.planType } : {}),
    ...(typeof session?.emailAddress === 'string' && session.emailAddress ? { account: session.emailAddress } : {}),
    rows: [],
  }
}

class RefreshNotYet extends Error {
  constructor() {
    super('chatgpt: ChatGPT cannot renew this connection yet (earliest_refresh_at); retrying shortly')
    this.name = 'RefreshNotYet'
  }
}

/** Rotating refresh with the issued client id; omit `scope` to keep the grant. */
export async function refreshChatgpt(session, fetchFn = outboundFetch) {
  const clientId = session?.clientId
  if (typeof clientId !== 'string' || !ISSUED_CLIENT_ID.test(clientId)) {
    throw new OAuthEndpointError('chatgpt: stored login has no issued client id; sign in again', 401, 'invalid_client')
  }
  // A still-valid token keeps serving: TokenManager backs off a transient failure.
  if (session.earliestRefreshAt > Date.now() && session.expiresAt > Date.now()) throw new RefreshNotYet()
  const tokens = await postToken(new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: session.refreshToken,
    resource: CHATGPT_RESOURCE,
  }), fetchFn)
  const rotatedSubject = typeof tokens.id_token === 'string' ? decodeJwtPayload(tokens.id_token)?.sub : undefined
  if (rotatedSubject !== undefined && session.subject && rotatedSubject !== session.subject) {
    throw new OAuthEndpointError('chatgpt: account changed during refresh; sign in again', 401, 'invalid_grant')
  }
  return chatgptSession(tokens, { clientId, hostId: session.hostId, subject: session.subject, previous: session })
}

/**
 * End the renewable session. Empty HTTP 200 is success (also for an already
 * invalid token); network errors and 5xx retry with backoff. Resolves whether
 * revocation was confirmed — local sign-out proceeds either way.
 */
export async function revokeChatgpt(session, { fetchFn = outboundFetch, attempts = 3, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: any = {}) {
  if (!session?.refreshToken || !session?.clientId) return true
  for (let attempt = 0; attempt < attempts; attempt++) {
    let retry = true
    try {
      const response = await fetchFn(CHATGPT_REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: session.refreshToken,
          token_type_hint: 'refresh_token',
          client_id: session.clientId,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      })
      if (response.status === 200) return true
      retry = response.status >= 500
    } catch {
      retry = true
    }
    if (!retry || attempt === attempts - 1) break
    await sleep(attempt === 0 ? 250 : 1000)
  }
  return false
}

export function chatgptUpstreamHeaders(session) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    accept: 'application/json',
  }
}
