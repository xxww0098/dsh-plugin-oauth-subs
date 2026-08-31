/**
 * Subscription quota:
 *   Codex  GET chatgpt.com/backend-api/wham/usage
 *          GET chatgpt.com/backend-api/wham/rate-limit-reset-credits
 *          POST …/rate-limit-reset-credits/consume
 *   Grok   GET cli-chat-proxy.grok.com/v1/billing?format=credits
 *          GET cli-chat-proxy.grok.com/v1/user?include=subscription
 *          POST grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
 *   Antigravity  POST daily-cloudcode-pa …/v1internal:loadCodeAssist
 *                POST daily-cloudcode-pa …/v1internal:fetchAvailableModels
 *                (SkillStar parse; hub host from #34 — prod only on 5xx / transport)
 *
 * Codex windows report used_percent; remaining is 100 − used.
 * Grok creditUsagePercent is also used-percent. Display remaining in the UI.
 * Unified-billing SuperGrok / X Premium+ payloads often omit that percent
 * on the CLI JSON; the grok.com gRPC-web path still has the weekly pool.
 */

import { randomUUID } from 'node:crypto'
import {
  CODEX_USAGE_URL,
  CODEX_RESET_CREDITS_URL,
  CODEX_RESET_CONSUME_URL,
  codexUpstreamHeaders,
} from './codex/index.js'
import {
  GROK_BILLING_URL,
  GROK_CLI_USER_URL,
  GROK_CREDITS_URL,
  GROK_CLIENT_VERSION,
  grokCreditsHeaders,
  grokTierFromValue,
  grokUpstreamHeaders,
} from './grok/index.js'
import { GROK_WEB_EMPTY_FRAME, decodeGrokCreditsFrame } from './grok/credits-frame.js'
import { formatPlanLabel, pickPlanRaw } from './plan.js'
import { glmQuotaUrl, glmToolUsageUrl, glmUpstreamHeaders } from './glm/index.js'
import {
  kiroEffectiveProfileArn,
  kiroUsageHeaders,
  kiroUsageRegions,
  kiroUsageUrl,
} from './kiro/index.js'
import { accountIdOf } from './store.js'
import {
  ANTIGRAVITY_LOAD_CODE_ASSIST_URL,
  ANTIGRAVITY_MODELS_URL,
  ANTIGRAVITY_QUOTA_GROUPS,
  antigravityLoadCodeAssistBody,
  antigravityLoadCodeAssistHeaders,
  antigravityPlanType,
  extractCloudaicompanionProject,
  fetchAntigravityCloudCode,
} from './antigravity/index.js'

export const QUOTA_TTL_MS = 60_000
export const QUOTA_TIMEOUT_MS = 10_000
const USED_RESET_STATUS = new Set(['redeemed', 'used', 'consumed', 'expired'])

export function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const next = Number(value)
    if (Number.isFinite(next)) return next
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if ('val' in value) return asNumber(value.val)
    if ('value' in value) return asNumber(value.value)
  }
  return undefined
}

function clampPct(value) {
  const n = asNumber(value)
  if (n === undefined) return undefined
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function creditBagAmounts(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const bag = creditBagAmounts(item)
      if (bag) return bag
    }
    return undefined
  }
  if (!value || typeof value !== 'object') return undefined
  const total = asNumber(value.total ?? value.limit ?? value.cap ?? value.allocation ?? value.amount)
  const used = asNumber(value.used ?? value.spent ?? value.consumed ?? value.usage)
  const remaining = asNumber(value.remaining ?? value.balance ?? value.left)
  if (total === undefined && used === undefined && remaining === undefined) {
    return creditBagAmounts(value.bags ?? value.items)
  }
  const resolvedUsed = used ?? (total !== undefined && remaining !== undefined ? Math.max(0, total - remaining) : undefined)
  const resolvedRemaining = remaining ?? (total !== undefined && resolvedUsed !== undefined ? Math.max(0, total - resolvedUsed) : undefined)
  return { used: resolvedUsed, total, remaining: resolvedRemaining }
}

function creditBagUsedPercent(value) {
  const bag = creditBagAmounts(value)
  if (!bag || bag.total === undefined || bag.total <= 0 || bag.used === undefined) return undefined
  return clampPct((bag.used / bag.total) * 100)
}

