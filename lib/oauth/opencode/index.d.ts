/**
 * OpenCode Go Free — OpenCode Go relay (https://opencode.ai/zen/go/v1).
 *
 * This is not OpenCode Zen anonymous free (`/zen/v1` big-pickle / *-free).
 * Official Go is a keyed subscription: paste an API key from
 * https://opencode.ai/auth (env OPENCODE_API_KEY / OPENCODE_GO_API_KEY).
 * Store never sends a sentinel as Bearer.
 */
export { applyOpencodeCache, opencodeCacheHeaders, opencodeCacheSessionId, resetOpencodePins } from './cache.js';
export declare const OPENCODE_GO_ORIGIN = "https://opencode.ai/zen/go/v1";
export declare const OPENCODE_CHAT_URL = "https://opencode.ai/zen/go/v1/chat/completions";
export declare const OPENCODE_RESPONSES_URL = "https://opencode.ai/zen/go/v1/responses";
export declare const OPENCODE_MODELS_URL = "https://opencode.ai/zen/go/v1/models";
export declare const OPENCODE_MODELS_DEV_URL = "https://models.dev/api.json";
export declare const OPENCODE_DOCS_URL = "https://opencode.ai/docs/go";
export declare const OPENCODE_AUTH_URL = "https://opencode.ai/auth";
export declare const OPENCODE_USER_AGENT = "dsh-plugin-oauth-subs";
export declare const OPENCODE_REFERER = "https://github.com/xxww0098/dsh-plugin-oauth-subs";
export declare const OPENCODE_TITLE = "dsh-plugin-oauth-subs";
/** Leftover vault sentinel from the old Zen-anonymous family. Never send. */
export declare const OPENCODE_ANON_TOKEN = "anonymous";
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
export declare const OPENCODE_REASONING_GLM: Readonly<{
    low: "low";
    high: "high";
    max: "max";
}>;
export declare const OPENCODE_REASONING_HY3: Readonly<{
    off: "none";
    low: "low";
    high: "high";
}>;
export declare const OPENCODE_REASONING_LUNA: Readonly<{
    off: "none";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
    max: "max";
}>;
export declare const OPENCODE_REASONING_GROK: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
}>;
export declare const OPENCODE_SOURCES: readonly string[];
/**
 * Zen-only free slugs. Never put these on the Go picker even if a stale
 * models.dev `opencode` row or a mistaken live payload lists them.
 */
export declare const OPENCODE_ZEN_FREE: Readonly<Set<string>>;
export declare const OPENCODE_DEFAULT_MODEL = "glm-5.3-flash";
export declare const OPENCODE_PLAN_NAMES: Readonly<{
    go: "Go Free";
    free: "Go Free";
    gofree: "Go Free";
    go_free: "Go Free";
}>;
/**
 * Offline floor: live Go Completions / Responses ids + models.dev
 * `opencode-go` caps (2026-09-05). Zen free slugs stay out.
 */
export declare const OPENCODE_MODELS: readonly {
    reasoningEfforts?: any;
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: any[];
}[];
export declare function opencodeBareId(id: any): string;
export declare function isOpencodeZenFreeSlug(id: any): boolean;
/** Live Go row is eligible unless it is a Zen-only free slug. */
export declare function isOpencodeGoSlug(id: any): boolean;
/** Go docs: Luna / Grok 4.x / Muse Spark Contributor are `/zen/go/v1/responses`. */
export declare function isOpencodeResponsesModel(id: any): boolean;
export declare function opencodePrettyName(id: any): string;
export declare function opencodeSourceLabel(source: any): string;
export declare function parseOpencodeApiKey(value: any): string;
export declare function opencodeAccountFingerprint(key: any): string;
export declare function opencodeDefaultAccount(key: any): string;
export declare function isOpencodeOpaqueAccount(value: any): boolean;
export declare function isOpencodeAnonSession(session: any): boolean;
export declare function opencodeSession({ accessToken, account, source, planType, }?: {
    source?: string;
    planType?: string;
}): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    source: string;
    planType: string;
};
export declare function refreshOpencode(session: any): Promise<any>;
export declare function isOpencodePermanentRefreshError(): boolean;
/** Catalog GETs stay keyless. Chat hops pass the session so Bearer is set. */
export declare function opencodeUpstreamHeaders(session: any): {
    'user-agent': string;
    'http-referer': string;
    'x-title': string;
};
