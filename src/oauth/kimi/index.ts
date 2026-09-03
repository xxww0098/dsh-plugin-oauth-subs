/**
 * Moonshot Kimi Code Plan OAuth.
 *
 * Public client_id matches Kimi Code / pi-provider-kimi-code
 * (`17e5f671-d194-4dfb-9706-5516cb48c098`, https://auth.kimi.com).
 * Login is RFC 8628 device-code only — no PKCE.
 */

import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { OAuthEndpointError, oauthError } from '../codex/index.js'

export { applyKimiCache, kimiCacheHeaders, kimiCacheSessionId, resetKimiPins } from './cache.js'

export const KIMI_CLIENT_ID = '17e5f671-d194-4dfb-9706-5516cb48c098'
export const KIMI_OAUTH_HOST = 'https://auth.kimi.com'
export const KIMI_DEVICE_URL = `${KIMI_OAUTH_HOST}/api/oauth/device_authorization`
export const KIMI_TOKEN_URL = `${KIMI_OAUTH_HOST}/api/oauth/token`
export const KIMI_API_ORIGIN = 'https://api.kimi.com'
export const KIMI_API_BASE = `${KIMI_API_ORIGIN}/coding/v1`
export const KIMI_CHAT_URL = `${KIMI_API_BASE}/chat/completions`
export const KIMI_MODELS_URL = `${KIMI_API_BASE}/models`
export const KIMI_USAGE_URL = `${KIMI_API_BASE}/usages`
export const KIMI_ME_URL = `${KIMI_API_BASE}/me`
export const KIMI_USER_AGENT = 'dsh-plugin-oauth-subs'
export const KIMI_PLATFORM = 'dsh'
export const KIMI_PREEMPT_MS = 2 * 60_000
export const KIMI_NEVER_EXPIRES = 8.64e15
export const KIMI_CONTEXT_WINDOW = 262_144
export const KIMI_MAX_TOKENS = 32_000
export const KIMI_INPUT = Object.freeze(['text', 'image'])
export const KIMI_SOURCES = Object.freeze(['oauth', 'cli', 'paste', 'env'])

/**
 * DSH picker keys → Kimi `thinking.effort` (pi-provider default map).
 * Vendor `none` is never a key.
 */
export const KIMI_REASONING = Object.freeze({
  off: 'off',
  minimal: 'low',
  low: 'low',
  medium: 'high',
  high: 'high',
  xhigh: 'max',
  max: 'max',
})

export const KIMI_MODELS = Object.freeze([
  {
    id: 'kimi-for-coding',
    name: 'Kimi for Coding',
    contextWindow: KIMI_CONTEXT_WINDOW,
    maxTokens: KIMI_MAX_TOKENS,
    input: [...KIMI_INPUT],
    reasoningEfforts: { ...KIMI_REASONING },
  },
  {
    id: 'kimi-for-coding-highspeed',
    name: 'Kimi for Coding High Speed',
    contextWindow: KIMI_CONTEXT_WINDOW,
    maxTokens: KIMI_MAX_TOKENS,
    input: [...KIMI_INPUT],
    reasoningEfforts: { ...KIMI_REASONING },
  },
  {
    id: 'k3',
    name: 'Kimi K3',
    contextWindow: KIMI_CONTEXT_WINDOW,
    maxTokens: KIMI_MAX_TOKENS,
    input: [...KIMI_INPUT],
    reasoningEfforts: { ...KIMI_REASONING },
  },
])

let identityDir

export function configureKimiIdentity(dataDir) {
  identityDir = typeof dataDir === 'string' && dataDir.trim() ? dataDir.trim() : undefined
}

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function kimiSourceLabel(source) {
  if (source === 'env') return 'env'
  if (source === 'paste') return 'key'
  if (source === 'cli') return 'CLI'
  if (source === 'oauth') return 'OAuth'
  return undefined
}

export function isKimiKeySource(source) {
  return source === 'paste' || source === 'env'
}

export function kimiAccountFingerprint(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 8)
}

export function kimiDefaultAccount(token) {
  return `kimi-${kimiAccountFingerprint(token)}`
}

