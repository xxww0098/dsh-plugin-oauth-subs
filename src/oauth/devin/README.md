# Devin Agent OAuth

本文件是 `src/oauth/devin/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Devin 订阅（SWE / Claude / GPT / Gemini / Grok / GLM / Kimi 经 Devin infra）。原生 wire 是 **Connect RPC v1 protobuf over HTTP/1.1** 到 `server.codeium.com`（Codeium/Cascade 服务端），不是 OpenAI REST，也不是 api.devin.ai。协议对照 MIT [`can1357/oh-my-pi`](https://github.com/can1357/oh-my-pi) 的 `pi-catalog` devin provider + vendored `exa.*` protos，全部字段号已用**本机 Devin CLI 3000.10.31 凭据对生产活测**：`GetCliModelConfigs` 回 209 条、`GetUserStatus` 回 `teams_tier=16`（Devin Pro）、`GetChatMessage`（`swe-2-medium`）真实流式回 "PONG"。本目录只抽用到的字段，不 vendor 整棵树，不引入 `@connectrpc/*`。

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
额度：[`../quota.ts`](../quota.ts) `fetchDevinQuota` / `parseDevinUserStatus`。
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

session token 无 refresh 端点。`refreshDevin` 到过期边缘时打一次 `GetUserStatus`：活着就把 `expiresAt` 推一年；401/403 = 永久失效（`isDevinPermanentRefreshError`）→ 重新登录。`expiresAt` 优先 JWT `exp` 减 5 分钟，否则一年。

空结果：`devin-import-empty` → zh「未找到 credentials.toml」。

### 卡抬头身份

可见标题只走人类 id，顺序：GetUserStatus `email` → `name` → `devinInfo.accountDisplayName` → token JWT `email`/`preferred_username`。`accountIdOf` 仍用 `userId` / `teamId` / `email` / `account` 当 vault 稳定键。

`isDevinOpaqueAccount` / `publicSession('devin')` **永不**展示 `user-…`、`devin-team$…`、字面 `devin`、JWT `sub`。没有人类 id 就省略标题（`undefined`），不要用 opaque id 顶上去。

## 指纹

指纹来自对真 `devin` 二进制的本机 MITM（`WINDSURF_API_SERVER_URL` 覆盖）+ 生产活测。所有 RPC 的 `Metadata`（field 1）按 **CLI 实际发送** 发。注意 `ide_name` 是 `chisel`、不是 `windsurf` 也不是 `devin`：`devin`/`Devin`/`devin-cli`/`devin_cli` 活测只回 1 条 stub config；`chisel` 和 `windsurf` 都回 209 条全量，`chisel` 是 CLI 真值。

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

静态 fallback（`DEVIN_MODELS`，离线 / RPC 空）对齐活测解码的 46 个家族；`variants` 把 DSH effort 键映射到后端 `chat_model_uid`，`defaultUid` 取 `is_default_model_in_family`。登录 / 导入 / 刷新额度后走活发现：

```text
unary GetCliModelConfigs  server.codeium.com  /exa.api_server_pb.ApiServerService/GetCliModelConfigs
  → toDevinPickerModels 按家族 + modifier 收成一行
  → buildProviders / catalog / llm-pi-ai yaml（GetCliModelConfigs 是该账号的
    权威全量目录，活行整表替换静态楼；RPC 失败或空时回落 DEVIN_MODELS）
```

DSH `reasoningEfforts` 的**值**是后端 uid（不是拼写）。hop 里 `devinWireModelId`：picker id + `reasoning_effort` → `variants[effort]` → `defaultUid`；裸 `swe-2-medium` 之类的 uid 原样透传。

modifier 桶：label 里带 `thinking` → 独立 picker 行 `{family}-thinking`；带 `fast` / `priority` / `1m` → 同规则。`-fast` **不**走全局 `applyFastMode`（那会把 model 拼成 `<id>-fast` 再剥，Devin 的 `-fast` 是真后端行）。任何 RPC 失败或空列表不挡对话，回落静态楼；活目录里新的家族叠在静态楼上，不整表替换。

## 额度

```text
unary GetUserStatus  server.codeium.com  /exa.seat_management_pb.SeatManagementService/GetUserStatus
```

`decodePlanStatus` 把 `dailyQuotaResetAt` / `weeklyQuotaResetAt`（unix 秒）转成 **毫秒**。`hideDailyQuota` / `hideWeeklyQuota` 为 true 时不画那条行。套餐：优先 `planInfo.planName`，否则 `userStatus.teamsTier` 查 `DEVIN_TIER_NAMES`，最后 `planInfo.isDevin` 兜底 `'devin'`。`plan_start`/`plan_end` 是 protobuf Timestamp（unix 秒，proto.ts 里已转毫秒）。

## 缓存

| | |
|---|---|
| 后端 | Devin cascade 会话（`cascade_id` field 16）。每次请求 `execution_id`（field 22）是全新 UUID |
| 粘性 id | DSH `session_id` / `prompt_cache_key` → `devinCacheSessionId` → `deterministicDevinId`（UUIDv5 形）。缺 pin 时 `dsh-devin:<model>`。禁止 `Date.now()` |
| 历史 turn id | `chatMessagePrompts[].message_id` 用 `deterministicDevinId(cascade\0index\0role)`，禁止每跳 `randomUUID()` |
| 命中字段 | `ModelUsageStats.cache_read_tokens`（field 5）→ `prompt_tokens_details.cached_tokens`；`cache_write_tokens` → `prompt_cache_write_tokens` |

不写 Codex `session-id` / `prompt_cache_key`，不写 Grok `x-grok-conv-id`，不写 `x-request-id`。

## 不要

- 从 Codex / Grok / GLM / Kiro / Antigravity / Cursor / Ollama / Kimi / Copilot 抄 cache helper
- 把 `devin-session-token$` 再加一次前缀（双前缀活测 401）
- 把 `ide_name` 改成 `devin`/`Devin`/`devin-cli`/`devin_cli` 当默认（活测 1 条 stub config；真 CLI 发 `chisel`，`windsurf` 也通但那是别家指纹）
- 把 Devin `-fast` 当 Codex `service_tier: priority` 或走 `applyFastMode`
- 把 209 条 effort/modifier 变体铺进 Settings 勾选格（收成一行 / 家族+桶）
- 用 Responses 或 Anthropic 当 DSH `api`（`/devin/v1/responses` 固定 501）
- 插件加载时静默扫 credentials.toml 覆盖已有 PKCE
- 把不带 `devin-session-token$` 前缀的存量行当 devin 登录（版本错配可把别家会话写进 devin 槽；`isDevinSessionToken` 才算数，auto-import 不被它挡）
- 打印或提交 token / `user_jwt`
- 用 `api.devin.ai` 当 chat host（那是 OAuth/control-plane；chat 在 `server.codeium.com`）
- 把 `user-…` / `devin-team$…` / JWT `sub` 画在 Settings 卡抬头
- 把 quota reset 当 unix 秒透传（UI 要毫秒；proto.ts 已转，别再乘 1000）

## 归因

Wire / PKCE / catalog / quota 字段号对照 MIT：

- [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi)（`pi-catalog` devin provider + vendored `exa.*` protos）

`Metadata` 字段号、`GetChatMessageRequest` 字段号、`ClientModelConfig`/`GetUserStatus` 解码对照 Devin CLI 3000.10.31 二进制 + 生产活测。

总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
