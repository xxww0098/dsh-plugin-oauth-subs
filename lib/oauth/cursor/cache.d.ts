/**
 * Cursor AgentService conversation cache.
 *
 * Sticky identity is `AgentRunRequest.conversation_id` (verified in
 * Rahularya01/pi-cursor proto/agent.proto + request-build.ts). There is no
 * Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Gemini sessionId
 * header, and no Kiro conversationState field copied onto this hop.
 * Never stamp the id with `Date.now()`.
 *
 * @cursor/sdk 1.0.27 (pi-cursor-sdk 0.3.6) reports cache hits on
 * `TurnEndedUpdate.cache_read_tokens`. Historical `messageId` / turn
 * `requestId` must be stable for the same conversation content — a fresh
 * `randomUUID()` every hop rewrites the prefix blobs and busts the cache.
 *
 * HTTP sticky headers are `x-request-id` + `x-original-request-id` (SDK
 * Run handshake). Conversation id stays on the protobuf body. Do not
 * invent parent/subagent request headers, and do not switch
 * `x-cursor-client-type` to `sdk` (this hop is CLI OAuth).
 *
 * Cursor publishes the system prompt as `root_prompt_messages_json` blobs.
 * The first system text per conversationId is pinned; later DSH runtime
 * snapshots become extra system blobs in that same list (Cursor prefix),
 * not a GLM trailing system or a Gemini trailing user.
 */
export declare const CURSOR_STABLE_SESSION = "dsh-cursor";
export declare const CURSOR_FAST_SUFFIX = "-fast";
/**
 * Host-side Cursor Fast picker suffix. Not Codex `service_tier`.
 * Wire `requestedModel.modelId` and the conversation pin use the family id.
 */
export declare function peelCursorFastSuffix(modelId: any): {
    modelId: string;
    requestedFast: boolean;
};
export declare function cursorCacheSessionId(key: any): string;
export declare function resetCursorSystemPins(): void;
/**
 * Deterministic UUID for conversation blobs. Same seed → same id so a
 * replayed DSH history encodes the same prefix as the previous turn.
 */
export declare function cursorStableId(...parts: any[]): string;
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
