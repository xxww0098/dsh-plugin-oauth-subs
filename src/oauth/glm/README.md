# GLM OAuth（Z.ai / BigModel）

本文件是 `src/oauth/glm/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Zhipu **Coding Plan**（付费 Lite/Pro/Max）。两个站点、同一套 ZCode CLI poll。默认对话走 **Anthropic Messages**（ZCode Desktop 默认协议），**不**走 chatgpt.com。

**ZCode 已开源**（<https://github.com/zai-org/ZCode>，`872ad96 feat: open source`，tree `3.14.0`）。本文件里「官方怎么发」都能追到那一份源码：网关改写、身份头、catalog 思考 map、Anthropic 缓存 breakpoint。

官方 Anthropic：<https://docs.z.ai/devpack/quick-start>
官方缓存：<https://docs.z.ai/guides/capabilities/cache>
官方思考（Completions 形）：<https://docs.z.ai/guides/capabilities/thinking-mode>

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 区域、端点（含 ZCode 网关 + 直连回退）、CLI init/poll、Z.ai biz 登录 + 铸 key、官方身份头、会话 |
| [`cli-flow.ts`](cli-flow.ts) | 浏览器打开 `authorize_url`，轮询 `/oauth/cli/poll/{flow_id}`。无 loopback、无 PKCE |
| [`request.ts`](request.ts) | Anthropic 官方思考 map（`thinking` + `output_config.effort`）+ Completions 残留；再调 cache |
| [`cache.ts`](cache.ts) | 隐式前缀哈希。Completions：钉首段 system，多余停 **messages 末尾**。Anthropic：钉 system 首块 `cache_control` + **最新非 system 消息滚动 breakpoint**。剥掉 Codex `prompt_cache_key` |
| [`boost.ts`](boost.ts) | 卡片「150%配额」文案（ZCode 网关/身份路径，发放仍在上游服务端） |

调度：[`../proxy.ts`](../proxy.ts) `family === 'glm'` + `wire === 'anthropic'` → `normalizeGlmAnthropicBody`；Completions 残留 → `normalizeGlmChatBody`。`x-session-id` 在 `glmDesktopHeaders`；Anthropic 另加 `anthropic-version`。
额度：[`../quota.ts`](../quota.ts) `fetchGlmQuota` / `parseGlmQuota` / `mergeGlmToolUsage`。
套餐：`GLM_PLAN_NAMES`（`coding_pro` → **Pro**，不要和 Codex `pro` → Pro 20x 搞混）。
协议：[`../models.ts`](../models.ts) `api: anthropic-messages`，`baseURL: ${origin}/glm`（Anthropic SDK 打 `{baseURL}/v1/messages`）。
**体验套餐（Start Plan）不支持：** ZCode Desktop 对 zcode-plan hop 强制注入阿里云 captcha 头，插件不伪造、不接 captcha SDK，没这颗头网关 `400 code 3007 captcha verify failed`。目录 / 路由只留 Coding Plan；导入跳过 start-plan JWT。试用对话请在 ZCode.app。

## 登录

ZCode 欢迎页两颗按钮 = 两个 CLI provider id：**`zai`**（全球）和 **`bigmodel`**（国内）。`zcode` 当 provider 会 500。

```text
POST zcode.z.ai/api/v1/oauth/cli/init   { provider: "zai" | "bigmodel" }
打开 data.authorize_url
轮询 /oauth/cli/poll/{flow_id}

Z.ai：     data.zai.access_token → POST api.z.ai/api/auth/z/login → 再铸 id.secret（Coding Plan bearer）
BigModel： data.bigmodel.access_token 就是 Coding Plan bearer（业务 token），不铸 key；
           data.token（zcode JWT）只给 Start Plan，不能当 bearer
