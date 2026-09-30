/**
 * AWS Kiro / CodeWhisperer conversation cache.
 *
 * Kiro caches by request-prefix content, not by `conversationId` (live
 * 2026-09-29: a growing history at a fresh conversationId still cost 0.53x of
 * cold; changing one tool description cost 1.00x, so the tool list is part of
 * the prefix). The server never reports a hit (no `cacheReadInputTokens`).
 * There is no Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, and no
 * Gemini `systemInstruction` pin. The id still keys the system pin below and
 * must never be stamped with `Date.now()`.
 *
 * Official kiro.rs parks system as a history user + canned assistant pair
 * (Kiro has no system field). DSH snapshots that would rewrite that pair
 * are pinned per conversationId; extras go at the history suffix, never
 * between an assistant `toolUses` and the matching `toolResults`.
 * conversationId also includes the model id so switching the picker does
 * not reuse another model's AWS conversation.
 */
/** When DSH sends neither session_id nor prompt_cache_key, key on a constant (never pinned). */
export declare const KIRO_STABLE_SESSION = "dsh-kiro";
/** `dsh-kiro` or `dsh-kiro:<model>` is not a conversation: it never pins. */
export declare function isKiroFallback(id: any): boolean;
export declare function kiroCacheSessionId(key: any): string | undefined;
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
export declare function kiroConversationId(payload?: any, explicit?: any): any;
/** Where each request's estimate is appended; `npm run analyze` reads it. */
export declare function setPrefixEstimateLog(path: string | undefined): void;
export declare function resetKiroPrefixBaselines(): void;
/**
 * Upper bound on this request's cache hit: the bytes it shares, segment by
 * segment from the front, with the best of this conversation's last few
 * requests. It assumes the server cache is still warm (`gapMs` says how old
 * that baseline is). `matched` is null without a baseline or a DSH session.
 */
export declare function estimateKiroPrefix(conversationId: any, body: any, now: number): {
    bytes: any;
    matched: number | null;
    gapMs: number | null;
};
/** Estimate one outgoing body and append it to the log; never throws into the request. */
export declare function recordKiroPrefix({ conversationId, session, model, body }: {
    conversationId: any;
    session: any;
    model: any;
    body: any;
}): void;
