/**
 * Loopback LLM proxy: authenticates DSH calls, dispatches family transports,
 * and gates/retries passthrough streams before output. Settings operations
 * stay on the host-owned RPC channel; vendor translation lives in each family.
 */
export declare const MAX_REQUEST_BODY_BYTES: number;
/** Upstream attempts before the client is told the stream failed. */
export declare const STREAM_ATTEMPTS = 3;
/**
 * Abort a read that goes this long without a byte from upstream. llm-pi-ai's
 * own stream watchdog is 300_000ms; firing first turns a silent stall into a
 * bounded, retryable proxy fault instead of a client-side timeout.
 */
export declare const UPSTREAM_IDLE_TIMEOUT_MS = 120000;
export { describeError } from '../utils/http.js';
export declare function createProxy({ port, apiKey, tokens, fetchFn, maxRequestBodyBytes, upstreamIdleTimeoutMs, onAntigravityValidation, cursorRpc }: {
    port: any;
    apiKey: any;
    tokens: any;
    fetchFn?: typeof fetch;
    maxRequestBodyBytes?: number;
    upstreamIdleTimeoutMs?: number;
    onAntigravityValidation: any;
    cursorRpc: any;
}): {
    origin: () => string;
    listen(): Promise<any>;
    close(): Promise<void>;
};
/**
 * True once the buffered SSE text carries an event beyond the preamble. Any
 * terminal or error event counts, so a genuine `response.failed` commits and
 * reaches the client instead of being retried.
 */
export declare function hasPreambleEvent(text: any): boolean;
export declare function hasOutputEvent(text: any): boolean;
