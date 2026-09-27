/**
 * Shape the DSH anthropic-messages body for api.anthropic.com.
 *
 * The host already speaks anthropic-messages natively (system / tools /
 * thinking / cache_control are the host's own lane), so this module only
 * repairs the edges Anthropic is strict about — it must not re-manage cache
 * checkpoints or thinking:
 *   - `max_tokens` is required by the Messages API; DSH compaction can send a
 *     missing/invalid one only on malformed requests, so the family default
 *     (64k) keeps the hop answerable instead of 400ing.
 *   - `service_tier` fast/priority is a Codex concept; Anthropic's tier
 *     values are auto/standard only and a stray value would 400.
 * Everything else passes through byte-for-byte.
 */

import { ANTHROPIC_MAX_TOKENS } from './index.js'

const ANTHROPIC_SERVICE_TIERS = new Set(['auto', 'standard'])

export function normalizeAnthropicMessagesBody(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const next = { ...payload }
  if (typeof next.max_tokens !== 'number' || !Number.isFinite(next.max_tokens) || next.max_tokens <= 0) {
    next.max_tokens = ANTHROPIC_MAX_TOKENS
  }
  if (next.service_tier !== undefined && !ANTHROPIC_SERVICE_TIERS.has(next.service_tier)) {
    delete next.service_tier
  }
  return next
}
