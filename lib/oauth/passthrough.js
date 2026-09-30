/**
 * Passthrough hop for families that speak the host wire as-is: one POST per
 * attempt, the pre-output commit gate that keeps a silent failed stream
 * retryable, usage rewriting on completions SSE, and the forwarded-header
 * filter. Timing and retries belong to upstream.ts.
 */
import { randomUUID } from 'node:crypto';
import { codexCacheHeaders } from './codex/cache.js';
import { grokAffinityHeaders } from './grok/index.js';
import { mapGlmChatUsage } from './glm/request.js';
import { mapKimiUsage } from './kimi/request.js';
import { mapCopilotUsage } from './copilot/request.js';
import { describeError, sendJson } from '../utils/http.js';
import { mapClineUsage, unwrapClineEnvelope } from './cline/request.js';
import { SseFrameScanner } from './responses-sse.js';
import { pumpBody, UpstreamFailure, upstreamRequest, waitForDrain } from './upstream.js';
import { forcedRefresh } from './tokens.js';
import { readBody, rewriteUpstreamBody } from './proxy-body.js';
/** Unclassifiable bytes a gated stream may buffer before committing anyway. */
const MAX_UNCLASSIFIED_BYTES = 64 * 1024;
/**
 * Everything a gated stream may buffer. Past this the gate commits without
 * retry protection rather than kill a legitimate response.
 */
const MAX_GATE_BUFFER_BYTES = 2 * 1024 * 1024;
/**
 * Forward the upstream's own retry headers so the client can back off at the
 * upstream's pace (the 2026-10-23 token-lifecycle contract: 4xx/5xx answers
 * are forwarded, never retried in the proxy).
 */
function retryAfterOf(upstreamHeaders) {
    return {
        retryAfter: upstreamHeaders?.get?.('retry-after')?.trim() || undefined,
        retryAfterMs: upstreamHeaders?.get?.('retry-after-ms')?.trim() || undefined,
    };
}
/** Gateway answers that mean "not this hop", not "bad request body". */
const GATEWAY_FALLBACK_STATUSES = new Set([401, 403, 404]);
export async function forward(request, response, { url, fallbackUrl = undefined, session, tokens, headersOf, fetchFn, family, wire = undefined, maxRequestBodyBytes, upstreamTimeouts, startedAt, signal, classifyFailure = undefined, encodeBody = undefined }) {
    const raw = await readBody(request, maxRequestBodyBytes);
    const { payload, cacheSessionId, stream, routingHint, grokModel, copilotVision, copilotInitiator } = rewriteUpstreamBody(raw, family, wire);
    // A route's `encodeBody` (Codex zstd) runs once; retries resend the same bytes.
    const plain = Buffer.from(JSON.stringify(payload));
    const { body, headers: encodingHeaders = {} } = encodeBody?.(plain) ?? { body: plain };
    const grokReqId = family === 'grok' ? randomUUID() : undefined;
    // Rebuilt whole after a 401 refresh: the route overrides below must win over
    // the family's own headers (stream `accept`, Copilot `x-initiator`).
    const headersFor = (current) => ({
        ...headersOf(current, cacheSessionId),
        'content-type': request.headers['content-type'] ?? 'application/json',
        ...(stream ? { accept: 'text/event-stream' } : {}),
        ...encodingHeaders,
        ...(family === 'codex' ? {
            ...codexCacheHeaders(cacheSessionId),
            ...(routingHint ? { 'x-codex-routing-hint': routingHint } : {}),
        } : {}),
        ...(family === 'copilot' ? {
            'x-initiator': copilotInitiator === 'agent' ? 'agent' : 'user',
            ...(copilotVision ? { 'copilot-vision-request': 'true' } : {}),
        } : {}),
    });
    let baseHeaders = headersFor(session);
    // Codex hands back `x-codex-turn-state` on a failed attempt; the retry replays it.
    const turn = { state: undefined };
    // One-shot reroute to the direct endpoint when the gateway refuses this hop.
    let fallbackPending = typeof fallbackUrl === 'string' && fallbackUrl.length > 0 && fallbackUrl !== url;
    await upstreamRequest({ family, signal, startedAt, stream, response, timeouts: upstreamTimeouts }).run(async (attempt) => {
        for (;;) {
            const headers = {
                ...baseHeaders,
                ...(family === 'grok' ? grokAffinityHeaders(cacheSessionId, {
                    model: grokModel,
                    reqId: grokReqId,
                    retryAttempt: attempt.index,
                }) : {}),
                ...(family === 'codex' && turn.state ? { 'x-codex-turn-state': turn.state } : {}),
            };
            try {
                return await attemptUpstream(response, { url, headers, body, stream, fetchFn, family, wire, attempt, turn, classifyFailure });
            }
            catch (error) {
                // The Coding Plan gateway (zcode.z.ai) can refuse a bearer the model
                // endpoint still accepts: reroute once, within this attempt.
                if (!(fallbackPending && error instanceof UpstreamFailure && error.code === 'http' && GATEWAY_FALLBACK_STATUSES.has(error.status)))
                    throw error;
                fallbackPending = false;
                url = fallbackUrl;
                console.error(`[oauth-subs] ${family} gateway ${error.status}; falling back to the direct endpoint`);
            }
        }
    }, {
        refresh: forcedRefresh(tokens, () => session, (next) => { session = next; baseHeaders = headersFor(next); }),
    });
}
function upstreamErrorPayload(text, family, status) {
    let parsed;
    try {
        parsed = text ? JSON.parse(text) : null;
    }
    catch {
        parsed = { error: { message: text } };
    }
    if (parsed == null || (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0)) {
        parsed = {
            error: {
                message: `${family} upstream ${status} with empty body`,
                type: 'invalid_request_error',
                code: 'invalid_request',
            },
        };
    }
    return parsed;
}
function completionsUsageMapper(family, wire) {
    if (family === 'copilot')
        return mapCopilotUsage;
    if (family === 'kimi')
        return mapKimiUsage;
    if (family === 'cline')
        return mapClineUsage;
    if (family === 'glm' && wire !== 'anthropic')
        return mapGlmChatUsage;
    return undefined;
}
/**
 * One upstream attempt. The client response stays uncommitted until the stream
 * proves it is producing output, so a break during the silent pre-output window
 * — the signature of the 2026-08-26 incident, where every failed stream carried
 * `response.created` and nothing else — can be retried without the client ever
 * seeing a truncated stream. Timing and retries belong to `upstreamRequest`.
 */
