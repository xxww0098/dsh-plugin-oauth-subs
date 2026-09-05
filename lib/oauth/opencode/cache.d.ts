/**
 * OpenCode Go Free prompt cache.
 *
 * Go `/v1/chat/completions` has no documented cache-read field. Official
 * Go docs ask for `x-opencode-session` so the relay can sticky-route
 * prompt cache. Strip Codex / Grok fields. Do not invent `cached_tokens`
 * or write Codex `session-id` / `prompt_cache_key`. Never stamp Date.now().
 */
export declare const OPENCODE_STABLE_SESSION = "dsh-opencode";
export declare function opencodeCacheSessionId(key: any): string;
export declare function resetOpencodePins(): void;
export declare function applyOpencodeCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/** Official Go: `x-opencode-session` only. No Codex / Grok headers. */
export declare function opencodeCacheHeaders(sessionId: any): {
    'x-opencode-session': string;
};
