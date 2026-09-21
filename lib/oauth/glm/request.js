/**
 * Shape DSH bodies for Zhipu Coding Plan.
 *
 * Completions hop (`/glm/v1/chat/completions` → paas/v4): leftover settings.
 * Anthropic hop (`/glm/v1/messages` → /api/anthropic/v1/messages): ZCode
 * default, DSH `api: anthropic-messages`.
 *
 * Thinking: GLM-5.3 / Flash are forced-on (`type: disabled` 400s).
 * Prefix cache needs `clear_thinking: false` and previous reasoning left intact.
 * https://docs.z.ai/guides/capabilities/thinking-mode
 *
 * Cache lives in `./cache.ts`.
 */
import { applyGlmAnthropicCache, applyGlmCache } from './cache.js';
export { glmCacheSessionId, resetGlmSystemPins } from './cache.js';
const GLM_CHAT_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const GLM_DEFAULT_MAX_TOKENS = 128_000;
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** 5.3 / Flash cannot turn thinking off. Turbo is hybrid — do not force it. */
export function glmForcedThinkingModel(model) {
    const id = typeof model === 'string' ? model.trim().toLowerCase() : '';
    return id === 'glm-5.3' || id.startsWith('glm-5.3-');
}
/**
 * Official ZCode catalog map for GLM ids on `apiTypeMatch: anthropic-messages`
 * (config/provider/zcode-builtin.json modelApiRules):
 *
 *   5.3 / Flash  { thinking: { type: enabled }, output_config: { effort } }
 *   5.2          disabled -> { thinking: { type: disabled } }
 *                otherwise  thinking enabled + output_config.effort
 *   Turbo        { thinking: { type: enabled | disabled } }, no effort
 *
 * ZCode's client sends neither Anthropic `budget_tokens` nor `display` for
 * GLM, and it does not send `clear_thinking` at all: docs.z.ai/guides/
 * capabilities/thinking-mode says Preserved Thinking is already the default on
 * the Coding Plan endpoint and `clear_thinking: false` is the standard-API
 * opt-in. We keep the opt-in as the live finding in docs/error.md
 * 2026-08-30 GLM 思考链.
 */
const GLM_ANTHROPIC_EFFORTS = new Set(['low', 'high', 'max']);
/**
 * GLM id family driving the official thinking map. `glm-5.2` is no longer a
 * picker row (the plan auto-routes legacy ids to 5.3 / 5.3-Flash), but a
 * leftover pinned route can still send it and ZCode's catalog still carries
 * its map — so the request shape stays source-correct here; the backend
 * decides the routing.
 */
export function glmAnthropicFamily(model) {
    const id = typeof model === 'string' ? model.trim().toLowerCase() : '';
    if (!id)
        return undefined;
    if (id === 'glm-5.3' || id.startsWith('glm-5.3-'))
        return 'glm-5.3';
    if (id === 'glm-5.2' || id.startsWith('glm-5.2-'))
        return 'glm-5.2';
    if (id === 'glm-5-turbo' || id.startsWith('glm-5-turbo-'))
        return 'glm-5-turbo';
    return undefined;
}
/**
 * Picker level carried to the hop. pi-ai's adaptive path writes
 * `output_config.effort`; other clients may use `thinking.effort` or a bare
 * `reasoning_effort`. `enabled` is Turbo's on-switch, not an effort.
 */
