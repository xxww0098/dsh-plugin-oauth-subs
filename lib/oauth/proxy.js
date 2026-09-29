/**
 * Loopback LLM proxy: authenticates DSH calls, dispatches family transports,
 * and gates passthrough streams before output (timing, retries and failure
 * answers live in upstream.ts). Settings operations
 * stay on the host-owned RPC channel; vendor translation lives in each family.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { CODEX_API_URL, CODEX_CLIENT_VERSION, CODEX_MODELS, CODEX_MODELS_URL, codexRoutingHint, codexUpstreamHeaders } from './codex/index.js';
import { applyCodexCache, codexCacheHeaders } from './codex/cache.js';
import { GROK_API_URL, GROK_MODELS, grokAffinityHeaders, grokUpstreamHeaders } from './grok/index.js';
import { applyGrokCache } from './grok/cache.js';
import { normalizeGrokResponsesBody } from './grok/request.js';
import { GLM_MODELS, glmAnthropicDirectUrl, glmAnthropicHeaders, glmAnthropicUrl, glmCodingUrl, glmUpstreamHeaders } from './glm/index.js';
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
import { commandCodeCatalogModels } from '../apikey/command-code/catalog.js';
import { applyCommandCodeCache } from '../apikey/command-code/cache.js';
import { forwardCommandCode } from '../apikey/command-code/transport.js';
import { KIMI_CHAT_URL, kimiUpstreamHeaders } from './kimi/index.js';
import { kimiCatalogModels } from './kimi/catalog.js';
import { applyKimiCache } from './kimi/cache.js';
import { applyKimiStreamUsage, applyKimiThinking, mapKimiUsage } from './kimi/request.js';
import { copilotChatUrl, copilotUpstreamHeaders, } from './copilot/index.js';
import { copilotCatalogModels } from './copilot/catalog.js';
import { applyCopilotCache, copilotHasVision, copilotInitiatorOf } from './copilot/cache.js';
import { applyCopilotStreamUsage, applyCopilotThinking, mapCopilotUsage } from './copilot/request.js';
import { forwardCursor } from './cursor/transport.js';
import { devinCatalogModels } from './devin/catalog.js';
import { applyDevinCache } from './devin/cache.js';
import { forwardDevin } from './devin/transport.js';
import { RequestError, describeError, sendJson } from '../utils/http.js';
import { applyFastMode } from '../utils/fast-mode.js';
import { encodeCodexBody, normalizeCodexResponsesBody } from './codex/request.js';
import { CLINE_CHAT_URL, clineUpstreamHeaders } from './cline/index.js';
import { clineCatalogModels } from './cline/catalog.js';
import { applyClineCache } from './cline/cache.js';
import { applyClineMaxCompletionTokens, applyClineStreamUsage, applyClineThinking, clineQuotaFailure, mapClineUsage, unwrapClineEnvelope } from './cline/request.js';
import { withPickerVariants } from './models.js';
import { outboundFetch } from '../utils/outbound.js';
import { SseFrameScanner } from './responses-sse.js';
import { UpstreamFailure, answerFailure, pumpBody, upstreamRequest, waitForDrain } from './upstream.js';
import { forcedRefresh } from './tokens.js';
export const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
/** Unclassifiable bytes a gated stream may buffer before committing anyway. */
const MAX_UNCLASSIFIED_BYTES = 64 * 1024;
/**
 * Everything a gated stream may buffer. Past this the gate commits without
 * retry protection rather than kill a legitimate response.
 */
const MAX_GATE_BUFFER_BYTES = 2 * 1024 * 1024;
/**
 * Forward the upstream's own retry headers so the client can back off at the
 * upstream's pace (the 2026-10-23 token-lifecycle contract: 4xx/5xx answers
 * are forwarded, never retried in the proxy).
 */
function retryAfterOf(upstreamHeaders) {
    return {
        retryAfter: upstreamHeaders?.get?.('retry-after')?.trim() || undefined,
        retryAfterMs: upstreamHeaders?.get?.('retry-after-ms')?.trim() || undefined,
    };
}
/** Gateway answers that mean "not this hop", not "bad request body". */
const GATEWAY_FALLBACK_STATUSES = new Set([401, 403, 404]);
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
/**
 * Per-family count of inbound bodies with / without DSH's `prompt_cache_key`,
 * taken before any family strips it. Served on `/health` as the one signal
 * that the host actually sends session ids to the loopback. Counts only.
 */
