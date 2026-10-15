# Command Code

本文件是 `src/apikey/command-code/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Command Code 订阅（[commandcode.ai](https://commandcode.ai) / api.commandcode.ai）。官方 CLI 是 npm 包 `command-code`（bin `command-code` / `cmd` / `cmdc` / `commandcode`，本表按 `1.82.3` 归因）。

> 非正式集成。只用用户自己的 API key（paste / `COMMAND_CODE_API_KEY` / `~/.commandcode/auth.json`）或用户本人跑完的 studio 浏览器登录。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 端点常量、API key session、Bearer 头、`/alpha/whoami` 身份、套餐表、studio loopback flow spec |
| [`catalog.ts`](catalog.ts) | 目录出口 `commandCodeCatalogModels()`：钉住注册表做下限，`GET /provider/v1/models` 刷新成员与窗口 |
| [`import.ts`](import.ts) | `COMMAND_CODE_API_KEY` 优先、`~/.commandcode/auth.json` 其次（与 CLI `getCommandAuthKey` 同序） |
| [`cache.ts`](cache.ts) | `threadId` uuid 亲和：DSH 会话键 → 确定性 uuid；剥全部外来字段 |
| [`request.ts`](request.ts) | OpenAI body ↔ `/alpha/generate` wire；JSONL 事件 → chat.completion / SSE |
| [`transport.ts`](transport.ts) | `POST /alpha/generate` JSONL 消费、`forwardCommandCode`（stream/non-stream；输出前只重放传输故障，HTTP 状态与 `error` 事件交给宿主重试） |
| [`failure.ts`](failure.ts) | 上游拒绝的分类：版本门 / 不在套餐 / 额度与窗口 → 宿主看得懂的答案（见「失败分类」） |
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

Wire（1.82.3 bundle，与 1.69.0 起逐字一致，仅压缩名偏移与版本字面量）；上游请求头：

- 顶层：`{ config, memory:null, taste:null, skills:null, mode:'agent', permissionMode, threadId?, params }`。`mode` 是服务端闭集枚举（`agent`/`learning`/`custom-agent`/`custom-agent-create`/`title-gen`/`tool-desc`/`compact`/`vision`），主对话走 `agent`；旧值 `chat` 已被拒（400 BAD_REQUEST，2026-10-11 活测）。`config` 是 `buildServerConfig` 形状——DSH 没有真实工作区，`workingDir`/git 字段诚实地留空，不编造 cwd。
- `params`：`{ model, messages, tools?, system?, max_tokens, stream:true, temperature?, reasoning_effort? }`。`max_tokens` 上限 64000（CLI `max_tokens ?? 64000`，无 per-model cap）。`stream` 恒 true（CLI 恒流式；非流式由 hop 收集后回 JSON）。
- `messages`：user `content` 是 string 或 part[]（`{type:'text'}` / `{type:'image', image}`）；assistant content parts `{type:'text'|'reasoning'|'tool-call'}`，tool-call 是 `{toolCallId, toolName, input}`；`role:'tool'` 的 result part 是 `{type:'tool-result', toolCallId, toolName, output:{type:'text'|'error-text', value}}`。
- `tools`：Anthropic 拼写 `{name, description, input_schema}`。
- `reasoning_effort`：值是该行 `reasoningEfforts` 列表里的拼写（`low|medium|high|xhigh|max` 子集，逐模型不同）；模型无条目 / `off` → 字段整体省略（CLI `supportsThinking ? effort : undefined`）。
- 事件：`reasoning-start|reasoning-delta{text}|reasoning-end`、`text-delta{text}`、`tool-call{toolCallId,toolName,input}`、`finish{totalUsage,finishReason,rawFinishReason}`、`error{message,statusCode,isRetryable}`、`abort`。`finish.totalUsage.inputTokenDetails.{cacheReadTokens,cacheWriteTokens}` → `prompt_tokens_details.cached_tokens` / `prompt_cache_write_tokens`。流必须以 `finish` 或 `abort` 收尾，否则判截断。
- 上游请求头：`Authorization: Bearer <key>` + `x-command-code-version: 1.82.3` + `x-cli-environment: production`（`buildCommandApiHeaders`）。

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

`/alpha/models` 不存在，但供应商自己的模型列表在：`GET https://api.commandcode.ai/provider/v1/models` **不需要 key**（活测 2026-10-10：200，`{object:'list',data:[…]}`，87 行，id / name / `context_length` 与钉住注册表逐行相同；2026-10-15 同一列表 90 行，与 1.82.3 可见目录逐 id 相同）。`commandCodeCatalogModels()` 以钉住注册表为下限，`warmCatalogs` 登录后用它刷新；`npm run models -- command-code` 也打这个列表做漂移报告（活测同日 `+0 ~0 -0 missing 0`）。

