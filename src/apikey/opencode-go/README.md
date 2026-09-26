# OpenCode Go（API key）

本文件是 `src/apikey/opencode-go/` 的设计源。改 cookie / 工作区 / 额度先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照在 [`docs/oauth.md`](../../../docs/oauth.md)。

OpenCode Go 是 **API key 范围**，不是 OAuth 家族。

- **不**进 `FAMILY_IDS`，**不**进 OAuth 页签，**不**走本机回环网关。
- 退役的 `oauth-opencode`（Zen Free / Go Free hop）仍在 `RETIRED_FAMILY_IDS`，继续 unset。
- 对话 / 部署：`opencode-go.json` 是**多账号 vault**（每个账号 `apiKey` + `cookieHeader` + `workspaceId`）；活动账号的 key 镜像进宿主凭据 `OPENCODE_API_KEY`，没有任何账号还带 key 时清掉该凭据（否则 DSH 路由会留在模型列表里）。DSH 内置 pi-ai `opencode-go` provider 自带 27 个官方模型（3 种协议），但 llm-pi-ai 只在 profile 点名它时才注册路由，所以插件**不写** `providers.opencode-go`：内置 27 个归 DSH 模型设置页，要用由用户自己开。插件改为**自带完整官方目录**、按 wire 协议分两条自有路由（`opencode-go-flash` completions 28 行 + `opencode-go-responses` 6 行，见下），直连 `https://opencode.ai/zen/go`，不走回环网关。
- Settings 用通用 `ProviderCard` / `AccountCard`：一账号一卡、卡片内额度条、点卡切换、`退出` 删号；主按钮打开居中 Dialog（`CenterDialog`），在窗内粘贴 key / cookie / workspace 后 `goSave`。
- 账号 id 取工作区 `wrk_…`；没有工作区时取 key/cookie 的 `go_<12hex>` 哈希（同 key 再粘不会多一张卡）。
- 卡片标题优先显示登录邮箱：Console 账号从 `GET /console/api/user` 拿，未迁移工作区仍从 dashboard `GET /workspace/{wrk_}/go` 的 RSC payload 刮 `userEmail["wrk_…"]`；刷新额度时存进 vault（`email`），下次 snapshot 起用；没有 cookie / 刮不到时退回工作区 id，再退回 key 尾巴。**API key 本身拿不到邮箱**（`GET /zen/go/v1/usage` 只返回用量，无身份接口）。
- Settings > 模型 列插件自有的两条家族组：`OpenCode Go`（completions 28 行）与 `OpenCode Go · Responses`（6 行）；DSH 内置 `opencode-go` 的 27 个模型归 DSH 模型设置页。`OPENCODE_API_KEY` 未注入时模型照列但**不勾选**，两条插件路由都 unset（DSH 模型列表里也不出现）。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | cookie / workspace 解析、账号 id / key 遮罩、公开 snapshot（不回传 key/cookie） |
| [`store.ts`](store.ts) | `<dataDir>/opencode-go.json` 0600 多账号 vault（旧单账号文件自动迁移）。不进 `auth.json` |
| [`quota.ts`](quota.ts) | 已迁移账号：cookie + `x-org-id` 打 `/console/api/{orgs,go/status,billing/status,user}`（Console JSON API）；未迁移账号兜底刮 `/workspace/{id}/go`（额度 + `userEmail["wrk_…"]` 邮箱）；缺 workspace 时先 `/console/api/orgs` 再 `GET /_server?id=` |
| [`models.ts`](models.ts) | 完整官方 Go 目录：completions 28 行 + responses 6 行（name / id / api / context / maxTokens / input / reasoningEfforts / compat）；两条自有路由定义 |

调度：Settings 左侧家族胶囊（`.osubs-tabs`），排在 Copilot 之后换行；**不是**右侧 util，也**不**另开 API-key 胶囊。新增 / 更新账号走 RPC `goSave`（`{ id?, apiKey?, cookie?, workspace? }`），字段清除走 `goClear`（`{ id?, field }`）；切换 / 删号 / 额度刷新走通用 `switch` / `logout` / `quota`（`provider: 'opencode-go'`），controller 内部分派到本目录。**没有** `proxy.ts` hop，**没有** `cache.ts`。

