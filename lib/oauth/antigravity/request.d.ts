/**
 * OpenAI chat/completions ↔ daily-cloudcode-pa generateContent (hub).
 * Body always includes project + model + userAgent: "antigravity".
 */
/** When DSH sends neither session_id nor prompt_cache_key, still pin a constant. */
export declare const ANTIGRAVITY_STABLE_SESSION = "dsh-antigravity";
export declare function resetAntigravitySystemPins(): void;
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
    rawFinish: any;
    usage: any;
};
/** OpenAI chat.completion usage. Thoughts count as completion tokens (and tok/s). */
export declare function mapAntigravityUsage(usage: any): {
    prompt_tokens: any;
    completion_tokens: any;
    total_tokens: any;
};
/** Google SSE is cumulative; OpenAI deltas are suffixes. A shorter later frame is a reset. */
export declare function incrementalSuffix(next: any, previous: any): string;
/**
 * Per-stream mapper: cumulative Google frames → incremental OpenAI chunks.
 * Thought parts stay out of `delta.content`; their tokens still land in usage.
 */
export declare function createAntigravityOpenaiStream({ model, id }?: {
    id?: string;
}): {
    push(body: any): {
        id: any;
        object: string;
        model: any;
        choices: {
            index: number;
            delta: any;
            finish_reason: any;
        }[];
    };
    finish(): {
        id: any;
        object: string;
        model: any;
        choices: {
            index: number;
            delta: any;
            finish_reason: any;
        }[];
    };
};
export declare function antigravityEventsToOpenaiChunks(events: any, opts: any): any[];
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
    usage?: {
        prompt_tokens: any;
        completion_tokens: any;
        total_tokens: any;
    };
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
