/**
 * OpenCode Go catalog (API key family).
 *
 * DSH's installed pi-ai catalog ships 27 official Go models, but llm-pi-ai
 * cannot append to a catalog route: a non-empty `models` list replaces the
 * whole served catalog and a route-level `api` overrides every model's own
 * wire protocol. OpenCode Go speaks three protocols, so this plugin owns the
 * complete list on two routes of its own:
 *
 *   `opencode-go-flash`     openai-completions  — 28 models (display "OpenCode Go")
 *   `opencode-go-responses` openai-responses    —  5 models
 *
 * Sources (all 2026-09-23):
 *   - `GET https://opencode.ai/zen/go/v1/models` (public 40, this key 33)
 *   - Go docs model list + "API 端点" table (protocol per model)
 *   - models.dev provider `opencode-go` (contextWindow / maxTokens / input /
 *     effort ladders) and the installed pi-ai catalog (`compat` dialects)
 *   - live `/chat/completions` probes: every completions row answered 200
 *     except the Responses family below; the seven public ids this listing
 *     omits answered "Model is unavailable" or are not in the docs list
 *     (kimi-k2.5 / glm-5 / qwen3.5-plus / mimo-v2-pro / mimo-v2-omni /
 *     hy3-preview / grok-4.5) — the live `/models` may still name them, but
 *     the gateway does not serve them on either protocol here.
 */
export declare const OPENCODE_GO_BUILTIN_ROUTE_ID = "opencode-go";
export declare const OPENCODE_GO_EXTRA_ROUTE_ID = "opencode-go-flash";
export declare const OPENCODE_GO_RESPONSES_ROUTE_ID = "opencode-go-responses";
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
/** Every official Go model that answers on /chat/completions. */
export declare const OPENCODE_GO_EXTRA_MODELS: readonly any[];
/** Official Go models that only answer on /responses. */
export declare const OPENCODE_GO_RESPONSES_MODELS: readonly any[];
export declare const OPENCODE_GO_EXTRA_ROUTE: Readonly<{
    id: "opencode-go-flash";
    displayName: "OpenCode Go";
    api: "openai-completions";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}>;
export declare const OPENCODE_GO_RESPONSES_ROUTE: Readonly<{
    id: "opencode-go-responses";
    displayName: "OpenCode Go · Responses";
    api: "openai-responses";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}>;
export declare const OPENCODE_GO_ROUTES: readonly (Readonly<{
    id: "opencode-go-flash";
    displayName: "OpenCode Go";
    api: "openai-completions";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}> | Readonly<{
    id: "opencode-go-responses";
    displayName: "OpenCode Go · Responses";
    api: "openai-responses";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}>)[];