```

入口：`GlmCliFlowManager.start` → `glmCliInit` / `glmCliPoll` → `completeGlmCli` → `glmSession`。

轮询语义照官方 `auth-login-polling.ts`：`expires_at` 是 **epoch 秒**（×1000，不是进程自己编的 5 分钟）；`poll_interval_sec` 地板 **1s**；`status: failed` 与未知状态**立即**失败（`glm authorization failed` + 服务端 `msg`）；5xx / 408 / 429 / 传输错误按间隔重试，其它 4xx 与业务信封错误终止。浏览器授权页报「Authorization Failed / 授权失败」时，插件会在一个轮询周期内给出同一结论，而不是空转到超时。
**上游事故（先查再当 bug）**：浏览器落地页的「Authorization Failed / 授权失败」是 `zcode.z.ai/api/v1/oauth/cli/callback/{provider}` 兑换授权码失败后自己渲染的页；失败会把 flow 判死，poll 拿 `3004 invalid_flow`。官方 tracker 已挂：zai-org/feedback #718（BigModel authCode 兑换必现失败，30+ 次 0 成功）、#705（3.12.3 网桥 / deep-link 双重核销 → 500 `2007`）、#523（Linux token 端点 500 `2007`）、#116（zai 侧 business token `zai_oauth_required`）。客户端 init/poll 参数与官方 CLI `auth-login-polling.ts` 逐字一致，改 flow 形状修不了服务端。
`glmLoginFailureMessage` 把 `invalid_flow` / `2007 http error` 译成带 tracker 与替代路径的卡片报错。**绕行**：换另一区域按钮；或在厂商控制台建 Coding Plan API key，用 GLM 页的 **API key** 框粘贴（`AuthController.useKey`：`id.secret` / Coding Plan 密钥 + 区域，存成 `account: api-key`）。ZCode Desktop 那条 `redirect_uri→/app/oauth/login` 改写只服务 `zcode://` 深链，落地页的网桥 GET 同一个失败接口，不要抄。
刷新：Coding Plan key 不过期（`GLM_NEVER_EXPIRES`），`refreshGlm` 是空操作。
导入：`importGlmAuth` 读本机 ZCode 配置，**先 `credentials.json` 后 `config.json`**。`glmKeyFromZcodeCredentials` 解 `enc:v1` AES-256-GCM（SHA-256 over `ZCODE_CREDENTIAL_SECRET` 或机器派生 fallback）。**对话+额度的真 bearer 是 provisioned `account-provider:coding-plan:account:<region>-…-coding-plan:account:<id>:api-key`**（ZCode OAuth 后 provision 进 provider 条目的 key）；`oauth:<region>:access_token` 业务 JWT 只能打 monitor/userinfo，**不是 chat key**（打 Coding Plan 对话稳定 500），降为 `oauthAccess` 供身份回填；`zcodejwttoken` 仅身份。没有 provisioned key 才退回 OAuth token。config.json 的 `options.apiKey` 可能是已被标 `coding_plan_not_entitled` 的旧死 key（error.md 2026-09-21 抓错登录）。`glmKeyFromZcodeConfig` 认 `builtin:*-coding-plan`（含 `options.baseURL` 含 `zcode-plan` 的 JWT key——那是 start-plan，直接跳过）。可用 key 优先；**只剩系统禁用的 coding-plan key 也导入**（`glmKeyFromZcodeConfig` 返回 `usable` + `systemDisabledReason`，`importGlmAuth` 把原因写进结果 `note`）。理由：那个 flag 来自 ZCode 的缓存权益检查，会过期也会错（平台 `coding_plan_system_busy` 时一样标 `coding_plan_not_entitled`），而 key 就是 ZCode provider 条目里那把；拒绝它等于用户本机没有任何可导入的凭据，真假交给额度 / 对话回答。**唯一硬跳过的是 start-plan JWT**（zcode-plan hop 是 captcha 墙）。不读 `coding-plan-cache.json`（`enabled` 已够）。卡片身份只走 `pickGlmHumanAccount`：邮箱，其次电话，再次 `customerName` / nickname。**禁止**显示 `zcode` / `zai` / `bigmodel` / `glm`、poll `user.id`、JWT `sub` / `user_id`、数字 uid。userinfo 失败就空着抬头，不要回落到 uid。已存的 opaque `account` 在 snapshot 时打 userinfo 回填（`#resolveGlmIdentities`）。

Settings：两颗堆叠登录按钮（只这一家）。Tab 图标用 **Z.ai**（`zai`），不是智谱字母。

## 协议

DSH `llm-pi-ai` `api` 是闭集：`openai-completions` | `openai-responses` | `anthropic-messages`。选和上游原生最贴的那一种。

Z.AI Coding Plan 同时开三条：

