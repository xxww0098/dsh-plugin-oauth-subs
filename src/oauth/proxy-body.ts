/**
 * Inbound request body: size-capped read and the per-family rewrite that
 * strips or applies cache fields before a hop (each family's own cache.ts
 * owns the rewrite; this only dispatches).
 */

import { codexRoutingHint } from './codex/index.js'
import { applyCodexCache } from './codex/cache.js'
import { applyGrokCache } from './grok/cache.js'
import { normalizeGrokResponsesBody } from './grok/request.js'
import { glmCacheSessionId } from './glm/cache.js'
import { normalizeGlmAnthropicBody, normalizeGlmChatBody } from './glm/request.js'
import { kiroConversationId } from './kiro/cache.js'
import { antigravitySessionIdOf } from './antigravity/cache.js'
import { applyCursorCache } from './cursor/cache.js'
import { applyOllamaCache } from '../apikey/ollama/cache.js'
import { applyCommandCodeCache } from '../apikey/command-code/cache.js'
import { applyKimiCache } from './kimi/cache.js'
import { applyKimiStreamUsage, applyKimiThinking } from './kimi/request.js'
import { applyCopilotCache, copilotHasVision, copilotInitiatorOf } from './copilot/cache.js'
import { applyCopilotStreamUsage, applyCopilotThinking } from './copilot/request.js'
import { applyDevinCache } from './devin/cache.js'
import { RequestError } from '../utils/http.js'
import { applyFastMode } from '../utils/fast-mode.js'
import { normalizeCodexResponsesBody } from './codex/request.js'
import { applyClineCache } from './cline/cache.js'
import { applyChatgptCache } from './chatgpt/cache.js'
import { normalizeChatgptResponsesBody } from './chatgpt/request.js'
import { applyClineMaxCompletionTokens, applyClineStreamUsage, applyClineThinking } from './cline/request.js'

export const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024

export function readBody(request, limit = MAX_REQUEST_BODY_BYTES) {
  if (request.aborted || request.destroyed) {
    return Promise.reject(new RequestError(400, 'request body was aborted'))
  }
  const declared = Number(request.headers['content-length'])
  if (Number.isSafeInteger(declared) && declared > limit) {
    request.resume()
    return Promise.reject(new RequestError(413, 'request body is too large'))
  }
  return new Promise((resolve, reject) => {
    const chunks: any[] = []
    let size = 0
    const onData = (chunk) => {
      size += chunk.length
      if (size <= limit) {
        chunks.push(chunk)
        return
      }
      cleanup()
      request.resume()
      reject(new RequestError(413, 'request body is too large'))
    }
    const onEnd = () => {
      cleanup()
      resolve(Buffer.concat(chunks, size))
    }
    const onError = () => {
      cleanup()
      reject(new RequestError(400, 'request body could not be read'))
    }
    const onAborted = () => {
      cleanup()
      reject(new RequestError(400, 'request body was aborted'))
    }
    const cleanup = () => {
      request.removeListener('data', onData)
      request.removeListener('end', onEnd)
      request.removeListener('error', onError)
      request.removeListener('aborted', onAborted)
    }
    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    request.once('aborted', onAborted)
  })
}

/**
 * Per-family count of inbound bodies with / without DSH's `prompt_cache_key`,
 * taken before any family strips it. Served on `/health` as the one signal
 * that the host actually sends session ids to the loopback. Counts only.
 */
export const inboundCacheKeys: Record<string, { with: number, without: number }> = {}

