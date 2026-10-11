/**
 * Codex WebSocket transport (chatgpt.com/backend-api/codex/responses).
 *
 * The backend also speaks Responses over WebSocket with connection-scoped
 * state: with `store:false` the connection itself keeps the conversation, so
 * turn N+1 may send `previous_response_id` plus only the input delta instead
 * of the whole history (wire shape below written against the public client
 * cited in the family README 归因, earendil-works/pi
 * packages/ai/src/api/openai-codex-responses.ts; nothing here is invented).
 *
 * - Upgrade: same path as the POST, `OpenAI-Beta: responses_websockets=
 *   2026-02-06`, `session-id` + `x-client-request-id` (no `thread-id` —
 *   pi sends neither on upgrade; HTTP hop keeps its three-header set).
 * - Request: one text frame `{type:"response.create", ...body}` as plain
 *   JSON — the zstd request encoding is HTTP-only.
 * - Response: one JSON event per message (same objects as the SSE `data:`
 *   lines); `response.done` arrives WS-side and is renamed `completed` on
 *   the wire we emit, so the host sees exactly the SSE event set.
 * - `error` / `response.failed` events are failures; `previous_response_not_found`
 *   clears the continuation and resends the full input once.
 *
 * Continuation guard: the delta is only used when the new body matches the
 * last one except `input`, and the new input covers [last input, last
 * response output] item for item. Comparison is key-order-insensitive and
 * allows the host's replay to carry extra fields (phase, namespace); any
 * doubt sends the full input. Only this family; never another vendor's ids.
 */
import { outboundWebsocketDispatcher, OutboundWebSocket } from '../../utils/outbound.js';
import { CODEX_CLIENT_VERSION, codexCredentialHeaders } from './index.js';
import { SseFrameScanner } from '../responses-sse.js';
import { MAX_GATE_BUFFER_BYTES, MAX_UNCLASSIFIED_BYTES, UpstreamFailure, waitForDrain } from '../upstream.js';
export const CODEX_WS_BETA = 'responses_websockets=2026-02-06';
/** pi's connect budget; the SSE first-byte budget (120s) still applies above it. */
const CONNECT_TIMEOUT_MS = 15_000;
/** An idle pooled socket closes after this, so a parked conversation ends. */
export const CODEX_WS_IDLE_TTL_MS = 5 * 60_000;
/** pi's hard age limit: connections are recycled even when busy-ish. */
const CODEX_WS_MAX_AGE_MS = 55 * 60_000;
/** After a WS fault the session rides SSE for this long, then WS is retried. */
const CODEX_WS_FALLBACK_COOLDOWN_MS = 5 * 60_000;
const TERMINAL_EVENT_TYPES = new Set(['response.completed', 'response.done', 'response.incomplete']);
const PREVIOUS_RESPONSE_NOT_FOUND = 'previous_response_not_found';
const WEBSOCKET_CONNECTION_LIMIT = 'websocket_connection_limit_reached';
// Compatible module graphs share this Codex-only, process-local state (the
// grok/cache.ts pattern): a hot reload must not orphan live sockets. A new
// schema bumps the version key; nothing is shared with another family.
const POOL_STATE_KEY = Symbol.for('dsh-plugin-oauth-subs.codex.ws-pool.v1');
const poolRoot = globalThis;
const poolState = poolRoot[POOL_STATE_KEY] ??= { conns: new Map(), fallbackUntil: new Map() };
const POOL = poolState.conns;
const FALLBACK_UNTIL = poolState.fallbackUntil;
/**
 * The transport is opt-in: `DSH_CODEX_WEBSOCKET=on`. Off by default until the
 * backend's WS behaviour is live-confirmed (README 对话 section); the SSE hop
 * stays the default wire, and every other value (or none) keeps it that way.
 */