export function isKimiOpaqueAccount(value) {
  return /^kimi-[0-9a-f]{8}$/i.test(String(value ?? '').trim())
}

export function parseKimiApiKey(value) {
  const key = trimmed(value)
  if (!key || key.length < 8) throw new Error('kimi API key is empty')
  return key
}

const SYSTEM_NAME = Object.freeze({
  aix: 'AIX',
  freebsd: 'FreeBSD',
  linux: 'Linux',
  openbsd: 'OpenBSD',
  sunos: 'SunOS',
})

export function computeKimiDeviceModel({ platform, release, arch, macVersion } = {}) {
  const osName = platform ?? process.platform
  const rel = release ?? os.release()
  const cpu = arch ?? os.machine?.() ?? process.arch
  if (osName === 'darwin') {
    const version = macVersion || rel
    if (version && cpu) return `macOS ${version} ${cpu}`
    if (version) return `macOS ${version}`
    return `macOS ${cpu}`.trim()
  }
  if (osName === 'win32') {
    const parts = String(rel).split('.')
    let label = parts[0]
    if (label === '10' && parts.length >= 3) {
      const build = parseInt(parts[2], 10)
      if (!Number.isNaN(build) && build >= 22000) label = '11'
    }
    if (label && cpu) return `Windows ${label} ${cpu}`
    if (label) return `Windows ${label}`
    return `Windows ${cpu}`.trim()
  }
  const system = SYSTEM_NAME[osName] ?? osName
  if (rel && cpu) return `${system} ${rel} ${cpu}`
  if (rel) return `${system} ${rel}`
  return `${system} ${cpu}`.trim()
}

function asciiHeaderValue(value, fallback = 'unknown') {
  const text = String(value ?? '').trim()
  if (/^[\x00-\x7F]*$/.test(text)) return text || fallback
  const sanitized = text.replace(/[^\x00-\x7F]/g, '').trim()
  return sanitized || fallback
}

function kimiDeviceIdPath() {
  return join(identityDir || join(homedir(), '.dsh', 'plugins', 'oauth-subs'), 'kimi-device-id')
}

export function kimiStableDeviceId() {
  const path = kimiDeviceIdPath()
  try {
    if (existsSync(path)) {
      const saved = readFileSync(path, 'utf8').trim()
      if (saved) return saved
    }
  } catch {
    // fall through
  }
  const next = randomBytes(16).toString('hex')
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, next, { encoding: 'utf8', mode: 0o600 })
    try { chmodSync(path, 0o600) } catch { /* win / fat */ }
  } catch {
    // in-memory only
  }
  return next
}

/** Kimi Code–compatible X-Msh-* headers. UA is this plugin, not Pi. */
export function kimiCredentialHeaders() {
  return {
    'user-agent': KIMI_USER_AGENT,
    'x-msh-platform': KIMI_PLATFORM,
    'x-msh-version': KIMI_USER_AGENT,
    'x-msh-device-name': asciiHeaderValue(os.hostname()),
    'x-msh-device-model': asciiHeaderValue(computeKimiDeviceModel()),
    'x-msh-os-version': asciiHeaderValue(os.release()),
    'x-msh-device-id': kimiStableDeviceId(),
  }
}

export function kimiDeviceSpec({ fetchFn = fetch } = {}) {
  return {
    clientId: KIMI_CLIENT_ID,
    deviceCodeUrl: KIMI_DEVICE_URL,
    tokenUrl: KIMI_TOKEN_URL,
    fetchFn,
    headers: kimiCredentialHeaders(),
    restartOnExpired: true,
  }
}

