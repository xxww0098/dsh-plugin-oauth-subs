/**
 * Zhipu GLM Coding Plan OAuth — two providers, same ZCode CLI poll.
 *
 * Z.ai (global) and BigModel (China) are the two buttons on ZCode's welcome
 * screen. Internal CLI provider ids are `zai` and `zcode`.
 *
 *   1. POST zcode.z.ai/api/v1/oauth/cli/init  { provider: "zai"|"zcode" }
 *   2. Open data.authorize_url, poll /oauth/cli/poll/{flow_id}
 *   3. Z.ai only: POST api.z.ai/api/auth/z/login then mint id.secret
 *      BigModel: the poll JWT is the Coding Plan bearer (no biz mint)
 *
 * Chat goes to the matching Coding Plan OpenAI-compatible endpoint.
 */
import { randomBytes } from 'node:crypto';
export const GLM_CLIENT_ID = 'client_P8X5CMWmlaRO9gyO-KSqtg';
export const GLM_BIGMODEL_APP_ID = 'zcode';
export const GLM_CLI_INIT_URL = 'https://zcode.z.ai/api/v1/oauth/cli/init';
export const GLM_CLI_POLL_URL = 'https://zcode.z.ai/api/v1/oauth/cli/poll';
export const GLM_TOKEN_URL = 'https://zcode.z.ai/api/v1/oauth/token';
export const GLM_AUTHORIZE_URL = 'https://chat.z.ai/api/oauth/authorize';
export const GLM_BIGMODEL_AUTHORIZE_URL = 'https://bigmodel.cn/login';
export const GLM_BUSINESS_LOGIN_URL = 'https://api.z.ai/api/auth/z/login';
export const GLM_BIZ_BASE = 'https://api.z.ai';
export const GLM_CODING_URL = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
export const GLM_QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit';
export const GLM_KEY_NAME = 'dsh-plugin-oauth-subs';
export const GLM_USER_AGENT = 'dsh-plugin-oauth-subs/0.0.21';
export const GLM_NEVER_EXPIRES = 8.64e15;
export const GLM_CONTEXT_WINDOW = 128_000;
export const GLM_LARGE_CONTEXT = 1_000_000;
export const GLM_TURBO_CONTEXT = 200_000;
/** Text-only GLM rows. Flash is the one multimodal Coding Plan model. */
export const GLM_TEXT_INPUT = Object.freeze(['text']);
export const GLM_VISION_INPUT = Object.freeze(['text', 'image']);
export const GLM_REGIONS = Object.freeze(['zai', 'bigmodel']);
export const GLM_CLI_PROVIDERS = Object.freeze({
    zai: 'zai',
    bigmodel: 'zcode',
});
/**
 * Coding Plan catalog shown in Settings. Three rows only:
 * GLM-5.3 and GLM-5-Turbo are text; GLM-5.3-Flash is the natively
 * multimodal model (image + text). Official Flash also takes video/file;
 * llm-pi-ai / pi-ai only wire `text` and `image`.
 */
