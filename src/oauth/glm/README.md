# GLM OAuth（Z.ai / BigModel）

本文件是 `src/oauth/glm/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Zhipu **Coding Plan**（付费 Lite/Pro/Max）。两个站点、同一套 ZCode CLI poll。默认对话走 **Anthropic Messages**（ZCode Desktop 默认协议），**不**走 chatgpt.com。

官方 Anthropic：<https://docs.z.ai/devpack/quick-start>
官方缓存：<https://docs.z.ai/guides/capabilities/cache>
官方思考（Completions 形）：<https://docs.z.ai/guides/capabilities/thinking-mode>

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 区域、端点、CLI init/poll、Z.ai biz 登录 + 铸 key、桌面指纹头、会话 |
| [`cli-flow.ts`](cli-flow.ts) | 浏览器打开 `authorize_url`，轮询 `/oauth/cli/poll/{flow_id}`。无 loopback、无 PKCE |
| [`request.ts`](request.ts) | Anthropic 默认 + Completions 残留：思考链、`clear_thinking: false`；再调 cache |
| [`cache.ts`](cache.ts) | 隐式前缀哈希。Completions：钉首段 system，多余停 **messages 末尾**。Anthropic：钉 system 首块 `cache_control`，多余块不加 cache_control。剥掉 Codex `prompt_cache_key` |
| [`boost.ts`](boost.ts) | 卡片「150%配额」文案（ZCode **身份** 限时加成，不是协议证明） |

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

Z.ai：     poll JWT → POST api.z.ai/api/auth/z/login → 再铸 id.secret（Coding Plan bearer）
BigModel： poll JWT 本身就是 Coding Plan bearer，不再铸 biz key
```

入口：`GlmCliFlowManager.start` → `glmCliInit` / `glmCliPoll` → `completeGlmCli` → `glmSession`。
刷新：Coding Plan key 不过期（`GLM_NEVER_EXPIRES`），`refreshGlm` 是空操作。
导入：`importGlmAuth` 读本机 ZCode 配置。`glmKeyFromZcodeConfig` 认 `builtin:*-coding-plan`（含 `options.baseURL` 含 `zcode-plan` 的 JWT key——那是 start-plan，直接跳过）。可用（未 `enabled: false` / `coding_plan_not_entitled`）的 key 里优先非 JWT coding-plan；没有可用的就导入失败，不捡死 key。不读加密 `credentials.json`，也不读 `coding-plan-cache.json`（`enabled` 已够）。卡片身份只走 `pickGlmHumanAccount`：邮箱，其次电话，再次 `customerName` / nickname。**禁止**显示 `zcode` / `zai` / `bigmodel` / `glm`、poll `user.id`、JWT `sub` / `user_id`、数字 uid。userinfo 失败就空着抬头，不要回落到 uid。已存的 opaque `account` 在 snapshot 时打 userinfo 回填（`#resolveGlmIdentities`）。

Settings：两颗堆叠登录按钮（只这一家）。Tab 图标用 **Z.ai**（`zai`），不是智谱字母。

## 协议

DSH `llm-pi-ai` `api` 是闭集：`openai-completions` | `openai-responses` | `anthropic-messages`。选和上游原生最贴的那一种。

Z.AI Coding Plan 同时开三条：

| 上游 | URL | 是不是 Coding Plan | 选不选 |
|---|---|---|---|
| Anthropic Messages | `https://api.z.ai/api/anthropic[/v1/messages]` | 是。ZCode Desktop 默认（UA `ai-sdk/anthropic`） | **默认** |
| OpenAI Completions | `…/coding/paas/v4/chat/completions` | 是 | 残留 hop，直到下一次 `sync()` |
| OpenAI Responses | `https://api.z.ai/api/v1` | **不是** Coding Plan 专用 | 不选 |

所以 `oauth-glm` 写 `api: anthropic-messages`。不要改 `openai-responses`。

