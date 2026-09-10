# OpenCode Go（API key）

本文件是 `src/apikey/opencode-go/` 的设计源。改 cookie / 工作区 / 额度先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照在 [`docs/oauth.md`](../../../docs/oauth.md)。

OpenCode Go 是 **API key 范围**，不是 OAuth 家族。

- **不**进 `FAMILY_IDS`，**不**进 OAuth 页签，**不**走本机回环网关。
- 退役的 `oauth-opencode`（Zen Free / Go Free hop）仍在 `RETIRED_FAMILY_IDS`，继续 unset。
- 对话 / 部署：用户在 DSH **API Keys** 配 `OPENCODE_API_KEY`。插件把 3 条 `opencode-go*` 路由写进 `llm-pi-ai`（见下），直连 `https://opencode.ai/zen/go`，不走回环网关。
- 本目录只做两件事：存 **会话 cookie + 工作区 ID**，用它们读额度。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | cookie / workspace 解析、公开 snapshot（不回传 cookie） |
| [`store.ts`](store.ts) | `<dataDir>/opencode-go.json` 0600。不进 `auth.json` |
| [`quota.ts`](quota.ts) | cookie + workspace 刮 `/workspace/{id}/go`；缺 workspace 时 `GET /_server?id=` 工作区列表 |
| [`models.ts`](models.ts) | 28 个模型的 name / id / api / context / maxTokens / input / reasoningEfforts；3 条路由定义 |

调度：Settings 左侧家族胶囊（`.osubs-tabs`），排在 Copilot 之后换行；**不是**右侧 util，也**不**另开 API-key 胶囊。额度刷新走 RPC `goSave` / `quota`（`provider: opencode-go`）。**没有** `proxy.ts` hop，**没有** `cache.ts`。

路由：插件启动 / `sync()` 时**缺失才补** 3 条路由（`ensureOpencodeGoRoute`）：`opencode-go`（openai-completions，16）、`opencode-go-responses`（openai-responses，4）、`opencode-go-anthropic`（anthropic-messages，8），共 28 个模型。**已存在的同名路由绝不覆盖**。用户只需在 DSH 存 `OPENCODE_API_KEY`。

## 协议

官方 [Go · API 端点](https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9)。同一个订阅走三种协议，DSH `llm-pi-ai` 一条路由一个 `api`，所以插件写 3 条：

```text
opencode-go             openai-completions   https://opencode.ai/zen/go/v1   16 模型
opencode-go-responses   openai-responses     https://opencode.ai/zen/go/v1    4 模型
opencode-go-anthropic   anthropic-messages   https://opencode.ai/zen/go       8 模型
```

Anthropic SDK 打 `{baseURL}/v1/messages`，所以 anthropic 路由 baseURL 是 `…/zen/go`，不是 `…/go/v1`。

模型名 / id / api / context / maxTokens / input / reasoningEfforts 钉在 [`models.ts`](models.ts)。来源：官方端点表 + models.dev `opencode-go` + pi-ai 目录 + openclaw opencode-go manifest。pi-ai 已描述的 completions 模型**不写** `reasoningEfforts`，沿用 pi-ai 的思考档；只有 pi-ai 没有的 id（如 `deepseek-flash`）才显式写。

本插件不转发这条路径。不要为了「统一 hop」再包一层 `127.0.0.1:8318`。

客户端应发稳定 `x-opencode-session`（官方文档）。那是 DSH / pi-ai 的事，不是本目录的网关。

客户端应发稳定 `x-opencode-session`（官方文档）。那是 DSH / pi-ai 的事，不是本目录的网关。

## 配置（Orca 形）

对照 [stablyai/orca](https://github.com/stablyai/orca) 提供商设置：两项字段读额度。

| 字段 | 用户贴什么 | 本目录 |
|---|---|---|
| 会话 cookie | 原始 token（`Fe26.2…`）或完整 Cookie 头（`auth=Fe26.2…`） | `parseOpencodeGoCookie` → 只保留 `auth` / `__Host-auth` |
| 工作区 ID 覆盖 | `wrk_…` 或 `https://opencode.ai/workspace/wrk_…/go` | `normalizeOpencodeGoWorkspaceId` |

Cookie 认证基于 Web，可在 Windows 与 WSL 间共享。**不要**把 cookie 当 OAuth `accessToken` 写进 `auth.json`。

snapshot 只给 UI `cookieSet` + `workspaceId`。cookie 明文不出 RPC。

## 额度

一线对照：[steipete/CodexBar](https://github.com/steipete/CodexBar) `OpenCodeGoUsageFetcher`（web cookie 路径，不是 `GET /zen/go/v1/usage` Bearer）。

```text
cookie → GET https://opencode.ai/_server?id=<workspaces>   （缺 workspace 时）
cookie → GET https://opencode.ai/workspace/{wrk_}/go
  解析 rollingUsage / weeklyUsage / monthlyUsage
  usagePercent 是 0…100；剩余 = 100 − used
  resetAt = now + resetInSec × 1000
```

工作区 server-fn id 钉 `def39973159c7f0483d8793a822b8dbb10d067e12c65455fcb4608459ba0234f`。
页面是 dashboard HTML / JS，不是 Go API；刮页用浏览器 UA，不用 SDK 名。

官方限额窗口：5 小时（月限额 20%）/ 每周（50%）/ 每月（100%）。卡片三条剩余条。

**不要**用 `OPENCODE_API_KEY` 打 `/zen/go/v1/usage` 当本页主路径（那是 CodexBar 的 API-key 旁路）。Orca 这两项是 cookie + workspace。

## 不要

- 把实现放进 `src/oauth/opencode-go/`，或把页签放进 `.osubs-tabs-util` / 单独 API-key 胶囊
- 复活 `oauth-opencode` hop / Zen 匿名免费档 / `Bearer public`
- 本机回环网关转发 Go Responses
- 把 cookie 当 OAuth session 写 `auth.json`
- snapshot 把 cookie 明文回给 Settings
- 发明第四种 DSH `api`
- 抄 Codex / Grok cache 头

## 归因

- 官方 Go：https://opencode.ai/docs/zh-cn/go/
- API 端点：https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9
- 设置形：Orca OpenCode Go 提供商（cookie + workspace ID 覆盖）
- 额度刮页：[steipete/CodexBar](https://github.com/steipete/CodexBar) `OpenCodeGoUsageFetcher`
- 宿主对话：DSH pi-ai `opencode-go` + `OPENCODE_API_KEY`

总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
