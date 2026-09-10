/**
 * OpenCode Go multi-account vault at <dataDir>/opencode-go.json (0600).
 *
 * Not auth.json: the OAuth store requires accessToken / refreshToken /
 * expiresAt. Each account carries its own chat key plus the web cookie and
 * workspace id used to read quota; the controller mirrors the active
 * account's key into the host `OPENCODE_API_KEY` credential. Nothing in
 * this file is ever returned to Settings verbatim.
 */
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { readPrivateText, writePrivateText } from '../../utils/private-text.js';
import { isOpencodeGoCookieMask, normalizeOpencodeGoWorkspaceId, opencodeGoAccountId, parseOpencodeGoCookie, publicOpencodeGo, } from './index.js';
import { fetchOpencodeGoQuota } from './quota.js';
export function opencodeGoFilePath(authPath) {
    return dirname(authPath) + '/opencode-go.json';
}
function emptyAccount() {
    return { apiKey: '', cookieHeader: '', workspaceId: '' };
}
function emptyVault() {
    return { activeId: undefined, accounts: {} };
}
function normalizeAccount(raw) {
    if (!raw || typeof raw !== 'object')
        return emptyAccount();
    return {
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
        cookieHeader: typeof raw.cookieHeader === 'string'
            ? parseOpencodeGoCookie(raw.cookieHeader) ?? ''
            : '',
        workspaceId: normalizeOpencodeGoWorkspaceId(raw.workspaceId) ?? '',
    };
}
/** Parse a vault file; a pre-multi-account `{ cookieHeader, workspaceId }` migrates in place. */
export function parseOpencodeGoVault(text) {
    let parsed;
    try {
        parsed = JSON.parse(String(text ?? ''));
    }
    catch {
        return emptyVault();
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return emptyVault();
    if (parsed.accounts && typeof parsed.accounts === 'object' && !Array.isArray(parsed.accounts)) {
        const accounts = {};
        for (const [rawId, raw] of Object.entries(parsed.accounts)) {
            const id = typeof rawId === 'string' ? rawId.trim() : '';
            if (!id)
                continue;
            accounts[id] = normalizeAccount(raw);
        }
        const requested = typeof parsed.activeId === 'string' ? parsed.activeId.trim() : '';
        return {
            activeId: requested && accounts[requested] ? requested : Object.keys(accounts)[0],
            accounts,
        };
    }
    const legacy = normalizeAccount(parsed);
    if (!legacy.apiKey && !legacy.cookieHeader && !legacy.workspaceId)
        return emptyVault();
    const id = opencodeGoAccountId({
        workspaceId: legacy.workspaceId,
        apiKey: legacy.apiKey,
        cookieHeader: legacy.cookieHeader,
    }) ?? `go_${randomUUID().slice(0, 8)}`;
    return { activeId: id, accounts: { [id]: legacy } };
}
export class OpencodeGoStore {
    constructor({ path, fetchFn = fetch, ttlMs = 10_000 } = {}) {
        this.path = path;
        this.fetchFn = fetchFn;
        this.ttlMs = ttlMs;
        this.vault = emptyVault();
        this.quotas = new Map();
        this.inflight = new Map();
        this.ready = this.#load();
    }
    async #load() {
        const text = await readPrivateText(this.path, 'opencode-go config').catch(() => undefined);
        this.vault = parseOpencodeGoVault(text);
    }
    async #persist() {
        const body = JSON.stringify({
            activeId: this.vault.activeId,
            accounts: this.vault.accounts,
        }, null, 2);
        await writePrivateText(this.path, body + '\n');
    }
    #ids() {
        return Object.keys(this.vault.accounts);
    }
    activeId() {
        return this.vault.activeId;
    }
    keyOf(id) {
        const entry = this.vault.accounts[id];
        return entry?.apiKey ? entry.apiKey : undefined;
    }
    anyKey() {
        return this.#ids().some((id) => Boolean(this.vault.accounts[id]?.apiKey));
    }
    /** The single keyless account, if the vault holds exactly one (legacy adoption). */
    keylessId() {
        const ids = this.#ids();
        if (ids.length !== 1)
            return undefined;
        return this.vault.accounts[ids[0]]?.apiKey ? undefined : ids[0];
    }
    async adoptKey(id, key) {
        await this.ready;
        const entry = this.vault.accounts[id];
        const value = String(key ?? '').trim();
        if (!entry || entry.apiKey || !value)
            return false;
        entry.apiKey = value;
        await this.#persist();
        return true;
    }
    async #quotaOf(id) {
        const entry = this.vault.accounts[id];
        const quota = this.quotas.get(id);
        const stale = Date.now() - (quota?.updatedAt ?? 0) > this.ttlMs;
        const shouldRefresh = Boolean(entry?.cookieHeader)
            && (quota === undefined || quota.status === 'idle' || (quota.status === 'error' && stale));
        if (shouldRefresh)
            await this.#refreshOne(id, quota).catch(() => undefined);
        return this.quotas.get(id) ?? { status: 'idle' };
    }
    async #hydrate() {
        await Promise.all(this.#ids().map((id) => this.#quotaOf(id)));
    }
    async #snapshot() {
        return publicOpencodeGo(this.vault, this.quotas);
    }
    async snapshot({ refresh = false, id } = {}) {
        await this.ready;
        if (refresh)
            await this.refreshQuota(id);
        else
            await this.#hydrate();
        return this.#snapshot();
    }
    async save({ id, apiKey, cookie, workspace } = {}) {
        await this.ready;
        let target = typeof id === 'string' && this.vault.accounts[id] ? id : undefined;
        const rawKey = apiKey === undefined ? undefined : String(apiKey ?? '').trim();
        const nextKey = rawKey ? rawKey : undefined;
        let nextCookie;
        if (cookie !== undefined) {
            const raw = String(cookie ?? '');
            if (isOpencodeGoCookieMask(raw))
                nextCookie = undefined;
            else if (!raw.trim())
                nextCookie = '';
            else {
                const parsed = parseOpencodeGoCookie(raw);
                if (!parsed)
                    throw new Error('OpenCode Go cookie must be an auth token or Cookie header');
                nextCookie = parsed;
            }
        }
        let nextWorkspace;
        if (workspace !== undefined) {
            const raw = String(workspace ?? '').trim();
            if (!raw)
                nextWorkspace = '';
            else {
                const parsed = normalizeOpencodeGoWorkspaceId(raw);
                if (!parsed)
                    throw new Error('OpenCode Go workspace must be wrk_... or an opencode.ai/workspace/wrk_... URL');
                nextWorkspace = parsed;
            }
        }
        if (!target && nextWorkspace) {
            target = this.#ids().find((key) => this.vault.accounts[key].workspaceId === nextWorkspace);
        }
        if (!target && nextKey) {
            target = this.#ids().find((key) => this.vault.accounts[key].apiKey === nextKey);
        }
        if (!target && nextCookie && !nextWorkspace && !nextKey) {
            target = this.#ids().find((key) => this.vault.accounts[key].cookieHeader === nextCookie);
        }
        if (!target) {
            target = opencodeGoAccountId({
                workspaceId: nextWorkspace,
                apiKey: nextKey,
                cookieHeader: nextCookie,
            }) ?? `go_${randomUUID().slice(0, 8)}`;
        }
        const created = this.vault.accounts[target] === undefined;
        const entry = { ...(this.vault.accounts[target] ?? emptyAccount()) };
        if (nextKey !== undefined)
            entry.apiKey = nextKey;
        if (nextCookie !== undefined)
            entry.cookieHeader = nextCookie;
        if (nextWorkspace !== undefined)
            entry.workspaceId = nextWorkspace;
        this.vault.accounts[target] = entry;
        this.vault.activeId = target;
        await this.#persist();
        if (entry.cookieHeader)
            await this.#refreshOne(target, this.quotas.get(target)).catch(() => undefined);
        else
            this.quotas.set(target, { status: 'idle' });
        return { id: target, created };
    }
    async switch(id) {
        await this.ready;
        const key = String(id ?? '').trim();
        if (!this.vault.accounts[key])
            throw new Error(`OpenCode Go account ${key} is not signed in`);
        if (this.vault.activeId !== key) {
            this.vault.activeId = key;
            await this.#persist();
        }
        return this.#snapshot();
    }
    async remove(id) {
        await this.ready;
        const key = String(id ?? '').trim();
        if (!this.vault.accounts[key])
            throw new Error(`OpenCode Go account ${key} is not signed in`);
        const wasActive = this.vault.activeId === key;
        delete this.vault.accounts[key];
        this.quotas.delete(key);
        if (wasActive)
            this.vault.activeId = this.#ids()[0];
        await this.#persist();
        return { removed: key, wasActive, activeId: this.vault.activeId };
    }
    async clear(id, field) {
        await this.ready;
        const key = String(id ?? this.vault.activeId ?? '').trim();
        const entry = this.vault.accounts[key];
        if (!entry)
            throw new Error(`OpenCode Go account ${key} is not signed in`);
        if (field === 'key')
            entry.apiKey = '';
        else if (field === 'cookie')
            entry.cookieHeader = '';
        else if (field === 'workspace')
            entry.workspaceId = '';
        else {
            entry.apiKey = '';
            entry.cookieHeader = '';
            entry.workspaceId = '';
        }
        await this.#persist();
        if (!entry.cookieHeader)
            this.quotas.set(key, { status: 'idle' });
        else
            await this.#refreshOne(key, this.quotas.get(key)).catch(() => undefined);
        return this.#snapshot();
    }
    async refreshQuota(id) {
        await this.ready;
        const targets = typeof id === 'string' && id.trim() ? [id.trim()] : this.#ids();
        await Promise.all(targets
            .filter((key) => this.vault.accounts[key])
            .map((key) => this.#refreshOne(key, this.quotas.get(key)).catch(() => undefined)));
        return this.#snapshot();
    }
    async #refreshOne(id, previous) {
        const pending = this.inflight.get(id);
        if (pending)
            return pending;
        const entry = this.vault.accounts[id];
        if (!entry?.cookieHeader) {
            this.quotas.set(id, { status: 'idle' });
            return this.#snapshot();
        }
        this.quotas.set(id, {
            ...(previous ?? {}),
            status: previous?.status === 'ready' ? 'ready' : 'loading',
            updatedAt: previous?.updatedAt ?? Date.now(),
            rows: previous?.rows ?? [],
        });
        const run = this.#loadQuota(id, entry, previous).finally(() => {
            this.inflight.delete(id);
        });
        this.inflight.set(id, run);
        return run;
    }
    async #loadQuota(id, entry, previous) {
        try {
            const parsed = await fetchOpencodeGoQuota(entry, { fetchFn: this.fetchFn });
            if (parsed.workspaceId && parsed.workspaceId !== entry.workspaceId) {
                entry.workspaceId = parsed.workspaceId;
                await this.#persist();
            }
            this.quotas.set(id, {
                status: 'ready',
                planType: parsed.planType,
                updatedAt: Date.now(),
                rows: parsed.rows ?? [],
            });
        }
        catch (error) {
            this.quotas.set(id, {
                status: 'error',
                updatedAt: Date.now(),
                error: error instanceof Error ? error.message : String(error),
                rows: previous?.rows ?? [],
            });
        }
        return this.#snapshot();
    }
}
