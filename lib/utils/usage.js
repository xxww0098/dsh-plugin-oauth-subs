/**
 * Model usage for the 用量 tab, read from what DSH already writes: the
 * `usage` on every `assistant/message` in the session files. The proxy
 * records nothing, so the request path pays nothing.
 *
 * The scan runs in a worker thread (this same module) so decoding hundreds of
 * MB of zstd never blocks the proxy's event loop. Each file's hourly rows are
 * cached by mtime + size in `usage-cache.json`; a repeat open re-reads only
 * the sessions that changed since.
 */
import { statSync } from 'node:fs';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { readPrivateText, writePrivateText } from './private-text.js';
import { attemptFailure, frameTimes, readSessionText, sessionFiles, usageOf } from './analyze-session.js';
const HOUR_MS = 3_600_000;
// 3: decode speed skips burst replies; older entries still carry them.
const CACHE_VERSION = 3;
const DECODE_FLOOR_MS = 1_000;
/** Every event line starts with its type; only these few are parsed. */
const TYPE_PREFIX = /^\{"type":"([^"]+)"/;
const PARSED = new Set(['session', 'request/header', 'step/start', 'llm/retry-started', 'llm/retry', 'assistant/attempt', 'assistant/message']);
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
/**
 * One session file → hourly rows per provider/model. Only the head and the
 * few small event types above are JSON-parsed; tool output, system prompts
 * and chunk runs (most of the bytes) are skipped by their type prefix.
 * Failure and retry bookkeeping mirrors analyze-session's `sessionRecords`.
 */
export function scanSessionText(text, fallbackId) {
    let id = fallbackId;
    let version = 0;
    let provider = '(unknown)';
    let model = '(unknown)';
    const buckets = new Map();
    const seen = new Set();
    const starts = new Map();
    const pending = new Map();
    const failures = [];
    const rowOf = (time, rowProvider, rowModel) => {
        const hour = Math.floor(time / HOUR_MS);
        const key = `${hour}\0${rowProvider}\0${rowModel}`;
        return buckets.get(key) ?? buckets.set(key, [hour, rowProvider, rowModel, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).get(key);
    };
    let start = 0;
    while (start < text.length) {
        let end = text.indexOf('\n', start);
        if (end === -1)
            end = text.length;
        const line = text.slice(start, end);
        start = end + 1;
        const type = TYPE_PREFIX.exec(line)?.[1];
        if (!type || !PARSED.has(type))
            continue;
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            continue;
        }
        const data = event.data ?? {};
        const key = data.turn != null && data.step != null ? `${data.turn}:${data.step}` : null;
        if (type === 'session') {
            if (typeof event.id === 'string')
                id = event.id;
            version = num(event.version);
        }
        else if (type === 'request/header') {
            const config = data.header?.config ?? data.config ?? {};
            if (config.provider) {
                provider = String(config.provider);
                model = String(config.model ?? '(unknown)');
            }
        }
        else if (type === 'step/start' || type === 'llm/retry-started') {
            if (key) {
                starts.set(key, event.time);
                pending.delete(key);
            }
        }
        else if (type === 'llm/retry') {
            if (pending.has(key))
                pending.get(key).retried = true;
        }
        else if (type === 'assistant/attempt') {
            if (attemptFailure(event) && typeof event.time === 'number') {
                failures.push(pending.set(key, { provider, model, time: event.time }).get(key));
            }
        }
        else if (typeof event.time === 'number') {
            const usage = usageOf(event);
            if (!usage)
                continue;
            // The host can rewrite a step's message; count each step once.
            const callKey = key ?? `seq:${event.seq}`;
            if (seen.has(callKey))
                continue;
            seen.add(callKey);
            const source = data.message?.source ?? {};
            const row = rowOf(event.time, String(source.provider ?? provider), String(source.model ?? model));
            const input = num(usage.inputTokens);
            const output = num(usage.outputTokens);
            const cacheRead = num(usage.cacheReadTokens);
            row[3] += 1;
            row[4] += input;
            row[5] += output;
            row[6] += cacheRead;
            row[7] += num(usage.cacheWriteTokens);
            if (Object.prototype.hasOwnProperty.call(usage, 'cacheReadTokens'))
                row[9] += input + cacheRead;
            const times = frameTimes(Array.isArray(data.stream) ? data.stream : []);
            const begun = key ? starts.get(key) : undefined;
            if (times.length && typeof begun === 'number' && times[0] >= begun) {
                row[10] += 1;
                row[11] += times[0] - begun;
                // A reply delivered in one burst (most Antigravity replies land in ~5
                // frames within 200 ms) says nothing about decode speed.
                // ponytail: fixed 1 s floor; weight by frame count if it misleads.
                const writing = times[times.length - 1] - times[0];
                if (output > 0 && writing >= DECODE_FLOOR_MS) {
                    row[12] += writing;
                    row[13] += output;
                }
            }
        }
    }
    for (const failure of failures)
        if (!failure.retried)
            rowOf(failure.time, failure.provider, failure.model)[8] += 1;
    return { id, version, rows: [...buckets.values()] };
}
/**
 * Every session under `root` touched since `since` → merged hourly rows at or
 * after `since`, plus the same window as one aggregate per session (the 用量
 * tab's 按会话 list; `lastAt` is the file's mtime — when the session last
 * wrote). The same session may exist as v3 and v4 copies; only the highest
 * version counts. Returns the refreshed cache alongside.
 */
