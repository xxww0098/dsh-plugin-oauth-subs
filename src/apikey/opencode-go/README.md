# OpenCode Go（API key）

本文件是 `src/apikey/opencode-go/` 的设计源。改 cookie / 工作区 / 额度先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照在 [`docs/oauth.md`](../../../docs/oauth.md)。

OpenCode Go 是 **API key 范围**，不是 OAuth 家族。

- **不**进 `FAMILY_IDS`，**不**进 OAuth 页签，**不**走本机回环网关。
- 退役的 `oauth-opencode`（Zen Free / Go Free hop）仍在 `RETIRED_FAMILY_IDS`，继续 unset。
- 对话 / 部署：`opencode-go.json` 是**多账号 vault**（每个账号 `apiKey` + `cookieHeader` + `workspaceId`）；活动账号的 key 镜像进宿主凭据 `OPENCODE_API_KEY`。DSH 内置 pi-ai `opencode-go` provider 自带 27 个官方模型（3 种协议），插件只补内置目录缺的 `deepseek-flash`（见下），直连 `https://opencode.ai/zen/go`，不走回环网关。
- Settings 用通用 `ProviderCard` / `AccountCard`：一账号一卡、卡片内额度条、点卡切换、`退出` 删号；主按钮打开居中 Dialog（`CenterDialog`），在窗内粘贴 key / cookie / workspace 后 `goSave`。
- 账号 id 取工作区 `wrk_…`；没有工作区时取 key/cookie 的 `go_<12hex>` 哈希（同 key 再粘不会多一张卡）。
- Settings > 模型 只列插件自写的补充路由 `opencode-go-flash`（`deepseek-flash` 一条）；DSH 内置 `opencode-go` 的 27 个模型归 DSH 模型设置页。`OPENCODE_API_KEY` 未注入时模型照列但**不勾选**，两条路由都 unset（DSH 模型列表里也不出现）。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | cookie / workspace 解析、账号 id / key 遮罩、公开 snapshot（不回传 key/cookie） |
| [`store.ts`](store.ts) | `<dataDir>/opencode-go.json` 0600 多账号 vault（旧单账号文件自动迁移）。不进 `auth.json` |
| [`quota.ts`](quota.ts) | cookie + workspace 刮 `/workspace/{id}/go`；缺 workspace 时 `GET /_server?id=` 工作区列表 |
| [`models.ts`](models.ts) | 内置目录缺的 `deepseek-flash`：name / id / api / context / maxTokens / input / reasoningEfforts；补充路由定义 |

调度：Settings 左侧家族胶囊（`.osubs-tabs`），排在 Copilot 之后换行；**不是**右侧 util，也**不**另开 API-key 胶囊。新增 / 更新账号走 RPC `goSave`（`{ id?, apiKey?, cookie?, workspace? }`），字段清除走 `goClear`（`{ id?, field }`）；切换 / 删号 / 额度刷新走通用 `switch` / `logout` / `quota`（`provider: 'opencode-go'`），controller 内部分派到本目录。**没有** `proxy.ts` hop，**没有** `cache.ts`。

## 多账号与 key 镜像

- vault 是唯一真源；`goSave` 先落盘再镜像活动账号的 key 到宿主凭据 `OPENCODE_API_KEY`。
- `switch` 到有 key 的账号 → 用该账号 key 覆盖 `OPENCODE_API_KEY`；切到无 key 的纯额度账号 → 不动凭据（保持能对话的 key）。
- `logout` 删号：删的是活动账号且还有下一个有 key 的账号 → 镜像它；一个账号都不剩 → `unset('OPENCODE_API_KEY')`。
- 旧版单账号文件（`{ cookieHeader, workspaceId }`）自动迁移；旧版 key 还在 `OPENCODE_API_KEY` 时，首次 snapshot 用 `credentials.resolve` 回收进 vault（一次性，`resolve` 不可用则跳过）。
- snapshot 每行只给 `apiKeySet` / `cookieSet` / 遮罩尾巴（`sk-…1234`），不回传 key 或 cookie 明文。

