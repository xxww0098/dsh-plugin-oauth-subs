/**
 * Zhipu GLM Coding Plan OAuth — two providers, same ZCode CLI poll.
 *
 * Z.ai (global) and BigModel (China) are the two buttons on ZCode's welcome
 * screen. CLI init provider ids are `zai` and `bigmodel` (`zcode` 500s).
 *
 *   1. POST zcode.z.ai/api/v1/oauth/cli/init  { provider: "zai"|"bigmodel" }
 *   2. Open data.authorize_url, poll /oauth/cli/poll/{flow_id}
 *   3. Mint id.secret (the Coding Plan chat bearer) in both regions:
 *      Z.ai exchanges the OAuth token via POST api.z.ai/api/auth/z/login;
 *      BigModel's biz/keys APIs take the OAuth token itself (z/login there
 *      rejects the poll token with 「z.ai用户信息异常」). The OAuth token is
 *      kept as `oauthAccess` for userinfo/identity.
 *
 * Chat default is Anthropic Messages (`/api/anthropic/v1/messages`, ZCode
 * Desktop). Completions leftover (`/api/coding/paas/v4/chat/completions`)
 * stays until the next llm-pi-ai sync. Not chatgpt.com.
 */

import { randomBytes } from 'node:crypto'
import { arch as osArch, release as osRelease } from 'node:os'
import { decodeJwtPayload } from '../../utils/jwt.js'
import { GLM_STABLE_SESSION, glmCacheSessionId } from './cache.js'
import { outboundFetch } from '../../utils/outbound.js'
import { catalogRows } from '../../catalog/index.js'

export const GLM_CLIENT_ID = 'client_P8X5CMWmlaRO9gyO-KSqtg'
export const GLM_BIGMODEL_APP_ID = 'zcode'
export const GLM_CLI_INIT_URL = 'https://zcode.z.ai/api/v1/oauth/cli/init'
export const GLM_CLI_POLL_URL = 'https://zcode.z.ai/api/v1/oauth/cli/poll'
export const GLM_TOKEN_URL = 'https://zcode.z.ai/api/v1/oauth/token'
export const GLM_AUTHORIZE_URL = 'https://chat.z.ai/api/oauth/authorize'
export const GLM_BIGMODEL_AUTHORIZE_URL = 'https://bigmodel.cn/login'
export const GLM_BUSINESS_LOGIN_URL = 'https://api.z.ai/api/auth/z/login'
export const GLM_BIZ_BASE = 'https://api.z.ai'
export const GLM_CODING_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions'
/**
 * Official Coding Plan model gateway. ZCode never posts the Coding Plan
 * Anthropic endpoint directly: `createOfficialCodingPlanGatewayFetch`
 * (apps/zcode-cli/packages/adapters/src/model/official-coding-plan-gateway.ts)
 * rewrites the endpoint to this origin and keeps method, body, query and every
 * header except `host`. NOTICE.md「官方 Coding Plan 模型网关转发」says the
 * gateway runs plan-entitlement checks before forwarding to the model service.
 */
export const GLM_GATEWAY_ORIGIN = 'https://zcode.z.ai'
export const GLM_GATEWAY_ANTHROPIC_PATHS = Object.freeze({
  zai: '/api/v1/ultra-zai/anthropic/v1/messages',
  bigmodel: '/api/v1/ultra/anthropic/v1/messages',
})
/** Direct upstreams. Kept as the fallback when the gateway refuses the key. */
export const GLM_ANTHROPIC_DIRECT_URLS = Object.freeze({
  zai: 'https://api.z.ai/api/anthropic/v1/messages',
  bigmodel: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
})
export const GLM_ANTHROPIC_URL = GLM_ANTHROPIC_DIRECT_URLS.zai
export const GLM_ANTHROPIC_VERSION = '2023-06-01'
export const GLM_QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit'
export const GLM_TOOL_USAGE_URL = 'https://api.z.ai/api/monitor/usage/tool-usage'
export const GLM_USERINFO_URL = 'https://chat.z.ai/api/oauth/userinfo'
export const GLM_BIGMODEL_USERINFO_URL = 'https://open.bigmodel.cn/api/biz/customer/getCustomerInfo'
export const GLM_KEY_NAME = 'dsh-plugin-oauth-subs'
/** CLI / site ids. Never show these as the account name on the card. Opaque poll `user.id` is `isGlmOpaqueAccount`. */
export const GLM_APP_ACCOUNTS = Object.freeze(['zcode', 'zai', 'bigmodel', 'glm'])
/** Official ZCode Desktop, latest stable (https://zcode.z.ai/en/changelog). */
export const GLM_APP_VERSION = '3.10.1'
/** Desktop UA from resources/glm/zcode.cjs (`eao`/`rao`). Do not leak this plugin. */
export const GLM_USER_AGENT = `ZCode/${GLM_APP_VERSION} ai-sdk/anthropic/3.0.81`
/** CLI poll against zcode.z.ai — official CLI shape, not Desktop, not this plugin. */
export const GLM_CLI_USER_AGENT = `ZCode/${GLM_APP_VERSION}`
export const GLM_REFERER = GLM_GATEWAY_ORIGIN
/** ZCode CLI source title (`Z Code@cli`) / Desktop (`Z Code@electron`). */
export const GLM_TITLE = 'Z Code@electron'
export const GLM_AGENT = 'glm'
/** resolveRuntimeZCodeEnv default (`ZCODE_ENV` unset) is production. */
export const GLM_RELEASE_CHANNEL = 'production'
export const GLM_NEVER_EXPIRES = 8.64e15
export const GLM_CONTEXT_WINDOW = 128_000
export const GLM_LARGE_CONTEXT = 1_000_000
export const GLM_TURBO_CONTEXT = 200_000
/**
 * Coding Plan input cap (2026-09-29): the plan gateway accepts at most 400K
 * input tokens per request even though the official GLM-5.3 window is 1M
 * (docs.z.ai/guides/llm/glm-5.3 still says 1M / 128K output). The picker
 * default targets the cap so DSH compacts before the gateway rejects; the
 * official 1M stays reachable as the row's custom-context ceiling
 * (`maxContextWindow`, `maxContextOfRow`) — no `-1m` variant row any more.
 */
