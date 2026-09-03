/**
 * Live OpenCode Free picker. GET https://opencode.ai/zen/v1/models
 * anonymously (no Authorization), keep official Free ids that Zen still lists.
 * Overlay matching models.dev `opencode.models` for windows / input /
 * reasoning. OPENCODE_MODELS is the offline fallback only.
 */

import {
  OPENCODE_DEFAULT_MAX_TOKENS,
  OPENCODE_INPUT,
  OPENCODE_KEYED_FREE,
  OPENCODE_MODELS,
  OPENCODE_MODELS_DEV_URL,
  OPENCODE_MODELS_URL,
  OPENCODE_REFERER,
  OPENCODE_TITLE,
  OPENCODE_USER_AGENT,
  OPENCODE_VISION_INPUT,
  isOpencodeFreeSlug,
  opencodePrettyName,
  opencodeUpstreamHeaders,
} from './index.js'

export const OPENCODE_CATALOG_TTL_MS = 5 * 60_000
const DSH_THINKING_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

const cached = { models: /** @type {any[] | undefined} */ (undefined), expiresAt: 0 }

export function resetOpencodeCatalogCache() {
  cached.models = undefined
  cached.expiresAt = 0
}

export function opencodeCatalogModels() {
  return cached.models?.length ? cached.models : [...OPENCODE_MODELS]
}

function asPositiveInt(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.trunc(n)
}

/** DSH picker only speaks text / image. Never invent audio / video / pdf. */
export function opencodePickerInput(modalities) {
  const list = Array.isArray(modalities) ? modalities : []
  const hasImage = list.some((item) => String(item).toLowerCase() === 'image')
  return hasImage ? [...OPENCODE_VISION_INPUT] : [...OPENCODE_INPUT]
}

/**
 * models.dev `reasoning_options` → DSH reasoningEfforts.
 * Empty options + reasoning true → omit (vendor default; no false).
 * toggle → `{ off: 'none', high: 'high' }`.
 */
export function opencodeReasoningEffortsOf(dev) {
  if (!dev || typeof dev !== 'object') return undefined
  const raw = dev.reasoning_options ?? dev.reasoningOptions
  const options = Array.isArray(raw) ? raw : []
  const effort = options.find((row) => row?.type === 'effort' && Array.isArray(row.values))
  if (effort) {
    const map = {}
    for (const value of effort.values) {
      const wire = String(value ?? '').trim().toLowerCase()
      if (!wire) continue
      if (wire === 'none' || wire === 'off') {
        map.off = wire === 'off' ? 'off' : 'none'
        continue
      }
      if (DSH_THINKING_LEVELS.includes(wire)) map[wire] = wire
    }
    return Object.keys(map).length ? map : undefined
  }
  if (options.some((row) => row?.type === 'toggle')) {
    return { off: 'none', high: 'high' }
  }
  return undefined
}

export function modelsDevOpencodeMap(payload) {
  const models = payload?.opencode?.models
  if (!models || typeof models !== 'object' || Array.isArray(models)) return new Map()
  const map = new Map()
  for (const [id, row] of Object.entries(models)) {
    if (row && typeof row === 'object') map.set(id, row)
  }
  return map
}

export function applyOpencodeModelsDev(model, dev) {
  if (dev && typeof dev === 'object') {
    const next = {
      ...model,
      contextWindow: asPositiveInt(dev.limit?.context) ?? model.contextWindow,
      maxTokens: asPositiveInt(dev.limit?.output) ?? model.maxTokens,
      input: opencodePickerInput(dev.modalities?.input),
    }
    const efforts = opencodeReasoningEffortsOf(dev)
    if (efforts) next.reasoningEfforts = efforts
    else delete next.reasoningEfforts
    return next
  }
  const floor = OPENCODE_MODELS.find((row) => row.id === model.id)
  if (!floor) return model
  const next = {
    ...model,
    contextWindow: floor.contextWindow,
    maxTokens: floor.maxTokens,
    input: [...floor.input],
  }
  if (floor.reasoningEfforts) next.reasoningEfforts = { ...floor.reasoningEfforts }
  else delete next.reasoningEfforts
  return next
}

/** Overlay models.dev onto Zen ids only. Never add a slug Zen did not list. */
export function overlayOpencodeModelsDev(models, payload) {
  const spec = modelsDevOpencodeMap(payload)
  return (Array.isArray(models) ? models : []).map((model) => applyOpencodeModelsDev(model, spec.get(model.id)))
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
      maxTokens: OPENCODE_MODELS.find((model) => model.id === id)?.maxTokens ?? OPENCODE_DEFAULT_MAX_TOKENS,
      input: [...OPENCODE_INPUT],
    })
  }
  models.sort((left, right) => left.id.localeCompare(right.id))
  return models
}

async function fetchOpencodeModelsDev({ fetchFn, signal }) {
  try {
    const response = await fetchFn(OPENCODE_MODELS_DEV_URL, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': OPENCODE_USER_AGENT,
      },
      signal,
    })
    if (!response.ok) return undefined
    return await response.json()
  } catch {
    return undefined
  }
}

export async function refreshOpencodeCatalog({ fetchFn = fetch, signal, force = false } = {}) {
  if (!force && cached.models?.length && Date.now() < cached.expiresAt) return cached.models
  try {
    const [zenResponse, devPayload] = await Promise.all([
      fetchFn(OPENCODE_MODELS_URL, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          ...opencodeUpstreamHeaders(),
          'user-agent': OPENCODE_USER_AGENT,
          'http-referer': OPENCODE_REFERER,
          'x-title': OPENCODE_TITLE,
        },
        signal,
      }),
      fetchOpencodeModelsDev({ fetchFn, signal }),
    ])
    if (!zenResponse.ok) return opencodeCatalogModels()
    const listed = toOpencodePickerModels(await zenResponse.json())
    if (!listed.length) return opencodeCatalogModels()
    const models = overlayOpencodeModelsDev(listed, devPayload)
    cached.models = models
    cached.expiresAt = Date.now() + OPENCODE_CATALOG_TTL_MS
    return models
  } catch {
    return opencodeCatalogModels()
  }
}
