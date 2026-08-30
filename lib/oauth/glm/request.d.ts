/**
 * Shape a generic OpenAI chat/completions body for Zhipu Coding Plan.
 *
 * DSH injects `role: "developer"` (system prompt, AGENTS.md, CLAUDE.md).
 * Coding Plan only accepts system / user / assistant / tool — anything
 * else is 400 `1214 角色信息不正确`.
 */
export declare function normalizeGlmChatBody(payload: any): any;
