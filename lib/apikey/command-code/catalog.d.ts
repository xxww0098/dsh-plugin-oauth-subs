/**
 * Command Code model catalog — static floor only.
 *
 * The CLI's registry is bundle-defined (`uD` in dist/cli.mjs, command-code
 * 1.66.0): there is no `/alpha/models` endpoint to refresh from, so unlike
 * Cursor/Kimi/Devin this family keeps a pure static catalog. The rows in
 * index.ts are the registry's non-hidden entries with per-model effort lists
 * merged from the CLI's `kr` effort map; models with no entry keep no
 * `reasoningEfforts` (the CLI itself returns null there — no invented
 * fallback).
 */
import { commandCodeModelById } from './index.js';
export declare function commandCodeCatalogModels(): readonly ({
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts: {
        low: string;
        medium: string;
        high: string;
        xhigh: string;
        max: string;
    };
} | {
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts?: undefined;
} | {
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts: {
        low: string;
        medium: string;
        high: string;
        xhigh: string;
        max?: undefined;
    };
} | {
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts: {
        low: string;
        medium: string;
        high: string;
        xhigh?: undefined;
        max?: undefined;
    };
} | {
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts: {
        high: string;
        max: string;
        low?: undefined;
        medium?: undefined;
        xhigh?: undefined;
    };
} | {
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts: {
        low: string;
        high: string;
        max: string;
        medium?: undefined;
        xhigh?: undefined;
    };
} | {
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts: {
        low: string;
        medium: string;
        xhigh: string;
        high?: undefined;
        max?: undefined;
    };
} | {
    id: string;
    name: string;
    contextWindow: number;
    input: string[];
    reasoningEfforts: {
        high: string;
        xhigh: string;
        low?: undefined;
        medium?: undefined;
        max?: undefined;
    };
})[];
export { commandCodeModelById };
