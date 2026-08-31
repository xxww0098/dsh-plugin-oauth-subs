/** Relative remaining-time labels, precise to the minute. */
export declare const RELATIVE_STAMP_AFTER_DAYS = 14;
export type RelativeUnits = {
    soon: string;
    suffix: string;
    minute: string;
    hour: string;
    day: string;
};
/**
 * Format a future timestamp as a remaining duration down to the minute.
 * Returns `undefined` when the caller should print an absolute stamp
 * (≥ 14 days). Returns `''` for missing/invalid input.
 */
export declare function formatRelativeReset(resetAt: number, units: RelativeUnits, now?: number): string;
