/**
 * Loopback LLM proxy: authenticates DSH calls, dispatches family transports,
 * and gates passthrough streams before output (timing, retries and failure
 * answers live in upstream.ts). Settings operations
 * stay on the host-owned RPC channel; vendor translation lives in each family.
 */
export declare const MAX_REQUEST_BODY_BYTES: number;
export { describeError } from '../utils/http.js';
export declare function createProxy({ port, apiKey, tokens, fetchFn, maxRequestBodyBytes, upstreamTimeouts, onAntigravityValidation, cursorRpc, devinChat }: any): {
    origin: () => string;
    listen(): Promise<any>;
    close(): Promise<void>;
};
