# Cursor OAuth

本文件是 `src/oauth/cursor/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

Cursor 订阅（Composer / Claude / GPT / Grok via Cursor infra）。原生 wire 是 **Connect RPC v1 protobuf over HTTP/2**，不是 OpenAI REST。社区逆向来自 MIT [`Rahularya01/pi-cursor`](https://github.com/Rahularya01/pi-cursor)（`src/auth/oauth.ts`、`docs/protocol.md`、`src/client/h2-session.ts`、`src/stream/request-build.ts`、`proto/agent.proto`）。本目录只抽 Run / GetUsableModels / GetCurrentPeriodUsage 用到的字段，不 vendor 整棵树，也不引入 Bun。

> 非正式集成。Cursor 随时可能改线。只用用户自己有权使用的账号。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 目录、身份、PKCE 参数、poll / refresh、CLI 指纹、session |
| [`catalog.ts`](catalog.ts) | 登录后 GetUsableModels + AvailableModels 活目录；静态 `CURSOR_MODELS` 只做离线 fallback |
| [`pkce-flow.ts`](pkce-flow.ts) | 打开 `loginDeepControl` + poll 直到 tokens |
| [`import.ts`](import.ts) | 本机 CLI Keychain / IDE `state.vscdb` / `CURSOR_ACCESS_TOKEN` |
| [`refresh-guard.ts`](refresh-guard.ts) | 已知坏 refresh 短退避，避免 stale CLI 卡住 snapshot |
| [`request.ts`](request.ts) | OpenAI Completions ↔ `AgentClientMessage` / `AgentServerMessage` |
| [`cache.ts`](cache.ts) | `AgentRunRequest.conversation_id`。禁止 `Date.now()` |
| [`proto.ts`](proto.ts) | 最小 protobuf + Connect framing（Run / GetUsableModels / AvailableModels） |
| [`h2-session.ts`](h2-session.ts) | Node `http2` 进程内会话（unary + streaming） |

调度：[`../proxy.ts`](../proxy.ts) `family === 'cursor'` 剥 Codex retention，取出 `cursorConversationId`；真正组 Run 在 `openaiToCursor`。
额度：[`../quota.ts`](../quota.ts) `fetchCursorQuota` / `parseCursorPeriodUsage`（`api2.cursor.sh` JSON，不是 agentn）。
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

## 登录

| 方法 | 用户看见 | 怎么登录 |
|---|---|---|
| PKCE poll | 主按钮 | 打开 `https://cursor.com/loginDeepControl?challenge=&uuid=&mode=login&redirectTarget=cli`，`GET https://api2.cursor.sh/auth/poll?uuid=&verifier=`。404 = 还在等，退避 1s→10s，最多约 150 次 |
| 本机导入 | 「导入本机 Cursor」 | 见下。**不是**第二套 OAuth |
| 空花名册自动导入 | 无按钮 | roster 为空时尝试一次本机复用。**绝不**覆盖已存 PKCE/session |

刷新：`POST https://api2.cursor.sh/auth/exchange_user_api_key`，`Authorization: Bearer <refresh>`，body `{}`。过期用 JWT `exp` 减 5 分钟。

**不要**在插件加载时静默扫 Keychain / `state.vscdb` 覆盖已有会话。自动导入只在 cursor 花名册为空时走一次。

### 本机导入（用户拥有的 Cursor 登录复用）

顺序：

1. `CURSOR_ACCESS_TOKEN`（不 refresh）
2. 并行读 Keychain 与 vscdb
3. 仍有效的本地 access（先 Keychain 再 vscdb）—— **零网络**
4. 否则 refresh Keychain；失败且 vscdb refresh 不同再 refresh vscdb
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

键：`cursorAuth/accessToken`、`cursorAuth/refreshToken`。缺文件 = 空，不把堆栈抛给 UI。

空结果：zh「本机没有 Cursor CLI 或 IDE 登录」。Keychain 第一次读可能弹系统授权；vscdb 键名可能被 Cursor 改掉——见 `docs/error.md`。

## 指纹

AgentService/Run 与 unary 只发 Cursor **CLI** 头（pi-cursor `h2-session.ts` 默认，钉死文档值，不编更新的版本）：

| 头 | 值 |
|---|---|
| `authorization` | `Bearer <access>` |
| `connect-protocol-version` | `1` |
| `content-type` | 流 `application/connect+proto`；unary `application/proto` |
| `te` | `trailers` |
| `x-ghost-mode` | `true` |
| `x-cursor-client-version` | `cli-2026.05.01-eea359f`（`PI_CURSOR_CLIENT_VERSION` 可覆盖） |
| `x-cursor-client-type` | `cli` |
| `x-request-id` | 每请求 UUID |

不要假装 Cursor 桌面 IDE。`conversationState.client_name` 用 `dsh`。

## 模型

静态 fallback（离线 / RPC 空）：`composer-2`、`composer-1.5`、`claude-sonnet-5`、`gpt-5.5`、`grok-4.5`。登录、本机导入、额度刷新之后走活发现：

