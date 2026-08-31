/**
 * Shape a generic OpenAI chat/completions body for Zhipu Coding Plan.
 *
 * DSH injects `role: "developer"` (system prompt, AGENTS.md, CLAUDE.md).
 * Coding Plan only accepts system / user / assistant / tool — anything
 * else is 400 `1214 角色信息不正确`.
 *
 * Thinking: GLM-5.3 / Flash are forced-on (`type: disabled` 400s).
 * Coding Plan prefix cache needs `clear_thinking: false` and the
 * previous turn's `reasoning_content` left intact.
 * https://docs.z.ai/guides/capabilities/thinking-mode
 *
 * Cache lives in `./cache.ts` (implicit prefix hash + `user` / x-session-id).
 */
import { applyGlmCache } from './cache.js';
export { glmCacheSessionId, resetGlmSystemPins } from './cache.js';
const GLM_CHAT_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** 5.3 / Flash cannot turn thinking off. Turbo is hybrid — do not force it. */
export function glmForcedThinkingModel(model) {
    const id = typeof model === 'string' ? model.trim().toLowerCase() : '';
    return id === 'glm-5.3' || id.startsWith('glm-5.3-');
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
    return applyGlmThinking(applyGlmCache(next).payload);
}