export const GLM_INPUT_CONTEXT = 400_000
/** Text-only GLM rows. Flash is the one multimodal Coding Plan model. */
export const GLM_TEXT_INPUT = Object.freeze(['text'])
export const GLM_VISION_INPUT = Object.freeze(['text', 'image'])

/**
 * GLM-5.3 / GLM-5.3-Flash thinking depth. Official docs (2026-08):
 * `reasoning_effort` is `low` / `high` / `max`, default `max`. Thinking
 * cannot be turned off — `thinking.type: disabled` 400s. No `medium`.
 * Turbo is hybrid on/off with no effort ladder.
 *
 * Values are the wire spellings ZCode's catalog map reads
 * (config/provider/zcode-builtin.json modelApiRules, apiTypeMatch
 * `anthropic-messages`): `output_config.effort` is the level verbatim.
 */
export const GLM_REASONING = Object.freeze({
  low: 'low',
  high: 'high',
  max: 'max',
})

export const GLM_REGIONS = Object.freeze(['zai', 'bigmodel'])
export const GLM_CLI_PROVIDERS = Object.freeze({
  zai: 'zai',
  bigmodel: 'bigmodel',
})

/**
 * Coding Plan catalog shown in Settings. Three rows only:
 * GLM-5.3 and GLM-5-Turbo are text; GLM-5.3-Flash is the natively
 * multimodal model (image + text). Official Flash also takes video/file;
 * llm-pi-ai / pi-ai only wire `text` and `image`.
 *
 * The plan's live model policy is two models — `docs.z.ai/devpack/overview`:
 * 「所有套餐均支持 GLM-5.3、GLM-5.3-Flash」, and legacy ids auto-route
 * (GLM-5.2 / 5.1 → 5.3, GLM-4.7 → 5.3-Flash). `glm-5.3-flashx` (200 tok/s,
 * 1M ctx) is explicitly **not yet on the plan** (`guides/vlm/glm-5.3-flash`),
 * so it stays out of the picker. GLM-5.2 stays retired: a `thinking.type:
 * disabled` sent to a backend that routes it to 5.3 would 400 (5.3 is
 * forced-on). Turbo keeps its own row because ZCode's
 * `builtinProviderModelRules` still enables it; its 64k output cap comes from
 * `modelRules` (Turbo 200k / 64k vs 5.3 / Flash 1M / 128k).
 *
 * Thinking depth is declared here so the Harness session picker can
 * offer it. `false` means no depth control (Turbo); omitting `off`
 * means thinking cannot be disabled (5.3 / Flash).
 *
 * 5.3 rows sit at the plan's 400K input cap with the official 1M window as
 * `maxContextWindow` — the row's custom-context ceiling (`maxContextOfRow`);
 * see `src/utils/context-mode.ts`.
 */
export const GLM_MODELS = catalogRows('glm')

/** Catalog lookup for the custom-context ceiling (`maxContextWindowOf`). */
export function glmModel(modelId) {
  return GLM_MODELS.find((model) => model.id === modelId)
}


export const GLM_PLAN_NAMES = Object.freeze({
  lite: 'Lite',
  pro: 'Pro',
  max: 'Max',
  coding_lite: 'Lite',
  coding_pro: 'Pro',
  coding_max: 'Max',
  individual: 'Individual',
  team: 'Team',
})

export function normalizeGlmRegion(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === 'bigmodel' || raw === 'cn' || raw === 'zcode' || raw === 'china') return 'bigmodel'
  return 'zai'
}

export function glmCliProvider(region) {
  return GLM_CLI_PROVIDERS[normalizeGlmRegion(region)]
}

export function glmPlanLabel(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const slug = raw.trim().toLowerCase().replace(/[_\-\s]+/g, '_')
  return GLM_PLAN_NAMES[slug] ?? raw.trim()
}

export function glmCodingUrl(region = 'zai') {
  return normalizeGlmRegion(region) === 'bigmodel'
    ? 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions'
    : GLM_CODING_URL
}

/** Direct Coding Plan Anthropic endpoint (what the gateway forwards to). */
export function glmAnthropicDirectUrl(region = 'zai') {
  return GLM_ANTHROPIC_DIRECT_URLS[normalizeGlmRegion(region)]
}

/** Official ZCode hop: the Coding Plan endpoint rewritten to the platform gateway. */
export function glmAnthropicGatewayUrl(region = 'zai') {
  return `${GLM_GATEWAY_ORIGIN}${GLM_GATEWAY_ANTHROPIC_PATHS[normalizeGlmRegion(region)]}`
}

/** ZCode default protocol. https://docs.z.ai/devpack/quick-start */
export function glmAnthropicUrl(region = 'zai') {
  return glmAnthropicGatewayUrl(region)
}

export function glmQuotaUrl(region = 'zai') {
  return normalizeGlmRegion(region) === 'bigmodel'
    ? 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'
    : GLM_QUOTA_URL
}

/** Team seat windows: the monitor quota with type=2 (magpie zhipuTeamWindows / buildQuotaLimitUrl). */
export function glmTeamQuotaUrl(region = 'zai') {
  return `${glmQuotaUrl(region)}?type=2`
}

export function glmToolUsageUrl(region = 'zai') {
  return normalizeGlmRegion(region) === 'bigmodel'
    ? 'https://open.bigmodel.cn/api/monitor/usage/tool-usage'
    : GLM_TOOL_USAGE_URL
}

/**
 * Official ZCode MCP quota endpoint (usage-stats.ts fetchMcpQuotaSnapshot).
 * Always the zcode.z.ai platform gateway — api.z.ai / open.bigmodel.cn answer
 * 404. It needs BOTH the zcode JWT (authorization) and the provisioned
 * Coding Plan api-key (X-Bigmodel-Authorization), plus Bigmodel-Target-Type.
 */
export const GLM_MCP_USAGE_URL = 'https://zcode.z.ai/api/v1/mcp/usage'
export function glmMcpUsageUrl() {
  return GLM_MCP_USAGE_URL
}

