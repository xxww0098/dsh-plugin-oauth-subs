# Command Code

本文件是 `src/apikey/command-code/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Command Code 订阅（[commandcode.ai](https://commandcode.ai) / api.commandcode.ai）。官方 CLI 是 npm 包 `command-code`（bin `command-code` / `cmd` / `cmdc` / `commandcode`，本表按 `1.74.1` 归因）。

> 非正式集成。只用用户自己的 API key（paste / `COMMAND_CODE_API_KEY` / `~/.commandcode/auth.json`）或用户本人跑完的 studio 浏览器登录。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 端点常量、API key session、Bearer 头、`/alpha/whoami` 身份、套餐表、studio loopback flow spec |
| [`catalog.ts`](catalog.ts) | 静态目录出口 `commandCodeCatalogModels()` |
| [`import.ts`](import.ts) | `COMMAND_CODE_API_KEY` 优先、`~/.commandcode/auth.json` 其次（与 CLI `getCommandAuthKey` 同序） |
| [`cache.ts`](cache.ts) | `threadId` uuid 亲和：DSH 会话键 → 确定性 uuid；剥全部外来字段 |
| [`request.ts`](request.ts) | OpenAI body ↔ `/alpha/generate` wire；JSONL 事件 → chat.completion / SSE |
| [`transport.ts`](transport.ts) | `POST /alpha/generate` JSONL 消费、`forwardCommandCode`（stream/non-stream；输出前只重放传输故障，HTTP 状态与 `error` 事件原样交给宿主重试） |
| [`quota.ts`](quota.ts) | whoami + credits + subscriptions + usage/summary → 额度行 |

调度：[`../../oauth/proxy.ts`](../../oauth/proxy.ts) `family === 'command-code'` → `applyCommandCodeCache` → `forwardCommandCode`。
额度：[`../../oauth/quota.ts`](../../oauth/quota.ts) `fetchCommandCodeQuota`。

## 协议

**不兼容** OpenAI/Anthropic/Responses 三闭集任何一路。`POST https://api.commandcode.ai/alpha/generate` 是唯一推理入口，AI-SDK 风格 JSON in、JSONL 事件流出（归因：CLI bundle 的 `toWireMessages` / 流事件 switch）。因此 hop 是**翻译层**，不是透传：

```text
DSH POST /command-code/v1/chat/completions
  → applyCommandCodeCache（剥 DSH 字段，导出 threadId）
  → openaiToCommandCode（OpenAI 形状 → wire）
  → POST /alpha/generate  Authorization: Bearer <key>
  → JSONL 事件 → chat.completion（非流式）或 SSE chunk（流式）
```

`baseURL` 是 `${origin}/command-code`，Completions SDK 打到 `/command-code/v1/chat/completions`。`/command-code/v1/responses` 回 **501** 说明。

Wire（1.74.1 bundle，与 1.69.0 起逐字一致，仅压缩名偏移）：

- 顶层：`{ config, memory:null, taste:null, skills:null, mode:'chat', permissionMode, threadId?, params }`。`config` 是 `buildServerConfig` 形状——DSH 没有真实工作区，`workingDir`/git 字段诚实地留空，不编造 cwd。
- `params`：`{ model, messages, tools?, system?, max_tokens, stream:true, temperature?, reasoning_effort? }`。`max_tokens` 上限 64000（CLI `max_tokens ?? 64000`，无 per-model cap）。`stream` 恒 true（CLI 恒流式；非流式由 hop 收集后回 JSON）。
- `messages`：user `content` 是 string 或 part[]（`{type:'text'}` / `{type:'image', image}`）；assistant content parts `{type:'text'|'reasoning'|'tool-call'}`，tool-call 是 `{toolCallId, toolName, input}`；`role:'tool'` 的 result part 是 `{type:'tool-result', toolCallId, toolName, output:{type:'text'|'error-text', value}}`。
- `tools`：Anthropic 拼写 `{name, description, input_schema}`。
- `reasoning_effort`：值是 per-model `kr` 表拼写（`low|medium|high|xhigh|max` 子集，逐模型不同）；模型无条目 / `off` → 字段整体省略（CLI `supportsThinking ? effort : undefined`）。
- 事件：`reasoning-start|reasoning-delta{text}|reasoning-end`、`text-delta{text}`、`tool-call{toolCallId,toolName,input}`、`finish{totalUsage,finishReason,rawFinishReason}`、`error{message,statusCode,isRetryable}`、`abort`。`finish.totalUsage.inputTokenDetails.{cacheReadTokens,cacheWriteTokens}` → `prompt_tokens_details.cached_tokens` / `prompt_cache_write_tokens`。流必须以 `finish` 或 `abort` 收尾，否则判截断。
- 上游请求头：`Authorization: Bearer <key>` + `x-command-code-version: 1.74.1` + `x-cli-environment: production`（`buildCommandApiHeaders`）。

