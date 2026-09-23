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
import os from 'node:os';
import { join } from 'node:path';
import { OAuthEndpointError, oauthError } from '../codex/index.js';
import { applyClineCache, clineCacheHeaders, clineCacheSessionId, resetClinePins } from './cache.js';
export const CLINE_API_ORIGIN = 'https://api.cline.bot';
export const CLINE_API_BASE = `${CLINE_API_ORIGIN}/api/v1`;
export const CLINE_CHAT_URL = `${CLINE_API_BASE}/chat/completions`;
export const CLINE_REGISTER_URL = `${CLINE_API_BASE}/auth/register`;
export const CLINE_REFRESH_URL = `${CLINE_API_BASE}/auth/refresh`;
export const CLINE_ME_URL = `${CLINE_API_BASE}/users/me`;
export const CLINE_PLAN_URL = `${CLINE_API_BASE}/users/me/plan`;
export const CLINE_RECOMMENDED_MODELS_URL = `${CLINE_API_BASE}/ai/cline/recommended-models`;
export const CLINE_PLAN_LIMITS_URL = `${CLINE_API_BASE}/users/me/plan/usage-limits`;
export const CLINE_WORKOS_ORIGIN = 'https://api.workos.com';
export const CLINE_WORKOS_DEVICE_URL = `${CLINE_WORKOS_ORIGIN}/user_management/authorize/device`;
export const CLINE_WORKOS_AUTHENTICATE_URL = `${CLINE_WORKOS_ORIGIN}/user_management/authenticate`;
/** WorkOS client registered for the Cline production environment. */
export const CLINE_WORKOS_CLIENT_ID = 'client_01K3A541FN8TA3EPPHTD2325AR';
export const CLINE_ACCESS_TOKEN_PREFIX = 'workos:';
/** `cliBuildInfo.version` — the installed `apps/cli/package.json`. */
export const CLINE_CLIENT_VERSION = '3.0.62';
/** `@cline/core` package version (`X-CORE-VERSION`). */
export const CLINE_CORE_VERSION = '0.0.83';
/** `apps/cli/src/main.ts` extensionContext.client — the CLI's own identity. */
export const CLINE_CLIENT_TYPE = 'cline-cli';
export const CLINE_PLATFORM = 'cli';
export const CLINE_USER_AGENT = `Cline/${CLINE_CLIENT_VERSION}`;
/** `DEFAULT_REFRESH_BUFFER_MS` — refresh 5 min before `expiresAt`. */
export const CLINE_PREEMPT_MS = 5 * 60_000;
/** `DEFAULT_RETRYABLE_TOKEN_GRACE_MS` — keep a still-valid token on a blip. */
export const CLINE_RETRYABLE_TOKEN_GRACE_MS = 30_000;
/** `/api/v1/users/{id}/balance` is micro-USD (`normalizeCreditBalance` / 1e6). */
export const CLINE_CREDIT_SCALE = 1_000_000;
/**
 * Billing unit of `/usages` `costUsd` *and* of the plan entitlement caps
 * (`…UsageCostUSDPerUser`): 1e-8 USD (÷1e8 = USD). `creditsUsed`/`balance` are
 * the same scale ×100. Verified two ways — the live ledger (`costUsd` =
 * `creditsUsed` × 100) and MIT `pi-clinepass` `src/usage.ts`
 * (`rawCostUsd / 100_000_000`).
 */
export const CLINE_COST_SCALE = 100_000_000;
/** Cap fields under `plan.entitlements.cline_pass.inferenceCapThreshold`. */
export const CLINE_CAP_FIELDS = Object.freeze({
    five_hour: 'last5HoursUsageCostUSDPerUser',
    weekly: 'last7daysUsageCostUSDPerUser',
    monthly: 'last30daysUsageCostUSDPerUser',
});
/**
 * `GET /users/me/plan/usage-limits` `limits[].type` → the DSH row it fills.
 * The server sends *used* percent; DSH rows carry *remaining*, and the existing
 * primary/weekly/monthly labels are already 5 小时 / 每周 / 每月.
 */
