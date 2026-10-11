/**
 * Codex WebSocket transport (chatgpt.com/backend-api/codex/responses).
 *
 * The backend also speaks Responses over WebSocket with connection-scoped
 * state: with `store:false` the connection itself keeps the conversation, so
 * turn N+1 may send `previous_response_id` plus only the input delta instead
 * of the whole history (wire shape below written against the public client
 * cited in the family README 归因, earendil-works/pi
 * packages/ai/src/api/openai-codex-responses.ts; nothing here is invented).
 *
 * - Upgrade: same path as the POST, `OpenAI-Beta: responses_websockets=
 *   2026-02-06`, `session-id` + `x-client-request-id` (no `thread-id` —
 *   pi sends neither on upgrade; HTTP hop keeps its three-header set).
 * - Request: one text frame `{type:"response.create", ...body}` as plain
 *   JSON — the zstd request encoding is HTTP-only.
 * - Response: one JSON event per message (same objects as the SSE `data:`
 *   lines); `response.done` arrives WS-side and is renamed `completed` on
 *   the wire we emit, so the host sees exactly the SSE event set.
 * - `error` / `response.failed` events are failures; `previous_response_not_found`
 *   clears the continuation and resends the full input once.
 *
 * Continuation guard: the delta is only used when the new body matches the
 * last one except `input`, and the new input covers [last input, last
 * response output] item for item. Comparison is key-order-insensitive and
 * allows the host's replay to carry extra fields (phase, namespace); any
 * doubt sends the full input. Only this family; never another vendor's ids.
 */
import { OutboundWebSocket } from '../../utils/outbound.js';
type WebSocket = OutboundWebSocket;
export declare const CODEX_WS_BETA = "responses_websockets=2026-02-06";
/** An idle pooled socket closes after this, so a parked conversation ends. */
export declare const CODEX_WS_IDLE_TTL_MS: number;
export interface CodexWsContinuation {
    /** Stable JSON of the last request body without `input`/`previous_response_id`. */
    bodyNoInput: string;
    /** [last full input, ...last response output] — the server's stored prefix. */
    baselineItems: any[];
    lastResponseId: string;
}
export interface CodexWsEntry {
    socket: WebSocket;
    dispatcher: {
        close(): Promise<void>;
    } | undefined;
    busy: boolean;
    createdAt: number;
    idleTimer: NodeJS.Timeout | undefined;
    continuation: CodexWsContinuation | undefined;
}
/**
 * The transport is opt-in: `DSH_CODEX_WEBSOCKET=on`. Off by default until the
 * backend's WS behaviour is live-confirmed (README 对话 section); the SSE hop
 * stays the default wire, and every other value (or none) keeps it that way.
 */
export declare function codexWebSocketEnabled(): boolean;
export declare function codexWebSocketCooling(cacheSessionId: string): boolean;
export declare function markCodexWebSocketFallback(cacheSessionId: string): void;
export declare function codexWebSocketPoolSize(): number;
/** Test/reset seam and the plugin-close hook: closes every pooled socket. */
export declare function closeCodexWebSockets(): void;
/** Key-order-insensitive JSON, so host key drift cannot fake or break a match. */
export declare function stableJson(value: any): string;
/**
 * True when `candidate` carries every field of `base` with the same value
 * (arrays in order); extra fields are allowed. The direction matters: the
 * server's own items identify the turn, the host's replay may add metadata.
 */
export declare function deepCovers(base: any, candidate: any): boolean;
export interface CodexWsDelta {
    previousResponseId: string;
    input: any[];
}
/**
 * The delta for `payload` against a recorded continuation, or undefined when
 * anything but the input tail changed — the caller then sends the full body.
 */
export declare function planCodexContinuation(payload: any, continuation: CodexWsContinuation): CodexWsDelta | undefined;
export interface CodexWebSocketAttempt {
    /** The hop's POST url (https); the ws/wss twin is derived from it. */
    url: string;
    /** A codex login session: accessToken + accountId. */
    session: any;
    /** The normalized Codex Responses body (post applyCache), not mutated here. */
    payload: any;
    cacheSessionId: string;
    signal?: AbortSignal;
    /** The upstream attempt's touch: feeds its idle timers per event. */
    touch?(): void;
    captureSse?: {
        type: string;
        onData: (data: any) => void;
    };
}
/**
 * One streaming attempt over the pooled Codex WebSocket: acquires the
 * session's connection, sends `{type:"response.create", ...}` (delta when the
 * continuation matches), translates the event messages into the same SSE wire
 * the HTTP hop emits, and updates the continuation on success. Pre-commit
 * transport failures throw so the hop can cool the session down and retry on
 * SSE; errors stay errors — nothing is silently retried into duplicate output.
 */
export declare function attemptCodexWebSocket(response: any, attempt: CodexWebSocketAttempt): Promise<void>;
export {};
