/**
 * Anthropic subscription OAuth (Claude Pro/Max), pinned to the Claude Code
 * client identity as observed in senpi/pi-ai (`@earendil-works/pi-ai`
 * `auth/oauth/anthropic.js` + `api/anthropic-messages.js`, engine of
 * oh-my-openagent) and cross-checked against Claude Code's documented flow:
 *
 *   - PKCE (S256) at claude.ai/oauth/authorize, client id
 *     `9d1c250a-e61b-44e9-88ed-594fedd33385`, loopback `/callback`
 *     (Claude Code binds a random port; the client accepts any localhost
 *     port, so we reuse the shared flow manager's listener).
 *   - Token exchange + refresh POST JSON to
 *     platform.claude.com/v1/oauth/token (the console.anthropic.com host is
 *     the legacy spelling).
 *   - Chat: api.anthropic.com/v1/messages with `Authorization: Bearer
 *     sk-ant-oat…`, `anthropic-beta: claude-code-20250219, oauth-2025-04-20`,
 *     `user-agent: claude-cli/<version>`, `x-app: cli`.
 *   - Account identity: GET api.anthropic.com/api/oauth/profile
 *     (`user:profile` scope) — account uuid + email, community-documented
 *     from Claude Code's own post-login call.
 *   - Usage: GET api.anthropic.com/api/oauth/usage — present in the pinned CLI
 *     and live-verified for scoped weekly model limits.
 *
 * Do not invent: scopes, beta headers, dated model rows, or unverified endpoints —
 * see README.md for the do-not list.
 */

import { OAuthEndpointError, oauthError } from '../codex/index.js'

export const ANTHROPIC_CLIENT_ID = '9d1c250a-e61b-44e9-88ed-594fedd33385'
export const ANTHROPIC_AUTHORIZE_URL = 'https://claude.ai/oauth/authorize'
export const ANTHROPIC_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
export const ANTHROPIC_API_BASE = 'https://api.anthropic.com'
export const ANTHROPIC_MESSAGES_URL = `${ANTHROPIC_API_BASE}/v1/messages`
export const ANTHROPIC_PROFILE_URL = `${ANTHROPIC_API_BASE}/api/oauth/profile`
export const ANTHROPIC_USAGE_URL = `${ANTHROPIC_API_BASE}/api/oauth/usage`
export const ANTHROPIC_CALLBACK_PATH = '/callback'
/**
 * Claude Code's scopes at the time of pinning (pi-ai `SCOPES`). `user:profile`
 * backs the profile lookup; `user:inference` is the chat grant.
 */
export const ANTHROPIC_SCOPE = 'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
/** Claude Code identity the OAuth lane must present (pi-ai `claudeCodeVersion`). */
export const ANTHROPIC_CLI_VERSION = '2.1.280'
export const ANTHROPIC_USER_AGENT = `claude-cli/${ANTHROPIC_CLI_VERSION}`
/** Beta features the subscription lane requires; order mirrors pi-ai. */
export const ANTHROPIC_BETA = 'claude-code-20250219,oauth-2025-04-20'
/** pi-ai reserves a 5-minute refresh window on the returned expiry. */
export const ANTHROPIC_PREEMPT_MS = 5 * 60_000
export const ANTHROPIC_TEXT_INPUT = Object.freeze(['text', 'image'])

/**
 * The OAuth token is opaque (`sk-ant-oat01-…`): no JWT claims, no account id.
 * Identity comes from the profile endpoint; without it the generic
 * refresh-token-suffix id applies (store.accountIdOf).
 */
export function isAnthropicOAuthToken(value) {
  return typeof value === 'string' && value.includes('sk-ant-oat')
}

export const anthropicFlow = {
  callbackPath: ANTHROPIC_CALLBACK_PATH,
  listen: { host: 'localhost' },
  buildAuthorizeUrl({ redirectUri, state, pkce }) {
    const params = new URLSearchParams({
      // `code=true` asks claude.ai for the code grant, not a session cookie
      // (pi-ai authParams, Claude Code CLI parity).
      code: 'true',
      response_type: 'code',
      client_id: ANTHROPIC_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: ANTHROPIC_SCOPE,
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
      state,
    })
    return `${ANTHROPIC_AUTHORIZE_URL}?${params.toString()}`
  },
}

/**
 * The token exchange echoes `state` (pi-ai posts it; Claude Code sends it) —
 * completePkce passes the flow manager's own state back in.
 */
export async function exchangeAnthropicCode(code, verifier, redirectUri, state, fetchFn = fetch) {
  const response = await fetchFn(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: ANTHROPIC_CLIENT_ID,
      code,
      state,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  })
  if (!response.ok) throw await oauthError(response, 'anthropic')
  return anthropicSession(await response.json())
}

export async function refreshAnthropic(session, fetchFn = fetch) {
  const response = await fetchFn(ANTHROPIC_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: ANTHROPIC_CLIENT_ID,
      refresh_token: session.refreshToken,
    }),
  })
  if (!response.ok) throw await oauthError(response, 'anthropic')
  return anthropicSession(await response.json(), session)
}

/** Token-endpoint grants that mean the login is gone, not merely stale. */
const PERMANENT_REFRESH_CODES = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client'])

export function isAnthropicPermanentRefreshError(error) {
  return error instanceof OAuthEndpointError && PERMANENT_REFRESH_CODES.has(error.oauthCode)
}

