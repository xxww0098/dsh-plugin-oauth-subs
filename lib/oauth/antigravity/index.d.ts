/**
 * Google Antigravity (hub / Antigravity.app) OAuth + chat fingerprint.
 *
 * Official desktop to mimic (2026-08-30 Mac): Antigravity.app 2.11.0
 * (`com.google.antigravity`, `--subclient_type hub`). Ignore
 * Antigravity IDE.app 2.5.5 (`--subclient_type ide`). Hub
 * `--cloud_code_endpoint` is daily-cloudcode-pa; IDE uses prod
 * cloudcode-pa. language_server uses protobuf ClientMetadata.ide_type
 * ANTIGRAVITY. UA shape is CLIProxyAPI AntigravityRequestUserAgent:
 *   antigravity/hub/<ver> <os>/<arch>
 * Chat / loadCodeAssist: User-Agent only — no Client-Metadata /
 * x-goog-api-client. Body metadata: { ideType: 'ANTIGRAVITY' }.
 * onboardUser keeps the longer UA + x-goog-api-client gl-node/22.21.1.
 */
export declare const ANTIGRAVITY_CLIENT_ID: string;
export declare const ANTIGRAVITY_CLIENT_SECRET: string;
export declare const ANTIGRAVITY_CALLBACK_PORT = 51121;
export declare const ANTIGRAVITY_CALLBACK_PATH = "/oauth-callback";
export declare const ANTIGRAVITY_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export declare const ANTIGRAVITY_TOKEN_URL = "https://oauth2.googleapis.com/token";
export declare const ANTIGRAVITY_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo?alt=json";
/** Hub default — Antigravity.app `--cloud_code_endpoint`. */
export declare const ANTIGRAVITY_DAILY_API_URL = "https://daily-cloudcode-pa.googleapis.com";
/** IDE / prod Cloud Code. Only used if daily fails. */
export declare const ANTIGRAVITY_PROD_API_URL = "https://cloudcode-pa.googleapis.com";
export declare const ANTIGRAVITY_API_URL = "https://daily-cloudcode-pa.googleapis.com";
export declare const ANTIGRAVITY_API_VERSION = "v1internal";
export declare const ANTIGRAVITY_LOAD_CODE_ASSIST_URL: string;
export declare const ANTIGRAVITY_MODELS_URL: string;
export declare const ANTIGRAVITY_QUOTA_SUMMARY_URL: string;
export declare const ANTIGRAVITY_ONBOARD_USER_URL: string;
export declare const ANTIGRAVITY_GENERATE_URL: string;
export declare const ANTIGRAVITY_STREAM_URL: string;
/** SkillStar `antigravity_quota_groups` — label + model ids, first match wins per bar. */
export declare const ANTIGRAVITY_QUOTA_GROUPS: readonly ({
    label: string;
    identifiers: readonly string[];
    labelFromModel?: undefined;
} | {
    label: string;
    identifiers: readonly string[];
    labelFromModel: boolean;
})[];
/** Daily hub first, then IDE prod — same order as chat / loadCodeAssist. */
export declare function antigravityFetchModelsUrls(): string[];
/** Daily first, then IDE prod. onboardUser stays daily-only. */
export declare function antigravityCloudCodeFallbacks(url: any): string[];
/** POST a hub Cloud Code RPC: daily, then IDE prod on transport / 5xx. */
export declare function fetchAntigravityCloudCode(url: any, init: any, fetchFn?: typeof fetch): Promise<Response>;
export declare const ANTIGRAVITY_SCOPE: string;
/**
 * Current official Antigravity.app short version when the desktop app
 * is not installed. Cloud Code still rejects clients below 2.9.0.
 */
export declare const ANTIGRAVITY_FALLBACK_VERSION = "2.11.0";
/** Official hub app only — never Antigravity IDE.app. */
export declare const ANTIGRAVITY_MAC_APP_PLIST = "/Applications/Antigravity.app/Contents/Info.plist";
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
    plus: "Plus";
    g1_plus_tier: "Plus";
    g1plustier: "Plus";
    google_ai_plus: "Plus";
    pro: "Pro";
    g1_pro_tier: "Pro";
    g1pro: "Pro";
    g1protier: "Pro";
    google_ai_pro: "Pro";
    ai_pro: "Pro";
    ultra: "Ultra";
    g1_ultra_tier: "Ultra";
    g1ultra: "Ultra";
    g1ultratier: "Ultra";
    google_ai_ultra: "Ultra";
    ai_ultra: "Ultra";
    ultra_5x: "Ultra 5x";
    g1_ultra_5x: "Ultra 5x";
    g1_ultra_5x_tier: "Ultra 5x";
    ultra5x: "Ultra 5x";
    ultra_20x: "Ultra 20x";
    g1_ultra_20x: "Ultra 20x";
    g1_ultra_20x_tier: "Ultra 20x";
    ultra20x: "Ultra 20x";
    standard: "Standard";
    standard_tier: "Standard";
    standardtier: "Standard";
    legacy: "Legacy";
    legacy_tier: "Legacy";
    legacytier: "Legacy";
}>;
export declare function antigravityPlatform(platform?: NodeJS.Platform, arch?: NodeJS.Architecture): string;
/** Normalize FileVersion `2.11.0.0` → `2.11.0`; keep a real fourth component. */
export declare function normalizeAntigravityVersion(value: any): string;
/**
 * SkillStar-style CFBundleShortVersionString extract from Info.plist XML.
 * Does not read Antigravity IDE.app — callers pass Antigravity.app only.
 */
