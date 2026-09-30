/**
 * Shape a DSH openai-responses body for Sign in with ChatGPT
 * (siwc/token-sharing-open-source/preview-limitations).
 *
 * - `store: false` and `stream: true` on every HTTP request.
 * - Explicit `role: system` message items are rejected; they become
 *   `developer` items (same position, so the cached prefix is unchanged).
 * - Unsupported request fields are dropped instead of 400ing the turn.
 * - `previous_response_id` is unsupported over HTTP; DSH already sends the
 *   full history in `input`.
 * - Fast: a `<id>-fast` picker row is peeled to `<id>` + `service_tier: "priority"`.
 *   2026-09-30 live, gpt-5.6-luna, 6 interleaved runs: 85.8 vs 56.4 tok/s
 *   (1.52×), TTFT 2.1s vs 3.3s; the echo still reads `default` (same as Codex).
 *   Any other tier the caller sends is dropped: an override this route does not
 *   serve fails as `subscription_sharing_unsupported_capability`.
 */
import { quotaFailure } from '../upstream.js';
import { CHATGPT_USAGE_URL, chatgptModel } from './index.js';
export const CHATGPT_FAST_SUFFIX = '-fast';
/** `gpt-6-sol-fast` → `{ model: 'gpt-6-sol', fast: true }` when the base row offers Fast. */
export function peelChatgptFast(modelId) {
    const raw = String(modelId ?? '');
    if (!raw.toLowerCase().endsWith(CHATGPT_FAST_SUFFIX))
        return { model: raw, fast: false };
    const base = raw.slice(0, -CHATGPT_FAST_SUFFIX.length);
    return chatgptModel(base)?.fastTier === true ? { model: base, fast: true } : { model: raw, fast: false };
}
/** preview-limitations "Unsupported fields", plus previous_response_id / prompt_cache_options / service_tier. */
export const CHATGPT_UNSUPPORTED_FIELDS = Object.freeze([
    'background',
    'conversation',
    'max_output_tokens',
    'max_tool_calls',
    'metadata',
    'moderation',
    'multi_agent',
    'prompt',
    'prompt_cache_retention',
    'prompt_cache_options',
    'safety_identifier',
    'temperature',
    'top_logprobs',
    'top_p',
    'truncation',
    'user',
    'previous_response_id',
    'service_tier',
]);
function developerRole(item) {
    if (!item || typeof item !== 'object' || item.role !== 'system')
        return item;
    if (item.type !== undefined && item.type !== 'message')
        return item;
    return { ...item, role: 'developer' };
}
export function normalizeChatgptResponsesBody(payload) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        return payload;
    const next = { ...payload };
    for (const field of CHATGPT_UNSUPPORTED_FIELDS)
        delete next[field];
    const peeled = peelChatgptFast(next.model);
    if (typeof next.model === 'string')
        next.model = peeled.model;
    if (peeled.fast)
        next.service_tier = 'priority';
    if (Array.isArray(next.input))
        next.input = next.input.map(developerRole);
    next.store = false;
    next.stream = true;
    return next;
}
/**
 * `subscription_sharing_usage_limit_exceeded` (429) is a plan or app limit:
 * answer it as a usage limit (QUOTA_EXCEEDED, no retry) pointing at
 * ChatGPT Settings → Usage. Every other answer is forwarded unchanged.
 */
export function chatgptQuotaFailure(status, payload) {
    const code = payload?.error?.code ?? payload?.code;
    if (code !== 'subscription_sharing_usage_limit_exceeded')
        return undefined;
    const message = typeof payload?.error?.message === 'string' && payload.error.message.trim()
        ? payload.error.message.trim()
        : `ChatGPT plan usage limit reached (HTTP ${status})`;
    return quotaFailure(`${message} — manage usage at ${CHATGPT_USAGE_URL}`);
}
