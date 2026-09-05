/**
 * OpenCode Free prompt cache.
 *
 * anomalyco/opencode v1.18.29 sends `x-opencode-session` (sticky provider
 * + prompt cache), `x-opencode-request` (user message id), and
 * `x-opencode-client`. Zen `handler.ts` uses session as `stickyId`; empty
 * falls back to IP and mixes unrelated chats. Go docs: include
 * `x-opencode-session` so they can optimize prompt caching.
 *
 * Body still strips Codex / Grok fields — Zen Completions does not take
 * `prompt_cache_key`. Never stamp Date.now() as the session id.
 * `x-opencode-request` is one UUID per DSH request (retries replay it).
 */
export declare const OPENCODE_STABLE_SESSION = "dsh-opencode";
export declare function opencodeCacheSessionId(key: any): string;
export declare function resetOpencodePins(): void;
export declare function applyOpencodeCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/**
 * Official CLI `session/llm/request.ts` headers for providerID opencode.
 * `reqId` is one UUID per DSH request so retries keep the same id.
 * Do not invent `x-opencode-project` / `x-parent-session-id`.
 * Do not copy Codex `session-id` or non-opencode `x-session-affinity`.
 */
export declare function opencodeCacheHeaders(cacheSessionId: any, extra?: {}): {
    'x-opencode-session': string;
    'x-opencode-request': any;
};