路由：插件启动 / `sync()` 写两条（`ensureOpencodeGoRoute`）：

```text
opencode-go         { apiKeyEnv: OPENCODE_API_KEY }   不带 models / api
                    → DSH 复用内置 pi-ai catalog provider，27 个官方模型按各自协议分发
opencode-go-flash   openai-completions  https://opencode.ai/zen/go/v1
                    → 只有 deepseek-flash（内置目录唯一缺的官方模型）
```

`llm-pi-ai` 的 `models` 一旦非空就**替换**整条内置目录，追加不了，所以缺失模型只能单独开路由。第一条只在缺失时补，已有用户配置（含 DSH 模型设置页开的）不覆盖；第二条按 picker 选择过滤 `models`，全关则 unset，用户自建同名路由不覆盖。Settings > 模型 picker 只列 `opencode-go-flash` 这条家族组（内置 27 个归 DSH 模型设置页）。**没有 `OPENCODE_API_KEY` 时不显示为已开启：勾选框不勾、两条路由都 unset，DSH 的模型列表里也不出现**。用户只需在 DSH 凭据 / 环境里存 `OPENCODE_API_KEY`。

## 协议

官方 [Go · API 端点](https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9)。27 个内置模型的协议分发由 DSH pi-ai catalog 负责（per-model `api` / `baseURL` / `compat` / 思考档），插件不重复声明。

`deepseek-flash`（DeepSeek V4.1 Flash）走 `https://opencode.ai/zen/go/v1/chat/completions`（`@ai-sdk/openai-compatible`，官方端点表）。它的 name / context / maxTokens / input / reasoningEfforts / compat 钉在 [`models.ts`](models.ts)，来源：官方端点表 + models.dev `opencode-go` + 内置 pi-ai catalog 的 `deepseek-v4-flash`（同一 DeepSeek completions 方言与思考档）。

本插件不转发这条路径。不要为了「统一 hop」再包一层 `127.0.0.1:8318`。

客户端应发稳定 `x-opencode-session`（官方文档）。那是 DSH / pi-ai 的事，不是本目录的网关。

## 配置（Orca 形）

对照 [stablyai/orca](https://github.com/stablyai/orca) 提供商设置：两项字段读额度。

| 字段 | 用户贴什么 | 本目录 |
|---|---|---|
| API key | `sk-…`（DSH 对话用） | vault `apiKey`；活动账号镜像到 `OPENCODE_API_KEY` |
| 会话 cookie | 原始 token（`Fe26.2…`）或完整 Cookie 头（`auth=Fe26.2…`） | `parseOpencodeGoCookie` → 只保留 `auth` / `__Host-auth` |
| 工作区 ID 覆盖 | `wrk_…` 或 `https://opencode.ai/workspace/wrk_…/go` | `normalizeOpencodeGoWorkspaceId` |

Cookie 认证基于 Web，可在 Windows 与 WSL 间共享。**不要**把 cookie 当 OAuth `accessToken` 写进 `auth.json`。

snapshot 每行只给 `apiKeySet` / `cookieSet` / `workspaceId`。key / cookie 明文不出 RPC，也不回给浏览器。

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
- snapshot 把 key / cookie 明文回给 Settings
- 给每个账号再开一套 `opencode-go*` 路由或第四种 DSH `api`；聊天的 key 只有活动账号那一个
- 把内置 27 个模型复制进插件路由（`models` 非空会替换 DSH 内置目录）；插件只补 `deepseek-flash`
- 把 `providers.opencode-go` 写成带 `api` / `models` 的形态（会丢 pi-ai catalog 的 per-model 协议 / compat / 思考档与 env auth）
- 抄 Codex / Grok cache 头

## 归因

- 官方 Go：https://opencode.ai/docs/zh-cn/go/
- API 端点：https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9
- 设置形：Orca OpenCode Go 提供商（cookie + workspace ID 覆盖）
- 额度刮页：[steipete/CodexBar](https://github.com/steipete/CodexBar) `OpenCodeGoUsageFetcher`
- 宿主对话：DSH pi-ai `opencode-go` + `OPENCODE_API_KEY`

总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
