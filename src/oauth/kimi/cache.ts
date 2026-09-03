/**
 * Kimi Code prompt cache.
 *
 * Coding Plan is an implicit prefix hash of leading system + history.
 * There is no Codex `prompt_cache_key` and no Grok `x-grok-conv-id`.
 * This module strips those fields and parks extra DSH snapshots at the
 * messages suffix so the first system blob can still hit.
 * Never stamp Date.now(). `dsh-kimi` is analyzer-only.
 */

const SYSTEM_PIN_CAP = 64
const SYSTEM_PINS = new Map()

export const KIMI_STABLE_SESSION = 'dsh-kimi'

export function kimiCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetKimiPins() {
  SYSTEM_PINS.clear()
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
  const head = []
  let index = 0
  while (index < messages.length && messages[index]?.role === 'system') {
    head.push(messages[index])
    index += 1
  }
  return { head, rest: messages.slice(index) }
}

export function stabilizeKimiSystemPrefix(messages, sessionId) {
  if (!Array.isArray(messages) || !sessionId) return messages
  const { head, rest } = splitLeadingSystem(messages)
  if (head.length === 0) return messages
  const text = head.map(systemText).join('\n\n')
  const existing = SYSTEM_PINS.get(sessionId)
  if (existing === undefined) {
    if (SYSTEM_PINS.size >= SYSTEM_PIN_CAP) {
      const first = SYSTEM_PINS.keys().next().value
      SYSTEM_PINS.delete(first)
    }
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

export function applyKimiCache(payload = {}) {
  const cacheSessionId = kimiCacheSessionId(payload.session_id)
    ?? kimiCacheSessionId(payload.prompt_cache_key)
    ?? KIMI_STABLE_SESSION
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