合并规则（`mergeCommandCodeProviderModels`）：

- 已知 id 保留策展名、`reasoningEfforts`、`input`（列表一个都不带），窗口取列表的 `context_length`（注册表只是钉住那一刻的快照）。
- 列表新增的 id 追加在末尾，只写列表确实说了的三样：`id` / `name` / `contextWindow`。列表不说推理档位也不说看图，本 hop 就不写——magpie 对模态用的是同一条规矩（说不出来就别说，让宿主自己答）。行加载器只要求 id/name/contextWindow，缺 `input` 时路由按宿主默认走。
- 注册表里有、列表里没有的行**保留**：`/alpha/generate` 归因的是钉住注册表，漂移由 `npm run models` 报出来，不做静默删除。
- 读失败或读空都退回钉住注册表；刷新按 10 分钟 TTL 缓存。

**为什么不上 Provider API 做传输。** magpie 的默认路径是 `api.commandcode.ai/provider/v1`（Claude 走 `/messages`，其余走 `/chat/completions`，`supported_endpoints` 决定），`/alpha/generate` 只是 Go 档的回退。这个面确实是活的：同一个 key 打 `/provider/v1/{chat/completions,messages,responses}` 都过鉴权（活测 2026-10-10 回 400 `insufficient credits`，不是 401/403），`x-api-key` 与 `Authorization` 任一都可，列表不带 key 也 200。本 hop 仍然只用 `/alpha/generate`：① 该账号没有订阅（`subscriptions` 回 `data:null`）、没有额度，跑不出一次成功补全，换传输等于交一段没活测过的代码；② Go 档按 magpie 的说法没有 Provider API 权限，切过去要按套餐分叉；③ DSH 的 `api` 是闭集，`/messages` 与 `/chat/completions` 要拆成多条路由（照 opencode-go 的三路由），那是另一次改动。要动先活测。

- 行来自 CLI bundle 的内嵌目录（1.82.3 99 行，`schemaVersion: 1`）。可选性看行上的 `hidden`（`resolveCatalogModelStatus` 的 `state === "selectable"`），不再另有 hidden `Set`。9 行 hidden：原先那 8 行（`MiniMaxAI/MiniMax-M3-Free`、`minimax/minimax-{m2.7,m3}-free`、`meituan/LongCat-2.0:free`、`tencent/Hy3`、`inclusionai/ling-3.0-flash-free`、`stealth/space-bunny-alpha`、`stealth/pixel-canary`）加上 `inclusionai/ling-3.1-flash:free`。可见 90 行。`isLingFlashFreeEnded`（`2026-08-03T13:00:00Z`）仍在，管的是已经 hidden 的 3.0 免费行。
- `reasoningEfforts` 取注册表行自带的 `reasoningEfforts` 列表（值是 wire 拼写）；bundle 的 effort Map 只在行缺该字段时回退，没有条目不发明 fallback。
- `contextWindow` 缺省回填 CLI 默认 200000；`maxTokens` 不按行写（CLI 全局 64000）。
- 上限槽：`maxContextWindow`（自定义输入窗上限）对 command-code 行生效（`familyMaxContextWindow` 直接查静态行；本家纯静态、无 live 投影，不需要 carry）。CLI 注册表每行只有一个 ctx，没有第二档可挂，行上目前不写。

