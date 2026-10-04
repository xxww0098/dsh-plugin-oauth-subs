/**
 * Command Code（api.commandcode.ai）— 常量 + API key session + 模型目录。
 *
 * Command Code CLI `command-code@1.74.1`（npm 包 `command-code`，bin 别名
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
 * 模型目录：CLI bundle 内置注册表（1.74.1 为 92 行，含 6 个 hidden 促销 /
 * 别名行——本表取 86 个可见行；另有日期门控退役行 `stealth/pixel-canary`，
 * 2026-10-01 起隐藏，已从本表删）。`reasoningEfforts` 取注册表行自带的
 * 列表；bundle 另有一张 effort Map，只在行缺该字段时回退，没有条目就不发明
 * fallback。`contextWindow` 缺省回填 CLI 默认 200000。上游无 /alpha/models，
 * 目录是静态的。
 * 规划价目（CLI `rr` 表，USD/月）：individual-go $10 / individual-provider
 * $15 / individual-pro $30 / individual-pro-v1 $80 / teams-pro $40 /
 * individual-goat $70 / individual-max $150 / individual-ultra $300。
 */
export declare const COMMAND_CODE_API_BASE = "https://api.commandcode.ai";
export declare const COMMAND_CODE_GENERATE_URL = "https://api.commandcode.ai/alpha/generate";
export declare const COMMAND_CODE_WHOAMI_URL = "https://api.commandcode.ai/alpha/whoami";
export declare const COMMAND_CODE_CREDITS_URL = "https://api.commandcode.ai/alpha/billing/credits";
export declare const COMMAND_CODE_SUBSCRIPTIONS_URL = "https://api.commandcode.ai/alpha/billing/subscriptions";
export declare const COMMAND_CODE_USAGE_URL = "https://api.commandcode.ai/alpha/usage/summary";
/** CLI 发 `x-command-code-version` 的值；无 header 时上游照跑（401/计费门正常）。 */
export declare const COMMAND_CODE_CLI_VERSION = "1.74.1";
/** CLI `max_tokens ?? 64000` 上限；无 per-model output cap。 */
export declare const COMMAND_CODE_MAX_TOKENS = 64000;
/** Static catalog. Rows live in `src/catalog/models.json` under `"command-code"`; per-model output cap comes from `COMMAND_CODE_MAX_TOKENS` at the harness seam. */
export declare const COMMAND_CODE_MODELS: readonly any[];
export declare function commandCodeModelById(id: any): any;
/**
 * API key 校验：`user_…` 前缀是 CLI 写入 auth.json 的形态，但只做长度
 * 兜底不硬绑前缀（env 里可能是派生 key）。拒绝换行 / 控制符，防止
 * 粘贴把多行 secret 拼进 Authorization。
 */
export declare function parseCommandCodeApiKey(input: any): string;
/**
 * /alpha/whoami → session.account / planType / accountId 候选。
 * `{ success, user:{id,name,email,userName}, org:{id,…}|null }`；
 * 部分部署回 `{user:…}` 无 success 包装。身份显示优先级：userName >
 * email > name > user.id —— userName 是 CLI 登录后回显的字段。
 */
