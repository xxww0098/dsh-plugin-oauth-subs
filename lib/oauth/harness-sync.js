/**
 * Write this plugin's routes into the host: the atomic llm-pi-ai settings
 * mutate (only owned provider ids are replaced), the OpenCode Go route that
 * lives on the host's own key env, and the compaction headroom block in the
 * profile's cordis.patch.yml.
 */
import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { OPENCODE_GO_BUILTIN_ROUTE_ID, OPENCODE_GO_ROUTES, OPENCODE_GO_SESSION_HEADER, OPENCODE_GO_SESSION_ID, } from '../apikey/opencode-go/models.js';
import { assertDshServiceableProvider, buildProviders, familyOfProvider, harnessModelAlias, modelKey, OPENCODE_GO_API_KEY_ENV, ownedProviderIds, withDefaultEffort, } from './models.js';
import { familyCatalogInputs } from './families.js';
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
/** `undefined` when the host cannot describe llm-pi-ai; `{}` when its providers are empty. */
export async function peekPiAiProviders(settings) {
    if (settings == null || typeof settings.describe !== 'function')
        return undefined;
    try {
        const raw = (await settings.describe()).find((row) => row.ns === 'llm-pi-ai')?.value;
        if (raw == null || typeof raw !== 'object')
            return undefined;
        const providers = raw.providers;
        if (providers == null || typeof providers !== 'object' || Array.isArray(providers))
            return {};
        return providers;
    }
    catch {
        return undefined;
    }
}
function opencodeGoRouteValue(route, models) {
    return {
        displayName: route.displayName,
        apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
        api: route.api,
        baseURL: route.baseURL,
        headers: { ...route.headers },
        models,
    };
}
/** A route this plugin owns: same key env, protocol, origin, and only catalog ids. */
function isOwnedOpencodeGoRoute(route, existing) {
    if (existing == null || typeof existing !== 'object')
        return false;
    if (existing.apiKeyEnv !== OPENCODE_GO_API_KEY_ENV)
        return false;
    if (existing.api !== route.api || existing.baseURL !== route.baseURL)
        return false;
    const known = new Set(route.models.map((model) => model.id));
    const models = existing.models;
    if (!Array.isArray(models) || models.length === 0)
        return false;
    return models.every((model) => known.has(model?.id));
}
/**
 * The catalog-enabling profile older plugin versions wrote: apiKeyEnv plus
 * exactly the family session header (no `api`, no `models`). Only that shape
 * is recognized. A bare `{ apiKeyEnv }` is ambiguous — DSH's own Models page
 * writes exactly that when a user adds a key to a catalog route — so it is
 * treated as the user's profile and left alone.
 */
function isLegacyOpencodeGoBuiltin(existing) {
    if (existing == null || typeof existing !== 'object')
        return false;
    if (existing.apiKeyEnv !== OPENCODE_GO_API_KEY_ENV)
        return false;
    if (Object.keys(existing).length !== 2)
        return false;
    if (existing.headers == null || typeof existing.headers !== 'object')
        return false;
    const headerKeys = Object.keys(existing.headers);
    return headerKeys.length === 1 && existing.headers[OPENCODE_GO_SESSION_HEADER] === OPENCODE_GO_SESSION_ID;
}
function sameOpencodeGoHeaders(existing, route) {
    const headers = existing?.headers;
    if (headers == null || typeof headers !== 'object')
        return false;
    const keys = Object.keys(headers);
    return keys.length === 1 && headers[OPENCODE_GO_SESSION_HEADER] === route.headers?.[OPENCODE_GO_SESSION_HEADER];
}
function sameOpencodeGoRoute(route, existing, value) {
    const models = value.models;
    const efforts = (row) => JSON.stringify(Object.entries(row?.reasoningEfforts ?? {}).sort());
    if (existing.displayName !== route.displayName)
        return false;
    if (existing.api !== route.api || existing.baseURL !== route.baseURL)
        return false;
    if (existing.apiKeyEnv !== OPENCODE_GO_API_KEY_ENV)
        return false;
    if (!sameOpencodeGoHeaders(existing, route))
        return false;
    if (existing.reasoning !== value.reasoning)
        return false;
    return Array.isArray(existing.models)
        && existing.models.length === models.length
        && existing.models.every((model, index) => model?.id === models[index]?.id && model?.name === models[index]?.name
            && efforts(model) === efforts(models[index]));
}
/**
 * Ensure OpenCode Go is configured while only supplying what the installed
 * catalog lacks.
 *
 * DSH's built-in `opencode-go` catalog provider carries the other 27 official
 * models, but llm-pi-ai registers a catalog route only when a profile names
 * it — so a plugin-written `providers.opencode-go` profile is what silently
 * put all 27 models into DSH's model list. The plugin no longer creates or
 * refreshes it: the user enables that route from DSH's own Models page if
 * they want it. Only the exact profile older plugin versions auto-wrote
 * (apiKeyEnv + session header, no api/models) is taken back so an upgrade
 * stops showing it; every other shape is a user profile and is untouched.
 *
 * The plugin writes its own complete catalog on one route per wire protocol
 * (`opencode-go-flash` completions + `opencode-go-responses`), so the picker
 * shows every official Go model even when DSH's built-in route is not enabled.
 * Each route follows the picker (`selected` undefined = all) and carries the
 * required `x-opencode-session` header. Without `OPENCODE_API_KEY` nothing is
 * served, so DSH's model list stays clean.
 */
