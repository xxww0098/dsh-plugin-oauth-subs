/**
 * Subscription quota:
 *   Codex  GET chatgpt.com/backend-api/wham/usage
 *          GET chatgpt.com/backend-api/wham/rate-limit-reset-credits
 *          POST …/rate-limit-reset-credits/consume
 *   Grok   GET cli-chat-proxy.grok.com/v1/billing?format=credits
 *          GET cli-chat-proxy.grok.com/v1/user?include=subscription
 *
 * Codex windows report used_percent; remaining is 100 − used.
 * Grok creditUsagePercent is also used-percent. Display remaining in the UI.
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
  GROK_CLIENT_VERSION,
  grokTierFromValue,
  grokUpstreamHeaders,
} from './grok/index.js'
import { formatPlanLabel, pickPlanRaw } from './plan.js'

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
  if (!value) return { availableCount: 0 }
  return {
    availableCount: value.availableCount ?? 0,
    ...(value.nextExpiresAt === undefined ? {} : { nextExpiresAt: value.nextExpiresAt }),
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

function productRow(item) {
  if (!item || typeof item !== 'object') return undefined
  const product = item.product ?? item.name ?? item.productName
  if (typeof product !== 'string' || product.length === 0) return undefined
  const bag = creditBagAmounts(item) ?? {}
  const usedPercent = clampPct(item.usagePercent ?? item.usedPercent)
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
  const period = config.currentPeriod && typeof config.currentPeriod === 'object' ? config.currentPeriod : {}
  const user = userPayload(cliUser)
  const subscription = user.subscription ?? cliUser?.subscription ?? config.subscription
  const subscriptionTier = formatPlanLabel(grokTierFromValue(pickPlanRaw(
    config.subscription_tier,
    config.subscriptionTier,
    subscription?.tier,
    user.subscriptionTier,
    user.subscription_tier,
  )))
  const subscriptionStatus = typeof subscription?.status === 'string' ? subscription.status : undefined
  const hasGrokCodeAccess = user.hasGrokCodeAccess ?? user.has_grok_code_access ?? cliUser?.hasGrokCodeAccess

  let usedPercent = clampPct(config.creditUsagePercent ?? config.credit_usage_percent)
  const amounts = creditUsageSources(billing, config)
    .map((source) => (source === undefined ? undefined : creditBagAmounts(source)))
    .find((bag) => bag && (bag.used !== undefined || bag.total !== undefined))
  if (usedPercent === undefined && amounts) usedPercent = creditBagUsedPercent(amounts) ?? undefined
  const remainingPercent = usedPercent === undefined ? undefined : 100 - usedPercent
  const resetAt = periodResetAt(period.end ?? config.billingPeriodEnd)

  const rows = []
  if (usedPercent !== undefined || amounts?.used !== undefined || amounts?.total !== undefined) {
    rows.push({
      key: 'cycle',
      kind: 'cycle',
      usedPercent,
      remainingPercent,
      used: amounts?.used,
      total: amounts?.total,
      remaining: amounts?.remaining,
      resetAt,
      periodType: typeof period.type === 'string' ? period.type : undefined,
      periodStart: typeof period.start === 'string' ? period.start : config.billingPeriodStart,
      periodEnd: typeof period.end === 'string' ? period.end : config.billingPeriodEnd,
    })
  }
  const prepaid = asNumber(config.prepaidBalance ?? billing.prepaidBalance)
  if (prepaid !== undefined) {
    rows.push({ key: 'prepaid', kind: 'prepaid', remaining: prepaid })
  }
  const products = Array.isArray(config.productUsage) ? config.productUsage : []
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
  try {
    const [billingResult, userResult] = await Promise.allSettled([
      fetchFn(GROK_BILLING_URL, { method: 'GET', headers, signal: billingWait.signal })
        .then((response) => readJson(response, 'grok billing')),
      fetchFn(GROK_CLI_USER_URL, { method: 'GET', headers, signal: userWait.signal })
        .then((response) => readJson(response, 'grok user')),
    ])
    if (billingResult.status === 'rejected') throw billingResult.reason
    const cliUser = userResult.status === 'fulfilled' ? userResult.value : undefined
    return parseGrokBilling(billingResult.value, { cliUser })
  } finally {
    billingWait.cancel()
    userWait.cancel()
  }
}

function publicQuota(entry) {
  if (!entry) return { status: 'idle' }
  return {
    status: entry.status,
    planType: entry.planType,
    planLabel: formatPlanLabel(entry.planType),
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

  peek(provider) {
    return publicQuota(this.cache.get(provider))
  }

  clear(provider) {
    if (provider) this.cache.delete(provider)
    else this.cache.clear()
  }

  async ensure(provider) {
    const cached = this.cache.get(provider)
    if (cached && Date.now() - cached.updatedAt < this.ttlMs) {
      return publicQuota(cached)
    }
    if (cached && cached.status === 'ready') {
      void this.refresh(provider)
      return publicQuota(cached)
    }
    return this.refresh(provider)
  }

  async refresh(provider) {
    const pending = this.inflight.get(provider)
    if (pending) return pending
    const run = this.#load(provider).finally(() => this.inflight.delete(provider))
    this.inflight.set(provider, run)
    return run
  }

  async consume(provider) {
    if (provider !== 'codex') throw new Error('only ChatGPT Codex can reset quota')
    const manager = this.tokens?.codex
    if (!manager || typeof manager.session !== 'function') {
      throw new Error('ChatGPT Codex is not signed in')
    }
    const pending = this.inflight.get('codex')
    if (pending) await pending.catch(() => undefined)
    let session
    try {
      session = await manager.session()
    } catch {
      throw new Error('ChatGPT Codex is not signed in')
    }
    if (!session) throw new Error('ChatGPT Codex is not signed in')
    await consumeCodexReset(session, this.fetchFn)
    this.cache.delete('codex')
    return this.refresh('codex')
  }

  async #load(provider) {
    const manager = this.tokens?.[provider]
    if (!manager || typeof manager.session !== 'function') {
      this.cache.delete(provider)
      return publicQuota()
    }
    let session
    try {
      session = await manager.session()
    } catch {
      this.cache.delete(provider)
      return publicQuota()
    }
    const previous = this.cache.get(provider)
    this.cache.set(provider, {
      ...(previous ?? {}),
      status: previous?.status === 'ready' ? 'ready' : 'loading',
      updatedAt: previous?.updatedAt ?? Date.now(),
      rows: previous?.rows ?? [],
      resetCredits: previous?.resetCredits ?? { availableCount: 0 },
    })
    try {
      const parsed = provider === 'codex'
        ? await fetchCodexQuota(session, this.fetchFn)
        : await fetchGrokQuota(session, this.fetchFn)
      const entry = {
        status: 'ready',
        planType: parsed.planType,
        subscriptionStatus: parsed.subscriptionStatus,
        hasGrokCodeAccess: parsed.hasGrokCodeAccess,
        updatedAt: Date.now(),
        rows: parsed.rows ?? [],
        resetCredits: parsed.resetCredits ?? { availableCount: 0 },
      }
      this.cache.set(provider, entry)
      return publicQuota(entry)
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
      this.cache.set(provider, entry)
      return publicQuota(entry)
    }
  }
}
