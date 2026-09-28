/**
 * Live Kiro picker catalog. ListAvailableModels on management.<region>.kiro.dev,
 * asked with the chat origin, is the picker + oauth-kiro.models yaml: the
 * backend gates chat per origin, so a model missing from that list 400s
 * INVALID_MODEL_ID. KIRO_MODELS is the offline fallback only. Chat still hops
 * q.<region>.amazonaws.com.
 */
export declare const KIRO_CATALOG_TTL_MS: number;
export declare function resetKiroCatalogCache(): void;
export declare function kiroCatalogTokenHash(token: any): string;
export declare function kiroCatalogModels(): any[];
/**
 * Live ListAvailableModels is the picker: fallback rows it omits are dropped
 * (they would 400 INVALID_MODEL_ID). Fallback only lends order, pretty names,
 * and anything the live row lacks. Empty live → [].
 */
export declare function toKiroPickerModels(live: any, fallback?: readonly {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: number;
    input: readonly string[];
    reasoningEfforts: any;
}[]): any[];
/**
 * Probe both canonical regions. A regional 403 is "no profile here", not
 * a hard stop — keep going. Empty / failed discovery returns [].
 */
export declare function fetchKiroLiveModels(session: any, options?: any): Promise<any>;
export declare function refreshKiroCatalog(session: any, options?: any): Promise<any[]>;
