/**
 * OpenCode Free — anonymous Zen relay (https://opencode.ai/zen/v1).
 *
 * Matches Hermes `opencode-free`: no account, no API key. The relay 401s
 * any unrecognized Authorization bearer, so hop headers never include one.
 * Store keeps a sentinel token so auth.json shape stays non-empty.
 */
export { applyOpencodeCache, opencodeCacheHeaders, opencodeCacheSessionId, resetOpencodePins } from './cache.js';
export declare const OPENCODE_ZEN_ORIGIN = "https://opencode.ai/zen/v1";
export declare const OPENCODE_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";
export declare const OPENCODE_RESPONSES_URL = "https://opencode.ai/zen/v1/responses";
export declare const OPENCODE_MODELS_URL = "https://opencode.ai/zen/v1/models";
export declare const OPENCODE_MODELS_DEV_URL = "https://models.dev/api.json";
export declare const OPENCODE_DOCS_URL = "https://opencode.ai/docs/zen";
export declare const OPENCODE_USER_AGENT = "dsh-plugin-oauth-subs";
export declare const OPENCODE_REFERER = "https://github.com/xxww0098/dsh-plugin-oauth-subs";
export declare const OPENCODE_TITLE = "dsh-plugin-oauth-subs";
/** Store sentinel — never sent as Authorization. */
export declare const OPENCODE_ANON_TOKEN = "anonymous";
export declare const OPENCODE_ACCOUNT = "Anonymous";
export declare const OPENCODE_NEVER_EXPIRES = 8640000000000000;
export declare const OPENCODE_DEFAULT_CONTEXT = 128000;
export declare const OPENCODE_DEFAULT_MAX_TOKENS = 16384;
export declare const OPENCODE_INPUT: readonly string[];
export declare const OPENCODE_VISION_INPUT: readonly string[];
/** models.dev effort values that are DSH picker keys. Vendor `none` is `off`. */
export declare const OPENCODE_REASONING_DEEPSEEK: Readonly<{
    low: "low";
    high: "high";
    max: "max";
}>;
export declare const OPENCODE_REASONING_LAGUNA: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
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
export declare const OPENCODE_DEFAULT_MODEL = "laguna-s-2.1-free";
export declare const OPENCODE_PLAN_NAMES: Readonly<{
    free: "Free";
}>;
/**
 * Offline floor: Zen live ids on 2026-09-03 + models.dev caps.
 * Delisted slugs (hy3-free, x-preview-f-free) stay out — they 401.
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
/** Never send Authorization. Empty / sentinel / stale Zen keys all 401. */
export declare function opencodeUpstreamHeaders(): {
    'user-agent': string;
    'http-referer': string;
    'x-title': string;
};
