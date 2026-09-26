/**
 * Live Cursor picker catalog. GetUsableModels + AvailableModels collapse
 * into one DSH row per family. A non-empty live list is upstream truth —
 * region-gated or retired families are simply not offered — while
 * CURSOR_MODELS stays the offline fallback only.
 */

import { createHash } from 'node:crypto'
import { CURSOR_MODELS, CURSOR_PARAM_STYLES, CURSOR_REASONING, cursorContextValueTokens, cursorEffortKey, cursorStyleReasoningEfforts, cursorUpstreamProxy } from './index.js'
import { fetchCursorAvailableModels, fetchCursorUsableModels } from './h2-session.js'
import { cursorCatalogCache, cursorCatalogModels, resetCursorCatalogCache, setCursorParamStyles } from './registry.js'

export { cursorCatalogModels, resetCursorCatalogCache } from './registry.js'

export const CURSOR_CATALOG_TTL_MS = 5 * 60_000
export const DEFAULT_CURSOR_CONTEXT_WINDOW = 200_000
export const DEFAULT_CURSOR_MAX_OUTPUT = 64_000
export const GPT56_DEFAULT_CONTEXT_WINDOW = 272_000
export const GPT56_MAX_PROMPT_TOKENS = 500_000

const CURSOR_VISION = Object.freeze(['text', 'image'])
const EFFORT_SUFFIXES = Object.freeze(['extra-high', 'minimal', 'xhigh', 'medium', 'high', 'low', 'none'])
const CONTEXT_SUFFIXES = Object.freeze(['1m', '272k', '256k', '200k', '300k'])

export function cursorCatalogTokenHash(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16)
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
  if (/\b300\s*k\b|(?:^|-)300k(?:-|$)/.test(text)) return 300_000
  if (/\b272\s*k\b|(?:^|-)272k(?:-|$)/.test(text)) return 272_000
  if (/\b256\s*k\b|(?:^|-)256k(?:-|$)/.test(text)) return 256_000
  if (/claude-(?:opus-5|fable-5)/.test(text)) return 300_000
  if (/grok[- ]4\.7(?:\b|-)/.test(text)) return 256_000
  if (/grok[- ]4\.[56](?:\b|-)/.test(text)) return 256_000
  return DEFAULT_CURSOR_CONTEXT_WINDOW
}

