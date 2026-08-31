/**
 * xAI Grok prompt cache.
 *
 * Grok sticky-routes by `x-grok-conv-id`. Codex `session-id` /
 * `x-client-request-id` are ignored on this backend and must not be copied.
 * The body still carries `prompt_cache_key` with the same cleaned id.
 *
 * A later 512-token cache block with <10% reuse is an affinity miss
 * (wrong xAI shard), not a prefix rewrite.
 */

export function grokCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function grokAffinityHeaders(cacheSessionId) {
  if (typeof cacheSessionId !== 'string' || cacheSessionId.length === 0) return {}
  return { 'x-grok-conv-id': cacheSessionId }
}

export function applyGrokCache(payload) {
  const next = { ...payload }
  const cacheSessionId = grokCacheSessionId(next.prompt_cache_key)
    || grokCacheSessionId(next.session_id)
  if (cacheSessionId) next.prompt_cache_key = cacheSessionId
  else delete next.prompt_cache_key
  return { payload: next, cacheSessionId }
}
