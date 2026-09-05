/**
 * Minimal protobuf + Connect-RPC v1 framing for the Cursor AgentService
 * subset this hop actually sends and reads (Run / GetUsableModels / KV).
 * Field numbers come from Rahularya01/pi-cursor proto/agent.proto (MIT).
 * Do not vendor the generated 469KB agent_pb.ts.
 */
export declare const CONNECT_FLAG_NONE = 0;
export declare const CONNECT_FLAG_END = 2;
export declare function encodeVarint(value: any): Buffer<ArrayBuffer>;
export declare function encodeKey(field: any, wire: any): Buffer<ArrayBuffer>;
export declare function encodeBytes(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeString(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeBool(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeUint32(field: any, value: any): Buffer<ArrayBuffer>;
export declare function encodeMessage(field: any, bytes: any): Buffer<ArrayBuffer>;
export declare function readVarint(buf: any, offset?: number): {
    value: number;
    offset: number;
};
export declare function decodeFields(buf: any): any[];
export declare function fieldBytes(fields: any, number: any): any;
export declare function fieldString(fields: any, number: any): any;
export declare function fieldVarint(fields: any, number: any): any;
/** google.protobuf.Value — enough JSON for MCP schemas / tool args. */
export declare function encodeProtoValue(value: any): any;
export declare function encodeJsonValueBytes(value: any): any;
export declare function frameConnect(payload: any, end?: boolean): Buffer<ArrayBuffer>;
export declare function splitConnectFrames(buf: any): {
    frames: any[];
    rest: Buffer<any>;
};
export declare function encodeUserMessage({ text, messageId, selectedContextBlob, mode }: {
    text: any;
    messageId: any;
    selectedContextBlob: any;
    mode?: number;
}): Buffer<ArrayBuffer>;
export declare function encodeRequestedModel({ modelId, maxMode, parameters }: {
    modelId: any;
    maxMode?: boolean;
    parameters?: any[];
}): Buffer<ArrayBuffer>;
export declare function encodeMcpTools(tools: any): Buffer<ArrayBuffer>;
export declare function encodeConversationState({ rootPromptBlobs, turnBlobs, mode, clientName, }: {
    rootPromptBlobs?: any[];
    turnBlobs?: any[];
    mode?: number;
    clientName?: string;
}): Buffer<ArrayBuffer>;
export declare function encodeConversationTurn({ userMessageBlob, stepBlobs, requestId }: {
    userMessageBlob: any;
    stepBlobs?: any[];
    requestId: any;
}): Buffer<ArrayBuffer>;
export declare function encodeAssistantStep(text: any): Buffer<ArrayBuffer>;
export declare function encodeThinkingStep(text: any): Buffer<ArrayBuffer>;
export declare function encodeMcpToolStep({ toolName, toolCallId, args, result }: {
    toolName: any;
    toolCallId: any;
    args: any;
    result: any;
}): Buffer<ArrayBuffer>;
export declare function encodeAgentRunRequest({ conversationState, userMessage, requestedModel, conversationId, mcpTools, }: {
    conversationState: any;
    userMessage: any;
    requestedModel: any;
    conversationId: any;
    mcpTools: any;
}): Buffer<ArrayBuffer>;
export declare function encodeAgentClientMessage(runRequest: any): Buffer<ArrayBuffer>;
export declare function encodeKvClientMessage({ id, blobData }: {
    id: any;
    blobData: any;
}): Buffer<ArrayBuffer>;
export declare function encodeExecThrow({ id, error }: {
    id: any;
    error?: string;
}): Buffer<ArrayBuffer>;
export declare function encodeCancelAction(): Buffer<ArrayBuffer>;
/**
 * agent.v1.TurnEndedUpdate (@cursor/sdk 1.0.27):
 * 1 input_tokens, 2 output_tokens, 3 cache_read_tokens,
 * 4 cache_write_tokens, 5 reasoning_tokens — all optional int64.
 */
export declare function encodeTurnEndedUpdate({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, }?: {}): Buffer<ArrayBuffer>;
export declare function decodeTurnEndedUpdate(buf: any): {
    promptTokens: any;
    completionTokens: any;
    cachedTokens: any;
    cacheWriteTokens: any;
    reasoningTokens: any;
};
export declare function encodeGetUsableModelsRequest(customIds?: any[]): Buffer<ArrayBuffer>;
/** Connect unary envelope, or the raw proto if the peer skipped framing. */
export declare function unwrapConnectUnary(buf: any): any;
export declare function encodeGetUsableModelsResponse(models?: any[]): Buffer<ArrayBuffer>;
export declare function decodeGetUsableModelsResponse(buf: any): any[];
/** aiserver.v1.AvailableModelsRequest { use_model_parameters = 5; do_not_use_markdown = 7 } */
export declare function encodeAvailableModelsRequest(): Buffer<ArrayBuffer>;
export declare function encodeAvailableModelsResponse(models?: any[]): Buffer<ArrayBuffer>;
export declare function decodeAvailableModelsResponse(buf: any): any;
export declare function decodeAgentClientMessage(buf: any): {
    conversationId: any;
    modelId: any;
    userText: any;
    tools: any[];
    maxMode?: undefined;
    hasConversationState?: undefined;
    parameters?: undefined;
} | {
    conversationId: any;
    modelId: any;
    maxMode: boolean;
    userText: any;
    tools: any;
    hasConversationState: boolean;
    parameters: any;
};
export declare function decodeAgentServerMessage(buf: any): {
    usage?: {
        promptTokens: any;
        completionTokens: any;
        cachedTokens: any;
        cacheWriteTokens: any;
        reasoningTokens: any;
    };
    kind: string;
    text: any;
    thinking: any;
    tokens: any;
    toolCall: any;
    turnEnded: boolean;
    id?: undefined;
    execId?: undefined;
    mcp?: undefined;
    blobId?: undefined;
    blobData?: undefined;
    set?: undefined;
} | {
    kind: string;
    id: any;
    execId: any;
    mcp: {
        name: any;
        toolCallId: any;
    };
    blobId?: undefined;
    blobData?: undefined;
    set?: undefined;
} | {
    kind: string;
    id: any;
    blobId: any;
    blobData: any;
    set: boolean;
    execId?: undefined;
    mcp?: undefined;
} | {
    kind: string;
    id: any;
    execId?: undefined;
    mcp?: undefined;
    blobId?: undefined;
    blobData?: undefined;
    set?: undefined;
} | {
    kind: string;
    id?: undefined;
    execId?: undefined;
    mcp?: undefined;
    blobId?: undefined;
    blobData?: undefined;
    set?: undefined;
};