```text
unary GetUsableModels  agentn  /agent.v1.AgentService/GetUsableModels
unary AvailableModels  api2    /aiserver.v1.AiService/AvailableModels
  → 按 access-token sha256 前 16 位缓存 5 分钟
  → toCursorPickerModels 收成一行 / 家族；有 `-fast` 源时再加 `{family}-fast`
  → buildProviders / catalog / llm-pi-ai yaml
```

`AvailableModels` 用现有 proto 编解码，不加 Bun。任一 RPC 失败或空列表 **不挡对话**，回落静态 5。

不要把 pi-cursor `catalog.json` 的 ~100 个 effort/fast/thinking/max-mode id 铺进 Settings 勾选格。`cursorPickerFamilyId` 剥那些后缀，DSH `reasoningEfforts` 键只有 `off|low|medium|high|xhigh`（值 `off: "none"`，`xhigh: "extra-high"`）。Tab / chat 内部变体隐藏（Pi `/cursor.models all` 才是 opt-in）。账号有 `default` / Auto 就留一行 `default` / Auto。窗口优先活 metadata，否则 `inferCursorContextWindow` / `inferCursorMaxOutputTokens`。

活目录里某个家族只要有一条源 id 在剥掉 effort / thinking / max-mode 之后仍带 `-fast`（`gpt-5.5-high-fast`、`composer-2-fast`），选择器再加一行 `{family}-fast`，显示名 `{Name} Fast`（zh/en 都不译 Fast）。`default` / Auto 不加 Fast。没有 `-fast` 源的家族不加。静态 5 行 fallback 不编 Fast。不要用 Codex `src/utils/fast-mode.ts` / `service_tier: priority`。

Hop：Completions `model` 以 `-fast` 结尾时，`requestedModel.modelId` 是家族 id（`gpt-5.5`，不是 `gpt-5.5-high-fast`），`modelParameters` 在已有 `{ id: 'reasoning', value }` 之外再加 `{ id: 'fast', value: 'true' }`（pi-cursor `RequestedModel.parameters` 的 Fast 字段，与 reasoning 同一条路）。`maxMode` 仍是 false。对话 pin 跟家族 id，Fast 不是另一段 conversation。

Settings 勾选仍须登录后才能改。新发现的行默认开，`setModels` / `sync()` 写入 `settings.yaml` `oauth-cursor.models`。

## 额度

`POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage`，JSON `{}` + Bearer。host 是 **api2**，不是 agentn，也不要猜第三个 host。

两条 `kind: 'product'`，对齐 Cursor 仪表盘的 **已用** 百分比（不是本周期剩余、也不是 `includedSpend/limit` 美分封顶）：

| `product` | 字段 | zh | en |
|---|---|---|---|
| `auto` | `planUsage.autoPercentUsed` | 补全 & Composer | Tab completion & Composer |
| `api` | `planUsage.apiPercentUsed` | API 调用 | API |

缺字段当 0%（刚重置不是缺条）。`resetAt` 两边都取 `billingCycleEnd`。卡片 caption 和条填充对 Cursor product 行用 **已用**；别的家族仍是剩余。`formatPlanLabel(..., 'cursor')` 的 `pro` 是 Pro，不是 Codex Pro 20x。

## 缓存

| | |
|---|---|
| 后端 | Cursor Agent 会话（`AgentRunRequest.conversation_id`） |
| 粘性 id | DSH `session_id` / `prompt_cache_key` **加上 model**；缺 pin 时 `dsh-cursor:<model>`（裸 `dsh-cursor` 只在没有 model 时）。禁止 `Date.now()` |
| 停额外 snapshot | 第一条 system 钉在 `root_prompt_messages_json`；后续 DSH snapshot 再追加一条 system blob（Cursor 前缀列表，不是 GLM 尾 system，也不是 Gemini 尾 user） |
| 命中字段 | Run 流没有文档化的 cache-read 字段。有则映到 `prompt_tokens_details.cached_tokens`；否则 DSH 命中率可为 0% |

不写 Codex `session-id` / `prompt_cache_key`，不写 Grok `x-grok-conv-id`。

## 不要

- 从 Codex / Grok / GLM / Kiro / Antigravity 抄 cache helper
- 用 Responses 或 Anthropic 当 DSH `api`
- 插件加载时静默收割 IDE / Keychain 覆盖已有 PKCE
- 打印或提交 token
- 加 Bun
- 发明 `requestType` / boost 字段
- 把 pi-cursor `catalog.json` 的 effort/fast/thinking/max-mode 变体铺进勾选格
- 用 `includedSpend` / `limit` 当额度条 used/total
- 恢复 `src/utils/cache-session.ts`
- 扫 WSL / Windows 上别人的 Users 目录

## 归因

Wire / PKCE / Keychain+vscdb 顺序改编自 MIT：

- [Rahularya01/pi-cursor](https://github.com/Rahularya01/pi-cursor)
- [ephraimduncan/opencode-cursor](https://github.com/ephraimduncan/opencode-cursor)
