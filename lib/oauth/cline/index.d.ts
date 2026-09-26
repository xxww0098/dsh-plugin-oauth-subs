/**
 * Cline (cline.bot) subscription OAuth — usage-billing / ClinePass credits.
 *
 * Pinned client: **Cline CLI 3.0.62** (npm `cline`, `apps/cli`) on
 * `@cline/core 0.0.83` — source tag `cli-v3.0.62` of github.com/cline/cline:
 * `sdk/packages/core/src/auth/cline.ts` (login / refresh),
 * `sdk/packages/core/src/auth/provider-auth-registry.ts` (`workos:` prefix),
 * `sdk/packages/llms/src/providers/request-headers.ts` (chat headers),
 * `sdk/packages/llms/src/providers/vendors/cline.ts` (OpenAI-compatible hop),
 * `sdk/packages/llms/src/catalog/catalog-cline-recommended.ts` (picker feed).
 *
 * Login is **WorkOS device authorization** + a Cline register exchange:
 * no PKCE, no loopback callback server, no browser redirect. The CLI defaults
 * to it (`useWorkOSDeviceAuth: true`); its PKCE/browser branch exists only for
 * the legacy VS Code extension and this hop does not carry it.
 *
 * Chat is OpenAI **Completions** at `{apiBaseUrl}/api/v1/chat/completions`,
 * authenticated with `Authorization: Bearer workos:<jwt>`. The `workos:`
 * prefix is not decoration: the API answers 401 `Unauthorized: Please make
 * sure you're using the latest version of Cline…` for a bare JWT
 * (live-verified 2026-09-19; mirrors `formatAccessToken` in
 * `provider-auth-registry.ts`).
 */
import { applyClineCache, clineCacheHeaders, clineCacheSessionId, resetClinePins } from './cache.js';
export declare const CLINE_API_ORIGIN = "https://api.cline.bot";
export declare const CLINE_API_BASE = "https://api.cline.bot/api/v1";
export declare const CLINE_CHAT_URL = "https://api.cline.bot/api/v1/chat/completions";
export declare const CLINE_REGISTER_URL = "https://api.cline.bot/api/v1/auth/register";
export declare const CLINE_REFRESH_URL = "https://api.cline.bot/api/v1/auth/refresh";
export declare const CLINE_ME_URL = "https://api.cline.bot/api/v1/users/me";
export declare const CLINE_PLAN_URL = "https://api.cline.bot/api/v1/users/me/plan";
export declare const CLINE_RECOMMENDED_MODELS_URL = "https://api.cline.bot/api/v1/ai/cline/recommended-models";
export declare const CLINE_PLAN_LIMITS_URL = "https://api.cline.bot/api/v1/users/me/plan/usage-limits";
export declare const CLINE_WORKOS_ORIGIN = "https://api.workos.com";
export declare const CLINE_WORKOS_DEVICE_URL = "https://api.workos.com/user_management/authorize/device";
export declare const CLINE_WORKOS_AUTHENTICATE_URL = "https://api.workos.com/user_management/authenticate";
/** WorkOS client registered for the Cline production environment. */
export declare const CLINE_WORKOS_CLIENT_ID = "client_01K3A541FN8TA3EPPHTD2325AR";
export declare const CLINE_ACCESS_TOKEN_PREFIX = "workos:";
/** `cliBuildInfo.version` — the installed `apps/cli/package.json`. */
export declare const CLINE_CLIENT_VERSION = "3.0.62";
/** `@cline/core` package version (`X-CORE-VERSION`). */
export declare const CLINE_CORE_VERSION = "0.0.83";
/** `apps/cli/src/main.ts` extensionContext.client — the CLI's own identity. */
export declare const CLINE_CLIENT_TYPE = "cline-cli";
export declare const CLINE_PLATFORM = "cli";
export declare const CLINE_USER_AGENT = "Cline/3.0.62";
/** `DEFAULT_REFRESH_BUFFER_MS` — refresh 5 min before `expiresAt`. */
export declare const CLINE_PREEMPT_MS: number;
/** `DEFAULT_RETRYABLE_TOKEN_GRACE_MS` — keep a still-valid token on a blip. */
export declare const CLINE_RETRYABLE_TOKEN_GRACE_MS = 30000;
/** `/api/v1/users/{id}/balance` is micro-USD (`normalizeCreditBalance` / 1e6). */
export declare const CLINE_CREDIT_SCALE = 1000000;
/**
 * Billing unit of `/usages` `costUsd` *and* of the plan entitlement caps
 * (`…UsageCostUSDPerUser`): 1e-8 USD (÷1e8 = USD). `creditsUsed`/`balance` are
 * the same scale ×100. Verified two ways — the live ledger (`costUsd` =
 * `creditsUsed` × 100) and MIT `pi-clinepass` `src/usage.ts`
 * (`rawCostUsd / 100_000_000`).
 */
