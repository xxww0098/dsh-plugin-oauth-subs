/**
 * Import existing Codex CLI / Grok CLI / Hermes OAuth sessions so a user who
 * has already logged in on this machine does not have to repeat the browser
 * flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.grok/auth.json           Grok CLI ($GROK_HOME/auth.json)
 *   ~/.hermes/auth.json         Hermes multi-provider store
 *   ~/.zcode/v2/credentials.json  ZCode Desktop credential store (enc:v1)
 *   ~/.zcode/v2/config.json     ZCode Desktop (Coding Plan apiKey under provider)
 *   ~/.zcode/cli/credentials.json / cli/config.json / ~/.zcode/config.json  older ZCode
 *   credentials.json            kiro.rs CWD dump
 *   ~/.kiro/credentials.json    Kiro IDE
 *   ~/.aws/sso/cache/kiro-auth-token.json
 *   ~/.aws/sso/cache/*.json     IdC client registration (paired with the token)
 *   kiro-manager-lite 卡密 / compact JSON / full backup (paste or file)
 */

import { createDecipheriv, createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { homedir, platform, userInfo } from 'node:os'
import { dirname, join } from 'node:path'
import { errorCode } from '../utils/http.js'
import { codexProfileClaims, codexSession } from './codex/index.js'
import { GROK_CLIENT_ID, grokSession } from './grok/index.js'
import { glmSession } from './glm/index.js'
import { kiroAccountId } from './kiro/index.js'
import {
  hydrateKiroSsoToken,
  kiroSsoClientIdHash,
  sessionsFromKiroAuth,
} from './kiro/import.js'
import { antigravitySession, completeAntigravityLogin } from './antigravity/index.js'
import { decodeJwtPayload } from '../utils/jwt.js'

const GROK_TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token'

export const GROK_HERMES_KEYS = Object.freeze([
  'xai-oauth',
  'grok-oauth',
  'x-ai-oauth',
  'xai-grok-oauth',
  'xai',
  'x-ai',
  'grok',
  'xai-grok',
])

function homeFile(...parts) {
  return join(homedir(), ...parts)
}

function grokHomeDir() {
  const override = process.env.GROK_HOME?.trim()
  return override || homeFile('.grok')
}

export function grokAuthSearchPaths() {
  return [join(grokHomeDir(), 'auth.json'), homeFile('.hermes', 'auth.json')]
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

function asPositiveNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

function parseTime(value) {
  if (value == null) return undefined
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value : value * 1000
  }
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseTime(Number(trimmed))
  const iso = trimmed.replace(/(\.\d{3})\d+/, '$1').replace(' ', 'T')
  const stamp = Date.parse(iso)
  return Number.isFinite(stamp) ? stamp : undefined
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function tokensFromCodexCli(raw) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const tokens = raw.tokens ?? raw
  if (typeof tokens.access_token !== 'string') return undefined
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? raw.refresh_token,
    id_token: tokens.id_token ?? raw.id_token,
    expires_in: tokens.expires_in ?? raw.expires_in,
  }
}

function hermesEntryTokens(entry) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
  const nested = entry.tokens ?? entry
  const access = pickString(nested.access_token, nested.accessToken, entry.access_token, entry.accessToken)
  const refresh = pickString(nested.refresh_token, nested.refreshToken, entry.refresh_token, entry.refreshToken)
  if (typeof access !== 'string') return undefined
  const payload = decodeJwtPayload(access)
  return {
    access_token: access,
    refresh_token: refresh,
    id_token: pickString(nested.id_token, nested.idToken, entry.id_token, entry.idToken),
    expires_in: nested.expires_in ?? nested.expiresIn ?? entry.expires_in ?? entry.expiresIn,
    expires_at: nested.expires_at ?? nested.expiresAt ?? entry.expires_at ?? entry.expiresAt,
    last_refresh: pickString(entry.last_refresh, entry.lastRefresh, nested.last_refresh, nested.lastRefresh),
    token_endpoint: pickString(
      entry.token_endpoint,
      entry.tokenEndpoint,
      nested.token_endpoint,
      entry.discovery?.token_endpoint,
      entry.discovery?.tokenEndpoint,
    ),
    account: pickString(entry.email, entry.account, nested.email, payload?.email, payload?.preferred_username),
  }
}