/**
 * Coding Plan Reset Cards (「重置卡」): `GET …/list?targetType=PERSONAL`
 * reports banked cards in two buckets (`fiveHourResets` / `weekResets`);
 * `POST …/use` redeems one. Same biz host as userinfo, same provisioned
 * api-key bearer as the monitor quota. Not in the ZCode open-source tree —
 * reference is OmniRoute `open-sse/services/usage/glmResetCards.ts`
 * (241e63b), list live-checked on a BigModel Max account.
 */
export const GLM_RESET_CARD_TARGET_TYPE = 'PERSONAL'
export function glmResetCardUrl(region = 'zai', action: 'list' | 'use' = 'list', targetType = GLM_RESET_CARD_TARGET_TYPE) {
  const base = `${glmBizBase(region)}/api/biz/customer-package-reset`
  return action === 'use' ? `${base}/use` : `${base}/list?targetType=${targetType}`
}

// ---- Team Coding Plan (README 团队套餐; magpie zcode_team.go ← ZCode 3.14.3 host/index.js)

export const GLM_TEAM_KEY_NAME = 'zcode-team-api-key'
export const GLM_TEAM_KEY_TYPE = 2

/** projectType 2 is a team Coding Plan project (isBigModelTeamCodingPlanProject). */
export function glmProjectIsTeam(project) {
  const type = project?.projectType ?? project?.type
  return type !== undefined && type !== null && String(type).trim() === '2'
}

/** The account's team Coding Plan projects, org+project pairs. */
export function glmTeamProjects(customer) {
  const out: any[] = []
  for (const org of Array.isArray(customer?.organizations) ? customer.organizations : []) {
    const organizationId = trimmed(org?.organizationId)
    if (!organizationId) continue
    for (const project of Array.isArray(org?.projects) ? org.projects : []) {
      const projectId = trimmed(project?.projectId)
      if (projectId && glmProjectIsTeam(project)) out.push({ org: organizationId, project: projectId })
    }
  }
  return out
}

/** Headers the team business/usage endpoints are asked with besides Authorization (createBigModelUsageHeaders). */
export function glmTeamHeaders(region = 'zai', org, project) {
  return {
    'Bigmodel-Organization': org,
    'Bigmodel-Project': project,
    'Set-Language': normalizeGlmRegion(region) === 'bigmodel' ? 'zh' : 'en',
    'Accept-Language': 'en-US,en',
  }
}

/** A team seat is usable when the plan is EFFECTIVE and the member's grant VALID. */
export function glmTeamDetailUsable(detail) {
  return detail?.hasSubscription !== false
    && String(detail?.status ?? '').trim().toUpperCase() === 'EFFECTIVE'
    && String(detail?.memberGrantStatus ?? '').trim().toUpperCase() === 'VALID'
}

/** Why a seat is not usable: 'unassigned' (ask the admin) or 'expired' (the team's plan ran out). */
export function glmTeamSeatState(detail) {
  const status = String(detail?.status ?? '').trim().toUpperCase()
  const grant = String(detail?.memberGrantStatus ?? '').trim().toUpperCase()
  if (status === 'EFFECTIVE' && grant === 'UNASSIGNED') return 'unassigned'
  if (status === 'EXPIRED') return 'expired'
  return undefined
}

/** Team plan times (zcodeWhen + zhipuTime): unix seconds/milliseconds, or a zone-less stamp — Beijing on BigModel, UTC on Z.ai. */
export function glmTeamStamp(value, region = 'zai') {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.trim()) : undefined
  if (numeric !== undefined && Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1e12 ? numeric : numeric * 1000
  }
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim())
    if (match) {
      const [, y, mo, d, hh, mm, ss] = match
      const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss))
      const offset = normalizeGlmRegion(region) === 'bigmodel' ? 8 * 60 : 0
      return Number.isFinite(utc) ? utc - offset * 60_000 : undefined
    }
  }
  return undefined
}

/** Seat detail as querySubscribeDetail tells it (envelope-unwrap happens here). */
export async function fetchGlmTeamDetail(bizToken, { fetchFn = outboundFetch, region = 'zai', org, project }: any = {}) {
  const data = unwrapEnvelope(
    await getJson(`${glmBizBase(region)}/api/biz/team/subscribe/product/querySubscribeDetail`, {
      authorization: `Bearer ${bizToken}`,
      accept: 'application/json',
      ...glmTeamHeaders(region, org, project),
    }, fetchFn),
    'team detail',
  )
  return {
    hasSubscription: data?.hasSubscription,
    status: trimmed(data?.status),
    memberGrantStatus: trimmed(data?.memberGrantStatus),
    productName: trimmed(data?.productName),
    subscribeEndTime: data?.subscribeEndTime,
  }
}

/**
 * The card stamps (`expireTime` / `last*ResetTime`) carry no zone.
 * BigModel's are Asia/Shanghai: `lastWeekResetTime` equals the weekly
 * window's `nextResetTime` − 7d only at +08:00. Z.ai is read as UTC
 * (OmniRoute's reading, not live-checked here).
 */
export function glmResetStampOffsetMinutes(region = 'zai') {
  return normalizeGlmRegion(region) === 'bigmodel' ? 8 * 60 : 0
}

export function glmUserinfoUrl(region = 'zai') {
  return normalizeGlmRegion(region) === 'bigmodel' ? GLM_BIGMODEL_USERINFO_URL : GLM_USERINFO_URL
}

export function isGlmAppAccount(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  const raw = value.trim().toLowerCase()
  if (GLM_APP_ACCOUNTS.includes(raw)) return true
  const at = raw.lastIndexOf('@')
  if (at <= 0) return false
  const head = raw.slice(0, at)
  const tail = raw.slice(at + 1)
  if ((tail === 'zai' || tail === 'bigmodel' || tail === 'zcode' || tail === 'glm')
    && GLM_APP_ACCOUNTS.includes(head)) {
    return true
  }
  return GLM_APP_ACCOUNTS.includes(head) && (tail === 'zai' || tail === 'bigmodel')
}