## 登录

两条路，官方 CLI 同样两条（`cmd auth login` 走浏览器，`COMMAND_CODE_API_KEY` 走环境变量）：

| 方法 | 用户看见 | 怎么登录 |
|---|---|---|
| 浏览器登录 | 「登录」 | `commandCodeFlow`：`https://commandcode.ai/studio/auth/cli?callback=<loopback>&state=<state>&mode=redirect`，loopback `127.0.0.1:5959–5968` `/callback` |
| 粘贴 API key | 「粘贴 API Key」 | `useKey('command-code')` → `commandCodeSession({ source:'paste' })` |
| `COMMAND_CODE_API_KEY` / `~/.commandcode/auth.json` | 「导入本机 Command Code」 | `importCommandCodeAuth`。空花名册自动导入一次 |

浏览器回调**直接带凭据**，无 code 交换：`GET /callback?apiKey=…&userId=…&userName=…&keyName=…&state=…`。`flow.ts` 的 `spec.collect` 扩展负责校验四字段齐全 + state 命中；`waitCode()` resolve 的就是凭据包，`completeCommandCode` 直接 `commandCodeSessionFromCallback` 建 session。不要给它套 `exchange*Code`。

Key 形态：`user_…`（auth.json 写的就是这个）。`parseCommandCodeApiKey` 只校验非空 / 无换行控制符 / ≥8，不硬绑前缀（env 里可能是派生 key）。Bearer，无 refresh，`expiresAt = MAX_SAFE_INTEGER`，`refreshCommandCode` 是恒等 no-op。

身份：`GET /alpha/whoami?limits=1` → `{success, user:{id,name,email,userName}, org:{id}|null}`。显示优先级 `userName > email > name > user.id`。paste session 先落 `command-code-<sha256:8>` fingerprint 当 vault id；whoami 落库后 `replaceAccountId` 换成人类可读账号。uuid、`command-code-*` 一律 opaque 不进 UI。

Key 不写 log。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"command-code"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

没有模型端点（`/alpha/models` 不存在），`commandCodeCatalogModels()` 是纯静态出口，不做 live 刷新；`npm run models` 对本键只报 `manual`。

- 行来自 CLI bundle 的静态注册表（1.74.1 92 行），剔除 6 个 hidden 促销 / 别名行（`MiniMaxAI/MiniMax-M3-Free`、`minimax/minimax-{m2.7,m3}-free`、`meituan/LongCat-2.0:free`、`tencent/Hy3`、`inclusionai/ling-3.0-flash-free`）与日期门控行 `stealth/pixel-canary`（门已过），取 85 个可见行；1.74.1 起隐藏别名也进了注册表，仍按 hidden 不收。
- `reasoningEfforts` 取注册表行自带的 `reasoningEfforts` 列表（值是 wire 拼写）；bundle 的 effort Map 只在行缺该字段时回退，没有条目不发明 fallback。
- `contextWindow` 缺省回填 CLI 默认 200000；`maxTokens` 不按行写（CLI 全局 64000）。
- 上限槽：`maxContextWindow`（自定义输入窗上限）对 command-code 行生效（`familyMaxContextWindow` 直接查静态行；本家纯静态、无 live 投影，不需要 carry）。CLI 注册表每行只有一个 ctx，没有第二档可挂，行上目前不写。

模型页的价格徽标（💰）读 [`src/catalog/rates.json`](../../catalog/rates.json) 的 `"command-code"` 键。**1.74.1 起价目表是一张按 billing id 的单表**（`getDisplayRates` 直接查它，字段 `inputCost/outputCost/cacheReadCost/cacheWriteCost/cacheWrite1hCost`，不再有 `kD/lD/xD/…` 多表与 `order`/provider 解析，也不再带 `contextTiers` 与 `timeOfDay`）；本表基础价与 `cacheWrite` 按该表逐行对账。`tod.peak`/`tod.offPeak`（5 行 deepseek 峰谷价）与 `tierThreshold`/`tiers`（4 行 gpt 超阈档）是 1.73.1 bundle 的 `timeOfDay`/`contextTiers` 留下的字段——1.74.1 的源不再声明它们，按 models.md「源没有的字段保留目录值」留着；维护者确认峰谷 / 超阈档取消后，删这 5 行的 `tod.*`、4 行的 tier 字段与顶层 `timeOfDay`。升钉版本时要重新对这张表。

