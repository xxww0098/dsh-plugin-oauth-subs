/**
 * Live Copilot picker. GET {endpoints.api}/models after login.
 * COPILOT_MODELS is the offline fallback only.
 */
export declare const COPILOT_CATALOG_TTL_MS: number;
export declare function resetCopilotCatalogCache(): void;
export declare function copilotCatalogTokenHash(token: any): string;
export declare function copilotCatalogModels(): any;
export declare function copilotReasoningEffortsOf(row: any): {};
export declare function toCopilotPickerModels(payload: any): any[];
export declare function refreshCopilotCatalog(session: any, options?: {}): Promise<any>;
