/**
 * Project Codex / Grok catalogs into llm-pi-ai provider routes and atomically
 * replace only the routes this plugin owns.
 */
import { CODEX_MODELS, CODEX_REASONING_EFFORTS } from './codex/index.js';
import { GROK_MODELS } from './grok/index.js';
import { GLM_MODELS } from './glm/index.js';
import { KIRO_MODELS } from './kiro/index.js';
import { ANTIGRAVITY_MODELS } from './antigravity/index.js';
import { modelSupportsFastMode } from '../utils/fast-mode.js';
import { readPrivateText, writePrivateText } from './store.js';
import { CONTEXT_VARIANT_SUFFIX, codexLargeContext, isLargeContextKey, } from '../utils/context-mode.js';
export const OAUTH_CREDENTIAL_REF = 'DSH_OAUTH_SUBS_API_KEY';
export { CODEX_REASONING_EFFORTS };
export function isOptInKey(key) {
    return isLargeContextKey(key);
}
export function modelKey(provider, id) {
    return `${provider}/${id}`;
}
export const FAMILY_IDS = Object.freeze(['codex', 'grok', 'glm', 'kiro', 'antigravity']);
export function ownedProviderIds(prefix) {
    return FAMILY_IDS.map((id) => `${prefix}-${id}`);
}
function harnessInput(model) {
    if (Array.isArray(model.input) && model.input.length > 0)
        return [...model.input];
    return ['text', 'image'];
}
function toHarnessModel(model) {
    const row = {
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        input: harnessInput(model),
    };
    if (model.reasoningEfforts && typeof model.reasoningEfforts === 'object') {
        row.reasoningEfforts = { ...model.reasoningEfforts };
    }
    else if (model.reasoningEfforts === false) {
        row.reasoningEfforts = false;
    }
    return row;
}
/** 872000 -> "872K", 1000000 -> "1M". */
function formatWindow(tokens) {
    return tokens % 1_000_000 === 0 ? `${tokens / 1_000_000}M` : `${Math.round(tokens / 1000)}K`;
}
export function withPickerVariants(models) {
    const out = [];
    for (const model of models) {
        out.push(model);
        const large = codexLargeContext(model.id);
        if (large !== undefined) {
            out.push({
                ...model,
                id: `${model.id}${CONTEXT_VARIANT_SUFFIX}`,
                name: `${model.name} ${formatWindow(large)}`,
                contextWindow: large,
            });
        }
        if (modelSupportsFastMode(model.id) && !String(model.id).endsWith('-fast')) {
            out.push({ ...model, id: `${model.id}-fast`, name: `${model.name} Fast` });
        }
    }
    return out;
}
export function buildProviders({ prefix, origin, loggedIn }) {
    const providers = {};
    if (loggedIn.codex) {
        providers[`${prefix}-codex`] = {
            displayName: 'OAuth · ChatGPT Codex',
            api: 'openai-responses',
            apiKeyEnv: OAUTH_CREDENTIAL_REF,
            baseURL: `${origin}/codex/v1`,
            models: withPickerVariants(CODEX_MODELS).map(toHarnessModel),
        };
    }
    if (loggedIn.grok) {
        providers[`${prefix}-grok`] = {
            displayName: 'OAuth · Grok',
            api: 'openai-responses',
            apiKeyEnv: OAUTH_CREDENTIAL_REF,
            baseURL: `${origin}/grok/v1`,
            models: withPickerVariants(GROK_MODELS).map(toHarnessModel),
        };
    }
    if (loggedIn.glm) {
        providers[`${prefix}-glm`] = {
            displayName: 'OAuth · GLM',
            api: 'openai',
            apiKeyEnv: OAUTH_CREDENTIAL_REF,
            baseURL: `${origin}/glm/v1`,
            // Localhost is not api.z.ai, so pi-ai would guess OpenAI and drop
            // `reasoning_effort`. Coding Plan reads that field for 5.3 / Flash.
            compat: {
                supportsReasoningEffort: true,
                thinkingFormat: 'openai',
            },
            models: GLM_MODELS.map(toHarnessModel),
        };
    }
    if (loggedIn.kiro) {
        providers[`${prefix}-kiro`] = {
            displayName: 'OAuth · Kiro',
            api: 'openai',
            apiKeyEnv: OAUTH_CREDENTIAL_REF,
            baseURL: `${origin}/kiro/v1`,
            models: KIRO_MODELS.map(toHarnessModel),
        };
    }
    if (loggedIn.antigravity) {
        providers[`${prefix}-antigravity`] = {
            displayName: 'OAuth · Antigravity',
            api: 'openai',
            apiKeyEnv: OAUTH_CREDENTIAL_REF,
            baseURL: `${origin}/antigravity/v1`,
            compat: {
                supportsReasoningEffort: true,
                thinkingFormat: 'openai',
            },
            models: ANTIGRAVITY_MODELS.map(toHarnessModel),
        };
    }
    return providers;
}
export function describeProviders(providers) {
    return Object.entries(providers).map(([provider, value]) => ({
        provider,
        api: value.api,
        models: value.models.map((model) => ({ ...model, key: modelKey(provider, model.id) })),
    }));
}
export function catalogProviders({ prefix, origin }) {
    return buildProviders({ prefix, origin, loggedIn: { codex: true, grok: true, glm: true, kiro: true, antigravity: true } });
}
export function catalogKeys(providers) {
    return Object.entries(providers).flatMap(([provider, value]) => (value.models ?? []).map((model) => modelKey(provider, model.id)));
}
export function familyOfProvider(provider) {
    if (String(provider).endsWith('-codex'))
        return 'codex';
    if (String(provider).endsWith('-grok'))
        return 'grok';
    if (String(provider).endsWith('-glm'))
        return 'glm';
    if (String(provider).endsWith('-kiro'))
        return 'kiro';
    if (String(provider).endsWith('-antigravity'))
        return 'antigravity';
    return String(provider);
}
export function familyOfKey(key) {
    const slash = String(key).indexOf('/');
    return familyOfProvider(slash === -1 ? key : key.slice(0, slash));
}
export function familyCatalogKeys(catalog, family) {
    return catalogKeys(catalog).filter((key) => familyOfKey(key) === family);
}
export function describeCatalog(providers, { enabledKeys, loggedIn } = {}) {
    const enabled = enabledKeys === undefined ? null : new Set(enabledKeys);
    return Object.entries(providers).map(([provider, value]) => {
        const family = familyOfProvider(provider);
        return {
            provider,
            displayName: value.displayName,
            family,
            loggedIn: loggedIn ? Boolean(loggedIn[family]) : true,
            models: value.models.map((model) => {
                const key = modelKey(provider, model.id);
                return {
                    id: model.id,
                    name: model.name,
                    key,
                    enabled: enabled === null ? !isOptInKey(key) : enabled.has(key),
                    fast: String(model.id).endsWith('-fast'),
                    large: isLargeContextKey(key),
                    input: Array.isArray(model.input) ? [...model.input] : ['text', 'image'],
                };
            }),
        };
    });
}
function assertKeyList(keys, label) {
    if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
        throw new Error(`${label} must be an array of model keys`);
    }
}
/**
 * Persisted enable/disable set for the Settings picker.
 * Default is all-on except `-900k` (opt-in; it burns quota).
 * New non-opt-in catalog ids stay on. Stored as
 * `{ "disabled": ["oauth-codex/gpt-5.4-mini"], "enabled": ["oauth-codex/gpt-5.4-900k"] }`.
 */
