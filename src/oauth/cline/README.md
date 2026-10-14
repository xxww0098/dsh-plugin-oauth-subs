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
| [`catalog.ts`](catalog.ts) | `GET /ai/cline/recommended-models`（成员）+ `GET /ai/cline/models`（窗口/输出/模态事实）；静态 `CLINE_MODELS` 做离线下限 |
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
     User-Agent: Cline/3.0.70 + X-CLIENT-TYPE/… + X-Task-ID
```

`baseURL` 是 `${origin}/cline`。Completions SDK 打到 `/cline/v1/chat/completions`。
`/cline/v1/responses` 明确 501：Cline 只有 Completions。

每日免费额度耗尽是 HTTP 429 `{"code":"INFERENCE_CAP_ERROR","message":"Error 429: Daily free limit reached on model …"}`
（2026-09-28 宿主会话实录）。原样转发时宿主归为 RATE_LIMIT、白重试 5 次；`clineQuotaFailure` 经 `forward()` 的
`classifyFailure` 钩子改写成 429 `usage limit reached: <厂商原文>`，宿主归为 QUOTA_EXCEEDED、不重试。同一改写覆盖 CLI 认得的
ClinePass 限额文案（`you have reached your` … `clinepass limit` … `please try again later.`）、402 / `insufficient_credits` / spend limit。
其余 429 仍原样转发。未订阅 / 组织账号不能用个人推理订阅是 400 说明，不是 403：宿主分类器见报文里的 403 就归 AUTH，会把「没订 ClinePass」看成登录死了。

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

`expiresAt` 是 ISO 字符串，`DEFAULT_REFRESH_BUFFER_MS` = 5min 预刷新。刷新端点对失效凭据有两种拒绝形状：
**HTTP 400 + `{"data":"","error":"failed to refresh token: invalid_grant","success":false}`**（2026-10-11 活测，报文里的
`invalid_grant` 落在句子里，共享的精确 code 匹配认不出）与 **200 + `success:false`**。两者都归成 401 + `invalid_grant` 永久失败
（`isPermanentRefreshFailure`），否则死凭据会被当临时 4xx 无限重试、登录既不删也不提示。判定与钉住 CLI
`ClineOAuthTokenError.isLikelyInvalidGrant` 对齐：400/401/403 + 文案含 `invalid|expired|revoked|unauthorized`，或 code 含
`invalid_grant|invalid_token|unauthorized`。其余 403 / 429 / 5xx 是临时失败。

入口：`clineDeviceSpec` → `DeviceFlowManager.start('cline')` → `completeClineDevice` → `registerClineTokens` → `clineSessionFromAuthData`。
导入：[`import.ts`](import.ts) `importClineAuth`。空花名册自动导入一次；已存 session **绝不**静默覆盖。

**导入只读**（决定 4）：`source: 'cli'` 的登录临期时，`clineImported` 钩子只重读 `providers.json`，过期 > 现在 + 15s 才采用；文件也过期 → `ImportedLoginStale`（403）「… run cline or use browser login」，不删登录；`userId`（`usr-…`）与存储行不同同样抛 `ImportedLoginStale`，不采用。`oauth` 登录照常刷新。

轮换证据：来源一 npm `@cline/core` 0.0.92 `dist/index.js`——刷新路径仍是 POST `/api/v1/auth/refresh`，响应带新的 `refreshToken`（缺省沿用旧值）⇒ 会轮换。来源二（被动观察：插件自有登录在宿主自然刷新前后各记一次 refresh token sha256 前 8 位）：待合入后记录。
刷新一旦成功，旧 refresh token 就作废。落盘失败时**不能让下一次再拿旧 token 去换**（那就是 `invalid_grant`、登录会被删掉），保管这份轮换结果的活由共享层干：`tokens.ts` 写失败时按来源版本 `#holdRotation`，下次直接交还并重试落盘、不再打端点，写成功或版本已变即清除（magpie `held` 的做法，别家同样受益）。
**不要**在本家再记一份这个副本：曾经在这里按 refresh token 记过（并且把「轮换后的 refresh token」也当键），而落盘成功后存储里正是那个键，于是之后每次刷新都命中自己的上一次答案、从不打端点，会话冻结在那一对直到访问令牌过期（2026-10-11 实测：额度卡数字数小时不动、上游数字早已前进；`test/cline.test.ts` 钉「每次调用都真换」，`test/token-lifecycle.test.ts` 钉共享层的两条）。
账号 id 用 `userInfo.email`，其次 `clineUserId`；两者都没有时取 JWT `external_id`/`sub`，再退回常量 `cline-account`——**不用** token 片段。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"cline"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

