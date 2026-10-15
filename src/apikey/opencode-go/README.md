# OpenCode Go（API key）

本文件是 `src/apikey/opencode-go/` 的设计源。改 cookie / 工作区 / 额度先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照在 [`docs/oauth.md`](../../../docs/oauth.md)。

这一个家族装 OpenCode 的**两个产品**：订阅制的 **Go**（`/zen/go/v1`）与按量付费的 **Zen**（`/zen/v1`）。

- 两者**共用同一个 OpenCode 账号**：同一个 `OPENCODE_API_KEY`、同一个 Console 工作区与 cookie、同一张账号卡、同一个 vault（`opencode-go.json`）。拆成两个家族会让两个 vault 抢同一个宿主凭据（一边切号就把另一边需要的 key 清掉），同一账号也要贴两遍 cookie，所以这里是**一个家族、两条产品线**：路由按产品分六条（Go 3 + Zen 3），账号与额度只有一份——额度卡上半段是 Go 的订阅表，下半段是 Zen 的预付行。
- 目录、路由、别名按产品分开：`Subs · OpenCode Go · Chat/Responses/Anthropic` 与 `Subs · OpenCode Zen · Chat/Responses/Anthropic`；`settings.yaml` 别名随产品走（`OpenCode Go/…`、`OpenCode Zen/…`）。卡片额度也分两段：Go 是订阅表（5h / 7d / 月），Zen 是预付读数（30 天用量 + 预付余额）。

OpenCode Go 是 **API key 范围**，不是 OAuth 家族。

- **不**进 `FAMILY_IDS`，**不**进 OAuth 页签，**不**走本机回环网关。
- 退役的 `oauth-opencode`（Zen Free / Go Free hop）仍在 `RETIRED_FAMILY_IDS`，继续 unset。
- 对话 / 部署：`opencode-go.json` 是**多账号 vault**（每个账号 `apiKey` + `cookieHeader` + `workspaceId`）；活动账号的 key 镜像进宿主凭据 `OPENCODE_API_KEY`，没有任何账号还带 key 时清掉该凭据（否则 DSH 路由会留在模型列表里）。DSH 内置 pi-ai `opencode-go` provider 自带一份官方模型，但 llm-pi-ai 只在 profile 点名它时才注册路由，所以插件**不写** `providers.opencode-go`：内置模型归 DSH 模型设置页，要用由用户自己开。插件改为**自带完整官方目录**、按 wire 协议分三条自有路由（`opencode-go-flash` completions + `opencode-go-responses` + `opencode-go-messages`，见下），直连 `https://opencode.ai/zen/go`，不走回环网关。
- Settings 用通用 `ProviderCard` / `AccountCard`：一账号一卡、卡片内额度条、点卡切换、`退出` 删号（破坏性动作：行内按钮只开 `WarnDialog` 二次确认，勾选后 `确认退出` 才走 `logout` RPC）；主按钮打开居中 Dialog（`CenterDialog`），在窗内粘贴 key / cookie / workspace 后 `goSave`。
- 账号 id 取工作区 `wrk_…`；没有工作区时取 key/cookie 的 `go_<12hex>` 哈希（同 key 再粘不会多一张卡）。
- 卡片标题优先显示本地名称，未设置时显示登录邮箱：Console 账号从 `GET /console/api/user` 拿，未迁移工作区仍从 dashboard `GET /workspace/{wrk_}/go` 的 RSC payload 刮 `userEmail["wrk_…"]`；刷新额度时存进 vault（`email`），下次 snapshot 起用；没有 cookie / 刮不到时退回工作区 id，再退回 key 尾巴。**API key 本身拿不到邮箱**（`GET /zen/go/v1/usage` 只返回用量，无身份接口）。
- 只有 API key 时无法自动拿到邮箱；每张卡的「修改名称」把用户指定的显示名称存进本地 vault，并优先用作标题，不改变凭据。
- Settings > 模型 列插件自有的六条家族组：Go 的 `Subs · OpenCode Go · Chat`（completions）、`Subs · OpenCode Go · Responses`、`Subs · OpenCode Go · Anthropic`，以及 Zen 的 `Subs · OpenCode Zen · Chat/Responses/Anthropic`（沿用插件统一的 `Subs · <家族> · <协议>` 组名，不是 OAuth 登录）；DSH 内置 `opencode-go` / `opencode` 的模型归 DSH 模型设置页。`OPENCODE_API_KEY` 未注入时模型照列但**不勾选**，六条插件路由都 unset（DSH 模型列表里也不出现）。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | cookie / workspace 解析、账号 id / key 遮罩、公开 snapshot（不回传 key/cookie） |
| [`store.ts`](store.ts) | `<dataDir>/opencode-go.json` 0600 多账号 vault（旧单账号文件自动迁移）。不进 `auth.json` |
| [`quota.ts`](quota.ts) | 已迁移账号：cookie + `x-org-id` 打 `/console/api/{orgs,go/status,billing/status,usage/summary?range=30d,user}`（Console JSON API；后两个是 Zen 的 30 天用量与预付余额）；未迁移账号兜底刮 `/workspace/{id}/go`（额度 + `userEmail["wrk_…"]` 邮箱），缺 workspace 时先 `/console/api/orgs` 再 `GET /_server?id=`；cookie 缺失或失效时先按 key 打同一个 `go/status`（`Authorization: Bearer`，有 `used/limit` 金额），该路由拒绝才退回 `/zen/go/v1/usage`（仅百分比和重置时间，无邮箱、余额） |
| [`models.ts`](models.ts) | 六条自有路由定义：Go 三条 + Zen 三条（各按 completions / responses / messages 分），行取自目录 JSON |

