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
/**
 * Vendor effort value → DSH reasoningEfforts key. Cursor's registry spells
 * the same level differently per family ('none'/'extra-high' on GPT-5.5,
 * 'xhigh' on Grok 4.7, 'max' on Kimi/GLM), so picker rows are built from the
 * family's own advertised values, not one shared map.
 */
export declare function cursorEffortKey(value: any): string | undefined;
export declare function cursorContextValueTokens(value: any): number | undefined;
export declare const CURSOR_PARAM_STYLES: Readonly<{
    'grok-4.7': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'grok-4.6': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
        };
        contexts: never[];
        fast: boolean;
    };
    'grok-4.5': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
        };
        contexts: never[];
        fast: boolean;
    };
    'gpt-5.5': {
        effortParam: string;
        efforts: {
            off: string;
            low: string;
            medium: string;
            high: string;
            xhigh: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'claude-fable-5-1': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'claude-opus-5-5': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'claude-opus-5': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'claude-sonnet-5': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'gemini-3.8-flash': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
        };
        contexts: never[];
        fast: boolean;
    };
    'muse-spark-1.3': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
            minimal: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'gpt-5.6-sol': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
            off: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'gpt-5.6-terra': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
            off: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'gpt-5.6-luna': {
        effortParam: string;
        efforts: {
            low: string;
            medium: string;
            high: string;
            xhigh: string;
            max: string;
            off: string;
        };
        contexts: string[];
        fast: boolean;
    };
    'kimi-k3': {
        effortParam: string;
        efforts: {
            low: string;
            high: string;
            max: string;
        };
        contexts: never[];
        fast: boolean;
    };
    'glm-5.2': {
        effortParam: string;
        efforts: {
            high: string;
            max: string;
        };
        contexts: never[];
        fast: boolean;
    };
    'composer-2.5': {
        effortParam: undefined;
        efforts: {};
        contexts: never[];
        fast: boolean;
    };
    default: {
        effortParam: undefined;
        efforts: {};
        contexts: never[];
        fast: boolean;
    };
}>;
/** Picker reasoningEfforts for one family style: vendor values keyed back to DSH levels. */
export declare function cursorStyleReasoningEfforts(style: any): {};
/** Static fallback aligned to cursor.com/docs/models-and-pricing and 2026-09-26 AvailableModels. Live GetUsableModels may add Auto / Fast / extra families. reasoningEfforts come from the family's CURSOR_PARAM_STYLES entry — the wire values the registry actually takes. */
export declare const CURSOR_MODELS: readonly {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: readonly string[];
    reasoningEfforts: any;
}[];
export declare const CURSOR_SOURCES: readonly string[];
export declare function cursorSourceLabel(source: any, locale?: string): "env" | "CLI" | "IDE" | "PKCE" | undefined;
export declare function cursorClientVersion(): string;
export declare function cursorAgentUrl(): string;
/** Plugin config `cursorProxy` wins over env; empty re-enables env fallback. */
export declare function configureCursorUpstreamProxy(value: any): void;
/**
 * Upstream egress for the Cursor h2 hop (Run + discovery RPCs). Anthropic /
 * OpenAI / Gemini refuse requests that leave from unsupported regions, so a
 * supported-region proxy is the only way to run those families — same role
 * as the IDE's `http.proxy`. Auth poll, refresh, and quota stay direct.
 */
export declare function cursorUpstreamProxy(): any;
export declare function cursorTokenExpiry(token: any, now?: number): number;
/** JWT `sub` / WorkOS / Auth0 / the literal `cursor` — vault keys only, never a card title. */
export declare function isCursorOpaqueAccount(value: any): boolean;
export declare function pickCursorHumanAccount(...candidates: any[]): string | undefined;
export declare function cursorAccountFromToken(token: any): string | undefined;
export declare function displayCursorAccount(session: any): string | undefined;
/** GetEmail `{ email }` or GetMe `{ email, firstName, lastName }`. Email wins. */
export declare function cursorNameFromProfile(value: any): string | undefined;
export declare function cursorMembershipFromStripe(value: any): string | undefined;
export declare function cursorAccessStillValid(token: any, now?: number): boolean;
export declare function createCursorPkce(): {
    verifier: string;
    challenge: string;
};
export declare function cursorLoginParams({ verifier, challenge, uuid }?: any): {
    verifier: any;
    challenge: any;
    uuid: string;
    loginUrl: string;
};
export declare function parseCursorTokenResponse(value: any, endpoint?: string): {
    accessToken: string;
    refreshToken: string | undefined;
};
export declare function cursorSession({ accessToken, refreshToken, expiresAt, account, planType, cachedEmail, source, }?: any): {
    cachedEmail?: string | undefined;
    planType?: any;
    source: any;
    account?: string | undefined;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
};
export declare function cursorChatHeaders(session: any, { unary, requestId, originalRequestId }?: any): {
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
export declare function pollCursorAuth(uuid: any, verifier: any, { fetchFn, sleep, signal, maxAttempts }?: any): Promise<{
    accessToken: string;
    refreshToken: string | undefined;
}>;
export declare function refreshCursorTokens(refreshToken: any, { fetchFn, signal }?: any): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}>;
export declare function refreshCursor(session: any, fetchFn?: typeof fetch): Promise<any>;
export declare function isCursorPermanentRefreshError(error: any): boolean;
export declare function completeCursorLogin(tokens: any, { source }?: {
    source?: string | undefined;
}): Promise<{
    cachedEmail?: string | undefined;
    planType?: any;
    source: any;
    account?: string | undefined;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
}>;