export declare const CLINE_COST_SCALE = 100000000;
/** Cap fields under `plan.entitlements.cline_pass.inferenceCapThreshold`. */
export declare const CLINE_CAP_FIELDS: Readonly<{
    five_hour: "last5HoursUsageCostUSDPerUser";
    weekly: "last7daysUsageCostUSDPerUser";
    monthly: "last30daysUsageCostUSDPerUser";
}>;
/**
 * `GET /users/me/plan/usage-limits` `limits[].type` → the DSH row it fills.
 * The server sends *used* percent; DSH rows carry *remaining*, and the existing
 * primary/weekly/monthly labels are already 5 小时 / 每周 / 每月.
 */
export declare const CLINE_QUOTA_WINDOWS: Readonly<{
    five_hour: {
        kind: string;
        windowMinutes: number;
    };
    weekly: {
        kind: string;
    };
    monthly: {
        kind: string;
    };
}>;
export declare const CLINE_SOURCES: readonly string[];
/**
 * DSH picker level → `reasoning_effort` value.
 *
 * Transcribed from `sdk/packages/llms/src/providers/routing/portable-reasoning.ts`:
 * the `cline` provider id is in neither the portable nor the non-portable set,
 * so an effort passes through unchanged except `max` → `xhigh`, and a disabled
 * reasoning control sends **no** field at all — hence no `off` key (same shape
 * as `COPILOT_REASONING`). `@ai-sdk/openai-compatible` composes the portable
 * option into the `reasoning_effort` body field this hop forwards.
 */
export declare const CLINE_REASONING: Readonly<{
    minimal: "minimal";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
    max: "xhigh";
}>;
export declare const CLINE_DEFAULT_CONTEXT = 128000;
export declare const CLINE_DEFAULT_MAX_TOKENS = 8192;
export declare const CLINE_INPUT: readonly string[];
/**
 * Offline picker seed: the `recommended` + `free` buckets of
 * `GET {apiBase}/ai/cline/recommended-models` refreshed 2026-09-26, crossed with
 * `https://models.dev/api.json` → `openrouter` — the CLI's own metadata source
 * (`buildClineModels` in `sdk/packages/llms/src/providers/builtins.ts`), which
 * also resolves an id by its last path segment (that is how the `cline-free/*`
 * rows map onto `deepseek/…`, `xiaomi/…`, `upstage/…`). `refreshClineCatalog`
 * replaces this list after login; it never drops it.
 */
export declare const CLINE_MODELS: readonly {
    input: string[];
    reasoningEfforts: {
        minimal: "minimal";
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        max: "xhigh";
    };
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
}[];
export declare function clineSourceLabel(source: any): "key" | "env" | "CLI" | "OAuth" | undefined;
/** `formatAccessToken` — idempotent `workos:` prefix on the bearer value. */
export declare function formatClineAccessToken(value: any): string | undefined;
/** `normalizeStoredAccessToken` — the bare WorkOS JWT. */
export declare function normalizeClineAccessToken(value: any): string | undefined;
export declare function clineBearer(session: any): string;
export declare function clineBalanceUrl(userId: any): string;
/**
 * RFC 8628-shaped WorkOS device authorization. The generic device-flow engine
 * already posts `client_id` in the body and polls with
 * `grant_type=urn:ietf:params:oauth:grant-type:device_code` — byte-for-byte the
 * two requests `requestWorkOSDeviceAuthorization` / `pollWorkOSTokens` make.
 * `restartOnExpired` matches the CLI, which requests a fresh code on
 * `expired_token` instead of failing the login.
 */
export declare function clineDeviceSpec({ fetchFn }?: {
    fetchFn?: typeof fetch | undefined;
}): {
    clientId: string;
    deviceCodeUrl: string;
    tokenUrl: string;
    fetchFn: typeof fetch;
    restartOnExpired: boolean;
};
/**
 * Register the WorkOS tokens with Cline: `POST /api/v1/auth/register`
 * `{accessToken, refreshToken}` → `{success, data:{accessToken, refreshToken,
 * tokenType, expiresAt, userInfo}}`. The WorkOS pair alone is not a Cline
 * session — this exchange is what mints the `usr-…` account id.
 */
