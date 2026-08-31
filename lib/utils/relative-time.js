/** Relative remaining-time labels, precise to the minute. */
export const RELATIVE_STAMP_AFTER_DAYS = 14;
function fill(template, n) {
    return String(template).replace('{n}', String(n));
}
/**
 * Format a future timestamp as a remaining duration down to the minute.
 * Returns `undefined` when the caller should print an absolute stamp
 * (≥ 14 days). Returns `''` for missing/invalid input.
 */
export function formatRelativeReset(resetAt, units, now = Date.now()) {
    if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0)
        return '';
    const delta = resetAt - now;
    if (delta <= 0)
        return units.soon;
    const totalMinutes = Math.max(1, Math.round(delta / 60_000));
    const days = Math.floor(totalMinutes / 1440);
    if (days >= RELATIVE_STAMP_AFTER_DAYS)
        return undefined;
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const bits = [];
    if (days)
        bits.push(fill(units.day, days));
    if (hours)
        bits.push(fill(units.hour, hours));
    if (minutes || bits.length === 0)
        bits.push(fill(units.minute, minutes));
    return fill(units.suffix, bits.join(' '));
}
