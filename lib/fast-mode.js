/**
 * Fast / Priority Processing for the DSH proxy.
 *
 * OpenAI Priority Processing (`service_tier: "priority"`) is valid on GPT
 * flagships (gpt-*, o1/o3/o4) and Grok 4.6. Codex-series slugs
 * (`gpt-5.3-codex`, …) and older Grok ids reject the field — strip it.
 *
 * Fast is a `-fast` picker sibling (`gpt-5.5-fast`, `grok-4.6-fast`). The
 * suffix is host-side only and is peeled before the upstream request.
 */

import { peelContextSuffix } from './context-mode.js'
import { peelUltraSuffix, applyUltraEffort } from './ultra-mode.js'

const OPENAI_FAST_PREFIXES = Object.freeze(['gpt-', 'o1', 'o3', 'o4'])
export const FAST_SUFFIX = '-fast'

export function stripVendorPrefix(modelId) {
  let raw = String(modelId ?? '').trim()
  if (raw.includes('/')) raw = raw.slice(raw.lastIndexOf('/') + 1)
  const colon = raw.indexOf(':')
  if (colon > 0) raw = raw.slice(0, colon)
  return raw
}

export function isCodexSeries(modelId) {
  return stripVendorPrefix(modelId).toLowerCase().includes('codex')
}

export function isGrok46Family(modelId) {
  const base = stripVendorPrefix(modelId).toLowerCase()
  return base === 'grok-4.6' || base.startsWith('grok-4.6-')
}

export function modelSupportsFastMode(modelId) {
  const base = stripVendorPrefix(modelId).toLowerCase()
  if (!base) return false
  if (base.includes('codex')) return false
  if (OPENAI_FAST_PREFIXES.some((prefix) => base.startsWith(prefix))) return true
  return isGrok46Family(base)
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

export function resolveFastModeOverrides(modelId) {
  if (!modelSupportsFastMode(modelId)) return null
  return { service_tier: 'priority' }
}

export function applyFastMode(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const next = { ...payload }
  const ultra = peelUltraSuffix(typeof next.model === 'string' ? next.model : '')
  const fast = peelFastSuffix(ultra.model)
  const ctx = peelContextSuffix(fast.model)
  const model = ctx.model
  if (typeof next.model === 'string') next.model = model

  const withEffort = applyUltraEffort(next, ultra.requestedUltra)

  const eligible = modelSupportsFastMode(model)
  if (!eligible) {
    delete withEffort.service_tier
    return withEffort
  }

  if (fast.requestedFast) {
    withEffort.service_tier = 'priority'
    return withEffort
  }
  if (typeof withEffort.service_tier === 'string') return withEffort
  delete withEffort.service_tier
  return withEffort
}

export function withFastVariants(models) {
  const out = []
  for (const model of models) {
    out.push(model)
    if (modelSupportsFastMode(model.id) && !String(model.id).endsWith(FAST_SUFFIX)) {
      out.push({ ...model, id: `${model.id}${FAST_SUFFIX}`, name: `${model.name} Fast` })
    }
  }
  return out
}
