/**
 * Google Antigravity (cloudcode-pa) OAuth + chat fingerprint.
 *
 * Client id, scopes, callback path, and UA helpers match CLIProxyAPI
 * `internal/auth/antigravity` + `internal/misc/antigravity_version.go`
 * (current main). One official-IDE identity for login, project
 * discovery, refresh, and every generateContent call.
 */
export declare const ANTIGRAVITY_CLIENT_ID: string;
export declare const ANTIGRAVITY_CLIENT_SECRET: string;
export declare const ANTIGRAVITY_CALLBACK_PORT = 51121;
export declare const ANTIGRAVITY_CALLBACK_PATH = "/oauth-callback";
export declare const ANTIGRAVITY_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export declare const ANTIGRAVITY_TOKEN_URL = "https://oauth2.googleapis.com/token";
export declare const ANTIGRAVITY_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo?alt=json";
export declare const ANTIGRAVITY_API_URL = "https://cloudcode-pa.googleapis.com";
export declare const ANTIGRAVITY_DAILY_API_URL = "https://daily-cloudcode-pa.googleapis.com";
export declare const ANTIGRAVITY_API_VERSION = "v1internal";
export declare const ANTIGRAVITY_LOAD_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
export declare const ANTIGRAVITY_ONBOARD_USER_URL = "https://daily-cloudcode-pa.googleapis.com/v1internal:onboardUser";
export declare const ANTIGRAVITY_GENERATE_URL = "https://cloudcode-pa.googleapis.com/v1internal:generateContent";
export declare const ANTIGRAVITY_STREAM_URL = "https://cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse";
export declare const ANTIGRAVITY_SCOPE: string;
/** Floor from CLIProxyAPI: Cloud Code rejects clients below 2.9.0. */
export declare const ANTIGRAVITY_FALLBACK_VERSION = "2.9.1";
export declare const ANTIGRAVITY_NODE_API_CLIENT_UA = "google-api-nodejs-client/10.3.0";
export declare const ANTIGRAVITY_GOOG_API_CLIENT_UA = "gl-node/22.21.1";
export declare const ANTIGRAVITY_BODY_USER_AGENT = "antigravity";
export declare const ANTIGRAVITY_PREEMPT_MS: number;
export declare const ANTIGRAVITY_ONBOARD_ATTEMPTS = 5;
export declare const ANTIGRAVITY_ONBOARD_PAUSE_MS = 2000;
export declare const ANTIGRAVITY_TEXT_INPUT: readonly string[];
export declare const ANTIGRAVITY_VISION_INPUT: readonly string[];
export declare const ANTIGRAVITY_REASONING_GEMINI: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
export declare const ANTIGRAVITY_REASONING_CLAUDE: Readonly<{
    low: "low";
    high: "high";
}>;
/**
 * Live CLIProxyAPI `models.json` → `antigravity` (not Vertex-direct ids).
 * Probed against router-for-me/CLIProxyAPI main. llm-pi-ai only wires
 * text / image, so audio/video Gemini rows stay vision.
 */
export declare const ANTIGRAVITY_MODELS: readonly ({
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        high: "high";
    }>;
    input: readonly string[];
} | {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: boolean;
    input: readonly string[];
})[];
export declare const ANTIGRAVITY_PLAN_NAMES: Readonly<{
    free: "Free";
    free_tier: "Free";
    freetier: "Free";
    pro: "Pro";
    ultra: "Ultra";
}>;
export declare function antigravityPlatform(platform?: NodeJS.Platform, arch?: NodeJS.Architecture): string;
export declare function antigravityVersion(): string;
/** Short runtime UA — userinfo, loadCodeAssist, chat. CLIProxyAPI AntigravityRequestUserAgent. */
export declare function antigravityRequestUserAgent(): string;
/** Long control-plane UA — onboardUser only. CLIProxyAPI AntigravityOnboardUserUserAgent. */
export declare function antigravityOnboardUserUserAgent(): string;
export declare function antigravityLoadCodeAssistMetadata(): {
    ideType: string;
};
export declare function antigravityControlPlaneMetadata(): {
    ide_type: string;
    ide_version: string;
    ide_name: string;
};
export declare function antigravityUserinfoHeaders(accessToken: any): {
    authorization: string;
    'user-agent': string;
};
export declare function antigravityLoadCodeAssistHeaders(accessToken: any): {
    authorization: string;
    accept: string;
    'content-type': string;
    'user-agent': string;
};
export declare function antigravityOnboardUserHeaders(accessToken: any): {
    authorization: string;
    accept: string;
    'content-type': string;
    'user-agent': string;
    'x-goog-api-client': string;
};
export declare function antigravityChatHeaders(session: any): {
    authorization: string;
    accept: string;
    'content-type': string;
    'user-agent': string;
};
export declare const antigravityFlow: {
    callbackPath: string;
    listen: {
        host: string;
        ports: number[];
    };
    timeoutMs: number;
    buildAuthorizeUrl({ redirectUri, state }: {
        redirectUri: any;
        state: any;
    }): string;
};
export declare function extractCloudaicompanionProject(data: any): any;
export declare function defaultAntigravityTierId(loadResp: any): string;
export declare function antigravityPlanType(loadResp: any): string;
export declare function antigravitySession({ accessToken, refreshToken, expiresAt, expiresIn, account, projectId, planType }?: {}): {
    planType?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
    account: string;
    projectId: any;
};
export declare function exchangeAntigravityTokens(body: any, fetchFn?: typeof fetch): Promise<unknown>;
export declare function fetchAntigravityUserInfo(accessToken: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<string>;
export declare function onboardAntigravityUser(accessToken: any, tierId: any, { fetchFn, sleep }?: {
    fetchFn?: typeof fetch;
    sleep?: typeof delay;
}): Promise<any>;
export declare function fetchAntigravityProject({ accessToken, fetchFn, sleep }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    projectId: any;
    planType: string;
    loadResp: any;
}>;
export declare function completeAntigravityLogin(tokens: any, { fetchFn, sleep, account }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    planType?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
    account: string;
    projectId: any;
}>;
export declare function exchangeAntigravityCode(code: any, redirectUri: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    planType?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
    account: string;
    projectId: any;
}>;
export declare function refreshAntigravity(session: any, fetchFn?: typeof fetch): Promise<{
    planType?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
    account: string;
    projectId: any;
}>;
export declare function isAntigravityPermanentRefreshError(error: any): boolean;
export declare function antigravityRequestId(): string;
declare function delay(ms: any): Promise<unknown>;
export {};
