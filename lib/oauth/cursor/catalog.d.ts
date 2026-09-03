/**
 * Live Cursor picker catalog. GetUsableModels + AvailableModels collapse
 * into one DSH row per family. CURSOR_MODELS is the offline fallback only.
 */
export declare const CURSOR_CATALOG_TTL_MS: number;
export declare const DEFAULT_CURSOR_CONTEXT_WINDOW = 200000;
export declare const DEFAULT_CURSOR_MAX_OUTPUT = 64000;
export declare const GPT56_DEFAULT_CONTEXT_WINDOW = 272000;
export declare const GPT56_MAX_PROMPT_TOKENS = 500000;
export declare function resetCursorCatalogCache(): void;
export declare function cursorCatalogTokenHash(token: any): string;
export declare function cursorCatalogModels(): any;
export declare function isGpt56Model(id: any, name?: string): boolean;
export declare function clampCursorContextWindow(id: any, name: any, window: any): any;
/** pi-cursor `inferCursorContextWindow` — GetUsableModels has no window field. */
export declare function inferCursorContextWindow(id: any, name?: string): 1000000 | 200000 | 272000 | 256000 | 500000;
/** pi-cursor `inferCursorMaxOutputTokens`. */
export declare function inferCursorMaxOutputTokens(id: any, name?: string): 128000 | 64000;
/** Tab / chat internals stay out of the Settings grid (`/cursor.models all` is Pi opt-in). */
export declare function isCursorInternalModel(id: any, name?: string): boolean;
/**
 * One picker id per family: drop effort / fast / thinking / max-mode / window
 * suffixes. Keep `codex-max` as a product name.
 */
export declare function cursorPickerFamilyId(id: any): string;
/** Collapse live ids into one picker row per family. Empty input → []. */
export declare function toCursorPickerModels(usable: any, parameterized?: any[]): any[];
export declare function refreshCursorCatalog(session: any, options?: {}): Promise<any>;
