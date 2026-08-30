/**
 * Google Antigravity (cloudcode-pa) OAuth + chat fingerprint.
 *
 * Client id, scopes, callback path, and UA helpers match CLIProxyAPI
 * `internal/auth/antigravity` + `internal/misc/antigravity_version.go`
 * (current main). One official-IDE identity for login, project
 * discovery, refresh, and every generateContent call.
 */

import { randomUUID } from 'node:crypto'

// Public Google installed-app client from CLIProxyAPI constants.go (not a private secret).
export const ANTIGRAVITY_CLIENT_ID = [
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep',
  'apps.googleusercontent.com',
].join('.')
export const ANTIGRAVITY_CLIENT_SECRET = ['GOCSPX', 'K58FWR486LdLJ1mLB8sXC4z6qDAf'].join('-')
export const ANTIGRAVITY_CALLBACK_PORT = 51121
export const ANTIGRAVITY_CALLBACK_PATH = '/oauth-callback'
export const ANTIGRAVITY_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const ANTIGRAVITY_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const ANTIGRAVITY_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo?alt=json'
export const ANTIGRAVITY_API_URL = 'https://cloudcode-pa.googleapis.com'
export const ANTIGRAVITY_DAILY_API_URL = 'https://daily-cloudcode-pa.googleapis.com'
export const ANTIGRAVITY_API_VERSION = 'v1internal'
export const ANTIGRAVITY_LOAD_CODE_ASSIST_URL = `${ANTIGRAVITY_API_URL}/${ANTIGRAVITY_API_VERSION}:loadCodeAssist`
export const ANTIGRAVITY_ONBOARD_USER_URL = `${ANTIGRAVITY_DAILY_API_URL}/${ANTIGRAVITY_API_VERSION}:onboardUser`
export const ANTIGRAVITY_GENERATE_URL = `${ANTIGRAVITY_API_URL}/${ANTIGRAVITY_API_VERSION}:generateContent`
export const ANTIGRAVITY_STREAM_URL = `${ANTIGRAVITY_API_URL}/${ANTIGRAVITY_API_VERSION}:streamGenerateContent?alt=sse`
export const ANTIGRAVITY_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ')

/** Floor from CLIProxyAPI: Cloud Code rejects clients below 2.9.0. */
export const ANTIGRAVITY_FALLBACK_VERSION = '2.9.1'
export const ANTIGRAVITY_NODE_API_CLIENT_UA = 'google-api-nodejs-client/10.3.0'
export const ANTIGRAVITY_GOOG_API_CLIENT_UA = 'gl-node/22.21.1'
export const ANTIGRAVITY_BODY_USER_AGENT = 'antigravity'
export const ANTIGRAVITY_PREEMPT_MS = 5 * 60_000
export const ANTIGRAVITY_ONBOARD_ATTEMPTS = 5
export const ANTIGRAVITY_ONBOARD_PAUSE_MS = 2_000

export const ANTIGRAVITY_TEXT_INPUT = Object.freeze(['text'])
export const ANTIGRAVITY_VISION_INPUT = Object.freeze(['text', 'image'])

export const ANTIGRAVITY_REASONING_GEMINI = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
})

export const ANTIGRAVITY_REASONING_CLAUDE = Object.freeze({
  low: 'low',
  high: 'high',
})

/**
 * Live CLIProxyAPI `models.json` → `antigravity` (not Vertex-direct ids).
 * Probed against router-for-me/CLIProxyAPI main. llm-pi-ai only wires
 * text / image, so audio/video Gemini rows stay vision.
 */
export const ANTIGRAVITY_MODELS = Object.freeze([
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6', contextWindow: 200_000, maxTokens: 64_000, reasoningEfforts: ANTIGRAVITY_REASONING_CLAUDE, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200_000, maxTokens: 64_000, reasoningEfforts: ANTIGRAVITY_REASONING_CLAUDE, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-pro-agent', name: 'Gemini 3.1 Pro', contextWindow: 1_048_576, maxTokens: 65_535, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro Low', contextWindow: 1_048_576, maxTokens: 65_535, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', contextWindow: 1_048_576, maxTokens: 65_536, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3-flash-agent', name: 'Gemini 3.5 Flash', contextWindow: 1_048_576, maxTokens: 65_536, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3.6-flash-high', name: 'Gemini 3.6 Flash', contextWindow: 1_048_576, maxTokens: 65_536, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash', contextWindow: 1_048_576, maxTokens: 65_536, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', contextWindow: 1_048_576, maxTokens: 65_535, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3.5-flash-low', name: 'Gemini 3.5 Flash Medium', contextWindow: 1_048_576, maxTokens: 65_535, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3.5-flash-extra-low', name: 'Gemini 3.5 Flash Low', contextWindow: 1_048_576, maxTokens: 65_535, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image', contextWindow: 1_048_576, maxTokens: 32_768, reasoningEfforts: ANTIGRAVITY_REASONING_GEMINI, input: ANTIGRAVITY_VISION_INPUT },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B', contextWindow: 114_000, maxTokens: 32_768, reasoningEfforts: false, input: ANTIGRAVITY_TEXT_INPUT },
])