export function stampOf(value) {
  const n = asNumber(value)
  if (n !== undefined && n > 0) return n > 1e12 ? Math.round(n) : Math.round(n * 1000)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function resetAtOf(window) {
  const stamp = stampOf(
    window?.reset_at
    ?? window?.resetAt
    ?? window?.resets_at
    ?? window?.resetsAt
    ?? window?.reset_time
    ?? window?.resetTime,
  )
  if (stamp !== undefined) return stamp
  const after = asNumber(
    window?.reset_after_seconds
    ?? window?.resetAfterSeconds
    ?? window?.seconds_until_reset
    ?? window?.secondsUntilReset
    ?? window?.reset_after
    ?? window?.resetAfter,
  )
  if (after !== undefined && after >= 0) return Date.now() + after * 1000
  return undefined
}

function parseCodexWindow(window) {
  if (!window || typeof window !== 'object') return undefined
  const usedPercent = clampPct(window.used_percent ?? window.usedPercent ?? 0) ?? 0
  const seconds = asNumber(window.limit_window_seconds ?? window.limitWindowSeconds)
  return {
    usedPercent,
    remainingPercent: 100 - usedPercent,
    windowMinutes: seconds !== undefined && seconds > 0 ? Math.floor((seconds + 59) / 60) : undefined,
    resetAt: resetAtOf(window),
  }
}

export function parseCodexUsage(payload) {
  if (!payload || typeof payload !== 'object') return { rows: [] }
  const rate = payload.rate_limit ?? payload.rateLimit
  const primary = parseCodexWindow(rate?.primary_window ?? rate?.primaryWindow)
  const secondary = parseCodexWindow(rate?.secondary_window ?? rate?.secondaryWindow)
  const rows = []
  if (primary) {
    rows.push({
      key: 'primary',
      kind: 'primary',
      usedPercent: primary.usedPercent,
      remainingPercent: primary.remainingPercent,
      windowMinutes: primary.windowMinutes,
      resetAt: primary.resetAt,
    })
  }
  if (secondary) {
    rows.push({
      key: 'weekly',
      kind: 'weekly',
      usedPercent: secondary.usedPercent,
      remainingPercent: secondary.remainingPercent,
      windowMinutes: secondary.windowMinutes,
      resetAt: secondary.resetAt,
    })
  }
  const planType = typeof payload.plan_type === 'string' && payload.plan_type
    ? payload.plan_type
    : typeof payload.planType === 'string' ? payload.planType : undefined
  return { planType, rows }
}

function parseResetCredit(item) {
  if (!item || typeof item !== 'object') return undefined
  const rawStatus = typeof item.status === 'string'
    ? item.status
    : typeof item.state === 'string' ? item.state : undefined
  const expiresAt = stampOf(item.expires_at ?? item.expire_at ?? item.expiresAt)
  let status = rawStatus ? rawStatus.trim().toLowerCase() : undefined
  if (!status && expiresAt !== undefined && expiresAt <= Date.now()) status = 'expired'
  const id = item.id ?? item.credit_id ?? item.creditId
  return {
    id: typeof id === 'string' && id.length > 0 ? id : undefined,
    status,
    expiresAt,
  }
}

export function isAvailableResetCredit(credit) {
  if (!credit) return false
  const status = (credit.status ?? 'available').trim().toLowerCase()
  if (USED_RESET_STATUS.has(status)) return false
  if (credit.expiresAt !== undefined) return credit.expiresAt > Date.now()
  return true
}

export function parseResetCredits(payload) {
  if (!payload || typeof payload !== 'object') {
    return { availableCount: 0, credits: [] }
  }
  const nested = payload.data && typeof payload.data === 'object' ? payload.data : undefined
  const rawCredits = payload.credits ?? nested?.credits
  const credits = Array.isArray(rawCredits)
    ? rawCredits.map(parseResetCredit).filter(Boolean)
    : []
  const listed = asNumber(
    payload.available_count
    ?? payload.availableCount
    ?? nested?.available_count
    ?? nested?.availableCount,
  )
  const availableCount = listed !== undefined
    ? Math.max(0, Math.round(listed))
    : credits.filter(isAvailableResetCredit).length
  const listedExpiry = stampOf(
    payload.expires_at
    ?? payload.expire_at
    ?? payload.next_expire_at
    ?? payload.nextExpiresAt
    ?? nested?.expires_at
    ?? nested?.next_expire_at,
  )
  const fromCredits = credits
    .filter(isAvailableResetCredit)
    .map((credit) => credit.expiresAt)
    .filter((stamp) => typeof stamp === 'number')
    .sort((a, b) => a - b)[0]
  const nextExpiresAt = fromCredits ?? listedExpiry
  return {
    availableCount,
    credits,
    ...(nextExpiresAt === undefined ? {} : { nextExpiresAt }),
  }
}

function publicResetCredits(value) {
  if (!value) return { availableCount: 0, credits: [] }
  const available = (value.credits ?? []).filter(isAvailableResetCredit).map((credit) => ({
    id: credit.id,
    expiresAt: credit.expiresAt,
  }))
  const nextExpiresAt = value.nextExpiresAt
  let credits = available
  if (credits.length === 0 && (value.availableCount ?? 0) > 0) {
    const count = Math.max(0, Math.round(value.availableCount))
    credits = Array.from({ length: count }, (_, index) => ({
      id: `available-${index + 1}`,
      expiresAt: nextExpiresAt,
    }))
  }
  return {
    availableCount: value.availableCount ?? credits.length,
    credits,
    ...(nextExpiresAt === undefined ? {} : { nextExpiresAt }),
  }
}

function creditUsageSources(billing, config) {
  return [
    billing?.credits,
    billing?.creditBalance,
    billing?.usage,
    config?.credits,
    config?.includedCredits,
    config?.subscriptionCredits,
    config?.weeklyCredits,
    config?.sharedPool,
  ]
}

function grokOnDemandBag(billing, config) {
  const used = asNumber(
    config.onDemandUsed
    ?? config.on_demand_used
    ?? billing.onDemandUsed
    ?? billing.on_demand_used,
  )
  const total = asNumber(
    config.onDemandCap
    ?? config.on_demand_cap
    ?? billing.onDemandCap
    ?? billing.on_demand_cap,
  )
  if (used === undefined && total === undefined) return undefined
  const remaining = total !== undefined && used !== undefined ? Math.max(0, total - used) : undefined
  return { used, total, remaining }
}

function grokMonthlyBag(billing, config) {
  const used = asNumber(
    config.used
    ?? billing.usage?.includedUsed
    ?? billing.usage?.totalUsed
    ?? billing.includedUsed,
  )
  const total = asNumber(
    config.monthlyLimit
    ?? config.monthly_limit
    ?? billing.monthlyLimit
    ?? billing.monthly_limit,
  )
  if (total === undefined || total <= 0) return undefined
  const remaining = used !== undefined ? Math.max(0, total - used) : undefined
  return { used, total, remaining }
}

function grokWindowKind(periodType) {
  const text = String(periodType ?? '')
  if (/month/i.test(text)) return 'cycle'
  return 'weekly'
}

function productRow(item) {
  if (!item || typeof item !== 'object') return undefined
  const product = item.product ?? item.name ?? item.productName
  if (typeof product !== 'string' || product.length === 0) return undefined
  const bag = creditBagAmounts(item) ?? {}
  const usedPercent = clampPct(item.usagePercent ?? item.usedPercent ?? item.usage_percent)
    ?? (bag.total > 0 && bag.used !== undefined ? clampPct((bag.used / bag.total) * 100) : undefined)
  if (usedPercent === undefined && bag.used === undefined && bag.total === undefined) return undefined
  const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent
  return {
    key: `product:${product}`,
    kind: 'product',
    product,
    usedPercent,
    remainingPercent,
    used: bag.used,
    total: bag.total,
    remaining: bag.remaining,
  }
}

function userPayload(cliUser) {
  if (!cliUser || typeof cliUser !== 'object') return {}
  return cliUser.user ?? cliUser.profile ?? cliUser
}

function periodResetAt(end) {
  if (typeof end !== 'string' || end.length === 0) return undefined
  const stamp = Date.parse(end)
  return Number.isFinite(stamp) ? stamp : undefined
}

export function parseGrokBilling(billing, { cliUser } = {}) {
  if (!billing || typeof billing !== 'object') return { rows: [] }
  const config = billing.config && typeof billing.config === 'object' ? billing.config : billing
  const period = config.currentPeriod && typeof config.currentPeriod === 'object'
    ? config.currentPeriod
    : config.current_period && typeof config.current_period === 'object'
      ? config.current_period
      : {}
  const user = userPayload(cliUser)
  const subscription = user.subscription ?? cliUser?.subscription ?? config.subscription
  const subscriptionTier = formatPlanLabel(grokTierFromValue(pickPlanRaw(
    config.subscription_tier,
    config.subscriptionTier,
    billing.subscription_tier,
    billing.subscriptionTier,
    subscription?.tier,
    user.subscriptionTier,
    user.subscription_tier,
  )))
  const subscriptionStatus = typeof subscription?.status === 'string' ? subscription.status : undefined
  const hasGrokCodeAccess = user.hasGrokCodeAccess ?? user.has_grok_code_access ?? cliUser?.hasGrokCodeAccess

  let usedPercent = clampPct(config.creditUsagePercent ?? config.credit_usage_percent)
  const onDemand = grokOnDemandBag(billing, config)
  const monthly = grokMonthlyBag(billing, config)
  const amounts = creditUsageSources(billing, config)
    .map((source) => (source === undefined ? undefined : creditBagAmounts(source)))
    .find((bag) => bag && (bag.used !== undefined || bag.total !== undefined))
    ?? onDemand
    ?? monthly
  if (usedPercent === undefined && amounts) usedPercent = creditBagUsedPercent(amounts) ?? undefined
  const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent
  const periodType = typeof period.type === 'string'
    ? period.type
    : typeof period.periodType === 'string'
      ? period.periodType
      : undefined
  const resetAt = periodResetAt(period.end ?? config.billingPeriodEnd ?? config.billing_period_end)

  const rows = []
  if (usedPercent !== undefined || amounts?.used !== undefined || amounts?.total !== undefined) {
    rows.push({
      key: grokWindowKind(periodType) === 'weekly' ? 'weekly' : 'cycle',
      kind: grokWindowKind(periodType),
      usedPercent,
      remainingPercent,
      used: amounts?.used,
      total: amounts?.total,
      remaining: amounts?.remaining,
      resetAt,
      periodType,
      periodStart: typeof period.start === 'string' ? period.start : config.billingPeriodStart,
      periodEnd: typeof period.end === 'string' ? period.end : config.billingPeriodEnd,
    })
  }
  const prepaid = asNumber(
    config.prepaidBalance
    ?? config.prepaid_balance
    ?? billing.prepaidBalance
    ?? billing.prepaid_balance,
  )
  if (prepaid !== undefined && prepaid > 0) {
    rows.push({ key: 'prepaid', kind: 'prepaid', remaining: prepaid })
  }
  const products = Array.isArray(config.productUsage)
    ? config.productUsage
    : Array.isArray(config.product_usage)
      ? config.product_usage
      : []
  for (const item of products.slice(0, 4)) {
    const row = productRow(item)
    if (row) rows.push(row)
  }

  return {
    planType: subscriptionTier,
    subscriptionStatus,
    hasGrokCodeAccess: typeof hasGrokCodeAccess === 'boolean' ? hasGrokCodeAccess : undefined,
    rows,
  }
}

export function applyGrokCreditsSnapshot(parsed, snapshot) {
  const base = parsed && typeof parsed === 'object' ? parsed : { rows: [] }
  const rows = Array.isArray(base.rows) ? [...base.rows] : []
  if (!snapshot || typeof snapshot !== 'object') return { ...base, rows }
  const idx = rows.findIndex((row) => row.kind === 'cycle' || row.kind === 'weekly')
  const current = idx >= 0 ? rows[idx] : undefined
  if (current?.usedPercent !== undefined) {
    if (current.resetAt === undefined && snapshot.resetAt !== undefined) {
      rows[idx] = { ...current, resetAt: snapshot.resetAt }
    }
    return { ...base, rows }
  }
  if (snapshot.usedPercent === undefined && snapshot.resetAt === undefined) return { ...base, rows }
  const usedPercent = snapshot.usedPercent
  const next = {
    key: 'weekly',
    kind: 'weekly',
    usedPercent,
    remainingPercent: usedPercent === undefined ? undefined : 100 - usedPercent,
    resetAt: snapshot.resetAt ?? current?.resetAt,
    periodType: current?.periodType ?? 'USAGE_PERIOD_TYPE_WEEKLY',
    periodStart: current?.periodStart,
    periodEnd: current?.periodEnd,
    used: current?.used,
    total: current?.total,
    remaining: current?.remaining,
  }
  if (idx >= 0) rows[idx] = { ...current, ...next }
  else rows.unshift(next)
  return { ...base, rows }
}

function glmKindBlob(item) {
  return [
    item?.type,
    item?.limitType,
    item?.name,
    item?.showName,
    item?.show_name,
    item?.duration,
    item?.window,
    item?.timeUnit,
    item?.period,
    item?.product,
    item?.kind,
    item?.category,
    item?.quotaType,
  ].filter((part) => part != null && String(part).trim()).join(' ')
}

function glmDetailsLookLikeMcp(item) {
  const details = item?.usageDetails ?? item?.usage_details ?? item?.tools
  if (!Array.isArray(details)) return false
  return details.some((row) => /search-prime|web-reader|zread|mcp|web.?search/i.test(String(row?.modelCode ?? row?.name ?? row?.product ?? '')))
}

export function glmWindowKind(item) {
  if (!item || typeof item !== 'object') return 'cycle'
  const text = glmKindBlob(item)
  const unit = asNumber(item.unit)
  const number = asNumber(item.number)
  if (/mcp|zread|web.?search|web.?reader|search-prime|time_limit|\btools?\b/i.test(text) || glmDetailsLookLikeMcp(item)) {
    return 'mcp'
  }
  if (unit === 5) return 'mcp'
  if (/week|7d|weekly/i.test(text)) return 'weekly'
  if (unit === 6 && (number === 1 || number === 7)) return 'weekly'
  if (/5h|5\s*hour|five.?hour|primary/i.test(text)) return 'primary'
  if (unit === 3 && number === 5) return 'primary'
  if (/credit_limit|tokens_limit|credit/i.test(text)) {
    const total = asNumber(item.usage ?? item.total ?? item.limit ?? item.amount)
    if (total === 10_000 || total === 60_000 || total === 140_000) return 'weekly'
    return 'primary'
  }
  return 'cycle'
}

function glmWindowKey(kind, type, window) {
  if (kind === 'primary' || kind === 'weekly' || kind === 'mcp') return kind
  const slug = String(window ?? type ?? 'limit').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `glm:${slug}`
}

function glmItemBag(item) {
  const total = asNumber(item.usage ?? item.total ?? item.limit ?? item.amount)
  const used = asNumber(item.currentValue ?? item.used ?? item.spend ?? item.consumed)
  const remaining = asNumber(item.remaining)
    ?? (total !== undefined && used !== undefined ? Math.max(0, total - used) : undefined)
  if (total !== undefined || used !== undefined || remaining !== undefined) {
    return { used, total, remaining }
  }
  const details = item.usageDetails ?? item.usage_details
  if (Array.isArray(details) && details.length > 0) {
    let detailUsed = 0
    let saw = false
    for (const row of details) {
      const amount = asNumber(row?.usage ?? row?.used ?? row?.currentValue)
      if (amount !== undefined) {
        detailUsed += amount
        saw = true
      }
    }
    if (saw) return { used: detailUsed, total: undefined, remaining: undefined }
  }
  return undefined
}

function preferGlmRow(previous, next) {
  if (!previous) return next
  const prevUsed = previous.used ?? 0
  const nextUsed = next.used ?? 0
  if (nextUsed > prevUsed) return next
  if (previous.total === undefined && next.total !== undefined) return next
  return previous
}

function finalizeGlmRows(rows) {
  const byKind = new Map()
  for (const row of rows) {
    const kind = row.kind === 'product' && /mcp|zread|web.?search/i.test(row.product ?? '')
      ? 'mcp'
      : row.kind
    const next = kind === row.kind ? row : { ...row, kind, key: 'mcp', product: row.product ?? 'ZCode MCP' }
    byKind.set(kind, preferGlmRow(byKind.get(kind), next))
  }
  const ordered = []
  for (const kind of ['primary', 'weekly', 'mcp']) {
    const row = byKind.get(kind)
    if (row) ordered.push({ ...row, key: kind, kind })
  }
  return ordered
}

function glmRowFromItem(item) {
  const bag = glmItemBag(item)
  if (!bag) {
    const usedPercent = clampPct(item.percentage ?? item.usedPercent ?? item.used_percent)
    if (usedPercent === undefined) return undefined
    const kind = glmWindowKind(item)
    return {
      key: glmWindowKey(kind, item.type, item.duration ?? item.window),
      kind,
      usedPercent,
      remainingPercent: 100 - usedPercent,
      resetAt: stampOf(item.resetAt ?? item.reset_at ?? item.nextResetAt ?? item.nextResetTime ?? item.expireAt),
    }
  }
  const usedPercent = clampPct(item.percentage ?? item.usedPercent ?? item.used_percent)
    ?? (bag.total > 0 && bag.used !== undefined ? clampPct((bag.used / bag.total) * 100) : undefined)
  const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent
  const kind = glmWindowKind(item)
  return {
    key: glmWindowKey(kind, item.type, item.duration ?? item.window),
    kind,
    usedPercent,
    remainingPercent,
    used: bag.used,
    total: bag.total,
    remaining: bag.remaining,
    resetAt: stampOf(item.resetAt ?? item.reset_at ?? item.nextResetAt ?? item.nextResetTime ?? item.expireAt),
    ...(kind === 'mcp' ? { product: 'ZCode MCP' } : {}),
  }
}

function collectGlmItems(root) {
  const primary = root.list ?? root.limits ?? root.items ?? root.quotaLimits ?? root.quota_limits ?? root.balances
  const items = Array.isArray(primary) ? [...primary] : []
  const mcpBag = root.mcp ?? root.mcpQuota ?? root.monthlyMCP ?? root.monthlyMCPUsage ?? root.toolUsage ?? root.tools
  if (mcpBag && typeof mcpBag === 'object' && !Array.isArray(mcpBag)) {
    items.push({ type: 'TIME_LIMIT', ...mcpBag })
  }
  return items
}

export function parseGlmQuota(payload) {
  const root = payload?.data && typeof payload.data === 'object' ? payload.data : payload
  if (!root || typeof root !== 'object') return { rows: [] }
  const planType = formatPlanLabel(pickPlanRaw(root.level, root.planType, root.plan, root.subscriptionLevel), 'glm')
  const rows = []
  for (const item of collectGlmItems(root)) {
    if (!item || typeof item !== 'object') continue
    const row = glmRowFromItem(item)
    if (row) rows.push(row)
  }
  if (rows.length === 0) {
    const bag = creditBagAmounts(root.credits ?? root)
    if (bag && (bag.used !== undefined || bag.total !== undefined || bag.remaining !== undefined)) {
      const usedPercent = creditBagUsedPercent(bag)
      rows.push({
        key: 'primary',
        kind: 'primary',
        usedPercent,
        remainingPercent: usedPercent === undefined ? undefined : 100 - usedPercent,
        used: bag.used,
        total: bag.total,
        remaining: bag.remaining,
      })
    }
  }
  return { planType, rows: finalizeGlmRows(rows) }
}

export function mergeGlmToolUsage(parsed, toolPayload) {
  const base = parsed && typeof parsed === 'object' ? parsed : { rows: [] }
  const rows = Array.isArray(base.rows) ? [...base.rows] : []
  if (rows.some((row) => row.kind === 'mcp')) return { ...base, rows: finalizeGlmRows(rows) }
  const extra = parseGlmQuota(toolPayload)
  const mcp = extra.rows.find((row) => row.kind === 'mcp')
  if (!mcp) return { ...base, rows: finalizeGlmRows(rows) }
  return { ...base, rows: finalizeGlmRows([...rows, mcp]) }
}

export function parseKiroUsage(payload) {
  if (!payload || typeof payload !== 'object') return { rows: [] }
  const info = payload.subscriptionInfo ?? payload.subscription_info ?? {}
  const user = payload.userInfo ?? payload.user_info ?? {}
  const list = payload.usageBreakdownList ?? payload.usage_breakdown_list ?? []
  const planType = pickPlanRaw(info.subscriptionTitle, info.subscription_title, payload.planType)
  const email = typeof user.email === 'string' && user.email.trim() ? user.email.trim() : undefined
  const breakdown = Array.isArray(list) ? list[0] : undefined
  if (!breakdown || typeof breakdown !== 'object') {
    return { planType, account: email, rows: [] }
  }
  let used = asNumber(
    breakdown.currentUsageWithPrecision
    ?? breakdown.current_usage_with_precision
    ?? breakdown.currentUsage
    ?? breakdown.current_usage,
  ) ?? 0
  let total = asNumber(
    breakdown.usageLimitWithPrecision
    ?? breakdown.usage_limit_with_precision
    ?? breakdown.usageLimit
    ?? breakdown.usage_limit,
  ) ?? 0
  const trial = breakdown.freeTrialInfo ?? breakdown.free_trial_info
  const trialStatus = String(trial?.freeTrialStatus ?? trial?.free_trial_status ?? '').toUpperCase()
  if (trial && trialStatus === 'ACTIVE') {
    used += asNumber(trial.currentUsageWithPrecision ?? trial.current_usage_with_precision ?? trial.currentUsage) ?? 0
    total += asNumber(trial.usageLimitWithPrecision ?? trial.usage_limit_with_precision ?? trial.usageLimit) ?? 0
  }
  for (const bonus of Array.isArray(breakdown.bonuses) ? breakdown.bonuses : []) {
    if (String(bonus?.status ?? '').toUpperCase() !== 'ACTIVE') continue
    used += asNumber(bonus.currentUsage ?? bonus.current_usage) ?? 0
    total += asNumber(bonus.usageLimit ?? bonus.usage_limit) ?? 0
  }
  const usedPercent = total > 0 ? clampPct((used / total) * 100) : undefined
  const resetAt = stampOf(
    breakdown.nextDateReset
    ?? breakdown.next_date_reset
    ?? payload.nextDateReset
    ?? payload.next_date_reset,
  )
  return {
    planType,
    account: email,
    rows: [{
      key: 'cycle',
      kind: 'cycle',
      usedPercent,
      remainingPercent: usedPercent === undefined ? undefined : 100 - usedPercent,
      used,
      total,
      remaining: total > 0 ? Math.max(0, total - used) : undefined,
      resetAt,
    }],
  }
}

export async function fetchGlmQuota(session, fetchFn = fetch) {
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const response = await fetchFn(glmQuotaUrl(session.region), {
      method: 'GET',
      headers: glmUpstreamHeaders(session),
      signal: wait.signal,
    })
    const parsed = parseGlmQuota(await readJson(response, 'glm quota'))
    if (parsed.rows.some((row) => row.kind === 'mcp')) return parsed
    const toolsWait = timeoutSignal(QUOTA_TIMEOUT_MS)
    try {
      const tools = await fetchFn(glmToolUsageUrl(session.region), {
        method: 'GET',
        headers: glmUpstreamHeaders(session),
        signal: toolsWait.signal,
      })
      return mergeGlmToolUsage(parsed, await readJson(tools, 'glm tool usage'))
    } catch {
      return parsed
    } finally {
      toolsWait.cancel()
    }
  } finally {
    wait.cancel()
  }
}