登录 / 导入 / 额度刷新后 `refreshClineCatalog` 并行打两个公开端点（都带 `clineIdentityHeaders`，不带 `X-Task-ID`）：

1. `GET https://api.cline.bot/api/v1/ai/cline/recommended-models` — 成员。失败则活目录退回静态楼。
2. `GET https://api.cline.bot/api/v1/ai/cline/models` — 事实（`{data:[…]}`，约 450 行）。失败不影响成员，窗口退回静态楼或 CLI 默认。

- 收 `recommended` + `free` + `clinePass`。`free` 名后补 ` (free)`，`clinePass` 补 ` (ClinePass)`。同一 id 后出现的 free 标记盖过前面的标签。`clineCloud` 不收：CLI `includeClineCloudModels` 默认关，是组织云交接，不是用量计费选择器；magpie 也不收。
- 云目录本身不进 picker。CLI 的 `cline` provider 是整棵 OpenRouter 再叠 recommended 角标；本 hop 只借它的窗口数字。全量会把几百行默认开启写进 settings.yaml。要放开需同时改这里与 [`catalog.ts`](catalog.ts)。
- 窗口取云目录，不取 models.dev 末段。精确 id 优先；只有 `cline-free/`、`cline-pass/` 才按末段回退，且末段必须在云目录里唯一，否则不借（避免 `spacexai/grok-4.7` 这种非网关 id 吃到 `x-ai/` 的行）。`context_length` 是窗（活载荷的 `context` 是 0，不用）。`maxTokens` 取 `top_provider.max_completion_tokens`（路由层另夹到 32768，目录行留厂商上限）。`input` 只留 text/image。`supported_parameters` 含 `reasoning_effort` 才挂 `CLINE_REASONING`，否则 `reasoningEfforts: false`（本 hop 只发这个字段，不发明别的推理字段）。
- 云目录和静态楼都没有数字的新 id 用 CLI 的 `CLINE_PASS_MODEL_DEFAULTS`（128k / 8k / text+image），不编数字。2026-10-10 的 `cline-pass/qwen3.8-max` 不在云目录里，窗口就是这个默认。
- 显示名：静态楼的策展名优先；否则云目录 `Vendor: Model` 去掉厂商前缀；feed 的 name 经常等于 id 或末段，那种不算名字，改成末段的可读形式。
- 免费档可用、不扣余额，个别模型按出口 IP 403 区域门（非本 hop 问题）；见 docs/error.md 2026-09-19 Cline 免费档活测。推理模型别把 `max_tokens` 设太小，reasoning token 吃满预算会得到空 `content`。credit 账号选 ClinePass 行会 402/403，失败分类改写成 400 说明，不当成登录失效。
- 上限槽：`maxContextWindow`（自定义输入窗上限）对 cline 行生效（`familyMaxContextWindow` 查静态楼）；`pickerRow` 会把 fact 上的同名字段带进活目录。云目录只给一档 `context_length`，没有第二档可挂，行上目前不写。