## 多账号与 key 镜像

- vault 是唯一真源；`goSave` 先落盘再镜像活动账号的 key 到宿主凭据 `OPENCODE_API_KEY`。
- `switch` 到有 key 的账号 → 用该账号 key 覆盖 `OPENCODE_API_KEY`；切到无 key 的纯额度账号 → 不动凭据（保持能对话的 key）。
- `logout` 删号：删的是活动账号且还有下一个有 key 的账号 → 镜像它；一个账号都不剩 → `unset('OPENCODE_API_KEY')`。
- 旧版单账号文件（`{ cookieHeader, workspaceId }`）自动迁移；旧版 key 还在 `OPENCODE_API_KEY` 时，首次 snapshot 用 `credentials.resolve` 回收进 vault（一次性，`resolve` 不可用则跳过）。
- snapshot 每行只给 `apiKeySet` / `cookieSet` / 遮罩尾巴（`sk-…1234`），不回传 key 或 cookie 明文。

路由：插件启动 / `sync()` 写两条自有路由（`ensureOpencodeGoRoute`）：

```text
opencode-go-flash     openai-completions  https://opencode.ai/zen/go/v1
opencode-go-responses openai-responses    https://opencode.ai/zen/go/v1
                      { apiKeyEnv: OPENCODE_API_KEY,
                        headers: { x-opencode-session: dsh-opencode-go } }
                    → 已验证可服务的 34 行（completions 28 + responses 6）
```

`providers.opencode-go`（DSH 内置 27 个模型）插件**不创建也不刷新**；插件的完整目录写在自有两条路由上，与内置路由互不影响。llm-pi-ai 只注册 profile 点名的目录路由：早先版本替用户写 `{ apiKeyEnv, headers }`，结果 27 个模型莫名进了 DSH 模型列表。现在这条路由归 DSH 模型设置页；用户要就自己在那里开。旧版本插件自己写的同形 profile（apiKeyEnv + 家族 header，没有 `api` / `models`）在 sync 时被 unset 清掉；裸 `{ apiKeyEnv }`（DSH 模型页自己写的）和其它任何形状都当用户配置，不动。

### `x-opencode-session`

Console Go 现在硬性要求这个头：缺了直接 400 `MissingSessionID`（`deepseek-flash` 和内置 `glm-5.3` 实测一样）。官方文档 https://opencode.ai/docs/go/#where-can-i-use-it 要求客户端「每个会话发一个稳定 session id」，并把 DeepSeek Harness 列进 "Known Problematic Clients"（会话信息只在部分 adapter 上到达）。

DSH 会把每会话 `sessionId` 交给 pi-ai，但 pi-ai 0.85.1 的 openai-completions 从不写 `x-opencode-session`（`sessionAffinityFormat`/`sendSessionAffinityHeaders` 都不映射这个头），llm-pi-ai 又把 `sendSessionAffinityHeaders` 设为 withhold、profile 转不了会话 id。所以插件写出的两条路由都带家族常量 `dsh-opencode-go`：单机一个路由 shard，满足硬性检查；**不是**每会话值。等 DSH/pi-ai 原生发送会话头后可删掉这个常量。（用户自己开的内置 `opencode-go` 路由插件不碰；缺这个头时 Console Go 会 400，属 DSH/pi-ai 侧问题。）

`llm-pi-ai` 的 `models` 一旦非空就**替换**整条内置目录，追加不了，所以缺失模型只能单独开路由。这条按 picker 选择过滤 `models`，全关则 unset，用户自建同名路由不覆盖。Settings > 模型 picker 列 `opencode-go-flash` / `opencode-go-responses` 两组（内置 27 个归 DSH 模型设置页）。**没有 `OPENCODE_API_KEY` 时不显示为已开启：勾选框不勾、插件路由 unset，DSH 的模型列表里也不出现插件写的东西**。用户只需在 DSH 凭据 / 环境里存 `OPENCODE_API_KEY`。