export function codexWebSocketEnabled() {
    return String(process.env.DSH_CODEX_WEBSOCKET ?? '').trim().toLowerCase() === 'on';
}
export function codexWebSocketCooling(cacheSessionId) {
    const until = FALLBACK_UNTIL.get(cacheSessionId);
    if (until === undefined)
        return false;
    if (until <= Date.now()) {
        FALLBACK_UNTIL.delete(cacheSessionId);
        return false;
    }
    return true;
}
export function markCodexWebSocketFallback(cacheSessionId) {
    FALLBACK_UNTIL.set(cacheSessionId, Date.now() + CODEX_WS_FALLBACK_COOLDOWN_MS);
}
export function codexWebSocketPoolSize() {
    let count = 0;
    for (const perAccount of POOL.values())
        count += perAccount.size;
    return count;
}
/** Test/reset seam and the plugin-close hook: closes every pooled socket. */
export function closeCodexWebSockets() {
    for (const perAccount of POOL.values()) {
        for (const entry of perAccount.values())
            closeEntry(entry);
    }
    POOL.clear();
    FALLBACK_UNTIL.clear();
}
function closeEntry(entry) {
    if (entry.idleTimer)
        clearTimeout(entry.idleTimer);
    try {
        entry.socket.close(1000, 'done');
    }
    catch { /* already closed */ }
    void entry.dispatcher?.close().catch(() => { });
}
function dropEntry(cacheSessionId, accountId, entry) {
    const perAccount = POOL.get(cacheSessionId);
    if (perAccount?.get(accountId) !== entry)
        return;
    perAccount.delete(accountId);
    if (perAccount.size === 0)
        POOL.delete(cacheSessionId);
    closeEntry(entry);
}
/** Key-order-insensitive JSON, so host key drift cannot fake or break a match. */
export function stableJson(value) {
    return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
    if (Array.isArray(value))
        return value.map(sortKeys);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort())
            out[key] = sortKeys(value[key]);
        return out;
    }
    return value;
}
/**
 * True when `candidate` carries every field of `base` with the same value
 * (arrays in order); extra fields are allowed. The direction matters: the
 * server's own items identify the turn, the host's replay may add metadata.
 */
export function deepCovers(base, candidate) {
    if (base === candidate)
        return true;
    if (Array.isArray(base)) {
        if (!Array.isArray(candidate) || candidate.length !== base.length)
            return false;
        return base.every((item, index) => deepCovers(item, candidate[index]));
    }
    if (base && typeof base === 'object') {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
            return false;
        return Object.keys(base).every((key) => key in candidate && deepCovers(base[key], candidate[key]));
    }
    return false;
}
function bodyWithoutInput(payload) {
    const { input: _input, previous_response_id: _previous, ...rest } = payload ?? {};
    return rest;
}
/**
 * The delta for `payload` against a recorded continuation, or undefined when
 * anything but the input tail changed — the caller then sends the full body.
 */
