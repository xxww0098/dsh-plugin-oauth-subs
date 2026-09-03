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
export function encodeMcpTools(tools) {
    const defs = (tools ?? []).map((tool) => encodeMessage(1, Buffer.concat([
        encodeString(1, tool.name ?? ''),
        encodeString(2, tool.description ?? ''),
        encodeBytes(3, tool.inputSchema ?? encodeJsonValueBytes({})),
        encodeString(4, tool.providerIdentifier ?? 'dsh'),
        encodeString(5, tool.toolName ?? tool.name ?? ''),
    ])));
    return Buffer.concat(defs);
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
export function encodeKvClientMessage({ id, blobData }) {
    const result = blobData ? encodeBytes(1, blobData) : Buffer.alloc(0);
    return encodeMessage(3, Buffer.concat([
        encodeUint32(1, id),
        encodeMessage(2, result),
    ]));
}
export function encodeExecThrow({ id, error = 'rejected by dsh-plugin-oauth-subs' }) {
    return encodeMessage(5, encodeMessage(2, Buffer.concat([
        encodeUint32(1, id ?? 0),
        encodeString(2, error),
    ])));
}
export function encodeCancelAction() {
    return encodeMessage(4, encodeMessage(3, Buffer.alloc(0)));
}
export function encodeGetUsableModelsRequest(customIds = []) {
    return Buffer.concat(customIds.map((id) => encodeString(1, id)));
}
export function decodeGetUsableModelsResponse(buf) {
    const models = [];
    for (const raw of fieldBytes(decodeFields(buf), 1)) {
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
export function decodeAgentServerMessage(buf) {
    const root = decodeFields(buf);
    const interaction = fieldBytes(root, 1)[0];
    if (interaction) {
        const fields = decodeFields(interaction);
        const text = fieldString(decodeFields(fieldBytes(fields, 1)[0] ?? Buffer.alloc(0)), 1);
        const thinking = fieldString(decodeFields(fieldBytes(fields, 4)[0] ?? Buffer.alloc(0)), 1);
        const tokens = fieldVarint(decodeFields(fieldBytes(fields, 8)[0] ?? Buffer.alloc(0)), 1);
        const toolStarted = fieldBytes(fields, 2)[0];
        const turnEnded = fieldBytes(fields, 14).length > 0;
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
        };
    }
    const exec = fieldBytes(root, 2)[0];
    if (exec) {
        const fields = decodeFields(exec);
        const mcp = fieldBytes(fields, 11)[0];
        const args = decodeFields(mcp ?? Buffer.alloc(0));
        return {
            kind: 'exec',
            id: fieldVarint(fields, 1),
            execId: fieldString(fields, 15),
            mcp: mcp
                ? { name: fieldString(args, 5) ?? fieldString(args, 1), toolCallId: fieldString(args, 3) }
                : undefined,
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