| 上游 | URL | 是不是 Coding Plan | 选不选 |
|---|---|---|---|
| Anthropic Messages（官方网关） | `https://zcode.z.ai/api/v1/ultra[-zai]/anthropic/v1/messages` | 是。官方客户端**总是**把 Coding Plan 端点改写到网关 | **默认** |
| Anthropic Messages（直连回退） | `https://api.z.ai/api/anthropic[/v1/messages]`、`https://open.bigmodel.cn/api/anthropic[/v1/messages]` | 是 | 只作网关拒绝时的回退 |
| OpenAI Completions | `…/coding/paas/v4/chat/completions` | 是 | 残留 hop，直到下一次 `sync()`；不走网关 |
| OpenAI Responses | `https://api.z.ai/api/v1` | **不是** Coding Plan 专用 | 不选 |

所以 `oauth-glm` 写 `api: anthropic-messages`。不要改 `openai-responses`。

## 对话

```text
DSH anthropic-messages  →  本机代理 POST /glm/v1/messages  →
  Coding Plan zai:      zcode.z.ai/api/v1/ultra-zai/anthropic/v1/messages
  Coding Plan bigmodel: zcode.z.ai/api/v1/ultra/anthropic/v1/messages
  网关 401/403/404 时一次性回退直连（api.z.ai / open.bigmodel.cn）

残留（下次 sync 前）：
DSH openai-completions  →  POST /glm/v1/chat/completions  →
  …/api/coding/paas/v4/chat/completions
```

网关不是本插件发明的：`official-coding-plan-gateway.ts` 按协议 + 主机 + 有效端口 + 路径精确匹配两个官方 Anthropic 端点，命中即改发 `zcode.z.ai`，**方法 / 正文 / query / 除 `host` 外的全部头（含 `authorization`）原样透传**；NOTICE.md「官方 Coding Plan 模型网关转发」写的是同一件事，网关侧做套餐权益校验后转发。直连不是官方路径，回退只为网关拒绝这把 key 时不断对话。

`/glm/v1/v1/messages` 只防旧 `baseURL: ${origin}/glm/v1` 被 Anthropic SDK 再拼一层。

