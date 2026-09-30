/**
 * Kiro quota: getUsageLimits across the account's usage regions.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function parseKiroUsage(payload: any): {
    rows: never[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number | undefined;
    account: any;
    rows: {
        key: string;
        kind: string;
        usedPercent: number | undefined;
        remainingPercent: number | undefined;
        used: number;
        total: number;
        remaining: number | undefined;
        resetAt: number | undefined;
    }[];
};
export declare function fetchKiroQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    rows: never[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number | undefined;
    account: any;
    rows: {
        key: string;
        kind: string;
        usedPercent: number | undefined;
        remainingPercent: number | undefined;
        used: number;
        total: number;
        remaining: number | undefined;
        resetAt: number | undefined;
    }[];
}>;
