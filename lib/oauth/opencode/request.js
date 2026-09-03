/**
 * OpenCode Free Completions hop. Map DSH `reasoning_effort` onto
 * OpenAI-style top-level `reasoning_effort` the way Zen / Hermes
 * opencode-free accept. Never send both `thinking` and `reasoning_effort`.
 * Never send Authorization (headers live in index.ts).
 */
import { opencodeCatalogModels } from './catalog.js';
import { OPENCODE_MODELS } from './index.js';
const OFF = new Set(['off', 'none', 'disabled', false, null, '']);
function modelOf(id) {
    const name = typeof id === 'string' ? id : '';
    return opencodeCatalogModels().find((model) => model.id === name)
        ?? OPENCODE_MODELS.find((model) => model.id === name);
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
        return Object.hasOwn(efforts, 'off') ? efforts.off : undefined;
    if (efforts[value] !== undefined)
        return efforts[value];
    const hit = Object.values(efforts).find((wire) => wire === value);
    return typeof hit === 'string' ? hit : undefined;
}
export function applyOpencodeThinking(payload = {}, model) {
    const next = { ...payload };
    const effort = next.reasoning_effort;
    delete next.thinking;
    const row = model ?? modelOf(next.model);
    const efforts = advertisedEfforts(row);
    if (!efforts) {
        delete next.reasoning_effort;
        return next;
    }
    const wire = wireEffort(effort, efforts);
    if (wire === undefined) {
        delete next.reasoning_effort;
        return next;
    }
    next.reasoning_effort = wire;
    return next;
}