头：`glmAnthropicHeaders` = `glmUpstreamHeaders` + `anthropic-version: 2023-06-01`。身份/环境头照 `bootstrap/src/model-config.ts`（`buildCliZCodeSourceHeaders`）+ `runtime-platform-headers.ts`：`user-agent`、`X-ZCode-App-Version`、`X-ZCode-Agent: glm`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-Platform`、`X-Os-Category`、`X-Os-Version`、`HTTP-Referer`、`X-Title`；请求归因头照 `runner-attribution.ts`：`x-session-id`、`x-request-id`、`x-zcode-trace-id`、`x-query-id`、`x-zcode-session-type`（本 hop 统一 `main`）。SSE 原样转发（DSH anthropic-messages 要的就是 Anthropic SSE）。版本仍钉 Desktop `3.10.1`；开源 tree 是 `3.14.0`，官方下载页 `3.14.1`，未做活测就不动这个指纹。

`normalizeGlmAnthropicBody`：

1. Anthropic 必须有 `max_tokens`；缺则按 catalog 上限（5.3 / Flash / 5.2 = 128000，Turbo = 64000）。
2. `applyGlmAnthropicThinking`：官方 catalog map（见「模型」），5.3 / Flash 强制 `thinking: { type: enabled }`，5.2 保留 `disabled`，Turbo 不强制开；同时**删掉** Anthropic-only 的 `budget_tokens` / `display` 与 `reasoning_effort`，只留 `output_config.effort`。
3. `applyGlmAnthropicCache`（见下）。

`normalizeGlmChatBody`（残留 Completions）：

1. 非 `system/user/assistant/tool` 的角色（DSH `developer`）改成 `system`，否则 400 `1214 角色信息不正确`。
2. assistant 的 `reasoning` 补成 `reasoning_content`。
3. 同一套 `applyGlmThinking`。
4. `applyGlmCache`。

## 模型

订阅套餐的**实际模型是两行**——官方 devpack overview：「所有套餐均支持 **GLM-5.3**、**GLM-5.3-Flash**」，历史 id 自动改道（GLM-5.2 / 5.1 → 5.3，GLM-4.7 → 5.3-Flash）。`GLM_MODELS` 保留三行（ZCode `builtinProviderModelRules` 仍启用的那组 + maintainer 既有取舍）：

| id | 名称 | ctx / 输出 | 输入 | 思考深度（DSH 键 → 值） |
|---|---|---|---|---|
| `glm-5.3` | GLM-5.3 | 1M / 128k | text | `low` / `high` / `max`（默认 max，关不掉，无 `medium`） |
| `glm-5.3-flash` | GLM-5.3-Flash | 1M / 128k | text + image | 同上（catalog 另有 video / pdf，DSH 只接 text / image） |
| `glm-5-turbo` | GLM-5-Turbo | 200k / **64k** | text | `false`（catalog 值是 disabled / enabled，插件不开档位） |

**不进目录的两个 id：**

- `glm-5.3-flashx`（200 tok/s、1M ctx）——官方 Flash 文档写明「GLM-5.3-FlashX is **not yet available on the plan**」；订阅后端不服务的模型不进目录（`gpt-5.3-codex` 先例）。官方上线再补。
- `glm-5.2`——套餐已把它自动改道到 5.3（官方 overview）。留着它会显示 `off` 档位，而后端把 5.2 请求按 5.3 处理，`thinking.type: disabled` 会 400（5.3 强制思考）。proxy 仍保留 5.2 的线上形状（ZCode catalog 有这条 map），给旧 session / 手写路由兜底，但 picker 不复活它（`GLM_STALE`）。

思考的线上形状来自 catalog `modelApiRules`（`apiTypeMatch: anthropic-messages`）：5.3 / Flash `{"thinking":{"type":"enabled"},"output_config":{"effort":<level>}}`；5.2 `disabled` → `{"thinking":{"type":"disabled"}}`，否则同上；Turbo 只有 `thinking.type`。`reasoningEfforts` 的值就是 `output_config.effort` 的拼写，路由 compat 写 `forceAdaptiveThinking` 让 pi-ai 把 picker 档位派发成 `output_config.effort`；`allowEmptySignature` 让没有 signature 的 thinking block 按 `signature: ""` 回放（`anthropic-reasoning-metadata.ts` 同款），不被降级成 text。

Anthropic 路由**不要**写任何 Completions-only `compat`（`supportsReasoningEffort`、`thinkingFormat`）。`forceAdaptiveThinking` / `allowEmptySignature` 是 `anthropic-messages` 自己的 compat 字段（DSH `COMPAT_GATES`）。DSH `assertServiceable` 会拒掉 Anthropic 路由上的 Completions compat，整段原子 mutate 失败，`oauth-kiro` 也写不进 settings.yaml。Kiro / Antigravity 仍是 `openai-completions`，可以保留 `supportsReasoningEffort`。

## 额度

`GET glmQuotaUrl(region)` + `GET glmMcpUsageUrl()`（兜底 `glmToolUsageUrl`）。MCP 额度是独立端点 `GET https://zcode.z.ai/api/v1/mcp/usage`（usage-stats.ts `fetchMcpQuotaSnapshot`），**双头**：`authorization: Bearer <zcodeJwt>` + `X-Bigmodel-Authorization: Bearer <api-key>` + `Bigmodel-Target-Type: PERSONAL`；api.z.ai / open.bigmodel.cn 打它是 404。没有 `zcodeJwt` 就跳过（`glmMcpUsageHeaders` 返回 undefined）。回 `{data:{level,total_usage:{used,limit,remaining},next_refresh_at}}` → `parseGlmMcpUsage` 一条 `mcp` 行。

条必须按窗口拆：5 小时 / 每周 / ZCode MCP，不要两条都叫「本周期」。`glmWindowKind` 认 `five_hour` / `weekly` / `mcp`。
monitor 接口是 **HTTP 200 + 业务信封**：`success === false` 或 `code ∉ {0,200}` 时 `fetchGlmQuota` 直接抛 `glm quota failed: <msg>`（如「当前用户不存在coding plan」），store 记 error，卡片显示具体原因；**不要**把它当「ready 但 0 行」，那只会显示「周额度未返回」让人以为 hop 坏了。
卡片加成：`glmCardBoost` 显示「150%配额」。现在能说清的部分：官方 ZCode 的 Coding Plan 对话**只走** `zcode.z.ai` 平台网关（`official-coding-plan-gateway.ts` + NOTICE.md），网关做套餐权益校验；本 hop 已改成同一条网关路径 + 同套身份头。发放倍数与「用桌面版斜率」仍在上游服务端，源码看不到，**没有**活测对比过用量斜率——所以不宣称「已经吃上 150%」。

## 缓存

