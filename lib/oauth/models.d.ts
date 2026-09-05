/**
 * Project Codex / Grok catalogs into llm-pi-ai provider routes and atomically
 * replace only the routes this plugin owns.
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
export declare function isOptInKey(key: any): boolean;
export declare function modelKey(provider: any, id: any): string;
export declare const FAMILY_IDS: readonly string[];
/** Dropped families. Still unset leftover harness routes; never written back. */
export declare const RETIRED_FAMILY_IDS: readonly string[];
export declare function ownedProviderIds(prefix: any): string[];
export declare function withPickerVariants(models: any): any[];
export declare function buildProviders({ prefix, origin, loggedIn, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, glmModels }: {
    prefix: any;
    origin: any;
    loggedIn: any;
    cursorModels: any;
    ollamaModels: any;
    kiroModels: any;
    kimiModels: any;
    copilotModels: any;
    glmModels: any;
}): {};
export declare function describeProviders(providers: any): {
    provider: string;
    api: any;
    models: any;
}[];
export declare function catalogProviders({ prefix, origin, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, glmModels }: {
    prefix: any;
    origin: any;
    cursorModels: any;
    ollamaModels: any;
    kiroModels: any;
    kimiModels: any;
    copilotModels: any;
    glmModels: any;
}): {};
export declare function catalogKeys(providers: any): any[];
export declare function familyOfProvider(provider: any): string;
export declare function familyOfKey(key: any): string;
export declare function familyCatalogKeys(catalog: any, family: any): any[];
export declare function describeCatalog(providers: any, { enabledKeys, loggedIn }?: {}): {
    provider: string;
    displayName: any;
    family: string;
    loggedIn: boolean;
    models: any;
}[];
/**
 * Persisted enable/disable set for the Settings picker.
 * Default is all-on except `-900k` (opt-in; it burns quota).
 * New non-opt-in catalog ids stay on. Stored as
 * `{ "disabled": ["oauth-codex/gpt-5.4-mini"], "enabled": ["oauth-codex/gpt-5.4-900k"] }`.
 */
export declare class ModelSwitch {
    constructor({ path }?: {});
    load(): Promise<void>;
    save(): Promise<void>;
    isEnabled(key: any): any;
    enabledKeys(catalog: any): any[];
    selectedForSync(catalog: any): any[];
    status(catalog: any): {
        selected: any[];
        disabled: any[];
        allOn: boolean;
    };
    setEnabled(keys: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
    toggle(key: any, on: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
    setFamily(family: any, on: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
    /**
     * Leftover 全关: every *current* catalog key for a signed-in family is
     * off (often after a catalog shrink left stale ids in `disabled`).
     * Enable the current keys so login/sync can write the DSH route.
     * Does not resurrect retired ids or opt-in `-900k` rows.
     */
    recoverEmptyLoggedInFamilies(catalog: any, loggedIn: any): Promise<boolean>;
    setAll(on: any, catalog: any): Promise<{
        selected: any[];
        disabled: any[];
        allOn: boolean;
    }>;
}
export declare function filterProviders(providers: any, selected: any): any;
/** `undefined` when the host has no readable settings.get; `{}` when the section is empty. */
export declare function peekPiAiProviders(settings: any): Promise<any>;
export declare function syncHarnessModels({ settings, prefix, origin, loggedIn, selected, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, glmModels }: {
    settings: any;
    prefix: any;
    origin: any;
    loggedIn: any;
    selected: any;
    cursorModels: any;
    ollamaModels: any;
    kiroModels: any;
    kimiModels: any;
    copilotModels: any;
    glmModels: any;
}): Promise<{
    routes: {
        provider: string;
        api: any;
        models: any;
    }[];
}>;
