/**
 * Codex large-context — host-side picker aliases.
 *
 * Eligible models advertise a `max_context_window` well above their default
 * window: 872K on GPT-6 Astra and GPT-5.6 Sol / Terra / Luna, 1M on gpt-5.4. The large window
 * is opt-in via a `-900k` suffix, kept as a stable id even though the real
 * ceiling is per-model. The suffix is stripped before the id goes upstream.
 *
 * gpt-5.5, gpt-5.4-mini and Spark cap at their default window — no variant.
 */

import { codexModel, codexSlug } from '../oauth/codex/index.js'

export const CONTEXT_VARIANT_SUFFIX = '-900k'

export function isLargeContextId(modelId) {
  return codexSlug(modelId).endsWith(CONTEXT_VARIANT_SUFFIX)
}

export function isLargeContextKey(key) {
  const id = String(key ?? '').split('/').pop() ?? ''
  return isLargeContextId(id)
}

/** The model's `max_context_window`, or undefined when it has no large variant. */
export function codexLargeContext(modelId) {
  return codexModel(modelId)?.largeContext
}

export function isCodex900kBase(modelId) {
  return codexLargeContext(modelId) !== undefined
}

export function peelContextSuffix(modelId) {
  const raw = String(modelId ?? '')
  if (!raw.toLowerCase().endsWith(CONTEXT_VARIANT_SUFFIX)) {
    return { model: raw, requestedLarge: false }
  }
  const base = raw.slice(0, -CONTEXT_VARIANT_SUFFIX.length)
  if (isCodex900kBase(base)) return { model: base, requestedLarge: true }
  return { model: raw, requestedLarge: false }
}

export function applyContextMode(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  if (typeof payload.model !== 'string') return payload
  const { model } = peelContextSuffix(payload.model)
  if (model === payload.model) return payload
  return { ...payload, model }
}
