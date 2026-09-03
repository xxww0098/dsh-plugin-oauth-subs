/**
 * Cursor AgentService conversation cache.
 *
 * Sticky identity is `AgentRunRequest.conversation_id` (verified in
 * Rahularya01/pi-cursor proto/agent.proto + request-build.ts). There is no
 * Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Gemini sessionId
 * header, and no Kiro conversationState field copied onto this hop.
 * Never stamp the id with `Date.now()`.
 *
 * Cursor publishes the system prompt as `root_prompt_messages_json` blobs.
 * The first system text per conversationId is pinned; later DSH runtime
 * snapshots become extra system blobs in that same list (Cursor prefix),
 * not a GLM trailing system or a Gemini trailing user.
 */

export const CURSOR_STABLE_SESSION = 'dsh-cursor'

const SYSTEM_PINS = new Map()
const SYSTEM_PIN_CAP = 64

export function cursorCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetCursorSystemPins() {
  SYSTEM_PINS.clear()
}

function appendCursorModel(base, modelId) {
  const model = cursorCacheSessionId(modelId)
  if (!model) return base
  if (base === model || base.endsWith(`:${model}`)) return base
  const room = 64 - 1 - model.length
  if (room < 1) return model.slice(0, 64)
  return `${base.slice(0, room)}:${model}`
}

export function pinCursorSystemPrefix(conversationId, systemText) {
  const text = typeof systemText === 'string' ? systemText : ''
  if (!text) return { pinned: '', extra: '' }
  if (!conversationId || conversationId === CURSOR_STABLE_SESSION) {
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
  const extra = text.startsWith(existing)
    ? text.slice(existing.length).replace(/^\n+/, '').trim()
    : text
  return { pinned: existing, extra }
}

export function cursorConversationId(payload = {}, explicit) {
  const base = cursorCacheSessionId(explicit)
    ?? cursorCacheSessionId(payload.session_id)
    ?? cursorCacheSessionId(payload.prompt_cache_key)
    ?? CURSOR_STABLE_SESSION
  return appendCursorModel(base, payload.model)
}

export function applyCursorCache(payload = {}) {
  const next = { ...payload }
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  delete next.prompt_cache_key
  return {
    payload: next,
    cacheSessionId: cursorConversationId(next),
  }
}

/** Cursor does not sticky-route on Codex / Grok HTTP headers. */
export function cursorCacheHeaders() {
  return {}
}
