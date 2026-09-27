/**
 * Anthropic subscription prompt cache.
 *
 * Anthropic prefix caching is content-addressed on api.anthropic.com: the
 * cache key is the request prefix itself (system → tools → messages), and the
 * DSH host already places `cache_control` checkpoints natively when it speaks
 * anthropic-messages — pi-ai's own anthropic lane puts the checkpoint on the
 * system + the last cacheable user block. This hop therefore only keeps the
 * prefix *stable*: nothing here may stamp a conversation id into the body
 * (there is no Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Cursor
 * conversation_id on this wire), and DSH-only cache fields are stripped
 * because the Messages API rejects unknown top-level fields.
 *
 * The derived conversation id is bookkeeping only (quota keys, logs) — it
 * never reaches upstream. Never stamp Date.now(). `dsh-anthropic` is
 * analyzer-only.
 */

export const ANTHROPIC_STABLE_SESSION = 'dsh-anthropic'

export function anthropicCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function anthropicConversationId(payload: any = {}) {
  const metadata = payload?.metadata
  return anthropicCacheSessionId(metadata?.user_id)
    ?? anthropicCacheSessionId(payload.session_id)
    ?? anthropicCacheSessionId(payload.prompt_cache_key)
    ?? ANTHROPIC_STABLE_SESSION
}

/** Messages API rejects unknown top-level fields: DSH cache fields 400. */
const STRIPPED_FIELDS = Object.freeze([
  'session_id',
  'prompt_cache_key',
  'prompt_cache_retention',
  'prompt_cache_options',
])

export function applyAnthropicCache(payload = {}) {
  const cacheSessionId = anthropicConversationId(payload)
  const next = { ...payload }
  for (const key of STRIPPED_FIELDS) delete next[key]
  return { payload: next, cacheSessionId }
}

/**
 * Anthropic does not sticky-route on Codex / Grok HTTP headers — cache
 * affinity is the prefix content itself.
 */
export function anthropicCacheHeaders() {
  return {}
}
