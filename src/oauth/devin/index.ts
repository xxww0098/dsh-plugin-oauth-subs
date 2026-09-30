/**
 * Devin Agent subscription family. Login is the Devin CLI's own PKCE hop:
 * app.devin.ai/auth/cli/continue → loopback → POST api.devin.ai/auth/cli/token.
 * Chat is Connect/protobuf ApiServerService/GetChatMessage on the Codeium
 * server (server.codeium.com) — not OpenAI REST. The session token rides in
 * `Metadata.api_key` as `devin-session-token$…`; identity metadata presents
 * the Windsurf-compatible ide/extension pair the backend gates on.
 *
 * Reference: Devin CLI 3000.10.31 (binary strings + live wire probes) and
 * oh-my-pi `pi-catalog` devin provider (Connect framing + message shapes).
 */

import { decodeJwtPayload } from '../../utils/jwt.js'
import { outboundFetch } from '../../utils/outbound.js'
import { catalogRows } from '../../catalog/index.js'

export const DEVIN_WEBAPP_URL = 'https://app.devin.ai'
export const DEVIN_API_URL = 'https://api.devin.ai'
export const DEVIN_API_SERVER = 'https://server.codeium.com'

/** CLI login pages and the token exchange the real `devin auth login` hits. */
export const DEVIN_AUTHORIZE_PATH = '/auth/cli/continue'
export const DEVIN_TOKEN_PATH = '/auth/cli/token'
export const DEVIN_CALLBACK_PORT = 59653
export const DEVIN_CALLBACK_PATH = '/callback'
/** Marker the CLI puts on its PKCE continue URL. */
export const DEVIN_PKCE_MARKER = 'cli_pkce_marker=1'

export const DEVIN_AUTHORIZE_URL = `${DEVIN_WEBAPP_URL}${DEVIN_AUTHORIZE_PATH}`
export const DEVIN_TOKEN_URL = `${DEVIN_API_URL}${DEVIN_TOKEN_PATH}`

export const DEVIN_CHAT_PATH = '/exa.api_server_pb.ApiServerService/GetChatMessage'
export const DEVIN_MODELS_PATH = '/exa.api_server_pb.ApiServerService/GetCliModelConfigs'
export const DEVIN_USER_JWT_PATH = '/exa.auth_pb.AuthService/GetUserJwt'
export const DEVIN_USER_STATUS_PATH = '/exa.seat_management_pb.SeatManagementService/GetUserStatus'

/**
 * MITM capture of the real `devin` binary (3000.10.31, Rust Codeium engine):
 * every RPC carries Metadata{ ide_name:'chisel', ide_version/extension_version:
 * cli version, extension_name:'chisel', locale:'en', os: process.platform,
 * api_key } and unary calls add `Authorization: Basic <token>-<token>`.
 * `ide_name: devin`/`Devin`/`devin-cli` are stub-gated (1 config); `chisel`
 * and `windsurf` both unlock the live catalog — `chisel` is what the CLI
 * actually sends.
 */
export const DEVIN_IDE_NAME = 'chisel'
export const DEVIN_CLI_VERSION = '3000.10.31'
export const DEVIN_IDE_VERSION = DEVIN_CLI_VERSION
export const DEVIN_EXTENSION_NAME = 'chisel'
export const DEVIN_EXTENSION_VERSION = DEVIN_CLI_VERSION
export const DEVIN_LOCALE = 'en'
/** Packed DisplayOption values the CLI advertises on catalog RPCs (MITM). */
export const DEVIN_MODEL_DISPLAYS = Object.freeze([3, 4, 6, 7, 8])

export const DEVIN_SESSION_PREFIX = 'devin-session-token$'
export const DEVIN_PREEMPT_MS = 5 * 60_000
/** Session tokens outlive any sane login; JWT `exp` wins when it exists. */
export const DEVIN_FALLBACK_EXPIRES_MS = 365 * 24 * 60 * 60_000

/** Stop patterns the reference client always sends. */
export const DEVIN_STOP_PATTERNS = Object.freeze([
  '<|user|>',
  '<|bot|>',
  '<|context_request|>',
  '<|endoftext|>',
  '<|end_of_turn|>',
])