export async function ensureOpencodeGoRoute(settings, { selected, apiKeySet = true, contexts, efforts, apply = true } = {}) {
    if (settings == null || typeof settings.mutate !== 'function')
        return { status: 'unavailable' };
    const providers = await peekPiAiProviders(settings);
    if (providers === undefined)
        return { status: 'unreadable' };
    const locked = apiKeySet === false;
    const selection = selected === undefined ? null : new Set(selected);
    const overrides = contexts ?? {};
    const mutations = [];
    const routes = [];
    // Built-in catalog route: never written or refreshed here. Only the exact
    // profile the plugin used to auto-create is removed; a user's own
    // providers.opencode-go (bare apiKeyEnv from DSH's Models page, api/models,
    // extra fields) stays untouched.
    if (isLegacyOpencodeGoBuiltin(providers[OPENCODE_GO_BUILTIN_ROUTE_ID])) {
        mutations.push({ op: 'unset', path: ['providers', OPENCODE_GO_BUILTIN_ROUTE_ID] });
        routes.push(OPENCODE_GO_BUILTIN_ROUTE_ID);
    }
    // One plugin-owned route per OpenCode Go wire protocol; each follows the
    // picker selection and carries the required x-opencode-session header.
    for (const route of OPENCODE_GO_ROUTES) {
        const models = locked
            ? []
            : (selection === null
                ? route.models
                : route.models.filter((model) => selection.has(`${route.id}/${model.id}`)))
                .map((model) => {
                const contextWindow = overrides[`${route.id}/${model.id}`];
                return {
                    ...model,
                    ...(contextWindow === undefined ? {} : { contextWindow }),
                    name: harnessModelAlias(route.id, model.id),
                };
            });
        const value = withDefaultEffort(opencodeGoRouteValue(route, models), efforts?.[route.id]);
        const existing = providers[route.id];
        if (existing === undefined) {
            if (models.length > 0) {
                mutations.push({ op: 'set', path: ['providers', route.id], value });
                routes.push(route.id);
            }
        }
        else if (isOwnedOpencodeGoRoute(route, existing)) {
            if (models.length === 0) {
                mutations.push({ op: 'unset', path: ['providers', route.id] });
                routes.push(route.id);
            }
            else if (!sameOpencodeGoRoute(route, existing, value)) {
                mutations.push({ op: 'set', path: ['providers', route.id], value });
                routes.push(route.id);
            }
        }
    }
    if (mutations.length === 0)
        return { status: 'present' };
    // `apply: false` hands the writes back so sync lands them in the same
    // llm-pi-ai mutate as the family routes: one host reconcile, not two.
    if (!apply)
        return { status: 'pending', routes, mutations };
    try {
        await settings.mutate('llm-pi-ai', mutations);
    }
    catch (error) {
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
    return { status: 'written', routes };
}
async function assertPersistedProviders(settings, expected) {
    const providers = await peekPiAiProviders(settings);
    if (providers === undefined)
        return;
    for (const [id, value] of Object.entries(expected)) {
        const row = providers[id];
        if (!row || !Array.isArray(row.models) || row.models.length === 0) {
            throw new Error(`llm-pi-ai did not persist providers.${id}`);
        }
        // A schema that drops the field silently puts the route back on shared ids.
        if (row.cacheRetention !== value.cacheRetention) {
            throw new Error(`llm-pi-ai did not persist providers.${id}.cacheRetention`);
        }
    }
}
/**
 * Family model lists come from the registry (familyCatalogInputs), not a
 * per-call parameter bag: the controller passes only `glmModels`, the one
 * session-sequenced seat it resolves itself (`#glmModels`); every other
 * family's rows are read here through its own registry row, so no family can
 * be dropped from one caller's bag again. Without `glmModels`, models.ts
 * falls back to its static GLM_MODELS floor.
 */
export async function syncHarnessModels({ settings, patchPath, prefix, origin, loggedIn, selected, glmModels, contexts, efforts = {}, extraMutations = [] }) {
    const routePrefix = String(prefix ?? '').trim();
    if (!routePrefix)
        throw new Error('Harness route prefix cannot be empty');
    const providers = Object.fromEntries(Object.entries(filterProviders(buildProviders({
        prefix: routePrefix, origin, loggedIn, contexts, ...familyCatalogInputs({ glmModels }),
    }), selected)).map(([id, value]) => [id, withDefaultEffort(value, efforts[familyOfProvider(id)])]));
    for (const [id, value] of Object.entries(providers)) {
        assertDshServiceableProvider(id, value);
    }
    const owned = ownedProviderIds(routePrefix);
    try {
        await settings.mutate('llm-pi-ai', [
            ...owned.map((provider) => ({ op: 'unset', path: ['providers', provider] })),
            ...Object.entries(providers).map(([provider, value]) => ({
                op: 'set',
                path: ['providers', provider],
                value: {
                    ...value,
                    models: value.models.map((model) => ({ ...model, name: harnessModelAlias(provider, model.id) })),
                },
            })),
            ...extraMutations,
        ]);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`llm-pi-ai mutate failed: ${detail}`);
    }
    await assertPersistedProviders(settings, providers);
    const compaction = await syncCompactionPolicies(patchPath, providers);
    return {
        routes: Object.entries(providers).map(([provider, value]) => ({
            provider,
            api: value.api,
            models: value.models.map((model) => model.id),
        })),
        compaction,
    };
}
/**
 * dsh-compaction-basic also reserves a fixed 65536-token headroom before the
 * pressure threshold (`window - reserved maxTokens - headroom`), so on small
 * windows the default alone can starve auto-compaction even with the route
 * maxTokens capped. Each synced model under ~640K gets an exact-target policy
 * scaling headroom to 10% of its window.
 *
 * The channel is the profile's cordis.patch.yml, not ctx.settings:
 * compaction-basic's Config declares no `.volatile()` fields, so
 * settings.mutate refuses it, and its live entry sits inside a cordis:group
 * which configEditor.entries() cannot address. Patch entries match by id
 * across nested groups, so an `id: compaction-basic` override in the user
 * patch layer reaches the live entry. We own a marker-delimited block at the
 * end of the file and rewrite only that region on every sync; a
 * hand-maintained compaction-basic entry outside our markers wins and we
 * stay out of it. The entry config is replaced wholesale, which is safe
 * because the grouped entry carries no config of its own.
 */
