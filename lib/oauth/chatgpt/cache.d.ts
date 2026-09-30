/**
 * Sign in with ChatGPT prompt cache.
 *
 * The public Responses API caches on the longest stable prompt prefix and
 * accepts `prompt_cache_key` as the routing hint (preview-limitations does
 * not list it as unsupported; pi sends it on this route). It rejects
 * `prompt_cache_retention` (stripped in request.ts) and has no Codex
 * `session-id` / `thread-id` affinity headers — this family sends none.
 *
 * DSH `session_id` is copied into `prompt_cache_key` and never forwarded.
 * Missing ids fall back to the family constant, never a timestamp.
 *
 * Do not reuse this helper for another family.
 */
export declare const CHATGPT_STABLE_SESSION = "dsh-chatgpt";
export declare function chatgptCacheSessionId(key: any): string | undefined;
export declare function applyChatgptCache(payload: any): {
    payload: any;
    cacheSessionId: string;
};
