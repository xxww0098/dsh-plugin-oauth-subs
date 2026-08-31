/**
 * Local OpenAI Responses proxy. DSH talks to 127.0.0.1:<port> via llm-pi-ai;
 * this process attaches a fresh OAuth bearer and forwards to ChatGPT Codex
 * or xAI Grok. Settings operations stay on the host-owned RPC channel.
 */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { CODEX_API_URL, CODEX_CLIENT_VERSION, CODEX_MODELS, CODEX_MODELS_URL, codexRoutingHint, codexUpstreamHeaders } from './codex/index.js';
import { GROK_API_URL, GROK_MODELS, grokAffinityHeaders, grokUpstreamHeaders } from './grok/index.js';
import { GLM_MODELS, glmCodingUrl, glmUpstreamHeaders } from './glm/index.js';
import { normalizeGlmChatBody } from './glm/request.js';
import { KIRO_MODELS } from './kiro/index.js';
import { ANTIGRAVITY_GENERATE_URL, ANTIGRAVITY_MODELS, ANTIGRAVITY_STREAM_URL, applyAntigravityValidation, antigravityChatHeaders, antigravityValidationClientError, fetchAntigravityCloudCode, parseAntigravityValidation, } from './antigravity/index.js';
import { ANTIGRAVITY_STABLE_SESSION, antigravityToOpenai, createAntigravityOpenaiStream, openaiToAntigravity, parseAntigravitySseBlocks } from './antigravity/request.js';
import { applyFastMode } from '../utils/fast-mode.js';
import { codexCacheSessionId } from '../utils/cache-session.js';
import { normalizeCodexResponsesBody } from './codex/request.js';
import { withPickerVariants } from './models.js';
export { codexCacheSessionId } from '../utils/cache-session.js';
const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' };
export const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
/** Upstream attempts before the client is told the stream failed. */
export const STREAM_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [1000, 4000];
/**
 * SSE events that carry no output, so a stream ending here is worth retrying.
 * The `codex.*` frames are handshake metadata; the allow-list mirrors
 * CLIProxyAPI's `isCodexHandshakeMetadataEvent`, which solves the same problem
 * against the same backend.
 */
