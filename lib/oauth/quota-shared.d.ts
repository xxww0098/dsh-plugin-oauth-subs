/**
 * Vendor-agnostic quota helpers shared by every family's `quota.ts`:
 * number / percent / timestamp coercion, credit-bag math, reset-credit
 * availability, and the timeout + JSON read around one quota fetch.
 */
export declare const QUOTA_TIMEOUT_MS = 10000;
export declare function asNumber(value: any): number | undefined;
export declare function clampPct(value: any): number | undefined;
export declare function creditBagAmounts(value: any): any;
export declare function creditBagUsedPercent(value: any): number | undefined;
export declare function stampOf(value: any): number | undefined;
export declare function resetAtOf(window: any): number | undefined;
export declare function isAvailableResetCredit(credit: any): boolean;
export declare function timeoutSignal(ms: any): {
    signal: AbortSignal;
    cancel: () => void;
};
export declare function trimmedQuotaMsg(value: any): string | undefined;
export declare function readJson(response: any, label: any): Promise<any>;