最近核对：2026-10-03，升钉 `command-code@1.74.1`。注册表 92 行对账（−6 hidden −1 日期门控 = 85 可见，与目录双向零差异），无新模型、无下架；CHANGELOG 的两处模型改动已收：1.73.3 给 5 个 deepseek 行加 `off`（可关思考，DSH 值 `null` = 不发 `reasoning_effort`，CLI `fallbackEffort` 同款）、1.73.4 给 `stealth/space-bunny-alpha` 加 `max`。价目表换成单表（见上）：基础价逐行更新，新增 15 行 `cacheWrite`（源首次声明缓存写价），`zai-org/GLM-5` 涨到 $1/$3.2/$0.2、`deepseek/deepseek-v4-pro` 基础价随 off-peak 归并到 0.66/1.98/0.022。wire 与 1.73.1 逐字一致（仅压缩名偏移）；`promptCost/completionCost/cacheWrite5mCost/cacheHitCost` 在 1.74.1 bundle 里已不存在。

上次核对：2026-10-01，升钉 `command-code@1.73.1`。注册表 91 行对账（−5 hidden 促销行 = 86 可见，与目录双向零差异），无新模型；`stealth/pixel-canary` 行加了 `get hidden(){isPixelCanaryEnded()}` 日期门（`2026-10-01T06:00:00Z`，stealth 预览 9/30 结束，已过）——**删目录行与价目行**（86→85）；`inclusionai/ling-3.1-flash:free` 的 notice 从 100/day 改 300/day（纯提示文案，不进行）；价目表 35 行无变化；wire 与 1.72.2 逐字一致（仅压缩名偏移）。

上次核对：`command-code@1.72.2` bundle；本次（1.70.0 / 1.71.0，见 npm CHANGELOG）收 `gpt-6.1-sol`（105 万窗、text+image、low–max，插在 `gpt-6-astra` 后）与 `inclusionai/ling-3.1-flash:free`（262K、text-only、low/medium/high，badge free、与 sante 同待遇不 hidden；注册表给 `maxOutputTokens:32768`，按本家既定规则不写行级 `maxTokens`）。价目表只加两行（`openai:gpt-6.1-sol` $2/$10、>272K $4/$15；`novita:inclusionai/ling-3.1-flash:free` 全 0），其余 33 行价目与 1.69.0 相同。

## 额度

与 CLI `fetchUsageData` 同序：

```text
GET /alpha/whoami?limits=1                         → user + org.id
GET /alpha/billing/credits?orgId=…                 → credit 池 + windowLimits
GET /alpha/billing/subscriptions?orgId=…           → planId/status/period
GET /alpha/usage/summary?orgId=…&since=<periodStart> → totalCost 等
```

- 套餐：`subscription.data.planId`（`individual-go|goat|provider|pro|pro-v1|max|ultra|teams-pro`）→ `COMMAND_CODE_PLAN_NAMES` 显示名；`COMMAND_CODE_PLAN_CREDITS` 是 CLI `rr` 月额度表（USD）。`data:null`（无订阅）不报错、无 planType。
- Credits 行：`unit:'usd'` + `used`/`total`。池 = monthly + purchased + free；订阅有效（`active|trialing|past_due`）时 total 用 `max(planMonthly, monthly) + purchased + free`，否则 `spent + remaining`（CLI `projectUsageView`）。
- `windowLimits.{fiveHour,weekly}` `{used,cap,resetAt}` → primary / weekly 剩余条。
- `org:null`（个人号常见）→ billing/usage 不带 `orgId`，照常跑。

## 缓存

`/alpha/generate` 顶层 `threadId` 是会话亲和键（必须是 uuid 或被丢——`toWireThreadId` 同款行为）：

- DSH `prompt_cache_key` / `session_id` 是 uuid → 原样用
- 非 uuid → `deterministicCommandCodeId(<key>)`（sha256 裁成 uuid v5 形状，同 key 同 id）
- 都没有 → `dsh-command-code:<model>` 常量种子的确定性 uuid，不 `Date.now()`/random
- 剥：`prompt_cache_key`、`session_id`、`prompt_cache_retention`、`prompt_cache_options`、`cache_control`、`service_tier`、`store`、`user`、`metadata`、`parallel_tool_calls`、`logprobs`、`top_logprobs`、`logit_bias`、`n`、`seed`、`stream_options`、`response_format`、`frequency_penalty`、`presence_penalty`、`stop`

