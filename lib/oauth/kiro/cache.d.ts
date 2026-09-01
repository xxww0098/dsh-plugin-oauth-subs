/**
 * AWS Kiro / CodeWhisperer conversation cache.
 *
 * Cache affinity is `conversationState.conversationId`. There is no Codex
 * `prompt_cache_key`, no Grok `x-grok-conv-id`, and no Gemini
 * `systemInstruction` pin. Hits surface as `cacheReadInputTokens` on the
 * event stream. Never stamp the id with `Date.now()`.
 *
 * Official kiro.rs parks system as a history user + canned assistant pair
 * (Kiro has no system field). DSH snapshots that would rewrite that pair
 * are pinned per conversationId; extras go at the history suffix, never
 * between an assistant `toolUses` and the matching `toolResults`.
 * conversationId also includes the model id so switching the picker does
 * not reuse another model's AWS conversation.
 */
/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export declare const KIRO_STABLE_SESSION = "dsh-kiro";
export declare function kiroCacheSessionId(key: any): string;
export declare function resetKiroSystemPins(): void;
/**
 * Pin the first system blob per conversationId. Extra / changed DSH
 * snapshots are returned as `extra` so request.ts can park them after
 * the conversation (user + ack pair), not on currentMessage.
 */
export declare function pinKiroSystemPrefix(conversationId: any, systemText: any): {
    pinned: any;
    extra: string;
};
export declare function kiroConversationId(payload: {}, explicit: any): any;