const COMPACTION_ENTRY_ID = 'compaction-basic';
const COMPACTION_ENTRY_NAME = '@deepseek-ai/dsh-compaction-basic';
const COMPACTION_DEFAULT_HEADROOM = 65_536;
const COMPACTION_HEADROOM_RATIO = 0.1;
const COMPACTION_BLOCK_BEGIN = '# >>> dsh-plugin-oauth-subs: compaction policies (managed — regenerated on sync)';
const COMPACTION_BLOCK_END = '# <<< dsh-plugin-oauth-subs: compaction policies end';
function compactionHeadroomOf(contextWindow) {
    const window = Number(contextWindow);
    if (!Number.isInteger(window) || window <= 0)
        return undefined;
    const headroom = Math.floor(window * COMPACTION_HEADROOM_RATIO);
    return headroom < COMPACTION_DEFAULT_HEADROOM ? headroom : undefined;
}
function compactionBlock(policies) {
    if (policies.length === 0)
        return '';
    const rows = policies
        .map((policy) => `      - { provider: ${JSON.stringify(policy.provider)}, model: ${JSON.stringify(policy.model)}, headroomTokens: ${policy.headroomTokens} }`)
        .join('\n');
    return `${COMPACTION_BLOCK_BEGIN}\n- id: ${COMPACTION_ENTRY_ID}\n  name: ${JSON.stringify(COMPACTION_ENTRY_NAME)}\n  config:\n    modelPolicies:\n${rows}\n${COMPACTION_BLOCK_END}\n`;
}
/**
 * Drop our entry. DSH appends a new list entry after the last one, before our
 * closing comment, so it lands inside the markers (live: the user's
 * `agent-default-model`); keep it, above the block, or this sync deletes it.
 */
