/**
 * xAI Grok subscription OAuth.
 *
 * Client id and OIDC issuer match Grok CLI
 * (`b1a00492-073a-47ea-816f-4c329264a828`, https://auth.x.ai). Default login is
 * RFC 8628 device-code (no loopback); PKCE on 127.0.0.1:56121 is the fallback.
 */
export declare const GROK_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export declare const GROK_DISCOVERY_URL = "https://auth.x.ai/.well-known/openid-configuration";
export declare const GROK_API_URL = "https://api.x.ai/v1/responses";
export declare const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export declare const GROK_CLI_USER_URL = "https://cli-chat-proxy.grok.com/v1/user?include=subscription";
export declare const GROK_CLIENT_VERSION = "0.2.93";
export declare const GROK_USER_AGENT = "grok-cli/0.2.93";
export declare const GROK_SCOPE = "openid profile email offline_access grok-cli:access api:access";
export declare const GROK_CALLBACK_PATH = "/callback";
export declare const GROK_PREEMPT_MS: number;
export declare const GROK_CONTEXT_WINDOW = 256000;
export declare const GROK_LARGE_CONTEXT = 500000;
export declare const GROK_DEFAULT_MAX_TOKENS = 32000;
/** grok-4.5: low / medium / high. Reasoning cannot be turned off. */
export declare const GROK_REASONING_45: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
/** grok-4.6 adds xhigh. grok-4 does not accept reasoning.effort. */
export declare const GROK_REASONING_46: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
}>;
export declare const GROK_MODELS: readonly ({
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
} | {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: boolean;
})[];
export declare const GROK_TIER_NAMES: Readonly<{
    0: "Free";
    1: "SuperGrok";
    2: "X Basic";
    3: "X Premium";
    4: "X Premium+";
    5: "SuperGrok Heavy";
    6: "SuperGrok Lite";
    7: "SuperGrok Plus";
}>;
export declare function resetGrokDiscovery(): void;
export declare function grokDiscovery(fetchFn?: typeof fetch): Promise<any>;
export declare function grokFlow(fetchFn?: typeof fetch): Promise<{
    callbackPath: string;
    listen: {
        host: string;
        ports: number[];
    };
    buildAuthorizeUrl({ redirectUri, state, pkce, nonce }: {
        redirectUri: any;
        state: any;
        pkce: any;
        nonce: any;
    }): string;
}>;
export declare function grokDeviceSpec(fetchFn?: typeof fetch): Promise<{
    clientId: string;
    scope: string;
    deviceCodeUrl: any;
    tokenUrl: any;
    fetchFn: typeof fetch;
    headers: {
        'user-agent': string;
    };
}>;
export declare function grokTierFromValue(value: any): any;
export declare function grokTierName(accessToken: any): any;
export declare function grokSession(tokens: any, tokenEndpoint: any, fallback: any): {
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
};
export declare function exchangeGrokCode(code: any, verifier: any, redirectUri: any, challenge: any, fetchFn?: typeof fetch): Promise<{
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
}>;
export declare function completeGrokDevice(tokens: any, fetchFn?: typeof fetch): Promise<{
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
}>;
export declare function refreshGrok(session: any, fetchFn?: typeof fetch): Promise<{
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
}>;
export declare function isGrokPermanentRefreshError(error: any): boolean;
export declare function grokCredentialHeaders(): {
    'user-agent': string;
};
export declare function grokUpstreamHeaders(session: any): {
    'user-agent': string;
    authorization: string;
    'x-xai-token-auth': string;
    accept: string;
};
/**
 * xAI sticky-routes prompt cache by `x-grok-conv-id`. Codex `session-id` /
 * `x-client-request-id` are ignored on this backend and must not be copied.
 */
export declare function grokAffinityHeaders(cacheSessionId: any): {
    'x-grok-conv-id'?: undefined;
} | {
    'x-grok-conv-id': string;
};
