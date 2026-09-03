/**
 * OpenCode Free prompt cache.
 *
 * Zen /v1/chat/completions has no documented conversation / shard /
 * cache-read field. Strip Codex / Grok fields only. Do not invent
 * `cached_tokens`, `prompt_cache_key`, or a sticky conversation id.
 * Never stamp Date.now().
 */
export const OPENCODE_STABLE_SESSION = 'dsh-opencode';
export function opencodeCacheSessionId(key) {
    if (typeof key !== 'string')
        return undefined;
    const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-');
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, 64);
}
export function resetOpencodePins() {
    // No in-process prefix map — OpenCode Free has no documented pin.
}
export function applyOpencodeCache(payload = {}) {
    const next = { ...payload };
    delete next.prompt_cache_key;
    delete next.prompt_cache_retention;
    delete next.prompt_cache_options;
    delete next.session_id;
    return {
        payload: next,
        cacheSessionId: opencodeCacheSessionId(payload.session_id)
            ?? opencodeCacheSessionId(payload.prompt_cache_key)
            ?? OPENCODE_STABLE_SESSION,
    };
}
/** OpenCode Free does not sticky-route on Codex / Grok HTTP headers. */
export function opencodeCacheHeaders() {
    return {};
}
