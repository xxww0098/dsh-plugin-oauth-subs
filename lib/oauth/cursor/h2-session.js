/**
 * In-process Node http2 client for Cursor Connect RPCs.
 * Each RPC owns a session that is destroyed when the call settles.
 * Do not add Bun.
 */
import http2 from 'node:http2';
import { CURSOR_AGENT_URL, CURSOR_API2_URL, CURSOR_AVAILABLE_MODELS_PATH, CURSOR_MODELS_PATH, CURSOR_RUN_PATH, cursorAgentUrl, cursorChatHeaders, } from './index.js';
import { encodeAvailableModelsRequest, encodeCancelAction, encodeExecThrow, encodeGetUsableModelsRequest, encodeKvClientMessage, decodeAvailableModelsResponse, decodeGetUsableModelsResponse, frameConnect, splitConnectFrames, } from './proto.js';
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
 * Drive AgentService/Run. Answers KV get/set from the local blob store.
 * Native Cursor tools are thrown so DSH Completions can own MCP tools.
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
                send(encodeKvClientMessage({ id: msg.id ?? 0, blobData: data }));
                return;
            }
            if (msg.kind === 'exec') {
                send(encodeExecThrow({ id: msg.id, error: 'dsh owns tool execution' }));
                if (msg.mcp?.name) {
                    const tool = { id: msg.mcp.toolCallId || `call_${events.length + 1}`, name: msg.mcp.name };
                    collected.toolCalls.push({
                        id: tool.id,
                        type: 'function',
                        function: { name: tool.name, arguments: '{}' },
                    });
                    const event = { kind: 'interaction', toolCall: tool };
                    events.push(event);
                    await onEvent?.(event);
                }
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
                if (msg.toolCall) {
                    collected.toolCalls.push({
                        id: msg.toolCall.id,
                        type: 'function',
                        function: { name: msg.toolCall.name, arguments: '{}' },
                    });
                }
                events.push(msg);
                await onEvent?.(msg);
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
