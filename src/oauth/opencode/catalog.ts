/**
 * Live OpenCode Free picker. GET https://opencode.ai/zen/v1/models
 * anonymously (no Authorization), keep *-free slugs that are not Go-keyed.
 * OPENCODE_MODELS is the offline fallback only.
 */

import {
  OPENCODE_DEFAULT_MAX_TOKENS,
  OPENCODE_INPUT,
  OPENCODE_KEYED_FREE,
  OPENCODE_MODELS,
  OPENCODE_MODELS_URL,
  OPENCODE_REFERER,
  OPENCODE_TITLE,
  OPENCODE_USER_AGENT,
  isOpencodeFreeSlug,
  opencodePrettyName,
  opencodeUpstreamHeaders,
} from './index.js'

export const OPENCODE_CATALOG_TTL_MS = 5 * 60_000

const cached = { models: /** @type {any[] | undefined} */ (undefined), expiresAt: 0 }

export function resetOpencodeCatalogCache() {
  cached.models = undefined
  cached.expiresAt = 0
}

export function opencodeCatalogModels() {
  return cached.models?.length ? cached.models : [...OPENCODE_MODELS]
}

export function toOpencodePickerModels(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  const seen = new Set()
  const models = []
  for (const row of rows) {
    const id = typeof row?.id === 'string' ? row.id.trim() : ''
    if (!id || !isOpencodeFreeSlug(id) || OPENCODE_KEYED_FREE.has(id.toLowerCase()) || seen.has(id)) continue
    seen.add(id)
    models.push({
      id,
      name: opencodePrettyName(id),
      contextWindow: typeof row.context_window === 'number' && row.context_window > 0
        ? row.context_window
        : OPENCODE_MODELS.find((model) => model.id === id)?.contextWindow ?? 128_000,
      maxTokens: OPENCODE_DEFAULT_MAX_TOKENS,
      input: [...OPENCODE_INPUT],
    })
  }
  models.sort((left, right) => left.id.localeCompare(right.id))
  return models
}

export async function refreshOpencodeCatalog({ fetchFn = fetch, signal, force = false } = {}) {
  if (!force && cached.models?.length && Date.now() < cached.expiresAt) return cached.models
  try {
    const response = await fetchFn(OPENCODE_MODELS_URL, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        ...opencodeUpstreamHeaders(),
        'user-agent': OPENCODE_USER_AGENT,
        'http-referer': OPENCODE_REFERER,
        'x-title': OPENCODE_TITLE,
      },
      signal,
    })
    if (!response.ok) return opencodeCatalogModels()
    const models = toOpencodePickerModels(await response.json())
    if (!models.length) return opencodeCatalogModels()
    cached.models = models
    cached.expiresAt = Date.now() + OPENCODE_CATALOG_TTL_MS
    return models
  } catch {
    return opencodeCatalogModels()
  }
}
