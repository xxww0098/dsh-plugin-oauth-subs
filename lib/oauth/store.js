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
export const PROVIDER_IDS = Object.freeze(['codex', 'grok']);
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
        if (parsed[provider] !== undefined)
            assertSessionShape(provider, parsed[provider]);
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
    return (await loadStore(path))[provider];
}
export async function saveSession(provider, session, path) {
    const file = path ?? authFilePath();
    return serialize(file, async () => {
        const store = await loadStore(file);
        store[provider] = session;
        await writeStore(store, file);
    });
}
export async function deleteSession(provider, path) {
    const file = path ?? authFilePath();
    return serialize(file, async () => {
        const store = await loadStore(file);
        if (store[provider] === undefined)
            return;
        delete store[provider];
        await writeStore(store, file);
    });
}
export function publicSession(provider, session) {
    if (session === undefined)
        return undefined;
    const planType = session.planType;
    const planLabel = formatPlanLabel(planType);
    if (provider === 'codex') {
        return {
            account: session.emailAddress ?? session.accountId,
            planType,
            planLabel,
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
