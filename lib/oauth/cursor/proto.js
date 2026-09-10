/**
 * Minimal protobuf + Connect-RPC v1 framing for the Cursor AgentService
 * subset this hop actually sends and reads (Run / GetUsableModels / KV).
 * Field numbers come from Rahularya01/pi-cursor proto/agent.proto (MIT).
 * Do not vendor the generated 469KB agent_pb.ts.
 */
const WIRE_VARINT = 0;
const WIRE_LEN = 2;
export const CONNECT_FLAG_NONE = 0;
export const CONNECT_FLAG_END = 0x02;
export function encodeVarint(value) {
    let n = Number(value);
    if (!Number.isFinite(n) || n < 0)
        n = 0;
    n = Math.floor(n);
    const out = [];
    while (n > 0x7f) {
        out.push((n & 0x7f) | 0x80);
        n = Math.floor(n / 128);
    }
    out.push(n & 0x7f);
    return Buffer.from(out);
}
export function encodeKey(field, wire) {
    return encodeVarint((Number(field) << 3) | wire);
}
export function encodeBytes(field, value) {
    const payload = Buffer.isBuffer(value) ? value : Buffer.from(value ?? []);
    return Buffer.concat([encodeKey(field, WIRE_LEN), encodeVarint(payload.length), payload]);
}
export function encodeString(field, value) {
    return encodeBytes(field, Buffer.from(String(value ?? ''), 'utf8'));
}
export function encodeBool(field, value) {
    return Buffer.concat([encodeKey(field, WIRE_VARINT), encodeVarint(value ? 1 : 0)]);
}
export function encodeUint32(field, value) {
    return Buffer.concat([encodeKey(field, WIRE_VARINT), encodeVarint(value)]);
}
export function encodeMessage(field, bytes) {
    return encodeBytes(field, bytes ?? Buffer.alloc(0));
}
export function readVarint(buf, offset = 0) {
    let n = 0;
    let shift = 0;
    let i = offset;
    while (i < buf.length) {
        const b = buf[i++];
        n += (b & 0x7f) * (2 ** shift);
        if ((b & 0x80) === 0)
            return { value: n, offset: i };
        shift += 7;
        if (shift > 63)
            break;
    }
    return { value: n, offset: i };
}
export function decodeFields(buf) {
    const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? []);
    const fields = [];
    let offset = 0;
    while (offset < bytes.length) {
        const tag = readVarint(bytes, offset);
        if (tag.offset === offset)
            break;
        offset = tag.offset;
        const field = tag.value >>> 3;
        const wire = tag.value & 7;
        if (wire === WIRE_VARINT) {
            const next = readVarint(bytes, offset);
            fields.push({ field, wire, varint: next.value });
            offset = next.offset;
        }
        else if (wire === WIRE_LEN) {
            const len = readVarint(bytes, offset);
            const start = len.offset;
            const end = start + len.value;
            fields.push({ field, wire, bytes: bytes.subarray(start, Math.min(end, bytes.length)) });
            offset = Math.min(end, bytes.length);
        }
        else {
            break;
        }
    }
    return fields;
}
export function fieldBytes(fields, number) {
    return fields.filter((row) => row.field === number && row.bytes).map((row) => row.bytes);
}
export function fieldString(fields, number) {
    const row = fields.find((item) => item.field === number && item.bytes);
    return row ? row.bytes.toString('utf8') : undefined;
}
export function fieldVarint(fields, number) {
    const row = fields.find((item) => item.field === number && item.varint !== undefined);
    return row?.varint;
}
function decodeProtoStruct(bytes) {
    const out = {};
    for (const entry of fieldBytes(decodeFields(bytes), 1)) {
        const fields = decodeFields(entry);
        const key = fieldString(fields, 1);
        if (key == null)
            continue;
        out[key] = decodeProtoValue(fieldBytes(fields, 2)[0] ?? Buffer.alloc(0));
    }
    return out;
}
function decodeProtoList(bytes) {
    return fieldBytes(decodeFields(bytes), 1).map((item) => decodeProtoValue(item));
}
/**
 * google.protobuf.Value → JSON. `decodeFields` stops at wire type 1, which
 * is exactly how the number branch is framed, so this walks tags directly.
 * Unknown / empty input yields undefined rather than a fabricated value.
 */