## 对话

```text
DSH anthropic-messages  →  本机代理 POST /glm/v1/messages  →
  Coding Plan zai:      api.z.ai/api/anthropic/v1/messages
  Coding Plan bigmodel: open.bigmodel.cn/api/anthropic/v1/messages

残留（下次 sync 前）：
DSH openai-completions  →  POST /glm/v1/chat/completions  →
  …/api/coding/paas/v4/chat/completions
```

`/glm/v1/v1/messages` 只防旧 `baseURL: ${origin}/glm/v1` 被 Anthropic SDK 再拼一层。

头：`glmAnthropicHeaders` = `glmUpstreamHeaders` + `anthropic-version: 2023-06-01`。Desktop 指纹是 `ZCode/3.10.1`、`X-ZCode-*`、`x-session-id`。SSE 原样转发（DSH anthropic-messages 要的就是 Anthropic SSE）。

`normalizeGlmAnthropicBody`：

1. Anthropic 必须有 `max_tokens`；缺则 128000。
2. `applyGlmThinking`：GLM-5.3 / Flash 强制 `thinking.type = enabled` + `clear_thinking: false`。官方思考文档是 Completions 形；Anthropic thinking/signature **未实测**。Turbo 不强制开。
3. `applyGlmAnthropicCache`（见下）。

`normalizeGlmChatBody`（残留 Completions）：

1. 非 `system/user/assistant/tool` 的角色（DSH `developer`）改成 `system`，否则 400 `1214 角色信息不正确`。
2. assistant 的 `reasoning` 补成 `reasoning_content`。
3. 同一套 `applyGlmThinking`。
4. `applyGlmCache`。

## 模型

Coding Plan 三行（`GLM_MODELS`）：

| id | 名称 | 输入 | 思考深度 |
|---|---|---|---|
| `glm-5.3` | GLM-5.3 | text | `low` / `high` / `max`（默认 max，关不掉，无 `medium`） |
| `glm-5.3-flash` | GLM-5.3-Flash | text + image | 同上 |
| `glm-5-turbo` | GLM-5-Turbo | text | `false`（混合 on/off，无档位） |

Anthropic 路由**不要**写任何 Completions-only `compat`（`supportsReasoningEffort`、`thinkingFormat`）。思考是 hop 上的 `thinking: { type: enabled }`，不是那两个开关。DSH `assertServiceable` 会拒掉 Anthropic 路由上的 Completions compat，整段原子 mutate 失败，`oauth-kiro` 也写不进 settings.yaml。Kiro / Antigravity 仍是 `openai-completions`，可以保留 `supportsReasoningEffort`。

## 额度

`GET glmQuotaUrl(region)` + `GET glmToolUsageUrl(region)`。

条必须按窗口拆：5 小时 / 每周 / ZCode MCP，不要两条都叫「本周期」。`glmWindowKind` 认 `five_hour` / `weekly` / `mcp`。
卡片加成：`glmCardBoost` 显示「150%配额」。这是 **ZCode Desktop 身份** 的限时文案（官方说到 2026-08-31），**不是**协议证明。指纹对齐 Desktop 3.10.1（`zcode.cjs` `eao`/`rao`），没有和官方 Desktop 做过用量斜率对比。切 Anthropic 是对齐 ZCode 默认协议（UA 本来就是 `ai-sdk/anthropic`），不是「切协议就能吃 150%」。

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
| 3 | `stabilizeGlmAnthropicSystem` | 钉住第一次 `system` 文本块，并盖 `cache_control: { type: 'ephemeral' }`；后来的快照变成 **额外 text 块、不加 cache_control** |
| 4 | `metadata.user_id` | 空则填 session id |
| 5 | 头 `x-session-id` + `anthropic-version` | `glmAnthropicHeaders` |

Pin map 的 Anthropic 键是 `${sessionId}\0anthropic`，和 Completions 的 `sessionId` **不撞**。

