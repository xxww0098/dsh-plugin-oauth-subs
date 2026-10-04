/**
 * GitHub Copilot prompt cache.
 *
 * Completions prefix-hash of leading system + history, plus OpenCode's
 * `X-Interaction-Id` session sticky. There is no Codex `prompt_cache_key`
 * and no Grok `x-grok-conv-id`. Extra DSH snapshots park at the messages
 * suffix. Never stamp Date.now(). Fallback `dsh-copilot` is written as
 * X-Interaction-Id (official always sends a session id) and never pins.
 */

import { splitLeadingSystem, systemText, unrelatedPrompt } from '../../utils/system-pin.js'

const SYSTEM_PIN_CAP = 64
const SYSTEM_PINS = new Map()

export const COPILOT_STABLE_SESSION = 'dsh-copilot'

/** A fallback id is not a conversation: it never pins a system prompt. */
export function isCopilotFallback(id) {
  return typeof id !== 'string' || id === '' || id === COPILOT_STABLE_SESSION || id.startsWith(`${COPILOT_STABLE_SESSION}:`)
}

export function copilotConversationId(payload: any = {}) {
  return copilotCacheSessionId(payload.session_id)
    ?? copilotCacheSessionId(payload.prompt_cache_key)
    ?? COPILOT_STABLE_SESSION
}

export function copilotCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetCopilotPins() {
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

export function stabilizeCopilotSystemPrefix(messages, sessionId) {
  if (!Array.isArray(messages) || isCopilotFallback(sessionId)) return messages
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

export function applyCopilotCache(payload: any = {}) {
  const cacheSessionId = copilotConversationId(payload)
  const next = { ...payload }
  delete next.prompt_cache_key
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  delete next.session_id
  if (Array.isArray(next.messages)) {
    next.messages = stabilizeCopilotSystemPrefix(next.messages, cacheSessionId)
  }
  return { payload: next, cacheSessionId }
}

/** Sticky id for Copilot Completions. Do not copy Codex / Grok header names. */
export function copilotCacheHeaders(cacheSessionId) {
  const session = copilotCacheSessionId(cacheSessionId) || COPILOT_STABLE_SESSION
  return {
    'x-interaction-id': session,
  }
}

export function copilotHasVision(messages) {
  if (!Array.isArray(messages)) return false
  return messages.some((message) => {
    const content = message?.content
    if (!Array.isArray(content)) return false
    return content.some((part) => {
      if (!part || typeof part !== 'object') return false
      return part.type === 'image_url' || part.type === 'image' || part.image_url !== undefined
    })
  })
}

export function copilotInitiatorOf(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'user'
  const last = messages[messages.length - 1]
  if (last?.role === 'tool' || last?.role === 'assistant') return 'agent'
  return 'user'
}
