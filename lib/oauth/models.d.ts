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
export { CODEX_REASONING_EFFORTS };
export declare function isOptInKey(key: any): boolean;
export declare function modelKey(provider: any, id: any): string;
export declare const FAMILY_IDS: readonly string[];
export declare function ownedProviderIds(prefix: any): string[];
export declare function withPickerVariants(models: any): any[];
export declare function buildProviders({ prefix, origin, loggedIn }: {
    prefix: any;
    origin: any;
    loggedIn: any;
}): {};
export declare function describeProviders(providers: any): {
    provider: string;
    api: any;
    models: any;
}[];
export declare function catalogProviders({ prefix, origin }: {
    prefix: any;
    origin: any;
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
export declare function syncHarnessModels({ settings, prefix, origin, loggedIn, selected }: {
    settings: any;
    prefix: any;
    origin: any;
    loggedIn: any;
    selected: any;
}): Promise<{
    routes: {
        provider: string;
        api: any;
        models: any;
    }[];
}>;
