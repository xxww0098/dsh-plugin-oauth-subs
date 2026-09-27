/**
 * Anthropic subscription prompt cache.
 *
 * Anthropic prefix caching is content-addressed on api.anthropic.com: the
 * cache key is the request prefix itself (system → tools → messages), and the
 * DSH host already places `cache_control` checkpoints natively when it speaks
 * anthropic-messages — pi-ai's own anthropic lane puts the checkpoint on the
 * system + the last cacheable user block. This hop therefore only keeps the
 * prefix *stable*: nothing here may stamp a conversation id into the body
 * (there is no Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Cursor
 * conversation_id on this wire), and DSH-only cache fields are stripped
 * because the Messages API rejects unknown top-level fields.
 *
 * The derived conversation id is bookkeeping only (quota keys, logs) — it
 * never reaches upstream. Never stamp Date.now(). `dsh-anthropic` is
 * analyzer-only.
 */
export declare const ANTHROPIC_STABLE_SESSION = "dsh-anthropic";
export declare function anthropicCacheSessionId(key: any): string | undefined;
export declare function anthropicConversationId(payload?: any): string;
export declare function applyAnthropicCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/**
 * Anthropic does not sticky-route on Codex / Grok HTTP headers — cache
 * affinity is the prefix content itself.
 */
export declare function anthropicCacheHeaders(): {};
