/**
 * GLM quota: GET {biz}/api/monitor/usage/quota/limit plus
 * zcode.z.ai/api/v1/mcp/usage, and the reset-card bank
 * (customer-package-reset/list, POST …/use).
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function glmWindowKind(item: any): "primary" | "weekly" | "cycle" | "mcp";
export declare function parseGlmQuota(payload: any): {
    rows: never[];
    planType?: undefined;
} | {
    planType: any;
    rows: any[];
};
/**
 * Official MCP quota payload — `GET zcode.z.ai/api/v1/mcp/usage` answers
 * `{data:{level, total_usage:{used,limit,remaining}, next_refresh_at}}`
 * (usage-stats.ts fetchMcpQuotaSnapshot). Maps to the single `mcp` row.
 */
export declare function parseGlmMcpUsage(payload: any): {
    key: string;
    kind: string;
    product: string;
    usedPercent: number | undefined;
    remainingPercent: number | undefined;
    used: number | undefined;
    total: number | undefined;
    remaining: number | undefined;
    resetAt: number | undefined;
} | undefined;
/** Zone-less dashboard stamp → epoch ms at the region's fixed offset. */
export declare function glmCardStamp(value: any, offsetMinutes?: number): number | undefined;
/**
 * Coding Plan Reset Cards. A complete list always carries both bucket arrays;
 * anything less (business error, truncated `data`) returns undefined so the
 * store keeps the last known bank instead of reading it as "no cards".
 */
export declare function parseGlmResetCards(payload: any, region?: string): {
    nextExpiresAt?: any;
    availableCount: number;
    credits: any[];
} | undefined;
export declare function mergeGlmToolUsage(parsed: any, toolPayload: any): any;
/**
 * Monitor windows + MCP row, with the reset-card bank read alongside. A card
 * list failure never fails the card: `resetCredits` is left off so the store
 * keeps the previous bank; a plan without a 5h / weekly window drops it.
 */
export declare function fetchGlmQuota(session: any, fetchFn?: typeof outboundFetch): Promise<any>;
export declare function fetchGlmResetCards(session: any, fetchFn?: typeof outboundFetch): Promise<{
    nextExpiresAt?: any;
    availableCount: number;
    credits: any[];
} | undefined>;
export declare function glmResetCardBody(credit: any, requestId: any): {
    targetType: string;
    resetType: any;
    recordId: any;
    requestId: any;
};
/**
 * Redeem one card. HTTP 200 alone is not success — the biz envelope must say
 * so. A business rejection throws `GlmResetRejected` (the card was not spent,
 * a retry needs a fresh request id); a transport failure throws as-is so the
 * caller reuses the same request id.
 */
export declare class GlmResetRejected extends Error {
}
export declare function consumeGlmResetCard(session: any, credit: any, requestId: any, fetchFn?: typeof outboundFetch): Promise<{
    ok: boolean;
    requestId: any;
}>;