export declare function parseAntigravityPlistVersion(plistXml: any): string;
/** First `X.Y` / `X.Y.Z` / `X.Y.Z.W` token in CLI or PowerShell output. */
export declare function parseAntigravityVersionText(text: any): string;
/**
 * Prefer the installed official Antigravity.app (SkillStar
 * `detect_ide_version`): macOS Info.plist, Windows LocalAppData
 * `Antigravity.exe` FileVersion, linux `antigravity --version`.
 * Never reads Antigravity IDE.app. Else 2.11.0.
 */
export declare function detectAntigravityVersion({ platform, env, readFile, execFile, }?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    readFile?: (path: any) => string;
    execFile?: (file: any, args: any, opts: any) => string;
}): string;
export declare function antigravityVersion(): any;
/** Short runtime UA — userinfo, loadCodeAssist, chat. CLIProxyAPI AntigravityRequestUserAgent. */
export declare function antigravityRequestUserAgent(): string;
/** Long control-plane UA — onboardUser only. CLIProxyAPI AntigravityOnboardUserUserAgent. */
export declare function antigravityOnboardUserUserAgent(): string;
export declare function antigravityLoadCodeAssistMetadata(): {
    ideType: string;
};
/** SkillStar loadCodeAssist body: metadata.ideType plus optional project / duetProject. */
export declare function antigravityLoadCodeAssistBody(projectId: any): {
    metadata: {
        ideType: string;
    };
    cloudaicompanionProject?: undefined;
} | {
    metadata: {
        duetProject: string;
        ideType: string;
    };
    cloudaicompanionProject: string;
};
export declare function antigravityControlPlaneMetadata(): {
    ide_type: string;
    ide_version: any;
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
export declare const ANTIGRAVITY_CLAUDE_THINKING_BETA = "interleaved-thinking-2025-05-14";
/** Claude reasoning only — do not add on Gemini / GPT-OSS / loadCodeAssist. */
export declare function antigravityClaudeReasoningHeader(model: any): {
    'anthropic-beta': string;
} | {
    'anthropic-beta'?: undefined;
};
export declare function antigravityChatHeaders(session: any, { model }?: {}): {
    'anthropic-beta': string;
    authorization: string;
    accept: string;
    'content-type': string;
    'user-agent': string;
} | {
    'anthropic-beta'?: undefined;
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
/** Code Assist SKU — not the Google AI / Antigravity subscription. */
export declare function isCodeAssistOnlyPlan(raw: any): boolean;
/**
 * Google AI plan. Prefer paidTier name/id (Google AI Pro / Ultra).
 * currentTier is Code Assist: STANDARD is ignored, free-tier is kept.
 */
export declare function antigravityPlanType(loadResp: any): string;
export declare const ANTIGRAVITY_VERIFY_MESSAGE = "Google \u9700\u8981\u9A8C\u8BC1\u6B64\u8D26\u53F7\u624D\u80FD\u5BF9\u8BDD";
export declare const ANTIGRAVITY_VERIFY_CODE = "VALIDATION_REQUIRED";
/** Detect Google Cloud Code `VALIDATION_REQUIRED` / "Verify your account". */
export declare function parseAntigravityValidation(payload: any): {
    required: boolean;
    validationUrl: any;
    message: string;
    code: string;
};
export declare function antigravityValidationClientError(info?: {}): {
    error: {
        message: any;
        code: any;
        type: string;
    };
};
export declare function antigravitySession({ accessToken, refreshToken, expiresAt, expiresIn, account, projectId, planType, needsValidation, validationUrl, }?: {}): {
    validationUrl?: string;
    needsValidation?: boolean;
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
    validationUrl?: string;
    needsValidation?: boolean;
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
    validationUrl?: string;
    needsValidation?: boolean;
    planType?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
    account: string;
    projectId: any;
}>;
export declare function refreshAntigravity(session: any, fetchFn?: typeof fetch): Promise<{
    validationUrl?: string;
    needsValidation?: boolean;
    planType?: any;
    accessToken: any;
    refreshToken: any;
    expiresAt: number;
    account: string;
    projectId: any;
}>;
export declare function applyAntigravityValidation(session: any, info: any): any;
/** Tiny generateContent so Settings can show the verify banner before DSH chats. */
export declare function probeAntigravityValidation(session: any, { fetchFn }?: {
    fetchFn?: typeof fetch;
}): Promise<{
    required: boolean;
    validationUrl: any;
    message: string;
    code: string;
} | {
    required: boolean;
}>;
export declare function isAntigravityPermanentRefreshError(error: any): boolean;
export declare function antigravityRequestId(): string;
declare function delay(ms: any): Promise<unknown>;
export {};
