/**
 * Kimi Code prompt cache.
 *
 * Coding Plan is an implicit prefix hash of leading system + history.
 * There is no Codex `prompt_cache_key` and no Grok `x-grok-conv-id`.
 * This module strips those fields and parks extra DSH snapshots at the
 * messages suffix so the first system blob can still hit.
 * Never stamp Date.now(). `dsh-kimi` is analyzer-only and never pins.
 */

const SYSTEM_PIN_CAP = 64
const SYSTEM_PINS = new Map()

export const KIMI_STABLE_SESSION = 'dsh-kimi'

/** A fallback id is not a conversation: it never pins a system prompt. */
export function isKimiFallback(id) {
  return typeof id !== 'string' || id === '' || id === KIMI_STABLE_SESSION || id.startsWith(`${KIMI_STABLE_SESSION}:`)
}

export function kimiConversationId(payload: any = {}) {
  return kimiCacheSessionId(payload.session_id)
    ?? kimiCacheSessionId(payload.prompt_cache_key)
    ?? KIMI_STABLE_SESSION
}

export function kimiCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetKimiPins() {
  SYSTEM_PINS.clear()
}

/**
 * Read a pin and mark it most recently used. Map order is recency, so the
 * cap drops the idlest conversation, never one that is still sending steps.
 */
function usePin(key) {
  const pin = SYSTEM_PINS.get(key)
  if (pin === undefined) return undefined
  SYSTEM_PINS.delete(key)
  SYSTEM_PINS.set(key, pin)
  return pin
}

function systemText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content == null ? '' : String(content)
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part.text === 'string') return part.text
      return ''
    })
    .join('')
}

function splitLeadingSystem(messages) {
  const head: any[] = []
  let index = 0
  while (index < messages.length && messages[index]?.role === 'system') {
    head.push(messages[index])
    index += 1
  }
  return { head, rest: messages.slice(index) }
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

export function stabilizeKimiSystemPrefix(messages, sessionId) {
  if (!Array.isArray(messages) || isKimiFallback(sessionId)) return messages
  const { head, rest } = splitLeadingSystem(messages)
  if (head.length === 0) return messages
  const text = head.map(systemText).join('\n\n')
  const existing = usePin(sessionId)
  if (existing === undefined) {
    if (SYSTEM_PINS.size >= SYSTEM_PIN_CAP) {
      const first = SYSTEM_PINS.keys().next().value
      SYSTEM_PINS.delete(first)
    }
    SYSTEM_PINS.set(sessionId, { head, text })
    return messages
  }
  // A different prompt on the same id is its own request: re-pin, send as-is.
  if (unrelatedPrompt(existing.text, text)) {
    SYSTEM_PINS.set(sessionId, { head, text })
    return messages
  }
  let extra = ''
  if (text !== existing.text) {
    extra = text.startsWith(existing.text)
      ? text.slice(existing.text.length).replace(/^\n+/, '').trim()
      : text
  }
  const parked = extra ? [{ role: 'system', content: extra }] : []
  return [...existing.head, ...rest, ...parked]
}

export function applyKimiCache(payload: any = {}) {
  const cacheSessionId = kimiConversationId(payload)
  const next = { ...payload }
  delete next.prompt_cache_key
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  delete next.session_id
  if (Array.isArray(next.messages)) {
    next.messages = stabilizeKimiSystemPrefix(next.messages, cacheSessionId)
  }
  return { payload: next, cacheSessionId }
}

/** Kimi does not sticky-route on Codex / Grok HTTP headers. */
export function kimiCacheHeaders() {
  return {}
}
