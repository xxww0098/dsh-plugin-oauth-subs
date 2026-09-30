/**
 * AWS Kiro / CodeWhisperer conversation cache.
 *
 * Kiro caches by request-prefix content, not by `conversationId` (live
 * 2026-09-29: a growing history at a fresh conversationId still cost 0.53x of
 * cold; changing one tool description cost 1.00x, so the tool list is part of
 * the prefix). The server never reports a hit (no `cacheReadInputTokens`).
 * There is no Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, and no
 * Gemini `systemInstruction` pin. The id still keys the system pin below and
 * must never be stamped with `Date.now()`.
 *
 * Official kiro.rs parks system as a history user + canned assistant pair
 * (Kiro has no system field). DSH snapshots that would rewrite that pair
 * are pinned per conversationId; extras go at the history suffix, never
 * between an assistant `toolUses` and the matching `toolResults`.
 * conversationId also includes the model id so switching the picker does
 * not reuse another model's AWS conversation.
 */
import { createHash } from 'node:crypto';
import { appendPrivateLine } from '../../utils/private-text.js';
/** When DSH sends neither session_id nor prompt_cache_key, key on a constant (never pinned). */
export const KIRO_STABLE_SESSION = 'dsh-kiro';
const SYSTEM_PINS = new Map();
const SYSTEM_PIN_CAP = 64;
/** `dsh-kiro` or `dsh-kiro:<model>` is not a conversation: it never pins. */
export function isKiroFallback(id) {
    return typeof id !== 'string' || id === '' || id === KIRO_STABLE_SESSION || id.startsWith(`${KIRO_STABLE_SESSION}:`);
}
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
/**
 * Read a pin and mark it most recently used. Map order is recency, so the
 * cap drops the idlest conversation, never one that is still sending steps.
 */
function usePin(key) {
    const pin = SYSTEM_PINS.get(key);
    if (pin === undefined)
        return undefined;
    SYSTEM_PINS.delete(key);
    SYSTEM_PINS.set(key, pin);
    return pin;
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
    if (isKiroFallback(conversationId)) {
        return { pinned: text, extra: '' };
    }
    const existing = usePin(conversationId);
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
    // A different prompt on the same id is its own request: re-pin, send as-is.
    if (unrelatedPrompt(existing, text)) {
        SYSTEM_PINS.set(conversationId, text);
        return { pinned: text, extra: '' };
    }
    const extra = text.startsWith(existing)
        ? text.slice(existing.length).replace(/^\n+/, '').trim()
        : text;
    return { pinned: existing, extra };
}
/** Under half of the shorter text shared as prefix + suffix: a different
 * prompt, not an edit of the pinned one. DSH's session-title request shares
 * the chat's session id; parking the chat's prompt behind a pinned title
 * prompt made the model answer with a title. */
function unrelatedPrompt(existing, text) {
    const max = Math.min(existing.length, text.length);
    let prefix = 0;
    while (prefix < max && existing.charCodeAt(prefix) === text.charCodeAt(prefix))
        prefix += 1;
    let suffix = 0;
    while (suffix < max - prefix
        && existing.charCodeAt(existing.length - 1 - suffix) === text.charCodeAt(text.length - 1 - suffix))
        suffix += 1;
    return (prefix + suffix) * 2 < max;
}
export function kiroConversationId(payload = {}, explicit) {
    const base = kiroCacheSessionId(explicit)
        ?? kiroCacheSessionId(payload.session_id)
        ?? kiroCacheSessionId(payload.prompt_cache_key)
        ?? KIRO_STABLE_SESSION;
    return appendKiroModel(base, payload.model);
}
// ── Cacheable-prefix estimate (Kiro reports no cached tokens) ─────────────
const PREFIX_BASELINES = new Map();
/** Recent requests kept per conversation: DSH's title request shares the session id. */
const PREFIX_BASELINE_KEEP = 4;
let prefixLog;
/** Where each request's estimate is appended; `npm run analyze` reads it. */
export function setPrefixEstimateLog(path) {
    prefixLog = path;
}
export function resetKiroPrefixBaselines() {
    PREFIX_BASELINES.clear();
}
/**
 * One Kiro body in the model's prompt order: tools first (they sit in the
 * cache prefix although the wire carries them on the current message), then
 * each history turn and the current turn by content only, so this turn's
 * current message matches next turn's history entry.
 */
function prefixSegments(body) {
    const state = body?.conversationState ?? {};
    const current = state.currentMessage?.userInputMessage ?? {};
    const turn = (entry) => (entry?.assistantResponseMessage
        ? [entry.assistantResponseMessage.content, entry.assistantResponseMessage.toolUses ?? null]
        : [entry?.userInputMessage?.content, entry?.userInputMessage?.userInputMessageContext?.toolResults ?? null, entry?.userInputMessage?.images ?? null]);
    return [
        JSON.stringify(current.userInputMessageContext?.tools ?? null),
        ...(state.history ?? []).map((entry) => JSON.stringify(turn(entry))),
        JSON.stringify(turn({ userInputMessage: current })),
    ];
}
/**
 * Upper bound on this request's cache hit: the bytes it shares, segment by
 * segment from the front, with the best of this conversation's last few
 * requests. It assumes the server cache is still warm (`gapMs` says how old
 * that baseline is). `matched` is null without a baseline or a DSH session.
 */
export function estimateKiroPrefix(conversationId, body, now) {
    const segments = prefixSegments(body);
    const lengths = segments.map((segment) => segment.length);
    const hashes = segments.map((segment) => createHash('sha1').update(segment).digest('base64'));
    const bytes = lengths.reduce((sum, n) => sum + n, 0);
    if (isKiroFallback(conversationId))
        return { bytes, matched: null, gapMs: null };
    const baselines = PREFIX_BASELINES.get(conversationId) ?? [];
    let best;
    for (const baseline of baselines) {
        let matched = 0;
        for (let i = 0; i < hashes.length && baseline.hashes[i] === hashes[i]; i++)
            matched += lengths[i];
        if (!best || matched > best.matched)
            best = { matched, gapMs: now - baseline.at };
    }
    // Same bound and recency order as the system pins: re-insert this
    // conversation, then drop the idlest one if the map is full.
    PREFIX_BASELINES.delete(conversationId);
    if (PREFIX_BASELINES.size >= SYSTEM_PIN_CAP)
        PREFIX_BASELINES.delete(PREFIX_BASELINES.keys().next().value);
    PREFIX_BASELINES.set(conversationId, [...baselines, { hashes, at: now }].slice(-PREFIX_BASELINE_KEEP));
    return { bytes, matched: best?.matched ?? null, gapMs: best?.gapMs ?? null };
}
/** Estimate one outgoing body and append it to the log; never throws into the request. */
export function recordKiroPrefix({ conversationId, session, model, body }) {
    if (!prefixLog)
        return;
    // A timestamp for the log line and the baseline age — never an id.
    const ts = Date.now();
    const estimate = estimateKiroPrefix(conversationId, body, ts);
    void appendPrivateLine(prefixLog, JSON.stringify({ ts, family: 'kiro', session: session ?? null, model: model ?? null, ...estimate }), 4_000_000).catch(() => { });
}