const inboundCacheKeys = {};
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
    const seen = inboundCacheKeys[family] ??= { with: 0, without: 0 };
    if (typeof payload.prompt_cache_key === 'string' && payload.prompt_cache_key.trim())
        seen.with += 1;
    else
        seen.without += 1;
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
    if (family === 'grok') {
        // Grok Fast is a real backend model id (`grok-4.7-build-fast`), not Codex
        // Priority: the shared peel would rewrite it to a nonexistent model.
        // normalizeGrokResponsesBody owns model hygiene + service_tier here.
        const { payload: next, cacheSessionId } = applyGrokCache(normalizeGrokResponsesBody(payload));
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
            grokModel: typeof next.model === 'string' ? next.model : undefined,
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
    if (family === 'devin') {
        // Devin `-fast` is a real backend variant uid, not Codex Priority — the
        // picker id must reach openaiToDevin unpeeled, same as Cursor.
        const { payload: next, cacheSessionId } = applyDevinCache(payload);
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
        };
    }
    if (family === 'cline') {
        // OpenRouter-backed Completions: cache affinity rides the X-Task-ID
        // header (clineCacheHeaders), not a body field. The body edits are the
        // CLI's own three (max_completion_tokens rename, include_usage,
        // reasoning_effort passthrough) and nothing else.
        const { payload: cached, cacheSessionId } = applyClineCache(fast);
        const next = applyClineStreamUsage(applyClineThinking(applyClineMaxCompletionTokens(cached)));
        return {
            payload: next,
            cacheSessionId,
            stream: next.stream === true,
        };
    }
    if (family === 'command-code') {
        // threadId is the wire's top-level cache-affinity uuid (see cache.ts);
        // foreign DSH fields are stripped before openaiToCommandCode maps the
        // body onto /alpha/generate's JSONL protocol.
        const { payload: next, threadId } = applyCommandCodeCache(fast);
        return {
            payload: next,
            cacheSessionId: threadId,
            threadId,
            stream: next.stream === true,
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
export function createProxy({ port, apiKey, tokens, fetchFn = outboundFetch, maxRequestBodyBytes = MAX_REQUEST_BODY_BYTES, upstreamTimeouts = undefined, onAntigravityValidation = undefined, cursorRpc = undefined, devinChat = undefined }) {
    let server;
    // Set once close() starts. A socket that was busy then stays keep-alive and the
    // old server keeps answering on it, so every answer from here on tells the
    // client to reconnect (to the new instance on the same port).
    let closing = false;
    // llm-pi-ai sends Authorization: Bearer for Completions/Responses but the
    // Anthropic SDK authenticates with x-api-key (authToken is only used for
    // sk-ant-oat* OAuth tokens). Accept either spelling of the same proxy key —
    // a 401 here surfaces in DSH as 「API 密钥无效」 before the hop ever runs.
    const authorized = (request) => {
        const header = request.headers.authorization ?? '';
        const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
        const apiKeyHeader = request.headers['x-api-key'];
        const apiKeyToken = typeof apiKeyHeader === 'string' ? apiKeyHeader.trim() : '';
        return (bearer.length > 0 && bearer === apiKey) || (apiKeyToken.length > 0 && apiKeyToken === apiKey);
    };
    const handle = async (request, response) => {
        // The pre-output budget starts here, so the tokens.session() wait counts.
        const startedAt = Date.now();
        if (closing)
            response.setHeader('connection', 'close');
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        const path = url.pathname.replace(/\/+$/, '') || '/';
        if (path === '/health' && request.method === 'GET') {
            sendJson(response, 200, { ok: true, plugin: 'dsh-plugin-oauth-subs', inboundCacheKeys });
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
            try {
                if (tokens.devin) {
                    await tokens.devin.session();
                    data.push(...devinCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'devin' })));
                }
            }
            catch { /* not logged in */ }
            try {
                if (tokens.cline) {
                    await tokens.cline.session();
                    data.push(...clineCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'cline' })));
                }
            }
            catch { /* not logged in */ }
            try {
                if (tokens['command-code']) {
                    await tokens['command-code'].session();
                    data.push(...commandCodeCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'command-code' })));
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
                    tokens: tokens.codex,
                    headersOf: codexUpstreamHeaders,
                    fetchFn,
                    family: 'codex',
                    encodeBody: encodeCodexBody,
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
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
                    tokens: tokens.grok,
                    headersOf: grokUpstreamHeaders,
                    fetchFn,
                    family: 'grok',
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
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
                    tokens: tokens.glm,
                    headersOf: glmUpstreamHeaders,
                    fetchFn,
                    family: 'glm',
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
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
                    // Official Coding Plan hop: the endpoint rewritten to the ZCode
                    // gateway (official-coding-plan-gateway.ts). Direct endpoint stays as
                    // the one-shot fallback when the gateway refuses the bearer.
                    url: glmAnthropicUrl(session.region),
                    fallbackUrl: glmAnthropicDirectUrl(session.region),
                    session,
                    tokens: tokens.glm,
                    headersOf: glmAnthropicHeaders,
                    fetchFn,
                    family: 'glm',
                    wire: 'anthropic',
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
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
                    tokens: tokens.kiro,
                    fetchFn,
                    signal: client.signal,
                    startedAt,
                    timeouts: upstreamTimeouts,
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
                    tokens: tokens.cursor,
                    startedAt,
                    upstreamTimeouts,
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
                    tokens: tokens.ollama,
                    headersOf: ollamaUpstreamHeaders,
                    fetchFn,
                    family: 'ollama',
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
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
                    tokens: tokens.kimi,
                    headersOf: kimiUpstreamHeaders,
                    fetchFn,
                    family: 'kimi',
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
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
                    tokens: tokens.copilot,
                    headersOf: (sess, pin) => copilotUpstreamHeaders(sess, pin),
                    fetchFn,
                    family: 'copilot',
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
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
        if ((path === '/devin/v1/models' || path === '/devin/models') && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: devinCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'devin' })),
            });
            return;
        }
        if ((path === '/devin/v1/chat/completions' || path === '/devin/chat/completions') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens.devin.session();
                const input = rewriteUpstreamBody(await readBody(request, maxRequestBodyBytes), 'devin');
                await forwardDevin(response, {
                    ...input,
                    session,
                    tokens: tokens.devin,
                    fetchFn,
                    signal: client.signal,
                    startedAt,
                    timeouts: upstreamTimeouts,
                    runFn: devinChat,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/devin/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'Devin chat is Connect ApiServerService/GetChatMessage. Point llm-pi-ai at POST /devin/v1/chat/completions.',
                },
            });
            return;
        }
        if ((path === '/cline/v1/models' || path === '/cline/models') && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: clineCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'cline' })),
            });
            return;
        }
        if ((path === '/cline/v1/chat/completions' || path === '/cline/chat/completions') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                await forward(request, response, {
                    url: CLINE_CHAT_URL,
                    session: await tokens.cline.session(),
                    tokens: tokens.cline,
                    headersOf: clineUpstreamHeaders,
                    fetchFn,
                    family: 'cline',
                    classifyFailure: clineQuotaFailure,
                    maxRequestBodyBytes,
                    upstreamTimeouts,
                    startedAt,
                    signal: client.signal,
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/cline/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'Cline is Completions. Point llm-pi-ai at POST /cline/v1/chat/completions.',
                },
            });
            return;
        }
        if ((path === '/command-code/v1/models' || path === '/command-code/models') && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: commandCodeCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'command-code' })),
            });
            return;
        }
        if ((path === '/command-code/v1/chat/completions' || path === '/command-code/chat/completions') && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                const session = await tokens['command-code'].session();
                const input = rewriteUpstreamBody(await readBody(request, maxRequestBodyBytes), 'command-code');
                await forwardCommandCode(response, {
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
        if (path === '/command-code/v1/responses') {
            sendJson(response, 501, {
                error: {
                    message: 'Command Code chat is /alpha/generate JSONL. Point llm-pi-ai at POST /command-code/v1/chat/completions.',
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
                    startedAt,
                    upstreamTimeouts,
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
                handle(request, response).catch((error) => answerFailure(response, error));
            });
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, '127.0.0.1', resolve);
            });
            return server;
        },
        /**
         * Stops accepting, lets in-flight requests finish, and resolves once the last
         * connection is gone — the caller closes what the handlers use (the outbound
         * agent) only after that.
         */
        async close() {
            if (server === undefined)
                return;
            closing = true;
            const gone = new Promise((resolve) => server.close(() => resolve()));
            // close() only drops connections idle right now; sweep the ones that go idle later.
            const sweep = setInterval(() => server.closeIdleConnections(), 250);
            sweep.unref();
            await gone;
            clearInterval(sweep);
            server = undefined;
        },
    };
}
async function forward(request, response, { url, fallbackUrl = undefined, session, tokens, headersOf, fetchFn, family, wire = undefined, maxRequestBodyBytes, upstreamTimeouts, startedAt, signal, classifyFailure = undefined, encodeBody = undefined }) {
    const raw = await readBody(request, maxRequestBodyBytes);
    const { payload, cacheSessionId, stream, routingHint, grokModel, copilotVision, copilotInitiator } = rewriteUpstreamBody(raw, family, wire);
    // A route's `encodeBody` (Codex zstd) runs once; retries resend the same bytes.
    const plain = Buffer.from(JSON.stringify(payload));
    const { body, headers: encodingHeaders = {} } = encodeBody?.(plain) ?? { body: plain };
    const grokReqId = family === 'grok' ? randomUUID() : undefined;
    // Rebuilt whole after a 401 refresh: the route overrides below must win over
    // the family's own headers (stream `accept`, Copilot `x-initiator`).
    const headersFor = (current) => ({
        ...headersOf(current, cacheSessionId),
        'content-type': request.headers['content-type'] ?? 'application/json',
        ...(stream ? { accept: 'text/event-stream' } : {}),
        ...encodingHeaders,
        ...(family === 'codex' ? {
            ...codexCacheHeaders(cacheSessionId),
            ...(routingHint ? { 'x-codex-routing-hint': routingHint } : {}),
        } : {}),
        ...(family === 'copilot' ? {
            'x-initiator': copilotInitiator === 'agent' ? 'agent' : 'user',
            ...(copilotVision ? { 'copilot-vision-request': 'true' } : {}),
        } : {}),
    });
    let baseHeaders = headersFor(session);
    // Codex hands back `x-codex-turn-state` on a failed attempt; the retry replays it.
    const turn = { state: undefined };
    // One-shot reroute to the direct endpoint when the gateway refuses this hop.
    let fallbackPending = typeof fallbackUrl === 'string' && fallbackUrl.length > 0 && fallbackUrl !== url;
    await upstreamRequest({ family, signal, startedAt, stream, response, timeouts: upstreamTimeouts }).run(async (attempt) => {
        for (;;) {
            const headers = {
                ...baseHeaders,
                ...(family === 'grok' ? grokAffinityHeaders(cacheSessionId, {
                    model: grokModel,
                    reqId: grokReqId,
                    retryAttempt: attempt.index,
                }) : {}),
                ...(family === 'codex' && turn.state ? { 'x-codex-turn-state': turn.state } : {}),
            };
            try {
                return await attemptUpstream(response, { url, headers, body, stream, fetchFn, family, wire, attempt, turn, classifyFailure });
            }
            catch (error) {
                // The Coding Plan gateway (zcode.z.ai) can refuse a bearer the model
                // endpoint still accepts: reroute once, within this attempt.
                if (!(fallbackPending && error instanceof UpstreamFailure && error.code === 'http' && GATEWAY_FALLBACK_STATUSES.has(error.status)))
                    throw error;
                fallbackPending = false;
                url = fallbackUrl;
                console.error(`[oauth-subs] ${family} gateway ${error.status}; falling back to the direct endpoint`);
            }
        }
    }, {
        refresh: forcedRefresh(tokens, () => session, (next) => { session = next; baseHeaders = headersFor(next); }),
    });
}
function upstreamErrorPayload(text, family, status) {
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
                message: `${family} upstream ${status} with empty body`,
                type: 'invalid_request_error',
                code: 'invalid_request',
            },
        };
    }
    return parsed;
}
function completionsUsageMapper(family, wire) {
    if (family === 'copilot')
        return mapCopilotUsage;
    if (family === 'kimi')
        return mapKimiUsage;
    if (family === 'cline')
        return mapClineUsage;
    if (family === 'glm' && wire !== 'anthropic')
        return mapGlmChatUsage;
    return undefined;
}
/**
 * One upstream attempt. The client response stays uncommitted until the stream
 * proves it is producing output, so a break during the silent pre-output window
 * — the signature of the 2026-08-26 incident, where every failed stream carried
 * `response.created` and nothing else — can be retried without the client ever
 * seeing a truncated stream. Timing and retries belong to `upstreamRequest`.
 */
