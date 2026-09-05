/**
 * Copilot Completions hop. Keep OpenAI `reasoning_effort` when the
 * catalog advertises it. Official Copilot CLI omits maxOutputTokens for
 * GPT models. Map cache_read_* onto OpenAI cached_tokens.
 */

import { copilotCatalogModels } from './catalog.js'
import { COPILOT_MODELS } from './index.js'

const OFF = new Set(['off', 'none', 'disabled', false, null, ''])

function modelOf(id) {
  const name = typeof id === 'string' ? id : ''
  return copilotCatalogModels().find((model) => model.id === name)
    ?? COPILOT_MODELS.find((model) => model.id === name)
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

function isGptModel(id) {
  return typeof id === 'string' && /\bgpt/i.test(id)
}

export function applyCopilotThinking(payload = {}, model) {
  const next = { ...payload }
  const effort = next.reasoning_effort
  const row = model ?? modelOf(next.model)
  const efforts = advertisedEfforts(row)
  if (!efforts) {
    delete next.reasoning_effort
  } else {
    const wire = wireEffort(effort, efforts)
    if (wire) next.reasoning_effort = wire
    else delete next.reasoning_effort
  }
  if (isGptModel(next.model)) {
    delete next.max_tokens
    delete next.max_completion_tokens
    delete next.max_output_tokens
  }
  return next
}

export function mapCopilotUsage(usage) {
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
