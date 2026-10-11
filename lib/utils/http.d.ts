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
/**
 * True when the failure was raised before any HTTP answer: a stale keep-alive
 * socket, a refused tunnel, an outbound proxy that is restarting. The retry
 * backoff exists to pace load against a busy upstream, and this failure never
 * reached one, so a retry may go out at once (live `upstream.log`:
 * `fetch failed: ECONNRESET` / `UND_ERR_SOCKET` / `0` via 127.0.0.1:1082 on a
 * reused socket, where the 1s + 4s schedule is pure stall).
 *
 * `cause` is walked because undici nests the socket fault under the wrapper,
 * and `outbound.ts` keeps the fetch error as the cause of its proxy wrapper.
 */
export declare function isPreDeliveryFailure(error: unknown): boolean;
