/**
 * AWS Kiro / CodeWhisperer conversation cache.
 *
 * Cache affinity is `conversationState.conversationId`. There is no Codex
 * `prompt_cache_key`, no Grok `x-grok-conv-id`, and no Gemini
 * `systemInstruction` pin. Hits surface as `cacheReadInputTokens` on the
 * event stream. Never stamp the id with `Date.now()`.
 */
/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export declare const KIRO_STABLE_SESSION = "dsh-kiro";
export declare function kiroCacheSessionId(key: any): string;
export declare function kiroConversationId(payload: {}, explicit: any): string;
