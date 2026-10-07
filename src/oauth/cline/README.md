# Cline (cline.bot) OAuth

本文件是 `src/oauth/cline/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

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

每日免费额度耗尽是 HTTP 429 `{"code":"INFERENCE_CAP_ERROR","message":"Error 429: Daily free limit reached on model …"}`
（2026-09-28 宿主会话实录）。原样转发时宿主归为 RATE_LIMIT、白重试 5 次；`clineQuotaFailure` 经 `forward()` 的
`classifyFailure` 钩子改写成 429 `usage limit reached: <厂商原文>`，宿主归为 QUOTA_EXCEEDED、不重试。其余 429 仍原样转发。

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
抛成 401 + `invalid_grant`，也是永久失败（`isPermanentRefreshFailure`）；403 / 429 / 5xx 是临时失败。

入口：`clineDeviceSpec` → `DeviceFlowManager.start('cline')` → `completeClineDevice` → `registerClineTokens` → `clineSessionFromAuthData`。
导入：[`import.ts`](import.ts) `importClineAuth`。空花名册自动导入一次；已存 session **绝不**静默覆盖。

**导入只读**（决定 4）：`source: 'cli'` 的登录临期时，`clineImported` 钩子只重读 `providers.json`，过期 > 现在 + 15s 才采用；文件也过期 → `ImportedLoginStale`（403）「… run cline or use browser login」，不删登录；`userId`（`usr-…`）与存储行不同同样抛 `ImportedLoginStale`，不采用。`oauth` 登录照常刷新。

轮换证据：来源一 npm `@cline/core` 0.0.83 `dist/index.js`——`refreshClineToken` POST `/api/v1/auth/refresh`，取响应 `refreshToken`（缺省沿用旧值）并记 `newRefreshTokenHash`，`saveProviderSettings` 写回 `providers.json` ⇒ 会轮换。来源二（被动观察：插件自有登录在宿主自然刷新前后各记一次 refresh token sha256 前 8 位）：待合入后记录。
账号 id 用 `userInfo.email`，其次 `clineUserId`；两者都没有时取 JWT `external_id`/`sub`，再退回常量 `cline-account`——**不用** token 片段。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"cline"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

登录 / 导入 / 额度刷新后 `refreshClineCatalog` 打公开 feed `GET https://api.cline.bot/api/v1/ai/cline/recommended-models`，活目录非空即替换静态行。

- 只收 `recommended` + `free` 两个桶（`free` 名后补 ` (free)`）。`clinePass` / `clineCloud` 是 ClinePass 产品的模型，credit 账号用不了，列进 picker 只会 402。
- CLI 的 `cline` provider 目录其实是整棵 OpenRouter（数百行）。本 hop 有意收窄成 feed：全量会把几百行默认开启写进 settings.yaml，且都不是 Cline 面向前台的模型。要放开需同时改这里与 [`catalog.ts`](catalog.ts)。
- feed 只给 id。`contextWindow` / `maxTokens` / `input` 取 `https://models.dev/api.json` 的 `openrouter` 桶，与 CLI `buildClineModels` 同源；`cline-free/*`、`xiaomi/*` 这类前缀在桶里没有，按 id 末段回退匹配（`cline-free/muse-spark-1.3-contributor` → `meta/muse-spark-1.3-contributor`）。末段匹配可能命中别家同名行，刷新时要核对。video / audio 剥掉。
- 两边都没有元数据的新 id 用 CLI 自己的 `CLINE_PASS_MODEL_DEFAULTS`（128k / 8k / text+image），不编数字。
- 免费档可用、不扣余额，个别模型按出口 IP 403 区域门（非本 hop 问题）；见 docs/error.md 2026-09-19 Cline 免费档活测。推理模型别把 `max_tokens` 设太小，reasoning token 吃满预算会得到空 `content`。
- 上限槽：`maxContextWindow`（自定义输入窗上限）对 cline 行生效（`familyMaxContextWindow` 查静态楼）；`pickerRow` 会把 fact 上的同名字段带进活目录（运行时 fact 就是传进来的静态楼）。feed 与 models.dev `openrouter` 都只给一档 `limit.context`，没有第二档可挂，行上目前不写。

最近核对：2026-10-07，公开 feed + models.dev `openrouter`：feed 的 `free` 桶新增 `cline-free/solar-mini4`（Solar Mini 4，524288 窗 / 131072 输出 / text / minimal–max；free 组 → 价目 $0）；撤下 `stealth/space-bunny-alpha`（Stealth 免费预览结束——command-code 1.74.2 同日退役 "Space Bunny Alpha" 与 "Pixel Canary"，互相印证），目录与价目随源删行；`moonshotai/kimi-k3` 价随 models.dev `openrouter` 桶 0.67/14/0.22 → 0.69/15/0.45。行数 9→9。

