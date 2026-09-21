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
/**
 * GLM id family driving the official thinking map. `glm-5.2` is no longer a
 * picker row (the plan auto-routes legacy ids to 5.3 / 5.3-Flash), but a
 * leftover pinned route can still send it and ZCode's catalog still carries
 * its map — so the request shape stays source-correct here; the backend
 * decides the routing.
 */
export declare function glmAnthropicFamily(model: any): "glm-5.3" | "glm-5-turbo" | "glm-5.2" | undefined;
/**
 * Picker level carried to the hop. pi-ai's adaptive path writes
 * `output_config.effort`; other clients may use `thinking.effort` or a bare
 * `reasoning_effort`. `enabled` is Turbo's on-switch, not an effort.
 */
export declare function glmAnthropicEffort(payload: any): string | undefined;
/** Coding Plan output cap per model (ZCode modelRules maxOutputTokens). */
export declare function glmMaxTokens(model: any): 128000 | 64000;
/**
 * Anthropic hop thinking: official GLM shape, not the Completions shape.
 * 5.3 / Flash are forced on; 5.2 keeps `disabled`; Turbo and unknown ids keep
 * the legacy conservative rewrite (never force thinking on).
 */
export declare function applyGlmAnthropicThinking(payload: any): any;
export declare function normalizeGlmChatBody(payload: any): any;
/** Completions leftover: map cache-read aliases. Anthropic hop is passthrough. */
export declare function mapGlmChatUsage(usage: any): any;
/**
 * DSH anthropic-messages body. Anthropic requires `max_tokens`.
 * System pin + cache_control live in applyGlmAnthropicCache.
 */
export declare function normalizeGlmAnthropicBody(payload: any): any;
