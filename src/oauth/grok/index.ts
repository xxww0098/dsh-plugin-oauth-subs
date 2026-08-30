/**
 * xAI Grok subscription OAuth.
 *
 * Client id and OIDC issuer match Grok CLI
 * (`b1a00492-073a-47ea-816f-4c329264a828`, https://auth.x.ai). Default login is
 * RFC 8628 device-code (no loopback); PKCE on 127.0.0.1:56121 is the fallback.
 */

import { decodeJwtPayload } from '../../utils/jwt.js'
import { OAuthEndpointError, oauthError } from '../codex/index.js'

export const GROK_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
export const GROK_DISCOVERY_URL = 'https://auth.x.ai/.well-known/openid-configuration'
export const GROK_API_URL = 'https://api.x.ai/v1/responses'
export const GROK_BILLING_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
export const GROK_CLI_USER_URL = 'https://cli-chat-proxy.grok.com/v1/user?include=subscription'
export const GROK_CREDITS_URL = 'https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig'
export const GROK_CLIENT_VERSION = '0.2.93'
export const GROK_USER_AGENT = `grok-cli/${GROK_CLIENT_VERSION}`
export const GROK_SCOPE = 'openid profile email offline_access grok-cli:access api:access'
export const GROK_CALLBACK_PATH = '/callback'
export const GROK_PREEMPT_MS = 2 * 60_000
export const GROK_CONTEXT_WINDOW = 256_000
export const GROK_LARGE_CONTEXT = 500_000
export const GROK_DEFAULT_MAX_TOKENS = 32_000

/** grok-4.5: low / medium / high. Reasoning cannot be turned off. */
export const GROK_REASONING_45 = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
})

/** grok-4.6 adds xhigh. grok-4 does not accept reasoning.effort. */
export const GROK_REASONING_46 = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
})

export const GROK_MODELS = Object.freeze([
  {
    id: 'grok-4.6',
    name: 'Grok 4.6',
    contextWindow: GROK_LARGE_CONTEXT,
    maxTokens: GROK_LARGE_CONTEXT,
    reasoningEfforts: GROK_REASONING_46,
  },
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    contextWindow: GROK_LARGE_CONTEXT,
    maxTokens: GROK_LARGE_CONTEXT,
    reasoningEfforts: GROK_REASONING_45,
  },
  {
    id: 'grok-4',
    name: 'Grok 4',
    contextWindow: GROK_CONTEXT_WINDOW,
    maxTokens: GROK_DEFAULT_MAX_TOKENS,
    reasoningEfforts: false,
  },
])

export const GROK_TIER_NAMES = Object.freeze({
  0: 'Free',
  1: 'SuperGrok',
  2: 'X Basic',
  3: 'X Premium',
  4: 'X Premium+',
  5: 'SuperGrok Heavy',
  6: 'SuperGrok Lite',
  7: 'SuperGrok Plus',
})

function assertXaiEndpoint(url, field) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`grok OIDC discovery returned an invalid ${field}`)
  }
  if (parsed.protocol !== 'https:'
    || (parsed.hostname !== 'x.ai' && !parsed.hostname.endsWith('.x.ai'))) {
    throw new Error(`grok OIDC discovery returned a non-x.ai ${field}: ${url}`)
  }
  return url
}

let discoveryCache

export function resetGrokDiscovery() {
  discoveryCache = undefined
}

export async function grokDiscovery(fetchFn = fetch) {
  if (discoveryCache !== undefined) return discoveryCache
  const response = await fetchFn(GROK_DISCOVERY_URL)
  if (!response.ok) throw await oauthError(response, 'grok OIDC discovery')
  const document = await response.json()
  if (typeof document.authorization_endpoint !== 'string' || typeof document.token_endpoint !== 'string') {
    throw new Error('grok OIDC discovery document is missing endpoints')
  }
  discoveryCache = {
    authorizationEndpoint: assertXaiEndpoint(document.authorization_endpoint, 'authorization_endpoint'),
    tokenEndpoint: assertXaiEndpoint(document.token_endpoint, 'token_endpoint'),
    deviceAuthorizationEndpoint: typeof document.device_authorization_endpoint === 'string'
      ? assertXaiEndpoint(document.device_authorization_endpoint, 'device_authorization_endpoint')
      : 'https://auth.x.ai/oauth2/device/code',
  }
  return discoveryCache
}

export async function grokFlow(fetchFn = fetch) {
  const discovery = await grokDiscovery(fetchFn)
  return {
    callbackPath: GROK_CALLBACK_PATH,
    listen: { host: '127.0.0.1', ports: [56121] },
    buildAuthorizeUrl({ redirectUri, state, pkce, nonce }) {
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: GROK_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: GROK_SCOPE,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        state,
        nonce,
        plan: 'generic',
        referrer: 'dsh-plugin-oauth-subs',
      })
      return `${discovery.authorizationEndpoint}?${params.toString()}`
    },
  }
}

export async function grokDeviceSpec(fetchFn = fetch) {
  const discovery = await grokDiscovery(fetchFn)
  return {
    clientId: GROK_CLIENT_ID,
    scope: GROK_SCOPE,
    deviceCodeUrl: discovery.deviceAuthorizationEndpoint,
    tokenUrl: discovery.tokenEndpoint,
    fetchFn,
    headers: grokCredentialHeaders(),
  }
}

