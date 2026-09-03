/**
 * Ollama Cloud prompt cache.
 *
 * Official /v1/chat/completions and /api/chat have no documented
 * conversation / shard / cache-read field. This module only strips
 * Codex / Grok fields so they are not forwarded. Do not invent
 * `cached_tokens`, `prompt_cache_key`, or a sticky conversation id.
 * Never stamp Date.now().
 */
export declare const OLLAMA_STABLE_SESSION = "dsh-ollama";
export declare function ollamaCacheSessionId(key: any): string;
export declare function resetOllamaPins(): void;
export declare function applyOllamaCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/** Ollama does not sticky-route on Codex / Grok HTTP headers. */
export declare function ollamaCacheHeaders(): {};