/** Formatted phone (not a bare numeric uid). Used so +86… can be a card title. */
function isGlmFormattedPhone(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  const raw = value.trim()
  if (!/^[+]?[\d\s().-]+$/.test(raw)) return false
  if (!/[+\s().-]/.test(raw)) return false
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

/**
 * Site ids, poll `user.id`, JWT `sub` / numeric uid, and similar opaque Zhipu
 * handles. Never a Settings card title. Emails and formatted phones pass.
 */
export function isGlmOpaqueAccount(value) {
  if (typeof value !== 'string' || !value.trim()) return false
  const raw = value.trim()
  if (isGlmAppAccount(raw)) return true
  if (raw.includes('@')) return false
  if (isGlmFormattedPhone(raw)) return false
  if (/^\d+$/.test(raw)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return true
  if (/^[0-9a-f]{16,}$/i.test(raw)) return true
  return /^[A-Za-z0-9]{2,24}$/.test(raw) && /[A-Za-z]/.test(raw) && /\d/.test(raw)
}

function pickGlmPhoneAccount(...candidates) {
  for (const value of candidates) {
    if (typeof value !== 'string' || !value.trim()) continue
    const raw = value.trim()
    if (isGlmAppAccount(raw)) continue
    const digits = raw.replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15 && /^\+?[\d\s().-]+$/.test(raw)) return raw
  }
  return undefined
}

export function pickGlmHumanAccount(...candidates) {
  for (const value of candidates) {
    if (typeof value !== 'string' || !value.trim()) continue
    const trimmedValue = value.trim()
    if (isGlmOpaqueAccount(trimmedValue)) continue
    return trimmedValue
  }
  return undefined
}

export function accountFromJwt(token) {
  const payload = decodeJwtPayload(token)
  if (!payload) return undefined
  return pickGlmHumanAccount(
    payload.email,
    payload.preferred_username,
    payload.preferredUsername,
    payload.username,
    payload.userName,
    payload.name,
  )
}

/**
 * Display-name fields are the user's chosen name, not an id — they must not
 * pass the opaque filter. `customerName` / `username` like `xxww0098` or
 * `fwfeibn6` are letters+digits and would be dropped as "internal id" even
 * though they are exactly what the vendor shows. Site ids still excluded.
 */
export function pickGlmName(...candidates) {
  for (const value of candidates) {
    if (typeof value !== 'string' || !value.trim()) continue
    const trimmedValue = value.trim()
    if (isGlmAppAccount(trimmedValue)) continue
    // Unambiguous ids are still not a display name: pure digits, UUID, long hex.
    if (/^\d+$/.test(trimmedValue)) continue
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedValue)) continue
    if (/^[0-9a-f]{16,}$/i.test(trimmedValue)) continue
    return trimmedValue
  }
  return undefined
}

function humanFromObject(value) {
  if (!value || typeof value !== 'object') return undefined
  return pickGlmHumanAccount(
    value.email,
    value.mail,
    value.preferred_username,
    value.preferredUsername,
  )
    ?? pickGlmPhoneAccount(value.phone, value.mobile, value.phoneNumber)
    ?? pickGlmName(
      value.customerName,
      value.nickName,
      value.nickname,
      value.displayName,
      value.name,
      value.username,
      value.userName,
    )
}

export function glmBizBase(region = 'zai') {
  return normalizeGlmRegion(region) === 'bigmodel' ? 'https://open.bigmodel.cn' : GLM_BIZ_BASE
}

function randomHex(bytes = 16) {
  return randomBytes(bytes).toString('hex')
}

function printableHeader(value) {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed && /^[\x20-\x7e]+$/.test(trimmed) ? trimmed : undefined
}

let GLM_PLATFORM_HEADERS

/**
 * `createRuntimePlatformHeaders` (bootstrap/src/runtime-platform-headers.ts):
 * X-Platform / X-Os-Category / X-Os-Version from the running host.
 */
function glmPlatformHeaders() {
  if (GLM_PLATFORM_HEADERS === undefined) {
    const platform = printableHeader(process.platform)
    const architecture = printableHeader(osArch())
    const category = process.platform === 'darwin'
      ? 'macos'
      : process.platform === 'win32' ? 'windows' : 'linux'
    const release = printableHeader(osRelease())
    GLM_PLATFORM_HEADERS = Object.freeze({
      ...(platform && architecture ? { 'X-Platform': `${platform}-${architecture}` } : {}),
      'X-Os-Category': category,
      ...(release ? { 'X-Os-Version': release } : {}),
    })
  }
  return GLM_PLATFORM_HEADERS
}

/** X-Client-Language / X-Client-Timezone from buildCliZCodeSourceHeaders. */
function glmClientHeaders() {
  let locale
  let timezone
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions()
    locale = printableHeader(resolved.locale)
    timezone = printableHeader(resolved.timeZone)
  } catch {
    locale = undefined
    timezone = undefined
  }
  return {
    'X-Client-Language': locale ?? 'unknown',
    'X-Client-Timezone': timezone ?? 'unknown',
  }
}

/**
 * ZCode Desktop client fingerprint for the Coding Plan gateway.
 *
 * Header set from bootstrap/src/model-config.ts (buildCliZCodeSourceHeaders) +
 * runtime-platform-headers.ts, plus the per-request attribution headers in
 * adapters/src/model/runner-attribution.ts. `x-zcode-session-type` is what the
 * Coding Plan server reads to tell main / subagent / other apart; this hop
 * serves DSH's main loop, so it sends `main`.
 */
export function glmDesktopHeaders(sessionId?) {
  return {
    'user-agent': GLM_USER_AGENT,
    'X-ZCode-App-Version': GLM_APP_VERSION,
    'X-ZCode-Agent': GLM_AGENT,
    'X-Release-Channel': GLM_RELEASE_CHANNEL,
    ...glmClientHeaders(),
    ...glmPlatformHeaders(),
    'x-zcode-session-type': 'main',
    'x-zcode-trace-id': randomHex(),
    'x-request-id': randomHex(),
    'x-session-id': glmCacheSessionId(sessionId) || GLM_STABLE_SESSION,
    'x-query-id': randomHex(),
    'HTTP-Referer': GLM_REFERER,
    referer: GLM_REFERER,
    'X-Title': GLM_TITLE,
  }
}

