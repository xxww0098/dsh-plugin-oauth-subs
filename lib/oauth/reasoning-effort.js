/**
 * Remember the last explicit reasoning effort on oauth-* families and put it
 * back after DSH's model picker drops `reasoningEffort` (Default = omitted).
 *
 * YAML `agent-default-model` alone does not move the live composer: the picker
 * reads the session `model/selection` event from `selectForNextRequest`.
 * Prefer `sessionController.selectModel` so that path runs with the effort.
 */
import { readPrivateText, writePrivateText } from './store.js';
export const AGENT_DEFAULT_MODEL_NS = 'agent-default-model';
export const LAST_EFFORT_FILE = 'reasoning-effort.json';
export const SETTINGS_UPDATED = 'settings/updated';
export const SETTINGS_DOCUMENT_UPDATED = 'settings/document-updated';
const FAMILIES = Object.freeze(['codex', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'copilot']);
const REMEMBERABLE = new Set(['off', 'low', 'medium', 'high', 'xhigh', 'max']);
/** Highest-first when the remembered level is above what the model offers. */
const CLAMP_ORDER = Object.freeze(['max', 'xhigh', 'high', 'medium', 'low']);
export function isOwnedOauthProvider(prefix, provider) {
    const route = String(prefix ?? '').trim() || 'oauth';
    return FAMILIES.some((family) => String(provider ?? '') === `${route}-${family}`);
}
export function isRememberableEffort(value) {
    return typeof value === 'string' && REMEMBERABLE.has(value);
}
export function isDefaultishEffort(value) {
    return value == null || value === '' || value === 'default';
}
/**
 * Keep the remembered key when the model declares it. `xhigh` / `max` that
 * the model does not list fall to the highest key it does declare.
 * `reasoningEfforts: false` and unknown keys stay unset.
 */
export function compatibleEffort(remembered, reasoningEfforts) {
    if (!isRememberableEffort(remembered))
        return undefined;
    if (reasoningEfforts === false || reasoningEfforts == null || typeof reasoningEfforts !== 'object') {
        return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(reasoningEfforts, remembered))
        return remembered;
    if (remembered !== 'xhigh' && remembered !== 'max')
        return undefined;
    for (const level of CLAMP_ORDER) {
        if (Object.prototype.hasOwnProperty.call(reasoningEfforts, level))
            return level;
    }
    return undefined;
}
export function decideEffortAction({ selection, previous, remembered, prefix, efforts }) {
    const provider = selection?.provider;
    const model = selection?.model;
    if (!isOwnedOauthProvider(prefix, provider) || typeof model !== 'string' || model.length === 0) {
        return {};
    }
    const effort = selection?.reasoningEffort;
    const out = {};
    if (isRememberableEffort(effort))
        out.remember = effort;
    const switched = previous == null
        || previous.provider !== provider
        || previous.model !== model;
    if (switched && isDefaultishEffort(effort)) {
        const restored = compatibleEffort(remembered, efforts);
        if (restored !== undefined)
            out.restore = restored;
    }
    return out;
}
export class EffortMemory {
    constructor({ path } = {}) {
        this.path = path;
        this.effort = undefined;
        this.ready = path ? this.load() : Promise.resolve();
    }
    last() {
        return this.effort;
    }
    async load() {
        const text = await readPrivateText(this.path, 'oauth-subs reasoning effort', { allowBroadMode: true });
        if (text === undefined)
            return;
        try {
            const raw = JSON.parse(text);
            if (isRememberableEffort(raw?.effort))
                this.effort = raw.effort;
        }
        catch {
            // Corrupt file: stay empty rather than crash the proxy.
        }
    }
    async remember(effort) {
        if (!isRememberableEffort(effort) || this.effort === effort)
            return;
        this.effort = effort;
        await this.save();
    }
    async save() {
        if (!this.path)
            return;
        await writePrivateText(this.path, `${JSON.stringify({ effort: this.effort })}\n`);
    }
}
export function snapshotSelection(value) {
    if (value == null || typeof value !== 'object')
        return undefined;
    return {
        provider: value.provider,
        model: value.model,
        reasoningEffort: value.reasoningEffort,
    };
}
export function lastModelSelection(session) {
    const events = session?.events;
    if (!Array.isArray(events))
        return undefined;
    for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i];
        if (event?.type !== 'model/selection')
            continue;
        const data = event.data && typeof event.data === 'object' ? event.data : event;
        if (typeof data.provider === 'string' && typeof data.model === 'string')
            return data;
    }
    return undefined;
}
function readSettingsSelection(host) {
    const settings = host?.settings ?? host;
    if (typeof settings?.get !== 'function')
        return undefined;
    return snapshotSelection(settings.get(AGENT_DEFAULT_MODEL_NS));
}
function liveSessions(host) {
    const store = host?.sessions ?? host?.get?.('sessions');
    if (store == null)
        return [];
    if (typeof store.list === 'function') {
        const rows = store.list();
        return Array.isArray(rows) ? rows : [];
    }
    return [];
}
function sessionControllerOf(host) {
    const direct = host?.sessionController;
    if (direct && typeof direct.selectModel === 'function')
        return direct;
    const got = host?.get?.('sessionController');
    if (got && typeof got.selectModel === 'function')
        return got;
    return undefined;
}
function agentDefaultModelOf(host) {
    const direct = host?.agentDefaultModel;
    if (direct && typeof direct.saveSelection === 'function')
        return direct;
    const got = host?.get?.('agentDefaultModel');
    if (got && typeof got.saveSelection === 'function')
        return got;
    return undefined;
}
/**
 * Re-run host selectModel (selectForNextRequest + saveSelection) with the
 * effort. Falls back to saveSelection / mutate YAML when the session API is
 * missing — that updates future sessions, not the current composer.
 */
