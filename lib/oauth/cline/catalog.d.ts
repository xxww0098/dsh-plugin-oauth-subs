/**
 * Live Cline picker.
 *
 * Membership: `GET {apiBase}/ai/cline/recommended-models` buckets
 * `recommended` + `free` + `clinePass` (the groups
 * `@magpie-community/opencode-cline-auth` keeps, and the ones the CLI
 * surfaces — `clinePass` on the separate `cline-pass` provider).
 *
 * Facts: `GET {apiBase}/ai/cline/models`, the cloud catalog
 * `loadCloudModels` reads. Match by exact id. `cline-free/` and
 * `cline-pass/` are gateway aliases absent from that catalog, so they
 * take a unique last-segment hit and nothing else — an ambiguous slug
 * stays unmatched rather than borrowing another vendor's window.
 *
 * The cloud catalog is the full OpenRouter-shaped list (~450 rows). It is
 * a fact source, not the picker: writing every row default-on into
 * settings.yaml is the noise this hop already refused. `clineCloud` stays
 * out (CLI `includeClineCloudModels` defaults off; magpie skips it too).
 */
export declare const CLINE_CATALOG_TTL_MS: number;
export declare function resetClineCatalogCache(): void;
export declare function clineCatalogModels(): readonly any[];
/**
 * OpenRouter-shaped `/ai/cline/models` rows. `context` on the live payload
 * is 0; the window is `context_length`. A repeated slug is ambiguous and
 * must not be reused for a gateway alias.
 */
export declare function clineCloudFacts(payload: any): {
    byId: Map<any, any>;
    bySlug: Map<any, any>;
};
/**
 * Recommended feed narrowed to `recommended` + `free` + `clinePass`.
 * A later bucket with a stronger gate (free over recommended, free over
 * ClinePass) updates the label; the first row keeps its window.
 * `clineCloud` is ignored.
 */
export declare function toClinePickerModels(payload: any, options?: {
    models?: readonly any[];
    cloud?: any;
}): any[];
export declare function refreshClineCatalog(_session: any, options?: any): Promise<readonly any[]>;
