/**
 * OpenAI chat/completions ↔ daily-cloudcode-pa generateContent (hub).
 * Body always includes project + model + userAgent: "antigravity".
 */
/**
 * Gemini `FunctionResponse.response` is a singular protobuf Struct.
 * Arrays / null / number / bool must be wrapped or cloudcode-pa returns 400:
 * "Unknown name \"response\" … Proto field is not repeating, cannot start list."
 */
export declare function functionResponsePayload(value: any): any;
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
