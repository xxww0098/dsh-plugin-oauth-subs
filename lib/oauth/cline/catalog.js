/**
 * Live Cline picker.
 *
 * Membership: `GET {apiBase}/ai/cline/recommended-models` buckets
 * `recommended` + `free` + `clinePass` (the groups
 * `@magpie-community/opencode-cline-auth` keeps, and the ones the CLI
 * surfaces — `clinePass` on the separate `cline-pass` provider).
 *
 * Facts: `GET {apiBase}/ai/cline/models`, the cloud catalog
 * `loadCloudModels` reads. Match by exact id. `cline-free/` and
 * `cline-pass/` are gateway aliases absent from that catalog, so they
 * take a unique last-segment hit and nothing else — an ambiguous slug
 * stays unmatched rather than borrowing another vendor's window.
 *
 * The cloud catalog is the full OpenRouter-shaped list (~450 rows). It is
 * a fact source, not the picker: writing every row default-on into
 * settings.yaml is the noise this hop already refused. `clineCloud` stays
 * out (CLI `includeClineCloudModels` defaults off; magpie skips it too).
 */
import { CLINE_DEFAULT_CONTEXT, CLINE_DEFAULT_MAX_TOKENS, CLINE_INPUT, CLINE_MODELS, CLINE_MODELS_URL, CLINE_REASONING, CLINE_RECOMMENDED_MODELS_URL, clineIdentityHeaders, } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { createLiveCatalog } from '../../catalog/live-refresh.js';
export const CLINE_CATALOG_TTL_MS = 10 * 60_000;
/** Gateway aliases the cloud catalog lists under the vendor prefix, not this one. */
const GATEWAY_PREFIXES = ['cline-free/', 'cline-pass/'];
const MODEL_ID = /^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/i;
const BUCKETS = [
    ['recommended', ''],
    ['free', 'free'],
    ['clinePass', 'pass'],
];
const live = createLiveCatalog({ fallback: () => [...CLINE_MODELS] });
export function resetClineCatalogCache() {
    live.reset();
}
export function clineCatalogModels() {
    return live.models();
}
function slugOf(id) {
    const text = typeof id === 'string' ? id.trim() : '';
    if (!text)
        return '';
    return text.split('/').at(-1) ?? text;
}
function isGatewayId(id) {
    return GATEWAY_PREFIXES.some((prefix) => id.startsWith(prefix));
}
function asPositiveInt(value) {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (!Number.isFinite(n) || n <= 0)
        return undefined;
    return Math.trunc(n);
}
function factTable(models) {
    const byId = new Map();
    const bySlug = new Map();
    for (const model of models ?? []) {
        if (!model?.id)
            continue;
        byId.set(model.id, model);
        const slug = slugOf(model.id);
        if (slug && !bySlug.has(slug))
            bySlug.set(slug, model);
    }
    return { byId, bySlug };
}
/**
 * OpenRouter-shaped `/ai/cline/models` rows. `context` on the live payload
 * is 0; the window is `context_length`. A repeated slug is ambiguous and
 * must not be reused for a gateway alias.
 */
