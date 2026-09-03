/**
 * Live Cursor picker catalog. GetUsableModels + AvailableModels collapse
 * into one DSH row per family. CURSOR_MODELS is the offline fallback only.
 */

import { createHash } from 'node:crypto'
import { CURSOR_MODELS, CURSOR_REASONING } from './index.js'
import { fetchCursorAvailableModels, fetchCursorUsableModels } from './h2-session.js'

export const CURSOR_CATALOG_TTL_MS = 5 * 60_000
export const DEFAULT_CURSOR_CONTEXT_WINDOW = 200_000
export const DEFAULT_CURSOR_MAX_OUTPUT = 64_000
export const GPT56_DEFAULT_CONTEXT_WINDOW = 272_000
export const GPT56_MAX_PROMPT_TOKENS = 500_000

const CURSOR_VISION = Object.freeze(['text', 'image'])
const EFFORT_SUFFIXES = Object.freeze(['extra-high', 'minimal', 'xhigh', 'medium', 'high', 'low', 'none'])
const CONTEXT_SUFFIXES = Object.freeze(['1m', '272k', '256k', '200k', '300k'])

const cached = { tokenHash: '', models: /** @type {any[] | undefined} */ (undefined), expiresAt: 0 }

export function resetCursorCatalogCache() {
  cached.tokenHash = ''
  cached.models = undefined
  cached.expiresAt = 0
}

export function cursorCatalogTokenHash(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16)
}

export function cursorCatalogModels() {
  return cached.models?.length ? cached.models : [...CURSOR_MODELS]
}

export function isGpt56Model(id, name = '') {
  return /gpt-5\.6/.test(`${id} ${name}`.toLowerCase())
}

export function clampCursorContextWindow(id, name, window) {
  if (isGpt56Model(id, name) && window > GPT56_MAX_PROMPT_TOKENS) return GPT56_MAX_PROMPT_TOKENS
  return window
}

/** pi-cursor `inferCursorContextWindow` — GetUsableModels has no window field. */
export function inferCursorContextWindow(id, name = '') {
  const idLower = String(id ?? '').toLowerCase()
  const text = `${idLower} ${name}`.toLowerCase()
  if (isGpt56Model(id, name)) {
    if (/(?:^|-)1m(?:-|$)/.test(idLower)) return GPT56_MAX_PROMPT_TOKENS
    return GPT56_DEFAULT_CONTEXT_WINDOW
  }
  if (/\b1\s*m\b|(?:^|-)1m(?:-|$)/.test(text)) return 1_000_000
  if (/\b272\s*k\b|(?:^|-)272k(?:-|$)/.test(text)) return 272_000
  if (/\b256\s*k\b|(?:^|-)256k(?:-|$)/.test(text)) return 256_000
  if (/grok[- ]4\.[56](?:\b|-)/.test(text)) return 256_000
  return DEFAULT_CURSOR_CONTEXT_WINDOW
}

/** pi-cursor `inferCursorMaxOutputTokens`. */
export function inferCursorMaxOutputTokens(id, name = '') {
  const text = `${id} ${name}`.toLowerCase()
  if (/claude-(?:[5-9]|4\.(?:[6-9]|\d{2,}))/.test(text)) return 128_000
  if (/\b(?:sonnet|opus)\s*(?:[5-9]|4\.(?:[6-9]|\d{2,}))/.test(text)) return 128_000
  if (/\bgpt-5/.test(text)) return 128_000
  return DEFAULT_CURSOR_MAX_OUTPUT
}

/** Tab / chat internals stay out of the Settings grid (`/cursor.models all` is Pi opt-in). */
export function isCursorInternalModel(id, name = '') {
  const key = String(id ?? '').trim().toLowerCase()
  const text = `${key} ${name}`.toLowerCase()
  if (!key) return true
  if (/(?:^|[\s_-])(?:tab|cursor-small|cmd-k|cpp|speculative)(?:$|[\s_-])/.test(text)) return true
  if (/(?:^|-)(?:tab|chat)(?:-|$)/.test(key)) return true
  return false
}

