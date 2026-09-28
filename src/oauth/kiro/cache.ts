/**
 * AWS Kiro / CodeWhisperer conversation cache.
 *
 * Cache affinity is `conversationState.conversationId`. There is no Codex
 * `prompt_cache_key`, no Grok `x-grok-conv-id`, and no Gemini
 * `systemInstruction` pin. Hits surface as `cacheReadInputTokens` on the
 * event stream. Never stamp the id with `Date.now()`.
 *
 * Official kiro.rs parks system as a history user + canned assistant pair
 * (Kiro has no system field). DSH snapshots that would rewrite that pair
 * are pinned per conversationId; extras go at the history suffix, never
 * between an assistant `toolUses` and the matching `toolResults`.
 * conversationId also includes the model id so switching the picker does
 * not reuse another model's AWS conversation.
 */

/** When DSH sends neither session_id nor prompt_cache_key, key on a constant (never pinned). */
export const KIRO_STABLE_SESSION = 'dsh-kiro'

const SYSTEM_PINS = new Map()
const SYSTEM_PIN_CAP = 64

/** `dsh-kiro` or `dsh-kiro:<model>` is not a conversation: it never pins. */
export function isKiroFallback(id) {
  return typeof id !== 'string' || id === '' || id === KIRO_STABLE_SESSION || id.startsWith(`${KIRO_STABLE_SESSION}:`)
}

export function kiroCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetKiroSystemPins() {
  SYSTEM_PINS.clear()
}

function appendKiroModel(base, modelId) {
  const model = kiroCacheSessionId(modelId)
  if (!model) return base
  if (base === model || base.endsWith(`:${model}`)) return base
  const room = 64 - 1 - model.length
  if (room < 1) return model.slice(0, 64)
  return `${base.slice(0, room)}:${model}`
}

/**
 * Pin the first system blob per conversationId. Extra / changed DSH
 * snapshots are returned as `extra` so request.ts can park them after
 * the conversation (user + ack pair), not on currentMessage.
 */
export function pinKiroSystemPrefix(conversationId, systemText) {
  const text = typeof systemText === 'string' ? systemText : ''
  if (!text) return { pinned: '', extra: '' }
  if (isKiroFallback(conversationId)) {
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
  // A different prompt on the same id is its own request: re-pin, send as-is.
  if (unrelatedPrompt(existing, text)) {
    SYSTEM_PINS.set(conversationId, text)
    return { pinned: text, extra: '' }
  }
  const extra = text.startsWith(existing)
    ? text.slice(existing.length).replace(/^\n+/, '').trim()
    : text
  return { pinned: existing, extra }
}

/** Under half of the shorter text shared as prefix + suffix: a different
 * prompt, not an edit of the pinned one. DSH's session-title request shares
 * the chat's session id; parking the chat's prompt behind a pinned title
 * prompt made the model answer with a title. */
function unrelatedPrompt(existing, text) {
  const max = Math.min(existing.length, text.length)
  let prefix = 0
  while (prefix < max && existing.charCodeAt(prefix) === text.charCodeAt(prefix)) prefix += 1
  let suffix = 0
  while (suffix < max - prefix
    && existing.charCodeAt(existing.length - 1 - suffix) === text.charCodeAt(text.length - 1 - suffix)) suffix += 1
  return (prefix + suffix) * 2 < max
}

export function kiroConversationId(payload: any = {}, explicit?) {
  const base = kiroCacheSessionId(explicit)
    ?? kiroCacheSessionId(payload.session_id)
    ?? kiroCacheSessionId(payload.prompt_cache_key)
    ?? KIRO_STABLE_SESSION
  return appendKiroModel(base, payload.model)
}
