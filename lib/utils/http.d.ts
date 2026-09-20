/** Provider-independent HTTP responses and transport error descriptions. */
import type { ServerResponse } from 'node:http';
export declare class RequestError extends Error {
    status: number;
    constructor(status: number, message: string);
}
export declare function sendJson(response: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, unknown>): void;
/** undici reports socket faults as a bare "fetch failed"; the cause carries the reason. */
export declare function describeError(error: unknown): string;
/** Node `code` (fs/system errors) from a thrown value, or undefined. */
export declare function errorCode(error: unknown): string | undefined;
/** Raw `message` from a thrown object, or undefined — never stringifies. */
export declare function errorMessage(error: unknown): string | undefined;
