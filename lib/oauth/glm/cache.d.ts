/**
 * Z.AI Coding Plan implicit prefix cache.
 * https://docs.z.ai/guides/capabilities/cache
 *
 * The cache key is a hash of the leading system blob plus history. There is
 * no Codex `prompt_cache_key` and no Grok `x-grok-conv-id`. Sticky routing
 * is the OpenAI `user` field / Anthropic `metadata.user_id` plus the
 * `x-session-id` header. Anthropic also stamps `cache_control` on the first
 * system text block plus a rolling breakpoint on the latest non-system message
 * (ZCode default protocol, `finalizeLatestNonSystemMessageCacheControl`).
 *
 * DSH prepends a runtime-context snapshot as another leading system every
 * step. That rewrite is parked at the messages suffix so the first system
 * blob can still hit. Thinking models also need `clear_thinking: false`
 * (owned by request.ts).
 */
export declare function glmCacheSessionId(key: any): string | undefined;
export declare function resetGlmSystemPins(): void;
/**
 * Pin the first leading system run per DSH session. Extra / changed
 * snapshots go after the conversation so the implicit-cache prefix
 * stays byte-stable.
 */
export declare function stabilizeGlmSystemPrefix(messages: any, sessionId: any): any;
/**
 * Pin the first Anthropic `system` run per DSH session. Extra snapshots
 * become additional text blocks *without* cache_control so the first
 * block stays a stable prefix. Z.AI Anthropic accepts `cache_control`.
 */
export declare function stabilizeGlmAnthropicSystem(system: any, sessionId: any): any;
/**
 * ZCode `finalizeLatestNonSystemMessageCacheControl`
 * (apps/zcode-cli/packages/core/src/runtime/helpers/provider-request-messages.ts):
 * exactly one rolling `cache_control` breakpoint, on the latest non-system
 * message. pi-ai already stamps the last user turn, so the common case is
 * idempotent; this owns the guarantee for assistant-last bodies and clears
 * stale non-system breakpoints a replay client may carry. Message breakpoints
 * only — tool-level breakpoints stay where the client put them, same as ZCode.
 */
export declare function stabilizeGlmAnthropicMessageCache(messages: any): any;
/** Drop Codex/Grok cache fields; pin `user`; freeze the leading system. */
export declare function applyGlmCache(payload: any): {
    payload: any;
    cacheSessionId: string | undefined;
};
/**
 * Anthropic Messages: pin top-level `system`, `metadata.user_id`, and
 * `cache_control` on the first system block. Same pin map as Completions.
 */
export declare function applyGlmAnthropicCache(payload: any): {
    payload: any;
    cacheSessionId: string | undefined;
};
