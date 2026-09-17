/**
 * Devin conversation identity. `cascade_id` threads turns upstream and must
 * stay stable inside one DSH conversation; when DSH hands a stable key we
 * reuse it, otherwise one deterministic cascade per (family, model) is kept.
 * The id is a deterministic UUIDv5-style hash so it always looks like the
 * random UUIDs the CLI generates.
 *
 * Never send Codex/Grok/Cursor fields upstream: prompt_cache_key, session_id,
 * service_tier, retention, cache controls. The DSH cache keys are consumed
 * here to derive `cascade_id` instead.
 */
/** `devin-` + sanitized dsh pin keeps log lines readable without leaking. */
export declare function devinCacheSessionId(value: any): string;
/**
 * UUIDv5-shaped digest: stable across turns for the same key, always the
 * 8-4-4-4-12 shape the CLI emits for cascade_id.
 */
export declare function deterministicDevinId(seed: any): string;
/**
 * Turn a DSH conversation key into a cascade_id. Falls back to one stable
 * cascade per model so history-free callers still thread consistently.
 */
export declare function devinCascadeId(payload: any): string;
/**
 * Strip provider-foreign cache/session fields before the wire. Returns the
 * rewritten payload plus the ids derived from the consumed keys.
 */
export declare function applyDevinCache(payload: any): {
    payload: any;
    cacheSessionId: string;
};
/** `execution_id` is per-request — always a fresh random UUID. */
export declare function devinExecutionId(): `${string}-${string}-${string}-${string}-${string}`;
