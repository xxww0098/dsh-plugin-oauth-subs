/**
 * Shared shard pin for Codex / Grok / GLM / Antigravity.
 * Sanitize to 1–64 of [A-Za-z0-9._:-] instead of dropping the key —
 * a too-long DSH session id must still stick.
 */
export declare function codexCacheSessionId(key: any): string;
