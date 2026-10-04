/**
 * Inbound request body: size-capped read and the per-family rewrite that
 * strips or applies cache fields before a hop. The rewrite itself lives in
 * each family's own cache.ts; this only dispatches, by looking the family's
 * `applyCache` row up in `families.ts`.
 */
import { oauthFamily } from './families.js';
import { RequestError } from '../utils/http.js';
export const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
export function readBody(request, limit = MAX_REQUEST_BODY_BYTES) {
    if (request.aborted || request.destroyed) {
        return Promise.reject(new RequestError(400, 'request body was aborted'));
    }
    const declared = Number(request.headers['content-length']);
    if (Number.isSafeInteger(declared) && declared > limit) {
        request.resume();
        return Promise.reject(new RequestError(413, 'request body is too large'));
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        const onData = (chunk) => {
            size += chunk.length;
            if (size <= limit) {
                chunks.push(chunk);
                return;
            }
            cleanup();
            request.resume();
            reject(new RequestError(413, 'request body is too large'));
        };
        const onEnd = () => {
            cleanup();
            resolve(Buffer.concat(chunks, size));
        };
        const onError = () => {
            cleanup();
            reject(new RequestError(400, 'request body could not be read'));
        };
        const onAborted = () => {
            cleanup();
            reject(new RequestError(400, 'request body was aborted'));
        };
        const cleanup = () => {
            request.removeListener('data', onData);
            request.removeListener('end', onEnd);
            request.removeListener('error', onError);
            request.removeListener('aborted', onAborted);
        };
        request.on('data', onData);
        request.once('end', onEnd);
        request.once('error', onError);
        request.once('aborted', onAborted);
    });
}
/**
 * Per-family count of inbound bodies with / without DSH's `prompt_cache_key`,
 * taken before any family strips it. Served on `/health` as the one signal
 * that the host actually sends session ids to the loopback. Counts only.
 */
export const inboundCacheKeys = {};
export function rewriteUpstreamBody(buffer, family, wire) {
    if (!buffer.length)
        throw new RequestError(400, 'request body must contain JSON');
    let payload;
    try {
        payload = JSON.parse(buffer.toString('utf8'));
    }
    catch {
        throw new RequestError(400, 'request body must contain valid JSON');
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new RequestError(400, 'request body must contain a JSON object');
    }
    const seen = inboundCacheKeys[family] ??= { with: 0, without: 0 };
    if (typeof payload.prompt_cache_key === 'string' && payload.prompt_cache_key.trim())
        seen.with += 1;
    else
        seen.without += 1;
    const descriptor = oauthFamily(family);
    if (!descriptor)
        throw new RequestError(400, `unknown oauth family: ${family}`);
    const { payload: next, cacheSessionId, ...extras } = descriptor.applyCache(payload, { wire });
    return { ...extras, payload: next, cacheSessionId, stream: next.stream === true };
}
