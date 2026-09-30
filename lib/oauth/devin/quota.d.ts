/**
 * Devin quota: POST server.codeium.com SeatManagementService/GetUserStatus.
 */
import { outboundFetch } from '../../utils/outbound.js';
/**
 * GetUserStatusResponse → public quota. `plan_status` carries the daily /
 * weekly quota percents (already *remaining*) and unix-second resets; the
 * plan label is `plan_name` or the `teams_tier` enum (16 = Devin Pro).
 * Credit buckets (prompt / flow / flex) and the accrued overage balance
 * (micro-USD) come first; plan_end is the billing-cycle reset.
 */
export declare function parseDevinUserStatus(payload: any): {
    planType: any;
    account: string | undefined;
    rows: any[];
};
export declare function fetchDevinQuota(session: any, fetchFn?: typeof outboundFetch): Promise<{
    account: any;
    planType: any;
    rows: any[];
}>;
