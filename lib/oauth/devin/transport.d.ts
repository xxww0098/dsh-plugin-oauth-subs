/**
 * Devin chat transport: Connect-RPC v1 over HTTP/1.1 to
 * `server.codeium.com/exa.api_server_pb.ApiServerService/GetChatMessage`.
 *
 *   request : one frame, flag 0x01, gzipped GetChatMessageRequest
 *   response: data frames (flag 0x01 = gzipped proto) + a 0x02 end frame
 *             carrying JSON trailers ({ error: { code, message } })
 *
 * Auth rides inside `Metadata.api_key` (the devin-session-token$… string), so
 * no Authorization header is sent. `GetUserJwt` (unary application/proto)
 * optionally mints a short-lived `user_jwt` + custom api server; failures are
 * non-fatal — chat works with the session token alone (verified live).
 */
import { outboundFetch } from '../../utils/outbound.js';
/**
 * Best-effort GetUserJwt: mints metadata.user_jwt and may redirect to a
 * deployment-specific api server (custom_api_server_url). Returns undefined
 * on any failure — the session token alone is accepted (verified live).
 */
export declare function devinUserJwt(session: any, { fetchFn, signal }?: any): Promise<{
    userJwt: any;
    baseUrl: any;
} | undefined>;
/**
 * SeatManagementService/GetUserStatus (unary application/proto, raw body) —
 * the quota + identity RPC. An HTTP error throws `OAuthEndpointError` with
 * its status, so the refresh probe reads 401 as a dead login.
 */
export declare function devinUserStatus(session: any, { fetchFn, signal }?: any): Promise<{
    userStatus: {
        pro: boolean | undefined;
        name: any;
        teamId: any;
        email: any;
        teamsTier: any;
        planStatus: {
            planInfo: {
                teamsTier: any;
                planName: any;
                monthlyPromptCredits: number | undefined;
                monthlyFlowCredits: number | undefined;
                monthlyFlexCreditPurchaseAmount: number | undefined;
                devinInfo: {
                    canUseCli: boolean | undefined;
                    webappHost: any;
                    apiUrl: any;
                    accountDisplayName: any;
                } | undefined;
                isDevin: boolean | undefined;
                hideDailyQuota: boolean;
                hideWeeklyQuota: boolean;
            } | undefined;
            planStart: any;
            planEnd: any;
            availableFlexCredits: number | undefined;
            usedFlowCredits: number | undefined;
            usedPromptCredits: number | undefined;
            usedFlexCredits: number | undefined;
            availablePromptCredits: number | undefined;
            availableFlowCredits: number | undefined;
            overageBalanceMicros: number | undefined;
            dailyQuotaRemainingPercent: any;
            weeklyQuotaRemainingPercent: any;
            dailyQuotaResetAt: number | undefined;
            weeklyQuotaResetAt: number | undefined;
        } | undefined;
        userId: any;
    } | undefined;
    planInfo: {
        teamsTier: any;
        planName: any;
        monthlyPromptCredits: number | undefined;
        monthlyFlowCredits: number | undefined;
        monthlyFlexCreditPurchaseAmount: number | undefined;
        devinInfo: {
            canUseCli: boolean | undefined;
            webappHost: any;
            apiUrl: any;
            accountDisplayName: any;
        } | undefined;
        isDevin: boolean | undefined;
        hideDailyQuota: boolean;
        hideWeeklyQuota: boolean;
    } | undefined;
}>;
/**
 * Minted user_jwts carry a ~15min exp — minting one before every chat call
 * costs a full RTT (~2s measured). Reuse per session token until exp−margin.
 * A stale jwt surfaces as chat 401; runDevinChat then drops it and retries
 * once token-only (a proven-good path).
 */
export declare function devinChatAuth(session: any, { fetchFn, signal }?: any): Promise<any>;
/**
 * Identity for a stored session: email (or display name) + plan label from
 * GetUserStatus. Opaque ids never become the account name.
 */
export declare function resolveDevinIdentity(session: any, { fetchFn, statusFn }?: {
    fetchFn?: typeof outboundFetch | undefined;
    statusFn?: typeof devinUserStatus | undefined;
}): Promise<{
    account: string | undefined;
    planType: any;
    userId: any;
    teamId: any;
}>;
/**
 * Run one GetChatMessage turn. `built` is what openaiToDevin returns.
 * `onEvent` receives {type:'text'|'thinking'|'tool'|'usage'|'stop', …} deltas;
 * `touch` is called per upstream chunk (the attempt's first-byte/idle clock);
 * the resolved value is the fully collected turn. The upstream's own answers —
 * an HTTP error or a Connect trailer error — throw `UpstreamFailure` code
 * `http` (forwarded once, never replayed); an empty or message-less stream is
 * a plain transport fault.
 */
export declare function runDevinChat(session: any, built: any, { signal, onEvent, touch, fetchFn }?: any): Promise<any>;
/**
 * Pre-output budget and post-output idle for this hop. The shared 270s
 * budget sits on swe-2-max's cold time-to-first-token; the host stream
 * watchdog is 300s and only resets when a content chunk is parsed, so this
 * stays under it. See README «失败».
 */
export declare const DEVIN_STREAM_BUDGET_MS = 290000;
/** Caller timeouts win, so tests can still shrink the clock. */
export declare function devinUpstreamTimeouts(overrides: any): any;
/**
 * Proxy-facing forward, same contract as forwardCursor: writes the OpenAI
 * response itself — Completions JSON or SSE. Timers, transport retries and the
 * one 401 refresh come from `upstreamRequest`; the head waits for the first
 * mapped chunk, so any earlier failure is still a JSON error with the real
 * status, and a failure after it destroys the stream (`answerFailure`).
 * `runFn`/`fetchFn` are test seams.
 */
export declare function forwardDevin(response: any, { payload, cacheSessionId, stream, session, tokens, signal, startedAt, timeouts, fetchFn, runFn, }?: any): Promise<void>;
