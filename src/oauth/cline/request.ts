/**
 * Cline Completions hop.
 *
 * Three edits copied from the pinned CLI, no more:
 *  1. `withMaxCompletionTokensForReasoningModels` — for an OpenAI
 *     reasoning-era id (`isOpenAIReasoningEraModelId`) `max_tokens` is renamed
 *     to `max_completion_tokens`; OpenRouter refuses the old name there.
 *  2. `includeUsage: true` — `@ai-sdk/openai-compatible` turns it into
 *     `stream_options.include_usage`, so the SSE tail carries usage.
 *  3. `reasoning_effort` stays on the wire only when the catalog advertises
 *     the model, with `max` → `xhigh` (`portable-reasoning.ts`).
 */

import { clineCatalogModels } from './catalog.js'
import { CLINE_MODELS } from './index.js'

const OFF = new Set(['off', 'none', 'disabled', false, null, ''])

/** `OPENAI_O_SERIES_MODEL_ID_PATTERN` / `OPENAI_GPT5_FAMILY_MODEL_ID_PATTERN`. */
const O_SERIES = /(^|[^a-z0-9])o[134](?=$|[^a-z0-9])/
const GPT5_FAMILY = /(^|[^a-z0-9])gpt-?5(?=$|[^a-z0-9])/

export function isClineReasoningEraModel(modelId) {
  const normalized = typeof modelId === 'string' ? modelId.trim().toLowerCase() : ''
  if (!normalized) return false
  return O_SERIES.test(normalized) || GPT5_FAMILY.test(normalized)
}

function modelOf(id) {
  const name = typeof id === 'string' ? id : ''
  return clineCatalogModels().find((model) => model.id === name)
    ?? CLINE_MODELS.find((model) => model.id === name)
}

function advertisedEfforts(model) {
  const raw = model?.reasoningEfforts
  if (!raw || typeof raw !== 'object') return undefined
  return raw
}

function wireEffort(value, efforts) {
  if (value === undefined) return undefined
  if (OFF.has(value)) return undefined
  if (efforts[value] !== undefined) return efforts[value]
  const hit = Object.values(efforts).find((wire) => wire === value)
  return typeof hit === 'string' ? hit : undefined
}

export function applyClineThinking(payload: any = {}, model?) {
  const next = { ...payload }
  const effort = next.reasoning_effort
  const row = model ?? modelOf(next.model)
  const efforts = advertisedEfforts(row)
  const wire = efforts ? wireEffort(effort, efforts) : undefined
  if (wire) next.reasoning_effort = wire
  else delete next.reasoning_effort
  return next
}

export function applyClineMaxCompletionTokens(payload: any = {}) {
  if (!payload || typeof payload !== 'object') return payload
  const { max_tokens: maxTokens, ...rest } = payload
  if (maxTokens == null || !isClineReasoningEraModel(payload.model)) return payload
  return {
    ...rest,
    max_completion_tokens: rest.max_completion_tokens ?? maxTokens,
  }
}

/** Completions SSE omits usage unless the vendor is asked. Do not override an explicit value. */
export function applyClineStreamUsage(payload: any = {}) {
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
 * Cline answers a **non-streaming** chat with the same `{success, data}` envelope
 * as its account endpoints — live-verified 2026-09-19:
 * `{"data":{"choices":[…]}, "success":true}`. SSE answers are not wrapped.
 * The CLI only unwraps this for OpenRouter image requests
 * (`createSuccessDataResponseFetch`), because its text path always streams;
 * a DSH non-streaming call would otherwise read `choices` off the envelope.
 */
export function unwrapClineEnvelope(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  if (payload.success !== true) return payload
  const data = payload.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return payload
  return data
}

/** Map vendor cache-read aliases. Absent field stays absent — do not invent 0. */
export function mapClineUsage(usage) {
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
