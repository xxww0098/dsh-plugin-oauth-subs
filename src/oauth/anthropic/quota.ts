/**
 * Anthropic subscription quota.
 *
 * Claude Code exposes the unified 5-hour / weekly meters as rate-limit headers
 * on Messages responses. Its OAuth usage endpoint additionally reports scoped
 * weekly limits (for example, the separate Fable meter). Keep the tiny Messages
 * probe as the source for the established bars and use GET /api/oauth/usage to
 * enrich them with any model-scoped rows; if either endpoint is unavailable,
 * the other can still provide useful quota data.
 */

import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_USAGE_URL, ANTHROPIC_PROBE_MODEL, anthropicUpstreamHeaders } from './index.js'
import { outboundFetch } from '../../utils/outbound.js'

function parseFraction(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const raw = typeof value === 'string' ? value.trim() : value
  const fraction = Number(raw)
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return undefined
  return fraction
}

function parsePercent(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const raw = typeof value === 'string' ? value.trim() : value
  const percent = Number(raw)
  if (!Number.isFinite(percent) || percent < 0) return undefined
  return Math.max(0, Math.min(100, Math.round(percent * 10) / 10))
}

function parseReset(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const raw = typeof value === 'string' ? value.trim() : value
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    // Epoch seconds vs milliseconds: a 17-digit stamp is already ms.
    return raw > 1e14 ? Math.round(raw) : Math.round(raw * 1000)
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    const numeric = Number(raw)
    return numeric > 1e14 ? numeric : numeric * 1000
  }
  if (typeof raw === 'string') {
    const at = Date.parse(raw)
    if (Number.isFinite(at)) return at
  }
  return undefined
}

function percentRow(kind, key, label, used, reset) {
  const usedPercent = parsePercent(used)
  if (usedPercent === undefined) return undefined
  const resetAt = parseReset(reset)
  return {
    key,
    kind,
    label,
    usedPercent,
    remainingPercent: Math.max(0, Math.min(100, Math.round((100 - usedPercent) * 10) / 10)),
    ...(resetAt !== undefined ? { resetAt } : {}),
  }
}

function usageWindowRow(kind, key, label, limit, fallback) {
  const row = percentRow(kind, key, label,
    limit?.percent ?? limit?.utilization,
    limit?.resets_at ?? limit?.reset_at ?? limit?.resetAt)
  return row ?? (fallback ? percentRow(kind, key, label,
    fallback.percent ?? fallback.utilization,
    fallback.resets_at ?? fallback.reset_at ?? fallback.resetAt) : undefined)
}

function modelKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'model'
}

// Legacy flat windows the usage payload still emits alongside `limits[]`.
// `seven_day_overage_included` is the Fable-scoped weekly meter (`7d_oi` in
// unified headers — Claude Code's label map renders it as "Fable 5 limit").
const LEGACY_SCOPED = [
  ['seven_day_opus', 'Opus'],
  ['seven_day_sonnet', 'Sonnet'],
  ['seven_day_cowork', 'Cowork'],
  ['seven_day_oauth_apps', 'OAuth Apps'],
  ['seven_day_overage_included', 'Fable'],
]

export function parseAnthropicUsage(payload) {
  if (!payload || typeof payload !== 'object') return { rows: [] }
  const limits = Array.isArray(payload.limits) ? payload.limits : []
  const find = (kind) => limits.find((limit) => limit?.kind === kind)
  const rows: any[] = [
    usageWindowRow('primary', 'anthropic-5h', '5 小时 · 5-hour', find('session'), payload.five_hour),
    usageWindowRow('weekly', 'anthropic-7d', '每周 · Weekly', find('weekly_all'), payload.seven_day),
  ].filter(Boolean)
  const scoped = new Set()

  for (const limit of limits) {
    if (limit?.kind !== 'weekly_scoped') continue
    const model = limit.scope?.model
    const displayName = typeof model?.display_name === 'string' ? model.display_name.trim() : ''
    if (!displayName) continue
    const row = percentRow(
      'weekly_scoped',
      'anthropic-7d-' + modelKey(model.id ?? displayName),
      displayName,
      limit.percent ?? limit.utilization,
      limit.resets_at ?? limit.reset_at ?? limit.resetAt,
    )
    if (row) {
      scoped.add(displayName.toLowerCase())
      rows.push({ ...row, product: displayName })
    }
  }

  for (const [field, label] of LEGACY_SCOPED) {
    if (scoped.has(label.toLowerCase())) continue
    const window = payload[field]
    const row = percentRow('weekly_scoped', 'anthropic-7d-' + modelKey(label), label,
      window?.utilization ?? window?.percent,
      window?.resets_at ?? window?.reset_at ?? window?.resetAt)
    if (row) rows.push({ ...row, product: label })
  }
  return { rows }
}

