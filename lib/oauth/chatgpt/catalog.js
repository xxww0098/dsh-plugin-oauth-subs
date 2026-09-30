/**
 * Live picker for Sign in with ChatGPT: `GET api.openai.com/v1/models` with
 * the account's access token (siwc models-and-inference). Keep
 * `visibility: "list"` rows; `slug` is the wire id and
 * `display_name` the label. CHATGPT_MODELS is the offline floor only.
 *
 * Numbers come from the live row when it carries them, else from the static
 * row with the same slug. A live row with no window from either source is
 * left out rather than given an invented one.
 */
import { createHash } from 'node:crypto';
import { CHATGPT_MODELS, CHATGPT_MODELS_URL, chatgptModel, chatgptUpstreamHeaders } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
export const CHATGPT_CATALOG_TTL_MS = 5 * 60_000;
/** `minimal` and `ultra` are not API efforts on this model line (codex/README 模型). */
const EFFORT_LEVELS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const cached = { tokenHash: '', models: undefined, expiresAt: 0 };
export function resetChatgptCatalogCache() {
    cached.tokenHash = '';
    cached.models = undefined;
    cached.expiresAt = 0;
}
export function chatgptCatalogModels() {
    return cached.models?.length ? [...cached.models] : [...CHATGPT_MODELS];
}
function positive(value) {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}
function effortsOf(row) {
    const levels = Array.isArray(row?.supported_reasoning_levels)
        ? row.supported_reasoning_levels.map((level) => (typeof level === 'string' ? level : level?.effort))
        : undefined;
    if (!levels)
        return undefined;
    const efforts = { off: null };
    for (const level of EFFORT_LEVELS)
        if (levels.includes(level))
            efforts[level] = level;
    return Object.keys(efforts).length > 1 ? efforts : undefined;
}
function inputOf(row) {
    const modalities = row?.input_modalities;
    if (!Array.isArray(modalities))
        return undefined;
    const input = ['text', 'image'].filter((kind) => modalities.includes(kind));
    return input.includes('text') ? input : undefined;
}
export function toChatgptPickerModels(payload) {
    const rows = Array.isArray(payload?.models) ? payload.models : [];
    const seen = new Set();
    const models = [];
    for (const row of rows) {
        if (row?.visibility !== undefined && row.visibility !== 'list')
            continue;
        const id = typeof row?.slug === 'string' && row.slug.trim() ? row.slug.trim() : '';
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        const known = chatgptModel(id);
        const contextWindow = known?.contextWindow ?? positive(row.context_window);
        if (!contextWindow)
            continue;
        const input = inputOf(row) ?? (known?.input ? [...known.input] : undefined);
        const reasoningEfforts = effortsOf(row) ?? known?.reasoningEfforts;
        const maxTokens = known?.maxTokens ?? positive(row.max_output_tokens);
        models.push({
            id,
            name: typeof row.display_name === 'string' && row.display_name.trim() ? row.display_name.trim() : (known?.name ?? id),
            contextWindow,
            ...(maxTokens ? { maxTokens } : {}),
            ...(input ? { input } : {}),
            ...(reasoningEfforts ? { reasoningEfforts: { ...reasoningEfforts } } : {}),
            // Fast needs a measured row; a new slug gets no -fast twin until one is.
            ...(known?.fastTier === true ? { fastTier: true } : {}),
        });
    }
    return models;
}
export async function refreshChatgptCatalog(session, options = {}) {
    const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : '';
    if (!token)
        return chatgptCatalogModels();
    const tokenHash = createHash('sha256').update(token).digest('hex').slice(0, 16);
    if (cached.tokenHash === tokenHash && cached.models?.length && Date.now() < cached.expiresAt) {
        return [...cached.models];
    }
    try {
        const fetchFn = options.fetchFn ?? outboundFetch;
        const response = await fetchFn(CHATGPT_MODELS_URL, {
            headers: chatgptUpstreamHeaders(session),
            signal: options.signal,
        });
        if (response.ok) {
            const listed = toChatgptPickerModels(await response.json());
            // /v1/models under-lists: 2026-09-30 it omitted gpt-6.1-sol / gpt-6-sol /
            // gpt-6-luna, which all complete on this route. Keep static rows after the live ones.
            // Order: live-only ids (new releases) first, then the static catalog's
            // newest-first order — the server list is not sorted by release.
            const byId = new Map(listed.map((model) => [model.id, model]));
            const known = new Set(CHATGPT_MODELS.map((model) => model.id));
            const parsed = listed.length > 0
                ? [
                    ...listed.filter((model) => !known.has(model.id)),
                    ...CHATGPT_MODELS.map((model) => byId.get(model.id) ?? model),
                ]
                : listed;
            if (parsed.length > 0) {
                cached.tokenHash = tokenHash;
                cached.models = parsed;
                cached.expiresAt = Date.now() + (options.ttlMs ?? CHATGPT_CATALOG_TTL_MS);
                return [...parsed];
            }
        }
    }
    catch {
        // Discovery must not block chat or login.
    }
    return chatgptCatalogModels();
}
