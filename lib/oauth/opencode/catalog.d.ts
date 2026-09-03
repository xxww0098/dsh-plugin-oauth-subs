/**
 * Live OpenCode Free picker. GET https://opencode.ai/zen/v1/models
 * anonymously (no Authorization), keep *-free slugs that are not Go-keyed.
 * OPENCODE_MODELS is the offline fallback only.
 */
export declare const OPENCODE_CATALOG_TTL_MS: number;
export declare function resetOpencodeCatalogCache(): void;
export declare function opencodeCatalogModels(): any;
export declare function toOpencodePickerModels(payload: any): any[];
export declare function refreshOpencodeCatalog({ fetchFn, signal, force }?: {
    fetchFn?: typeof fetch;
    force?: boolean;
}): Promise<any>;