export function tokensFromHermes(raw, keys) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const providers = raw.providers ?? raw.auth ?? raw
  for (const key of keys) {
    const tokens = hermesEntryTokens(providers[key] ?? raw[key])
    if (tokens !== undefined) return tokens
  }
  const pool = raw.credential_pool ?? raw.credentialPool
  if (typeof pool === 'object' && pool !== null) {
    for (const key of keys) {
      const rows = pool[key]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const tokens = hermesEntryTokens(row)
        if (tokens !== undefined) return tokens
      }
    }
  }
  return undefined
}

function isApiKeyMode(entry, mapKey = '') {
  const mode = String(entry?.auth_mode ?? entry?.authMode ?? '').toLowerCase()
  if (mode === 'api_key' || mode === 'apikey') return true
  return /api[_-]?key/i.test(String(mapKey))
}

function isGrokCliMapKey(key) {
  if (typeof key !== 'string' || !key) return false
  const lower = key.toLowerCase()
  if (/api[_-]?key/i.test(lower)) return false
  return lower.includes('auth.x.ai')
    || lower.includes('accounts.x.ai')
    || lower.includes('xai::')
    || lower.includes(GROK_CLIENT_ID)
}

function grokCliEntryTokens(entry, mapKey = '') {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
  if (isApiKeyMode(entry, mapKey)) return undefined
  const access = pickString(entry.key, entry.access_token, entry.accessToken)
  const refresh = pickString(entry.refresh_token, entry.refreshToken)
  if (typeof access !== 'string' || typeof refresh !== 'string') return undefined
  const payload = decodeJwtPayload(access)
  const expiresAtMs = parseTime(entry.expires_at ?? entry.expiresAt ?? entry.expired)
  let expires_in = asPositiveNumber(entry.expires_in ?? entry.expiresIn)
  if (expires_in === undefined && expiresAtMs !== undefined) {
    expires_in = Math.max(Math.round((expiresAtMs - Date.now()) / 1000), 60)
  }
  const issuer = pickString(entry.oidc_issuer, entry.oidcIssuer, entry.issuer)
  const clientId = pickString(entry.oidc_client_id, entry.oidcClientId, entry.client_id, entry.clientId)
  const tokenEndpoint = pickString(entry.token_endpoint, entry.tokenEndpoint)
    ?? (typeof issuer === 'string' && issuer.includes('auth.x.ai') ? GROK_TOKEN_ENDPOINT : undefined)
  const account = pickString(entry.email, entry.account, payload?.email, payload?.preferred_username)
  const mode = String(entry.auth_mode ?? entry.authMode ?? '').toLowerCase()
  let score = 0
  if (`${mapKey} ${clientId ?? ''}`.includes(GROK_CLIENT_ID)) score += 100
  if (isGrokCliMapKey(mapKey) || (typeof issuer === 'string' && issuer.includes('auth.x.ai'))) score += 20
  if (mode === 'oidc' || mode === 'oauth' || mode === 'supergrok') score += 10
  return {
    access_token: access,
    refresh_token: refresh,
    id_token: pickString(entry.id_token, entry.idToken),
    expires_in,
    token_endpoint: tokenEndpoint,
    account,
    client_id: clientId,
    score,
  }
}

function collectGrokCliEntries(raw) {
  const direct = grokCliEntryTokens(raw, '')
  if (direct) return [direct]
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
  const out: any[] = []
  for (const [key, value] of Object.entries(raw)) {
    const entry = grokCliEntryTokens(value, key)
    if (entry) {
      out.push(entry)
      continue
    }
    if (!isGrokCliMapKey(key) || typeof value !== 'object' || value === null || Array.isArray(value)) continue
    for (const [innerKey, inner] of Object.entries(value)) {
      const nested = grokCliEntryTokens(inner, innerKey)
      if (nested) out.push(nested)
    }
  }
  return out
}

