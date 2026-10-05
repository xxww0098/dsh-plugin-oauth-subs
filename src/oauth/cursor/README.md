# Cursor OAuth

本文件是 `src/oauth/cursor/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Cursor 订阅（Composer / Claude / GPT / Grok via Cursor infra）。原生 wire 是 **Connect RPC v1 protobuf over HTTP/2**，不是 OpenAI REST。社区逆向来自 MIT [`Rahularya01/pi-cursor`](https://github.com/Rahularya01/pi-cursor)（`src/auth/oauth.ts`、`docs/protocol.md`、`src/client/h2-session.ts`、`src/stream/request-build.ts`、`proto/agent.proto`）。缓存命中字段与 Run handshake 头对照 [`fitchmultz/pi-cursor-sdk`](https://github.com/fitchmultz/pi-cursor-sdk) 钉的 `@cursor/sdk@1.0.27`（`TurnEndedUpdate.cache_read_tokens`、`x-original-request-id`）。本目录只抽 Run / GetUsableModels / GetCurrentPeriodUsage 用到的字段，不 vendor 整棵树，也不引入 Bun / `@cursor/sdk`。

> 非正式集成。Cursor 随时可能改线。只用用户自己有权使用的账号。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 目录、身份、PKCE 参数、poll / refresh、CLI 指纹、session |
| [`catalog.ts`](catalog.ts) | 登录后 GetUsableModels + AvailableModels 活目录；静态 `CURSOR_MODELS` 只做离线 fallback |
| [`pkce-flow.ts`](pkce-flow.ts) | 打开 `loginDeepControl` + poll 直到 tokens |
| [`import.ts`](import.ts) | 本机 CLI Keychain / IDE `state.vscdb` / `CURSOR_ACCESS_TOKEN` |
| [`request.ts`](request.ts) | OpenAI Completions ↔ `AgentClientMessage` / `AgentServerMessage` |
| [`cache.ts`](cache.ts) | `AgentRunRequest.conversation_id` + 稳定 user message id。禁止 `Date.now()` / 每次 `randomUUID()` |
| [`proto.ts`](proto.ts) | 最小 protobuf + Connect framing（Run / GetUsableModels / AvailableModels） |
| [`h2-session.ts`](h2-session.ts) | Node `http2` 进程内 RPC（unary + streaming），走池化会话、只关自己的流；`connectFn` 允许返回 Promise |
| [`upstream-proxy.ts`](upstream-proxy.ts) | 可选上游代理：HTTP CONNECT / SOCKS5 隧道（区域锁出口） |
| [`transport.ts`](transport.ts) | Completions HTTP / SSE 输出与 Run 事件消费背压 |

调度：[`../proxy.ts`](../proxy.ts) `family === 'cursor'` 剥 Codex retention，取出 `cursorConversationId`；真正组 Run 在 `openaiToCursor`。
额度：[`quota.ts`](quota.ts) `fetchCursorQuota` / `parseCursorPeriodUsage`（`api2.cursor.sh` JSON，不是 agentn）。
套餐：`CURSOR_PLAN_NAMES`（Free / Hobby / Pro / Pro+ / Business / Team / Ultra）。

## 协议

DSH `api: openai-completions`。原生 Connect/protobuf 对不上三种闭集，Completions + 翻译层是唯一划算的。不要改 Responses / Anthropic。

```text
DSH POST /cursor/v1/chat/completions
  → openaiToCursor
  → HTTP/2 POST https://agentn.us.api5.cursor.sh/agent.v1.AgentService/Run
     application/connect+proto
  → AgentServerMessage 流 → OpenAI SSE / JSON
