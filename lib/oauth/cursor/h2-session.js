/**
 * In-process Node http2 client for Cursor Connect RPCs.
 * Each RPC owns a session that is destroyed when the call settles.
 * Do not add Bun.
 */
import http2 from 'node:http2';
import { CURSOR_AGENT_URL, CURSOR_API2_URL, CURSOR_AVAILABLE_MODELS_PATH, CURSOR_MODELS_PATH, CURSOR_RUN_PATH, cursorAgentUrl, cursorChatHeaders, } from './index.js';
import { encodeAvailableModelsRequest, encodeCancelAction, encodeExecThrow, encodeGetUsableModelsRequest, encodeKvClientMessage, encodeNativeExecRejection, encodeRequestContextResult, decodeAvailableModelsResponse, decodeGetUsableModelsResponse, frameConnect, splitConnectFrames, } from './proto.js';
import { consumeCursorFrames } from './request.js';
function hexOf(buf) {
    return Buffer.isBuffer(buf) ? buf.toString('hex') : '';
}
export function describeH2TransportError(error, baseUrl) {
    const code = error?.code;
    const message = error instanceof Error ? error.message : String(error);
    if (code === 'ERR_HTTP2_ERROR' && /h2 is not supported/i.test(message)) {
        return (`Cursor transport could not negotiate HTTP/2 with ${baseUrl}: "h2 is not supported". ` +
            'Cursor RPCs are HTTP/2 only; an ALPN-stripping TLS proxy usually causes this.');
    }
    return message;
}
function requestHeaders(session, { path, unary }) {
    const headers = cursorChatHeaders(session, { unary });
    return {
        ':method': 'POST',
        ':path': path,
        ...headers,
    };
}
export async function cursorUnaryRpc({ session, url = CURSOR_API2_URL, path, body = Buffer.alloc(0), connectFn = http2.connect, signal, timeoutMs = 8_000, }) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
        let settled = false;
        const client = connectFn(url);
        const finish = (error, value) => {
            if (settled)
                return;
            settled = true;
            if (timer)
                clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            // Unary sessions are one-shot too; close() would wait forever for a
            // timed-out response whose stream remains open.
            client.destroy();
            if (error !== undefined)
                reject(error);
            else
                resolve(value);
        };
        const fail = (error) => finish(error);
        const timer = timeoutMs > 0
            ? setTimeout(() => fail(new Error('cursor unary timeout')), timeoutMs)
            : undefined;
        if (typeof timer?.unref === 'function')
            timer.unref();
        const onAbort = () => fail(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        client.on('error', (error) => fail(new Error(describeH2TransportError(error, url))));
        const stream = client.request(requestHeaders(session, { path, unary: true }));
        const chunks = [];
        stream.on('data', (chunk) => {
            if (!settled)
                chunks.push(Buffer.from(chunk));
        });
        stream.on('error', fail);
        stream.on('end', () => {
            if (!settled)
                finish(undefined, Buffer.concat(chunks));
        });
        stream.end(body);
    });
}
export async function fetchCursorUsableModels(session, { connectFn, signal, timeoutMs } = {}) {
    const raw = await cursorUnaryRpc({
        session,
        url: cursorAgentUrl() || CURSOR_AGENT_URL,
        path: CURSOR_MODELS_PATH,
        body: encodeGetUsableModelsRequest(),
        connectFn,
        signal,
        timeoutMs,
    });
    return decodeGetUsableModelsResponse(raw);
}
export async function fetchCursorAvailableModels(session, { connectFn, signal, timeoutMs } = {}) {
    const raw = await cursorUnaryRpc({
        session,
        url: CURSOR_API2_URL,
        path: CURSOR_AVAILABLE_MODELS_PATH,
        body: encodeAvailableModelsRequest(),
        connectFn,
        signal,
        timeoutMs,
    });
    return decodeAvailableModelsResponse(raw);
}
/**
 * Drive AgentService/Run. Answers the run handshake (request context), the
 * blob KV get/set, and per-case exec messages so a model turn can complete.
 * Native Cursor tools are rejected with typed results so the model falls back
 * to the MCP tools; MCP calls are handed to DSH, which owns execution.
 */
