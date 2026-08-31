/**
 * xAI Grok prompt cache.
 *
 * Grok sticky-routes by `x-grok-conv-id`. Codex `session-id` /
 * `x-client-request-id` are ignored on this backend and must not be copied.
 * The body still carries `prompt_cache_key` with the same cleaned id.
 *
 * A later 512-token cache block with <10% reuse is an affinity miss
 * (wrong xAI shard), not a prefix rewrite.
 */
export declare function grokCacheSessionId(key: any): string;
export declare function grokAffinityHeaders(cacheSessionId: any): {
    'x-grok-conv-id'?: undefined;
} | {
    'x-grok-conv-id': string;
};
export declare function applyGrokCache(payload: any): {
    payload: any;
    cacheSessionId: string;
};