```

`baseURL` 是 `${origin}/cursor`，Completions SDK 会打到 `/cursor/v1/chat/completions`。不要写成 `/cursor/v1`。

非流 Completions：Run 本身是流；hop **收集整段再回一条 JSON**。不是 Codex 那种 SSE-only 拒非流。

Run 握手必须按类型回帧，不能一律当原生工具拒绝：

- `ExecServerMessage.request_context_args` → `RequestContextResult.success`（带 DSH 的 `McpToolDefinition`，即 `requestContextArgs.tools`）。回 `ExecClientThrow` 会让上游直接判 `Failed to get request context`，任何模型都跑不起来。
- `kvServerMessage`：`getBlobArgs` 回 `getBlobResult`，`setBlobArgs` 回 `setBlobResult`（两者是不同的 oneof field）。
- 原生 Cursor 工具（`shell_args` / `read_args` / `ls_args` / `write_args` / …）回**类型化 rejection**（`Tool not available in this environment. Use the MCP tools provided instead.`），模型据此回退到 DSH 的 MCP 工具；不要用 throw，否则整轮失败。
- `mcp_args` → 把真实参数（`google.protobuf.Value` map）转成 OpenAI `tool_calls`。一步里的并行调用会一个接一个到（活测：0 / 0.8 / 1.3s），Run 到这一步的 **checkpoint**（服务端消息顶层 field 3，紧跟最后一个调用：单调用晚约 17ms，三个并行调用与第三个同时）才结束，交给 DSH 执行；checkpoint 不来时 3s 兜底（`toolBatchGraceMs`）。以前遇到第一个调用就结束，其余的丢了，每个并行调用多花一个 Run。

**历史是 JSON 消息，不是 protobuf turn。**服务端忽略 protobuf `ConversationTurn` 历史（第二轮会忘掉第一轮）；整段对话按 AI-SDK JSON 消息（`system` / `user` / `assistant` / `tool`，`tool-call` / `tool-result` 的 `toolName` 是 `CallDynamicTool`，`args: { namespace: 'dsh', toolName, arguments }`）放进 `conversationState` 的 root blob（field 1）。当前这一轮的话走 action 的 user message。

工具结果续跑：Cursor 没有无状态的 tool-result action。完整的 assistant tool-call 与 tool-result（并行调用合成一条 `tool` 消息，没答复的调用补一条 `Tool result unavailable` 的错误结果，因为每个调用都要有结果）都在 JSON 历史里，当前 user 消息是 **`Continue.`**。活测三种措辞：把原始结果当 user 话，模型回「你没提问」；把原问题再发一遍，模型重新调用工具；`Continue.` 才答对。

图片：user 消息里 `data:image/{png,jpeg,gif,webp};base64,…` 变成 JSON 消息里的 `{ type: 'image', mimeType, image: { __type: 'Uint8Array', hex } }`，只有最近一条带图的 user 消息保留图片（每次 Run 都要重发）。活测红 / 蓝两张图都读对；`RunRequest` field 19 的 inline-images 标志（magpie 发）没它也行，没发。

没做：把工具目录写进系统消息以省掉模型的 `get_mcp_tools` 探路步（magpie 做）——活测 3 对 3 平均只快约 0.8s，噪声与之相当，不值得改系统前缀。

h2 会话按 (origin, 出口代理) 池化：`cursorH2Connect` 每键一个会话，并发拨号合并，close / GOAWAY / error / 60s 无帧即出池（空闲是优雅 `close()`，在途流跑完），会话 `unref()`，插件停止或配置变化时 `clearCursorH2Pool()` 清池。Run 与 unary 只拥有自己的流：结束、取消、unary 超时都 `stream.close(NGHTTP2_CANCEL)`（上游停止该流的工作），绝不 `destroy` 共享会话；调用方放弃后才落地的拨号照样入池，但不交给它。已结算后不再消费消息或写 KV 回复。预取消信号不建立连接。`onEvent` 的异步消费完成前暂停接收，SSE 背压沿调用链传回 Run。EOF 的 Connect 残帧必须报错。每次 Run 在 `upstreamRequest(...).run` 里执行：首字节 120s 覆盖 h2 拨号 + 第一个 DATA 帧，每帧 `touch()`；role 块随第一块内容才发，输出前的 Connect 错误帧按 `connectCodeStatus` 回 JSON（`unauthenticated`→401 先刷新一次再试，`resource_exhausted`→429，`invalid_argument`→400…），非 200 的 h2 头按原状态码回；都不在代理内重放，只重试传输故障。已输出后的异常直接断流（`destroy`），不写 SSE 错误块、不追加 DONE。见[故障记录](../../../docs/error.md)。

### 上游代理（区域锁出口）

Cursor 按请求**出口 IP** 做合规区锁：Anthropic / OpenAI / Gemini 在受限区域直接 `Model not available: This model provider is not supported in your region`（Composer / Grok / Kimi / GLM 不受限）。官方客户端走 `http.proxy`；本 hop 等价物是**插件配置 `cursorProxy`**，或环境变量 `PI_CURSOR_PROXY` / `CURSOR_PROXY`（`http://`、`https://`、`socks5://`，可带 `user:pass@`）。配置后 `cursorH2Connect` 先对代理做 CONNECT / SOCKS5 握手，再在隧道上做 TLS+h2 —— `connectFn` 因此允许返回 Promise。h2 RPC 面（agentn Run / GetUsableModels、api2 unary）的出口优先级：`cursorProxy` → `PI_CURSOR_PROXY` / `CURSOR_PROXY` → 插件出站代理（`outboundProxyFor`，遵守 NO_PROXY / 回环直连）；h2 会话 10s 内连不上即销毁报 `cursor h2 connect timeout`。auth poll / refresh / quota JSON 走 `outboundFetch`（出站代理，不走 `cursorProxy`）。目录缓存键并入代理出口，切代理即重新拉活目录。未配代理时区域错误会追加指向该配置的提示。