function stripCompactionBlock(text) {
    const begin = text.indexOf(COMPACTION_BLOCK_BEGIN);
    if (begin < 0)
        return text;
    const end = text.indexOf(COMPACTION_BLOCK_END, begin);
    if (end < 0)
        return text;
    const foreign = text.slice(begin + COMPACTION_BLOCK_BEGIN.length, end)
        .split(/^(?=- )/m)
        .filter((entry) => entry.startsWith('- ') && !entry.startsWith(`- id: ${COMPACTION_ENTRY_ID}\n`))
        .map((entry) => `${entry.replace(/\s+$/, '')}\n\n`)
        .join('');
    return text.slice(0, begin) + foreign + text.slice(end + COMPACTION_BLOCK_END.length).replace(/^\n+/, '');
}
/**
 * Distinct tmp name per write: overlapping sync() calls in this process
 * must not share one (the second rename would hit ENOENT).
 */
export function compactionTmpPath(patchPath) {
    return `${patchPath}.tmp-${process.pid}-${randomUUID()}`;
}
async function syncCompactionPolicies(patchPath, providers) {
    if (typeof patchPath !== 'string' || !patchPath)
        return { status: 'unavailable' };
    const policies = [];
    for (const [provider, value] of Object.entries(providers)) {
        for (const model of value?.models ?? []) {
            const headroomTokens = compactionHeadroomOf(model.contextWindow);
            if (headroomTokens !== undefined) {
                policies.push({ provider, model: model.id, headroomTokens });
            }
        }
    }
    policies.sort((a, b) => `${a.provider}${a.model}`.localeCompare(`${b.provider}${b.model}`));
    let text = '';
    try {
        text = await readFile(patchPath, 'utf8');
    }
    catch (error) {
        if (error?.code !== 'ENOENT')
            return { status: 'unreadable', error: error instanceof Error ? error.message : String(error) };
    }
    const stripped = stripCompactionBlock(text).replace(/\s+$/, '');
    // A compaction-basic override we did not write takes precedence — patching
    // replaces the entry's whole config, so writing ours would clobber it.
    if (/^[ \t]*-[ \t]+id:[ \t]*['"]?compaction-basic['"]?[ \t]*$/m.test(stripped)) {
        return { status: 'manual-override' };
    }
    const next = policies.length === 0 ? stripped + '\n'
        : stripped + (stripped ? '\n\n' : '') + compactionBlock(policies);
    if (next === text)
        return { status: 'unchanged' };
    const tmp = compactionTmpPath(patchPath);
    try {
        await writeFile(tmp, next, 'utf8');
        await rename(tmp, patchPath);
    }
    catch (error) {
        await rm(tmp, { force: true }).catch(() => undefined);
        return { status: 'error', error: error instanceof Error ? error.message : String(error) };
    }
    return { status: 'written', policies: policies.length };
}
