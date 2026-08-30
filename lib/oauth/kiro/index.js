/**
 * AWS Kiro subscription OAuth — same methods as ZyphrZero/kiro.rs:
 *   social / OAuth  portal PKCE at app.kiro.dev
 *   builder-id      AWS SSO OIDC device code (view.awsapps.com/start)
 *   idc             Enterprise IAM Identity Center (org Start URL)
 *   external_idp    Microsoft Entra / Azure AD refresh_token grant
 *   api_key         ksk_… bearer
 */
import { createHash, randomUUID } from 'node:crypto';
export const KIRO_PORTAL_URL = 'https://app.kiro.dev';
export const KIRO_AUTH_HOST = 'prod.us-east-1.auth.desktop.kiro.dev';
export const KIRO_AUTH_URL = `https://${KIRO_AUTH_HOST}`;
export const BUILDER_ID_START_URL = 'https://view.awsapps.com/start';
export const BUILDER_ID_PROFILE_ARN = 'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX';
export const SOCIAL_PROFILE_ARN = 'arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK';
export const KIRO_CALLBACK_PORTS = Object.freeze([3128, 4649, 6588, 8008, 9091, 49153, 50153, 51153, 52153, 53153]);
export const KIRO_CALLBACK_PATH = '/oauth/callback';
export const KIRO_OIDC_SCOPES = Object.freeze([
    'codewhisperer:completions',
    'codewhisperer:analysis',
    'codewhisperer:conversations',
    'codewhisperer:transformations',
    'codewhisperer:taskassist',
]);
export const KIRO_USAGE_VERSION = '0.9.2';
export const KIRO_NEVER_EXPIRES = 8.64e15;
export const KIRO_DEFAULT_REGION = 'us-east-1';
export const KIRO_CONTEXT_WINDOW = 200_000;
export const KIRO_LARGE_CONTEXT = 1_000_000;
export const KIRO_GPT_CONTEXT = 272_000;
export const KIRO_DEEPSEEK_CONTEXT = 128_000;
export const KIRO_QWEN_CONTEXT = 256_000;
export const KIRO_MAX_TOKENS = 64_000;
export const KIRO_VISION_INPUT = Object.freeze(['text', 'image']);
export const KIRO_TEXT_INPUT = Object.freeze(['text']);
export const KIRO_METHODS = Object.freeze(['social', 'idc', 'external_idp', 'api_key']);
export const KIRO_USAGE_REGIONS = Object.freeze(['us-east-1', 'eu-central-1']);
const EXTERNAL_IDP_ALIASES = Object.freeze([
    'external_idp', 'azuread', 'azure', 'entra', 'entra-id',
    'microsoft', 'm365', 'office365', 'external',
]);
const ALLOWED_IDP_SUFFIXES = Object.freeze([
    '.microsoftonline.com',
    '.microsoftonline.us',
    '.microsoftonline.cn',
]);
function kiroModel(id, name, contextWindow, input = KIRO_VISION_INPUT) {
    return { id, name, contextWindow, maxTokens: KIRO_MAX_TOKENS, input };
}
/** Kiro generateAssistantResponse ids (dots). Matches kiro.dev/docs/models, minus Auto. */
export const KIRO_MODELS = Object.freeze([
    kiroModel('gpt-5.6-sol', 'GPT-5.6 Sol', KIRO_GPT_CONTEXT),
    kiroModel('gpt-5.6-terra', 'GPT-5.6 Terra', KIRO_GPT_CONTEXT),
    kiroModel('gpt-5.6-luna', 'GPT-5.6 Luna', KIRO_GPT_CONTEXT),
    kiroModel('claude-opus-5', 'Claude Opus 5', KIRO_LARGE_CONTEXT),
    kiroModel('claude-opus-4.8', 'Claude Opus 4.8', KIRO_LARGE_CONTEXT),
    kiroModel('claude-opus-4.7', 'Claude Opus 4.7', KIRO_LARGE_CONTEXT),
    kiroModel('claude-opus-4.6', 'Claude Opus 4.6', KIRO_LARGE_CONTEXT),
    kiroModel('claude-opus-4.5', 'Claude Opus 4.5', KIRO_CONTEXT_WINDOW),
    kiroModel('claude-sonnet-5', 'Claude Sonnet 5', KIRO_LARGE_CONTEXT),
    kiroModel('claude-sonnet-4.6', 'Claude Sonnet 4.6', KIRO_LARGE_CONTEXT),
    kiroModel('claude-sonnet-4.5', 'Claude Sonnet 4.5', KIRO_CONTEXT_WINDOW),
    kiroModel('claude-sonnet-4', 'Claude Sonnet 4', KIRO_CONTEXT_WINDOW),
    kiroModel('claude-haiku-4.5', 'Claude Haiku 4.5', KIRO_CONTEXT_WINDOW),
    kiroModel('deepseek-3.2', 'DeepSeek 3.2', KIRO_DEEPSEEK_CONTEXT, KIRO_TEXT_INPUT),
    kiroModel('minimax-m2.5', 'MiniMax M2.5', KIRO_CONTEXT_WINDOW, KIRO_TEXT_INPUT),
    kiroModel('glm-5', 'GLM-5', KIRO_CONTEXT_WINDOW, KIRO_TEXT_INPUT),
    kiroModel('minimax-m2.1', 'MiniMax M2.1', KIRO_CONTEXT_WINDOW, KIRO_TEXT_INPUT),
    kiroModel('qwen3-coder-next', 'Qwen3 Coder Next', KIRO_QWEN_CONTEXT, KIRO_TEXT_INPUT),
]);
export const KIRO_PLAN_NAMES = Object.freeze({
    kiro_free: 'Free',
    kirofree: 'Free',
    free: 'Free',
    kiro_pro: 'Pro',
    kiropro: 'Pro',
    pro: 'Pro',
    'kiro_pro+': 'Pro+',
    kiro_proplus: 'Pro+',
    kiro_pro_plus: 'Pro+',
    kiroproplus: 'Pro+',
    proplus: 'Pro+',
    pro_plus: 'Pro+',
    kiro_powered: 'Powered',
    kiropowered: 'Powered',
    powered: 'Powered',
});
export function canonicalizeKiroMethod(value, { tokenEndpoint } = {}) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw && tokenEndpoint)
        return 'external_idp';
    const lower = raw.toLowerCase();
    if (lower === 'builder-id' || lower === 'builder_id' || lower === 'builder' || lower === 'iam')
        return 'idc';
    if (lower === 'api_key' || lower === 'apikey' || lower === 'ksk')
        return 'api_key';
    if (EXTERNAL_IDP_ALIASES.some((alias) => alias === lower))
        return 'external_idp';
    if (lower === 'oauth' || lower === 'github' || lower === 'google')
        return 'social';
    if (lower === 'enterprise' || lower === 'idc')
        return 'idc';
    if (KIRO_METHODS.includes(lower))
        return lower;
    if (tokenEndpoint)
        return 'external_idp';
    return raw ? lower : 'social';
}
export function kiroAccountKind(session = {}) {
    const method = canonicalizeKiroMethod(session.authMethod, { tokenEndpoint: session.tokenEndpoint });
    if (method === 'external_idp')
        return 'entra';
    if (method === 'api_key')
        return 'key';
    if (method === 'idc') {
        const start = trimmed(session.startUrl);
        const provider = trimmed(session.kiroProvider);
        if (provider === 'Enterprise' || (start && start !== BUILDER_ID_START_URL))
            return 'idc';
        return 'builder';
    }
    return 'social';
}
export function kiroMethodLabel(methodOrSession) {
    if (methodOrSession && typeof methodOrSession === 'object') {
        const kind = kiroAccountKind(methodOrSession);
        if (kind === 'builder')
            return 'Builder';
        if (kind === 'idc')
            return 'IdC';
        if (kind === 'entra')
            return 'Entra';
        if (kind === 'key')
            return 'API key';
        return 'Social';
    }
    switch (canonicalizeKiroMethod(methodOrSession)) {
        case 'idc': return 'IdC';
        case 'external_idp': return 'Entra';
        case 'api_key': return 'API key';
        default: return 'Social';
    }
}
export function kiroAccountId(session = {}) {
    const kind = kiroAccountKind(session);
    const account = trimmed(session.account) || trimmed(session.email);
    if (account && account.includes('@'))
        return `${account}@${kind}`;
    const seed = session.kiroApiKey || session.refreshToken || session.accessToken || session.clientId || '';
    const tail = String(seed).replace(/[^A-Za-z0-9]/g, '').slice(-10) || kind;
    return `${tail}@${kind}`;
}
export function oidcEndpoint(region = KIRO_DEFAULT_REGION) {
    return `https://oidc.${region || KIRO_DEFAULT_REGION}.amazonaws.com`;
}
export function kiroUsageHost(region = KIRO_DEFAULT_REGION) {
    return `q.${region || KIRO_DEFAULT_REGION}.amazonaws.com`;
}
export function kiroUsageRegions(session = {}) {
    const region = String(session.authRegion || session.apiRegion || session.region || KIRO_DEFAULT_REGION);
    if (region === 'eu-central-1' || region.startsWith('eu-'))
        return ['eu-central-1', 'us-east-1'];
    return ['us-east-1', 'eu-central-1'];
}
export function kiroUsageUrl(region, profileArn) {
    const host = kiroUsageHost(region);
    const base = `https://${host}/getUsageLimits?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST&isEmailRequired=true`;
    const arn = typeof profileArn === 'string' && profileArn.trim() ? profileArn.trim() : '';
    return arn ? `${base}&profileArn=${encodeURIComponent(arn)}` : base;
}
export function validateKiroIdpEndpoint(raw) {
    let url;
    try {
        url = new URL(String(raw ?? '').trim());
    }
    catch {
        throw new Error('kiro enterprise SSO token endpoint is not a URL');
    }
    if (url.protocol !== 'https:')
        throw new Error('kiro enterprise SSO token endpoint must be https');
    const host = url.hostname.toLowerCase();
    if (!host || /^\d/.test(host) || host.includes(':')) {
        throw new Error('kiro enterprise SSO token endpoint host is not allowed');
    }
    if (!ALLOWED_IDP_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length)) {
        throw new Error('kiro enterprise SSO token endpoint must be a microsoftonline host');
    }
    return url.toString();
}
export function validateKiroRefreshToken(value) {
    const token = trimmed(value);
    if (!token)
        throw new Error('kiro refresh token is empty');
    if (token.length < 100 || token.includes('...')) {
        throw new Error(`kiro refresh token looks truncated (${token.length} chars)`);
    }
    return token;
}
export function validateKiroApiKey(value) {
    const key = trimmed(value);
    if (!key)
        throw new Error('kiro API key is empty');
    if (!key.startsWith('ksk_') || key.length < 12)
        throw new Error('kiro API key must start with ksk_');
    return key;
}
export function kiroMachineId(session = {}) {
    const stored = trimmed(session.machineId);
    if (stored && /^[0-9a-f]{64}$/i.test(stored))
        return stored;
    const method = canonicalizeKiroMethod(session.authMethod, { tokenEndpoint: session.tokenEndpoint });
    const seed = method === 'api_key'
        ? (session.kiroApiKey || session.accessToken)
        : session.refreshToken;
    const prefix = method === 'api_key' ? 'KiroAPIKey/' : 'KotlinNativeAPI/';
    return createHash('sha256').update(prefix + String(seed || randomUUID())).digest('hex');
}
function usageUserAgent(session) {
    const machine = kiroMachineId(session);
    const os = process.platform === 'darwin' ? 'macos' : process.platform;
    return `aws-sdk-js/1.0.0 ua/2.1 os/${os} lang/js md/nodejs#${process.version} api/codewhispererruntime#1.0.0 m/N,E KiroIDE-${KIRO_USAGE_VERSION}-${machine}`;
}
export function kiroTokenTypeHeader(session) {
    const method = canonicalizeKiroMethod(session?.authMethod, { tokenEndpoint: session?.tokenEndpoint });
    if (method === 'api_key')
        return 'API_KEY';
    if (method === 'external_idp')
        return 'EXTERNAL_IDP';
    return undefined;
}
export function kiroEffectiveProfileArn(session) {
    const arn = typeof session?.profileArn === 'string' ? session.profileArn.trim() : '';
    if (!arn || arn === BUILDER_ID_PROFILE_ARN)
        return undefined;
    return arn;
}
export function kiroStreamingProfileArn(session) {
    const method = canonicalizeKiroMethod(session?.authMethod, { tokenEndpoint: session?.tokenEndpoint });
    if (method === 'api_key')
        return undefined;
    if (typeof session?.profileArn === 'string' && session.profileArn.trim())
        return session.profileArn.trim();
    return method === 'social' ? SOCIAL_PROFILE_ARN : BUILDER_ID_PROFILE_ARN;
}
export function kiroUsageHeaders(session) {
    const machine = kiroMachineId(session);
    const headers = {
        authorization: `Bearer ${session.accessToken}`,
        accept: 'application/json',
        'user-agent': usageUserAgent(session),
        'x-amz-user-agent': `aws-sdk-js/1.0.0 KiroIDE-${KIRO_USAGE_VERSION}-${machine}`,
        'amz-sdk-invocation-id': randomUUID(),
        'amz-sdk-request': 'attempt=1; max=1',
    };
    const tokenType = kiroTokenTypeHeader(session);
    if (tokenType)
        headers.tokentype = tokenType;
    return headers;
}
/** Portal + token exchange both register origin only; KiroIDE still lands on `/oauth/callback`. */
export function kiroSocialRedirectUri(redirectUri) {
    const url = new URL(String(redirectUri ?? ''));
    return `${url.protocol}//${url.host}`;
}
function kiroSocialClientAgent(session = {}) {
    return `KiroIDE-${KIRO_USAGE_VERSION}-${kiroMachineId(session)}`;
}
export function kiroSocialFlow() {
    return {
        listen: { host: '127.0.0.1', ports: [...KIRO_CALLBACK_PORTS] },
        callbackPath: KIRO_CALLBACK_PATH,
        buildAuthorizeUrl(input) {
            const params = new URLSearchParams({
                state: input.state,
                code_challenge: input.pkce.challenge,
                code_challenge_method: 'S256',
                redirect_uri: kiroSocialRedirectUri(input.redirectUri),
                redirect_from: 'KiroIDE',
            });
            return `${KIRO_PORTAL_URL}/signin?${params}`;
        },
    };
}
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function expiresAtOf(value, fallbackSec = 3600) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 1e12)
        return value;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Date.now() + (value > 1e6 ? value : value * 1000);
    }
    if (typeof value === 'string' && value.trim()) {
        const stamp = Date.parse(value);
        if (Number.isFinite(stamp))
            return stamp;
    }
    return Date.now() + fallbackSec * 1000;
}
export function kiroSession(fields = {}) {
    const method = canonicalizeKiroMethod(fields.authMethod, { tokenEndpoint: fields.tokenEndpoint });
    const kiroApiKey = method === 'api_key' ? (trimmed(fields.kiroApiKey) || trimmed(fields.accessToken)) : undefined;
    const accessToken = trimmed(fields.accessToken) || kiroApiKey;
    const refreshToken = trimmed(fields.refreshToken) || accessToken;
    if (method === 'api_key') {
        if (!accessToken)
            throw new Error('kiro session needs an API key');
    }
    else if (!refreshToken) {
        throw new Error('kiro session needs an access token or refresh token');
    }
    const region = trimmed(fields.region) || trimmed(fields.authRegion) || KIRO_DEFAULT_REGION;
    const account = trimmed(fields.account) || trimmed(fields.email);
    const draft = {
        accessToken: accessToken || refreshToken,
        refreshToken,
        expiresAt: method === 'api_key' ? KIRO_NEVER_EXPIRES : expiresAtOf(fields.expiresAt, fields.expiresIn),
        account,
        authMethod: method,
        kiroProvider: trimmed(fields.kiroProvider) || trimmed(fields.provider),
        planType: trimmed(fields.planType) || trimmed(fields.subscriptionTitle),
        profileArn: trimmed(fields.profileArn),
        clientId: trimmed(fields.clientId),
        clientSecret: trimmed(fields.clientSecret),
        startUrl: trimmed(fields.startUrl),
        tokenEndpoint: trimmed(fields.tokenEndpoint),
        issuerUrl: trimmed(fields.issuerUrl),
        scopes: trimmed(fields.scopes),
        region,
        authRegion: trimmed(fields.authRegion) || region,
        apiRegion: trimmed(fields.apiRegion) || region,
        kiroApiKey: method === 'api_key' ? accessToken : undefined,
    };
    if (!draft.account)
        draft.account = method === 'api_key' ? 'api-key' : kiroMethodLabel(draft);
    draft.machineId = trimmed(fields.machineId) || kiroMachineId(draft);
    return draft;
}
async function readJson(response, label) {
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`);
    }
    return text ? JSON.parse(text) : {};
}
export async function exchangeKiroSocialCode(code, verifier, redirectUri, { fetchFn = fetch } = {}) {
    const machineId = kiroMachineId();
    const response = await fetchFn(`${KIRO_AUTH_URL}/oauth/token`, {
        method: 'POST',
        headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'user-agent': kiroSocialClientAgent({ machineId }),
        },
        body: JSON.stringify({
            code,
            code_verifier: verifier,
            redirect_uri: kiroSocialRedirectUri(redirectUri),
        }),
    });
    const body = await readJson(response, 'kiro social token');
    const accessToken = trimmed(body.accessToken ?? body.access_token);
    if (!accessToken)
        throw new Error('kiro social token exchange returned no access_token');
    return kiroSession({
        accessToken,
        refreshToken: body.refreshToken ?? body.refresh_token,
        expiresAt: body.expiresAt ?? body.expires_at,
        expiresIn: body.expiresIn ?? body.expires_in,
        profileArn: body.profileArn ?? body.profile_arn ?? SOCIAL_PROFILE_ARN,
        authMethod: 'social',
        kiroProvider: 'Social',
        machineId,
    });
}
export async function refreshKiroSocial(session, { fetchFn = fetch } = {}) {
    const refreshToken = validateKiroRefreshToken(session.refreshToken);
    const region = session.authRegion || session.region || KIRO_DEFAULT_REGION;
    const host = `prod.${region}.auth.desktop.kiro.dev`;
    const response = await fetchFn(`https://${host}/refreshToken`, {
        method: 'POST',
        headers: {
            accept: 'application/json, text/plain, */*',
            'content-type': 'application/json',
            'user-agent': kiroSocialClientAgent(session),
        },
        body: JSON.stringify({ refreshToken }),
    });
    const body = await readJson(response, 'kiro social refresh');
    return kiroSession({
        ...session,
        accessToken: body.accessToken ?? body.access_token,
        refreshToken: body.refreshToken ?? body.refresh_token ?? refreshToken,
        expiresIn: body.expiresIn ?? body.expires_in,
        profileArn: body.profileArn ?? body.profile_arn ?? session.profileArn,
        authMethod: 'social',
    });
}
export async function refreshKiroIdc(session, { fetchFn = fetch } = {}) {
    const refreshToken = validateKiroRefreshToken(session.refreshToken);
    const region = session.authRegion || session.region || KIRO_DEFAULT_REGION;
    const response = await fetchFn(`${oidcEndpoint(region)}/token`, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'user-agent': 'aws-sdk-js/3.980.0 KiroIDE',
            'x-amz-user-agent': 'aws-sdk-js/3.980.0 KiroIDE',
        },
        body: JSON.stringify({
            clientId: session.clientId,
            clientSecret: session.clientSecret,
            refreshToken,
            grantType: 'refresh_token',
        }),
    });
    const body = await readJson(response, 'kiro idc refresh');
    return kiroSession({
        ...session,
        accessToken: body.accessToken ?? body.access_token,
        refreshToken: body.refreshToken ?? body.refresh_token ?? refreshToken,
        expiresIn: body.expiresIn ?? body.expires_in,
        profileArn: body.profileArn ?? body.profile_arn ?? session.profileArn,
        authMethod: 'idc',
    });
}
export async function refreshKiroExternalIdp(session, { fetchFn = fetch } = {}) {
    const tokenEndpoint = validateKiroIdpEndpoint(session.tokenEndpoint);
    const refreshToken = validateKiroRefreshToken(session.refreshToken);
    if (!trimmed(session.clientId))
        throw new Error('kiro enterprise SSO needs a client id');
    const form = new URLSearchParams({
        client_id: session.clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });
    if (session.scopes)
        form.set('scope', session.scopes);
    const response = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
    });
    const body = await readJson(response, 'kiro enterprise SSO refresh');
    const accessToken = trimmed(body.access_token ?? body.accessToken);
    if (!accessToken)
        throw new Error('kiro enterprise SSO refresh returned no access_token');
    return kiroSession({
        ...session,
        accessToken,
        refreshToken: body.refresh_token ?? body.refreshToken ?? refreshToken,
        expiresIn: body.expires_in ?? body.expiresIn,
        authMethod: 'external_idp',
    });
}
export async function refreshKiro(session, { fetchFn = fetch } = {}) {
    const method = canonicalizeKiroMethod(session?.authMethod, { tokenEndpoint: session?.tokenEndpoint });
    if (method === 'api_key')
        return session;
    if (method === 'external_idp')
        return refreshKiroExternalIdp(session, { fetchFn });
    if (method === 'idc')
        return refreshKiroIdc(session, { fetchFn });
    return refreshKiroSocial(session, { fetchFn });
}
export function isKiroPermanentRefreshError(error) {
    const text = error instanceof Error ? error.message : String(error);
    return /invalid_grant|Invalid refresh token/i.test(text);
}
export function isKiroCredential(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return false;
    if (trimmed(raw.kiroApiKey ?? raw.kiro_api_key))
        return true;
    const method = raw.authMethod ?? raw.auth_method;
    if (typeof method === 'string' && method.trim())
        return true;
    const arn = raw.profileArn ?? raw.profile_arn;
    if (typeof arn === 'string' && arn.includes('codewhisperer'))
        return true;
    const endpoint = raw.tokenEndpoint ?? raw.token_endpoint;
    if (typeof endpoint === 'string' && endpoint.includes('microsoftonline'))
        return true;
    const start = raw.startUrl ?? raw.start_url;
    if (typeof start === 'string' && /awsapps\.com\/start/i.test(start) && (raw.clientId || raw.client_id))
        return true;
    return false;
}
export function kiroSessionFromImport(raw) {
    if (!raw || typeof raw !== 'object')
        throw new Error('kiro credential is not an object');
    const kiroApiKey = trimmed(raw.kiroApiKey ?? raw.kiro_api_key);
    const method = canonicalizeKiroMethod(raw.authMethod ?? raw.auth_method, {
        tokenEndpoint: raw.tokenEndpoint ?? raw.token_endpoint,
    });
    if (method === 'api_key' || kiroApiKey) {
        return kiroSession({
            accessToken: validateKiroApiKey(kiroApiKey || raw.accessToken || raw.access_token),
            kiroApiKey,
            authMethod: 'api_key',
            account: trimmed(raw.email) || trimmed(raw.account) || 'api-key',
            planType: raw.subscriptionTitle ?? raw.subscription_title ?? raw.planType,
        });
    }
    if (method === 'external_idp') {
        validateKiroIdpEndpoint(raw.tokenEndpoint ?? raw.token_endpoint);
    }
    const refresh = raw.refreshToken ?? raw.refresh_token;
    if (refresh)
        validateKiroRefreshToken(refresh);
    return kiroSession({
        accessToken: raw.accessToken ?? raw.access_token,
        refreshToken: refresh,
        expiresAt: raw.expiresAt ?? raw.expires_at,
        account: raw.email ?? raw.account,
        authMethod: method,
        kiroProvider: raw.provider,
        planType: raw.subscriptionTitle ?? raw.subscription_title ?? raw.planType,
        profileArn: raw.profileArn ?? raw.profile_arn,
        clientId: raw.clientId ?? raw.client_id,
        clientSecret: raw.clientSecret ?? raw.client_secret,
        startUrl: raw.startUrl ?? raw.start_url,
        tokenEndpoint: raw.tokenEndpoint ?? raw.token_endpoint,
        issuerUrl: raw.issuerUrl ?? raw.issuer_url,
        scopes: raw.scopes,
        region: raw.region,
        authRegion: raw.authRegion ?? raw.auth_region,
        apiRegion: raw.apiRegion ?? raw.api_region,
        machineId: raw.machineId ?? raw.machine_id,
    });
}