## 登录

| 方法 | 用户看见 | 怎么登录 |
|---|---|---|
| PKCE poll | 主按钮 | 打开 `https://cursor.com/loginDeepControl?challenge=&uuid=&mode=login&redirectTarget=cli`，`GET https://api2.cursor.sh/auth/poll?uuid=&verifier=`。404 = 还在等，退避 1s→10s，最多约 150 次 |
| 本机导入 | 「导入本机 Cursor」 | 见下。**不是**第二套 OAuth |
| 空花名册自动导入 | 无按钮 | roster 为空时尝试一次本机复用。**绝不**覆盖已存 PKCE/session |

刷新：`POST https://api2.cursor.sh/auth/exchange_user_api_key`，`Authorization: Bearer <refresh>`，body `{}`。过期用 JWT `exp` 减 5 分钟。永久失败（401 / `invalid_grant` 类）与退避都归 `TokenManager`；403 / 429 / 5xx 是临时失败。

**不要**在插件加载时静默扫 Keychain / `state.vscdb` 覆盖已有会话。自动导入只在 cursor 花名册为空时走一次。

### 卡抬头身份

可见标题只走人类 id，顺序：

1. JWT `email` / `preferred_username`（`cursorAccountFromToken`，不验签）
2. session `cachedEmail` / IDE `state.vscdb` `cursorAuth/cachedEmail`（snapshot 只在有账号缺人类 id 时才打开 `state.vscdb`，每账号每 60s 最多一次，登录态变化重置）
3. `POST …/aiserver.v1.AuthService/GetEmail` `{ email }`（刷新额度必打；usage JSON 没有 email）
4. 必要时 `POST …/aiserver.v1.DashboardService/GetMe`（`email` 优先，否则 `firstName` + `lastName`）
5. `GetCurrentPeriodUsage` JSON `email`（有才用；活探测里没有）

`displayCursorAccount` / `publicSession('cursor')` **永不**展示 JWT `sub`、字面 `cursor`、`provider|user_*`（WorkOS / Auth0）。没有人类 id 就省略标题（`undefined`），不要用 opaque id 顶上去。

`accountIdOf` 仍可用 JWT `sub` 当 vault 稳定键。刷新 / snapshot 读到人类 id 就写 `cachedEmail`，opaque vault 走 `replaceAccountId`（同 GLM `zcode`）。不要打 `cursor.com/api/auth/me`（204）或 cookie 的 usage-summary（401）。

### 本机导入（用户拥有的 Cursor 登录复用）

顺序：

1. `CURSOR_ACCESS_TOKEN`（不 refresh）
2. 并行读 Keychain 与 vscdb
3. 仍有效的本地 access（先 Keychain 再 vscdb）—— **零网络**
4. 否则本机登录已过期：抛 `ImportedLoginStale`（「run cursor-agent (or open Cursor)」）。**不**在导入时换票——refresh token 属于 CLI / IDE
5. `saveSession`，`source` 标 `cli_keychain` / `ide_vscdb` / `env`
6. 刷新额度