export const GLM_MODELS = Object.freeze([
    { id: 'glm-5.3', name: 'GLM-5.3', contextWindow: GLM_LARGE_CONTEXT, maxTokens: 128_000, reasoningEfforts: false, input: GLM_TEXT_INPUT },
    { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', contextWindow: GLM_LARGE_CONTEXT, maxTokens: 128_000, reasoningEfforts: false, input: GLM_VISION_INPUT },
    { id: 'glm-5-turbo', name: 'GLM-5-Turbo', contextWindow: GLM_TURBO_CONTEXT, maxTokens: 128_000, reasoningEfforts: false, input: GLM_TEXT_INPUT },
]);
export const GLM_PLAN_NAMES = Object.freeze({
    lite: 'Lite',
    pro: 'Pro',
    max: 'Max',
    coding_lite: 'Lite',
    coding_pro: 'Pro',
    coding_max: 'Max',
    individual: 'Individual',
    team: 'Team',
});
export function normalizeGlmRegion(value) {
    const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (raw === 'bigmodel' || raw === 'cn' || raw === 'zcode' || raw === 'china')
        return 'bigmodel';
    return 'zai';
}
export function glmCliProvider(region) {
    return GLM_CLI_PROVIDERS[normalizeGlmRegion(region)];
}
export function glmPlanLabel(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return undefined;
    const slug = raw.trim().toLowerCase().replace(/[_\-\s]+/g, '_');
    return GLM_PLAN_NAMES[slug] ?? raw.trim();
}
export function glmCodingUrl(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel'
        ? 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions'
        : GLM_CODING_URL;
}
export function glmQuotaUrl(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel'
        ? 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'
        : GLM_QUOTA_URL;
}
export function glmBizBase(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel' ? 'https://open.bigmodel.cn' : GLM_BIZ_BASE;
}
export function glmUpstreamHeaders(session) {
    return {
        authorization: `Bearer ${session.accessToken}`,
        accept: 'application/json',
        'user-agent': GLM_USER_AGENT,
    };
}
function jsonHeaders(extra = {}) {
    return {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': GLM_USER_AGENT,
        ...extra,
    };
}
export function isSuccessCode(code) {
    if (code == null)
        return true;
    if (typeof code === 'number')
        return code === 0 || code === 200;
    if (typeof code === 'string')
        return code === '0' || code === '200';
    return false;
}
export function unwrapEnvelope(body, operation) {
    if (body && typeof body === 'object' && ('code' in body || 'success' in body)) {
        if (body.success === false || !isSuccessCode(body.code)) {
            throw new Error(`glm ${operation} failed: ${body.msg ?? `code ${String(body.code)}`}`);
        }
        return 'data' in body ? body.data : body;
    }
    return body;
}
function trimmed(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
function tokenFrom(obj) {
    if (!obj || typeof obj !== 'object')
        return undefined;
    return trimmed(obj.access_token ?? obj.accessToken);
}
export function createPollToken() {
    return randomBytes(32).toString('hex');
}
export function parseCliInit(body) {
    const data = unwrapEnvelope(body, 'cli init') ?? {};
    const flowId = trimmed(data.flow_id ?? data.flowId);
    const authorizeUrl = trimmed(data.authorize_url ?? data.authorizeUrl);
    if (!flowId || !authorizeUrl)
        throw new Error('glm cli init is missing flow_id/authorize_url');
    const intervalSec = Number(data.poll_interval_sec ?? data.interval ?? 2);
    const expiresAt = Number(data.expires_at ?? 0);
    return {
        flowId,
        authorizeUrl,
        intervalMs: (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : 2) * 1000,
        expiresAt: Number.isFinite(expiresAt) && expiresAt > 1e12 ? expiresAt : Date.now() + 300_000,
    };
}
export function parseCliPoll(body) {
    const data = unwrapEnvelope(body, 'cli poll') ?? {};
    const status = trimmed(data.status) ?? 'pending';
    if (status !== 'ready')
        return { status, ready: false };
    const oauthAccess = tokenFrom(data.zai)
        ?? tokenFrom(data.zcode)
        ?? tokenFrom(data.bigmodel)
        ?? trimmed(data.access_token);
    if (!oauthAccess)
        throw new Error('glm cli poll ready without access token');
    const email = trimmed(data.user?.email);
    const accountId = data.user?.id != null ? String(data.user.id) : undefined;
    return {
        status: 'ready',
        ready: true,
        oauthAccess,
        zcodeJwt: trimmed(data.token),
        email,
        accountId,
    };
}
async function readJson(response, label) {
    const text = await response.text();
    if (!response.ok)
        throw new Error(`${label} failed (HTTP ${response.status})${text ? `: ${text.slice(0, 240)}` : ''}`);
    return text ? JSON.parse(text) : undefined;
}
export async function glmCliInit({ region = 'zai', fetchFn = fetch, pollToken = createPollToken() } = {}) {
    const resolved = normalizeGlmRegion(region);
    const response = await fetchFn(GLM_CLI_INIT_URL, {
        method: 'POST',
        headers: jsonHeaders({ authorization: `Bearer ${pollToken}` }),
        body: JSON.stringify({ provider: glmCliProvider(resolved) }),
    });
    const started = parseCliInit(await readJson(response, 'glm cli init'));
    return { ...started, pollToken, region: resolved };
}
export async function glmCliPoll({ flowId, pollToken, fetchFn = fetch } = {}) {
    const response = await fetchFn(`${GLM_CLI_POLL_URL}/${encodeURIComponent(flowId)}`, {
        method: 'GET',
        headers: jsonHeaders({ authorization: `Bearer ${pollToken}` }),
    });
    return parseCliPoll(await readJson(response, 'glm cli poll'));
}
async function getJson(url, headers, fetchFn) {
    return readJson(await fetchFn(url, { method: 'GET', headers }), url);
}
async function postJson(url, body, headers, fetchFn) {
    return readJson(await fetchFn(url, {
        method: 'POST',
        headers: jsonHeaders(headers),
        body: JSON.stringify(body),
    }), url);
}
export async function businessLogin(oauthAccessToken, { fetchFn = fetch, region = 'zai' } = {}) {
    const url = normalizeGlmRegion(region) === 'bigmodel'
        ? 'https://open.bigmodel.cn/api/auth/z/login'
        : GLM_BUSINESS_LOGIN_URL;
    const data = unwrapEnvelope(await postJson(url, { token: oauthAccessToken }, {}, fetchFn), 'business login');
    const bizToken = trimmed(data?.access_token ?? data?.accessToken);
    if (!bizToken)
        throw new Error('glm business login returned no access token');
    return bizToken;
}
function asKeyArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object') {
        for (const field of ['list', 'keys', 'apiKeys', 'records']) {
            if (Array.isArray(value[field]))
                return value[field];
        }
    }
    return [];
}
export async function mintGlmApiKey(oauthAccessToken, { fetchFn = fetch, region = 'zai' } = {}) {
    const bizToken = await businessLogin(oauthAccessToken, { fetchFn, region });
    const auth = { authorization: `Bearer ${bizToken}` };
    const base = glmBizBase(region);
    const customer = unwrapEnvelope(await getJson(`${base}/api/biz/customer/getCustomerInfo`, auth, fetchFn), 'customer lookup');
    const orgs = Array.isArray(customer?.organizations) ? customer.organizations : [];
    const org = orgs.find((row) => row?.isDefault) ?? orgs[0];
    const projects = Array.isArray(org?.projects) ? org.projects : [];
    const project = projects.find((row) => row?.isDefault) ?? projects[0];
    const organizationId = trimmed(org?.organizationId);
    const projectId = trimmed(project?.projectId);
    if (!organizationId || !projectId) {
        throw new Error('glm key provisioning failed: no organization/project on account');
    }
    const keysUrl = `${base}/api/biz/v1/organization/${organizationId}/projects/${projectId}/api_keys`;
    const existing = asKeyArray(unwrapEnvelope(await getJson(keysUrl, auth, fetchFn), 'api key list'))
        .find((key) => key.name === GLM_KEY_NAME);
    const keyRecord = existing ?? unwrapEnvelope(await postJson(keysUrl, { name: GLM_KEY_NAME }, auth, fetchFn), 'api key create');
    const apiKey = trimmed(keyRecord?.apiKey);
    if (!apiKey)
        throw new Error('glm key provisioning returned no apiKey');
    const copied = unwrapEnvelope(await getJson(`${keysUrl}/copy/${encodeURIComponent(apiKey)}`, auth, fetchFn), 'api key copy');
    const secretKey = trimmed(copied?.secretKey);
    if (!secretKey)
        throw new Error('glm key provisioning returned no secretKey');
    return `${apiKey}.${secretKey}`;
}
export function glmSession({ accessToken, account, accountId, planType, region = 'zai', zcodeJwt } = {}) {
    if (typeof accessToken !== 'string' || !accessToken) {
        throw new Error('glm session needs an access token');
    }
    return {
        accessToken,
        refreshToken: accessToken,
        expiresAt: GLM_NEVER_EXPIRES,
        account: account ?? accountId ?? 'glm',
        region: normalizeGlmRegion(region),
        ...(planType === undefined ? {} : { planType }),
        ...(zcodeJwt === undefined ? {} : { zcodeJwt }),
    };
}
export async function completeGlmCli(ready, { fetchFn = fetch, region = 'zai' } = {}) {
    const resolved = normalizeGlmRegion(region);
    if (resolved === 'bigmodel') {
        const accessToken = ready.zcodeJwt || ready.oauthAccess;
        if (!accessToken)
            throw new Error('glm BigModel poll ready without a token');
        return glmSession({
            accessToken,
            account: ready.email ?? ready.accountId,
            accountId: ready.accountId,
            region: resolved,
            zcodeJwt: ready.zcodeJwt,
        });
    }
    const accessToken = await mintGlmApiKey(ready.oauthAccess, { fetchFn, region: resolved });
    return glmSession({
        accessToken,
        account: ready.email ?? ready.accountId,
        accountId: ready.accountId,
        region: resolved,
        zcodeJwt: ready.zcodeJwt,
    });
}
export async function refreshGlm(session) {
    return session;
}
export function isGlmPermanentRefreshError() {
    return false;
}
