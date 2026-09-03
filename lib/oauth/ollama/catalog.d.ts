/**
 * Live Ollama Cloud picker. GET https://ollama.com/api/tags after login.
 * OLLAMA_MODELS is the offline fallback only. Retired Cloud rows stay out.
 */
export declare const OLLAMA_CATALOG_TTL_MS: number;
export declare function resetOllamaCatalogCache(): void;
export declare function ollamaCatalogTokenHash(token: any): string;
export declare function ollamaCatalogModels(): any;
export declare function toOllamaPickerModels(tags: any): any[];
export declare function refreshOllamaCatalog(session: any, options?: {}): Promise<any>;