最近核对：2026-10-14，公开 feed + `GET /ai/cline/models`（462 行，末段唯一）。feed 的 `recommended` 新增 `google/gemini-4-argon`：末段唯一命中云目录 `google/gemini-4-argon`（1048576 窗 / 65536 输出 / text+image / `supported_parameters` 含 `reasoning_effort` → `CLINE_REASONING`），已收入目录；价目取 models.dev `openrouter`（$2/$10/cacheRead $0.1/cacheWrite $0.1875）。两行 `maxTokens` 随云目录更新：`cline-pass/deepseek-v4.1-flash` 943718 → 393216（厂商把该行输出上限改小）、`cline-pass/glm-5.3-flash` 943717 → 943718。`? x-ai/grok-4.7` / `spacexai/grok-4.7` 仍不在 feed（旧 id 2026-10-10 活测 200），不 `--prune`。同一轮 rates 随源改：`cline-pass/deepseek-v4.1-flash` $0.3/$1.2/$0.006 → $0.15/$0.6/$0.003、`moonshotai/kimi-k3` $0.5/$13.5/$0.28 → $0.73/$10/$0.55。

上次核对：2026-10-10，公开 feed + `GET /ai/cline/models`（458 行，`{data:[…]}`，末段全部唯一）。窗口改从云目录取，不再用 models.dev 末段。`clinePass` 14 个 id 入列（名后 `(ClinePass)`），窗/输出取唯一末段命中的厂商行：`deepseek-v4.1-flash` 1048576/943718 text+image；`mimo-v2.6-flash` 与 `mimo-v2.6-pro` 1050000/131072 text+image，`reasoningEfforts: false`；`glm-5.3` 1048576/943718 text；`deepseek-v4-pro` 1048576/384000 text；`muse-spark-1.3-contributor` 与 `kimi-k3` 都是 1048576/943718 text+image（同数字，不是末段撞车）；`glm-5.3-flash` 1048576/943717 text+image；`qwen3.7-plus` 1000000/131072 text+image、`qwen3.7-max` 1000000/131072 text，两者 `reasoningEfforts: false`；`minimax-m3` 1048576/512000 text+image，`reasoningEfforts: false`；`mimo-v2.5-pro` 1050000/131072 text、`mimo-v2.5` 1050000/131072 text+image，两者 `reasoningEfforts: false`。`cline-pass/qwen3.8-max` 不在云目录，窗口与推理阶梯都是 CLI 默认 128000/8192 / `CLINE_REASONING`，不是测到的参数表。`cline-free/mimo-v2.6-flash` 同步改成 `reasoningEfforts: false`。价目不编，新行没有 rates。不 `--prune`（`spacexai/grok-4.7` 仍不在 feed）。

上次核对：2026-10-10，公开 feed + models.dev `openrouter`：recommended 把 `spacexai/grok-4.7` 换成 `x-ai/grok-4.7`（精确命中 openrouter `x-ai/grok-4.7`：500000 窗 / 450000 输出 / text+image，pdf 剥掉；价 2/6/0.5，超过 200K 为 4/12/1）。旧 id 四个桶都没有，但 `POST /chat/completions` 仍 200，列表换前缀不是下架，静态行与价目保留、不 `--prune`（登录后活目录按 feed 替换，picker 不再列旧 id）。free 桶新增 `cline-free/step-5-preview`：桶里没有 `cline-free/` 前缀，末段匹配 openrouter `stepfun/step-5-preview`（1000000 / 64000 / text+image，video 剥掉；free 组 → $0）。`max_tokens: 16` 活测 500 `empty response content`（推理吃满预算）；2048 与 64+`minimal` 都 200。`moonshotai/kimi-k3` 价随 openrouter 桶 0.62/12.3/0.43 → 0.8/13.5/0.55。行数 9→11。

上次核对：2026-10-08，公开 feed 无新行、无下架（仍 9 行）。`moonshotai/kimi-k3` 价随 models.dev `openrouter` 桶 0.65/15/0.43 → 0.62/12.3/0.43。