export function decodeProtoValue(buffer) {
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
    let offset = 0;
    while (offset < bytes.length) {
        const tag = readVarint(bytes, offset);
        if (tag.offset === offset)
            break;
        offset = tag.offset;
        const field = tag.value >>> 3;
        const wire = tag.value & 7;
        if (wire === WIRE_VARINT) {
            const next = readVarint(bytes, offset);
            offset = next.offset;
            if (field === 1)
                return null;
            if (field === 4)
                return next.value !== 0;
            continue;
        }
        if (wire === WIRE_LEN) {
            const len = readVarint(bytes, offset);
            const start = len.offset;
            const end = Math.min(start + len.value, bytes.length);
            const payload = bytes.subarray(start, end);
            offset = end;
            if (field === 3)
                return payload.toString('utf8');
            if (field === 5)
                return decodeProtoStruct(payload);
            if (field === 6)
                return decodeProtoList(payload);
            continue;
        }
        if (wire === 1) {
            const payload = bytes.subarray(offset, offset + 8);
            offset += 8;
            if (field === 2 && payload.length === 8)
                return payload.readDoubleLE(0);
            continue;
        }
        if (wire === 5) {
            offset += 4;
            continue;
        }
        break;
    }
    return undefined;
}
/** google.protobuf.Value — enough JSON for MCP schemas / tool args. */
export function encodeProtoValue(value) {
    if (value === null || value === undefined)
        return encodeUint32(1, 0);
    if (typeof value === 'number' && Number.isFinite(value)) {
        const buf = Buffer.alloc(8);
        buf.writeDoubleLE(value, 0);
        return Buffer.concat([encodeKey(2, 1), buf]);
    }
    if (typeof value === 'string')
        return encodeString(3, value);
    if (typeof value === 'boolean')
        return encodeBool(4, value);
    if (Array.isArray(value)) {
        const items = value.map((item) => encodeMessage(1, encodeProtoValue(item)));
        return encodeMessage(6, Buffer.concat(items));
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value).map(([key, inner]) => Buffer.concat([
            encodeString(1, key),
            encodeMessage(2, encodeProtoValue(inner)),
        ]));
        return encodeMessage(5, Buffer.concat(entries.map((entry) => encodeMessage(1, entry))));
    }
    return encodeString(3, String(value));
}
export function encodeJsonValueBytes(value) {
    try {
        return encodeProtoValue(value ?? {});
    }
    catch {
        return Buffer.from(JSON.stringify(value ?? {}), 'utf8');
    }
}
export function frameConnect(payload, end = false) {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? []);
    const frame = Buffer.alloc(5 + body.length);
    frame[0] = end ? CONNECT_FLAG_END : CONNECT_FLAG_NONE;
    frame.writeUInt32BE(body.length, 1);
    body.copy(frame, 5);
    return frame;
}
export function splitConnectFrames(buf) {
    const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? []);
    const frames = [];
    let offset = 0;
    while (offset + 5 <= bytes.length) {
        const flags = bytes[offset];
        const length = bytes.readUInt32BE(offset + 1);
        if (offset + 5 + length > bytes.length)
            break;
        frames.push({
            flags,
            end: (flags & CONNECT_FLAG_END) !== 0,
            payload: bytes.subarray(offset + 5, offset + 5 + length),
        });
        offset += 5 + length;
    }
    return { frames, rest: bytes.subarray(offset) };
}
export function encodeUserMessage({ text, messageId, selectedContextBlob, mode = 1 }) {
    const parts = [encodeString(1, text ?? ''), encodeString(2, messageId ?? '')];
    if (mode != null)
        parts.push(encodeUint32(4, mode));
    if (selectedContextBlob)
        parts.push(encodeBytes(10, selectedContextBlob));
    if (messageId)
        parts.push(encodeString(17, messageId));
    return Buffer.concat(parts);
}
export function encodeRequestedModel({ modelId, maxMode = false, parameters = [] }) {
    const parts = [encodeString(1, modelId ?? '')];
    if (maxMode)
        parts.push(encodeBool(2, true));
    for (const parameter of parameters) {
        parts.push(encodeMessage(3, Buffer.concat([
            encodeString(1, parameter.id ?? ''),
            encodeString(2, parameter.value ?? ''),
        ])));
    }
    return Buffer.concat(parts);
}
export function encodeMcpToolDefinition(tool) {
    return Buffer.concat([
        encodeString(1, tool.name ?? ''),
        encodeString(2, tool.description ?? ''),
        encodeBytes(3, tool.inputSchema ?? encodeJsonValueBytes({})),
        encodeString(4, tool.providerIdentifier ?? 'dsh'),
        encodeString(5, tool.toolName ?? tool.name ?? ''),
    ]);
}
export function encodeMcpTools(tools) {
    return Buffer.concat((tools ?? []).map((tool) => encodeMessage(1, encodeMcpToolDefinition(tool))));
}
/**
 * RequestContext.tools is a repeated McpToolDefinition (field 7); the Run
 * request carries the same definitions under McpTools field 1. Cursor's
 * run handshake aborts with "Failed to get request context" unless the
 * reply is a present RequestContextSuccess.
 */
