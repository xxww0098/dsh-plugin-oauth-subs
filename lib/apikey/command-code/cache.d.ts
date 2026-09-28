/**
 * Command Code conversation affinity. `/alpha/generate` carries a top-level
 * `threadId` uuid (the CLI's per-conversation id — cache affinity + session
 * archive key; `toWireThreadId` drops non-uuids). DSH `prompt_cache_key` /
 * `session_id` are converted to a uuid here, never passed through verbatim.
 *
 * Never send Codex/Grok/Cursor fields upstream: prompt_cache_key,
 * session_id, service_tier, retention, cache controls. With no DSH key the
 * fallback is one deterministic uuid per `dsh-command-code:<model>` seed —
 * no Date.now()/random in conversation-id positions.
 */
/** UUIDv5-shaped digest: stable across turns for one seed, same wire shape as the CLI's random uuid. */
export declare function deterministicCommandCodeId(seed: any): string;
/**
 * DSH conversation key → threadId. A real uuid passes through untouched (the
 * CLI's own threadIds are uuids); anything else derives from
 * `dsh-command-code:<key>`, and a missing key falls back to the per-model
 * constant seed.
 */
export declare function commandCodeThreadId(payload: any): string;
/**
 * Strip DSH/OpenAI fields upstream does not understand. Returns the rewritten
 * payload plus the derived threadId (the transport puts it at body top level,
 * outside `params`).
 */
export declare function applyCommandCodeCache(payload: any): {
    payload: any;
    threadId: undefined;
} | {
    payload: any;
    threadId: string;
};
