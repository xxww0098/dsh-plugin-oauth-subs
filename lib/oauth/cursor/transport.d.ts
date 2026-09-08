/** Cursor AgentService lifecycle and OpenAI streaming translation. */
import { runCursorAgent } from './h2-session.js';
export declare function forwardCursor(response: any, { payload, cacheSessionId, stream, session, signal, runFn }: {
    payload: any;
    cacheSessionId: any;
    stream: any;
    session: any;
    signal: any;
    runFn?: typeof runCursorAgent;
}): Promise<void>;
