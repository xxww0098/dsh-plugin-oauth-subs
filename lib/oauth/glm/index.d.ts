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
 * Chat default is Anthropic Messages (`/api/anthropic/v1/messages`, ZCode
 * Desktop). Completions leftover (`/api/coding/paas/v4/chat/completions`)
 * stays until the next llm-pi-ai sync. Not chatgpt.com.
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
/**
 * Official Coding Plan model gateway. ZCode never posts the Coding Plan
 * Anthropic endpoint directly: `createOfficialCodingPlanGatewayFetch`
 * (apps/zcode-cli/packages/adapters/src/model/official-coding-plan-gateway.ts)
 * rewrites the endpoint to this origin and keeps method, body, query and every
 * header except `host`. NOTICE.md「官方 Coding Plan 模型网关转发」says the
 * gateway runs plan-entitlement checks before forwarding to the model service.
 */
export declare const GLM_GATEWAY_ORIGIN = "https://zcode.z.ai";
export declare const GLM_GATEWAY_ANTHROPIC_PATHS: Readonly<{
    zai: "/api/v1/ultra-zai/anthropic/v1/messages";
    bigmodel: "/api/v1/ultra/anthropic/v1/messages";
}>;
/** Direct upstreams. Kept as the fallback when the gateway refuses the key. */
export declare const GLM_ANTHROPIC_DIRECT_URLS: Readonly<{
    zai: "https://api.z.ai/api/anthropic/v1/messages";
    bigmodel: "https://open.bigmodel.cn/api/anthropic/v1/messages";
}>;
export declare const GLM_ANTHROPIC_URL: "https://api.z.ai/api/anthropic/v1/messages";
export declare const GLM_ANTHROPIC_VERSION = "2023-06-01";
export declare const GLM_QUOTA_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
export declare const GLM_TOOL_USAGE_URL = "https://api.z.ai/api/monitor/usage/tool-usage";
export declare const GLM_USERINFO_URL = "https://chat.z.ai/api/oauth/userinfo";
export declare const GLM_BIGMODEL_USERINFO_URL = "https://open.bigmodel.cn/api/biz/customer/getCustomerInfo";
export declare const GLM_KEY_NAME = "dsh-plugin-oauth-subs";
/** CLI / site ids. Never show these as the account name on the card. Opaque poll `user.id` is `isGlmOpaqueAccount`. */
export declare const GLM_APP_ACCOUNTS: readonly string[];
/** Official ZCode Desktop, latest stable (https://zcode.z.ai/en/changelog). */
export declare const GLM_APP_VERSION = "3.10.1";
/** Desktop UA from resources/glm/zcode.cjs (`eao`/`rao`). Do not leak this plugin. */
export declare const GLM_USER_AGENT = "ZCode/3.10.1 ai-sdk/anthropic/3.0.81";
/** CLI poll against zcode.z.ai — official CLI shape, not Desktop, not this plugin. */
export declare const GLM_CLI_USER_AGENT = "ZCode/3.10.1";
export declare const GLM_REFERER = "https://zcode.z.ai";
/** ZCode CLI source title (`Z Code@cli`) / Desktop (`Z Code@electron`). */
export declare const GLM_TITLE = "Z Code@electron";
export declare const GLM_AGENT = "glm";
/** resolveRuntimeZCodeEnv default (`ZCODE_ENV` unset) is production. */
export declare const GLM_RELEASE_CHANNEL = "production";
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
 *
 * Values are the wire spellings ZCode's catalog map reads
 * (config/provider/zcode-builtin.json modelApiRules, apiTypeMatch
 * `anthropic-messages`): `output_config.effort` is the level verbatim.
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
 * The plan's live model policy is two models — `docs.z.ai/devpack/overview`:
 * 「所有套餐均支持 GLM-5.3、GLM-5.3-Flash」, and legacy ids auto-route
 * (GLM-5.2 / 5.1 → 5.3, GLM-4.7 → 5.3-Flash). `glm-5.3-flashx` (200 tok/s,
 * 1M ctx) is explicitly **not yet on the plan** (`guides/vlm/glm-5.3-flash`),
 * so it stays out of the picker. GLM-5.2 stays retired: a `thinking.type:
 * disabled` sent to a backend that routes it to 5.3 would 400 (5.3 is
 * forced-on). Turbo keeps its own row because ZCode's
 * `builtinProviderModelRules` still enables it; its 64k output cap comes from
 * `modelRules` (Turbo 200k / 64k vs 5.3 / Flash 1M / 128k).
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
/** Direct Coding Plan Anthropic endpoint (what the gateway forwards to). */
export declare function glmAnthropicDirectUrl(region?: string): "https://api.z.ai/api/anthropic/v1/messages" | "https://open.bigmodel.cn/api/anthropic/v1/messages";
/** Official ZCode hop: the Coding Plan endpoint rewritten to the platform gateway. */
export declare function glmAnthropicGatewayUrl(region?: string): string;
/** ZCode default protocol. https://docs.z.ai/devpack/quick-start */
export declare function glmAnthropicUrl(region?: string): string;
export declare function glmQuotaUrl(region?: string): "https://api.z.ai/api/monitor/usage/quota/limit" | "https://open.bigmodel.cn/api/monitor/usage/quota/limit";
export declare function glmToolUsageUrl(region?: string): "https://api.z.ai/api/monitor/usage/tool-usage" | "https://open.bigmodel.cn/api/monitor/usage/tool-usage";
/**
 * Official ZCode MCP quota endpoint (usage-stats.ts fetchMcpQuotaSnapshot).
 * Always the zcode.z.ai platform gateway — api.z.ai / open.bigmodel.cn answer
 * 404. It needs BOTH the zcode JWT (authorization) and the provisioned
 * Coding Plan api-key (X-Bigmodel-Authorization), plus Bigmodel-Target-Type.
 */
