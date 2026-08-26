/**
 * GPT-5.6 Ultra — host-side picker alias.
 *
 * ChatGPT Codex exposes Ultra as a product mode on Sol / Terra / Luna
 * (Plus and above). DeepSeek Harness reasoning levels stop at `max`, so
 * Ultra is a `-ultra` sibling. The suffix is stripped and
 * `reasoning.effort` is set to `ultra` before the upstream request.
 *
 * Default off: four-way multi-agent burns quota.
 */

export const ULTRA_SUFFIX = '-ultra'

const ULTRA_BASES = Object.freeze(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'])
const SNAPSHOT_RE = /^\d{4}-\d{2}-\d{2}$/

function bareSlug(modelId) {
  let raw = String(modelId ?? '').trim()
  if (raw.includes('/')) raw = raw.slice(raw.lastIndexOf('/') + 1)
  return raw.toLowerCase()
}

export function isUltraBase(modelId) {
  const slug = bareSlug(modelId)
  if (!slug || slug.endsWith(ULTRA_SUFFIX)) return false
  if (ULTRA_BASES.includes(slug)) return true
  for (const base of ULTRA_BASES) {
    if (slug.startsWith(`${base}-`) && SNAPSHOT_RE.test(slug.slice(base.length + 1))) return true
  }
  return false
}

export function isUltraId(modelId) {
  return bareSlug(modelId).endsWith(ULTRA_SUFFIX)
}

export function isUltraKey(key) {
  const id = String(key ?? '').split('/').pop() ?? ''
  return isUltraId(id)
}

export function peelUltraSuffix(modelId) {
  const raw = String(modelId ?? '')
  if (!raw.toLowerCase().endsWith(ULTRA_SUFFIX)) {
    return { model: raw, requestedUltra: false }
  }
  const base = raw.slice(0, -ULTRA_SUFFIX.length)
  if (isUltraBase(base)) return { model: base, requestedUltra: true }
  return { model: raw, requestedUltra: false }
}

export function applyUltraEffort(payload, requestedUltra) {
  if (!requestedUltra) return payload
  const reasoning = payload.reasoning && typeof payload.reasoning === 'object' && !Array.isArray(payload.reasoning)
    ? { ...payload.reasoning }
    : {}
  reasoning.effort = 'ultra'
  return { ...payload, reasoning }
}

export function withUltraVariants(models) {
  const out = []
  for (const model of models) {
    out.push(model)
    if (isUltraBase(model.id)) {
      out.push({ ...model, id: `${model.id}${ULTRA_SUFFIX}`, name: `${model.name} Ultra` })
    }
  }
  return out
}