模型页的价格徽标（💰）读 [`src/catalog/rates.json`](../../catalog/rates.json) 的 `"command-code"` 键。**1.82.3 起价在内嵌目录行的 `pricing` 上**（`inputCost` / `outputCost` / `cacheReadCost` / `cacheWriteCost`；`getDisplayRates` 已不在 bundle 里）。1.74.1 到 1.82.1 是一张按 billing id 的单表，字段同名，不再有 `kD/lD/xD/…` 多表，也不再带 `contextTiers` 与 `timeOfDay`。`tod.peak`/`tod.offPeak`（5 行 deepseek 峰谷价）与 `tierThreshold`/`tiers`（4 行 gpt 超阈档）是 1.73.1 bundle 留下的字段——1.74.1 起的源不再声明它们，按 models.md「源没有的字段保留目录值」留着；维护者确认峰谷 / 超阈档取消后，删这 5 行的 `tod.*`、4 行的 tier 字段与顶层 `timeOfDay`。升钉时把可见行的 `pricing` 和目录价目对一遍。1.82.3 与 1.82.1 的旧可见行零改价；新增 `Qwen/Qwen3.8-Max-Prime`（$4/$12，cacheRead $0.50，cacheWrite $5）与 `inclusionai/ling-3.1-flash`（$0.30/$0.90，cacheRead $0.06）。1.82.1 的表 99 条：新增 `google/gemini-4-argon`（$2/$10，cacheRead $0.10）与 `meta/muse-wonder-1.0`（$4/$20，cacheRead $0.20），`anthropic:claude-sonnet-5-5` 的 cacheRead 由 $0.20 改 $0.10。

最近核对：2026-10-15，升钉 `command-code@1.82.3`（1.82.2 CHANGELOG `feat: retire ling 3.1 flash free`，1.82.3 只 bump deps）。注册表收成内嵌目录，99 行、9 hidden、90 可见，与公开列表 90 行逐 id 相同。退役 `inclusionai/ling-3.1-flash:free`（行上 `hidden: true`，目录与价目都删）。新收 `Qwen/Qwen3.8-Max-Prime`（1M 窗、text+image、low/medium/xhigh；行级 `maxOutputTokens` 131072 按本家规则不写）与 `inclusionai/ling-3.1-flash`（262144 窗、text、low/medium/high；行级 `maxOutputTokens` 32768 不写）。列表不提供 effort 与模态，这两行按内嵌目录补。旧可见行窗口、effort、价都没变。wire 与 1.82.1 逐字一致（`/alpha/generate`、`max_tokens ?? 64e3`、body 顶层与 `params`、请求头名、`classifyKind` 开头全同，仅压缩名偏移和版本字面量 `1.82.1`→`1.82.3`）。

上次核对：2026-10-14，升钉 `command-code@1.82.1`。CHANGELOG：1.79.2 `feat: haiku 5.5 in goat plan`、1.80.0 `Mods Hub + ModApi` 与 `feat: add muse wonder`、1.81.0 `codemode` 工具、1.82.0 `feat: gemini argon`（另两条是 CLI 行为：拒绝不再自动重发同一提示、`!` bash 模式输出回到 agent）、1.82.1 只改 onboarding 的语言选择。注册表 95→97 行对账（−8 hidden = 89 可见，与公开列表 89 行逐行同 id）：新增 `google/gemini-4-argon`（1M 窗、text+image、low/medium/high）与 `meta/muse-wonder-1.0`（Muse Wonder，1048576 窗、text+image（源的 `file` 按目录规则剥掉）、low/medium/high/xhigh）；列表不提供 effort 与模态，这两行的 `input` / `reasoningEfforts` 按钉住注册表补，行级 `maxOutputTokens` 按本家规则不写。hidden `Set` 未变（别名 `kn` + 7 个成员 = 8）。价目表 97→99 条：新增 `google/gemini-4-argon`（$2/$10/$0.10）与 `meta/muse-wonder-1.0`（$4/$20/$0.20），`anthropic:claude-sonnet-5-5` 的 cacheRead $0.20→$0.10 随源改，旧键其余无改价。wire 与 1.79.1 逐字一致（`/alpha/generate`、`max_tokens:n.maxOutputTokens??64e3`、body 顶层与 `params` 字段、三个请求头、`classifyKind` 分类全同，仅压缩名偏移）。

