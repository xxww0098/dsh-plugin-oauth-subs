/**
 * Zhipu GLM / Z.ai Coding Plan OAuth.
 *
 * Official ZCode Individual Plan flow (no PKCE):
 *   1. POST zcode.z.ai/api/v1/oauth/cli/init  (Bearer poll token)
 *   2. Open data.authorize_url, poll /oauth/cli/poll/{flow_id}
 *   3. POST api.z.ai/api/auth/z/login          (OAuth access → biz JWT)
 *   4. Provision a durable id.secret API key on the biz API
 *
 * Chat goes to the Coding Plan OpenAI-compatible endpoint.
 * Client id matches ZCode: client_P8X5CMWmlaRO9gyO-KSqtg
 */
export declare const GLM_CLIENT_ID = "client_P8X5CMWmlaRO9gyO-KSqtg";
export declare const GLM_CLI_INIT_URL = "https://zcode.z.ai/api/v1/oauth/cli/init";
export declare const GLM_CLI_POLL_URL = "https://zcode.z.ai/api/v1/oauth/cli/poll";
export declare const GLM_TOKEN_URL = "https://zcode.z.ai/api/v1/oauth/token";
export declare const GLM_AUTHORIZE_URL = "https://chat.z.ai/api/oauth/authorize";
export declare const GLM_BUSINESS_LOGIN_URL = "https://api.z.ai/api/auth/z/login";
export declare const GLM_BIZ_BASE = "https://api.z.ai";
export declare const GLM_CODING_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";
export declare const GLM_QUOTA_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
export declare const GLM_KEY_NAME = "dsh-plugin-oauth-subs";
export declare const GLM_USER_AGENT = "dsh-plugin-oauth-subs/0.0.16";
export declare const GLM_NEVER_EXPIRES = 8640000000000000;
export declare const GLM_CONTEXT_WINDOW = 128000;
export declare const GLM_LARGE_CONTEXT = 1000000;
export declare const GLM_MODELS: readonly {
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoningEfforts: boolean;
}[];
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
export declare function glmPlanLabel(raw: any): any;
export declare function glmCodingUrl(region?: string): "https://api.z.ai/api/coding/paas/v4/chat/completions" | "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions";
export declare function glmQuotaUrl(region?: string): "https://api.z.ai/api/monitor/usage/quota/limit" | "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
export declare function glmBizBase(region?: string): "https://open.bigmodel.cn" | "https://api.z.ai";
export declare function glmUpstreamHeaders(session: any): {
    authorization: string;
    accept: string;
    'user-agent': string;
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
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: any;
    region: string;
};
export declare function completeGlmCli(ready: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch;
    region?: string;
}): Promise<{
    zcodeJwt?: any;
    planType?: any;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: any;
    region: string;
}>;
export declare function refreshGlm(session: any): Promise<any>;
export declare function isGlmPermanentRefreshError(): boolean;
