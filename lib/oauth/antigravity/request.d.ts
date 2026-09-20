/**
 * OpenAI chat/completions ↔ daily-cloudcode-pa generateContent (hub).
 * Body always includes project + model + userAgent: "antigravity".
 */
export { ANTIGRAVITY_STABLE_SESSION, resetAntigravitySystemPins, } from './cache.js';
export declare function resetAntigravityThoughtSignatures(): void;
/** Cloud Code / Gemini REST: part-level thoughtSignature (also accept snake / nested). */
export declare function thoughtSignatureOf(...sources: any[]): any;
/** Gemini 3 / gemini-pro-agent need thoughtSignature on functionCall groups. */
export declare function geminiRequiresThoughtSignature(model: any): boolean;
/** Claude / GPT-OSS custom-tool bridge: [A-Za-z0-9_-], cap 64. */
export declare function sanitizeAntigravityToolCallId(id: any, fallbackName: any): string;
export declare function antigravityMaxOutputTokens(model: any): any;
/**
 * Gemini `FunctionResponse.response` is a singular protobuf Struct.
 * Arrays / null / number / bool must be wrapped or cloudcode-pa returns 400:
 * "Unknown name \"response\" … Proto field is not repeating, cannot start list."
 */
export declare function functionResponsePayload(value: any): Record<string, any>;
export declare function partsFromContent(content: any): any[];
/** Claude / GPT-OSS omit thinkingConfig. Budget-wire ids omit or use thinkingBudget. Never rewrite picker ids. */
export declare function antigravityThinkingConfig(model: any, effort: any): {
    includeThoughts: boolean;
    thinkingBudget: number;
    thinkingLevel?: undefined;
} | {
    thinkingLevel: string;
    includeThoughts?: undefined;
    thinkingBudget?: undefined;
} | undefined;
export declare function openaiToAntigravity(payload: any, { projectId, sessionId }?: any): {
    model: string;
    project: string;
    userAgent: string;
    requestType: string;
    requestId: string;
    request: any;
};
export declare function collectAntigravityParts(body: any, { sessionId }?: any): {
    text: string;
    toolCalls: any[];
    finishReason: string;
    rawFinish: any;
    usage: any;
};
/** Gemini usage plus CLI stats aliases (cache_read_tokens / cacheReadTokens). */
export declare function cachedTokensOf(usage: any): number | undefined;
/** OpenAI chat.completion usage. Thoughts count as completion tokens (and tok/s). */
export declare function mapAntigravityUsage(usage: any): {
    prompt_tokens_details?: {
        cached_tokens: number;
    } | undefined;
    completion_tokens_details?: {
        reasoning_tokens: any;
    } | undefined;
    prompt_tokens: any;
    completion_tokens: any;
    total_tokens: any;
} | undefined;
/** Google SSE is cumulative; OpenAI deltas are suffixes. A shorter later frame is a reset. */
export declare function incrementalSuffix(next: any, previous: any): string;
/**
 * Per-stream mapper: cumulative Google frames → incremental OpenAI chunks.
 * Thought parts stay out of `delta.content`; their tokens still land in usage.
 */
export declare function createAntigravityOpenaiStream({ model, id, sessionId }?: any): {
    push(body: any): any;
    finish(): any;
};
export declare function antigravityEventsToOpenaiChunks(events: any, opts: any): any[];
export declare function antigravityToOpenai(body: any, { model, id, sessionId }?: any): {
    id: any;
    object: string;
    model: any;
    choices: {
        index: number;
        message: any;
        finish_reason: string;
    }[];
    usage: {
        prompt_tokens_details?: {
            cached_tokens: number;
        } | undefined;
        completion_tokens_details?: {
            reasoning_tokens: any;
        } | undefined;
        prompt_tokens: any;
        completion_tokens: any;
        total_tokens: any;
    } | undefined;
};
export declare function antigravityToOpenaiChunk(body: any, { model, id, done, sessionId }?: any): {
    usage?: {
        prompt_tokens_details?: {
            cached_tokens: number;
        } | undefined;
        completion_tokens_details?: {
            reasoning_tokens: any;
        } | undefined;
        prompt_tokens: any;
        completion_tokens: any;
        total_tokens: any;
    } | undefined;
    id: any;
    object: string;
    model: any;
    choices: {
        index: number;
        delta: any;
        finish_reason: string | null;
    }[];
};
export declare function parseAntigravitySseBlocks(buffer: any): {
    events: any[];
    rest: string;
};
