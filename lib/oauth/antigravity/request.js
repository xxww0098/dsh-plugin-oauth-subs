/**
 * OpenAI chat/completions ↔ daily-cloudcode-pa generateContent (hub).
 * Body always includes project + model + userAgent: "antigravity".
 */
import { antigravityRequestId, ANTIGRAVITY_BODY_USER_AGENT } from './index.js';
import { antigravitySessionIdOf, pinAntigravitySystemInstruction, pinAntigravityThinking, pinAntigravityTools, } from './cache.js';
export { ANTIGRAVITY_STABLE_SESSION, resetAntigravitySystemPins, } from './cache.js';
function asCount(value) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        return Math.round(value);
    if (typeof value === 'string' && value.trim()) {
        const next = Number(value);
        if (Number.isFinite(next) && next >= 0)
            return Math.round(next);
    }
    return undefined;
}
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function tryJson(value) {
    if (value && typeof value === 'object')
        return value;
    if (typeof value !== 'string' || !value.trim())
        return {};
    try {
        return JSON.parse(value);
    }
    catch {
        return { text: value };
    }
}
/**
 * Gemini `FunctionResponse.response` is a singular protobuf Struct.
 * Arrays / null / number / bool must be wrapped or cloudcode-pa returns 400:
 * "Unknown name \"response\" … Proto field is not repeating, cannot start list."
 */
