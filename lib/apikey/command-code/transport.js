/**
 * Command Code chat transport: JSON POST + JSONL event stream to
 * `https://api.commandcode.ai/alpha/generate`.
 *
 *   request : one JSON body — see request.ts for the wire shape
 *   response: newline-delimited JSON events:
 *       {"type":"reasoning-start"} / {"type":"reasoning-delta","text":…} /
 *       {"type":"reasoning-end"} / {"type":"text-delta","text":…} /
 *       {"type":"tool-call","toolCallId":…,"toolName":…,"input":{…}} /
 *       {"type":"finish","totalUsage":{…},"finishReason":…,"rawFinishReason":…} /
 *       {"type":"error","message":…,"statusCode":…,"isRetryable":…} /
 *       {"type":"abort"}
 *
 * Auth is `Authorization: Bearer <apiKey>` (the permanent key from
 * ~/.commandcode/auth.json or COMMAND_CODE_API_KEY). The upstream stream must
 * close with `finish` or `abort`; anything else is a truncated turn.
 */
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { RequestError, describeError, sendJson } from '../../utils/http.js';
import { COMMAND_CODE_GENERATE_URL, commandCodeUpstreamHeaders } from './index.js';
import { commandCodeToOpenai, createCommandCodeOpenaiStream, openaiToCommandCode, } from './request.js';
/**
 * Bounded replay for transport faults before any client byte commits —
 * the same contract the shared forward() loop gives the passthrough families
 * (STREAM_ATTEMPTS / RETRY_BACKOFF_MS), which this JSONL hop bypasses.
 */
const COMMAND_CODE_STREAM_ATTEMPTS = 3;
const COMMAND_CODE_RETRY_BACKOFF_MS = [1000, 4000];
export class CommandCodeTransportError extends Error {
    constructor(message, { status, retryable } = {}) {
        super(message);
        this.name = 'CommandCodeTransportError';
        this.status = status;
        this.retryable = retryable;
    }
}
/**
 * Only transport faults replay: socket errors, an empty body, a stream cut
 * before `finish`. HTTP statuses (429 and 5xx included) and `error` events
 * are the upstream's answer — forwarded once and retried by the host, never
 * here (docs/error.md: 4xx/5xx 转发、代理内不重试).
 */
function commandCodeRetryable(error) {
    return error instanceof CommandCodeTransportError ? error.retryable === true : true;
}
async function readErrorBody(response) {
    const text = await response.text().catch(() => '');
    if (!text)
        return '';
    try {
        const parsed = JSON.parse(text);
        const message = parsed?.error?.message ?? parsed?.message;
        return typeof message === 'string' ? message : text;
    }
    catch {
        return text;
    }
}
/**
 * Run one `/alpha/generate` turn. `onEvent` receives
 * {type:'text'|'reasoning'|'tool'|'usage'|'finish', …} deltas; the resolved
 * value is the fully collected turn.
 */
export async function runCommandCodeChat(session, body, { signal, onEvent, fetchFn = fetch } = {}) {
    if (!session?.accessToken) {
        throw new CommandCodeTransportError('Command Code chat needs an API key', { status: 401 });
    }
    const response = await fetchFn(COMMAND_CODE_GENERATE_URL, {
        method: 'POST',
        headers: commandCodeUpstreamHeaders(session),
        body: JSON.stringify(body),
        signal,
    });
    if (!response.ok) {
        const detail = await readErrorBody(response);
        const error = new CommandCodeTransportError(`Command Code chat failed (HTTP ${response.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`, { status: response.status });
        if (response.status === 401 || response.status === 403)
            error.permanent = true;
        throw error;
    }
    if (!response.body)
        throw new CommandCodeTransportError('Command Code chat returned an empty body', { retryable: true });
    const collected = {
        text: '',
        reasoning: '',
        toolCalls: [],
        usage: undefined,
        finishReason: undefined,
    };
    let finished = false;
    let aborted = false;
    const pendingWrites = [];
    const emit = (event) => {
        if (typeof onEvent !== 'function')
            return;
        const next = onEvent(event);
        if (next && typeof next.then === 'function')
            pendingWrites.push(next);
    };
    const consume = (event) => {
        if (!event || typeof event !== 'object')
            return;
        if (event.type === 'text-delta') {
            const delta = typeof event.text === 'string' ? event.text : '';
            if (delta) {
                collected.text += delta;
                emit({ type: 'text', delta });
            }
            return;
        }
        if (event.type === 'reasoning-delta') {
            const delta = typeof event.text === 'string' ? event.text : '';
            if (delta) {
                collected.reasoning += delta;
                emit({ type: 'reasoning', delta });
            }
            return;
        }
        if (event.type === 'tool-call') {
            const input = event.input ?? event.args ?? {};
            const call = {
                id: typeof event.toolCallId === 'string' && event.toolCallId
                    ? event.toolCallId
                    : `call_${collected.toolCalls.length}`,
                name: typeof event.toolName === 'string' ? event.toolName : '',
                argumentsJson: typeof input === 'string' ? input : JSON.stringify(input),
            };
            collected.toolCalls.push(call);
            emit({ type: 'tool', call });
            return;
        }
        if (event.type === 'finish') {
            finished = true;
            collected.usage = event.totalUsage ?? event.usage ?? collected.usage;
            collected.finishReason = event.finishReason ?? event.rawFinishReason;
            emit({ type: 'usage', usage: collected.usage });
            emit({ type: 'finish', reason: collected.finishReason });
            return;
        }
        if (event.type === 'error') {
            const message = typeof event.message === 'string' ? event.message : 'upstream stream error';
            throw new CommandCodeTransportError(`Command Code stream error: ${message}`, {
                status: typeof event.statusCode === 'number' ? event.statusCode : 500,
            });
        }
        if (event.type === 'abort') {
            aborted = true;
        }
    };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (value && value.length > 0)
            pending += decoder.decode(value, { stream: true });
        let index = pending.indexOf('\n');
        while (index >= 0) {
            const line = pending.slice(0, index).trim();
            pending = pending.slice(index + 1);
            index = pending.indexOf('\n');
            if (!line)
                continue;
            try {
                consume(JSON.parse(line));
            }
            catch (error) {
                if (error instanceof SyntaxError)
                    continue;
                throw error;
            }
        }
        if (pendingWrites.length)
            await Promise.all(pendingWrites.splice(0));
        if (done)
            break;
    }
    if (pending.trim()) {
        try {
            consume(JSON.parse(pending.trim()));
        }
        catch (error) {
            if (!(error instanceof SyntaxError))
                throw error;
        }
    }
    if (pendingWrites.length)
        await Promise.all(pendingWrites.splice(0));
    if (!finished && !aborted) {
        throw new CommandCodeTransportError('Command Code stream ended before a finish event', {
            status: 502,
            retryable: true,
        });
    }
    return collected;
}
/**
 * Proxy-facing forward, same contract as forwardDevin: writes the OpenAI
 * response itself — Completions JSON or SSE. `runFn`/`fetchFn` are test seams.
 */
