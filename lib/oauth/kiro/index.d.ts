/**
 * AWS Kiro subscription OAuth — same methods as ZyphrZero/kiro.rs:
 *   social / OAuth  portal PKCE at app.kiro.dev
 *   builder-id      AWS SSO OIDC device code (view.awsapps.com/start)
 *   idc             Enterprise IAM Identity Center (org Start URL)
 *   external_idp    Microsoft Entra / Azure AD refresh_token grant
 *   api_key         ksk_… bearer
 */
export declare const KIRO_PORTAL_URL = "https://app.kiro.dev";
export declare const KIRO_AUTH_HOST = "prod.us-east-1.auth.desktop.kiro.dev";
export declare const KIRO_AUTH_URL = "https://prod.us-east-1.auth.desktop.kiro.dev";
export declare const BUILDER_ID_START_URL = "https://view.awsapps.com/start";
export declare const BUILDER_ID_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX";
export declare const SOCIAL_PROFILE_ARN = "arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK";
export declare const KIRO_CALLBACK_PORTS: readonly number[];
export declare const KIRO_CALLBACK_PATH = "/oauth/callback";
/** Origin-only Cognito redirect can land on `/`, the IDE path, or `/signin/callback`. */
export declare const KIRO_CALLBACK_PATHS: readonly string[];
export declare const KIRO_OIDC_SCOPES: readonly string[];
export declare const KIRO_USAGE_VERSION = "1.0.0";
export declare const KIRO_NEVER_EXPIRES = 8640000000000000;
export declare const KIRO_DEFAULT_REGION = "us-east-1";
export declare const KIRO_CONTEXT_WINDOW = 200000;
export declare const KIRO_LARGE_CONTEXT = 1000000;
export declare const KIRO_GPT_CONTEXT = 272000;
export declare const KIRO_DEEPSEEK_CONTEXT = 128000;
export declare const KIRO_QWEN_CONTEXT = 256000;
export declare const KIRO_MAX_TOKENS = 64000;
export declare const KIRO_VISION_INPUT: readonly string[];
export declare const KIRO_TEXT_INPUT: readonly string[];
export declare const KIRO_METHODS: readonly string[];
export declare const KIRO_USAGE_REGIONS: readonly string[];
/**
 * kiro.dev/docs/models/effort — Claude `output_config.effort`.
 * Opus 5 / 4.8 / 4.7 and Sonnet 5 add `xhigh`; 4.6 family stops at `max`.
 * Thinking can also be `adaptive`/`disabled`; DSH picker is the effort ladder.
 */
export declare const KIRO_REASONING_CLAUDE: Readonly<{
    low: "low";
    medium: "medium";
    high: "high";
    max: "max";
}>;
export declare const KIRO_REASONING_CLAUDE_XHIGH: Readonly<{
    xhigh: "xhigh";
    low: "low";
    medium: "medium";
    high: "high";
    max: "max";
}>;
/** GPT-5.6 `reasoning.effort`. Official wire is `none`; DSH picker key is `off`. */
export declare const KIRO_REASONING_GPT: Readonly<{
    off: "none";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
    max: "max";
}>;
/** Kiro generateAssistantResponse ids (dots). Matches kiro.dev/docs/models, minus Auto. */
export declare const KIRO_MODELS: readonly {
    id: any;
    name: any;
    contextWindow: any;
    maxTokens: number;
    input: readonly string[];
    reasoningEfforts: boolean;
}[];
export declare const KIRO_PLAN_NAMES: Readonly<{
    kiro_free: "Free";
    kirofree: "Free";
    free: "Free";
    kiro_pro: "Pro";
    kiropro: "Pro";
    pro: "Pro";
    'kiro_pro+': "Pro+";
    kiro_proplus: "Pro+";
    kiro_pro_plus: "Pro+";
    kiroproplus: "Pro+";
    proplus: "Pro+";
    pro_plus: "Pro+";
    kiro_powered: "Powered";
    kiropowered: "Powered";
    powered: "Powered";
}>;
export declare function canonicalizeKiroMethod(value: any, { tokenEndpoint }?: {}): string;
/**
 * Guess authMethod for dumps that omit it (kiro-manager-lite compact JSON /
 * 卡密). Social = GitHub/Google refresh only; IdC = Builder ID / Enterprise
 * with clientId+clientSecret.
 */
