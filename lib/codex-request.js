/**
 * Shape a generic openai-responses body for chatgpt.com Codex.
 *
 * DSH/llm-pi-ai speaks openai-responses (system prompt lives in `input` as
 * developer/system). The Codex subscription backend requires a top-level
 * `instructions` string and rejects several public-API-only fields.
 */

const INSTRUCTION_ROLES = new Set(['system', 'developer'])

function instructionText(item) {
  if (typeof item?.content === 'string') return item.content.trim()
  if (!Array.isArray(item?.content)) return ''
  return item.content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part.text === 'string') return part.text
      return ''
    })
    .join('')
    .trim()
}

function liftInstructions(input) {
  const lifted = []
  const rest = []
  for (const item of input) {
    if (rest.length === 0 && item && INSTRUCTION_ROLES.has(item.role)) {
      const text = instructionText(item)
      if (text) lifted.push(text)
      continue
    }
    rest.push(item)
  }
  return { instructions: lifted.join('\n\n'), input: rest }
}

export function normalizeCodexResponsesBody(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const next = { ...payload }

  if (typeof next.instructions !== 'string' || next.instructions.trim() === '') {
    if (Array.isArray(next.input)) {
      const lifted = liftInstructions(next.input)
      next.input = lifted.input
      next.instructions = lifted.instructions || 'You are a helpful assistant.'
    } else {
      next.instructions = 'You are a helpful assistant.'
    }
  }

  if (next.reasoning && typeof next.reasoning === 'object' && !Array.isArray(next.reasoning)) {
    const reasoning = { ...next.reasoning }
    if (reasoning.effort === 'ultra') reasoning.effort = 'max'
    if (reasoning.mode === 'standard' || reasoning.mode === 'pro') delete reasoning.mode
    next.reasoning = reasoning
  }

  if (next.service_tier === 'fast') next.service_tier = 'priority'
  if (next.service_tier === 'default' || next.service_tier === 'auto') delete next.service_tier

  delete next.prompt_cache_options
  delete next.safety_identifier
  delete next.max_output_tokens

  if (!Array.isArray(next.include) || next.include.length === 0) {
    next.include = ['reasoning.encrypted_content']
  }

  return next
}
