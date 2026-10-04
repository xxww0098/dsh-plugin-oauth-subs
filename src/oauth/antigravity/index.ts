/**
 * Google Antigravity (hub / Antigravity.app) OAuth + chat fingerprint.
 *
 * Official desktop to mimic (2026-10-04): Antigravity.app hub 2.19.1
 * (`com.google.antigravity`, `--subclient_type hub`). The pin is the
 * hub updater manifest `latest-arm64-mac.yml`. A stale local install
 * (this Mac had 2.12.2) must not drag the UA down. Ignore
 * Antigravity IDE.app (`--subclient_type ide`). Hub
 * `--cloud_code_endpoint` is daily-cloudcode-pa; IDE uses prod
 * cloudcode-pa. language_server uses protobuf ClientMetadata.ide_type
 * ANTIGRAVITY. UA shape is CLIProxyAPI AntigravityRequestUserAgent:
 *   antigravity/hub/<ver> <os>/<arch>
 * Chat / loadCodeAssist: User-Agent only — no Client-Metadata /
 * x-goog-api-client. Body metadata: { ideType: 'ANTIGRAVITY' }.
 * onboardUser keeps the longer UA + x-goog-api-client gl-node/22.21.1.
 */

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { outboundFetch } from '../../utils/outbound.js'
import { oauthError } from '../errors.js'
import { catalogRows } from '../../catalog/index.js'

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
/** Hub default — Antigravity.app `--cloud_code_endpoint`. */
export const ANTIGRAVITY_DAILY_API_URL = 'https://daily-cloudcode-pa.googleapis.com'
/** IDE / prod Cloud Code. Only used if daily fails. */
export const ANTIGRAVITY_PROD_API_URL = 'https://cloudcode-pa.googleapis.com'
export const ANTIGRAVITY_API_URL = ANTIGRAVITY_DAILY_API_URL
export const ANTIGRAVITY_API_VERSION = 'v1internal'

function cloudCodeUrl(base, rpc, query = '') {
  return `${base}/${ANTIGRAVITY_API_VERSION}:${rpc}${query}`
}

export const ANTIGRAVITY_LOAD_CODE_ASSIST_URL = cloudCodeUrl(ANTIGRAVITY_API_URL, 'loadCodeAssist')
export const ANTIGRAVITY_MODELS_URL = cloudCodeUrl(ANTIGRAVITY_API_URL, 'fetchAvailableModels')
export const ANTIGRAVITY_QUOTA_SUMMARY_URL = cloudCodeUrl(ANTIGRAVITY_API_URL, 'retrieveUserQuotaSummary')
export const ANTIGRAVITY_ONBOARD_USER_URL = cloudCodeUrl(ANTIGRAVITY_DAILY_API_URL, 'onboardUser')
export const ANTIGRAVITY_GENERATE_URL = cloudCodeUrl(ANTIGRAVITY_API_URL, 'generateContent')
export const ANTIGRAVITY_STREAM_URL = cloudCodeUrl(ANTIGRAVITY_API_URL, 'streamGenerateContent', '?alt=sse')

/** SkillStar `antigravity_quota_groups` — label + model ids, first match wins per bar. */
export const ANTIGRAVITY_QUOTA_GROUPS = Object.freeze([
  { label: 'Claude/GPT', identifiers: Object.freeze(['claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium']) },
  { label: 'Gemini 3.1 Pro Series', identifiers: Object.freeze(['gemini-3.1-pro-high', 'gemini-3.1-pro-low']) },
  { label: 'Gemini 3 Pro', identifiers: Object.freeze(['gemini-3-pro-high', 'gemini-3-pro-low']) },
  { label: 'Gemini 2.5 Flash', identifiers: Object.freeze(['gemini-2.5-flash', 'gemini-2.5-flash-thinking']) },
  { label: 'Gemini 2.5 Flash Lite', identifiers: Object.freeze(['gemini-2.5-flash-lite']) },
  { label: 'Gemini 2.5 CU', identifiers: Object.freeze(['rev19-uic3-1p']) },
  { label: 'Gemini 3 Flash', identifiers: Object.freeze(['gemini-3-flash']) },
  { label: 'gemini-3.1-flash-image', identifiers: Object.freeze(['gemini-3.1-flash-image']), labelFromModel: true },
])

/** Daily hub first, then IDE prod — same order as chat / loadCodeAssist. */
export function antigravityFetchModelsUrls() {
  return antigravityCloudCodeFallbacks(ANTIGRAVITY_MODELS_URL)
}

