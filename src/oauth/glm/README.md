# GLM OAuth（Z.ai / BigModel）

本文件是 `src/oauth/glm/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

Zhipu **Coding Plan**。两个站点、同一套 ZCode CLI poll。对话直连 Coding Plan OpenAI 兼容接口，**不**走 chatgpt.com。

官方缓存说明：<https://docs.z.ai/guides/capabilities/cache>
官方思考说明：<https://docs.z.ai/guides/capabilities/thinking-mode>

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 区域、端点、CLI init/poll、Z.ai biz 登录 + 铸 key、桌面指纹头、会话 |
| [`cli-flow.ts`](cli-flow.ts) | 浏览器打开 `authorize_url`，轮询 `/oauth/cli/poll/{flow_id}`。无 loopback、无 PKCE |
| [`request.ts`](request.ts) | 角色归一、思考链、`clear_thinking: false`；再调 `applyGlmCache` |
| [`cache.ts`](cache.ts) | 隐式前缀哈希：钉住首段 system，多余快照停到 **messages 末尾**。剥掉 Codex `prompt_cache_key` |
| [`boost.ts`](boost.ts) | 卡片「150%配额」文案（ZCode 登录限时加成） |

调度：[`../proxy.ts`](../proxy.ts) `family === 'glm'` → `normalizeGlmChatBody`；`x-session-id` 在 `glmDesktopHeaders`。
额度：[`../quota.ts`](../quota.ts) `fetchGlmQuota` / `parseGlmQuota` / `mergeGlmToolUsage`。
套餐：`GLM_PLAN_NAMES`（`coding_pro` → **Pro**，不要和 Codex `pro` → Pro 20x 搞混）。

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
导入：`importGlmAuth` 读本机 ZCode 配置。卡片身份必须是邮箱（`pickGlmHumanAccount`），**禁止**显示 `zcode` / `zai` / `bigmodel`。

Settings：两颗堆叠登录按钮（只这一家）。Tab 图标用 **Z.ai**（`zai`），不是智谱字母。

## 对话

```text
DSH chat/completions  →  本机代理  →  POST
  zai:      api.z.ai/api/coding/paas/v4/chat/completions
  bigmodel: open.bigmodel.cn/api/coding/paas/v4/chat/completions
```

头：`glmUpstreamHeaders` = Bearer + `glmDesktopHeaders`（`ZCode/3.10.1`、`X-ZCode-*`、`x-session-id`）。第三方 UA 会丢掉 ZCode 1.5 倍额度。

`normalizeGlmChatBody`：

1. 非 `system/user/assistant/tool` 的角色（DSH `developer`）改成 `system`，否则 400 `1214 角色信息不正确`。
2. assistant 的 `reasoning` 补成 `reasoning_content`。
3. `applyGlmThinking`：GLM-5.3 / Flash 强制 `thinking.type = enabled` + `clear_thinking: false`（`disabled` 400）。Turbo 是混合开关，不强制开。
4. `applyGlmCache`（见下）。

## 模型

只三行（`GLM_MODELS`）：

| id | 输入 | 思考深度 |
|---|---|---|
| `glm-5.3` | text | `low` / `high` / `max`（默认 max，关不掉，无 `medium`） |
| `glm-5.3-flash` | text + image | 同上 |
| `glm-5-turbo` | text | `false`（混合 on/off，无档位） |

## 额度

`GET glmQuotaUrl(region)` + `GET glmToolUsageUrl(region)`。

条必须按窗口拆：5 小时 / 每周 / ZCode MCP，不要两条都叫「本周期」。`glmWindowKind` 认 `five_hour` / `weekly` / `mcp`。
卡片加成：`glmCardBoost` 显示「150%配额」。

## 缓存

Z.AI Coding Plan 是 **隐式内容哈希**：对「前导 system + 历史」做前缀匹配。**没有**分片键，也 **没有** `prompt_cache_key`。

DSH 每步再插一条 leading system（`This snapshot supersedes…`）。前缀一变，整段 miss。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `glmCacheSessionId` | 从 `user` / `session_id` / `prompt_cache_key` 取 id 并清洗 |
| 2 | 删除 | `prompt_cache_key`、`prompt_cache_retention`、`prompt_cache_options` |
| 3 | `stabilizeGlmSystemPrefix` | 每个 DSH session 钉住 **第一次** leading system；后来的快照以 `role: system` 挂到 **messages 末尾** |
| 4 | body `user` | 空则填 session id |
| 5 | 头 `x-session-id` | `glmDesktopHeaders`（配额/biz  hop 没有 DSH pin 时用进程级 `sess_<24hex>`，不是对话缓存 id） |

命中字段：OpenAI `prompt_tokens_details.cached_tokens` / `cache_read_input_tokens`。Anthropic 兼容路径可以带 `cache_control`。

判定：前缀被切开后剩 **576 token** 残骸 = **prefix break**，不是 Grok affinity miss。思考模型必须 `clear_thinking: false` 且保留上一轮 `reasoning_content`，否则前缀同样断。

进程内 `SYSTEM_PINS`（cap 64）只服务 GLM。测试用 `resetGlmSystemPins()`。不要 import Antigravity 的 pin map。

## 不要

- 不要给 GLM 写 Codex `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要把 GLM extras 停成 Gemini trailing user（「停车是同一个思路」也算混用）。
- 不要用 `zcode` 当 CLI provider。
- 不要把卡片账号显示成 `zcode`。

## 追溯

| 问题 | 记录 |
|---|---|
| 首轮 400 `1214 角色信息不正确` | [`docs/error.md`](../../../docs/error.md) 2026-08-30 GLM 1214 |
| 思考链被清 / 前缀 miss | 同文件 2026-08-30 GLM 思考链 |
| 第三方 UA 丢掉 1.5 倍额度 | 同文件 2026-08-30 GLM UA |
| 额度两条「本周期」 | 同文件 2026-08-30 GLM 额度窗口 |
| 账号显示 zcode | 同文件 2026-08-30 GLM 身份 |
| BigModel init 500 | 同文件 2026-08-30 BigModel OAuth |
| 缓存和 Codex 混用 | 同文件 2026-08-31 缓存混用 |

测试：`test/glm.test.ts`、`test/proxy.test.ts`（GLM hop **不得**带 `prompt_cache_key`）、`test/cache-families.test.ts`。