export function encodeRequestContextResult({ id, execId, tools = [] } = {}) {
    const requestContext = Buffer.concat((tools ?? []).map((tool) => encodeMessage(7, encodeMcpToolDefinition(tool))));
    const result = encodeMessage(1, encodeMessage(1, requestContext));
    return encodeExecClientResult({ id, execId, resultField: 10, resultBytes: result });
}
export function encodeConversationState({ rootPromptBlobs = [], turnBlobs = [], mode = 1, clientName = 'dsh', }) {
    const parts = [];
    for (const blob of rootPromptBlobs)
        parts.push(encodeBytes(1, blob));
    for (const blob of turnBlobs)
        parts.push(encodeBytes(8, blob));
    if (mode != null)
        parts.push(encodeUint32(10, mode));
    if (clientName)
        parts.push(encodeString(22, clientName));
    return Buffer.concat(parts);
}
export function encodeConversationTurn({ userMessageBlob, stepBlobs = [], requestId }) {
    const agent = [
        encodeBytes(1, userMessageBlob),
        ...stepBlobs.map((blob) => encodeBytes(2, blob)),
    ];
    if (requestId)
        agent.push(encodeString(3, requestId));
    return encodeMessage(1, Buffer.concat(agent));
}
export function encodeAssistantStep(text) {
    return encodeMessage(1, encodeString(1, text ?? ''));
}
export function encodeThinkingStep(text) {
    return encodeMessage(3, encodeString(1, text ?? ''));
}
export function encodeMcpToolStep({ toolName, toolCallId, args, result }) {
    const argEntries = Object.entries(args ?? {}).map(([key, value]) => encodeMessage(2, Buffer.concat([
        encodeString(1, key),
        encodeBytes(2, encodeJsonValueBytes(value)),
    ])));
    const mcpArgs = Buffer.concat([
        encodeString(1, toolName ?? 'tool'),
        ...argEntries,
        encodeString(3, toolCallId ?? ''),
        encodeString(4, 'dsh'),
        encodeString(5, toolName ?? 'tool'),
    ]);
    const mcp = [encodeMessage(1, mcpArgs)];
    if (result) {
        const textItem = encodeMessage(1, encodeMessage(1, encodeString(1, result.content ?? '')));
        const success = Buffer.concat([
            encodeMessage(1, textItem),
            encodeBool(2, result.isError === true),
        ]);
        const toolResult = result.isError
            ? encodeMessage(2, encodeString(1, result.content ?? 'error'))
            : encodeMessage(1, success);
        mcp.push(encodeMessage(2, toolResult));
    }
    return encodeMessage(2, encodeMessage(15, Buffer.concat(mcp)));
}
export function encodeAgentRunRequest({ conversationState, userMessage, requestedModel, conversationId, mcpTools, }) {
    const action = encodeMessage(1, encodeMessage(1, userMessage));
    const parts = [
        encodeMessage(1, conversationState),
        encodeMessage(2, action),
    ];
    if (mcpTools?.length)
        parts.push(encodeMessage(4, encodeMcpTools(mcpTools)));
    if (conversationId)
        parts.push(encodeString(5, conversationId));
    if (requestedModel)
        parts.push(encodeMessage(9, requestedModel));
    return Buffer.concat(parts);
}
export function encodeAgentClientMessage(runRequest) {
    return encodeMessage(1, runRequest);
}
export function encodeKvClientMessage({ id, blobData, set = false } = {}) {
    const body = set
        ? Buffer.concat([encodeUint32(1, id ?? 0), encodeMessage(3, Buffer.alloc(0))])
        : Buffer.concat([encodeUint32(1, id ?? 0), encodeMessage(2, blobData ? encodeBytes(1, blobData) : Buffer.alloc(0))]);
    return encodeMessage(3, body);
}
export function encodeExecThrow({ id, error = 'rejected by dsh-plugin-oauth-subs' }) {
    return encodeMessage(5, encodeMessage(2, Buffer.concat([
        encodeUint32(1, id ?? 0),
        encodeString(2, error),
    ])));
}
/** AgentClientMessage.exec_client_message (field 2) with a oneof result. */
export function encodeExecClientResult({ id, execId, resultField, resultBytes }) {
    const parts = [encodeUint32(1, id ?? 0)];
    if (execId)
        parts.push(encodeString(15, execId));
    parts.push(encodeMessage(resultField, resultBytes ?? Buffer.alloc(0)));
    return encodeMessage(2, Buffer.concat(parts));
}
export const CURSOR_NATIVE_TOOL_REJECTION = 'Tool not available in this environment. Use the MCP tools provided instead.';
function rejectedShell(execArgs) {
    return Buffer.concat([
        encodeString(1, execArgs?.command ?? ''),
        encodeString(2, execArgs?.workingDirectory ?? ''),
        encodeString(3, CURSOR_NATIVE_TOOL_REJECTION),
        encodeBool(4, false),
    ]);
}
function rejectedPath(execArgs) {
    return Buffer.concat([
        encodeString(1, execArgs?.path ?? ''),
        encodeString(2, CURSOR_NATIVE_TOOL_REJECTION),
    ]);
}
/**
 * Native Cursor tools (shell / read / write / ...) must be answered with a
 * typed result so the model falls back to the MCP tools DSH advertised.
 * Throwing an ExecClientControlMessage aborts the whole run instead.
 * Returns undefined for requestContextArgs / mcpArgs / unknown cases.
 */