export function tokensFromGrokCli(raw) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const found = collectGrokCliEntries(raw)
  if (found.length === 0) return undefined
  found.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (b.expires_in ?? 0) - (a.expires_in ?? 0)
  })
  const { score: _score, ...tokens } = found[0]
  return tokens
}

function withExpiry(tokens, lastRefresh) {
  const existing = asPositiveNumber(tokens.expires_in)
  if (existing !== undefined) return { ...tokens, expires_in: existing }
  const fromAt = parseTime(tokens.expires_at)
  if (fromAt !== undefined) {
    return { ...tokens, expires_in: Math.max(Math.round((fromAt - Date.now()) / 1000), 60) }
  }
  const stamp = parseTime(lastRefresh ?? tokens.last_refresh)
  if (stamp !== undefined) {
    const remaining = Math.round((stamp + 3_600_000 - Date.now()) / 1000)
    return { ...tokens, expires_in: Math.max(remaining, 60) }
  }
  return { ...tokens, expires_in: 3600 }
}

function grokSessionFromTokens(tokens, lastRefresh) {
  const normalized = withExpiry(tokens, lastRefresh)
  return grokSession(
    normalized,
    normalized.token_endpoint ?? GROK_TOKEN_ENDPOINT,
    normalized.account ? { account: normalized.account } : undefined,
  )
}

export async function importCodexAuth() {
  const tried: any[] = []
  const paths = [homeFile('.codex', 'auth.json'), homeFile('.hermes', 'auth.json')]
  for (const path of paths) {
    tried.push(path)
    const raw = await readJson(path)
    if (raw === undefined) continue
    const fromCli = path.includes('.codex') ? tokensFromCodexCli(raw) : undefined
    const fromHermes = tokensFromHermes(raw, ['openai-codex', 'openai_codex', 'codex', 'chatgpt'])
    const tokens = fromCli ?? fromHermes
    if (tokens === undefined) continue
    const session = codexSession(withExpiry(tokens, raw.last_refresh ?? raw.lastRefresh))
    return {
      session: {
        ...session,
        ...codexProfileClaims(session.idToken),
      },
      source: path,
    }
  }
  throw new Error(`no Codex session found in ${tried.join(' or ')}`)
}

export async function importGrokAuth(paths = grokAuthSearchPaths()) {
  const tried: any[] = []
  for (const path of paths) {
    tried.push(path)
    const raw = await readJson(path)
    if (raw === undefined) continue
    const tokens = tokensFromGrokCli(raw) ?? tokensFromHermes(raw, GROK_HERMES_KEYS)
    if (tokens === undefined) continue
    return {
      session: grokSessionFromTokens(tokens, raw.last_refresh ?? raw.lastRefresh),
      source: path,
    }
  }
  throw new Error(`no Grok session found in ${tried.join(' or ')}`)
}

function looksLikeJwt(token) {
  if (typeof token !== 'string') return false
  if (token.split('.').length !== 3) return false
  return decodeJwtPayload(token) !== undefined
}

function glmKeyScore(key, apiKey) {
  const lower = String(key).toLowerCase()
  let score = 0
  if (/coding[._-]?plan/.test(lower)) score += 20
  if (!looksLikeJwt(apiKey)) score += 5
  return score
}

function glmZcodeProviderUsable(value) {
  if (!value || typeof value !== 'object') return false
  if (value.enabled === false || value.available === false) return false
  if (value.options?.enabled === false || value.options?.available === false) return false
  if (value.entitled === false || value.options?.entitled === false) return false
  if (value.coding_plan_not_entitled === true) return false
  const status = [value.status, value.error, value.reason, value.code, value.options?.status, value.options?.error]
    .filter((part) => part != null && part !== '')
    .join(' ')
  if (/not[_-]?entitled|coding_plan_not_entitled/i.test(status)) return false
  return true
}

/** Why ZCode itself refuses this provider entry, for the import error hint. */
export function glmZcodeDisabledReason(value) {
  if (!value || typeof value !== 'object') return undefined
  const reason = [
    value.systemDisabledReason,
    value.disabledReason,
    value.reason,
    value.error,
    value.status,
    value.code,
  ].find((part) => typeof part === 'string' && part.trim())
  if (typeof reason === 'string') return reason.trim()
  return value.enabled === false || value.available === false ? 'disabled' : undefined
}

