/**
 * Loopback LLM proxy: authenticates DSH calls and dispatches each route to its
 * family transport or to the passthrough hop (passthrough.ts; body read and
 * cache rewrite in proxy-body.ts; timing, retries and failure answers in
 * upstream.ts). Settings operations stay on the host-owned RPC channel;
 * vendor translation lives in each family.
 */
export { describeError } from '../utils/http.js';
export { MAX_REQUEST_BODY_BYTES } from './proxy-body.js';
export declare function createProxy({ port, apiKey, tokens, fetchFn, maxRequestBodyBytes, upstreamTimeouts, onAntigravityValidation, cursorRpc, devinChat, onQuotaUsed, onQuotaLearned }: any): {
    origin: () => string;
    listen(): Promise<any>;
    /**
     * Stops accepting, lets in-flight requests finish, and resolves once the last
     * connection is gone — the caller closes what the handlers use (the outbound
     * agent) only after that.
     */
    close(): Promise<void>;
};
/** Family whose quota a POST chat request spends; undefined for anything else. */
export declare function quotaFamilyOf(request: any): string | undefined;