export const DEVIN_PLAN_NAMES = Object.freeze({
  free: 'Free',
  devin_free: 'Free',
  trial: 'Trial',
  devin_trial: 'Trial',
  pro: 'Pro',
  devin_pro: 'Pro',
  max: 'Max',
  devin_max: 'Max',
  teams: 'Teams',
  devin_teams: 'Teams',
  devin_teams_v2: 'Teams',
  enterprise: 'Enterprise',
  devin_enterprise: 'Enterprise',
})

/** `teams_tier` enum → plan label (codeium_common.proto TeamsTier). */
export const DEVIN_TIER_NAMES = Object.freeze({
  12: 'Enterprise',
  14: 'Teams',
  15: 'Teams',
  16: 'Pro',
  17: 'Max',
  19: 'Free',
  20: 'Trial',
})

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** CLI stores `devin-session-token$…`; a pasted raw key gets the prefix once. */
export function normalizeDevinToken(value) {
  const token = trimmed(value)
  if (!token) return undefined
  return token.startsWith(DEVIN_SESSION_PREFIX) ? token : `${DEVIN_SESSION_PREFIX}${token}`
}

/**
 * Every stored devin session carries the `devin-session-token$` prefix
 * (devinSession normalizes on the way in). A foreign-shaped row in the devin
 * vault slot — e.g. written by a host build that misrouted the import — is
 * not a usable devin login and must not block CLI auto-import.
 */
export function isDevinSessionToken(value) {
  return typeof value === 'string' && value.startsWith(DEVIN_SESSION_PREFIX)
}

export function devinTokenExpiry(token, now = Date.now()) {
  const payload = decodeJwtPayload(token?.startsWith(DEVIN_SESSION_PREFIX) ? token.slice(DEVIN_SESSION_PREFIX.length) : token)
  if (payload && typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
    return payload.exp * 1000 - DEVIN_PREEMPT_MS
  }
  return now + DEVIN_FALLBACK_EXPIRES_MS
}

