/**
 * GitHub Copilot Chat OAuth.
 *
 * Device-code uses the public VS Code Copilot GitHub App
 * (`Iv1.b507a08c87ecfe98`). OpenCode's Ov23li8 app mints `gho_` tokens
 * that cannot call `/copilot_internal/v2/token` (preview 400).
 * Login is RFC 8628 device-code only — no PKCE, github.com only.
 */
export { applyCopilotCache, copilotCacheHeaders, copilotCacheSessionId, resetCopilotPins } from './cache.js';
export declare const COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98";
export declare const COPILOT_SCOPE = "read:user";
export declare const COPILOT_GITHUB_ORIGIN = "https://github.com";
export declare const COPILOT_DEVICE_URL = "https://github.com/login/device/code";
export declare const COPILOT_TOKEN_URL = "https://github.com/login/oauth/access_token";
export declare const COPILOT_API_GITHUB = "https://api.github.com";
export declare const COPILOT_EXCHANGE_URL = "https://api.github.com/copilot_internal/v2/token";
export declare const COPILOT_USER_URL = "https://api.github.com/user";
export declare const COPILOT_QUOTA_URL = "https://api.github.com/copilot_internal/user";
export declare const COPILOT_API_ORIGIN = "https://api.githubcopilot.com";
export declare const COPILOT_CHAT_VERSION = "0.35.0";
export declare const COPILOT_EDITOR_VERSION = "vscode/1.107.0";
export declare const COPILOT_EDITOR_PLUGIN = "copilot-chat/0.35.0";
export declare const COPILOT_USER_AGENT = "GitHubCopilotChat/0.35.0";
export declare const COPILOT_INTEGRATION_ID = "vscode-chat";
export declare const COPILOT_API_VERSION = "2026-06-01";
export declare const COPILOT_PREEMPT_MS: number;
export declare const COPILOT_NEVER_EXPIRES = 8640000000000000;
export declare const COPILOT_DEFAULT_CONTEXT = 128000;
export declare const COPILOT_DEFAULT_MAX_TOKENS = 16384;
export declare const COPILOT_INPUT: readonly string[];
export declare const COPILOT_VISION_INPUT: readonly string[];
export declare const COPILOT_SOURCES: readonly string[];
export declare const COPILOT_DEFAULT_MODEL = "gpt-4.1";
export declare const COPILOT_PLAN_NAMES: Readonly<{
    free: "Free";
    individual: "Individual";
    pro: "Pro";
    proplus: "Pro+";
    pro_plus: "Pro+";
    business: "Business";
    enterprise: "Enterprise";
}>;
export declare const COPILOT_REASONING: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
/** Offline floor. Live GET /models replaces this after login. */
export declare const COPILOT_MODELS: readonly {
    reasoningEfforts?: any;
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: any;
    input: any[];
}[];
export declare function copilotSourceLabel(source: any): "key" | "env" | "CLI" | "OAuth";
export declare function isCopilotKeySource(source: any): boolean;
export declare function copilotAccountFingerprint(token: any): string;
export declare function copilotDefaultAccount(token: any): string;
export declare function isCopilotOpaqueAccount(value: any): boolean;
export declare function isGithubUserToken(value: any): boolean;
export declare function isCopilotSessionToken(value: any): boolean;
export declare function parseCopilotApiKey(value: any): string;
export declare function copilotIdentityHeaders(): {
    'user-agent': string;
    'editor-version': string;
    'editor-plugin-version': string;
    'copilot-integration-id': string;
};
export declare function copilotDeviceSpec({ fetchFn }?: {
    fetchFn?: typeof fetch;
}): {
    clientId: string;
    scope: string;
    deviceCodeUrl: string;
    tokenUrl: string;
    fetchFn: typeof fetch;
    jsonBody: boolean;
    restartOnExpired: boolean;
    headers: {
        'user-agent': string;
    };
};
export declare function copilotChatUrl(session: any): string;
export declare function copilotModelsUrl(session: any): string;
export declare function copilotSession({ accessToken, refreshToken, expiresAt, account, planType, source, githubToken, githubRefreshToken, apiEndpoint, }?: {
    source?: string;
}): {
    apiEndpoint?: string;
    githubRefreshToken?: string;
    githubToken?: string;
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
};
export declare function parseCopilotTokenPayload(payload: any): {
    token: string;
    expiresAt: number;
    apiEndpoint: string;
};
export declare function exchangeCopilotToken(githubToken: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    token: string;
    expiresAt: number;
    apiEndpoint: string;
}>;
export declare function completeCopilotDevice(tokens: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    apiEndpoint?: string;
    githubRefreshToken?: string;
    githubToken?: string;
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
}>;
export declare function refreshCopilot(session: any, fetchFn?: typeof fetch): Promise<{
    apiEndpoint?: string;
    githubRefreshToken?: string;
    githubToken?: string;
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
}>;
export declare function isCopilotPermanentRefreshError(error: any): boolean;
export declare function copilotUpstreamHeaders(session: any, cacheSessionId: any, extra?: {}): {
    'openai-intent': string;
    'x-github-api-version': string;
    'x-interaction-id': string;
    'x-initiator': string;
    'user-agent': string;
    'editor-version': string;
    'editor-plugin-version': string;
    'copilot-integration-id': string;
    authorization: string;
    accept: string;
};
export declare function parseCopilotUser(payload: any): {
    account: string;
};
export declare function resolveCopilotIdentity(session: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    account: string;
}>;
export declare function mintCopilotSessionFromGithub(githubToken: any, { fetchFn, source, account }?: {
    fetchFn?: typeof fetch;
    source?: string;
}): Promise<{
    apiEndpoint?: string;
    githubRefreshToken?: string;
    githubToken?: string;
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
}>;