const PREAMBLE_EVENT_TYPES = new Set([
    'response.created',
    'response.in_progress',
    'response.queued',
    'codex.rate_limits',
    'codex.response.metadata',
]);
const MAX_PREAMBLE_BYTES = 64 * 1024;
const EVENT_TYPE = /"type"\s*:\s*"([^"]+)"/g;
/** Commit anyway rather than risk the client's own header timeout. */
const COMMIT_DEADLINE_MS = 120_000;
class RetryableUpstream extends Error {
}
class RequestError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function send(response, status, body) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    response.writeHead(status, {
        ...JSON_TYPE,
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(text),
        'x-content-type-options': 'nosniff',
    });
    response.end(text);
}
function readBody(request, limit = MAX_REQUEST_BODY_BYTES) {
    if (request.aborted || request.destroyed) {
        return Promise.reject(new RequestError(400, 'request body was aborted'));
    }
    const declared = Number(request.headers['content-length']);
    if (Number.isSafeInteger(declared) && declared > limit) {
        request.resume();
        return Promise.reject(new RequestError(413, 'request body is too large'));
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        const onData = (chunk) => {
            size += chunk.length;
            if (size <= limit) {
                chunks.push(chunk);
                return;
            }
            cleanup();
            request.resume();
            reject(new RequestError(413, 'request body is too large'));
        };
        const onEnd = () => {
            cleanup();
            resolve(Buffer.concat(chunks, size));
        };
        const onError = () => {
            cleanup();
            reject(new RequestError(400, 'request body could not be read'));
        };
        const onAborted = () => {
            cleanup();
            reject(new RequestError(400, 'request body was aborted'));
        };
        const cleanup = () => {
            request.removeListener('data', onData);
            request.removeListener('end', onEnd);
            request.removeListener('error', onError);
            request.removeListener('aborted', onAborted);
        };
        request.on('data', onData);
        request.once('end', onEnd);
        request.once('error', onError);
        request.once('aborted', onAborted);
    });
}
function originOf(port) {
    return `http://127.0.0.1:${port}`;
}
/** undici reports socket faults as a bare "fetch failed"; the cause carries the reason. */
export function describeError(error) {
    const cause = error?.cause;
    const detail = cause?.code ?? cause?.message;
    return detail === undefined ? String(error?.message ?? error) : `${error.message}: ${detail}`;
}
function rewriteUpstreamBody(buffer, family) {
    if (!buffer.length)
        throw new RequestError(400, 'request body must contain JSON');
    let payload;
    try {
        payload = JSON.parse(buffer.toString('utf8'));
    }
    catch {
        throw new RequestError(400, 'request body must contain valid JSON');
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new RequestError(400, 'request body must contain a JSON object');
    }
    const fast = applyFastMode(payload);
    const next = family === 'codex'
        ? normalizeCodexResponsesBody(fast)
        : family === 'glm'
            ? normalizeGlmChatBody(fast)
            : fast;
    const pinCache = family === 'codex' || family === 'grok' || family === 'glm' || family === 'antigravity';
    const cacheSessionId = pinCache
        ? (codexCacheSessionId(next.prompt_cache_key) || codexCacheSessionId(next.session_id))
        : undefined;
    if (cacheSessionId)
        next.prompt_cache_key = cacheSessionId;
    else if (pinCache)
        delete next.prompt_cache_key;
    if (family === 'glm' || family === 'antigravity') {
        delete next.prompt_cache_retention;
        delete next.prompt_cache_options;
    }
    const routingHint = family === 'codex'
        ? codexRoutingHint(typeof next.model === 'string' ? next.model : '', next.service_tier)
        : undefined;
    return { body: Buffer.from(JSON.stringify(next)), cacheSessionId, stream: next.stream === true, routingHint };
}
function abortOnDisconnect(request, response) {
    const controller = new AbortController();
    const abort = () => controller.abort(new Error('client disconnected'));
    const onClose = () => {
        if (!response.writableEnded)
            abort();
    };
    request.once('aborted', abort);
    response.once('close', onClose);
    if (request.aborted || response.destroyed)
        abort();
    return {
        signal: controller.signal,
        cleanup() {
            request.removeListener('aborted', abort);
            response.removeListener('close', onClose);
        },
    };
}
export function createProxy({ port, apiKey, tokens, fetchFn = fetch, maxRequestBodyBytes = MAX_REQUEST_BODY_BYTES, onAntigravityValidation }) {
    let server;
    const authorized = (request) => {
        const header = request.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        return token.length > 0 && token === apiKey;
    };
    const handle = async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const path = url.pathname.replace(/\/+$/, '') || '/';
        if (path === '/health' && request.method === 'GET') {
            send(response, 200, { ok: true, plugin: 'dsh-plugin-oauth-subs' });
            return;
        }
        if (!authorized(request)) {
            send(response, 401, { error: 'unauthorized' });
            return;
        }
        if (path === '/v1/models' && request.method === 'GET') {
            const data = [];
            try {
                await tokens.codex.session();
                data.push(...withPickerVariants(CODEX_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'codex' })));
            }
            catch { /* not logged in */ }
            try {
                await tokens.grok.session();
                data.push(...withPickerVariants(GROK_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'grok' })));
            }
            catch { /* not logged in */ }
            try {
                await tokens.glm.session();
                data.push(...GLM_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'glm' })));
            }
            catch { /* not logged in */ }
            try {
                if (tokens.kiro) {
                    await tokens.kiro.session();
                    data.push(...KIRO_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'kiro' })));
                }
            }
            catch { /* not logged in */ }
            try {
                if (tokens.antigravity) {
                    await tokens.antigravity.session();
                    data.push(...ANTIGRAVITY_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'antigravity' })));
                }
            }
            catch { /* not logged in */ }
            send(response, 200, { object: 'list', data });
            return;
        }
        if (path === '/codex/v1/models' && request.method === 'GET') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.codex.session();
                const upstream = await fetchFn(`${CODEX_MODELS_URL}?client_version=${CODEX_CLIENT_VERSION}`, {
                    headers: {
                        ...codexUpstreamHeaders(session),
                    },
                    signal: client.signal,
                });
                if (!upstream.ok) {
                    send(response, upstream.status, { error: await upstream.text() });
                    return;
                }
                const payload = await upstream.json();
                send(response, 200, payload);
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/codex/v1/responses' && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                await forward(request, response, {
                    url: CODEX_API_URL,
                    session: await tokens.codex.session(),
                    headersOf: codexUpstreamHeaders,
                    fetchFn,
                    family: 'codex',
                    maxRequestBodyBytes,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/grok/v1/responses' && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                await forward(request, response, {
                    url: GROK_API_URL,
                    session: await tokens.grok.session(),
                    headersOf: grokUpstreamHeaders,
                    fetchFn,
                    family: 'grok',
                    maxRequestBodyBytes,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/glm/v1/chat/completions' && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.glm.session();
                await forward(request, response, {
                    url: glmCodingUrl(session.region),
                    session,
                    headersOf: glmUpstreamHeaders,
                    fetchFn,
                    family: 'glm',
                    maxRequestBodyBytes,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/glm/v1/models' && request.method === 'GET') {
            send(response, 200, {
                object: 'list',
                data: GLM_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'glm' })),
            });
            return;
        }
        if (path === '/kiro/v1/models' && request.method === 'GET') {
            send(response, 200, {
                object: 'list',
                data: KIRO_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'kiro' })),
            });
            return;
        }
        if (path === '/antigravity/v1/models' && request.method === 'GET') {
            send(response, 200, {
                object: 'list',
                data: ANTIGRAVITY_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'antigravity' })),
            });
            return;
        }
        if (path === '/kiro/v1/chat/completions' || path === '/kiro/v1/responses') {
            send(response, 501, {
                error: {
                    message: 'Kiro chat is AWS generateAssistantResponse, not OpenAI. Auth, quota, and the catalog are live; the translator is a follow-up.',
                },
            });
            return;
        }
        if (path === '/antigravity/v1/chat/completions' && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                await forwardAntigravity(request, response, {
                    session: await tokens.antigravity.session(),
                    tokens: tokens.antigravity,
                    fetchFn,
                    maxRequestBodyBytes,
                    signal: client.signal,
                    onValidation: onAntigravityValidation,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/codex/v1/chat/completions' || path === '/grok/v1/chat/completions') {
            send(response, 400, {
                error: {
                    message: 'this proxy speaks the OpenAI Responses API (POST /v1/responses). Point llm-pi-ai api at openai-responses.',
                },
            });
            return;
        }
        send(response, 404, { error: `not found: ${path}` });
    };
    return {
        origin: () => originOf(port),
        async listen() {
            server = createServer((request, response) => {
                handle(request, response).catch((error) => {
                    if (!response.headersSent)
                        send(response, error.status ?? 500, { error: describeError(error) });
                    else
                        response.end();
                });
            });
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, '127.0.0.1', resolve);
            });
            return server;
        },
        async close() {
            if (server === undefined)
                return;
            await new Promise((resolve) => server.close(() => resolve()));
            server = undefined;
        },
    };
}
async function forward(request, response, { url, session, headersOf, fetchFn, family, maxRequestBodyBytes, signal }) {
    const raw = await readBody(request, maxRequestBodyBytes);
    const { body, cacheSessionId, stream, routingHint } = rewriteUpstreamBody(raw, family);
    const headers = {
        ...headersOf(session, cacheSessionId),
        'content-type': request.headers['content-type'] ?? 'application/json',
        ...(stream ? { accept: 'text/event-stream' } : {}),
        ...(family === 'codex' && cacheSessionId !== undefined ? {
            'session-id': cacheSessionId,
            'x-client-request-id': cacheSessionId,
        } : {}),
        ...(family === 'codex' && routingHint ? { 'x-codex-routing-hint': routingHint } : {}),
        ...(family === 'grok' ? grokAffinityHeaders(cacheSessionId) : {}),
    };
    let lastFailure;
    for (let attempt = 0; attempt < STREAM_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            await delay(RETRY_BACKOFF_MS[attempt - 1], signal);
            console.error(`[oauth-subs] ${family} retrying upstream (attempt ${attempt + 1}/${STREAM_ATTEMPTS}): ${lastFailure}`);
        }
        try {
            return await attemptUpstream(response, { url, headers, body, stream, fetchFn, family, signal });
        }
        catch (error) {
            if (signal.aborted || response.headersSent || !(error instanceof RetryableUpstream))
                throw error;
            lastFailure = error.message;
        }
    }
    throw new RequestError(502, `${family} upstream failed ${STREAM_ATTEMPTS} times: ${lastFailure}`);
}
/**
 * One upstream attempt. The client response stays uncommitted until the stream
 * proves it is producing output, so a break during the silent pre-output window
 * — the signature of the 2026-08-26 incident, where every failed stream carried
 * `response.created` and nothing else — can be retried without the client ever
 * seeing a truncated stream.
 */