## 协议

官方 [Go · API 端点](https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9)。两条路由就是协议分发：completions 行 `/v1/chat/completions`（`@ai-sdk/openai-compatible`），responses 行 `/v1/responses`。

每行的 name / context / maxTokens / input / reasoningEfforts / compat 钉在 [`models.ts`](models.ts)，来源：官方 `GET https://opencode.ai/zen/go/v1/models`（2026-09-26 本机 key 35 行）+ Go docs 端点表 + models.dev `opencode-go` + 内置 pi-ai catalog（DeepSeek 方言与 effort 阶梯）。completions 行写 `openai` / `deepseek` compat；responses 行不写 compat（`sessionAffinityFormat` 是 llm-pi-ai 的 withhold 字段，profile 不许声明）。

2026-09-23 逐行实测 `/chat/completions`：completions 27 行全部 200；Grok 4.6/4.7、GPT-5.6 Luna、Muse Spark 1.2/1.3 只走 `/responses`；7 个公开 id 两种协议都回 `Model is unavailable`（`kimi-k2.5` / `glm-5` / `qwen3.5-plus` / `mimo-v2-pro` / `mimo-v2-omni` / `hy3-preview` / `grok-4.5`），不进目录。`deepseek-flash` 与 `deepseek-v4.1-flash` 是同一模型的两个 id（实测都 200），picker 只留 docs 现行 id `deepseek-v4.1-flash`，不再出现两条同名行。

2026-09-26 用本机 Go key 复抓 `/v1/models`（35 行）并发最小请求：新增 `gpt-6-luna` 走 `/responses`（无档、`none`、`max` 均 200），`space-bunny-free` 走 `/chat/completions`（`high` 200，回包带 `reasoning_content`）。两行 context / output / input / effort 取同日 `models.dev/api.json` 的 `opencode-go` 桶；`gpt-6-luna` 1,050,000 / 128,000 / text+image / off–max，`space-bunny-free` 1,048,576 / 524,288 / text+image / low–max；后者按 DeepSeek 兼容形回放思考。

本插件不转发这条路径。不要为了「统一 hop」再包一层 `127.0.0.1:8318`。

客户端应发稳定 `x-opencode-session`（官方文档）。那是 DSH / pi-ai 的事，不是本目录的网关。

## 配置（Orca 形）

