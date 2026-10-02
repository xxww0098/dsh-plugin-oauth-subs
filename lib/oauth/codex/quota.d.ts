/**
 * Codex quota: GET chatgpt.com/backend-api/wham/usage (used_percent
 * windows; remaining is 100 − used), the rate-limit reset-credit bank, and
 * POST …/rate-limit-reset-credits/consume.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function parseCodexUsage(payload: any): {
    rows: never[];
    planType?: undefined;
} | {
    planType: any;
    rows: any[];
};
/**
 * The `codex.rate_limits` SSE frame that opens a Codex Responses stream: the
 * account's own windows ahead of the reply, in the same row shape as
 * `parseCodexUsage` so the quota cards cannot tell them apart. Frame shape per
 * the codex CLI's `RateLimitSnapshot` (windows keyed `primary` / `secondary`,
 * `used_percent`, `window_minutes`, `reset_after_seconds`); the endpoint's
 * `*_window` spellings are accepted too.
 */
export declare const CODEX_RATE_LIMITS_EVENT = "codex.rate_limits";
export declare function parseCodexRateLimitsFrame(payload: any): {
    rows: never[];
    planType?: undefined;
} | {
    planType: any;
    rows: any[];
};
export declare function parseResetCredits(payload: any): {
    nextExpiresAt?: number | undefined;
    availableCount: number;
    credits: ({
        id: string | undefined;
        status: any;
        expiresAt: number | undefined;
    } | undefined)[];
};
export declare function fetchCodexQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    resetCredits: {
        nextExpiresAt?: number | undefined;
        availableCount: number;
        credits: ({
            id: string | undefined;
            status: any;
            expiresAt: number | undefined;
        } | undefined)[];
    };
    rows: never[];
    planType?: undefined;
} | {
    resetCredits: {
        nextExpiresAt?: number | undefined;
        availableCount: number;
        credits: ({
            id: string | undefined;
            status: any;
            expiresAt: number | undefined;
        } | undefined)[];
    };
    planType: any;
    rows: any[];
}>;
export declare function consumeResetBody(redeemRequestId: any): {
    redeem_request_id: any;
    idempotencyKey: any;
};
export declare function consumeCodexReset(session: any, fetchFn?: typeof outboundFetch): Promise<{
    ok: boolean;
    redeemRequestId: `${string}-${string}-${string}-${string}-${string}`;
}>;