function kiroUsageAttempts(session) {
  const arn = kiroEffectiveProfileArn(session)
  const attempts = []
  for (const region of kiroUsageRegions(session)) {
    if (arn) attempts.push({ region, profileArn: arn })
    attempts.push({ region, profileArn: undefined })
  }
  return attempts
}

function antigravityModelsMap(payload) {
  if (!payload || typeof payload !== 'object') return undefined
  const models = payload.models
  if (models && typeof models === 'object' && !Array.isArray(models)) return models
  if (!Array.isArray(payload)) return payload
  return undefined
}

function findAntigravityModel(models, identifier) {
  if (Object.prototype.hasOwnProperty.call(models, identifier)) {
    return { id: identifier, entry: models[identifier] }
  }
  for (const [id, entry] of Object.entries(models)) {
    const display = entry && typeof entry === 'object' ? entry.displayName : undefined
    if (typeof display === 'string' && display.toLowerCase() === identifier.toLowerCase()) {
      return { id, entry }
    }
  }
  return undefined
}

function normalizeQuotaFraction(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (!raw) return undefined
  if (raw.endsWith('%')) {
    const parsed = Number(raw.slice(0, -1).trim())
    return Number.isFinite(parsed) ? parsed / 100 : undefined
  }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function antigravityQuotaInfo(entry) {
  if (!entry || typeof entry !== 'object') return undefined
  const info = entry.quotaInfo ?? entry.quota_info
  return info && typeof info === 'object' ? info : undefined
}

function buildAntigravityQuotaRow(models, group) {
  const samples = []
  let displayName
  for (const identifier of group.identifiers) {
    const found = findAntigravityModel(models, identifier)
    if (!found) continue
    const info = antigravityQuotaInfo(found.entry)
    const remaining = normalizeQuotaFraction(
      info?.remainingFraction ?? info?.remaining_fraction ?? info?.remaining,
    )
    const stamp = resetAtOf(info)
    const hasReset = stamp !== undefined
    const fraction = remaining ?? (hasReset ? 0 : undefined)
    if (fraction === undefined) return undefined
    samples.push({ fraction, stamp })
    if (displayName === undefined) {
      const name = found.entry?.displayName
      if (typeof name === 'string' && name.trim()) displayName = name.trim()
    }
  }
  if (samples.length === 0) return undefined
  const remaining = samples.reduce((lowest, next) => Math.min(lowest, next.fraction), 1)
  const remainingPercent = clampPct(remaining * 100) ?? 0
  const usedPercent = Math.max(0, Math.min(100, 100 - remainingPercent))
  const product = group.labelFromModel ? (displayName ?? group.label) : group.label
  const atFloor = samples.filter((sample) => sample.fraction === remaining)
  const resetAt = soonestReset(atFloor) ?? soonestReset(samples)
  return {
    key: `product:${product}`,
    kind: 'product',
    product,
    usedPercent,
    remainingPercent,
    ...(resetAt === undefined ? {} : { resetAt }),
  }
}

function soonestReset(samples) {
  const stamps = samples.map((sample) => sample.stamp).filter((stamp) => typeof stamp === 'number')
  return stamps.length > 0 ? Math.min(...stamps) : undefined
}

/** SkillStar `parse_model_windows` — group fetchAvailableModels into product bars. */
export function parseAntigravityModelQuota(payload) {
  const models = antigravityModelsMap(payload)
  if (!models) return { rows: [] }
  const rows = []
  for (const group of ANTIGRAVITY_QUOTA_GROUPS) {
    const row = buildAntigravityQuotaRow(models, group)
    if (row) rows.push(row)
  }
  return { rows }
}

export function parseAntigravityPaidCredits(payload) {
  const credits = payload?.paidTier?.availableCredits ?? payload?.paid_tier?.availableCredits
  if (!Array.isArray(credits)) return []
  const rows = []
  for (const entry of credits) {
    if (!entry || typeof entry !== 'object') continue
    const creditType = entry.creditType ?? entry.credit_type
    if (typeof creditType !== 'string' || !creditType.trim()) continue
    const remaining = asNumber(entry.creditAmount ?? entry.credit_amount)
    if (remaining === undefined) continue
    rows.push({
      key: `prepaid:${creditType.trim()}`,
      kind: 'prepaid',
      remaining,
    })
  }
  return rows
}

export function pickAntigravityPlanName(payload) {
  if (!payload || typeof payload !== 'object') return undefined
  const fromTiers = antigravityPlanType(payload)
  if (fromTiers) return fromTiers
  const tiers = Array.isArray(payload.allowedTiers) ? payload.allowedTiers : []
  const fallback = tiers.find((entry) => entry?.isDefault) ?? tiers[0]
  const id = fallback?.id
  return typeof id === 'string' && id.trim() ? id.trim() : undefined
}

function isQuotaHttpStatus(error, status) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes(`HTTP ${status}`) || (status === 400 && /bad request/i.test(message))
}

