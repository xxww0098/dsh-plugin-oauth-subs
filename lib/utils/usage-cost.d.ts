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
/** One usage row's estimated USD, or null when no rate row covers the model. */
export declare function usageRowCost(row: any[]): number | null;
/** Costs aligned with the rows (`null` where unpriced) — the Usage RPC's `costs`. */
export declare function usageRowCosts(rows: any[][]): (number | null)[];