async function attemptUpstream(response, { url, headers, body, stream, fetchFn, family, signal }) {
    let upstream;
    try {
        upstream = await fetchFn(url, { method: 'POST', headers, body, signal });
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        throw new RetryableUpstream(describeError(error));
    }
    if (upstream.status >= 400) {
        const text = await upstream.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        }
        catch {
            parsed = { error: { message: text } };
        }
        if (parsed == null || (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0)) {
            parsed = {
                error: {
                    message: `${family} upstream ${upstream.status} with empty body`,
                    type: 'invalid_request_error',
                    code: 'invalid_request',
                },
            };
        }
        send(response, upstream.status, parsed);
        return;
    }
    const gate = new CommitGate(response, upstream, stream);
    let lastByteAt = Date.now();
    try {
        if (upstream.body === null) {
            gate.commit();
            return;
        }
        const reader = upstream.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            lastByteAt = Date.now();
            if (!(await gate.push(value, signal)))
                continue;
            if (!response.write(value))
                await once(response, 'drain', { signal });
        }
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        const silent = Date.now() - lastByteAt;
        const detail = `${describeError(error)} (silent ${silent}ms, ${gate.bytes}B seen, committed=${gate.committed})`;
        if (gate.committed) {
            // Ending cleanly here reaches llm-pi-ai as a finished SSE stream: it reports
            // "stream ended before a terminal response event" and retries blind.
            console.error(`[oauth-subs] ${family} upstream stream failed mid-response: ${detail}`);
            response.destroy(error);
            throw error;
        }
        throw new RetryableUpstream(detail);
    }
    if (!gate.committed) {
        // Retry only the incident's own signature: an SSE stream that opened, carried
        // nothing but `response.created`, and stopped. Any other shape is forwarded
        // as-is — an unrecognised body is the upstream's answer, not a fault.
        if (gate.gated && (gate.bytes === 0 || gate.sawPreamble)) {
            throw new RetryableUpstream(`stream ended with no output events (${gate.bytes}B, silent ${Date.now() - lastByteAt}ms)`);
        }
        await gate.release(signal);
    }
    if (!response.writableEnded && !response.destroyed)
        response.end();
}
/**
 * Withholds the client response head until the upstream stream proves useful.
 * Non-streaming bodies and anything past the preamble commit immediately, so
 * only the silent pre-output window is ever buffered.
 */
