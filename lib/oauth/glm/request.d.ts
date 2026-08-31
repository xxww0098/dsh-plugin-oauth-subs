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
export { glmCacheSessionId, resetGlmSystemPins } from './cache.js';
/** 5.3 / Flash cannot turn thinking off. Turbo is hybrid — do not force it. */
export declare function glmForcedThinkingModel(model: any): boolean;
export declare function normalizeGlmChatBody(payload: any): any;
/**
 * DSH anthropic-messages body. Anthropic requires `max_tokens`.
 * System pin + cache_control live in applyGlmAnthropicCache.
 */
export declare function normalizeGlmAnthropicBody(payload: any): any;
