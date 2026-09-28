/**
 * SSE frame classification for the Responses commit gate. Only complete frames
 * are classified, and only by their top-level type: `response.created` echoes
 * the request's `instructions` and `tools`, whose nested `"type"` keys are not
 * events.
 */
export type SseFrameKind = 'preamble' | 'output' | 'other';
/**
 * `event:` wins; without one, the top-level `type` of the `data:` JSON. Any
 * typed non-preamble frame is output — a terminal `response.failed` or an
 * Anthropic `message_start` included — and anything untyped is `other`.
 */
export declare function classifySseFrame(frame: string): SseFrameKind;
/**
 * Splits a byte stream into classified frames, keeping the unfinished tail for
 * the next chunk. The tail is held as latin1 so byte counts are exact and a
 * UTF-8 sequence split across chunks is only decoded once its frame is whole.
 */
export declare class SseFrameScanner {
    #private;
    push(chunk: Uint8Array): {
        kind: SseFrameKind;
        bytes: number;
    }[];
}
