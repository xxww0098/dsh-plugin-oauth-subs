/**
 * Zhipu GLM Coding Plan OAuth — two providers, same ZCode CLI poll.
 *
 * Z.ai (global) and BigModel (China) are the two buttons on ZCode's welcome
 * screen. CLI init provider ids are `zai` and `bigmodel` (`zcode` 500s).
 *
 *   1. POST zcode.z.ai/api/v1/oauth/cli/init  { provider: "zai"|"bigmodel" }
 *   2. Open data.authorize_url, poll /oauth/cli/poll/{flow_id}
 *   3. Z.ai only: POST api.z.ai/api/auth/z/login then mint id.secret
 *      BigModel: the poll JWT is the Coding Plan bearer (no biz mint)
 *
 * Chat goes to the matching Coding Plan OpenAI-compatible endpoint.
 */
export declare const GLM_CLIENT_ID = "client_P8X5CMWmlaRO9gyO-KSqtg";
export declare const GLM_BIGMODEL_APP_ID = "zcode";
export declare const GLM_CLI_INIT_URL = "https://zcode.z.ai/api/v1/oauth/cli/init";
export declare const GLM_CLI_POLL_URL = "https://zcode.z.ai/api/v1/oauth/cli/poll";
export declare const GLM_TOKEN_URL = "https://zcode.z.ai/api/v1/oauth/token";
export declare const GLM_AUTHORIZE_URL = "https://chat.z.ai/api/oauth/authorize";
export declare const GLM_BIGMODEL_AUTHORIZE_URL = "https://bigmodel.cn/login";
export declare const GLM_BUSINESS_LOGIN_URL = "https://api.z.ai/api/auth/z/login";
export declare const GLM_BIZ_BASE = "https://api.z.ai";
export declare const GLM_CODING_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";
export declare const GLM_QUOTA_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
export declare const GLM_TOOL_USAGE_URL = "https://api.z.ai/api/monitor/usage/tool-usage";
export declare const GLM_USERINFO_URL = "https://chat.z.ai/api/oauth/userinfo";
export declare const GLM_BIGMODEL_USERINFO_URL = "https://open.bigmodel.cn/api/biz/customer/getCustomerInfo";
export declare const GLM_KEY_NAME = "dsh-plugin-oauth-subs";
/** CLI / site ids. Never show these as the account name on the card. */
export declare const GLM_APP_ACCOUNTS: readonly string[];
/** Official ZCode Desktop, latest stable (https://zcode.z.ai/en/changelog). */
export declare const GLM_APP_VERSION = "3.10.1";
/** Desktop UA from resources/glm/zcode.cjs (`eao`/`rao`). Do not leak this plugin. */
export declare const GLM_USER_AGENT = "ZCode/3.10.1 ai-sdk/anthropic/3.0.81";
/** CLI poll against zcode.z.ai — official CLI shape, not Desktop, not this plugin. */
export declare const GLM_CLI_USER_AGENT = "ZCode/3.10.1";
export declare const GLM_REFERER = "https://zcode.z.ai";
export declare const GLM_TITLE = "Z Code";
export declare const GLM_AGENT = "glm";
export declare const GLM_NEVER_EXPIRES = 8640000000000000;
export declare const GLM_CONTEXT_WINDOW = 128000;
export declare const GLM_LARGE_CONTEXT = 1000000;
export declare const GLM_TURBO_CONTEXT = 200000;
/** Text-only GLM rows. Flash is the one multimodal Coding Plan model. */
export declare const GLM_TEXT_INPUT: readonly string[];
export declare const GLM_VISION_INPUT: readonly string[];
/**
 * GLM-5.3 / GLM-5.3-Flash thinking depth. Official docs (2026-08):
 * `reasoning_effort` is `low` / `high` / `max`, default `max`. Thinking
 * cannot be turned off — `thinking.type: disabled` 400s. No `medium`.
 * Turbo is hybrid on/off with no effort ladder.
 */
export declare const GLM_REASONING: Readonly<{
    low: "low";
    high: "high";
    max: "max";
}>;
export declare const GLM_REGIONS: readonly string[];
export declare const GLM_CLI_PROVIDERS: Readonly<{
    zai: "zai";
    bigmodel: "bigmodel";
}>;
/**
 * Coding Plan catalog shown in Settings. Three rows only:
 * GLM-5.3 and GLM-5-Turbo are text; GLM-5.3-Flash is the natively
 * multimodal model (image + text). Official Flash also takes video/file;
 * llm-pi-ai / pi-ai only wire `text` and `image`.
 *
 * Thinking depth is declared here so the Harness session picker can
 * offer it. `false` means no depth control (Turbo); omitting `off`
 * means thinking cannot be disabled (5.3 / Flash).
 */
