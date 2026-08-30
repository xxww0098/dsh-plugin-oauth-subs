/**
 * OpenAI chat/completions ↔ daily-cloudcode-pa generateContent (hub).
 * Body always includes project + model + userAgent: "antigravity".
 */
/**
 * Gemini `FunctionResponse.response` / `FunctionCall.args` are protobuf Structs.
 * A JSON array (or scalar) on that field is 400 INVALID_ARGUMENT:
 * "Proto field is not repeating, cannot start list."
 */
export declare function asGeminiStruct(value: any): any;
export declare function partsFromContent(content: any): any[];
export declare function openaiToAntigravity(payload: any, { projectId, sessionId }?: {}): {
    model: string;
    project: string;
    userAgent: string;
    requestType: string;
    requestId: string;
    request: {
        contents: any[];
        sessionId: string;
    };
};
export declare function collectAntigravityParts(body: any): {
    text: string;
    toolCalls: any[];
    finishReason: string;
    usage: any;
};
export declare function antigravityToOpenai(body: any, { model, id }?: {
    id?: string;
}): {
    id: string;
    object: string;
    model: any;
    choices: {
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens: any;
        completion_tokens: any;
        total_tokens: any;
    };
};
export declare function antigravityToOpenaiChunk(body: any, { model, id, done }?: {
    done?: boolean;
}): {
    id: any;
    object: string;
    model: any;
    choices: {
        index: number;
        delta: {};
        finish_reason: string;
    }[];
};
export declare function parseAntigravitySseBlocks(buffer: any): {
    events: any[];
    rest: string;
};