export function glmUpstreamHeaders(session, sessionId?) {
  return {
    authorization: `Bearer ${session.accessToken}`,
    accept: 'application/json',
    ...glmDesktopHeaders(sessionId),
  }
}

export function glmAnthropicHeaders(session, sessionId) {
  return {
    ...glmUpstreamHeaders(session, sessionId),
    'anthropic-version': GLM_ANTHROPIC_VERSION,
  }
}

/**
 * MCP quota headers (buildOfficialMcpAuthHeaders): the zcode JWT rides
 * `authorization`, the provisioned Coding Plan api-key rides
 * `X-Bigmodel-Authorization`, and PERSONAL scope sends
 * `Bigmodel-Target-Type: PERSONAL`. Returns undefined without a zcodeJwt —
 * the endpoint 400s without it.
 */
export function glmMcpUsageHeaders(session) {
  const jwt = typeof session?.zcodeJwt === 'string' && session.zcodeJwt.trim()
    ? session.zcodeJwt.trim()
    : undefined
  const apiKey = typeof session?.accessToken === 'string' && session.accessToken.trim()
    ? session.accessToken.trim()
    : undefined
  if (!jwt || !apiKey) return undefined
  return {
    authorization: `Bearer ${jwt}`,
    'X-Bigmodel-Authorization': `Bearer ${apiKey}`,
    'Bigmodel-Target-Type': 'PERSONAL',
    accept: 'application/json',
    ...glmDesktopHeaders(),
  }
}

function codingPlanJsonHeaders(extra: any = {}) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    ...glmDesktopHeaders(),
    ...extra,
  }
}

function cliJsonHeaders(extra: any = {}) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': GLM_CLI_USER_AGENT,
    ...extra,
  }
}

export function isSuccessCode(code) {
  if (code == null) return true
  if (typeof code === 'number') return code === 0 || code === 200
  if (typeof code === 'string') return code === '0' || code === '200'
  return false
}

/** Business envelope failure (HTTP 200 with a non-zero `code`). Terminal. */
export class GlmBusinessError extends Error {
  declare code: any

  constructor(operation, code, message) {
    super(`glm ${operation} failed: ${message ?? `code ${String(code)}`}`)
    this.name = 'GlmBusinessError'
    this.code = code
  }
}

export function unwrapEnvelope(body, operation) {
  if (body && typeof body === 'object' && ('code' in body || 'success' in body)) {
    if (body.success === false || !isSuccessCode(body.code)) {
      throw new GlmBusinessError(operation, body.code, body.msg)
    }
    return 'data' in body ? body.data : body
  }
  return body
}

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function tokenFrom(obj) {
  if (!obj || typeof obj !== 'object') return undefined
  return trimmed(obj.access_token ?? obj.accessToken)
}

export function createPollToken() {
  return randomBytes(32).toString('hex')
}

/**
 * Server `expires_at` is epoch **seconds** (auth-login-polling.ts:
 * `expires_at * 1_000`). Older/other spellings can be epoch ms; a small
 * relative number falls back to a 5-minute budget instead of becoming 1970.
 */
export function parseGlmExpiresAt(value, now = Date.now()) {
  const raw = Number(value)
  if (!Number.isFinite(raw) || raw <= 0) return now + 300_000
  if (raw > 1e12) return raw
  if (raw > 1e9) return raw * 1000
  return now + Math.max(60_000, raw * 1000)
}

export function parseCliInit(body) {
  const data = unwrapEnvelope(body, 'cli init') ?? {}
  const flowId = trimmed(data.flow_id ?? data.flowId)
  const authorizeUrl = trimmed(data.authorize_url ?? data.authorizeUrl)
  if (!flowId || !authorizeUrl) throw new Error('glm cli init is missing flow_id/authorize_url')
  try {
    if (new URL(authorizeUrl).protocol !== 'https:') throw new Error()
  } catch {
    throw new Error('glm cli init returned a non-https authorize_url')
  }
  const intervalSec = Number(data.poll_interval_sec ?? data.interval ?? 2)
  return {
    flowId,
    authorizeUrl,
    // Official floor is 1s; a 0/NaN interval must not become a hot loop.
    intervalMs: Math.max(1000, (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : 2) * 1000),
    expiresAt: parseGlmExpiresAt(data.expires_at ?? data.expiresAt),
  }
}

/**
 * Provider access token from a ready poll. The official readers only look at
 * the provider-named object — `data[providerId].access_token`
 * (cli-oauth.ts parseReadyData; webAuthService for BigModel) — so the region
 * decides the field, and `data.token` is never a substitute: that is the
 * zcode JWT, which bigmodel.cn rejects with 「令牌已过期或验证不正确」.
 * bigmodelProviderAdapter.ts spells it out: the provider token is what
 * bigmodel.cn business APIs take (here: the biz bearer for key minting and
 * the `oauthAccess` identity token); the zcode JWT is only for Start Plan.
 */
export function glmProviderAccessToken(data, region = 'zai') {
  const provider = normalizeGlmRegion(region)
  const named = provider === 'bigmodel' ? tokenFrom(data?.bigmodel) : tokenFrom(data?.zai)
  return named ?? trimmed(data?.access_token) ?? trimmed(data?.accessToken)
}

/**
 * Official poll states are `pending` / `ready` / `failed`
 * (auth-login-polling.ts). Anything else is terminal too: a stale or
 * unknown state must fail the login instead of spinning until expiry.
 */
