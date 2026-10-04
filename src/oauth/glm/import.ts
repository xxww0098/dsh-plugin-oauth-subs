/**
 * GLM Coding Plan local-session import from ZCode Desktop: a user who has
 * already logged in on this machine does not have to repeat the CLI flow.
 *
 * Recognised files:
 *   ~/.zcode/v2/credentials.json  ZCode Desktop credential store (enc:v1)
 *   ~/.zcode/v2/config.json     ZCode Desktop (Coding Plan apiKey under provider)
 *   ~/.zcode/cli/credentials.json / cli/config.json / ~/.zcode/config.json  older ZCode
 */

import { createDecipheriv, createHash } from 'node:crypto'
import { homedir, platform, userInfo } from 'node:os'
import { decodeJwtPayload } from '../../utils/jwt.js'
import { glmSession } from './index.js'
import { homeFile, readJson } from '../import-auth.js'

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