上次核对：2026-10-05，公开 feed + models.dev `openrouter`：feed 的 `free` 桶撤下 `cline-free/deepseek-v4.1-flash`（4→3 行；同名 id 仍在 `clinePass` / `clineCloud` 两个付费桶里 → 免费档促销结束，不是模型下架），目录与价目随源删行（10→9）；`moonshotai/kimi-k3` 价随 models.dev `openrouter` 桶 2.7/13.5/0.27 → 0.67/14/0.22。

更早核对：2026-10-01，公开 feed + models.dev `openrouter`：feed 撤下 `stealth/pixel-canary`（Stealth 预览 9/30 结束；command-code 1.73.1 同日加退役日期门 `2026-10-01T06:00:00Z`，互相印证），目录与价目删行（11→10）；`cline-free/mimo-v2.6-flash` 的 `contextWindow` 随 models.dev 桶 1048576 → 1050000。


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
| 2 | `applyClineCache` | 剥 Codex/Grok 字段；首段 system 钉住，后续**纯扩展**快照停到 **messages suffix**；不兼容的头（换模型）直接重钉；回退 id `dsh-cline`（`isClineFallback`）不是会话，从不钉 |
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

一线：**Cline CLI 3.0.62**（npm `cline`，本机 `~/.local/lib/node_modules/cline`），跑在 `@cline/core 0.0.83` 上；源码 tag [`cli-v3.0.62`](https://github.com/cline/cline/tree/cli-v3.0.62)（Apache-2.0）。闭源的只有 WorkOS 身份：登录是 `api.workos.com` 的 RFC 8628 设备码，换票走 Cline 自己的 `/api/v1/auth/register`。ClinePass 窗口不在 CLI 源码里，对照 MIT [`pi-clinepass`](https://www.npmjs.com/package/pi-clinepass) `0.1.5`。

| 抄 | 出处 | 本 hop |
|---|---|---|
| WorkOS 设备码 + poll | `sdk/packages/core/src/auth/cline.ts` `requestWorkOSDeviceAuthorization` / `pollWorkOSTokens` | `clineDeviceSpec` + 共用 `DeviceFlowManager` |
| 模型页价格徽标（USD / 1M） | recommended-models feed `free` 组 → $0；其余 models.dev `openrouter`（`spacexai/` → `x-ai/`） | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| register 兑换 / 刷新 | 同文件 `registerWorkOSTokens` / `refreshClineToken` | `registerClineTokens` / `refreshCline` |
| `workos:` 前缀 + 会话形状 | `sdk/packages/core/src/auth/provider-auth-registry.ts` `formatAccessToken` / `getApiKey` | `formatClineAccessToken`（幂等）；`expiresAt` ISO→ms |
| 聊天头（`X-CLIENT-TYPE`、`X-Task-ID` …） | `sdk/packages/llms/src/providers/request-headers.ts` `buildClineRequestHeaders` | `clineCredentialHeaders` + `clineCacheHeaders` |
| 客户端身份 `cline-cli` / `cli` | `apps/cli/src/main.ts` `extensionContext.client` | `CLINE_CLIENT_TYPE` / `CLINE_PLATFORM` |
| OpenAI 兼容 hop | `sdk/packages/llms/src/providers/vendors/cline.ts` | `CLINE_CHAT_URL` + `api: openai-completions` |
| `max_tokens`→`max_completion_tokens` | 同目录 `openai-compatible.ts` `withMaxCompletionTokensForReasoningModels` + `model-facts.ts` | `applyClineMaxCompletionTokens` |
| `reasoning_effort` 语义（`max`→`xhigh`，禁用不发字段） | `sdk/packages/llms/src/providers/routing/portable-reasoning.ts` | `CLINE_REASONING`（无 `off` 键） |
| 推荐模型 feed + OpenRouter 元数据 | `sdk/packages/llms/src/catalog/catalog-cline-recommended.ts` + `builtins.ts` `buildClineModels` | `refreshClineCatalog` + `CLINE_MODELS`（models.dev `openrouter`） |
| 额度三读 | `sdk/packages/core/src/account/cline-account-service.ts` | [`quota.ts`](quota.ts) |
| 余额微美元 | `apps/cli/src/utils/output.ts` `normalizeCreditBalance` | `CLINE_CREDIT_SCALE` |
| ClinePass 三条窗口（5 小时 / 每周 / 每月）+ cap（1e-8 USD） | CLI 只在 429/402 文案里认 "5-hour / weekly Clinepass limit"（`sdk/packages/llms/src/providers/errors.ts`）；形状取自 `pi-clinepass` `src/usage.ts` `fetchPlanLimits`，路由用生产 404 body 自证 | `CLINE_PLAN_LIMITS_URL` / `CLINE_CAP_FIELDS` / `CLINE_COST_SCALE` |
| 本机凭据文件 | `ProviderSettingsManager`（`~/.cline/data/settings/providers.json`） | [`import.ts`](import.ts) |

**不要发明：** 这份对照得出的禁令（credit 账号进度条、cap 缺失补默认、自累加 `/usages`、裸 JWT、PKCE / 回环、`cache_control` 断点、别家缓存头、ClinePass 模型进 credit 目录、第四个 `api`）都在「不要」节，这里不重复。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
