/**
 * Fast / Priority Processing for the DSH proxy.
 *
 * Fast is Codex-only. Eligible catalog rows (gpt-6-astra, gpt-5.6-sol/terra/luna,
 * gpt-5.5, gpt-5.4 — not mini, not Spark) grow a host-side `-fast` sibling. The suffix
 * is peeled before the wire; the request then asks for Priority the way Codex
 * CLI does: body `service_tier: "priority"` plus
 * `x-codex-routing-hint: model=<id>;tier=priority`.
 *
 * Grok never gets a `-fast` row and never sends `service_tier`. Grok 4.6
 * accepts `priority` on the wire but a 2026-08-30 interleaved run showed no
 * throughput gain (ratio 0.994). Older Grok ids reject the field; a stale
 * `grok-*-fast` id is still peeled so it cannot 400 as a fake model.
 *
 * Suffix peeling does not read `fast-mode.json`. That leftover UI toggle is
 * ignored.
 */

import { codexModel } from '../oauth/codex/index.js'
import { peelContextSuffix } from './context-mode.js'

export const FAST_SUFFIX = '-fast'

/** Eligibility is a property of the Codex catalog row, so peel host aliases first. */
export function modelSupportsFastMode(modelId) {
  const base = peelContextSuffix(String(modelId ?? '')).model
  return codexModel(base)?.fastTier === true
}

export function peelFastSuffix(modelId) {
  const raw = String(modelId ?? '')
  if (!raw.toLowerCase().endsWith(FAST_SUFFIX)) {
    return { model: raw, requestedFast: false }
  }
  const base = raw.slice(0, -FAST_SUFFIX.length)
  if (!base) return { model: raw, requestedFast: false }
  return { model: base, requestedFast: modelSupportsFastMode(base) }
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
