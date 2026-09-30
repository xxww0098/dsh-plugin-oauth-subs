/**
 * Google Antigravity (Gemini) implicit prompt cache.
 *
 * cloudcode-pa caches a stable prefix: systemInstruction + leading
 * contents + tools. Usage hits arrive as cachedContentTokenCount
 * (and CLI aliases cache_read_tokens / cacheReadTokens) mapped in
 * request.ts. Sticky identity is request.sessionId — not Codex
 * headers, not Grok x-grok-conv-id, not implicitCacheConfig.
 *
 * Official hub sessionId is one conversation (LLM_SESSION_ID). DSH
 * session_id is kept as-is. When DSH omits it, fallback is
 * dsh-antigravity:<model> so the picker cannot reuse another model's
 * pin. Never stamp Date.now().
 *
 * DSH prepends a runtime-context system snapshot and may reshuffle
 * tool JSON every step. First system / equivalent tools /
 * thinkingConfig per real session are pinned; fallback ids never pin.
 */

/** When DSH sends neither session_id nor prompt_cache_key, key on a constant (never pinned). */
export const ANTIGRAVITY_STABLE_SESSION = 'dsh-antigravity'

const SESSION_PINS = new Map()
const PIN_CAP = 64

export function antigravityCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetAntigravitySystemPins() {
  SESSION_PINS.clear()
}

/** `dsh-antigravity` or `dsh-antigravity:<model>` is not a conversation: it never pins. */
export function isAntigravityFallback(id) {
  return typeof id !== 'string' || id === '' || id === ANTIGRAVITY_STABLE_SESSION || id.startsWith(`${ANTIGRAVITY_STABLE_SESSION}:`)
}

function pinRecord(sessionId) {
  if (isAntigravityFallback(sessionId)) return undefined
  let record = SESSION_PINS.get(sessionId)
  if (record) {
    // Map order is recency: re-insert so the cap drops the idlest session,
    // never one that is still sending steps.
    SESSION_PINS.delete(sessionId)
  } else {
    if (SESSION_PINS.size >= PIN_CAP) {
      const first = SESSION_PINS.keys().next().value
      SESSION_PINS.delete(first)
    }
    record = {}
  }
  SESSION_PINS.set(sessionId, record)
  return record
}

function systemText(parts) {
  return (parts ?? []).map((part) => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n\n')
}

/** Stable key order so DSH schema reshuffles compare equal. */
function stableJson(value) {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

function toolsFingerprint(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return ''
  const decls: any[] = []
  for (const group of tools) {
    for (const decl of group?.functionDeclarations ?? []) {
      const name = typeof decl?.name === 'string' ? decl.name : ''
      if (!name) continue
      decls.push(stableJson({
        name,
        parameters: decl.parameters ?? null,
        parametersJsonSchema: decl.parametersJsonSchema ?? null,
      }))
    }
  }
  return decls.sort().join('\n')
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

export function pinAntigravitySystemInstruction(sessionId, parts) {
  const text = systemText(parts)
  const record = pinRecord(sessionId)
  if (!record || !text) return { parts, extra: undefined }
  if (record.system === undefined) {
    record.system = text
    return { parts, extra: undefined }
  }
  if (record.system === text) return { parts, extra: undefined }
  // A different prompt on the same id is its own request: re-pin, send as-is.
  if (unrelatedPrompt(record.system, text)) {
    record.system = text
    return { parts, extra: undefined }
  }
  let extra = text
  if (text.startsWith(record.system)) extra = text.slice(record.system.length).replace(/^\n+/, '').trim()
  return { parts: [{ text: record.system }], extra: extra || undefined }
}

/**
 * Reuse the first tools JSON when names+schemas match (canonical
 * key order). Added or removed tools are a real change — send the
 * new list and accept a cache miss.
 */
export function pinAntigravityTools(sessionId, tools) {
  const record = pinRecord(sessionId)
  if (!record) return tools
  if (!Object.hasOwn(record, 'tools')) {
    record.tools = tools ?? null
    return tools
  }
  if (toolsFingerprint(record.tools) === toolsFingerprint(tools)) {
    return record.tools ?? undefined
  }
  record.tools = tools ?? null
  return tools
}

/**
 * Sticky-first thinkingConfig. Once a session has sent (or omitted)
 * a thinking object, keep that choice while later payloads omit
 * reasoning_effort; an explicit, different reasoning_effort is the
 * user changing it and replaces the pin. Do not invent implicitCacheConfig.
 */
export function pinAntigravityThinking(sessionId, thinking, effort?) {
  const next = isPlainThinking(thinking) ? thinking : undefined
  const record = pinRecord(sessionId)
  if (!record) return next
  if (!Object.hasOwn(record, 'thinking') || (effort && effort !== record.effort)) {
    record.thinking = next ?? null
    record.effort = effort
    return next
  }
  return record.thinking ?? undefined
}

function isPlainThinking(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function appendAntigravityModel(base, modelId) {
  if (base !== ANTIGRAVITY_STABLE_SESSION) return base
  const model = antigravityCacheSessionId(modelId)
  if (!model) return base
  if (base === model || base.endsWith(`:${model}`)) return base
  const room = 64 - 1 - model.length
  if (room < 1) return model.slice(0, 64)
  return `${base.slice(0, room)}:${model}`
}

export function antigravitySessionIdOf(payload: any = {}, explicit?) {
  const base = antigravityCacheSessionId(explicit)
    ?? antigravityCacheSessionId(payload.session_id)
    ?? antigravityCacheSessionId(payload.prompt_cache_key)
    ?? ANTIGRAVITY_STABLE_SESSION
  return appendAntigravityModel(base, payload.model)
}
