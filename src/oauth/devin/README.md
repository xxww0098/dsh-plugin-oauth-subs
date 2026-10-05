# Devin Agent OAuth

本文件是 `src/oauth/devin/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Devin 订阅（SWE / Claude / GPT / Gemini / Grok / GLM / Kimi 经 Devin infra）。原生 wire 是 **Connect RPC v1 protobuf over HTTP/1.1** 到 `server.codeium.com`（Codeium/Cascade 服务端），不是 OpenAI REST，也不是 api.devin.ai。协议对照 MIT [`can1357/oh-my-pi`](https://github.com/can1357/oh-my-pi) 的 `pi-catalog` devin provider + vendored `exa.*` protos，全部字段号已用**本机 Devin CLI 3000.10.31 凭据对生产活测**：`GetCliModelConfigs` 回 598 条（2026-09-23）、`GetUserStatus` 回 `teams_tier=16`（Devin Pro）、`GetChatMessage`（`swe-2-medium`）真实流式回 "PONG"。本目录只抽用到的字段，不 vendor 整棵树，不引入 `@connectrpc/*`。

> 非正式集成。Devin 随时可能改线。只用用户自己有权使用的账号。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 目录、身份、PKCE 参数、token exchange、session、`refreshDevin` |
| [`catalog.ts`](catalog.ts) | 登录后 `GetCliModelConfigs` 活目录 + 家族收成 + 静态 fallback |
| [`import.ts`](import.ts) | 本机 CLI `credentials.toml` / `DEVIN_API_KEY` / `WINDSURF_API_KEY` |
| [`request.ts`](request.ts) | OpenAI Completions ↔ `ChatMessagePrompt` / 流式事件 |
| [`cache.ts`](cache.ts) | `cascade_id` / `execution_id` 派生；剥 DSH cache 字段 |
| [`proto.ts`](proto.ts) | 最小 protobuf + Connect framing（含 `MAX_CONNECT_FRAME_PAYLOAD` 上限） |
| [`transport.ts`](transport.ts) | Connect HTTP/1.1 POST + `GetUserJwt` / `GetUserStatus` + SSE/JSON 输出 |

调度：[`../proxy.ts`](../proxy.ts) `family === 'devin'` 走 `applyDevinCache`（**不调** `applyFastMode` —— Devin `-fast` 是真后端变体，不是 Codex Priority）。
额度：[`quota.ts`](quota.ts) `fetchDevinQuota` / `parseDevinUserStatus`。
套餐：`DEVIN_PLAN_NAMES` / `DEVIN_TIER_NAMES`（`teams_tier` 16=Pro、17=Max、14/15=Teams、12=Enterprise、19=Free、20=Trial）。

## 协议

DSH `api: openai-completions`。原生 Connect/protobuf 对不上三种闭集，Completions + 翻译层是唯一划算的。

```text
DSH POST /devin/v1/chat/completions
  → applyDevinCache → openaiToDevin
  → POST https://server.codeium.com/exa.api_server_pb.ApiServerService/GetChatMessage
     content-type: application/connect+proto · connect-protocol-version: 1
  → gzip Connect 帧（GetChatMessageResponse）→ OpenAI SSE / JSON
```

`baseURL` 是 `${origin}/devin`，Completions SDK 会打到 `/devin/v1/chat/completions`。`/devin/v1/responses` 固定 501。

非流 Completions：Connect 是流；hop **收集整段再回一条 JSON**。

失败：计时、重试、401 刷新都归 `upstream.ts` 的 `upstreamRequest`（首字节 120s，从路由入口起算）。输出前预算和输出后空闲 Devin 用 **290s**，不是共用的 270s。宿主流空闲看门狗默认 300s，而且只在解析出非空 text / reasoning / tool 块时重置；usage 帧、空 SSE、注释都不算。`swe-2-max` 冷前缀的首 token 会落在 270s 这条线上，共用预算把还能完成的 `GetChatMessage` 掐成 504，宿主再整段重开（内部重试排不进：预算已用完，还要再留 120s 首字节）。290s 仍赶在看门狗前面回可重试的 504。死连接仍是 120s 首字节失败，预算里面还能内部重试。看门狗之外的静默救不了：不向宿主交出可见内容块，就无法把 300s 往后拨。HTTP 非 2xx 与 Connect trailer 错误是上游自己的回答，**只转发一次、代理内不重放**：HTTP 状态原样，trailer `code` 经 `connectCodeStatus`（`deadline_exceeded`→504、`unavailable`→503、`unauthenticated`→401 …，未知码→502 并打日志）。socket 错、超时、空流 / 无消息流，以及没有 Connect end 帧（`0x02`）或残帧就 EOF 的截断，才在输出前重试。第一块内容映射输出之前不写头（role 块随首块内容走，usage / stop 帧不提交头）；之后再失败直接断流，不写 SSE 错误块。chat 401 先走 user_jwt 例外（见下），token-only 仍 401 再经共用的 401 刷新钩子（`tokens.ts` `forcedRefresh` → `refreshNow`）重试一次（session token 不轮换；`refreshDevin` 只在本地 `expiresAt` 过期后才用 `GetUserStatus` 探活，未过期时就是同一 token 再试一次）。

`GetUserJwt` 是 best-effort：返回 `user_jwt` 填进 Metadata field 21、可能给 `custom_api_server_url`（per-deployment 后端）。**session token 本身就够聊天**；失败不挡对话。jwt 约 15 分钟有效，`devinChatAuth` 按 `exp−90s` 复用（每跳一次 RPC ≈2s）；chat 401 时丢掉重试一次 token-only。所有 RPC 带 `Authorization: Basic <token>-<token>`（CLI 的 `api_key-session_id` 形状，session id 即 token 本身，MITM 实测）。

API server 解析顺序：`WINDSURF_API_SERVER_URL` env → session `apiServer`（GetUserJwt 的 `custom_api_server_url`）→ `DEVIN_API_SERVER`。

## 登录

| 方法 | 用户看见 | 怎么登录 |
|---|---|---|
| PKCE | 主按钮 | 打开 `https://app.devin.ai/auth/cli/continue?redirect_uri=&state=&cli_pkce_marker=1&prompt=select_account&code_challenge=&code_challenge_method=S256`，回环 `127.0.0.1:59653/callback`（59653 占不到就 ephemeral）。`POST https://api.devin.ai/auth/cli/token` `{code, code_verifier, cli_pkce_marker:1}` → `{ token }` |
| 本机导入 | 「导入本机 Devin CLI」 | 见下。**不是**第二套 OAuth |
| 粘贴 token | 「粘贴会话 Token」 | `devin-session-token$…`（前缀一次） |

CLI 凭据（只读，零网络决定能不能导）：

- Linux/macOS: `~/.local/share/devin/credentials.toml`（或 `$XDG_DATA_HOME/devin/`）
- Windows: `%LOCALAPPDATA%\devin\credentials.toml` / `%APPDATA%\devin\credentials.toml`
- `devin-credentials.toml`（旧布局）

TOML 字段：`windsurf_api_key`（session token）、`api_server_url`（写进 session.apiServer）、`devin_webapp_host`、`devin_api_url`。token 已带 `devin-session-token$` 前缀，**不要再加一次**（双前缀活测 401）。

session token 无 refresh 端点。`refreshDevin` 到过期边缘时打一次 `GetUserStatus`：活着就把 `expiresAt` 推一年；只有 401 = 永久失效（`OAuthEndpointError.status`，经 `isPermanentRefreshFailure`）→ 重新登录；403 / 5xx 是临时失败。`expiresAt` 优先 JWT `exp` 减 5 分钟，否则一年。

空结果：`devin-import-empty` → zh「未找到 credentials.toml」。

### 卡抬头身份

可见标题只走人类 id，顺序：GetUserStatus `email` → `name` → `devinInfo.accountDisplayName` → token JWT `email`/`preferred_username`。`accountIdOf` 仍用 `userId` / `teamId` / `email` / `account` 当 vault 稳定键。

`isDevinOpaqueAccount` / `publicSession('devin')` **永不**展示 `user-…`、`devin-team$…`、字面 `devin`、JWT `sub`。没有人类 id 就省略标题（`undefined`），不要用 opaque id 顶上去。

## 指纹

指纹来自对真 `devin` 二进制的本机 MITM（`WINDSURF_API_SERVER_URL` 覆盖）+ 生产活测。所有 RPC 的 `Metadata`（field 1）按 **CLI 实际发送** 发。注意 `ide_name` 是 `chisel`、不是 `windsurf` 也不是 `devin`：`devin`/`Devin`/`devin-cli`/`devin_cli` 活测只回 1 条 stub config；`chisel` 和 `windsurf` 都回全量（`chisel` 本次 598 条），`chisel` 是 CLI 真值。

| Metadata 字段 | 值 |
|---|---|
| `api_key` (3) | `devin-session-token$…`（session token，无 Bearer） |
| `ide_name` (1) | `chisel` |
| `ide_version` (7) | `3000.10.31`（CLI 版本，`DEVIN_CLI_VERSION`） |
| `extension_name` (12) | `chisel` |
| `extension_version` (2) | `3000.10.31` |
| `locale` (4) | `en` |
| `os` (5) | `process.platform`（`darwin` 等，实测） |
| `user_jwt` (21) | `GetUserJwt` 回包有才有 |
| `f` (31) | **不发**——实测 732 位 hex 每请求变换（设备指纹/签名），服务端不校验 |
| `supported_model_displays` (30) | 不发（只在 GetCliTeamSettings 上见过） |

HTTP 头：`content-type: application/connect+proto`（chat）/ `application/proto`（unary）、`connect-protocol-version: 1`、chat 加 `connect-content-encoding: gzip` + `connect-accept-encoding: gzip` + `user-agent: connect-go/1.18.1 (go1.26.3)`（CLI 的 Connect-Go UA）、全部加 `authorization: Basic <token>-<token>`。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"devin"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

最近核对：2026-10-05，价目源 [docs.devin.ai/desktop/models.md](https://docs.devin.ai/desktop/models.md) 的 `modelCostData`（PRO 档）重对：`gpt-5-6-sol-*` 全族从 $1.2/$6/$0.12/$1.5 换成标准价 $4/$20/$0.4/$5（priority uid 仍 $8/$40/$0.8/$10）。目录行与 `npm run models` 无变化，价目由 `npm run rates` 写入；上一轮的 1.2/6 是上游促销价，Cursor docs 表同款也是 $4/$20。

上次核对：2026-10-01，生产 `GetCliModelConfigs`（737 个原始 config）：`claude-sonnet-4.5` / `claude-sonnet-4.5-thinking` 两行**整行没了**（不是变无家族——原始载荷里搜不到；同代 `claude-opus-4.5` / `-thinking` 仍在，排除账号/出口过滤），目录与价目随源删两行（80→78）。

更早核对：2026-09-30（第二次），生产 `GetCliModelConfigs`：`gpt-6-1-sol` / `-fast` 仍在（1M 窗、128K 输出、image、low–max → `*-low…-max` / `*-priority` uid）；同日早些时候探到的 `off`（`*-none` uid）档与 `-thinking-fast` 行**当天就被上游撤下**，目录随源收掉（先例：上游几小时内就能增删档位/变体，收行当天的快照不代表稳定态）。

屏蔽（2026-09-30）：Fusion 家族不进目录与 picker。静态楼删行；`toDevinPickerModels` 按家族 uid 挡（活目录与静态快照共用此闸）；devin 适配器 `skip` 规则防 `npm run models` 回灌。裸 uid 直连不经此闸（`devinWireModelId` 仍透传）。

静态 fallback（`DEVIN_MODELS`，离线 / RPC 空）是 `GetCliModelConfigs` 活测结果的完整镜像，与活目录走同一个 `toDevinPickerModels`。登录 / 导入 / 刷新额度后走活发现：

```text
unary GetCliModelConfigs  server.codeium.com  /exa.api_server_pb.ApiServerService/GetCliModelConfigs
  → toDevinPickerModels 按家族 + modifier 收成一行
  → buildProviders / catalog / llm-pi-ai yaml（GetCliModelConfigs 是该账号的
    权威全量目录，活行整表替换静态楼；RPC 失败或空时回落 DEVIN_MODELS）
```

字段来源：窗口 / 输出取家族内各 config 的 `modelInfo.maxTokens` / `maxOutputTokens` 最大值；有一条 `supportsImages` 即 text+image；没有家族的旧 `MODEL_PRIVATE_*` config 不进目录。

上限槽：`maxContextWindow`（模型页自定义输入窗的上限）对 Devin 行生效——`familyMaxContextWindow` 查静态楼，`toDevinPickerModels` 按 row id 把静态楼的上限复制进活行。但 `GetCliModelConfigs` 每个 config 只给一档 `modelInfo.maxTokens`，本家没有第二档窗可挂，所以行上目前不写这个字段。1M 窗在本家是**独立行**（`{family}-1m`，各自有 uid），不是上限。

DSH `reasoningEfforts` 的**值**是后端 uid（不是拼写）：`variants` 把 DSH effort 键映射到后端 `chat_model_uid`，`defaultUid` 取 `is_default_model_in_family`（无 effort 的行显式写死）。hop 里 `devinWireModelId`：picker id + `reasoning_effort` → `variants[effort]` → `defaultUid`；裸 `swe-2-medium` 之类的 uid 原样透传。

modifier 桶：label 里带 `thinking` → 独立 picker 行 `{family}-thinking`；带 `fast` / `priority` / `1m` → 同规则。`-fast` **不**走全局 `applyFastMode`（那会把 model 拼成 `<id>-fast` 再剥，Devin 的 `-fast` 是真后端行）。任何 RPC 失败或空列表不挡对话，回落静态楼。

## 额度

```text
unary GetUserStatus  server.codeium.com  /exa.seat_management_pb.SeatManagementService/GetUserStatus
```

`decodePlanStatus` 把 `dailyQuotaResetAt` / `weeklyQuotaResetAt`（unix 秒）转成 **毫秒**。`hideDailyQuota` / `hideWeeklyQuota` 为 true 时不画那条行。套餐：优先 `planInfo.planName`，否则 `userStatus.teamsTier` 查 `DEVIN_TIER_NAMES`，最后 `planInfo.isDevin` 兜底 `'devin'`。`plan_start`/`plan_end` 是 protobuf Timestamp（unix 秒，proto.ts 里已转毫秒）。

点数桶（Prompt / Flow / Flex Credits）排在日/周条之前：月额度 = `planInfo.monthly*Credits`（field 12/13/14），已用 = `planStatus.used*Credits`（6/5/7），**`available*Credits`（8/9/4）是服务器报的剩余余额**——加购会让它偏离 limit−used。Pro/Max 套餐 `monthly_*_credits` 与 `available_*_credits` 发 `-1`（无限哨兵，int32 十字节 varint，proto.ts 按有符号解）——渲染为「不限量」行；limit=0 且全零的桶不发行，只有余额的桶画预付式「剩余 N」行。`overage_balance_micros`（16，int64 微美元）≠0 时追加一行美元「超额余额」。周期重置用 `plan_end`。字段语义对照 oh-my-pi `usage/devin.ts`（`DevinCreditBucket`）。

## 缓存

| | |
|---|---|
| 后端 | Devin cascade 会话（`cascade_id` field 16）。每次请求 `execution_id`（field 22）是全新 UUID |
| 粘性 id | `devinConversationId`（[`cache.ts`](cache.ts) 唯一推导）：DSH `prompt_cache_key` / `session_id` → `devinCacheSessionId`，缺 pin 时 `dsh-devin:<model>`（`isDevinFallback`）；传输层只对传进来的 id 取 `deterministicDevinId`（UUIDv5 形）。禁止 `Date.now()` |
| 历史 turn id | `chatMessagePrompts[].message_id` 用 `deterministicDevinId(cascade\0index\0role)`，禁止每跳 `randomUUID()` |
| 命中字段 | `ModelUsageStats` 四桶不相交：`input_tokens`（2）只是未命中部分，`cache_read_tokens`（5）/`cache_write_tokens`（4）各自独立，和才是整段 prompt（oh-my-pi `usage/devin.ts` totalTokens）；hop 求和成 OpenAI `prompt_tokens`（= input+read+write），读/写都走 `prompt_tokens_details`（`cached_tokens` / `cache_write_tokens`，宿主只读后者的位置） |

不写 Codex `session-id` / `prompt_cache_key`，不写 Grok `x-grok-conv-id`，不写 `x-request-id`。

不要把 `input_tokens` 直填 `prompt_tokens`：宿主按 OpenAI 语义回推未命中 = `prompt_tokens − cached − write`，独占桶被再减一次，热调用 uncached 全被 `max(0,…)` clamp 成 0（2026-09-30 会话实证：30 天 3863 次有缓存读的调用里 99% input=0）；缓存写也别写顶层 `prompt_cache_write_tokens`——宿主没人读它。

## 不要

- 从 Codex / Grok / GLM / Kiro / Antigravity / Cursor / Ollama / Kimi / Copilot 抄 cache helper
- 把 `devin-session-token$` 再加一次前缀（双前缀活测 401）
- 把 `ide_name` 改成 `devin`/`Devin`/`devin-cli`/`devin_cli` 当默认（活测 1 条 stub config；真 CLI 发 `chisel`，`windsurf` 也通但那是别家指纹）
- 把 Devin `-fast` 当 Codex `service_tier: priority` 或走 `applyFastMode`
- 把 598 条 effort/modifier 变体铺进 Settings 勾选格（收成一行 / 家族+桶）
- 用 Responses 或 Anthropic 当 DSH `api`（`/devin/v1/responses` 固定 501）
- 插件加载时静默扫 credentials.toml 覆盖已有 PKCE
- 把不带 `devin-session-token$` 前缀的存量行当 devin 登录（版本错配可把别家会话写进 devin 槽；`isDevinSessionToken` 才算数，auto-import 不被它挡）
- 打印或提交 token / `user_jwt`
- 用 `api.devin.ai` 当 chat host（那是 OAuth/control-plane；chat 在 `server.codeium.com`）
- 把 `user-…` / `devin-team$…` / JWT `sub` 画在 Settings 卡抬头
- 把 quota reset 当 unix 秒透传（UI 要毫秒；proto.ts 已转，别再乘 1000）

## 归因

一线：**Devin CLI 3000.10.31**（`~/.local/share/devin/credentials.toml` + 二进制内嵌 `exa.*` protos），字段号以本机 MITM 与生产活测为准。协议对照 MIT [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) 的 `pi-catalog` devin provider（`oauth/devin.ts` PKCE 回环 + `providers/devin.ts` Connect/proto + vendored `exa.*` protos）；额度点数桶语义对照同仓 `usage/devin.ts`。

| 抄 | 出处 | 本 hop |
|---|---|---|
| `app.devin.ai/auth/cli/continue?…&cli_pkce_marker=1` → `api.devin.ai/auth/cli/token` `{code, code_verifier, cli_pkce_marker:1}` | oh-my-pi `oauth/devin.ts` | `devinFlow` / `exchangeDevinCode` |
| 模型页价格徽标（USD / 1M） | [docs.devin.ai/desktop/models.md](https://docs.devin.ai/desktop/models.md) `modelCostData`（`TEAMS_TIER_PRO`），按行 `defaultUid` 取；表里没有的 uid 回落厂商标价 | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| Connect framing（1B flags + 4B BE len，`0x01` gzip / `0x02` end-trailer JSON） | oh-my-pi `providers/devin.ts` | `proto.ts` `frameConnect` / `splitConnectFrames` |
| `Metadata` 字段号、`GetChatMessageRequest` 字段号 | CLI 二进制 + 生产活测 | `encodeDevinMetadata` / `openaiToDevin` |
| `Metadata.api_key` = session token（已带 `devin-session-token$`） | CLI `credentials.toml` | `devinMetadataBytes`；`normalizeDevinToken` 前缀只加一次 |
| 指纹：`ide_name: chisel` + `ide_version` / `extension_version` = CLI 版本 + `os` + `Authorization: Basic <token>-<token>` | 本机 MITM | `DEVIN_IDE_NAME` / `devinBasicAuth` / `encodeDevinMetadata` |
| `cascade_id` + 每请求 `execution_id`；历史 `message_id` 内容哈希 | oh-my-pi + 活测 | [`cache.ts`](cache.ts) / `openaiToDevin` |
| `GetCliModelConfigs` → 家族 + effort / modifier 收成一行；静态 floor 是解码结果的镜像，`id` / `name` / `contextWindow` / `maxTokens` / `input` / `variants` / `defaultUid` 不手改 | CLI 二进制 `ClientModelConfig` + 生产活测 | `toDevinPickerModels`（`variants` 值是后端 uid） |
| `GetUserStatus`：`teams_tier`、daily / weekly quota、unix 秒 reset、点数桶 | CLI 二进制 + oh-my-pi `usage/devin.ts` | `fetchDevinQuota` / `parseDevinUserStatus`（proto.ts 已转毫秒） |

**不要发明：** CLI 不发的 `Metadata` 字段（`session_id`、`user_agent`；`f` 的处理见「指纹」表）。其余出自这份对照的禁令都在「不要」与「缓存」两节。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
