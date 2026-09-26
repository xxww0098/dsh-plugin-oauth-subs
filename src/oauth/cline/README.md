# Cline (cline.bot) OAuth

本文件是 `src/oauth/cline/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** ChatGPT Codex / xAI Grok / OpenCode Zen。上游是 Cline 订阅后端
`https://api.cline.bot/api/v1/chat/completions`（OpenAI Completions 方言，OpenRouter 在后）。
登录是 **WorkOS 设备码 + Cline register 兑换**，**没有 PKCE、没有回环回调服务器**。

计费单位是**额度（credits）**，不是 5h/周窗口：`cline` 产品按用量扣余额，ClinePass 才有订阅限额
（限额只以 429/402 报文出现，没有查询端点）。所以额度卡是 `prepaid` 余额行 + 套餐名。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | WorkOS client_id、设备码 spec、register 兑换、刷新、会话与上游头、`/users/me` 身份、静态目录 |
| [`import.ts`](import.ts) | `~/.cline/data/settings/providers.json` 读取（`cline` / `cline-pass` 都认），只读不回写 |
| [`catalog.ts`](catalog.ts) | `GET /ai/cline/recommended-models`（公开，无需 token）；静态 `CLINE_MODELS` 做离线下限 |
| [`request.ts`](request.ts) | `max_tokens`→`max_completion_tokens`（OpenAI 推理世代）；`include_usage`；`reasoning_effort` 透传；`cache_read_*`→`cached_tokens`；非流式 `{success,data}` 解包 |
| [`quota.ts`](quota.ts) | `/users/me` + `/users/{id}/balance`（微美元）+ `/users/me/plan`（404 = 无订阅） |
| [`cache.ts`](cache.ts) | `X-Task-ID` 会话钉；剥 Codex / Grok 字段；首段 system 停车 |

调度：[`../proxy.ts`](../proxy.ts) `family === 'cline'` → `applyClineCache` → `applyClineMaxCompletionTokens` → `applyClineThinking` → `applyClineStreamUsage`，`forward()` 到 `CLINE_CHAT_URL`。
额度：[`../quota.ts`](../quota.ts) 分派 `fetchClineQuota`（[`quota.ts`](quota.ts)）。
套餐：[`../plan.ts`](../plan.ts) `CLINE_PLAN_NAMES`（`usage-billing` / `clinepass`），无订阅时落 `usage-billing`。

## 协议

DSH `api: openai-completions`。不要写第四个 api 字符串：DSH 闭集只有
`openai-responses` | `openai-completions` | `anthropic-messages`，第四个值会整段丢掉。

```text
DSH POST /cline/v1/chat/completions
  → applyClineCache（剥 prompt_cache_key / session_id / retention；首段 system 停车；X-Task-ID = 会话钉）
  → applyClineMaxCompletionTokens（gpt-5 / o1/o3/o4 才把 max_tokens 改名）
  → applyClineThinking（目录里有该模型才留 reasoning_effort，max→xhigh）
  → applyClineStreamUsage（stream 时补 stream_options.include_usage）
  → POST https://api.cline.bot/api/v1/chat/completions
     Authorization: Bearer workos:<jwt>
     User-Agent: Cline/3.0.62 + X-CLIENT-TYPE/… + X-Task-ID
```

`baseURL` 是 `${origin}/cline`。Completions SDK 打到 `/cline/v1/chat/completions`。
`/cline/v1/responses` 明确 501：Cline 只有 Completions。

`reasoningEfforts` 键只有 `off|minimal|low|medium|high|xhigh|max`，值是 OpenAI `reasoning_effort`
（`minimal|low|medium|high|xhigh`，`max`→`xhigh`；**没有 `off`**，见下）。

## 登录

两步，浏览器不回 127.0.0.1。**没有 PKCE**。

| 项 | 值 |
|---|---|
| `client_id` | `client_01K3A541FN8TA3EPPHTD2325AR`（WorkOS，production） |
| device | `POST https://api.workos.com/user_management/authorize/device`，form body 只有 `client_id` |
| poll | `POST https://api.workos.com/user_management/authenticate` `grant_type=urn:ietf:params:oauth:grant-type:device_code` + `device_code` + `client_id` |
| 兑换 | `POST https://api.cline.bot/api/v1/auth/register` JSON `{accessToken, refreshToken}` → `{success, data:{accessToken, refreshToken, tokenType, expiresAt, userInfo}}` |
| 刷新 | `POST https://api.cline.bot/api/v1/auth/refresh` JSON `{refreshToken, grantType:"refresh_token"}` |

