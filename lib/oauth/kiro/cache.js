/**
 * AWS Kiro / CodeWhisperer conversation cache.
 *
 * Cache affinity is `conversationState.conversationId`. There is no Codex
 * `prompt_cache_key`, no Grok `x-grok-conv-id`, and no Gemini
 * `systemInstruction` pin. Hits surface as `cacheReadInputTokens` on the
 * event stream. Never stamp the id with `Date.now()`.
 *
 * Official kiro.rs parks system as a history user + canned assistant pair
 * (Kiro has no system field). DSH snapshots that would rewrite that pair
 * are pinned per conversationId; extras go at the history suffix, never
 * between an assistant `toolUses` and the matching `toolResults`.
 * conversationId also includes the model id so switching the picker does
 * not reuse another model's AWS conversation.
 */
/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export const KIRO_STABLE_SESSION = 'dsh-kiro';
const SYSTEM_PINS = new Map();
const SYSTEM_PIN_CAP = 64;
export function kiroCacheSessionId(key) {
    if (typeof key !== 'string')
        return undefined;
    const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-');
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, 64);
}
export function resetKiroSystemPins() {
    SYSTEM_PINS.clear();
}
function appendKiroModel(base, modelId) {
    const model = kiroCacheSessionId(modelId);
    if (!model)
        return base;
    if (base === model || base.endsWith(`:${model}`))
        return base;
    const room = 64 - 1 - model.length;
    if (room < 1)
        return model.slice(0, 64);
    return `${base.slice(0, room)}:${model}`;
}
/**
 * Pin the first system blob per conversationId. Extra / changed DSH
 * snapshots are returned as `extra` so request.ts can park them after
 * the conversation (user + ack pair), not on currentMessage.
 */
export function pinKiroSystemPrefix(conversationId, systemText) {
    const text = typeof systemText === 'string' ? systemText : '';
    if (!text)
        return { pinned: '', extra: '' };
    if (!conversationId || conversationId === KIRO_STABLE_SESSION) {
        return { pinned: text, extra: '' };
    }
    const existing = SYSTEM_PINS.get(conversationId);
    if (existing === undefined) {
        if (SYSTEM_PINS.size >= SYSTEM_PIN_CAP) {
            const first = SYSTEM_PINS.keys().next().value;
            SYSTEM_PINS.delete(first);
        }
        SYSTEM_PINS.set(conversationId, text);
        return { pinned: text, extra: '' };
    }
    if (existing === text || existing.startsWith(text))
        return { pinned: existing, extra: '' };
    const extra = text.startsWith(existing)
        ? text.slice(existing.length).replace(/^\n+/, '').trim()
        : text;
    return { pinned: existing, extra };
}
export function kiroConversationId(payload = {}, explicit) {
    const base = kiroCacheSessionId(explicit)
        ?? kiroCacheSessionId(payload.session_id)
        ?? kiroCacheSessionId(payload.prompt_cache_key)
        ?? KIRO_STABLE_SESSION;
    return appendKiroModel(base, payload.model);
}