export async function applyRestoredSelection(host, selection) {
    const selected = {
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
    };
    const controller = sessionControllerOf(host);
    let applied = 0;
    if (controller) {
        for (const session of liveSessions(host)) {
            const current = lastModelSelection(session);
            if (current?.provider !== selected.provider || current?.model !== selected.model)
                continue;
            if (current.reasoningEffort === selected.reasoningEffort)
                continue;
            await controller.selectModel({
                sessionId: session.id,
                provider: selected.provider,
                model: selected.model,
                reasoningEffort: selected.reasoningEffort,
            });
            applied += 1;
        }
        if (applied > 0)
            return { via: 'selectModel', sessions: applied, livePicker: true };
    }
    const defaults = agentDefaultModelOf(host);
    if (defaults) {
        await defaults.saveSelection(selected);
        return { via: 'saveSelection', sessions: 0, livePicker: false };
    }
    const settings = host?.settings ?? host;
    if (typeof settings?.mutate === 'function') {
        await settings.mutate(AGENT_DEFAULT_MODEL_NS, [
            { op: 'set', path: ['reasoningEffort'], value: selected.reasoningEffort },
        ]);
        return { via: 'mutate', sessions: 0, livePicker: false };
    }
    return { via: 'none', sessions: 0, livePicker: false };
}
export function startEffortRestore({ ctx, settings, memory, prefix, effortsFor }) {
    const host = ctx ?? { settings };
    const settingsRef = settings ?? host.settings;
    let lastSeen;
    let pending;
    const handle = async (next, prev) => {
        await memory.ready;
        const snap = snapshotSelection(next);
        if (pending
            && snap?.provider === pending.provider
            && snap?.model === pending.model
            && snap?.reasoningEffort === pending.effort) {
            pending = undefined;
            lastSeen = snap;
            return;
        }
        const action = decideEffortAction({
            selection: snap,
            previous: snapshotSelection(prev) ?? lastSeen,
            remembered: memory.last(),
            prefix,
            efforts: typeof effortsFor === 'function' ? effortsFor(snap?.provider, snap?.model) : undefined,
        });
        lastSeen = snap;
        if (action.remember)
            await memory.remember(action.remember);
        if (!action.restore || action.restore === snap?.reasoningEffort)
            return;
        pending = { provider: snap.provider, model: snap.model, effort: action.restore };
        const restored = { provider: snap.provider, model: snap.model, reasoningEffort: action.restore };
        await applyRestoredSelection({ ...host, settings: settingsRef }, restored);
        lastSeen = restored;
    };
    const onUpdated = (ns, next, prev) => {
        if (ns !== AGENT_DEFAULT_MODEL_NS)
            return;
        void handle(next, prev).catch(() => undefined);
    };
    const onDocument = (ns) => {
        if (ns !== AGENT_DEFAULT_MODEL_NS)
            return;
        const current = readSettingsSelection({ settings: settingsRef });
        void handle(current, lastSeen).catch(() => undefined);
    };
    const offs = [];
    if (typeof host.on === 'function') {
        host.on(SETTINGS_UPDATED, onUpdated);
        host.on(SETTINGS_DOCUMENT_UPDATED, onDocument);
        offs.push(() => {
            host.off?.(SETTINGS_UPDATED, onUpdated);
            host.off?.(SETTINGS_DOCUMENT_UPDATED, onDocument);
        });
    }
    void memory.ready.then(() => {
        const current = readSettingsSelection({ settings: settingsRef });
        if (current)
            return handle(current, undefined);
        return undefined;
    }).catch(() => undefined);
    return () => {
        for (const off of offs)
            off();
    };
}
