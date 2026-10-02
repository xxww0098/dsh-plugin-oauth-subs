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
 * One frame, fully read: its classification, its event type, and — only when
 * the caller asked for that type — the parsed `data:` JSON. `data` is set only
 * for a capture match, so a classification-time parse of a data-only frame is
 * never mistaken for a captured one, and a captured frame's JSON is parsed
 * only when classification did not already parse it.
 */
export declare function scanSseFrame(frame: string, captureType?: string): {
    kind: SseFrameKind;
    type: string | undefined;
    data: any;
};
/**
 * Splits a byte stream into classified frames, keeping the unfinished tail for
 * the next chunk. The tail is held as latin1 so byte counts are exact and a
 * UTF-8 sequence split across chunks is only decoded once its frame is whole.
 */
export declare class SseFrameScanner {
    #private;
    constructor(capture?: {
        type: string;
        onData: (data: any) => void;
    });
    push(chunk: Uint8Array): {
        kind: SseFrameKind;
        bytes: number;
    }[];
}