export declare function registerClineTokens(tokens: any, { fetchFn, signal, source }?: any): Promise<{
    planType?: string | undefined;
    source: any;
    tokenType?: string | undefined;
    userId?: string | undefined;
    accessToken: string | undefined;
    refreshToken: string;
    expiresAt: number;
    account: string;
}>;
export declare function clineSessionFromAuthData(data: any, fallback?: any): {
    planType?: string | undefined;
    source: any;
    tokenType?: string | undefined;
    userId?: string | undefined;
    accessToken: string | undefined;
    refreshToken: string;
    expiresAt: number;
    account: string;
};
/**
 * Account id for a register payload that carried no `userInfo`: the WorkOS JWT
 * `external_id` (which *is* the `usr-…` id), else `sub`, else a constant. Never
 * a token fragment — the stored/displayed id must stay non-reversible.
 */
export declare function clineDefaultAccount(token: any): string;
export declare function isClineOpaqueAccount(value: any): boolean;
/** `refreshClineToken`: JSON `{refreshToken, grantType:"refresh_token"}`. */
export declare function refreshCline(session: any, fetchFn?: typeof fetch, { signal }?: any): Promise<{
    planType?: string | undefined;
    source: any;
    tokenType?: string | undefined;
    userId?: string | undefined;
    accessToken: string | undefined;
    refreshToken: string;
    expiresAt: number;
    account: string;
}>;
export declare function isClinePermanentRefreshError(error: any): boolean;
/**
 * `buildClineRequestHeaders` from `request-headers.ts` plus the CLI's own
 * client context (`apps/cli/src/main.ts`: name `cline-cli`, platform `cli`).
 * `X-Task-ID` is the per-conversation sticky id; `clineCacheHeaders` fills it
 * from the DSH session pin, never from `Date.now()`.
 */
export declare function clineCredentialHeaders(): {
    'HTTP-Referer': string;
    'X-Title': string;
    'X-IS-MULTIROOT': string;
    'X-CLIENT-TYPE': string;
    'X-CLIENT-VERSION': string;
    'X-PLATFORM': string;
    'X-PLATFORM-VERSION': string;
    'X-CORE-VERSION': string;
};
export declare function clineUpstreamHeaders(session: any, cacheSessionId: any): {
    'X-Task-ID': string;
    'HTTP-Referer': string;
    'X-Title': string;
    'X-IS-MULTIROOT': string;
    'X-CLIENT-TYPE': string;
    'X-CLIENT-VERSION': string;
    'X-PLATFORM': string;
    'X-PLATFORM-VERSION': string;
    'X-CORE-VERSION': string;
    authorization: string;
    accept: string;
    'content-type': string;
    'user-agent': string;
};
/** `GET /api/v1/users/me` — envelope-wrapped (`{success, data}`). */
export declare function parseClineUserInfo(payload: any): {
    organizationId?: string | undefined;
    organizationName?: string | undefined;
    userId?: string | undefined;
    planType?: string | undefined;
    account?: string | undefined;
} | undefined;
export declare function resolveClineIdentity(session: any, { fetchFn, signal }?: any): Promise<{
    organizationId?: string | undefined;
    organizationName?: string | undefined;
    userId?: string | undefined;
    planType?: string | undefined;
    account?: string | undefined;
} | undefined>;
export declare function clineHomePaths({ env, home }?: {
    env?: NodeJS.ProcessEnv | undefined;
    home?: string | undefined;
}): string[];
/** `/api/v1/users/me/plan` slugs — names taken from the CLI's own provider
 *  entries (`builtins.ts`: "Cline Usage-Billing" / "ClinePass"). */
export declare const CLINE_PLAN_NAMES: Readonly<{
    usage_billing: "Usage-Billing";
    usagebilling: "Usage-Billing";
    'usage-billing': "Usage-Billing";
    clinepass: "ClinePass";
    cline_pass: "ClinePass";
    'cline-pass': "ClinePass";
}>;
/** The `cline` product without a subscription plan: pay-as-you-go credits. */
export declare const CLINE_USAGE_BILLING = "usage-billing";
export { applyClineCache, clineCacheHeaders, clineCacheSessionId, resetClinePins };
