/**
 * OpenAI chat/completions ↔ AWS CodeWhisperer GenerateAssistantResponse.
 *
 * Wire shape matches Kiro IDE / kiro-proxy PROTOCOL.md:
 *   POST https://q.<region>.amazonaws.com/
 *   X-Amz-Target: AmazonCodeWhispererStreamingService.GenerateAssistantResponse
 *   Content-Type: application/x-amz-json-1.0
 *   Body: conversationState + profileArn
 * Response is application/vnd.amazon.eventstream.
 */
export { KIRO_STABLE_SESSION, kiroConversationId, pinKiroSystemPrefix, resetKiroSystemPins } from './cache.js';
/** Official kiro.rs ack after a parked system user turn. Byte-stable; never Date.now(). */
export declare const KIRO_SYSTEM_ACK = "I will follow these instructions.";
export declare const KIRO_CHAT_ORIGIN = "AI_EDITOR";
export declare const KIRO_AMZ_TARGET = "AmazonCodeWhispererStreamingService.GenerateAssistantResponse";
export declare const KIRO_EVENTSTREAM_TYPE = "application/vnd.amazon.eventstream";
export declare const KIRO_AMZ_JSON_TYPE = "application/x-amz-json-1.0";
/** Kiro accepts 1–64 of `[A-Za-z0-9_.:-]`. Piped OpenAI Responses ids 400. */
export declare const KIRO_TOOL_USE_ID_PATTERN: RegExp;
export declare const KIRO_REASON_CODES: Readonly<{
    CONTENT_LENGTH_EXCEEDS_THRESHOLD: "CONTENT_LENGTH_EXCEEDS_THRESHOLD";
    INPUT_TOO_LONG: "Input is too long";
    MONTHLY_REQUEST_COUNT: "MONTHLY_REQUEST_COUNT";
    INSUFFICIENT_MODEL_CAPACITY: "INSUFFICIENT_MODEL_CAPACITY";
    USER_REQUEST_RATE_EXCEEDED: "USER_REQUEST_RATE_EXCEEDED";
    REQUEST_BODY_INVALID: "REQUEST_BODY_INVALID";
}>;
/** Live AWS often wraps the payload as `{ [eventType]: { … } }`. */
export declare function unwrapKiroEventPayload(payload: any, type: any): any;
export declare function kiroContextWindowOf(model: any): any;
export declare function kiroChatUrl(session?: any): string;
/** Quota keeps accept: application/json. Chat must ask for the event stream. */
export declare function kiroChatHeaders(session: any): {
    accept: string;
    'content-type': string;
    'x-amz-target': string;
    'x-amzn-kiro-agent-mode': string;
    tokentype?: string | undefined;
    authorization: string;
    'user-agent': string;
    'x-amz-user-agent': string;
    'amz-sdk-invocation-id': `${string}-${string}-${string}-${string}-${string}`;
    'amz-sdk-request': string;
};
/**
 * A picked effort rides `additionalModelRequestFields`, in the shape the
 * model's own schema (List-Available-Models) names: Claude
 * `output_config.effort`, GPT `reasoning.effort`. The schema is closed — a
 * field or value it lacks is a 400 — and `efforts` is the ladder read from
 * it, so only a value on that ladder goes out. Live 2026-09-29: Opus 5.5
 * low → max cost 4.3x, GPT-5.6 Luna none → max 8x.
 */
export declare function kiroEffortFields(modelId: any, effort: any, efforts: any): {
    reasoning: {
        effort: string;
    };
    output_config?: undefined;
} | {
    output_config: {
        effort: string;
    };
    reasoning?: undefined;
} | undefined;
/**
 * IDs Kiro already accepts stay (after the existing call_/toolu_/tool_
 * → tooluse_ prefix). Compound OpenAI Responses ids (`call_…|fc_…`,
 * over 64 chars) get a stable sha256 remap so the matching tool_result
 * uses the same wire id. Same map both ways — never Date.now().
 */
