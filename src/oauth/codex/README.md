# Codex OAuth

本文件是 `src/oauth/codex/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** `api.openai.com` 付费 key。走的是 ChatGPT 订阅后端 `chatgpt.com/backend-api/codex`。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 客户端 id、端点、目录、PKCE authorize、换票、刷新、上游头 |
| [`request.ts`](request.ts) | Responses 体：把 `input` 里的 system/developer 抬到 `instructions`，后缀停放，剥 gpt-5.6 拒收字段 |
| [`cache.ts`](cache.ts) | `prompt_cache_key` + `session-id` / `thread-id` / `x-client-request-id`。禁止给别的家族用 |

调度：[`../proxy.ts`](../proxy.ts) `family === 'codex'` → `normalizeCodexResponsesBody` + `applyCodexCache` + `codexCacheHeaders`。
额度：[`../quota.ts`](../quota.ts) `fetchCodexQuota` / `parseCodexUsage` / `consumeCodexReset`。
套餐显示：[`../plan.ts`](../plan.ts) `CODEX_PLAN_NAMES`（`pro` → **Pro 20x**，`prolite` → **Pro 5x**）。

## 登录

指纹对齐 Codex CLI（`openai/codex`）：

| 项 | 值 |
|---|---|
| `client_id` | `app_EMoamEEZ73f0CkXaXp7hrann` |
| authorize | `https://auth.openai.com/oauth/authorize` |
| token | `https://auth.openai.com/oauth/token` |
| originator / UA | `codex_cli_rs` / `codex_cli_rs/0.153.4` |
| loopback | `localhost:1455`，失败再 `1457`；path `/auth/callback` |
| 换票 | `application/x-www-form-urlencoded` + PKCE |
| 刷新 | JSON `{ client_id, grant_type, refresh_token }` |

入口：`codexFlow.buildAuthorizeUrl` → `exchangeCodexCode` → `codexSession`。
`chatgpt_account_id` 必须从 id_token `https://api.openai.com/auth` 解出，没有就不能用订阅。
永久刷新失败码：`refresh_token_expired` / `reused` / `invalidated` / `invalid_grant`（`isCodexPermanentRefreshError`）。

导入：[`../import-auth.ts`](../import-auth.ts) `importCodexAuth` 读本机 Codex CLI `auth.json`。

## 对话

DSH `api: openai-responses`。ChatGPT 订阅后端就是 Responses，三种闭集里这是原生。不要改 Completions / Anthropic（会凭空加翻译层）。

```text
DSH  →  本机 Responses 代理  →  POST chatgpt.com/backend-api/codex/responses
```

头：`codexUpstreamHeaders`（`Authorization`、`chatgpt-account-id`、`originator`、`openai-beta: responses=experimental`）+ `session-id` / `thread-id` / `x-client-request-id`。同一 DSH 请求重试时回放 `x-codex-turn-state`。
Fast：body `service_tier` 从 `fast` 改成 `priority`，并带 `x-codex-routing-hint`（`codexRoutingHint`，见 openai/codex#37345）。
`store` 必须 `false`。`include` 默认 `reasoning.encrypted_content`。剥掉 `prompt_cache_retention` / `prompt_cache_options` / `safety_identifier` / `max_output_tokens`（gpt-5.6 400，Codex #39397）。

## 模型

`CODEX_MODELS` 是唯一目录源（对照 Codex CLI `models.json` 0.153.4 / 2026-09-04）。
`gpt-6-astra` 排第一（默认 258K input，Fast + 872K `-900k` + `max`）。`gpt-5.3-codex` 不收录：订阅账号 400 “not supported when using Codex with a ChatGPT account”。
思考深度：5.4 / 5.5 / Spark → `low`–`xhigh`（无 `minimal` / `ultra`）；Astra 和 5.6 Sol/Terra/Luna 加 `max`。

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

一线：[openai/codex](https://github.com/openai/codex) tag `rust-v0.153.4`。
`build_session_headers`（`session-id` / `thread-id` / `x-client-request-id`）、`x-codex-turn-state` 回放、`models.json`、[#37345](https://github.com/openai/codex/issues/37345) routing-hint。总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

## 追溯

| 问题 | 记录 |
|---|---|
| DSH `session_id` 送上 chatgpt.com 400 | [`docs/error.md`](../../../docs/error.md) 2026-09-01 session_id |
| Codex Pro 徽章没分 5x / 20x | [`docs/error.md`](../../../docs/error.md) 2026-08-30 Pro 徽章 |
| Fast 只靠 body，回显 default | 同文件 2026-08-30 Grok/Codex Fast |
| 各家缓存被混成 Codex 一套 | 同文件 2026-08-31 缓存混用 |

测试：`test/proxy.test.ts`、`test/cache-families.test.ts`。