/** Daily first, then IDE prod. onboardUser stays daily-only. */
export function antigravityCloudCodeFallbacks(url) {
  const href = String(url)
  if (!href.startsWith(ANTIGRAVITY_DAILY_API_URL)) return [href]
  return [href, href.replace(ANTIGRAVITY_DAILY_API_URL, ANTIGRAVITY_PROD_API_URL)]
}

function retryHubOnProd(response) {
  return response.status >= 500
}

/** POST a hub Cloud Code RPC: daily, then IDE prod on transport / 5xx. */
export async function fetchAntigravityCloudCode(url, init, fetchFn = outboundFetch) {
  const urls = antigravityCloudCodeFallbacks(url)
  let lastError
  for (let i = 0; i < urls.length; i++) {
    const last = i === urls.length - 1
    try {
      const response = await fetchFn(urls[i], init)
      if (response.ok || !retryHubOnProd(response) || last) return response
      // Retrying this URL: release the unused body, or the socket stays pinned
      // until GC and repeated 5xx retries exhaust the pool.
      try { await response.body?.cancel() } catch { /* body already gone */ }
    } catch (error) {
      lastError = error
      if (last) throw error
    }
  }
  throw lastError ?? new Error('antigravity cloud code request failed')
}

export const ANTIGRAVITY_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ')

/**
 * Current official Antigravity hub short version (updater manifest
 * `latest-arm64-mac.yml`, 2026-10-04). Used when the desktop app is
 * missing or older. Cloud Code rejects stale client versions
 * (historically anything below 2.9.0).
 */
export const ANTIGRAVITY_FALLBACK_VERSION = '2.19.1'
/** Official hub app only — never Antigravity IDE.app. */
export const ANTIGRAVITY_MAC_APP_PLIST = '/Applications/Antigravity.app/Contents/Info.plist'
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
 * Registry snapshot: router-for-me/CLIProxyAPI main
 * `internal/registry/models/models.json`, 12 `antigravity` rows, 2026-09-23.
 * llm-pi-ai only wires text / image, so audio/video Gemini rows stay vision.
 * Dropped 2026-09-01 (upstream 35e3d97dac): gemini-3-flash-agent /
 * gemini-3.5-flash-low / gemini-3.5-flash-extra-low — Cloud Code returns
 * 500 UNKNOWN for those ids. Current 3.5 row: gemini-3.5-flash-lite
 * (upstream d48590a47d, 2026-09-14). Rows live in `src/catalog/models.json`
 * under `"antigravity"`.
 */
export const ANTIGRAVITY_MODELS = catalogRows('antigravity')

export const ANTIGRAVITY_PLAN_NAMES = Object.freeze({
  free: 'Free',
  free_tier: 'Free',
  freetier: 'Free',
  plus: 'Plus',
  g1_plus_tier: 'Plus',
  g1plustier: 'Plus',
  google_ai_plus: 'Plus',
  pro: 'Pro',
  g1_pro_tier: 'Pro',
  g1pro: 'Pro',
  g1protier: 'Pro',
  google_ai_pro: 'Pro',
  ai_pro: 'Pro',
  ultra: 'Ultra',
  g1_ultra_tier: 'Ultra',
  g1ultra: 'Ultra',
  g1ultratier: 'Ultra',
  google_ai_ultra: 'Ultra',
  ai_ultra: 'Ultra',
  ultra_5x: 'Ultra 5x',
  g1_ultra_5x: 'Ultra 5x',
  g1_ultra_5x_tier: 'Ultra 5x',
  ultra5x: 'Ultra 5x',
  ultra_20x: 'Ultra 20x',
  g1_ultra_20x: 'Ultra 20x',
  g1_ultra_20x_tier: 'Ultra 20x',
  ultra20x: 'Ultra 20x',
  standard: 'Standard',
  standard_tier: 'Standard',
  standardtier: 'Standard',
  legacy: 'Legacy',
  legacy_tier: 'Legacy',
  legacytier: 'Legacy',
})

export function antigravityPlatform(platform = process.platform, arch = process.arch) {
  const os = platform === 'darwin' ? 'darwin' : platform === 'win32' ? 'windows' : 'linux'
  const cpu = arch === 'arm64' ? 'arm64' : 'amd64'
  return `${os}/${cpu}`
}

const VERSION_TOKEN = /\d+\.\d+(?:\.\d+){0,2}/

