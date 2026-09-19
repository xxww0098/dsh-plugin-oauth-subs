/**
 * Cline prompt cache.
 *
 * Cline is OpenRouter-backed: caching is an implicit prefix hash and the
 * client never sends `prompt_cache_key` / `cache_control`. Its one per-turn
 * affinity field is the `X-Task-ID` request header —
 * `buildClineRequestHeaders` sets it to the session id and this hop pins the
 * DSH conversation onto it. Never stamp `Date.now()`; the fallback
 * `dsh-cline` is the family constant (analyzer-visible, not a real id).
 *
 * Extra DSH snapshots of the leading system prompt park at the messages
 * suffix so the first blob keeps hitting the cached prefix.
 */
export declare const CLINE_STABLE_SESSION = "dsh-cline";
export declare function clineCacheSessionId(key: any): string;
export declare function resetClinePins(): void;
export declare function stabilizeClineSystemPrefix(messages: any, sessionId: any): any;
export declare function applyClineCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/**
 * `X-Task-ID` for the Cline hop. Do not borrow Codex `session-id` /
 * `prompt_cache_key` or Grok `x-grok-conv-id` names.
 */
export declare function clineCacheHeaders(cacheSessionId: any): {
    'X-Task-ID': string;
};
