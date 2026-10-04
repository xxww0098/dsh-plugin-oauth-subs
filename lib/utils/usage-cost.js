/**
 * Read-time cost estimation for the Usage page: each usage row's tokens priced
 * against `src/catalog/rates.json` as it stands now. Nothing is stored, so a
 * rates refresh restates history on the next read — the same re-price-on-read
 * contract as the Models-tab price badges. Subscription families carry the
 * maker's list price in that table, so their "cost" reads as what the same
 * tokens would run at list price, not a bill.
 *
 * The estimate is display-grade by necessity: hourly rows keep no per-call
 * context, so a `tierThreshold` is judged on the row's average prompt
 * (input + cache read + cache write over calls) and applies to the whole row,
 * and a `tod` band is judged on the row's UTC hour. A cache price the source
 * does not list folds at the input rate (absent ≠ free, the same rule the
 * badge tooltip states); a model without a rate row prices as null, which the
 * page renders as 「—」, never 0.
 */
import { catalogRate, catalogRateTimeOfDay } from '../catalog/index.js';
import { peelContextSuffix } from './context-mode.js';
const PER_MILLION = 1 / 1_000_000;
function rateOf(family, model) {
    // A usage model id is the route id: the catalog id, a `-fast` twin the rates
    // table keys directly, or an old `-900k`/`-1m` context row whose base is.
    const ids = [model];
    const peeled = peelContextSuffix(model).model;
    if (peeled !== model)
        ids.push(peeled);
    // OpenCode Go splits its rate table per wire route; usage rows just say the family.
    const tables = family === 'opencode-go' ? ['opencode-go-flash', 'opencode-go-responses'] : [family];
    for (const table of tables) {
        for (const id of ids) {
            const rate = catalogRate(`${table}/${id}`);
            if (rate)
                return rate;
        }
    }
    return undefined;
}
/** The `tod` band an hour epoch falls in, or undefined when the row has none (or the schedule is not in force yet). */
function todBandOf(rate, hourEpoch) {
    if (!rate.tod)
        return undefined;
    const tod = catalogRateTimeOfDay();
    if (!tod)
        return undefined;
    const date = new Date(hourEpoch * 3_600_000);
    const iso = date.toISOString().slice(0, 10);
    if (iso < tod.effectiveFrom)
        return undefined;
    if (tod.offPeakDatesUtc.includes(iso))
        return rate.tod.offPeak;
    if (!tod.peakDaysUtc.includes(date.getUTCDay()))
        return rate.tod.offPeak;
    const hour = date.getUTCHours();
    const peak = tod.peakWindowsUtc.some(([start, end]) => hour >= start && hour < end);
    return peak ? rate.tod.peak : rate.tod.offPeak;
}
/** One usage row's estimated USD, or null when no rate row covers the model. */
export function usageRowCost(row) {
    const [hour, family, model, calls, input, output, cacheRead, cacheWrite] = row;
    const rate = rateOf(String(family), String(model));
    if (!rate)
        return null;
    const band = todBandOf(rate, Number(hour)) ?? rate;
    // One surcharge tier above the threshold (rates.json carries a single band).
    const tier = rate.tierThreshold !== undefined && calls > 0
        && (input + cacheRead + cacheWrite) / calls >= rate.tierThreshold
        ? rate.tiers?.[0]
        : undefined;
    const priceIn = tier?.in ?? band.in;
    const priceOut = tier?.out ?? band.out;
    const priceCacheRead = tier?.cacheRead ?? band.cacheRead ?? band.in;
    // Neither tod bands nor tiers re-price a cache write: the base row's word.
    const priceCacheWrite = rate.cacheWrite ?? rate.cacheWrite1h ?? rate.in;
    return (input * priceIn + output * priceOut + cacheRead * priceCacheRead + cacheWrite * priceCacheWrite) * PER_MILLION;
}
/** Costs aligned with the rows (`null` where unpriced) — the Usage RPC's `costs`. */
export function usageRowCosts(rows) {
    return rows.map(usageRowCost);
}