export async function forwardCommandCode(response, { payload, threadId, stream, session, signal, fetchFn = fetch, runFn = runCommandCodeChat, } = {}) {
    if (!session?.accessToken) {
        throw new RequestError(401, 'Command Code needs an API key (paste a key, import the CLI credentials, or log in)');
    }
    const source = payload && typeof payload === 'object' ? payload : {};
    const body = openaiToCommandCode(source, { threadId });
    const model = typeof source.model === 'string' ? source.model : '';
    const id = `chatcmpl-cc-${Date.now()}`;
    const runRetrying = async (onEvent, hasOutput) => {
        for (let attempt = 0;; attempt += 1) {
            if (attempt > 0) {
                await delay(COMMAND_CODE_RETRY_BACKOFF_MS[attempt - 1], undefined, { signal });
                console.error(`[oauth-subs] command-code retrying upstream (attempt ${attempt + 1}/${COMMAND_CODE_STREAM_ATTEMPTS})`);
            }
            try {
                return await runFn(session, body, onEvent ? { signal, fetchFn, onEvent } : { signal, fetchFn });
            }
            catch (error) {
                // A replay is only safe while no client byte is committed — the same
                // gate forward()'s stream loop applies to the passthrough families.
                if (signal?.aborted || hasOutput?.() || !commandCodeRetryable(error) || attempt === COMMAND_CODE_STREAM_ATTEMPTS - 1)
                    throw error;
            }
        }
    };
    if (!stream) {
        const collected = await runRetrying(undefined, undefined);
        sendJson(response, 200, commandCodeToOpenai(collected, { model, id }));
        return;
    }
    const mapper = createCommandCodeOpenaiStream({ model, id });
    let headSent = false;
    const head = () => {
        if (headSent)
            return;
        headSent = true;
        response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
        });
    };
    const write = async (chunk) => {
        if (!response.write(chunk))
            await once(response, 'drain', { signal });
    };
    const fail = async (message) => {
        if (!headSent) {
            sendJson(response, 502, { error: { message } });
            return;
        }
        // Once output commits the status, a structured SSE error is the only way
        // to distinguish a failed run from a successfully completed answer.
        console.error(`[oauth-subs] command-code upstream error mid-stream: ${message}`);
        await write(`data: ${JSON.stringify({ error: { message, type: 'server_error', code: 'command_code_upstream' } })}\n\n`);
        if (!response.writableEnded && !response.destroyed)
            response.end();
    };
    try {
        await runRetrying(async (event) => {
            const chunks = mapper.push(event);
            if (chunks.length)
                head();
            for (const chunk of chunks)
                await write(chunk);
        }, () => headSent);
    }
    catch (error) {
        if (signal?.aborted)
            throw error;
        await fail(describeError(error));
        return;
    }
    head();
    for (const chunk of mapper.finish())
        await write(chunk);
    if (!response.writableEnded && !response.destroyed)
        response.end();
}