上次核对：2026-10-07，公开 feed + models.dev `openrouter`：feed 的 `free` 桶新增 `cline-free/solar-mini4`（Solar Mini 4，524288 窗 / 131072 输出 / text / minimal–max；free 组 → 价目 $0）；撤下 `stealth/space-bunny-alpha`（Stealth 免费预览结束——command-code 1.74.2 同日退役 "Space Bunny Alpha" 与 "Pixel Canary"，互相印证），目录与价目随源删行；`moonshotai/kimi-k3` 价随 models.dev `openrouter` 桶 0.67/14/0.22 → 0.69/15/0.45。行数 9→9。

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
- 不要给 Cline 写 Codex `session-id` / `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要发明 `cache_control` 断点：CLI 的 `splitToolImagesMiddleware` 只搬图片，不加缓存断点。
- 不要把 `clineCloud` 或 `/ai/cline/models` 的整棵 OpenRouter 列进 picker。`clinePass` 要列，名后标 `(ClinePass)`；credit 账号打到它是 400 说明，不要原样转发 403（宿主见 403 归 AUTH）。
- 不要照抄 magpie 每次请求 `randomUUID()` 的 `X-Task-ID`，也不要把目录 `maxTokens` 留 0（它的宿主自己留预算；本 hop 目录行是厂商上限，路由层再夹到 32768）。不要加默认关闭的 DeepSeek `pinUpstream`，本 hop 没有这个开关。
- 不要 npm `@cline/sdk`、不要 vendor `@cline/*` 整棵树；Settings 图标是 LobeHub static SVG path。
- 不要把 `api` 写成第四个字符串。
- 不要自己累加 `/usages` 去凑窗口用量：窗口百分比由 `plan/usage-limits` 给；只有 cap（分母）缺失时才退化成纯百分比条，不补默认值。
- 不要给 credit 账号画进度条（它没有窗口分母）。

## 归因

一线：**Cline CLI 3.0.70**（npm `cline`，本机 `~/.local/lib/node_modules/cline`），跑在 `@cline/core` / `@cline/llms` 0.0.92 上；源码 tag [`cli-v3.0.70`](https://github.com/cline/cline/tree/cli-v3.0.70)（Apache-2.0）。闭源的只有 WorkOS 身份：登录是 `api.workos.com` 的 RFC 8628 设备码，换票走 Cline 自己的 `/api/v1/auth/register`。ClinePass 窗口不在 CLI 源码里，对照 MIT [`pi-clinepass`](https://www.npmjs.com/package/pi-clinepass) `0.1.5`。

社区对照：[`@magpie-community/opencode-cline-auth`](https://github.com/magpie-community/plugins/tree/main/packages/cline)（钉 CLI 3.0.68 / core 0.0.90，已落后于本钉）。采用它的双端点取数、`clinePass` 入列、刷新成功后记住已花掉的 refresh token。不采用：整棵云目录入 picker、每次请求随机 `X-Task-ID`、`output: 0`、默认关闭的 DeepSeek pin。

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
| 推荐模型 feed + 云目录事实 | `sdk/packages/core` `fetchClineRecommendedModels` / `loadCloudModels`；`@cline/llms` `normalizeClineRecommendedProviderModels` | `refreshClineCatalog`：成员是 recommended+free+clinePass，窗口来自 `GET /ai/cline/models` |
| 额度三读 | `sdk/packages/core/src/account/cline-account-service.ts` | [`quota.ts`](quota.ts) |
| 余额微美元 | `apps/cli/src/utils/output.ts` `normalizeCreditBalance` | `CLINE_CREDIT_SCALE` |
| ClinePass 三条窗口（5 小时 / 每周 / 每月）+ cap（1e-8 USD） | CLI 只在 429/402 文案里认 "5-hour / weekly Clinepass limit"（`sdk/packages/llms/src/providers/errors.ts`）；形状取自 `pi-clinepass` `src/usage.ts` `fetchPlanLimits`，路由用生产 404 body 自证 | `CLINE_PLAN_LIMITS_URL` / `CLINE_CAP_FIELDS` / `CLINE_COST_SCALE` |
| 本机凭据文件 | `ProviderSettingsManager`（`~/.cline/data/settings/providers.json`） | [`import.ts`](import.ts) |

**不要发明：** 这份对照得出的禁令（credit 账号进度条、cap 缺失补默认、自累加 `/usages`、裸 JWT、PKCE / 回环、`cache_control` 断点、别家缓存头、`clineCloud` / 整棵 OpenRouter 进目录、随机 `X-Task-ID`、第四个 `api`）都在「不要」节，这里不重复。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