export const CLINE_QUOTA_WINDOWS = Object.freeze({
    five_hour: { kind: 'primary', windowMinutes: 300 },
    weekly: { kind: 'weekly' },
    monthly: { kind: 'monthly' },
});
export const CLINE_SOURCES = Object.freeze(['oauth', 'cli', 'paste', 'env']);
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
export const CLINE_REASONING = Object.freeze({
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'xhigh',
});
export const CLINE_DEFAULT_CONTEXT = 128_000;
export const CLINE_DEFAULT_MAX_TOKENS = 8_192;
export const CLINE_INPUT = Object.freeze(['text', 'image']);
/**
 * Offline picker seed: the `recommended` + `free` buckets of
 * `GET {apiBase}/ai/cline/recommended-models` captured 2026-09-23, crossed with
 * `https://models.dev/api.json` → `openrouter` — the CLI's own metadata source
 * (`buildClineModels` in `sdk/packages/llms/src/providers/builtins.ts`), which
 * also resolves an id by its last path segment (that is how the `cline-free/*`
 * rows map onto `deepseek/…`, `xiaomi/…`, `upstage/…`). `refreshClineCatalog`
 * replaces this list after login; it never drops it.
 */
export const CLINE_MODELS = Object.freeze([
    { id: 'spacexai/grok-4.7', name: 'Grok 4.7', contextWindow: 500_000, maxTokens: 450_000, input: ['text', 'image'] },
    { id: 'openai/gpt-6-astra', name: 'GPT-6 Astra', contextWindow: 1_050_000, maxTokens: 128_000, input: ['text', 'image'] },
    { id: 'moonshotai/kimi-k3', name: 'Kimi K3', contextWindow: 1_048_576, maxTokens: 943_718, input: ['text', 'image'] },
    { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5', contextWindow: 1_000_000, maxTokens: 128_000, input: ['text', 'image'] },
    { id: 'cline-free/mimo-v2.6-flash', name: 'MiMo-V2.6-Flash (free)', contextWindow: 1_048_576, maxTokens: 131_072, input: ['text', 'image'] },
    { id: 'cline-free/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash (free)', contextWindow: 1_048_576, maxTokens: 384_000, input: ['text', 'image'] },
    { id: 'cline-free/muse-spark-1.3-contributor', name: 'Muse Spark 1.3 Contributor (free)', contextWindow: 1_048_576, maxTokens: 943_718, input: ['text', 'image'] },
    { id: 'cline-free/solar-pro4', name: 'Solar Pro 4 (free)', contextWindow: 524_288, maxTokens: 131_072, input: ['text'] },
    { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1 (free)', contextWindow: 262_144, maxTokens: 32_768, input: ['text'] },
].map((model) => ({ ...model, input: [...model.input], reasoningEfforts: { ...CLINE_REASONING } })));
export function clineSourceLabel(source) {
    if (source === 'env')
        return 'env';
    if (source === 'paste')
        return 'key';
    if (source === 'cli')
        return 'CLI';
    if (source === 'oauth')
        return 'OAuth';
    return undefined;
}
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
/** `formatAccessToken` — idempotent `workos:` prefix on the bearer value. */
export function formatClineAccessToken(value) {
    const token = trimmed(value);
    if (!token)
        return undefined;
    return token.toLowerCase().startsWith(CLINE_ACCESS_TOKEN_PREFIX)
        ? token
        : `${CLINE_ACCESS_TOKEN_PREFIX}${token}`;
}
/** `normalizeStoredAccessToken` — the bare WorkOS JWT. */
export function normalizeClineAccessToken(value) {
    const token = trimmed(value);
    if (!token)
        return undefined;
    return token.toLowerCase().startsWith(CLINE_ACCESS_TOKEN_PREFIX)
        ? token.slice(CLINE_ACCESS_TOKEN_PREFIX.length)
        : token;
}
export function clineBearer(session) {
    const token = formatClineAccessToken(session?.accessToken);
    if (!token)
        throw new Error('cline session needs an access token');
    return token;
}
export function clineBalanceUrl(userId) {
    const id = trimmed(userId);
    if (!id)
        throw new Error('cline account id is required');
    return `${CLINE_API_BASE}/users/${encodeURIComponent(id)}/balance`;
}
/**
 * RFC 8628-shaped WorkOS device authorization. The generic device-flow engine
 * already posts `client_id` in the body and polls with
 * `grant_type=urn:ietf:params:oauth:grant-type:device_code` — byte-for-byte the
 * two requests `requestWorkOSDeviceAuthorization` / `pollWorkOSTokens` make.
 * `restartOnExpired` matches the CLI, which requests a fresh code on
 * `expired_token` instead of failing the login.
 */
export function clineDeviceSpec({ fetchFn = fetch } = {}) {
    return {
        clientId: CLINE_WORKOS_CLIENT_ID,
        deviceCodeUrl: CLINE_WORKOS_DEVICE_URL,
        tokenUrl: CLINE_WORKOS_AUTHENTICATE_URL,
        fetchFn,
        restartOnExpired: true,
    };
}
function clineUserInfo(payload) {
    const user = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const email = trimmed(user.email);
    const clineUserId = trimmed(user.clineUserId);
    const name = trimmed(user.name);
    const subject = trimmed(user.subject);
    return {
        ...(email ? { email } : {}),
        ...(clineUserId ? { clineUserId } : {}),
        ...(name ? { name } : {}),
        ...(subject ? { subject } : {}),
    };
}
/**
 * Register the WorkOS tokens with Cline: `POST /api/v1/auth/register`
 * `{accessToken, refreshToken}` → `{success, data:{accessToken, refreshToken,
 * tokenType, expiresAt, userInfo}}`. The WorkOS pair alone is not a Cline
 * session — this exchange is what mints the `usr-…` account id.
 */
export async function registerClineTokens(tokens, { fetchFn = fetch, signal, source = 'oauth' } = {}) {
    const accessToken = trimmed(tokens?.access_token);
    const refreshToken = trimmed(tokens?.refresh_token);
    if (!accessToken || !refreshToken) {
        throw new Error('cline WorkOS token response is missing access_token/refresh_token');
    }
    const response = await fetchFn(CLINE_REGISTER_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ accessToken, refreshToken }),
        signal,
    });
    if (!response.ok)
        throw await oauthError(response, 'cline register');
    const payload = await response.json().catch(() => undefined);
    if (!payload?.success || !payload.data?.accessToken) {
        throw new Error('cline register returned no access token');
    }
    return clineSessionFromAuthData(payload.data, { source });
}
export function clineSessionFromAuthData(data, fallback = {}) {
    const access = normalizeClineAccessToken(data?.accessToken ?? fallback.accessToken);
    if (!access)
        throw new Error('cline token endpoint returned no access token');
    const refresh = trimmed(data?.refreshToken) ?? trimmed(fallback.refreshToken);
    if (!refresh)
        throw new Error('cline token endpoint returned no refresh token');
    const expiresAt = clineExpiresAt(data?.expiresAt, fallback.expiresAt);
    if (expiresAt === undefined)
        throw new Error('cline token endpoint returned no usable expiry');
    const user = clineUserInfo(data?.userInfo);
    const account = user.email ?? user.clineUserId ?? trimmed(fallback.account);
    const tokenType = trimmed(data?.tokenType);
    return {
        accessToken: formatClineAccessToken(access),
        refreshToken: refresh,
        expiresAt,
        account: account ?? clineDefaultAccount(access),
        ...(user.clineUserId ? { userId: user.clineUserId } : {}),
        ...(tokenType ? { tokenType } : {}),
        source: CLINE_SOURCES.includes(fallback.source) ? fallback.source : 'oauth',
        ...(trimmed(fallback.planType) ? { planType: trimmed(fallback.planType) } : {}),
    };
}
function clineExpiresAt(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value > 1e12 ? Math.trunc(value) : Math.trunc(value * 1000);
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value.trim());
        if (Number.isFinite(parsed))
            return parsed;
    }
    return typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : undefined;
}
/**
 * Account id for a register payload that carried no `userInfo`: the WorkOS JWT
 * `external_id` (which *is* the `usr-…` id), else `sub`, else a constant. Never
 * a token fragment — the stored/displayed id must stay non-reversible.
 */
