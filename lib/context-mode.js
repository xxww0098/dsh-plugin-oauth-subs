/**
 * Codex 900K context window — host-side picker aliases.
 *
 * ChatGPT Codex advertises 272K for gpt-5.4 and gpt-5.6 (Sol / Terra / Luna)
 * but subscription accounts accept ~900K. The large window is opt-in via a
 * `-900k` suffix. The suffix is stripped before the model id is sent upstream.
 *
 * gpt-5.5 and gpt-5.4-mini enforce 272K — no 900K variant.
 */

export const CONTEXT_VARIANT_SUFFIX = '-900k'
export const CODEX_ADVERTISED_CONTEXT = 272_000
export const CODEX_LARGE_CONTEXT = 900_000

const ELIGIBLE_BASES = Object.freeze([
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.4',
])

const SNAPSHOT_BASES = Object.freeze(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'])
const SNAPSHOT_RE = /^\d{4}-\d{2}-\d{2}$/

function bareSlug(modelId) {
  let raw = String(modelId ?? '').trim()
  if (raw.includes('/')) raw = raw.slice(raw.lastIndexOf('/') + 1)
  return raw.toLowerCase()
}

export function isCodex900kBase(modelId) {
  const slug = bareSlug(modelId)
  if (!slug || slug.endsWith(CONTEXT_VARIANT_SUFFIX)) return false
  if (ELIGIBLE_BASES.includes(slug)) return true
  for (const base of SNAPSHOT_BASES) {
    if (slug.startsWith(`${base}-`) && SNAPSHOT_RE.test(slug.slice(base.length + 1))) return true
  }
  return false
}

export function isLargeContextId(modelId) {
  return bareSlug(modelId).endsWith(CONTEXT_VARIANT_SUFFIX)
}

export function isLargeContextKey(key) {
  const id = String(key ?? '').split('/').pop() ?? ''
  return isLargeContextId(id)
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

export function withContextVariants(models) {
  const out = []
  for (const model of models) {
    out.push(model)
    if (!isCodex900kBase(model.id)) continue
    out.push({
      ...model,
      id: `${model.id}${CONTEXT_VARIANT_SUFFIX}`,
      name: `${model.name} 900K`,
      contextWindow: CODEX_LARGE_CONTEXT,
    })
  }
  return out
}