/** Normalize FileVersion `2.11.0.0` → `2.11.0`; keep a real fourth component. */
export function normalizeAntigravityVersion(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!new RegExp(`^${VERSION_TOKEN.source}$`).test(raw)) return undefined
  const parts = raw.split('.')
  if (parts.length === 4 && parts[3] === '0') return parts.slice(0, 3).join('.')
  return raw
}

/**
 * SkillStar-style CFBundleShortVersionString extract from Info.plist XML.
 * Does not read Antigravity IDE.app — callers pass Antigravity.app only.
 */
export function parseAntigravityPlistVersion(plistXml) {
  if (typeof plistXml !== 'string' || !plistXml) return undefined
  const xml = plistXml.replace(/\r\n/g, '\n')
  const tagged = /<key>\s*CFBundleShortVersionString\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/i.exec(xml)
  if (tagged) return normalizeAntigravityVersion(tagged[1])
  let pending = false
  for (const line of xml.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '<key>CFBundleShortVersionString</key>') {
      pending = true
      continue
    }
    if (pending && trimmed.startsWith('<string>') && trimmed.endsWith('</string>')) {
      return normalizeAntigravityVersion(trimmed.slice('<string>'.length, -'</string>'.length))
    }
    if (pending && trimmed) pending = false
  }
  return undefined
}

/** First `X.Y` / `X.Y.Z` / `X.Y.Z.W` token in CLI or PowerShell output. */
export function parseAntigravityVersionText(text) {
  if (typeof text !== 'string') return undefined
  const match = text.match(VERSION_TOKEN)
  return match ? normalizeAntigravityVersion(match[0]) : undefined
}

function runVersionCommand(exec, file, args) {
  try {
    return parseAntigravityVersionText(String(exec(file, args, {
      encoding: 'utf8',
      timeout: 2_500,
      windowsHide: true,
    }) ?? ''))
  } catch {
    return undefined
  }
}

