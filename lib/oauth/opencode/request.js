/**
 * OpenCode Free hop. Completions models keep top-level `reasoning_effort`.
 * Muse Spark is Zen Responses: chat body → `/zen/v1/responses` → chat.completion.
 * Never send both `thinking` and `reasoning_effort`.
 * Never send Authorization (headers live in index.ts).
 */
import { opencodeCatalogModels } from './catalog.js';
import { OPENCODE_MODELS } from './index.js';
const OFF = new Set(['off', 'none', 'disabled', false, null, '']);
export const OPENCODE_MIN_OUTPUT_TOKENS = 16;
function modelOf(id) {
    const name = typeof id === 'string' ? id : '';
    return opencodeCatalogModels().find((model) => model.id === name)
        ?? OPENCODE_MODELS.find((model) => model.id === name);
}
function advertisedEfforts(model) {
    const raw = model?.reasoningEfforts;
    if (!raw || typeof raw !== 'object')
        return undefined;
    return raw;
}
function wireEffort(value, efforts) {
    if (value === undefined)
        return undefined;
    if (OFF.has(value))
        return Object.hasOwn(efforts, 'off') ? efforts.off : undefined;
    if (efforts[value] !== undefined)
        return efforts[value];
    const hit = Object.values(efforts).find((wire) => wire === value);
    return typeof hit === 'string' ? hit : undefined;
}
export function applyOpencodeThinking(payload = {}, model) {
    const next = { ...payload };
    const effort = next.reasoning_effort;
    delete next.thinking;
    const row = model ?? modelOf(next.model);
    const efforts = advertisedEfforts(row);
    if (!efforts) {
        delete next.reasoning_effort;
        return next;
    }
    const wire = wireEffort(effort, efforts);
    if (wire === undefined) {
        delete next.reasoning_effort;
        return next;
    }
    next.reasoning_effort = wire;
    return next;
}
function isPlain(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
}
function firstNumber(...values) {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value))
            return value;
        if (typeof value === 'string' && value.trim()) {
            const n = Number(value);
            if (Number.isFinite(n))
                return n;
        }
    }
    return undefined;
}
function contentToText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return content == null ? '' : String(content);
    return content.map((part) => {
        if (typeof part === 'string')
            return part;
        if (part && typeof part.text === 'string')
            return part.text;
        return '';
    }).join('');
}
function mapContent(content, kind) {
    if (content == null)
        return '';
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return String(content);
    return content.map((part) => {
        if (typeof part === 'string') {
            return { type: kind === 'output' ? 'output_text' : 'input_text', text: part };
        }
        if (!isPlain(part))
            return part;
        if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
            return { type: kind === 'output' ? 'output_text' : 'input_text', text: part.text ?? '' };
        }
        if (part.type === 'image_url' || part.type === 'input_image') {
            const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
            return url ? { type: 'input_image', image_url: url } : part;
        }
        return part;
    });
}
function chatToolToResponses(tool) {
    if (!isPlain(tool))
        return tool;
    if (tool.type === 'function' && isPlain(tool.function)) {
        const next = {
            type: 'function',
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
        };
        if (tool.function.strict != null)
            next.strict = tool.function.strict;
        return next;
    }
    return tool;
}
function messagesToInput(messages) {
    const items = [];
    for (const msg of messages) {
        if (!isPlain(msg))
            continue;
        if (msg.role === 'tool') {
            items.push({
                type: 'function_call_output',
                call_id: msg.tool_call_id ?? msg.id,
                output: contentToText(msg.content),
            });
            continue;
        }
        if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
            const text = contentToText(msg.content);
            if (text)
                items.push({ role: 'assistant', content: text });
            for (const call of msg.tool_calls) {
                const fn = isPlain(call?.function) ? call.function : {};
                items.push({
                    type: 'function_call',
                    call_id: call.id,
                    name: fn.name ?? call.name,
                    arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
                });
            }
            continue;
        }
        items.push({
            role: msg.role,
            content: mapContent(msg.content, msg.role === 'assistant' ? 'output' : 'input'),
        });
    }
    return items;
}
/** Chat / leftover Completions body → Zen Responses. Does not copy Codex cache fields. */
export function chatToOpencodeResponses(payload = {}) {
    const next = {};
    if (typeof payload.model === 'string')
        next.model = payload.model;
    if (payload.input != null)
        next.input = payload.input;
    else if (Array.isArray(payload.messages))
        next.input = messagesToInput(payload.messages);
    else if (typeof payload.messages === 'string')
        next.input = payload.messages;
    if (typeof payload.instructions === 'string')
        next.instructions = payload.instructions;
    const max = firstNumber(payload.max_output_tokens, payload.max_tokens);
    if (max !== undefined)
        next.max_output_tokens = Math.max(OPENCODE_MIN_OUTPUT_TOKENS, max);
    const effort = isPlain(payload.reasoning) ? payload.reasoning.effort : undefined;
    const wire = effort ?? payload.reasoning_effort;
    if (wire !== undefined) {
        next.reasoning = { ...(isPlain(payload.reasoning) ? payload.reasoning : {}), effort: wire };
    }
    if (Array.isArray(payload.tools) && payload.tools.length) {
        next.tools = payload.tools.map(chatToolToResponses);
    }
    if (payload.tool_choice != null)
        next.tool_choice = payload.tool_choice;
    if (payload.stream === true)
        next.stream = true;
    if (payload.temperature != null)
        next.temperature = payload.temperature;
    return next;
}
function partsText(parts, types) {
    if (typeof parts === 'string')
        return parts;
    if (!Array.isArray(parts))
        return '';
    const allowed = new Set(types);
    return parts.map((part) => {
        if (typeof part === 'string')
            return part;
        if (!isPlain(part))
            return '';
        if (allowed.has(part.type) || !part.type)
            return part.text ?? '';
        return '';
    }).join('');
}
function collectResponsesOutput(payload) {
    let text = typeof payload.output_text === 'string' ? payload.output_text : '';
    let reasoning = '';
    const toolCalls = [];
    for (const item of Array.isArray(payload.output) ? payload.output : []) {
        if (!isPlain(item))
            continue;
        if (item.type === 'message' || item.role === 'assistant') {
            const chunk = partsText(item.content, ['output_text', 'text']);
            if (chunk && !text.includes(chunk))
                text += chunk;
        }
        else if (item.type === 'reasoning') {
            reasoning += partsText(item.summary, ['summary_text', 'text'])
                || partsText(item.content, ['reasoning_text', 'text'])
                || (typeof item.text === 'string' ? item.text : '');
        }
        else if (item.type === 'function_call') {
            toolCalls.push({
                id: item.call_id ?? item.id,
                type: 'function',
                function: {
                    name: item.name ?? 'tool',
                    arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
                },
            });
        }
    }
    return { text, reasoning, toolCalls };
}
function mapResponsesUsage(usage) {
    if (!isPlain(usage))
        return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const prompt = firstNumber(usage.input_tokens, usage.prompt_tokens) ?? 0;
    const completion = firstNumber(usage.output_tokens, usage.completion_tokens) ?? 0;
    const total = firstNumber(usage.total_tokens) ?? (prompt + completion);
    return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: total };
}
function finishReasonOf(payload, toolCalls) {
    if (toolCalls?.length)
        return 'tool_calls';
    if (payload?.status === 'incomplete' && payload.incomplete_details?.reason === 'max_output_tokens') {
        return 'length';
    }
    return 'stop';
}
function isChatCompletion(payload) {
    return isPlain(payload) && (payload.object === 'chat.completion' || Array.isArray(payload.choices));
}
/** Fold MiMo `content: null` + `reasoning_content` so DSH does not see an empty turn. */
export function foldOpencodeReasoningContent(payload) {
    if (!isChatCompletion(payload))
        return payload;
    const choices = payload.choices.map((choice) => {
        const message = choice?.message;
        if (!isPlain(message))
            return choice;
        const empty = message.content == null || message.content === '';
        if (empty && typeof message.reasoning_content === 'string' && message.reasoning_content) {
            return { ...choice, message: { ...message, content: message.reasoning_content } };
        }
        return choice;
    });
    return { ...payload, choices };
}
export function opencodeResponsesToChat(payload = {}, { model, id } = {}) {
    if (isChatCompletion(payload))
        return foldOpencodeReasoningContent(payload);
    const collected = collectResponsesOutput(payload);
    const message = { role: 'assistant', content: collected.text || null };
    if (collected.reasoning)
        message.reasoning_content = collected.reasoning;
    if (collected.toolCalls.length)
        message.tool_calls = collected.toolCalls;
    return {
        id: payload.id ?? id ?? 'chatcmpl-opencode',
        object: 'chat.completion',
        model: payload.model ?? model,
        choices: [{
                index: 0,
                message,
                finish_reason: finishReasonOf(payload, collected.toolCalls),
            }],
        usage: mapResponsesUsage(payload.usage),
    };
}
function chatChunk(id, model, delta, finishReason = null, usage) {
    const chunk = {
        id,
        object: 'chat.completion.chunk',
        model,
        choices: [{ index: 0, delta: delta ?? {}, finish_reason: finishReason }],
    };
    if (usage)
        chunk.usage = usage;
    return chunk;
}
function deltaText(event) {
    if (typeof event?.delta === 'string')
        return event.delta;
    if (isPlain(event?.delta) && typeof event.delta.text === 'string')
        return event.delta.text;
    if (typeof event?.text === 'string')
        return event.text;
    return '';
}
export function createOpencodeResponsesChatStream({ model, id = 'chatcmpl-opencode' } = {}) {
    let chatId = id;
    let finished = false;
    return {
        push(event) {
            if (!isPlain(event))
                return undefined;
            if (event.type === 'response.created' && event.response?.id) {
                chatId = event.response.id;
                return undefined;
            }
            if (event.type === 'response.output_text.delta' || event.type === 'response.content_part.delta') {
                const text = deltaText(event);
                if (!text)
                    return undefined;
                return chatChunk(chatId, model, { content: text });
            }
            if (event.type === 'response.reasoning_summary_text.delta' || event.type === 'response.reasoning_text.delta') {
                const text = deltaText(event);
                if (!text)
                    return undefined;
                return chatChunk(chatId, model, { reasoning_content: text });
            }
            if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
                const item = event.item;
                return chatChunk(chatId, model, {
                    tool_calls: [{
                            index: event.output_index ?? 0,
                            id: item.call_id ?? item.id,
                            type: 'function',
                            function: { name: item.name ?? '', arguments: item.arguments ?? '' },
                        }],
                });
            }
            if (event.type === 'response.function_call_arguments.delta') {
                const text = deltaText(event);
                if (!text)
                    return undefined;
                return chatChunk(chatId, model, {
                    tool_calls: [{
                            index: event.output_index ?? 0,
                            id: event.item_id,
                            type: 'function',
                            function: { arguments: text },
                        }],
                });
            }
            if (event.type === 'response.completed' || event.type === 'response.failed' || event.type === 'error') {
                finished = true;
                const response = event.response;
                const collected = isPlain(response) ? collectResponsesOutput(response) : { toolCalls: [] };
                return chatChunk(chatId, model, {}, finishReasonOf(response, collected.toolCalls), isPlain(response?.usage) ? mapResponsesUsage(response.usage) : undefined);
            }
            return undefined;
        },
        finish() {
            if (finished)
                return undefined;
            finished = true;
            return chatChunk(chatId, model, {}, 'stop');
        },
    };
}
export function parseOpencodeSseBlocks(buffer) {
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
