/**
 * Fast / Priority Processing for the DSH proxy.
 *
 * Fast is the Codex catalog's `priority` service tier — "1.5x speed, increased
 * usage". Measured at 88.3 against 57.5 output tokens/second on gpt-5.6-luna
 * (1.54x, four interleaved runs, 2026-08-26); it lifts generation throughput
 * only, not time to first token. Eligibility comes from each model's catalog
 * row, so models whose `service_tiers` is empty — gpt-5.4-mini, Spark — never
 * get the suffix. On xAI, Grok 4.6 accepts Priority Processing; older ids
 * reject the field outright.
 *
 * The `-fast` suffix is host-side only and is peeled before the upstream request.
 */

import { codexModel, codexSlug } from './codex.js'
import { peelContextSuffix } from './context-mode.js'

export const FAST_SUFFIX = '-fast'

export function isGrok46Family(modelId) {
  const base = codexSlug(modelId)
  return base === 'grok-4.6' || base.startsWith('grok-4.6-')
}

/** Eligibility is a property of the base model, so peel host-side aliases first. */
export function modelSupportsFastMode(modelId) {
  const base = peelContextSuffix(String(modelId ?? '')).model
  const model = codexModel(base)
  return model === undefined ? isGrok46Family(base) : model.fastTier === true
}

export function peelFastSuffix(modelId) {
  const raw = String(modelId ?? '')
  if (!raw.toLowerCase().endsWith(FAST_SUFFIX)) {
    return { model: raw, requestedFast: false }
  }
  const base = raw.slice(0, -FAST_SUFFIX.length)
  if (modelSupportsFastMode(base)) return { model: base, requestedFast: true }
  return { model: raw, requestedFast: false }
}

export function applyFastMode(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const next = { ...payload }
  const fast = peelFastSuffix(typeof next.model === 'string' ? next.model : '')
  const model = peelContextSuffix(fast.model).model
  if (typeof next.model === 'string') next.model = model

  if (fast.requestedFast) {
    next.service_tier = 'priority'
    return next
  }
  if (modelSupportsFastMode(model) && typeof next.service_tier === 'string') return next
  delete next.service_tier
  return next
}