调度：Settings 左侧家族胶囊（`.osubs-tabs`），排在 cline 之后换行；**不是**右侧 util，也**不**另开 API-key 胶囊。新增 / 更新账号走 RPC `goSave`（`{ id?, apiKey?, cookie?, workspace? }`），字段清除走 `goClear`（`{ id?, field }`）；切换 / 删号 / 额度刷新走通用 `switch` / `logout` / `quota`（`provider: 'opencode-go'`），controller 内部分派到本目录。**没有** `proxy.ts` hop，**没有** `cache.ts`。

## 多账号与 key 镜像

- vault 是唯一真源；`goSave` 先落盘再镜像活动账号的 key 到宿主凭据 `OPENCODE_API_KEY`。
- `switch` 到有 key 的账号 → 用该账号 key 覆盖 `OPENCODE_API_KEY`；切到无 key 的纯额度账号 → 不动凭据（保持能对话的 key）。
- `logout` 删号：删的是活动账号且还有下一个有 key 的账号 → 镜像它；一个账号都不剩 → `unset('OPENCODE_API_KEY')`。
- 单账号形状的文件（`{ cookieHeader, workspaceId }`）读取时转成 vault；vault 为空而 `OPENCODE_API_KEY` 有值时，首次 snapshot 用 `credentials.resolve` 收进 vault（`resolve` 不可用则跳过）。
- snapshot 每行只给 `apiKeySet` / `cookieSet` / 遮罩尾巴（`sk-…1234`），不回传 key 或 cookie 明文。

路由：插件启动 / `sync()` 写三条自有路由（`ensureOpencodeGoRoute`）：

同步从 DSH `settings.describe()` 读取 `llm-pi-ai` 当前路由，再用 `settings.mutate()` 改写；有 Go key 时读不到配置，或写入失败会报错，避免模型页勾选与 DSH 提供商列表脱节。

```text
opencode-go-flash     openai-completions  https://opencode.ai/zen/go/v1
opencode-go-responses openai-responses    https://opencode.ai/zen/go/v1
opencode-go-messages  anthropic-messages  https://opencode.ai/zen/go
                      （SDK 自己补 `/v1/messages`）
                      { apiKeyEnv: OPENCODE_API_KEY,
                        headers: { x-opencode-session: dsh-opencode-go } }
                    → 已验证可服务的官方目录行
```

`providers.opencode-go`（DSH 内置模型）插件**不创建也不刷新**；插件的完整目录写在自有三条路由上，与内置路由互不影响。llm-pi-ai 只注册 profile 点名的目录路由，替用户写 `{ apiKeyEnv, headers }` 就会把内置模型带进 DSH 模型列表，所以这条路由归 DSH 模型设置页，用户要就自己开。插件自己写过的同形 profile（apiKeyEnv + 家族 header，没有 `api` / `models`）在 sync 时 unset；裸 `{ apiKeyEnv }`（DSH 模型页自己写的）和其它任何形状都当用户配置，不动。

### `x-opencode-session`

Console Go 现在硬性要求这个头：缺了直接 400 `MissingSessionID`（`deepseek-flash` 和内置 `glm-5.3` 实测一样）。官方文档 https://opencode.ai/docs/go/#where-can-i-use-it 要求客户端「每个会话发一个稳定 session id」，并把 DeepSeek Harness 列进 "Known Problematic Clients"（会话信息只在部分 adapter 上到达）。

