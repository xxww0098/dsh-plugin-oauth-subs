/**
 * Command Code model catalog — static floor only.
 *
 * The CLI's registry is bundle-defined (dist/cli.mjs, command-code 1.79.1):
 * there is no `/alpha/models` endpoint to refresh from, so unlike
 * Cursor/Kimi/Devin this family keeps a pure static catalog. The rows in
 * index.ts are the registry's non-hidden entries, carrying the row's own
 * effort list; models with no entry keep no `reasoningEfforts` (the CLI
 * itself returns null there — no invented fallback).
 */
import { catalogRateTimeOfDay } from '../../catalog/index.js';
import { commandCodeModelById } from './index.js';
export declare function commandCodeCatalogModels(): readonly any[];
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