上次核对：2026-10-10，对齐社区对照 `@magpie-community/opencode-commandcode-auth`（钉 CLI 1.72.2，已落后）：收它的模型列表源（`/provider/v1/models`，公开、无需 key）与拒绝分类；不收它的 Provider API 传输（理由见「模型」节）。活测：列表 200 / 87 行，id 与 `context_length` 与目录逐行相同（`npm run models -- command-code` 报 `+0 ~0 -0`）；`supported_endpoints` 分布 `/chat/completions` 76、`/responses` 68、`/messages` 11（Claude）；同 key 打 Provider API 三个端点都过鉴权、停在 400 `insufficient credits`（`subscriptions` 回 `data:null`，无订阅无额度）；`/alpha/generate` 无版本头回 403 `upgrade_required`、带 1.79.1 过。目录行未变（仍 87 行）。

上次核对：2026-10-08，升钉 `command-code@1.79.1`（1.78.0 CHANGELOG `feat: haiku 5.5`，1.79.0 `feat: add Glyph Cluster free model`，1.79.1 只修 Windows prompt 冻结）。注册表 95 行对账（−8 hidden = 87 可见）：新增 `claude-haiku-5-5`（1M 窗、text+image、low–max，行上无 `maxOutputTokens`）与 `stealth/glyph-cluster:free`（256K 窗、text、low–xhigh；行级 `maxOutputTokens:256000` 按本家规则不写）。hidden `Set` 未变。价目表 95→97 条，旧键无改价。wire 与 1.77.0 逐字一致（`64e3` / `x-cmd-zdr` / body 字段与流事件标记全同，仅压缩名偏移）。

上次核对：2026-10-07，升钉 `command-code@1.77.0`。注册表 93 行对账（−8 hidden = 85 可见，与目录双向零差异）：新增 `mistral/mistral-large-4`（524288 窗、text+image、low/medium/high；行级 `maxOutputTokens:262144` 按本家规则不写）；`stealth/space-bunny-alpha` 进 hidden `Set`（1.74.2 CHANGELOG「retire the two free stealth preview models」——退役 = 隐藏，行仍在注册表但 `reasoningEfforts`/`maxOutputTokens` 被剥掉），**删目录行与价目行**；`stealth/pixel-canary` 的 billing id 同样从价目表删除。价目表 96→95 条，除上述加删外无一条改价。wire 与 1.74.1 逐字一致（`toWireMessages` / `64e3` / `x-cmd-zdr` / body 字段与流事件标记全同，仅压缩名偏移）。

上次核对：2026-10-03，升钉 `command-code@1.74.1`。注册表 92 行对账（−6 hidden −1 日期门控 = 85 可见，与目录双向零差异），无新模型、无下架；CHANGELOG 的两处模型改动已收：1.73.3 给 5 个 deepseek 行加 `off`（可关思考，DSH 值 `null` = 不发 `reasoning_effort`，CLI `fallbackEffort` 同款）、1.73.4 给 `stealth/space-bunny-alpha` 加 `max`。价目表换成单表（见上）：基础价逐行更新，新增 15 行 `cacheWrite`（源首次声明缓存写价），`zai-org/GLM-5` 涨到 $1/$3.2/$0.2、`deepseek/deepseek-v4-pro` 基础价随 off-peak 归并到 0.66/1.98/0.022。wire 与 1.73.1 逐字一致（仅压缩名偏移）；`promptCost/completionCost/cacheWrite5mCost/cacheHitCost` 在 1.74.1 bundle 里已不存在。

更早核对：2026-10-01，升钉 `command-code@1.73.1`。注册表 91 行对账（−5 hidden 促销行 = 86 可见，与目录双向零差异），无新模型；`stealth/pixel-canary` 行加了 `get hidden(){isPixelCanaryEnded()}` 日期门（`2026-10-01T06:00:00Z`，stealth 预览 9/30 结束，已过）——**删目录行与价目行**（86→85）；`inclusionai/ling-3.1-flash:free` 的 notice 从 100/day 改 300/day（纯提示文案，不进行）；价目表 35 行无变化；wire 与 1.72.2 逐字一致（仅压缩名偏移）。