function peelSuffix(id, suffixes) {
  const lower = id.toLowerCase()
  for (const suffix of suffixes) {
    const marker = `-${suffix}`
    if (lower.endsWith(marker)) return id.slice(0, -marker.length)
  }
  return id
}

/**
 * After peeling effort / thinking / max-mode / window, does this source id
 * still end in `-fast`? That is the live catalog's Fast flag — not Codex
 * `service_tier`. Used to decide whether the picker grows a `{family}-fast`
 * sibling. `cursorPickerFamilyId` still collapses Fast into the family.
 */
export function cursorSourceIsFast(id) {
  let s = String(id ?? '').trim()
  if (!s) return false
  let prev
  do {
    prev = s
    const lower = s.toLowerCase()
    if (lower.endsWith('-thinking')) s = s.slice(0, -9)
    else if (lower.endsWith('-max-mode')) s = s.slice(0, -9)
    else {
      const effort = peelSuffix(s, EFFORT_SUFFIXES)
      if (effort !== s) s = effort
      else {
        const context = peelSuffix(s, CONTEXT_SUFFIXES)
        if (context !== s) s = context
        else if (lower.endsWith('-max') && !/codex-max$/i.test(s)) s = s.slice(0, -4)
      }
    }
  } while (s !== prev && s)
  return s.toLowerCase().endsWith('-fast')
}

/**
 * One picker family id: drop effort / fast / thinking / max-mode / window
 * suffixes. Keep `codex-max` as a product name. Fast is re-emitted as a
 * sibling `{family}-fast` when any source id for that family is Fast.
 */
export function cursorPickerFamilyId(id) {
  let s = String(id ?? '').trim()
  if (!s) return ''
  if (s === 'auto' || s === 'default') return 'default'
  if (s.startsWith('cursor-') && /^(claude|gpt|grok|gemini|composer|kimi)-/i.test(s.slice(7))) {
    s = s.slice(7)
  }
  let prev
  do {
    prev = s
    const lower = s.toLowerCase()
    if (lower.endsWith('-fast')) s = s.slice(0, -5)
    else if (lower.endsWith('-thinking')) s = s.slice(0, -9)
    else if (lower.endsWith('-max-mode')) s = s.slice(0, -9)
    else {
      const effort = peelSuffix(s, EFFORT_SUFFIXES)
      if (effort !== s) s = effort
      else {
        const context = peelSuffix(s, CONTEXT_SUFFIXES)
        if (context !== s) s = context
        else if (lower.endsWith('-max') && !/codex-max$/i.test(s)) s = s.slice(0, -4)
      }
    }
  } while (s !== prev && s)
  return s
}