export declare function inferKiroAuthMethod(raw?: {}): string;
export declare function kiroAccountKind(session?: {}): "entra" | "social" | "idc" | "builder" | "key";
export declare function kiroMethodLabel(methodOrSession: any): "Builder" | "IdC" | "Entra" | "API key" | "Social";
export declare function kiroAccountId(session?: {}): string;
export declare function oidcEndpoint(region?: string): string;
export declare function kiroUsageHost(region?: string): string;
export declare function kiroUsageRegions(session?: {}): string[];
export declare function kiroUsageUrl(region: any, profileArn: any): string;
export declare function validateKiroIdpEndpoint(raw: any): any;
export declare function validateKiroRefreshToken(value: any): string;
export declare function validateKiroApiKey(value: any): string;
export declare function kiroMachineId(session?: {}): string;
/** Stable 64-hex for Social UA. Pass a prior id (or session) so login/token share one machine. */
export declare function allocateKiroMachineId(prior: any): string;
export declare function kiroTokenTypeHeader(session: any): "API_KEY" | "EXTERNAL_IDP";
export declare function kiroEffectiveProfileArn(session: any): any;
export declare function kiroStreamingProfileArn(session: any): any;
export declare function kiroUsageHeaders(session: any): {
    authorization: string;
    accept: string;
    'user-agent': string;
    'x-amz-user-agent': string;
    'amz-sdk-invocation-id': `${string}-${string}-${string}-${string}-${string}`;
    'amz-sdk-request': string;
};
/** Portal authorize `redirect_uri` is origin only (`http://localhost:<port>`). */
export declare function kiroSocialRedirectUri(redirectUri: any): string;
export declare function kiroSocialLoginOption(value: any): string;
/**
 * Token-exchange `redirect_uri` is the URL the browser actually hit:
 * origin + path (`/` / `/oauth/callback` / `/signin/callback`) and
 * `?login_option=google|github` when the callback carried that query.
 */
export declare function kiroSocialTokenRedirectUri(redirectUri: any, callback?: {}): string;
export declare function kiroSocialFlow(): {
    listen: {
        host: string;
        ports: number[];
    };
    callbackPath: string;
    callbackPaths: string[];
    buildAuthorizeUrl(input: any): string;
};
export declare class KiroHttpError extends Error {
    constructor(message: any, status: any, { retryAfter }?: {});
}
export declare function kiroSession(fields?: {}): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    authMethod: string;
    kiroProvider: string;
    planType: string;
    profileArn: string;
    clientId: string;
    clientSecret: string;
    startUrl: string;
    tokenEndpoint: string;
    issuerUrl: string;
    scopes: string;
    region: string;
    authRegion: string;
    apiRegion: string;
    kiroApiKey: string;
};
export declare function exchangeKiroSocialCode(code: any, verifier: any, redirectUri: any, { fetchFn, callback, machineId: priorMachineId }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    authMethod: string;
    kiroProvider: string;
    planType: string;
    profileArn: string;
    clientId: string;
    clientSecret: string;
    startUrl: string;
    tokenEndpoint: string;
    issuerUrl: string;
    scopes: string;
    region: string;
    authRegion: string;
    apiRegion: string;
    kiroApiKey: string;
}>;
export declare function refreshKiroSocial(session: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    authMethod: string;
    kiroProvider: string;
    planType: string;
    profileArn: string;
    clientId: string;
    clientSecret: string;
    startUrl: string;
    tokenEndpoint: string;
    issuerUrl: string;
    scopes: string;
    region: string;
    authRegion: string;
    apiRegion: string;
    kiroApiKey: string;
}>;
export declare function refreshKiroIdc(session: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    authMethod: string;
    kiroProvider: string;
    planType: string;
    profileArn: string;
    clientId: string;
    clientSecret: string;
    startUrl: string;
    tokenEndpoint: string;
    issuerUrl: string;
    scopes: string;
    region: string;
    authRegion: string;
    apiRegion: string;
    kiroApiKey: string;
}>;
export declare function refreshKiroExternalIdp(session: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    authMethod: string;
    kiroProvider: string;
    planType: string;
    profileArn: string;
    clientId: string;
    clientSecret: string;
    startUrl: string;
    tokenEndpoint: string;
    issuerUrl: string;
    scopes: string;
    region: string;
    authRegion: string;
    apiRegion: string;
    kiroApiKey: string;
}>;
export declare function refreshKiro(session: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<any>;
export declare function isKiroPermanentRefreshError(error: any): boolean;
export declare function isKiroCredential(raw: any): boolean;
export declare function kiroSessionFromImport(raw: any): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    account: string;
    authMethod: string;
    kiroProvider: string;
    planType: string;
    profileArn: string;
    clientId: string;
    clientSecret: string;
    startUrl: string;
    tokenEndpoint: string;
    issuerUrl: string;
    scopes: string;
    region: string;
    authRegion: string;
    apiRegion: string;
    kiroApiKey: string;
};