export function grokTierFromValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const tier = Math.trunc(value)
    return GROK_TIER_NAMES[tier] ?? String(tier)
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    if (/^\d+$/.test(trimmed)) return grokTierFromValue(Number(trimmed))
    return trimmed
  }
  return undefined
}

export function grokTierName(accessToken) {
  const payload = decodeJwtPayload(accessToken)
  if (!payload) return undefined
  return grokTierFromValue(payload.tier ?? payload.subscription_tier ?? payload.subscriptionTier)
}

function grokAccount(idToken) {
  const payload = idToken === undefined ? undefined : decodeJwtPayload(idToken)
  const claim = payload?.email ?? payload?.preferred_username ?? payload?.name ?? payload?.sub
  return typeof claim === 'string' && claim.length > 0 ? claim : undefined
}

export function grokSession(tokens, tokenEndpoint, fallback) {
  if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
    throw new Error('grok token endpoint returned no access token')
  }
  const refreshToken = tokens.refresh_token ?? fallback?.refreshToken
  if (refreshToken === undefined) throw new Error('grok token endpoint returned no refresh token')
  let expiresAt
  if (typeof tokens.expires_in === 'number' && tokens.expires_in > 0) {
    expiresAt = Date.now() + tokens.expires_in * 1000
  } else {
    const exp = decodeJwtPayload(tokens.access_token)?.exp
    if (typeof exp === 'number' && exp > 0) expiresAt = exp * 1000
  }
  if (expiresAt === undefined) throw new Error('grok token endpoint returned no usable expiry')
  const account = grokAccount(tokens.id_token) ?? fallback?.account ?? grokTierName(tokens.access_token)
  const planType = grokTierName(tokens.access_token) ?? fallback?.planType
  const clientId = (typeof tokens.client_id === 'string' && tokens.client_id)
    || (typeof tokens.clientId === 'string' && tokens.clientId)
    || fallback?.clientId
  return {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt,
    tokenEndpoint,
    ...(typeof tokens.scope === 'string' ? { scopes: tokens.scope } : fallback?.scopes ? { scopes: fallback.scopes } : {}),
    ...(account === undefined ? {} : { account }),
    ...(planType === undefined ? {} : { planType }),
    ...(clientId === undefined ? {} : { clientId }),
  }
}

export async function exchangeGrokCode(code, verifier, redirectUri, challenge, fetchFn = fetch) {
  const discovery = await grokDiscovery(fetchFn)
  const response = await fetchFn(discovery.tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...grokCredentialHeaders(),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: GROK_CLIENT_ID,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString(),
  })
  if (response.status === 403) {
    throw new OAuthEndpointError(
      'grok token endpoint refused the exchange (HTTP 403): your X plan does not include the API OAuth entitlement; an X Premium or xAI subscription with API access is required',
      403,
    )
  }
  if (!response.ok) throw await oauthError(response, 'grok')
  return grokSession(await response.json(), discovery.tokenEndpoint)
}

export async function completeGrokDevice(tokens, fetchFn = fetch) {
  const discovery = await grokDiscovery(fetchFn)
  return grokSession(tokens, discovery.tokenEndpoint)
}

export async function refreshGrok(session, fetchFn = fetch) {
  const response = await fetchFn(session.tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...grokCredentialHeaders(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: session.clientId ?? GROK_CLIENT_ID,
      refresh_token: session.refreshToken,
    }).toString(),
  })
  if (!response.ok) throw await oauthError(response, 'grok')
  const next = grokSession(await response.json(), session.tokenEndpoint, session)
  return {
    ...next,
    ...(session.account === undefined ? {} : { account: next.account ?? session.account }),
    ...(session.planType === undefined ? {} : { planType: next.planType ?? session.planType }),
    ...(session.clientId === undefined ? {} : { clientId: next.clientId ?? session.clientId }),
  }
}

export function isGrokPermanentRefreshError(error) {
  return error instanceof OAuthEndpointError && error.oauthCode === 'invalid_grant'
}

export function grokCredentialHeaders() {
  return {
    'user-agent': GROK_USER_AGENT,
  }
}

export function grokUserId(session) {
  const payload = session?.accessToken ? decodeJwtPayload(session.accessToken) : undefined
  const id = payload?.sub ?? payload?.user_id ?? payload?.userId
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

export function grokUpstreamHeaders(session) {
  const headers = {
    authorization: `Bearer ${session.accessToken}`,
    'x-xai-token-auth': 'xai-grok-cli',
    accept: 'application/json',
    ...grokCredentialHeaders(),
  }
  const userId = grokUserId(session)
  if (userId) headers['x-userid'] = userId
  return headers
}

export function grokCreditsHeaders(session) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    'content-type': 'application/grpc-web+proto',
    'x-grpc-web': '1',
    accept: '*/*',
    origin: 'https://grok.com',
    referer: 'https://grok.com/?_s=usage',
    'x-user-agent': 'connect-es/2.1.1',
    ...grokCredentialHeaders(),
  }
}

/**
 * xAI sticky-routes prompt cache by `x-grok-conv-id`. Codex `session-id` /
 * `x-client-request-id` are ignored on this backend and must not be copied.
 */
export function grokAffinityHeaders(cacheSessionId) {
  if (typeof cacheSessionId !== 'string' || cacheSessionId.length === 0) return {}
  return { 'x-grok-conv-id': cacheSessionId }
}