/**
 * Best key in one ZCode provider config, usable or not. `~/.zcode/v2/config.json`
 * keeps coding-plan keys under `provider["builtin:<site>-coding-plan"].options.apiKey`;
 * recent ZCode versions disable that entry with `systemDisabledReason` when the
 * plan check fails (`coding_plan_not_entitled`, or a flaky platform reporting
 * `coding_plan_system_busy`). Import must not silently drop the key — the
 * caller decides, and can name the reason when it refuses.
 */
export function glmKeyCandidateFromZcodeConfig(raw) {
  const providers: any = raw?.provider ?? raw?.providers ?? raw
  if (!providers || typeof providers !== 'object') return undefined
  const found: any[] = []
  for (const [key, value] of Object.entries<any>(providers)) {
    if (!/zai|glm|coding.?plan|start.?plan|bigmodel|zcode/i.test(key)) continue
    const options = value?.options ?? value
    const apiKey = options?.apiKey ?? options?.api_key ?? value?.apiKey
    if (typeof apiKey !== 'string' || !apiKey.trim()) continue
    const trimmed = apiKey.trim()
    // Start Plan (体验套餐) is unsupported: its zcode-plan hop is captcha-gated,
    // so a start-plan JWT can never chat. Skip it rather than import a dead key.
    if (looksLikeJwt(trimmed) && /start[._-]?plan|zcode-plan/.test(
      `${key} ${options?.baseURL ?? options?.baseUrl ?? options?.base_url ?? ''}`.toLowerCase(),
    )) continue
    found.push({
      apiKey: trimmed,
      region: /bigmodel|zcode|\bcn\b|china/i.test(key) ? 'bigmodel' : 'zai',
      usable: glmZcodeProviderUsable(value),
      reason: glmZcodeDisabledReason(value),
      score: glmKeyScore(key, trimmed),
    })
  }
  if (found.length === 0) return undefined
  found.sort((a, b) => (Number(b.usable) - Number(a.usable)) || (b.score - a.score))
  return found[0]
}

/**
 * Best coding-plan key in a ZCode config, usable or not. ZCode's
 * `systemDisabledReason` comes from a cached entitlement check that goes stale
 * and is sometimes wrong (`coding_plan_system_busy` while the platform is
 * flaky); the key is the same credential ZCode's own provider entry holds.
 * Refusing it left users with no local import at all, so the key is returned
 * with its reason and the caller imports it — chat/quota surface the truth.
 */
export function glmKeyFromZcodeConfig(raw) {
  const best = glmKeyCandidateFromZcodeConfig(raw)
  if (!best) return undefined
  return { apiKey: best.apiKey, region: best.region, usable: best.usable, reason: best.reason }
}

const ZCODE_ENCRYPTED_PREFIX = 'enc:v1:'

/**
 * ZCode credential store cipher (credentialCipherProvider.ts): AES-256-GCM
 * with a SHA-256 key over `ZCODE_CREDENTIAL_SECRET` or the documented
 * machine-derived fallback. Plaintext entries pass through.
 */
function zcodeCredentialSecret(env = process.env) {
  const configured = typeof env?.ZCODE_CREDENTIAL_SECRET === 'string'
    ? env.ZCODE_CREDENTIAL_SECRET.trim()
    : ''
  if (configured) return configured
  let username = 'unknown'
  try {
    username = userInfo().username
  } catch {
    // Some sandboxed runtimes cannot resolve OS user info; keep the fallback.
  }
  return `zcode-credential-fallback:${platform()}:${homedir()}:${username}`
}