Z.AI Coding Plan 是 **隐式内容哈希**：对「前导 system + 历史」做前缀匹配。**没有**分片键，也 **没有** `prompt_cache_key`。

DSH 每步再插一条 leading system（`This snapshot supersedes…`）。前缀一变，整段 miss。

Completions 残留：

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `glmCacheSessionId` | 从 `user` / `session_id` / `prompt_cache_key` 取 id 并清洗 |
| 2 | 删除 | `prompt_cache_key`、`prompt_cache_retention`、`prompt_cache_options` |
| 3 | `stabilizeGlmSystemPrefix` | 每个 DSH session 钉住 **第一次** leading system；后来的快照以 `role: system` 挂到 **messages 末尾** |
| 4 | body `user` | 空则填 session id |
| 5 | 头 `x-session-id` | `glmDesktopHeaders`（配额/biz hop 没有 DSH pin 时用进程级 `sess_<24hex>`，不是对话缓存 id） |

Anthropic 默认：

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `glmCacheSessionId` | 从 `metadata.user_id` / `session_id` / `prompt_cache_key` / `user` 取 id |
| 2 | 删除 | 同上 Codex 字段 |
| 3 | `stabilizeGlmAnthropicSystem` | 钉住第一次 `system` 文本块，并盖 `cache_control: { type: 'ephemeral' }`；后来的快照变成 **额外 text 块、不加 cache_control**（ZCode 把 system 拆成 cli_prefix / stable / dynamic 三段，段段带 breakpoint；DSH 只有一段字符串，停车后等价） |
| 4 | `stabilizeGlmAnthropicMessageCache` | 清掉所有非 system 消息上的 `cache_control`，只在**最新一条非 system 消息**的内容块上盖 `cache_control`（ZCode `finalizeLatestNonSystemMessageCacheControl`）。pi-ai 已给最后一条 user 盖过，这里幂等；assistant-last / 回放带旧 breakpoint 也归一到同一形。tools 上的 breakpoint 不动 |
| 5 | `metadata.user_id` | 空则填 session id |
| 6 | 头 `x-session-id` + `anthropic-version` | `glmAnthropicHeaders` |

Pin map 的 Anthropic 键是 `${sessionId}\0anthropic`，和 Completions 的 `sessionId` **不撞**。

命中字段：Completions 残留把 `cached_tokens` / `cache_read_input_tokens` 译到 `prompt_tokens_details.cached_tokens`（流式缺省 `include_usage`）。Anthropic 靠 `cache_control`，SSE 原样转发。没有字段不发明 0。

判定：前缀被切开后剩 **576 token** 残骸 = **prefix break**，不是 Grok affinity miss。思考模型必须回放上一轮思考；Completions 残留靠 `clear_thinking: false` + 保留 `reasoning_content`；Anthropic 的 Preserved Thinking 在 Coding Plan 端点默认开，插件仍带 `clear_thinking: false`（标准 API 的 opt-in）作保险，ZCode 客户端本身不发这个字段。

进程内 `SYSTEM_PINS`（cap 64）只服务 GLM。测试用 `resetGlmSystemPins()`。不要 import Antigravity 的 pin map。

## 不要