export class ModelSwitch {
    constructor({ path } = {}) {
        this.path = path;
        this.disabled = new Set();
        this.enabled = new Set();
        this.ready = path ? this.load() : Promise.resolve();
    }
    async load() {
        const text = await readPrivateText(this.path, 'oauth-subs model settings', { allowBroadMode: true });
        if (text === undefined)
            return;
        try {
            const raw = JSON.parse(text);
            const disabled = Array.isArray(raw?.disabled) ? raw.disabled : [];
            const enabled = Array.isArray(raw?.enabled) ? raw.enabled : [];
            this.disabled = new Set(disabled.filter((key) => typeof key === 'string' && key.includes('/')));
            this.enabled = new Set(enabled.filter((key) => typeof key === 'string' && key.includes('/')));
        }
        catch (error) {
            if (error && error.code !== 'ENOENT') {
                // Corrupt file: keep all-on rather than crash the proxy.
            }
        }
    }
    async save() {
        if (!this.path)
            return;
        await writePrivateText(this.path, `${JSON.stringify({
            disabled: [...this.disabled].sort(),
            enabled: [...this.enabled].sort(),
        })}\n`);
    }
    isEnabled(key) {
        if (this.disabled.has(key))
            return false;
        if (isOptInKey(key))
            return this.enabled.has(key);
        return true;
    }
    enabledKeys(catalog) {
        return catalogKeys(catalog).filter((key) => this.isEnabled(key));
    }
    selectedForSync(catalog) {
        const known = catalogKeys(catalog);
        const selected = known.filter((key) => this.isEnabled(key));
        if (selected.length === known.length)
            return undefined;
        return selected;
    }
    status(catalog) {
        const known = catalogKeys(catalog);
        const selected = known.filter((key) => this.isEnabled(key));
        const disabled = known.filter((key) => !this.isEnabled(key));
        return {
            selected,
            disabled,
            allOn: disabled.length === 0,
        };
    }
    async setEnabled(keys, catalog) {
        assertKeyList(keys, 'enabled models');
        const known = catalogKeys(catalog);
        const enabled = new Set(keys.filter((key) => known.includes(key)));
        this.disabled = new Set(known.filter((key) => !enabled.has(key)));
        this.enabled = new Set(known.filter((key) => enabled.has(key) && isOptInKey(key)));
        await this.save();
        return this.status(catalog);
    }
    async toggle(key, on, catalog) {
        if (typeof key !== 'string' || !key.includes('/')) {
            throw new Error('model key is required');
        }
        const known = new Set(catalogKeys(catalog));
        if (!known.has(key))
            throw new Error(`unknown model ${key}`);
        if (on) {
            this.disabled.delete(key);
            if (isOptInKey(key))
                this.enabled.add(key);
        }
        else {
            this.enabled.delete(key);
            this.disabled.add(key);
        }
        await this.save();
        return this.status(catalog);
    }
    async setFamily(family, on, catalog) {
        if (!FAMILY_IDS.includes(family))
            throw new Error('family must be codex, grok, glm, kiro, or antigravity');
        // Only current catalog ids. Retired leftovers (glm-4.7, …) stay in
        // `disabled` and are not resurrected.
        for (const key of familyCatalogKeys(catalog, family)) {
            if (on) {
                this.disabled.delete(key);
                if (isOptInKey(key))
                    this.enabled.add(key);
            }
            else {
                this.enabled.delete(key);
                this.disabled.add(key);
            }
        }
        await this.save();
        return this.status(catalog);
    }
    /**
     * Leftover 全关: every *current* catalog key for a signed-in family is
     * off (often after a catalog shrink left stale ids in `disabled`).
     * Enable the current keys so login/sync can write the DSH route.
     * Does not resurrect retired ids or opt-in `-900k` rows.
     */
    async recoverEmptyLoggedInFamilies(catalog, loggedIn) {
        let changed = false;
        for (const family of FAMILY_IDS) {
            if (!loggedIn?.[family])
                continue;
            const keys = familyCatalogKeys(catalog, family);
            if (keys.length === 0 || keys.some((key) => this.isEnabled(key)))
                continue;
            for (const key of keys)
                this.disabled.delete(key);
            changed = true;
        }
        if (changed)
            await this.save();
        return changed;
    }
    async setAll(on, catalog) {
        const known = catalogKeys(catalog);
        if (on) {
            this.disabled = new Set();
            this.enabled = new Set(known.filter((key) => isOptInKey(key)));
        }
        else {
            this.disabled = new Set(known);
            this.enabled = new Set();
        }
        await this.save();
        return this.status(catalog);
    }
}
export function filterProviders(providers, selected) {
    if (selected === undefined)
        return providers;
    if (!Array.isArray(selected) || selected.some((key) => typeof key !== 'string')) {
        throw new Error('enabled models must be an array of model keys');
    }
    const selectedKeys = new Set(selected);
    return Object.fromEntries(Object.entries(providers).flatMap(([provider, value]) => {
        const models = value.models.filter((model) => selectedKeys.has(modelKey(provider, model.id)));
        return models.length ? [[provider, { ...value, models }]] : [];
    }));
}
export async function syncHarnessModels({ settings, prefix, origin, loggedIn, selected }) {
    const routePrefix = String(prefix ?? '').trim();
    if (!routePrefix)
        throw new Error('Harness route prefix cannot be empty');
    const providers = filterProviders(buildProviders({ prefix: routePrefix, origin, loggedIn }), selected);
    const owned = ownedProviderIds(routePrefix);
    await settings.mutate('llm-pi-ai', [
        ...owned.map((provider) => ({ op: 'unset', path: ['providers', provider] })),
        ...Object.entries(providers).map(([provider, value]) => ({
            op: 'set', path: ['providers', provider], value,
        })),
    ]);
    return {
        routes: Object.entries(providers).map(([provider, value]) => ({
            provider,
            api: value.api,
            models: value.models.map((model) => model.id),
        })),
    };
}
