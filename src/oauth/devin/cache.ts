/**
 * Devin conversation identity. `cascade_id` threads turns upstream and must
 * stay stable inside one DSH conversation; when DSH hands a stable key we
 * reuse it, otherwise one deterministic cascade per (family, model) is kept.
 * The id is a deterministic UUIDv5-style hash so it always looks like the
 * random UUIDs the CLI generates.
 *
 * Never send Codex/Grok/Cursor fields upstream: prompt_cache_key, session_id,
 * service_tier, retention, cache controls. The DSH cache keys are consumed
 * here to derive `cascade_id` instead.
 */

import { createHash, randomUUID } from 'node:crypto'

/** `devin-` + sanitized dsh pin keeps log lines readable without leaking. */
export function devinCacheSessionId(value) {
  const raw = String(value ?? '').trim()
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  if (!cleaned) return undefined
  return `devin-${cleaned}`.slice(0, 80)
}

/**
 * UUIDv5-shaped digest: stable across turns for the same key, always the
 * 8-4-4-4-12 shape the CLI emits for cascade_id.
 */
export function deterministicDevinId(seed) {
  const hash = createHash('sha256').update(String(seed)).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
}

/**
 * Turn a DSH conversation key into a cascade_id. Falls back to one stable
 * cascade per model so history-free callers still thread consistently.
 */
export function devinCascadeId(payload) {
  const explicit = [payload?.prompt_cache_key, payload?.session_id]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0)
  const seed = explicit || `dsh-devin:${String(payload?.model ?? 'default')}`
  return looksLikeUuid(seed) ? seed : deterministicDevinId(seed)
}

/**
 * Strip provider-foreign cache/session fields before the wire. Returns the
 * rewritten payload plus the ids derived from the consumed keys.
 */
export function applyDevinCache(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { payload, cacheSessionId: undefined }
  }
  const next = { ...payload }
  const cacheSessionId = devinCacheSessionId(next.prompt_cache_key ?? next.session_id ?? '')
  for (const key of [
    'prompt_cache_key',
    'session_id',
    'prompt_cache_retention',
    'prompt_cache_options',
    'cache_control',
    'service_tier',
    'store',
  ]) {
    delete next[key]
  }
  return { payload: next, cacheSessionId }
}

/** `execution_id` is per-request — always a fresh random UUID. */
export function devinExecutionId() {
  return randomUUID()
}
