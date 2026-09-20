/**
 * DSH OpenAI Completions ↔ Cursor AgentService/Run.
 *
 * Native wire is Connect/protobuf over HTTP/2. Completions is the DSH api
 * because that wire is none of the three closed harness protocols.
 */
export declare function cursorModelParameters(payload?: any): any[];
export declare function cursorWireModelId(model: any): string;
export declare function openaiToCursor(payload?: any, { conversationId }?: any): {
    conversationId: any;
    modelId: string;
    pickerModel: any;
    systemPrompt: any;
    pinnedSystem: any;
    extraSystem: string;
    userText: any;
    tools: any[];
    turns: any[];
    requestBytes: Buffer<ArrayBuffer>;
    blobStore: Map<any, any>;
    stream: boolean;
};
export declare function mapCursorUsage({ promptTokens, completionTokens, cachedTokens }?: any): any;
export declare function cursorToOpenai(collected: any, { model, id, conversationId }?: any): {
    cursor_conversation_id?: any;
    id: any;
    object: string;
    created: number;
    model: any;
    choices: {
        index: number;
        message: {
            tool_calls?: any;
            reasoning_content?: any;
            role: string;
            content: any;
        };
        finish_reason: any;
    }[];
    usage: any;
};
export declare function cursorToOpenaiChunk(delta: any, { model, id, done, finishReason, usage }?: any): {
    usage?: any;
    id: any;
    object: string;
    created: number;
    model: any;
    choices: {
        index: number;
        delta: {
            tool_calls?: any;
            reasoning_content?: any;
            content?: any;
            role?: any;
        };
        finish_reason: any;
    }[];
};
export declare function createCursorOpenaiStream({ model, id, conversationId }: {
    model: any;
    id: any;
    conversationId: any;
}): {
    collected: any;
    conversationId: any;
    push(event: any): any[];
    finish(): {
        usage?: any;
        id: any;
        object: string;
        created: number;
        model: any;
        choices: {
            index: number;
            delta: {
                tool_calls?: any;
                reasoning_content?: any;
                content?: any;
                role?: any;
            };
            finish_reason: any;
        }[];
    };
};
export declare function consumeCursorFrames(chunk: any, rest: any, onMessage: any): Buffer<any>;
export declare function firstConnectFrame(built: any): Buffer<ArrayBuffer>;