export function decodeZcodeCredentialValue(value, { env = process.env } = {}) {
  if (typeof value !== 'string' || !value.startsWith(ZCODE_ENCRYPTED_PREFIX)) return value
  const [ivRaw, tagRaw, dataRaw] = value.slice(ZCODE_ENCRYPTED_PREFIX.length).split('.')
  if (!ivRaw || !tagRaw || !dataRaw) return undefined
  try {
    const key = createHash('sha256').update(zcodeCredentialSecret(env)).digest()
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'))
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(dataRaw, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // Wrong key / corrupt entry: fall through to the plaintext config import.
    return undefined
  }
}

/**
 * Region a provisioned credential key belongs to. ZCode writes the working
 * Coding Plan chat key under
 * `account-provider:coding-plan:account:<region>-…-coding-plan:account:<id>:api-key`
 * (isProviderProvisioningAccountCredentialKey). \bbigmodel\b / \bzai\b keep
 * `zai` from matching inside `zai-individual` vs a bare region word.
 */
function glmProvisionedKeyRegion(credentialKey) {
  const text = String(credentialKey ?? '').toLowerCase()
  if (/\bbigmodel\b/.test(text)) return 'bigmodel'
  if (/\bzai\b/.test(text)) return 'zai'
  return undefined
}

/**
 * Coding Plan credential from ZCode's credential store
 * (`~/.zcode/v2/credentials.json`). The chat + monitor bearer is the
 * **provisioned** `account-provider:…:api-key` — the key ZCode provisions into
 * the provider entry after OAuth. The `oauth:<region>:access_token` business
 * JWT answers monitor/quota but is not the chat key (it 500s on the Coding
 * Plan hop), so it rides along as `oauthAccess` for userinfo/identity only.
 * The plaintext `options.apiKey` in config.json can be a stale key the vendor
 * answers 「当前用户不存在coding plan」 for. `zcodejwttoken` is identity only.
 */
export function glmKeyFromZcodeCredentials(raw, { env = process.env } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const active = decodeZcodeCredentialValue(raw['oauth:active_provider'], { env })
  const regions = active === 'zai' ? ['zai', 'bigmodel'] : ['bigmodel', 'zai']
  const zcodeJwt = decodeZcodeCredentialValue(raw.zcodejwttoken, { env })
  const identity = typeof zcodeJwt === 'string' && zcodeJwt.trim()
    ? { zcodeJwt: zcodeJwt.trim() }
    : {}
  // Prefer the provisioned api-key for the active region, then any other
  // provisioned key — that is the credential the Coding Plan hop accepts.
  const provisioned: any[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!/^account-provider:.+:api-key$/.test(key)) continue
    const apiKey = decodeZcodeCredentialValue(value, { env })
    if (typeof apiKey !== 'string' || !apiKey.trim()) continue
    provisioned.push({ apiKey: apiKey.trim(), region: glmProvisionedKeyRegion(key) })
  }
  for (const region of regions) {
    const hit = provisioned.find((row) => row.region === region)
    if (hit) {
      const oauthAccess = decodeZcodeCredentialValue(raw[`oauth:${region}:access_token`], { env })
      return {
        apiKey: hit.apiKey,
        region,
        ...(typeof oauthAccess === 'string' && oauthAccess.trim() ? { oauthAccess: oauthAccess.trim() } : {}),
        ...identity,
      }
    }
  }
  if (provisioned.length > 0) {
    const hit = provisioned[0]
    const region = hit.region ?? regions[0]
    const oauthAccess = decodeZcodeCredentialValue(raw[`oauth:${region}:access_token`], { env })
    return {
      apiKey: hit.apiKey,
      region,
      ...(typeof oauthAccess === 'string' && oauthAccess.trim() ? { oauthAccess: oauthAccess.trim() } : {}),
      ...identity,
    }
  }
  // No provisioned key: fall back to the OAuth business token (older stores).
  for (const region of regions) {
    const token = decodeZcodeCredentialValue(raw[`oauth:${region}:access_token`], { env })
    if (typeof token !== 'string' || !token.trim()) continue
    return { apiKey: token.trim(), region, ...identity }
  }
  return undefined
}

export function glmAuthSearchPaths() {
  return [
    homeFile('.zcode', 'v2', 'credentials.json'),
    homeFile('.zcode', 'v2', 'config.json'),
    homeFile('.zcode', 'cli', 'credentials.json'),
    homeFile('.zcode', 'cli', 'config.json'),
    homeFile('.zcode', 'config.json'),
  ]
}

