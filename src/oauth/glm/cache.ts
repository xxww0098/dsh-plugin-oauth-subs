/**
 * Z.AI Coding Plan implicit prefix cache.
 * https://docs.z.ai/guides/capabilities/cache
 *
 * The cache key is a hash of the leading system blob plus history. There is
 * no Codex `prompt_cache_key` and no Grok `x-grok-conv-id`. Sticky routing
 * is the OpenAI `user` field / Anthropic `metadata.user_id` plus the
 * `x-session-id` header. Anthropic also stamps `cache_control` on the first
 * system text block (ZCode default protocol).
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

/**
 * Pin the first Anthropic `system` run per DSH session. Extra snapshots
 * become additional text blocks *without* cache_control so the first
 * block stays a stable prefix. Z.AI Anthropic accepts `cache_control`.
 */
export function stabilizeGlmAnthropicSystem(system, sessionId) {
  if (!sessionId) return system
  const pinId = `${sessionId}\0anthropic`
  const blocks = systemBlocks(system)
  if (blocks.length === 0) return system
  const text = blocks.map((block) => block.text).filter(Boolean).join('\n\n')
  if (!text) return system
  const existing = SYSTEM_PINS.get(pinId)
  if (existing === undefined) {
    if (SYSTEM_PINS.size >= SYSTEM_PIN_CAP) {
      const first = SYSTEM_PINS.keys().next().value
      SYSTEM_PINS.delete(first)
    }
    SYSTEM_PINS.set(pinId, { head: blocks, text })
    return withCacheControl(blocks)
  }
  let extra = ''
  if (text !== existing.text) {
    extra = text.startsWith(existing.text)
      ? text.slice(existing.text.length).replace(/^\n+/, '').trim()
      : text
  }
  const extras = extra ? [{ type: 'text', text: extra }] : []
  return withCacheControl([...existing.head, ...extras])
}

function systemBlocks(system) {
  if (typeof system === 'string') {
    const text = system.trim()
    return text ? [{ type: 'text', text }] : []
  }
  if (!Array.isArray(system)) return []
  return system.flatMap((part) => {
    if (typeof part === 'string') {
      const text = part.trim()
      return text ? [{ type: 'text', text }] : []
    }
    if (part && typeof part.text === 'string' && part.text.trim()) {
      return [{ type: 'text', text: part.text }]
    }
    return []
  })
}

function withCacheControl(blocks) {
  if (blocks.length === 0) return blocks
  return blocks.map((block, index) => (
    index === 0
      ? { ...block, cache_control: { type: 'ephemeral' } }
      : { type: 'text', text: block.text }
  ))
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

/**
 * Anthropic Messages: pin top-level `system`, `metadata.user_id`, and
 * `cache_control` on the first system block. Same pin map as Completions.
 */
export function applyGlmAnthropicCache(payload) {
  const next = { ...payload }
  const sessionId = glmCacheSessionId(next.metadata?.user_id)
    || glmCacheSessionId(next.session_id)
    || glmCacheSessionId(next.prompt_cache_key)
    || glmCacheSessionId(next.user)
  delete next.prompt_cache_key
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  if (sessionId && next.system != null) {
    next.system = stabilizeGlmAnthropicSystem(next.system, sessionId)
  }
  if (sessionId) {
    const metadata = isPlainObject(next.metadata) ? { ...next.metadata } : {}
    if (metadata.user_id == null || metadata.user_id === '') metadata.user_id = sessionId
    next.metadata = metadata
  }
  return { payload: next, cacheSessionId: sessionId }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
