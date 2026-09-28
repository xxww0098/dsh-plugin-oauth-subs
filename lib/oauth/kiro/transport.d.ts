/** AWS EventStream HTTP lifecycle and OpenAI streaming translation. */
/**
 * One Kiro hop inside the attempt primitive: timers, transport retries and a
 * single refresh on 401/403. Nothing reaches the client before the first
 * mapped output chunk; a failure after it destroys the response.
 */
export declare function forwardKiro(response: any, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, startedAt, timeouts }: {
    payload: any;
    cacheSessionId: any;
    stream: any;
    session: any;
    tokens: any;
    fetchFn: any;
    signal: any;
    startedAt: any;
    timeouts: any;
}): Promise<void>;
