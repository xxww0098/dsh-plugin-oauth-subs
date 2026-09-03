/**
 * In-process Node http2 client for Cursor Connect RPCs.
 * Persistent session is OK; unary GetUsableModels uses a one-shot stream.
 * Do not add Bun.
 */
import http2 from 'node:http2';
import { CURSOR_AGENT_URL, CURSOR_RUN_PATH } from './index.js';
import { splitConnectFrames } from './proto.js';
export declare function describeH2TransportError(error: any, baseUrl: any): string;
export declare function cursorUnaryRpc({ session, url, path, body, connectFn, signal, timeoutMs, }: {
    session: any;
    url?: string;
    path: any;
    body?: Buffer<ArrayBuffer>;
    connectFn?: typeof http2.connect;
    signal: any;
    timeoutMs?: number;
}): Promise<unknown>;
export declare function fetchCursorUsableModels(session: any, { connectFn, signal, timeoutMs }?: {}): Promise<any[]>;
export declare function fetchCursorAvailableModels(session: any, { connectFn, signal, timeoutMs }?: {}): Promise<any>;
/**
 * Drive AgentService/Run. Answers KV get/set from the local blob store.
 * Native Cursor tools are thrown so DSH Completions can own MCP tools.
 */
export declare function runCursorAgent(session: any, built: any, { signal, connectFn, url, onEvent, }?: {
    connectFn?: typeof http2.connect;
    url?: string;
}): Promise<unknown>;
export { CURSOR_AGENT_URL, CURSOR_RUN_PATH, splitConnectFrames };
