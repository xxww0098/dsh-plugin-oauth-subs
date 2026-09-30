/**
 * Passthrough hop for families that speak the host wire as-is: one POST per
 * attempt, the pre-output commit gate that keeps a silent failed stream
 * retryable, usage rewriting on completions SSE, and the forwarded-header
 * filter. Timing and retries belong to upstream.ts.
 */
export declare function forward(request: any, response: any, { url, fallbackUrl, session, tokens, headersOf, fetchFn, family, wire, maxRequestBodyBytes, upstreamTimeouts, startedAt, signal, classifyFailure, encodeBody }: any): Promise<void>;
