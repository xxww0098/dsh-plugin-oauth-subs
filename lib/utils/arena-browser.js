/** Visible Chrome owned by the plugin; no host browser API or cookie replay. */
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ARENA_CATEGORIES, ARENA_LEADERBOARD_URL, extractFlightObject, extractFlightTextFromHtml, parseArenaBoard } from './arena.js';
export function arenaChromePaths(platform = process.platform, env = process.env) {
    if (platform === 'darwin')
        return [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        ];
    if (platform === 'win32')
        return [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)']]
            .filter((root) => !!root)
            .map(root => win32.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    if (platform === 'linux')
        return ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/opt/google/chrome/chrome'];
    return [];
}
async function findChrome() {
    for (const path of arenaChromePaths()) {
        try {
            await access(path, constants.X_OK);
            return path;
        }
        catch { /* try next installation */ }
    }
    throw new Error('Chrome not found. Install Google Chrome on the machine running the plugin and retry.');
}
export async function fetchArenaWithChrome({ signal: parentSignal, timeoutMs = 180_000, chromePath, spawnImpl = spawn, } = {}) {
    const signal = AbortSignal.any([...(parentSignal ? [parentSignal] : []), AbortSignal.timeout(timeoutMs)]);
    signal.throwIfAborted();
    const bin = chromePath ?? await findChrome();
    const profile = await mkdtemp(join(tmpdir(), 'arena-plugin-chrome-'));
    let child;
    let input;
    let output;
    let exited;
    let dead;
    let nextId = 0;
    let tail = '';
    const pending = new Map();
    const fail = (error) => {
        dead ??= error;
        for (const task of pending.values()) {
            clearTimeout(task.timer);
            task.reject(dead);
        }
        pending.clear();
    };
    const abort = () => fail(new Error(signal.reason?.name === 'TimeoutError'
        ? 'Chrome verification timed out. Retry and complete verification in the Chrome window.'
        : 'Chrome verification cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    function call(method, params = {}, sessionId) {
        if (signal.aborted)
            abort();
        if (dead)
            return Promise.reject(dead);
        return new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome stopped responding. Close the verification window and retry.')); }, 10_000);
            pending.set(id, { resolve, reject, timer });
            input.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
        });
    }
    try {
        signal.throwIfAborted();
        child = spawnImpl(bin, [
            '--remote-debugging-pipe', '--user-data-dir=' + profile,
            '--no-first-run', '--no-default-browser-check', 'about:blank',
        ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
        exited = new Promise(resolve => { child.once('exit', () => resolve()); child.once('error', () => resolve()); });
        child.once('error', () => fail(new Error('Could not start Chrome. Check the Chrome installation and retry.')));
        child.once('exit', () => fail(new Error('Chrome closed before verification completed. Retry browser verification.')));
        input = child.stdio[3];
        output = child.stdio[4];
        input.on('error', () => fail(new Error('Chrome connection closed. Retry browser verification.')));
        output.on('error', () => fail(new Error('Chrome connection closed. Retry browser verification.')));
        output.setEncoding('utf8');
        output.on('data', (chunk) => {
            tail += chunk;
            if (tail.length > 16 * 1024 * 1024) {
                fail(new Error('Chrome response too large'));
                return;
            }
            let end;
            while ((end = tail.indexOf('\0')) >= 0) {
                const raw = tail.slice(0, end);
                tail = tail.slice(end + 1);
                if (!raw)
                    continue;
                let message;
                try {
                    message = JSON.parse(raw);
                }
                catch {
                    fail(new Error('Invalid Chrome response'));
                    return;
                }
                const task = pending.get(message.id);
                if (!task)
                    continue;
                pending.delete(message.id);
                clearTimeout(task.timer);
                if (message.error)
                    task.reject(new Error(message.error.message));
                else
                    task.resolve(message.result);
            }
        });
        const { targetId } = await call('Target.createTarget', { url: ARENA_LEADERBOARD_URL });
        const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
        const boards = {};
        for (const category of ARENA_CATEGORIES) {
            if (category.path)
                await call('Page.navigate', { url: ARENA_LEADERBOARD_URL + category.path }, sessionId);
            while (!boards[category.id]) {
                let result;
                try {
                    result = await call('Runtime.evaluate', {
                        expression: 'location.href === ' + JSON.stringify(ARENA_LEADERBOARD_URL + category.path)
                            + ' ? JSON.stringify({url:location.href,html:document.documentElement.outerHTML}) : ""', returnByValue: true,
                    }, sessionId);
                }
                catch (error) {
                    if (dead || !/context.*destroyed|Cannot find context|target navigated/i.test(String(error)))
                        throw error;
                }
                if (typeof result?.result?.value === 'string') {
                    try {
                        const page = JSON.parse(result.result.value);
                        if (page.url === ARENA_LEADERBOARD_URL + category.path) {
                            const flight = extractFlightTextFromHtml(page.html);
                            // The snapshot chunk can arrive before the cost chunk; don't cache half a board.
                            if (Array.isArray(extractFlightObject(flight, 'costStats')?.entries)) {
                                const board = parseArenaBoard(flight);
                                if (Number.isFinite(Date.parse(board.lastUpdated)))
                                    boards[category.id] = board;
                            }
                        }
                    }
                    catch { /* navigation or streamed HTML is not ready yet */ }
                }
                if (!boards[category.id])
                    await delay(500, undefined, { signal });
            }
        }
        signal.throwIfAborted();
        return boards;
    }
    catch (error) {
        if (signal.aborted) {
            abort();
            throw dead;
        }
        if (/No session|No target|Target closed|Session closed/i.test(String(error))) {
            throw new Error('The Chrome verification page was closed. Retry browser verification.');
        }
        throw error;
    }
    finally {
        signal.removeEventListener('abort', abort);
        fail(new Error('Chrome verification finished'));
        if (child?.pid && child.exitCode === null && child.signalCode === null) {
            child.kill('SIGTERM');
            await Promise.race([exited, delay(2000, undefined, { ref: false })]);
            if (child.exitCode === null && child.signalCode === null) {
                child.kill('SIGKILL');
                await Promise.race([exited, delay(2000, undefined, { ref: false })]);
            }
        }
        input?.destroy();
        output?.destroy();
        await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    }
}
