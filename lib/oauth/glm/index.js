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
import { randomBytes } from 'node:crypto';
import { decodeJwtPayload } from '../../utils/jwt.js';
import { glmCacheSessionId } from './cache.js';
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
export const GLM_ANTHROPIC_URL = 'https://api.z.ai/api/anthropic/v1/messages';
export const GLM_ANTHROPIC_VERSION = '2023-06-01';
export const GLM_QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit';
export const GLM_TOOL_USAGE_URL = 'https://api.z.ai/api/monitor/usage/tool-usage';
export const GLM_USERINFO_URL = 'https://chat.z.ai/api/oauth/userinfo';
export const GLM_BIGMODEL_USERINFO_URL = 'https://open.bigmodel.cn/api/biz/customer/getCustomerInfo';
export const GLM_KEY_NAME = 'dsh-plugin-oauth-subs';
/** CLI / site ids. Never show these as the account name on the card. Opaque poll `user.id` is `isGlmOpaqueAccount`. */
export const GLM_APP_ACCOUNTS = Object.freeze(['zcode', 'zai', 'bigmodel', 'glm']);
/** Official ZCode Desktop, latest stable (https://zcode.z.ai/en/changelog). */
export const GLM_APP_VERSION = '3.10.1';
/** Desktop UA from resources/glm/zcode.cjs (`eao`/`rao`). Do not leak this plugin. */
export const GLM_USER_AGENT = `ZCode/${GLM_APP_VERSION} ai-sdk/anthropic/3.0.81`;
/** CLI poll against zcode.z.ai — official CLI shape, not Desktop, not this plugin. */
export const GLM_CLI_USER_AGENT = `ZCode/${GLM_APP_VERSION}`;
export const GLM_REFERER = 'https://zcode.z.ai';
export const GLM_TITLE = 'Z Code';
export const GLM_AGENT = 'glm';
export const GLM_NEVER_EXPIRES = 8.64e15;
export const GLM_CONTEXT_WINDOW = 128_000;
export const GLM_LARGE_CONTEXT = 1_000_000;
export const GLM_TURBO_CONTEXT = 200_000;
/** Text-only GLM rows. Flash is the one multimodal Coding Plan model. */
export const GLM_TEXT_INPUT = Object.freeze(['text']);
export const GLM_VISION_INPUT = Object.freeze(['text', 'image']);
/**
 * GLM-5.3 / GLM-5.3-Flash thinking depth. Official docs (2026-08):
 * `reasoning_effort` is `low` / `high` / `max`, default `max`. Thinking
 * cannot be turned off — `thinking.type: disabled` 400s. No `medium`.
 * Turbo is hybrid on/off with no effort ladder.
 */
export const GLM_REASONING = Object.freeze({
    low: 'low',
    high: 'high',
    max: 'max',
});
export const GLM_REGIONS = Object.freeze(['zai', 'bigmodel']);
export const GLM_CLI_PROVIDERS = Object.freeze({
    zai: 'zai',
    bigmodel: 'bigmodel',
});
/**
 * Coding Plan catalog shown in Settings. Three rows only:
 * GLM-5.3 and GLM-5-Turbo are text; GLM-5.3-Flash is the natively
 * multimodal model (image + text). Official Flash also takes video/file;
 * llm-pi-ai / pi-ai only wire `text` and `image`.
 *
 * Thinking depth is declared here so the Harness session picker can
 * offer it. `false` means no depth control (Turbo); omitting `off`
 * means thinking cannot be disabled (5.3 / Flash).
 */
