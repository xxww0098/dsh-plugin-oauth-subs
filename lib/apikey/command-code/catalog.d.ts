/**
 * Command Code model catalog: the pinned registry, refreshed from the
 * vendor's own list.
 *
 * The registry comes from the CLI bundle (dist/cli.mjs, command-code 1.82.1):
 * its 97 rows less the 8 hidden ones, each carrying the row's own effort
 * list. /alpha/models does not exist — but the Provider API does, and its
 * GET /provider/v1/models answers without a key (live 2026-10-10: 200,
 * {object:'list', data:[…]}, 87 rows whose ids, names and context_length
 * matched the then-pinned 1.79.1 registry row for row; 2026-10-14: 89 rows,
 * matching the 1.82.1 registry). Community reference
 * @magpie-community/opencode-commandcode-auth reads its picker from that
 * list; this hop takes it as the vendor's answer on membership and window
 * and keeps the pinned registry as the offline floor.
 *
 * The live list says nothing about reasoning levels or image input, so a row
 * it adds carries only what it does say (id, name, contextWindow) — the same
 * 'say nothing rather than invent it' rule magpie applies to modalities.
 * 'npm run models -- command-code' writes full rows from it for a maintainer
 * to review.
 */
import { catalogRateTimeOfDay } from '../../catalog/index.js';
import { commandCodeModelById } from './index.js';
export declare const COMMAND_CODE_CATALOG_TTL_MS: number;
export declare function resetCommandCodeCatalogCache(): void;
/** The live rows when a refresh landed, else the pinned registry. */
export declare function commandCodeCatalogModels(): readonly any[];
/**
 * Rows of the vendor's list: {id, name, context_length, supported_endpoints}.
 * A row with no positive window cannot become a catalog row (the loader
 * requires one), so it is dropped; duplicates keep the first.
 */
export declare function commandCodeProviderRows(payload: any): any[];
/**
 * The vendor's list over the pinned registry. A known id keeps its curated
 * name, its effort list and its image input — the list carries none of them —
 * and takes the live window (the registry is a snapshot of the pin). An id
 * the list adds is appended with exactly what the list says. A registry id
 * the list no longer has stays: the pinned registry is what /alpha/generate
 * is attributed to, and 'npm run models' reports the drift instead of a
 * silent drop.
 */
export declare function mergeCommandCodeProviderModels(live: any, { models }?: {
    models?: readonly any[];
}): any[];
/**
 * Refresh the picker from the vendor's list. The endpoint is public, so no
 * credential is sent; the session is taken to match the other families'
 * discover signature. A failed or empty read leaves the pinned registry.
 */
export declare function refreshCommandCodeCatalog(_session: any, options?: any): Promise<any[]>;
/**
 * models.json-keyed billing-rate map for the Models-tab price tooltip —
 * '<family>/<model id>' → USD-per-1M-token row straight out of
 * src/catalog/rates.json. Display-only, mirrors the CLI's bundled
 * display-rates tables; never a route-row field.
 */
export declare function commandCodePricing(): {
    [k: string]: import("../../catalog/index.js").CatalogRate;
};
export { catalogRateTimeOfDay, commandCodeModelById };
