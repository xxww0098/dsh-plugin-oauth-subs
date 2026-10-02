/**
 * Command Code（api.commandcode.ai）— 常量 + API key session + 模型目录。
 *
 * Command Code CLI `command-code@1.73.1`（npm 包 `command-code`，bin 别名
 * `cmd`/`cmdc`/`commandcode`）发：
 *
 *   GET  /alpha/whoami?limits=1
 *   GET  /alpha/billing/credits[?orgId=…]
 *   GET  /alpha/billing/subscriptions[?orgId=…]
 *   GET  /alpha/usage/summary[?orgId=…&since=…]
 *   POST /alpha/generate               ← 唯一推理入口，自有 JSONL 流协议
 *
 * 与 OpenCode Go 的 catalog 路由不同：`/alpha/generate` 不是
 * OpenAI/Anthropic 兼容端点（AI-SDK 风格 wire），所以 DSH 闭集三个 `api`
 * 都不通——走 `transport.ts` 的 JSONL hop，model 字段原样透传。
 *
 * 凭据：`COMMAND_CODE_API_KEY` 环境变量优先，其次 `~/.commandcode/auth.json`
 * 的 `apiKey`（CLI `getCommandAuthKey` 同序）。Bearer，无 refresh。
 *
 * 模型目录：CLI bundle 内置注册表（91 行，含 5 个 hidden 促销行 +
 * `MiniMaxAI/MiniMax-M3-Free` 隐藏别名——本表取 86 个可见行；另有日期门控
 * 退役行 `stealth/pixel-canary`，2026-10-01 起隐藏，已从本表删）。
 * `reasoningEfforts` 由 `kr` per-model Map 提供；`getSupportedEfforts`
 * 无该模型条目时返回 null（不发明 fallback）。`contextWindow` 缺省回填
 * CLI 默认 200000（`Ir`）。上游无 /alpha/models，目录是静态的。
 * 规划价目（CLI `rr` 表，USD/月）：individual-go $10 / individual-provider
 * $15 / individual-pro $30 / individual-pro-v1 $80 / teams-pro $40 /
 * individual-goat $70 / individual-max $150 / individual-ultra $300。
 */
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { outboundFetch } from '../../utils/outbound.js';
import { catalogRows } from '../../catalog/index.js';
export const COMMAND_CODE_API_BASE = 'https://api.commandcode.ai';
export const COMMAND_CODE_GENERATE_URL = `${COMMAND_CODE_API_BASE}/alpha/generate`;
export const COMMAND_CODE_WHOAMI_URL = `${COMMAND_CODE_API_BASE}/alpha/whoami`;
export const COMMAND_CODE_CREDITS_URL = `${COMMAND_CODE_API_BASE}/alpha/billing/credits`;
export const COMMAND_CODE_SUBSCRIPTIONS_URL = `${COMMAND_CODE_API_BASE}/alpha/billing/subscriptions`;
export const COMMAND_CODE_USAGE_URL = `${COMMAND_CODE_API_BASE}/alpha/usage/summary`;
/** CLI 发 `x-command-code-version` 的值；无 header 时上游照跑（401/计费门正常）。 */
export const COMMAND_CODE_CLI_VERSION = '1.73.1';
export const COMMAND_CODE_DEFAULT_CONTEXT = 200_000;
/** CLI `max_tokens ?? 64000` 上限；无 per-model output cap。 */
export const COMMAND_CODE_MAX_TOKENS = 64_000;
/** Static catalog. Rows live in `src/catalog/models.json` under `"command-code"`; per-model output cap comes from `COMMAND_CODE_MAX_TOKENS` at the harness seam. */
export const COMMAND_CODE_MODELS = catalogRows('command-code');
const MODEL_BY_ID = new Map(COMMAND_CODE_MODELS.map((row) => [row.id, row]));
export function commandCodeModelById(id) {
    const wanted = String(id ?? '').trim();
    return wanted ? MODEL_BY_ID.get(wanted) : undefined;
}
/**
 * API key 校验：`user_…` 前缀是 CLI 写入 auth.json 的形态，但只做长度
 * 兜底不硬绑前缀（env 里可能是派生 key）。拒绝换行 / 控制符，防止
 * 粘贴把多行 secret 拼进 Authorization。
 */
export function parseCommandCodeApiKey(input) {
    const key = typeof input === 'string' ? input.trim() : '';
    if (!key)
        throw new Error('Command Code API key is empty');
    if (/[\r\n\t]/.test(key) || key.length < 8)
        throw new Error('Command Code API key is invalid');
    return key;
}
/**
 * /alpha/whoami → session.account / planType / accountId 候选。
 * `{ success, user:{id,name,email,userName}, org:{id,…}|null }`；
 * 部分部署回 `{user:…}` 无 success 包装。身份显示优先级：userName >
 * email > name > user.id —— userName 是 CLI 登录后回显的字段。
 */
