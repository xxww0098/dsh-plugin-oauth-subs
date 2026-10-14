/**
 * Command Code failure mapping.
 *
 * Both surfaces answer an `{error:{…}}` envelope — `/alpha/generate` as
 * `{success:false, error:{code,status,message,hint}}`, `/provider/v1/*` as
 * `{error:{message,type,code}}` — and the CLI's own classifier
 * (`classifyKind`, bundle 1.79.2) sorts those into auth / credits / plan /
 * usage-limit / rate-limit / overloaded.
 *
 * Three of those kinds must not reach the DSH host as-is. Its
 * `classifyPiAiError` reads `\b401\b` or `\b403\b` anywhere in
 * `<status> <body>` as AUTH and never retries it, so a refusal that keeps
 * that status — or merely echoes those digits — reads as a dead login:
 *
 *   upgrade_required    the client version is below the server's `minVersion`.
 *                       Live 2026-10-10: a request with no version header, or
 *                       `0.1.0`, answers `403 {"code":"upgrade_required",
 *                       "minVersion":"0.18.10"}`; our pinned 1.82.1 passes.
 *   model_not_in_plan   the plan does not carry the model.
 *   credits / window    out of credits, or a 5-hour / weekly window is used up.
 *
 * The first two become 400 (INVALID_REQUEST: shown, not retried, login kept).
 * Credits and window limits become 429 `usage limit reached: …`
 * (QUOTA_EXCEEDED: shown, not retried) through the shared `quotaFailure`.
 * Everything else returns `undefined` — the upstream's own answer.
 */

import { quotaFailure } from '../../oauth/upstream.js'

/** The host reads these as a dead login wherever they appear in the text. */
const AUTH_TOKENS = /\b(?:401|403)\b/g

function sanitize(detail: string) {
  return detail.replace(AUTH_TOKENS, '4xx').trim()
}

/** Flatten either envelope into the first code, the message, and minVersion. */
export function commandCodeErrorBits(payload) {
  const parts: string[] = []
  const codes: string[] = []
  let minVersion = ''
  const visit = (value, depth) => {
    if (value == null || depth > 3) return
    if (typeof value === 'string') {
      parts.push(value)
      return
    }
    if (typeof value !== 'object') return
    if (typeof value.message === 'string') parts.push(value.message)
    if (typeof value.error === 'string') parts.push(value.error)
    if (typeof value.code === 'string') codes.push(value.code)
    if (typeof value.type === 'string') codes.push(value.type)
    if (!minVersion && typeof value.minVersion === 'string') minVersion = value.minVersion.trim()
    if (value.error && typeof value.error === 'object') visit(value.error, depth + 1)
  }
  visit(payload, 0)
  return {
    code: codes.map((code) => code.trim().toLowerCase()).find(Boolean) ?? '',
    message: parts.map((part) => part.trim()).filter(Boolean).join(' '),
    minVersion,
  }
}

/**
 * `{status, message}` for a refusal this hop must not forward verbatim, or
 * `undefined` to keep the upstream status and body.
 */
export function commandCodeFailure(status, payload) {
  const { code, message, minVersion } = commandCodeErrorBits(payload)
  const low = message.toLowerCase()
  // A 401 is the key itself: keep it a 401 so the host can show the login as dead.
  if (status === 401 || code === 'unauthorized' || /invalid '?authorization'? header|invalid api key|missing api key/.test(low)) {
    return undefined
  }
  if (code === 'upgrade_required' || /upgrade_required|cli is out of date|outdated client/.test(low)) {
    return {
      status: 400,
      message: `Command Code rejected this client version; update the plugin${minVersion ? ` (upstream minVersion ${minVersion})` : ''}.`,
    }
  }
  if (code === 'model_not_in_plan' || /model_not_in_plan|not (?:available|included) in your plan|upgrade your plan/.test(low)) {
    const detail = sanitize(message.replace(/MODEL_NOT_IN_PLAN:\s*/i, ''))
    return { status: 400, message: `Model not in plan: ${detail || 'this plan does not include the model'}` }
  }
  if (code === 'premium_credits_exhausted' || /premium_credits_exhausted|insufficient[\s_-]+(?:credits|balance)|out of credits/.test(low)) {
    return answer(quotaFailure(sanitize(message) || 'Command Code credits are exhausted'))
  }
  if (code === 'window_limit' || /window_limit|usage (?:window|limit)|5-?hour|weekly limit|limit.{0,24}resets/.test(low)) {
    return answer(quotaFailure(sanitize(message) || 'Command Code usage window is exhausted'))
  }
  return undefined
}

function answer(failure) {
  return { status: failure.status, message: failure.message }
}
