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
  if (/^devin-team\$[A-Za-z0-9_-]+$/i.test(raw)) return true
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
export async function refreshDevin(session, { fetchFn = fetch, statusFn }: any = {}) {
  const access = normalizeDevinToken(session?.accessToken)
  if (!access) throw new Error('devin session needs a session token')
  if (session?.expiresAt && Date.now() < session.expiresAt) return session
  const probe = typeof statusFn === 'function' ? statusFn : undefined
  if (!probe) return session
  try {
    await probe(session, { fetchFn })
    return { ...session, accessToken: access, expiresAt: Date.now() + DEVIN_FALLBACK_EXPIRES_MS }
  } catch (error) {
    const next = error instanceof Error ? error : new Error(String(error))
    throw /401|403|unauthenticated|permission/i.test(next.message)
      ? Object.assign(next, { permanent: true })
      : next
  }
}

export function isDevinPermanentRefreshError(error) {
  if (error?.permanent === true) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /401|403|unauthenticated|expired; sign in again/i.test(message)
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

export async function exchangeDevinCode(code, verifier, { fetchFn = fetch } = {}) {
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

function devinModel(id, name, contextWindow, maxTokens, variants, { input = ['text', 'image'], defaultUid }: any = {}) {
  return {
    id,
    name,
    contextWindow,
    maxTokens,
    input,
    variants: Object.freeze({ ...variants }),
    defaultUid: defaultUid ?? variants.medium ?? Object.values(variants)[0] ?? id,
    reasoningEfforts: Object.keys(variants).length > 0 ? Object.freeze({ ...variants }) : false,
  }
}

/**
 * Static floor mirroring the live GetCliModelConfigs probe (2026-09-23, Pro
 * tier, 3000.10.31 credentials): 598 configs → 580 family-bearing → 81 picker
 * rows across 49 families. `variants` maps a DSH effort key to the backend's
 * `chat_model_uid`; `defaultUid` is the config upstream flags
 * `is_default_model_in_family` (no-effort rows carry it explicitly). Login /
 * import / quota refresh replaces the floor with live rows when the RPC returns
 * usable rows (catalog.ts); a failed or empty RPC falls back to this mirror.
 * Per-field source is in README.md 模型 / 归因.
 */
export const DEVIN_MODELS = Object.freeze([
  devinModel('claude-fable-5-1', 'Claude Fable 5.1', 1_000_000, 128_000, {
    medium: 'claude-fable-5-1-medium', low: 'claude-fable-5-1-low', high: 'claude-fable-5-1-high',
    xhigh: 'claude-fable-5-1-xhigh', max: 'claude-fable-5-1-max',
  }),
  devinModel('claude-opus-5-5', 'Claude Opus 5.5', 1_000_000, 128_000, {
    medium: 'claude-opus-5-5-medium', low: 'claude-opus-5-5-low', high: 'claude-opus-5-5-high',
    xhigh: 'claude-opus-5-5-xhigh', max: 'claude-opus-5-5-max',
  }),
  devinModel('claude-sonnet-5', 'Claude Sonnet 5', 1_000_000, 128_000, {
    medium: 'claude-sonnet-5-medium', low: 'claude-sonnet-5-low', high: 'claude-sonnet-5-high',
    xhigh: 'claude-sonnet-5-xhigh', max: 'claude-sonnet-5-max',
  }),
  devinModel('gemini-3-8-flash', 'Gemini 3.8 Flash', 1_048_576, 65_535, {
    medium: 'gemini-3-8-flash-medium', low: 'gemini-3-8-flash-low', high: 'gemini-3-8-flash-high',
  }),
  devinModel('glm-5.2', 'GLM-5.2', 200_000, 128_000, {
    high: 'glm-5-2', max: 'glm-5-2-max', off: 'glm-5-2-none',
  }, { input: ['text'] }),
  devinModel('glm-5-3', 'GLM-5.3', 1_048_576, 128_000, {
    low: 'glm-5-3-low', high: 'glm-5-3-high', max: 'glm-5-3-max',
  }, { defaultUid: 'glm-5-3-max', input: ['text'] }),
  devinModel('gpt-6-astra', 'GPT-6 Astra', 1_000_000, 128_000, {
    medium: 'gpt-6-astra-medium', low: 'gpt-6-astra-low', high: 'gpt-6-astra-high',
    xhigh: 'gpt-6-astra-xhigh', max: 'gpt-6-astra-max',
  }),
  devinModel('gpt-6-luna', 'GPT-6 Luna', 1_000_000, 128_000, {
    medium: 'gpt-6-luna-medium', off: 'gpt-6-luna-none', low: 'gpt-6-luna-low',
    high: 'gpt-6-luna-high', xhigh: 'gpt-6-luna-xhigh', max: 'gpt-6-luna-max',
  }),
  devinModel('gpt-6-sol', 'GPT-6 Sol', 1_000_000, 128_000, {
    medium: 'gpt-6-sol-medium', off: 'gpt-6-sol-none', low: 'gpt-6-sol-low',
    high: 'gpt-6-sol-high', xhigh: 'gpt-6-sol-xhigh', max: 'gpt-6-sol-max',
  }),
  devinModel('kimi-k3', 'Kimi K3', 1_048_576, 131_072, {
    high: 'kimi-k3-high', low: 'kimi-k3-low', max: 'kimi-k3-max',
  }),
  devinModel('swe-1.7-lightning', 'SWE-1.7 Lightning', 202_752, 96_000, {
    max: 'swe-1-7-lightning', medium: 'swe-1-7-lightning-medium',
  }),
  devinModel('swe-2', 'SWE-2', 262_000, 128_000, {
    high: 'swe-2-high', medium: 'swe-2-medium', max: 'swe-2-max',
  }, { defaultUid: 'swe-2-high' }),
  devinModel('claude-5-fable', 'Claude Fable 5', 1_000_000, 128_000, {
    low: 'claude-5-fable-low', medium: 'claude-5-fable-medium', high: 'claude-5-fable-high',
    xhigh: 'claude-5-fable-xhigh', max: 'claude-5-fable-max',
  }),
  devinModel('claude-opus-4.5', 'Claude Opus 4.5', 200_000, 64_000, {}, { defaultUid: 'MODEL_CLAUDE_4_5_OPUS' }),
  devinModel('claude-opus-4.5-thinking', 'Claude Opus 4.5 Thinking', 200_000, 64_000, {}, { defaultUid: 'MODEL_CLAUDE_4_5_OPUS_THINKING' }),
  devinModel('claude-opus-4.6', 'Claude Opus 4.6', 200_000, 128_000, {}, { defaultUid: 'claude-opus-4-6' }),
  devinModel('claude-opus-4.6-1m', 'Claude Opus 4.6 1M', 1_000_000, 128_000, {}, { defaultUid: 'claude-opus-4-6-1m' }),
  devinModel('claude-opus-4.6-thinking', 'Claude Opus 4.6 Thinking', 200_000, 128_000, {}, { defaultUid: 'claude-opus-4-6-thinking' }),
  devinModel('claude-opus-4.6-thinking-1m', 'Claude Opus 4.6 Thinking 1M', 1_000_000, 128_000, {}, { defaultUid: 'claude-opus-4-6-thinking-1m' }),
  devinModel('claude-opus-4.7', 'Claude Opus 4.7', 1_000_000, 128_000, {
    medium: 'claude-opus-4-7-medium', low: 'claude-opus-4-7-low', high: 'claude-opus-4-7-high',
    xhigh: 'claude-opus-4-7-xhigh', max: 'claude-opus-4-7-max',
  }),
  devinModel('claude-opus-4.8', 'Claude Opus 4.8', 1_000_000, 128_000, {
    medium: 'claude-opus-4-8-medium', low: 'claude-opus-4-8-low', high: 'claude-opus-4-8-high',
    xhigh: 'claude-opus-4-8-xhigh', max: 'claude-opus-4-8-max',
  }),
  devinModel('claude-opus-4.8-fast', 'Claude Opus 4.8 Fast', 1_000_000, 128_000, {
    low: 'claude-opus-4-8-low-fast', medium: 'claude-opus-4-8-medium-fast', high: 'claude-opus-4-8-high-fast',
    xhigh: 'claude-opus-4-8-xhigh-fast', max: 'claude-opus-4-8-max-fast',
  }),
  devinModel('claude-opus-5', 'Claude Opus 5', 1_000_000, 128_000, {
    medium: 'claude-opus-5-medium', low: 'claude-opus-5-low', high: 'claude-opus-5-high',
    xhigh: 'claude-opus-5-xhigh', max: 'claude-opus-5-max',
  }),
  devinModel('claude-opus-5-fast', 'Claude Opus 5 Fast', 1_000_000, 128_000, {
    low: 'claude-opus-5-low-fast', medium: 'claude-opus-5-medium-fast', high: 'claude-opus-5-high-fast',
    xhigh: 'claude-opus-5-xhigh-fast', max: 'claude-opus-5-max-fast',
  }),
  devinModel('claude-opus-5-5-fast', 'Claude Opus 5.5 Fast', 1_000_000, 128_000, {
    low: 'claude-opus-5-5-low-fast', medium: 'claude-opus-5-5-medium-fast', high: 'claude-opus-5-5-high-fast',
    xhigh: 'claude-opus-5-5-xhigh-fast', max: 'claude-opus-5-5-max-fast',
  }),
  devinModel('claude-sonnet-4.5', 'Claude Sonnet 4.5', 200_000, 64_000, {}, { defaultUid: 'MODEL_PRIVATE_2' }),
  devinModel('claude-sonnet-4.5-thinking', 'Claude Sonnet 4.5 Thinking', 200_000, 64_000, {}, { defaultUid: 'MODEL_PRIVATE_3' }),
  devinModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', 200_000, 128_000, {}, { defaultUid: 'claude-sonnet-4-6' }),
  devinModel('claude-sonnet-4.6-1m', 'Claude Sonnet 4.6 1M', 1_000_000, 128_000, {}, { defaultUid: 'claude-sonnet-4-6-1m' }),
  devinModel('claude-sonnet-4.6-thinking', 'Claude Sonnet 4.6 Thinking', 200_000, 128_000, {}, { defaultUid: 'claude-sonnet-4-6-thinking' }),
  devinModel('claude-sonnet-4.6-thinking-1m', 'Claude Sonnet 4.6 Thinking 1M', 1_000_000, 128_000, {}, { defaultUid: 'claude-sonnet-4-6-thinking-1m' }),
  devinModel('deepseek-v4-flash', 'DeepSeek V4 Flash', 1_048_576, 384_000, {
    high: 'deepseek-v4-flash-high', max: 'deepseek-v4-flash-max',
  }, { input: ['text'] }),
  devinModel('deepseek-v4-pro', 'DeepSeek V4 Pro', 1_048_576, 384_000, {
    high: 'deepseek-v4-pro-high', max: 'deepseek-v4-pro-max',
  }, { input: ['text'] }),
  devinModel('deepseek-v4-1-flash', 'DeepSeek V4.1 Flash', 1_048_576, 384_000, {
    high: 'deepseek-v4-1-flash-high', max: 'deepseek-v4-1-flash-max',
  }),
  devinModel('fusion', 'Fusion', 1_000_000, undefined, {}, { defaultUid: 'fusion-claude-fable-5-1-medium-sidekick-swe-2-medium' }),
  devinModel('fusion-fast', 'Fusion Fast', 1_000_000, undefined, {}, { defaultUid: 'fusion-claude-opus-5-high-fast-sidekick-swe-2-medium' }),
  devinModel('fusion-thinking', 'Fusion Thinking', 1_000_000, undefined, {}, { defaultUid: 'fusion-gpt-5-6-sol-high-sidekick-swe-2-medium' }),
  devinModel('fusion-thinking-fast', 'Fusion Thinking Fast', 1_000_000, undefined, {}, { defaultUid: 'fusion-gpt-5-6-sol-high-fast-sidekick-swe-2-medium' }),
  devinModel('gemini-3.0-flash', 'Gemini 3 Flash', 1_048_576, 65_535, {
    minimal: 'MODEL_GOOGLE_GEMINI_3_0_FLASH_MINIMAL', low: 'MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW', medium: 'MODEL_GOOGLE_GEMINI_3_0_FLASH_MEDIUM',
    high: 'MODEL_GOOGLE_GEMINI_3_0_FLASH_HIGH',
  }),
  devinModel('gemini-3.1-pro', 'Gemini 3.1 Pro', 1_048_576, 65_535, {
    low: 'gemini-3-1-pro-low', high: 'gemini-3-1-pro-high',
  }, { defaultUid: 'gemini-3-1-pro-high' }),
  devinModel('gemini-3.5-flash', 'Gemini 3.5 Flash', 1_048_576, 65_535, {
    minimal: 'gemini-3-5-flash-minimal', low: 'gemini-3-5-flash-low', medium: 'gemini-3-5-flash-medium',
    high: 'gemini-3-5-flash-high',
  }),
  devinModel('gemini-3.6-flash', 'Gemini 3.6 Flash', 1_048_576, 65_535, {
    minimal: 'gemini-3-6-flash-minimal', low: 'gemini-3-6-flash-low', medium: 'gemini-3-6-flash-medium',
    high: 'gemini-3-6-flash-high',
  }),
  devinModel('gemini-3-7-flash', 'Gemini 3.7 Flash', 1_048_576, 65_535, {
    low: 'gemini-3-7-flash-low', medium: 'gemini-3-7-flash-medium', high: 'gemini-3-7-flash-high',
  }),
  devinModel('glm-5.2-1m', 'GLM-5.2 1M', 1_000_000, 128_000, {
    high: 'glm-5-2-1m', max: 'glm-5-2-max-1m',
  }, { input: ['text'] }),
  devinModel('glm-5.2-thinking-1m', 'GLM-5.2 Thinking 1M', 1_000_000, 128_000, {}, { defaultUid: 'glm-5-2-none-1m', input: ['text'] }),
  devinModel('glm-5-3-flash', 'GLM-5.3 Flash', 1_000_000, 128_000, {
    low: 'glm-5-3-flash-low', high: 'glm-5-3-flash-high', max: 'glm-5-3-flash-max',
  }, { defaultUid: 'glm-5-3-flash-max' }),
  devinModel('gpt-5.1', 'GPT-5.1', 272_000, 128_000, {
    off: 'MODEL_PRIVATE_12', low: 'MODEL_PRIVATE_13', medium: 'MODEL_PRIVATE_14',
    high: 'MODEL_PRIVATE_15',
  }),
  devinModel('gpt-5.2', 'GPT-5.2', 384_000, 128_000, {
    low: 'MODEL_GPT_5_2_LOW', medium: 'MODEL_GPT_5_2_MEDIUM', off: 'MODEL_GPT_5_2_NONE',
    high: 'MODEL_GPT_5_2_HIGH', xhigh: 'MODEL_GPT_5_2_XHIGH',
  }),
  devinModel('gpt-5.3-codex', 'GPT-5.3-Codex', 400_000, 128_000, {
    low: 'gpt-5-3-codex-low', medium: 'gpt-5-3-codex-medium', high: 'gpt-5-3-codex-high',
    xhigh: 'gpt-5-3-codex-xhigh',
  }),
  devinModel('gpt-5.3-codex-fast', 'GPT-5.3-Codex Fast', 400_000, 128_000, {
    low: 'gpt-5-3-codex-low-priority', medium: 'gpt-5-3-codex-medium-priority', high: 'gpt-5-3-codex-high-priority',
    xhigh: 'gpt-5-3-codex-xhigh-priority',
  }),
  devinModel('gpt-5.4', 'GPT-5.4', 272_000, 128_000, {
    off: 'gpt-5-4-none', low: 'gpt-5-4-low', medium: 'gpt-5-4-medium',
    high: 'gpt-5-4-high', xhigh: 'gpt-5-4-xhigh',
  }),
  devinModel('gpt-5.4-fast', 'GPT-5.4 Fast', 272_000, 128_000, {
    low: 'gpt-5-4-low-priority', medium: 'gpt-5-4-medium-priority', high: 'gpt-5-4-high-priority',
    xhigh: 'gpt-5-4-xhigh-priority',
  }),
  devinModel('gpt-5.4-mini', 'GPT-5.4 Mini', 400_000, 128_000, {
    low: 'gpt-5-4-mini-low', medium: 'gpt-5-4-mini-medium', high: 'gpt-5-4-mini-high',
    xhigh: 'gpt-5-4-mini-xhigh',
  }),
  devinModel('gpt-5.4-thinking-fast', 'GPT-5.4 Thinking Fast', 272_000, 128_000, {}, { defaultUid: 'gpt-5-4-none-priority' }),
  devinModel('gpt-5.5', 'GPT-5.5', 272_000, 128_000, {
    off: 'gpt-5-5-none', low: 'gpt-5-5-low', medium: 'gpt-5-5-medium',
    high: 'gpt-5-5-high', xhigh: 'gpt-5-5-xhigh',
  }, { defaultUid: 'gpt-5-5-low' }),
  devinModel('gpt-5.5-fast', 'GPT-5.5 Fast', 272_000, 128_000, {
    low: 'gpt-5-5-low-priority', medium: 'gpt-5-5-medium-priority', high: 'gpt-5-5-high-priority',
    xhigh: 'gpt-5-5-xhigh-priority',
  }),
  devinModel('gpt-5.5-thinking-fast', 'GPT-5.5 Thinking Fast', 272_000, 128_000, {}, { defaultUid: 'gpt-5-5-none-priority' }),
  devinModel('gpt-5.6-luna', 'GPT-5.6 Luna', 1_000_000, 128_000, {
    off: 'gpt-5-6-luna-none', low: 'gpt-5-6-luna-low', medium: 'gpt-5-6-luna-medium',
    high: 'gpt-5-6-luna-high', xhigh: 'gpt-5-6-luna-xhigh', max: 'gpt-5-6-luna-max',
  }),
  devinModel('gpt-5.6-luna-fast', 'GPT-5.6 Luna Fast', 1_000_000, 128_000, {
    low: 'gpt-5-6-luna-low-priority', medium: 'gpt-5-6-luna-medium-priority', high: 'gpt-5-6-luna-high-priority',
    xhigh: 'gpt-5-6-luna-xhigh-priority', max: 'gpt-5-6-luna-max-priority',
  }),
  devinModel('gpt-5.6-luna-thinking-fast', 'GPT-5.6 Luna Thinking Fast', 1_000_000, 128_000, {}, { defaultUid: 'gpt-5-6-luna-none-priority' }),
  devinModel('gpt-5.6-sol', 'GPT-5.6 Sol', 1_000_000, 128_000, {
    off: 'gpt-5-6-sol-none', low: 'gpt-5-6-sol-low', medium: 'gpt-5-6-sol-medium',
    high: 'gpt-5-6-sol-high', xhigh: 'gpt-5-6-sol-xhigh', max: 'gpt-5-6-sol-max',
  }),
  devinModel('gpt-5.6-sol-fast', 'GPT-5.6 Sol Fast', 1_000_000, 128_000, {
    low: 'gpt-5-6-sol-low-priority', medium: 'gpt-5-6-sol-medium-priority', high: 'gpt-5-6-sol-high-priority',
    xhigh: 'gpt-5-6-sol-xhigh-priority', max: 'gpt-5-6-sol-max-priority',
  }),
  devinModel('gpt-5.6-sol-thinking-fast', 'GPT-5.6 Sol Thinking Fast', 1_000_000, 128_000, {}, { defaultUid: 'gpt-5-6-sol-none-priority' }),
  devinModel('gpt-5.6-terra', 'GPT-5.6 Terra', 1_000_000, 128_000, {
    off: 'gpt-5-6-terra-none', low: 'gpt-5-6-terra-low', medium: 'gpt-5-6-terra-medium',
    high: 'gpt-5-6-terra-high', xhigh: 'gpt-5-6-terra-xhigh', max: 'gpt-5-6-terra-max',
  }),
  devinModel('gpt-5.6-terra-fast', 'GPT-5.6 Terra Fast', 1_000_000, 128_000, {
    low: 'gpt-5-6-terra-low-priority', medium: 'gpt-5-6-terra-medium-priority', high: 'gpt-5-6-terra-high-priority',
    xhigh: 'gpt-5-6-terra-xhigh-priority', max: 'gpt-5-6-terra-max-priority',
  }),
  devinModel('gpt-5.6-terra-thinking-fast', 'GPT-5.6 Terra Thinking Fast', 1_000_000, 128_000, {}, { defaultUid: 'gpt-5-6-terra-none-priority' }),
  devinModel('gpt-6-astra-fast', 'GPT-6 Astra Fast', 1_000_000, 128_000, {
    low: 'gpt-6-astra-low-priority', medium: 'gpt-6-astra-medium-priority', high: 'gpt-6-astra-high-priority',
    xhigh: 'gpt-6-astra-xhigh-priority', max: 'gpt-6-astra-max-priority',
  }),
  devinModel('gpt-6-luna-fast', 'GPT-6 Luna Fast', 1_000_000, 128_000, {
    low: 'gpt-6-luna-low-priority', medium: 'gpt-6-luna-medium-priority', high: 'gpt-6-luna-high-priority',
    xhigh: 'gpt-6-luna-xhigh-priority', max: 'gpt-6-luna-max-priority',
  }),
  devinModel('gpt-6-luna-thinking-fast', 'GPT-6 Luna Thinking Fast', 1_000_000, 128_000, {}, { defaultUid: 'gpt-6-luna-none-priority' }),
  devinModel('gpt-6-sol-fast', 'GPT-6 Sol Fast', 1_000_000, 128_000, {
    low: 'gpt-6-sol-low-priority', medium: 'gpt-6-sol-medium-priority', high: 'gpt-6-sol-high-priority',
    xhigh: 'gpt-6-sol-xhigh-priority', max: 'gpt-6-sol-max-priority',
  }),
  devinModel('gpt-6-sol-thinking-fast', 'GPT-6 Sol Thinking Fast', 1_000_000, 128_000, {}, { defaultUid: 'gpt-6-sol-none-priority' }),
  devinModel('grok-4.5', 'Grok 4.5', 500_000, 100_000, {
    low: 'grok-4-5-low', medium: 'grok-4-5-medium', high: 'grok-4-5-high',
  }),
  devinModel('grok-4-6', 'Grok 4.6', 500_000, 100_000, {
    low: 'grok-4-6-low', medium: 'grok-4-6-medium', high: 'grok-4-6-high',
    xhigh: 'grok-4-6-xhigh',
  }),
  devinModel('grok-4-7', 'Grok 4.7', 500_000, 100_000, {
    low: 'grok-4-7-low', medium: 'grok-4-7-medium', high: 'grok-4-7-high',
    xhigh: 'grok-4-7-xhigh',
  }),
  devinModel('inkling', 'Inkling', 1_048_576, 131_072, {
    off: 'inkling-none', low: 'inkling-low', medium: 'inkling-medium',
    high: 'inkling-high', xhigh: 'inkling-xhigh', max: 'inkling-max',
  }, { input: ['text'] }),
  devinModel('kimi-k2.6', 'Kimi K2.6', 262_144, 8_192, {}, { defaultUid: 'kimi-k2-6' }),
  devinModel('kimi-k2.7', 'Kimi K2.7', 262_144, 16_000, {}, { defaultUid: 'kimi-k2-7' }),
  devinModel('nemotron-3-ultra', 'Nemotron 3 Ultra', 1_000_000, 32_768, {
    off: 'nemotron-3-ultra-none', medium: 'nemotron-3-ultra-medium', high: 'nemotron-3-ultra-high',
  }, { defaultUid: 'nemotron-3-ultra-high', input: ['text'] }),
  devinModel('swe-1.6', 'SWE-1.6', 200_000, 128_000, {}, { defaultUid: 'swe-1-6' }),
  devinModel('swe-1.6-fast', 'SWE-1.6 Fast', 200_000, 128_000, {}, { defaultUid: 'swe-1-6-fast' }),
  devinModel('swe-1.7', 'SWE-1.7', 262_000, 128_000, {
    max: 'swe-1-7', medium: 'swe-1-7-medium',
  }),
])