export declare const GLM_MODELS: readonly ({
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: Readonly<{
        low: "low";
        high: "high";
        max: "max";
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
export { GLM_BOOST_HINT, GLM_BOOST_LABEL, glmCardBoost } from './boost.js';
export declare const GLM_PLAN_NAMES: Readonly<{
    lite: "Lite";
    pro: "Pro";
    max: "Max";
    coding_lite: "Lite";
    coding_pro: "Pro";
    coding_max: "Max";
    individual: "Individual";
    team: "Team";
}>;
export declare function normalizeGlmRegion(value: any): "zai" | "bigmodel";
export declare function glmCliProvider(region: any): "zai" | "bigmodel";
export declare function glmPlanLabel(raw: any): any;
export declare function glmCodingUrl(region?: string): "https://api.z.ai/api/coding/paas/v4/chat/completions" | "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions";
export declare function glmQuotaUrl(region?: string): "https://api.z.ai/api/monitor/usage/quota/limit" | "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
export declare function glmToolUsageUrl(region?: string): "https://api.z.ai/api/monitor/usage/tool-usage" | "https://open.bigmodel.cn/api/monitor/usage/tool-usage";
export declare function glmUserinfoUrl(region?: string): "https://chat.z.ai/api/oauth/userinfo" | "https://open.bigmodel.cn/api/biz/customer/getCustomerInfo";
export declare function isGlmAppAccount(value: any): boolean;
export declare function pickGlmHumanAccount(...candidates: any[]): string;
export declare function accountFromJwt(token: any): string;
export declare function glmBizBase(region?: string): "https://open.bigmodel.cn" | "https://api.z.ai";
/** ZCode Desktop 3.10.1 fingerprint for api.z.ai / open.bigmodel.cn Coding Plan hops. */
export declare function glmDesktopHeaders(): {
    'user-agent': string;
    'X-ZCode-App-Version': string;
    'X-ZCode-Agent': string;
    'x-zcode-trace-id': string;
    'x-request-id': string;
    'x-session-id': string;
    'x-query-id': string;
    'HTTP-Referer': string;
    referer: string;
    'X-Title': string;
};
export declare function glmUpstreamHeaders(session: any): {
    'user-agent': string;
    'X-ZCode-App-Version': string;
    'X-ZCode-Agent': string;
    'x-zcode-trace-id': string;
    'x-request-id': string;
    'x-session-id': string;
    'x-query-id': string;
    'HTTP-Referer': string;
    referer: string;
    'X-Title': string;
    authorization: string;
    accept: string;
};
export declare function isSuccessCode(code: any): boolean;
export declare function unwrapEnvelope(body: any, operation: any): any;
export declare function createPollToken(): string;
export declare function parseCliInit(body: any): {
    flowId: string;
    authorizeUrl: string;
    intervalMs: number;
    expiresAt: number;
};
export declare function parseCliPoll(body: any): {
    status: string;
    ready: boolean;
    oauthAccess?: undefined;
    zcodeJwt?: undefined;
    email?: undefined;
    accountId?: undefined;
} | {
    status: string;
    ready: boolean;
    oauthAccess: string;
    zcodeJwt: string;
    email: string;
    accountId: string;
};
export declare function glmCliInit({ region, fetchFn, pollToken }?: {
    region?: string;
    fetchFn?: typeof fetch;
    pollToken?: string;
}): Promise<{
    pollToken: string;
    region: string;
    flowId: string;
    authorizeUrl: string;
    intervalMs: number;
    expiresAt: number;
}>;
export declare function glmCliPoll({ flowId, pollToken, fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    status: string;
    ready: boolean;
    oauthAccess?: undefined;
    zcodeJwt?: undefined;
    email?: undefined;
    accountId?: undefined;
} | {
    status: string;
    ready: boolean;
    oauthAccess: string;
    zcodeJwt: string;
    email: string;
    accountId: string;
}>;
export declare function businessLogin(oauthAccessToken: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch;
    region?: string;
}): Promise<string>;
export declare function mintGlmApiKey(oauthAccessToken: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch;
    region?: string;
}): Promise<string>;
export declare function glmSession({ accessToken, account, accountId, planType, region, zcodeJwt }?: {
    region?: string;
}): {
    zcodeJwt?: any;
    planType?: any;
    region: string;
    account?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
};
export declare function fetchGlmUserinfo(source: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch;
}): Promise<string>;
export declare function resolveGlmIdentity(source: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<string>;
export declare function displayGlmAccount(session: any): string;
export declare function completeGlmCli(ready: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch;
    region?: string;
}): Promise<{
    zcodeJwt?: any;
    planType?: any;
    region: string;
    account?: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}>;
export declare function refreshGlm(session: any): Promise<any>;
export declare function isGlmPermanentRefreshError(): boolean;
