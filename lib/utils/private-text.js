/**
 * Private (0600) text-file helpers shared by the oauth and apikey modules.
 * Extracted from oauth/store.ts so apikey does not import the OAuth store.
 */
import { constants } from 'node:fs';
import { appendFile, chmod, mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { errorCode } from './http.js';
export async function readPrivateText(path, label, { allowBroadMode = false } = {}) {
    let handle;
    try {
        handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    }
    catch (error) {
        if (errorCode(error) === 'ENOENT')
            return undefined;
        if (errorCode(error) === 'ELOOP')
            throw new Error(label + ' at ' + path + ' must not be a symbolic link');
        throw error;
    }
    try {
        const info = await handle.stat();
        if (!info.isFile())
            throw new Error(label + ' at ' + path + ' must be a regular file');
        if (typeof process.getuid === 'function' && info.uid !== process.getuid()) {
            throw new Error(label + ' at ' + path + ' must be owned by the current user');
        }
        if (!allowBroadMode && process.platform !== 'win32' && (info.mode & 0o077) !== 0) {
            throw new Error(label + ' at ' + path + ' must not be accessible by group or other users');
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
    const tmp = path + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2);
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
/**
 * Append one line to a private (0600) diagnostic log, rotating it to `.1`
 * past `maxBytes` (one generation kept). Not state: a torn line loses only
 * itself, so no temp file + rename.
 */
export async function appendPrivateLine(path, line, maxBytes = 1_000_000, { noFollow = false } = {}) {
    if (noFollow)
        return appendNoFollow(path, line, maxBytes);
    const size = (await stat(path).catch(() => undefined))?.size ?? 0;
    if (size > maxBytes)
        await rename(path, `${path}.1`);
    await appendFile(path, `${line}\n`, { mode: 0o600 });
}
/** Opt-in descriptor route for logs that must refuse links and broad parents. */
async function appendNoFollow(path, line, maxBytes) {
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const parent = await open(dirname(path), constants.O_RDONLY | noFollow);
    try {
        const info = await parent.stat();
        if (!info.isDirectory() || (typeof process.getuid === 'function' && info.uid !== process.getuid())
            || (process.platform !== 'win32' && (info.mode & 0o077) !== 0))
            throw new Error('diagnostic directory must be private');
    }
    finally {
        await parent.close();
    }
    const openChecked = async () => {
        const handle = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT
            | noFollow | (constants.O_NONBLOCK ?? 0), 0o600);
        try {
            const info = await handle.stat();
            if (!info.isFile() || info.nlink > 1 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
                throw new Error('diagnostic log must be a regular file owned by this user');
            }
            await handle.chmod(0o600);
            return { handle, size: info.size };
        }
        catch (error) {
            await handle.close();
            throw error;
        }
    };
    let opened = await openChecked();
    try {
        if (opened.size > maxBytes) {
            await opened.handle.close();
            await rename(path, path + '.1');
            opened = await openChecked();
        }
        await opened.handle.writeFile(line + '\n');
    }
    finally {
        await opened.handle.close().catch(() => { });
    }
}
