/**
 * Live Cursor picker catalog. GetUsableModels + AvailableModels collapse
 * into one DSH row per family, then merge onto CURSOR_MODELS so a stale
 * live list cannot hide Composer 2.5 / Grok 4.6 / GPT-5.6 / Gemini.
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
export declare function inferCursorContextWindow(id: any, name?: string): 1000000 | 200000 | 300000 | 272000 | 256000 | 500000;
/** pi-cursor `inferCursorMaxOutputTokens`. */
export declare function inferCursorMaxOutputTokens(id: any, name?: string): 128000 | 64000;
/** Tab / chat internals stay out of the Settings grid (`/cursor.models all` is Pi opt-in). */
export declare function isCursorInternalModel(id: any, name?: string): boolean;
/**
 * After peeling effort / thinking / max-mode / window, does this source id
 * still end in `-fast`? That is the live catalog's Fast flag — not Codex
 * `service_tier`. Used to decide whether the picker grows a `{family}-fast`
 * sibling. `cursorPickerFamilyId` still collapses Fast into the family.
 */
export declare function cursorSourceIsFast(id: any): boolean;
/**
 * One picker family id: drop effort / fast / thinking / max-mode / window
 * suffixes. Keep `codex-max` as a product name. Fast is re-emitted as a
 * sibling `{family}-fast` when any source id for that family is Fast.
 */
export declare function cursorPickerFamilyId(id: any): string;
/** Live families overlay the official static floor. Empty live → a copy of CURSOR_MODELS. */
export declare function mergeCursorStaticFloor(live: any): any;
/** Collapse live ids into one picker row per family, plus `{family}-fast` when a source id is Fast. Empty input → []. */
export declare function toCursorPickerModels(usable: any, parameterized?: any[]): any[];
export declare function refreshCursorCatalog(session: any, options?: {}): Promise<any>;