export function parseCommandCodeWhoami(payload) {
    const user = payload && typeof payload === 'object' ? payload.user : undefined;
    if (!user || typeof user !== 'object')
        return undefined;
    const id = typeof user.id === 'string' && user.id.trim() ? user.id.trim() : undefined;
    const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : undefined;
    const email = typeof user.email === 'string' && user.email.trim() ? user.email.trim() : undefined;
    const userName = typeof user.userName === 'string' && user.userName.trim() ? user.userName.trim() : undefined;
    const org = payload && typeof payload === 'object' && payload.org && typeof payload.org === 'object' ? payload.org : undefined;
    const orgId = org && typeof org.id === 'string' && org.id.trim() ? org.id.trim() : undefined;
    const account = userName ?? email ?? name ?? id;
    if (!account && !id)
        return undefined;
    return { id, name, email, userName, orgId, account };
}
/** CLI plan 价目表 `rr`（usage 面板），USD/月——键是订阅 planId 原文。 */
export const COMMAND_CODE_PLAN_CREDITS = Object.freeze({
    'individual-go': 10,
    'individual-goat': 70,
    'individual-pro': 30,
    'individual-pro-v1': 80,
    'individual-provider': 15,
    'individual-max': 150,
    'individual-ultra': 300,
    'teams-pro': 40,
});
/** CLI `or`/`Qr` 展示名（usage 面板 + getPlanDisplayName）。 */
export const COMMAND_CODE_PLAN_NAMES = Object.freeze({
    'individual-go': 'Go',
    'individual-goat': 'GOAT',
    'individual-pro': 'Pro',
    'individual-pro-v1': 'Pro',
    'individual-provider': 'Provider',
    'individual-max': 'Max',
    'individual-ultra': 'Ultra',
    'teams-pro': 'Teams Pro',
});
/** session.account / displayName 的命名空间前缀（fingerprint 兜底时）。 */
export const COMMAND_CODE_ACCOUNT_PREFIX = 'command-code';
/** Stable vault id seed that is not the raw key (sha256, not a key tail). */
export function commandCodeAccountFingerprint(key) {
    return createHash('sha256').update(String(key ?? '')).digest('hex').slice(0, 8);
}
/** Vault / card id before /alpha/whoami resolves a human identity. */
export function commandCodeDefaultAccount(key) {
    return `${COMMAND_CODE_ACCOUNT_PREFIX}-${commandCodeAccountFingerprint(key)}`;
}
export function isCommandCodeOpaqueAccount(account) {
    // Fingerprint vault ids (`command-code-<sha256:8>`) plus the keyless
    // accountIdOf fallbacks stay out of the UI — whoami replaces them.
    return /^command-code-(account|[0-9a-f]{8})$/i.test(String(account ?? '').trim());
}
export function commandCodeSession(fields = {}) {
    const accessToken = parseCommandCodeApiKey(fields.accessToken ?? fields.apiKey);
    const source = typeof fields.source === 'string' && fields.source.trim() ? fields.source.trim() : 'paste';
    const session = {
        accessToken,
        refreshToken: accessToken, // 无 refresh：对称字段存同值，TokenManager 永不真正刷新
        expiresAt: Number.MAX_SAFE_INTEGER,
        account: typeof fields.account === 'string' && fields.account.trim()
            ? fields.account.trim()
            : commandCodeDefaultAccount(accessToken),
        source,
    };
    if (typeof fields.userId === 'string' && fields.userId.trim())
        session.userId = fields.userId.trim();
    if (typeof fields.userName === 'string' && fields.userName.trim())
        session.userName = fields.userName.trim();
    if (typeof fields.email === 'string' && fields.email.trim())
        session.email = fields.email.trim();
    if (typeof fields.orgId === 'string' && fields.orgId.trim())
        session.orgId = fields.orgId.trim();
    return session;
}
export function commandCodeBearer(session) {
    return `Bearer ${session.accessToken}`;
}
/** 上游 hop 头：CLI 发 Authorization + x-command-code-version + x-cli-environment。 */
export function commandCodeUpstreamHeaders(session, extra = {}) {
    return {
        'content-type': 'application/json',
        authorization: commandCodeBearer(session),
        'x-command-code-version': COMMAND_CODE_CLI_VERSION,
        'x-cli-environment': 'production',
        ...extra,
    };
}
/* ---- credentials sources ------------------------------------------------- */
/** Env var the CLI reads first (`getCommandApiKeyFromEnv`). */
export const COMMAND_CODE_API_KEY_ENV = 'COMMAND_CODE_API_KEY';
/**
 * CLI auth dir resolves to `~/.commandcode/auth.json`
 * (`resolveCommandAuthDir` — `COMMANDCODE_HOME` is not a thing; the dir name
 * is fixed `.commandcode`).
 */