export async function runCursorAgent(session, built, { signal, connectFn = http2.connect, url = cursorAgentUrl() || CURSOR_AGENT_URL, onEvent, } = {}) {
    signal?.throwIfAborted();
    const blobStore = built.blobStore ?? new Map();
    const events = [];
    const collected = { text: '', thinking: '', toolCalls: [], usage: {}, error: undefined };
    return new Promise((resolve, reject) => {
        let settled = false;
        const client = connectFn(url);
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            // Each Run owns its session. Graceful close waits for the active stream
            // and would keep consuming upstream work after the caller has left.
            client.destroy();
            if (error !== undefined)
                reject(error);
            else
                resolve({ events, collected });
        };
        const onAbort = () => finish(signal.reason);
        signal?.addEventListener('abort', onAbort, { once: true });
        client.on('error', (error) => finish(new Error(describeH2TransportError(error, url))));
        const stream = client.request(requestHeaders(session, { path: CURSOR_RUN_PATH, unary: false }));
        let rest = Buffer.alloc(0);
        const send = (bytes) => {
            if (stream.destroyed || stream.closed)
                return;
            stream.write(frameConnect(bytes));
        };
        const handle = async (msg) => {
            if (settled)
                return;
            if (msg.kind === 'error') {
                collected.error = msg.message;
                events.push(msg);
                await onEvent?.(msg);
                finish(new Error(msg.message));
                return;
            }
            if (msg.kind === 'kv') {
                const key = hexOf(msg.blobId);
                if (msg.set && msg.blobData && key)
                    blobStore.set(key, Buffer.from(msg.blobData));
                const data = key ? blobStore.get(key) : undefined;
                send(encodeKvClientMessage({ id: msg.id ?? 0, blobData: data, set: msg.set === true }));
                return;
            }
            if (msg.kind === 'exec') {
                // Cursor's run handshake always asks for request context. Throwing
                // here (or returning no result) fails the whole Run with
                // "Failed to get request context", so answer with the MCP tools DSH
                // advertised.
                if (msg.execCase === 'requestContextArgs') {
                    send(encodeRequestContextResult({ id: msg.id, execId: msg.execId, tools: built.tools }));
                    return;
                }
                if (msg.mcp) {
                    // DSH owns tool execution: surface the call and end this Run so the
                    // client runs the tool and replays the result on the next request.
                    const tool = {
                        id: msg.mcp.toolCallId || `call_${events.length + 1}`,
                        name: msg.mcp.toolName || msg.mcp.name,
                        arguments: msg.mcp.arguments ?? {},
                    };
                    collected.toolCalls.push({
                        id: tool.id,
                        type: 'function',
                        function: { name: tool.name, arguments: JSON.stringify(tool.arguments) },
                    });
                    const event = { kind: 'interaction', toolCall: tool };
                    events.push(event);
                    await onEvent?.(event);
                    finish();
                    return;
                }
                // Native Cursor tools are answered with a typed rejection so the model
                // falls back to the MCP tools instead of aborting the run.
                const rejection = encodeNativeExecRejection(msg);
                if (rejection) {
                    send(rejection);
                    return;
                }
                send(encodeExecThrow({ id: msg.id, error: 'dsh owns tool execution' }));
                return;
            }
            if (msg.kind === 'query') {
                send(encodeCancelAction());
                return;
            }
            if (msg.kind === 'interaction') {
                if (msg.text)
                    collected.text += msg.text;
                if (msg.thinking)
                    collected.thinking += msg.thinking;
                if (msg.tokens) {
                    collected.usage.completionTokens = (collected.usage.completionTokens ?? 0) + msg.tokens;
                }
                if (msg.usage) {
                    if (Number.isFinite(msg.usage.promptTokens))
                        collected.usage.promptTokens = msg.usage.promptTokens;
                    if (Number.isFinite(msg.usage.completionTokens))
                        collected.usage.completionTokens = msg.usage.completionTokens;
                    if (Number.isFinite(msg.usage.cachedTokens))
                        collected.usage.cachedTokens = msg.usage.cachedTokens;
                }
                // tool_call_started is informational; the authoritative MCP call (with
                // real arguments) arrives as execServerMessage.mcpArgs. Emitting both
                // would duplicate the OpenAI tool_call, and this update carries no args.
                const event = msg.toolCall ? { ...msg, toolCall: undefined } : msg;
                events.push(event);
                await onEvent?.(event);
                if (msg.turnEnded) {
                    try {
                        stream.end();
                    }
                    catch { /* */ }
                    finish();
                }
                return;
            }
        };
        const consume = async () => {
            try {
                // Pull one chunk at a time: a blocked downstream consumer must stop
                // HTTP/2 reads, not accumulate unobserved callback promises.
                for await (const chunk of stream) {
                    if (settled)
                        return;
                    const messages = [];
                    rest = consumeCursorFrames(chunk, rest, (msg) => messages.push(msg));
                    for (const msg of messages) {
                        if (settled)
                            return;
                        await handle(msg);
                    }
                }
                if (rest.length)
                    throw new Error('cursor Connect stream truncated at EOF: ' + rest.length + ' buffered bytes');
                finish();
            }
            catch (error) {
                finish(error);
            }
        };
        stream.on('error', (error) => finish(error));
        void consume();
        stream.write(frameConnect(built.requestBytes));
    });
}
export { CURSOR_AGENT_URL, CURSOR_RUN_PATH, splitConnectFrames };
