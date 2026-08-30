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
 * cold write of the new prefix. Affinity miss = zero cache with no such
 * rewrite while the previous prompt should have hit.
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
    timeoutMs: any;
} | {
    cause: "invalid";
    timeoutMs: any;
} | {
    cause: "other";
    timeoutMs: any;
};
export declare function parseSessionEvents(text: any): any[];
/**
 * Label each call: cold start, ordinary delta, compaction rewrite,
 * adapter rebuild, unexplained prefix break, or true affinity miss.
 */
export declare function annotateCacheCalls(calls: any, events: any): any;
export declare function callHitRate(call: any): number;
/**
 * @param {string} text
 * @returns {object}
 */
export declare function analyzeSession(text: any): {
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