`authorization_pending` = 继续等；`slow_down` = interval +5s；`expired_token` = **重新** device_authorization（`DeviceFlowManager.restartOnExpired`，与 CLI 一致）。
WorkOS 那一对 token 不是 Cline 会话——`register` 兑换才拿到 `usr-…` 账号 id 与 Cline refresh token。

访问令牌存的是 **`workos:<jwt>`**（CLI `formatAccessToken` 的前缀）。裸 JWT 打上游是 401
`Unauthorized: Please make sure you're using the latest version of Cline…`（2026-09-19 实测）。前缀幂等，刷新后重加一次。

`expiresAt` 是 ISO 字符串，`DEFAULT_REFRESH_BUFFER_MS` = 5min 预刷新。刷新端点对失效凭据回 **200 + `success:false`**，
也是永久失败（`isClinePermanentRefreshError`）。

入口：`clineDeviceSpec` → `DeviceFlowManager.start('cline')` → `completeClineDevice` → `registerClineTokens` → `clineSessionFromAuthData`。
导入：[`import.ts`](import.ts) `importClineAuth`。空花名册自动导入一次；已存 session **绝不**静默覆盖。
账号 id 用 `userInfo.email`，其次 `clineUserId`；两者都没有时取 JWT `external_id`/`sub`，再退回常量 `cline-account`——**不用** token 片段。

## 模型

登录 / 导入 / 额度刷新后 `refreshClineCatalog`：

```text
GET https://api.cline.bot/api/v1/ai/cline/recommended-models     （公开）
```

取 `recommended` + `free` 两个桶（`free` 名后补 ` (free)`），`clinePass` / `clineCloud` **不进**本目录：
那是 ClinePass 产品的模型，credit 账号用不了，列进 picker 只会 402。

静态 `CLINE_MODELS` 是 2026-09-23 两个桶的快照，元数据（`contextWindow` / `maxTokens` / `input`）来自
`https://models.dev/api.json` 的 `openrouter` 桶 —— 与 CLI `buildClineModels` 同源；`cline-free/*`、`xiaomi/*`
按 id 末段回退解析（`deepseek/…`、`mimo-v2.6-flash`、`upstage/…`）。2026-09-23 实测 feed 轮换：recommended 新增 `spacexai/grok-4.7`（openrouter 桶 `x-ai/grok-4.7`，500k / 450k / text+image），free 新增 `cline-free/mimo-v2.6-flash`（openrouter 桶 `xiaomi/mimo-v2.6-flash`，1M / 131k / text+image）；`x-ai/grok-4.5`、`z-ai/glm-5.3-flash` 两个桶都不再下发，已从快照删除。**免费档实测（2026-09-19，本机 credit 账号）**：`free` 桶里 `cline-free/deepseek-v4.1-flash`、`z-ai/glm-5.3-flash`、`cline-free/solar-pro4`、`poolside/laguna-s-2.1:free` 四条全部 200（流式出字、`reasoning_effort` 可用、`tool_calls` 正常），台账 `creditsUsed = 0` 不扣余额；`cline-free/muse-spark-1.3-contributor` 对本机出口 **403 区域门**（上游按 IP 判，非本 hop 问题，换出口才可能通）。推理模型别把 `max_tokens` 设太小，reasoning token 吃满预算会得到空 `content`。

2026-09-26 复抓公开 feed：`recommended` 4 行未变，`free` 改为 `stealth/pixel-canary`、`stealth/space-bunny-alpha`、MiMo-V2.6-Flash、DeepSeek V4.1 Flash、`cline-free/gemini-3.8-flash`、Muse Spark 1.3；Solar Pro 4 与 Laguna S 2.1 已不在 feed。Space Bunny Alpha 的 1M / 524,288 / text+image 和 Gemini 3.8 Flash 的 1,048,576 / 65,536 / text+image 取同日 models.dev `openrouter` 桶（video/audio 按 DSH 闭集剥掉）；Pixel Canary 在该桶无参数，使用 CLI 默认 128k / 8k / text+image。静态 fallback 更新为这 10 行；登录后的活目录仍覆盖。

feed 出现新 id 而本地没有元数据时，用 CLI 自己的
`CLINE_PASS_MODEL_DEFAULTS`（128k / 8k / text+image），不编数字。

CLI 的 `cline` provider 目录其实是整棵 OpenRouter（370+ 行）。本 hop 有意收窄成 feed 里的推荐 + 免费档：
370 行默认开启会写进 settings.yaml，且都不是 Cline 面向前台的模型。要放开需同时改这里与 [`catalog.ts`](catalog.ts)。

## 额度

两条产品线，卡片按账号实际有什么画什么：