export function parseCliPoll(body, region = 'zai') {
  const data = unwrapEnvelope(body, 'cli poll') ?? {}
  const status = trimmed(data.status) ?? 'pending'
  if (status !== 'ready') {
    return {
      status,
      ready: false,
      failed: status === 'failed',
      unknown: status !== 'pending' && status !== 'failed',
      ...(trimmed(data.msg ?? data.message) === undefined ? {} : { message: trimmed(data.msg ?? data.message) }),
    }
  }
  const oauthAccess = glmProviderAccessToken(data, region)
  if (!oauthAccess) throw new Error('glm cli poll ready without access token')
  const zcodeJwt = trimmed(data.token)
  const rawAccountId = data.user?.id != null ? String(data.user.id) : undefined
  const email = pickGlmHumanAccount(
    data.user?.email,
    data.user?.preferred_username,
    data.user?.preferredUsername,
    data.email,
    accountFromJwt(zcodeJwt),
    accountFromJwt(oauthAccess),
  )
  // Keep a non-opaque id for vault keying only. Poll `user.id` is never a title.
  const accountId = pickGlmHumanAccount(rawAccountId)
  return {
    status: 'ready',
    ready: true,
    oauthAccess,
    zcodeJwt,
    email,
    accountId,
  }
}

/**
 * HTTP failure with the status attached. The CLI login poll retries
 * transient failures and treats 4xx (except 408/429) as terminal, the same
 * split auth-login-polling.ts uses.
 */
export class GlmHttpError extends Error {
  declare status: number

  constructor(label, status, text) {
    super(`${label} failed (HTTP ${status})${text ? `: ${text.slice(0, 240)}` : ''}`)
    this.name = 'GlmHttpError'
    this.status = status
  }
}

async function readJson(response, label) {
  const text = await response.text()
  if (!response.ok) throw new GlmHttpError(label, response.status, text)
  return text ? JSON.parse(text) : undefined
}

export async function glmCliInit({ region = 'zai', fetchFn = outboundFetch, pollToken = createPollToken() } = {}) {
  const resolved = normalizeGlmRegion(region)
  const response = await fetchFn(GLM_CLI_INIT_URL, {
    method: 'POST',
    headers: cliJsonHeaders({ authorization: `Bearer ${pollToken}` }),
    body: JSON.stringify({ provider: glmCliProvider(resolved) }),
  })
  const started = parseCliInit(await readJson(response, 'glm cli init'))
  return { ...started, pollToken, region: resolved }
}

export async function glmCliPoll({ flowId, pollToken, region = 'zai', fetchFn = outboundFetch }: any = {}) {
  const response = await fetchFn(`${GLM_CLI_POLL_URL}/${encodeURIComponent(flowId)}`, {
    method: 'GET',
    headers: cliJsonHeaders({ authorization: `Bearer ${pollToken}` }),
  })
  return parseCliPoll(await readJson(response, 'glm cli poll'), region)
}

// getJson/postJson are bounded at 10s: a hung identity/login call must not
// stall the shared settings snapshot.
async function getJson(url, headers, fetchFn) {
  return readJson(await fetchFn(url, {
    method: 'GET',
    headers: { accept: 'application/json', ...glmDesktopHeaders(), ...headers },
    signal: AbortSignal.timeout(10_000),
  }), url)
}

async function postJson(url, body, headers, fetchFn) {
  return readJson(await fetchFn(url, {
    method: 'POST',
    headers: codingPlanJsonHeaders(headers),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  }), url)
}

export async function businessLogin(oauthAccessToken, { fetchFn = outboundFetch, region = 'zai' } = {}) {
  const url = normalizeGlmRegion(region) === 'bigmodel'
    ? 'https://open.bigmodel.cn/api/auth/z/login'
    : GLM_BUSINESS_LOGIN_URL
  const data = unwrapEnvelope(
    await postJson(url, { token: oauthAccessToken }, {}, fetchFn),
    'business login',
  )
  const bizToken = trimmed(data?.access_token ?? data?.accessToken)
  if (!bizToken) throw new Error('glm business login returned no access token')
  return bizToken
}

/**
 * Bearer for the biz/keys provisioning APIs. Z.ai exchanges the OAuth token
 * at z/login first. BigModel's z/login is z.ai-identity-only — the poll token
 * answers `500 z.ai用户信息异常` — but its biz APIs accept the OAuth token
 * directly, so probe getCustomerInfo and only fall back to the exchange when
 * they do not (issue #168 live check, 2026-09-30).
 */
async function glmBizBearer(oauthAccessToken, { fetchFn = outboundFetch, region = 'zai' } = {}) {
  const resolved = normalizeGlmRegion(region)
  if (resolved !== 'bigmodel') {
    return businessLogin(oauthAccessToken, { fetchFn, region: resolved })
  }
  const base = glmBizBase(resolved)
  try {
    await getJson(`${base}/api/biz/customer/getCustomerInfo`,
      { authorization: `Bearer ${oauthAccessToken}` }, fetchFn)
    return oauthAccessToken
  } catch {
    return businessLogin(oauthAccessToken, { fetchFn, region: resolved })
  }
}

function asKeyArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    for (const field of ['list', 'keys', 'apiKeys', 'records']) {
      if (Array.isArray(value[field])) return value[field]
    }
  }
  return []
}

async function glmAccountContext(oauthAccessToken, { fetchFn = outboundFetch, region = 'zai' } = {}) {
  const bizToken = await glmBizBearer(oauthAccessToken, { fetchFn, region })
  const auth = { authorization: `Bearer ${bizToken}` }
  const base = glmBizBase(region)
  const customer = unwrapEnvelope(
    await getJson(`${base}/api/biz/customer/getCustomerInfo`, auth, fetchFn),
    'customer lookup',
  )
  return { bizToken, auth, base, customer }
}

/**
 * The default project a PERSONAL key is minted on. Team Coding Plan projects
 * (projectType 2) are skipped: a member's personal key never lands on the
 * team's project (magpie zcodeMintKey skips them the same way).
 */
function pickPersonalProject(customer) {
  const orgs = Array.isArray(customer?.organizations) ? customer.organizations : []
  const org = orgs.find((row) => row?.isDefault) ?? orgs[0]
  const projects = (Array.isArray(org?.projects) ? org.projects : []).filter((row) => !glmProjectIsTeam(row))
  const project = projects.find((row) => row?.isDefault) ?? projects[0]
  const organizationId = trimmed(org?.organizationId)
  const projectId = trimmed(project?.projectId)
  return organizationId && projectId ? { org: organizationId, project: projectId } : undefined
}

