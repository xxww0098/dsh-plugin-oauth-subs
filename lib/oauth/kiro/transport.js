/** AWS EventStream HTTP lifecycle and OpenAI streaming translation. */
import { sendJson } from '../../utils/http.js';
import { UpstreamFailure, upstreamRequest } from '../upstream.js';
import { forcedRefresh } from '../tokens.js';
import { kiroStreamingProfileArn } from './index.js';
import { classifyKiroHopError, kiroChatHeaders, kiroChatUrl, kiroClientErrorBody, kiroToOpenai, kiroToOpenaiChunk, KiroEventStreamParser, mapKiroUsage, mergeKiroText, openaiToKiro, resolveKiroUsage, thinkingTextFromPayload, unwrapKiroEventPayload, } from './request.js';
function headerValue(headers, name) {
    if (!headers)
        return undefined;
    if (typeof headers.get === 'function')
        return headers.get(name) ?? undefined;
    return headers[name] ?? headers[name.toLowerCase()];
}
/** A Kiro vendor answer as the failure `run` forwards once, never replays. */
function kiroHopFailure(status, parsed, text, retryAfter = undefined) {
    const classified = classifyKiroHopError(status, parsed, text, { retryAfter });
    const body = kiroClientErrorBody(status, parsed, text);
    if (classified.code === 'kiro_quota') {
        // The host reads `usage limit reached:` as QUOTA_EXCEEDED: no retry, accurate hint.
        return new UpstreamFailure(429, `usage limit reached: ${body.error.message}`, { code: 'quota' });
    }
    // 401/403 travel as 401 so `run` refreshes once; forwardKiro maps a survivor to 400.
    const auth = (status === 401 || status === 403) && classified.code === 'kiro_upstream';
    return new UpstreamFailure(auth ? 401 : classified.status, `kiro upstream ${status}`, {
        code: 'http',
        payload: body,
        retryAfter: classified.retryAfter,
    });
}
/**
 * A destroyed response emits 'close', never 'drain', so awaiting 'drain' alone
 * hangs forever when the client goes away. Race drain against close/error/abort
 * so a disconnected client fails fast instead of pinning the upstream reader.
 */
