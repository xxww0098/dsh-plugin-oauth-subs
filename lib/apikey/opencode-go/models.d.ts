/**
 * OpenCode Go catalog (API key family).
 *
 * DSH's installed pi-ai catalog ships 27 official Go models, but llm-pi-ai
 * cannot append to a catalog route: a non-empty `models` list replaces the
 * whole served catalog and a route-level `api` overrides every model's own
 * wire protocol. OpenCode Go speaks three protocols, so this plugin owns the
 * complete list on two routes of its own:
 *
 *   `opencode-go-flash`     openai-completions  — 28 models (display "Subs · OpenCode Go · Chat")
 *   `opencode-go-responses` openai-responses    —  6 models (display "Subs · OpenCode Go · Responses")
 *
 * Sources (2026-09-23, refreshed 2026-09-26):
 *   - `GET https://opencode.ai/zen/go/v1/models` (this key 35)
 *   - Go docs model list + "API 端点" table (protocol per model)
 *   - models.dev provider `opencode-go` (contextWindow / maxTokens / input /
 *     effort ladders) and the installed pi-ai catalog (`compat` dialects)
 *   - live `/chat/completions` probes: every completions row answered 200
 *     except the Responses family below; the seven public ids this listing
 *     omits answered "Model is unavailable" or are not in the docs list
 *     (kimi-k2.5 / glm-5 / qwen3.5-plus / mimo-v2-pro / mimo-v2-omni /
 *     hy3-preview / grok-4.5) — the live `/models` may still name them, but
 *     the gateway does not serve them on either protocol here. The legacy
 *     alias `deepseek-flash` is served too but not listed: it is the same
 *     model as the docs id `deepseek-v4.1-flash`, and two rows rendered as
 *     duplicates in the picker. 2026-09-26: `space-bunny-free` and
 *     `gpt-6-luna` each answered 200 on their respective endpoints, including
 *     high / none / max effort probes; model limits come from models.dev.
 *   - 2026-09-29: the two `/responses` Luna rows advertise the 258K default
 *     input tier instead of models.dev's 1,050,000 total window — see the
 *     Luna note below.
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
/**
 * Static catalog rows live in `src/catalog/models.json`:
 *   `"opencode-go-flash"`     — every official Go model answering on /chat/completions
 *   `"opencode-go-responses"` — official Go models answering on /responses only
 * Rows keep the pi-ai effort ladders (DSH picker keys -> wire spellings) and,
 * on the completions route, the per-model `compat` dialect (plain OpenAI-compat
 * vs DeepSeek's: `requiresReasoningContentOnAssistantMessages` /
 * `thinkingFormat: deepseek`).
 */
/**
 * The two Luna rows advertise the vendor's **default** input tier, not the
 * official total window. models.dev lists 1,050,000 for both (922,000 input +
 * 128,000 output), but that total includes the large-window tier: Codex CLI
 * pins the same GPT-6 / 5.6 rows at 258,000 by default and hangs 872,000 on an
 * opt-in sibling. DSH compacts against `contextWindow`, so advertising the
 * total lets a long session grow until the Go Responses gateway rejects it
 * (same shape as the GLM 400K plan cap). Maintainer override 2026-09-29 —
 * pinned in the `"opencode-go-responses"` rows (258,000).
 */
export declare const OPENCODE_GO_EXTRA_MODELS: readonly any[];
export declare const OPENCODE_GO_RESPONSES_MODELS: readonly any[];
export declare const OPENCODE_GO_EXTRA_ROUTE: Readonly<{
    id: "opencode-go-flash";
    displayName: "Subs · OpenCode Go · Chat";
    api: "openai-completions";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}>;
export declare const OPENCODE_GO_RESPONSES_ROUTE: Readonly<{
    id: "opencode-go-responses";
    displayName: "Subs · OpenCode Go · Responses";
    api: "openai-responses";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}>;
export declare const OPENCODE_GO_ROUTES: readonly (Readonly<{
    id: "opencode-go-flash";
    displayName: "Subs · OpenCode Go · Chat";
    api: "openai-completions";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}> | Readonly<{
    id: "opencode-go-responses";
    displayName: "Subs · OpenCode Go · Responses";
    api: "openai-responses";
    baseURL: "https://opencode.ai/zen/go/v1";
    headers: Readonly<{
        "x-opencode-session": string;
    }>;
    models: readonly any[];
}>)[];
