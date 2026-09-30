/**
 * Project every family's catalog into llm-pi-ai provider routes (ids, DSH
 * `api` / effort / compat constraints, picker keys and aliases). Writing them
 * to the host is harness-sync.ts; the picker's persisted state is
 * model-switch.ts.
 */
import { CODEX_REASONING_EFFORTS } from './codex/index.js';
export declare const OAUTH_CREDENTIAL_REF = "DSH_OAUTH_SUBS_API_KEY";
/**
 * DSH llm-pi-ai `api` is a closed union (`openai-completions` |
 * `openai-responses` | `anthropic-messages`). Bare `openai` is refused
 * and the whole section write is dropped, so Codex/Grok stay and GLM /
 * Kiro / Antigravity never land in settings.yaml.
 */
export declare const HARNESS_RESPONSES_API = "openai-responses";
export declare const HARNESS_COMPLETIONS_API = "openai-completions";
export declare const HARNESS_ANTHROPIC_API = "anthropic-messages";
/**
 * DSH `reasoningEfforts` keys (`packages/llm/llm-pi-ai` THINKING_LEVELS).
 * Vendor wire spellings belong in the *value* (`off: "none"`), never as a
 * key. An unknown key fails the whole `llm-pi-ai` mutate, so the family
 * never lands in settings.yaml.
 */
export declare const DSH_THINKING_LEVELS: readonly string[];
/**
 * Completions-only `compat` switches. DSH `@deepseek-ai/dsh-llm-pi-ai`
 * `assertServiceable` (0.1.2-alpha.2 `catalog.ts`) refuses a route-level
 * field that no model on the route can read:
 * `sets compat "${field}", but no model on the route speaks a protocol that takes it`.
 * `supportsReasoningEffort` / `thinkingFormat` live on
 * `openai-completions` only — not `anthropic-messages` or `openai-responses`.
 * Stamping either on GLM's Anthropic hop aborts the atomic `llm-pi-ai`
 * mutate, so `oauth-kiro` never lands in settings.yaml.
 */
export declare const DSH_COMPLETIONS_ONLY_COMPAT: readonly string[];
export { CODEX_REASONING_EFFORTS };
/**
 * Local stand-in for DSH `assertServiceable` on one owned route. The host
 * package is not a dependency; this matches the JSON shape it rejects so a
 * bad payload fails here instead of silently keeping the last good section.
 */
export declare function assertDshServiceableProvider(provider: any, value: any): void;
/**
 * Context-variant picker rows no longer exist (the large window became the
 * per-row custom-context ceiling), so nothing is opt-in. Stale `-900k` /
 * `-1m` keys from older switch files are unknown to the catalog and never
 * surface; real ids that merely end in a context suffix (Devin's `-1m`
 * backend variants) are ordinary rows. `isLargeContextKey` stays in
 * context-mode for hop peeling of routes older versions wrote.
 */
export declare function isOptInKey(_key: any): boolean;
export declare function modelKey(provider: any, id: any): string;
/**
 * Custom input-context bounds (tokens). The floor keeps compaction headroom
 * math meaningful; the ceiling is an absolute sanity cap for untrusted
 * persisted entries — live validation caps each row at its own maximum
 * (`maxContextOfRow`), which never exceeds this.
 */
export declare const MODEL_CONTEXT_MIN = 4096;
export declare const MODEL_CONTEXT_MAX = 2097152;
/**
 * A row's custom input-context ceiling: the vendor's large window when the
 * row advertises one (`maxContextWindow`, mirroring Codex CLI
 * `max_context_window`: Codex 872K, GLM 1M, Copilot GPT rows' vendor window
 * above the 256K default), else its catalog window. `-fast` twins share the
 * base model's ceiling. The lookup is family-scoped because vendor ids
 * collide across families (`gpt-6-sol` in codex and copilot). Rows must come
 * from an un-overridden catalog build — an already-customized `contextWindow`
 * would shrink the ceiling on re-edit.
 */
