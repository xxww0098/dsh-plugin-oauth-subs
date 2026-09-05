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
    // DSH long chats send session_id. chatgpt.com Codex rejects it.
    delete next.session_id;
    return { payload: next, cacheSessionId };
}
export function codexCacheHeaders(cacheSessionId) {
    if (typeof cacheSessionId !== 'string' || cacheSessionId.length === 0)
        return {};
    return {
        'session-id': cacheSessionId,
        'thread-id': cacheSessionId,
        'x-client-request-id': cacheSessionId,
    };
}
