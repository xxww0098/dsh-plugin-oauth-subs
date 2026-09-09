/**
 * Shape DSH bodies for Zhipu Coding Plan.
 *
 * Completions hop (`/glm/v1/chat/completions` → paas/v4): leftover settings.
 * Anthropic hop (`/glm/v1/messages` → /api/anthropic/v1/messages): ZCode
 * default, DSH `api: anthropic-messages`.
 *
 * Thinking: GLM-5.3 / Flash are forced-on (`type: disabled` 400s).
 * Prefix cache needs `clear_thinking: false` and previous reasoning left intact.
 * https://docs.z.ai/guides/capabilities/thinking-mode
 *
 * Cache lives in `./cache.ts`.
 */

import { applyGlmAnthropicCache, applyGlmCache } from './cache.js'

export { glmCacheSessionId, resetGlmSystemPins } from './cache.js'

const GLM_CHAT_ROLES = new Set(['system', 'user', 'assistant', 'tool'])
const GLM_DEFAULT_MAX_TOKENS = 128_000

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 5.3 / Flash cannot turn thinking off. Turbo is hybrid — do not force it. */
export function glmForcedThinkingModel(model) {
  const id = typeof model === 'string' ? model.trim().toLowerCase() : ''
  return id === 'glm-5.3' || id.startsWith('glm-5.3-')
}

function withReasoningContent(message) {
  if (message.role !== 'assistant') return message
  if (message.reasoning_content != null) return message
  if (message.reasoning == null) return message
  return { ...message, reasoning_content: message.reasoning }
}

function applyGlmThinking(payload) {
  const forced = glmForcedThinkingModel(payload.model)
  const current = isPlainObject(payload.thinking) ? payload.thinking : undefined
  if (forced) {
    return { ...payload, thinking: { ...current, type: 'enabled', clear_thinking: false } }
  }
  if (current && current.type !== 'disabled') {
    return { ...payload, thinking: { ...current, clear_thinking: false } }
  }
  return payload
}

export function normalizeGlmChatBody(payload) {
  if (!isPlainObject(payload)) return payload
  const next = { ...payload }
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map((message) => {
      if (!isPlainObject(message)) return message
      const role = message.role
      const rewritten = typeof role === 'string' && !GLM_CHAT_ROLES.has(role)
        ? { ...message, role: 'system' }
        : message
      return withReasoningContent(rewritten)
    })
  }
  return applyGlmStreamUsage(applyGlmThinking(applyGlmCache(next).payload))
}

/** Completions leftover: map cache-read aliases. Anthropic hop is passthrough. */
export function mapGlmChatUsage(usage) {
  if (!usage || typeof usage !== 'object') return usage
  const cached = usage.prompt_tokens_details?.cached_tokens
    ?? usage.cached_tokens
    ?? usage.cache_read_input_tokens
    ?? usage.cache_read_tokens
  if (typeof cached !== 'number' || !Number.isFinite(cached) || cached < 0) return usage
  const details = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
    ? { ...usage.prompt_tokens_details }
    : {}
  if (typeof details.cached_tokens !== 'number') details.cached_tokens = cached
  return { ...usage, prompt_tokens_details: details }
}

function applyGlmStreamUsage(payload) {
  if (!payload || payload.stream !== true) return payload
  const current = payload.stream_options
  if (current && typeof current === 'object' && Object.hasOwn(current, 'include_usage')) return payload
  return {
    ...payload,
    stream_options: current && typeof current === 'object'
      ? { ...current, include_usage: true }
      : { include_usage: true },
  }
}

/**
 * DSH anthropic-messages body. Anthropic requires `max_tokens`.
 * System pin + cache_control live in applyGlmAnthropicCache.
 */
export function normalizeGlmAnthropicBody(payload) {
  if (!isPlainObject(payload)) return payload
  const next = { ...payload }
  if (typeof next.max_tokens !== 'number' || !Number.isFinite(next.max_tokens) || next.max_tokens <= 0) {
    next.max_tokens = GLM_DEFAULT_MAX_TOKENS
  }
  return applyGlmThinking(applyGlmAnthropicCache(next).payload)
}
