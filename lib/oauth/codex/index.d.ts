/**
 * ChatGPT / Codex subscription OAuth.
 *
 * Client id, endpoints, and authorize flags match Codex CLI
 * (`app_EMoamEEZ73f0CkXaXp7hrann`, auth.openai.com, originator
 * `codex_cli_rs`). Token exchange is form-encoded; refresh is JSON.
 */
export declare const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export declare const CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
export declare const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
export declare const CODEX_API_URL = "https://chatgpt.com/backend-api/codex/responses";
export declare const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
export declare const CODEX_RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
export declare const CODEX_RESET_CONSUME_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume";
export declare const CODEX_MODELS_URL = "https://chatgpt.com/backend-api/codex/models";
export declare const CODEX_CLIENT_VERSION = "0.153.3";
export declare const CODEX_ORIGINATOR = "codex_cli_rs";
export declare const CODEX_USER_AGENT = "codex_cli_rs/0.153.3";
export declare const CODEX_SCOPE = "openid profile email offline_access api.connectors.read api.connectors.invoke";
export declare const CODEX_CALLBACK_PATH = "/auth/callback";
export declare const CODEX_PREEMPT_MS: number;
/** Codex CLI targets ~258K usable input; the raw model window is 272K.
 *  GPT-6 Astra and GPT-5.6 share this default. The 1.05M API window is
 *  not the ChatGPT Codex subscription default. */
export declare const CODEX_CONTEXT_WINDOW = 258000;
export declare const CODEX_DEFAULT_MAX_TOKENS = 128000;
/** Spark is the one Codex model with a smaller window. */
export declare const CODEX_SPARK_CONTEXT_WINDOW = 128000;
/**
 * `reasoning.effort` values the Codex Responses API accepts, probed against
 * chatgpt.com on 2026-08-26. `minimal` is rejected by every Codex model, and
 * `ultra` is a Codex CLI client-side multi-agent mode rather than an API
 * effort — both answer 400 `unsupported_value`.
 */
export declare const CODEX_REASONING: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
}>;
/** gpt-5.4, gpt-5.4-mini, gpt-5.5 and Spark stop at `xhigh`. */
export declare const CODEX_REASONING_EFFORTS: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
    off: any;
}>;
/** GPT-5.6 Sol / Terra / Luna and GPT-6 Astra add `max`. `ultra` is a
 *  Codex CLI multi-agent mode, not an API effort — it 400s. */
export declare const CODEX_REASONING_EFFORTS_56: Readonly<{
    max: "max";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
    off: any;
}>;
/**
 * Mirrors Codex CLI `models.json` (openai/codex 0.153.3, 2026-09-03) plus
 * GET chatgpt.com/backend-api/codex/models — the one place model facts live,
 * so the picker, the context aliases and the Fast tier cannot drift apart.
 *
 * `largeContext` is the row's `max_context_window` and `fastTier` whether its
 * `service_tiers` offers Fast. Models the subscription backend does not serve
 * stay out entirely:
 * `gpt-5.3-codex` answers 400 "not supported when using Codex with a ChatGPT
 * account". Daybreak / auto-review slugs stay out (CLI-internal).
 */
export declare const CODEX_MODELS: readonly ({
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        off: any;
    }>;
    fastTier: boolean;
    largeContext?: undefined;
} | {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        off: any;
    }>;
    largeContext: number;
    fastTier: boolean;
} | {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        off: any;
    }>;
    fastTier?: undefined;
    largeContext?: undefined;
})[];
/** Bare slug for a model id: no vendor prefix, no `:tag`, lower-cased. */
export declare function codexSlug(modelId: any): string;
/** Catalog row for a model id, resolving a dated snapshot to its base. */
export declare function codexModel(modelId: any): {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        off: any;
    }>;
    fastTier: boolean;
    largeContext?: undefined;
} | {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        off: any;
    }>;
    largeContext: number;
    fastTier: boolean;
} | {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        off: any;
    }>;
    fastTier?: undefined;
    largeContext?: undefined;
};
export declare const codexFlow: {
    callbackPath: string;
    listen: {
        host: string;
        ports: number[];
    };
    buildAuthorizeUrl({ redirectUri, state, pkce }: {
        redirectUri: any;
        state: any;
        pkce: any;
    }): string;
};
export declare function codexProfileClaims(idToken: any): {
    planType?: string;
    emailAddress?: string;
};
export declare function codexSession(tokens: any, fallback: any): {
    planType?: any;
    emailAddress?: any;
    idToken?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    accountId: any;
};
export declare function exchangeCodexCode(code: any, verifier: any, redirectUri: any, fetchFn?: typeof fetch): Promise<{
    planType?: any;
    emailAddress?: any;
    idToken?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    accountId: any;
}>;
export declare function refreshCodex(session: any, fetchFn?: typeof fetch): Promise<{
    planType?: any;
    emailAddress?: any;
    idToken?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: any;
    accountId: any;
}>;
export declare function isCodexPermanentRefreshError(error: any): boolean;
/** originator + User-Agent pair the token endpoint and Responses API both expect. */
export declare function codexCredentialHeaders(): {
    originator: string;
    'user-agent': string;
};
/**
 * Codex CLI `x-codex-routing-hint` (openai/codex#37345). ChatGPT Codex
 * subscription Responses use this together with body `service_tier` to
 * request Fast / Priority. Always sent on Codex-backend auth: `model=<id>`
 * or `model=<id>;tier=priority`.
 */
export declare function codexRoutingHint(model: any, serviceTier: any): string;
export declare function codexUpstreamHeaders(session: any): {
    'openai-version': string;
    'openai-beta': string;
    accept: string;
    originator: string;
    'user-agent': string;
    authorization: string;
    'chatgpt-account-id': any;
};
export declare class OAuthEndpointError extends Error {
    constructor(message: any, status: any, oauthCode: any);
}
export declare function oauthError(response: any, label: any): Promise<OAuthEndpointError>;
