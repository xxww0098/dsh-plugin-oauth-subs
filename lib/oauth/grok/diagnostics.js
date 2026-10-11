/** Passive Grok cache evidence. Never log wire content or infer cached tokens. */
import { createHmac, randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { catalogRows } from '../../catalog/index.js';
import { appendPrivateLine } from '../../utils/private-text.js';
import { GROK_STABLE_SESSION } from './cache.js';
import { scanSseFrame } from '../responses-sse.js';
const BASELINE_CAP = 64;
const INPUT_ITEM_CAP = 512;
const PENDING_LINE_CAP = 128;
const FRAME_BYTE_CAP = 2 * 1024 * 1024;
const LOG_BYTE_CAP = 1_000_000;
const WORK_BYTE_CAP = 2 * 1024 * 1024;
const TERMINALS = new Set(['response.completed', 'response.incomplete', 'response.failed']);
const MODEL_IDS = new Set(catalogRows('grok').map(row => row.id));
// Keep salts/baselines comparable across compatible HMR, but not process restarts.
const STATE_KEY = Symbol.for('dsh-plugin-oauth-subs.grok.cache-diagnostics.v2');
const root = globalThis;
const state = root[STATE_KEY] ??= {
    salt: randomBytes(32), baselines: new Map(), tail: Promise.resolve(), pending: 0, dropped: 0,
};
let logPath;
export function setGrokCacheLog(path) { logPath = path; }
export function flushGrokCacheLog() { return state.tail; }
function fingerprintText(kind, text) {
    return createHmac('sha256', state.salt).update(kind).update('\0').update(text).digest('hex').slice(0, 24);
}
function fingerprint(kind, value) {
    return fingerprintText(kind, JSON.stringify(value) ?? 'null');
}
function writeRow(path, row) {
    if (state.pending >= PENDING_LINE_CAP) {
        state.dropped++;
        return Promise.resolve();
    }
    const line = JSON.stringify({ ...row, droppedLogLines: state.dropped });
    state.pending++;
    state.tail = state.tail.then(async () => {
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await appendPrivateLine(path, line, LOG_BYTE_CAP, { noFollow: true });
    }).catch(() => { state.dropped++; }).finally(() => { state.pending--; });
    return state.tail;
}
function tokens(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function requestSnapshot(payload, wireBody, cacheSessionId, pin) {
    const input = Array.isArray(payload.input) ? payload.input : [];
    const truncated = wireBody.byteLength > WORK_BYTE_CAP;
    // Reuse bytes that forwarding already serialized. Oversized bodies get a
    // labeled sample, no extra structural traversal or whole-body allocation.
    const context = truncated ? null : fingerprint('context', { model: payload.model, tools: payload.tools, instructions: payload.instructions });
    const snapshot = {
        time: Date.now(), context, truncated,
        prefix: truncated ? null : fingerprint('prefix', { context, leading: input[0] }),
        items: truncated ? [] : input.slice(0, INPUT_ITEM_CAP).map(item => {
            const serialized = JSON.stringify(item) ?? 'null';
            return { hash: fingerprintText('item', serialized), bytes: Buffer.byteLength(serialized) };
        }),
        itemCount: input.length, pinGeneration: pin?.generation ?? null,
    };
    const model = typeof payload.model === 'string' ? payload.model : '';
    const metadata = {
        version: 2, family: 'grok', processId: process.pid,
        model: model.length <= 256 && MODEL_IDS.has(model) ? model : 'other',
        modelFingerprint: fingerprint('model', { value: model.slice(0, 256), length: model.length }),
        conversationFingerprint: fingerprint('conversation', cacheSessionId),
        requestFingerprint: fingerprintText('request:' + wireBody.byteLength, wireBody.subarray(0, WORK_BYTE_CAP)),
        requestFingerprintTruncated: truncated, diagnosticWorkTruncated: truncated,
        prefixFingerprint: snapshot.prefix, contextFingerprint: context,
        pinAction: pin?.action ?? 'not_applicable', pinGeneration: snapshot.pinGeneration,
        pinEvicted: pin?.evicted ?? false, inputItems: input.length, stream: payload.stream === true,
        keyless: !cacheSessionId || cacheSessionId === GROK_STABLE_SESSION,
    };
    return { snapshot, metadata };
}
/** One factory per logical request. Retries must not become their own baseline. */
export function createGrokCacheObserver(payload, cacheSessionId, pin) {
    const path = logPath;
    if (!path)
        return undefined;
    let prepared;
    const comparisons = new Map();
    return ({ requestId, accountId, attempt, wireBody }) => {
        try {
            prepared ??= requestSnapshot(payload, wireBody, cacheSessionId, pin);
            const { snapshot, metadata } = prepared;
            const account = typeof accountId === 'string' ? fingerprint('account', accountId) : null;
            // Different profiles/accounts/models never supply each other's baseline.
            const key = fingerprint('baseline', { path, account, conversation: metadata.conversationFingerprint, model: metadata.modelFingerprint });
            let comparison = comparisons.get(key);
            if (!comparison) {
                const previous = metadata.keyless ? undefined : state.baselines.get(key);
                let sharedInputItems = 0, sharedInputBytes = 0;
                if (snapshot.context !== null && previous?.context === snapshot.context) {
                    while (sharedInputItems < Math.min(previous.items.length, snapshot.items.length)
                        && previous.items[sharedInputItems].hash === snapshot.items[sharedInputItems].hash) {
                        sharedInputBytes += snapshot.items[sharedInputItems++].bytes;
                    }
                }
                const unknownPrefix = snapshot.truncated || previous?.truncated === true;
                comparison = {
                    sharedInputItems: unknownPrefix ? null : sharedInputItems,
                    sharedInputBytes: unknownPrefix ? null : sharedInputBytes,
                    prefixChanged: previous && !unknownPrefix ? previous.prefix !== snapshot.prefix : null,
                    previousRequestGapMs: previous ? Math.max(0, snapshot.time - previous.time) : null,
                    previousPinGeneration: previous?.pinGeneration ?? null,
                    baselineTruncated: unknownPrefix || snapshot.itemCount > INPUT_ITEM_CAP || (previous?.itemCount ?? 0) > INPUT_ITEM_CAP,
                };
                if (!metadata.keyless) {
                    state.baselines.delete(key);
                    if (state.baselines.size >= BASELINE_CAP)
                        state.baselines.delete(state.baselines.keys().next().value);
                    state.baselines.set(key, snapshot);
                }
                if (comparisons.size >= BASELINE_CAP)
                    comparisons.delete(comparisons.keys().next().value);
                comparisons.set(key, comparison);
            }
            const row = { ...metadata, ...comparison, accountFingerprint: account,
                requestIdFingerprint: fingerprint('request-id', requestId), attempt, requestStartedAt: snapshot.time };
            void writeRow(path, { ...row, event: 'request', time: Date.now() });
            return responseObserver(path, row, metadata.stream);
        }
        catch {
            return undefined;
        } // Diagnostics can never reject a valid hop.
    };
}
function responseObserver(path, row, stream) {
    let buffer = Buffer.alloc(4096), length = 0;
    let skipping = false, truncated = false, lineHasData = false, pendingNewline = false, lastCR = false;
    let status = null, terminal = null;
    let usage;
    let finished;
    const inspect = (data) => {
        const u = data?.usage;
        if (!u || typeof u !== 'object')
            return;
        const inputTokens = tokens(u.input_tokens);
        const cache = tokens(u.input_tokens_details?.cached_tokens);
        usage = { inputTokens, outputTokens: tokens(u.output_tokens),
            cacheReadTokens: cache !== null && (inputTokens === null || cache <= inputTokens) ? cache : null };
    };
    const append = (bytes) => {
        if (skipping)
            return;
        const needed = length + bytes.byteLength;
        if (needed > FRAME_BYTE_CAP) {
            length = 0;
            skipping = true;
            truncated = true;
            return;
        }
        if (needed > buffer.length) {
            const next = Buffer.alloc(Math.min(FRAME_BYTE_CAP, Math.max(needed, buffer.length * 2)));
            buffer.copy(next, 0, 0, length);
            buffer = next;
        }
        buffer.set(bytes, length);
        length = needed;
    };
    const frame = () => {
        const text = buffer.toString('utf8', 0, length);
        const scanned = scanSseFrame(text);
        if (scanned.type && TERMINALS.has(scanned.type)) {
            const data = scanSseFrame(text, scanned.type).data;
            if (data) {
                terminal = scanned.type;
                inspect(data.response);
            }
        }
    };
    const newline = Uint8Array.of(10);
    return {
        status(code) { status = Number.isInteger(code) && code >= 100 && code <= 599 ? code : null; },
        push(chunk) {
            if (finished)
                return;
            try {
                if (!stream) {
                    append(chunk);
                    return;
                }
                // Normalize CR, LF and split CRLF at line boundaries. Delay the last
                // newline until another content line: closing delimiters never count
                // against the bounded frame body. Copy spans, not per-byte strings.
                let at = 0;
                while (at < chunk.byteLength) {
                    if (lastCR) {
                        lastCR = false;
                        if (chunk[at] === 10) {
                            at++;
                            continue;
                        }
                    }
                    const lf = chunk.indexOf(10, at), cr = chunk.indexOf(13, at);
                    const end = Math.min(lf < 0 ? chunk.byteLength : lf, cr < 0 ? chunk.byteLength : cr);
                    if (end > at) {
                        if (pendingNewline)
                            append(newline);
                        pendingNewline = false;
                        append(chunk.subarray(at, end));
                        lineHasData = true;
                        at = end;
                    }
                    if (at === chunk.byteLength)
                        break;
                    const separator = chunk[at++];
                    if (lineHasData) {
                        lineHasData = false;
                        pendingNewline = true;
                    }
                    else {
                        if (!skipping && length)
                            frame();
                        length = 0;
                        skipping = false;
                        pendingNewline = false;
                    }
                    lastCR = separator === 13;
                }
            }
            catch {
                length = 0;
                truncated = true;
            }
        },
        finish() {
            if (finished)
                return finished;
            if (!stream && !skipping && length) {
                try {
                    inspect(JSON.parse(buffer.toString('utf8', 0, length)));
                    terminal = 'json';
                }
                catch { /* unknown, not zero */ }
            }
            buffer = Buffer.alloc(0);
            finished = writeRow(path, { ...row, event: 'response', time: Date.now(), status, terminal,
                inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
                cacheReadTokens: usage?.cacheReadTokens ?? null, observationTruncated: truncated });
            return finished;
        },
    };
}
