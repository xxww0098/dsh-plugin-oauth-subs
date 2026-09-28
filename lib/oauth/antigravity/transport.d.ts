/** Cloud Code HTTP lifecycle and OpenAI streaming translation. */
/**
 * Runs inside `upstreamRequest`: the head waits for the first mapped chunk, so
 * a stall, a transport fault, or a Google error before output is still a JSON
 * error with a real status; after output it destroys the response.
 */
export declare function forwardAntigravity(response: any, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, startedAt, upstreamTimeouts, onValidation }: {
    payload: any;
    cacheSessionId: any;
    stream: any;
    session: any;
    tokens: any;
    fetchFn: any;
    signal: any;
    startedAt: any;
    upstreamTimeouts: any;
    onValidation: any;
}): Promise<void>;
