/**
 * Loopback LLM proxy: authenticates DSH calls, dispatches family transports,
 * and gates/retries passthrough streams before output. Settings operations
 * stay on the host-owned RPC channel; vendor translation lives in each family.
 */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CODEX_API_URL, CODEX_CLIENT_VERSION, CODEX_MODELS, CODEX_MODELS_URL, codexRoutingHint, codexUpstreamHeaders } from './codex/index.js';
import { applyCodexCache, codexCacheHeaders } from './codex/cache.js';
import { GROK_API_URL, GROK_MODELS, grokAffinityHeaders, grokUpstreamHeaders } from './grok/index.js';
import { applyGrokCache } from './grok/cache.js';
import { normalizeGrokResponsesBody } from './grok/request.js';
import { GLM_MODELS, glmAnthropicHeaders, glmAnthropicUrl, glmCodingUrl, glmUpstreamHeaders } from './glm/index.js';
import { glmCacheSessionId } from './glm/cache.js';
import { mapGlmChatUsage, normalizeGlmAnthropicBody, normalizeGlmChatBody } from './glm/request.js';
import { kiroCatalogModels } from './kiro/catalog.js';
import { kiroConversationId } from './kiro/cache.js';
import { forwardKiro } from './kiro/transport.js';
import { ANTIGRAVITY_MODELS } from './antigravity/index.js';
import { antigravitySessionIdOf } from './antigravity/cache.js';
import { forwardAntigravity } from './antigravity/transport.js';
import { cursorCatalogModels } from './cursor/catalog.js';
import { applyCursorCache } from './cursor/cache.js';
import { OLLAMA_CHAT_URL, ollamaUpstreamHeaders } from '../apikey/ollama/index.js';
import { ollamaCatalogModels } from '../apikey/ollama/catalog.js';
import { applyOllamaCache } from '../apikey/ollama/cache.js';
import { KIMI_CHAT_URL, kimiUpstreamHeaders } from './kimi/index.js';
import { kimiCatalogModels } from './kimi/catalog.js';
import { applyKimiCache } from './kimi/cache.js';
import { applyKimiStreamUsage, applyKimiThinking, mapKimiUsage } from './kimi/request.js';
import { copilotChatUrl, copilotUpstreamHeaders, } from './copilot/index.js';
import { copilotCatalogModels } from './copilot/catalog.js';
import { applyCopilotCache, copilotHasVision, copilotInitiatorOf } from './copilot/cache.js';
import { applyCopilotStreamUsage, applyCopilotThinking, mapCopilotUsage } from './copilot/request.js';
import { forwardCursor } from './cursor/transport.js';
import { RequestError, describeError, sendJson } from '../utils/http.js';
import { applyFastMode } from '../utils/fast-mode.js';
import { normalizeCodexResponsesBody } from './codex/request.js';
import { withPickerVariants } from './models.js';
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
    constructor(message, extra = {}) {
        super(message);
        if (typeof extra.turnState === 'string' && extra.turnState.trim()) {
            this.turnState = extra.turnState.trim();
        }
    }
}
function retryableUpstream(message, family, upstream) {
    const extra = {};
    if (family === 'codex') {
        const turnState = upstream?.headers?.get?.('x-codex-turn-state');
        if (typeof turnState === 'string' && turnState.trim())
            extra.turnState = turnState.trim();
    }
    return new RetryableUpstream(message, extra);
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
export { describeError } from '../utils/http.js';
function rewriteUpstreamBody(buffer, family, wire) {
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
    if (family === 'cursor') {
        // Cursor Fast is RequestedModel `{ id: 'fast' }`, not Codex Priority.
        // Keep the picker `-fast` suffix for openaiToCursor; do not peel here.
        const { payload: next, cacheSessionId } = applyCursorCache(payload);
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
        };
    }
    const fast = applyFastMode(payload);
    if (family === 'codex') {
        const { payload: next, cacheSessionId } = applyCodexCache(normalizeCodexResponsesBody(fast));
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
            routingHint: codexRoutingHint(typeof next.model === 'string' ? next.model : '', next.service_tier),
        };
    }
    if (family === 'grok') {
        const { payload: next, cacheSessionId } = applyGrokCache(normalizeGrokResponsesBody(fast));
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
            grokModel: typeof next.model === 'string' ? next.model : undefined,
        };
    }
    if (family === 'glm') {
        const next = wire === 'anthropic' ? normalizeGlmAnthropicBody(fast) : normalizeGlmChatBody(fast);
        return {
            payload: next,
            cacheSessionId: glmCacheSessionId(next.user)
                || glmCacheSessionId(next.metadata?.user_id)
                || glmCacheSessionId(next.session_id),
            stream: next.stream === true,
        };
    }
    if (family === 'antigravity') {
        const next = { ...fast };
        delete next.prompt_cache_retention;
        delete next.prompt_cache_options;
        return {
            payload: next,
            cacheSessionId: antigravitySessionIdOf(next),
            stream: next.stream === true,
        };
    }
    if (family === 'kiro') {
        const next = { ...fast };
        delete next.prompt_cache_retention;
        delete next.prompt_cache_options;
        return {
            payload: next,
            cacheSessionId: kiroConversationId(next),
            stream: next.stream === true,
        };
    }
    if (family === 'ollama') {
        const { payload: next, cacheSessionId } = applyOllamaCache(fast);
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
        };
    }
    if (family === 'kimi') {
        const { payload: cached, cacheSessionId } = applyKimiCache(fast);
        const next = applyKimiStreamUsage(applyKimiThinking(cached));
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
        };
    }
    if (family === 'copilot') {
        const { payload: cached, cacheSessionId } = applyCopilotCache(fast);
        const next = applyCopilotStreamUsage(applyCopilotThinking(cached));
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
            copilotVision: copilotHasVision(next.messages),
            copilotInitiator: copilotInitiatorOf(next.messages),
        };
    }
    throw new RequestError(400, `unknown oauth family: ${family}`);
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
export function createProxy({ port, apiKey, tokens, fetchFn = fetch, maxRequestBodyBytes = MAX_REQUEST_BODY_BYTES, onAntigravityValidation, cursorRpc }) {
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
            sendJson(response, 200, { ok: true, plugin: 'dsh-plugin-oauth-subs' });
            return;
        }
        if (!authorized(request)) {
            sendJson(response, 401, { error: 'unauthorized' });
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
                    data.push(...kiroCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kiro' })));
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
            try {
                if (tokens.cursor) {
                    await tokens.cursor.session();
                    data.push(...cursorCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'cursor' })));
                }
            }
            catch { /* not logged in */ }
            try {
                if (tokens.ollama) {
                    await tokens.ollama.session();
                    data.push(...ollamaCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'ollama' })));
                }
            }
            catch { /* not logged in */ }
            try {
                if (tokens.kimi) {
                    await tokens.kimi.session();
                    data.push(...kimiCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kimi' })));
                }
            }
            catch { /* not logged in */ }
            try {
                if (tokens.copilot) {
                    await tokens.copilot.session();
                    data.push(...copilotCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'copilot' })));
                }
            }
            catch { /* not logged in */ }
            sendJson(response, 200, { object: 'list', data });
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
                    sendJson(response, upstream.status, { error: await upstream.text() });
                    return;
                }
                const payload = await upstream.json();
                sendJson(response, 200, payload);
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
        if ((path === '/glm/v1/messages' || path === '/glm/v1/v1/messages') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.glm.session();
                await forward(request, response, {
                    url: glmAnthropicUrl(session.region),
                    session,
                    headersOf: glmAnthropicHeaders,
                    fetchFn,
                    family: 'glm',
                    wire: 'anthropic',
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
            sendJson(response, 200, {
                object: 'list',
                data: GLM_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'glm' })),
            });
            return;
        }
        if (path === '/kiro/v1/models' && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: kiroCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kiro' })),
            });
            return;
        }
        if (path === '/antigravity/v1/models' && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: ANTIGRAVITY_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'antigravity' })),
            });
            return;
        }
        if ((path === '/cursor/v1/models' || path === '/cursor/models') && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: cursorCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'cursor' })),
            });
            return;
        }
        if (path === '/kiro/v1/chat/completions' && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.kiro.session();
                const input = rewriteUpstreamBody(await readBody(request, maxRequestBodyBytes), 'kiro');
                await forwardKiro(response, {
                    ...input,
                    session,
                    fetchFn,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/kiro/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'Kiro chat is AWS generateAssistantResponse. Point llm-pi-ai at POST /kiro/v1/chat/completions.',
                },
            });
            return;
        }
        if ((path === '/cursor/v1/chat/completions' || path === '/cursor/chat/completions') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.cursor.session();
                const input = rewriteUpstreamBody(await readBody(request, maxRequestBodyBytes), 'cursor');
                await forwardCursor(response, {
                    ...input,
                    session,
                    signal: client.signal,
                    runFn: cursorRpc,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/cursor/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'Cursor chat is Connect AgentService/Run. Point llm-pi-ai at POST /cursor/v1/chat/completions.',
                },
            });
            return;
        }
        if ((path === '/ollama/v1/models' || path === '/ollama/models') && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: ollamaCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'ollama' })),
            });
            return;
        }
        if ((path === '/ollama/v1/chat/completions' || path === '/ollama/chat/completions') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                await forward(request, response, {
                    url: OLLAMA_CHAT_URL,
                    session: await tokens.ollama.session(),
                    headersOf: ollamaUpstreamHeaders,
                    fetchFn,
                    family: 'ollama',
                    maxRequestBodyBytes,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/ollama/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'Ollama Cloud is Completions. Point llm-pi-ai at POST /ollama/v1/chat/completions.',
                },
            });
            return;
        }
        if ((path === '/kimi/v1/models' || path === '/kimi/models') && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: kimiCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kimi' })),
            });
            return;
        }
        if ((path === '/kimi/v1/chat/completions' || path === '/kimi/chat/completions') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                await forward(request, response, {
                    url: KIMI_CHAT_URL,
                    session: await tokens.kimi.session(),
                    headersOf: kimiUpstreamHeaders,
                    fetchFn,
                    family: 'kimi',
                    maxRequestBodyBytes,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/kimi/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'Kimi Code is Completions. Point llm-pi-ai at POST /kimi/v1/chat/completions.',
                },
            });
            return;
        }
        if ((path === '/copilot/v1/models' || path === '/copilot/models') && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: copilotCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'copilot' })),
            });
            return;
        }
        if ((path === '/copilot/v1/chat/completions' || path === '/copilot/chat/completions') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.copilot.session();
                await forward(request, response, {
                    url: copilotChatUrl(session),
                    session,
                    headersOf: (sess, pin) => copilotUpstreamHeaders(sess, pin),
                    fetchFn,
                    family: 'copilot',
                    maxRequestBodyBytes,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/copilot/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'GitHub Copilot is Completions. Point llm-pi-ai at POST /copilot/v1/chat/completions.',
                },
            });
            return;
        }
        if (path === '/antigravity/v1/chat/completions' && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.antigravity.session();
                const input = rewriteUpstreamBody(await readBody(request, maxRequestBodyBytes), 'antigravity');
                await forwardAntigravity(response, {
                    ...input,
                    session,
                    tokens: tokens.antigravity,
                    fetchFn,
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
            sendJson(response, 400, {
                error: {
                    message: 'this proxy speaks the OpenAI Responses API (POST /v1/responses). Point llm-pi-ai api at openai-responses.',
                },
            });
            return;
        }
        sendJson(response, 404, { error: `not found: ${path}` });
    };
    return {
        origin: () => originOf(port),
        async listen() {
            server = createServer((request, response) => {
                handle(request, response).catch((error) => {
                    if (!response.headersSent) {
                        const extra = {};
                        if (error?.retryAfter != null && String(error.retryAfter).trim()) {
                            extra['retry-after'] = String(error.retryAfter).trim();
                        }
                        sendJson(response, error.status ?? 500, { error: describeError(error) }, extra);
                    }
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
async function forward(request, response, { url, session, headersOf, fetchFn, family, wire, maxRequestBodyBytes, signal }) {
    const raw = await readBody(request, maxRequestBodyBytes);
    const { payload, cacheSessionId, stream, routingHint, grokModel, copilotVision, copilotInitiator } = rewriteUpstreamBody(raw, family, wire);
    const body = Buffer.from(JSON.stringify(payload));
    const grokReqId = family === 'grok' ? randomUUID() : undefined;
    const baseHeaders = {
        ...headersOf(session, cacheSessionId),
        'content-type': request.headers['content-type'] ?? 'application/json',
        ...(stream ? { accept: 'text/event-stream' } : {}),
        ...(family === 'codex' ? {
            ...codexCacheHeaders(cacheSessionId),
            ...(routingHint ? { 'x-codex-routing-hint': routingHint } : {}),
        } : {}),
        ...(family === 'copilot' ? {
            'x-initiator': copilotInitiator === 'agent' ? 'agent' : 'user',
            ...(copilotVision ? { 'copilot-vision-request': 'true' } : {}),
        } : {}),
    };
    let lastFailure;
    let codexTurnState;
    for (let attempt = 0; attempt < STREAM_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            await delay(RETRY_BACKOFF_MS[attempt - 1], undefined, { signal });
            console.error(`[oauth-subs] ${family} retrying upstream (attempt ${attempt + 1}/${STREAM_ATTEMPTS}): ${lastFailure}`);
        }
        const headers = {
            ...baseHeaders,
            ...(family === 'grok' ? grokAffinityHeaders(cacheSessionId, {
                model: grokModel,
                reqId: grokReqId,
                retryAttempt: attempt,
            }) : {}),
            ...(family === 'codex' && codexTurnState ? { 'x-codex-turn-state': codexTurnState } : {}),
        };
        try {
            return await attemptUpstream(response, { url, headers, body, stream, fetchFn, family, wire, signal });
        }
        catch (error) {
            if (signal.aborted || response.headersSent || !(error instanceof RetryableUpstream))
                throw error;
            lastFailure = error.message;
            if (typeof error.turnState === 'string' && error.turnState)
                codexTurnState = error.turnState;
        }
    }
    throw new RequestError(502, `${family} upstream failed ${STREAM_ATTEMPTS} times: ${lastFailure}`);
}
function completionsUsageMapper(family, wire) {
    if (family === 'copilot')
        return mapCopilotUsage;
    if (family === 'kimi')
        return mapKimiUsage;
    if (family === 'glm' && wire !== 'anthropic')
        return mapGlmChatUsage;
    return undefined;
}
/**
 * One upstream attempt. The client response stays uncommitted until the stream
 * proves it is producing output, so a break during the silent pre-output window
 * — the signature of the 2026-08-26 incident, where every failed stream carried
 * `response.created` and nothing else — can be retried without the client ever
 * seeing a truncated stream.
 */
async function attemptUpstream(response, { url, headers, body, stream, fetchFn, family, wire, signal }) {
    let upstream;
    try {
        upstream = await fetchFn(url, { method: 'POST', headers, body, signal });
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        throw retryableUpstream(describeError(error), family);
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
        sendJson(response, upstream.status, parsed);
        return;
    }
    const mapUsage = completionsUsageMapper(family, wire);
    if (mapUsage && !stream) {
        const text = await upstream.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        }
        catch {
            parsed = null;
        }
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.usage) {
            parsed = { ...parsed, usage: mapUsage(parsed.usage) };
            sendJson(response, upstream.status, parsed, forwardedHeaders(upstream.headers));
            return;
        }
        response.writeHead(upstream.status, forwardedHeaders(upstream.headers));
        if (text)
            response.write(text);
        if (!response.writableEnded && !response.destroyed)
            response.end();
        return;
    }
    const rewriter = mapUsage ? new SseUsageRewriter(mapUsage) : null;
    const emit = async (chunk) => {
        const parts = rewriter ? rewriter.push(chunk) : [chunk];
        for (const part of parts) {
            if (!response.write(part))
                await once(response, 'drain', { signal });
        }
    };
    // Codex/Grok Responses can open with handshake-only frames. Completions
    // SSE has no `response.created` preamble — gating it waits 64KiB / 120s.
    const gate = new CommitGate(response, upstream, stream === true && (family === 'codex' || family === 'grok'), emit);
    let lastByteAt = Date.now();
    const reader = upstream.body?.getReader();
    try {
        while (reader) {
            const { done, value } = await reader.read();
            if (done)
                break;
            lastByteAt = Date.now();
            if (!(await gate.push(value, signal)))
                continue;
            await emit(value);
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
        throw retryableUpstream(detail, family, upstream);
    }
    finally {
        await reader?.cancel().catch(() => { });
        reader?.releaseLock();
    }
    if (!gate.committed) {
        // Retry only the incident's own signature: an SSE stream that opened, carried
        // nothing but `response.created`, and stopped. Any other shape is forwarded
        // as-is — an unrecognised body is the upstream's answer, not a fault.
        if (gate.gated && (gate.bytes === 0 || gate.sawPreamble)) {
            throw retryableUpstream(`stream ended with no output events (${gate.bytes}B, silent ${Date.now() - lastByteAt}ms)`, family, upstream);
        }
        await gate.release(signal);
    }
    if (rewriter && !response.writableEnded && !response.destroyed) {
        for (const part of rewriter.flush()) {
            if (!response.write(part))
                await once(response, 'drain', { signal });
        }
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
    constructor(response, upstream, stream, emit) {
        this.response = response;
        this.upstream = upstream;
        this.emit = emit;
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
        const emit = this.emit ?? (async (chunk) => {
            if (!this.response.write(chunk))
                await once(this.response, 'drain', { signal });
        });
        for (const chunk of this.buffered)
            await emit(chunk);
        this.buffered = [];
        this.text = '';
    }
}
/** Rewrite Completions SSE `usage` objects; leave other events byte-stable. */
class SseUsageRewriter {
    constructor(mapUsage) {
        this.mapUsage = mapUsage;
        this.decoder = new TextDecoder('utf-8');
        this.tail = '';
    }
    push(chunk) {
        this.tail += this.decoder.decode(chunk, { stream: true });
        return this.#take(false);
    }
    flush() {
        this.tail += this.decoder.decode();
        return this.#take(true);
    }
    #take(end) {
        const parts = this.tail.split(/\r?\n\r?\n/);
        this.tail = end ? '' : (parts.pop() ?? '');
        const out = [];
        for (const frame of parts) {
            if (!frame)
                continue;
            out.push(Buffer.from(`${this.#rewriteFrame(frame)}\n\n`));
        }
        return out;
    }
    #rewriteFrame(frame) {
        const lines = frame.split(/\r?\n/);
        return lines.map((line) => {
            const match = /^data:\s*/.exec(line);
            if (!match)
                return line;
            const raw = line.slice(match[0].length);
            if (!raw || raw === '[DONE]')
                return line;
            let parsed;
            try {
                parsed = JSON.parse(raw);
            }
            catch {
                return line;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.usage == null)
                return line;
            const usage = this.mapUsage(parsed.usage);
            if (usage === parsed.usage)
                return line;
            return `data: ${JSON.stringify({ ...parsed, usage })}`;
        }).join('\n');
    }
}
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade']);
/**
 * Headers that describe the upstream wire, not the bytes this proxy sends.
 * undici already decompressed the body, so `content-encoding` / `content-length`
 * would make the client gunzip plain JSON (or wait for a body of the wrong
 * size). Node re-frames the response (chunked) once they are gone.
 */
const WIRE_ONLY = new Set(['content-encoding', 'content-length']);
function forwardedHeaders(upstreamHeaders) {
    const headers = { 'cache-control': 'no-store' };
    upstreamHeaders.forEach((value, key) => {
        const name = key.toLowerCase();
        if (HOP_BY_HOP.has(name) || WIRE_ONLY.has(name))
            return;
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