export declare const GLM_MCP_USAGE_URL = "https://zcode.z.ai/api/v1/mcp/usage";
export declare function glmMcpUsageUrl(): string;
export declare function glmUserinfoUrl(region?: string): "https://chat.z.ai/api/oauth/userinfo" | "https://open.bigmodel.cn/api/biz/customer/getCustomerInfo";
export declare function isGlmAppAccount(value: any): boolean;
/**
 * Site ids, poll `user.id`, JWT `sub` / numeric uid, and similar opaque Zhipu
 * handles. Never a Settings card title. Emails and formatted phones pass.
 */
export declare function isGlmOpaqueAccount(value: any): boolean;
export declare function pickGlmHumanAccount(...candidates: any[]): string | undefined;
export declare function accountFromJwt(token: any): string | undefined;
/**
 * Display-name fields are the user's chosen name, not an id — they must not
 * pass the opaque filter. `customerName` / `username` like `xxww0098` or
 * `fwfeibn6` are letters+digits and would be dropped as "internal id" even
 * though they are exactly what the vendor shows. Site ids still excluded.
 */
export declare function pickGlmName(...candidates: any[]): string | undefined;
export declare function glmBizBase(region?: string): "https://api.z.ai" | "https://open.bigmodel.cn";
/**
 * ZCode Desktop client fingerprint for the Coding Plan gateway.
 *
 * Header set from bootstrap/src/model-config.ts (buildCliZCodeSourceHeaders) +
 * runtime-platform-headers.ts, plus the per-request attribution headers in
 * adapters/src/model/runner-attribution.ts. `x-zcode-session-type` is what the
 * Coding Plan server reads to tell main / subagent / other apart; this hop
 * serves DSH's main loop, so it sends `main`.
 */
export declare function glmDesktopHeaders(sessionId?: any): any;
export declare function glmUpstreamHeaders(session: any, sessionId?: any): any;
export declare function glmAnthropicHeaders(session: any, sessionId: any): any;
/**
 * MCP quota headers (buildOfficialMcpAuthHeaders): the zcode JWT rides
 * `authorization`, the provisioned Coding Plan api-key rides
 * `X-Bigmodel-Authorization`, and PERSONAL scope sends
 * `Bigmodel-Target-Type: PERSONAL`. Returns undefined without a zcodeJwt —
 * the endpoint 400s without it.
 */
export declare function glmMcpUsageHeaders(session: any): any;
export declare function isSuccessCode(code: any): boolean;
/** Business envelope failure (HTTP 200 with a non-zero `code`). Terminal. */
export declare class GlmBusinessError extends Error {
    code: any;
    constructor(operation: any, code: any, message: any);
}
export declare function unwrapEnvelope(body: any, operation: any): any;
export declare function createPollToken(): string;
/**
 * Server `expires_at` is epoch **seconds** (auth-login-polling.ts:
 * `expires_at * 1_000`). Older/other spellings can be epoch ms; a small
 * relative number falls back to a 5-minute budget instead of becoming 1970.
 */
