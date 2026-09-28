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
 * suffix so the first blob keeps hitting the cached prefix — but only when
 * the new head extends the pinned one; a genuinely different head (model
 * switch) re-pins instead of serving a stale system prompt. The fallback id
 * names no conversation, so it never pins.
 */
export declare const CLINE_STABLE_SESSION = "dsh-cline";
/** A fallback id is not a conversation: it never pins a system prompt. */
export declare function isClineFallback(id: any): boolean;
export declare function clineCacheSessionId(key: any): string | undefined;
export declare function resetClinePins(): void;
export declare function stabilizeClineSystemPrefix(messages: any, sessionId: any): any;
export declare function applyClineCache(payload?: any): {
    payload: any;
    cacheSessionId: string;
};
/**
 * `X-Task-ID` for the Cline hop. Do not borrow Codex `session-id` /
 * `prompt_cache_key` or Grok `x-grok-conv-id` names.
 */
export declare function clineCacheHeaders(cacheSessionId: any): {
    'X-Task-ID': string;
};
