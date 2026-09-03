/**
 * Live Kimi Code picker. GET https://api.kimi.com/coding/v1/models after
 * login. KIMI_MODELS is the offline fallback only.
 */

import { createHash } from 'node:crypto'
import {
  KIMI_INPUT,
  KIMI_MAX_TOKENS,
  KIMI_MODELS,
  KIMI_MODELS_URL,
  KIMI_REASONING,
  kimiUpstreamHeaders,
} from './index.js'

export const KIMI_CATALOG_TTL_MS = 5 * 60_000

const cached = { tokenHash: '', models: /** @type {any[] | undefined} */ (undefined), expiresAt: 0 }

export function resetKimiCatalogCache() {
  cached.tokenHash = ''
  cached.models = undefined
  cached.expiresAt = 0
}

export function kimiCatalogTokenHash(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16)
}

export function kimiCatalogModels() {
  return cached.models?.length ? cached.models : [...KIMI_MODELS]
}

function asPositiveInt(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.trunc(n)
}

function parseThinkEfforts(value) {
  if (!value || typeof value !== 'object' || value.support !== true) return undefined
  const valid = Array.isArray(value.valid_efforts)
    ? value.valid_efforts.filter((effort) => typeof effort === 'string' && effort)
    : []
  if (valid.length === 0) return undefined
  return { supportEfforts: valid, defaultEffort: typeof value.default_effort === 'string' ? value.default_effort : undefined }
}

export function kimiReasoningEffortsOf(row) {
  const thinkingType = row?.supports_thinking_type ?? row?.supportsThinkingType
  if (thinkingType === 'no' || row?.supports_reasoning === false) return undefined
  const parsed = parseThinkEfforts(row?.think_efforts ?? row?.thinkEfforts)
  const allowed = parsed?.supportEfforts
  const efforts = {}
  for (const [level, wire] of Object.entries(KIMI_REASONING)) {
    if (level === 'off') {
      if (thinkingType !== 'only') efforts.off = 'off'
      continue
    }
    if (!allowed || allowed.includes(wire)) efforts[level] = wire
  }
  return Object.keys(efforts).length > 0 ? efforts : { ...KIMI_REASONING }
}

export function toKimiPickerModels(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  const seen = new Set()
  const models = []
  for (const row of rows) {
    const id = typeof row?.id === 'string' && row.id.trim() ? row.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    const name = typeof row.display_name === 'string' && row.display_name.trim()
      ? (id === 'k3' && /^k3$/i.test(row.display_name) ? 'Kimi K3' : row.display_name.trim())
      : (KIMI_MODELS.find((model) => model.id === id)?.name ?? id)
    const window = asPositiveInt(row.context_length ?? row.contextLength) ?? KIMI_MODELS.find((model) => model.id === id)?.contextWindow
    const input = [...KIMI_INPUT]
    if (row.supports_image_in === false) {
      const at = input.indexOf('image')
      if (at >= 0) input.splice(at, 1)
    }
    const reasoningEfforts = kimiReasoningEffortsOf(row)
    models.push({
      id,
      name,
      contextWindow: window ?? 262_144,
      maxTokens: KIMI_MAX_TOKENS,
      input,
      ...(reasoningEfforts ? { reasoningEfforts } : {}),
    })
  }
  models.sort((left, right) => left.id.localeCompare(right.id))
  return models
}

export async function refreshKimiCatalog(session, options = {}) {
  const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : ''
  if (!token) return [...KIMI_MODELS]
  const tokenHash = kimiCatalogTokenHash(token)
  if (cached.tokenHash === tokenHash && cached.models?.length && Date.now() < cached.expiresAt) {
    return cached.models
  }
  try {
    const fetchFn = options.fetchFn ?? fetch
    const response = await fetchFn(KIMI_MODELS_URL, {
      headers: {
        ...kimiUpstreamHeaders(session),
        accept: 'application/json',
      },
      signal: options.signal,
    })
    if (response.ok) {
      const parsed = toKimiPickerModels(await response.json())
      if (parsed.length > 0) {
        cached.tokenHash = tokenHash
        cached.models = parsed
        cached.expiresAt = Date.now() + (options.ttlMs ?? KIMI_CATALOG_TTL_MS)
        return parsed
      }
    }
  } catch {
    // Discovery must not block chat or login.
  }
  if (cached.tokenHash === tokenHash && cached.models?.length) return cached.models
  return [...KIMI_MODELS]
}