macOS Keychain（仅 darwin，`execFile` 超时 2s，并发）：

```text
security find-generic-password -s cursor-access-token -a cursor-user -w
security find-generic-password -s cursor-refresh-token -a cursor-user -w
```

IDE `state.vscdb`（只读，`node:sqlite` `DatabaseSync`，用完 close）：

- macOS: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- Windows: `%APPDATA%/Cursor/User/globalStorage/state.vscdb`
- Linux: `~/.config/Cursor/User/globalStorage/state.vscdb`
- WSL: **仅当前** Windows 用户（`USERPROFILE` / `USERNAME` → `/mnt/c/Users/<you>/AppData/Roaming/Cursor/...`）。不扫 Public / Default / 其他 profile。

键：`cursorAuth/accessToken`、`cursorAuth/refreshToken`、`cursorAuth/cachedEmail`（可选，给卡抬头）。缺文件 = 空，不把堆栈抛给 UI。

**导入只读**（决定 4）：`cli_keychain` / `ide_vscdb` 登录临期时，`cursorImported` 钩子只重读同一 store（Keychain 或 vscdb，零网络），过期 > 现在 + 15s 才采用；store 也过期 → `ImportedLoginStale`（403），不删登录；access JWT 的 `sub` 与存储行不同（换了号）同样抛 `ImportedLoginStale`，不采用。`pkce` / `env` 不受影响。

轮换证据：来源一 cursor-agent `2026.09.26-dd393fe` 打包 `index.js`（`./src/auth-refresh.ts`）——CLI 没有 refresh_token grant，只用 API key 经 `/auth/exchange_user_api_key` 重铸，Keychain 走 `setSecretIfChanged`；IDE vscdb 里 `cursorAuth/accessToken` 与 `cursorAuth/refreshToken` 是同一个 JWT ⇒ **不轮换**。决定 4 的默认仍是只读；用户要放开时，本家族可以放开。来源二（被动观察：插件自有登录在宿主自然刷新前后各记一次 refresh token sha256 前 8 位）：待合入后记录。

空结果：zh「本机没有 Cursor CLI 或 IDE 登录」。Keychain 第一次读可能弹系统授权；vscdb 键名可能被 Cursor 改掉——见 `docs/error.md`。

## 指纹

