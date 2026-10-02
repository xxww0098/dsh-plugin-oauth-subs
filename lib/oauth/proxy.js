/**
 * Loopback LLM proxy: authenticates DSH calls and dispatches each route to its
 * family transport or to the passthrough hop (passthrough.ts; body read and
 * cache rewrite in proxy-body.ts; timing, retries and failure answers in
 * upstream.ts). Settings operations stay on the host-owned RPC channel;
 * vendor translation lives in each family.
 */
import { createServer } from 'node:http';
import { CODEX_API_URL, CODEX_CLIENT_VERSION, CODEX_MODELS, CODEX_MODELS_URL, codexUpstreamHeaders, } from './codex/index.js';
import { GROK_API_URL, GROK_MODELS, grokUpstreamHeaders } from './grok/index.js';
import { GLM_MODELS, glmAnthropicDirectUrl, glmAnthropicHeaders, glmAnthropicUrl, glmCodingUrl, glmUpstreamHeaders, } from './glm/index.js';
import { kiroCatalogModels } from './kiro/catalog.js';
import { forwardKiro } from './kiro/transport.js';
import { ANTIGRAVITY_MODELS } from './antigravity/index.js';
import { forwardAntigravity } from './antigravity/transport.js';
import { cursorCatalogModels } from './cursor/catalog.js';
import { OLLAMA_CHAT_URL, ollamaUpstreamHeaders } from '../apikey/ollama/index.js';
import { ollamaCatalogModels } from '../apikey/ollama/catalog.js';
import { commandCodeCatalogModels } from '../apikey/command-code/catalog.js';
import { forwardCommandCode } from '../apikey/command-code/transport.js';
import { KIMI_CHAT_URL, kimiUpstreamHeaders } from './kimi/index.js';
import { kimiCatalogModels } from './kimi/catalog.js';
import { copilotChatUrl, copilotUpstreamHeaders } from './copilot/index.js';
import { copilotCatalogModels } from './copilot/catalog.js';
import { forwardCursor } from './cursor/transport.js';
import { devinCatalogModels } from './devin/catalog.js';
import { forwardDevin } from './devin/transport.js';
import { sendJson } from '../utils/http.js';
import { CODEX_RATE_LIMITS_EVENT } from './codex/quota.js';
import { encodeCodexBody } from './codex/request.js';
import { CLINE_CHAT_URL, clineUpstreamHeaders } from './cline/index.js';
import { clineCatalogModels } from './cline/catalog.js';
import { clineQuotaFailure } from './cline/request.js';
import { CHATGPT_RESPONSES_URL, chatgptUpstreamHeaders } from './chatgpt/index.js';
import { chatgptCatalogModels } from './chatgpt/catalog.js';
import { chatgptPickerModels } from './models.js';
import { chatgptQuotaFailure } from './chatgpt/request.js';
import { withPickerVariants } from './models.js';
import { outboundFetch } from '../utils/outbound.js';
import { answerFailure } from './upstream.js';
import { forward } from './passthrough.js';
import { inboundCacheKeys, MAX_REQUEST_BODY_BYTES, readBody, rewriteUpstreamBody } from './proxy-body.js';
function originOf(port) {
    return `http://127.0.0.1:${port}`;
}
export { describeError } from '../utils/http.js';
export { MAX_REQUEST_BODY_BYTES } from './proxy-body.js';
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
export function createProxy({ port, apiKey, tokens, fetchFn = outboundFetch, maxRequestBodyBytes = MAX_REQUEST_BODY_BYTES, upstreamTimeouts = undefined, onAntigravityValidation = undefined, cursorRpc = undefined, devinChat = undefined, onQuotaUsed = undefined, onQuotaLearned = undefined }) {
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
                if (tokens.chatgpt) {
                    await tokens.chatgpt.session();
                    data.push(...chatgptPickerModels(chatgptCatalogModels()).map((model) => ({ id: model.id, object: 'model', owned_by: 'chatgpt' })));
                }
            }
            catch { /* not logged in */ }
            try {
                await tokens.grok.session();
                data.push(...withPickerVariants(GROK_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'grok' })));
            }
            catch { /* not logged in */ }
            try {
                await tokens.glm.session();
                data.push(...withPickerVariants(GLM_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'glm' })));
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
                    // The stream's own rate-limit frame is quota data; the store decides
                    // what to keep (quota.ts `learn`).
                    ...(onQuotaLearned ? { captureSse: { type: CODEX_RATE_LIMITS_EVENT, onData: (data) => onQuotaLearned('codex', data) } } : {}),
                });
            }
            finally {
                client.cleanup();
            }
            return;
        }
        if (path === '/chatgpt/v1/models' && request.method === 'GET') {
            sendJson(response, 200, {
                object: 'list',
                data: chatgptPickerModels(chatgptCatalogModels()).map((model) => ({ id: model.id, object: 'model', owned_by: 'chatgpt' })),
            });
            return;
        }
        if (path === '/chatgpt/v1/responses' && request.method === 'POST') {
            const client = abortOnDisconnect(request, response);
            try {
                await forward(request, response, {
                    url: CHATGPT_RESPONSES_URL,
                    session: await tokens.chatgpt.session(),
                    tokens: tokens.chatgpt,
                    headersOf: chatgptUpstreamHeaders,
                    fetchFn,
                    family: 'chatgpt',
                    classifyFailure: chatgptQuotaFailure,
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
                data: withPickerVariants(GLM_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'glm' })),
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
                    // Cloud does serve /v1/responses but ignores previous_response_id and
                    // store, so this hop deliberately stays Completions (see ollama README).
                    message: 'Ollama hop is Completions only. Point llm-pi-ai at POST /ollama/v1/chat/completions.',
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
                // A chat hop spends the family's quota whatever the outcome (a 429 is
                // news too). Fire once the response is fully written or torn down.
                const family = onQuotaUsed ? quotaFamilyOf(request) : undefined;
                if (family)
                    response.once('close', () => { try {
                        onQuotaUsed(family);
                    }
                    catch { /* best-effort */ } });
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
const QUOTA_CHAT_PATH = /^\/([a-z-]+)\/(?:v1\/)*(?:chat\/completions|responses|messages)$/;
/** Family whose quota a POST chat request spends; undefined for anything else. */
export function quotaFamilyOf(request) {
    if (request.method !== 'POST')
        return undefined;
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname.replace(/\/+$/, '');
    return QUOTA_CHAT_PATH.exec(path)?.[1];
}
