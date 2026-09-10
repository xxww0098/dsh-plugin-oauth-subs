/**
 * On-disk OAuth session store at `<dataDir>/auth.json`.
 *
 * The file is a JSON object keyed by provider id. Writes are atomic
 * (tmp file + rename) with mode 0600 because they carry bearer tokens.
 */
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { formatPlanLabel } from './plan.js';
import { kiroAccountId, kiroMethodLabel } from './kiro/index.js';
import { displayGlmAccount } from './glm/index.js';
import { displayCursorAccount } from './cursor/index.js';
import { ollamaSourceLabel } from '../apikey/ollama/index.js';
import { kimiSourceLabel } from './kimi/index.js';
import { copilotSourceLabel } from './copilot/index.js';
import { readPrivateText, writePrivateText } from '../utils/private-text.js';
export { readPrivateText, writePrivateText };
export const PROVIDER_IDS = Object.freeze(['codex', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'copilot']);
export function defaultDataDir() {
    return join(homedir(), '.dsh', 'plugins', 'oauth-subs');
}
export function authFilePath(dataDir = defaultDataDir()) {
    return join(dataDir, 'auth.json');
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
function legacyGeneration(provider, id, session) {
    return createHash('sha256').update(JSON.stringify([provider, id, session])).digest('hex');
}
export function asVault(provider, entry) {
    if (entry === undefined)
        return { activeId: undefined, accounts: {}, generations: {} };
    if (isVaultEntry(entry)) {
        const accounts = {};
        const generations = {};
        for (const [rawId, session] of Object.entries(entry.accounts)) {
            if (!isSessionEntry(session))
                continue;
            const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : accountIdOf(provider, session);
            accounts[id] = session;
            generations[id] = typeof entry.generations?.[rawId] === 'string'
                ? entry.generations[rawId]
                : legacyGeneration(provider, id, session);
        }
        const requested = typeof entry.activeId === 'string' ? entry.activeId : undefined;
        const activeId = requested && accounts[requested] ? requested : Object.keys(accounts)[0];
        return { activeId, accounts, generations };
    }
    if (isSessionEntry(entry)) {
        const id = accountIdOf(provider, entry);
        return { activeId: id, accounts: { [id]: entry }, generations: { [id]: legacyGeneration(provider, id, entry) } };
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
    return (await getStoredSession(provider, undefined, path))?.session;
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
function storedAccount(vault, id) {
    if (!id || !Object.hasOwn(vault.accounts, id))
        return undefined;
    const session = vault.accounts[id];
    const generation = vault.generations[id];
    const version = createHash('sha256').update(JSON.stringify([
        generation, session.accessToken, session.refreshToken, session.expiresAt,
    ])).digest('hex');
    return { id, session, active: id === vault.activeId, generation, version };
}
function matchingAccount(vault, source) {
    // Identity hydration may rename the key while a refresh is in flight.
    const id = vault.generations[source.id] === source.generation
        ? source.id
        : Object.keys(vault.accounts).find((key) => vault.generations[key] === source.generation);
    const current = storedAccount(vault, id);
    return current?.version === source.version ? current : undefined;
}
export async function listStoredSessions(provider, path) {
    const vault = asVault(provider, (await loadStore(path))[provider]);
    return Object.keys(vault.accounts).map((id) => storedAccount(vault, id));
}
export async function getStoredSession(provider, id, path) {
    const file = path ?? authFilePath();
    // A read opened before rotation must settle before that rotation's owner retires.
    return serialize(file, async () => {
        const vault = asVault(provider, (await loadStore(file))[provider]);
        const key = typeof id === 'string' && id.trim() ? id.trim() : vault.activeId;
        return storedAccount(vault, key);
    });
}
/** Only update the login/credentials that produced the result; never activate it. */
export async function updateAccountSession(provider, source, session, path, nextId) {
    const file = path ?? authFilePath();
    return serialize(file, async () => {
        const store = await loadStore(file);
        const vault = asVault(provider, store[provider]);
        const current = matchingAccount(vault, source);
        if (!current)
            return undefined;
        // An identity label must not overwrite another login already using that id.
        const id = nextId && (!Object.hasOwn(vault.accounts, nextId) || nextId === current.id)
            ? nextId : current.id;
        const merged = { ...current.session };
        const keys = new Set([...Object.keys(source.session), ...Object.keys(session)]);
        for (const key of keys) {
            if (!Object.hasOwn(session, key))
                delete merged[key];
            else if (!isDeepStrictEqual(session[key], source.session[key]))
                merged[key] = session[key];
        }
        vault.accounts[id] = merged;
        vault.generations[id] = current.generation;
        if (id !== current.id) {
            delete vault.accounts[current.id];
            delete vault.generations[current.id];
            if (vault.activeId === current.id)
                vault.activeId = id;
        }
        store[provider] = vault;
        await writeStore(store, file);
        return storedAccount(vault, id);
    });
}
export async function replaceAccountId(provider, source, session, path) {
    return updateAccountSession(provider, source, session, path, accountIdOf(provider, session));
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
        vault.generations[id] = randomUUID();
        if (activate || !vault.activeId || !vault.accounts[vault.activeId])
            vault.activeId = id;
        store[provider] = vault;
        await writeStore(store, file);
        return storedAccount(vault, id);
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
export async function deleteSession(provider, path, id, source) {
    const file = path ?? authFilePath();
    return serialize(file, async () => {
        const store = await loadStore(file);
        const vault = asVault(provider, store[provider]);
        const target = source ? matchingAccount(vault, source)?.id
            : (typeof id === 'string' && id.trim() ? id.trim() : vault.activeId);
        if (!target || !Object.hasOwn(vault.accounts, target))
            return false;
        delete vault.accounts[target];
        delete vault.generations[target];
        if (vault.activeId === target) {
            vault.activeId = Object.keys(vault.accounts)[0];
        }
        if (!vault.activeId)
            delete store[provider];
        else
            store[provider] = vault;
        await writeStore(store, file);
        return true;
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
    if (provider === 'antigravity') {
        return {
            account: session.account,
            planType,
            planLabel,
            expiresAt: session.expiresAt,
            needsValidation: session.needsValidation === true,
            validationUrl: typeof session.validationUrl === 'string' && session.validationUrl.trim()
                ? session.validationUrl.trim()
                : undefined,
        };
    }
    if (provider === 'cursor') {
        return {
            account: displayCursorAccount(session),
            planType,
            planLabel,
            method: session.source,
            methodLabel: session.source === 'cli_keychain'
                ? 'CLI'
                : session.source === 'ide_vscdb'
                    ? 'IDE'
                    : session.source === 'env'
                        ? 'env'
                        : session.source === 'pkce'
                            ? 'PKCE'
                            : undefined,
            expiresAt: session.expiresAt,
        };
    }
    if (provider === 'ollama') {
        return {
            account: session.account,
            planType,
            planLabel,
            method: session.source,
            methodLabel: ollamaSourceLabel(session.source),
            expiresAt: session.expiresAt,
        };
    }
    if (provider === 'kimi') {
        return {
            account: session.account,
            planType,
            planLabel,
            method: session.source,
            methodLabel: kimiSourceLabel(session.source),
            expiresAt: session.expiresAt,
        };
    }
    if (provider === 'copilot') {
        return {
            account: session.account,
            planType,
            planLabel,
            method: session.source,
            methodLabel: copilotSourceLabel(session.source),
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