AgentService/Run 与 unary 发 Cursor **CLI** 头。CLI 版本对齐 [Rahularya01/pi-cursor](https://github.com/Rahularya01/pi-cursor) `DEFAULT_CURSOR_CLIENT_VERSION`（`cli-2026.07.23-e383d2b`）。`x-original-request-id` 对齐 `@cursor/sdk` Run handshake。本 hop 是 `loginDeepControl` OAuth，**不要**改成 `x-cursor-client-type: sdk`（那是 API key 的 `Agent.create`）。

| 头 | 值 |
|---|---|
| `authorization` | `Bearer <access>` |
| `connect-protocol-version` | `1` |
| `content-type` | 流 `application/connect+proto`；unary `application/proto` |
| `te` | `trailers` |
| `x-ghost-mode` | `true` |
| `x-cursor-client-version` | `cli-2026.07.23-e383d2b`（`PI_CURSOR_CLIENT_VERSION` 可覆盖） |
| `x-cursor-client-type` | `cli` |
| `x-request-id` | 每条 DSH 请求一个 UUID |
| `x-original-request-id` | 与 `x-request-id` 相同（DSH 一轮就是一次 Run；重试保持原 id） |

不要假装 Cursor 桌面 IDE。不要发明 `x-parent-request-id` / `x-root-parent-request-id` / `x-parent-agent-tool-call-id`（官方 SDK 给子 agent 用，本 hop 不发）。`conversationState.client_name` 用 `dsh`。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"cursor"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

最近核对：2026-10-05，活列表 `GetUsableModels + AvailableModels`：`claude-sonnet-5-5` 的 `supportsImages` 回到 true（2026-09-30 收成 text 的口径回摆，同族 sonnet-5 一直是 text+image），目录 `input` 随活列表改回 text+image；其余 15 行与 2026-10-04 一致，没有新 id。

上次核对：2026-10-04，[cursor.com/docs/llms.txt](https://cursor.com/docs/llms.txt) 的 `/docs/models/<slug>` 仍是静态楼这 16 个家族，没有新 slug。pricing 表里的旧行（Claude 4.x、GPT-5.4 及更早、Gemini 3.7 及更早等）继续只报告不写入。

更早核对：2026-09-30，[cursor.com/docs/models-and-pricing](https://cursor.com/docs/models-and-pricing)（HTML 表 + `/docs/models/<slug>` Model ID 页 + `llms.txt`）；本次活列表把 Claude Sonnet 5 / 5.5 的非 Max Mode `context` 抬到 300K（docs 标 1M 扩展窗）、Gemini 3.1 Pro / 3.8 Flash 抬到 1M（docs 页原生 1M），`claude-sonnet-5-5` 的活 `supportsImages` 变 false（同族 sonnet-5 仍是 text+image，按活列表收——活列表就是 Run 注册表校验的口径）。

**活目录是真相，静态楼只做离线 fallback。** 登录、本机导入、额度刷新、启动 warmup（`controller.warmCatalogs`，只跑已登录家族）走活发现：

```text
unary GetUsableModels  agentn  /agent.v1.AgentService/GetUsableModels
unary AvailableModels  api2    /aiserver.v1.AiService/AvailableModels
  → 按 access-token sha256 前 16 位 + 上游代理出口 缓存 5 分钟
  → toCursorPickerModels 收成一行 / 家族；有 `-fast` 源时再加 `{family}-fast`
  → buildProviders / catalog / llm-pi-ai yaml
```

- 任一 RPC 失败或空列表**不挡对话**，回落静态楼。活列表非空时**不回填静态行**：服务端按账号 + 出口给可跑模型，区域锁家族（Claude / Gemini / GPT）回填了也只会 400（见 docs/error.md 2026-09-17 Cursor 区域锁模型全挂 + 勾选格停在静态底表）。
- 字段来源：窗口优先 AvailableModels 变体的非 Max Mode `context`，其次活 metadata，最后 `inferCursorContextWindow` / `inferCursorMaxOutputTokens`；effort 与 Fast 由活变体的参数集决定；名字去掉上游 `Cursor ` 品牌前缀。
- 静态楼对齐官方 docs 表。id 抄官方 Model ID（`claude-fable-5-1`，不是点号）。docs 表的 Hidden by default ≠ 订阅后端不服务，hidden 行留在静态楼。窗口取非 Max Mode 值：普通 Run 不发 `maxMode`，Max Mode 窗是独立变体（例：`grok-4.7` 静态取 256k，不取 500k）。
- `npm run models` 对本键只刷新已有行；活列表里的隐藏 / 旧 id 只报告不写入，新行按 docs 表手挑。

不要把 pi-cursor `catalog.json` 的 ~100 个 effort/fast/thinking/max-mode id 铺进 Settings 勾选格。`cursorPickerFamilyId` 剥掉这些后缀；Tab / chat 内部变体隐藏（Pi `/cursor.models all` 才是 opt-in）。Auto（`default` / `auto` 及其 `-fast`）**不进选择器**：`cursorPickerFamilyId` 对它返回 `''`，活目录列出来也跳过。

Fast：活目录里某家族只要有一条源 id 在剥掉 effort / thinking / max-mode 后仍带 `-fast`（`gpt-5.5-high-fast`），就加一行 `{family}-fast`，显示名 `{Name} Fast`（zh/en 都不译 Fast）。没有 `-fast` 源的家族不加；静态楼不编 Fast。不要用 Codex `src/utils/fast-mode.ts` / `service_tier: priority`。

Hop：Completions `model` 以 `-fast` 结尾时，`requestedModel.modelId` 是家族 id（`gpt-5.5`，不是 `gpt-5.5-high-fast`），`modelParameters` 在 `{ id: 'reasoning', value }` 之外再加 `{ id: 'fast', value: 'true' }`（pi-cursor `RequestedModel.parameters` 的 Fast 字段）。`maxMode` 仍是 false。对话 pin 跟家族 id，Fast 不是另一段 conversation。

**Registry 参数逐字校验**：上游按 AvailableModels 变体的参数集校验 Run，id 或 value 错一个就整轮 `AI Model Not Found: Invalid parameters for registry model`。参数 id 与取值按家族不同（`effort` / `reasoning` / `reasoning_effort`，有的家族没有思考参数），只能从活变体读，不能跨家族类推（见 docs/error.md 2026-09-22 Cursor `grok-4.7` 一跑就「AI Model Not Found」）。`cursorModelParameters` 按 `cursorParamStyle`（live 优先、`CURSOR_PARAM_STYLES` 兜底）发 `context`（精确匹配行窗口）→ effort → `fast`；家族无样式或 effort 值不在广告集里就**省略该参数**（注册表默认兜底），绝不猜 id。

Settings 勾选仍须登录后才能改。新发现的行默认开，`setModels` / `sync()` 写入 `settings.yaml` `oauth-cursor.models`。

## 额度

刷新额度并行三路（host 都是 **api2**，不是 agentn，也不是 cursor.com）：

```text
POST /aiserver.v1.DashboardService/GetCurrentPeriodUsage  {}
GET  /auth/full_stripe_profile
POST /aiserver.v1.AuthService/GetEmail                    {}
  → 无邮箱再 POST /aiserver.v1.DashboardService/GetMe     {}
```

套餐优先 stripe `individualMembershipType` / `membershipType`，再 usage `membershipType`，缺省才是 Pro。IDE Ultra 活探测 usage 没有 membershipType，必须读 stripe。

一条 `kind: 'cycle'` 美元行 + 两条 `kind: 'product'` 百分比条。美元行取 `planUsage.includedSpend / limit`——**单位是美分**，即 Cursor 仪表盘 `displayMessage`「You've used N% of your included usage」的同一口径；`limit <= 0` 或缺 `includedSpend` 时不发这行。百分比条对齐仪表盘（不是美分封顶）。`0.454` 是 0.454 **百分**，不是分数。`clampUsedPct`：已用 > 0 且四舍五入成 0 则显示 1（对上 Cursor「1% API」）。

| `product`/`kind` | 字段 | zh | en |
|---|---|---|---|
| `cycle:included` | `planUsage.includedSpend` / `limit`（美分 → `$used/$total`） | 包含额度 | Included usage |
| `auto` | `planUsage.autoPercentUsed` | 补全 & Composer | Tab completion & Composer |
| `api` | `planUsage.apiPercentUsed` | API 调用 | API |

缺字段当 0%（刚重置不是缺条）。`resetAt` 两边都取 `billingCycleEnd`。Settings 一律 `RemainingBar` / `QuotaMeter`：填充 = `remainingPercent`（`100 − used`），文案 `剩余 {n}%`。PKCE 真 0/0 → 剩余 100%。`formatPlanLabel(..., 'cursor')` 的 `pro` 是 Pro，`ultra` 是 Ultra，不是 Codex Pro 20x。

## 缓存

| | |
|---|---|
| 后端 | Cursor Agent 会话（`AgentRunRequest.conversation_id`）。prefix 是 conversationState blobs |
| 粘性 id | DSH `session_id` / `prompt_cache_key` **加上 model**；缺 pin 时 `dsh-cursor:<model>`（裸 `dsh-cursor` 只在没有 model 时），`isCursorFallback` 为真时不钉系统提示。禁止 `Date.now()`。历史 turn 的 `messageId` / `requestId` 用内容哈希，禁止每跳 `randomUUID()` |
| HTTP | `x-request-id` = `x-original-request-id`（SDK handshake）。不写 Codex `session-id` / Grok `x-grok-conv-id` |
| 停额外 snapshot | 第一条 system 钉在 `root_prompt_messages_json`；后续 DSH snapshot 再追加一条 system blob（Cursor 前缀列表，不是 GLM 尾 system，也不是 Gemini 尾 user） |
| 命中字段 | `TurnEndedUpdate.cache_read_tokens`（field 3）→ OpenAI `prompt_tokens_details.cached_tokens`。`input_tokens` 是整段 prompt（含 cache），与 `@cursor/sdk` `toTokenUsage` 一致 |

不写 Codex `session-id` / `prompt_cache_key`，不写 Grok `x-grok-conv-id`。

## 不要

- 从 Codex / Grok / GLM / Kiro / Antigravity 抄 cache helper
- 对 `requestContextArgs` / KV set / 原生工具统一回 `ExecClientThrow`（任一都会让整轮 Run 失败）
- 用 protobuf `ConversationTurn` 放历史（服务端不读，第二轮就失忆）；把原始工具结果或原问题当续跑的 user 话（模型说「你没提问」/ 重新调用工具）
- 用 Responses 或 Anthropic 当 DSH `api`
- 插件加载时静默收割 IDE / Keychain 覆盖已有 PKCE
- 打印或提交 token
- 加 Bun
- 发明 `requestType` / boost 字段
- 把 pi-cursor `catalog.json` 的 effort/fast/thinking/max-mode 变体铺进勾选格
- 用 `includedSpend` / `limit` 当额度条 used/total
- 恢复 `src/utils/cache-session.ts`
- 扫 WSL / Windows 上别人的 Users 目录
- 打 `cursor.com/api/auth/me` 或 cookie `usage-summary`（204 / 401）
- 发明 `x-parent-request-id` / `x-root-parent-request-id` / `x-cursor-client-type: sdk`（官方 SDK 有，本 hop 是 CLI OAuth 不发）
- 把 JWT `sub` / `cursor` / `provider|user_*` 画在 Settings 卡抬头
- 把 `apiPercentUsed` 0–1 当分数（0.454 不是 45%）

## 归因

一线：Cursor CLI `loginDeepControl`（非正式集成）。Wire / PKCE / HTTP/2 / Keychain+vscdb 导入顺序改编自 MIT [Rahularya01/pi-cursor](https://github.com/Rahularya01/pi-cursor)（`src/auth/oauth.ts`、`docs/protocol.md`、`src/client/h2-session.ts`、`proto/agent.proto`）与 [ephraimduncan/opencode-cursor](https://github.com/ephraimduncan/opencode-cursor)；缓存命中字段对照 [fitchmultz/pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk) 钉的 **`@cursor/sdk@1.0.27`**。

| 抄 | 出处 | 本 hop |
|---|---|---|
| PKCE 登录 + poll / refresh | pi-cursor `src/auth/oauth.ts` | `createCursorPkce` / `pkce-flow.ts` |
| 模型页价格徽标（USD / 1M） | [cursor.com/docs/models-and-pricing.md](https://cursor.com/docs/models-and-pricing.md) 两张表，按行 `name` 对表名；`<name> (Fast)` → `-fast`，没有独立 Fast 行的取基础行 × notes 写明的倍数（"Fast mode is available at 2x pricing"，GPT-5.6 三行）；notes 只说 "higher rates" / 要 Max Mode 的（GPT-5.5、Claude Opus 系）没有倍数出处，不出徽标 | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| Connect RPC over HTTP/2、最小 protobuf | pi-cursor `docs/protocol.md`、`h2-session.ts`、`proto/agent.proto` | `h2-session.ts` / `proto.ts`（只抽用到的字段） |
| 本机登录导入顺序（Keychain → vscdb） | pi-cursor、opencode-cursor | `import.ts` |
| 客户端版本 `cli-2026.07.23-e383d2b` | pi-cursor `DEFAULT_CURSOR_CLIENT_VERSION` | `CURSOR_CLIENT_VERSION` |
| `TurnEndedUpdate.cache_read_tokens`（proto field 3） | `@cursor/sdk@1.0.27` | `proto.ts` `cacheReadTokens` |
| Run handshake `x-original-request-id` | `@cursor/sdk@1.0.27` | `cursorChatHeaders` |

pi-cursor-sdk 自己走 **API key + `Agent.create`**，不是 OAuth；本 hop 是 CLI OAuth，所以 `x-cursor-client-type` 保持 `cli`（`CURSOR_CLIENT_TYPE`）。不 npm `@cursor/sdk`，不 vendor 整棵 proto。

**不要发明：** 与上游对照相关的每一条都已在别处，这里不重复：SDK 才有的头（`x-parent-request-id` / `x-root-parent-request-id` / `x-cursor-client-type: sdk`）在「不要」节；历史 turn 不用 `randomUUID()`、会话 id 不用 `Date.now()` 在「文件」表与「缓存」节。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