export function rewriteUpstreamBody(buffer, family, wire?) {
  if (!buffer.length) throw new RequestError(400, 'request body must contain JSON')
  let payload
  try {
    payload = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new RequestError(400, 'request body must contain valid JSON')
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new RequestError(400, 'request body must contain a JSON object')
  }
  const seen = inboundCacheKeys[family] ??= { with: 0, without: 0 }
  if (typeof payload.prompt_cache_key === 'string' && payload.prompt_cache_key.trim()) seen.with += 1
  else seen.without += 1
  if (family === 'cursor') {
    // Cursor Fast is RequestedModel `{ id: 'fast' }`, not Codex Priority.
    // Keep the picker `-fast` suffix for openaiToCursor; do not peel here.
    const { payload: next, cacheSessionId } = applyCursorCache(payload)
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  if (family === 'grok') {
    // Grok Fast is a real backend model id (`grok-4.7-build-fast`), not Codex
    // Priority: the shared peel would rewrite it to a nonexistent model.
    // normalizeGrokResponsesBody owns model hygiene + service_tier here.
    const { payload: next, cacheSessionId } = applyGrokCache(normalizeGrokResponsesBody(payload))
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
      grokModel: typeof next.model === 'string' ? next.model : undefined,
    }
  }
  if (family === 'chatgpt') {
    // No Fast rows on this route: a stray `-fast` id is not peeled into a
    // service tier (normalize drops service_tier; the public API has no Priority hint).
    const { payload: next, cacheSessionId } = applyChatgptCache(normalizeChatgptResponsesBody(payload))
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  const fast = applyFastMode(payload)
  if (family === 'codex') {
    const { payload: next, cacheSessionId } = applyCodexCache(normalizeCodexResponsesBody(fast))
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
      routingHint: codexRoutingHint(typeof next.model === 'string' ? next.model : '', next.service_tier),
    }
  }
  if (family === 'glm') {
    const next = wire === 'anthropic' ? normalizeGlmAnthropicBody(fast) : normalizeGlmChatBody(fast)
    return {
      payload: next,
      cacheSessionId: glmCacheSessionId(next.user)
        || glmCacheSessionId(next.metadata?.user_id)
        || glmCacheSessionId(next.session_id),
      stream: next.stream === true,
    }
  }
  if (family === 'antigravity') {
    const next = { ...fast }
    delete next.prompt_cache_retention
    delete next.prompt_cache_options
    return {
      payload: next,
      cacheSessionId: antigravitySessionIdOf(next),
      stream: next.stream === true,
    }
  }
  if (family === 'kiro') {
    const next = { ...fast }
    delete next.prompt_cache_retention
    delete next.prompt_cache_options
    return {
      payload: next,
      cacheSessionId: kiroConversationId(next),
      stream: next.stream === true,
    }
  }
  if (family === 'ollama') {
    const { payload: next, cacheSessionId } = applyOllamaCache(fast)
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  if (family === 'kimi') {
    const { payload: cached, cacheSessionId } = applyKimiCache(fast)
    const next = applyKimiStreamUsage(applyKimiThinking(cached))
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  if (family === 'copilot') {
    const { payload: cached, cacheSessionId } = applyCopilotCache(fast)
    const next = applyCopilotStreamUsage(applyCopilotThinking(cached))
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
      copilotVision: copilotHasVision(next.messages),
      copilotInitiator: copilotInitiatorOf(next.messages),
    }
  }
  if (family === 'devin') {
    // Devin `-fast` is a real backend variant uid, not Codex Priority — the
    // picker id must reach openaiToDevin unpeeled, same as Cursor.
    const { payload: next, cacheSessionId } = applyDevinCache(payload)
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  if (family === 'cline') {
    // OpenRouter-backed Completions: cache affinity rides the X-Task-ID
    // header (clineCacheHeaders), not a body field. The body edits are the
    // CLI's own three (max_completion_tokens rename, include_usage,
    // reasoning_effort passthrough) and nothing else.
    const { payload: cached, cacheSessionId } = applyClineCache(fast)
    const next = applyClineStreamUsage(
      applyClineThinking(applyClineMaxCompletionTokens(cached)),
    )
    return {
      payload: next,
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  if (family === 'command-code') {
    // threadId is the wire's top-level cache-affinity uuid (see cache.ts);
    // foreign DSH fields are stripped before openaiToCommandCode maps the
    // body onto /alpha/generate's JSONL protocol.
    const { payload: next, threadId } = applyCommandCodeCache(fast)
    return {
      payload: next,
      cacheSessionId: threadId,
      threadId,
      stream: next.stream === true,
    }
  }
  throw new RequestError(400, `unknown oauth family: ${family}`)
}