export declare function maxContextOfRow(row: any, family: any): any;
/**
 * Apply per-model context overrides keyed by `modelKey(provider, id)` after
 * the catalogs are projected into harness rows. Key-exact: base, context
 * variant (`-900k`/`-1m`), and `-fast` twin rows are overridden
 * independently, and a variant keeps its id (the suffix is peeled upstream
 * regardless of the window). Non-mutating; providers without hits are
 * returned as-is.
 */
export declare function applyContextOverrides(providers: Record<string, any>, contexts?: Record<string, number>): Record<string, any>;
/**
 * Write a family's default effort as its route's provider `reasoning` (DSH
 * has no per-model default). DSH does not clamp — a level a model does not
 * declare fails its requests — so a model without the level gets that key
 * mapped to its own nearest one: the highest below (`off` only when `off` was
 * asked), else the lowest above; the picker then shows it under the global
 * name. A route with a non-reasoning model gets no default at all: DSH would
 * reject that model's every request that picks no effort.
 */
export declare function withDefaultEffort(value: any, level: any): any;
export declare const FAMILY_IDS: readonly string[];
/**
 * OpenCode Go picker families: direct API-key routes, not OAuth logins, and
 * no loopback hop. The picker lists only the supplemental model(s) the plugin
 * writes itself; DSH's built-in `opencode-go` catalog route carries the rest.
 * Without `OPENCODE_API_KEY` the family is only locked (checkbox disabled).
 */
export declare const APIKEY_FAMILY_IDS: readonly ("opencode-go-flash" | "opencode-go-responses")[];
/** Every family the Settings picker can toggle. */
export declare const MODEL_FAMILY_IDS: readonly string[];
/** Dropped families. Still unset leftover harness routes; never written back. */
export declare const RETIRED_FAMILY_IDS: readonly string[];
export declare function ownedProviderIds(prefix: any): string[];
/**
 * Rows with `fastTier` grow a host-side `-fast` sibling (peeled before the
 * wire). `maxContextWindow` never expands a second picker row: each model
 * keeps exactly one default-window row, and the large window is the row's
 * custom input-context ceiling (`maxContextOfRow`).
 */
export declare function withPickerVariants(models: any): any[];
/** ChatGPT's own Fast twins: `fastTier` rows grow `<id>-fast` (peeled in chatgpt/request.ts). */
export declare function chatgptPickerModels(chatgptModels: any): any[];
export declare function buildProviders({ prefix, origin, loggedIn, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, devinModels, glmModels, clineModels, commandCodeModels, chatgptModels, contexts }: any): Record<string, any>;
export declare function describeProviders(providers: Record<string, any>): {
    provider: string;
    api: any;
    models: any;
}[];
export declare function catalogProviders({ prefix, origin, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, devinModels, glmModels, clineModels, commandCodeModels, chatgptModels, contexts }: any): Record<string, any>;
export declare function catalogKeys(providers: Record<string, any>): any[];
export declare function familyOfProvider(provider: any): string;
export declare function familyOfKey(key: any): string;
export declare function familyCatalogKeys(catalog: any, family: any): any[];
export declare function harnessModelAlias(provider: any, id: any): string;
/**
 * `rates` (`<family>/<model id>` → cost multiplier) is display-only: it never
 * rides in a route row. `pricing` (`<family>/<model id>` → rates.json row)
 * is likewise display-only: the Models tab renders it as a USD-per-1M-token
 * tooltip. `providers` must be an un-overridden catalog build —
 * the effective window is computed here from `contexts` so the row's catalog
 * default and ceiling stay visible alongside the override.
 */
export declare function describeCatalog(providers: Record<string, any>, { enabledKeys, loggedIn, rates, contexts, pricing, pricingTimeOfDay }?: any): {
    models: any;
    pricingTimeOfDay?: any;
    provider: string;
    displayName: any;
    family: string;
    loggedIn: boolean;
}[];
export declare const OPENCODE_GO_API_KEY_ENV = "OPENCODE_API_KEY";