export function commandCodeAuthFilePath(home) {
    const dir = typeof home === 'string' && home.trim() ? home.trim() : homedir();
    return join(dir, '.commandcode', 'auth.json');
}
/** Masked hint for account rows that carry no friendlier account name. */
export function commandCodeKeyHint(key) {
    const text = typeof key === 'string' ? key.trim() : '';
    if (text.length <= 8)
        return text ? '••••' : '';
    return `${text.slice(0, 9)}…${text.slice(-4)}`;
}
const COMMAND_CODE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Friendly account label; opaque fingerprint/key-tail ids and raw user uuids stay out of the UI. */
export function pickCommandCodeHumanAccount(...candidates) {
    for (const candidate of candidates) {
        const text = typeof candidate === 'string' ? candidate.trim() : '';
        if (text && !isCommandCodeOpaqueAccount(text) && !COMMAND_CODE_UUID_RE.test(text))
            return text;
    }
    return undefined;
}
export function commandCodeSourceLabel(source) {
    if (source === 'env')
        return 'env';
    if (source === 'cli')
        return 'CLI';
    if (source === 'browser')
        return 'browser';
    if (source === 'paste')
        return 'key';
    return undefined;
}
/* ---- browser login (studio loopback) ------------------------------------- */
/**
 * The CLI's auth server tries ports 5959–5968 (`findAvailablePort(5959,10)`)
 * on 127.0.0.1 and the studio page GET-redirects to `/callback` carrying
 * `apiKey,userId,userName,keyName,state` — credentials arrive directly in the
 * callback, no code exchange (`buildCommandAuthUrl` + `createAuthServer`).
 */
export const COMMAND_CODE_STUDIO_URL = 'https://commandcode.ai';
export const COMMAND_CODE_CALLBACK_PATH = '/callback';
export const COMMAND_CODE_CALLBACK_PORTS = Object.freeze(Array.from({ length: 10 }, (_, index) => 5959 + index));
export const commandCodeFlow = Object.freeze({
    callbackPath: COMMAND_CODE_CALLBACK_PATH,
    listen: { host: '127.0.0.1', ports: [...COMMAND_CODE_CALLBACK_PORTS, 0] },
    buildAuthorizeUrl({ redirectUri, state }) {
        return `${COMMAND_CODE_STUDIO_URL}/studio/auth/cli`
            + `?callback=${encodeURIComponent(redirectUri)}`
            + `&state=${encodeURIComponent(state)}`
            + '&mode=redirect';
    },
    /**
     * `isCommandAuthCallbackRequest`: all four credential fields are required;
     * the engine's state check runs first, so this only sees matching attempts.
     */
    collect(url) {
        const get = (name) => url.searchParams.get(name)?.trim();
        const apiKey = get('apiKey');
        const userId = get('userId');
        const userName = get('userName');
        const keyName = get('keyName');
        if (!apiKey || !userId || !userName || !keyName)
            return undefined;
        return { apiKey, userId, userName, keyName };
    },
});
/** Browser-callback credentials → session. */
export function commandCodeSessionFromCallback(callback = {}) {
    return commandCodeSession({
        accessToken: callback.apiKey,
        userId: callback.userId,
        userName: callback.userName,
        account: callback.userName,
        source: 'browser',
    });
}
/* ---- identity + permanent-key refresh ------------------------------------- */
/**
 * `/alpha/whoami` → identity. Returns undefined on any failure (paste form
 * stores the account hint instead); never throws for quota/identity display.
 */
export async function resolveCommandCodeIdentity(session, { fetchFn = outboundFetch, signal } = {}) {
    const key = typeof session?.accessToken === 'string' ? session.accessToken.trim() : '';
    if (!key)
        return undefined;
    try {
        const response = await fetchFn(`${COMMAND_CODE_WHOAMI_URL}?limits=1`, {
            method: 'GET',
            headers: commandCodeUpstreamHeaders(session),
            signal,
        });
        if (!response.ok)
            return undefined;
        const identity = parseCommandCodeWhoami(await response.json());
        return identity?.account ? identity : undefined;
    }
    catch {
        return undefined;
    }
}
/** Permanent key: TokenManager never refreshes (expiresAt = MAX_SAFE_INTEGER). */
export async function refreshCommandCode(session) {
    if (!session || typeof session.accessToken !== 'string' || !session.accessToken.trim()) {
        throw new Error('command-code session needs an API key');
    }
    return session;
}
export function isCommandCodePermanentRefreshError() {
    return false;
}
