/**
 * Cursor subscription family. Auth is PKCE loginDeepControl + poll, or
 * local CLI Keychain / IDE state.vscdb reuse. Chat is Connect/protobuf
 * AgentService/Run — not OpenAI REST. Fingerprint is the official CLI
 * (`cli-2026.05.01-eea359f` from pi-cursor h2-session / config), not
 * the desktop IDE.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { decodeJwtPayload } from '../../utils/jwt.js';
import { isCursorRefreshKnownBad, markCursorRefreshFailed, markCursorRefreshSucceeded } from './refresh-guard.js';
export const CURSOR_LOGIN_URL = 'https://cursor.com/loginDeepControl';
export const CURSOR_POLL_URL = 'https://api2.cursor.sh/auth/poll';
export const CURSOR_REFRESH_URL = 'https://api2.cursor.sh/auth/exchange_user_api_key';
export const CURSOR_AGENT_URL = 'https://agentn.us.api5.cursor.sh';
export const CURSOR_API2_URL = 'https://api2.cursor.sh';
export const CURSOR_USAGE_PATH = '/aiserver.v1.DashboardService/GetCurrentPeriodUsage';
export const CURSOR_USAGE_URL = `${CURSOR_API2_URL}${CURSOR_USAGE_PATH}`;
export const CURSOR_STRIPE_PROFILE_URL = `${CURSOR_API2_URL}/auth/full_stripe_profile`;
export const CURSOR_GET_EMAIL_PATH = '/aiserver.v1.AuthService/GetEmail';
export const CURSOR_GET_EMAIL_URL = `${CURSOR_API2_URL}${CURSOR_GET_EMAIL_PATH}`;
export const CURSOR_GET_ME_PATH = '/aiserver.v1.DashboardService/GetMe';
export const CURSOR_GET_ME_URL = `${CURSOR_API2_URL}${CURSOR_GET_ME_PATH}`;
export const CURSOR_RUN_PATH = '/agent.v1.AgentService/Run';
export const CURSOR_MODELS_PATH = '/agent.v1.AgentService/GetUsableModels';
export const CURSOR_AVAILABLE_MODELS_PATH = '/aiserver.v1.AiService/AvailableModels';
export const CURSOR_CLIENT_VERSION = 'cli-2026.05.01-eea359f';
export const CURSOR_CLIENT_TYPE = 'cli';
export const CURSOR_PREEMPT_MS = 5 * 60_000;
export const CURSOR_POLL_MAX_ATTEMPTS = 150;
export const CURSOR_POLL_BASE_DELAY_MS = 1000;
export const CURSOR_POLL_MAX_DELAY_MS = 10_000;
export const CURSOR_POLL_BACKOFF = 1.2;
export const CURSOR_PLAN_NAMES = Object.freeze({
    free: 'Free',
    hobby: 'Hobby',
    pro: 'Pro',
    proplus: 'Pro+',
    'pro+': 'Pro+',
    pro_plus: 'Pro+',
    business: 'Business',
    team: 'Team',
    ultra: 'Ultra',
    enterprise: 'Enterprise',
});
export const CURSOR_REASONING = Object.freeze({
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'extra-high',
});
const CURSOR_VISION = Object.freeze(['text', 'image']);
function cursorModel(id, name, contextWindow, maxTokens, reasoningEfforts = CURSOR_REASONING) {
    return { id, name, contextWindow, maxTokens, input: CURSOR_VISION, reasoningEfforts };
}
/** Static fallback so the picker is not empty offline. Live GetUsableModels may add more. */
export const CURSOR_MODELS = Object.freeze([
    cursorModel('composer-2', 'Composer 2', 200_000, 64_000),
    cursorModel('composer-1.5', 'Composer 1.5', 200_000, 64_000),
    cursorModel('claude-sonnet-5', 'Claude Sonnet 5', 200_000, 64_000),
    cursorModel('gpt-5.5', 'GPT-5.5', 200_000, 128_000),
    cursorModel('grok-4.5', 'Grok 4.5', 200_000, 64_000),
]);
export const CURSOR_SOURCES = Object.freeze(['pkce', 'cli_keychain', 'ide_vscdb', 'env']);
export function cursorSourceLabel(source, locale = 'en') {
    const key = String(source ?? '').trim();
    if (key === 'cli_keychain')
        return 'CLI';
    if (key === 'ide_vscdb')
        return 'IDE';
    if (key === 'env')
        return 'env';
    if (key === 'pkce')
        return 'PKCE';
    return locale === 'zh' ? undefined : undefined;
}
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
export function cursorClientVersion() {
    return trimmed(process.env.PI_CURSOR_CLIENT_VERSION) || CURSOR_CLIENT_VERSION;
}
export function cursorAgentUrl() {
    return trimmed(process.env.PI_CURSOR_AGENT_URL)
        || trimmed(process.env.CURSOR_AGENT_URL)
        || CURSOR_AGENT_URL;
}
export function cursorTokenExpiry(token, now = Date.now()) {
    const payload = decodeJwtPayload(token);
    if (payload && typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
        return payload.exp * 1000 - CURSOR_PREEMPT_MS;
    }
    return now + 60 * 60_000;
}
/** JWT `sub` / WorkOS / Auth0 / the literal `cursor` — vault keys only, never a card title. */
export function isCursorOpaqueAccount(value) {
    if (typeof value !== 'string' || !value.trim())
        return true;
    const raw = value.trim();
    if (raw.toLowerCase() === 'cursor')
        return true;
    if (/^cursor-[A-Za-z0-9_-]{4,}$/i.test(raw))
        return true;
    if (/^[A-Za-z0-9._-]+\|[A-Za-z0-9._-]+$/.test(raw) && !raw.includes('@'))
        return true;
    if (/^user_[A-Za-z0-9]{16,}$/i.test(raw))
        return true;
    return false;
}
export function pickCursorHumanAccount(...candidates) {
    for (const value of candidates) {
        const next = trimmed(value);
        if (!next || isCursorOpaqueAccount(next))
            continue;
        return next;
    }
    return undefined;
}
export function cursorAccountFromToken(token) {
    const payload = decodeJwtPayload(token);
    if (!payload)
        return undefined;
    return pickCursorHumanAccount(payload.email, payload.preferred_username);
}
function cursorVaultAccountFromToken(token) {
    const payload = decodeJwtPayload(token);
    return payload ? trimmed(payload.sub) : undefined;
}
export function displayCursorAccount(session) {
    return pickCursorHumanAccount(session?.account, session?.cachedEmail, cursorAccountFromToken(session?.accessToken));
}
/** GetEmail `{ email }` or GetMe `{ email, firstName, lastName }`. Email wins. */
export function cursorNameFromProfile(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const email = pickCursorHumanAccount(value.email);
    if (email)
        return email;
    const first = trimmed(value.firstName);
    const last = trimmed(value.lastName);
    const combined = [first, last].filter(Boolean).join(' ');
    return pickCursorHumanAccount(combined);
}
export function cursorMembershipFromStripe(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    const individual = trimmed(value.individualMembershipType);
    const membership = trimmed(value.membershipType);
    return individual || membership;
}
export function cursorAccessStillValid(token, now = Date.now()) {
    if (typeof token !== 'string' || !token.trim())
        return false;
    return now < cursorTokenExpiry(token, now);
}
export function createCursorPkce() {
    const verifier = randomBytes(96).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
}
export function cursorLoginParams({ verifier, challenge, uuid } = {}) {
    const pkce = verifier && challenge ? { verifier, challenge } : createCursorPkce();
    const id = trimmed(uuid) || randomUUID();
    const params = new URLSearchParams({
        challenge: pkce.challenge,
        uuid: id,
        mode: 'login',
        redirectTarget: 'cli',
    });
    return {
        verifier: pkce.verifier,
        challenge: pkce.challenge,
        uuid: id,
        loginUrl: `${CURSOR_LOGIN_URL}?${params.toString()}`,
    };
}
export function parseCursorTokenResponse(value, endpoint = 'Cursor token') {
    if (!value || typeof value !== 'object')
        throw new Error(`${endpoint} returned an invalid token response`);
    const accessToken = trimmed(value.accessToken) ?? trimmed(value.access);
    if (!accessToken)
        throw new Error(`${endpoint} returned no access token`);
    const refreshToken = trimmed(value.refreshToken) ?? trimmed(value.refresh);
    return { accessToken, refreshToken };
}
export function cursorSession({ accessToken, refreshToken, expiresAt, account, planType, cachedEmail, source = 'pkce', } = {}) {
    if (!trimmed(accessToken))
        throw new Error('cursor session needs an access token');
    const refresh = trimmed(refreshToken) ?? accessToken;
    const resolvedExpiry = typeof expiresAt === 'number' && Number.isFinite(expiresAt)
        ? expiresAt
        : cursorTokenExpiry(accessToken);
    const cached = pickCursorHumanAccount(cachedEmail);
    const human = pickCursorHumanAccount(account, cursorAccountFromToken(accessToken));
    const vault = human
        ?? (trimmed(account) && trimmed(account).toLowerCase() !== 'cursor' ? trimmed(account) : undefined)
        ?? cursorVaultAccountFromToken(accessToken);
    return {
        accessToken,
        refreshToken: refresh,
        expiresAt: resolvedExpiry,
        ...(vault ? { account: vault } : {}),
        source: CURSOR_SOURCES.includes(source) ? source : 'pkce',
        ...(trimmed(planType) ? { planType: planType.trim() } : {}),
        ...(cached ? { cachedEmail: cached } : {}),
    };
}
export function cursorChatHeaders(session, { unary = false, requestId } = {}) {
    return {
        authorization: `Bearer ${session.accessToken}`,
        'connect-protocol-version': '1',
        'content-type': unary ? 'application/proto' : 'application/connect+proto',
        te: 'trailers',
        'x-ghost-mode': 'true',
        'x-cursor-client-version': cursorClientVersion(),
        'x-cursor-client-type': CURSOR_CLIENT_TYPE,
        'x-request-id': requestId || randomUUID(),
    };
}
export function cursorUsageHeaders(session) {
    return {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
        'x-cursor-client-version': cursorClientVersion(),
        'x-cursor-client-type': CURSOR_CLIENT_TYPE,
    };
}
export async function pollCursorAuth(uuid, verifier, { fetchFn = fetch, sleep, signal, maxAttempts = CURSOR_POLL_MAX_ATTEMPTS } = {}) {
    const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    let delay = CURSOR_POLL_BASE_DELAY_MS;
    let consecutiveErrors = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted)
            throw new Error('login cancelled');
        await wait(delay, signal);
        if (signal?.aborted)
            throw new Error('login cancelled');
        try {
            const response = await fetchFn(`${CURSOR_POLL_URL}?uuid=${encodeURIComponent(uuid)}&verifier=${encodeURIComponent(verifier)}`, {
                signal,
            });
            if (response.status === 404) {
                consecutiveErrors = 0;
                delay = Math.min(delay * CURSOR_POLL_BACKOFF, CURSOR_POLL_MAX_DELAY_MS);
                continue;
            }
            if (response.ok) {
                const data = parseCursorTokenResponse(await response.json(), 'Cursor authentication polling');
                if (!data.refreshToken)
                    throw new Error('Cursor authentication polling returned no refresh token');
                return data;
            }
            throw new Error(`Poll failed: ${response.status}`);
        }
        catch (error) {
            if (signal?.aborted || (error instanceof Error && error.message === 'login cancelled')) {
                throw new Error('login cancelled');
            }
            consecutiveErrors += 1;
            if (consecutiveErrors >= 3) {
                throw error instanceof Error ? error : new Error(String(error));
            }
        }
    }
    throw new Error('Cursor authentication polling timeout');
}
export async function refreshCursorTokens(refreshToken, { fetchFn = fetch, signal } = {}) {
    const token = trimmed(refreshToken);
    if (!token)
        throw new Error('cursor refresh needs a refresh token');
    if (isCursorRefreshKnownBad(token))
        throw new Error('Cursor token refresh failed: known-bad refresh token');
    const response = await fetchFn(CURSOR_REFRESH_URL, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: '{}',
        signal,
    });
    if (!response.ok) {
        markCursorRefreshFailed(token);
        throw new Error(`Cursor token refresh failed: ${response.status}`);
    }
    const data = parseCursorTokenResponse(await response.json(), 'Cursor token refresh');
    markCursorRefreshSucceeded(token);
    return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || token,
        expiresAt: cursorTokenExpiry(data.accessToken),
    };
}
export async function refreshCursor(session, fetchFn = fetch) {
    if (session?.source === 'env' || session?.refreshToken === session?.accessToken) {
        if (cursorAccessStillValid(session.accessToken))
            return session;
        const error = new Error('Cursor env token expired; sign in again');
        error.permanent = true;
        throw error;
    }
    const tokens = await refreshCursorTokens(session.refreshToken, { fetchFn });
    return cursorSession({
        ...tokens,
        account: session.account,
        planType: session.planType,
        cachedEmail: session.cachedEmail,
        source: session.source,
    });
}
export function isCursorPermanentRefreshError(error) {
    if (error?.permanent === true)
        return true;
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /401|403|invalid refresh|expired; sign in again|known-bad refresh/i.test(message);
}
export async function completeCursorLogin(tokens, { source = 'pkce' } = {}) {
    return cursorSession({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt ?? cursorTokenExpiry(tokens.accessToken),
        account: tokens.account,
        source,
    });
}