export const GLM_MODELS = Object.freeze([
    { id: 'glm-5.3', name: 'GLM-5.3', contextWindow: GLM_LARGE_CONTEXT, maxTokens: 128_000, reasoningEfforts: GLM_REASONING, input: GLM_TEXT_INPUT },
    { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', contextWindow: GLM_LARGE_CONTEXT, maxTokens: 128_000, reasoningEfforts: GLM_REASONING, input: GLM_VISION_INPUT },
    { id: 'glm-5-turbo', name: 'GLM-5-Turbo', contextWindow: GLM_TURBO_CONTEXT, maxTokens: 128_000, reasoningEfforts: false, input: GLM_TEXT_INPUT },
]);
export { GLM_BOOST_HINT, GLM_BOOST_LABEL, glmCardBoost } from './boost.js';
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
/** ZCode default protocol. https://docs.z.ai/devpack/quick-start */
export function glmAnthropicUrl(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel'
        ? 'https://open.bigmodel.cn/api/anthropic/v1/messages'
        : GLM_ANTHROPIC_URL;
}
export function glmQuotaUrl(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel'
        ? 'https://open.bigmodel.cn/api/monitor/usage/quota/limit'
        : GLM_QUOTA_URL;
}
export function glmToolUsageUrl(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel'
        ? 'https://open.bigmodel.cn/api/monitor/usage/tool-usage'
        : GLM_TOOL_USAGE_URL;
}
export function glmUserinfoUrl(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel' ? GLM_BIGMODEL_USERINFO_URL : GLM_USERINFO_URL;
}
export function isGlmAppAccount(value) {
    if (typeof value !== 'string' || !value.trim())
        return false;
    const raw = value.trim().toLowerCase();
    if (GLM_APP_ACCOUNTS.includes(raw))
        return true;
    const at = raw.lastIndexOf('@');
    if (at <= 0)
        return false;
    const head = raw.slice(0, at);
    const tail = raw.slice(at + 1);
    if ((tail === 'zai' || tail === 'bigmodel' || tail === 'zcode' || tail === 'glm')
        && GLM_APP_ACCOUNTS.includes(head)) {
        return true;
    }
    return GLM_APP_ACCOUNTS.includes(head) && (tail === 'zai' || tail === 'bigmodel');
}
/** Formatted phone (not a bare numeric uid). Used so +86… can be a card title. */
function isGlmFormattedPhone(value) {
    if (typeof value !== 'string' || !value.trim())
        return false;
    const raw = value.trim();
    if (!/^[+]?[\d\s().-]+$/.test(raw))
        return false;
    if (!/[+\s().-]/.test(raw))
        return false;
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
}
/**
 * Site ids, poll `user.id`, JWT `sub` / numeric uid, and similar opaque Zhipu
 * handles. Never a Settings card title. Emails and formatted phones pass.
 */
export function isGlmOpaqueAccount(value) {
    if (typeof value !== 'string' || !value.trim())
        return false;
    const raw = value.trim();
    if (isGlmAppAccount(raw))
        return true;
    if (raw.includes('@'))
        return false;
    if (isGlmFormattedPhone(raw))
        return false;
    if (/^\d+$/.test(raw))
        return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw))
        return true;
    if (/^[0-9a-f]{16,}$/i.test(raw))
        return true;
    return /^[A-Za-z0-9]{2,24}$/.test(raw) && /[A-Za-z]/.test(raw) && /\d/.test(raw);
}
function pickGlmPhoneAccount(...candidates) {
    for (const value of candidates) {
        if (typeof value !== 'string' || !value.trim())
            continue;
        const raw = value.trim();
        if (isGlmAppAccount(raw))
            continue;
        const digits = raw.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15 && /^\+?[\d\s().-]+$/.test(raw))
            return raw;
    }
    return undefined;
}
export function pickGlmHumanAccount(...candidates) {
    for (const value of candidates) {
        if (typeof value !== 'string' || !value.trim())
            continue;
        const trimmedValue = value.trim();
        if (isGlmOpaqueAccount(trimmedValue))
            continue;
        return trimmedValue;
    }
    return undefined;
}
export function accountFromJwt(token) {
    const payload = decodeJwtPayload(token);
    if (!payload)
        return undefined;
    return pickGlmHumanAccount(payload.email, payload.preferred_username, payload.preferredUsername, payload.username, payload.userName, payload.name);
}
function humanFromObject(value) {
    if (!value || typeof value !== 'object')
        return undefined;
    return pickGlmHumanAccount(value.email, value.mail, value.preferred_username, value.preferredUsername)
        ?? pickGlmPhoneAccount(value.phone, value.mobile)
        ?? pickGlmHumanAccount(value.customerName, value.nickName, value.nickname, value.displayName, value.name, value.username, value.userName);
}
export function glmBizBase(region = 'zai') {
    return normalizeGlmRegion(region) === 'bigmodel' ? 'https://open.bigmodel.cn' : GLM_BIZ_BASE;
}
const GLM_PROCESS_SESSION_ID = `sess_${randomBytes(12).toString('hex')}`;
function randomHex(bytes = 16) {
    return randomBytes(bytes).toString('hex');
}
/** ZCode Desktop 3.10.1 fingerprint for api.z.ai / open.bigmodel.cn Coding Plan hops. */
export function glmDesktopHeaders(sessionId) {
    return {
        'user-agent': GLM_USER_AGENT,
        'X-ZCode-App-Version': GLM_APP_VERSION,
        'X-ZCode-Agent': GLM_AGENT,
        'x-zcode-trace-id': randomHex(),
        'x-request-id': randomHex(),
        'x-session-id': glmCacheSessionId(sessionId) || GLM_PROCESS_SESSION_ID,
        'x-query-id': randomHex(),
        'HTTP-Referer': GLM_REFERER,
        referer: GLM_REFERER,
        'X-Title': GLM_TITLE,
    };
}
export function glmUpstreamHeaders(session, sessionId) {
    return {
        authorization: `Bearer ${session.accessToken}`,
        accept: 'application/json',
        ...glmDesktopHeaders(sessionId),
    };
}
export function glmAnthropicHeaders(session, sessionId) {
    return {
        ...glmUpstreamHeaders(session, sessionId),
        'anthropic-version': GLM_ANTHROPIC_VERSION,
    };
}
function codingPlanJsonHeaders(extra = {}) {
    return {
        accept: 'application/json',
        'content-type': 'application/json',
        ...glmDesktopHeaders(),
        ...extra,
    };
}
function cliJsonHeaders(extra = {}) {
    return {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': GLM_CLI_USER_AGENT,
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
    const zcodeJwt = trimmed(data.token);
    const rawAccountId = data.user?.id != null ? String(data.user.id) : undefined;
    const email = pickGlmHumanAccount(data.user?.email, data.user?.preferred_username, data.user?.preferredUsername, data.email, accountFromJwt(zcodeJwt), accountFromJwt(oauthAccess));
    // Keep a non-opaque id for vault keying only. Poll `user.id` is never a title.
    const accountId = pickGlmHumanAccount(rawAccountId);
    return {
        status: 'ready',
        ready: true,
        oauthAccess,
        zcodeJwt,
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
        headers: cliJsonHeaders({ authorization: `Bearer ${pollToken}` }),
        body: JSON.stringify({ provider: glmCliProvider(resolved) }),
    });
    const started = parseCliInit(await readJson(response, 'glm cli init'));
    return { ...started, pollToken, region: resolved };
}
export async function glmCliPoll({ flowId, pollToken, fetchFn = fetch } = {}) {
    const response = await fetchFn(`${GLM_CLI_POLL_URL}/${encodeURIComponent(flowId)}`, {
        method: 'GET',
        headers: cliJsonHeaders({ authorization: `Bearer ${pollToken}` }),
    });
    return parseCliPoll(await readJson(response, 'glm cli poll'));
}
async function getJson(url, headers, fetchFn) {
    return readJson(await fetchFn(url, {
        method: 'GET',
        headers: { accept: 'application/json', ...glmDesktopHeaders(), ...headers },
    }), url);
}
async function postJson(url, body, headers, fetchFn) {
    return readJson(await fetchFn(url, {
        method: 'POST',
        headers: codingPlanJsonHeaders(headers),
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
export function glmSession({ accessToken, account, accountId, region = 'zai', zcodeJwt } = {}) {
    if (typeof accessToken !== 'string' || !accessToken) {
        throw new Error('glm session needs an access token');
    }
    const human = pickGlmHumanAccount(account, accountFromJwt(zcodeJwt), accountFromJwt(accessToken));
    return {
        accessToken,
        refreshToken: accessToken,
        expiresAt: GLM_NEVER_EXPIRES,
        ...(human === undefined ? {} : { account: human }),
        region: normalizeGlmRegion(region),
        ...(zcodeJwt === undefined ? {} : { zcodeJwt }),
    };
}
export async function fetchGlmUserinfo(source, { fetchFn = fetch, region } = {}) {
    const resolved = normalizeGlmRegion(region ?? source?.region);
    const bearer = trimmed(source?.zcodeJwt) ?? trimmed(source?.oauthAccess) ?? trimmed(source?.accessToken);
    if (!bearer)
        return undefined;
    const urls = resolved === 'bigmodel'
        ? [GLM_BIGMODEL_USERINFO_URL]
        : [GLM_USERINFO_URL, `${GLM_BIZ_BASE}/api/biz/customer/getCustomerInfo`];
    const headers = {
        authorization: `Bearer ${bearer}`,
        accept: 'application/json',
        ...glmDesktopHeaders(),
    };
    for (const url of urls) {
        try {
            const body = await getJson(url, headers, fetchFn);
            let data;
            try {
                data = unwrapEnvelope(body, 'userinfo');
            }
            catch {
                data = body;
            }
            const human = humanFromObject(data)
                ?? humanFromObject(data?.user)
                ?? humanFromObject(data?.profile)
                ?? humanFromObject(body);
            if (human)
                return human;
        }
        catch {
            continue;
        }
    }
    return undefined;
}
export async function resolveGlmIdentity(source, { fetchFn = fetch } = {}) {
    const fromHand = pickGlmHumanAccount(source?.email, source?.account, accountFromJwt(source?.zcodeJwt), accountFromJwt(source?.accessToken), accountFromJwt(source?.oauthAccess));
    if (fromHand)
        return fromHand;
    return fetchGlmUserinfo(source, { fetchFn, region: source?.region });
}
export function displayGlmAccount(session) {
    return pickGlmHumanAccount(session?.account, accountFromJwt(session?.zcodeJwt), accountFromJwt(session?.accessToken));
}
export async function completeGlmCli(ready, { fetchFn = fetch, region = 'zai' } = {}) {
    const resolved = normalizeGlmRegion(region);
    const minted = resolved === 'bigmodel'
        ? (ready.zcodeJwt || ready.oauthAccess)
        : await mintGlmApiKey(ready.oauthAccess, { fetchFn, region: resolved });
    if (!minted)
        throw new Error(resolved === 'bigmodel'
            ? 'glm BigModel poll ready without a token'
            : 'glm key provisioning returned no apiKey');
    const account = await resolveGlmIdentity({
        email: ready.email,
        account: ready.account,
        accessToken: minted,
        oauthAccess: ready.oauthAccess,
        zcodeJwt: ready.zcodeJwt,
        region: resolved,
    }, { fetchFn });
    return glmSession({
        accessToken: minted,
        account,
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