async function attemptUpstream(response, { url, headers, body, stream, fetchFn, family, wire, attempt, turn, classifyFailure }) {
    const { signal } = attempt;
    const upstream = await fetchFn(url, { method: 'POST', headers, body, signal });
    const transport = (message) => {
        const state = family === 'codex' ? upstream.headers?.get?.('x-codex-turn-state')?.trim() : undefined;
        if (state)
            turn.state = state;
        return new UpstreamFailure(502, message, { code: 'transport' });
    };
    if (upstream.status >= 400) {
        const parsed = upstreamErrorPayload(await upstream.text(), family, upstream.status);
        throw classifyFailure?.(upstream.status, parsed)
            ?? new UpstreamFailure(upstream.status, `${family} upstream ${upstream.status}`, { code: 'http', payload: parsed, ...retryAfterOf(upstream.headers) });
    }
    const mapUsage = completionsUsageMapper(family, wire);
    if (mapUsage && !stream) {
        const text = await upstream.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        }
        catch {
            parsed = null;
        }
        // Cline wraps a non-streaming completion in `{success, data}`; a raw
        // passthrough would hand DSH an envelope with no `choices`.
        const payload = family === 'cline' ? unwrapClineEnvelope(parsed) : parsed;
        if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.usage) {
            sendJson(response, upstream.status, { ...payload, usage: mapUsage(payload.usage) }, forwardedHeaders(upstream.headers));
            return;
        }
        if (payload !== parsed && payload !== null) {
            sendJson(response, upstream.status, payload, forwardedHeaders(upstream.headers));
            return;
        }
        response.writeHead(upstream.status, forwardedHeaders(upstream.headers));
        if (text)
            response.write(text);
        if (!response.writableEnded && !response.destroyed)
            response.end();
        return;
    }
    const rewriter = mapUsage ? new SseUsageRewriter(mapUsage) : null;
    const emit = async (chunk) => {
        const parts = rewriter ? rewriter.push(chunk) : [chunk];
        for (const part of parts) {
            if (!response.write(part))
                await waitForDrain(response, signal);
        }
    };
    // Codex/Grok Responses can open with handshake-only frames. Completions
    // SSE has no `response.created` preamble — gating it would wait for 64KiB.
    const gate = new CommitGate(response, upstream, stream === true && (family === 'codex' || family === 'chatgpt' || family === 'grok'), emit, family);
    let lastByteAt = Date.now();
    try {
        await pumpBody(upstream.body, attempt, async (value) => {
            lastByteAt = Date.now();
            if (await gate.push(value))
                await emit(value);
        });
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        // Committed: upstreamRequest rethrows it and answerFailure destroys the
        // response — a clean end reads as a finished SSE stream to llm-pi-ai.
        throw transport(`${describeError(error)} (silent ${Date.now() - lastByteAt}ms, ${gate.bytes}B seen, committed=${gate.committed})`);
    }
    if (!gate.committed) {
        // Retry only the incident's own signature: an SSE stream that opened, carried
        // nothing but `response.created`, and stopped. Any other shape is forwarded
        // as-is — an unrecognised body is the upstream's answer, not a fault.
        if (gate.gated && (gate.bytes === 0 || gate.sawPreamble)) {
            throw transport(`stream ended with no output events (${gate.bytes}B, silent ${Date.now() - lastByteAt}ms)`);
        }
        await gate.flush();
    }
    if (rewriter && !response.writableEnded && !response.destroyed) {
        for (const part of rewriter.flush()) {
            if (!response.write(part))
                await waitForDrain(response, signal);
        }
    }
    if (!response.writableEnded && !response.destroyed)
        response.end();
}
/**
 * Withholds the client response head until the upstream stream proves useful.
 * Non-streaming bodies and anything past the preamble commit immediately, so
 * only the silent pre-output window is ever buffered.
 */