async function provisionProjectKey(keysUrl, auth, extraHeaders, want, fetchFn, label) {
  const headers = { ...auth, ...extraHeaders }
  const typed = want.keyType !== undefined
  const existing = asKeyArray(unwrapEnvelope(await getJson(keysUrl, headers, fetchFn), `${label} list`))
    .find((key) => key.name === want.name && (!typed || String(key.keyType) === String(want.keyType)))
  const keyRecord = existing ?? unwrapEnvelope(
    await postJson(keysUrl, want, headers, fetchFn),
    `${label} create`,
  )
  const apiKey = trimmed(keyRecord?.apiKey)
  if (!apiKey) throw new Error(`glm key provisioning returned no apiKey (${label})`)
  const copied = unwrapEnvelope(
    await getJson(`${keysUrl}/copy/${encodeURIComponent(apiKey)}`, headers, fetchFn),
    `${label} copy`,
  )
  const secretKey = trimmed(copied?.secretKey)
  if (!secretKey) throw new Error(`glm key provisioning returned no secretKey (${label})`)
  return `${apiKey}.${secretKey}`
}

function projectKeysUrl(base, org, project) {
  return `${base}/api/biz/v1/organization/${encodeURIComponent(org)}/projects/${encodeURIComponent(project)}/api_keys`
}

/**
 * Personal plan name from subscription/list (magpie zcodePlan): the first
 * VALID entry's productName, '' when the account has none, undefined when it
 * cannot be told (transport/envelope failure is NOT read as "no plan").
 */
export async function glmPersonalPlanName(apiKey, { fetchFn = outboundFetch, region = 'zai' } = {}) {
  let list
  try {
    list = asKeyArray(unwrapEnvelope(
      await getJson(`${glmBizBase(region)}/api/biz/subscription/list`, {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      }, fetchFn),
      'subscription list',
    ))
  } catch {
    return undefined
  }
  const valid = (Array.isArray(list) ? list : [])
    .find((row) => String(row?.status ?? '').trim().toUpperCase() === 'VALID')
  return trimmed(valid?.productName) ?? ''
}

/** The account's own (personal) Coding Plan key — today's mint, team projects excluded. */
export async function mintGlmApiKey(oauthAccessToken, { fetchFn = outboundFetch, region = 'zai' } = {}) {
  const { bizToken, auth, base, customer } = await glmAccountContext(oauthAccessToken, { fetchFn, region })
  const personal = pickPersonalProject(customer)
  if (!personal) {
    throw new Error('glm key provisioning failed: no organization/project on account')
  }
  return provisionProjectKey(projectKeysUrl(base, personal.org, personal.project), auth, undefined,
    { name: GLM_KEY_NAME }, fetchFn, 'api key')
}

/** A team seat's project key: name zcode-team-api-key, keyType 2 (ensureBigModelTeamPlanProjectApiKeyWithStatus). */
export async function mintGlmTeamApiKey(bizToken, { fetchFn = outboundFetch, region = 'zai', org, project }: any = {}) {
  return provisionProjectKey(projectKeysUrl(glmBizBase(region), org, project),
    { authorization: `Bearer ${bizToken}` }, glmTeamHeaders(region, org, project),
    { name: GLM_TEAM_KEY_NAME, keyType: GLM_TEAM_KEY_TYPE }, fetchFn, 'team api key')
}

/**
 * Login mint, personal first (magpie zcodeSignedIn): the personal key when a
 * VALID subscription backs it; else the first EFFECTIVE + VALID team seat's
 * keyType-2 key with `team {org, project}`; a minted personal key is kept
 * even without a seat, so existing logins do not regress.
 */
export async function mintGlmCodingKey(oauthAccessToken, { fetchFn = outboundFetch, region = 'zai' } = {}) {
  const resolved = normalizeGlmRegion(region)
  const { bizToken, auth, base, customer } = await glmAccountContext(oauthAccessToken, { fetchFn, region: resolved })
  let personalKey
  let personalPlan
  let personalErr
  const personal = pickPersonalProject(customer)
  if (personal) {
    try {
      personalKey = await provisionProjectKey(projectKeysUrl(base, personal.org, personal.project), auth, undefined,
        { name: GLM_KEY_NAME }, fetchFn, 'api key')
      personalPlan = await glmPersonalPlanName(personalKey, { fetchFn, region: resolved })
    } catch (error) {
      personalErr = error
    }
  }
  if (personalKey && (personalPlan === undefined || personalPlan !== '')) {
    return { apiKey: personalKey, ...(personalPlan ? { plan: personalPlan } : {}) }
  }
  const teams = glmTeamProjects(customer)
  let refusal
  for (const seat of teams) {
    let detail
    try {
      detail = await fetchGlmTeamDetail(bizToken, { fetchFn, region: resolved, org: seat.org, project: seat.project })
    } catch {
      continue
    }
    if (glmTeamDetailUsable(detail)) {
      const apiKey = await mintGlmTeamApiKey(bizToken, { fetchFn, region: resolved, org: seat.org, project: seat.project })
      return { apiKey, team: seat, plan: trimmed(detail.productName) || 'team' }
    }
    const state = glmTeamSeatState(detail)
    if (!refusal) {
      if (state === 'unassigned') {
        refusal = 'this account is in a team with a GLM Coding Plan but has no seat on it yet — ask the team admin to grant one, then sign in again'
      } else if (state === 'expired') {
        refusal = "the team's GLM Coding Plan this account is in has expired"
      }
    }
  }
  if (personalKey) return { apiKey: personalKey, ...(refusal ? { note: refusal } : {}) }
  if (refusal) throw new Error(refusal)
  throw personalErr ?? new Error('glm key provisioning failed: no organization/project on account')
}

