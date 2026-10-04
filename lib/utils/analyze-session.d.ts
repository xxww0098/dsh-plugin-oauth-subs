/**
 * Parse a DeepSeek Harness session.jsonl (or a JSON array of events) and
 * report Codex / Grok cache affinity, token spend, and transport faults.
 *
 * DSH writes usage on both `assistant/message` and a later `assistant/chunk`
 * of type `usage`. Counts are taken from `assistant/message` only, keyed by
 * turn+step, so a 42-step turn is not billed twice.
 *
 * Zero-cache after warmup is NOT automatically an affinity miss. Compaction
 * and a request/header rebuild rewrite the prompt prefix; the next call is a
 * cold write of the new prefix. Affinity miss = reuse < 10% (including xAI's
 * 512-token block on the wrong shard) with no such rewrite, while the previous
 * prompt should have hit.
 */
export declare const CACHE_KINDS: Readonly<{
    cold_start: "cold_start";
    delta: "delta";
    compaction: "compaction";
    rebuild: "rebuild";
    prefix_break: "prefix_break";
    affinity_miss: "affinity_miss";
}>;
export declare const TOOL_CAUSES: Readonly<{
    host_timeout: "host_timeout";
    cascade_abort: "cascade_abort";
    invalid: "invalid";
    other: "other";
}>;
export declare function classifyToolError(message: any): {
    cause: "host_timeout";
    timeoutMs: number;
} | {
    cause: "cascade_abort";
    timeoutMs: null;
} | {
    cause: "invalid";
    timeoutMs: null;
} | {
    cause: "other";
    timeoutMs: null;
};
export declare function parseSessionEvents(text: any): any[];
export declare function usageOf(event: any): any;
/**
 * Label each call: cold start, ordinary delta, compaction rewrite,
 * adapter rebuild, unexplained prefix break, or true affinity miss.
 */
export declare function annotateCacheCalls(calls: any, events: any): any;
/**
 * The proxy's cacheable-prefix estimates (`prefix-estimate.jsonl`, plus its
 * `.1` generation) from every DSH profile's plugin data dir. Kiro reports no
 * cached tokens, so these stand in for its hit rate as an upper bound.
 */
export declare function readPrefixEstimates(profilesRoot?: string): any[];
/**
 * Byte-weighted cacheable prefix over the estimates that had a baseline; an
 * upper bound on the hit rate (it assumes the server cache was still warm —
 * `staleGap` counts baselines over 5 minutes old). Null when none had one.
 */
export declare function prefixEstimateOf(entries: any): {
    ratio: number;
    requests: any;
    baseline: any;
    staleGap: any;
} | null;
/**
 * @param {string} text
 * @param {{ prefixEstimates?: object[] }} [options] — see `readPrefixEstimates`
 * @returns {object}
 */
export declare function analyzeSession(text: any, { prefixEstimates }?: {
    prefixEstimates?: any[] | undefined;
}): {
    calls: any;
    callCount: any;
    maxStep: any;
    inputTokens: any;
    outputTokens: any;
    cacheReadTokens: any;
    cacheWriteTokens: any;
    billedInputTokens: any;
    weightedCacheHit: number;
    prefixReuseMedian: any;
    zeroCacheCount: any;
    zeroCacheAfterWarmup: any;
    affinityMissCount: any;
    cacheMeasured: any;
    prefixEstimate: {
        ratio: number;
        requests: any;
        baseline: any;
        staleGap: any;
    } | null;
    compactionCallCount: any;
    rebuildCallCount: any;
    uncachedBreakdown: {
        cold_start: number;
        delta: number;
        compaction: number;
        rebuild: number;
        prefix_break: number;
        affinity_miss: number;
    };
    toolErrors: any[];
    toolCauseCounts: {
        host_timeout: number;
        cascade_abort: number;
        invalid: number;
        other: number;
    };
    transportFaults: any[];
    durationMs: number;
    wallMs: number;
    healthy: boolean;
    verdict: string;
    provider: any;
    model: any;
    reasoningEffort: any;
    maxTokens: any;
    contextWindow: any;
    adapterDefaults: any;
    sessionId: any;
    cwd: any;
    agentPreset: any;
    eventCount: number;
};
export declare function formatReport(report: any): string;
export declare const CALL_INDEX_BUCKETS: readonly string[];
/**
 * DSH appends one zstd frame per write. `zstdDecompressSync(buf)` returns only
 * the first frame (209 B of a 1265-frame file), so walk the frames by consumed
 * input. A truncated tail frame (session still being written) is dropped.
 */
export declare function decodeSessionBuffer(buf: Buffer): string;
/** Plain session.jsonl or DSH's multi-frame session*.jsonl.zstd. */
export declare function readSessionText(path: string): string;
export declare function sessionFiles(dir: string, since: number | null, out?: string[]): string[];
/** Absolute frame times: `{ time }` chunks and `{ time0, dt[] }` chunk runs. */
export declare function frameTimes(frames: any): number[];
/** Terminal `finish` failure of an attempt: nested in assistant/attempt, or a
 * top-level assistant/chunk in older sessions. */
export declare function attemptFailure(event: any): {
    code: any;
    message: string;
} | null;
/** Failure text safe to aggregate: no paths, ids, or tokens; digit runs folded. */
export declare function normalizeFailureMessage(message: any): string;
/**
 * Aggregate every session under `root` whose events fall in [since, until).
 * The same session may exist as session.jsonl.zstd and session.v3/v4.jsonl.zstd;
 * only the highest `session.version` copy of each `session.id` counts.
 */
export declare function analyzeSessionDir(root: string, { since, until, prefixEstimates }?: {
    since?: number | null;
    until?: number | null;
    prefixEstimates?: any[];
}): {
    window: {
        since: string | null;
        until: string | null;
    };
    files: number;
    sessions: number;
    duplicateFiles: number;
    unreadableFiles: number;
    providers: any;
    models: any;
};
export declare function formatAggregate(report: any): string;
/** Per-provider deltas `next − base`; counts normalized per 1k calls. */
export declare function compareReports(base: any, next: any): {
    base: any;
    next: any;
    providers: {};
};
export declare function formatComparison(diff: any): string;
