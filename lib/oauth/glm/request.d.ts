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
export { glmCacheSessionId, resetGlmSystemPins } from './cache.js';
/** 5.3 / Flash cannot turn thinking off. Turbo is hybrid — do not force it. */
export declare function glmForcedThinkingModel(model: any): boolean;
export declare function normalizeGlmChatBody(payload: any): any;