非 vision 模型丢 image part（CLI `stripImages` 同款）；`https?://` 图片 URL 不下载（与参照一致）。

## 不要

- 把 `/alpha/generate` 当 OpenAI 兼容端点透传——它是私有 JSONL 协议
- 给浏览器登录套 `exchange*Code`——回调直接带 apiKey，没有 code
- 写 `commandcode.ai` 页面源码里没出现的端点（`/alpha/models` 不存在）
- 把 `user_…` key / uuid / `command-code-<hex>` 当卡片账号名
- 发明 `promptCache` / workspace 字段（CLI 有 `config`，DSH 没有真实 cwd——留空）
- 发明 per-model `maxTokens`（CLI 全局 64000）或不存在的 effort 拼写
- 抄别家 cache 头/字段；`session_id`/`prompt_cache_key` 原样上送会污染 wire
- 用 `Date.now()`/random 当 threadId

## 归因

一线：npm `command-code` **1.74.1**（bin `command-code` / `cmd` / `cmdc` / `commandcode`；npm tarball `dist/{index,cli}.mjs`）。没有公开源码仓，端点、wire、登录流、目录、套餐表全部读该 bundle。

| 抄 | 出处 | 本 hop |
|---|---|---|
| `Bearer` + `x-command-code-version: 1.74.1` + `x-cli-environment: production` | `buildCommandApiHeaders` | `commandCodeUpstreamHeaders` |
| `POST /alpha/generate`：`{config, memory, taste, skills, mode:'chat', permissionMode, threadId?, params:{model,messages,tools?,system?,max_tokens,stream,temperature?,reasoning_effort?}}` → JSONL 事件 | `buildServerConfig` / `toWireMessages` | `openaiToCommandCode` / `forwardCommandCode` |
| 流事件 `reasoning-*` / `text-delta` / `tool-call` / `finish` / `error` / `abort`；`finish.totalUsage.inputTokenDetails` | bundle 流事件 switch | `commandCodeToOpenai` / SSE 映射 |
| `threadId` 非 uuid 丢弃 | `toWireThreadId` | `applyCommandCodeCache`：uuid 直通、非 uuid sha256→v5、缺省 `dsh-command-code:<model>` 常量种子 |
| `/studio/auth/cli?callback&state&mode=redirect` → loopback `127.0.0.1:5959–5968/callback?apiKey&userId&userName&keyName&state` | `createAuthServer` / `buildCommandAuthUrl` | `commandCodeFlow` + `flow.ts` `spec.collect`（回调即凭据，无 code 交换） |
| `COMMAND_CODE_API_KEY` → `~/.commandcode/auth.json` | `getCommandAuthKey` | `importCommandCodeAuth` 同序 |
| 模型注册表（剔 hidden / 别名 + 日期门控行）+ 行自带 effort 列表；`max_tokens ?? 64000`；ctx 默认 `2e5` | bundle 注册表（`{id,inputModalities,reasoningEfforts,contextWindow}` 形状）与 hidden `Set` | `COMMAND_CODE_MODELS`；无条目不发明 effort |
| whoami → credits + subscriptions → summary（`since=currentPeriodStart`）；套餐价目 `individual-*` / `teams-pro` | `fetchUsageData` / `rr` | `fetchCommandCodeQuota` / `COMMAND_CODE_PLAN_*` |
| 显示费率表（1.74.1：按 billing id 的单表，`getDisplayRates` 直接查；1.73.1 及以前的 kD/lD/… 多表已不存在） | bundle 价目表 | `src/catalog/rates.json` → Models 页价格 tooltip（不进路由行） |

端点实测（2026-01，`xxww0098` 账号）：`whoami` / `credits` / `subscriptions` / `usage/summary` 200；`generate` 过了 400 系校验、停在 402 计费门（账号 0 额度），即 wire 形状已到计费校验层。

**不要发明：** 这份对照得出的禁令（OpenAI 兼容透传、`exchange*Code`、`/alpha/models`、`promptCache` / 真实 `workingDir`、per-model `maxTokens`、非 uuid `threadId`、opaque id 当账号名）都在「不要」与「缓存」两节，这里不重复。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
