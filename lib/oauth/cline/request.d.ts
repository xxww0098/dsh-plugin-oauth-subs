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
import { UpstreamFailure } from '../upstream.js';
export declare function isClineReasoningEraModel(modelId: any): boolean;
export declare function applyClineThinking(payload?: any, model?: any): any;
export declare function applyClineMaxCompletionTokens(payload?: any): any;
/** Completions SSE omits usage unless the vendor is asked. Do not override an explicit value. */
export declare function applyClineStreamUsage(payload?: any): any;
/**
 * Cline answers a **non-streaming** chat with the same `{success, data}` envelope
 * as its account endpoints — live-verified 2026-09-19:
 * `{"data":{"choices":[…]}, "success":true}`. SSE answers are not wrapped.
 * The CLI only unwraps this for OpenRouter image requests
 * (`createSuccessDataResponseFetch`), because its text path always streams;
 * a DSH non-streaming call would otherwise read `choices` off the envelope.
 */
export declare function unwrapClineEnvelope(payload: any): any;
/**
 * The daily free-model cap (live 2026-09-28): HTTP 429
 * `{"code":"INFERENCE_CAP_ERROR","message":"Error 429: Daily free limit reached on model …"}`.
 * Forwarded as-is the host reads RATE_LIMIT and retries 5 times; the
 * `usage limit reached:` prefix makes it QUOTA_EXCEEDED, which it does not.
 */
export declare function clineQuotaFailure(status: any, payload: any): UpstreamFailure | undefined;
/** Map vendor cache-read aliases. Absent field stays absent — do not invent 0. */
export declare function mapClineUsage(usage: any): any;
