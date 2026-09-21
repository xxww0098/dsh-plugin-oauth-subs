/**
 * Shape DSH openai-responses bodies for xAI Grok.
 *
 * grok-build (xai-org/grok-build) sends `instructions: null` and keeps
 * system in `input`. Prefix cache stays hot only when later turns replay
 * that order byte for byte. DSH prepends a fresh developer/system snapshot
 * every step; those extras park at the input suffix, same idea as Codex
 * but without lifting into top-level `instructions`.
 *
 * Model id hygiene also lives here: Grok Fast is a real backend model
 * (`grok-4.7-build-fast`), so the shared Codex `applyFastMode` peel must
 * not run on the Grok hop. Stale `grok-4.6-fast`-style aliases still get
 * peeled, and `service_tier` never reaches xAI.
 *
 * Cache identity lives in `./cache.ts`.
 */

import { GROK_FAST_MODEL_IDS } from './index.js'
import { grokConversationId, pinGrokSystemPrefix } from './cache.js'

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

function systemItem(text) {
  return { role: 'system', content: text }
}

function developerItem(text) {
  return { role: 'developer', content: [{ type: 'input_text', text }] }
}

function splitLeadingInstructions(input) {
  const lifted: any[] = []
  const rest: any[] = []
  for (const item of input) {
    if (rest.length === 0 && item && INSTRUCTION_ROLES.has(item.role)) {
      const text = instructionText(item)
      if (text) lifted.push(text)
      continue
    }
    rest.push(item)
  }
  return { lifted: lifted.join('\n\n'), rest }
}

function stabilizeGrokInput(next, conversationId) {
  if (!Array.isArray(next.input)) return next
  const { lifted, rest } = splitLeadingInstructions(next.input)
  const { pinned, extra } = pinGrokSystemPrefix(conversationId, lifted)
  const prefix: any[] = []
  if (pinned) prefix.push(systemItem(pinned))
  const suffix = extra ? [developerItem(extra)] : []
  next.input = [...prefix, ...rest, ...suffix]
  return next
}

/**
 * Grok Fast is a real model id (`grok-4.7-build-fast`), not Codex Priority,
 * so the shared `applyFastMode` peel is bypassed for this family. A stale
 * host alias (`grok-4.6-fast`) is still peeled so xAI cannot 400 on a fake
 * model, and `service_tier` is stripped (xAI never takes it).
 */
export function normalizeGrokModel(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const next = { ...payload }
  if (typeof next.model === 'string') {
    const model = next.model.trim()
    if (model.endsWith('-fast') && !GROK_FAST_MODEL_IDS.includes(model)) {
      next.model = model.slice(0, -'-fast'.length)
    }
  }
  delete next.service_tier
  return next
}

export function normalizeGrokResponsesBody(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const normalized = normalizeGrokModel(payload)
  return stabilizeGrokInput({ ...normalized }, grokConversationId(normalized))
}
