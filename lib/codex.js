/**
 * ChatGPT / Codex subscription OAuth.
 *
 * Client id, endpoints, and authorize flags match Codex CLI
 * (`app_EMoamEEZ73f0CkXaXp7hrann`, auth.openai.com, originator
 * `codex_cli_rs`). Token exchange is form-encoded; refresh is JSON.
 */

import { decodeJwtPayload } from './jwt.js'

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
export const CODEX_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
export const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
export const CODEX_API_URL = 'https://chatgpt.com/backend-api/codex/responses'
export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
export const CODEX_RESET_CREDITS_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
export const CODEX_RESET_CONSUME_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume'
export const CODEX_MODELS_URL = 'https://chatgpt.com/backend-api/codex/models'
export const CODEX_CLIENT_VERSION = '0.147.0'
export const CODEX_ORIGINATOR = 'codex_cli_rs'
export const CODEX_USER_AGENT = `${CODEX_ORIGINATOR}/${CODEX_CLIENT_VERSION}`
export const CODEX_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'
export const CODEX_CALLBACK_PATH = '/auth/callback'
export const CODEX_PREEMPT_MS = 5 * 60_000
export const CODEX_CONTEXT_WINDOW = 272_000
export const CODEX_DEFAULT_MAX_TOKENS = 128_000

const PERMANENT_REFRESH_CODES = new Set([
  'refresh_token_expired',
  'refresh_token_reused',
  'refresh_token_invalidated',
  'invalid_grant',
])

export const CODEX_MODELS = Object.freeze([
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
  { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
  { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', contextWindow: CODEX_CONTEXT_WINDOW, maxTokens: CODEX_DEFAULT_MAX_TOKENS },
])

export const CODEX_REASONING = Object.freeze({
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
})

export const codexFlow = {
  callbackPath: CODEX_CALLBACK_PATH,
  listen: { host: 'localhost', ports: [1455, 1457] },
  buildAuthorizeUrl({ redirectUri, state, pkce }) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CODEX_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: CODEX_SCOPE,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: CODEX_ORIGINATOR,
    })
    return `${CODEX_AUTHORIZE_URL}?${params.toString()}`
  },
}

function accountIdOf(idToken) {
  const payload = idToken === undefined ? undefined : decodeJwtPayload(idToken)
  const auth = payload?.['https://api.openai.com/auth']
  const accountId = typeof auth === 'object' && auth !== null
    ? auth.chatgpt_account_id
    : undefined
  if (typeof accountId !== 'string' || accountId.length === 0) {
    throw new Error('codex login did not return a chatgpt account id; cannot use the subscription')
  }
  return accountId
}

export function codexProfileClaims(idToken) {
  const payload = idToken === undefined ? undefined : decodeJwtPayload(idToken)
  if (payload === undefined) return {}
  const profile = payload['https://api.openai.com/profile']
  const profileEmail = typeof profile === 'object' && profile !== null ? profile.email : undefined
  const email = payload.email ?? profileEmail
  const auth = payload['https://api.openai.com/auth']
  const plan = typeof auth === 'object' && auth !== null ? auth.chatgpt_plan_type : undefined
  return {
    ...(typeof email === 'string' && email.length > 0 ? { emailAddress: email } : {}),
    ...(typeof plan === 'string' && plan.length > 0 ? { planType: plan } : {}),
  }
}

export function codexSession(tokens, fallback) {
  if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
    throw new Error('codex token endpoint returned no access token')
  }
  const refreshToken = tokens.refresh_token ?? fallback?.refreshToken
  if (refreshToken === undefined) throw new Error('codex token endpoint returned no refresh token')
  let expiresAt
  if (typeof tokens.expires_in === 'number' && tokens.expires_in > 0) {
    expiresAt = Date.now() + tokens.expires_in * 1000
  } else {
    const exp = decodeJwtPayload(tokens.access_token)?.exp
    if (typeof exp === 'number' && exp > 0) expiresAt = exp * 1000
  }
  if (expiresAt === undefined) throw new Error('codex token endpoint returned no usable expiry')
  const idToken = tokens.id_token ?? fallback?.idToken
  const claims = {
    ...(fallback?.emailAddress === undefined ? {} : { emailAddress: fallback.emailAddress }),
    ...(fallback?.planType === undefined ? {} : { planType: fallback.planType }),
    ...codexProfileClaims(tokens.id_token),
  }
  return {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt,
    accountId: tokens.id_token === undefined && fallback !== undefined
      ? fallback.accountId
      : accountIdOf(tokens.id_token),
    ...(idToken === undefined ? {} : { idToken }),
    ...claims,
  }
}

export async function exchangeCodexCode(code, verifier, redirectUri, fetchFn = fetch) {
  const response = await fetchFn(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...codexCredentialHeaders(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: CODEX_CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  })
  if (!response.ok) throw await oauthError(response, 'codex')
  return codexSession(await response.json())
}

export async function refreshCodex(session, fetchFn = fetch) {
  const response = await fetchFn(CODEX_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...codexCredentialHeaders(),
    },
    body: JSON.stringify({
      client_id: CODEX_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  })
  if (!response.ok) throw await oauthError(response, 'codex')
  return codexSession(await response.json(), session)
}

export function isCodexPermanentRefreshError(error) {
  return error instanceof OAuthEndpointError && PERMANENT_REFRESH_CODES.has(error.oauthCode)
}

/** originator + User-Agent pair the token endpoint and Responses API both expect. */
export function codexCredentialHeaders() {
  return {
    originator: CODEX_ORIGINATOR,
    'user-agent': CODEX_USER_AGENT,
  }
}

export function codexUpstreamHeaders(session) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    'chatgpt-account-id': session.accountId,
    ...codexCredentialHeaders(),
    'openai-version': CODEX_CLIENT_VERSION,
    'openai-beta': 'responses=experimental',
    accept: 'application/json',
  }
}

export class OAuthEndpointError extends Error {
  constructor(message, status, oauthCode) {
    super(message)
    this.name = 'OAuthEndpointError'
    this.status = status
    this.oauthCode = oauthCode
  }
}

export async function oauthError(response, label) {
  let body = ''
  try { body = await response.text() } catch { body = '' }
  let code
  try {
    const parsed = JSON.parse(body)
    code = parsed.error ?? parsed.error_code
    const description = parsed.error_description ?? parsed.message
    if (typeof description === 'string' && description.length > 0) {
      return new OAuthEndpointError(`${label}: ${description}`, response.status, code)
    }
  } catch {
    // not JSON
  }
  return new OAuthEndpointError(`${label} request failed (HTTP ${response.status})${body ? `: ${body.slice(0, 240)}` : ''}`, response.status, code)
}
