/**
 * Unified model catalog — one JSON, one row shape, every family.
 *
 * `src/catalog/models.json` holds the static catalog rows for all families
 * (structure mirrors CLIProxyAPI `internal/registry/models/models.json`:
 * one top-level family key → flat array of model rows). A row keeps the
 * exact in-memory shape `toHarnessModel` consumes, so JSON row = catalog
 * row = DSH route row with no mapping layer. Family route metadata (api
 * protocol / baseURL / displayName / route compat) stays in
 * `src/oauth/models.ts` `buildProviders`.
 *
 * Validation runs once at module load and throws on the first bad row —
 * the same fail-early contract as `assertDshServiceableProvider`: a broken
 * catalog must fail here, not silently keep the last good settings write.
 * Family-specific extras (`variants` / `defaultUid` on Devin, `compat` on
 * OpenCode Go, `fastTier` on Codex) pass through untouched; only the
 * DSH-gating fields (closed-set effort keys, input kinds, numeric floors)
 * are checked.
 *
 * This module must not import any family module or `src/oauth/models.ts`:
 * those import the families, which import this loader — a cycle. The
 * closed-set literals below are local copies kept in sync by tests.
 *
 * The JSON is read via `readFileSync` rather than a JSON import: the project
 * compiles with `module: node16`, where import attributes (`with {
 * type: 'json' }`) are a compile error, and the fs read also sidesteps any
 * import-attribute support gap in the host's bundled Node.
 */
/** Mirrors DSH_THINKING_LEVELS (src/oauth/models.ts); vendor spellings are values, never keys. */
export declare const CATALOG_EFFORT_KEYS: readonly string[];
/**
 * Every top-level key the JSON must carry, nothing more. `ollamaRetired`
 * is a flat array of retired model ids, not rows; OpenCode Go is split per
 * wire-protocol route (`opencode-go-flash` completions, `opencode-go-responses`,
 * `opencode-go-messages`).
 */
export declare const CATALOG_KEYS: readonly string[];
/**
 * Throws on the first rule a catalog object breaks. The loader runs it on the
 * shipped JSON; `scripts/models.ts` runs it on the merged catalog before it
 * writes, so a refresh can never produce a file this loader would reject.
 */
export declare function assertCatalog(catalog: Record<string, any>): void;
/** The frozen static rows for one top-level key (`'codex'`, `'ollamaRetired'`, …). */
export declare function catalogRows(key: string): readonly any[];
export interface CatalogRateBand {
    in: number;
    out: number;
    cacheRead?: number;
}
export interface CatalogRate {
    in: number;
    out: number;
    cacheRead?: number;
    cacheWrite?: number;
    cacheWrite1h?: number;
    tierThreshold?: number;
    tiers?: CatalogRateBand[];
    tod?: {
        peak: CatalogRateBand;
        offPeak: CatalogRateBand;
    };
}
export interface CatalogRateTimeOfDay {
    effectiveFrom: string;
    peakWindowsUtc: readonly (readonly [number, number])[];
    peakDaysUtc: readonly number[];
    offPeakDatesUtc: readonly string[];
}
/** The frozen billing-rate row for `<family>/<model id>`, or undefined when the family ships no rate table for it. */
export declare function catalogRate(key: string): CatalogRate | undefined;
/** The shared peak/off-peak schedule a rate row's `tod` band refers to, when rates.json declares one. */
export declare function catalogRateTimeOfDay(): CatalogRateTimeOfDay | undefined;
/** The whole frozen rate table for one family keyed by model id, or undefined when the family has none. */
export declare function catalogRateTable(family: string): Record<string, CatalogRate> | undefined;
/**
 * Every rates.json row keyed `<family>/<model id>` — the Models-tab
 * `pricing` map for `describeCatalog`. Display-only; never a route field.
 */
export declare function catalogPricing(): Record<string, CatalogRate>;
