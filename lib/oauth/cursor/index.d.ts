/**
 * Cursor subscription family. Auth is PKCE loginDeepControl + poll, or
 * local CLI Keychain / IDE state.vscdb reuse. Chat is Connect/protobuf
 * AgentService/Run — not OpenAI REST. Fingerprint is the official CLI
 * (`cli-2026.07.23-e383d2b` from Rahularya01/pi-cursor h2-session), not
 * the desktop IDE and not `@cursor/sdk` `client-type: sdk` (that path is
 * API-key Agent.create, not this OAuth hop).
 */
export declare const CURSOR_LOGIN_URL = "https://cursor.com/loginDeepControl";
export declare const CURSOR_POLL_URL = "https://api2.cursor.sh/auth/poll";
export declare const CURSOR_REFRESH_URL = "https://api2.cursor.sh/auth/exchange_user_api_key";
export declare const CURSOR_AGENT_URL = "https://agentn.us.api5.cursor.sh";
export declare const CURSOR_API2_URL = "https://api2.cursor.sh";
export declare const CURSOR_USAGE_PATH = "/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
export declare const CURSOR_USAGE_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";
export declare const CURSOR_STRIPE_PROFILE_URL = "https://api2.cursor.sh/auth/full_stripe_profile";
export declare const CURSOR_GET_EMAIL_PATH = "/aiserver.v1.AuthService/GetEmail";
export declare const CURSOR_GET_EMAIL_URL = "https://api2.cursor.sh/aiserver.v1.AuthService/GetEmail";
export declare const CURSOR_GET_ME_PATH = "/aiserver.v1.DashboardService/GetMe";
export declare const CURSOR_GET_ME_URL = "https://api2.cursor.sh/aiserver.v1.DashboardService/GetMe";
export declare const CURSOR_RUN_PATH = "/agent.v1.AgentService/Run";
export declare const CURSOR_MODELS_PATH = "/agent.v1.AgentService/GetUsableModels";
export declare const CURSOR_AVAILABLE_MODELS_PATH = "/aiserver.v1.AiService/AvailableModels";
export declare const CURSOR_CLIENT_VERSION = "cli-2026.07.23-e383d2b";
export declare const CURSOR_CLIENT_TYPE = "cli";
export declare const CURSOR_PREEMPT_MS: number;
export declare const CURSOR_POLL_MAX_ATTEMPTS = 150;
export declare const CURSOR_POLL_BASE_DELAY_MS = 1000;
export declare const CURSOR_POLL_MAX_DELAY_MS = 10000;
export declare const CURSOR_POLL_BACKOFF = 1.2;
export declare const CURSOR_PLAN_NAMES: Readonly<{
    free: "Free";
    hobby: "Hobby";
    pro: "Pro";
    proplus: "Pro+";
    'pro+': "Pro+";
    pro_plus: "Pro+";
    business: "Business";
    team: "Team";
    ultra: "Ultra";
    enterprise: "Enterprise";
}>;
export declare const CURSOR_REASONING: Readonly<{
    off: "none";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "extra-high";
}>;
/** Static fallback aligned to cursor.com/docs/models-and-pricing. Live GetUsableModels may add Auto / Fast / extra families. */
export declare const CURSOR_MODELS: readonly {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: readonly string[];
    reasoningEfforts: Readonly<{
        off: "none";
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "extra-high";
    }>;
}[];
export declare const CURSOR_SOURCES: readonly string[];
export declare function cursorSourceLabel(source: any, locale?: string): "env" | "CLI" | "IDE" | "PKCE";
export declare function cursorClientVersion(): string;
export declare function cursorAgentUrl(): string;
export declare function cursorTokenExpiry(token: any, now?: number): number;
/** JWT `sub` / WorkOS / Auth0 / the literal `cursor` — vault keys only, never a card title. */
export declare function isCursorOpaqueAccount(value: any): boolean;
export declare function pickCursorHumanAccount(...candidates: any[]): string;
export declare function cursorAccountFromToken(token: any): string;
export declare function displayCursorAccount(session: any): string;
/** GetEmail `{ email }` or GetMe `{ email, firstName, lastName }`. Email wins. */
export declare function cursorNameFromProfile(value: any): string;
export declare function cursorMembershipFromStripe(value: any): string;
export declare function cursorAccessStillValid(token: any, now?: number): boolean;
export declare function createCursorPkce(): {
    verifier: string;
    challenge: string;
};
export declare function cursorLoginParams({ verifier, challenge, uuid }?: {}): {
    verifier: any;
    challenge: any;
    uuid: string;
    loginUrl: string;
};
export declare function parseCursorTokenResponse(value: any, endpoint?: string): {
    accessToken: string;
    refreshToken: string;
};
export declare function cursorSession({ accessToken, refreshToken, expiresAt, account, planType, cachedEmail, source, }?: {
    source?: string;
}): {
    cachedEmail?: string;
    planType?: any;
    source: string;
    account?: string;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
};
export declare function cursorChatHeaders(session: any, { unary, requestId, originalRequestId }?: {
    unary?: boolean;
}): {
    authorization: string;
    'connect-protocol-version': string;
    'content-type': string;
    te: string;
    'x-ghost-mode': string;
    'x-cursor-client-version': string;
    'x-cursor-client-type': string;
    'x-request-id': string;
    'x-original-request-id': string;
};
export declare function cursorUsageHeaders(session: any): {
    authorization: string;
    'content-type': string;
    'x-cursor-client-version': string;
    'x-cursor-client-type': string;
};
export declare function pollCursorAuth(uuid: any, verifier: any, { fetchFn, sleep, signal, maxAttempts }?: {
    fetchFn?: typeof fetch;
    maxAttempts?: number;
}): Promise<{
    accessToken: string;
    refreshToken: string;
}>;
export declare function refreshCursorTokens(refreshToken: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}>;
export declare function refreshCursor(session: any, fetchFn?: typeof fetch): Promise<any>;
export declare function isCursorPermanentRefreshError(error: any): boolean;
export declare function completeCursorLogin(tokens: any, { source }?: {
    source?: string;
}): Promise<{
    cachedEmail?: string;
    planType?: any;
    source: string;
    account?: string;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
}>;
