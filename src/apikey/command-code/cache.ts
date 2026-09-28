/**
 * Command Code conversation affinity. `/alpha/generate` carries a top-level
 * `threadId` uuid (the CLI's per-conversation id — cache affinity + session
 * archive key; `toWireThreadId` drops non-uuids). DSH `prompt_cache_key` /
 * `session_id` are converted to a uuid here, never passed through verbatim.
 *
 * Never send Codex/Grok/Cursor fields upstream: prompt_cache_key,
 * session_id, service_tier, retention, cache controls. With no DSH key the
 * fallback is one deterministic uuid per `dsh-command-code:<model>` seed —
 * no Date.now()/random in conversation-id positions.
 */

import { createHash } from 'node:crypto'

/** UUIDv5-shaped digest: stable across turns for one seed, same wire shape as the CLI's random uuid. */
export function deterministicCommandCodeId(seed) {
  const hash = createHash('sha256').update(String(seed)).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim())
}

/**
 * DSH conversation key → threadId. A real uuid passes through untouched (the
 * CLI's own threadIds are uuids); anything else derives from
 * `dsh-command-code:<key>`, and a missing key falls back to the per-model
 * constant seed.
 */
export function commandCodeThreadId(payload) {
  const explicit = [payload?.prompt_cache_key, payload?.session_id]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .find((v) => v.length > 0)
  if (explicit && looksLikeUuid(explicit)) return explicit
  const seed = explicit || `dsh-command-code:${String(payload?.model ?? 'default')}`
  return deterministicCommandCodeId(seed)
}

/**
 * Strip DSH/OpenAI fields upstream does not understand. Returns the rewritten
 * payload plus the derived threadId (the transport puts it at body top level,
 * outside `params`).
 */
export function applyCommandCodeCache(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { payload, threadId: undefined }
  }
  const next = { ...payload }
  const threadId = commandCodeThreadId(next)
  for (const key of [
    'prompt_cache_key',
    'session_id',
    'prompt_cache_retention',
    'prompt_cache_options',
    'cache_control',
    'service_tier',
    'store',
    'user',
    'metadata',
    'parallel_tool_calls',
    'logprobs',
    'top_logprobs',
    'logit_bias',
    'n',
    'seed',
    'stream_options',
    'response_format',
    'frequency_penalty',
    'presence_penalty',
    'stop',
  ]) {
    delete next[key]
  }
  return { payload: next, threadId }
}
