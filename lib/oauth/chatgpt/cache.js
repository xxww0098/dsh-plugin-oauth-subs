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
export const CHATGPT_STABLE_SESSION = 'dsh-chatgpt';
export function chatgptCacheSessionId(key) {
    if (typeof key !== 'string')
        return undefined;
    const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-');
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, 64);
}
export function applyChatgptCache(payload) {
    const next = { ...payload };
    const cacheSessionId = chatgptCacheSessionId(next.prompt_cache_key)
        || chatgptCacheSessionId(next.session_id)
        || CHATGPT_STABLE_SESSION;
    next.prompt_cache_key = cacheSessionId;
    delete next.session_id;
    return { payload: next, cacheSessionId };
}