export function planCodexContinuation(payload, continuation) {
    const input = Array.isArray(payload?.input) ? payload.input : [];
    if (stableJson(bodyWithoutInput(payload)) !== continuation.bodyNoInput)
        return undefined;
    const baseline = continuation.baselineItems;
    if (input.length < baseline.length)
        return undefined;
    for (let index = 0; index < baseline.length; index++) {
        if (!deepCovers(baseline[index], input[index]))
            return undefined;
    }
    return { previousResponseId: continuation.lastResponseId, input: input.slice(baseline.length) };
}
function toWebSocketUrl(url) {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:')
        parsed.protocol = 'wss:';
    else if (parsed.protocol === 'http:')
        parsed.protocol = 'ws:';
    return parsed.toString();
}
function webSocketHeaders(session, cacheSessionId) {
    return {
        authorization: `Bearer ${session.accessToken}`,
        'chatgpt-account-id': session.accountId,
        ...codexCredentialHeaders(),
        'openai-version': CODEX_CLIENT_VERSION,
        'openai-beta': CODEX_WS_BETA,
        'session-id': cacheSessionId,
        'x-client-request-id': cacheSessionId,
    };
}
function makeRelease(cacheSessionId, accountId, entry) {
    return ({ keep } = {}) => {
        if (!keep || entry.socket.readyState !== 1) {
            dropEntry(cacheSessionId, accountId, entry);
            return;
        }
        entry.busy = false;
        entry.idleTimer ??= setTimeout(() => {
            if (entry.busy)
                return;
            dropEntry(cacheSessionId, accountId, entry);
        }, CODEX_WS_IDLE_TTL_MS);
        entry.idleTimer.unref();
    };
}
async function acquireWebSocket(url, session, cacheSessionId, signal) {
    const accountId = String(session.accountId ?? '');
    const cached = accountId ? POOL.get(cacheSessionId)?.get(accountId) : undefined;
    if (cached) {
        if (cached.idleTimer) {
            clearTimeout(cached.idleTimer);
            cached.idleTimer = undefined;
        }
        if (!cached.busy) {
            if (Date.now() - cached.createdAt >= CODEX_WS_MAX_AGE_MS || cached.socket.readyState !== 1) {
                dropEntry(cacheSessionId, accountId, cached);
            }
            else {
                cached.busy = true;
                return { socket: cached.socket, entry: cached, release: makeRelease(cacheSessionId, accountId, cached) };
            }
        }
        else {
            // Busy: a same-session parallel request rides its own one-shot socket —
            // the pooled connection's continuation state is not safe to share.
            const busyHit = await connectWebSocket(url, session, cacheSessionId, signal);
            return {
                socket: busyHit.socket,
                entry: undefined,
                release: () => {
                    try {
                        busyHit.socket.close(1000, 'done');
                    }
                    catch { /* closed' */ }
                    void busyHit.dispatcher.close().catch(() => { });
                },
            };
        }
    }
    const connected = await connectWebSocket(url, session, cacheSessionId, signal);
    if (!accountId) {
        return {
            socket: connected.socket,
            entry: undefined,
            release: () => {
                try {
                    connected.socket.close(1000, 'done');
                }
                catch { /* closed */ }
                void connected.dispatcher.close().catch(() => { });
            },
        };
    }
    const entry = { socket: connected.socket, dispatcher: connected.dispatcher, busy: true, createdAt: Date.now(), idleTimer: undefined, continuation: undefined };
    const perAccount = POOL.get(cacheSessionId) ?? new Map();
    POOL.set(cacheSessionId, perAccount);
    perAccount.set(accountId, entry);
    return { socket: connected.socket, entry, release: makeRelease(cacheSessionId, accountId, entry) };
}
async function connectWebSocket(url, session, cacheSessionId, signal) {
    const dispatcher = await outboundWebsocketDispatcher(url);
    try {
        const socket = await new Promise((resolve, reject) => {
            const socket = new OutboundWebSocket(url, { headers: webSocketHeaders(session, cacheSessionId), dispatcher });
            const timer = setTimeout(() => {
                cleanup();
                try {
                    socket.close();
                }
                catch { /* never opened */ }
                reject(new UpstreamFailure(502, `codex websocket connect timeout after ${CONNECT_TIMEOUT_MS}ms`, { code: 'transport' }));
            }, CONNECT_TIMEOUT_MS);
            timer.unref();
            const onError = (event) => {
                cleanup();
                reject(new UpstreamFailure(502, `codex websocket connect failed: ${describe(event?.error ?? event)}`, { code: 'transport' }));
            };
            const onOpen = () => { cleanup(); resolve(socket); };
            const cleanup = () => {
                clearTimeout(timer);
                socket.removeEventListener('open', onOpen);
                socket.removeEventListener('error', onError);
                signal?.removeEventListener('abort', onAbort);
            };
            const onAbort = () => {
                cleanup();
                reject(new UpstreamFailure(502, 'codex websocket connect aborted', { code: 'transport' }));
            };
            socket.addEventListener('open', onOpen);
            socket.addEventListener('error', onError);
            signal?.addEventListener('abort', onAbort, { once: true });
            if (signal?.aborted)
                onAbort();
        });
        return { socket, dispatcher };
    }
    catch (error) {
        void dispatcher.close().catch(() => { });
        throw error;
    }
}
function describe(error) {
    const message = error instanceof Error ? error.message : '';
    if (message)
        return message;
    if (error && typeof error === 'object' && 'message' in error)
        return String(error.message);
    return String(error ?? 'unknown error');
}
/** WS error events lose the HTTP status; map the codes the hop reacts to. */
function websocketEventFailure(event) {
    const nested = event?.error && typeof event.error === 'object' ? event.error : {};
    const code = typeof event?.code === 'string' ? event.code : typeof nested.code === 'string' ? nested.code : '';
    const message = typeof event?.message === 'string' ? event.message : typeof nested.message === 'string' ? nested.message : 'codex websocket error';
    if (code === PREVIOUS_RESPONSE_NOT_FOUND) {
        return new UpstreamFailure(400, `codex websocket: ${message}`, { code: 'http', payload: event });
    }
    // The per-account connection cap is about this transport, not the request:
    // a 'transport' fault lets the hop cool the session and answer on SSE in
    // the same attempt (an 'http' one would surface as a failed request).
    if (code === WEBSOCKET_CONNECTION_LIMIT) {
        return new UpstreamFailure(502, `codex websocket: ${message || code}`, { code: 'transport', payload: event });
    }
    let status = 502;
    if (/usage_limit|usage_not_included|rate_limit/i.test(code))
        status = 429;
    else if (/unauthorized|token_expired|invalid_token|forbidden/i.test(code))
        status = 401;
    else if (/invalid_request|unsupported|bad_request/i.test(code))
        status = 400;
    return new UpstreamFailure(status, `codex websocket: ${message || code}`, { code: 'http', payload: event });
}
function isPreviousResponseNotFound(error) {
    return error instanceof UpstreamFailure && error.code === 'http' && error.status === 400
        && typeof error.payload === 'object' && error.payload?.code === PREVIOUS_RESPONSE_NOT_FOUND;
}
const SSE_HEAD = {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
};
/**
 * One streaming attempt over the pooled Codex WebSocket: acquires the
 * session's connection, sends `{type:"response.create", ...}` (delta when the
 * continuation matches), translates the event messages into the same SSE wire
 * the HTTP hop emits, and updates the continuation on success. Pre-commit
 * transport failures throw so the hop can cool the session down and retry on
 * SSE; errors stay errors — nothing is silently retried into duplicate output.
 */