export function clineDefaultAccount(token) {
    const raw = normalizeClineAccessToken(token);
    const payloadPart = typeof raw === 'string' ? raw.split('.')[1] : undefined;
    if (payloadPart) {
        try {
            const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
            const id = trimmed(claims?.external_id) ?? trimmed(claims?.sub);
            if (id)
                return id;
        }
        catch {
            // not a JWT — fall through to the constant
        }
    }
    return 'cline-account';
}
export function isClineOpaqueAccount(value) {
    return /^cline-account$/i.test(String(value ?? '').trim());
}
/** `refreshClineToken`: JSON `{refreshToken, grantType:"refresh_token"}`. */
export async function refreshCline(session, fetchFn = fetch, { signal } = {}) {
    const refreshToken = trimmed(session?.refreshToken);
    if (!refreshToken)
        throw new Error('cline session needs a refresh token');
    const response = await fetchFn(CLINE_REFRESH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken, grantType: 'refresh_token' }),
        signal,
    });
    if (!response.ok)
        throw await oauthError(response, 'cline refresh');
    const payload = await response.json().catch(() => undefined);
    if (!payload?.success || !payload.data?.accessToken) {
        // The endpoint answers 200 with `success:false` for a rejected grant —
        // surface it as permanent so a dead refresh token is not kept forever.
        throw new OAuthEndpointError('cline refresh: refresh token was rejected', 401, 'invalid_grant');
    }
    return clineSessionFromAuthData(payload.data, session);
}
export function isClinePermanentRefreshError(error) {
    if (!(error instanceof OAuthEndpointError))
        return false;
    if (error.status === 401 || error.status === 403)
        return true;
    return error.oauthCode === 'invalid_grant';
}
/**
 * `buildClineRequestHeaders` from `request-headers.ts` plus the CLI's own
 * client context (`apps/cli/src/main.ts`: name `cline-cli`, platform `cli`).
 * `X-Task-ID` is the per-conversation sticky id; `clineCacheHeaders` fills it
 * from the DSH session pin, never from `Date.now()`.
 */
