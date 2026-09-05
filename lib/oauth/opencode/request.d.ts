/**
 * OpenCode Free hop. Completions models keep top-level `reasoning_effort`.
 * Muse Spark is Zen Responses: chat body → `/zen/v1/responses` → chat.completion.
 * Never send both `thinking` and `reasoning_effort`.
 * Hop identity (Bearer public + x-opencode-*) lives in index.ts / cache.ts.
 */
export declare const OPENCODE_MIN_OUTPUT_TOKENS = 16;
export declare function applyOpencodeThinking(payload: {}, model: any): {};
/** Chat / leftover Completions body → Zen Responses. Does not copy Codex cache fields. */
export declare function chatToOpencodeResponses(payload?: {}): {};
/** Map Zen / Responses cache-read fields onto OpenAI `prompt_tokens_details`. Do not invent 0. */
export declare function mapOpencodeUsage(usage: any): {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
};
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
