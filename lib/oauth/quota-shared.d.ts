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
/** One read of a family's quota fetch: what it is called in an error, where it goes or how it runs, and what the payload is parsed into. */
export interface QuotaRead {
    /** Named the way the vendor's failure is told: "kimi usage". */
    label: string;
    /** A plain JSON read of this URL, with `init`'s method, headers and body. */
    url?: string;
    /** Request init for a plain read; the read's own timeout signal is what goes out. */
    init?: any;
    /** Anything that is not a plain JSON read — a gRPC frame, a chained read — with the read's own timeout signal; one that keeps its own budgets may ignore it. */
    run?: (signal: AbortSignal) => Promise<any>;
    /** Parses the payload. A throw counts as the read failing. */
    parse?: (payload: any) => any;
}
/**
 * One read's own quota budget: `run` gets the abort signal, cancelled whatever
 * it returns or throws. A read that inspects the response itself — a 403 region
 * fallback, a status-checked retry, a gRPC frame — is written around this; a
 * plain JSON read is `quotaJson`, and a family that reads several at once is
 * `quotaReads`.
 */
export declare function withQuotaTimeout(run: (signal: AbortSignal) => Promise<any>): Promise<any>;
/** One plain JSON read with the quota budget: the fetch, its timeout, and the vendor-named error of a failed or unparseable answer. */
export declare function quotaJson(fetchFn: any, { url, label, init }: any): Promise<any>;
/** One settled read: the payload (parsed when the read says how), or why it failed. */
export interface QuotaReadResult {
    ok: boolean;
    raw?: any;
    value?: any;
    error?: any;
}
/**
 * Every read of one family's quota fetch at once, each with its own timeout
 * budget, as one settled result per read. A plain read is named, so the error
 * it fails with is the vendor's own ("codex usage failed (HTTP 500)").
 *
 * Nothing here decides what a failure means: a family names the reads it
 * cannot do without (`if (!usage.ok) throw usage.error`) exactly as it did
 * when the fetch was written out by hand. Codex reads a field of a payload
 * whose own step failed, so both the payload and the parsed value come back.
 */
export declare function quotaReads(fetchFn: any, reads: QuotaRead[]): Promise<QuotaReadResult[]>;
