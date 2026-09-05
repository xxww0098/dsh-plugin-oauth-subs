/**
 * Cursor AgentService conversation cache.
 *
 * Sticky identity is `AgentRunRequest.conversation_id` (verified in
 * Rahularya01/pi-cursor proto/agent.proto + request-build.ts). There is no
 * Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Gemini sessionId
 * header, and no Kiro conversationState field copied onto this hop.
 * Never stamp the id with `Date.now()`.
 *
 * @cursor/sdk 1.0.27 (pi-cursor-sdk 0.3.6) reports cache hits on
 * `TurnEndedUpdate.cache_read_tokens`. Historical `messageId` / turn
 * `requestId` must be stable for the same conversation content — a fresh
 * `randomUUID()` every hop rewrites the prefix blobs and busts the cache.
 *
 * HTTP sticky headers are `x-request-id` + `x-original-request-id` (SDK
 * Run handshake). Conversation id stays on the protobuf body. Do not
 * invent parent/subagent request headers, and do not switch
 * `x-cursor-client-type` to `sdk` (this hop is CLI OAuth).
 *
 * Cursor publishes the system prompt as `root_prompt_messages_json` blobs.
 * The first system text per conversationId is pinned; later DSH runtime
 * snapshots become extra system blobs in that same list (Cursor prefix),
 * not a GLM trailing system or a Gemini trailing user.
 */
import { createHash } from 'node:crypto';
export const CURSOR_STABLE_SESSION = 'dsh-cursor';
export const CURSOR_FAST_SUFFIX = '-fast';
/**
 * Host-side Cursor Fast picker suffix. Not Codex `service_tier`.
 * Wire `requestedModel.modelId` and the conversation pin use the family id.
 */
export function peelCursorFastSuffix(modelId) {
    const raw = typeof modelId === 'string' ? modelId.trim() : '';
    if (!raw.toLowerCase().endsWith(CURSOR_FAST_SUFFIX)) {
        return { modelId: raw, requestedFast: false };
    }
    const peeled = raw.slice(0, -CURSOR_FAST_SUFFIX.length);
    if (!peeled)
        return { modelId: raw, requestedFast: false };
    return { modelId: peeled, requestedFast: true };
}
const SYSTEM_PINS = new Map();
const SYSTEM_PIN_CAP = 64;
export function cursorCacheSessionId(key) {
    if (typeof key !== 'string')
        return undefined;
    const cleaned = key.trim().replace(/[^A-Za-z0-9._:-]/g, '-');
    if (!cleaned)
        return undefined;
    return cleaned.slice(0, 64);
}
export function resetCursorSystemPins() {
    SYSTEM_PINS.clear();
}
/**
 * Deterministic UUID for conversation blobs. Same seed → same id so a
 * replayed DSH history encodes the same prefix as the previous turn.
 */
export function cursorStableId(...parts) {
    const digest = createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\0')).digest();
    const bytes = Buffer.from(digest.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
function appendCursorModel(base, modelId) {
    const model = cursorCacheSessionId(modelId);
    if (!model)
        return base;
    if (base === model || base.endsWith(`:${model}`))
        return base;
    const room = 64 - 1 - model.length;
    if (room < 1)
        return model.slice(0, 64);
    return `${base.slice(0, room)}:${model}`;
}
export function pinCursorSystemPrefix(conversationId, systemText) {
    const text = typeof systemText === 'string' ? systemText : '';
    if (!text)
        return { pinned: '', extra: '' };
    if (!conversationId || conversationId === CURSOR_STABLE_SESSION) {
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
export function cursorConversationId(payload = {}, explicit) {
    const base = cursorCacheSessionId(explicit)
        ?? cursorCacheSessionId(payload.session_id)
        ?? cursorCacheSessionId(payload.prompt_cache_key)
        ?? CURSOR_STABLE_SESSION;
    return appendCursorModel(base, peelCursorFastSuffix(payload.model).modelId);
}
export function applyCursorCache(payload = {}) {
    const next = { ...payload };
    delete next.prompt_cache_retention;
    delete next.prompt_cache_options;
    delete next.prompt_cache_key;
    delete next.service_tier;
    return {
        payload: next,
        cacheSessionId: cursorConversationId(next),
    };
}
/** Cursor does not sticky-route on Codex / Grok HTTP headers. */
export function cursorCacheHeaders() {
    return {};
}