export function glmSession({ accessToken, account, accountId, region = 'zai', zcodeJwt, oauthAccess, planType, team }: any = {}) {
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('glm session needs an access token')
  }
  const human = pickGlmHumanAccount(account, accountFromJwt(zcodeJwt), accountFromJwt(accessToken), accountFromJwt(oauthAccess))
  const seat = team && trimmed(team.org) && trimmed(team.project)
    ? { org: trimmed(team.org), project: trimmed(team.project) }
    : undefined
  return {
    accessToken,
    refreshToken: accessToken,
    expiresAt: GLM_NEVER_EXPIRES,
    ...(human === undefined ? {} : { account: human, displayName: human }),
    region: normalizeGlmRegion(region),
    ...(zcodeJwt === undefined ? {} : { zcodeJwt }),
    // The OAuth business token is kept only for userinfo/identity — the
    // provisioned api-key in accessToken is what chats and reads quota.
    ...(typeof oauthAccess === 'string' && oauthAccess.trim() ? { oauthAccess: oauthAccess.trim() } : {}),
    ...(typeof planType === 'string' && planType.trim() ? { planType: planType.trim() } : {}),
    // Team Coding Plan seat (README 团队套餐): private auth.json only, never publicSession.
    ...(seat === undefined ? {} : { team: seat }),
  }
}

export async function fetchGlmUserinfo(source, { fetchFn = outboundFetch, region }: any = {}) {
  const resolved = normalizeGlmRegion(region ?? source?.region)
  // bigmodel.cn business APIs only take the BigModel business access token;
  // the zcode JWT answers 401 「令牌已过期或验证不正确」. Z.ai userinfo takes
  // the OAuth/JWT bearer, so keep its order.
  // bigmodel.cn userinfo only takes the OAuth business token — the
  // provisioned api-key answers 403 「APIKey not allow access」 and the zcode
  // JWT 401s. Z.ai userinfo takes the OAuth/JWT bearer, so keep its order.
  const bearer = resolved === 'bigmodel'
    ? trimmed(source?.oauthAccess) ?? trimmed(source?.accessToken) ?? trimmed(source?.zcodeJwt)
    : trimmed(source?.zcodeJwt) ?? trimmed(source?.oauthAccess) ?? trimmed(source?.accessToken)
  if (!bearer) return undefined
  const urls = resolved === 'bigmodel'
    ? [GLM_BIGMODEL_USERINFO_URL]
    : [GLM_USERINFO_URL, `${GLM_BIZ_BASE}/api/biz/customer/getCustomerInfo`]
  const headers = {
    authorization: `Bearer ${bearer}`,
    accept: 'application/json',
    ...glmDesktopHeaders(),
  }
  for (const url of urls) {
    try {
      const body = await getJson(url, headers, fetchFn)
      let data
      try {
        data = unwrapEnvelope(body, 'userinfo')
      } catch {
        data = body
      }
      const human = humanFromObject(data)
        ?? humanFromObject(data?.user)
        ?? humanFromObject(data?.profile)
        ?? humanFromObject(body)
      if (human) return human
    } catch {
      continue
    }
  }
  return undefined
}

export async function resolveGlmIdentity(source, { fetchFn = outboundFetch } = {}) {
  const fromHand = pickGlmHumanAccount(
    source?.email,
    source?.account,
    accountFromJwt(source?.zcodeJwt),
    accountFromJwt(source?.accessToken),
    accountFromJwt(source?.oauthAccess),
  )
  if (fromHand) return fromHand
  return fetchGlmUserinfo(source, { fetchFn, region: source?.region })
}

export function displayGlmAccount(session) {
  // displayName is the trusted resolved name (set by glmSession /
  // #resolveGlmIdentities from customerName / username / email). A letters+
  // digits username like xxww0098 is a real name, not an id — but a legacy
  // session.account can still hold poll user.id (dnarplz6), which is the same
  // pattern. Provenance, not pattern, separates them: displayName wins, and
  // session.account falls back through the strict opaque filter.
  return pickGlmName(session?.displayName)
    ?? pickGlmHumanAccount(
      session?.account,
      accountFromJwt(session?.zcodeJwt),
      accountFromJwt(session?.accessToken),
      accountFromJwt(session?.oauthAccess),
    )
}

export async function completeGlmCli(ready, { fetchFn = outboundFetch, region = 'zai' } = {}) {
  const resolved = normalizeGlmRegion(region)
  // Both regions chat with a provisioned Coding Plan api-key (`id.secret`). The
  // poll's OAuth business token passes auth on the Coding Plan hop but the
  // server cannot resolve a plan context for it and fails the forward with
  // `500 1234 网络错误` — the gateway answers 401 1002 first (issue #168,
  // 2026-09-30; `glmKeyFromZcodeCredentials` documented the same split for
  // imports). BigModel keeps the OAuth token only as `oauthAccess`
  // (userinfo/identity) and degrades back to it when minting fails, so
  // identity and quota survive with pre-fix chat behavior.
  let minted
  try {
    minted = await mintGlmCodingKey(ready.oauthAccess, { fetchFn, region: resolved })
  } catch (error) {
    if (resolved !== 'bigmodel' || !trimmed(ready.oauthAccess)) throw error
    minted = { apiKey: ready.oauthAccess }
  }
  if (!minted?.apiKey) throw new Error('glm key provisioning returned no apiKey')
  const account = await resolveGlmIdentity({
    email: ready.email,
    account: ready.account,
    accessToken: minted.apiKey,
    oauthAccess: ready.oauthAccess,
    zcodeJwt: ready.zcodeJwt,
    region: resolved,
  }, { fetchFn })
  return glmSession({
    accessToken: minted.apiKey,
    account,
    region: resolved,
    zcodeJwt: ready.zcodeJwt,
    oauthAccess: ready.oauthAccess,
    ...(minted.team ? { team: minted.team } : {}),
    ...(minted.plan ? { planType: minted.plan } : {}),
  })
}

/**
 * `id.secret` provisioned keys carry exactly one dot; provider JWTs are three
 * base64url segments. Spotting the JWT shape is how a stored BigModel bearer
 * from before the mint fix (issue #168) is recognized for re-minting.
 */
export function isGlmJwtShape(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim())
}

export async function refreshGlm(session) {
  return session
}