- 不要给 GLM 写 Codex `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要把 GLM extras 停成 Gemini trailing user（「停车是同一个思路」也算混用）。
- 不要用 `zcode` 当 CLI provider。
- 不要把卡片账号显示成 `zcode` / poll `user.id`（如 `dnarplz6`）/ JWT `sub`。
- 不要把 `api` 改成 `openai-responses`（`api.z.ai/api/v1` 不是 Coding Plan）。
- 不要宣称已经吃上 150%。官方路径 = 网关 + 身份头，发放在上游服务端，没有活测对比过用量斜率。
- 不要把 Anthropic 对话默认打回 `api.z.ai` / `open.bigmodel.cn` 直连——官方客户端只走网关；直连只在网关回 401/403/404 时一次性回退。
- 不要在 Anthropic 路由写 Completions-only `compat`（`supportsReasoningEffort` / `thinkingFormat: openai`）；`forceAdaptiveThinking` / `allowEmptySignature` 才是这一协议的字段。
- 不要在 Anthropic hop 发 `thinking.budget_tokens` / `thinking.display` / `reasoning_effort`，官方 catalog 只发 `thinking.type` + `output_config.effort`（代理会删掉前三个）。
- 不要复活 `glm-5.2`（套餐自动改道 5.3，`off` 档会 400），也不要把 `glm-5.3-flashx` 塞进 picker（官方写明还没上套餐）。Turbo 不要编思考档位 / 128k 输出（catalog 是 64k，无档位）。
- 不要在下次 `sync()` 改写残留设置之前拆掉 Completions hop。
- 不要导入 start-plan JWT（体验套餐不支持，zcode-plan hop 是 captcha 墙）；系统禁用的 coding-plan key 要导入并带原因。
- 不要把 `data.token`（zcode JWT）写进 BigModel 的 bearer 位——`bigmodel.cn` 会稳定回「令牌已过期或验证不正确」；bearer 只能是 `data.bigmodel.access_token`。
- 不要把体验套餐的 Desktop `baseURL`（`…/zcode-plan/anthropic`）当成 hop URL，也不要伪造阿里云 captcha 头。试用对话在 ZCode.app。

## 归因

一线是 **[zai-org/ZCode](https://github.com/zai-org/ZCode)**（`872ad96 feat: open source`，tree `3.14.0`）+ [ZCode changelog](https://zcode.z.ai/en/changelog)（当前稳定版 `3.14.1`）+ [docs.z.ai](https://docs.z.ai/devpack/quick-start)。家族头有缓存 / 思考文档。总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

## 追溯

| 问题 | 记录 |
|---|---|
| Completions + `ai-sdk/anthropic` UA 对不齐 ZCode 默认协议 | [`docs/error.md`](../../../docs/error.md) 2026-08-31 GLM Anthropic |
| Anthropic 路由写 `supportsReasoningEffort` 卡死整段 sync，Kiro 进不了 yaml | 同文件 2026-08-31 GLM Anthropic compat / Kiro yaml |
| 150% 是身份不是协议，未对照 Desktop 用量 | 同文件 2026-08-31 GLM Anthropic；2026-08-30 GLM UA |
| 首轮 400 `1214 角色信息不正确` | 同文件 2026-08-30 GLM 1214 |
| 思考链被清 / 前缀 miss | 同文件 2026-08-30 GLM 思考链 |
| 直连不是官方 Coding Plan 路径；150% 走网关 | 同文件 2026-09-21 GLM 网关 |
| Anthropic 思考形不对（budget/display 不是官方 map） | 同文件 2026-09-21 GLM 思考 map |
| 缓存缺最新非 system 消息 breakpoint | 同文件 2026-09-21 GLM 网关（缓存段） |
| 目录取舍：5.2 已是自动改道别名、FlashX 未上套餐、Turbo 64k | 同文件 2026-09-21 GLM 目录 |
| BigModel 登录后额度/身份全 401：把 zcode JWT 当 bearer | 同文件 2026-09-21 GLM BigModel bearer |
| 已登录却「不存在coding plan」：存了 config.json 旧 key，非 credentials.json provisioned key | 同文件 2026-09-21 GLM 抓错登录 |
| 「周额度未返回」其实是 monitor 的 200 业务错误被吞 | 同文件 2026-09-21 GLM 额度业务错误 |
| 导入拒绝系统禁用的 coding-plan key | 同文件 2026-09-21 GLM 导入 |
| 第三方 UA 丢掉 1.5 倍额度 | 同文件 2026-08-30 GLM UA |
| 额度两条「本周期」 | 同文件 2026-08-30 GLM 额度窗口 |
| 账号显示 zcode | 同文件 2026-08-30 GLM 身份 |
| 账号显示 poll `user.id` | 同文件 2026-09-03 GLM 身份 user.id |
| 体验套餐（Start Plan）3007 captcha 墙，决定不支持 | 同文件 2026-09-05 GLM 体验套餐 |
| BigModel init 500 | 同文件 2026-08-30 BigModel OAuth |
| 缓存和 Codex 混用 | 同文件 2026-08-31 缓存混用 |

测试：`test/glm.test.ts`、`test/proxy.test.ts`（Anthropic hop 必须打 `zcode.z.ai/api/v1/ultra-zai/anthropic/v1/messages`，带 `anthropic-version` / `cache_control` / `output_config.effort` / `metadata.user_id`，网关 403 时回退 `https://api.z.ai/api/anthropic/v1/messages`；**不得**带 Codex 头或 `prompt_cache_key`；Completions 残留仍走 `paas/v4`）、`test/cache-families.test.ts`。