DSH 会把每会话 `sessionId` 交给 pi-ai，但 pi-ai 0.85.1 的 openai-completions 从不写 `x-opencode-session`（`sessionAffinityFormat`/`sendSessionAffinityHeaders` 都不映射这个头），llm-pi-ai 又把 `sendSessionAffinityHeaders` 设为 withhold、profile 转不了会话 id。所以插件写出的三条路由都带家族常量 `dsh-opencode-go`：单机一个路由 shard，满足硬性检查；**不是**每会话值。等 DSH/pi-ai 原生发送会话头后可删掉这个常量。（用户自己开的内置 `opencode-go` 路由插件不碰；缺这个头时 Console Go 会 400，属 DSH/pi-ai 侧问题。）

`llm-pi-ai` 的 `models` 一旦非空就**替换**整条内置目录，追加不了，所以缺失模型只能单独开路由。这条按 picker 选择过滤 `models`，全关则 unset，用户自建同名路由不覆盖。Settings > 模型 picker 列 `opencode-go-flash` / `opencode-go-responses` / `opencode-go-messages` 三组（内置模型归 DSH 模型设置页）。**没有 `OPENCODE_API_KEY` 时不显示为已开启：勾选框不勾、插件路由 unset，DSH 的模型列表里也不出现插件写的东西**。用户只需在 DSH 凭据 / 环境里存 `OPENCODE_API_KEY`。

## 协议

官方 [Go · API 端点](https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9)。三条路由就是协议分发：completions 行 `/v1/chat/completions`（`@ai-sdk/openai-compatible`），responses 行 `/v1/responses`，messages 行 `/v1/messages`（`@ai-sdk/anthropic`，路由 `api: anthropic-messages`，不写 completions compat）。

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"opencode-go-flash"` / `"opencode-go-responses"` / `"opencode-go-messages"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。路由定义留在 [`models.ts`](models.ts)。

