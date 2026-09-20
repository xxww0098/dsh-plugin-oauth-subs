/**
 * Live Cline picker. `GET {apiBase}/ai/cline/recommended-models` is public
 * (no auth) and returns four buckets; `CLINE_MODELS` is the offline seed.
 *
 * This hop lists `recommended` + `free` only. The pinned CLI catalogues the
 * *whole* OpenRouter set for the `cline` provider (`buildClineModels`), but
 * `clinePass` / `clineCloud` are the separate ClinePass product and the
 * remaining OpenRouter ids are not what Cline features — listing 370 rows
 * would also write 370 default-on model entries into settings.yaml.
 */

import { CLINE_DEFAULT_CONTEXT, CLINE_DEFAULT_MAX_TOKENS, CLINE_INPUT, CLINE_MODELS, CLINE_RECOMMENDED_MODELS_URL, CLINE_REASONING } from './index.js'

export const CLINE_CATALOG_TTL_MS = 10 * 60_000

const cached: { models?: any[]; expiresAt: number } = { models: undefined, expiresAt: 0 }

export function resetClineCatalogCache() {
  cached.models = undefined
  cached.expiresAt = 0
}

export function clineCatalogModels() {
  return cached.models?.length ? cached.models : [...CLINE_MODELS]
}

function slugOf(id) {
  const text = typeof id === 'string' ? id.trim() : ''
  if (!text) return ''
  return text.split('/').at(-1) ?? text
}

function factTable(models) {
  const byId = new Map()
  const bySlug = new Map()
  for (const model of models) {
    byId.set(model.id, model)
    const slug = slugOf(model.id)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, model)
  }
  return { byId, bySlug }
}

function asPositiveInt(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.trunc(n)
}

function pickerRow(entry, { facts, free }) {
  const id = typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim() : ''
  if (!id) return undefined
  const fact = facts.byId.get(id) ?? facts.bySlug.get(slugOf(id))
  const feedName = typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim() : ''
  const baseName = fact?.name?.trim() || feedName || id
  const name = free && !/\(free\)$/i.test(baseName) ? `${baseName} (free)` : baseName
  return {
    id,
    name,
    contextWindow: asPositiveInt(fact?.contextWindow) ?? CLINE_DEFAULT_CONTEXT,
    maxTokens: asPositiveInt(fact?.maxTokens) ?? CLINE_DEFAULT_MAX_TOKENS,
    input: Array.isArray(fact?.input) && fact.input.length > 0 ? [...fact.input] : [...CLINE_INPUT],
    reasoningEfforts: { ...CLINE_REASONING },
  }
}

/**
 * `normalizeClineRecommendedProviderModels` narrowed to the `cline` product:
 * `recommended` + `free`, de-duplicated by id, declared order preserved.
 */
export function toClinePickerModels(payload, { models = CLINE_MODELS } = {}) {
  const facts = factTable(models)
  const seen = new Set()
  const rows: any[] = []
  const buckets: Array<[string, boolean]> = [['recommended', false], ['free', true]]
  for (const [bucket, free] of buckets) {
    const list = Array.isArray(payload?.[bucket]) ? payload[bucket] : []
    for (const entry of list) {
      const row = pickerRow(entry, { facts, free })
      if (!row || seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
    }
  }
  return rows
}

export async function refreshClineCatalog(session, options: any = {}) {
  const ttlMs = options.ttlMs ?? CLINE_CATALOG_TTL_MS
  if (cached.models?.length && Date.now() < cached.expiresAt) return cached.models
  try {
    const fetchFn = options.fetchFn ?? fetch
    const response = await fetchFn(CLINE_RECOMMENDED_MODELS_URL, {
      headers: { accept: 'application/json' },
      signal: options.signal,
    })
    if (response.ok) {
      const parsed = toClinePickerModels(await response.json(), { models: options.models ?? CLINE_MODELS })
      if (parsed.length > 0) {
        cached.models = parsed
        cached.expiresAt = Date.now() + ttlMs
        return parsed
      }
    }
  } catch {
    // Discovery must not block chat or login.
  }
  if (cached.models?.length) return cached.models
  return [...CLINE_MODELS]
}
