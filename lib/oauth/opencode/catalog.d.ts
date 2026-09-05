/**
 * Live OpenCode Go Free picker. GET https://opencode.ai/zen/go/v1/models
 * (catalog is unauthenticated), keep Go ids, drop Zen-only free slugs.
 * Overlay matching models.dev `opencode-go.models` for windows / input /
 * reasoning. OPENCODE_MODELS is the offline fallback only.
 */
export declare const OPENCODE_CATALOG_TTL_MS: number;
export declare function resetOpencodeCatalogCache(): void;
export declare function opencodeCatalogModels(): any;
/** DSH picker only speaks text / image. Never invent audio / video / pdf. */
export declare function opencodePickerInput(modalities: any): string[];
/**
 * models.dev `reasoning_options` → DSH reasoningEfforts.
 * Empty options + reasoning true → omit (vendor default; no false).
 * toggle → `{ off: 'none', high: 'high' }`.
 */
export declare function opencodeReasoningEffortsOf(dev: any): {};
export declare function modelsDevOpencodeGoMap(payload: any): Map<any, any>;
export declare function applyOpencodeModelsDev(model: any, dev: any): any;
/** Overlay models.dev `opencode-go` onto Go ids only. Never add a Zen free slug. */
export declare function overlayOpencodeModelsDev(models: any, payload: any): any[];
export declare function toOpencodePickerModels(payload: any): any[];
export declare function refreshOpencodeCatalog({ fetchFn, signal, force }?: {
    fetchFn?: typeof fetch;
    force?: boolean;
}): Promise<any>;