function waitForDrain(response, signal) {
    if (response.destroyed)
        return Promise.reject(new Error('client disconnected'));
    return new Promise((resolve, reject) => {
        const onDrain = () => { cleanup(); resolve(undefined); };
        const onClose = () => { cleanup(); reject(new Error('client disconnected before drain')); };
        const onError = (error) => { cleanup(); reject(error); };
        const onAbort = () => { cleanup(); reject(signal?.reason ?? new Error('aborted')); };
        const cleanup = () => {
            response.off('drain', onDrain);
            response.off('close', onClose);
            response.off('error', onError);
            if (signal)
                signal.removeEventListener('abort', onAbort);
        };
        response.once('drain', onDrain);
        response.once('close', onClose);
        response.once('error', onError);
        if (signal) {
            if (signal.aborted) {
                onAbort();
                return;
            }
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
}
async function writeKiroSse(response, chunk, signal) {
    if (!response.headersSent) {
        response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
        });
    }
    if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`))
        await waitForDrain(response, signal);
}
/**
 * One Kiro hop inside the attempt primitive: timers, transport retries and a
 * single refresh on 401/403. Nothing reaches the client before the first
 * mapped output chunk; a failure after it destroys the response.
 */
export async function forwardKiro(response, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, startedAt, timeouts }) {
    try {
        await upstreamRequest({ family: 'kiro', signal, startedAt, stream, response, timeouts }).run((attempt) => attemptKiro(response, { payload, cacheSessionId, stream, session, fetchFn, attempt }), {
            refresh: async () => {
                const next = await forcedRefresh(tokens, session);
                if (next)
                    session = next;
                return Boolean(next);
            },
        });
    }
    catch (error) {
        // Still refused after the refresh: the subscription itself is valid, so
        // keep it off the host's AUTH path ("API key invalid") with a 400.
        if (error instanceof UpstreamFailure && error.code === 'http' && error.status === 401) {
            throw new UpstreamFailure(400, error.message, { code: 'http', payload: error.payload });
        }
        throw error;
    }
}
async function attemptKiro(response, { payload, cacheSessionId, stream, session, fetchFn, attempt }) {
    const { signal } = attempt;
    const body = Buffer.from(JSON.stringify(openaiToKiro(payload, {
        conversationId: cacheSessionId,
        profileArn: kiroStreamingProfileArn(session),
    })));
    const upstream = await fetchFn(kiroChatUrl(session), { method: 'POST', headers: kiroChatHeaders(session), body, signal });
    if (upstream.status >= 400) {
        const text = await upstream.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        }
        catch {
            parsed = null;
        }
        throw kiroHopFailure(upstream.status, parsed, text, headerValue(upstream.headers, 'retry-after'));
    }
    const model = typeof payload.model === 'string' ? payload.model : 'kiro';
    const id = `chatcmpl-${Date.now()}`;
    if (!stream) {
        // A truncated or malformed body is a transport fault: `run` retries it.
        const openai = kiroToOpenai(Buffer.from(await upstream.arrayBuffer()), { model, id });
        if (openai.error)
            throw kiroHopFailure(400, openai.error, openai.error.message);
        sendJson(response, 200, openai);
        return;
    }
    const parser = new KiroEventStreamParser();
    let accText = '';
    let accThinking = '';
    const toolIndexes = new Map();
    let usage;
    let contextPercentage;
    const reader = upstream.body?.getReader();
    if (!reader)
        throw new Error('kiro upstream returned no event stream');
    try {
        while (true) {
            const { done, value } = await reader.read();
            // A read that settles after a timer fired must not reach the client.
            signal.throwIfAborted();
            if (!done)
                attempt.touch();
            const events = parser.feed(value ?? Buffer.alloc(0));
            for (const event of events) {
                const type = event.type;
                const data = unwrapKiroEventPayload(event.payload, type);
                if (type === 'exception' || type === 'invalidStateEvent' || event.messageType === 'exception') {
                    // After output `run` rethrows it and answerFailure destroys the response.
                    throw kiroHopFailure(502, data, data.message || data.reason || 'kiro upstream exception');
                }
                const thought = thinkingTextFromPayload(type, data);
                if (thought) {
                    const merged = mergeKiroText(accThinking, thought);
                    accThinking = merged.text;
                    if (merged.delta) {
                        await writeKiroSse(response, kiroToOpenaiChunk({ reasoning_content: merged.delta }, { model, id }), signal);
                    }
                    continue;
                }
                if ((type === 'assistantResponseEvent' || typeof data.content === 'string') && typeof data.content === 'string' && data.content) {
                    const merged = mergeKiroText(accText, data.content);
                    accText = merged.text;
                    if (merged.delta) {
                        await writeKiroSse(response, kiroToOpenaiChunk({ content: merged.delta }, { model, id }), signal);
                    }
                }
                else if (type === 'toolUseEvent') {
                    const toolUseId = data.toolUseId ?? data.tool_use_id;
                    if (!toolUseId || data.stop)
                        continue;
                    if (!toolIndexes.has(toolUseId))
                        toolIndexes.set(toolUseId, toolIndexes.size);
                    const delta = { tool_calls: [{
                                index: toolIndexes.get(toolUseId),
                                id: toolUseId,
                                type: 'function',
                                function: {
                                    ...(data.name ? { name: data.name } : {}),
                                    arguments: typeof data.input === 'string' ? data.input : (data.input != null ? JSON.stringify(data.input) : ''),
                                },
                            }] };
                    await writeKiroSse(response, kiroToOpenaiChunk(delta, { model, id }), signal);
                }
                const tokens = data.tokenUsage ?? data.token_usage;
                if (tokens)
                    usage = mapKiroUsage(tokens);
                const percent = data.contextUsagePercentage ?? data.context_usage_percentage;
                if (typeof percent === 'number' && Number.isFinite(percent))
                    contextPercentage = percent;
            }
            if (done) {
                parser.finish();
                break;
            }
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
    await writeKiroSse(response, kiroToOpenaiChunk({}, {
        model,
        id,
        done: true,
        finishReason: toolIndexes.size ? 'tool_calls' : 'stop',
        usage: resolveKiroUsage({ usage, contextPercentage, text: accText }, model),
    }), signal);
    response.write('data: [DONE]\n\n');
    if (!response.writableEnded && !response.destroyed)
        response.end();
}
