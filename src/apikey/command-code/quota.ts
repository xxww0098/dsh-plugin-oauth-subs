/**
 * Command Code quota: mirrors the CLI's `fetchUsageData` —
 *
 *   GET /alpha/whoami?limits=1            → user + org id
 *   GET /alpha/billing/credits?orgId=…    → credit pools + windowLimits
 *   GET /alpha/billing/subscriptions?orgId=… → planId/status/period
 *   GET /alpha/usage/summary?orgId=…&since=<currentPeriodStart>
 *
 * Credits are USD balances. `windowLimits.{fiveHour,weekly}` rows carry
 * `{used, cap, resetAt}`; `subscription.data` carries `{planId, status,
 * currentPeriodStart, currentPeriodEnd}` (active statuses are the CLI's
 * `no` set: active/trialing/past_due). The credits pool follows the CLI's
 * projectUsageView: remaining monthly+purchased+free against the plan's
 * monthly total when a subscription is active, else spent+remaining.
 */

import { outboundFetch } from '../../utils/outbound.js'
import {
  COMMAND_CODE_CREDITS_URL,
  COMMAND_CODE_PLAN_CREDITS,
  COMMAND_CODE_PLAN_NAMES,
  COMMAND_CODE_SUBSCRIPTIONS_URL,
  COMMAND_CODE_USAGE_URL,
  COMMAND_CODE_WHOAMI_URL,
  commandCodeUpstreamHeaders,
  parseCommandCodeWhoami,
} from './index.js'

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due'])

function asNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function stampOf(value) {
  const n = asNumber(value)
  if (n !== undefined && n > 0) return n > 1e12 ? Math.round(n) : Math.round(n * 1000)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/**
 * `getPlanInfo`: planId lowercased, `_`→`-`, longest-prefix match against the
 * plan table (so `individual-pro-v1` wins over `individual-pro`). Unknown ids
 * fall back to the `getPlanDisplayName` strip of `individual-`/`teams-`.
 */
export function commandCodePlanInfo(planId) {
  const text = typeof planId === 'string' ? planId.trim() : ''
  if (!text) return undefined
  const normalized = text.toLowerCase().replace(/_/g, '-')
  const key = Object.keys(COMMAND_CODE_PLAN_CREDITS)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => normalized.startsWith(candidate))
  if (key) {
    return {
      id: key,
      name: COMMAND_CODE_PLAN_NAMES[key] ?? key,
      monthlyCredits: COMMAND_CODE_PLAN_CREDITS[key],
    }
  }
  const stripped = normalized.replace(/^individual-/, '').replace(/^teams-/, 'teams-')
  return {
    id: normalized,
    name: stripped.charAt(0).toUpperCase() + stripped.slice(1),
    monthlyCredits: undefined,
  }
}

/** planType stored on the session → display label (plan.ts uses this). */
export function commandCodePlanLabel(planId) {
  return commandCodePlanInfo(planId)?.name
}

function windowRow(window, kind, label) {
  if (!window || typeof window !== 'object') return undefined
  const cap = asNumber(window.cap)
  const used = asNumber(window.used) ?? 0
  if (cap === undefined || cap <= 0) return undefined
  const usedPercent = Math.max(0, Math.min(100, Math.round((used / cap) * 1000) / 10))
  const row: any = {
    key: kind,
    kind,
    label,
    usedPercent,
    remainingPercent: Math.round((100 - usedPercent) * 10) / 10,
  }
  const resetAt = stampOf(window.resetAt ?? window.reset)
  if (resetAt !== undefined) row.resetAt = resetAt
  return row
}

/**
 * The credits bar is USD: `used`/`total` + `unit:'usd'` is the row shape the
 * UI renders as `$x.xx of $y.yy`. Emitted only when the account has credit
 * info at all (remaining or spent) — the CLI hides the bar otherwise.
 */
