/**
 * Kimi Completions hop. Map DSH `reasoning_effort` onto
 * `thinking` / `thinking.effort` when the catalog advertises it.
 * Official Kimi Code accepts effort only inside `thinking`.
 */
import { kimiCatalogModels } from './catalog.js';
import { KIMI_MODELS, KIMI_REASONING } from './index.js';
const OFF = new Set(['off', 'none', 'disabled', false, null, '']);
function modelOf(id) {
    const name = typeof id === 'string' ? id : '';
    return kimiCatalogModels().find((model) => model.id === name)
        ?? KIMI_MODELS.find((model) => model.id === name);
}
function advertisedEfforts(model) {
    const raw = model?.reasoningEfforts;
    if (!raw || typeof raw !== 'object')
        return undefined;
    return raw;
}
function wireEffort(value, efforts) {
    if (value === undefined)
        return undefined;
    if (OFF.has(value))
        return 'off';
    if (efforts[value] !== undefined)
        return efforts[value];
    const hit = Object.values(efforts).find((wire) => wire === value);
    return typeof hit === 'string' ? hit : undefined;
}
export function applyKimiThinking(payload = {}, model) {
    const next = { ...payload };
    const effort = next.reasoning_effort;
    delete next.reasoning_effort;
    const row = model ?? modelOf(next.model);
    const efforts = advertisedEfforts(row);
    if (!efforts) {
        delete next.thinking;
        return next;
    }
    const wire = wireEffort(effort, efforts) ?? (effort === undefined ? undefined : wireEffort('medium', efforts));
    if (wire === undefined)
        return next;
    if (wire === 'off' || OFF.has(wire)) {
        if (Object.hasOwn(efforts, 'off') || Object.values(KIMI_REASONING).includes('off')) {
            next.thinking = { type: 'disabled' };
        }
        else {
            delete next.thinking;
        }
        return next;
    }
    next.thinking = { type: 'enabled', effort: wire };
    return next;
}
/** Map vendor cache-read aliases. Absent field stays absent — do not invent 0. */
export function mapKimiUsage(usage) {
    if (!usage || typeof usage !== 'object')
        return usage;
    const cached = usage.prompt_tokens_details?.cached_tokens
        ?? usage.cached_tokens
        ?? usage.cache_read_input_tokens
        ?? usage.cache_read_tokens;
    if (typeof cached !== 'number' || !Number.isFinite(cached) || cached < 0)
        return usage;
    const details = usage.prompt_tokens_details && typeof usage.prompt_tokens_details === 'object'
        ? { ...usage.prompt_tokens_details }
        : {};
    if (typeof details.cached_tokens !== 'number')
        details.cached_tokens = cached;
    return { ...usage, prompt_tokens_details: details };
}
/** Completions SSE omits usage unless the vendor is asked. Do not override an explicit value. */
export function applyKimiStreamUsage(payload = {}) {
    if (!payload || payload.stream !== true)
        return payload;
    const current = payload.stream_options;
    if (current && typeof current === 'object' && Object.hasOwn(current, 'include_usage'))
        return payload;
    return {
        ...payload,
        stream_options: current && typeof current === 'object'
            ? { ...current, include_usage: true }
            : { include_usage: true },
    };
}
