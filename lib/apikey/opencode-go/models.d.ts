/**
 * OpenCode Go supplemental catalog.
 *
 * DSH's installed pi-ai catalog already ships the `opencode-go` provider with
 * the other 27 official Go models (three wire protocols, per-model
 * api/baseURL/compat/thinkingLevelMap, ambient `OPENCODE_API_KEY` auth) — the
 * deployment code lives in `@earendil-works/pi-ai/providers/opencode-go.js`.
 * llm-pi-ai cannot append to a catalog route: a non-empty `models` list
 * replaces the whole served catalog, so the one model the installed catalog
 * lacks — `deepseek-flash` (DeepSeek V4.1 Flash) — lives on its own route
 * beside the built-in one.
 *
 * Sources:
 *   - official Go docs "API 端点": deepseek-flash -> /v1/chat/completions,
 *     @ai-sdk/openai-compatible
 *   - models.dev provider "opencode-go": contextWindow / maxTokens / input
 *   - installed pi-ai catalog `deepseek-v4-flash`: effort ladder + the
 *     DeepSeek completions dialect (`compat`)
 */
export declare const OPENCODE_GO_BUILTIN_ROUTE_ID = "opencode-go";
export declare const OPENCODE_GO_EXTRA_ROUTE_ID = "opencode-go-flash";
export declare const OPENCODE_GO_OPENAI_BASE_URL = "https://opencode.ai/zen/go/v1";
/**
 * Console Go hard-requires a stable session id (400 `MissingSessionID`
 * otherwise): https://opencode.ai/docs/go/#where-can-i-use-it. DSH passes a
 * per-conversation `sessionId` into pi-ai, but pi-ai 0.85.1 never writes
 * `x-opencode-session` (the vendor lists DeepSeek Harness under "Known
 * Problematic Clients"), and llm-pi-ai withholds `sendSessionAffinityHeaders`,
 * so a profile cannot forward it either. A stable route header is the only
 * direct-route value the seam can carry; one shard per DSH install is the
 * fallback the vendor accepts.
 */
export declare const OPENCODE_GO_SESSION_HEADER = "x-opencode-session";
export declare const OPENCODE_GO_SESSION_ID = "dsh-opencode-go";
/** The one route header both Go routes carry. */
export declare function opencodeGoSessionHeaders(): {
    "x-opencode-session": string;
};
/**
 * The one official Go model DSH's installed catalog lacks. Kept on its own
 * route; the built-in `opencode-go` route serves the other 27.
 */
export declare const OPENCODE_GO_EXTRA_MODELS: readonly {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: any[];
}[];
export declare const OPENCODE_GO_EXTRA_ROUTE: Readonly<{
    id: "opencode-go-flash";
    displayName: "OpenCode Go · DeepSeek V4.1 Flash";
    api: "openai-completions";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly {
        id: any;
        name: any;
        contextWindow: any;
        maxTokens: any;
        input: any[];
    }[];
}>;
