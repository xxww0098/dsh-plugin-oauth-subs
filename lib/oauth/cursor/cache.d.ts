/**
 * Cursor AgentService conversation cache.
 *
 * Sticky identity is `AgentRunRequest.conversation_id` (verified in
 * Rahularya01/pi-cursor proto/agent.proto + request-build.ts). There is no
 * Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Gemini sessionId
 * header, and no Kiro conversationState field copied onto this hop.
 * Never stamp the id with `Date.now()`.
 *
 * Cursor publishes the system prompt as `root_prompt_messages_json` blobs.
 * The first system text per conversationId is pinned; later DSH runtime
 * snapshots become extra system blobs in that same list (Cursor prefix),
 * not a GLM trailing system or a Gemini trailing user.
 */
export declare const CURSOR_STABLE_SESSION = "dsh-cursor";
export declare function cursorCacheSessionId(key: any): string;
export declare function resetCursorSystemPins(): void;
export declare function pinCursorSystemPrefix(conversationId: any, systemText: any): {
    pinned: any;
    extra: string;
};
export declare function cursorConversationId(payload: {}, explicit: any): any;
export declare function applyCursorCache(payload?: {}): {
    payload: {};
    cacheSessionId: any;
};
/** Cursor does not sticky-route on Codex / Grok HTTP headers. */
export declare function cursorCacheHeaders(): {};
