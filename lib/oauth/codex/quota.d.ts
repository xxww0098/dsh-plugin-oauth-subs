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
