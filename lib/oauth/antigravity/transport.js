/** Cloud Code HTTP lifecycle and OpenAI streaming translation. */
import { RequestError, sendJson } from '../../utils/http.js';
import { UpstreamFailure, upstreamRequest } from '../upstream.js';
import { forcedRefresh } from '../tokens.js';
import { ANTIGRAVITY_GENERATE_URL, ANTIGRAVITY_STREAM_URL, applyAntigravityValidation, antigravityChatHeaders, antigravityValidationClientError, fetchAntigravityCloudCode, parseAntigravityValidation, } from './index.js';
import { antigravityToOpenai, createAntigravityOpenaiStream, openaiToAntigravity, parseAntigravitySseBlocks } from './request.js';
async function rememberAntigravityValidation(session, info, tokens, onValidation) {
    if (!info?.required)
        return;
    const next = applyAntigravityValidation(session, info);
    if (tokens && typeof tokens.remember === 'function') {
        await tokens.remember(session, {
            needsValidation: true,
            ...(next.validationUrl ? { validationUrl: next.validationUrl } : {}),
        });
    }
    onValidation?.(next);
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
const finishReasonOf = (event) => (event?.response ?? event)?.candidates?.[0]?.finishReason;
/**
 * Runs inside `upstreamRequest`: the head waits for the first mapped chunk, so
 * a stall, a transport fault, or a Google error before output is still a JSON
 * error with a real status; after output it destroys the response.
 */
export async function forwardAntigravity(response, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, startedAt, upstreamTimeouts, onValidation }) {
    const projectId = session.projectId;
    if (typeof projectId !== 'string' || !projectId.trim()) {
        throw new RequestError(403, 'antigravity session is missing project_id');
    }
    const built = openaiToAntigravity(payload, { projectId, sessionId: cacheSessionId });
    const sessionId = built.request.sessionId;
    const body = Buffer.from(JSON.stringify(built));
    const url = stream ? ANTIGRAVITY_STREAM_URL : ANTIGRAVITY_GENERATE_URL;
    const model = typeof payload.model === 'string' ? payload.model : 'antigravity';
    await upstreamRequest({ family: 'antigravity', signal, startedAt, stream, response, timeouts: upstreamTimeouts }).run(async (attempt) => {
        const headers = {
            ...antigravityChatHeaders(session),
            ...(stream ? { accept: 'text/event-stream' } : {}),
        };
        const upstream = await fetchAntigravityCloudCode(url, { method: 'POST', headers, body, signal: attempt.signal }, fetchFn);
        attempt.signal.throwIfAborted();
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
                throw new UpstreamFailure(400, 'antigravity account needs validation', { code: 'http', payload: antigravityValidationClientError(validation) });
            }
            throw new UpstreamFailure(upstream.status, `antigravity upstream ${upstream.status}`, {
                code: 'http',
                payload: parsed ?? { error: { message: `antigravity upstream ${upstream.status}` } },
            });
        }
        if (!stream) {
            const text = await upstream.text();
            let parsed;
            try {
                parsed = text ? JSON.parse(text) : {};
            }
            catch {
                throw new UpstreamFailure(502, 'antigravity upstream returned invalid JSON', { code: 'http' });
            }
            sendJson(response, 200, antigravityToOpenai(parsed, { model, sessionId }));
            return;
        }
        const streamMapper = createAntigravityOpenaiStream({ model, id: `chatcmpl-${Date.now()}`, sessionId });
        const write = async (chunk) => {
            if (!response.headersSent) {
                response.writeHead(200, {
                    'content-type': 'text/event-stream; charset=utf-8',
                    'cache-control': 'no-store',
                    'x-content-type-options': 'nosniff',
                });
            }
            if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`))
                await waitForDrain(response, attempt.signal);
        };
        let finished = false;
        let rest = '';
        const decoder = new TextDecoder();
        const reader = upstream.body?.getReader();
        try {
            while (reader) {
                const { done, value } = await reader.read();
                // A read that settles after a timer fired must not reach the client.
                attempt.signal.throwIfAborted();
                if (!done)
                    attempt.touch();
                rest += decoder.decode(value, { stream: !done });
                const parsed = parseAntigravitySseBlocks(done ? `${rest}\n\n` : rest);
                rest = parsed.rest;
                for (const event of parsed.events) {
                    if (finishReasonOf(event))
                        finished = true;
                    const chunk = streamMapper.push(event);
                    if (chunk)
                        await write(chunk);
                }
                if (done)
                    break;
            }
        }
        finally {
            // Never leave the upstream connection pinned when the client goes away.
            await reader?.cancel().catch(() => { });
            reader?.releaseLock();
        }
        // Cloud Code always closes with a finishReason frame; an EOF without one
        // is a cut stream — retried before output, destroyed after.
        if (!finished)
            throw new UpstreamFailure(502, 'antigravity stream ended without a finishReason', { code: 'transport' });
        await write(streamMapper.finish());
        response.write('data: [DONE]\n\n');
        if (!response.writableEnded && !response.destroyed)
            response.end();
    }, {
        // One forced refresh on a pre-output 401 (F4e); a failed refresh forwards
        // the upstream's own 401.
        refresh: async () => {
            const next = await forcedRefresh(tokens, session);
            if (next)
                session = next;
            return Boolean(next);
        },
    });
}
