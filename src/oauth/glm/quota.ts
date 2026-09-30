/**
 * GLM quota: GET {biz}/api/monitor/usage/quota/limit plus
 * zcode.z.ai/api/v1/mcp/usage, and the reset-card bank
 * (customer-package-reset/list, POST …/use).
 */

import { formatPlanLabel, pickPlanRaw } from '../plan.js'
import {
  GLM_RESET_CARD_TARGET_TYPE,
  glmMcpUsageHeaders,
  glmMcpUsageUrl,
  glmQuotaUrl,
  glmResetCardUrl,
  glmResetStampOffsetMinutes,
  glmToolUsageUrl,
  glmUpstreamHeaders,
} from './index.js'
import { outboundFetch } from '../../utils/outbound.js'
import {
  asNumber,
  clampPct,
  creditBagAmounts,
  creditBagUsedPercent,
  QUOTA_TIMEOUT_MS,
  readJson,
  stampOf,
  timeoutSignal,
  trimmedQuotaMsg,
} from '../quota-shared.js'

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
  const ordered: any[] = []
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
  const bagTotal = bag.total
  const bagUsed = bag.used
  const usedPercent = clampPct(item.percentage ?? item.usedPercent ?? item.used_percent)
    ?? (typeof bagTotal === 'number' && bagTotal > 0 && bagUsed !== undefined ? clampPct((bagUsed / bagTotal) * 100) : undefined)
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
  const rows: any[] = []
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

/**
 * Official MCP quota payload — `GET zcode.z.ai/api/v1/mcp/usage` answers
 * `{data:{level, total_usage:{used,limit,remaining}, next_refresh_at}}`
 * (usage-stats.ts fetchMcpQuotaSnapshot). Maps to the single `mcp` row.
 */
export function parseGlmMcpUsage(payload) {
  const root = payload?.data && typeof payload.data === 'object' ? payload.data : payload
  const bag = root?.total_usage ?? root?.totalUsage ?? root
  const total = asNumber(bag?.limit ?? bag?.total ?? bag?.usage)
  const used = asNumber(bag?.used ?? bag?.currentValue)
  const remaining = asNumber(bag?.remaining)
    ?? (total !== undefined && used !== undefined ? Math.max(0, total - used) : undefined)
  if (total === undefined && used === undefined && remaining === undefined) return undefined
  const usedPercent = total !== undefined && total > 0 && used !== undefined
    ? clampPct((used / total) * 100)
    : undefined
  return {
    key: 'mcp',
    kind: 'mcp',
    product: 'ZCode MCP',
    usedPercent,
    remainingPercent: usedPercent === undefined ? undefined : 100 - usedPercent,
    used,
    total,
    remaining,
    resetAt: stampOf(root?.next_refresh_at ?? root?.nextRefreshAt ?? root?.nextResetTime),
  }
}

const GLM_RESET_BUCKETS = Object.freeze([
  { key: 'fiveHourResets', resetType: 'FIVE_HOUR' },
  { key: 'weekResets', resetType: 'WEEK' },
])

const GLM_CARD_STAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/

/** Zone-less dashboard stamp → epoch ms at the region's fixed offset. */
export function glmCardStamp(value, offsetMinutes = 0) {
  if (typeof value !== 'string' || !value.trim()) return stampOf(value)
  const match = GLM_CARD_STAMP.exec(value.trim())
  if (!match) return stampOf(value)
  const [, y, mo, d, hh, mm, ss, frac = '0'] = match
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss), Number(frac.padEnd(3, '0')))
  return Number.isFinite(utc) ? utc - offsetMinutes * 60_000 : undefined
}

/**
 * Coding Plan Reset Cards. A complete list always carries both bucket arrays;
 * anything less (business error, truncated `data`) returns undefined so the
 * store keeps the last known bank instead of reading it as "no cards".
 */
export function parseGlmResetCards(payload, region = 'zai') {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const code = asNumber(payload.code)
  if (payload.success !== true || (code !== 0 && code !== 200)) return undefined
  const data = payload.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined
  if (!GLM_RESET_BUCKETS.every((bucket) => Array.isArray(data[bucket.key]))) return undefined
  const offset = glmResetStampOffsetMinutes(region)
  const now = Date.now()
  const credits: any[] = []
  for (const bucket of GLM_RESET_BUCKETS) {
    for (const item of data[bucket.key]) {
      if (!item || typeof item !== 'object') continue
      if (item.available === false || item.consumed === true || item.redeemed === true) continue
      const rawId = item.recordId ?? item.id
      const id = typeof rawId === 'number' && Number.isFinite(rawId)
        ? String(rawId)
        : typeof rawId === 'string' && rawId.trim() ? rawId.trim() : undefined
      if (!id) continue
      const expiresAt = glmCardStamp(item.expireTime ?? item.expiredTime ?? item.expiresAt, offset)
      if (expiresAt !== undefined && expiresAt <= now) continue
      credits.push({ id, resetType: bucket.resetType, status: 'available', ...(expiresAt === undefined ? {} : { expiresAt }) })
    }
  }
  credits.sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity))
  const nextExpiresAt = credits.find((credit) => credit.expiresAt !== undefined)?.expiresAt
  return {
    availableCount: credits.length,
    credits,
    ...(nextExpiresAt === undefined ? {} : { nextExpiresAt }),
  }
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