export function clineCredentialHeaders() {
    return {
        'HTTP-Referer': 'https://cline.bot',
        'X-Title': 'Cline',
        'X-IS-MULTIROOT': 'false',
        'X-CLIENT-TYPE': CLINE_CLIENT_TYPE,
        'X-CLIENT-VERSION': CLINE_CLIENT_VERSION,
        'X-PLATFORM': CLINE_PLATFORM,
        'X-PLATFORM-VERSION': CLINE_CLIENT_VERSION,
        'X-CORE-VERSION': CLINE_CORE_VERSION,
    };
}
export function clineUpstreamHeaders(session, cacheSessionId) {
    return {
        authorization: `Bearer ${clineBearer(session)}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': CLINE_USER_AGENT,
        ...clineCredentialHeaders(),
        ...clineCacheHeaders(cacheSessionId),
    };
}
/** `GET /api/v1/users/me` — envelope-wrapped (`{success, data}`). */
export function parseClineUserInfo(payload) {
    const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
        ? payload.data
        : payload;
    if (!data || typeof data !== 'object' || Array.isArray(data))
        return undefined;
    const account = trimmed(data.email) ?? trimmed(data.displayName);
    const planType = trimmed(data.planType ?? data.plan?.name ?? data.plan?.displayName);
    const organizations = Array.isArray(data.organizations) ? data.organizations : [];
    const active = organizations.find((organization) => organization?.active === true);
    if (!account && !planType && !active)
        return undefined;
    return {
        ...(account ? { account } : {}),
        ...(planType ? { planType } : {}),
        ...(trimmed(data.id) ? { userId: trimmed(data.id) } : {}),
        ...(active && trimmed(active.organizationId)
            ? { organizationId: trimmed(active.organizationId), organizationName: trimmed(active.name) }
            : {}),
    };
}
export async function resolveClineIdentity(session, { fetchFn = fetch, signal } = {}) {
    const token = trimmed(session?.accessToken);
    if (!token)
        return undefined;
    try {
        const response = await fetchFn(CLINE_ME_URL, {
            headers: { accept: 'application/json', authorization: `Bearer ${clineBearer(session)}` },
            signal,
        });
        if (!response.ok)
            return undefined;
        return parseClineUserInfo(await response.json());
    }
    catch {
        return undefined;
    }
}
export function clineHomePaths({ env = process.env, home = os.homedir() } = {}) {
    const clineHome = trimmed(env.CLINE_HOME) || join(home, '.cline');
    return [join(clineHome, 'data', 'settings', 'providers.json')];
}
/** `/api/v1/users/me/plan` slugs — names taken from the CLI's own provider
 *  entries (`builtins.ts`: "Cline Usage-Billing" / "ClinePass"). */
export const CLINE_PLAN_NAMES = Object.freeze({
    usage_billing: 'Usage-Billing',
    usagebilling: 'Usage-Billing',
    'usage-billing': 'Usage-Billing',
    clinepass: 'ClinePass',
    cline_pass: 'ClinePass',
    'cline-pass': 'ClinePass',
});
/** The `cline` product without a subscription plan: pay-as-you-go credits. */
export const CLINE_USAGE_BILLING = 'usage-billing';
export { applyClineCache, clineCacheHeaders, clineCacheSessionId, resetClinePins };
