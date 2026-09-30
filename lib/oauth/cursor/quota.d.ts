/**
 * Cursor quota: api2.cursor.sh JSON (period usage, email, Stripe profile),
 * not the agent transport.
 */
import { outboundFetch } from '../../utils/outbound.js';
export declare function parseCursorPeriodUsage(payload: any, extras?: any): {
    rows: never[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number | undefined;
    account: string | undefined;
    rows: ({
        resetAt?: any;
        key: string;
        kind: string;
        product: any;
        usedPercent: number;
        remainingPercent: number;
    } | {
        resetAt?: any;
        remainingPercent?: number | undefined;
        key: string;
        kind: string;
        product: string;
        unit: string;
        used: number;
        total: number;
    } | undefined)[];
};
export declare function fetchCursorQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    rows: never[];
    planType?: undefined;
    account?: undefined;
} | {
    planType: string | number | undefined;
    account: string | undefined;
    rows: ({
        resetAt?: any;
        key: string;
        kind: string;
        product: any;
        usedPercent: number;
        remainingPercent: number;
    } | {
        resetAt?: any;
        remainingPercent?: number | undefined;
        key: string;
        kind: string;
        product: string;
        unit: string;
        used: number;
        total: number;
    } | undefined)[];
}>;
