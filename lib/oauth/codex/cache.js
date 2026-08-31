/**
 * ChatGPT Codex prompt cache.
 *
 * Codex matches the longest stable prefix of `instructions` then `input`.
 * Sticky routing is `session-id` + `x-client-request-id` (same value as
 * `prompt_cache_key`). gpt-5.6 400s on `prompt_cache_retention` /
 * `prompt_cache_options` — those are stripped in request.ts, not here.
 *
 * Do not reuse this helper for Grok / GLM / Kiro / Antigravity.
 */
export function codexCacheSessionId(key) {
    if (typeof key !== 'string')
        return undefined;
    const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-');
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, 64);
}
export function applyCodexCache(payload) {
    const next = { ...payload };
    const cacheSessionId = codexCacheSessionId(next.prompt_cache_key)
        || codexCacheSessionId(next.session_id);
    if (cacheSessionId)
        next.prompt_cache_key = cacheSessionId;
    else
        delete next.prompt_cache_key;
    return { payload: next, cacheSessionId };
}
export function codexCacheHeaders(cacheSessionId) {
    if (typeof cacheSessionId !== 'string' || cacheSessionId.length === 0)
        return {};
    return {
        'session-id': cacheSessionId,
        'x-client-request-id': cacheSessionId,
    };
}
