/**
 * Live Cline picker. `GET {apiBase}/ai/cline/recommended-models` is public
 * (no auth) and returns four buckets; `CLINE_MODELS` is the offline seed.
 *
 * This hop lists `recommended` + `free` only. The pinned CLI catalogues the
 * *whole* OpenRouter set for the `cline` provider (`buildClineModels`), but
 * `clinePass` / `clineCloud` are the separate ClinePass product and the
 * remaining OpenRouter ids are not what Cline features — listing 370 rows
 * would also write 370 default-on model entries into settings.yaml.
 */
export declare const CLINE_CATALOG_TTL_MS: number;
export declare function resetClineCatalogCache(): void;
export declare function clineCatalogModels(): any;
/**
 * `normalizeClineRecommendedProviderModels` narrowed to the `cline` product:
 * `recommended` + `free`, de-duplicated by id, declared order preserved.
 */
export declare function toClinePickerModels(payload: any, { models }?: {
    models?: readonly {
        input: string[];
        reasoningEfforts: {
            minimal: "minimal";
            low: "low";
            medium: "medium";
            high: "high";
            xhigh: "xhigh";
            max: "xhigh";
        };
        id: string;
        name: string;
        contextWindow: number;
        maxTokens: number;
    }[];
}): any[];
export declare function refreshClineCatalog(session: any, options?: {}): Promise<any>;