早期核对：`command-code@1.72.2` bundle；本次（1.70.0 / 1.71.0，见 npm CHANGELOG）收 `gpt-6.1-sol`（105 万窗、text+image、low–max，插在 `gpt-6-astra` 后）与 `inclusionai/ling-3.1-flash:free`（262K、text-only、low/medium/high，badge free、与 sante 同待遇不 hidden；注册表给 `maxOutputTokens:32768`，按本家既定规则不写行级 `maxTokens`）。价目表只加两行（`openai:gpt-6.1-sol` $2/$10、>272K $4/$15；`novita:inclusionai/ling-3.1-flash:free` 全 0），其余 33 行价目与 1.69.0 相同。

## 失败分类

上游的拒绝有两种信封——`/alpha/generate` 是 `{success:false,error:{code,status,message,hint}}`，Provider API 是 `{error:{message,type,code}}`；CLI 自己的 `classifyKind`（bundle 1.79.2）把它们分成 auth / credits / plan / usage-limit / rate-limit / overloaded。[`failure.ts`](failure.ts) 只改其中三类，其余交给上游：

| 上游 | 宿主若照收会怎么读 | 本 hop |
|---|---|---|
| `upgrade_required`（403；客户端版本低于服务端 `minVersion`） | 报文里的 403 → AUTH，登录被判死 | 400 +「Command Code rejected this client version; update the plugin (upstream minVersion …)」 |
| `MODEL_NOT_IN_PLAN` / `model_not_in_plan` | 同上（403） | 400 +「Model not in plan: …」 |
| 额度（`premium_credits_exhausted` / `insufficient credits` / `out of credits`） | 402 不算配额，宿主要么当未知错要么重试 | 429 `usage limit reached: …`（QUOTA_EXCEEDED，不重试） |
| 窗口（`RATE_LIMITED` / `window_limit` / 5 小时 / 每周 / resets） | 429 → RATE_LIMIT，白重试 5 次 | 同上，走 `quotaFailure` |
| 401、普通 429、5xx、校验错误 | —— | 原样转发 |

宿主分类器（`llm-pi-ai` `classifyPiAiError`）的次序是 `\b(?:401|403)\b` → AUTH、再配额、再 429，所以**改写过的报文里不能再出现 401/403 这两个数字**：版本门与套餐拒绝自己措辞，额度/窗口的厂商原文先过一遍 `4xx` 替换（`sanitize`）。版本门是活的：活测 2026-10-10 不带版本头或带 `0.1.0` 都回 403 `upgrade_required`（`minVersion 0.18.10`），当时的钉 1.79.1 与 1.72.2 都过——上游抬 `minVersion` 时用户会先看到「更新插件」，而不是被登出。

`forwardCommandCode` 输出前的失败现在带上游状态（原来一律 502，把 429/400 糊成 SERVER 重试；传输故障仍 502）。流中途已经出过字节的失败只能写 SSE error 行，状态改不了。

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
- 写没验证过的端点：`/alpha/models` 不存在；`/provider/v1/models` 是活的（公开、200）但只当列表用，别顺手把 `/provider/v1/chat/completions` 当成本 hop 的推理入口
- 把 `user_…` key / uuid / `command-code-<hex>` 当卡片账号名
- 发明 `promptCache` / workspace 字段（CLI 有 `config`，DSH 没有真实 cwd——留空）
- 发明 per-model `maxTokens`（CLI 全局 64000）或不存在的 effort 拼写
- 抄别家 cache 头/字段；`session_id`/`prompt_cache_key` 原样上送会污染 wire
- 用 `Date.now()`/random 当 threadId
- 把上游 403 原样交给宿主：版本门（`upgrade_required`）与不在套餐（`MODEL_NOT_IN_PLAN`）都会读成登录失效；改写后的报文里也不要留 401/403 字样
- 在没活测过成功补全的情况下把传输换成 Provider API（理由见「模型」节）；也别以为 `x-api-key` 是必需的——Bearer 单独就能过
- 把云列表里的新 id 直接当完整行写进目录：它只给 id / name / context_length，推理档位与看图要另找出处

