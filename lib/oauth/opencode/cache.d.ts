/**
 * OpenCode Free prompt cache.
 *
 * Zen /v1/chat/completions has no documented conversation / shard /
 * cache-read field. Strip Codex / Grok fields only. Do not invent
 * `cached_tokens`, `prompt_cache_key`, or a sticky conversation id.
 * Never stamp Date.now().
 */
export declare const OPENCODE_STABLE_SESSION = "dsh-opencode";
export declare function opencodeCacheSessionId(key: any): string;
export declare function resetOpencodePins(): void;
export declare function applyOpencodeCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/** OpenCode Free does not sticky-route on Codex / Grok HTTP headers. */
export declare function opencodeCacheHeaders(): {};