export function encodeNativeExecRejection(execMsg = {}) {
    const { id, execId, execCase, execArgs } = execMsg;
    const common = { id, execId };
    switch (execCase) {
        case 'shellArgs':
            return encodeExecClientResult({ ...common, resultField: 2, resultBytes: encodeMessage(4, rejectedShell(execArgs)) });
        case 'shellStreamArgs':
            return encodeExecClientResult({ ...common, resultField: 14, resultBytes: encodeMessage(5, rejectedShell(execArgs)) });
        case 'backgroundShellSpawnArgs':
            return encodeExecClientResult({ ...common, resultField: 16, resultBytes: encodeMessage(3, rejectedShell(execArgs)) });
        case 'readArgs':
            return encodeExecClientResult({ ...common, resultField: 7, resultBytes: encodeMessage(3, rejectedPath(execArgs)) });
        case 'lsArgs':
            return encodeExecClientResult({ ...common, resultField: 8, resultBytes: encodeMessage(3, rejectedPath(execArgs)) });
        case 'writeArgs':
            return encodeExecClientResult({ ...common, resultField: 3, resultBytes: encodeMessage(6, rejectedPath(execArgs)) });
        case 'deleteArgs':
            return encodeExecClientResult({ ...common, resultField: 4, resultBytes: encodeMessage(6, rejectedPath(execArgs)) });
        case 'grepArgs':
            return encodeExecClientResult({ ...common, resultField: 5, resultBytes: encodeMessage(2, encodeString(1, CURSOR_NATIVE_TOOL_REJECTION)) });
        case 'fetchArgs':
            return encodeExecClientResult({
                ...common,
                resultField: 20,
                resultBytes: encodeMessage(2, Buffer.concat([
                    encodeString(1, execArgs?.url ?? ''),
                    encodeString(2, CURSOR_NATIVE_TOOL_REJECTION),
                ])),
            });
        case 'diagnosticsArgs':
            return encodeExecClientResult({ ...common, resultField: 9, resultBytes: Buffer.alloc(0) });
        case 'listMcpResourcesExecArgs':
            return encodeExecClientResult({ ...common, resultField: 17, resultBytes: encodeMessage(3, encodeString(1, CURSOR_NATIVE_TOOL_REJECTION)) });
        case 'readMcpResourceExecArgs':
            return encodeExecClientResult({
                ...common,
                resultField: 18,
                resultBytes: encodeMessage(3, Buffer.concat([
                    encodeString(1, execArgs?.uri ?? ''),
                    encodeString(2, CURSOR_NATIVE_TOOL_REJECTION),
                ])),
            });
        case 'writeShellStdinArgs':
            return encodeExecClientResult({ ...common, resultField: 23, resultBytes: encodeMessage(2, encodeString(1, CURSOR_NATIVE_TOOL_REJECTION)) });
        case 'recordScreenArgs':
            return encodeExecClientResult({ ...common, resultField: 21, resultBytes: encodeMessage(4, encodeString(1, CURSOR_NATIVE_TOOL_REJECTION)) });
        case 'computerUseArgs':
            return encodeExecClientResult({
                ...common,
                resultField: 22,
                resultBytes: encodeMessage(2, Buffer.concat([
                    encodeString(1, CURSOR_NATIVE_TOOL_REJECTION),
                    encodeUint32(2, execArgs?.actionCount ?? 0),
                    encodeUint32(3, 0),
                ])),
            });
        default:
            return undefined;
    }
}
export function encodeCancelAction() {
    return encodeMessage(4, encodeMessage(3, Buffer.alloc(0)));
}
/**
 * agent.v1.TurnEndedUpdate (@cursor/sdk 1.0.27):
 * 1 input_tokens, 2 output_tokens, 3 cache_read_tokens,
 * 4 cache_write_tokens, 5 reasoning_tokens — all optional int64.
 */