async function loadAntigravityCodeAssistForQuota(session, fetchFn) {
  const cached = typeof session.projectId === 'string' ? session.projectId : undefined
  const post = async (projectId) => {
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
    try {
      const response = await fetchAntigravityCloudCode(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, {
        method: 'POST',
        headers: antigravityLoadCodeAssistHeaders(session.accessToken),
        body: JSON.stringify(antigravityLoadCodeAssistBody(projectId)),
        signal: wait.signal,
      }, fetchFn)
      return await readJson(response, 'antigravity loadCodeAssist')
    } finally {
      wait.cancel()
    }
  }
  try {
    return await post(cached)
  } catch (error) {
    if (isQuotaHttpStatus(error, 401)) throw error
    if (cached && isQuotaHttpStatus(error, 400)) return post(undefined)
    throw error
  }
}

async function fetchAntigravityModelWindows(accessToken, projectId, fetchFn) {
  const payload = projectId ? { project: projectId } : {}
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const response = await fetchAntigravityCloudCode(ANTIGRAVITY_MODELS_URL, {
      method: 'POST',
      headers: antigravityLoadCodeAssistHeaders(accessToken),
      body: JSON.stringify(payload),
      signal: wait.signal,
    }, fetchFn)
    if (response.status === 401) {
      const text = await response.text()
      throw new Error(`antigravity fetchAvailableModels failed (HTTP 401)${text ? `: ${text.slice(0, 180)}` : ''}`)
    }
    if (!response.ok) {
      throw new Error(`antigravity fetchAvailableModels failed (HTTP ${response.status})`)
    }
    return parseAntigravityModelQuota(await readJson(response, 'antigravity fetchAvailableModels')).rows
  } finally {
    wait.cancel()
  }
}

