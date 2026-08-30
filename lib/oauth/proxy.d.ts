/**
 * Local OpenAI Responses proxy. DSH talks to 127.0.0.1:<port> via llm-pi-ai;
 * this process attaches a fresh OAuth bearer and forwards to ChatGPT Codex
 * or xAI Grok. Settings operations stay on the host-owned RPC channel.
 */
export { codexCacheSessionId } from '../utils/cache-session.js';
export declare const MAX_REQUEST_BODY_BYTES: number;
/** Upstream attempts before the client is told the stream failed. */
export declare const STREAM_ATTEMPTS = 3;
/** undici reports socket faults as a bare "fetch failed"; the cause carries the reason. */
export declare function describeError(error: any): string;
export declare function createProxy({ port, apiKey, tokens, fetchFn, maxRequestBodyBytes }: {
    port: any;
    apiKey: any;
    tokens: any;
    fetchFn?: typeof fetch;
    maxRequestBodyBytes?: number;
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
