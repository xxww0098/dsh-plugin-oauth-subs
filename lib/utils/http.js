/** Provider-independent HTTP responses and transport error descriptions. */
export class RequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
export function sendJson(response, status, body, extraHeaders = {}) {
    let text;
    if (typeof body === 'string') {
        text = body;
    }
    else {
        try {
            // JSON.stringify returns undefined for undefined/functions/symbols, and
            // throws on circular input: neither may crash before writeHead.
            text = JSON.stringify(body) ?? 'null';
        }
        catch {
            text = 'null';
        }
    }
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(text),
        'x-content-type-options': 'nosniff',
    };
    for (const [key, value] of Object.entries(extraHeaders ?? {})) {
        if (value != null && String(value) !== '')
            headers[key] = String(value);
    }
    response.writeHead(status, headers);
    response.end(text);
}
/** undici reports socket faults as a bare "fetch failed"; the cause carries the reason. */
export function describeError(error) {
    const message = error && typeof error === 'object' && 'message' in error ? error.message : error;
    const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined;
    const detail = cause && typeof cause === 'object'
        ? (('code' in cause ? cause.code : undefined) ?? ('message' in cause ? cause.message : undefined))
        : undefined;
    if (detail === undefined)
        return String(message);
    const text = String(message);
    // A wrapper may already carry the detail in its message and keep the cause
    // on the chain (outbound.ts does): never print the same reason twice.
    return text.includes(String(detail)) ? text : text + ': ' + String(detail);
}
/** Node `code` (fs/system errors) from a thrown value, or undefined. */
export function errorCode(error) {
    if (!error || typeof error !== 'object' || !('code' in error))
        return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
}
/** Raw `message` from a thrown object, or undefined — never stringifies. */
export function errorMessage(error) {
    if (!error || typeof error !== 'object' || !('message' in error))
        return undefined;
    return typeof error.message === 'string' ? error.message : undefined;
}
/**
 * Connection faults, as Node/undici name them. Every one of these means the
 * attempt produced no HTTP answer at all: the next one is a fresh dial rather
 * than a re-ask of an upstream that has already seen load.
 */
const PRE_DELIVERY_CODES = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN',
    'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL',
    'UND_ERR_SOCKET', 'UND_ERR_CLOSED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
    'ERR_SOCKET_CONNECTION_TIMEOUT',
]);
/** undici throws this bare wrapper only when no response arrived at all. */
function isFetchFailed(error) {
    return error instanceof TypeError && /^fetch failed/.test(errorMessage(error) ?? '');
}
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
export function isPreDeliveryFailure(error) {
    for (let link = error, depth = 0; link && typeof link === 'object' && depth < 6; depth += 1) {
        const code = errorCode(link);
        if (code !== undefined && PRE_DELIVERY_CODES.has(code))
            return true;
        if (isFetchFailed(link))
            return true;
        link = link.cause;
    }
    return false;
}
