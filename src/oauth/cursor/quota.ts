/**
 * Cursor quota: api2.cursor.sh JSON (period usage, email, Stripe profile),
 * not the agent transport.
 */

import { pickPlanRaw } from '../plan.js'
import {
  CURSOR_GET_EMAIL_URL,
  CURSOR_GET_ME_URL,
  CURSOR_STRIPE_PROFILE_URL,
  CURSOR_USAGE_URL,
  cursorMembershipFromStripe,
  cursorNameFromProfile,
  cursorUsageHeaders,
  pickCursorHumanAccount,
} from './index.js'
import { outboundFetch } from '../../utils/outbound.js'
import { asNumber, clampPct, QUOTA_TIMEOUT_MS, readJson, stampOf, timeoutSignal } from '../quota-shared.js'

function clampUsedPct(value) {
  const n = asNumber(value)
  if (n === undefined) return undefined
  const clamped = Math.max(0, Math.min(100, n))
  const rounded = Math.round(clamped)
  if (clamped > 0 && rounded === 0) return 1
  return rounded
}

function cursorProductRow(key, usedPercent, resetAt) {
  const used = clampUsedPct(usedPercent) ?? 0
  return {
    key: `product:${key}`,
    kind: 'product',
    product: key,
    usedPercent: used,
    remainingPercent: 100 - used,
    ...(resetAt === undefined ? {} : { resetAt }),
  }
}

/**
 * planUsage.includedSpend / limit are cents (the same ratio Cursor's own
 * displayMessage uses for "You've used N% of your included usage"). Emitted as
 * a usd cycle row so the card shows real dollars alongside the percent bars.
 */
function cursorIncludedRow(planUsage, resetAt) {
  const limitCents = asNumber(planUsage?.limit)
  const includedCents = asNumber(planUsage?.includedSpend)
  if (limitCents === undefined || limitCents <= 0 || includedCents === undefined) return undefined
  const usedPercent = clampPct((includedCents / limitCents) * 100)
  return {
    key: 'cycle:included',
    kind: 'cycle',
    product: 'included',
    unit: 'usd',
    used: includedCents / 100,
    total: limitCents / 100,
    ...(usedPercent === undefined ? {} : { remainingPercent: 100 - usedPercent }),
    ...(resetAt === undefined ? {} : { resetAt }),
  }
}

export function parseCursorPeriodUsage(payload, extras: any = {}) {
  if (!payload || typeof payload !== 'object') return { rows: [] }
  const planUsage = payload.planUsage && typeof payload.planUsage === 'object' ? payload.planUsage : {}
  const spend = payload.spendLimitUsage && typeof payload.spendLimitUsage === 'object' ? payload.spendLimitUsage : {}
  const stripe = extras.stripe && typeof extras.stripe === 'object' ? extras.stripe : {}
  const limitType = typeof spend.limitType === 'string' ? spend.limitType : undefined
  const membership = pickPlanRaw(
    cursorMembershipFromStripe(stripe),
    extras.planType,
    payload.individualMembershipType,
    payload.membershipType,
    limitType === 'team' ? 'Team' : undefined,
    'Pro',
  )
  const resetAt = stampOf(payload.billingCycleEnd)
  return {
    planType: membership,
    account: pickCursorHumanAccount(extras.account, extras.email, payload.email),
    rows: [
      ...[cursorIncludedRow(planUsage, resetAt)].filter(Boolean),
      cursorProductRow('auto', planUsage.autoPercentUsed, resetAt),
      cursorProductRow('api', planUsage.apiPercentUsed, resetAt),
    ],
  }
}

async function fetchCursorJson(fetchFn, url, init, label) {
  try {
    const response = await fetchFn(url, init)
    if (!response?.ok) return undefined
    return await readJson(response, label)
  } catch {
    return undefined
  }
}

export async function fetchCursorQuota(session, fetchFn = outboundFetch) {
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  const headers = cursorUsageHeaders(session)
  try {
    const [usageRes, stripe, emailProfile] = await Promise.all([
      fetchFn(CURSOR_USAGE_URL, {
        method: 'POST',
        headers,
        body: '{}',
        signal: wait.signal,
      }),
      fetchCursorJson(fetchFn, CURSOR_STRIPE_PROFILE_URL, {
        method: 'GET',
        headers,
        signal: wait.signal,
      }, 'cursor stripe profile'),
      fetchCursorJson(fetchFn, CURSOR_GET_EMAIL_URL, {
        method: 'POST',
        headers,
        body: '{}',
        signal: wait.signal,
      }, 'cursor email'),
    ])
    if (!usageRes.ok) throw new Error(`cursor quota failed (HTTP ${usageRes.status})`)
    let account = cursorNameFromProfile(emailProfile)
    if (!account) {
      const me = await fetchCursorJson(fetchFn, CURSOR_GET_ME_URL, {
        method: 'POST',
        headers,
        body: '{}',
        signal: wait.signal,
      }, 'cursor me')
      account = cursorNameFromProfile(me)
    }
    return parseCursorPeriodUsage(await readJson(usageRes, 'cursor period usage'), { stripe, account })
  } finally {
    wait.cancel()
  }
}
