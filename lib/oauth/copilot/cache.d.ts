/**
 * GitHub Copilot prompt cache.
 *
 * Completions prefix-hash of leading system + history, plus OpenCode's
 * `X-Interaction-Id` session sticky. There is no Codex `prompt_cache_key`
 * and no Grok `x-grok-conv-id`. Extra DSH snapshots park at the messages
 * suffix. Never stamp Date.now(). Fallback `dsh-copilot` is written as
 * X-Interaction-Id (official always sends a session id).
 */
export declare const COPILOT_STABLE_SESSION = "dsh-copilot";
export declare function copilotCacheSessionId(key: any): string;
export declare function resetCopilotPins(): void;
export declare function stabilizeCopilotSystemPrefix(messages: any, sessionId: any): any;
export declare function applyCopilotCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/** Sticky id for Copilot Completions. Do not copy Codex / Grok header names. */
export declare function copilotCacheHeaders(cacheSessionId: any): {
    'x-interaction-id': string;
};
export declare function copilotHasVision(messages: any): boolean;
export declare function copilotInitiatorOf(messages: any): "user" | "agent";