## 归因

一线：npm `command-code` **1.82.3**（bin `command-code` / `cmd` / `cmdc` / `commandcode`；npm tarball `dist/{index,cli}.mjs`）。没有公开源码仓，端点、wire、登录流、目录、套餐表全部读该 bundle。

| 抄 | 出处 | 本 hop |
|---|---|---|
| `Bearer` + `x-command-code-version: 1.82.3` + `x-cli-environment: production` | `buildCommandApiHeaders` | `commandCodeUpstreamHeaders` |
| `POST /alpha/generate`：`{config, memory, taste, skills, mode:'agent', permissionMode, threadId?, params:{model,messages,tools?,system?,max_tokens,stream,temperature?,reasoning_effort?}}` → JSONL 事件 | `buildServerConfig` / `toWireMessages` | `openaiToCommandCode` / `forwardCommandCode` |
| 流事件 `reasoning-*` / `text-delta` / `tool-call` / `finish` / `error` / `abort`；`finish.totalUsage.inputTokenDetails` | bundle 流事件 switch | `commandCodeToOpenai` / SSE 映射 |
| `threadId` 非 uuid 丢弃 | `toWireThreadId` | `applyCommandCodeCache`：uuid 直通、非 uuid sha256→v5、缺省 `dsh-command-code:<model>` 常量种子 |
| `/studio/auth/cli?callback&state&mode=redirect` → loopback `127.0.0.1:5959–5968/callback?apiKey&userId&userName&keyName&state` | `createAuthServer` / `buildCommandAuthUrl` | `commandCodeFlow` + `flow.ts` `spec.collect`（回调即凭据，无 code 交换） |
| `COMMAND_CODE_API_KEY` → `~/.commandcode/auth.json` | `getCommandAuthKey` | `importCommandCodeAuth` 同序 |
| 模型目录（剔 `hidden: true` 的行）+ 行自带 effort 列表；`max_tokens ?? 64000`；ctx 默认 `2e5` | bundle 内嵌目录（`hidden` 为可选性权威） | `COMMAND_CODE_MODELS`；无条目不发明 effort |
| whoami → credits + subscriptions → summary（`since=currentPeriodStart`）；套餐价目 `individual-*` / `teams-pro` | `fetchUsageData` / `rr` | `fetchCommandCodeQuota` / `COMMAND_CODE_PLAN_*` |
| 显示费率（1.82.3 起在内嵌目录行的 `pricing`；1.74.1–1.82.1 是 billing id 单表，`getDisplayRates` 已不在；1.73.1 及以前的 kD/lD/… 多表已不存在） | bundle 目录 `pricing` | `src/catalog/rates.json` → Models 页价格 tooltip（不进路由行） |
| 供应商模型列表（成员 + name + `context_length` + `supported_endpoints`） | 社区对照 [`@magpie-community/opencode-commandcode-auth`](https://github.com/magpie-community/plugins/tree/main/packages/commandcode) `liveModels`；本 hop 活测复核 200；2026-10-15 为 90 行，与 1.82.3 可见目录逐 id 相同 | `refreshCommandCodeCatalog` + `mergeCommandCodeProviderModels`，`npm run models -- command-code` |
| 拒绝分类（auth / credits / plan / usage-limit / rate-limit） | CLI bundle `classifyKind` + magpie `failure()`；本 hop 活测复核 403 版本门与 400 额度门 | `commandCodeFailure`（「失败分类」节的四类改写；不照抄 magpie 的「套餐=403」——DSH 宿主见 403 就判死登录） |

端点实测（2026-01，`xxww0098` 账号）：`whoami` / `credits` / `subscriptions` / `usage/summary` 200；`generate` 过了 400 系校验、停在 402 计费门（账号 0 额度），即 wire 形状已到计费校验层。

**不要发明：** 这份对照得出的禁令（OpenAI 兼容透传、`exchange*Code`、`/alpha/models`、`promptCache` / 真实 `workingDir`、per-model `maxTokens`、非 uuid `threadId`、opaque id 当账号名）都在「不要」与「缓存」两节，这里不重复。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
