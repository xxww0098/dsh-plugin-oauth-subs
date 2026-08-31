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
export declare function kiroChatUrl(session?: {}): string;
/** Quota keeps accept: application/json. Chat must ask for the event stream. */
export declare function kiroChatHeaders(session: any): {
    accept: string;
    'content-type': string;
    'x-amz-target': string;
    'x-amzn-kiro-agent-mode': string;
    authorization: string;
    'user-agent': string;
    'x-amz-user-agent': string;
    'amz-sdk-invocation-id': `${string}-${string}-${string}-${string}-${string}`;
    'amz-sdk-request': string;
};
/**
 * DSH `developer` (and any other unknown role) → system, same as GLM.
 * Official wire has no system field (kiro.rs / kiro-proxy PROTOCOL.md):
 * park system as the first history user + canned assistant pair so the
 * current turn stays just the new user text. conversationId is the DSH
 * pin plus model — never Date.now().
 */
export declare function openaiToKiro(payload: any, { conversationId, profileArn, origin }?: {
    origin?: string;
}): {
    conversationState: {
        conversationId: any;
        history: any[];
        currentMessage: {
            userInputMessage: {
                content: any;
                userInputMessageContext: {
                    envState: {
                        operatingSystem: string;
                    };
                };
                origin: string;
                modelId: string;
            };
        };
        chatTriggerType: string;
        agentTaskType: string;
    };
};
export declare class KiroEventStreamParser {
    constructor();
    feed(chunk: any): any[];
}
export declare function parseKiroEventStream(buffer: any): any[];
export declare function mergeKiroText(previous: any, chunk: any): {
    text: any;
    delta: any;
};
export declare function collectKiroEvents(events: any): {
    text: string;
    toolCalls: {
        id: any;
        type: string;
        function: {
            name: any;
            arguments: any;
        };
    }[];
    usage: any;
    error: any;
};
export declare function kiroToOpenai(eventsOrBody: any, { model, id }?: {
    id?: string;
}): {
    error?: {
        message: any;
    };
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
    usage: any;
};
export declare function mapKiroUsage(tokens: any): {
    prompt_tokens: any;
    completion_tokens: any;
    total_tokens: any;
};
export declare function kiroToOpenaiChunk(delta: any, { model, id, done, finishReason, usage }?: {
    done?: boolean;
    finishReason?: any;
}): {
    id: any;
    object: string;
    model: any;
    choices: {
        index: number;
        delta: any;
        finish_reason: any;
    }[];
};
export declare function kiroClientErrorStatus(status: any): any;
export declare function kiroClientErrorBody(status: any, parsed: any, text: any): {
    error: {
        message: string;
        type: string;
        code: string;
    };
};
export declare function encodeKiroEventFrame(type: any, payload: any, messageType?: string): Buffer<ArrayBuffer>;
export declare function encodeKiroEventStream(events: any): Buffer<ArrayBuffer>;
