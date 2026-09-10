/**
 * Ollama Cloud prompt cache.
 *
 * Official /v1/chat/completions and /api/chat have no documented
 * conversation / shard / cache-read field. This module only strips
 * Codex / Grok fields so they are not forwarded. Do not invent
 * `cached_tokens`, `prompt_cache_key`, or a sticky conversation id.
 * Never stamp Date.now().
 */

export const OLLAMA_STABLE_SESSION = 'dsh-ollama'

export function ollamaCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetOllamaPins() {
  // No in-process prefix map — Ollama Cloud has no documented pin.
}

export function applyOllamaCache(payload = {}) {
  const next = { ...payload }
  delete next.prompt_cache_key
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  delete next.session_id
  return {
    payload: next,
    cacheSessionId: ollamaCacheSessionId(payload.session_id)
      ?? ollamaCacheSessionId(payload.prompt_cache_key)
      ?? OLLAMA_STABLE_SESSION,
  }
}

/** Ollama does not sticky-route on Codex / Grok HTTP headers. */
export function ollamaCacheHeaders() {
  return {}
}