export declare function parseCommandCodeWhoami(payload: any): {
    id: any;
    name: any;
    email: any;
    userName: any;
    orgId: any;
    account: any;
} | undefined;
/** CLI plan 价目表 `rr`（usage 面板），USD/月——键是订阅 planId 原文。 */
export declare const COMMAND_CODE_PLAN_CREDITS: Readonly<{
    'individual-go': 10;
    'individual-goat': 70;
    'individual-pro': 30;
    'individual-pro-v1': 80;
    'individual-provider': 15;
    'individual-max': 150;
    'individual-ultra': 300;
    'teams-pro': 40;
}>;
/** CLI `or`/`Qr` 展示名（usage 面板 + getPlanDisplayName）。 */
export declare const COMMAND_CODE_PLAN_NAMES: Readonly<{
    'individual-go': "Go";
    'individual-goat': "GOAT";
    'individual-pro': "Pro";
    'individual-pro-v1': "Pro";
    'individual-provider': "Provider";
    'individual-max': "Max";
    'individual-ultra': "Ultra";
    'teams-pro': "Teams Pro";
}>;
/** session.account / displayName 的命名空间前缀（fingerprint 兜底时）。 */
export declare const COMMAND_CODE_ACCOUNT_PREFIX = "command-code";
/** Stable vault id seed that is not the raw key (sha256, not a key tail). */
export declare function commandCodeAccountFingerprint(key: any): string;
/** Vault / card id before /alpha/whoami resolves a human identity. */
export declare function commandCodeDefaultAccount(key: any): string;
export declare function isCommandCodeOpaqueAccount(account: any): boolean;
export declare function commandCodeSession(fields?: any): any;
export declare function commandCodeBearer(session: any): string;
/** 上游 hop 头：CLI 发 Authorization + x-command-code-version + x-cli-environment。 */
export declare function commandCodeUpstreamHeaders(session: any, extra?: any): any;
/** Env var the CLI reads first (`getCommandApiKeyFromEnv`). */
export declare const COMMAND_CODE_API_KEY_ENV = "COMMAND_CODE_API_KEY";
/**
 * CLI auth dir resolves to `~/.commandcode/auth.json`
 * (`resolveCommandAuthDir` — `COMMANDCODE_HOME` is not a thing; the dir name
 * is fixed `.commandcode`).
 */
export declare function commandCodeAuthFilePath(home: any): string;
/** Masked hint for account rows that carry no friendlier account name. */
export declare function commandCodeKeyHint(key: any): string;
/** Friendly account label; opaque fingerprint/key-tail ids and raw user uuids stay out of the UI. */
export declare function pickCommandCodeHumanAccount(...candidates: any[]): string | undefined;
export declare function commandCodeSourceLabel(source: any): "env" | "key" | "CLI" | "browser" | undefined;
/**
 * The CLI's auth server tries ports 5959–5968 (`findAvailablePort(5959,10)`)
 * on 127.0.0.1 and the studio page GET-redirects to `/callback` carrying
 * `apiKey,userId,userName,keyName,state` — credentials arrive directly in the
 * callback, no code exchange (`buildCommandAuthUrl` + `createAuthServer`).
 */
export declare const COMMAND_CODE_STUDIO_URL = "https://commandcode.ai";
export declare const COMMAND_CODE_CALLBACK_PATH = "/callback";
export declare const COMMAND_CODE_CALLBACK_PORTS: readonly number[];
export declare const commandCodeFlow: Readonly<{
    callbackPath: "/callback";
    listen: {
        host: string;
        ports: number[];
    };
    buildAuthorizeUrl({ redirectUri, state }: {
        redirectUri: any;
        state: any;
    }): string;
    /**
     * `isCommandAuthCallbackRequest`: all four credential fields are required;
     * the engine's state check runs first, so this only sees matching attempts.
     */
    collect(url: any): {
        apiKey: any;
        userId: any;
        userName: any;
        keyName: any;
    } | undefined;
}>;
/** Browser-callback credentials → session. */
export declare function commandCodeSessionFromCallback(callback?: any): any;
/**
 * `/alpha/whoami` → identity. Returns undefined on any failure (paste form
 * stores the account hint instead); never throws for quota/identity display.
 */
export declare function resolveCommandCodeIdentity(session: any, { fetchFn, signal }?: any): Promise<{
    id: any;
    name: any;
    email: any;
    userName: any;
    orgId: any;
    account: any;
} | undefined>;
/** Permanent key: TokenManager never refreshes (expiresAt = MAX_SAFE_INTEGER). */
export declare function refreshCommandCode(session: any): Promise<any>;
export declare function isCommandCodePermanentRefreshError(): boolean;
