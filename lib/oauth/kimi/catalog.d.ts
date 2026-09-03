/**
 * Live Kimi Code picker. GET https://api.kimi.com/coding/v1/models after
 * login. KIMI_MODELS is the offline fallback only.
 */
export declare const KIMI_CATALOG_TTL_MS: number;
export declare function resetKimiCatalogCache(): void;
export declare function kimiCatalogTokenHash(token: any): string;
export declare function kimiCatalogModels(): any;
export declare function kimiReasoningEffortsOf(row: any): {};
export declare function toKimiPickerModels(payload: any): any[];
export declare function refreshKimiCatalog(session: any, options?: {}): Promise<any>;
