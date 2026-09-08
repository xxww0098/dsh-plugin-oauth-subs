/** Cursor AgentService lifecycle and OpenAI streaming translation. */
import { once } from 'node:events';
import { RequestError, describeError, sendJson } from '../../utils/http.js';
import { cursorConversationId } from './cache.js';
import { cursorToOpenai, createCursorOpenaiStream, openaiToCursor } from './request.js';
import { runCursorAgent } from './h2-session.js';
export async function forwardCursor(response, { payload, cacheSessionId, stream, session, signal, runFn = runCursorAgent }) {
    const conversationId = cacheSessionId ?? cursorConversationId(payload);
    const built = openaiToCursor(payload, { conversationId });
    const model = built.pickerModel || built.modelId;
    const id = `chatcmpl-${Date.now()}`;
    if (!stream) {
        const { collected } = await runFn(session, built, { signal });
        if (collected.error)
            throw new RequestError(502, collected.error);
        sendJson(response, 200, cursorToOpenai(collected, { model, id, conversationId: built.conversationId }));
        return;
    }
    const mapper = createCursorOpenaiStream({ model, id, conversationId: built.conversationId });
    let headSent = false;
    const head = () => {
        if (headSent)
            return;
        headSent = true;
        response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
        });
    };
    const write = async (chunk) => {
        if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`))
            await once(response, 'drain', { signal });
    };
    const fail = async (message) => {
        if (!headSent) {
            sendJson(response, 502, { error: { message } });
            return;
        }
        // Once output commits the status, a structured SSE error is the only way
        // to distinguish a failed run from a successfully completed answer.
        console.error(`[oauth-subs] cursor upstream error mid-stream: ${message}`);
        await write({ error: { message, type: 'server_error', code: 'cursor_upstream' } });
        if (!response.writableEnded && !response.destroyed)
            response.end();
    };
    let collected;
    try {
        collected = (await runFn(session, built, {
            signal,
            onEvent: async (event) => {
                const chunks = mapper.push(event);
                if (chunks.length)
                    head();
                for (const chunk of chunks)
                    await write(chunk);
            },
        })).collected;
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        await fail(describeError(error));
        return;
    }
    if (collected.error) {
        await fail(collected.error);
        return;
    }
    head();
    await write(mapper.finish());
    response.write('data: [DONE]\n\n');
    if (!response.writableEnded && !response.destroyed)
        response.end();
}