命中字段：OpenAI `prompt_tokens_details.cached_tokens` / `cache_read_input_tokens`。Anthropic 靠 `cache_control`。

判定：前缀被切开后剩 **576 token** 残骸 = **prefix break**，不是 Grok affinity miss。思考模型必须 `clear_thinking: false`；Completions 残留还要保留上一轮 `reasoning_content`，否则前缀同样断。

进程内 `SYSTEM_PINS`（cap 64）只服务 GLM。测试用 `resetGlmSystemPins()`。不要 import Antigravity 的 pin map。

## 不要

- 不要给 GLM 写 Codex `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要把 GLM extras 停成 Gemini trailing user（「停车是同一个思路」也算混用）。
- 不要用 `zcode` 当 CLI provider。
- 不要把卡片账号显示成 `zcode` / poll `user.id`（如 `dnarplz6`）/ JWT `sub`。
- 不要把 `api` 改成 `openai-responses`（`api.z.ai/api/v1` 不是 Coding Plan）。
- 不要宣称切 Anthropic 就能吃上 150%。150% 是 Desktop **身份/UA**，没有和官方 Desktop 对比过用量斜率。
- 不要在 Anthropic 路由上写 Completions-only `compat`（`supportsReasoningEffort` / `thinkingFormat: openai`）。
- 不要在下次 `sync()` 改写残留设置之前拆掉 Completions hop。
- 不要导入 start-plan JWT（体验套餐不支持，zcode-plan hop 是 captcha 墙），也不要捡 `enabled: false` 的死 coding-plan key——没有可用的就导入失败。
- 不要把体验套餐的 Desktop `baseURL`（`…/zcode-plan/anthropic`）当成 hop URL，也不要伪造阿里云 captcha 头。试用对话在 ZCode.app。

## 归因

一线是闭源 ZCode Desktop 3.10.1（[changelog](https://zcode.z.ai/en/changelog)）+ [docs.z.ai](https://docs.z.ai/devpack/quick-start)，没有公开源码仓。缓存 / 思考文档见家族头。总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

## 追溯

| 问题 | 记录 |
|---|---|
| Completions + `ai-sdk/anthropic` UA 对不齐 ZCode 默认协议 | [`docs/error.md`](../../../docs/error.md) 2026-08-31 GLM Anthropic |
| Anthropic 路由写 `supportsReasoningEffort` 卡死整段 sync，Kiro 进不了 yaml | 同文件 2026-08-31 GLM Anthropic compat / Kiro yaml |
| 150% 是身份不是协议，未对照 Desktop 用量 | 同文件 2026-08-31 GLM Anthropic；2026-08-30 GLM UA |
| 首轮 400 `1214 角色信息不正确` | 同文件 2026-08-30 GLM 1214 |
| 思考链被清 / 前缀 miss | 同文件 2026-08-30 GLM 思考链 |
| 第三方 UA 丢掉 1.5 倍额度 | 同文件 2026-08-30 GLM UA |
| 额度两条「本周期」 | 同文件 2026-08-30 GLM 额度窗口 |
| 账号显示 zcode | 同文件 2026-08-30 GLM 身份 |
| 账号显示 poll `user.id` | 同文件 2026-09-03 GLM 身份 user.id |
| 体验套餐（Start Plan）3007 captcha 墙，决定不支持 | 同文件 2026-09-05 GLM 体验套餐 |
| BigModel init 500 | 同文件 2026-08-30 BigModel OAuth |
| 缓存和 Codex 混用 | 同文件 2026-08-31 缓存混用 |

测试：`test/glm.test.ts`、`test/proxy.test.ts`（Anthropic hop 必须打 `/api/anthropic`、带 `anthropic-version` / `cache_control` / `metadata.user_id`，**不得**带 Codex 头或 `prompt_cache_key`；Completions 残留仍走 `paas/v4`）、`test/cache-families.test.ts`。
