/**
 * In-process Node http2 client for Cursor Connect RPCs.
 * Each RPC owns a session that is destroyed when the call settles.
 * Do not add Bun.
 */
import { CURSOR_AGENT_URL, CURSOR_RUN_PATH } from './index.js';
import { cursorH2Connect } from './upstream-proxy.js';
import { splitConnectFrames } from './proto.js';
export declare function describeH2TransportError(error: any, baseUrl: any): string;
export declare function cursorUnaryRpc({ session, url, path, body, connectFn, signal, timeoutMs, }: {
    session: any;
    url?: string | undefined;
    path: any;
    body?: Buffer<ArrayBuffer> | undefined;
    connectFn?: typeof cursorH2Connect | undefined;
    signal: any;
    timeoutMs?: number | undefined;
}): Promise<unknown>;
export declare function fetchCursorUsableModels(session: any, { connectFn, signal, timeoutMs }?: any): Promise<any[]>;
export declare function fetchCursorAvailableModels(session: any, { connectFn, signal, timeoutMs }?: any): Promise<any>;
/**
 * Drive AgentService/Run. Answers the run handshake (request context), the
 * blob KV get/set, and per-case exec messages so a model turn can complete.
 * Native Cursor tools are rejected with typed results so the model falls back
 * to the MCP tools; MCP calls are handed to DSH, which owns execution.
 */
export declare function runCursorAgent(session: any, built: any, { signal, connectFn, url, onEvent, }?: any): Promise<unknown>;
export { CURSOR_AGENT_URL, CURSOR_RUN_PATH, splitConnectFrames };