export declare function normalizeToolUseId(id: any): string | undefined;
/**
 * Concurrent tools can interleave: assistant(A) / user text / assistant(B)
 * / toolResult(A). AWS 400s a tool_use without an immediately following
 * tool_result. Pure reorder by id — no fabricate, no drop of a result
 * whose call exists. Well-formed transcripts stay unchanged.
 */
export declare function relocateDisplacedToolResults(messages: any): any;
/**
 * Kiro (Bedrock) 400s tool_use / tool_result blocks in a request that offers
 * no tools — "The toolConfig field must be defined when using toolUse and
 * toolResult content blocks" (live 2026-09-29). That is the shape of a
 * compaction or summary request, which must not be handed tools to call, so
 * the calls and results ride as text. Consecutive results become one user turn.
 */
export declare function toolHistoryAsText(messages: any): any[];
/**
 * DSH `developer` (and any other unknown role) → system, same as GLM.
 * Official wire has no system field (kiro.rs / kiro-proxy PROTOCOL.md):
 * park system as the first history user + canned assistant pair so the
 * current turn stays just the new user text. conversationId is the DSH
 * pin plus model — never Date.now().
 */
export declare function openaiToKiro(payload: any, { conversationId, profileArn, origin, efforts }?: any): any;
export declare class KiroEventStreamParser {
    buf: Buffer;
    constructor();
    feed(chunk: any): any[];
    finish(): void;
}
export declare function parseKiroEventStream(buffer: any): any[];
export declare function thinkingTextFromPayload(type: any, data: any): any;
/**
 * The stream's own "this reply hit its output limit" (kiro.rs reads it as
 * stop_reason max_tokens): the text so far is good, so it ends as `length`
 * rather than a failure the host would retry into the same limit.
 */
export declare function isKiroOutputCap(event: any): boolean;
export declare function collectKiroEvents(events: any): {
    text: string;
    thinking: string;
    toolCalls: {
        id: any;
        type: string;
        function: {
            name: any;
            arguments: any;
        };
    }[];
    usage: any;
    contextPercentage: any;
    error: any;
    capped: boolean;
};
export declare function kiroToOpenai(eventsOrBody: any, { model, id, window }?: any): {
    error?: {
        message: any;
    } | undefined;
    id: any;
    object: string;
    model: any;
    choices: {
        index: number;
        message: any;
        finish_reason: string;
    }[];
    usage: any;
};
export declare function mapKiroUsage(tokens: any): any;
/**
 * Live CodeWhisperer rarely sends metadataEvent. Fall back to contextUsageEvent
 * % × window. The percentage is of the model's own window, so `window` is the
 * live catalog row's — the number the host compacts against — and the static
 * table only answers when there is no live row.
 */
export declare function kiroUsageFromContext(percent: any, model: any, text?: string, window?: undefined): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
} | undefined;
/** Everything the model generated: reply, thinking, and tool-call arguments.
 * Counting only `text` made thinking + tool steps report 0 output tokens. */
export declare function kiroOutputText(collected: any): string;
export declare function resolveKiroUsage(collected: any, model: any, window?: undefined): any;
export declare function kiroToOpenaiChunk(delta: any, { model, id, done, finishReason, usage }?: any): any;
/**
 * Classify hop errors so DSH does not treat size / capacity as AUTH. The hard
 * monthly quota is a 429 the transport words as `usage limit reached:` (host
 * QUOTA_EXCEEDED, never retried). 401/403 become 400 (subscription key stays
 * valid) once the transport's single refresh did not help.
 */
export declare function classifyKiroHopError(status: any, parsed: any, text: any, { retryAfter }?: any): {
    status: any;
    code: string;
    retryAfter: string | undefined;
};
export declare function kiroClientErrorStatus(status: any, parsed: any, text: any): any;
export declare function kiroClientErrorBody(status: any, parsed: any, text: any): {
    error: {
        message: string;
        type: string;
        code: string;
    };
};
