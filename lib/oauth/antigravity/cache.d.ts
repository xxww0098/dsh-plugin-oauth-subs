/**
 * Google Antigravity (Gemini) implicit prompt cache.
 *
 * cloudcode-pa caches a stable `systemInstruction` plus contents prefix.
 * Usage hits arrive as `cachedContentTokenCount` (mapped to OpenAI
 * `prompt_tokens_details.cached_tokens` in request.ts). Sticky identity is
 * `request.sessionId` on generateContent — not Codex headers, not Grok
 * `x-grok-conv-id`.
 *
 * DSH prepends a runtime-context system snapshot every step. The first
 * systemInstruction per session is pinned; extras are returned as `extra`
 * text for the caller to append as a trailing user turn.
 */
/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export declare const ANTIGRAVITY_STABLE_SESSION = "dsh-antigravity";
export declare function antigravityCacheSessionId(key: any): string;
export declare function resetAntigravitySystemPins(): void;
export declare function pinAntigravitySystemInstruction(sessionId: any, parts: any): {
    parts: any;
    extra: any;
} | {
    parts: {
        text: any;
    }[];
    extra: any;
};
export declare function antigravitySessionIdOf(payload: {}, explicit: any): string;