/**
 * Monitor windows + MCP row, with the reset-card bank read alongside. A card
 * list failure never fails the card: `resetCredits` is left off so the store
 * keeps the previous bank; a plan without a 5h / weekly window drops it.
 */
export async function fetchGlmQuota(session, fetchFn = outboundFetch) {
  const [usage, cards] = await Promise.allSettled([
    fetchGlmUsage(session, fetchFn),
    fetchGlmResetCards(session, fetchFn),
  ])
  if (usage.status === 'rejected') throw usage.reason
  const parsed = usage.value
  const resettable = parsed.rows.some((row) => row.kind === 'primary' || row.kind === 'weekly')
  if (!resettable) return { ...parsed, resetCredits: { availableCount: 0, credits: [] } }
  if (cards.status === 'rejected' || !cards.value) return parsed
  return { ...parsed, resetCredits: cards.value }
}

export async function fetchGlmResetCards(session, fetchFn = outboundFetch) {
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const response = await fetchFn(glmResetCardUrl(session.region, 'list'), {
      method: 'GET',
      headers: glmUpstreamHeaders(session),
      signal: wait.signal,
    })
    return parseGlmResetCards(await readJson(response, 'glm reset cards'), session.region)
  } finally {
    wait.cancel()
  }
}

export function glmResetCardBody(credit, requestId) {
  const numeric = Number(credit.id)
  return {
    targetType: GLM_RESET_CARD_TARGET_TYPE,
    resetType: credit.resetType,
    recordId: Number.isSafeInteger(numeric) ? numeric : credit.id,
    requestId,
  }
}

/**
 * Redeem one card. HTTP 200 alone is not success — the biz envelope must say
 * so. A business rejection throws `GlmResetRejected` (the card was not spent,
 * a retry needs a fresh request id); a transport failure throws as-is so the
 * caller reuses the same request id.
 */
export class GlmResetRejected extends Error {}

export async function consumeGlmResetCard(session, credit, requestId, fetchFn = outboundFetch) {
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const response = await fetchFn(glmResetCardUrl(session.region, 'use'), {
      method: 'POST',
      headers: { ...glmUpstreamHeaders(session), 'content-type': 'application/json' },
      body: JSON.stringify(glmResetCardBody(credit, requestId)),
      signal: wait.signal,
    })
    const body = await readJson(response, 'glm reset card')
    const code = asNumber(body?.code)
    if (body?.success !== true || (code !== 0 && code !== 200)) {
      throw new GlmResetRejected(`glm reset card failed: ${trimmedQuotaMsg(body?.msg ?? body?.message) ?? `code ${String(body?.code)}`}`)
    }
    return { ok: true, requestId }
  } finally {
    wait.cancel()
  }
}

async function fetchGlmUsage(session, fetchFn = outboundFetch) {
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const response = await fetchFn(glmQuotaUrl(session.region), {
      method: 'GET',
      headers: glmUpstreamHeaders(session),
      signal: wait.signal,
    })
    const body = await readJson(response, 'glm quota')
    // The monitor endpoints answer HTTP 200 with a business envelope. A
    // plan-less account returns { code: 500, msg: "当前用户不存在coding plan" };
    // without this the card reads "quota ready, no rows" and the UI shows the
    // vague 「周额度未返回」 instead of the vendor's reason.
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const code = asNumber(body.code)
      if (body.success === false || (code !== undefined && code !== 0 && code !== 200)) {
        throw new Error(`glm quota failed: ${trimmedQuotaMsg(body.msg) ?? `code ${String(body.code)}`}`)
      }
    }
    const parsed = parseGlmQuota(body)
    if (parsed.rows.some((row) => row.kind === 'mcp')) return parsed
    // Official MCP quota is a separate endpoint (usage-stats.ts
    // fetchMcpQuotaSnapshot): GET zcode.z.ai/api/v1/mcp/usage with the zcode
    // JWT on authorization + the provisioned api-key on X-Bigmodel-Authorization.
    // The legacy monitor tool-usage endpoint answers an empty body for this
    // account, so it stays only as a fallback.
    const mcpHeaders = glmMcpUsageHeaders(session)
    if (mcpHeaders) {
      const mcpWait = timeoutSignal(QUOTA_TIMEOUT_MS)
      try {
        const mcpRes = await fetchFn(glmMcpUsageUrl(), {
          method: 'GET',
          headers: mcpHeaders,
          signal: mcpWait.signal,
        })
        const mcpRow = parseGlmMcpUsage(await readJson(mcpRes, 'glm mcp usage'))
        if (mcpRow) return { ...parsed, rows: finalizeGlmRows([...parsed.rows, mcpRow]) }
      } catch {
        // fall through to the legacy tool-usage probe
      } finally {
        mcpWait.cancel()
      }
    }
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