class CommitGate {
    constructor(response, upstream, stream) {
        this.response = response;
        this.upstream = upstream;
        this.buffered = [];
        this.bytes = 0;
        this.committed = false;
        this.sawPreamble = false;
        this.gated = stream === true;
        this.deadline = Date.now() + COMMIT_DEADLINE_MS;
        this.text = '';
    }
    /** Returns true once the caller should write `chunk` through itself. */
    async push(chunk, signal) {
        if (this.committed)
            return true;
        if (!this.gated) {
            this.commit();
            return true;
        }
        this.buffered.push(chunk);
        this.bytes += chunk.length;
        // Byte-exact and stateless: the scan only ever matches ASCII.
        this.text += Buffer.from(chunk).toString('latin1');
        if (!this.sawPreamble)
            this.sawPreamble = hasPreambleEvent(this.text);
        if (this.bytes > MAX_PREAMBLE_BYTES || Date.now() > this.deadline || hasOutputEvent(this.text)) {
            await this.#flush(signal);
        }
        return false;
    }
    /** Commit and emit whatever is buffered, for a body we decided not to retry. */
    async release(signal) {
        await this.#flush(signal);
    }
    commit() {
        if (this.committed)
            return;
        this.committed = true;
        this.response.writeHead(this.upstream.status, forwardedHeaders(this.upstream.headers));
    }
    async #flush(signal) {
        this.commit();
        for (const chunk of this.buffered) {
            if (!this.response.write(chunk))
                await once(this.response, 'drain', { signal });
        }
        this.buffered = [];
        this.text = '';
    }
}
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade']);
function forwardedHeaders(upstreamHeaders) {
    const headers = { 'cache-control': 'no-store' };
    upstreamHeaders.forEach((value, key) => {
        if (!HOP_BY_HOP.has(key.toLowerCase()))
            headers[key] = value;
    });
    return headers;
}
/**
 * True once the buffered SSE text carries an event beyond the preamble. Any
 * terminal or error event counts, so a genuine `response.failed` commits and
 * reaches the client instead of being retried.
 */
