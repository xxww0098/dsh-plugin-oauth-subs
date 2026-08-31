/**
 * Google Antigravity (Gemini) implicit prompt cache.
 *
 * cloudcode-pa caches a stable `systemInstruction` plus contents prefix.
 * Usage hits arrive as `cachedContentTokenCount` (mapped to OpenAI
 * `prompt_tokens_details.cached_tokens` in request.ts). Sticky identity is
 * `request.sessionId` on generateContent — not Codex headers, not Grok
 * `x-grok-conv-id`.
 *
 * DSH prepends a runtime-context system snapshot every step. The first
 * systemInstruction per session is pinned; extras are returned as `extra`
 * text for the caller to append as a trailing user turn.
 */
/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export const ANTIGRAVITY_STABLE_SESSION = 'dsh-antigravity';
const SYSTEM_PINS = new Map();
const SYSTEM_PIN_CAP = 64;
export function antigravityCacheSessionId(key) {
    if (typeof key !== 'string')
        return undefined;
    const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-');
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, 64);
}
export function resetAntigravitySystemPins() {
    SYSTEM_PINS.clear();
}
function systemText(parts) {
    return (parts ?? []).map((part) => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n\n');
}
export function pinAntigravitySystemInstruction(sessionId, parts) {
    const text = systemText(parts);
    if (!sessionId || sessionId === ANTIGRAVITY_STABLE_SESSION || !text)
        return { parts, extra: undefined };
    const existing = SYSTEM_PINS.get(sessionId);
    if (existing === undefined) {
        if (SYSTEM_PINS.size >= SYSTEM_PIN_CAP) {
            const first = SYSTEM_PINS.keys().next().value;
            SYSTEM_PINS.delete(first);
        }
        SYSTEM_PINS.set(sessionId, text);
        return { parts, extra: undefined };
    }
    if (existing === text)
        return { parts, extra: undefined };
    let extra = text;
    if (text.startsWith(existing))
        extra = text.slice(existing.length).replace(/^\n+/, '').trim();
    return { parts: [{ text: existing }], extra: extra || undefined };
}
export function antigravitySessionIdOf(payload = {}, explicit) {
    return antigravityCacheSessionId(explicit)
        ?? antigravityCacheSessionId(payload.session_id)
        ?? antigravityCacheSessionId(payload.prompt_cache_key)
        ?? ANTIGRAVITY_STABLE_SESSION;
}
