/**
 * Pure text helpers shared by the implicit-prefix cache families
 * (cline/copilot/glm/kimi/cursor/kiro/antigravity). These carry NO pin
 * state on purpose: the SYSTEM_PINS map, usePin, and every stabilize*()
 * function are each family's cache and stay in its own cache.ts
 * (docs/rules.md — never share cache state across families, never put
 * cache rewrite in src/utils/).
 */
/** Flatten one message's content to text: string, content-part array, or scalar. */
export declare function systemText(message: any): string;
/** Split the leading run of system messages off the rest of the array. */
export declare function splitLeadingSystem(messages: any): {
    head: any[];
    rest: any;
};
/** Under half of the shorter text shared as prefix + suffix: a different
 * prompt, not an edit of the pinned one. DSH's session-title request shares
 * the chat's session id; parking the chat's prompt behind a pinned title
 * prompt made the model answer with a title. */
export declare function unrelatedPrompt(existing: any, text: any): boolean;
