/** Relative remaining-time labels, precise to the minute. Always relative — never an absolute stamp. */
export type RelativeUnits = {
    soon: string;
    suffix: string;
    minute: string;
    hour: string;
    day: string;
};
/**
 * Format a future timestamp as a remaining duration down to the minute.
 * Returns `''` for missing/invalid input.
 */
export declare function formatRelativeReset(resetAt: number, units: RelativeUnits, now?: number): string;
