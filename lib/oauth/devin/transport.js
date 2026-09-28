/**
 * Devin chat transport: Connect-RPC v1 over HTTP/1.1 to
 * `server.codeium.com/exa.api_server_pb.ApiServerService/GetChatMessage`.
 *
 *   request : one frame, flag 0x01, gzipped GetChatMessageRequest
 *   response: data frames (flag 0x01 = gzipped proto) + a 0x02 end frame
 *             carrying JSON trailers ({ error: { code, message } })
 *
 * Auth rides inside `Metadata.api_key` (the devin-session-token$… string), so
 * no Authorization header is sent. `GetUserJwt` (unary application/proto)
 * optionally mints a short-lived `user_jwt` + custom api server; failures are
 * non-fatal — chat works with the session token alone (verified live).
 */
import { once } from 'node:events';
import { RequestError, sendJson } from '../../utils/http.js';
import { UpstreamFailure, connectCodeStatus, upstreamRequest } from '../upstream.js';
import { DEVIN_TIER_NAMES, devinApiServer, pickDevinHumanAccount, DEVIN_CHAT_PATH, DEVIN_USER_JWT_PATH, DEVIN_USER_STATUS_PATH, } from './index.js';
import { deterministicDevinId } from './cache.js';
import { createDevinOpenaiStream, devinBasicAuth, devinMetadataBytes, devinToOpenai, openaiToDevin, } from './request.js';
import { connectTrailerError, decodeGetUserJwtResponse, decodeGetChatMessageResponse, decodeGetUserStatusResponse, decodeUnaryBody, encodeGetChatMessageRequest, encodeGetUserJwtRequest, encodeGetUserStatusRequest, frameConnect, splitConnectFrames, unframePayload, } from './proto.js';
import { outboundFetch } from '../../utils/outbound.js';
const CHAT_HEADERS = Object.freeze({
    'content-type': 'application/connect+proto',
    'connect-protocol-version': '1',
    'connect-content-encoding': 'gzip',
    'accept-encoding': 'identity',
    'connect-accept-encoding': 'gzip',
    'user-agent': 'connect-go/1.18.1 (go1.26.3)',
});
const UNARY_HEADERS = Object.freeze({
    'content-type': 'application/proto',
    'connect-protocol-version': '1',
    accept: '*/*',
});
const SSE_HEADERS = Object.freeze({
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
});
export class DevinTransportError extends Error {
    constructor(message, { status } = {}) {
        super(message);
        this.name = 'DevinTransportError';
        this.status = status;
    }
}
const userJwtCache = new Map();
const USER_JWT_CACHE_MAX = 16;
const USER_JWT_MARGIN_MS = 90_000;
const USER_JWT_FALLBACK_TTL_MS = 60_000;
function userJwtExpiresAt(jwt) {
    try {
        const decoded = JSON.parse(Buffer.from(String(jwt).split('.')[1] ?? '', 'base64url').toString('utf8'));
        return typeof decoded?.exp === 'number' && Number.isFinite(decoded.exp) ? decoded.exp * 1000 : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Best-effort GetUserJwt: mints metadata.user_jwt and may redirect to a
 * deployment-specific api server (custom_api_server_url). Returns undefined
 * on any failure — the session token alone is accepted (verified live).
 */
export async function devinUserJwt(session, { fetchFn = outboundFetch, signal } = {}) {
    const base = devinApiServer(session);
    const body = encodeGetUserJwtRequest(devinMetadataBytes(session));
    try {
        const response = await fetchFn(`${base}${DEVIN_USER_JWT_PATH}`, {
            method: 'POST',
            headers: { ...UNARY_HEADERS, authorization: devinBasicAuth(session) },
            body,
            signal,
        });
        const payload = Buffer.from(await response.arrayBuffer());
        if (!response.ok)
            return undefined;
        const decoded = decodeGetUserJwtResponse(decodeUnaryBody(payload));
        const baseUrl = decoded.customApiServerUrl?.trim();
        return {
            userJwt: decoded.userJwt || undefined,
            baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : undefined,
        };
    }
    catch {
        return undefined;
    }
}
/**
 * SeatManagementService/GetUserStatus (unary application/proto, raw body) —
 * the quota + identity RPC. Throws on HTTP errors; 401 is permanent.
 */
export async function devinUserStatus(session, { fetchFn = outboundFetch, signal } = {}) {
    const base = devinApiServer(session);
    const body = encodeGetUserStatusRequest(devinMetadataBytes(session));
    const response = await fetchFn(`${base}${DEVIN_USER_STATUS_PATH}`, {
        method: 'POST',
        headers: { ...UNARY_HEADERS, authorization: devinBasicAuth(session) },
        body,
        signal,
    });
    const payload = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
        const error = new DevinTransportError(`Devin GetUserStatus failed (HTTP ${response.status}): ${payload.toString('utf8').slice(0, 300)}`, { status: response.status });
        if (response.status === 401)
            error.permanent = true;
        throw error;
    }
    return decodeGetUserStatusResponse(decodeUnaryBody(payload));
}
/**
 * Minted user_jwts carry a ~15min exp — minting one before every chat call
 * costs a full RTT (~2s measured). Reuse per session token until exp−margin.
 * A stale jwt surfaces as chat 401; runDevinChat then drops it and retries
 * once token-only (a proven-good path).
 */
export async function devinChatAuth(session, { fetchFn = outboundFetch, signal } = {}) {
    const key = typeof session?.accessToken === 'string' ? session.accessToken : '';
    const cached = key ? userJwtCache.get(key) : undefined;
    if (cached && cached.expiresAt - USER_JWT_MARGIN_MS > Date.now())
        return cached;
    const minted = await devinUserJwt(session, { fetchFn, signal });
    if (minted?.userJwt && key) {
        const exp = userJwtExpiresAt(minted.userJwt);
        userJwtCache.set(key, { ...minted, expiresAt: exp ?? Date.now() + USER_JWT_FALLBACK_TTL_MS });
        // Entries are only replaced on re-mint, so a long-lived host would otherwise
        // accumulate one entry per session token forever. A miss just re-mints.
        while (userJwtCache.size > USER_JWT_CACHE_MAX) {
            userJwtCache.delete(userJwtCache.keys().next().value);
        }
    }
    return minted;
}
/**
 * Identity for a stored session: email (or display name) + plan label from
 * GetUserStatus. Opaque ids never become the account name.
 */
export async function resolveDevinIdentity(session, { fetchFn = outboundFetch, statusFn = devinUserStatus } = {}) {
    const status = await statusFn(session, { fetchFn });
    const user = status?.userStatus ?? {};
    const plan = status?.planInfo ?? user.planStatus?.planInfo ?? {};
    const devinInfo = plan.devinInfo ?? {};
    const tier = user.teamsTier ?? plan.teamsTier;
    const planType = plan.planName || (typeof tier === 'number' ? DEVIN_TIER_NAMES[tier] : undefined);
    return {
        account: pickDevinHumanAccount(user.email, user.name, devinInfo.accountDisplayName),
        planType,
        userId: user.userId,
        teamId: user.teamId,
    };
}
/**
 * Run one GetChatMessage turn. `built` is what openaiToDevin returns.
 * `onEvent` receives {type:'text'|'thinking'|'tool'|'usage'|'stop', …} deltas;
 * `touch` is called per upstream chunk (the attempt's first-byte/idle clock);
 * the resolved value is the fully collected turn. The upstream's own answers —
 * an HTTP error or a Connect trailer error — throw `UpstreamFailure` code
 * `http` (forwarded once, never replayed); an empty or message-less stream is
 * a plain transport fault.
 */
export async function runDevinChat(session, built, { signal, onEvent, touch, fetchFn = outboundFetch } = {}) {
    if (!session?.accessToken)
        throw new RequestError(401, 'Devin chat needs a session token');
    const attempt = (auth) => {
        const base = auth?.baseUrl ?? devinApiServer(session);
        const metadata = devinMetadataBytes(session, { userJwt: auth?.userJwt });
        const frame = frameConnect(encodeGetChatMessageRequest({ metadata, ...built.fields }), { compress: true });
        return fetchFn(`${base}${DEVIN_CHAT_PATH}`, {
            method: 'POST',
            headers: { ...CHAT_HEADERS, authorization: devinBasicAuth(session) },
            body: frame,
            signal,
        });
    };
    const auth = await devinChatAuth(session, { fetchFn, signal });
    let response = await attempt(auth);
    if (response.status === 401 && auth?.userJwt) {
        // Cached jwt may be stale despite the margin — token-only is proven good.
        userJwtCache.delete(session.accessToken);
        // Release the rejected body before retrying, or the socket stays pinned.
        try {
            await response.body?.cancel();
        }
        catch { /* body already gone */ }
        response = await attempt(undefined);
    }
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new UpstreamFailure(response.status, `Devin chat failed (HTTP ${response.status})${text ? `: ${text.slice(0, 300)}` : ''}`, { code: 'http' });
    }
    if (!response.body)
        throw new DevinTransportError('Devin chat returned an empty body');
    const collected = {
        text: '',
        thinking: '',
        toolCalls: [],
        usage: undefined,
        stopReason: undefined,
        messageId: undefined,
        actualModelUid: undefined,
    };
    const toolCalls = new Map();
    const toolJson = new Map();
    let activeToolCallId;
    const pendingWrites = [];
    const emit = (event) => {
        if (typeof onEvent !== 'function')
            return;
        const next = onEvent(event);
        if (next && typeof next.then === 'function')
            pendingWrites.push(next);
    };
    const consume = (msg) => {
        if (msg.messageId && !collected.messageId)
            collected.messageId = msg.messageId;
        if (msg.actualModelUid)
            collected.actualModelUid = msg.actualModelUid;
        if (msg.deltaThinking) {
            collected.thinking += msg.deltaThinking;
            emit({ type: 'thinking', delta: msg.deltaThinking });
        }
        if (msg.deltaText) {
            collected.text += msg.deltaText;
            emit({ type: 'text', delta: msg.deltaText });
        }
        for (const call of msg.deltaToolCalls ?? []) {
            const callId = call.id || activeToolCallId;
            if (!callId)
                continue;
            activeToolCallId = callId;
            let entry = toolCalls.get(callId);
            if (!entry) {
                entry = { id: callId, name: call.name ?? '', argumentsJson: '' };
                toolCalls.set(callId, entry);
                toolJson.set(callId, '');
            }
            if (call.name)
                entry.name = call.name;
            if (call.argumentsJson) {
                // The server may resend the whole buffer or stream deltas; keep
                // whichever grows the accumulated JSON (reference-client behavior).
                const previous = toolJson.get(callId) ?? '';
                const accumulated = call.argumentsJson.startsWith(previous) ? call.argumentsJson : previous + call.argumentsJson;
                toolJson.set(callId, accumulated);
                entry.argumentsJson = accumulated;
                emit({ type: 'tool', call: { id: callId, name: entry.name, argumentsJson: accumulated } });
            }
        }
        if (msg.stopReason !== undefined && msg.stopReason !== 0) {
            collected.stopReason = msg.stopReason;
            emit({ type: 'stop', reason: msg.stopReason });
        }
        if (msg.usage) {
            collected.usage = msg.usage;
            emit({ type: 'usage', usage: msg.usage });
        }
    };
    const reader = response.body.getReader();
    let pending = Buffer.alloc(0);
    for (;;) {
        const { done, value } = await reader.read();
        // A read that settles after a timer fired must not reach the client.
        signal?.throwIfAborted();
        if (value && value.length > 0) {
            touch?.();
            pending = Buffer.concat([pending, Buffer.from(value)]);
        }
        const { frames, rest } = splitConnectFrames(pending);
        pending = rest;
        for (const item of frames) {
            if (item.end) {
                const trailer = connectTrailerError(unframePayload(item).toString('utf8'));
                if (trailer) {
                    // Which Connect codes Devin actually sends is still being learned.
                    console.error(`[oauth-subs] devin Connect error: ${trailer.message}`);
                    throw new UpstreamFailure(connectCodeStatus(trailer.code), `Devin chat stream error: ${trailer.message}`, { code: 'http' });
                }
                continue;
            }
            consume(decodeGetChatMessageResponse(unframePayload(item)));
        }
        if (pendingWrites.length)
            await Promise.all(pendingWrites.splice(0));
        if (done)
            break;
    }
    collected.toolCalls = [...toolCalls.values()];
    if (!collected.text && collected.toolCalls.length === 0 && !collected.thinking && collected.stopReason === undefined) {
        throw new DevinTransportError('Devin chat stream ended without a message');
    }
    return collected;
}
/**
 * Proxy-facing forward, same contract as forwardCursor: writes the OpenAI
 * response itself — Completions JSON or SSE. Timers, transport retries and the
 * one 401 refresh come from `upstreamRequest`; the head waits for the first
 * mapped chunk, so any earlier failure is still a JSON error with the real
 * status, and a failure after it destroys the stream (`answerFailure`).
 * `runFn`/`fetchFn` are test seams.
 */
