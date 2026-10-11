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
 * Live 2026-10-11: the route answered native `cached_tokens` and
 * `cache_write_tokens` 0 on byte-identical repeats at 4.2K-62K tokens across
 * three models, with and without this key, and for both a leading developer
 * message and request-level `instructions`; the Codex backend reused the same
 * prompt in full under the same method. So the low hit rate is the route, not
 * the key or the item shape — keep sending the key (models before GPT-5.6
 * need it for routing) and never invent affinity headers. Family README
 * 固定前缀缓存诊断 holds the matrix.
 *
 * Do not reuse this helper for another family.
 */
export declare const CHATGPT_STABLE_SESSION = "dsh-chatgpt";
export declare function chatgptCacheSessionId(key: any): string | undefined;
export declare function applyChatgptCache(payload: any): {
    payload: any;
    cacheSessionId: string;
};
