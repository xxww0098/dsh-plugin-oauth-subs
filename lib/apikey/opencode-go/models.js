/**
 * OpenCode Go catalog (API key family).
 *
 * DSH's installed pi-ai catalog ships 27 official Go models, but llm-pi-ai
 * cannot append to a catalog route: a non-empty `models` list replaces the
 * whole served catalog and a route-level `api` overrides every model's own
 * wire protocol. OpenCode Go speaks three protocols, so this plugin owns the
 * complete list on three routes of its own:
 *
 *   `opencode-go-flash`     openai-completions  — display "Subs · OpenCode Go · Chat"
 *   `opencode-go-responses` openai-responses    — display "Subs · OpenCode Go · Responses"
 *   `opencode-go-messages`  anthropic-messages  — display "Subs · OpenCode Go · Anthropic"
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
import { catalogRows } from '../../catalog/index.js';
export const OPENCODE_GO_BUILTIN_ROUTE_ID = 'opencode-go';
export const OPENCODE_GO_EXTRA_ROUTE_ID = 'opencode-go-flash';
export const OPENCODE_GO_RESPONSES_ROUTE_ID = 'opencode-go-responses';
export const OPENCODE_GO_MESSAGES_ROUTE_ID = 'opencode-go-messages';
export const OPENCODE_GO_OPENAI_BASE_URL = 'https://opencode.ai/zen/go/v1';
/** Anthropic SDK appends `/v1/messages`, so this origin stops before `/v1`. */
export const OPENCODE_GO_ANTHROPIC_BASE_URL = 'https://opencode.ai/zen/go';
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
export const OPENCODE_GO_SESSION_HEADER = 'x-opencode-session';
export const OPENCODE_GO_SESSION_ID = 'dsh-opencode-go';
/** The one route header every Go route carries. */
export function opencodeGoSessionHeaders() {
    return { [OPENCODE_GO_SESSION_HEADER]: OPENCODE_GO_SESSION_ID };
}
/**
 * Static catalog rows live in `src/catalog/models.json`:
 *   `"opencode-go-flash"`     — every official Go model answering on /chat/completions
 *   `"opencode-go-responses"` — official Go models answering on /responses only
 *   `"opencode-go-messages"`  — official Go models answering on /v1/messages
 * Rows keep the pi-ai effort ladders (DSH picker keys -> wire spellings) and,
 * on the completions route, the per-model `compat` dialect (plain OpenAI-compat
 * vs DeepSeek's: `requiresReasoningContentOnAssistantMessages` /
 * `thinkingFormat: deepseek`). Messages rows carry no completions compat.
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
export const OPENCODE_GO_EXTRA_MODELS = catalogRows('opencode-go-flash');
export const OPENCODE_GO_RESPONSES_MODELS = catalogRows('opencode-go-responses');
export const OPENCODE_GO_MESSAGES_MODELS = catalogRows('opencode-go-messages');
export const OPENCODE_GO_EXTRA_ROUTE = Object.freeze({
    id: OPENCODE_GO_EXTRA_ROUTE_ID,
    displayName: 'Subs · OpenCode Go · Chat',
    api: 'openai-completions',
    baseURL: OPENCODE_GO_OPENAI_BASE_URL,
    headers: Object.freeze(opencodeGoSessionHeaders()),
    models: OPENCODE_GO_EXTRA_MODELS,
});
export const OPENCODE_GO_RESPONSES_ROUTE = Object.freeze({
    id: OPENCODE_GO_RESPONSES_ROUTE_ID,
    displayName: 'Subs · OpenCode Go · Responses',
    api: 'openai-responses',
    baseURL: OPENCODE_GO_OPENAI_BASE_URL,
    headers: Object.freeze(opencodeGoSessionHeaders()),
    models: OPENCODE_GO_RESPONSES_MODELS,
});
export const OPENCODE_GO_MESSAGES_ROUTE = Object.freeze({
    id: OPENCODE_GO_MESSAGES_ROUTE_ID,
    displayName: 'Subs · OpenCode Go · Anthropic',
    api: 'anthropic-messages',
    baseURL: OPENCODE_GO_ANTHROPIC_BASE_URL,
    headers: Object.freeze(opencodeGoSessionHeaders()),
    models: OPENCODE_GO_MESSAGES_MODELS,
});
export const OPENCODE_GO_ROUTES = Object.freeze([
    OPENCODE_GO_EXTRA_ROUTE,
    OPENCODE_GO_RESPONSES_ROUTE,
    OPENCODE_GO_MESSAGES_ROUTE,
]);
/**
 * OpenCode Zen — the pay-as-you-go sibling that shares this family's account,
 * API key, Console session and workspace, on its own origin
 * (`https://opencode.ai/zen/v1`). Same three wire protocols, so it gets three
 * routes of its own; the plugin owns the complete Zen catalog (the
 * `opencode-zen-*` rows in `src/catalog/models.json`), while DSH's built-in
 * pi-ai `opencode` route stays the user's to enable from the host's Models page.
 *
 * Sources (checked 2026-10-10, recorded in the family README):
 *   - `GET https://opencode.ai/zen/v1/models` with this key: 45 ids. The
 *     anonymous view lists 87 — a wider public cache, the same split the Go
 *     family documented.
 *   - official Zen docs endpoint table (`https://opencode.ai/docs/zen/`):
 *     `/v1/responses` = @ai-sdk/openai, `/v1/messages` = @ai-sdk/anthropic,
 *     `/v1/chat/completions` = @ai-sdk/openai-compatible. Two other rows of
 *     that table — `/v1/models/<id>` (@ai-sdk/google, the Gemini ids) and
 *     `/v1/systemone` (Jev) — speak protocols outside DSH's closed `api`
 *     union, so those ids cannot ride these routes and stay out of the catalog.
 *   - models.dev `opencode` bucket for context / output / input / effort.
 *   - the installed pi-ai `opencode` catalog (per-model `api` +
 *     `thinkingLevelMap`) as the protocol cross-check; both agree on every row
 *     this family ships.
 *
 * Free rows are out by design: every `*-free` id (and `big-pickle`) is a
 * free-tier model whose gateway answer to a non-OpenCode client is
 * `403 FreeTierError — "OpenCode's free tier can only be used from within
 * OpenCode"` (live 2026-10-10). The family README's 不要 section already rules
 * out chasing Zen's free tier.
 *
 * Unlike Go, Zen documents no `x-opencode-session` requirement and no live
 * probe ever answered `MissingSessionID`, so these routes carry no headers.
 */
