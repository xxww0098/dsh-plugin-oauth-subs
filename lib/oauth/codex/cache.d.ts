/**
 * ChatGPT Codex prompt cache.
 *
 * Codex matches the longest stable prefix of `instructions` then `input`.
 * openai/codex 0.153.4 `build_session_headers` sends `session-id` (prompt
 * cache) and `thread-id` (sticky routing) as two ids. Subagents share the
 * session and get their own thread; `x-client-request-id` equals thread-id.
 * DSH is one thread per conversation, so all three equal `prompt_cache_key`.
 *
 * chatgpt.com 400s on DSH `session_id` in the JSON (`Unsupported parameter:
 * session_id`) — copy then strip here. gpt-5.6 400s on
 * `prompt_cache_retention` / `prompt_cache_options` — those are stripped in
 * request.ts, not here.
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
    'thread-id'?: undefined;
    'x-client-request-id'?: undefined;
} | {
    'session-id': string;
    'thread-id': string;
    'x-client-request-id': string;
};
