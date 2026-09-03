/**
 * Moonshot Kimi Code Plan OAuth.
 *
 * Public client_id matches Kimi Code / pi-provider-kimi-code
 * (`17e5f671-d194-4dfb-9706-5516cb48c098`, https://auth.kimi.com).
 * Login is RFC 8628 device-code only — no PKCE.
 */
export { applyKimiCache, kimiCacheHeaders, kimiCacheSessionId, resetKimiPins } from './cache.js';
export declare const KIMI_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
export declare const KIMI_OAUTH_HOST = "https://auth.kimi.com";
export declare const KIMI_DEVICE_URL = "https://auth.kimi.com/api/oauth/device_authorization";
export declare const KIMI_TOKEN_URL = "https://auth.kimi.com/api/oauth/token";
export declare const KIMI_API_ORIGIN = "https://api.kimi.com";
export declare const KIMI_API_BASE = "https://api.kimi.com/coding/v1";
export declare const KIMI_CHAT_URL = "https://api.kimi.com/coding/v1/chat/completions";
export declare const KIMI_MODELS_URL = "https://api.kimi.com/coding/v1/models";
export declare const KIMI_USAGE_URL = "https://api.kimi.com/coding/v1/usages";
export declare const KIMI_ME_URL = "https://api.kimi.com/coding/v1/me";
export declare const KIMI_USER_AGENT = "dsh-plugin-oauth-subs";
export declare const KIMI_PLATFORM = "dsh";
export declare const KIMI_PREEMPT_MS: number;
export declare const KIMI_NEVER_EXPIRES = 8640000000000000;
export declare const KIMI_CONTEXT_WINDOW = 262144;
export declare const KIMI_MAX_TOKENS = 32000;
export declare const KIMI_INPUT: readonly string[];
export declare const KIMI_SOURCES: readonly string[];
/**
 * DSH picker keys → Kimi `thinking.effort` (pi-provider default map).
 * Vendor `none` is never a key.
 */
export declare const KIMI_REASONING: Readonly<{
    off: "off";
    minimal: "low";
    low: "low";
    medium: "high";
    high: "high";
    xhigh: "max";
    max: "max";
}>;
export declare const KIMI_MODELS: readonly {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    input: string[];
    reasoningEfforts: {
        off: "off";
        minimal: "low";
        low: "low";
        medium: "high";
        high: "high";
        xhigh: "max";
        max: "max";
    };
}[];
export declare function configureKimiIdentity(dataDir: any): void;
export declare function kimiSourceLabel(source: any): "key" | "env" | "CLI" | "OAuth";
export declare function isKimiKeySource(source: any): boolean;
export declare function kimiAccountFingerprint(token: any): string;
export declare function kimiDefaultAccount(token: any): string;
export declare function isKimiOpaqueAccount(value: any): boolean;
export declare function parseKimiApiKey(value: any): string;
export declare function computeKimiDeviceModel({ platform, release, arch, macVersion }?: {}): string;
export declare function kimiStableDeviceId(): string;
/** Kimi Code–compatible X-Msh-* headers. UA is this plugin, not Pi. */
export declare function kimiCredentialHeaders(): {
    'user-agent': string;
    'x-msh-platform': string;
    'x-msh-version': string;
    'x-msh-device-name': string;
    'x-msh-device-model': string;
    'x-msh-os-version': string;
    'x-msh-device-id': string;
};
export declare function kimiDeviceSpec({ fetchFn }?: {
    fetchFn?: typeof fetch;
}): {
    clientId: string;
    deviceCodeUrl: string;
    tokenUrl: string;
    fetchFn: typeof fetch;
    headers: {
        'user-agent': string;
        'x-msh-platform': string;
        'x-msh-version': string;
        'x-msh-device-name': string;
        'x-msh-device-model': string;
        'x-msh-os-version': string;
        'x-msh-device-id': string;
    };
    restartOnExpired: boolean;
};
export declare function kimiSession({ accessToken, refreshToken, expiresAt, account, planType, source, }?: {
    source?: string;
}): {
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
};
export declare function kimiSessionFromTokens(tokens: any, fallback: any): {
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
};
export declare function completeKimiDevice(tokens: any): Promise<{
    planType?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    tokenEndpoint: string;
    clientId: string;
    account: string;
    source: string;
}>;
export declare function refreshKimi(session: any, fetchFn?: typeof fetch): Promise<any>;
export declare function isKimiPermanentRefreshError(error: any): boolean;
export declare function kimiUpstreamHeaders(session: any): {
    'user-agent': string;
    'x-msh-platform': string;
    'x-msh-version': string;
    'x-msh-device-name': string;
    'x-msh-device-model': string;
    'x-msh-os-version': string;
    'x-msh-device-id': string;
    authorization: string;
    accept: string;
};
export declare function parseKimiUserInfo(payload: any): {
    planType?: string;
    account?: string;
};
export declare function resolveKimiIdentity(session: any, { fetchFn, signal }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    planType?: string;
    account?: string;
}>;
export declare function kimiHomePaths({ env, home }?: {
    env?: NodeJS.ProcessEnv;
    home?: string;
}): string[];
