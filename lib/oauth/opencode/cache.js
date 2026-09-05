/**
 * OpenCode Go Free prompt cache.
 *
 * Go `/v1/chat/completions` has no documented cache-read field. Official
 * Go docs ask for `x-opencode-session` so the relay can sticky-route
 * prompt cache. Strip Codex / Grok fields. Do not invent `cached_tokens`
 * or write Codex `session-id` / `prompt_cache_key`. Never stamp Date.now().
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
    // No in-process prefix map — Go has no documented prefix pin.
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
/** Official Go: `x-opencode-session` only. No Codex / Grok headers. */
export function opencodeCacheHeaders(sessionId) {
    const id = opencodeCacheSessionId(sessionId) ?? OPENCODE_STABLE_SESSION;
    return { 'x-opencode-session': id };
}
