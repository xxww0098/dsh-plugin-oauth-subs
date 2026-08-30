/**
 * OpenAI chat/completions ↔ daily-cloudcode-pa generateContent (hub).
 * Body always includes project + model + userAgent: "antigravity".
 */
import { antigravityRequestId, ANTIGRAVITY_BODY_USER_AGENT } from './index.js';
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function parseJsonish(value) {
    if (Array.isArray(value) || (value && typeof value === 'object'))
        return value;
    if (typeof value !== 'string' || !value.trim())
        return undefined;
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
/**
 * Gemini `FunctionResponse.response` / `FunctionCall.args` are protobuf Structs.
 * A JSON array (or scalar) on that field is 400 INVALID_ARGUMENT:
 * "Proto field is not repeating, cannot start list."
 */
export function asGeminiStruct(value) {
    const parsed = parseJsonish(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed;
    if (parsed === undefined)
        return {};
    return { result: parsed };
}
function functionResponsePart(message) {
    return {
        functionResponse: {
            name: trimmed(message?.name) ?? 'tool',
            response: asGeminiStruct(message?.content),
        },
    };
}
function isFunctionResponseTurn(content) {
    return content?.role === 'user'
        && Array.isArray(content.parts)
        && content.parts.length > 0
        && content.parts.every((part) => part?.functionResponse && typeof part.functionResponse === 'object' && !Array.isArray(part.functionResponse));
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
                parts.push({ functionCall: { name, args: asGeminiStruct(call.function?.arguments) } });
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
    const request = {
        contents,
        sessionId: trimmed(sessionId) ?? trimmed(payload?.session_id) ?? `-${Date.now()}`,
    };
    if (systemParts.length)
        request.systemInstruction = { parts: systemParts };
    const tools = toolDeclarations(payload?.tools);
    if (tools)
        request.tools = tools;
    const effort = trimmed(payload?.reasoning_effort);
    if (effort) {
        request.generationConfig = {
            thinkingConfig: { thinkingLevel: effort },
        };
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
        usage: response?.usageMetadata,
    };
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
        usage: collected.usage ? {
            prompt_tokens: collected.usage.promptTokenCount ?? 0,
            completion_tokens: collected.usage.candidatesTokenCount ?? 0,
            total_tokens: collected.usage.totalTokenCount ?? 0,
        } : undefined,
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
    return {
        id,
        object: 'chat.completion.chunk',
        model,
        choices: [{
                index: 0,
                delta: done && !collected.text && !collected.toolCalls.length ? {} : delta,
                finish_reason: done ? (collected.toolCalls.length ? 'tool_calls' : collected.finishReason) : null,
            }],
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