function creditsRow({ credits, subscription, summary }) {
  const pools = credits?.credits && typeof credits.credits === 'object' ? credits.credits : {}
  const monthly = Math.max(0, asNumber(pools.monthlyCredits) ?? 0)
  const purchased = Math.max(0, asNumber(pools.purchasedCredits) ?? 0)
  const free = Math.max(0, asNumber(pools.freeCredits) ?? 0)
  const remaining = monthly + purchased + free
  const spent = Math.max(0, asNumber(summary?.totalCost) ?? 0)
  const sub = subscription?.data && typeof subscription.data === 'object' ? subscription.data : undefined
  const plan = sub ? commandCodePlanInfo(sub.planId) : undefined
  const active = typeof sub?.status === 'string' && ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status)
  const planMonthly = active ? plan?.monthlyCredits : undefined
  const total = planMonthly !== undefined && planMonthly !== null
    ? Math.max(planMonthly, monthly) + purchased + free
    : spent + remaining
  if (remaining <= 0 && total <= 0) return undefined
  const used = Math.max(0, total - remaining)
  const usedPercent = total > 0 ? Math.max(0, Math.min(100, Math.round((used / total) * 1000) / 10)) : 0
  const row: any = {
    key: 'credits',
    kind: 'credits',
    label: 'Credits',
    unit: 'usd',
    used: Math.round(used * 100) / 100,
    total: Math.round(total * 100) / 100,
    usedPercent,
    remainingPercent: Math.round((100 - usedPercent) * 10) / 10,
  }
  const resetAt = stampOf(sub?.currentPeriodEnd)
  if (resetAt !== undefined) row.resetAt = resetAt
  return row
}

/**
 * Parse the four-endpoint bundle into { account, planType, rows }.
 * Arguments are the raw endpoint payloads (any may be undefined/absent).
 */
export function parseCommandCodeUsage({ whoami, credits, subscription, summary }: any = {}) {
  const identity: any = parseCommandCodeWhoami(whoami) ?? {}
  const sub = subscription?.data && typeof subscription.data === 'object' ? subscription.data : undefined
  const plan = sub ? commandCodePlanInfo(sub.planId) : undefined
  const rows: any[] = []
  const credits_ = creditsRow({ credits, subscription, summary })
  if (credits_) rows.push(credits_)
  const limits = credits?.windowLimits && typeof credits.windowLimits === 'object' ? credits.windowLimits : {}
  const fiveHour = windowRow(limits.fiveHour, 'primary', '5-hour')
  if (fiveHour) rows.push(fiveHour)
  const weekly = windowRow(limits.weekly, 'weekly', 'Weekly')
  if (weekly) rows.push(weekly)
  return {
    account: identity.account,
    planType: typeof sub?.planId === 'string' && sub.planId.trim() ? sub.planId.trim() : undefined,
    userId: identity.id,
    userName: identity.userName,
    email: identity.email,
    orgId: identity.orgId,
    rows,
  }
}

async function readJson(response, what) {
  const text = await response.text()
  if (!response.ok) {
    const error: any = new Error(`${what} failed (HTTP ${response.status}): ${text.slice(0, 200)}`)
    error.status = response.status
    throw error
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${what} returned invalid JSON`)
  }
}

/**
 * Full quota fetch — same sequence as the CLI: whoami first (the org id and
 * `limits=1` flag come from it), credits+subscriptions in parallel, then the
 * usage summary scoped to the subscription's currentPeriodStart.
 */
export async function fetchCommandCodeQuota(session, fetchFn = outboundFetch, { timeoutMs = 10_000 }: any = {}) {
  const headers = commandCodeUpstreamHeaders(session)
  const signal = AbortSignal.timeout(timeoutMs)
  const whoami = await fetchFn(`${COMMAND_CODE_WHOAMI_URL}?limits=1`, { method: 'GET', headers, signal })
    .then((response) => readJson(response, 'command-code whoami'))
  const orgId = parseCommandCodeWhoami(whoami)?.orgId ?? session?.orgId
  const orgQuery = orgId ? `?orgId=${encodeURIComponent(orgId)}` : ''
  const [credits, subscription] = await Promise.all([
    fetchFn(`${COMMAND_CODE_CREDITS_URL}${orgQuery}`, { method: 'GET', headers, signal })
      .then((response) => readJson(response, 'command-code credits')),
    fetchFn(`${COMMAND_CODE_SUBSCRIPTIONS_URL}${orgQuery}`, { method: 'GET', headers, signal })
      .then((response) => readJson(response, 'command-code subscriptions')),
  ])
  const since = subscription?.data?.currentPeriodStart
  const params = new URLSearchParams()
  if (orgId) params.set('orgId', orgId)
  if (typeof since === 'string' && since.trim()) params.set('since', since.trim())
  const summaryQuery = params.size > 0 ? `?${params.toString()}` : ''
  const summary = await fetchFn(`${COMMAND_CODE_USAGE_URL}${summaryQuery}`, { method: 'GET', headers, signal })
    .then((response) => readJson(response, 'command-code usage'))
  return parseCommandCodeUsage({ whoami, credits, subscription, summary })
}
