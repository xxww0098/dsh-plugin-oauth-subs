/**
 * xAI Grok subscription OAuth.
 *
 * Client id and OIDC issuer match Grok CLI
 * (`b1a00492-073a-47ea-816f-4c329264a828`, https://auth.x.ai). Default login is
 * RFC 8628 device-code (no loopback); PKCE on 127.0.0.1:56121 is the fallback.
 */
import { outboundFetch } from '../../utils/outbound.js';
export { grokAffinityHeaders, grokCacheSessionId, applyGrokCache, GROK_STABLE_SESSION, pinGrokSystemPrefix, resetGrokSystemPins, } from './cache.js';
export declare const GROK_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export declare const GROK_DISCOVERY_URL = "https://auth.x.ai/.well-known/openid-configuration";
export declare const GROK_API_URL = "https://api.x.ai/v1/responses";
export declare const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export declare const GROK_CLI_USER_URL = "https://cli-chat-proxy.grok.com/v1/user?include=subscription";
/** grok CLI's own model list (`~/.grok/models_cache.json` source); read by `scripts/models.ts`. */
export declare const GROK_MODELS_URL = "https://cli-chat-proxy.grok.com/v1/models";
export declare const GROK_CREDITS_URL = "https://grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig";
/** Reset cards (「重置卡」): grok.com web billing, not in the grok CLI. See `reset-frame.ts`. */
export declare const GROK_RESET_LIST_URL = "https://grok.com/prod_mc_billing.ConsumerUiSvc/GetRemainingResets";
export declare const GROK_RESET_REDEEM_URL = "https://grok.com/prod_mc_billing.ConsumerUiSvc/RedeemReset";
export declare const GROK_CLIENT_VERSION = "0.2.93";
export declare const GROK_USER_AGENT = "grok-cli/0.2.93";
export declare const GROK_SCOPE = "openid profile email offline_access grok-cli:access api:access";
export declare const GROK_CALLBACK_PATH = "/callback";
export declare const GROK_PREEMPT_MS: number;
export declare const GROK_LARGE_CONTEXT = 500000;
/**
 * grok-4.7 base input window is 256k; the CLI cache / api.x.ai reading of
 * 500000 is the Max Mode variant window (same attribution the Cursor family
 * records from the official docs). 4.5/4.6 keep GROK_LARGE_CONTEXT.
 */
export declare const GROK_47_CONTEXT = 256000;
/** grok-4.5: low / medium / high. Reasoning cannot be turned off. */
export declare const GROK_REASONING_45: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
/** grok-4.6 adds xhigh. */
export declare const GROK_REASONING_46: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
}>;
/** grok-4.7 uses the same wire set as 4.6: low / medium / high / xhigh. */
export declare const GROK_REASONING_47: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
}>;
/**
 * The only Grok ids whose `-fast` suffix is a real backend model
 * (`Grok 4.7 Fast`, 2× price), not a Codex Priority alias. Every other
 * `-fast` Grok id is a stale host alias; `normalizeGrokResponsesBody`
 * passes these through unpeeled and peels the rest.
 */
export declare const GROK_FAST_MODEL_IDS: readonly string[];
export declare const GROK_MODELS: readonly any[];
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
export declare function grokDiscovery(fetchFn?: typeof outboundFetch): Promise<any>;
export declare function grokFlow(fetchFn?: typeof outboundFetch): Promise<{
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
export declare function grokDeviceSpec(fetchFn?: typeof outboundFetch): Promise<{
    clientId: string;
    scope: string;
    deviceCodeUrl: any;
    tokenUrl: any;
    fetchFn: typeof outboundFetch;
    headers: {
        'user-agent': string;
    };
}>;
export declare function grokTierFromValue(value: any): any;
export declare function grokTierName(accessToken: any): any;
export declare function grokSession(tokens: any, tokenEndpoint: any, fallback?: any): {
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
};
export declare function exchangeGrokCode(code: any, verifier: any, redirectUri: any, challenge: any, fetchFn?: typeof outboundFetch): Promise<{
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
}>;
export declare function completeGrokDevice(tokens: any, fetchFn?: typeof outboundFetch): Promise<{
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
}>;
export declare function refreshGrok(session: any, fetchFn?: typeof outboundFetch): Promise<{
    clientId?: any;
    planType?: any;
    account?: any;
    scopes?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    tokenEndpoint: any;
}>;
export declare function grokCredentialHeaders(): {
    'user-agent': string;
};
export declare function grokUserId(session: any): string | undefined;
export declare function grokUpstreamHeaders(session: any): {
    'user-agent': string;
    authorization: string;
    'x-xai-token-auth': string;
    accept: string;
};
/** Reset-card RPCs take the CLI bearer with gRPC-web framing (orca #18116). */
export declare function grokResetHeaders(session: any): {
    'user-agent': string;
    authorization: string;
    'x-xai-token-auth': string;
    'content-type': string;
    'x-grpc-web': string;
};
export declare function grokCreditsHeaders(session: any): {
    'user-agent': string;
    authorization: string;
    'content-type': string;
    'x-grpc-web': string;
    accept: string;
    origin: string;
    referer: string;
    'x-user-agent': string;
};