export async function fetchAntigravityQuota(session, fetchFn = fetch) {
  const load = await loadAntigravityCodeAssistForQuota(session, fetchFn)
  const projectId = extractCloudaicompanionProject(load)
    ?? (typeof session.projectId === 'string' && session.projectId.trim() ? session.projectId.trim() : undefined)
  const rows = await fetchAntigravityModelWindows(session.accessToken, projectId, fetchFn)
  const credits = parseAntigravityPaidCredits(load)
  const planType = antigravityPlanType(load)
    ?? pickAntigravityPlanName(load)
    ?? (typeof session.planType === 'string' && session.planType.trim() ? session.planType.trim() : undefined)
  return { planType, rows: [...rows, ...credits] }
}

export async function fetchKiroQuota(session, fetchFn = fetch) {
  const attempts = kiroUsageAttempts(session)
  let lastError
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index]
    const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
    try {
      const response = await fetchFn(kiroUsageUrl(attempt.region, attempt.profileArn), {
        method: 'GET',
        headers: kiroUsageHeaders(session),
        signal: wait.signal,
      })
      if (response.ok) {
        return parseKiroUsage(await readJson(response, 'kiro usage'))
      }
      const text = await response.text()
      lastError = new Error(`kiro usage failed (HTTP ${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`)
      if (response.status === 403 && index + 1 < attempts.length) continue
      throw lastError
    } finally {
      wait.cancel()
    }
  }
  throw lastError ?? new Error('kiro usage failed')
}

