/**
 * OpenCode Free prompt cache.
 *
 * anomalyco/opencode v1.18.29 sends `x-opencode-session` (sticky provider
 * + prompt cache), `x-opencode-request` (user message id), and
 * `x-opencode-client`. Zen `handler.ts` uses session as `stickyId`; empty
 * falls back to IP and mixes unrelated chats. Go docs: include
 * `x-opencode-session` so they can optimize prompt caching.
 *
 * Body still strips Codex / Grok fields — Zen Completions does not take
 * `prompt_cache_key`. Never stamp Date.now() as the session id.
 * `x-opencode-request` is one UUID per DSH request (retries replay it).
 */

import { randomUUID } from 'node:crypto'

export const OPENCODE_STABLE_SESSION = 'dsh-opencode'

export function opencodeCacheSessionId(key) {
  if (typeof key !== 'string') return undefined
  const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-')
  if (!cleaned) return undefined
  return cleaned.slice(0, 64)
}

export function resetOpencodePins() {
  // No in-process prefix map — OpenCode Free parks nothing.
}

export function applyOpencodeCache(payload = {}) {
  const next = { ...payload }
  delete next.prompt_cache_key
  delete next.prompt_cache_retention
  delete next.prompt_cache_options
  delete next.session_id
  return {
    payload: next,
    cacheSessionId: opencodeCacheSessionId(payload.session_id)
      ?? opencodeCacheSessionId(payload.prompt_cache_key)
      ?? OPENCODE_STABLE_SESSION,
  }
}

/**
 * Official CLI `session/llm/request.ts` headers for providerID opencode.
 * `reqId` is one UUID per DSH request so retries keep the same id.
 * Do not invent `x-opencode-project` / `x-parent-session-id`.
 * Do not copy Codex `session-id` or non-opencode `x-session-affinity`.
 */
export function opencodeCacheHeaders(cacheSessionId, extra = {}) {
  const session = opencodeCacheSessionId(cacheSessionId) || OPENCODE_STABLE_SESSION
  return {
    'x-opencode-session': session,
    'x-opencode-request': typeof extra.reqId === 'string' && extra.reqId ? extra.reqId : randomUUID(),
  }
}
