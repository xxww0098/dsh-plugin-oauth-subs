/**
 * Large-context ceilings and stale-alias peeling.
 *
 * Some catalog rows advertise a `maxContextWindow` well above the window
 * their plan serves by default: Codex rows carry `max_context_window` 872K
 * on top of the 258K default; GLM-5.3 / GLM-5.3-Flash keep the official 1M
 * window (docs.z.ai model page) on top of the plan's 400K input cap. Devin /
 * Cline / Command Code / Ollama rows can carry one too (same family-scoped
 * lookup) — their sources expose a single window each, so none declares one
 * yet; the slot is what makes a maintainer pin (or a source that later grows
 * a second field) authoritative instead of silently ignored. The
 * large window is the row's custom input-context ceiling (`maxContextOfRow`)
 * — older plugin versions also grew opt-in `-900k` / `-1m` picker rows from
 * it; those rows no longer exist, but `peelContextSuffix` keeps stripping
 * the suffix from routes those versions wrote (strict base validation, so
 * real ids that merely end in a suffix — Devin's `-1m` backends — go
 * upstream untouched).
 */

import { commandCodeModelById } from '../apikey/command-code/index.js'
import { ollamaModel } from '../apikey/ollama/index.js'
import { codexModel } from '../oauth/codex/index.js'
import { clineModel } from '../oauth/cline/index.js'
import { copilotModel } from '../oauth/copilot/index.js'
import { devinModel } from '../oauth/devin/index.js'
import { glmModel } from '../oauth/glm/index.js'

export const CONTEXT_VARIANT_SUFFIX = '-900k'

/**
 * 872000 -> "872K", 1000000 -> "1M". Windows that are exact binary sizes
 * (and not decimal ones) keep their nominal label: 1048576 -> "1M",
 * 262144 -> "256K", instead of the misleading "1049K" / "262K".
 */
export function formatWindow(tokens) {
  if (tokens % 1_000_000 === 0) return `${tokens / 1_000_000}M`
  if (tokens % 1000 !== 0) {
    if (tokens % 1_048_576 === 0) return `${tokens / 1_048_576}M`
    if (tokens % 1024 === 0) return `${tokens / 1024}K`
  }
  return `${Math.round(tokens / 1000)}K`
}

/** The Codex row's `max_context_window`, or undefined when it has none. */
export function codexMaxContextWindow(modelId) {
  return codexModel(modelId)?.maxContextWindow
}

/** The row's `maxContextWindow` across families, or undefined when it has none. */
export function maxContextWindowOf(modelId) {
  return codexMaxContextWindow(modelId) ?? glmModel(modelId)?.maxContextWindow ?? copilotModel(modelId)?.maxContextWindow
}

/**
 * Family-scoped ceiling lookup. Vendor ids collide across families
 * (`gpt-6-sol` exists in both `codex` and `copilot`, with different ceilings),
 * so `maxContextOfRow` resolves the row inside its own family and falls back
 * to the row's catalog window — never another family's ceiling. Codex / GLM /
 * Copilot answer from their own catalog lookups; Devin / Cline / Command Code
 * / Ollama are plain static floors, so their branch scans the frozen rows.
 */
export function familyMaxContextWindow(family, modelId) {
  switch (family) {
    case 'codex': return codexMaxContextWindow(modelId)
    case 'glm': return glmModel(modelId)?.maxContextWindow
    case 'copilot': return copilotModel(modelId)?.maxContextWindow
    case 'devin': return devinModel(modelId)?.maxContextWindow
    case 'cline': return clineModel(modelId)?.maxContextWindow
    case 'command-code': return commandCodeModelById(modelId)?.maxContextWindow
    case 'ollama': return ollamaModel(modelId)?.maxContextWindow
    default: return undefined
  }
}

export function isCodex900kBase(modelId) {
  return codexMaxContextWindow(modelId) !== undefined
}

function isGlm1mBase(modelId) {
  return glmModel(modelId)?.maxContextWindow !== undefined
}

/**
 * Codex keeps its established `-900k` alias for the 872K ceiling; other
 * families derive the suffix from the window (`-1m`).
 */
export function contextVariantSuffix(modelId, large) {
  return isCodex900kBase(modelId) ? CONTEXT_VARIANT_SUFFIX : `-${formatWindow(large).toLowerCase()}`
}

const LARGE_CONTEXT_SUFFIXES = Object.freeze([
  { suffix: CONTEXT_VARIANT_SUFFIX, isBase: isCodex900kBase },
  { suffix: '-1m', isBase: isGlm1mBase },
])

/**
 * Picker classification is suffix-surface: any id ending in a known context
 * suffix is an opt-in alias, even when the base is not in the static catalog
 * (live rows, renamed ids) — an unknown `-900k` / `-1m` key must stay opt-in,
 * never default-on. Peeling is the opposite: strict base validation, so an
 * unknown `foo-1m` model id reaches upstream untouched.
 */
export function isLargeContextId(modelId) {
  const raw = String(modelId ?? '').toLowerCase()
  return LARGE_CONTEXT_SUFFIXES.some(({ suffix }) => raw.endsWith(suffix))
}

export function isLargeContextKey(key) {
  const id = String(key ?? '').split('/').pop() ?? ''
  return isLargeContextId(id)
}

export function peelContextSuffix(modelId) {
  const raw = String(modelId ?? '')
  for (const { suffix, isBase } of LARGE_CONTEXT_SUFFIXES) {
    if (!raw.toLowerCase().endsWith(suffix)) continue
    const base = raw.slice(0, -suffix.length)
    if (base && isBase(base)) return { model: base, requestedLarge: true }
    return { model: raw, requestedLarge: false }
  }
  return { model: raw, requestedLarge: false }
}

export function applyContextMode(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  if (typeof payload.model !== 'string') return payload
  const { model } = peelContextSuffix(payload.model)
  if (model === payload.model) return payload
  return { ...payload, model }
}
