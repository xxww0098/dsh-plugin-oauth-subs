/**
 * Command Code chat transport: JSON POST + JSONL event stream to
 * `https://api.commandcode.ai/alpha/generate`.
 *
 *   request : one JSON body — see request.ts for the wire shape
 *   response: newline-delimited JSON events:
 *       {"type":"reasoning-start"} / {"type":"reasoning-delta","text":…} /
 *       {"type":"reasoning-end"} / {"type":"text-delta","text":…} /
 *       {"type":"tool-call","toolCallId":…,"toolName":…,"input":{…}} /
 *       {"type":"finish","totalUsage":{…},"finishReason":…,"rawFinishReason":…} /
 *       {"type":"error","message":…,"statusCode":…,"isRetryable":…} /
 *       {"type":"abort"}
 *
 * Auth is `Authorization: Bearer <apiKey>` (the permanent key from
 * ~/.commandcode/auth.json or COMMAND_CODE_API_KEY). The upstream stream must
 * close with `finish` or `abort`; anything else is a truncated turn.
 */
export declare class CommandCodeTransportError extends Error {
    status: any;
    permanent: boolean | undefined;
    retryable: boolean | undefined;
    constructor(message: any, { status, retryable }?: any);
}
/**
 * Run one `/alpha/generate` turn. `onEvent` receives
 * {type:'text'|'reasoning'|'tool'|'usage'|'finish', …} deltas; the resolved
 * value is the fully collected turn.
 */
export declare function runCommandCodeChat(session: any, body: any, { signal, onEvent, fetchFn }?: any): Promise<any>;
/**
 * Proxy-facing forward, same contract as forwardDevin: writes the OpenAI
 * response itself — Completions JSON or SSE. `runFn`/`fetchFn` are test seams.
 */
export declare function forwardCommandCode(response: any, { payload, threadId, stream, session, signal, fetchFn, runFn, }?: any): Promise<void>;