export function hasPreambleEvent(text) {
    for (const match of text.matchAll(EVENT_TYPE)) {
        if (PREAMBLE_EVENT_TYPES.has(match[1]))
            return true;
    }
    return false;
}
export function hasOutputEvent(text) {
    for (const match of text.matchAll(EVENT_TYPE)) {
        if (!PREAMBLE_EVENT_TYPES.has(match[1]))
            return true;
    }
    return false;
}
function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
    });
}
async function rememberAntigravityValidation(session, info, tokens, onValidation) {
    if (!info?.required)
        return;
    const next = applyAntigravityValidation(session, info);
    if (tokens && typeof tokens.remember === 'function') {
        await tokens.remember({
            needsValidation: true,
            ...(next.validationUrl ? { validationUrl: next.validationUrl } : {}),
        });
    }
    onValidation?.(next);
}
async function forwardAntigravity(request, response, { session, tokens, fetchFn, maxRequestBodyBytes, signal, onValidation }) {
    const raw = await readBody(request, maxRequestBodyBytes);
    const { body: rewritten, cacheSessionId, stream } = rewriteUpstreamBody(raw, 'antigravity');
    const payload = JSON.parse(rewritten.toString('utf8'));
    const projectId = session.projectId;
    if (typeof projectId !== 'string' || !projectId.trim()) {
        throw new RequestError(403, 'antigravity session is missing project_id');
    }
    const sessionId = cacheSessionId
        ?? codexCacheSessionId(payload.session_id)
        ?? codexCacheSessionId(payload.prompt_cache_key)
        ?? ANTIGRAVITY_STABLE_SESSION;
    const body = Buffer.from(JSON.stringify(openaiToAntigravity(payload, {
        projectId,
        sessionId,
    })));
    const url = stream ? ANTIGRAVITY_STREAM_URL : ANTIGRAVITY_GENERATE_URL;
    const headers = {
        ...antigravityChatHeaders(session),
        ...(stream ? { accept: 'text/event-stream' } : {}),
    };
    let upstream;
    try {
        upstream = await fetchAntigravityCloudCode(url, { method: 'POST', headers, body, signal }, fetchFn);
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        throw new RequestError(502, describeError(error));
    }
    if (upstream.status >= 400) {
        const text = await upstream.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        }
        catch {
            parsed = { error: { message: text } };
        }
        const validation = parseAntigravityValidation(parsed) ?? parseAntigravityValidation(text);
        if (validation) {
            await rememberAntigravityValidation(session, validation, tokens, onValidation);
            send(response, 400, antigravityValidationClientError(validation));
            return;
        }
        send(response, upstream.status, parsed ?? { error: { message: `antigravity upstream ${upstream.status}` } });
        return;
    }
    const model = typeof payload.model === 'string' ? payload.model : 'antigravity';
    if (!stream) {
        const text = await upstream.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : {};
        }
        catch {
            throw new RequestError(502, 'antigravity upstream returned invalid JSON');
        }
        send(response, 200, antigravityToOpenai(parsed, { model }));
        return;
    }
    response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
    });
    const id = `chatcmpl-${Date.now()}`;
    const streamMapper = createAntigravityOpenaiStream({ model, id });
    let rest = '';
    const reader = upstream.body?.getReader();
    if (!reader) {
        response.write(`data: ${JSON.stringify(streamMapper.finish())}\n\n`);
        response.write('data: [DONE]\n\n');
        response.end();
        return;
    }
    while (true) {
        const { done, value } = await reader.read();
        rest += value ? Buffer.from(value).toString('utf8') : '';
        const parsed = parseAntigravitySseBlocks(done ? `${rest}\n\n` : rest);
        rest = parsed.rest;
        for (const event of parsed.events) {
            const chunk = streamMapper.push(event);
            if (chunk) {
                if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`))
                    await once(response, 'drain', { signal });
            }
        }
        if (done)
            break;
    }
    if (!response.write(`data: ${JSON.stringify(streamMapper.finish())}\n\n`)) {
        await once(response, 'drain', { signal });
    }
    response.write('data: [DONE]\n\n');
    if (!response.writableEnded && !response.destroyed)
        response.end();
}