export function anthropicSession(tokens, fallback: any = undefined) {
  if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
    throw new Error('anthropic token endpoint returned no access token')
  }
  const refreshToken = tokens.refresh_token ?? fallback?.refreshToken
  if (refreshToken === undefined) throw new Error('anthropic token endpoint returned no refresh token')
  if (typeof tokens.expires_in !== 'number' || tokens.expires_in <= 0) {
    throw new Error('anthropic token endpoint returned no usable expiry')
  }
  return {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    ...(tokens.scope !== undefined ? { scope: tokens.scope } : {}),
    ...(fallback?.account !== undefined ? { account: fallback.account } : {}),
    ...(fallback?.accountId !== undefined ? { accountId: fallback.accountId } : {}),
    ...(fallback?.planType !== undefined ? { planType: fallback.planType } : {}),
  }
}

/**
 * Account uuid + email from the `user:profile` grant. Best-effort: a profile
 * failure must not kill a finished login (the vault falls back to the
 * refresh-token-suffix id and the card shows the token shape).
 */
export async function anthropicProfile(session, fetchFn = fetch) {
  const response = await fetchFn(ANTHROPIC_PROFILE_URL, {
    headers: { ...anthropicUpstreamHeaders(session), accept: 'application/json' },
  })
  if (!response.ok) throw await oauthError(response, 'anthropic profile')
  const payload: any = await response.json()
  const account: any = typeof payload?.account === 'object' && payload.account !== null ? payload.account : {}
  const email = typeof account.email === 'string' && account.email.trim() ? account.email.trim() : undefined
  const uuid = typeof account.uuid === 'string' && account.uuid.trim() ? account.uuid.trim() : undefined
  if (!email && !uuid) throw new Error('anthropic profile returned no account identity')
  return { email, uuid, organization: account.organization ?? undefined }
}

/**
 * Headers every subscription-lane request must carry. The OAuth token is only
 * accepted with the claude-code + oauth beta pair and the claude-cli
 * identity; `anthropic-version` pins the Messages API revision the lane
 * targets (pi-ai sends the SDK default `2023-06-01`).
 */
export function anthropicUpstreamHeaders(session) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': ANTHROPIC_BETA,
    'user-agent': ANTHROPIC_USER_AGENT,
    'x-app': 'cli',
    accept: 'application/json',
  }
}

/**
 * Offline fallback matching pi-ai's `providers/data/anthropic.json` catalog
 * (the Claude Code subscription set) cross-checked against our Kiro family
 * rows for the same underlying models. Dash ids are the api.anthropic.com
 * spellings (Kiro's dotted ids are that platform's aliasing). Adaptive
 * thinking (output_config.effort) is auto-detected by the host from the same
 * id markers pi-ai uses, so classic-thinking rows (opus-4-5, sonnet-4-5,
 * haiku-4-5) carry no reasoningEfforts and keep native budget thinking.
 * Ladders mirror Kiro's: Opus 5 / 4.8 / 4.7 / Sonnet 5 / Fable add `xhigh`;
 * the 4.6 family stops at `max`.
 */
export const ANTHROPIC_REASONING_CLAUDE = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'max',
})

export const ANTHROPIC_REASONING_CLAUDE_XHIGH = Object.freeze({
  ...ANTHROPIC_REASONING_CLAUDE,
  xhigh: 'xhigh',
})

function anthropicModel(id, name, contextWindow, maxTokens, reasoningEfforts: any = undefined) {
  return {
    id,
    name,
    contextWindow,
    maxTokens,
    input: ANTHROPIC_TEXT_INPUT,
    ...(reasoningEfforts !== undefined ? { reasoningEfforts } : {}),
  }
}

export const ANTHROPIC_CONTEXT_WINDOW = 200_000
export const ANTHROPIC_LARGE_CONTEXT = 1_000_000
export const ANTHROPIC_MAX_TOKENS = 64_000
export const ANTHROPIC_LARGE_MAX_TOKENS = 128_000

export const ANTHROPIC_MODELS = Object.freeze([
  anthropicModel('claude-fable-5-1', 'Claude Fable 5.1', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE_XHIGH),
  anthropicModel('claude-fable-5', 'Claude Fable 5', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE_XHIGH),
  anthropicModel('claude-opus-5-5', 'Claude Opus 5.5', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE_XHIGH),
  anthropicModel('claude-opus-5', 'Claude Opus 5', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE_XHIGH),
  anthropicModel('claude-opus-4-8', 'Claude Opus 4.8', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE_XHIGH),
  anthropicModel('claude-opus-4-7', 'Claude Opus 4.7', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE_XHIGH),
  anthropicModel('claude-opus-4-6', 'Claude Opus 4.6', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE),
  anthropicModel('claude-opus-4-5', 'Claude Opus 4.5', ANTHROPIC_CONTEXT_WINDOW, ANTHROPIC_MAX_TOKENS),
  anthropicModel('claude-sonnet-5', 'Claude Sonnet 5', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE_XHIGH),
  anthropicModel('claude-sonnet-4-6', 'Claude Sonnet 4.6', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_LARGE_MAX_TOKENS, ANTHROPIC_REASONING_CLAUDE),
  anthropicModel('claude-sonnet-4-5', 'Claude Sonnet 4.5', ANTHROPIC_LARGE_CONTEXT, ANTHROPIC_MAX_TOKENS),
  anthropicModel('claude-haiku-4-5', 'Claude Haiku 4.5', ANTHROPIC_CONTEXT_WINDOW, ANTHROPIC_MAX_TOKENS),
])

/** Cheapest served row — the quota probe's model. */
export const ANTHROPIC_PROBE_MODEL = 'claude-haiku-4-5'
