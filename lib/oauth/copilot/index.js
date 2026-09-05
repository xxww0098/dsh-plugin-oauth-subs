/**
 * GitHub Copilot Chat OAuth.
 *
 * Device-code uses the public VS Code Copilot GitHub App
 * (`Iv1.b507a08c87ecfe98`). OpenCode's Ov23li8 app mints `gho_` tokens
 * that cannot call `/copilot_internal/v2/token` (preview 400).
 * Login is RFC 8628 device-code only — no PKCE, github.com only.
 */
import { copilotCacheSessionId, COPILOT_STABLE_SESSION } from './cache.js';
import { createHash } from 'node:crypto';
import { OAuthEndpointError, oauthError } from '../codex/index.js';
export { applyCopilotCache, copilotCacheHeaders, copilotCacheSessionId, resetCopilotPins } from './cache.js';
export const COPILOT_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
export const COPILOT_SCOPE = 'read:user';
export const COPILOT_GITHUB_ORIGIN = 'https://github.com';
export const COPILOT_DEVICE_URL = `${COPILOT_GITHUB_ORIGIN}/login/device/code`;
export const COPILOT_TOKEN_URL = `${COPILOT_GITHUB_ORIGIN}/login/oauth/access_token`;
export const COPILOT_API_GITHUB = 'https://api.github.com';
export const COPILOT_EXCHANGE_URL = `${COPILOT_API_GITHUB}/copilot_internal/v2/token`;
export const COPILOT_USER_URL = `${COPILOT_API_GITHUB}/user`;
export const COPILOT_QUOTA_URL = `${COPILOT_API_GITHUB}/copilot_internal/user`;
export const COPILOT_API_ORIGIN = 'https://api.githubcopilot.com';
export const COPILOT_CHAT_VERSION = '0.35.0';
export const COPILOT_EDITOR_VERSION = 'vscode/1.107.0';
export const COPILOT_EDITOR_PLUGIN = `copilot-chat/${COPILOT_CHAT_VERSION}`;
export const COPILOT_USER_AGENT = `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`;
export const COPILOT_INTEGRATION_ID = 'vscode-chat';
export const COPILOT_API_VERSION = '2026-06-01';
export const COPILOT_PREEMPT_MS = 2 * 60_000;
export const COPILOT_NEVER_EXPIRES = 8.64e15;
export const COPILOT_DEFAULT_CONTEXT = 128_000;
export const COPILOT_DEFAULT_MAX_TOKENS = 16_384;
export const COPILOT_INPUT = Object.freeze(['text']);
export const COPILOT_VISION_INPUT = Object.freeze(['text', 'image']);
export const COPILOT_SOURCES = Object.freeze(['oauth', 'cli', 'paste', 'env']);
export const COPILOT_DEFAULT_MODEL = 'gpt-4.1';
export const COPILOT_PLAN_NAMES = Object.freeze({
    free: 'Free',
    individual: 'Individual',
    pro: 'Pro',
    proplus: 'Pro+',
    pro_plus: 'Pro+',
    business: 'Business',
    enterprise: 'Enterprise',
});
export const COPILOT_REASONING = Object.freeze({
    low: 'low',
    medium: 'medium',
    high: 'high',
});
function model(id, name, extra = {}) {
    return {
        id,
        name,
        contextWindow: extra.contextWindow ?? COPILOT_DEFAULT_CONTEXT,
        maxTokens: extra.maxTokens ?? COPILOT_DEFAULT_MAX_TOKENS,
        input: extra.input ? [...extra.input] : [...COPILOT_INPUT],
        ...(extra.reasoningEfforts ? { reasoningEfforts: { ...extra.reasoningEfforts } } : {}),
    };
}
/** Offline floor. Live GET /models replaces this after login. */
export const COPILOT_MODELS = Object.freeze([
    model('gpt-4.1', 'GPT-4.1', { input: [...COPILOT_VISION_INPUT] }),
    model('gpt-4o', 'GPT-4o', { input: [...COPILOT_VISION_INPUT] }),
    model('gpt-5.4', 'GPT-5.4', {
        contextWindow: 272_000,
        maxTokens: 128_000,
        input: [...COPILOT_VISION_INPUT],
        reasoningEfforts: { ...COPILOT_REASONING },
    }),
    model('gpt-5.5', 'GPT-5.5', {
        contextWindow: 272_000,
        maxTokens: 128_000,
        input: [...COPILOT_VISION_INPUT],
        reasoningEfforts: { ...COPILOT_REASONING },
    }),
    model('claude-haiku-4.5', 'Claude Haiku 4.5', {
        contextWindow: 144_000,
        maxTokens: 16_384,
        input: [...COPILOT_VISION_INPUT],
    }),
    model('claude-sonnet-4.6', 'Claude Sonnet 4.6', {
        contextWindow: 200_000,
        maxTokens: 64_000,
        input: [...COPILOT_VISION_INPUT],
    }),
    model('claude-opus-4.6', 'Claude Opus 4.6', {
        contextWindow: 200_000,
        maxTokens: 32_000,
        input: [...COPILOT_VISION_INPUT],
    }),
    model('gemini-3-flash-preview', 'Gemini 3 Flash', {
        contextWindow: 1_000_000,
        maxTokens: 64_000,
        input: [...COPILOT_VISION_INPUT],
    }),
    model('gemini-3.1-pro-preview', 'Gemini 3.1 Pro', {
        contextWindow: 1_000_000,
        maxTokens: 64_000,
        input: [...COPILOT_VISION_INPUT],
    }),
    model('grok-code-fast-1', 'Grok Code Fast 1', {
        contextWindow: 256_000,
        maxTokens: 64_000,
    }),
]);
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export function copilotSourceLabel(source) {
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
export function isCopilotKeySource(source) {
    return source === 'paste' || source === 'env';
}
export function copilotAccountFingerprint(token) {
    return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 8);
}
export function copilotDefaultAccount(token) {
    return `copilot-${copilotAccountFingerprint(token)}`;
}
export function isCopilotOpaqueAccount(value) {
    return /^copilot-[0-9a-f]{8}$/i.test(String(value ?? '').trim());
}
export function isGithubUserToken(value) {
    return /^(ghu_|gho_|ghp_|github_pat_)/.test(String(value ?? '').trim());
}
export function isCopilotSessionToken(value) {
    const token = String(value ?? '').trim();
    return token.startsWith('tid=') || (token.includes(';exp=') && !isGithubUserToken(token));
}
export function parseCopilotApiKey(value) {
    const key = trimmed(value);
    if (!key || key.length < 8)
        throw new Error('copilot token is empty');
    return key;
}
export function copilotIdentityHeaders() {
    return {
        'user-agent': COPILOT_USER_AGENT,
        'editor-version': COPILOT_EDITOR_VERSION,
        'editor-plugin-version': COPILOT_EDITOR_PLUGIN,
        'copilot-integration-id': COPILOT_INTEGRATION_ID,
    };
}
export function copilotDeviceSpec({ fetchFn = fetch } = {}) {
    return {
        clientId: COPILOT_CLIENT_ID,
        scope: COPILOT_SCOPE,
        deviceCodeUrl: COPILOT_DEVICE_URL,
        tokenUrl: COPILOT_TOKEN_URL,
        fetchFn,
        jsonBody: true,
        restartOnExpired: true,
        headers: {
            'user-agent': COPILOT_USER_AGENT,
        },
    };
}
export function copilotChatUrl(session) {
    const base = trimmed(session?.apiEndpoint) || COPILOT_API_ORIGIN;
    return `${base.replace(/\/$/, '')}/chat/completions`;
}
export function copilotModelsUrl(session) {
    const base = trimmed(session?.apiEndpoint) || COPILOT_API_ORIGIN;
    return `${base.replace(/\/$/, '')}/models`;
}
export function copilotSession({ accessToken, refreshToken, expiresAt, account, planType, source = 'oauth', githubToken, githubRefreshToken, apiEndpoint, } = {}) {
    const access = trimmed(accessToken);
    if (!access)
        throw new Error('copilot token endpoint returned no access token');
    const github = trimmed(githubToken) ?? (isGithubUserToken(access) ? access : undefined);
    const key = isCopilotKeySource(source);
    const refresh = trimmed(refreshToken)
        ?? trimmed(githubRefreshToken)
        ?? github
        ?? (key ? access : undefined);
    if (!refresh)
        throw new Error('copilot token endpoint returned no refresh token');
    const expiry = typeof expiresAt === 'number' && Number.isFinite(expiresAt)
        ? expiresAt
        : (key ? COPILOT_NEVER_EXPIRES : undefined);
    if (expiry === undefined)
        throw new Error('copilot token endpoint returned no usable expiry');
    return {
        accessToken: access,
        refreshToken: refresh,
        expiresAt: expiry,
        tokenEndpoint: COPILOT_TOKEN_URL,
        clientId: COPILOT_CLIENT_ID,
        account: trimmed(account) ?? copilotDefaultAccount(github ?? access),
        source: COPILOT_SOURCES.includes(source) ? source : 'oauth',
        ...(trimmed(planType) ? { planType: trimmed(planType) } : {}),
        ...(github ? { githubToken: github } : {}),
        ...(trimmed(githubRefreshToken) ? { githubRefreshToken: trimmed(githubRefreshToken) } : {}),
        ...(trimmed(apiEndpoint) ? { apiEndpoint: trimmed(apiEndpoint).replace(/\/$/, '') } : {}),
    };
}
function expiresAtOf(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        return undefined;
    return value > 1e12 ? value : value * 1000;
}
export function parseCopilotTokenPayload(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const token = trimmed(payload.token);
    if (!token)
        return undefined;
    const expiresAt = expiresAtOf(payload.expires_at)
        ?? (typeof payload.refresh_in === 'number' && payload.refresh_in > 0
            ? Date.now() + payload.refresh_in * 1000
            : undefined)
        ?? Date.now() + 25 * 60_000;
    const api = trimmed(payload.endpoints?.api);
    return {
        token,
        expiresAt,
        apiEndpoint: api ? api.replace(/\/$/, '') : COPILOT_API_ORIGIN,
    };
}
export async function exchangeCopilotToken(githubToken, { fetchFn = fetch, signal } = {}) {
    const token = trimmed(githubToken);
    if (!token)
        throw new Error('copilot GitHub token is empty');
    const response = await fetchFn(COPILOT_EXCHANGE_URL, {
        method: 'GET',
        headers: {
            accept: 'application/json',
            authorization: `token ${token}`,
            ...copilotIdentityHeaders(),
        },
        signal,
    });
    if (response.ok) {
        const parsed = parseCopilotTokenPayload(await response.json());
        if (!parsed)
            throw new Error('copilot token exchange returned no token');
        return parsed;
    }
    // OpenCode Ov23li8 `gho_` tokens 404 on copilot_internal. GA models still
    // accept the raw bearer; preview models will 400 — do not pretend otherwise.
    if (response.status === 404 && token.startsWith('gho_')) {
        return { token, expiresAt: Date.now() + 8 * 3600_000, apiEndpoint: COPILOT_API_ORIGIN };
    }
    throw await oauthError(response, 'copilot');
}
export async function completeCopilotDevice(tokens, { fetchFn = fetch } = {}) {
    const github = trimmed(tokens?.access_token);
    if (!github)
        throw new Error('copilot device flow returned no access token');
    const exchanged = await exchangeCopilotToken(github, { fetchFn });
    return copilotSession({
        accessToken: exchanged.token,
        refreshToken: trimmed(tokens.refresh_token) ?? github,
        expiresAt: exchanged.expiresAt,
        githubToken: github,
        githubRefreshToken: trimmed(tokens.refresh_token),
        apiEndpoint: exchanged.apiEndpoint,
        source: 'oauth',
    });
}
async function refreshGithubToken(session, fetchFn) {
    const refresh = trimmed(session?.githubRefreshToken) ?? (trimmed(session?.refreshToken) && !isGithubUserToken(session.refreshToken)
        ? trimmed(session.refreshToken)
        : undefined);
    if (!refresh || refresh === session?.githubToken)
        return undefined;
    const response = await fetchFn(session.tokenEndpoint ?? COPILOT_TOKEN_URL, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'user-agent': COPILOT_USER_AGENT,
        },
        body: JSON.stringify({
            client_id: session.clientId ?? COPILOT_CLIENT_ID,
            grant_type: 'refresh_token',
            refresh_token: refresh,
        }),
    });
    if (response.status === 401 || response.status === 403) {
        throw await oauthError(response, 'copilot');
    }
    if (!response.ok)
        throw await oauthError(response, 'copilot');
    const payload = await response.json();
    const access = trimmed(payload.access_token);
    if (!access)
        throw new Error('copilot GitHub refresh returned no access token');
    return {
        githubToken: access,
        githubRefreshToken: trimmed(payload.refresh_token) ?? refresh,
    };
}
export async function refreshCopilot(session, fetchFn = fetch) {
    if (!session?.githubToken && !session?.refreshToken && !session?.accessToken) {
        throw new Error('copilot session needs a GitHub token');
    }
    let github = trimmed(session.githubToken)
        ?? (isGithubUserToken(session.refreshToken) ? trimmed(session.refreshToken) : undefined)
        ?? (isGithubUserToken(session.accessToken) ? trimmed(session.accessToken) : undefined);
    let githubRefresh = trimmed(session.githubRefreshToken);
    if (!github) {
        const rotated = await refreshGithubToken(session, fetchFn);
        if (!rotated)
            throw new Error('copilot session needs a GitHub token');
        github = rotated.githubToken;
        githubRefresh = rotated.githubRefreshToken;
    }
    try {
        const exchanged = await exchangeCopilotToken(github, { fetchFn });
        return copilotSession({
            accessToken: exchanged.token,
            refreshToken: githubRefresh ?? session.refreshToken ?? github,
            expiresAt: exchanged.expiresAt,
            account: session.account,
            planType: session.planType,
            source: session.source === 'cli' || session.source === 'paste' || session.source === 'env'
                ? session.source
                : 'oauth',
            githubToken: github,
            githubRefreshToken: githubRefresh,
            apiEndpoint: exchanged.apiEndpoint,
        });
    }
    catch (error) {
        if (error instanceof OAuthEndpointError && (error.status === 401 || error.status === 403)) {
            const rotated = await refreshGithubToken({ ...session, githubToken: github, githubRefreshToken: githubRefresh }, fetchFn);
            if (!rotated)
                throw error;
            const exchanged = await exchangeCopilotToken(rotated.githubToken, { fetchFn });
            return copilotSession({
                accessToken: exchanged.token,
                refreshToken: rotated.githubRefreshToken ?? rotated.githubToken,
                expiresAt: exchanged.expiresAt,
                account: session.account,
                planType: session.planType,
                source: 'oauth',
                githubToken: rotated.githubToken,
                githubRefreshToken: rotated.githubRefreshToken,
                apiEndpoint: exchanged.apiEndpoint,
            });
        }
        throw error;
    }
}
export function isCopilotPermanentRefreshError(error) {
    if (!(error instanceof OAuthEndpointError))
        return false;
    if (error.status === 401 || error.status === 403)
        return true;
    return error.oauthCode === 'invalid_grant';
}
export function copilotUpstreamHeaders(session, cacheSessionId, extra = {}) {
    const sessionPin = copilotCacheSessionId(cacheSessionId) || COPILOT_STABLE_SESSION;
    const headers = {
        authorization: `Bearer ${session.accessToken}`,
        accept: 'application/json',
        ...copilotIdentityHeaders(),
        'openai-intent': 'conversation-edits',
        'x-github-api-version': COPILOT_API_VERSION,
        'x-interaction-id': sessionPin,
        'x-initiator': extra.initiator === 'agent' ? 'agent' : 'user',
    };
    if (extra.vision)
        headers['copilot-vision-request'] = 'true';
    return headers;
}
export function parseCopilotUser(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        return undefined;
    const login = trimmed(payload.login);
    const name = trimmed(payload.name);
    const account = login || name;
    if (!account)
        return undefined;
    return { account };
}
export async function resolveCopilotIdentity(session, { fetchFn = fetch, signal } = {}) {
    const github = trimmed(session?.githubToken)
        ?? (isGithubUserToken(session?.refreshToken) ? trimmed(session.refreshToken) : undefined)
        ?? (isGithubUserToken(session?.accessToken) ? trimmed(session.accessToken) : undefined);
    if (!github)
        return undefined;
    try {
        const response = await fetchFn(COPILOT_USER_URL, {
            headers: {
                accept: 'application/json',
                authorization: `token ${github}`,
                'user-agent': COPILOT_USER_AGENT,
            },
            signal,
        });
        if (!response.ok)
            return undefined;
        return parseCopilotUser(await response.json());
    }
    catch {
        return undefined;
    }
}
export async function mintCopilotSessionFromGithub(githubToken, { fetchFn = fetch, source = 'paste', account } = {}) {
    const github = parseCopilotApiKey(githubToken);
    const exchanged = await exchangeCopilotToken(github, { fetchFn });
    return copilotSession({
        accessToken: exchanged.token,
        refreshToken: github,
        expiresAt: exchanged.expiresAt,
        account,
        source,
        githubToken: github,
        apiEndpoint: exchanged.apiEndpoint,
    });
}