function windowRow(kind, label, headers, suffix) {
  const used = parseFraction(headers.get('anthropic-ratelimit-unified-' + suffix + '-utilization'))
  if (used === undefined) return undefined
  const resetAt = parseReset(headers.get('anthropic-ratelimit-unified-' + suffix + '-reset'))
  const usedPercent = Math.max(0, Math.min(100, Math.round(used * 1000) / 10))
  return {
    key: 'anthropic-' + suffix,
    kind,
    label,
    usedPercent,
    remainingPercent: Math.max(0, Math.min(100, Math.round((100 - usedPercent) * 10) / 10)),
    ...(resetAt !== undefined ? { resetAt } : {}),
  }
}

export function parseAnthropicRateLimitHeaders(headers) {
  const get = headers?.get?.bind(headers)
  if (typeof get !== 'function') return { rows: [] }
  // `7d_oi` is the Fable-scoped "overage included" weekly bucket.
  const fable = windowRow('weekly_scoped', 'Fable', headers, '7d_oi')
  const rows = [
    windowRow('primary', '5 小时 · 5-hour', headers, '5h'),
    windowRow('weekly', '每周 · Weekly', headers, '7d'),
    fable ? { ...fable, key: 'anthropic-7d-fable', product: 'Fable' } : undefined,
  ].filter(Boolean)
  return { rows }
}

async function attempt(fetcher) {
  try { return await fetcher() } catch (error) { return { error } }
}

async function fetchUsage(session, fetchFn) {
  const response = await fetchFn(ANTHROPIC_USAGE_URL, {
    method: 'GET',
    headers: anthropicUpstreamHeaders(session),
    signal: AbortSignal.timeout(10_000),
  })
  let payload
  try { payload = await response.json() } catch { payload = undefined }
  return { status: response.status, ...parseAnthropicUsage(payload) }
}

async function fetchMessageHeaders(session, fetchFn) {
  const response = await fetchFn(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: { ...anthropicUpstreamHeaders(session), 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ANTHROPIC_PROBE_MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const parsed = parseAnthropicRateLimitHeaders(response.headers)
  let body = ''
  if (parsed.rows.length === 0) {
    try { body = await response.text() } catch { body = '' }
  } else {
    try { await response.body?.cancel() } catch { /* response body is not needed */ }
  }
  return { status: response.status, body, ...parsed }
}

export async function fetchAnthropicQuota(session, fetchFn = outboundFetch, previousRows: any = undefined) {
  const [usage, message] = await Promise.all([
    attempt(() => fetchUsage(session, fetchFn)),
    attempt(() => fetchMessageHeaders(session, fetchFn)),
  ])
  const usageRows = Array.isArray(usage?.rows) ? usage.rows : []
  const messageRows = Array.isArray(message?.rows) ? message.rows : []
  const rows = [...messageRows]
  for (const row of usageRows) {
    if (rows.some((current) => current.key === row.key)) continue
    if (row.kind === 'weekly_scoped' || !rows.some((current) => current.kind === row.kind)) rows.push(row)
  }
  if (rows.length === 0) {
    const details = message?.body ? ': ' + message.body.slice(0, 200) : ''
    const status = message?.status ?? usage?.status
    throw new Error('anthropic quota: no unified rate-limit headers or OAuth usage limits (HTTP ' + (status ?? 'unavailable') + ')' + details)
  }
  // The usage endpoint rate-limits aggressively; a 429 must not silently drop
  // model-scoped meters we knew about. A 200 without them means they are gone.
  if (usage?.status !== 200 && Array.isArray(previousRows)) {
    for (const row of previousRows) {
      if (row?.kind === 'weekly_scoped' && !rows.some((current) => current.key === row.key)) rows.push(row)
    }
  }
  return {
    planType: session.planType,
    account: session.account,
    subscriptionStatus: message?.status === 429 || usage?.status === 429 ? 'rate_limited' : 'active',
    rows,
  }
}
