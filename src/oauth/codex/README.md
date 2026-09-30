# Codex OAuth

本文件是 `src/oauth/codex/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** `api.openai.com` 付费 key。走的是 ChatGPT 订阅后端 `chatgpt.com/backend-api/codex`。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 客户端 id、端点、目录、PKCE authorize、换票、刷新、上游头 |
| [`request.ts`](request.ts) | Responses 体：把 `input` 里的 system/developer 抬到 `instructions`，后缀停放，剥 gpt-5.6 拒收字段；`encodeCodexBody` zstd 压缩 |
| [`cache.ts`](cache.ts) | `prompt_cache_key` + `session-id` / `thread-id` / `x-client-request-id`。禁止给别的家族用 |

调度：[`../proxy.ts`](../proxy.ts) `family === 'codex'` → `normalizeCodexResponsesBody` + `applyCodexCache` + `codexCacheHeaders`。
额度：[`quota.ts`](quota.ts) `fetchCodexQuota` / `parseCodexUsage` / `consumeCodexReset`。
套餐显示：[`../plan.ts`](../plan.ts) `CODEX_PLAN_NAMES`（`pro` → **Pro 20x**，`prolite` → **Pro 5x**）。

## 登录

指纹对齐 Codex CLI（`openai/codex`）：

| 项 | 值 |
|---|---|
| `client_id` | `app_EMoamEEZ73f0CkXaXp7hrann` |
| authorize | `https://auth.openai.com/oauth/authorize` |
| token | `https://auth.openai.com/oauth/token` |
| originator / UA | `codex_cli_rs` / `codex_cli_rs/0.159.2` |
| loopback | `localhost:1455`，失败再 `1457`；path `/auth/callback` |
| 换票 | `application/x-www-form-urlencoded` + PKCE |
| 刷新 | JSON `{ client_id, grant_type, refresh_token }` |

入口：`codexFlow.buildAuthorizeUrl` → `exchangeCodexCode` → `codexSession`。
`chatgpt_account_id` 必须从 id_token `https://api.openai.com/auth` 解出，没有就不能用订阅。
永久刷新失败：401，共享码 `invalid_grant` / `invalid_client` / `unauthorized_client`，加本家额外码 `refresh_token_expired` / `reused` / `invalidated`（`CODEX_PERMANENT_REFRESH_CODES`，读 `error` 或 `error.code`）。

导入：[`../import-auth.ts`](../import-auth.ts) `importCodexAuth` 读本机 Codex CLI `auth.json`（其次 `~/.hermes/auth.json`）。

**导入只读**（决定 4）：导入的 session 带 `source: <auth.json 路径>`，PKCE 登录没有。`TokenManager` 的 `codexImported` 钩子临期只重读该文件（过期 > 现在 + 15s 才采用，经版本守卫写回 vault），**从不**拿与 CLI 共享的 refresh token 换票；文件也过期 → `ImportedLoginStale`（403）「… run codex or use browser login」，不删登录；重读到的 `accountId` 与存储行不同（CLI 换了号）同样抛 `ImportedLoginStale`，不采用。过期取 access JWT `exp`：旧的 `last_refresh + 1h` 会把 CLI 约 8 天才轮换一次的活 token 判为临期、每个请求都重读。硬切：本改动前导入的登录没有 `source`，仍按插件自有登录换票，需手动重新导入一次。

轮换证据：来源一 openai/codex `rust-v0.155.1` `codex-rs/login/src/auth/manager.rs`——`RefreshResponse.refresh_token: Option<String>`，`persist_tokens` 有新值即覆盖并 `storage.save`；`refresh_token_reused` 归为 Exhausted ⇒ refresh token 一次性、会轮换。CLI 在 JWT `exp` 前 5 分钟主动刷新（取不到 `exp` 时 `last_refresh` 超 8 天）。来源二（被动观察：插件自有登录在宿主自然刷新前后各记一次 refresh token sha256 前 8 位）：待合入后记录。

## 对话

DSH `api: openai-responses`。ChatGPT 订阅后端就是 Responses，三种闭集里这是原生。不要改 Completions / Anthropic（会凭空加翻译层）。

```text
DSH  →  本机 Responses 代理  →  POST chatgpt.com/backend-api/codex/responses
```

头：`codexUpstreamHeaders`（`Authorization`、`chatgpt-account-id`、`originator`、`openai-beta: responses=experimental`）+ `session-id` / `thread-id` / `x-client-request-id`。同一 DSH 请求重试时回放 `x-codex-turn-state`。
请求体：`encodeCodexBody` 用 zstd 压缩（`content-encoding: zstd`，默认级别，不设大小门槛），每个请求只压一次，重试复用同一份字节；后端解码失败（400 / 415）时不回退明文。
Fast：body `service_tier` 从 `fast` 改成 `priority`，并带 `x-codex-routing-hint`（`codexRoutingHint`，见 openai/codex#37345）。
`store` 必须 `false`。`include` 默认 `reasoning.encrypted_content`。剥掉 `prompt_cache_retention` / `prompt_cache_options` / `safety_identifier` / `max_output_tokens`（gpt-5.6 400，Codex #39397）。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"codex"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

`CODEX_MODELS` 是唯一目录源，对照 Codex CLI `models.json` 与活目录 `GET .../codex/models?client_version=<CODEX_CLIENT_VERSION>`；运行时不替换静态行。**后端按 `client_version` 门控下发**：`gpt-6-sol`/`gpt-6-luna` 要 ≥ 0.155.0，`gpt-6.1-sol` 要 ≥ 0.159.0——钉的版本落后会让新模型从活目录消失（2026-09-30 实测，0.155.1 下 9 行无 6.1，0.159.0 下出现），所以 `CODEX_CLIENT_VERSION` 跟 npm `@openai/codex` latest 走。