/** `user-…` ids and token-suffix vault keys are not display names. */
export function isDevinOpaqueAccount(value) {
  if (typeof value !== 'string' || !value.trim()) return true
  const raw = value.trim()
  if (raw.toLowerCase() === 'devin') return true
  if (/^devin-[A-Za-z0-9_-]{4,}$/i.test(raw)) return true
  // Any `devin-<kind>$<opaque>` id: devin-team$… and the session-token shape
  // devin-session-token$eyJ… (the `$` used to slip past the patterns below).
  if (/^devin-[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/i.test(raw)) return true
  if (/^user-[0-9a-f]{16,}$/i.test(raw)) return true
  return false
}

export function pickDevinHumanAccount(...candidates) {
  for (const value of candidates) {
    const next = trimmed(value)
    if (!next || isDevinOpaqueAccount(next)) continue
    return next
  }
  return undefined
}

/** api.devin.ai/auth/cli/token answers `{ token }` (JSON). */
export function parseDevinTokenResponse(value, endpoint = 'Devin token') {
  if (!value || typeof value !== 'object') throw new Error(`${endpoint} returned an invalid token response`)
  const token = trimmed(value.token)
    ?? trimmed(value.session_token)
    ?? trimmed(value.sessionToken)
    ?? trimmed(value.access_token)
    ?? trimmed(value.api_key)
  if (!token) throw new Error(`${endpoint} returned no session token`)
  return { token: normalizeDevinToken(token) }
}

export function devinSession({
  accessToken,
  expiresAt,
  account,
  planType,
  apiServer,
  source = 'pkce',
}: any = {}) {
  const access = normalizeDevinToken(accessToken)
  if (!access) throw new Error('devin session needs a session token')
  const expiry = typeof expiresAt === 'number' && Number.isFinite(expiresAt)
    ? expiresAt
    : devinTokenExpiry(access)
  const server = trimmed(apiServer)
  return {
    accessToken: access,
    // No refresh endpoint exists for CLI session tokens; keep the same value
    // so the auth-store shape stays valid and TokenManager never round-trips.
    refreshToken: access,
    expiresAt: expiry,
    ...(trimmed(account) ? { account: trimmed(account) } : {}),
    ...(trimmed(planType) ? { planType: trimmed(planType) } : {}),
    ...(server ? { apiServer: server.replace(/\/+$/, '') } : {}),
    source: DEVIN_SOURCES.includes(source) ? source : 'pkce',
  }
}

export const DEVIN_SOURCES = Object.freeze(['pkce', 'cli_toml', 'paste', 'env'])

export function devinSourceLabel(source) {
  const key = String(source ?? '').trim()
  if (key === 'cli_toml') return 'CLI'
  if (key === 'env') return 'env'
  if (key === 'paste') return 'key'
  if (key === 'pkce') return 'PKCE'
  return undefined
}

export function devinApiServer(session) {
  return trimmed(process.env.WINDSURF_API_SERVER_URL)
    || trimmed(session?.apiServer)
    || DEVIN_API_SERVER
}

/**
 * The token has no refresh grant. When the stored expiry is near, probe
 * GetUserStatus: a live session token stays valid, a dead one is a permanent
 * 401 → re-login. Never mutates the stored credential.
 */
export async function refreshDevin(session, { fetchFn = outboundFetch, statusFn }: any = {}) {
  const access = normalizeDevinToken(session?.accessToken)
  if (!access) throw new Error('devin session needs a session token')
  if (session?.expiresAt && Date.now() < session.expiresAt) return session
  const probe = typeof statusFn === 'function' ? statusFn : undefined
  if (!probe) return session
  // A probe HTTP failure is an OAuthEndpointError carrying its status.
  await probe(session, { fetchFn })
  return { ...session, accessToken: access, expiresAt: Date.now() + DEVIN_FALLBACK_EXPIRES_MS }
}

/**
 * Loopback PKCE spec for the shared OAuthFlowManager. The authorize URL is
 * what `devin auth login` builds (including `cli_pkce_marker=1`).
 */
export const devinFlow = Object.freeze({
  callbackPath: DEVIN_CALLBACK_PATH,
  listen: { host: '127.0.0.1', ports: [DEVIN_CALLBACK_PORT, 0] },
  buildAuthorizeUrl({ redirectUri, state, pkce }) {
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      state,
      cli_pkce_marker: '1',
      prompt: 'select_account',
      code_challenge: pkce.challenge,
      code_challenge_method: 'S256',
    })
    return `${DEVIN_WEBAPP_URL}${DEVIN_AUTHORIZE_PATH}?${params.toString()}`
  },
})

export async function exchangeDevinCode(code, verifier, { fetchFn = outboundFetch } = {}) {
  const response = await fetchFn(`${DEVIN_API_URL}${DEVIN_TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      code,
      code_verifier: verifier,
      cli_pkce_marker: 1,
    }),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Devin CLI token exchange failed (HTTP ${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
  }
  const { token } = parseDevinTokenResponse(await response.json(), 'Devin CLI token exchange')
  return devinSession({ accessToken: token, source: 'pkce' })
}

/** Devin chat is Completions-shaped at the DSH edge; efforts ride the uid. */
export const DEVIN_REASONING = Object.freeze({
  off: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
})

/**
 * Static floor mirroring the live GetCliModelConfigs probe (2026-09-29, Pro
 * tier, 3000.10.31 credentials): 659 configs → 640 family-bearing → 82 picker
 * rows across 50 families. `variants` maps a DSH effort key to the backend's
 * `chat_model_uid`; `defaultUid` is the config upstream flags
 * `is_default_model_in_family` (no-effort rows carry it explicitly). Login /
 * import / quota refresh replaces the floor with live rows when the RPC returns
 * usable rows (catalog.ts); a failed or empty RPC falls back to this mirror.
 * Per-field source is in README.md 模型 / 归因. Rows live in
 * `src/catalog/models.json` under `"devin"` (`variants` maps a DSH effort key
 * to the backend `chat_model_uid`; `defaultUid` is the family's default uid).
 */
export const DEVIN_MODELS = catalogRows('devin')

/** Catalog lookup for the custom-context ceiling (`familyMaxContextWindow`). */
export function devinModel(modelId) {
  return DEVIN_MODELS.find((model) => model.id === modelId)
}