/** pi-cursor `inferCursorMaxOutputTokens`. */
export function inferCursorMaxOutputTokens(id, name = '') {
  const text = `${id} ${name}`.toLowerCase()
  if (/claude-(?:fable|opus|sonnet)/.test(text)) return 128_000
  if (/claude-(?:[5-9]|4\.(?:[6-9]|\d{2,}))/.test(text)) return 128_000
  if (/\b(?:sonnet|opus|fable)\s*-?\s*(?:[5-9]|4\.(?:[6-9]|\d{2,}))/.test(text)) return 128_000
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
    // Upstream brands third-party rows "Cursor Grok 4.6"; the picker drops it.
    .replace(/^cursor\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function prettyFamilyName(id) {
  if (id === 'default') return 'Cursor Auto'
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function asPositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function usableRows(models) {
  const out: any[] = []
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
  const out: any[] = []
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

const EFFORT_PARAM_IDS = new Set(['reasoning', 'effort', 'reasoning_effort'])

/**
 * Collapse one family's AvailableModels variants into the parameter style the
 * Run registry validates verbatim: which effort parameter id it takes, the
 * vendor values it advertises (keyed back to DSH levels), its context values,
 * and whether a fast variant exists. Max-mode-only variants are excluded —
 * this hop never sets maxMode, so their parameter sets would be rejected.
 */
export function cursorStylesFromParameterized(models) {
  const styles = new Map()
  for (const model of models ?? []) {
    const name = typeof model?.name === 'string' && model.name.trim() ? model.name.trim() : ''
    const family = cursorPickerFamilyId(name)
    if (!family) continue
    const style = styles.get(family) ?? { effortParam: undefined, efforts: {}, contexts: new Set(), fast: false }
    for (const variant of model.variants ?? []) {
      if (variant?.isMaxMode === true) continue
      for (const parameter of variant.parameters ?? []) {
        if (EFFORT_PARAM_IDS.has(parameter.id)) {
          style.effortParam = parameter.id
          const key = cursorEffortKey(parameter.value)
          if (key) style.efforts[key] = parameter.value
        } else if (parameter.id === 'context' && typeof parameter.value === 'string' && parameter.value) {
          style.contexts.add(parameter.value)
        } else if (parameter.id === 'fast') {
          // Presence of the parameter means the family takes fast at all;
          // variants advertise both true and false rows.
          style.fast = true
        }
      }
    }
    styles.set(family, style)
  }
  // Normalize contexts to a plain array so live styles match the static
  // CURSOR_PARAM_STYLES shape (request.ts iterates both).
  for (const [family, style] of styles) {
    styles.set(family, { ...style, contexts: [...style.contexts] })
  }
  return styles
}



function cursorModelRow(id, name, contextWindow, maxTokens, input = CURSOR_VISION, efforts: any = CURSOR_REASONING) {
  return {
    id,
    name,
    contextWindow,
    maxTokens,
    input: input.includes('image') ? [...CURSOR_VISION] : ['text'],
    reasoningEfforts: efforts === false ? false : { ...efforts },
  }
}

function cloneCursorRow(row) {
  return {
    ...row,
    input: Array.isArray(row.input) ? [...row.input] : [...CURSOR_VISION],
    reasoningEfforts: row.reasoningEfforts === false
      ? false
      : row.reasoningEfforts && typeof row.reasoningEfforts === 'object'
        ? { ...row.reasoningEfforts }
        : { ...CURSOR_REASONING },
  }
}

function cursorPickerRank(id) {
  if (id === 'default') return { group: -1, index: 0, fast: 0, key: id }
  const fast = String(id).endsWith('-fast') ? 1 : 0
  const base = fast ? id.slice(0, -5) : id
  const index = CURSOR_MODELS.findIndex((model) => model.id === base)
  if (index >= 0) return { group: 0, index, fast, key: base }
  return { group: 1, index: 0, fast, key: base }
}

function compareCursorPicker(a, b) {
  const left = cursorPickerRank(a.id)
  const right = cursorPickerRank(b.id)
  if (left.group !== right.group) return left.group - right.group
  if (left.group === 0 && left.index !== right.index) return left.index - right.index
  if (left.key !== right.key) return left.key.localeCompare(right.key)
  return left.fast - right.fast
}

/**
 * Live families overlay the official static floor. Empty live → a copy of
 * CURSOR_MODELS. Non-empty live is the upstream's truth: forcing static rows
 * back in re-offers retired models (e.g. Composer 2) that the account can no
 * longer call.
 */
export function mergeCursorStaticFloor(live) {
  const rows = (live ?? []).map(cloneCursorRow)
  if (rows.length === 0) {
    for (const row of CURSOR_MODELS) rows.push(cloneCursorRow(row))
  }
  rows.sort(compareCursorPicker)
  return rows
}

/** Collapse live ids into one picker row per family, plus `{family}-fast` when a source id is Fast. Empty input → []. */
export function toCursorPickerModels(usable, parameterized: any[] = []) {
  const styles = cursorStylesFromParameterized(parameterized)
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
  const models: any[] = []
  for (const [id, group] of groups) {
    const cleaned = group.names.map(cleanPickerName).filter(Boolean)
    const name = id === 'default'
      ? prettyFamilyName(id)
      : (cleaned.sort((a, b) => a.length - b.length)[0] || prettyFamilyName(id))
    const inferredWindow = inferCursorContextWindow(id, name)
    // AvailableModels carries Max Mode limits on the family; Run never sets
    // maxMode, so prefer the non-Max contexts advertised by its variants.
    const contexts = (styles.get(id)?.contexts ?? []).map(cursorContextValueTokens).filter(Number.isFinite)
    const window = clampCursorContextWindow(
      id,
      name,
      contexts.length ? Math.max(...contexts) : group.windows.length ? Math.max(...group.windows) : inferredWindow,
    )
    const maxTokens = group.outputs.length ? Math.max(...group.outputs) : inferCursorMaxOutputTokens(id, name)
    const input = group.images.some((flag) => flag === false) && !group.images.some((flag) => flag === true)
      ? ['text']
      : CURSOR_VISION
    // Live variants decide the family's effort list + fast flag; a family the
    // parameterized catalog knows but lists no effort parameter for offers
    // none (sending one would 400 the Run).
    const style = styles.get(id) ?? CURSOR_PARAM_STYLES[id]
    const efforts = style ? cursorStyleReasoningEfforts(style) : CURSOR_REASONING
    const hasFast = group.hasFast || styles.get(id)?.fast === true
    models.push(cursorModelRow(id, name, window, maxTokens, input, efforts))
    // Auto / default never grows Fast. Static floor also stays family-only (no Fast).
    if (id !== 'default' && hasFast) {
      models.push(cursorModelRow(`${id}-fast`, `${name} Fast`, window, maxTokens, input, efforts))
    }
  }
  models.sort(compareCursorPicker)
  return models
}

export async function refreshCursorCatalog(session, options: any = {}) {
  const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : ''
  if (!token) return mergeCursorStaticFloor([])
  // The live list is region-filtered: the egress (direct vs configured
  // upstream proxy) changes which families Cursor offers, so it joins the
  // cache key alongside the token.
  const tokenHash = cursorCatalogTokenHash(`${token}\n${cursorUpstreamProxy() ?? ''}`)
  if (cursorCatalogCache.tokenHash === tokenHash && cursorCatalogCache.models?.length && Date.now() < cursorCatalogCache.expiresAt) {
    return cursorCatalogCache.models
  }
  try {
    const fetchUsable = options.fetchUsable ?? fetchCursorUsableModels
    const fetchAvailable = options.fetchAvailable ?? fetchCursorAvailableModels
    const [usable, available] = await Promise.all([
      Promise.resolve(fetchUsable(session, options)).catch(() => []),
      Promise.resolve(fetchAvailable(session, options)).catch(() => []),
    ])
    const styles = cursorStylesFromParameterized(available)
    const models = mergeCursorStaticFloor(toCursorPickerModels(usable, available))
    if (models.length > 0) {
      setCursorParamStyles(styles)
      cursorCatalogCache.tokenHash = tokenHash
      cursorCatalogCache.models = models
      cursorCatalogCache.expiresAt = Date.now() + (options.ttlMs ?? CURSOR_CATALOG_TTL_MS)
      return models
    }
  } catch {
    // Discovery must not block chat or login.
  }
  if (cursorCatalogCache.tokenHash === tokenHash && cursorCatalogCache.models?.length) return cursorCatalogCache.models
  return mergeCursorStaticFloor([])
}
