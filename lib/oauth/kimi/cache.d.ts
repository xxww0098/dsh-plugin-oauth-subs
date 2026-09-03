/**
 * Kimi Code prompt cache.
 *
 * Coding Plan is an implicit prefix hash of leading system + history.
 * There is no Codex `prompt_cache_key` and no Grok `x-grok-conv-id`.
 * This module strips those fields and parks extra DSH snapshots at the
 * messages suffix so the first system blob can still hit.
 * Never stamp Date.now(). `dsh-kimi` is analyzer-only.
 */
export declare const KIMI_STABLE_SESSION = "dsh-kimi";
export declare function kimiCacheSessionId(key: any): string;
export declare function resetKimiPins(): void;
export declare function stabilizeKimiSystemPrefix(messages: any, sessionId: any): any;
export declare function applyKimiCache(payload?: {}): {
    payload: {};
    cacheSessionId: string;
};
/** Kimi does not sticky-route on Codex / Grok HTTP headers. */
export declare function kimiCacheHeaders(): {};