对照 [stablyai/orca](https://github.com/stablyai/orca) 提供商设置：两项字段读额度。

| 字段 | 用户贴什么 | 本目录 |
|---|---|---|
| API key | `sk-…`（DSH 对话用） | vault `apiKey`；活动账号镜像到 `OPENCODE_API_KEY` |
| 会话 cookie | Console 页 `__Host-console_session=…`/`console_session=…`，或旧面板 `Fe26.2…`/`auth=…` | `parseOpencodeGoCookie` → 保留 `auth` / `__Host-auth` / `__Host-console_session` / `console_session` |
| 工作区 ID 覆盖 | `wrk_…`/`org_…`，或 `https://opencode.ai/console/<id>/go`、`/workspace/<id>/go` URL | `normalizeOpencodeGoWorkspaceId` |

Cookie 认证基于 Web，可在 Windows 与 WSL 间共享。**不要**把 cookie 当 OAuth `accessToken` 写进 `auth.json`。

snapshot 每行只给 `apiKeySet` / `cookieSet` / `workspaceId`。key / cookie 明文不出 RPC，也不回给浏览器。

## 额度

一线对照：[steipete/CodexBar](https://github.com/steipete/CodexBar) `OpenCodeGoUsageFetcher` +
`OpenCodeGoLegacyFallback`（web cookie 路径，不是 `GET /zen/go/v1/usage` Bearer）。

**2026-09 Console 迁移**：opencode.ai 把已迁移工作区的 dashboard 换成 SPA
（`/console/<id>/go`，壳页只有 `<div id="app">`），旧 `/_server` server-fn 与
`/workspace/{id}/go` 回包成 302 → `/console/login`。Console 是 JSON API，
走 `__Host-console_session`/`console_session` cookie + `x-org-id` 头（缺头 400）：

```text
cookie → GET /console/api/orgs             → [{id: wrk_|org_, name}]  工作区 + 名字
cookie → GET /console/api/user             → {email}                  登录邮箱
cookie + x-org-id → GET /console/api/go/status
  → {access: {startsAt, endsAt, cancelAtPeriodEnd,
      meters: {fiveHour: {resetsAt?, usedMicroCents, limitMicroCents},
               week:     {startsAt, resetsAt, …},
               month:    {usedMicroCents, limitMicroCents}            ← 无 resetsAt
      }}}          access:null / 整包 null = 无 Go 订阅
cookie + x-org-id → GET /console/api/billing/status
  → {billingMode: prepaid|legacy|seat|credit, mode: pay-as-you-go|invoiceable,
     balanceMicroCents: "<digits>"}        balance = /1e8 USD；useBalance ← prepaid
```

meter 是**花费额度**不是 token：行 `used/total` 按 USD（micro-cents/1e8），
`unit:'usd'`（`fiveHour` $12 / `week` $30 / `month` $60，go-plus ×4）。
`month` 无 `resetsAt` → 用 `access.endsAt`（账期结束）。`access:null` 且
prepaid 余额 >0 → `rows:[]` + 余额兜底，不报红；都没有 → `no_subscription` 错误。
Console 401/403/跳 login → `cookie is invalid or expired`；其余非 200 →
`console HTTP <status>[: message]`。

**Fallback 次序**（对齐 CodexBar `OpenCodeGoLegacyFallback`）：console 先；
console 失败且 header 里有 `auth`/`__Host-auth` → 走 legacy；legacy 也失败时，
若 header 带 console cookie 且 console 错误不是「凭证失效」→ 回 console 的
真实错误（不能让 legacy 的 invalid-cookie 盖住 console 的 5xx）。

```text
legacy（未迁移工作区，保持不变）：
cookie → GET /_server?id=<workspaces>                    （缺 workspace 时）
cookie → GET /workspace/{wrk_}/go
  解析 rollingUsage / weeklyUsage / monthlyUsage（usagePercent / resetInSec /
  status / usage / limit token 行）+ userEmail + workspace name + useBalance/balance
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
- 把插件目录当成「只补内置缺的那几条」——插件目录是自带的完整官方副本，只写自有 `opencode-go-flash` / `opencode-go-responses` 两条路由
- 写 / 刷新 `providers.opencode-go`（等于替用户把内置 27 个模型注册进 DSH 模型列表；只有旧版本插件自己写的同形 profile 才 unset 清掉）
- 把 `providers.opencode-go` 写成带 `api` / `models` 的形态（会丢 pi-ai catalog 的 per-model 协议 / compat / 思考档与 env auth）
- 去掉 `x-opencode-session` 头（除非 DSH / pi-ai 已原生按会话发送；现在缺它 Console Go 直接 400）
- 抄 Codex / Grok cache 头

## 归因

- 官方 Go：https://opencode.ai/docs/zh-cn/go/
- API 端点：https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9
- 设置形：Orca OpenCode Go 提供商（cookie + workspace ID 覆盖）
- 额度：CodexBar [`OpenCodeGoUsageFetcher`](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/OpenCodeGo/OpenCodeGoUsageFetcher.swift)（console 优先 + legacy 兜底）、`OpenCodeGoZenBalanceParser`（billing status）；Console 字段 schema 实测自 `/console/assets/index-*.js` 打包产物（`x-org-id`、`goStatus`→`/orgs/:orgId/go/status` 的 header 别名、`BillingStatus`/`meters` 类定义）
- 宿主对话：DSH pi-ai `opencode-go` + `OPENCODE_API_KEY`

总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