export function functionResponsePayload(value) {
    if (isPlainObject(value))
        return value;
    if (typeof value === 'string') {
        if (!value.trim())
            return {};
        try {
            const parsed = JSON.parse(value);
            if (isPlainObject(parsed))
                return parsed;
            return { result: parsed };
        }
        catch {
            return { text: value };
        }
    }
    if (value == null)
        return {};
    return { result: value };
}
function functionResponsePart(message) {
    return {
        functionResponse: {
            name: trimmed(message?.name) ?? 'tool',
            response: functionResponsePayload(message?.content),
        },
    };
}
function isFunctionResponseTurn(content) {
    return content?.role === 'user'
        && Array.isArray(content.parts)
        && content.parts.length > 0
        && content.parts.every((part) => isPlainObject(part?.functionResponse));
}
function imagePart(url) {
    const raw = trimmed(url);
    if (!raw)
        return undefined;
    const match = /^data:([^;]+);base64,(.+)$/.exec(raw);
    if (match)
        return { inlineData: { mimeType: match[1], data: match[2] } };
    return { fileData: { fileUri: raw } };
}
export function partsFromContent(content) {
    if (typeof content === 'string' && content)
        return [{ text: content }];
    if (!Array.isArray(content))
        return content == null || content === '' ? [] : [{ text: String(content) }];
    const parts = [];
    for (const item of content) {
        if (typeof item === 'string' && item)
            parts.push({ text: item });
        else if (item?.type === 'text' && item.text)
            parts.push({ text: item.text });
        else if (item?.type === 'image_url') {
            const part = imagePart(item.image_url?.url ?? item.image_url);
            if (part)
                parts.push(part);
        }
    }
    return parts;
}
function toolDeclarations(tools) {
    if (!Array.isArray(tools) || tools.length === 0)
        return undefined;
    const declarations = tools.flatMap((tool) => {
        const fn = tool?.function ?? tool;
        const name = trimmed(fn?.name);
        if (!name)
            return [];
        return [{
                name,
                ...(trimmed(fn.description) ? { description: fn.description } : {}),
                ...(fn.parameters ? { parameters: fn.parameters } : {}),
            }];
    });
    return declarations.length ? [{ functionDeclarations: declarations }] : undefined;
}
export function openaiToAntigravity(payload, { projectId, sessionId } = {}) {
    const project = trimmed(projectId);
    if (!project)
        throw new Error('antigravity generateContent requires project_id');
    const model = trimmed(payload?.model);
    if (!model)
        throw new Error('antigravity generateContent requires a model');
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const systemParts = [];
    const contents = [];
    for (const message of messages) {
        const role = message?.role;
        if (role === 'system' || role === 'developer') {
            systemParts.push(...partsFromContent(message.content));
            continue;
        }
        if (role === 'tool') {
            const part = functionResponsePart(message);
            const last = contents[contents.length - 1];
            if (isFunctionResponseTurn(last))
                last.parts.push(part);
            else
                contents.push({ role: 'user', parts: [part] });
            continue;
        }
        const parts = [];
        if (Array.isArray(message?.tool_calls)) {
            for (const call of message.tool_calls) {
                const name = trimmed(call?.function?.name);
                if (!name)
                    continue;
                parts.push({ functionCall: { name, args: tryJson(call.function?.arguments) } });
            }
        }
        parts.push(...partsFromContent(message?.content));
        if (parts.length === 0)
            continue;
        contents.push({ role: role === 'assistant' ? 'model' : 'user', parts });
    }
    if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: trimmed(payload?.input) ?? '' }] });
    }
    const pinnedSession = antigravitySessionIdOf(payload, sessionId);
    const pinned = pinAntigravitySystemInstruction(pinnedSession, systemParts);
    if (pinned.extra)
        contents.push({ role: 'user', parts: [{ text: pinned.extra }] });
    const request = {
        contents,
        sessionId: pinnedSession,
    };
    if (pinned.parts.length)
        request.systemInstruction = { parts: pinned.parts };
    const tools = pinAntigravityTools(pinnedSession, toolDeclarations(payload?.tools));
    if (tools)
        request.tools = tools;
    const thinking = pinAntigravityThinking(pinnedSession, trimmed(payload?.reasoning_effort));
    if (thinking) {
        request.generationConfig = { thinkingConfig: thinking };
    }
    return {
        model,
        project,
        userAgent: ANTIGRAVITY_BODY_USER_AGENT,
        requestType: 'agent',
        requestId: antigravityRequestId(),
        request,
    };
}
function finishReason(raw) {
    const value = String(raw ?? '').toUpperCase();
    if (value === 'MAX_TOKENS')
        return 'length';
    if (value.includes('TOOL') || value === 'MALFORMED_FUNCTION_CALL')
        return 'tool_calls';
    if (!value || value === 'STOP' || value === 'END_TURN')
        return 'stop';
    return 'stop';
}
export function collectAntigravityParts(body) {
    const response = body?.response ?? body;
    const candidate = response?.candidates?.[0];
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    let text = '';
    const toolCalls = [];
    for (const part of parts) {
        if (!part || part.thought)
            continue;
        if (typeof part.text === 'string')
            text += part.text;
        if (part.functionCall?.name) {
            toolCalls.push({
                id: `call_${toolCalls.length + 1}`,
                type: 'function',
                function: {
                    name: part.functionCall.name,
                    arguments: JSON.stringify(part.functionCall.args ?? {}),
                },
            });
        }
    }
    return {
        text,
        toolCalls,
        finishReason: finishReason(candidate?.finishReason),
        rawFinish: candidate?.finishReason,
        usage: response?.usageMetadata ?? body?.usageMetadata,
    };
}
/** Gemini usage plus CLI stats aliases (cache_read_tokens / cacheReadTokens). */
export function cachedTokensOf(usage) {
    if (usage == null || typeof usage !== 'object')
        return undefined;
    const direct = asCount(usage.cachedContentTokenCount
        ?? usage.cached_content_token_count
        ?? usage.cachedTokenCount
        ?? usage.cached_tokens
        ?? usage.cache_read_tokens
        ?? usage.cacheReadTokens
        ?? usage.cacheReadInputTokens);
    if (direct !== undefined)
        return direct;
    const details = usage.cacheTokensDetails ?? usage.cache_tokens_details;
    if (!Array.isArray(details))
        return undefined;
    let sum = 0;
    let any = false;
    for (const row of details) {
        const next = asCount(row?.tokenCount ?? row?.token_count);
        if (next === undefined)
            continue;
        sum += next;
        any = true;
    }
    return any ? sum : undefined;
}
/** OpenAI chat.completion usage. Thoughts count as completion tokens (and tok/s). */
export function mapAntigravityUsage(usage) {
    if (usage == null || typeof usage !== 'object')
        return undefined;
    const prompt = usage.promptTokenCount ?? usage.prompt_token_count ?? 0;
    const candidates = usage.candidatesTokenCount ?? usage.candidates_token_count ?? 0;
    const thoughts = usage.thoughtsTokenCount ?? usage.thoughts_token_count ?? 0;
    const completion = candidates + thoughts;
    const mapped = {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: usage.totalTokenCount ?? usage.total_token_count ?? prompt + completion,
    };
    if (thoughts) {
        mapped.completion_tokens_details = { reasoning_tokens: thoughts };
    }
    const cached = cachedTokensOf(usage);
    if (cached !== undefined) {
        mapped.prompt_tokens_details = { cached_tokens: cached };
    }
    return mapped;
}
/** Google SSE is cumulative; OpenAI deltas are suffixes. A shorter later frame is a reset. */
export function incrementalSuffix(next, previous) {
    const current = typeof next === 'string' ? next : '';
    const prior = typeof previous === 'string' ? previous : '';
    if (!current)
        return '';
    if (prior && current.startsWith(prior))
        return current.slice(prior.length);
    return current;
}
function openaiChunk({ id, model, delta, finish_reason, usage }) {
    const chunk = {
        id,
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta, finish_reason }],
    };
    if (usage)
        chunk.usage = usage;
    return chunk;
}
/**
 * Per-stream mapper: cumulative Google frames → incremental OpenAI chunks.
 * Thought parts stay out of `delta.content`; their tokens still land in usage.
 */