| 端点 | 用途 |
|---|---|
| `GET /api/v1/users/me` | 身份（`email`、`usr-…` id、`organizations`） |
| `GET /api/v1/users/{id}/balance` | 额度余额，**微美元**（÷1e6 = USD，`normalizeCreditBalance`） |
| `GET /api/v1/users/me/plan` | 订阅计划；无订阅回 404 `{success:false}` |
| `GET /api/v1/users/me/plan/usage-limits` | **ClinePass 滚动窗口**：`data.limits[] = {type, percentUsed, resetsAt}` |

**credit 账号**（usage-billing）：一行 `prepaid`（`remaining` = USD，UI 按 family 显示 `$x.xx` + 「额度余额」）＋ 套餐徽章。
这条产品线**没有窗口分母**，官方 CLI 也只打 `Credits: $0.34`（`apps/cli/src/tui/interactive-welcome.ts`），所以不画条。

**ClinePass 订阅账号**：三条真进度条，百分比与重置时刻全部来自服务端，不自己求和：

| `limits[].type` | DSH 行 | 标签 | 限额（cap）来源 |
|---|---|---|---|
| `five_hour` | `kind: 'primary'` + `windowMinutes: 300` | 5 小时 | `entitlements.cline_pass.inferenceCapThreshold.last5HoursUsageCostUSDPerUser` |
| `weekly` | `kind: 'weekly'` | 每周 | `…last7daysUsageCostUSDPerUser` |
| `monthly` | `kind: 'monthly'` | 每月 | `…last30daysUsageCostUSDPerUser` |

- `percentUsed` 是**已用**百分比；DSH 行是**剩余**条，所以写 `remainingPercent = 100 - percentUsed`。
- 只有非零 cap 才写 `used`/`total`（`unit: 'usd'`，UI 渲染 `$2.50 / $10.00`）：**cap 缺失就不给总数**，不发明分母。
- cap 与 `/usages.costUsd` 同一记账单位 **1e-8 USD**（`CLINE_COST_SCALE = 1e8`）。两条独立证据：本机台账 `costUsd = creditsUsed × 100`、`creditsUsed ÷ 1e6 = USD`；MIT `pi-clinepass` `src/usage.ts` 的 `rawCostUsd / 100_000_000`。
- 无订阅时 `planType` = `usage-billing`（CLI provider 名就是 "Cline Usage-Billing"）；有订阅时用 `plan.displayName`。

> ⚠️ **未用订阅账号实测**：本机账号是 credit 账号，两个 plan 端点都回 404，所以三条窗口的**数值**没有活体验证。已验证的是路由真实存在——`/users/me/plan/usage-limits` 回应用级 404 `{"data":null,"error":"no plan history found for user"}`，未知路由回 `{"error":"Not Found"}`（生产 API，2026-09-19）；字段形状取自 MIT `pi-clinepass` 的 `fetchPlanLimits`。拿到订阅账号后应重跑 `fetchClineQuota` 并把结论补进 `docs/error.md`。

## 缓存

Cline 背后是 OpenRouter，缓存是**隐式前缀哈希**；客户端不发 `prompt_cache_key` / `cache_control`。
唯一的会话亲和字段是 **`X-Task-ID`** 请求头（`buildClineRequestHeaders` 用 session id 填）。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `clineCacheSessionId` | 清洗 DSH id（1–64，`[A-Za-z0-9._:-]`） |
| 2 | `applyClineCache` | 剥 Codex/Grok 字段；首段 system 钉住，后续**纯扩展**快照停到 **messages suffix**；不兼容的头（换模型/新会话——DSH 不发 session_id，钉键是常量）直接重钉 |
| 3 | `clineCacheHeaders` | `{ 'X-Task-ID': <钉> }`，缺省 `dsh-cline` |

活测（2026-09-19，本机账号）：`openai/gpt-6-astra` 同一 1.4k 前缀第二次 **1461/1464 cached**；
`anthropic/claude-opus-5` 两次都是 0——Anthropic 走 OpenRouter 需要显式 `cache_control` 断点，
**CLI 也不发**，所以本 hop 同样不发（见「不要」）。不要 `Date.now()`。

## 不要