export const ANTIGRAVITY_PLAN_NAMES = Object.freeze({
  free: 'Free',
  free_tier: 'Free',
  freetier: 'Free',
  pro: 'Pro',
  ultra: 'Ultra',
})

const PERMANENT_REFRESH = new Set(['invalid_grant', 'invalid_client', 'unauthorized_client'])

export function antigravityPlatform(platform = process.platform, arch = process.arch) {
  const os = platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'windows' : 'linux'
  const cpu = arch === 'arm64' ? 'arm64' : 'amd64'
  return `${os}/${cpu}`
}

export function antigravityVersion() {
  return ANTIGRAVITY_FALLBACK_VERSION
}

/** Short runtime UA — userinfo, loadCodeAssist, chat. CLIProxyAPI AntigravityRequestUserAgent. */
export function antigravityRequestUserAgent() {
  return `antigravity/hub/${antigravityVersion()} ${antigravityPlatform()}`
}

/** Long control-plane UA — onboardUser only. CLIProxyAPI AntigravityOnboardUserUserAgent. */
export function antigravityOnboardUserUserAgent() {
  return `${antigravityRequestUserAgent()} ${ANTIGRAVITY_NODE_API_CLIENT_UA}`
}

export function antigravityLoadCodeAssistMetadata() {
  return { ideType: 'ANTIGRAVITY' }
}

export function antigravityControlPlaneMetadata() {
  return {
    ide_type: 'ANTIGRAVITY',
    ide_version: antigravityVersion(),
    ide_name: 'antigravity',
  }
}

function tokenHeaders() {
  return {
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': antigravityRequestUserAgent(),
  }
}

export function antigravityUserinfoHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`,
    'user-agent': antigravityRequestUserAgent(),
  }
}

export function antigravityLoadCodeAssistHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: '*/*',
    'content-type': 'application/json',
    'user-agent': antigravityRequestUserAgent(),
  }
}

export function antigravityOnboardUserHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: '*/*',
    'content-type': 'application/json',
    'user-agent': antigravityOnboardUserUserAgent(),
    'x-goog-api-client': ANTIGRAVITY_GOOG_API_CLIENT_UA,
  }
}

export function antigravityChatHeaders(session) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    accept: '*/*',
    'content-type': 'application/json',
    'user-agent': antigravityRequestUserAgent(),
  }
}

export const antigravityFlow = {
  callbackPath: ANTIGRAVITY_CALLBACK_PATH,
  listen: { host: 'localhost', ports: [ANTIGRAVITY_CALLBACK_PORT, 0] },
  timeoutMs: 300_000,
  buildAuthorizeUrl({ redirectUri, state }) {
    const params = new URLSearchParams({
      access_type: 'offline',
      client_id: ANTIGRAVITY_CLIENT_ID,
      prompt: 'consent',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: ANTIGRAVITY_SCOPE,
      state,
    })
    return `${ANTIGRAVITY_AUTHORIZE_URL}?${params.toString()}`
  },
}

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function extractCloudaicompanionProject(data) {
  if (!data || typeof data !== 'object') return undefined
  for (const key of ['cloudaicompanionProject', 'projectId', 'project']) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.trim()) {
      return value.id.trim()
    }
  }
  return undefined
}

export function defaultAntigravityTierId(loadResp) {
  const tiers = Array.isArray(loadResp?.allowedTiers) ? loadResp.allowedTiers : []
  for (const tier of tiers) {
    if (tier?.isDefault && trimmed(tier.id)) return trimmed(tier.id)
  }
  const current = trimmed(loadResp?.currentTier?.id)
  return current ?? 'free-tier'
}

export function antigravityPlanType(loadResp) {
  return trimmed(loadResp?.currentTier?.id) ?? trimmed(loadResp?.tierId)
}

export function antigravitySession({ accessToken, refreshToken, expiresAt, expiresIn, account, projectId, planType } = {}) {
  if (!trimmed(accessToken)) throw new Error('antigravity session needs an access token')
  if (!trimmed(refreshToken)) throw new Error('antigravity session needs a refresh token')
  if (!trimmed(projectId)) throw new Error('antigravity session needs a project_id')
  const resolvedExpiry = typeof expiresAt === 'number' && Number.isFinite(expiresAt)
    ? expiresAt
    : Date.now() + Math.max(Number(expiresIn) || 3600, 60) * 1000
  return {
    accessToken: accessToken.trim(),
    refreshToken: refreshToken.trim(),
    expiresAt: resolvedExpiry,
    account: trimmed(account) ?? 'antigravity',
    projectId: projectId.trim(),
    ...(planType === undefined ? {} : { planType }),
  }
}

async function readJson(response, label) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`)
  }
  return text ? JSON.parse(text) : undefined
}

