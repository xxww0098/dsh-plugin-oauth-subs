/**
 * Live Kiro picker catalog. ListAvailableModels on management.<region>.kiro.dev
 * merges into the Settings picker + oauth-kiro.models yaml. KIRO_MODELS is
 * the offline fallback only. Chat still hops q.<region>.amazonaws.com.
 */
export declare const KIRO_CATALOG_TTL_MS: number;
export declare const KIRO_STATIC_FALLBACK_COUNT = 18;
export declare function resetKiroCatalogCache(): void;
export declare function kiroCatalogTokenHash(token: any): string;
export declare function kiroCatalogModels(): any;
/** Merge live ListAvailableModels onto the static fallback. Empty live → []. */
export declare function toKiroPickerModels(live: any, fallback?: readonly {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: number;
    input: readonly string[];
    reasoningEfforts: boolean;
}[]): any[];
export declare function originalKiroFallbackIds(): any[];
/**
 * Probe both canonical regions. A regional 403 is "no profile here", not
 * a hard stop — keep going. Empty / failed discovery returns [].
 */
export declare function fetchKiroLiveModels(session: any, options?: {}): Promise<any>;
export declare function refreshKiroCatalog(session: any, options?: {}): Promise<any>;