/** Numeric dotted compare. Missing or non-numeric parts count as 0. */
function compareAntigravityVersions(left, right) {
  const a = String(left).split('.')
  const b = String(right).split('.')
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const av = /^[0-9]+$/.test(a[i] ?? '') ? Number(a[i]) : 0
    const bv = /^[0-9]+$/.test(b[i] ?? '') ? Number(b[i]) : 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

/**
 * Installed hub version when it is newer than the pinned official
 * release; otherwise the pin. An old Antigravity.app must not be the
 * User-Agent.
 */
export function currentAntigravityVersion(detected, floor = ANTIGRAVITY_FALLBACK_VERSION) {
  if (typeof detected !== 'string' || detected === '') return floor
  return compareAntigravityVersions(detected, floor) > 0 ? detected : floor
}

/**
 * Prefer a newer installed official Antigravity.app (SkillStar
 * `detect_ide_version`): macOS Info.plist, Windows LocalAppData
 * `Antigravity.exe` FileVersion, linux `antigravity --version`.
 * Never reads Antigravity IDE.app. An older install does not override
 * {@link ANTIGRAVITY_FALLBACK_VERSION}.
 */
export function detectAntigravityVersion({
  platform = process.platform,
  env = process.env,
  readFile = (path) => readFileSync(path, 'utf8'),
  execFile = (file, args, opts) => execFileSync(file, args, opts),
} = {}) {
  if (platform === 'darwin') {
    try {
      const parsed = parseAntigravityPlistVersion(readFile(ANTIGRAVITY_MAC_APP_PLIST))
      if (parsed) return currentAntigravityVersion(parsed)
    } catch {
      // binary plist or missing app — try plutil
    }
    const fromPlutil = runVersionCommand(execFile, 'plutil', [
      '-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', ANTIGRAVITY_MAC_APP_PLIST,
    ])
    if (fromPlutil) return currentAntigravityVersion(fromPlutil)
  } else if (platform === 'win32') {
    const localApp = typeof env?.LOCALAPPDATA === 'string' ? env.LOCALAPPDATA : ''
    if (localApp) {
      const exe = join(localApp, 'Programs', 'antigravity', 'Antigravity.exe')
      const escaped = exe.replace(/'/g, "''")
      const fromPs = runVersionCommand(execFile, 'powershell.exe', [
        '-NoProfile',
        '-Command',
        `(Get-Item -LiteralPath '${escaped}').VersionInfo.FileVersion`,
      ])
      if (fromPs) return currentAntigravityVersion(fromPs)
    }
  } else {
    const fromCli = runVersionCommand(execFile, 'antigravity', ['--version'])
    if (fromCli) return currentAntigravityVersion(fromCli)
  }
  return ANTIGRAVITY_FALLBACK_VERSION
}

let cachedAntigravityVersion

export function antigravityVersion() {
  cachedAntigravityVersion ??= detectAntigravityVersion()
  return cachedAntigravityVersion
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

/** SkillStar loadCodeAssist body: metadata.ideType plus optional project / duetProject. */
export function antigravityLoadCodeAssistBody(projectId) {
  const pid = trimmed(projectId)
  if (!pid) return { metadata: antigravityLoadCodeAssistMetadata() }
  return {
    metadata: { ...antigravityLoadCodeAssistMetadata(), duetProject: pid },
    cloudaicompanionProject: pid,
  }
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
  for (const key of ['cloudaicompanionProject', 'cloudaicompanionProjectId', 'projectId', 'project']) {
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

function tierClaim(tier) {
  if (typeof tier === 'string') return trimmed(tier)
  return trimmed(tier?.name) ?? trimmed(tier?.id) ?? trimmed(tier?.quotaTier) ?? trimmed(tier?.slug)
}

/** Code Assist SKU — not the Google AI / Antigravity subscription. */
export function isCodeAssistOnlyPlan(raw) {
  const compact = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  return compact === 'standard' || compact === 'standardtier' || compact === 'legacy' || compact === 'legacytier'
}

function googleAiClaim(value) {
  const claim = tierClaim(value)
  if (!claim || isCodeAssistOnlyPlan(claim)) return undefined
  return claim
}

/**
 * Google AI plan. Prefer paidTier name/id (Google AI Pro / Ultra).
 * currentTier is Code Assist: STANDARD is ignored, free-tier is kept.
 */
export function antigravityPlanType(loadResp) {
  return googleAiClaim(loadResp?.paidTier)
    ?? googleAiClaim(loadResp?.paid_tier)
    ?? googleAiClaim(loadResp?.subscriptionTier)
    ?? googleAiClaim(loadResp?.subscription_tier)
    ?? googleAiClaim(loadResp?.userTier)
    ?? googleAiClaim(loadResp?.user_tier)
    ?? googleAiClaim(loadResp?.planName)
    ?? googleAiClaim(loadResp?.plan_name)
    ?? googleAiClaim(loadResp?.tierId)
    ?? googleAiClaim(loadResp?.currentTier)
    ?? googleAiClaim(loadResp?.current_tier)
}


export const ANTIGRAVITY_VERIFY_MESSAGE = 'Google 需要验证此账号才能对话'
export const ANTIGRAVITY_VERIFY_CODE = 'VALIDATION_REQUIRED'

function walkValidationUrl(value, depth = 0) {
  if (depth > 6 || value == null) return undefined
  if (typeof value === 'string') {
    const href = value.trim()
    if (/^https:\/\/accounts\.google\.com\//i.test(href) && /[?&]plt=/.test(href)) return href
    if (/^https:\/\/accounts\.google\.com\//i.test(href) && /signin\/continue/i.test(href)) return href
    return undefined
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walkValidationUrl(item, depth + 1)
      if (found) return found
    }
    return undefined
  }
  if (typeof value !== 'object') return undefined
  for (const key of ['validation_url', 'validationUrl', 'validationURL']) {
    const found = walkValidationUrl(value[key], depth + 1)
    if (found) return found
  }
  for (const item of Object.values(value)) {
    const found = walkValidationUrl(item, depth + 1)
    if (found) return found
  }
  return undefined
}

function blobText(value) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value ?? '') } catch { return '' }
}

/** Detect Google Cloud Code `VALIDATION_REQUIRED` / "Verify your account". */
export function parseAntigravityValidation(payload) {
  if (payload == null) return undefined
  const text = blobText(payload)
  const required = /VALIDATION_REQUIRED/i.test(text) || /verify your account/i.test(text)
  if (!required) return undefined
  return {
    required: true,
    validationUrl: walkValidationUrl(payload),
    message: ANTIGRAVITY_VERIFY_MESSAGE,
    code: ANTIGRAVITY_VERIFY_CODE,
  }
}

export function antigravityValidationClientError(info: any = {}) {
  return {
    error: {
      message: info.message ?? ANTIGRAVITY_VERIFY_MESSAGE,
      code: info.code ?? ANTIGRAVITY_VERIFY_CODE,
      type: 'invalid_request',
    },
  }
}

export function antigravitySession({
  accessToken, refreshToken, expiresAt, expiresIn, account, projectId, planType,
  needsValidation, validationUrl,
}: any = {}) {
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
    ...(needsValidation ? { needsValidation: true } : {}),
    ...(trimmed(validationUrl) ? { validationUrl: trimmed(validationUrl) } : {}),
  }
}

async function readJson(response, label) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`)
  }
  return text ? JSON.parse(text) : undefined
}

export async function exchangeAntigravityTokens(body, fetchFn = outboundFetch) {
  const response = await fetchFn(ANTIGRAVITY_TOKEN_URL, {
    method: 'POST',
    headers: tokenHeaders(),
    body,
  })
  if (!response.ok) throw await oauthError(response, 'antigravity token')
  return response.json()
}

export async function fetchAntigravityUserInfo(accessToken, { fetchFn = outboundFetch } = {}) {
  const response = await fetchFn(ANTIGRAVITY_USERINFO_URL, {
    method: 'GET',
    headers: antigravityUserinfoHeaders(accessToken),
  })
  const info = await readJson(response, 'antigravity userinfo')
  const email = trimmed(info?.email)
  if (!email) throw new Error('antigravity userinfo returned no email')
  return email
}

export async function onboardAntigravityUser(accessToken, tierId, { fetchFn = outboundFetch, sleep = delay } = {}) {
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

export async function fetchAntigravityProject({ accessToken, fetchFn = outboundFetch, sleep }: any = {}) {
  const response = await fetchAntigravityCloudCode(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, {
    method: 'POST',
    headers: antigravityLoadCodeAssistHeaders(accessToken),
    body: JSON.stringify({ metadata: antigravityLoadCodeAssistMetadata() }),
  }, fetchFn)
  const loadResp = await readJson(response, 'antigravity loadCodeAssist')
  const existing = extractCloudaicompanionProject(loadResp)
  if (existing) {
    return { projectId: existing, planType: antigravityPlanType(loadResp), loadResp }
  }
  const projectId = await onboardAntigravityUser(accessToken, defaultAntigravityTierId(loadResp), { fetchFn, sleep })
  return { projectId, planType: antigravityPlanType(loadResp), loadResp }
}

export async function completeAntigravityLogin(tokens, { fetchFn = outboundFetch, sleep, account }: any = {}) {
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

export async function exchangeAntigravityCode(code, redirectUri, { fetchFn = outboundFetch } = {}) {
  const tokens = await exchangeAntigravityTokens(new URLSearchParams({
    code,
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  }).toString(), fetchFn)
  return completeAntigravityLogin(tokens, { fetchFn })
}

export async function refreshAntigravity(session, fetchFn = outboundFetch) {
  const tokens: any = await exchangeAntigravityTokens(new URLSearchParams({
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
    needsValidation: session.needsValidation,
    validationUrl: session.validationUrl,
  })
}

export function applyAntigravityValidation(session, info) {
  if (!session) return session
  if (info?.required) {
    return antigravitySession({
      ...session,
      needsValidation: true,
      validationUrl: info.validationUrl ?? session.validationUrl,
    })
  }
  return antigravitySession({
    ...session,
    needsValidation: false,
    validationUrl: undefined,
  })
}

/** Tiny generateContent so Settings can show the verify banner before DSH chats. */
export async function probeAntigravityValidation(session, { fetchFn = outboundFetch } = {}) {
  const projectId = trimmed(session?.projectId)
  if (!projectId || !trimmed(session?.accessToken)) return undefined
  const body = JSON.stringify({
    model: 'gemini-2.5-flash',
    project: projectId,
    userAgent: ANTIGRAVITY_BODY_USER_AGENT,
    requestType: 'agent',
    requestId: antigravityRequestId(),
    request: {
      contents: [{ role: 'user', parts: [{ text: '.' }] }],
      sessionId: '-probe',
    },
  })
  try {
    const response = await fetchAntigravityCloudCode(ANTIGRAVITY_GENERATE_URL, {
      method: 'POST',
      headers: antigravityChatHeaders(session),
      body,
    }, fetchFn)
    if (response.ok) return { required: false }
    const text = await response.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
    return parseAntigravityValidation(parsed) ?? parseAntigravityValidation(text)
  } catch {
    return undefined
  }
}

export function antigravityRequestId() {
  return `agent-${randomUUID()}`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
