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
const SYSTEM_PIN_CAP = 64;
const SYSTEM_PINS = new Map();
export const CLINE_STABLE_SESSION = 'dsh-cline';
export function clineCacheSessionId(key) {
    if (typeof key !== 'string')
        return undefined;
    const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-');
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, 64);
}
export function resetClinePins() {
    SYSTEM_PINS.clear();
}
function systemText(message) {
    const content = message?.content;
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return content == null ? '' : String(content);
    return content
        .map((part) => {
        if (typeof part === 'string')
            return part;
        if (part && typeof part.text === 'string')
            return part.text;
        return '';
    })
        .join('');
}
function splitLeadingSystem(messages) {
    const head = [];
    let index = 0;
    while (index < messages.length && messages[index]?.role === 'system') {
        head.push(messages[index]);
        index += 1;
    }
    return { head, rest: messages.slice(index) };
}
export function stabilizeClineSystemPrefix(messages, sessionId) {
    if (!Array.isArray(messages) || !sessionId)
        return messages;
    const { head, rest } = splitLeadingSystem(messages);
    if (head.length === 0)
        return messages;
    const text = head.map(systemText).join('\n\n');
    const existing = SYSTEM_PINS.get(sessionId);
    if (existing === undefined) {
        if (SYSTEM_PINS.size >= SYSTEM_PIN_CAP) {
            const first = SYSTEM_PINS.keys().next().value;
            SYSTEM_PINS.delete(first);
        }
        SYSTEM_PINS.set(sessionId, { head, text });
        return messages;
    }
    let extra = '';
    if (text !== existing.text) {
        extra = text.startsWith(existing.text)
            ? text.slice(existing.text.length).replace(/^\n+/, '').trim()
            : text;
    }
    const parked = extra ? [{ role: 'system', content: extra }] : [];
    return [...existing.head, ...rest, ...parked];
}
export function applyClineCache(payload = {}) {
    const cacheSessionId = clineCacheSessionId(payload.session_id)
        ?? clineCacheSessionId(payload.prompt_cache_key)
        ?? CLINE_STABLE_SESSION;
    const next = { ...payload };
    delete next.prompt_cache_key;
    delete next.prompt_cache_retention;
    delete next.prompt_cache_options;
    delete next.session_id;
    if (Array.isArray(next.messages)) {
        next.messages = stabilizeClineSystemPrefix(next.messages, cacheSessionId);
    }
    return { payload: next, cacheSessionId };
}
/**
 * `X-Task-ID` for the Cline hop. Do not borrow Codex `session-id` /
 * `prompt_cache_key` or Grok `x-grok-conv-id` names.
 */
export function clineCacheHeaders(cacheSessionId) {
    const session = clineCacheSessionId(cacheSessionId) || CLINE_STABLE_SESSION;
    return {
        'X-Task-ID': session,
    };
}