async function attemptUpstream(response, { url, headers, body, stream, fetchFn, family, wire, attempt, turn, classifyFailure }) {
    const { signal } = attempt;
    const upstream = await fetchFn(url, { method: 'POST', headers, body, signal });
    const transport = (message) => {
        const state = family === 'codex' ? upstream.headers?.get?.('x-codex-turn-state')?.trim() : undefined;
        if (state)
            turn.state = state;
        return new UpstreamFailure(502, message, { code: 'transport' });
    };
    if (upstream.status >= 400) {
        const parsed = upstreamErrorPayload(await upstream.text(), family, upstream.status);
        throw classifyFailure?.(upstream.status, parsed)
            ?? new UpstreamFailure(upstream.status, `${family} upstream ${upstream.status}`, { code: 'http', payload: parsed, ...retryAfterOf(upstream.headers) });
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
        // Cline wraps a non-streaming completion in `{success, data}`; a raw
        // passthrough would hand DSH an envelope with no `choices`.
        const payload = family === 'cline' ? unwrapClineEnvelope(parsed) : parsed;
        if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.usage) {
            sendJson(response, upstream.status, { ...payload, usage: mapUsage(payload.usage) }, forwardedHeaders(upstream.headers));
            return;
        }
        if (payload !== parsed && payload !== null) {
            sendJson(response, upstream.status, payload, forwardedHeaders(upstream.headers));
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
                await waitForDrain(response, signal);
        }
    };
    // Codex/Grok Responses can open with handshake-only frames. Completions
    // SSE has no `response.created` preamble — gating it would wait for 64KiB.
    const gate = new CommitGate(response, upstream, stream === true && (family === 'codex' || family === 'grok'), emit, family);
    let lastByteAt = Date.now();
    try {
        await pumpBody(upstream.body, attempt, async (value) => {
            lastByteAt = Date.now();
            if (await gate.push(value))
                await emit(value);
        });
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        // Committed: upstreamRequest rethrows it and answerFailure destroys the
        // response — a clean end reads as a finished SSE stream to llm-pi-ai.
        throw transport(`${describeError(error)} (silent ${Date.now() - lastByteAt}ms, ${gate.bytes}B seen, committed=${gate.committed})`);
    }
    if (!gate.committed) {
        // Retry only the incident's own signature: an SSE stream that opened, carried
        // nothing but `response.created`, and stopped. Any other shape is forwarded
        // as-is — an unrecognised body is the upstream's answer, not a fault.
        if (gate.gated && (gate.bytes === 0 || gate.sawPreamble)) {
            throw transport(`stream ended with no output events (${gate.bytes}B, silent ${Date.now() - lastByteAt}ms)`);
        }
        await gate.flush();
    }
    if (rewriter && !response.writableEnded && !response.destroyed) {
        for (const part of rewriter.flush()) {
            if (!response.write(part))
                await waitForDrain(response, signal);
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
    constructor(response, upstream, stream, emit, family) {
        this.response = response;
        this.upstream = upstream;
        this.emit = emit;
        this.family = family;
        this.buffered = [];
        this.bytes = 0;
        this.unclassified = 0;
        this.committed = false;
        this.sawPreamble = false;
        this.gated = stream === true;
        this.scanner = new SseFrameScanner();
    }
    /** Returns true once the caller should write `chunk` through itself. */
    async push(chunk) {
        if (this.committed)
            return true;
        if (!this.gated) {
            this.commit();
            return true;
        }
        this.buffered.push(chunk);
        this.bytes += chunk.length;
        // Preamble frames echo the whole request prompt (~128KB for DSH), so only
        // bytes that are neither preamble nor output count toward the cap.
        let output = false;
        for (const frame of this.scanner.push(chunk)) {
            if (frame.kind === 'output')
                output = true;
            else if (frame.kind === 'preamble')
                this.sawPreamble = true;
            else
                this.unclassified += frame.bytes;
        }
        if (!output && this.bytes > MAX_GATE_BUFFER_BYTES) {
            console.error(`[oauth-subs] ${this.family} buffered ${this.bytes}B with no output event; committing without retry protection`);
            output = true;
        }
        if (output || this.unclassified > MAX_UNCLASSIFIED_BYTES) {
            await this.flush();
        }
        return false;
    }
    commit() {
        if (this.committed)
            return;
        this.committed = true;
        this.response.writeHead(this.upstream.status, forwardedHeaders(this.upstream.headers));
    }
    /** Commit and emit whatever is buffered — output arrived, or a body we decided not to retry. */
    async flush() {
        this.commit();
        for (const chunk of this.buffered)
            await this.emit(chunk);
        this.buffered = [];
        this.scanner = null;
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