export function kimiSession({
  accessToken,
  refreshToken,
  expiresAt,
  account,
  planType,
  source = 'oauth',
} = {}) {
  const access = trimmed(accessToken)
  if (!access) throw new Error('kimi token endpoint returned no access token')
  const key = isKimiKeySource(source)
  const refresh = trimmed(refreshToken) ?? (key ? access : undefined)
  if (!refresh) throw new Error('kimi token endpoint returned no refresh token')
  const expiry = typeof expiresAt === 'number' && Number.isFinite(expiresAt)
    ? expiresAt
    : (key ? KIMI_NEVER_EXPIRES : undefined)
  if (expiry === undefined) throw new Error('kimi token endpoint returned no usable expiry')
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresAt: expiry,
    tokenEndpoint: KIMI_TOKEN_URL,
    clientId: KIMI_CLIENT_ID,
    account: trimmed(account) ?? kimiDefaultAccount(access),
    source: KIMI_SOURCES.includes(source) ? source : 'oauth',
    ...(trimmed(planType) ? { planType: trimmed(planType) } : {}),
  }
}

export function kimiSessionFromTokens(tokens, fallback) {
  let expiresAt
  if (typeof tokens.expires_in === 'number' && tokens.expires_in > 0) {
    expiresAt = Date.now() + tokens.expires_in * 1000
  } else if (typeof tokens.expires_at === 'number' && tokens.expires_at > 0) {
    expiresAt = tokens.expires_at > 1e12 ? tokens.expires_at : tokens.expires_at * 1000
  } else {
    expiresAt = fallback?.expiresAt
  }
  return kimiSession({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? fallback?.refreshToken,
    expiresAt,
    account: fallback?.account,
    planType: fallback?.planType,
    source: fallback?.source ?? 'oauth',
  })
}

export async function completeKimiDevice(tokens) {
  return kimiSessionFromTokens(tokens, { source: 'oauth' })
}

export async function refreshKimi(session, fetchFn = fetch) {
  if (isKimiKeySource(session?.source) || session?.refreshToken === session?.accessToken) {
    if (!session?.accessToken) throw new Error('kimi session needs an API key')
    return session
  }
  const response = await fetchFn(session.tokenEndpoint ?? KIMI_TOKEN_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      ...kimiCredentialHeaders(),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: session.clientId ?? KIMI_CLIENT_ID,
      refresh_token: session.refreshToken,
    }).toString(),
  })
  if (response.status === 401 || response.status === 403) {
    throw await oauthError(response, 'kimi')
  }
  if (!response.ok) throw await oauthError(response, 'kimi')
  const next = kimiSessionFromTokens(await response.json(), session)
  return {
    ...next,
    account: next.account ?? session.account,
    planType: next.planType ?? session.planType,
    source: session.source === 'cli' ? 'cli' : 'oauth',
  }
}

export function isKimiPermanentRefreshError(error) {
  if (!(error instanceof OAuthEndpointError)) return false
  if (error.status === 401 || error.status === 403) return true
  return error.oauthCode === 'invalid_grant'
}

export function kimiUpstreamHeaders(session) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    accept: 'application/json',
    ...kimiCredentialHeaders(),
  }
}

export function parseKimiUserInfo(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const email = trimmed(payload.email)
  const nickname = trimmed(payload.nickname)
  const userId = trimmed(payload.user_id ?? payload.userId)
  const planType = trimmed(payload.user_level_name ?? payload.userLevelName ?? payload.plan ?? payload.plan_type)
  const account = email || nickname || userId
  if (!account && !planType) return undefined
  return {
    ...(account ? { account } : {}),
    ...(planType ? { planType } : {}),
  }
}

export async function resolveKimiIdentity(session, { fetchFn = fetch, signal } = {}) {
  const token = trimmed(session?.accessToken)
  if (!token) return undefined
  try {
    const response = await fetchFn(KIMI_ME_URL, {
      headers: kimiUpstreamHeaders(session),
      signal,
    })
    if (!response.ok) return undefined
    return parseKimiUserInfo(await response.json())
  } catch {
    return undefined
  }
}

export function kimiHomePaths({ env = process.env, home = homedir() } = {}) {
  const codeHome = trimmed(env.KIMI_CODE_HOME) || join(home, '.kimi-code')
  const shareHome = trimmed(env.KIMI_SHARE_DIR) || join(home, '.kimi')
  return [
    join(codeHome, 'credentials', 'kimi-code.json'),
    join(shareHome, 'credentials', 'kimi-code.json'),
  ]
}
