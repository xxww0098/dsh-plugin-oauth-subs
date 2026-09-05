/**
 * Live Copilot picker. GET {endpoints.api}/models after login.
 * COPILOT_MODELS is the offline fallback only.
 */
import { createHash } from 'node:crypto';
import { COPILOT_API_VERSION, COPILOT_DEFAULT_CONTEXT, COPILOT_DEFAULT_MAX_TOKENS, COPILOT_INPUT, COPILOT_MODELS, COPILOT_REASONING, COPILOT_VISION_INPUT, copilotIdentityHeaders, copilotModelsUrl, } from './index.js';
export const COPILOT_CATALOG_TTL_MS = 5 * 60_000;
const cached = { tokenHash: '', models: /** @type {any[] | undefined} */ (undefined), expiresAt: 0 };
export function resetCopilotCatalogCache() {
    cached.tokenHash = '';
    cached.models = undefined;
    cached.expiresAt = 0;
}
export function copilotCatalogTokenHash(token) {
    return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16);
}
export function copilotCatalogModels() {
    return cached.models?.length ? cached.models : [...COPILOT_MODELS];
}
function asPositiveInt(value) {
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
    if (!Number.isFinite(n) || n <= 0)
        return undefined;
    return Math.trunc(n);
}
function supportsVision(row) {
    const caps = row?.capabilities;
    if (caps?.supports?.vision === true)
        return true;
    const types = caps?.limits?.vision?.supported_media_types;
    return Array.isArray(types) && types.some((item) => typeof item === 'string' && item.startsWith('image/'));
}
export function copilotReasoningEffortsOf(row) {
    const efforts = row?.capabilities?.supports?.reasoning_effort;
    if (!Array.isArray(efforts) || efforts.length === 0)
        return undefined;
    const allowed = new Set(efforts.filter((item) => typeof item === 'string' && item));
    if (allowed.size === 0)
        return undefined;
    const mapped = {};
    for (const [level, wire] of Object.entries(COPILOT_REASONING)) {
        if (allowed.has(wire))
            mapped[level] = wire;
    }
    for (const wire of allowed) {
        if (wire === 'off' || wire === 'none')
            mapped.off = wire;
        else if (wire === 'minimal' && mapped.minimal === undefined)
            mapped.minimal = wire;
        else if (wire === 'xhigh' && mapped.xhigh === undefined)
            mapped.xhigh = wire;
        else if (wire === 'max' && mapped.max === undefined)
            mapped.max = wire;
    }
    return Object.keys(mapped).length > 0 ? mapped : undefined;
}
export function toCopilotPickerModels(payload) {
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const seen = new Set();
    const models = [];
    for (const row of rows) {
        const id = typeof row?.id === 'string' && row.id.trim() ? row.id.trim() : '';
        if (!id || seen.has(id))
            continue;
        if (row?.model_picker_enabled === false)
            continue;
        if (row?.policy?.state === 'disabled')
            continue;
        const toolCalls = row?.capabilities?.supports?.tool_calls;
        if (toolCalls === false)
            continue;
        seen.add(id);
        const name = typeof row.name === 'string' && row.name.trim()
            ? row.name.trim()
            : (COPILOT_MODELS.find((model) => model.id === id)?.name ?? id);
        const limits = row?.capabilities?.limits ?? {};
        const window = asPositiveInt(limits.max_context_window_tokens)
            ?? asPositiveInt(limits.max_prompt_tokens)
            ?? COPILOT_MODELS.find((model) => model.id === id)?.contextWindow;
        const maxTokens = asPositiveInt(limits.max_output_tokens)
            ?? COPILOT_MODELS.find((model) => model.id === id)?.maxTokens;
        const reasoningEfforts = copilotReasoningEffortsOf(row);
        models.push({
            id,
            name,
            contextWindow: window ?? COPILOT_DEFAULT_CONTEXT,
            maxTokens: maxTokens ?? COPILOT_DEFAULT_MAX_TOKENS,
            input: supportsVision(row) ? [...COPILOT_VISION_INPUT] : [...COPILOT_INPUT],
            ...(reasoningEfforts ? { reasoningEfforts } : {}),
        });
    }
    models.sort((left, right) => {
        const order = COPILOT_MODELS.map((model) => model.id);
        const li = order.indexOf(left.id);
        const ri = order.indexOf(right.id);
        if (li !== -1 || ri !== -1)
            return (li === -1 ? 999 : li) - (ri === -1 ? 999 : ri);
        return left.id.localeCompare(right.id);
    });
    return models;
}
export async function refreshCopilotCatalog(session, options = {}) {
    const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : '';
    if (!token)
        return [...COPILOT_MODELS];
    const tokenHash = copilotCatalogTokenHash(token);
    if (cached.tokenHash === tokenHash && cached.models?.length && Date.now() < cached.expiresAt) {
        return cached.models;
    }
    try {
        const fetchFn = options.fetchFn ?? fetch;
        const response = await fetchFn(copilotModelsUrl(session), {
            headers: {
                authorization: `Bearer ${token}`,
                accept: 'application/json',
                'x-github-api-version': COPILOT_API_VERSION,
                ...copilotIdentityHeaders(),
            },
            signal: options.signal,
        });
        if (response.ok) {
            const parsed = toCopilotPickerModels(await response.json());
            if (parsed.length > 0) {
                cached.tokenHash = tokenHash;
                cached.models = parsed;
                cached.expiresAt = Date.now() + (options.ttlMs ?? COPILOT_CATALOG_TTL_MS);
                return parsed;
            }
        }
    }
    catch {
        // Discovery must not block chat or login.
    }
    if (cached.tokenHash === tokenHash && cached.models?.length)
        return cached.models;
    return [...COPILOT_MODELS];
}