function grokQuotaHeaders(session) {
  return {
    ...grokUpstreamHeaders(session),
    'x-grok-client-version': GROK_CLIENT_VERSION,
    'x-grok-cli-version': GROK_CLIENT_VERSION,
    'x-grok-client-surface': 'grok-cli',
    'x-grok-client-identifier': 'dsh-plugin-oauth-subs',
  }
}

function timeoutSignal(ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  if (typeof timer.unref === 'function') timer.unref()
  return { signal: controller.signal, cancel: () => clearTimeout(timer) }
}

async function readJson(response, label) {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 180)}` : ''}`)
  }
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} returned non-JSON`)
  }
}

export async function fetchCodexQuota(session, fetchFn = fetch) {
  const headers = codexUpstreamHeaders(session)
  const usageWait = timeoutSignal(QUOTA_TIMEOUT_MS)
  const resetWait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const [usageResult, resetResult] = await Promise.allSettled([
      fetchFn(CODEX_USAGE_URL, { method: 'GET', headers, signal: usageWait.signal })
        .then((response) => readJson(response, 'codex usage')),
      fetchFn(CODEX_RESET_CREDITS_URL, { method: 'GET', headers, signal: resetWait.signal })
        .then((response) => readJson(response, 'codex reset credits')),
    ])
    if (usageResult.status === 'rejected') throw usageResult.reason
    const parsed = parseCodexUsage(usageResult.value)
    const embedded = usageResult.value?.rate_limit_reset_credits ?? usageResult.value?.rateLimitResetCredits
    const resetCredits = resetResult.status === 'fulfilled'
      ? parseResetCredits(resetResult.value)
      : embedded
        ? parseResetCredits(embedded)
        : { availableCount: 0, credits: [] }
    return { ...parsed, resetCredits }
  } finally {
    usageWait.cancel()
    resetWait.cancel()
  }
}

export function consumeResetBody(redeemRequestId) {
  return {
    redeem_request_id: redeemRequestId,
    idempotencyKey: redeemRequestId,
  }
}

export async function consumeCodexReset(session, fetchFn = fetch) {
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  const redeemRequestId = randomUUID()
  try {
    const response = await fetchFn(CODEX_RESET_CONSUME_URL, {
      method: 'POST',
      headers: {
        ...codexUpstreamHeaders(session),
        'content-type': 'application/json',
      },
      body: JSON.stringify(consumeResetBody(redeemRequestId)),
      signal: wait.signal,
    })
    await readJson(response, 'codex reset consume')
    return { ok: true, redeemRequestId }
  } finally {
    wait.cancel()
  }
}

export async function fetchGrokQuota(session, fetchFn = fetch) {
  const headers = grokQuotaHeaders(session)
  const billingWait = timeoutSignal(QUOTA_TIMEOUT_MS)
  const userWait = timeoutSignal(QUOTA_TIMEOUT_MS)
  const creditsWait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const [billingResult, userResult, creditsResult] = await Promise.allSettled([
      fetchFn(GROK_BILLING_URL, { method: 'GET', headers, signal: billingWait.signal })
        .then((response) => readJson(response, 'grok billing')),
      fetchFn(GROK_CLI_USER_URL, { method: 'GET', headers, signal: userWait.signal })
        .then((response) => readJson(response, 'grok user')),
      fetchFn(GROK_CREDITS_URL, {
        method: 'POST',
        headers: grokCreditsHeaders(session),
        body: GROK_WEB_EMPTY_FRAME,
        signal: creditsWait.signal,
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`grok credits failed (HTTP ${response.status})`)
        }
        const decoded = decodeGrokCreditsFrame(Buffer.from(await response.arrayBuffer()))
        if (!decoded) throw new Error('grok credits returned no usage')
        return decoded
      }),
    ])
    if (billingResult.status === 'rejected' && creditsResult.status === 'rejected') {
      throw billingResult.reason
    }
    const billing = billingResult.status === 'fulfilled' ? billingResult.value : {}
    const cliUser = userResult.status === 'fulfilled' ? userResult.value : undefined
    const snapshot = creditsResult.status === 'fulfilled' ? creditsResult.value : undefined
    return applyGrokCreditsSnapshot(parseGrokBilling(billing, { cliUser }), snapshot)
  } finally {
    billingWait.cancel()
    userWait.cancel()
    creditsWait.cancel()
  }
}

function quotaCacheKey(provider, accountId) {
  return accountId ? `${provider}\0${accountId}` : provider
}

function publicQuota(entry, provider) {
  if (!entry) return { status: 'idle' }
  return {
    status: entry.status,
    planType: entry.planType,
    planLabel: formatPlanLabel(entry.planType, provider),
    account: entry.account,
    subscriptionStatus: entry.subscriptionStatus,
    hasGrokCodeAccess: entry.hasGrokCodeAccess,
    updatedAt: entry.updatedAt,
    error: entry.error,
    rows: entry.rows ?? [],
    resetCredits: publicResetCredits(entry.resetCredits),
  }
}

export class QuotaStore {
  constructor({ tokens, fetchFn = fetch, ttlMs = QUOTA_TTL_MS } = {}) {
    this.tokens = tokens
    this.fetchFn = fetchFn
    this.ttlMs = ttlMs
    this.cache = new Map()
    this.inflight = new Map()
  }

  peek(provider, accountId) {
    if (accountId) return publicQuota(this.cache.get(quotaCacheKey(provider, accountId)), provider)
    const exact = this.cache.get(provider)
    if (exact) return publicQuota(exact, provider)
    for (const [key, entry] of this.cache) {
      if (key.startsWith(`${provider}\0`)) return publicQuota(entry, provider)
    }
    return publicQuota()
  }

  clear(provider, accountId) {
    if (!provider) {
      this.cache.clear()
      return
    }
    if (accountId) {
      this.cache.delete(quotaCacheKey(provider, accountId))
      this.cache.delete(provider)
      return
    }
    this.cache.delete(provider)
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(`${provider}\0`)) this.cache.delete(key)
    }
  }

  async ensure(provider, accountId, session) {
    const live = session ?? await this.#activeSession(provider)
    const id = accountId ?? (live ? accountIdOf(provider, live) : undefined)
    const key = quotaCacheKey(provider, id)
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.updatedAt < this.ttlMs) {
      return publicQuota(cached, provider)
    }
    if (cached && cached.status === 'ready') {
      void this.refresh(provider, id, live)
      return publicQuota(cached, provider)
    }
    return this.refresh(provider, id, live)
  }

  async refresh(provider, accountId, session) {
    const live = session ?? await this.#activeSession(provider)
    const id = accountId ?? (live ? accountIdOf(provider, live) : undefined)
    const key = quotaCacheKey(provider, id)
    const pending = this.inflight.get(key)
    if (pending) return pending
    const run = this.#load(provider, id, live).finally(() => this.inflight.delete(key))
    this.inflight.set(key, run)
    return run
  }

  async consume(provider, accountId, session) {
    if (provider !== 'codex') throw new Error('only ChatGPT Codex can reset quota')
    const live = session ?? await this.#activeSession(provider)
    if (!live) throw new Error('ChatGPT Codex is not signed in')
    const id = accountId ?? accountIdOf('codex', live)
    const pending = this.inflight.get(quotaCacheKey('codex', id))
    if (pending) await pending.catch(() => undefined)
    await consumeCodexReset(live, this.fetchFn)
    this.cache.delete(quotaCacheKey('codex', id))
    return this.refresh('codex', id, live)
  }

  async #activeSession(provider) {
    const manager = this.tokens?.[provider]
    if (!manager || typeof manager.session !== 'function') return undefined
    try {
      return await manager.session()
    } catch {
      return undefined
    }
  }

  async #load(provider, accountId, session) {
    const key = quotaCacheKey(provider, accountId)
    if (!session) {
      this.cache.delete(key)
      return publicQuota()
    }
    const previous = this.cache.get(key)
    this.cache.set(key, {
      ...(previous ?? {}),
      status: previous?.status === 'ready' ? 'ready' : 'loading',
      updatedAt: previous?.updatedAt ?? Date.now(),
      rows: previous?.rows ?? [],
      resetCredits: previous?.resetCredits ?? { availableCount: 0 },
    })
    try {
      const parsed = provider === 'codex'
        ? await fetchCodexQuota(session, this.fetchFn)
        : provider === 'glm'
          ? await fetchGlmQuota(session, this.fetchFn)
          : provider === 'kiro'
            ? await fetchKiroQuota(session, this.fetchFn)
            : provider === 'antigravity'
              ? await fetchAntigravityQuota(session, this.fetchFn)
              : await fetchGrokQuota(session, this.fetchFn)
      const entry = {
        status: 'ready',
        planType: parsed.planType,
        account: parsed.account,
        subscriptionStatus: parsed.subscriptionStatus,
        hasGrokCodeAccess: parsed.hasGrokCodeAccess,
        updatedAt: Date.now(),
        rows: parsed.rows ?? [],
        resetCredits: parsed.resetCredits ?? { availableCount: 0 },
      }
      this.cache.set(key, entry)
      return publicQuota(entry, provider)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const entry = {
        status: 'error',
        planType: previous?.planType,
        subscriptionStatus: previous?.subscriptionStatus,
        hasGrokCodeAccess: previous?.hasGrokCodeAccess,
        updatedAt: Date.now(),
        error: message,
        rows: previous?.rows ?? [],
        resetCredits: previous?.resetCredits ?? { availableCount: 0 },
      }
      this.cache.set(key, entry)
      return publicQuota(entry, provider)
    }
  }
}
