/**
 * Shape a generic openai-responses body for chatgpt.com Codex.
 *
 * DSH/llm-pi-ai speaks openai-responses (system prompt lives in `input` as
 * developer/system). The Codex subscription backend requires a top-level
 * `instructions` string and rejects several public-API-only fields.
 *
 * Cache: Codex matches the longest stable prefix of `instructions` then
 * `input`. Extra leading developer/system items (plan dumps, header rebuilds)
 * must not sit at the front of `input` or the whole history misses. Those
 * extras are parked at the suffix so the conversation prefix can still hit.
 */
export declare function liftInstructions(input: any): {
    instructions: string;
    input: any[];
};
export declare function normalizeCodexResponsesBody(payload: any): any;
/**
 * The Codex backend decodes `content-encoding: zstd` request bodies, as the
 * official client sends them — `instructions` alone is ~128KB. Called once per
 * request; every retry reuses the same bytes.
 */
export declare function encodeCodexBody(body: Buffer): {
    body: NonSharedBuffer;
    headers: {
        'content-encoding': string;
    };
};
