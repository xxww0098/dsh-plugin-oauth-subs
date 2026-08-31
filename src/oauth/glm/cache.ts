/**
 * Z.AI Coding Plan implicit prefix cache.
 * https://docs.z.ai/guides/capabilities/cache
 *
 * The cache key is a hash of the leading system blob plus history. There is
 * no Codex `prompt_cache_key` and no Grok `x-grok-conv-id`. Sticky routing
 * is the OpenAI `user` field plus the `x-session-id` header.
 *
 * DSH prepends a runtime-context snapshot as another leading system every
 * step. That rewrite is parked at the messages suffix so the first system
 * blob can still hit. Thinking models also need `clear_thinking: false`
 * (owned by request.ts).
 */

const SYSTEM_PIN_CAP = 64
const SYSTEM_PINS = new Map()

export function glmCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetGlmSystemPins() {
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

/**
 * Pin the first leading system run per DSH session. Extra / changed
 * snapshots go after the conversation so the implicit-cache prefix
 * stays byte-stable.
 */
export function stabilizeGlmSystemPrefix(messages, sessionId) {
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

/** Drop Codex/Grok cache fields; pin `user`; freeze the leading system. */
export function applyGlmCache(payload) {
  const next = { ...payload }
  const sessionId = glmCacheSessionId(next.user)
    || glmCacheSessionId(next.session_id)
    || glmCacheSessionId(next.prompt_cache_key)
  delete next.prompt_cache_key
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  if (Array.isArray(next.messages) && sessionId) {
    next.messages = stabilizeGlmSystemPrefix(next.messages, sessionId)
  }
  if (sessionId && (next.user == null || next.user === '')) next.user = sessionId
  return { payload: next, cacheSessionId: sessionId }
}
