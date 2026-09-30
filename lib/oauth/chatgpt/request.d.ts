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
export declare const CHATGPT_FAST_SUFFIX = "-fast";
/** `gpt-6-sol-fast` → `{ model: 'gpt-6-sol', fast: true }` when the base row offers Fast. */
export declare function peelChatgptFast(modelId: any): {
    model: string;
    fast: boolean;
};
/** preview-limitations "Unsupported fields", plus previous_response_id / prompt_cache_options / service_tier. */
export declare const CHATGPT_UNSUPPORTED_FIELDS: readonly string[];
export declare function normalizeChatgptResponsesBody(payload: any): any;
/**
 * `subscription_sharing_usage_limit_exceeded` (429) is a plan or app limit:
 * answer it as a usage limit (QUOTA_EXCEEDED, no retry) pointing at
 * ChatGPT Settings → Usage. Every other answer is forwarded unchanged.
 */
export declare function chatgptQuotaFailure(status: any, payload: any): import("../upstream.js").UpstreamFailure | undefined;