export async function forwardDevin(response, { payload, cacheSessionId, stream, session, tokens, signal, startedAt, timeouts, fetchFn = outboundFetch, runFn = runDevinChat, } = {}) {
    if (!session?.accessToken) {
        throw new RequestError(401, 'Devin needs a logged-in session token (login or import the CLI credentials)');
    }
    const source = payload && typeof payload === 'object' ? payload : {};
    const built = openaiToDevin(source, cacheSessionId ? { cascadeId: deterministicDevinId(cacheSessionId) } : {});
    const model = source.model ?? built.chatModelUid;
    const id = `chatcmpl-${Date.now()}`;
    // Any pushed event yields at least the role chunk and commits the head, so
    // no attempt that reached the mapper is ever retried.
    const mapper = stream ? createDevinOpenaiStream({ model, id }) : undefined;
    const write = async (chunk) => {
        if (!response.write(chunk))
            await once(response, 'drain', { signal });
    };
    const onEvent = mapper && (async (event) => {
        const chunks = mapper.push(event);
        if (chunks.length && !response.headersSent)
            response.writeHead(200, SSE_HEADERS);
        for (const chunk of chunks)
            await write(chunk);
    });
    const collected = await upstreamRequest({ family: 'devin', signal, startedAt, stream, response, timeouts }).run((attempt) => runFn(session, built, { signal: attempt.signal, touch: attempt.touch, fetchFn, ...(onEvent ? { onEvent } : {}) }), {
        // The shared one-shot 401 refresh. Session tokens do not rotate, so
        // before the local expiry this is one retry with the same token.
        refresh: async () => {
            const row = typeof tokens?.sourceOf === 'function' ? tokens.sourceOf(session) : undefined;
            const next = row ? await tokens.refreshNow(row.id, session.accessToken).catch(() => undefined) : undefined;
            if (!next?.session)
                return false;
            session = next.session;
            return true;
        },
    });
    if (!mapper) {
        sendJson(response, 200, devinToOpenai(collected, { model, id }));
        return;
    }
    if (!response.headersSent)
        response.writeHead(200, SSE_HEADERS);
    for (const chunk of mapper.finish())
        await write(chunk);
    if (!response.writableEnded && !response.destroyed)
        response.end();
}