async function oauthError(response, label) {
  const text = await response.text()
  let code
  try {
    code = JSON.parse(text)?.error
  } catch {
    code = undefined
  }
  const error = new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`)
  if (typeof code === 'string') error.code = code
  return error
}

export async function exchangeAntigravityTokens(body, fetchFn = fetch) {
  const response = await fetchFn(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: tokenHeaders(),
    body,
  })
  if (!response.ok) throw await oauthError(response, 'antigravity token')
  return response.json()
}

export async function fetchAntigravityUserInfo(accessToken, { fetchFn = fetch } = {}) {
  const response = await fetchFn(ANTIGRAVITY_USERINFO_URL, {
    method: 'GET',
    headers: antigravityUserinfoHeaders(accessToken),
  })
  const info = await readJson(response, 'antigravity userinfo')
  const email = trimmed(info?.email)
  if (!email) throw new Error('antigravity userinfo returned no email')
  return email
}

export async function onboardAntigravityUser(accessToken, tierId, { fetchFn = fetch, sleep = delay } = {}) {
  const raw = JSON.stringify({
    tier_id: tierId,
    metadata: antigravityControlPlaneMetadata(),
  })
  for (let attempt = 1; attempt <= ANTIGRAVITY_ONBOARD_ATTEMPTS; attempt++) {
    const response = await fetchFn(ANTIGRAVITY_ONBOARD_USER_URL, {
      method: 'POST',
      headers: antigravityOnboardUserHeaders(accessToken),
      body: raw,
    })
    const data = await readJson(response, 'antigravity onboardUser')
    if (data?.done) {
      const projectId = extractCloudaicompanionProject(data.response) ?? extractCloudaicompanionProject(data)
      if (projectId) return projectId
      throw new Error('antigravity onboardUser completed without a project_id')
    }
    if (attempt < ANTIGRAVITY_ONBOARD_ATTEMPTS) await sleep(ANTIGRAVITY_ONBOARD_PAUSE_MS)
  }
  throw new Error(`antigravity onboardUser did not complete after ${ANTIGRAVITY_ONBOARD_ATTEMPTS} attempts`)
}

export async function fetchAntigravityProject({ accessToken, fetchFn = fetch, sleep } = {}) {
  const response = await fetchFn(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, {
    method: 'POST',
    headers: antigravityLoadCodeAssistHeaders(accessToken),
    body: JSON.stringify({ metadata: antigravityLoadCodeAssistMetadata() }),
  })
  const loadResp = await readJson(response, 'antigravity loadCodeAssist')
  const existing = extractCloudaicompanionProject(loadResp)
  if (existing) {
    return { projectId: existing, planType: antigravityPlanType(loadResp), loadResp }
  }
  const projectId = await onboardAntigravityUser(accessToken, defaultAntigravityTierId(loadResp), { fetchFn, sleep })
  return { projectId, planType: antigravityPlanType(loadResp), loadResp }
}

export async function completeAntigravityLogin(tokens, { fetchFn = fetch, sleep, account } = {}) {
  const accessToken = trimmed(tokens?.access_token ?? tokens?.accessToken)
  const refreshToken = trimmed(tokens?.refresh_token ?? tokens?.refreshToken)
  if (!accessToken) throw new Error('antigravity token exchange returned no access token')
  if (!refreshToken) throw new Error('antigravity token exchange returned no refresh token')
  const email = trimmed(account) ?? await fetchAntigravityUserInfo(accessToken, { fetchFn })
  const discovered = await fetchAntigravityProject({ accessToken, fetchFn, sleep })
  return antigravitySession({
    accessToken,
    refreshToken,
    expiresIn: tokens.expires_in ?? tokens.expiresIn,
    expiresAt: tokens.expiresAt,
    account: email,
    projectId: discovered.projectId,
    planType: discovered.planType,
  })
}

export async function exchangeAntigravityCode(code, redirectUri, { fetchFn = fetch } = {}) {
  const tokens = await exchangeAntigravityTokens(new URLSearchParams({
    code,
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }).toString(), fetchFn)
  return completeAntigravityLogin(tokens, { fetchFn })
}

export async function refreshAntigravity(session, fetchFn = fetch) {
  const tokens = await exchangeAntigravityTokens(new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  }).toString(), fetchFn)
  const accessToken = trimmed(tokens.access_token)
  if (!accessToken) throw new Error('antigravity refresh returned no access token')
  const projectId = trimmed(session.projectId)
    ?? (await fetchAntigravityProject({ accessToken, fetchFn })).projectId
  return antigravitySession({
    accessToken,
    refreshToken: trimmed(tokens.refresh_token) ?? session.refreshToken,
    expiresIn: tokens.expires_in,
    account: session.account,
    projectId,
    planType: session.planType,
  })
}

export function isAntigravityPermanentRefreshError(error) {
  const code = error?.code ?? error?.error
  return typeof code === 'string' && PERMANENT_REFRESH.has(code)
}

export function antigravityRequestId() {
  return `agent-${randomUUID()}`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