- 不要加 PKCE / 回环回调：CLI 默认 `useWorkOSDeviceAuth: true`，浏览器分支是给旧 VS Code 扩展的。
- 不要把裸 JWT 当 bearer（必须 `workos:` 前缀），也不要加第二次前缀。
- 不要给 Cline 写 Codex `session-id` / `prompt_cache_key`、Grok `x-grok-conv-id`、Copilot `X-Interaction-Id` / `x-initiator`。
- 不要发明 `cache_control` 断点：CLI 的 `splitToolImagesMiddleware` 只搬图片，不加缓存断点。
- 不要把 `clinePass` / `clineCloud` 模型列进 credit 账号的 picker。
- 不要 npm `@cline/sdk`、不要 vendor `@cline/*` 整棵树；Settings 图标是 LobeHub static SVG path。
- 不要把 `api` 写成第四个字符串。
- 不要自己累加 `/usages` 去凑窗口用量：窗口百分比由 `plan/usage-limits` 给；只有 cap（分母）缺失时才退化成纯百分比条，不补默认值。
- 不要给 credit 账号画进度条（它没有窗口分母）。

## 归因

一线：**Cline CLI 3.0.62**（npm `cline`，本机 `~/.local/lib/node_modules/cline`）on `@cline/core 0.0.83`，
源码 tag [`cli-v3.0.62`](https://github.com/cline/cline/tree/cli-v3.0.62)（Apache-2.0）：

| 抄 | 路径 | 本 hop |
|---|---|---|
| WorkOS 设备码 + poll | `sdk/packages/core/src/auth/cline.ts` `requestWorkOSDeviceAuthorization` / `pollWorkOSTokens` | `clineDeviceSpec` + 共用 `DeviceFlowManager` |
| register 兑换 / 刷新 | 同文件 `registerWorkOSTokens` / `refreshClineToken` | `registerClineTokens` / `refreshCline` |
| `workos:` 前缀 + 会话形状 | `sdk/packages/core/src/auth/provider-auth-registry.ts` `formatAccessToken` / `getApiKey` | `formatClineAccessToken`；`expiresAt` ISO→ms |
| 聊天头（含 `X-Task-ID`） | `sdk/packages/llms/src/providers/request-headers.ts` `buildClineRequestHeaders` | `clineCredentialHeaders` + `clineCacheHeaders` |
| 客户端身份 `cline-cli` / `cli` | `apps/cli/src/main.ts` `extensionContext.client` | `CLINE_CLIENT_TYPE` / `CLINE_PLATFORM` |
| OpenAI 兼容 hop | `sdk/packages/llms/src/providers/vendors/cline.ts` | `CLINE_CHAT_URL` + `api: openai-completions` |
| `max_tokens`→`max_completion_tokens` | 同目录 `openai-compatible.ts` `withMaxCompletionTokensForReasoningModels` + `model-facts.ts` | `applyClineMaxCompletionTokens` |
| `reasoning_effort` 语义 | `sdk/packages/llms/src/providers/routing/portable-reasoning.ts` | `CLINE_REASONING`（`max`→`xhigh`，禁用不发字段 → 无 `off` 键） |
| 推荐模型 feed / 元数据 | `sdk/packages/llms/src/catalog/catalog-cline-recommended.ts` + `builtins.ts` `buildClineModels` | `refreshClineCatalog` + `CLINE_MODELS`（models.dev `openrouter`） |
| 额度三读 | `sdk/packages/core/src/account/cline-account-service.ts` | [`quota.ts`](quota.ts) |
| ClinePass 窗口 + cap | CLI 源码里没有（它只在 429/402 文案里认 "5-hour / weekly Clinepass limit"，见 `sdk/packages/llms/src/providers/errors.ts`）；形状取自 MIT [`pi-clinepass`](https://www.npmjs.com/package/pi-clinepass) `0.1.5` `src/usage.ts` `fetchPlanLimits`，路由用生产 404 body 自证 | `CLINE_PLAN_LIMITS_URL` / `CLINE_CAP_FIELDS` / `CLINE_COST_SCALE` |
| 余额微美元 | `apps/cli/src/utils/output.ts` `normalizeCreditBalance` | `CLINE_CREDIT_SCALE` |
| 本地凭据文件 | `ProviderSettingsManager`（`~/.cline/data/settings/providers.json`） | [`import.ts`](import.ts) |

## 追溯

| 问题 | 记录 |
|---|---|
| 非流式回包是 `{success,data}` 信封，DSH 读不到 `choices` | [`docs/error.md`](../../../docs/error.md) 2026-09-19 Cline hop 活测 |
| 免费档区域门（`cline-free/muse-spark-1.3-contributor` 403）、免费不扣 `creditsUsed` | [`docs/error.md`](../../../docs/error.md) 2026-09-19 Cline 免费档活测 |
| 裸 JWT 401、Anthropic 无隐式缓存、`max`/off 的 effort 语义 | 同条 |
| `controller.sync()` 漏传 `clineModels` → settings.yaml 只写静态底表 | 本地安装活测发现；同 Cursor「活目录没接到 picker / yaml」那一类，`test/cline.test.ts` 已加回归 |

测试：`test/cline.test.ts`。
