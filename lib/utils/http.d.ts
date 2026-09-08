/** Provider-independent HTTP responses and transport error descriptions. */
import type { ServerResponse } from 'node:http';
export declare class RequestError extends Error {
    status: number;
    constructor(status: number, message: string);
}
export declare function sendJson(response: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, unknown>): void;
/** undici reports socket faults as a bare "fetch failed"; the cause carries the reason. */
export declare function describeError(error: unknown): string;
