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
    let activeSession;
    let navigationFrame;
    const documents = new Map();
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
    function call(method, params = {}, sessionId, timeout = 10_000) {
        if (signal.aborted)
            abort();
        if (dead)
            return Promise.reject(dead);
        return new Promise((resolve, reject) => {
            const id = ++nextId;
            const timer = setTimeout(() => { pending.delete(id); reject(new Error('Chrome stopped responding. Close the verification window and retry.')); }, timeout);
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
                const params = message.params;
                if (message.method === 'Network.responseReceived' && message.sessionId === activeSession
                    && params?.type === 'Document' && params.frameId === navigationFrame) {
                    documents.set(params.loaderId, { requestId: params.requestId, url: params.response.url, status: params.response.status, mimeType: params.response.mimeType });
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
        const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
        activeSession = sessionId;
        await call('Page.enable', {}, sessionId);
        await call('Network.enable', {}, sessionId);
        // Keep the visible page available for verification; only poll a small readiness flag.
        const waitReady = async (url, previousLoader) => {
            while (true) {
                let ready;
                try {
                    // Page.navigate can return while the previous document still reports ready.
                    const frame = (await call('Page.getFrameTree', {}, sessionId)).frameTree?.frame;
                    const document = documents.get(frame?.loaderId);
                    if (frame?.url === url && document && document.status !== 200 && document.status !== 403) {
                        throw new Error('Chrome navigation HTTP ' + document.status + '. The cached snapshot was kept.');
                    }
                    if (previousLoader !== undefined && frame?.loaderId && frame.loaderId !== previousLoader && frame.url !== url) {
                        const current = new URL(frame.url);
                        const expected = new URL(url);
                        // Cloudflare temporarily decorates this same page with __cf_chl_* query parameters.
                        if (current.origin !== expected.origin || current.pathname !== expected.pathname) {
                            throw new Error('Chrome navigation changed. The cached snapshot was kept.');
                        }
                    }
                    if (document?.status === 200 && frame?.url === url && (previousLoader === undefined || frame.loaderId !== previousLoader)) {
                        ready = await call('Runtime.evaluate', {
                            expression: 'location.href === ' + JSON.stringify(url) + ' && document.readyState === "complete"'
                                + ' && !document.querySelector("#challenge-form") && !/just a moment|attention required/i.test(document.title)',
                            returnByValue: true,
                        }, sessionId);
                    }
                }
                catch (error) {
                    if (dead || !/context.*destroyed|Cannot find context|target navigated/i.test(String(error)))
                        throw error;
                }
                if (ready?.result?.value === true)
                    return;
                await delay(500, undefined, { signal });
            }
        };
        const navigate = async (url) => {
            const { frameTree } = await call('Page.getFrameTree', {}, sessionId);
            navigationFrame = frameTree?.frame?.id;
            documents.clear();
            const navigation = await call('Page.navigate', { url }, sessionId);
            if (navigation.errorText)
                throw new Error('Chrome navigation failed. Retry browser verification.');
            await waitReady(url, frameTree?.frame?.loaderId ?? '');
        };
        await navigate(ARENA_LEADERBOARD_URL);
        // This function is serialized into Chrome: no Node closure, cookie extraction or DOM data reads.
        const collect = async (request, urls) => Promise.all(urls.map(async (url) => {
            const response = await request(url, {
                headers: { RSC: '1', accept: 'text/x-component' },
                mode: 'same-origin', credentials: 'same-origin', redirect: 'error',
                signal: AbortSignal.timeout(20_000),
            });
            const contentType = response.headers.get('content-type') ?? '';
            return {
                status: response.status, contentType,
                challenged: response.status === 403 && response.headers.get('cf-mitigated') === 'challenge',
                text: response.ok && contentType.split(';')[0].trim().toLowerCase() === 'text/x-component' ? await response.text() : '',
            };
        }));
        const urls = ARENA_CATEGORIES.map(category => ARENA_LEADERBOARD_URL + category.path + '?_rsc=1');
        const result = await call('Runtime.evaluate', {
            expression: 'location.href === ' + JSON.stringify(ARENA_LEADERBOARD_URL)
                + ' ? (' + collect.toString() + ')(fetch.bind(globalThis),' + JSON.stringify(urls) + ') : null',
            awaitPromise: true, returnByValue: true,
        }, sessionId, 25_000);
        if (result.exceptionDetails)
            throw new Error('Chrome could not fetch Arena RSC data. Check the connection and retry browser verification.');
        const payloads = result.result?.value;
        if (!Array.isArray(payloads) || payloads.length !== ARENA_CATEGORIES.length)
            throw new Error('Chrome returned incomplete Arena RSC data. Retry browser verification.');
        const boards = {};
        for (const [index, category] of ARENA_CATEGORIES.entries()) {
            const payload = payloads[index];
            const label = 'arena ' + (category.path || '/overall');
            let text = payload?.text;
            if (payload?.challenged) {
                // Fresh profiles can navigate successfully while fetch is still challenged.
                // Read the original navigation response once, never the rendered DOM.
                const url = ARENA_LEADERBOARD_URL + category.path;
                if (category.path)
                    await navigate(url);
                await waitReady(url);
                const { frameTree } = await call('Page.getFrameTree', {}, sessionId);
                if (frameTree?.frame?.url !== url)
                    throw new Error(label + ': Chrome navigation changed. The cached snapshot was kept.');
                // Bind to the current document loader/request, not a URL-keyed cached challenge.
                const document = documents.get(frameTree.frame.loaderId);
                if (!document || document.url !== url || document.status !== 200 || document.mimeType !== 'text/html') {
                    throw new Error(label + ': Chrome navigation response is unavailable. The cached snapshot was kept.');
                }
                const resource = await call('Network.getResponseBody', { requestId: document.requestId }, sessionId);
                const html = typeof resource.body === 'string' ? (resource.base64Encoded ? Buffer.from(resource.body, 'base64').toString('utf8') : resource.body) : '';
                text = extractFlightTextFromHtml(html);
                if (!text)
                    throw new Error(label + ': Cloudflare challenge; navigation response has no leaderboard data. The cached snapshot was kept.');
            }
            else {
                if (payload?.status !== 200)
                    throw new Error(label + ': HTTP ' + payload?.status);
                if (typeof payload.contentType !== 'string' || payload.contentType.split(';')[0].trim().toLowerCase() !== 'text/x-component') {
                    throw new Error(label + ': unexpected content type. Retry browser verification; the cached snapshot was kept.');
                }
            }
            if (typeof text !== 'string' || !Array.isArray(extractFlightObject(text, 'costStats')?.entries)) {
                throw new Error(label + ': incomplete RSC payload (costStats missing). The cached snapshot was kept.');
            }
            const board = parseArenaBoard(text);
            if (!Number.isFinite(Date.parse(board.lastUpdated)))
                throw new Error(label + ': invalid snapshot date. The cached snapshot was kept.');
            boards[category.id] = board;
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
