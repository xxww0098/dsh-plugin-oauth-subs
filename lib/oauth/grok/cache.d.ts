/**
 * xAI Grok prompt cache — grok-build Responses path.
 *
 * Sticky routing is the grok-build header set (`x-grok-conv-id` +
 * `x-grok-session-id` + `x-grok-req-id` + `x-grok-model-override`).
 * `prompt_cache_key` on the body defaults to the same conversation id
 * and overrides conv-id for routing. Codex `session-id` /
 * `x-client-request-id` are ignored on this backend and must not be copied.
 *
 * Prefix cache is also real: grok-build replays conversation items byte
 * for byte. DSH snapshots that would rewrite the leading system/developer
 * are pinned per conv id; extras park at the input suffix.
 *
 * A later 512-token cache block with <10% reuse is an affinity miss
 * (wrong xAI shard), not a prefix rewrite.
 */
/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export declare const GROK_STABLE_SESSION = "dsh-grok";
export declare function grokCacheSessionId(key: any): string;
export declare function resetGrokSystemPins(): void;
/**
 * Pin the first leading system/developer blob per conversation. Extra /
 * changed DSH snapshots are `extra` so request.ts can park them after
 * the conversation, not at the front.
 */
export declare function pinGrokSystemPrefix(conversationId: any, systemText: any): {
    pinned: any;
    extra: string;
};
export declare function grokConversationId(payload?: {}): string;
/**
 * grok-build `GrokRequestHeaders`. `reqId` is one UUID per DSH request so
 * retries keep the same id; `retryAttempt` becomes `x-grok-transient-retry`.
 */
export declare function grokAffinityHeaders(cacheSessionId: any, extra?: {}): {};
export declare function applyGrokCache(payload: any): {
    payload: any;
    cacheSessionId: string;
};