export function clineCloudFacts(payload) {
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    const byId = new Map();
    const bySlug = new Map();
    for (const entry of rows) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            continue;
        const id = typeof entry.id === 'string' ? entry.id.trim() : '';
        if (!MODEL_ID.test(id) || byId.has(id))
            continue;
        const modalities = entry.architecture?.input_modalities;
        const input = Array.isArray(modalities)
            ? ['text', 'image'].filter((kind) => modalities.includes(kind))
            : undefined;
        const params = Array.isArray(entry.supported_parameters) ? entry.supported_parameters : undefined;
        const fact = {
            id,
            name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : undefined,
            contextWindow: asPositiveInt(entry.context_length)
                ?? asPositiveInt(entry.top_provider?.context_length),
            maxTokens: asPositiveInt(entry.top_provider?.max_completion_tokens),
            ...(input && input.length > 0 ? { input } : {}),
            reasoning: params ? params.includes('reasoning_effort') : undefined,
        };
        byId.set(id, fact);
        const slug = slugOf(id);
        if (!slug)
            continue;
        if (!bySlug.has(slug))
            bySlug.set(slug, fact);
        else if (bySlug.get(slug)?.id !== id)
            bySlug.set(slug, null);
    }
    return { byId, bySlug };
}
function cloudFact(id, cloud) {
    if (!cloud)
        return undefined;
    const exact = cloud.byId.get(id);
    if (exact)
        return exact;
    if (!isGatewayId(id))
        return undefined;
    const hit = cloud.bySlug.get(slugOf(id));
    return hit || undefined;
}
function seedFact(id, facts) {
    const exact = facts.byId.get(id);
    if (exact)
        return exact;
    if (!isGatewayId(id))
        return undefined;
    return facts.bySlug.get(slugOf(id));
}
function realName(value, id) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name === id || name === slugOf(id))
        return '';
    const colon = name.indexOf(': ');
    const stripped = colon > 0 && colon < 40 ? name.slice(colon + 2).trim() : name;
    return stripped && stripped !== id ? stripped : '';
}
function prettify(slug) {
    return slug
        .split(/[_-]+/)
        .filter(Boolean)
        .map((part) => part.replace(/^[a-z]/, (letter) => letter.toUpperCase()))
        .join(' ');
}
function withGate(name, gate) {
    const base = name.replace(/ \((?:free|ClinePass)\)$/i, '');
    if (gate === 'free')
        return `${base} (free)`;
    if (gate === 'pass')
        return `${base} (ClinePass)`;
    return base;
}
function entryId(entry) {
    if (typeof entry === 'string')
        return entry.trim();
    if (entry && typeof entry === 'object' && typeof entry.id === 'string')
        return entry.id.trim();
    return '';
}
function feedOf(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return {};
    const data = payload.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (BUCKETS.some(([bucket]) => Array.isArray(data[bucket])) || Array.isArray(data.clineCloud))
            return data;
    }
    return payload;
}
function pickerRow(entry, { facts, cloud, gate }) {
    const id = entryId(entry);
    if (!MODEL_ID.test(id))
        return undefined;
    const fact = seedFact(id, facts);
    const fromCloud = cloudFact(id, cloud);
    const feedName = entry && typeof entry === 'object' ? entry.name : undefined;
    const base = realName(fact?.name, id)
        || realName(fromCloud?.name, id)
        || realName(feedName, id)
        || prettify(slugOf(id) || id);
    const ceiling = asPositiveInt(fact?.maxContextWindow);
    const input = fromCloud?.input?.length
        ? fromCloud.input
        : Array.isArray(fact?.input) && fact.input.length > 0 ? [...fact.input] : [...CLINE_INPUT];
    const reasoning = fromCloud?.reasoning === true
        ? { ...CLINE_REASONING }
        : fromCloud?.reasoning === false
            ? false
            : fact?.reasoningEfforts === false
                ? false
                : fact?.reasoningEfforts && typeof fact.reasoningEfforts === 'object'
                    ? { ...fact.reasoningEfforts }
                    : { ...CLINE_REASONING };
    return {
        id,
        name: withGate(base, gate),
        ...(ceiling !== undefined ? { maxContextWindow: ceiling } : {}),
        contextWindow: fromCloud?.contextWindow ?? asPositiveInt(fact?.contextWindow) ?? CLINE_DEFAULT_CONTEXT,
        maxTokens: fromCloud?.maxTokens ?? asPositiveInt(fact?.maxTokens) ?? CLINE_DEFAULT_MAX_TOKENS,
        input,
        reasoningEfforts: reasoning,
    };
}
/**
 * Recommended feed narrowed to `recommended` + `free` + `clinePass`.
 * A later bucket with a stronger gate (free over recommended, free over
 * ClinePass) updates the label; the first row keeps its window.
 * `clineCloud` is ignored.
 */
export function toClinePickerModels(payload, options = {}) {
    const models = options.models ?? CLINE_MODELS;
    const cloud = options.cloud;
    const facts = factTable(models);
    const cloudFacts = cloud && typeof cloud === 'object' && cloud.byId instanceof Map
        ? cloud
        : clineCloudFacts(cloud);
    const feed = feedOf(payload);
    const byId = new Map();
    const rows = [];
    for (const [bucket, gate] of BUCKETS) {
        const list = Array.isArray(feed?.[bucket]) ? feed[bucket] : [];
        for (const entry of list) {
            const row = pickerRow(entry, { facts, cloud: cloudFacts, gate });
            if (!row)
                continue;
            const existing = byId.get(row.id);
            if (existing) {
                if (gate === 'free' && existing.gate !== 'free') {
                    existing.row.name = withGate(existing.row.name, 'free');
                    existing.gate = 'free';
                }
                continue;
            }
            byId.set(row.id, { row, gate });
            rows.push(row);
        }
    }
    return rows;
}
async function readCatalogJson(fetchFn, url, headers, signal) {
    try {
        const response = await fetchFn(url, { headers, signal });
        if (!response?.ok)
            return undefined;
        return await response.json();
    }
    catch {
        return undefined;
    }
}
export async function refreshClineCatalog(_session, options = {}) {
    return live.refresh({
        credential: 'public',
        ttlMs: options.ttlMs ?? CLINE_CATALOG_TTL_MS,
        now: options.now,
        fetch: async () => {
            const fetchFn = options.fetchFn ?? outboundFetch;
            const headers = clineIdentityHeaders();
            const signal = options.signal;
            const [feed, cloud] = await Promise.all([
                readCatalogJson(fetchFn, CLINE_RECOMMENDED_MODELS_URL, headers, signal),
                readCatalogJson(fetchFn, CLINE_MODELS_URL, headers, signal),
            ]);
            if (!feed)
                return null;
            const parsed = toClinePickerModels(feed, { models: options.models ?? CLINE_MODELS, cloud });
            return parsed.length > 0 ? parsed : null;
        },
    });
}