export declare function parseGlmExpiresAt(value: any, now?: number): number;
export declare function parseCliInit(body: any): {
    flowId: string;
    authorizeUrl: string;
    intervalMs: number;
    expiresAt: number;
};
/**
 * Provider access token from a ready poll. The official readers only look at
 * the provider-named object — `data[providerId].access_token`
 * (cli-oauth.ts parseReadyData; webAuthService for BigModel) — so the region
 * decides the field, and `data.token` is never a substitute: that is the
 * zcode JWT, which bigmodel.cn rejects with 「令牌已过期或验证不正确」.
 * bigmodelProviderAdapter.ts spells it out: paid Coding Plan calls bigmodel.cn
 * business APIs with the business access token; the zcode JWT is only for
 * Start Plan.
 */
export declare function glmProviderAccessToken(data: any, region?: string): string | undefined;
/**
 * Official poll states are `pending` / `ready` / `failed`
 * (auth-login-polling.ts). Anything else is terminal too: a stale or
 * unknown state must fail the login instead of spinning until expiry.
 */
export declare function parseCliPoll(body: any, region?: string): {
    message?: string | undefined;
    status: string;
    ready: boolean;
    failed: boolean;
    unknown: boolean;
    oauthAccess?: undefined;
    zcodeJwt?: undefined;
    email?: undefined;
    accountId?: undefined;
} | {
    status: string;
    ready: boolean;
    oauthAccess: string;
    zcodeJwt: string | undefined;
    email: string | undefined;
    accountId: string | undefined;
};
/**
 * HTTP failure with the status attached. The CLI login poll retries
 * transient failures and treats 4xx (except 408/429) as terminal, the same
 * split auth-login-polling.ts uses.
 */
export declare class GlmHttpError extends Error {
    status: number;
    constructor(label: any, status: any, text: any);
}
export declare function glmCliInit({ region, fetchFn, pollToken }?: {
    region?: string | undefined;
    fetchFn?: typeof fetch | undefined;
    pollToken?: string | undefined;
}): Promise<{
    pollToken: string;
    region: string;
    flowId: string;
    authorizeUrl: string;
    intervalMs: number;
    expiresAt: number;
}>;
export declare function glmCliPoll({ flowId, pollToken, region, fetchFn }?: any): Promise<{
    message?: string | undefined;
    status: string;
    ready: boolean;
    failed: boolean;
    unknown: boolean;
    oauthAccess?: undefined;
    zcodeJwt?: undefined;
    email?: undefined;
    accountId?: undefined;
} | {
    status: string;
    ready: boolean;
    oauthAccess: string;
    zcodeJwt: string | undefined;
    email: string | undefined;
    accountId: string | undefined;
}>;
export declare function businessLogin(oauthAccessToken: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch | undefined;
    region?: string | undefined;
}): Promise<string>;
export declare function mintGlmApiKey(oauthAccessToken: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch | undefined;
    region?: string | undefined;
}): Promise<string>;
export declare function glmSession({ accessToken, account, accountId, region, zcodeJwt, oauthAccess }?: any): {
    oauthAccess?: string | undefined;
    zcodeJwt?: any;
    region: string;
    account?: string | undefined;
    displayName?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
};
export declare function fetchGlmUserinfo(source: any, { fetchFn, region }?: any): Promise<string | undefined>;
export declare function resolveGlmIdentity(source: any, { fetchFn }?: {
    fetchFn?: typeof fetch | undefined;
}): Promise<string | undefined>;
export declare function displayGlmAccount(session: any): string | undefined;
export declare function completeGlmCli(ready: any, { fetchFn, region }?: {
    fetchFn?: typeof fetch | undefined;
    region?: string | undefined;
}): Promise<{
    oauthAccess?: string | undefined;
    zcodeJwt?: any;
    region: string;
    account?: string | undefined;
    displayName?: string | undefined;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}>;
export declare function refreshGlm(session: any): Promise<any>;
export declare function isGlmPermanentRefreshError(): boolean;