function antigravityHomeDir() {
  return homeFile('.gemini')
}

function cliProxyAuthDir() {
  const override = process.env.CLIPROXYAPI_AUTH_DIR?.trim() || process.env.CLI_PROXY_API_AUTH_DIR?.trim()
  return override || homeFile('.cli-proxy-api')
}

export function antigravityAuthSearchPaths() {
  return [
    homeFile('.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    join(cliProxyAuthDir(), 'antigravity.json'),
  ]
}

function tokensFromAntigravityRaw(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const nested = raw.token && typeof raw.token === 'object' ? raw.token : raw
  const access = pickString(
    nested.access_token, nested.accessToken, raw.access_token, raw.accessToken,
  )
  const refresh = pickString(
    nested.refresh_token, nested.refreshToken, raw.refresh_token, raw.refreshToken,
  )
  if (!access || !refresh) return undefined
  const expiresAt = parseTime(nested.expiry ?? nested.expires_at ?? nested.expiresAt ?? raw.expired ?? raw.expires_at)
  let expires_in = asPositiveNumber(nested.expires_in ?? nested.expiresIn ?? raw.expires_in)
  if (expires_in === undefined && expiresAt !== undefined) {
    expires_in = Math.max(Math.round((expiresAt - Date.now()) / 1000), 60)
  }
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in,
    expiresAt,
    account: pickString(raw.email, raw.account, nested.email),
    projectId: pickString(raw.project_id, raw.projectId, nested.project_id, nested.projectId),
    planType: pickString(raw.planType, raw.plan_type, nested.planType),
  }
}

