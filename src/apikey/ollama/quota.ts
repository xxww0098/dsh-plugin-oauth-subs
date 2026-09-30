/**
 * Ollama Cloud quota: GET ollama.com/api/usage (limits.session/weekly.usage
 * are 0..1 fractions) and POST ollama.com/api/me (GET is 405).
 */

import { OLLAMA_ME_URL, OLLAMA_USAGE_URL, ollamaUpstreamHeaders, parseOllamaMe } from './index.js'
import { outboundFetch } from '../../utils/outbound.js'
import {
  asNumber,
  QUOTA_TIMEOUT_MS,
  readJson,
  resetAtOf,
  stampOf,
  timeoutSignal,
} from '../../oauth/quota-shared.js'

/** ollama.com /api/usage `limits.*.usage` is a 0..1 fraction, not 0–100. */
function ollamaUsedPercent(value) {
  const n = asNumber(value)
  if (n === undefined) return undefined
  const used = n <= 1 ? n * 100 : n
  return Math.max(0, Math.min(100, Math.round(used * 10) / 10))
}

function ollamaModelItems(models) {
  if (!Array.isArray(models) || models.length === 0) return undefined
  const items: any[] = []
  for (const item of models) {
    if (!item || typeof item !== 'object') continue
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : undefined
    if (!name) continue
    const count = asNumber(item.request_count ?? item.requestCount) ?? 0
    items.push({ name, count })
  }
  return items.length > 0 ? items : undefined
}

function ollamaModelsNote(models) {
  const items = ollamaModelItems(models)
  return items ? items.map((item) => `${item.name} × ${item.count}`).join('\n') : undefined
}

/** Global 5h unix buckets. ollama/ollama#12532: `18000 - (epoch % 18000)`. */
export const OLLAMA_SESSION_WINDOW_S = 18_000

/** Global 7d unix buckets, −4d from epoch (Mon 00:00 UTC). ollama/ollama#12532. */
export const OLLAMA_WEEKLY_WINDOW_S = 604_800

const OLLAMA_WEEKLY_SHIFT_S = 4 * 86_400

export function ollamaSessionResetAt(now = Date.now()) {
  const epoch = Math.floor(now / 1000)
  return (Math.floor(epoch / OLLAMA_SESSION_WINDOW_S) + 1) * OLLAMA_SESSION_WINDOW_S * 1000
}

export function ollamaWeeklyResetAt(now = Date.now()) {
  const epoch = Math.floor(now / 1000)
  const shifted = epoch - OLLAMA_WEEKLY_SHIFT_S
  return ((Math.floor(shifted / OLLAMA_WEEKLY_WINDOW_S) + 1) * OLLAMA_WEEKLY_WINDOW_S + OLLAMA_WEEKLY_SHIFT_S) * 1000
}

function ollamaWindowResetAt(window, kind, now = Date.now()) {
  const stamp = resetAtOf(window) ?? stampOf(window?.next_reset ?? window?.nextReset)
  if (stamp !== undefined) return stamp
  if (kind === 'primary') return ollamaSessionResetAt(now)
  if (kind === 'weekly') return ollamaWeeklyResetAt(now)
  return undefined
}

function parseOllamaLimitWindow(window, kind, now = Date.now()) {
  if (!window || typeof window !== 'object') return undefined
  const usedPercent = ollamaUsedPercent(window.usage)
  if (usedPercent === undefined) return undefined
  const remainingPercent = Math.max(0, Math.min(100, Math.round((100 - usedPercent) * 10) / 10))
  const note = kind === 'weekly' ? ollamaModelsNote(window.models) : undefined
  const noteItems = kind === 'weekly' ? ollamaModelItems(window.models) : undefined
  const resetAt = ollamaWindowResetAt(window, kind, now)
  return {
    key: kind,
    kind,
    usedPercent,
    remainingPercent,
    ...(kind === 'primary' ? { windowMinutes: 300 } : {}),
    ...(resetAt !== undefined ? { resetAt } : {}),
    ...(note ? { note } : {}),
    ...(noteItems ? { noteItems } : {}),
  }
}

export function parseOllamaUsage(payload, me, now = Date.now()) {
  const root = payload && typeof payload === 'object' ? payload : {}
  const limits = root.limits && typeof root.limits === 'object' ? root.limits : root
  const identity = parseOllamaMe(me && typeof me === 'object' ? me : root)
  const rows: any[] = []
  const session = parseOllamaLimitWindow(limits.session, 'primary', now)
  const weekly = parseOllamaLimitWindow(limits.weekly, 'weekly', now)
  if (session) rows.push(session)
  if (weekly) rows.push(weekly)
  return {
    planType: identity.planType,
    account: identity.account,
    rows,
  }
}

export async function fetchOllamaQuota(session, fetchFn = outboundFetch) {
  const headers = ollamaUpstreamHeaders(session)
  const usageWait = timeoutSignal(QUOTA_TIMEOUT_MS)
  const meWait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const [usageResult, meResult] = await Promise.allSettled([
      fetchFn(OLLAMA_USAGE_URL, { method: 'GET', headers, signal: usageWait.signal })
        .then((response) => readJson(response, 'ollama usage')),
      fetchFn(OLLAMA_ME_URL, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: '{}',
        signal: meWait.signal,
      }).then((response) => readJson(response, 'ollama me')),
    ])
    if (usageResult.status === 'rejected' && meResult.status === 'rejected') {
      throw usageResult.reason
    }
    const usage = usageResult.status === 'fulfilled' ? usageResult.value : {}
    const me = meResult.status === 'fulfilled' ? meResult.value : undefined
    return parseOllamaUsage(usage, me)
  } finally {
    usageWait.cancel()
    meWait.cancel()
  }
}