class CommitGate {
    constructor(response, upstream, stream, emit, family) {
        this.response = response;
        this.upstream = upstream;
        this.emit = emit;
        this.family = family;
        this.buffered = [];
        this.bytes = 0;
        this.unclassified = 0;
        this.committed = false;
        this.sawPreamble = false;
        this.gated = stream === true;
        this.scanner = new SseFrameScanner();
    }
    /** Returns true once the caller should write `chunk` through itself. */
    async push(chunk) {
        if (this.committed)
            return true;
        if (!this.gated) {
            this.commit();
            return true;
        }
        this.buffered.push(chunk);
        this.bytes += chunk.length;
        // Preamble frames echo the whole request prompt (~128KB for DSH), so only
        // bytes that are neither preamble nor output count toward the cap.
        let output = false;
        for (const frame of this.scanner.push(chunk)) {
            if (frame.kind === 'output')
                output = true;
            else if (frame.kind === 'preamble')
                this.sawPreamble = true;
            else
                this.unclassified += frame.bytes;
        }
        if (!output && this.bytes > MAX_GATE_BUFFER_BYTES) {
            console.error(`[oauth-subs] ${this.family} buffered ${this.bytes}B with no output event; committing without retry protection`);
            output = true;
        }
        if (output || this.unclassified > MAX_UNCLASSIFIED_BYTES) {
            await this.flush();
        }
        return false;
    }
    commit() {
        if (this.committed)
            return;
        this.committed = true;
        this.response.writeHead(this.upstream.status, forwardedHeaders(this.upstream.headers));
    }
    /** Commit and emit whatever is buffered — output arrived, or a body we decided not to retry. */
    async flush() {
        this.commit();
        for (const chunk of this.buffered)
            await this.emit(chunk);
        this.buffered = [];
        this.scanner = null;
    }
}
/** Rewrite Completions SSE `usage` objects; leave other events byte-stable. */
class SseUsageRewriter {
    constructor(mapUsage) {
        this.mapUsage = mapUsage;
        this.decoder = new TextDecoder('utf-8');
        this.tail = '';
    }
    push(chunk) {
        this.tail += this.decoder.decode(chunk, { stream: true });
        return this.#take(false);
    }
    flush() {
        this.tail += this.decoder.decode();
        return this.#take(true);
    }
    #take(end) {
        const parts = this.tail.split(/\r?\n\r?\n/);
        this.tail = end ? '' : (parts.pop() ?? '');
        const out = [];
        for (const frame of parts) {
            if (!frame)
                continue;
            out.push(Buffer.from(`${this.#rewriteFrame(frame)}\n\n`));
        }
        return out;
    }
    #rewriteFrame(frame) {
        const lines = frame.split(/\r?\n/);
        return lines.map((line) => {
            const match = /^data:\s*/.exec(line);
            if (!match)
                return line;
            const raw = line.slice(match[0].length);
            if (!raw || raw === '[DONE]')
                return line;
            let parsed;
            try {
                parsed = JSON.parse(raw);
            }
            catch {
                return line;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.usage == null)
                return line;
            const usage = this.mapUsage(parsed.usage);
            if (usage === parsed.usage)
                return line;
            return `data: ${JSON.stringify({ ...parsed, usage })}`;
        }).join('\n');
    }
}
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade']);
/**
 * Headers that describe the upstream wire, not the bytes this proxy sends.
 * undici already decompressed the body, so `content-encoding` / `content-length`
 * would make the client gunzip plain JSON (or wait for a body of the wrong
 * size). Node re-frames the response (chunked) once they are gone.
 */
const WIRE_ONLY = new Set(['content-encoding', 'content-length']);
function forwardedHeaders(upstreamHeaders) {
    const headers = { 'cache-control': 'no-store' };
    upstreamHeaders.forEach((value, key) => {
        const name = key.toLowerCase();
        if (HOP_BY_HOP.has(name) || WIRE_ONLY.has(name))
            return;
        headers[key] = value;
    });
    return headers;
}