async function readAntigravityJsonFiles(dir) {
  try {
    const names = await readdir(dir)
    const out: any[] = []
    for (const name of names) {
      if (!/^antigravity(-.+)?\.json$/i.test(name)) continue
      const raw = await readJson(join(dir, name))
      if (raw !== undefined) out.push({ path: join(dir, name), raw })
    }
    return out
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
}

export async function importAntigravityAuth({ paths, fetchFn = fetch }: any = {}) {
  const tried: any[] = []
  const candidates = paths ?? [
    ...antigravityAuthSearchPaths(),
    ...(await readAntigravityJsonFiles(cliProxyAuthDir())).map((row) => row.path),
    ...(await readAntigravityJsonFiles(join(antigravityHomeDir(), 'antigravity'))).map((row) => row.path),
  ]
  const seen = new Set()
  for (const path of candidates) {
    if (!path || seen.has(path)) continue
    seen.add(path)
    tried.push(path)
    const raw = await readJson(path)
    if (raw === undefined) continue
    const tokens = tokensFromAntigravityRaw(raw)
    if (tokens === undefined) continue
    if (tokens.projectId && tokens.account) {
      return {
        session: antigravitySession({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          expiresAt: tokens.expiresAt,
          account: tokens.account,
          projectId: tokens.projectId,
          planType: tokens.planType,
        }),
        source: path,
      }
    }
    const session = await completeAntigravityLogin(tokens, {
      fetchFn,
      account: tokens.account,
    })
    return { session, source: path }
  }
  throw new Error(`no Antigravity session found in ${tried.join(' or ')}`)
}

export async function importGlmAuth(paths = glmAuthSearchPaths()) {
  const tried: any[] = []
  for (const path of paths) {
    tried.push(path)
    const raw = await readJson(path)
    if (raw === undefined) continue
    // The credential store carries the live OAuth business token the provider
    // APIs and the Coding Plan gateway actually accept; config.json only has
    // the provider's `options.apiKey`, which can be stale. Prefer the store.
    const stored = glmKeyFromZcodeCredentials(raw)
    if (stored) {
      return {
        session: glmSession({
          accessToken: stored.apiKey,
          region: stored.region,
          zcodeJwt: stored.zcodeJwt,
          oauthAccess: stored.oauthAccess,
        }),
        source: path,
      }
    }
    const found = glmKeyFromZcodeConfig(raw)
    if (!found) continue
    return {
      session: glmSession({
        accessToken: found.apiKey,
        region: found.region,
      }),
      source: path,
      ...(found.usable === false
        ? { note: `ZCode marks this ${found.region} key "${found.reason ?? 'disabled'}"` }
        : {}),
    }
  }
  throw new Error(`no GLM / ZCode session found in ${tried.join(' or ')}`)
}

export function kiroAuthSearchPaths() {
  return [
    homeFile('.aws', 'sso', 'cache', 'kiro-auth-token.json'),
    homeFile('.kiro', 'credentials.json'),
    join(process.cwd(), 'credentials.json'),
  ]
}

export function sessionFromKiroAuth(raw) {
  return sessionsFromKiroAuth(raw)[0]
}

function takeKiroSessions(raw, registration) {
  const hydrated = registration ? hydrateKiroSsoToken(raw, registration) : raw
  return sessionsFromKiroAuth(hydrated)
}

function isClientRegistration(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const clientId = raw.clientId ?? raw.client_id
  const clientSecret = raw.clientSecret ?? raw.client_secret
  if (typeof clientId !== 'string' || typeof clientSecret !== 'string') return false
  if (raw.refreshToken || raw.refresh_token || raw.accessToken || raw.access_token) return false
  return true
}

async function importKiroFromCache(dir, tried, seenIds, seenPaths) {
  let names
  try {
    names = await readdir(dir)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
  const files = new Map()
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const path = join(dir, name)
    const raw = await readJson(path)
    if (raw !== undefined) files.set(name, { path, raw })
  }
  const registrations: any[] = []
  for (const { raw } of files.values()) {
    if (isClientRegistration(raw)) registrations.push(raw)
  }
  const token = files.get('kiro-auth-token.json')
  const hash = token
    ? (token.raw.clientIdHash || kiroSsoClientIdHash(token.raw.startUrl))
    : undefined
  const hashed = hash ? files.get(`${hash}.json`) : undefined
  const registration = hashed?.raw ?? registrations[0]
  const ordered = [
    'kiro-auth-token.json',
    ...[...files.keys()].filter((name) => name !== 'kiro-auth-token.json'),
  ]
  const found: any[] = []
  for (const name of ordered) {
    const row = files.get(name)
    if (!row) continue
    if (seenPaths.has(row.path)) continue
    seenPaths.add(row.path)
    tried.push(row.path)
    if (isClientRegistration(row.raw)) continue
    const sessions = takeKiroSessions(
      row.raw,
      name === 'kiro-auth-token.json' ? registration : undefined,
    )
    for (const session of sessions) {
      const id = kiroAccountId(session)
      if (seenIds.has(id)) continue
      seenIds.add(id)
      found.push({ session, source: row.path })
    }
  }
  return found
}

export async function importKiroAuth(paths?) {
  const list = paths ?? kiroAuthSearchPaths()
  const scanCache = paths == null
  const tried: any[] = []
  const found: any[] = []
  const seenIds = new Set()
  const seenPaths = new Set()
  for (const path of list) {
    if (!path || seenPaths.has(path)) continue
    seenPaths.add(path)
    tried.push(path)
    const raw = await readJson(path)
    if (raw === undefined) continue
    let registration
    if (path.endsWith('kiro-auth-token.json')) {
      const hash = raw.clientIdHash || kiroSsoClientIdHash(raw.startUrl)
      registration = await readJson(join(dirname(path), `${hash}.json`))
    }
    for (const session of takeKiroSessions(raw, registration)) {
      const id = kiroAccountId(session)
      if (seenIds.has(id)) continue
      seenIds.add(id)
      found.push({ session, source: path })
    }
  }
  if (scanCache) {
    const fromCache = await importKiroFromCache(homeFile('.aws', 'sso', 'cache'), tried, seenIds, seenPaths)
    found.push(...fromCache)
  }
  if (found.length === 0) throw new Error(`no Kiro session found in ${tried.join(' or ')}`)
  return {
    session: found[0].session,
    sessions: found.map((row) => row.session),
    source: found[0].source,
  }
}