最近核对：2026-10-15，带 key 列表 + models.dev `opencode-go` + [官方端点表](https://opencode.ai/docs/go/)：`deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 从带 key 列表和端点表同时消失，删目录行与价目行。`gemini-4-argon-contributor` 在带 key 列表和 models.dev 桶里都有元数据（1048576 / 65536 / text+image / low–high），但端点表把它放在 `/v1/models/gemini-4-argon-contributor`（`@ai-sdk/google`），不在本插件的 api 闭集里，不收，`npm run models` 用 skip 挡住。`glm-5.1` / `omen-alpha` / `minimax-m2.5` 仍无桶元数据，继续不收。本机 Go 订阅仍过期，新行活测做不了。

上次核对：2026-10-14，带 key 列表 + models.dev `opencode-go` + [官方端点表](https://opencode.ai/docs/go/)：新收 `cat-jam-free`（Cat Jam Free，端点表放 `/v1/chat/completions` `@ai-sdk/openai-compatible`；桶里 262144 / 131072 / text-only / low–max；价目 $0/$0/$0）。**compat 只能是脚本默认 plain**：本机账号的 Go 订阅已到期（`go/status` 的 `cancelAtPeriodEnd`，周期 2026-09-10→2026-10-10），带 key 打 `/zen/go/v1/chat/completions` 回 403 `An active OpenCode Go subscription is required to use Go models.`，DeepSeek 方言活测做不了，按「没活测不写方言」留 plain，等有订阅的账号补测。`glm-5.1` / `omen-alpha` / `minimax-m2.5` 仍在带 key 列表、models.dev `opencode-go` 桶仍无元数据，继续不收。flash 22→23 行。

上次核对：2026-10-08（同日再后），带 key 列表 + models.dev `opencode-go` + [官方端点表](https://opencode.ai/docs/go/) 新收 `step-5-preview-free`（Step 5 Preview Free，限时免费）。端点表把它放在 `/v1/chat/completions`（`@ai-sdk/openai-compatible`）。models.dev：1M / 65536 / text+image+video / low–high，`cost` 0/0/`cache_read` 0，`interleaved.field` 为 `reasoning_content`；目录 `input` 只留 text+image（video 按目录规则剥掉）。最小活测 `POST /v1/chat/completions` 200，回包同时有 `reasoning` 与 `reasoning_content`，compat 写 DeepSeek 方言，不用脚本默认的 plain。`glm-5.1` / `omen-alpha` / `minimax-m2.5` 仍无桶元数据，继续不收。flash 22 + responses 6 + messages 6。

上次核对：2026-10-08（同日稍后），官方端点表把一批行改到 `/v1/messages`。带 key 的 `claude-haiku-5-5` 在 `/chat/completions` 与 `/responses` 都回 `ModelProtocolUnsupported`，`x-api-key` + `anthropic-version: 2023-06-01` + `x-opencode-session` 打 `/v1/messages` 则 200（`minimax-m2.7` / `minimax-m3` / `qwen3.7-plus` / `qwen3.8-flash` / `qwen3.8-max` 同样 200，completions 上 `minimax-m2.7` 已 400）。这五行从 flash 挪到新键 `opencode-go-messages`，并收 `claude-haiku-5-5`（models.dev：1M / 128K / text+image / low–max）。messages 行去掉 completions compat。Anthropic SDK 的 baseURL 是 `https://opencode.ai/zen/go`（自己补 `/v1/messages`）。`glm-5.1` / `omen-alpha` / `minimax-m2.5` 仍无桶元数据，继续不收。flash 21 + responses 6 + messages 6。

上次核对：2026-10-08 上午，带 key 列表 + models.dev `opencode-go` 桶 + 官方 Go 文档清单：无新行、无下架，行数 26 + 6 不变。`glm-5.1` / `omen-alpha` / `minimax-m2.5` 仍无桶元数据（`omen-alpha` 任何桶都没有），且官方文档「current list of models」也不列它们（GLM 只列 5.2 / 5.3，MiniMax 只列 M2.7 / M3）——端点列出 ≠ 套餐在服务，继续留在目录外。

上次核对：2026-10-07，带 key 列表 + models.dev `opencode-go` 桶：新收 `space-bunny`（1M 窗 / 524288 输出 / text+image / low–max）；活测回包带 `reasoning_content` → 按 DeepSeek 方言写 compat。`space-bunny-free` 从带 key 列表消失，活测 400 `Model is unavailable.`（Stealth 免费预览结束，command-code 1.74.2 同日退役 "Space Bunny Alpha"），随源删目录行 + 价目行。`glm-5.1` / `omen-alpha` / `minimax-m2.5` 仍无桶元数据，继续留在目录外。行数 26 + 6 不变。

上次核对：2026-10-05，带 key 列表仍列 `glm-5.1` / `omen-alpha` / `minimax-m2.5` 三行，models.dev `opencode-go` 桶（33 行）到现在仍没有它们的元数据，按「补不到参数就是 unresolved，不写入」继续留在目录外；其余两条路由的行数与 2026-10-03 一致（26 + 6），无新行、无下架。

更早核对：2026-10-03，官方 `GET https://opencode.ai/zen/go/v1/models`（**带 Go key 的列表**，无认证返回的是更大的公开缓存视图）+ models.dev `opencode-go` 桶。带 key 列表把 2026-09-30 轮下的 `kimi-k2.6` / `qwen3.6-plus` / `qwen3.7-max` / `glm-5.1` / `omen-alpha` / `minimax-m2.5` 六行又列了出来：前三行 models.dev 桶有元数据，重新收进 `opencode-go-flash`（`qwen3.6-plus` 带 256K 超阈档）；后三行桶里仍无元数据（`omen-alpha` 任何桶都没有），按「补不到参数就是 unresolved，不写入」继续留在目录外。新收 completions 行先活测：`qwen3.6-plus` / `qwen3.7-max` 回包带 `reasoning_content` → 写 DeepSeek 方言 compat；`kimi-k2.6` 回 `reasoning` / `reasoning_details`、无 `reasoning_content` → 默认 plain compat。

- 来源：官方 `/v1/models` 只给 id，决定收哪些行；context / output / input / effort 取 models.dev `opencode-go` 桶；DeepSeek 方言与 effort 阶梯对照内置 pi-ai catalog。Go docs 端点表定每个 id 走哪条协议。
- 协议分键：官方端点表优先于 models.dev 的 `provider.npm`。表上 `/v1/messages`（`@ai-sdk/anthropic`）的行进 `opencode-go-messages`，不写 completions compat；models.dev 标 `@ai-sdk/openai` 的行只在 `/responses` 可用，进 `opencode-go-responses`；其余走 `/chat/completions`。归属要逐行活测确认，公开列表里有的 id 两种协议都回 `Model is unavailable`，这类不进目录。
- 别名：同一模型的两个 id（例：`deepseek-flash` 与 `deepseek-v4.1-flash`）只留 docs 现行 id，picker 不出现两条同名行。
- compat：completions 行写 `openai` / `deepseek` 方言；DeepSeek 方言（回放 `reasoning_content`）要先活测确认再写，新行默认按普通 OpenAI。responses 行不写 compat（`sessionAffinityFormat` 是 llm-pi-ai 的 withhold 字段，profile 不许声明）。
- 窗口：Luna 两行报 OpenAI 侧的默认输入档 258K（`OPENCODE_GO_LUNA_CONTEXT`，与 Codex `CODEX_CONTEXT_WINDOW` 同值），不报 models.dev 的总窗——DSH 按 `contextWindow` 触发压缩，报总窗会让长会话涨到被 Go 网关拒绝（见 [`docs/error.md`](../../../docs/error.md) 2026-09-29 OpenCode Go Responses Luna 窗口）。Go 是 API key 家族，没有 `maxContextWindow` 可挂官方大窗。
- 2026-09-30：带 key 列表轮下 `glm-5.1` / `kimi-k2.6` / `minimax-m2.5` / `qwen3.7-max` / `qwen3.6-plus` / `omen-alpha`（公开缓存视图仍列，但订阅后端已不服务），六行随源删；新收 `longcat-2.5-preview-free`（1M / 131K / text+image / toggle 思考无档位），活测确认走 completions 且回放 `reasoning_content`，按 DeepSeek 方言写 compat；`gpt-5.6-luna`（responses）随 models.dev 加 `off`（wire `none`）档。

## OpenCode Zen

`https://opencode.ai/zen/v1` 是同一个账号的按量付费侧（预付余额 + 自动充值）。三条路由与 Go 同形，只是 origin 不同，且**不带** `x-opencode-session`：

```text
opencode-zen-chat      openai-completions  https://opencode.ai/zen/v1
opencode-zen-responses openai-responses    https://opencode.ai/zen/v1
opencode-zen-messages  anthropic-messages  https://opencode.ai/zen
                       （SDK 自己补 `/v1/messages`）
                       { apiKeyEnv: OPENCODE_API_KEY }
```

- **归因**：官方 [Zen 文档](https://opencode.ai/docs/zen/)（端点表 / 价目表 / 已弃用表 / 免费档 / 自动充值 / 月度限额）与 [Go 文档](https://opencode.ai/docs/go/)（套餐与用量上限）；协议与参数交叉核对内置 pi-ai `opencode` 目录（`@earendil-works/pi-ai/dist/providers/data/opencode.json`，按 `api` 分组）。CodexBar 只借它一处：`OpenCodeGoZenBalanceFetcher` / `OpenCodeGoZenBalanceParser` 把 **Zen 余额**读进 **Go 快照**（`includeZenBalance`）——它读的就是本文那条 `billing/status`；**`/console/api/usage/summary` 它一处都没读**（早前这条归因写错了，2026-10-10 更正）。
- **一个账号，两条产品线（官方口径）**：不是「一个订阅」。Go 是订阅（文档：Go $10/月、Go Plus $40/月；本机账号 `go/status` 实为 alipay 续费、周期 2026-09-10→2026-10-10、`cancelAtPeriodEnd: true`），Zen 是预付按量（`billing/status` prepaid）。两者共用一个 Console 账号 / 工作区 / `OPENCODE_API_KEY`：同一个 key 同时认 `GET /zen/v1/models`（45 行）与 `GET /zen/go/v1/models`（38 行），Go 的 API base 本身就在 Zen 网关下面（`/zen/go/v1`）。官方 Go 文档「Usage beyond limits」原话：`If you also have credits on your Zen balance, you can enable the Use balance option in the console. When enabled, Go will fall back to your Zen balance after you've reached your usage limits` —— 这正是 `go/status.useBalance` 与 Go 侧「余额兜底」的出处。所以家族、账号卡、vault 都只有一份，额度卡上半是 Go 的运行表、下半是 Zen 钱包。
- **协议分键**：官方端点表。`/v1/responses`（`@ai-sdk/openai`）→ responses 行，`/v1/messages`（`@ai-sdk/anthropic`）→ messages 行，其余 `/v1/chat/completions`。表上另有两类**不进目录**：`/v1/models/<id>`（`@ai-sdk/google`，7 行 Gemini）与 `/v1/systemone`（Jev）——DSH `api` 闭集里没有对应协议，硬塞进三条路由就是发明。
- **不收免费档**：带 key 列表里的 `big-pickle` 与全部 `*-free` 行，非 OpenCode 客户端一律 `403 FreeTierError`（"OpenCode's free tier can only be used from within OpenCode"，2026-10-10 实测；`big-pickle` 也回同一错误）。不为免费档伪装 OpenCode 客户端（「不要」一节原有这条）。
- **不收 `test`**：带 key 列表里的探测 id，官方文档表与内置目录都不列它。
- **窗口**：`gpt-5.5` / `gpt-5.6-terra` / `gpt-6-astra` / `gpt-6-sol` / `gpt-6.1-sol` / `gpt-6-luna` 六行按文档价目表的 272K 分档报 `contextWindow: 272000`（`>272K` 是另一个价档，是否还要 opt-in 本机无法验证——账号 Zen 余额 $0，推理跑不通，见 [`docs/error.md`](../../../docs/error.md) 2026-10-10）；其余行取 models.dev `opencode` 的窗。models.dev 的 `cost.tiers` 同样在 `272000` 分档，两个源互证。
- **compat**：Zen 的 completions 行**只写普通 OpenAI compat**。Go 侧 `deepseek-*` 的 DeepSeek 方言是逐行活测确认后才写的；Zen 侧没有可用的付费推理（余额 $0），按「没活测不写方言」留 plain，等有余额的账号补测。
- **额度卡：Zen 自己一张，只有钱包**（`ZenQuotaCard`，额度页紧随 OpenCode Go 那张）：
  - `预付余额`（`GET /console/api/billing/status` 的 `balanceMicroCents`）——$0 也显示：余额 0 正是叫不动 Zen 的状态。
  - `可用额度`——只有工作区真有信用额度时才出：`availableMicroCents / creditLimitMicroCents`（`creditLimitMicroCents: null` 是「没有这项」，不是 $0 额度，不画）。
  - 卡上没有凭证 UI（key / cookie / 退出都在 Go 那张，因为是一个账号一份凭据），只留「刷新额度」，它刷的就是这份共享账号读数。
  - **不读 `/console/api/usage/summary`**：那是 `x-org-id` 的**工作区**台账（`range=7d` = $6.765 跟着 Go 的 `week` 表 $6.7096 走，`range=all` 与 30d 相等），挂在 Zen 名下就是把 Go 的用量写成 Zen 的，正是要避免的混淆。Go 自己的三张表已经说了消费。
  - **没有「月度限额」行**：文档确实有月度限额（「Zen will not use more than $20 in a month」，可按工作区与成员设），但 console JSON API 不暴露它（`/console/api/usage`、`/console/api/billing/limits`、`/console/api/zen/status` 都是 404；`usage/summary` 只认 `30d` / `7d` / `all`，`month` / `90d` 是 400）。它只出现在 dashboard 的 SolidStart billing function（`/_server?id=c83b78…`），那是 `auth=` 面板会话，过期就 302 到 `/console/login`——宁可只报已有的事实，也不发明分母。
  - key-only 账号读不到这两条（`/console/api/billing|usage` 对 Bearer 仍 401/403），与 Go 的 key 旁路一致。
- **额度视图的两张卡（不混）**：`FAMILY_ORDER` 两条胶囊各有自己的卡——Go 卡由 `opencodeProductView((row) => !isZenRow(row))` 过滤，只留订阅表；Zen 卡由 `opencodeProductView(isZenRow)` 只留钱包行，两边的行集互补，永远读不出对方的产品名。钱包读不到时（key-only 账号、没有 Zen 账务的工作区）额度页**不出 Zen 胶囊与卡**（`zenVisible`）——Zen 卡没有登录表单，空条目点进去只会是白板（2026-10-10 实测的坑）。模型页的 Zen 胶囊照旧过滤那 30 行。
- **没有 Go 表时的卡面**：`go/status` 回 `access: null` 分两种——payload 里还留着 `subscriberUserId` / `resumability`（曾经订过，到期或取消，`state: 'ended'`）和连订户都没有（`state: 'none'`）。两种情况 quota 都照常 ready：`subscription: { state, product }` 落在 payload 里，Go 卡显示「订阅已结束 / 未开通 Go 订阅 + Console 链接」而不是「周额度未返回」——那是一句错误的读取失败暗示（2026-10-10 实测：取消订阅的工作区到期当天走成 `access-ended`，卡面只剩 Zen 行）。只要 `billing/status` 读到实际金额，Zen 卡就单独立着（`zenVisible`）；真·什么都没有才沿用 `no_subscription` 错误。

最近核对：2026-10-15，[Zen 端点表](https://opencode.ai/docs/zen/) 新增 `deepseek-v4.1-flash-free`（`/v1/chat/completions`）。免费档规则没变，不收，补进 `OPENCODE_ZEN_FREE_IDS`。`claude-opus-5-5-backup` 仍在带 key 列表、任何桶都没有元数据，继续不收。

上次核对：2026-10-14，[Zen 端点表](https://opencode.ai/docs/zen/) 新增两行 `/v1/chat/completions` 之外的 id，两条都按既有规则挡住、不进行：`gemini-4-argon`（表上 `/v1/models/gemini-4-argon` `@ai-sdk/google` → `OPENCODE_ZEN_GOOGLE_IDS` 补一个成员）与 `cat-jam-free`（免费档 → `OPENCODE_ZEN_FREE_IDS` 补一个成员；Go 侧同 id 是另一条产品线，见上）。带 key 列表新出现 `claude-opus-5-5-backup`：文档表与 models.dev `opencode` 桶都不列它 → 留在目录外，继续报 `!`。行数 8 + 14 + 8 不变。

上次核对：2026-10-10，带 key 的 `GET /zen/v1/models` **45 行**（无认证视图 87 行，是更大的公开缓存，与 Go 同形）。扣除免费档 12 行、`test` 1 行、`jev-*` 2 行、`gemini-*` 3 行后收 **8（chat）+ 14（responses）+ 8（messages）= 30 行**；三源（文档端点表、models.dev `opencode`、内置 pi-ai `opencode`）在每一行的协议上一致，`npm run models` 干跑 `+0 ~0 -0`。`mistral-large-4` 的 models.dev `provider.npm` 写 `@ai-sdk/mistral`、文档表把它放 `/chat/completions`：**文档表优先**，进 chat 行。

本插件不转发这条路径。不要为了「统一 hop」再包一层 `127.0.0.1:8318`。

客户端应发稳定 `x-opencode-session`（官方文档）。那是 DSH / pi-ai 的事，不是本目录的网关。

## 配置（Orca 形）

对照 [stablyai/orca](https://github.com/stablyai/orca) 提供商设置：两项字段读额度。

| 字段 | 用户贴什么 | 本目录 |
|---|---|---|
| API key | `sk-…`（DSH 对话用） | vault `apiKey`；活动账号镜像到 `OPENCODE_API_KEY` |
| 会话 cookie | Console 页 `__Host-console_session=…`/`console_session=…`，或旧面板 `Fe26.2…`/`auth=…` | `parseOpencodeGoCookie` → 保留 `auth` / `__Host-auth` / `__Host-console_session` / `console_session` |
| 工作区 ID 覆盖 | `wrk_…`/`org_…`，或 `https://opencode.ai/console/<id>/go`、`/workspace/<id>/go` URL | `normalizeOpencodeGoWorkspaceId` |

Cookie 认证基于 Web，可在 Windows 与 WSL 间共享。**不要**把 cookie 当 OAuth `accessToken` 写进 `auth.json`。若 cookie 失效但 API key 有效，额度先按 key 打 `GET /console/api/go/status`（`Authorization: Bearer <key>`，无 cookie、无 `x-org-id`；2026-09-26 实测 200，回包带 `access.meters.{fiveHour,week,month}` 的 `usedMicroCents`/`limitMicroCents`、`useBalance`、`renewalProduct`），被拒才退回 `GET /zen/go/v1/usage` 的 `usage.{rolling,weekly,monthly}.{percent,resetsAt}`；两条 key 路径都不返回邮箱，余额只有 console Bearer 的 `useBalance` 布尔（没有 prepaid 金额）。

snapshot 每行只给 `apiKeySet` / `cookieSet` / `workspaceId`。key / cookie 明文不出 RPC，也不回给浏览器。

## 额度

一线对照：[steipete/CodexBar](https://github.com/steipete/CodexBar) `OpenCodeGoUsageFetcher` +
`OpenCodeGoLegacyFallback`（web cookie 路径，不是 `GET /zen/go/v1/usage` Bearer）。

**Console 工作区**：已迁移工作区的 dashboard 是 SPA
（`/console/<id>/go`，壳页只有 `<div id="app">`），旧 `/_server` server-fn 与
`/workspace/{id}/go` 对它们回 302 → `/console/login`。Console 是 JSON API，
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
     balanceMicroCents: "<digits>"}        balance = /1e8 USD（billingMode 是
     Zen 钱包的计费方式；useBalance 是 Go 自己的「耗尽后扣 Zen 余额」开关，
     只认 `go/status.useBalance`——以前按 billingMode==='prepaid' 推导，余额>0
     的卡会误显「余额兜底」，2026-10-10 修正）
```

meter 是**花费额度**不是 token：行 `used/total` 按 USD（micro-cents/1e8），
`unit:'usd'`（`fiveHour` $12 / `week` $30 / `month` $60，go-plus ×4）。
`month` 无 `resetsAt` → 用 `access.endsAt`（账期结束）。`access:null` 且
prepaid 余额 >0 → `rows:[]` + 余额兜底，不报红；都没有 → `no_subscription` 错误。
Console 401/403/跳 login → `cookie is invalid or expired`；其余非 200 →
`console HTTP <status>[: message]`。

同一个 `go/status` 也认 `Authorization: Bearer <OPENCODE_API_KEY>`（不带 cookie、
不带 `x-org-id`；2026-09-26 用本机 key 实测 200）：回包形状与 cookie 路径一致，
是 key-only 唯一能拿到具体金额的来源；`/console/api/{orgs,user,billing/status}`
对 key 仍是 401/403，所以 key 路径没有邮箱、workspace 名与 prepaid 余额。

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

官方限额窗口：5 小时（月限额 20%）/ 每周（50%）/ 每月（100%）。卡片标签是 `5h` / `7d` / 这一账期的天数（`28d`–`31d`，量不出间隔时 `Monthly`）。有美元金额时写成 `$已用 / $上限 · 剩余 n%`；只有百分比时只写剩余。重置是紧凑倒计时（中文 `2天13时38分`，英文 `2d 13h 38m`），不写「后重置」。

**不要**把 `/zen/go/v1/usage`（只有百分比）当 cookie 账号的主路径——那是 CodexBar 的 API-key 旁路；key-only 兜底也要先走 `go/status` 的 Bearer 形态拿具体金额。Orca 这两项是 cookie + workspace。

## 不要

- 把实现放进 `src/oauth/opencode-go/`，或把页签放进 `.osubs-tabs-util` / 单独 API-key 胶囊
- 复活 `oauth-opencode` hop / Zen 匿名免费档 / `Bearer public`
- 本机回环网关转发 Go Responses
- 把 cookie 当 OAuth session 写 `auth.json`
- snapshot 把 key / cookie 明文回给 Settings
- 给每个账号再开一套 `opencode-go*` 路由或第四种 DSH `api`；聊天的 key 只有活动账号那一个
- 把插件目录当成「只补内置缺的那几条」——插件目录是自带的完整官方副本，只写自有六条路由：Go 的 `opencode-go-flash` / `opencode-go-responses` / `opencode-go-messages`，Zen 的 `opencode-zen-chat` / `opencode-zen-responses` / `opencode-zen-messages`
- 写 / 刷新 `providers.opencode-go` 或 `providers.opencode`（等于替用户把内置模型注册进 DSH 模型列表；只有旧版本插件自己写的同形 Go profile 才 unset 清掉）
- 把 `providers.opencode-go` / `providers.opencode` 写成带 `api` / `models` 的形态（会丢 pi-ai catalog 的 per-model 协议 / compat / 思考档与 env auth）
- 去掉 `x-opencode-session` 头（除非 DSH / pi-ai 已原生按会话发送；现在缺它 Console Go 直接 400）——反过来，也**不要给 Zen 路由加这个头**：Zen 文档不要求，实测也没有 `MissingSessionID`，加上就是发明
- 给 Zen 单开家族 / 第二个 vault / 第二张账号卡：同一账号的 key 与 cookie 只有一份，两个 store 会互相清掉对方镜像的 `OPENCODE_API_KEY`
- 把 Gemini（`/v1/models/<id>`，`@ai-sdk/google`）、Jev（`/v1/systemone`）或免费档塞进三条 Zen 路由：前两类协议不在 DSH `api` 闭集，免费档对非 OpenCode 客户端直接 403
- 为了白嫖免费档伪装 OpenCode 客户端 UA / 指纹（免费档数据还可能被用于训练，官方隐私节写明）
- 抄 Codex / Grok cache 头

## 归因

- 官方 Go：https://opencode.ai/docs/zh-cn/go/
- API 端点：https://opencode.ai/docs/zh-cn/go/#api-%E7%AB%AF%E7%82%B9
- 官方 Zen：https://opencode.ai/docs/zen/（端点表 / 价目表 / 已弃用表 / 免费档与隐私节）
- Zen 额度对照：CodexBar [OpenCode](https://github.com/steipete/CodexBar/tree/main/Sources/CodexBarCore/Providers/OpenCode) `OpenCodeConsoleUsageFetcher`（pay-as-you-go 才读 `usage/summary`）、`OpenCodeZenBillingParser`（`monthlyUsage` / `monthlyLimit` / `balance`，1e8 定点）
- Zen 协议 / 参数交叉核对：内置 pi-ai `@earendil-works/pi-ai/dist/providers/data/opencode.json`（按 `api` 分组：anthropic-messages 16 / google-generative-ai 7 / openai-completions 21 / openai-responses 29）
- 设置形：Orca OpenCode Go 提供商（cookie + workspace ID 覆盖）
- 额度：CodexBar [`OpenCodeGoUsageFetcher`](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/OpenCodeGo/OpenCodeGoUsageFetcher.swift)（console 优先 + legacy 兜底）、`OpenCodeGoZenBalanceParser`（billing status）；Console 字段 schema 实测自 `/console/assets/index-*.js` 打包产物（`x-org-id`、`goStatus`→`/orgs/:orgId/go/status` 的 header 别名、`BillingStatus`/`meters` 类定义）
- 宿主对话：DSH pi-ai `opencode-go` + `OPENCODE_API_KEY`
- 模型页价格徽标：models.dev `opencode-go` / `opencode`（`longcat-2.5-preview-free`、`step-5-preview-free` 标价 $0；Zen 的 `cost.tiers` 在 272K 分档，与文档价目表互证），`npm run rates` 写入 `src/catalog/rates.json`

总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
