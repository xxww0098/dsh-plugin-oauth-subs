/**
 * xAI Grok prompt cache — grok-build Responses path.
 *
 * Sticky routing is the grok-build header set (`x-grok-conv-id` +
 * `x-grok-session-id` + `x-grok-req-id` + `x-grok-model-override`).
 * `prompt_cache_key` on the body defaults to the same conversation id
 * and overrides conv-id for routing. Codex `session-id` /
 * `x-client-request-id` are ignored on this backend and must not be copied.
 *
 * Prefix cache is also real: grok-build replays conversation items byte
 * for byte. DSH snapshots that would rewrite the leading system/developer
 * are pinned per conv id; extras park at the input suffix.
 *
 * A later 512-token cache block with <10% reuse is an affinity miss
 * (wrong xAI shard), not a prefix rewrite.
 */

import { randomUUID } from 'node:crypto'

/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export const GROK_STABLE_SESSION = 'dsh-grok'

const SYSTEM_PINS = new Map()
const SYSTEM_PIN_CAP = 64

export function grokCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetGrokSystemPins() {
  SYSTEM_PINS.clear()
}

/**
 * Pin the first leading system/developer blob per conversation. Later text
 * that DSH rewrites is `extra` so request.ts can park it after the
 * conversation, not at the front. Only the changed region is parked: a
 * prepended snapshot or an in-place edit must not re-park the whole blob,
 * which would leave its untouched front permanently uncached.
 */
export function pinGrokSystemPrefix(conversationId, systemText) {
  const text = typeof systemText === 'string' ? systemText : ''
  if (!text) return { pinned: '', extra: '' }
  if (!conversationId || conversationId === GROK_STABLE_SESSION) {
    return { pinned: text, extra: '' }
  }
  const existing = SYSTEM_PINS.get(conversationId)
  if (existing === undefined) {
    if (SYSTEM_PINS.size >= SYSTEM_PIN_CAP) {
      const first = SYSTEM_PINS.keys().next().value
      SYSTEM_PINS.delete(first)
    }
    SYSTEM_PINS.set(conversationId, text)
    return { pinned: text, extra: '' }
  }
  if (existing === text || existing.startsWith(text)) return { pinned: existing, extra: '' }
  if (text.startsWith(existing)) {
    return { pinned: existing, extra: text.slice(existing.length).replace(/^\n+/, '').trim() }
  }
  return { pinned: existing, extra: changedRegion(existing, text) }
}

/** The smallest whole-line slice of `text` that differs from `existing`:
 * strip the longest common prefix and suffix (which never overlap), then
 * widen the change outward to the enclosing line boundaries so the parked
 * text reads as complete lines. Appending keeps the old tail-only park; a
 * prepended snapshot or an in-place edit parks just the changed region
 * instead of the whole blob, keeping its untouched front cacheable. */
function changedRegion(existing, text) {
  const max = Math.min(existing.length, text.length)
  let prefix = 0
  while (prefix < max && existing.charCodeAt(prefix) === text.charCodeAt(prefix)) prefix += 1
  let suffix = 0
  while (suffix < max - prefix
    && existing.charCodeAt(existing.length - 1 - suffix) === text.charCodeAt(text.length - 1 - suffix)) suffix += 1
  const lineStart = text.lastIndexOf('\n', prefix - 1)
  const start = lineStart < 0 ? 0 : lineStart + 1
  const lineEnd = text.indexOf('\n', text.length - suffix)
  const end = lineEnd < 0 ? text.length : lineEnd
  return text.slice(start, end).replace(/^\n+/, '').replace(/\n+$/, '').trim()
}

export function grokConversationId(payload = {}) {
  return grokCacheSessionId(payload.prompt_cache_key)
    || grokCacheSessionId(payload.session_id)
    || GROK_STABLE_SESSION
}

/**
 * grok-build `GrokRequestHeaders`. `reqId` is one UUID per DSH request so
 * retries keep the same id; `retryAttempt` becomes `x-grok-transient-retry`.
 */
export function grokAffinityHeaders(cacheSessionId, extra = {}) {
  if (typeof cacheSessionId !== 'string' || cacheSessionId.length === 0) return {}
  const headers = {
    'x-grok-conv-id': cacheSessionId,
    'x-grok-session-id': cacheSessionId,
    'x-grok-req-id': typeof extra.reqId === 'string' && extra.reqId ? extra.reqId : randomUUID(),
  }
  if (typeof extra.model === 'string' && extra.model.trim()) {
    headers['x-grok-model-override'] = extra.model.trim()
  }
  if (Number(extra.retryAttempt) > 0) {
    headers['x-grok-transient-retry'] = String(extra.retryAttempt)
  }
  return headers
}

export function applyGrokCache(payload) {
  const next = { ...payload }
  const cacheSessionId = grokConversationId(next)
  next.prompt_cache_key = cacheSessionId
  delete next.session_id
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  return { payload: next, cacheSessionId }
}