- 只收 `visibility: list` 的行；`gpt-reserve` / auto-review 这类 `hide` 行是 CLI 内部用的。
- 活目录按 `client_version` 过滤：新模型只对足够新的版本下发，identity 版本落后就看不到新模型（见 docs/error.md 2026-09-23 Codex 目录轮换）。
- 不收订阅后端 400（"not supported when using Codex with a ChatGPT account"）的模型，`gpt-5.3-codex` 是先例。
- `contextWindow` 取 CLI 的可用输入 258K（`CODEX_CONTEXT_WINDOW`），不是端点的原始 `context_window` 272K。端点的 `max_context_window` 写进行的 `maxContextWindow`，作为自定义窗口上限，不派生变体行。
- `fastTier` = `service_tiers` 里有 `priority`。
- `reasoningEfforts` 取 `supported_reasoning_levels`，但 `minimal` 与 `ultra` 会 400（`ultra` 是 CLI 的多 agent 模式，不是 API effort）；`off` 的 wire 值是 `null`。

最近核对：2026-09-30，活目录 @ `client_version` 0.159.0（+ `gpt-6.1-sol`）；同日钉跟 npm latest 升 0.159.2（探查无新行，纯跟版）。

## 额度

`GET chatgpt.com/backend-api/wham/usage` → `parseCodexUsage`：

- `primary_window` → 条 `primary`（5 小时）
- `secondary_window` → 条 `weekly`

重置卷（仅 Codex）：`GET .../wham/rate-limit-reset-credits`，消费 `POST .../consume`。Grok 没有对等接口。卡片上的「重置」只对 Codex 亮。

## 缓存

后端按 **`instructions` 然后 `input` 的最长稳定前缀** 命中。DSH 每步把运行时快照插到 `input` 最前（developer/system），不处理就会整段 miss。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `liftInstructions` | 前缀 system/developer 抬成顶层 `instructions` |
| 2 | `stabilizeInputPrefix` | 已有 `instructions` 不变；多出来的快照改成 **input 末尾** 的 developer |
| 3 | `applyCodexCache` | `prompt_cache_key` ← DSH `prompt_cache_key` 或 `session_id`（`codexCacheSessionId` 清洗，最长 64）。抄完后从上游 JSON **删掉** `session_id`（chatgpt.com `Unsupported parameter`） |
| 4 | `codexCacheHeaders` | `session-id` = body `prompt_cache_key`；`thread-id` = `x-client-request-id`。DSH 一轮对话就是一条 thread，三值相同。官方 CLI 子代理共享 session、各有 thread |

健康长会话：加权命中 ≥ 80%，**零** affinity miss。压缩 / 计划重建造成的 0 命中不是分片 miss。同一 DSH 请求的重试回放 `x-codex-turn-state`（CLI 同 turn 粘滞）。

**禁止**把这套头抄给 Grok / GLM / Kiro / Antigravity。Grok 忽略 Codex `session-id`。

## 不要

- 不要用 `Date.now()` 当 `session-id`。
- 不要发明 `x-codex-installation-id` / `x-codex-turn-metadata` / `parent-thread-id`（官方 CLI 有，本 hop 不发）。
- 不要把 DSH `session_id` 送上 chatgpt.com（抄到 `prompt_cache_key` 和亲和头之后删掉）。
- 不要把 `prompt_cache_retention` 送上去。
- 不要把 Fast 只写 body 不写 `x-codex-routing-hint`（回显会一直是 default）。
- 不要把 `api` 改成 Completions / Anthropic。

## 归因

一线：[openai/codex](https://github.com/openai/codex) tag `rust-v0.159.0`（升钉核对时 npm latest 0.159.0；缓存头源码蒸馏自 0.153.4）。

| 抄 | 出处 | 本 hop |
|---|---|---|
| `session-id` + `thread-id` + `x-client-request-id`（三者同值） | `codex-rs/codex-api/src/requests/headers.rs` `build_session_headers` | `codexCacheHeaders`：三值都等于 DSH pin（一轮对话一条 thread） |
| 模型页价格徽标（USD / 1M） | models.dev `openai`；`-fast` 孪生行取 models.dev `vercel` `openai/<id>-fast`（priority 档） | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| 同 turn 重试回放 `x-codex-turn-state` | `codex-rs/core/src/client.rs` | `proxy.ts` 重试路径（仅 `family === 'codex'`） |
| Fast → Priority | [#37345](https://github.com/openai/codex/issues/37345) | body `service_tier: priority` + `x-codex-routing-hint` |
| 请求体 zstd（`content-encoding: zstd`） | 官方客户端同款；宿主自带 openai-codex provider 同样压缩 | `request.ts` `encodeCodexBody` |
| 剥 `max_output_tokens` | [#39397](https://github.com/openai/codex/issues/39397) | `request.ts` |
| `pro` / `prolite` 徽章 | [#29243](https://github.com/openai/codex/issues/29243) | `plan.ts` Pro 20x / Pro 5x |
| 目录 | CLI `models.json` + `GET .../codex/models` | `CODEX_MODELS`（取舍见「模型」） |

**不要发明：** 官方 CLI 发、本 hop 不发的头，以及 DSH `session_id` 的去向，见「不要」。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
