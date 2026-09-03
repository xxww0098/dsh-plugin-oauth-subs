/**
 * Live Ollama Cloud picker. GET https://ollama.com/api/tags after login.
 * OLLAMA_MODELS is the offline fallback only. Retired Cloud rows stay out.
 */
import { createHash } from 'node:crypto';
import { inferOllamaContextWindow, inferOllamaInput, isOllamaRetiredModel, OLLAMA_DEFAULT_MAX_TOKENS, OLLAMA_MODELS, OLLAMA_REASONING, OLLAMA_TAGS_URL, ollamaPrettyName, } from './index.js';
export const OLLAMA_CATALOG_TTL_MS = 5 * 60_000;
const cached = { tokenHash: '', models: /** @type {any[] | undefined} */ (undefined), expiresAt: 0 };
export function resetOllamaCatalogCache() {
    cached.tokenHash = '';
    cached.models = undefined;
    cached.expiresAt = 0;
}
export function ollamaCatalogTokenHash(token) {
    return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16);
}
export function ollamaCatalogModels() {
    return cached.models?.length ? cached.models : [...OLLAMA_MODELS];
}
export function toOllamaPickerModels(tags) {
    const rows = Array.isArray(tags?.models) ? tags.models : Array.isArray(tags) ? tags : [];
    const seen = new Set();
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
            contextWindow: inferOllamaContextWindow(id),
            maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
            input: inferOllamaInput(id),
            reasoningEfforts: { ...OLLAMA_REASONING },
        });
    }
    models.sort((left, right) => left.id.localeCompare(right.id));
    return models;
}
export async function refreshOllamaCatalog(session, options = {}) {
    const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : '';
    if (!token)
        return [...OLLAMA_MODELS];
    const tokenHash = ollamaCatalogTokenHash(token);
    if (cached.tokenHash === tokenHash && cached.models?.length && Date.now() < cached.expiresAt) {
        return cached.models;
    }
    try {
        const fetchFn = options.fetchFn ?? fetch;
        const response = await fetchFn(OLLAMA_TAGS_URL, {
            headers: { authorization: `Bearer ${token}` },
            signal: options.signal,
        });
        if (response.ok) {
            const models = toOllamaPickerModels(await response.json());
            if (models.length > 0) {
                cached.tokenHash = tokenHash;
                cached.models = models;
                cached.expiresAt = Date.now() + (options.ttlMs ?? OLLAMA_CATALOG_TTL_MS);
                return models;
            }
        }
    }
    catch {
        // Discovery must not block chat or login.
    }
    if (cached.tokenHash === tokenHash && cached.models?.length)
        return cached.models;
    return [...OLLAMA_MODELS];
}