export const OPENCODE_ZEN_CHAT_ROUTE_ID = 'opencode-zen-chat';
export const OPENCODE_ZEN_RESPONSES_ROUTE_ID = 'opencode-zen-responses';
export const OPENCODE_ZEN_MESSAGES_ROUTE_ID = 'opencode-zen-messages';
export const OPENCODE_ZEN_OPENAI_BASE_URL = 'https://opencode.ai/zen/v1';
/** Anthropic SDK appends `/v1/messages`, so this origin stops before `/v1`. */
export const OPENCODE_ZEN_ANTHROPIC_BASE_URL = 'https://opencode.ai/zen';
/** Static Zen rows, split per wire protocol in `src/catalog/models.json`. */
export const OPENCODE_ZEN_CHAT_MODELS = catalogRows('opencode-zen-chat');
export const OPENCODE_ZEN_RESPONSES_MODELS = catalogRows('opencode-zen-responses');
export const OPENCODE_ZEN_MESSAGES_MODELS = catalogRows('opencode-zen-messages');
export const OPENCODE_ZEN_CHAT_ROUTE = Object.freeze({
    id: OPENCODE_ZEN_CHAT_ROUTE_ID,
    displayName: 'Subs · OpenCode Zen · Chat',
    api: 'openai-completions',
    baseURL: OPENCODE_ZEN_OPENAI_BASE_URL,
    models: OPENCODE_ZEN_CHAT_MODELS,
});
export const OPENCODE_ZEN_RESPONSES_ROUTE = Object.freeze({
    id: OPENCODE_ZEN_RESPONSES_ROUTE_ID,
    displayName: 'Subs · OpenCode Zen · Responses',
    api: 'openai-responses',
    baseURL: OPENCODE_ZEN_OPENAI_BASE_URL,
    models: OPENCODE_ZEN_RESPONSES_MODELS,
});
export const OPENCODE_ZEN_MESSAGES_ROUTE = Object.freeze({
    id: OPENCODE_ZEN_MESSAGES_ROUTE_ID,
    displayName: 'Subs · OpenCode Zen · Anthropic',
    api: 'anthropic-messages',
    baseURL: OPENCODE_ZEN_ANTHROPIC_BASE_URL,
    models: OPENCODE_ZEN_MESSAGES_MODELS,
});
export const OPENCODE_ZEN_ROUTES = Object.freeze([
    OPENCODE_ZEN_CHAT_ROUTE,
    OPENCODE_ZEN_RESPONSES_ROUTE,
    OPENCODE_ZEN_MESSAGES_ROUTE,
]);
