/**
 * Shared Cursor registry state: the picker row cache plus the per-family
 * RequestedModel parameter styles derived from live AvailableModels.
 *
 * Lives apart from catalog.ts / request.ts on purpose: catalog.ts writes
 * both after a refresh and request.ts reads both while building a Run, and
 * h2-session.ts already imports request.ts — putting this state in
 * catalog.ts would close an import cycle.
 */
/** Picker row cache (tokenHash + egress keyed, 5 min TTL — see catalog.ts). */
export declare const cursorCatalogCache: {
    tokenHash: string;
    models?: any[];
    expiresAt: number;
};
export declare function resetCursorCatalogCache(): void;
export declare function cursorCatalogModels(): any[];
export declare function setCursorParamStyles(styles: any): void;
/**
 * The parameter style one picker family sends on Run. A family present in the
 * live catalog wins over the static table — including a family whose live
 * variants carry no parameters at all (empty style = send nothing).
 */
export declare function cursorParamStyle(family: any): any;