export function scanUsage(root, since, cache = {}, statFile = statSize) {
    const files = {};
    let paths = [];
    try {
        paths = sessionFiles(root, since);
    }
    catch { /* no sessions dir yet */ }
    for (const path of paths) {
        const info = statFile(path);
        if (!info)
            continue;
        const old = cache[path];
        if (old && old.mtimeMs === info.mtimeMs && old.size === info.size) {
            files[path] = old;
            continue;
        }
        try {
            files[path] = { ...info, ...scanSessionText(readSessionText(path), path) };
        }
        catch { /* unreadable or mid-write: next scan retries */ }
    }
    const best = new Map();
    for (const entry of Object.values(files)) {
        if ((best.get(entry.id)?.version ?? -1) < entry.version)
            best.set(entry.id, entry);
    }
    const sinceHour = Math.floor(since / HOUR_MS);
    const inWindow = (row) => row[0] >= sinceHour;
    const rows = [...best.values()].flatMap((entry) => entry.rows.filter(inWindow));
    const sessions = [...best.values()]
        .map((entry) => ({ id: entry.id, lastAt: entry.mtimeMs, rows: entry.rows.filter(inWindow) }))
        .filter((session) => session.rows.length > 0)
        .sort((a, b) => b.lastAt - a.lastAt);
    return { rows, sessions, files };
}
function statSize(path) {
    try {
        // Sync is fine: this only ever runs inside the worker.
        const info = statSync(path);
        return { mtimeMs: info.mtimeMs, size: info.size };
    }
    catch {
        return undefined;
    }
}
async function runWorker({ root, since, cachePath }) {
    let cache = {};
    try {
        const saved = JSON.parse((await readPrivateText(cachePath, 'oauth-subs usage cache')) ?? '{}');
        if (saved?.v === CACHE_VERSION && saved.files && typeof saved.files === 'object')
            cache = saved.files;
    }
    catch { /* corrupt cache: rescan */ }
    const { rows, sessions, files } = scanUsage(root, since, cache);
    const changed = Object.keys(files).length !== Object.keys(cache).length
        || Object.entries(files).some(([path, entry]) => cache[path] !== entry);
    if (changed)
        await writePrivateText(cachePath, JSON.stringify({ v: CACHE_VERSION, files })).catch(() => { });
    return { rows, sessions };
}
let inflight;
/**
 * Hourly usage rows and per-session aggregates since `days` ago, scanned
 * off-thread. Concurrent callers share one scan. ponytail: a worker per
 * request (~30 ms start); keep one alive only if the tab ever polls.
 */
export function readUsage({ root, cachePath, days = 30, now = Date.now() }) {
    inflight ??= new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
            workerData: { kind: 'osubs-usage', root, cachePath, since: now - days * 24 * HOUR_MS },
        });
        worker.once('message', resolve);
        worker.once('error', reject);
        worker.once('exit', (code) => reject(new Error(`usage scan exited with code ${code}`)));
    }).finally(() => { inflight = undefined; });
    return inflight;
}
if (!isMainThread && workerData?.kind === 'osubs-usage') {
    runWorker(workerData).then((result) => parentPort?.postMessage(result), (error) => { throw error; });
}