export function glmAnthropicEffort(payload) {
    const raw = payload?.output_config?.effort
        ?? payload?.thinking?.effort
        ?? payload?.reasoning_effort;
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    return GLM_ANTHROPIC_EFFORTS.has(value) ? value : undefined;
}
/** Coding Plan output cap per model (ZCode modelRules maxOutputTokens). */
export function glmMaxTokens(model) {
    return glmAnthropicFamily(model) === 'glm-5-turbo' ? 64_000 : GLM_DEFAULT_MAX_TOKENS;
}
function withReasoningContent(message) {
    if (message.role !== 'assistant')
        return message;
    if (message.reasoning_content != null)
        return message;
    if (message.reasoning == null)
        return message;
    return { ...message, reasoning_content: message.reasoning };
}
function applyGlmThinking(payload) {
    const forced = glmForcedThinkingModel(payload.model);
    const current = isPlainObject(payload.thinking) ? payload.thinking : undefined;
    if (forced) {
        return { ...payload, thinking: { ...current, type: 'enabled', clear_thinking: false } };
    }
    if (current && current.type !== 'disabled') {
        return { ...payload, thinking: { ...current, clear_thinking: false } };
    }
    return payload;
}
/**
 * Anthropic hop thinking: official GLM shape, not the Completions shape.
 * 5.3 / Flash are forced on; 5.2 keeps `disabled`; Turbo and unknown ids keep
 * the legacy conservative rewrite (never force thinking on).
 */
export function applyGlmAnthropicThinking(payload) {
    const family = glmAnthropicFamily(payload.model);
    const current = isPlainObject(payload.thinking) ? payload.thinking : undefined;
    if (family !== 'glm-5.3' && family !== 'glm-5.2') {
        if (current && current.type !== 'disabled') {
            return { ...payload, thinking: { ...current, clear_thinking: false } };
        }
        return payload;
    }
    const effort = glmAnthropicEffort(payload);
    const next = { ...payload };
    delete next.thinking;
    delete next.reasoning_effort;
    delete next.output_config;
    if (family === 'glm-5.2' && current?.type === 'disabled') {
        next.thinking = { type: 'disabled' };
        return next;
    }
    next.thinking = { type: 'enabled', clear_thinking: false };
    if (effort !== undefined)
        next.output_config = { effort };
    return next;
}
export function normalizeGlmChatBody(payload) {
    if (!isPlainObject(payload))
        return payload;
    const next = { ...payload };
    if (Array.isArray(next.messages)) {
        next.messages = next.messages.map((message) => {
            if (!isPlainObject(message))
                return message;
            const role = message.role;
            const rewritten = typeof role === 'string' && !GLM_CHAT_ROLES.has(role)
                ? { ...message, role: 'system' }
                : message;
            return withReasoningContent(rewritten);
        });
    }
    return applyGlmStreamUsage(applyGlmThinking(applyGlmCache(next).payload));
}
/** Completions leftover: map cache-read aliases. Anthropic hop is passthrough. */
export function mapGlmChatUsage(usage) {
    if (!usage || typeof usage !== 'object')
        return usage;
    const cached = usage.prompt_tokens_details?.cached_tokens
        ?? usage.cached_tokens
        ?? usage.cache_read_input_tokens
        ?? usage.cache_read_tokens;
    if (typeof cached !== 'number' || !Number.isFinite(cached) || cached < 0)
        return usage;
    const details = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
        ? { ...usage.prompt_tokens_details }
        : {};
    if (typeof details.cached_tokens !== 'number')
        details.cached_tokens = cached;
    return { ...usage, prompt_tokens_details: details };
}
function applyGlmStreamUsage(payload) {
    if (!payload || payload.stream !== true)
        return payload;
    const current = payload.stream_options;
    if (current && typeof current === 'object' && Object.hasOwn(current, 'include_usage'))
        return payload;
    return {
        ...payload,
        stream_options: current && typeof current === 'object'
            ? { ...current, include_usage: true }
            : { include_usage: true },
    };
}
/**
 * DSH anthropic-messages body. Anthropic requires `max_tokens`.
 * System pin + cache_control live in applyGlmAnthropicCache.
 */
export function normalizeGlmAnthropicBody(payload) {
    if (!isPlainObject(payload))
        return payload;
    const next = { ...payload };
    if (typeof next.max_tokens !== 'number' || !Number.isFinite(next.max_tokens) || next.max_tokens <= 0) {
        next.max_tokens = glmMaxTokens(next.model);
    }
    return applyGlmAnthropicThinking(applyGlmAnthropicCache(next).payload);
}