export function encodeTurnEndedUpdate({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, } = {}) {
    const parts = [];
    if (inputTokens != null)
        parts.push(encodeUint32(1, inputTokens));
    if (outputTokens != null)
        parts.push(encodeUint32(2, outputTokens));
    if (cacheReadTokens != null)
        parts.push(encodeUint32(3, cacheReadTokens));
    if (cacheWriteTokens != null)
        parts.push(encodeUint32(4, cacheWriteTokens));
    if (reasoningTokens != null)
        parts.push(encodeUint32(5, reasoningTokens));
    return Buffer.concat(parts);
}
export function decodeTurnEndedUpdate(buf) {
    const fields = decodeFields(buf);
    const usage = {
        promptTokens: fieldVarint(fields, 1),
        completionTokens: fieldVarint(fields, 2),
        cachedTokens: fieldVarint(fields, 3),
        cacheWriteTokens: fieldVarint(fields, 4),
        reasoningTokens: fieldVarint(fields, 5),
    };
    const empty = Object.values(usage).every((value) => value === undefined);
    return empty ? undefined : usage;
}
export function encodeGetUsableModelsRequest(customIds = []) {
    return Buffer.concat(customIds.map((id) => encodeString(1, id)));
}
/** Connect unary envelope, or the raw proto if the peer skipped framing. */
export function unwrapConnectUnary(buf) {
    const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf ?? []);
    if (bytes.length < 5)
        return bytes;
    const { frames } = splitConnectFrames(bytes);
    const payload = frames.find((frame) => !frame.end && frame.payload.length)?.payload
        ?? frames.find((frame) => frame.payload.length)?.payload;
    return payload && payload.length ? payload : bytes;
}
export function encodeGetUsableModelsResponse(models = []) {
    return Buffer.concat((models ?? []).map((model) => encodeMessage(1, Buffer.concat([
        encodeString(1, model.id ?? model.modelId ?? ''),
        model.displayId ? encodeString(3, model.displayId) : Buffer.alloc(0),
        encodeString(4, model.name ?? model.displayName ?? model.id ?? ''),
        model.maxMode ? encodeBool(7, true) : Buffer.alloc(0),
    ]))));
}
export function decodeGetUsableModelsResponse(buf) {
    const body = unwrapConnectUnary(buf);
    const models = [];
    for (const raw of fieldBytes(decodeFields(body), 1)) {
        const fields = decodeFields(raw);
        const id = fieldString(fields, 1);
        if (id) {
            models.push({
                id,
                displayId: fieldString(fields, 3) ?? id,
                name: fieldString(fields, 4) ?? fieldString(fields, 5) ?? id,
                maxMode: fieldVarint(fields, 7) === 1,
            });
        }
    }
    return models;
}
/** aiserver.v1.AvailableModelsRequest { use_model_parameters = 5; do_not_use_markdown = 7 } */
export function encodeAvailableModelsRequest() {
    return Buffer.concat([encodeBool(5, true), encodeBool(7, true)]);
}
export function encodeAvailableModelsResponse(models = []) {
    return Buffer.concat((models ?? []).map((model) => encodeMessage(2, Buffer.concat([
        encodeString(1, model.name ?? ''),
        model.supportsImages ? encodeBool(10, true) : Buffer.alloc(0),
        model.contextTokenLimit ? encodeUint32(15, model.contextTokenLimit) : Buffer.alloc(0),
        model.clientDisplayName ? encodeString(17, model.clientDisplayName) : Buffer.alloc(0),
    ]))));
}
function decodeAvailableVariant(buf) {
    const fields = decodeFields(buf);
    return {
        displayName: fieldString(fields, 2),
        isMaxMode: fieldVarint(fields, 3) === 1,
        parameters: fieldBytes(fields, 1).map((raw) => {
            const inner = decodeFields(raw);
            return { id: fieldString(inner, 1), value: fieldString(inner, 2) };
        }),
    };
}
function decodeAvailableModel(buf) {
    const fields = decodeFields(buf);
    return {
        name: fieldString(fields, 1) ?? '',
        supportsImages: fieldVarint(fields, 10) === 1,
        supportsMaxMode: fieldVarint(fields, 14) === 1,
        contextTokenLimit: fieldVarint(fields, 15),
        contextTokenLimitForMaxMode: fieldVarint(fields, 16),
        clientDisplayName: fieldString(fields, 17),
        serverModelName: fieldString(fields, 18),
        supportsNonMaxMode: fieldVarint(fields, 19) === 1,
        variants: fieldBytes(fields, 30).map(decodeAvailableVariant),
    };
}
export function decodeAvailableModelsResponse(buf) {
    const body = unwrapConnectUnary(buf);
    return fieldBytes(decodeFields(body), 2)
        .map(decodeAvailableModel)
        .filter((model) => model.name);
}
export function decodeAgentClientMessage(buf) {
    const root = decodeFields(buf);
    const runRaw = fieldBytes(root, 1)[0];
    if (!runRaw)
        return { conversationId: undefined, modelId: undefined, userText: undefined, tools: [] };
    const run = decodeFields(runRaw);
    const action = decodeFields(fieldBytes(run, 2)[0] ?? Buffer.alloc(0));
    const userAction = decodeFields(fieldBytes(action, 1)[0] ?? Buffer.alloc(0));
    const user = decodeFields(fieldBytes(userAction, 1)[0] ?? Buffer.alloc(0));
    const model = decodeFields(fieldBytes(run, 9)[0] ?? Buffer.alloc(0));
    const toolsMsg = decodeFields(fieldBytes(run, 4)[0] ?? Buffer.alloc(0));
    const tools = fieldBytes(toolsMsg, 1).map((raw) => {
        const fields = decodeFields(raw);
        return {
            name: fieldString(fields, 1),
            description: fieldString(fields, 2),
            toolName: fieldString(fields, 5),
        };
    });
    return {
        conversationId: fieldString(run, 5),
        modelId: fieldString(model, 1),
        maxMode: fieldVarint(model, 2) === 1,
        userText: fieldString(user, 1),
        tools,
        hasConversationState: fieldBytes(run, 1).length > 0,
        parameters: fieldBytes(model, 3).map((raw) => {
            const fields = decodeFields(raw);
            return { id: fieldString(fields, 1), value: fieldString(fields, 2) };
        }),
    };
}
const EXEC_SERVER_CASES = Object.freeze([
    [2, 'shellArgs'],
    [3, 'writeArgs'],
    [4, 'deleteArgs'],
    [5, 'grepArgs'],
    [7, 'readArgs'],
    [8, 'lsArgs'],
    [9, 'diagnosticsArgs'],
    [10, 'requestContextArgs'],
    [11, 'mcpArgs'],
    [14, 'shellStreamArgs'],
    [16, 'backgroundShellSpawnArgs'],
    [17, 'listMcpResourcesExecArgs'],
    [18, 'readMcpResourceExecArgs'],
    [20, 'fetchArgs'],
    [21, 'recordScreenArgs'],
    [22, 'computerUseArgs'],
    [23, 'writeShellStdinArgs'],
]);
function decodeMcpArgs(mcp) {
    const fields = decodeFields(mcp);
    const args = {};
    for (const entry of fieldBytes(fields, 2)) {
        const pair = decodeFields(entry);
        const key = fieldString(pair, 1);
        if (key == null)
            continue;
        args[key] = decodeProtoValue(fieldBytes(pair, 2)[0] ?? Buffer.alloc(0));
    }
    const name = fieldString(fields, 5) ?? fieldString(fields, 1);
    return {
        name,
        toolName: name,
        toolCallId: fieldString(fields, 3),
        providerIdentifier: fieldString(fields, 4),
        arguments: args,
    };
}
function decodeExecArgs(execCase, fields) {
    const field = EXEC_SERVER_CASES.find(([number, name]) => name === execCase)?.[0];
    const inner = decodeFields(field ? (fieldBytes(fields, field)[0] ?? Buffer.alloc(0)) : Buffer.alloc(0));
    return {
        path: fieldString(inner, 1),
        command: fieldString(inner, 1),
        workingDirectory: fieldString(inner, 2),
        url: fieldString(inner, 1),
        uri: fieldString(inner, 1),
        actionCount: fieldBytes(inner, 2).length,
    };
}
export function decodeAgentServerMessage(buf) {
    const root = decodeFields(buf);
    const interaction = fieldBytes(root, 1)[0];
    if (interaction) {
        const fields = decodeFields(interaction);
        const text = fieldString(decodeFields(fieldBytes(fields, 1)[0] ?? Buffer.alloc(0)), 1);
        const thinking = fieldString(decodeFields(fieldBytes(fields, 4)[0] ?? Buffer.alloc(0)), 1);
        const tokens = fieldVarint(decodeFields(fieldBytes(fields, 8)[0] ?? Buffer.alloc(0)), 1);
        const toolStarted = fieldBytes(fields, 2)[0];
        const turnEndedRaw = fieldBytes(fields, 14)[0];
        const turnEnded = Boolean(turnEndedRaw);
        const usage = turnEndedRaw ? decodeTurnEndedUpdate(turnEndedRaw) : undefined;
        let toolCall;
        if (toolStarted) {
            const started = decodeFields(toolStarted);
            const callId = fieldString(started, 1) ?? fieldString(started, 3);
            const tool = decodeFields(fieldBytes(started, 2)[0] ?? Buffer.alloc(0));
            const mcp = decodeFields(fieldBytes(tool, 15)[0] ?? Buffer.alloc(0));
            const args = decodeFields(fieldBytes(mcp, 1)[0] ?? Buffer.alloc(0));
            toolCall = {
                id: callId ?? fieldString(args, 3),
                name: fieldString(args, 5) ?? fieldString(args, 1) ?? 'tool',
            };
        }
        return {
            kind: 'interaction',
            text,
            thinking,
            tokens,
            toolCall,
            turnEnded,
            ...(usage ? { usage } : {}),
        };
    }
    const exec = fieldBytes(root, 2)[0];
    if (exec) {
        const fields = decodeFields(exec);
        const execCase = EXEC_SERVER_CASES.find(([field]) => fieldBytes(fields, field).length > 0)?.[1];
        const mcp = fieldBytes(fields, 11)[0];
        return {
            kind: 'exec',
            id: fieldVarint(fields, 1),
            execId: fieldString(fields, 15),
            execCase,
            execArgs: decodeExecArgs(execCase, fields),
            mcp: mcp ? decodeMcpArgs(mcp) : undefined,
        };
    }
    const kv = fieldBytes(root, 4)[0];
    if (kv) {
        const fields = decodeFields(kv);
        const getArgs = decodeFields(fieldBytes(fields, 2)[0] ?? Buffer.alloc(0));
        const setArgs = decodeFields(fieldBytes(fields, 3)[0] ?? Buffer.alloc(0));
        return {
            kind: 'kv',
            id: fieldVarint(fields, 1),
            blobId: fieldBytes(getArgs, 1)[0] ?? fieldBytes(setArgs, 1)[0],
            blobData: fieldBytes(setArgs, 2)[0],
            set: fieldBytes(fields, 3).length > 0,
        };
    }
    const query = fieldBytes(root, 7)[0];
    if (query) {
        return { kind: 'query', id: fieldVarint(decodeFields(query), 1) };
    }
    return { kind: 'other' };
}
