/**
 * OpenCode Free — anonymous Zen relay (https://opencode.ai/zen/v1).
 *
 * First-line: anomalyco/opencode v1.18.29. No-key CLI loader sets
 * `apiKey: "public"` (Zen treats that bearer as no key). Store still
 * keeps sentinel `anonymous` so auth.json is non-empty — that value is
 * never sent as Authorization (Zen would treat it as a real key).
 */
export { applyOpencodeCache, opencodeCacheHeaders, opencodeCacheSessionId, resetOpencodePins } from './cache.js';
export declare const OPENCODE_ZEN_ORIGIN = "https://opencode.ai/zen/v1";
export declare const OPENCODE_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";
export declare const OPENCODE_RESPONSES_URL = "https://opencode.ai/zen/v1/responses";
export declare const OPENCODE_MODELS_URL = "https://opencode.ai/zen/v1/models";
export declare const OPENCODE_MODELS_DEV_URL = "https://models.dev/api.json";
export declare const OPENCODE_DOCS_URL = "https://opencode.ai/docs/zen";
/** anomalyco/opencode release this hop is pinned to. */
export declare const OPENCODE_CLIENT_VERSION = "1.18.29";
export declare const OPENCODE_USER_AGENT = "opencode/1.18.29";
/** Official Flag.OPENCODE_CLIENT default. Desktop sends `desktop`. */
export declare const OPENCODE_CLIENT = "cli";
/** Official no-key sentinel. Zen `handler.ts`: `raw === "public"` → undefined. */
export declare const OPENCODE_PUBLIC_TOKEN = "public";
/** Store sentinel — never sent as Authorization. */
export declare const OPENCODE_ANON_TOKEN = "anonymous";
export declare const OPENCODE_ACCOUNT = "Anonymous";
export declare const OPENCODE_NEVER_EXPIRES = 8640000000000000;
export declare const OPENCODE_DEFAULT_CONTEXT = 128000;
export declare const OPENCODE_DEFAULT_MAX_TOKENS = 16384;
export declare const OPENCODE_INPUT: readonly string[];
export declare const OPENCODE_VISION_INPUT: readonly string[];
export declare const OPENCODE_REASONING_MUSE: Readonly<{
    minimal: "minimal";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
}>;
/** models.dev `type: toggle`. Completions hop: off → `reasoning_effort: none`. */
export declare const OPENCODE_REASONING_TOGGLE: Readonly<{
    off: "none";
    high: "high";
}>;
export declare const OPENCODE_SOURCES: readonly string[];
/** Go-subscription slugs that look free. Never put these on the keyless picker. */
export declare const OPENCODE_KEYED_FREE: Readonly<Set<string>>;
/**
 * Official Zen Free pricing ids (https://opencode.ai/docs/zen).
 * Suffix `-free` is not the rule — `big-pickle` is free; stale `*-free` rows are not.
 */
export declare const OPENCODE_OFFICIAL_FREE: Readonly<Set<string>>;
export declare const OPENCODE_DEFAULT_MODEL = "ling-3.0-flash-fin-free";
export declare const OPENCODE_PLAN_NAMES: Readonly<{
    free: "Free";
}>;
/**
 * Offline floor: official Zen Free ids + models.dev caps (2026-09-03).
 * Stale Zen slugs (deepseek-v4-flash-free, laguna-s-2.1-free) stay out.
 * Empty reasoning_options + reasoning true omit reasoningEfforts.
 */
export declare const OPENCODE_MODELS: readonly {
    reasoningEfforts?: any;
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: any[];
}[];
export declare function isOpencodeFreeSlug(id: any): boolean;
/** Zen lists Muse Spark on `/zen/v1/responses`. Completions 500s. Future `muse-spark*` keep this hop. */
export declare function isOpencodeResponsesModel(id: any): boolean;
export declare function opencodePrettyName(id: any): string;
export declare function opencodeSourceLabel(source: any): any;
export declare function opencodeSession(): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    source: string;
    planType: string;
};
export declare function refreshOpencode(session: any): Promise<any>;
export declare function isOpencodePermanentRefreshError(): boolean;
/**
 * Official no-key hop identity. `Bearer public` is the CLI sentinel
 * (`provider.ts` `apiKey: "public"`). Never send the store sentinel
 * `anonymous` — GET /models treats any other bearer as a real key.
 */
export declare function opencodeUpstreamHeaders(): {
    authorization: string;
    'user-agent': string;
    'x-opencode-client': string;
};
