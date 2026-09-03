/**
 * DSH OpenAI Completions ↔ Cursor AgentService/Run.
 *
 * Native wire is Connect/protobuf over HTTP/2. Completions is the DSH api
 * because that wire is none of the three closed harness protocols.
 */
export declare function cursorModelParameters(payload?: {}): any[];
export declare function cursorWireModelId(model: any): string;
export declare function openaiToCursor(payload?: {}, { conversationId }?: {}): {
    conversationId: any;
    modelId: string;
    pickerModel: any;
    systemPrompt: any;
    pinnedSystem: any;
    extraSystem: string;
    userText: any;
    tools: {
        name: any;
        description: any;
    }[];
    turns: any[];
    requestBytes: Buffer<ArrayBuffer>;
    blobStore: Map<any, any>;
    stream: boolean;
};
export declare function mapCursorUsage({ promptTokens, completionTokens, cachedTokens }?: {}): {
    prompt_tokens: any;
    completion_tokens: any;
    total_tokens: any;
};
export declare function cursorToOpenai(collected: any, { model, id, conversationId }?: {
    id?: string;
}): {
    cursor_conversation_id?: any;
    id: string;
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
    usage: {
        prompt_tokens: any;
        completion_tokens: any;
        total_tokens: any;
    };
};
export declare function cursorToOpenaiChunk(delta: any, { model, id, done, finishReason, usage }?: {
    done?: boolean;
}): {
    usage?: {
        prompt_tokens: any;
        completion_tokens: any;
        total_tokens: any;
    };
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
    collected: {
        text: string;
        thinking: string;
        toolCalls: any[];
        usage: {};
    };
    conversationId: any;
    push(event: any): any[];
    finish(): {
        usage?: {
            prompt_tokens: any;
            completion_tokens: any;
            total_tokens: any;
        };
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
