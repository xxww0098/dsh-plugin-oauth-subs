/** Cursor AgentService lifecycle and OpenAI streaming translation. */
import { sendJson } from '../../utils/http.js';
import { upstreamRequest } from '../upstream.js';
import { forcedRefresh } from '../tokens.js';
import { cursorToOpenai, createCursorOpenaiStream, openaiToCursor } from './request.js';
import { runCursorAgent } from './h2-session.js';
/**
 * A destroyed response emits 'close', never 'drain', so awaiting 'drain' alone
 * hangs forever when the client goes away. Race drain against close/error/abort
 * so a disconnected client fails fast instead of pinning the upstream run.
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
/**
 * Each Run executes inside `upstreamRequest(...).run`: the first-byte window
 * covers the h2 dial plus the first DATA frame, every frame touches the idle
 * clock, and the head waits for the first mapped chunk so a pre-output Connect
 * error still answers with its own status. After the head a failure destroys
 * the response (answerFailure) — never an SSE error block and a clean end.
 */
export async function forwardCursor(response, { payload, cacheSessionId, stream, session, tokens, startedAt, upstreamTimeouts, signal, runFn = runCursorAgent }) {
    const built = openaiToCursor(payload, { conversationId: cacheSessionId });
    const model = built.pickerModel || built.modelId;
    const id = `chatcmpl-${Date.now()}`;
    const upstream = upstreamRequest({ family: 'cursor', signal, startedAt, stream: stream === true, response, timeouts: upstreamTimeouts });
    // One forced refresh on a pre-output 401 (Connect `unauthenticated`), F4e.
    const refresh = async () => {
        const next = await forcedRefresh(tokens, session);
        if (next)
            session = next;
        return Boolean(next);
    };
    if (!stream) {
        await upstream.run(async (attempt) => {
            const { collected } = await runFn(session, built, { signal: attempt.signal, touch: attempt.touch });
            sendJson(response, 200, cursorToOpenai(collected, { model, id, conversationId: built.conversationId }));
        }, { refresh });
        return;
    }
    await upstream.run(async (attempt) => {
        const mapper = createCursorOpenaiStream({ model, id, conversationId: built.conversationId });
        const write = async (chunk) => {
            if (response.destroyed)
                throw new Error('client disconnected before write');
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
        await runFn(session, built, {
            signal: attempt.signal,
            touch: attempt.touch,
            onEvent: async (event) => {
                for (const chunk of mapper.push(event))
                    await write(chunk);
            },
        });
        await write(mapper.finish());
        response.write('data: [DONE]\n\n');
        if (!response.writableEnded && !response.destroyed)
            response.end();
    }, { refresh });
}