export async function attemptCodexWebSocket(response, attempt) {
    const wsUrl = toWebSocketUrl(attempt.url);
    let retriedMissingContinuation = false;
    for (;;) {
        const acquired = await acquireWebSocket(wsUrl, attempt.session, attempt.cacheSessionId, attempt.signal);
        const continuation = acquired.entry?.continuation;
        const delta = continuation ? planCodexContinuation(attempt.payload, continuation) : undefined;
        const body = delta ? { ...attempt.payload, previous_response_id: delta.previousResponseId, input: delta.input } : attempt.payload;
        if (continuation && !delta)
            acquired.entry.continuation = undefined;
        try {
            const outcome = await runWebSocketRequest(response, acquired.socket, body, attempt);
            if (acquired.entry && outcome.responseId && !attempt.signal?.aborted) {
                const input = Array.isArray(attempt.payload.input) ? attempt.payload.input : [];
                acquired.entry.continuation = {
                    bodyNoInput: stableJson(bodyWithoutInput(attempt.payload)),
                    baselineItems: [...input, ...outcome.outputItems],
                    lastResponseId: outcome.responseId,
                };
            }
            acquired.release({ keep: !attempt.signal?.aborted });
            return;
        }
        catch (error) {
            if (acquired.entry)
                acquired.entry.continuation = undefined;
            acquired.release({ keep: false });
            if (!retriedMissingContinuation && !response.headersSent && isPreviousResponseNotFound(error)) {
                // The connection lost its state (recycled upstream); resend full once.
                retriedMissingContinuation = true;
                continue;
            }
            throw error;
        }
    }
}
async function runWebSocketRequest(response, socket, body, attempt) {
    socket.send(JSON.stringify({ type: 'response.create', ...body }));
    const scanner = new SseFrameScanner(attempt.captureSse);
    const buffered = [];
    let bytes = 0;
    let unclassified = 0;
    let sawPreamble = false;
    let committed = false;
    let responseId;
    let outputItems = [];
    const signal = attempt.signal;
    const emit = async (chunk) => {
        if (!response.write(chunk))
            await waitForDrain(response, signal);
    };
    const flush = async () => {
        committed = true;
        response.writeHead(200, SSE_HEAD);
        for (const chunk of buffered)
            await emit(chunk);
        buffered.length = 0;
    };
    try {
        for await (const event of websocketEvents(socket, signal)) {
            attempt.touch?.();
            const type = typeof event?.type === 'string' ? event.type : '';
            if (type === 'error' || type === 'response.failed')
                throw websocketEventFailure(event);
            if (TERMINAL_EVENT_TYPES.has(type)) {
                const terminal = event?.response && typeof event.response === 'object' ? event.response : {};
                if (typeof terminal.id === 'string')
                    responseId = terminal.id;
                if (Array.isArray(terminal.output))
                    outputItems = terminal.output;
            }
            // `response.done` is the WS-side name; the SSE wire says `completed`.
            const wire = type === 'response.done' ? { ...event, type: 'response.completed' } : event;
            const text = JSON.stringify(wire);
            const chunk = typeof wire.type === 'string' && wire.type.length > 0
                ? Buffer.from(`event: ${wire.type}\ndata: ${text}\n\n`)
                : Buffer.from(`data: ${text}\n\n`);
            if (committed) {
                await emit(chunk);
                continue;
            }
            buffered.push(chunk);
            bytes += chunk.length;
            let output = false;
            for (const frame of scanner.push(chunk)) {
                if (frame.kind === 'output')
                    output = true;
                else if (frame.kind === 'preamble')
                    sawPreamble = true;
                else
                    unclassified += frame.bytes;
            }
            if (!output && bytes > MAX_GATE_BUFFER_BYTES) {
                console.error(`[oauth-subs] codex websocket buffered ${bytes}B with no output event; committing without retry protection`);
                output = true;
            }
            if (output || unclassified > MAX_UNCLASSIFIED_BYTES)
                await flush();
        }
        if (!committed) {
            // Only the incident's own signature stays retryable (the 2026-08-26
            // gate): a stream that carried nothing but preamble, or nothing at all.
            if (bytes === 0 || sawPreamble) {
                throw new UpstreamFailure(502, `codex websocket stream ended with no output events (${bytes}B)`, { code: 'transport' });
            }
            await flush();
        }
        if (!response.writableEnded && !response.destroyed)
            response.end();
        return { responseId, outputItems };
    }
    catch (error) {
        if (signal?.aborted)
            throw error;
        if (error instanceof UpstreamFailure)
            throw error;
        throw new UpstreamFailure(502, `codex websocket: ${describe(error)}`, { code: 'transport' });
    }
}
/** Queued message events; a close before a terminal event is a transport fault. */
async function* websocketEvents(socket, signal) {
    const queue = [];
    let wake;
    let failed;
    let done = false;
    let sawTerminal = false;
    const onMessage = (event) => {
        const data = event?.data;
        try {
            const text = typeof data === 'string' ? data : data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : null;
            if (text === null)
                return;
            const parsed = JSON.parse(text);
            const type = typeof parsed?.type === 'string' ? parsed.type : '';
            if (TERMINAL_EVENT_TYPES.has(type)) {
                sawTerminal = true;
                done = true;
            }
            queue.push(parsed);
        }
        catch (error) {
            failed = new UpstreamFailure(502, `codex websocket sent invalid JSON: ${describe(error)}`, { code: 'transport' });
            done = true;
        }
        resolveWake();
    };
    const onError = (event) => {
        failed = new UpstreamFailure(502, `codex websocket error: ${describe(event?.error ?? event)}`, { code: 'transport' });
        done = true;
        resolveWake();
    };
    const onClose = () => {
        if (!sawTerminal && !failed) {
            failed = new UpstreamFailure(502, 'codex websocket closed before a terminal response event', { code: 'transport' });
        }
        done = true;
        resolveWake();
    };
    const onAbort = () => {
        failed = signal.reason ?? new Error('aborted');
        done = true;
        resolveWake();
    };
    function resolveWake() {
        const resolve = wake;
        wake = undefined;
        resolve?.();
    }
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        for (;;) {
            if (signal?.aborted)
                throw signal.reason ?? new Error('aborted');
            if (queue.length > 0) {
                yield queue.shift();
                continue;
            }
            if (done)
                break;
            await new Promise((resolve) => { wake = resolve; });
        }
        if (failed)
            throw failed;
    }
    finally {
        socket.removeEventListener('message', onMessage);
        socket.removeEventListener('error', onError);
        socket.removeEventListener('close', onClose);
        signal?.removeEventListener('abort', onAbort);
    }
}