export function createAntigravityOpenaiStream({ model, id = `chatcmpl-${Date.now()}` } = {}) {
    let emittedText = '';
    const emittedToolArgs = [];
    let lastUsage;
    let lastFinish = 'stop';
    let sawTools = false;
    function applyEvent(body) {
        const collected = collectAntigravityParts(body);
        if (collected.usage)
            lastUsage = collected.usage;
        if (collected.rawFinish)
            lastFinish = collected.finishReason;
        if (collected.toolCalls.length) {
            sawTools = true;
            lastFinish = 'tool_calls';
        }
        const delta = {};
        const textDelta = incrementalSuffix(collected.text, emittedText);
        if (textDelta) {
            delta.content = textDelta;
            emittedText = collected.text;
        }
        if (collected.toolCalls.length) {
            const calls = [];
            for (let index = 0; index < collected.toolCalls.length; index++) {
                const call = collected.toolCalls[index];
                const prevArgs = emittedToolArgs[index];
                const args = call.function.arguments ?? '';
                const first = prevArgs === undefined;
                const argDelta = incrementalSuffix(args, first ? '' : prevArgs);
                if (!first && !argDelta)
                    continue;
                emittedToolArgs[index] = args;
                calls.push({
                    index,
                    id: call.id,
                    type: 'function',
                    function: {
                        name: call.function.name,
                        arguments: argDelta,
                    },
                });
            }
            if (calls.length)
                delta.tool_calls = calls;
        }
        return delta;
    }
    return {
        push(body) {
            const delta = applyEvent(body);
            if (!delta.content && !delta.tool_calls)
                return undefined;
            return openaiChunk({ id, model, delta, finish_reason: null });
        },
        finish() {
            return openaiChunk({
                id,
                model,
                delta: {},
                finish_reason: sawTools ? 'tool_calls' : lastFinish,
                usage: mapAntigravityUsage(lastUsage),
            });
        },
    };
}
export function antigravityEventsToOpenaiChunks(events, opts) {
    const stream = createAntigravityOpenaiStream(opts);
    const chunks = [];
    for (const event of events ?? []) {
        const chunk = stream.push(event);
        if (chunk)
            chunks.push(chunk);
    }
    chunks.push(stream.finish());
    return chunks;
}
export function antigravityToOpenai(body, { model, id = `chatcmpl-${Date.now()}` } = {}) {
    const collected = collectAntigravityParts(body);
    const message = { role: 'assistant', content: collected.text || null };
    if (collected.toolCalls.length)
        message.tool_calls = collected.toolCalls;
    return {
        id,
        object: 'chat.completion',
        model,
        choices: [{
                index: 0,
                message,
                finish_reason: collected.toolCalls.length ? 'tool_calls' : collected.finishReason,
            }],
        usage: mapAntigravityUsage(collected.usage),
    };
}
export function antigravityToOpenaiChunk(body, { model, id, done = false } = {}) {
    const collected = collectAntigravityParts(body);
    const delta = {};
    if (collected.text)
        delta.content = collected.text;
    if (collected.toolCalls.length)
        delta.tool_calls = collected.toolCalls.map((call, index) => ({
            index,
            id: call.id,
            type: 'function',
            function: call.function,
        }));
    const usage = mapAntigravityUsage(collected.usage);
    return {
        id,
        object: 'chat.completion.chunk',
        model,
        choices: [{
                index: 0,
                delta: done && !collected.text && !collected.toolCalls.length ? {} : delta,
                finish_reason: done ? (collected.toolCalls.length ? 'tool_calls' : collected.finishReason) : null,
            }],
        ...(usage ? { usage } : {}),
    };
}
export function parseAntigravitySseBlocks(buffer) {
    const events = [];
    const chunks = String(buffer).split(/\r?\n\r?\n/);
    let rest = chunks.pop() ?? '';
    for (const block of chunks) {
        const data = block.split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .filter((line) => line && line !== '[DONE]')
            .join('\n');
        if (!data)
            continue;
        try {
            events.push(JSON.parse(data));
        }
        catch {
            // skip a partial or non-JSON frame
        }
    }
    return { events, rest };
}