function cleanPickerName(name) {
  return String(name ?? '')
    .replace(/\s+(None|Low|Medium|High|Extra High|Fast|Thinking|Max(?: Mode)?|1M|272K|256K)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function prettyFamilyName(id) {
  if (id === 'default') return 'Auto'
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function asPositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function usableRows(models) {
  const out = []
  for (const model of models ?? []) {
    const id = typeof model?.id === 'string' && model.id.trim()
      ? model.id.trim()
      : (typeof model?.modelId === 'string' && model.modelId.trim() ? model.modelId.trim() : '')
    if (!id) continue
    const name = model.name || model.displayName || model.displayNameShort || model.displayId || id
    out.push({
      id,
      name,
      contextWindow: asPositive(model.contextWindow ?? model.contextTokenLimit),
      maxTokens: asPositive(model.maxTokens),
      supportsImages: model.supportsImages,
      hasFast: cursorSourceIsFast(id),
    })
  }
  return out
}

function parameterizedRows(models) {
  const out = []
  for (const model of models ?? []) {
    const id = typeof model?.name === 'string' && model.name.trim() ? model.name.trim() : ''
    if (!id) continue
    out.push({
      id,
      name: model.clientDisplayName || model.serverModelName || id,
      contextWindow: asPositive(model.contextTokenLimit) ?? asPositive(model.contextTokenLimitForMaxMode),
      maxTokens: undefined,
      supportsImages: model.supportsImages,
      hasFast: cursorSourceIsFast(id),
    })
  }
  return out
}

function cursorModelRow(id, name, contextWindow, maxTokens, input = CURSOR_VISION) {
  return {
    id,
    name,
    contextWindow,
    maxTokens,
    input: input.includes('image') ? [...CURSOR_VISION] : ['text'],
    reasoningEfforts: { ...CURSOR_REASONING },
  }
}

/** Collapse live ids into one picker row per family, plus `{family}-fast` when a source id is Fast. Empty input → []. */
export function toCursorPickerModels(usable, parameterized = []) {
  const groups = new Map()
  for (const row of [...usableRows(usable), ...parameterizedRows(parameterized)]) {
    if (isCursorInternalModel(row.id, row.name)) continue
    const family = cursorPickerFamilyId(row.id)
    if (!family) continue
    const current = groups.get(family) ?? { names: [], windows: [], outputs: [], images: [], hasFast: false }
    current.names.push(row.name)
    if (row.contextWindow) current.windows.push(row.contextWindow)
    if (row.maxTokens) current.outputs.push(row.maxTokens)
    if (row.supportsImages !== undefined) current.images.push(row.supportsImages)
    if (row.hasFast) current.hasFast = true
    groups.set(family, current)
  }
  const models = []
  for (const [id, group] of groups) {
    const cleaned = group.names.map(cleanPickerName).filter(Boolean)
    const name = id === 'default'
      ? 'Auto'
      : (cleaned.sort((a, b) => a.length - b.length)[0] || prettyFamilyName(id))
    const inferredWindow = inferCursorContextWindow(id, name)
    const window = clampCursorContextWindow(
      id,
      name,
      group.windows.length ? Math.max(...group.windows) : inferredWindow,
    )
    const maxTokens = group.outputs.length ? Math.max(...group.outputs) : inferCursorMaxOutputTokens(id, name)
    const input = group.images.some((flag) => flag === false) && !group.images.some((flag) => flag === true)
      ? ['text']
      : CURSOR_VISION
    models.push(cursorModelRow(id, name, window, maxTokens, input))
    // Auto / default never grows Fast. Static fallback also stays 5 rows.
    if (id !== 'default' && group.hasFast) {
      models.push(cursorModelRow(`${id}-fast`, `${name} Fast`, window, maxTokens, input))
    }
  }
  models.sort((a, b) => {
    if (a.id === 'default') return -1
    if (b.id === 'default') return 1
    return a.id.localeCompare(b.id)
  })
  return models
}

export async function refreshCursorCatalog(session, options = {}) {
  const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : ''
  if (!token) return [...CURSOR_MODELS]
  const tokenHash = cursorCatalogTokenHash(token)
  if (cached.tokenHash === tokenHash && cached.models?.length && Date.now() < cached.expiresAt) {
    return cached.models
  }
  try {
    const fetchUsable = options.fetchUsable ?? fetchCursorUsableModels
    const fetchAvailable = options.fetchAvailable ?? fetchCursorAvailableModels
    const [usable, available] = await Promise.all([
      Promise.resolve(fetchUsable(session, options)).catch(() => []),
      Promise.resolve(fetchAvailable(session, options)).catch(() => []),
    ])
    const models = toCursorPickerModels(usable, available)
    if (models.length > 0) {
      cached.tokenHash = tokenHash
      cached.models = models
      cached.expiresAt = Date.now() + (options.ttlMs ?? CURSOR_CATALOG_TTL_MS)
      return models
    }
  } catch {
    // Discovery must not block chat or login.
  }
  if (cached.tokenHash === tokenHash && cached.models?.length) return cached.models
  return [...CURSOR_MODELS]
}
