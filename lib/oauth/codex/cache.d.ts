/**
 * ChatGPT Codex prompt cache.
 *
 * Codex matches the longest stable prefix of `instructions` then `input`.
 * Sticky routing is `session-id` + `x-client-request-id` (same value as
 * `prompt_cache_key`). chatgpt.com 400s on DSH `session_id` in the JSON
 * (`Unsupported parameter: session_id`) — copy then strip here.
 * gpt-5.6 400s on `prompt_cache_retention` / `prompt_cache_options` —
 * those are stripped in request.ts, not here.
 *
 * Do not reuse this helper for Grok / GLM / Kiro / Antigravity.
 */
export declare function codexCacheSessionId(key: any): string;
export declare function applyCodexCache(payload: any): {
    payload: any;
    cacheSessionId: string;
};
export declare function codexCacheHeaders(cacheSessionId: any): {
    'session-id'?: undefined;
    'x-client-request-id'?: undefined;
} | {
    'session-id': string;
    'x-client-request-id': string;
};
