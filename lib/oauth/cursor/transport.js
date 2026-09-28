/** Cursor AgentService lifecycle and OpenAI streaming translation. */
import { sendJson } from '../../utils/http.js';
import { upstreamRequest, writeSse } from '../upstream.js';
import { forcedRefresh } from '../tokens.js';
import { cursorToOpenai, createCursorOpenaiStream, openaiToCursor } from './request.js';
import { runCursorAgent } from './h2-session.js';
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
    // A pre-output 401 (Connect `unauthenticated`) refreshes the login once.
    const refresh = forcedRefresh(tokens, () => session, (next) => { session = next; });
    if (!stream) {
        await upstream.run(async (attempt) => {
            const { collected } = await runFn(session, built, { signal: attempt.signal, touch: attempt.touch });
            sendJson(response, 200, cursorToOpenai(collected, { model, id, conversationId: built.conversationId }));
        }, { refresh });
        return;
    }
    await upstream.run(async (attempt) => {
        const mapper = createCursorOpenaiStream({ model, id, conversationId: built.conversationId });
        await runFn(session, built, {
            signal: attempt.signal,
            touch: attempt.touch,
            onEvent: async (event) => {
                for (const chunk of mapper.push(event))
                    await writeSse(response, chunk, attempt.signal);
            },
        });
        await writeSse(response, mapper.finish(), attempt.signal);
        await writeSse(response, '[DONE]', attempt.signal);
        if (!response.writableEnded && !response.destroyed)
            response.end();
    }, { refresh });
}
