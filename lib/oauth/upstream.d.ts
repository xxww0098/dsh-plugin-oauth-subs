/**
 * Upstream attempt primitive: the one owner of per-attempt timers, the
 * pre-output budget, retries and the failure → HTTP mapping for every hop.
 * The proxy has to give up before the host's 300s stream watchdog, with a
 * status the host classifies correctly (SERVER/TIMEOUT/TRANSPORT retry;
 * QUOTA_EXCEEDED/AUTH do not).
 */
import type { ServerResponse } from 'node:http';
import { RequestError } from '../utils/http.js';
/**
 * Per attempt the first byte (response head included) must arrive within
 * `firstByteMs`; everything before output — `tokens.session()` included —
 * shares `budgetMs`; once output flows, `idleMs` of silence destroys it.
 */
export declare const UPSTREAM_TIMEOUTS: {
    firstByteMs: number;
    budgetMs: number;
    idleMs: number;
};
/** Upstream attempts before the client is told the request failed. */
export declare const UPSTREAM_ATTEMPTS = 3;
export declare const RETRY_BACKOFF_MS: number[];
/**
 * Delay before the next retry: the backoff schedule with shrink-only jitter
 * (never longer than the base, so tests and callers can bound the wait).
 */
export declare function retryDelayMs(failedAttempt: any, random?: () => number): number;
/**
 * `transport` (socket fault, preamble-only EOF) and `timeout` are retried
 * before output; `http` is the upstream's own answer and `quota` a family's
 * known usage-cap answer — both forwarded once, never replayed (decision 5).
 */
export type UpstreamFailureCode = 'transport' | 'timeout' | 'http' | 'quota';
export declare class UpstreamFailure extends RequestError {
    code: UpstreamFailureCode;
    retryAfter?: string;
    retryAfterMs?: string;
    payload?: unknown;
    constructor(status: number, message: string, { code, retryAfter, retryAfterMs, payload }: {
        code: UpstreamFailureCode;
        retryAfter?: string;
        retryAfterMs?: string;
        payload?: unknown;
    });
}
export interface Attempt {
    /** Retry number: 0 for the first try; a 401 refresh retry keeps it. */
    index: number;
    /** Aborts on client disconnect, first-byte timeout, budget or idle timeout. */
    signal: AbortSignal;
    /** Call once per upstream chunk: the first call ends the first-byte window and starts the idle clock. */
    touch(): void;
    /** True once the client response head is out — nothing can be retried after that. */
    committed(): boolean;
}
/**
 * `startedAt` is when the route handler received the request, so the wait for
 * `tokens.session()` counts against the budget. `response` is only read for
 * `headersSent` (the commit point). Non-streaming bodies arrive in one piece,
 * so their first-byte window is the remaining budget.
 */
export declare function upstreamRequest({ family, signal, startedAt, stream, response, timeouts }: {
    family: string;
    signal?: AbortSignal;
    startedAt?: number;
    stream: boolean;
    response?: Pick<ServerResponse, 'headersSent'>;
    timeouts?: Partial<typeof UPSTREAM_TIMEOUTS>;
}): {
    /**
     * Run `fn` until it settles, retrying transport faults and timeouts before
     * output while `elapsed + backoff + firstByteMs` still fits the budget.
     * `refresh` runs once on an upstream 401; `true` retries immediately.
     */
    run<T>(fn: (attempt: Attempt) => Promise<T>, { refresh }?: {
        refresh?: () => Promise<boolean>;
    }): Promise<T>;
};
/** Connect-RPC error code → the HTTP status the host classifies correctly. */
export declare function connectCodeStatus(code: string): number;
/**
 * Before the head: a JSON error with the upstream's own payload and retry
 * headers when it has them. After the head: destroy, so the client sees a
 * broken stream — a clean EOF reads as a finished response.
 */
export declare function answerFailure(response: ServerResponse, error: any): void;
