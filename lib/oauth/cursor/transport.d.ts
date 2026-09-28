/** Cursor AgentService lifecycle and OpenAI streaming translation. */
/**
 * Each Run executes inside `upstreamRequest(...).run`: the first-byte window
 * covers the h2 dial plus the first DATA frame, every frame touches the idle
 * clock, and the head waits for the first mapped chunk so a pre-output Connect
 * error still answers with its own status. After the head a failure destroys
 * the response (answerFailure) — never an SSE error block and a clean end.
 */
export declare function forwardCursor(response: any, { payload, cacheSessionId, stream, session, tokens, startedAt, upstreamTimeouts, signal, runFn }: any): Promise<void>;
