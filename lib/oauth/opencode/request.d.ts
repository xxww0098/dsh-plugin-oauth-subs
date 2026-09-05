/**
 * OpenCode Go Free hop. Completions models keep top-level `reasoning_effort`.
 * Luna / Grok 4.x / Muse Spark are Go Responses: chat → `/zen/go/v1/responses`
 * → chat.completion. Never send both `thinking` and `reasoning_effort`.
 */
export declare const OPENCODE_MIN_OUTPUT_TOKENS = 16;
export declare function applyOpencodeThinking(payload: {}, model: any): {};
/** Chat / leftover Completions body → Go Responses. Does not copy Codex cache fields. */
export declare function chatToOpencodeResponses(payload?: {}): {};
/** Fold MiMo `content: null` + `reasoning_content` so DSH does not see an empty turn. */
export declare function foldOpencodeReasoningContent(payload: any): any;
export declare function opencodeResponsesToChat(payload?: {}, { model, id }?: {}): any;
export declare function createOpencodeResponsesChatStream({ model, id }?: {
    id?: string;
}): {
    push(event: any): {
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
export declare function parseOpencodeSseBlocks(buffer: any): {
    events: any[];
    rest: string;
};
