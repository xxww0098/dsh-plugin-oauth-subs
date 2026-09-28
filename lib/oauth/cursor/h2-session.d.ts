/**
 * In-process Node http2 client for Cursor Connect RPCs.
 * RPCs share the pooled session from `cursorH2Connect`; each owns only its
 * stream and cancels it (RST_STREAM CANCEL) when the call settles, so a
 * cancelled Run stops upstream work without touching its neighbours.
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
export declare function runCursorAgent(session: any, built: any, { signal, connectFn, url, onEvent, touch, toolBatchGraceMs, }?: any): Promise<unknown>;
export { CURSOR_AGENT_URL, CURSOR_RUN_PATH, splitConnectFrames };
