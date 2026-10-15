/**
 * Live Ollama Cloud picker. GET https://ollama.com/api/tags after login,
 * then POST /api/show for `model_info.*.context_length` and `capabilities`.
 * OLLAMA_MODELS is the offline fallback only. Retired Cloud rows stay out.
 */
import { createHash } from 'node:crypto';
import { isOllamaRetiredModel, ollamaContextWindow, ollamaInput, ollamaShowContextLength, OLLAMA_DEFAULT_MAX_TOKENS, OLLAMA_MODELS, OLLAMA_REASONING, OLLAMA_SHOW_URL, OLLAMA_TAGS_URL, ollamaPrettyName, } from './index.js';
import { outboundFetch } from '../../utils/outbound.js';
import { createLiveCatalog } from '../../catalog/live-refresh.js';
export const OLLAMA_CATALOG_TTL_MS = 5 * 60_000;
const live = createLiveCatalog({ fallback: () => [...OLLAMA_MODELS] });
export function resetOllamaCatalogCache() {
    live.reset();
}
export function ollamaCatalogTokenHash(token) {
    return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16);
}
export function ollamaCatalogModels() {
    return live.models();
}
export function toOllamaPickerModels(tags, { floor = OLLAMA_MODELS } = {}) {
    const rows = Array.isArray(tags?.models) ? tags.models : Array.isArray(tags) ? tags : [];
    const seen = new Set();
    // `/api/tags` + `/api/show` carry one window each; a maintainer ceiling on
    // the static floor is copied forward by id (`applyOllamaShowWindows` spreads
    // the row, so the field survives the show pass).
    const ceilings = new Map();
    for (const row of floor) {
        if (row?.maxContextWindow !== undefined)
            ceilings.set(row.id, row.maxContextWindow);
    }
    const models = [];
    for (const row of rows) {
        const id = typeof row?.name === 'string' && row.name.trim()
            ? row.name.trim()
            : (typeof row?.model === 'string' && row.model.trim() ? row.model.trim() : '');
        if (!id || isOllamaRetiredModel(id) || seen.has(id))
            continue;
        seen.add(id);
        models.push({
            id,
            name: ollamaPrettyName(id),
            contextWindow: ollamaContextWindow(id, row),
            maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
            input: ollamaInput(id, row),
            reasoningEfforts: { ...OLLAMA_REASONING },
            ...(ceilings.has(id) ? { maxContextWindow: ceilings.get(id) } : {}),
        });
    }
    models.sort((left, right) => left.id.localeCompare(right.id));
    return models;
}
async function showModel(id, { fetchFn, token, signal }) {
    try {
        const response = await fetchFn(OLLAMA_SHOW_URL, {
            method: 'POST',
            headers: {
                // /api/show is public; `scripts/models.ts` calls it without a key.
                ...(token ? { authorization: `Bearer ${token}` } : {}),
                'content-type': 'application/json',
            },
            body: JSON.stringify({ model: id }),
            signal,
        });
        if (!response.ok)
            return undefined;
        return await response.json();
    }
    catch {
        return undefined;
    }
}
/** Cap the /api/show fan-out: an uncapped burst trips upstream rate limiting. */
const OLLAMA_SHOW_CONCURRENCY = 4;
export async function applyOllamaShowWindows(models, options) {
    if (!models.length)
        return models;
    const shows = [];
    for (let i = 0; i < models.length; i += OLLAMA_SHOW_CONCURRENCY) {
        const batch = models.slice(i, i + OLLAMA_SHOW_CONCURRENCY);
        shows.push(...await Promise.all(batch.map((model) => showModel(model.id, options))));
    }
    return models.map((model, index) => {
        const show = shows[index];
        if (!show || typeof show !== 'object')
            return model;
        const window = ollamaShowContextLength(show);
        return {
            ...model,
            ...(window ? { contextWindow: window } : {}),
            input: ollamaInput(model.id, show),
        };
    });
}
export async function refreshOllamaCatalog(session, options = {}) {
    const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : '';
    return live.refresh({
        credential: token,
        ttlMs: options.ttlMs ?? OLLAMA_CATALOG_TTL_MS,
        now: options.now,
        fetch: async () => {
            const fetchFn = options.fetchFn ?? outboundFetch;
            const response = await fetchFn(OLLAMA_TAGS_URL, {
                headers: { authorization: `Bearer ${token}` },
                signal: options.signal,
            });
            if (!response?.ok)
                return null;
            const parsed = toOllamaPickerModels(await response.json());
            if (parsed.length === 0)
                return null;
            return applyOllamaShowWindows(parsed, {
                fetchFn,
                token,
                signal: options.signal,
            });
        },
    });
}
