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
export declare class DevinTransportError extends Error {
    constructor(message: any, { status }?: {});
}
/**
 * Best-effort GetUserJwt: mints metadata.user_jwt and may redirect to a
 * deployment-specific api server (custom_api_server_url). Returns undefined
 * on any failure — the session token alone is accepted (verified live).
 */
export declare function devinUserJwt(session: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    userJwt: any;
    baseUrl: any;
}>;
/**
 * SeatManagementService/GetUserStatus (unary application/proto, raw body) —
 * the quota + identity RPC. Throws on HTTP errors; 401/403 are permanent.
 */
export declare function devinUserStatus(session: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    userStatus: {
        pro: boolean;
        name: any;
        teamId: any;
        email: any;
        teamsTier: any;
        planStatus: {
            planInfo: {
                teamsTier: any;
                planName: any;
                devinInfo: {
                    canUseCli: boolean;
                    webappHost: any;
                    apiUrl: any;
                    accountDisplayName: any;
                };
                isDevin: boolean;
                hideDailyQuota: boolean;
                hideWeeklyQuota: boolean;
            };
            planStart: any;
            planEnd: any;
            availablePromptCredits: any;
            usedPromptCredits: any;
            dailyQuotaRemainingPercent: any;
            weeklyQuotaRemainingPercent: any;
            dailyQuotaResetAt: number;
            weeklyQuotaResetAt: number;
        };
        userId: any;
    };
    planInfo: {
        teamsTier: any;
        planName: any;
        devinInfo: {
            canUseCli: boolean;
            webappHost: any;
            apiUrl: any;
            accountDisplayName: any;
        };
        isDevin: boolean;
        hideDailyQuota: boolean;
        hideWeeklyQuota: boolean;
    };
}>;
/**
 * Identity for a stored session: email (or display name) + plan label from
 * GetUserStatus. Opaque ids never become the account name.
 */
export declare function resolveDevinIdentity(session: any, { fetchFn, statusFn }?: {
    fetchFn?: typeof fetch;
    statusFn?: typeof devinUserStatus;
}): Promise<{
    account: string;
    planType: any;
    userId: any;
    teamId: any;
}>;
/**
 * Run one GetChatMessage turn. `built` is what openaiToDevin returns.
 * `onEvent` receives {type:'text'|'thinking'|'tool'|'usage'|'stop', …} deltas;
 * the resolved value is the fully collected turn.
 */
export declare function runDevinChat(session: any, built: any, { signal, onEvent, fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    text: string;
    thinking: string;
    toolCalls: any[];
    usage: any;
    stopReason: any;
    messageId: any;
    actualModelUid: any;
}>;
/**
 * Proxy-facing forward, same contract as forwardCursor: writes the OpenAI
 * response itself — Completions JSON or SSE. `runFn`/`fetchFn` are test seams.
 */
export declare function forwardDevin(response: any, { payload, cacheSessionId, stream, session, signal, fetchFn, runFn, }?: {
    fetchFn?: typeof fetch;
    runFn?: typeof runDevinChat;
}): Promise<void>;
