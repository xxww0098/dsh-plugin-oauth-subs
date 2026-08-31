/**
 * AWS Kiro / CodeWhisperer conversation cache.
 *
 * Cache affinity is `conversationState.conversationId`. There is no Codex
 * `prompt_cache_key`, no Grok `x-grok-conv-id`, and no Gemini
 * `systemInstruction` pin. Hits surface as `cacheReadInputTokens` on the
 * event stream. Never stamp the id with `Date.now()`.
 */

/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export const KIRO_STABLE_SESSION = 'dsh-kiro'

export function kiroCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function kiroConversationId(payload = {}, explicit) {
  return kiroCacheSessionId(explicit)
    ?? kiroCacheSessionId(payload.session_id)
    ?? kiroCacheSessionId(payload.prompt_cache_key)
    ?? KIRO_STABLE_SESSION
}
