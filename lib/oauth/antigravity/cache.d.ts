/**
 * Google Antigravity (Gemini) implicit prompt cache.
 *
 * cloudcode-pa caches a stable prefix: systemInstruction + leading
 * contents + tools. Usage hits arrive as cachedContentTokenCount
 * (and CLI aliases cache_read_tokens / cacheReadTokens) mapped in
 * request.ts. Sticky identity is request.sessionId — not Codex
 * headers, not Grok x-grok-conv-id, not implicitCacheConfig.
 *
 * Official hub sessionId is one conversation (LLM_SESSION_ID). DSH
 * session_id is kept as-is. When DSH omits it, fallback is
 * dsh-antigravity:<model> so the picker cannot reuse another model's
 * pin. Never stamp Date.now().
 *
 * DSH prepends a runtime-context system snapshot and may reshuffle
 * tool JSON every step. First system / equivalent tools /
 * thinkingConfig per session are pinned.
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
/**
 * Reuse the first tools JSON when names+schemas match (canonical
 * key order). Added or removed tools are a real change — send the
 * new list and accept a cache miss.
 */
export declare function pinAntigravityTools(sessionId: any, tools: any): any;
/**
 * Sticky-first thinkingConfig. Once a session has sent (or omitted)
 * thinkingLevel, keep that choice even if a later payload flaps
 * reasoning_effort. Do not invent implicitCacheConfig.
 */
export declare function pinAntigravityThinking(sessionId: any, effort: any): any;
export declare function antigravitySessionIdOf(payload: {}, explicit: any): any;
