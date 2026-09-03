/**
 * DSH OpenAI Completions ↔ Cursor AgentService/Run.
 *
 * Native wire is Connect/protobuf over HTTP/2. Completions is the DSH api
 * because that wire is none of the three closed harness protocols.
 */
import { createHash, randomUUID } from 'node:crypto';
import { cursorConversationId, pinCursorSystemPrefix, } from './cache.js';
import { CURSOR_REASONING } from './index.js';
import { decodeAgentServerMessage, encodeAgentClientMessage, encodeAgentRunRequest, encodeAssistantStep, encodeConversationState, encodeConversationTurn, encodeJsonValueBytes, encodeMcpToolStep, encodeRequestedModel, encodeThinkingStep, encodeUserMessage, frameConnect, splitConnectFrames, } from './proto.js';
function textOf(content) {
    if (content == null)
        return '';
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content
        .filter((part) => part && (part.type === 'text' || typeof part.text === 'string'))
        .map((part) => part.text ?? '')
        .join('\n');
}
function parseToolArgs(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw))
        return raw;
    if (typeof raw !== 'string' || !raw.trim())
        return {};
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            return parsed;
        return { value: parsed };
    }
    catch {
        return { __raw: raw };
    }
}
function storeBlob(data, blobStore) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const id = createHash('sha256').update(bytes).digest();
    blobStore.set(id.toString('hex'), bytes);
    return id;
}
function openaiTools(payload) {
    const tools = [];
    for (const tool of payload?.tools ?? []) {
        const fn = tool?.function ?? tool;
        const name = typeof fn?.name === 'string' ? fn.name : undefined;
        if (!name)
            continue;
        tools.push({
            name,
            toolName: name,
            providerIdentifier: 'dsh',
            description: typeof fn.description === 'string' ? fn.description : '',
            inputSchema: encodeJsonValueBytes(fn.parameters ?? {}),
        });
    }
    return tools;
}
function parseTurns(messages) {
    const systemParts = [];
    const turns = [];
    let current;
    for (const msg of messages ?? []) {
        const role = msg?.role;
        if (role === 'system' || role === 'developer') {
            const text = textOf(msg.content);
            if (text)
                systemParts.push(text);
            continue;
        }
        if (role === 'user') {
            if (current)
                turns.push(current);
            current = { userText: textOf(msg.content), steps: [] };
            continue;
        }
        if (!current)
            continue;
        if (role === 'assistant') {
            const thinking = typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';
            if (thinking.trim())
                current.steps.push({ kind: 'thinking', text: thinking });
            const text = textOf(msg.content);
            if (text)
                current.steps.push({ kind: 'assistantText', text });
            for (const call of msg.tool_calls ?? []) {
                current.steps.push({
                    kind: 'toolCall',
                    toolCallId: call.id,
                    toolName: call.function?.name ?? 'tool',
                    arguments: parseToolArgs(call.function?.arguments),
                });
            }
            continue;
        }
        if (role === 'tool') {
            const id = msg.tool_call_id ?? '';
            const existing = current.steps.find((step) => step.kind === 'toolCall' && step.toolCallId === id);
            const result = { content: textOf(msg.content), isError: msg.is_error === true };
            if (existing)
                existing.result = result;
            else {
                current.steps.push({
                    kind: 'toolCall',
                    toolCallId: id,
                    toolName: '',
                    arguments: {},
                    result,
                });
            }
        }
    }
    let userText = '';
    let inFlight;
    if (current) {
        const last = current.steps.at(-1);
        if (current.steps.length === 0 || last?.kind === 'toolCall') {
            userText = current.userText;
            inFlight = current;
        }
        else {
            turns.push(current);
        }
    }
    return { systemPrompt: systemParts.join('\n'), turns, userText, inFlight };
}
function vendorEffort(value) {
    if (typeof value !== 'string' || !value.trim())
        return undefined;
    const key = value.trim();
    if (CURSOR_REASONING[key])
        return CURSOR_REASONING[key];
    if (key === 'none' || key === 'extra-high')
        return key;
    return key;
}
export function cursorModelParameters(payload = {}) {
    const effort = vendorEffort(payload.reasoning_effort);
    if (!effort)
        return [];
    return [{ id: 'reasoning', value: effort }];
}
export function openaiToCursor(payload = {}, { conversationId } = {}) {
    const resolvedId = cursorConversationId(payload, conversationId);
    const parsed = parseTurns(payload.messages);
    const { pinned, extra } = pinCursorSystemPrefix(resolvedId, parsed.systemPrompt);
    const blobStore = new Map();
    const systemPrompt = extra ? `${pinned}\n\n${extra}` : pinned;
    const rootPromptBlobs = [];
    if (pinned) {
        rootPromptBlobs.push(storeBlob(Buffer.from(JSON.stringify({ role: 'system', content: pinned }), 'utf8'), blobStore));
    }
    if (extra) {
        rootPromptBlobs.push(storeBlob(Buffer.from(JSON.stringify({ role: 'system', content: extra }), 'utf8'), blobStore));
    }
    const turnBlobs = parsed.turns.map((turn) => {
        const messageId = randomUUID();
        const userBlob = storeBlob(encodeUserMessage({
            text: turn.userText,
            messageId,
            mode: 1,
        }), blobStore);
        const stepBlobs = turn.steps.map((step) => {
            if (step.kind === 'thinking')
                return storeBlob(encodeThinkingStep(step.text), blobStore);
            if (step.kind === 'toolCall') {
                return storeBlob(encodeMcpToolStep({
                    toolName: step.toolName,
                    toolCallId: step.toolCallId,
                    args: step.arguments,
                    result: step.result,
                }), blobStore);
            }
            return storeBlob(encodeAssistantStep(step.text), blobStore);
        });
        return storeBlob(encodeConversationTurn({
            userMessageBlob: userBlob,
            stepBlobs,
            requestId: randomUUID(),
        }), blobStore);
    });
    const modelId = typeof payload.model === 'string' && payload.model.trim()
        ? payload.model.trim()
        : 'composer-2';
    const userMessageId = randomUUID();
    const userText = parsed.userText
        || (parsed.inFlight && parsed.inFlight.steps.length ? '' : parsed.turns.at(-1)?.userText)
        || '';
    const userMessage = encodeUserMessage({
        text: userText || (parsed.inFlight ? parsed.inFlight.userText : ''),
        messageId: userMessageId,
        mode: 1,
    });
    const conversationState = encodeConversationState({
        rootPromptBlobs,
        turnBlobs,
        mode: 1,
        clientName: 'dsh',
    });
    const tools = openaiTools(payload);
    const requestBytes = encodeAgentClientMessage(encodeAgentRunRequest({
        conversationState,
        userMessage,
        requestedModel: encodeRequestedModel({
            modelId,
            maxMode: false,
            parameters: cursorModelParameters(payload),
        }),
        conversationId: resolvedId,
        mcpTools: tools,
    }));
    return {
        conversationId: resolvedId,
        modelId,
        systemPrompt,
        pinnedSystem: pinned,
        extraSystem: extra,
        userText: userText || parsed.inFlight?.userText || '',
        tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
        turns: parsed.turns,
        requestBytes,
        blobStore,
        stream: payload.stream === true,
    };
}
export function mapCursorUsage({ promptTokens, completionTokens, cachedTokens } = {}) {
    const prompt = Number.isFinite(promptTokens) ? promptTokens : 0;
    const completion = Number.isFinite(completionTokens) ? completionTokens : 0;
    const cached = Number.isFinite(cachedTokens) ? cachedTokens : 0;
    const usage = {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: prompt + completion,
    };
    if (cached > 0)
        usage.prompt_tokens_details = { cached_tokens: cached };
    return usage;
}
export function cursorToOpenai(collected, { model, id = `chatcmpl-${Date.now()}`, conversationId } = {}) {
    const toolCalls = collected.toolCalls ?? [];
    const finish = toolCalls.length > 0 ? 'tool_calls' : (collected.finishReason ?? 'stop');
    return {
        id,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model ?? 'cursor',
        choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: collected.text ?? '',
                    ...(collected.thinking ? { reasoning_content: collected.thinking } : {}),
                    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
                },
                finish_reason: finish,
            }],
        usage: mapCursorUsage(collected.usage),
        ...(conversationId ? { cursor_conversation_id: conversationId } : {}),
    };
}
export function cursorToOpenaiChunk(delta, { model, id, done = false, finishReason, usage } = {}) {
    return {
        id,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
                index: 0,
                delta: done
                    ? {}
                    : {
                        ...(delta.role ? { role: delta.role } : {}),
                        ...(delta.text != null ? { content: delta.text } : {}),
                        ...(delta.thinking != null ? { reasoning_content: delta.thinking } : {}),
                        ...(delta.tool_calls ? { tool_calls: delta.tool_calls } : {}),
                    },
                finish_reason: done ? (finishReason ?? 'stop') : null,
            }],
        ...(usage ? { usage: mapCursorUsage(usage) } : {}),
    };
}
export function createCursorOpenaiStream({ model, id, conversationId }) {
    const collected = { text: '', thinking: '', toolCalls: [], usage: {} };
    let started = false;
    return {
        collected,
        conversationId,
        push(event) {
            const chunks = [];
            if (!started) {
                started = true;
                chunks.push(cursorToOpenaiChunk({ role: 'assistant', text: '' }, { model, id }));
            }
            if (event?.text) {
                collected.text += event.text;
                chunks.push(cursorToOpenaiChunk({ text: event.text }, { model, id }));
            }
            if (event?.thinking) {
                collected.thinking += event.thinking;
                chunks.push(cursorToOpenaiChunk({ thinking: event.thinking }, { model, id }));
            }
            if (event?.toolCall) {
                const call = {
                    id: event.toolCall.id || `call_${collected.toolCalls.length + 1}`,
                    type: 'function',
                    function: {
                        name: event.toolCall.name || 'tool',
                        arguments: typeof event.toolCall.arguments === 'string'
                            ? event.toolCall.arguments
                            : JSON.stringify(event.toolCall.arguments ?? {}),
                    },
                };
                collected.toolCalls.push(call);
                chunks.push(cursorToOpenaiChunk({
                    tool_calls: [{ index: collected.toolCalls.length - 1, ...call }],
                }, { model, id }));
            }
            if (event?.tokens) {
                collected.usage.completionTokens = (collected.usage.completionTokens ?? 0) + event.tokens;
            }
            if (event?.cachedTokens)
                collected.usage.cachedTokens = event.cachedTokens;
            if (event?.promptTokens)
                collected.usage.promptTokens = event.promptTokens;
            return chunks;
        },
        finish() {
            const finishReason = collected.toolCalls.length > 0 ? 'tool_calls' : 'stop';
            return cursorToOpenaiChunk({}, { model, id, done: true, finishReason, usage: collected.usage });
        },
    };
}
export function consumeCursorFrames(chunk, rest, onMessage) {
    const { frames, rest: leftover } = splitConnectFrames(Buffer.concat([
        rest ?? Buffer.alloc(0),
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk ?? []),
    ]));
    for (const frame of frames) {
        if (frame.end) {
            const text = frame.payload.toString('utf8').trim();
            if (text) {
                try {
                    const parsed = JSON.parse(text);
                    const message = parsed?.error?.message ?? parsed?.message;
                    if (message)
                        onMessage({ kind: 'error', message });
                }
                catch {
                    onMessage({ kind: 'error', message: text.slice(0, 300) });
                }
            }
            continue;
        }
        onMessage(decodeAgentServerMessage(frame.payload));
    }
    return leftover;
}
export function firstConnectFrame(built) {
    return frameConnect(built.requestBytes);
}
