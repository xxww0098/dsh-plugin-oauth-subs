/**
 * Antigravity quota: loadCodeAssist, retrieveUserQuotaSummary, and
 * fetchAvailableModels as the 5-hour fallback. The official Model Quota UI is
 * two groups × (weekly + 5-hour).
 */

import {
  ANTIGRAVITY_LOAD_CODE_ASSIST_URL,
  ANTIGRAVITY_MODELS_URL,
  ANTIGRAVITY_QUOTA_GROUPS,
  ANTIGRAVITY_QUOTA_SUMMARY_URL,
  antigravityLoadCodeAssistBody,
  antigravityLoadCodeAssistHeaders,
  antigravityPlanType,
  extractCloudaicompanionProject,
  fetchAntigravityCloudCode,
  isCodeAssistOnlyPlan,
} from './index.js'
import { outboundFetch } from '../../utils/outbound.js'
import { asNumber, clampPct, QUOTA_TIMEOUT_MS, readJson, resetAtOf, timeoutSignal } from '../quota-shared.js'

function antigravityModelsMap(payload) {
  if (!payload || typeof payload !== 'object') return undefined
  const models = payload.models
  if (models && typeof models === 'object' && !Array.isArray(models)) return models
  if (!Array.isArray(payload)) return payload
  return undefined
}

function findAntigravityModel(models: Record<string, any>, identifier) {
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
  const samples: any[] = []
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
  const rows: any[] = []
  for (const group of ANTIGRAVITY_QUOTA_GROUPS) {
    const row = buildAntigravityQuotaRow(models, group)
    if (row) rows.push(row)
  }
  return { rows }
}

function remainingOfBucket(bucket) {
  if (!bucket || typeof bucket !== 'object') return undefined
  const nested = bucket.remaining && typeof bucket.remaining === 'object' ? bucket.remaining : undefined
  return normalizeQuotaFraction(
    bucket.remainingFraction
    ?? bucket.remaining_fraction
    ?? nested?.remainingFraction
    ?? nested?.remaining_fraction
    ?? nested?.remaining
    ?? bucket.remaining,
  )
}

function classifyQuotaWindow(bucket) {
  const window = String(bucket?.window ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  if (window === 'weekly' || window === 'week') return 'weekly'
  if (window === 'fivehour' || window === '5h' || window === '5hour' || window === 'session') return 'primary'
  const text = [
    bucket?.window,
    bucket?.bucketId,
    bucket?.bucket_id,
    bucket?.displayName,
    bucket?.display_name,
    bucket?.description,
  ].filter((value) => typeof value === 'string').join(' ')
  if (/week/i.test(text)) return 'weekly'
  if (/5\s*-?h|five.?hour|session|rolling/i.test(text)) return 'primary'
  return undefined
}

function antigravityGroupSlug(title) {
  return String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'
}

/** Official Model Quota panel: Gemini Models / Claude and GPT models × weekly + 5-hour. */
export function parseAntigravityQuotaSummary(payload) {
  const root = payload?.response && typeof payload.response === 'object' ? payload.response : payload
  const groups = Array.isArray(root?.groups) ? root.groups : []
  const rows: any[] = []
  for (const group of groups) {
    const title = typeof group?.displayName === 'string' && group.displayName.trim()
      ? group.displayName.trim()
      : (typeof group?.display_name === 'string' && group.display_name.trim() ? group.display_name.trim() : undefined)
    if (!title) continue
    const buckets = Array.isArray(group.buckets) ? group.buckets : []
    const windows: any[] = []
    const pending: any[] = []
    for (const bucket of buckets) {
      const remaining = remainingOfBucket(bucket)
      if (remaining === undefined) continue
      const nested = bucket?.remaining && typeof bucket.remaining === 'object' ? bucket.remaining : undefined
      const item = {
        kind: classifyQuotaWindow(bucket),
        remaining,
        resetAt: resetAtOf(bucket) ?? resetAtOf(nested),
      }
      if (item.kind) windows.push(item)
      else pending.push(item)
    }
    if (windows.length === 0 && pending.length > 0) {
      pending.forEach((item, index) => {
        item.kind = index === 0 ? 'weekly' : 'primary'
      })
      windows.push(...pending)
    } else if (pending.length > 0 && windows.length === 1) {
      pending[0].kind = windows[0].kind === 'weekly' ? 'primary' : 'weekly'
      windows.push(pending[0])
    }
    if (windows.length === 0) continue
    const slug = antigravityGroupSlug(title)
    rows.push({ key: `heading:${slug}`, kind: 'heading', product: title })
    const order = ['primary', 'weekly']
    windows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    for (const win of windows) {
      const remainingPercent = clampPct(win.remaining * 100) ?? 0
      rows.push({
        key: `${slug}:${win.kind}`,
        kind: win.kind,
        product: title,
        remainingPercent,
        usedPercent: Math.max(0, Math.min(100, 100 - remainingPercent)),
        ...(win.resetAt === undefined ? {} : { resetAt: win.resetAt }),
        ...(win.kind === 'primary' ? { windowMinutes: 300 } : {}),
      })
    }
  }
  return { rows, planType: antigravityPlanType(root) ?? antigravityPlanType(payload) }
}

export function parseAntigravityPaidCredits(payload) {
  const credits = payload?.paidTier?.availableCredits ?? payload?.paid_tier?.availableCredits
  if (!Array.isArray(credits)) return []
  const rows: any[] = []
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

async function fetchAntigravityQuotaSummary(accessToken, projectId, fetchFn) {
  const payload = projectId ? { project: projectId } : {}
  const wait = timeoutSignal(QUOTA_TIMEOUT_MS)
  try {
    const response = await fetchAntigravityCloudCode(ANTIGRAVITY_QUOTA_SUMMARY_URL, {
      method: 'POST',
      headers: antigravityLoadCodeAssistHeaders(accessToken),
      body: JSON.stringify(payload),
      signal: wait.signal,
    }, fetchFn)
    if (response.status === 401) {
      const text = await response.text()
      throw new Error(`antigravity retrieveUserQuotaSummary failed (HTTP 401)${text ? `: ${text.slice(0, 180)}` : ''}`)
    }
    if (!response.ok) return { rows: [] }
    return parseAntigravityQuotaSummary(await readJson(response, 'antigravity retrieveUserQuotaSummary'))
  } finally {
    wait.cancel()
  }
}

function pickGoogleAiPlan(...values) {
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue
    if (isCodeAssistOnlyPlan(value)) continue
    return value.trim()
  }
  return undefined
}

export async function fetchAntigravityQuota(session, fetchFn = outboundFetch) {
  const load = await loadAntigravityCodeAssistForQuota(session, fetchFn)
  const projectId = extractCloudaicompanionProject(load)
    ?? (typeof session.projectId === 'string' && session.projectId.trim() ? session.projectId.trim() : undefined)
  let summary
  try {
    summary = await fetchAntigravityQuotaSummary(session.accessToken, projectId, fetchFn)
  } catch (error) {
    if (isQuotaHttpStatus(error, 401)) throw error
    summary = { rows: [] }
  }
  const rows = summary.rows.length
    ? summary.rows
    : await fetchAntigravityModelWindows(session.accessToken, projectId, fetchFn)
  const credits = parseAntigravityPaidCredits(load)
  const planType = pickGoogleAiPlan(
    summary.planType,
    antigravityPlanType(load),
    typeof session.planType === 'string' ? session.planType : undefined,
  )
  return { planType, rows: [...rows, ...credits] }
}
