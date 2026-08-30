/**
 * On-disk OAuth session store at `<dataDir>/auth.json`.
 *
 * The file is a JSON object keyed by provider id. Writes are atomic
 * (tmp file + rename) with mode 0600 because they carry bearer tokens.
 */
import { constants } from 'node:fs';
import { chmod, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { formatPlanLabel } from './plan.js';
import { kiroAccountId, kiroMethodLabel } from './kiro/index.js';
import { displayGlmAccount } from './glm/index.js';
export const PROVIDER_IDS = Object.freeze(['codex', 'grok', 'glm', 'kiro', 'antigravity']);
export function defaultDataDir() {
    return join(homedir(), '.dsh', 'plugins', 'oauth-subs');
}
export function authFilePath(dataDir = defaultDataDir()) {
    return join(dataDir, 'auth.json');
}
export async function readPrivateText(path, label, { allowBroadMode = false } = {}) {
    let handle;
    try {
        handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return undefined;
        if (error.code === 'ELOOP')
            throw new Error(`${label} at ${path} must not be a symbolic link`);
        throw error;
    }
    try {
        const info = await handle.stat();
        if (!info.isFile())
            throw new Error(`${label} at ${path} must be a regular file`);
        if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
            throw new Error(`${label} at ${path} must be owned by the current user`);
        }
        if (!allowBroadMode && process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
            throw new Error(`${label} at ${path} must not be accessible by group or other users`);
        }
        return await handle.readFile('utf8');
    }
    finally {
        await handle.close();
    }
}
export async function writePrivateText(path, text) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await chmod(dirname(path), 0o700);
    const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
    try {
        await writeFile(tmp, text, { mode: 0o600 });
        await chmod(tmp, 0o600);
        await rename(tmp, path);
    }
    catch (error) {
        await rm(tmp, { force: true });
        throw error;
    }
}
function assertSessionShape(provider, value) {
    if (typeof value !== 'object' || value === null) {
        throw new Error(`oauth-subs auth store: entry "${provider}" is not an object; fix or delete the store file`);
    }
    if (typeof value.accessToken !== 'string' || value.accessToken.length === 0
        || typeof value.refreshToken !== 'string' || value.refreshToken.length === 0
        || typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) {
        throw new Error(`oauth-subs auth store: entry "${provider}" is missing accessToken/refreshToken/expiresAt; fix or delete the store file`);
    }
}
export function accountIdOf(provider, session) {
    if (!session || typeof session !== 'object')
        return `${provider}-account`;
    if (provider === 'codex') {
        const id = session.emailAddress || session.accountId;
        if (typeof id === 'string' && id.trim())
            return id.trim();
    }
    else if (provider === 'glm') {
        const account = typeof session.account === 'string' && session.account.trim()
            ? session.account.trim()
            : 'glm';
        const region = session.region === 'bigmodel' ? 'bigmodel' : 'zai';
        return `${account}@${region}`;
    }
    else if (provider === 'kiro') {
        return kiroAccountId(session);
    }
    else if (typeof session.account === 'string' && session.account.trim()) {
        return session.account.trim();
    }
    if (typeof session.refreshToken === 'string' && session.refreshToken.length >= 8) {
        return `${provider}-${session.refreshToken.slice(-8)}`;
    }
    return `${provider}-account`;
}
function isSessionEntry(value) {
    return value && typeof value === 'object' && typeof value.accessToken === 'string';
}
function isVaultEntry(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        && value.accounts && typeof value.accounts === 'object' && !Array.isArray(value.accounts)
        && !isSessionEntry(value);
}
export function asVault(provider, entry) {
    if (entry === undefined)
        return { activeId: undefined, accounts: {} };
    if (isVaultEntry(entry)) {
        const accounts = {};
        for (const [rawId, session] of Object.entries(entry.accounts)) {
            if (!isSessionEntry(session))
                continue;
            const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : accountIdOf(provider, session);
            accounts[id] = session;
        }
        const requested = typeof entry.activeId === 'string' ? entry.activeId : undefined;
        const activeId = requested && accounts[requested] ? requested : Object.keys(accounts)[0];
        return { activeId, accounts };
    }
    if (isSessionEntry(entry)) {
        const id = accountIdOf(provider, entry);
        return { activeId: id, accounts: { [id]: entry } };
    }
    throw new Error(`oauth-subs auth store: entry "${provider}" is not an object; fix or delete the store file`);
}
function parseStore(text, path) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new Error(`oauth-subs auth store at ${path} is not valid JSON; fix or delete the file`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`oauth-subs auth store at ${path} must be a JSON object keyed by provider; fix or delete the file`);
    }
    for (const provider of PROVIDER_IDS) {
        if (parsed[provider] === undefined)
            continue;
        if (isVaultEntry(parsed[provider])) {
            for (const [id, session] of Object.entries(parsed[provider].accounts ?? {})) {
                assertSessionShape(`${provider}:${id}`, session);
            }
        }
        else {
            assertSessionShape(provider, parsed[provider]);
        }
    }
    return parsed;
}
export async function loadStore(path) {
    const file = path ?? authFilePath();
    const text = await readPrivateText(file, 'oauth-subs auth store');
    if (text === undefined)
        return {};
    return parseStore(text, file);
}
async function writeStore(store, path) {
    await writePrivateText(path, `${JSON.stringify(store, null, 2)}\n`);
}
const writeChains = new Map();
async function serialize(path, action) {
    const previous = writeChains.get(path) ?? Promise.resolve();
    const next = previous.then(action, action);
    const tail = next.then(() => undefined, () => undefined);
    writeChains.set(path, tail);
    try {
        return await next;
    }
    finally {
        if (writeChains.get(path) === tail)
            writeChains.delete(path);
    }
}
export async function getSession(provider, path) {
    const vault = asVault(provider, (await loadStore(path))[provider]);
    if (!vault.activeId)
        return undefined;
    return vault.accounts[vault.activeId];
}
export async function listAccounts(provider, path) {
    const vault = asVault(provider, (await loadStore(path))[provider]);
    return Object.entries(vault.accounts)
        .map(([id, session]) => ({
        id,
        active: id === vault.activeId,
        ...publicSession(provider, session),
    }))
        .sort((left, right) => Number(right.active) - Number(left.active) || left.id.localeCompare(right.id));
}
export async function listStoredSessions(provider, path) {
    const vault = asVault(provider, (await loadStore(path))[provider]);
    return Object.entries(vault.accounts).map(([id, session]) => ({
        id,
        session,
        active: id === vault.activeId,
    }));
}
export async function getAccountSession(provider, id, path) {
    const vault = asVault(provider, (await loadStore(path))[provider]);
    const key = typeof id === 'string' && id.trim() ? id.trim() : vault.activeId;
    if (!key)
        return undefined;
    return vault.accounts[key];
}
export async function replaceAccountId(provider, fromId, session, path) {
    const file = path ?? authFilePath();
    return serialize(file, async () => {
        const store = await loadStore(file);
        const vault = asVault(provider, store[provider]);
        const nextId = accountIdOf(provider, session);
        const previous = typeof fromId === 'string' && fromId.trim() ? fromId.trim() : vault.activeId;
        const wasActive = vault.activeId === previous || vault.activeId === nextId;
        if (previous && previous !== nextId)
            delete vault.accounts[previous];
        vault.accounts[nextId] = session;
        if (wasActive || !vault.activeId || !vault.accounts[vault.activeId])
            vault.activeId = nextId;
        store[provider] = vault;
        await writeStore(store, file);
        return nextId;
    });
}
export async function saveSession(provider, session, path, options) {
    const file = path ?? authFilePath();
    const activate = options?.activate !== false;
    return serialize(file, async () => {
        const store = await loadStore(file);
        const vault = asVault(provider, store[provider]);
        const id = typeof options?.id === 'string' && options.id.trim()
            ? options.id.trim()
            : accountIdOf(provider, session);
        vault.accounts[id] = session;
        if (activate || !vault.activeId || !vault.accounts[vault.activeId])
            vault.activeId = id;
        store[provider] = vault;
        await writeStore(store, file);
    });
}
export async function switchAccount(provider, id, path) {
    if (typeof id !== 'string' || !id.trim())
        throw new Error(`${provider} account id is required`);
    const file = path ?? authFilePath();
    return serialize(file, async () => {
        const store = await loadStore(file);
        const vault = asVault(provider, store[provider]);
        const key = id.trim();
        if (!vault.accounts[key])
            throw new Error(`${provider} account ${key} is not signed in`);
        vault.activeId = key;
        store[provider] = vault;
        await writeStore(store, file);
    });
}
export async function deleteSession(provider, path, id) {
    const file = path ?? authFilePath();
    return serialize(file, async () => {
        const store = await loadStore(file);
        const vault = asVault(provider, store[provider]);
        const target = typeof id === 'string' && id.trim() ? id.trim() : vault.activeId;
        if (!target || !vault.accounts[target])
            return;
        delete vault.accounts[target];
        if (vault.activeId === target) {
            vault.activeId = Object.keys(vault.accounts)[0];
        }
        if (!vault.activeId)
            delete store[provider];
        else
            store[provider] = vault;
        await writeStore(store, file);
    });
}
export function publicSession(provider, session) {
    if (session === undefined)
        return undefined;
    const planType = session.planType;
    const planLabel = formatPlanLabel(planType, provider);
    if (provider === 'codex') {
        return {
            account: session.emailAddress ?? session.accountId,
            planType,
            planLabel,
            expiresAt: session.expiresAt,
        };
    }
    if (provider === 'glm') {
        return {
            account: displayGlmAccount(session),
            planType,
            planLabel,
            region: session.region === 'bigmodel' ? 'bigmodel' : 'zai',
            expiresAt: session.expiresAt,
        };
    }
    if (provider === 'kiro') {
        return {
            account: session.account,
            planType,
            planLabel,
            method: session.authMethod,
            methodLabel: kiroMethodLabel(session),
            expiresAt: session.expiresAt,
        };
    }
    return {
        account: session.account,
        planType,
        planLabel,
        scopes: session.scopes,
        expiresAt: session.expiresAt,
    };
}
