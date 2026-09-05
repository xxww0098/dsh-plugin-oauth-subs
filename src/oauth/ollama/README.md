# Ollama Cloud

本文件是 `src/oauth/ollama/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Ollama **Cloud** 订阅（[ollama.com](https://ollama.com)）。**不是**本机 `127.0.0.1:11434` daemon，也不是 `ollama launch dsh`。那个本地宿主已经在 DSH 里，这个 tab 不包一层 localhost。

> 非正式集成。只用用户自己在 ollama.com 创建的 API key。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 目录、API key session、Bearer 头、`/api/me` 身份、`/api/usage` URL、退役表 |
| [`import.ts`](import.ts) | `OLLAMA_API_KEY` 环境变量。不是 `ollama signin` |
| [`catalog.ts`](catalog.ts) | 登录后 `GET /api/tags` + `POST /api/show`（窗口 + `capabilities` → `input`）；静态 `OLLAMA_MODELS` 只做离线 fallback |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。没有文档化的 sticky id / cache-read |

调度：[`../proxy.ts`](../proxy.ts) `family === 'ollama'` 剥 cache 字段，`forward()` 到 `https://ollama.com/v1/chat/completions`。
额度：[`../quota.ts`](../quota.ts) `fetchOllamaQuota` 并行 `GET /api/usage` + `POST /api/me`。`limits.*.usage` 是 0..1 分数。有 `resets_at` / `reset_at` / `resetAt` / `next_reset` 就用。Session 缺 stamp 时用下一 UTC 5h unix 桶（`18000 - (epoch % 18000)`，[ollama#12532](https://github.com/ollama/ollama/issues/12532)），不是从上次点击起算 5h。Weekly 只信 wire stamp，不编 `now+7d`。
套餐：`me.Plan`（`pro` → Pro），不走 Codex `pro` → Pro 20x。

## 协议

DSH `api: openai-completions`。原生 wire 是 `POST https://ollama.com/api/chat`（与 localhost `/api/chat` 同形），对不上三种闭集。

官方 OpenAI 兼容文档只写了 `localhost:11434/v1`。Cloud 侧：

- [Factory 集成](https://docs.ollama.com/integrations) 写死 `base_url: https://ollama.com/v1/` + `OLLAMA_API_KEY`
- 无 key / 坏 Bearer 打 `POST https://ollama.com/v1/chat/completions` 返回 **401** `{"error":{"message":"Unauthorized"}}`，不是 404

所以 hop 是 **薄透传**，不翻译 `/api/chat` NDJSON，也不选 Responses（本地 Ollama 虽有 `/v1/responses`，那不是 Cloud 文档路径）。

```text
DSH POST /ollama/v1/chat/completions
  → applyOllamaCache（剥 prompt_cache_key / session_id / retention）
  → POST https://ollama.com/v1/chat/completions
     Authorization: Bearer <OLLAMA_API_KEY>
```

`baseURL` 是 `${origin}/ollama`，Completions SDK 打到 `/ollama/v1/chat/completions`。不要写成 `/ollama/v1`，也不要指向 `127.0.0.1:11434`。

`reasoningEfforts` 键只有 `off|low|medium|high|max`。值是 Ollama wire：`none|low|medium|high|max`。`none` 是 `off` 的值，不是键。

## 登录

| 方法 | 用户看见 | 怎么登录 |
|---|---|---|
| 粘贴 API key | 「粘贴 API Key」 | `https://ollama.com/settings/keys` 创建，`useKey('ollama')` → `ollamaSession({ source: 'paste' })` |
| `OLLAMA_API_KEY` | 「导入 OLLAMA_API_KEY」 | `importOllamaAuth`。空花名册自动导入一次 |
| `ollama signin` | 无按钮 | **非修复**。本地 daemon SSH 签名，不是 Bearer。见 [`docs/error.md`](../../../docs/error.md) |

官方认证文档（https://docs.ollama.com/api/authentication）：

- 本地 `localhost:11434`：**无认证**
- Cloud 直连 `https://ollama.com/api`：API key，`Authorization: Bearer $OLLAMA_API_KEY`
- `ollama signin`：给本机安装用，daemon 自动给 cloud 请求签名

**不要**打开 ollama.com/connect 假装公开 PKCE。官方 CLI 的 signin 不是本插件能 hop 的 OAuth。

空花名册才自动导入 env。已存 paste / env session **绝不**静默覆盖。导入撞上同一 fingerprint 时 `skipped: true`。

`~/.ollama/id_ed25519.pub` 是 registry 公钥，**禁止**当 Bearer。`parseOllamaApiKey` 见到 `BEGIN PUBLIC KEY` 直接拒。

身份：`POST https://ollama.com/api/me`（GET 405）读 `Email` / `Name` / `Plan`。失败用 `ollama-<sha256 前 8>`，不当账号名打印 key。额度刷新后把 Email（或 Name）写回 session；vault id 仍是 `ollama-<hex>` 时 `replaceAccountId`。

Key 不写 log。

## 模型

登录 / 导入 / 额度刷新后 `refreshOllamaCatalog`：

```text
GET https://ollama.com/api/tags
POST https://ollama.com/api/show  { "model": "<id>" }
Authorization: Bearer <key>
```

`{ models: [{ name, model, … }] }` → picker 一行 / name。`OLLAMA_RETIRED_MODELS` 来自 Cloud retirements 表（含已过期的 2026-07-31 upcoming）。静态 `OLLAMA_MODELS` 是 2026-09-03 Cloud 快照 19 行，登录后仍被 live `/api/tags` 替换；失败或空列表回落这 19 行，不挡对话。不列本机-only 模型。

DSH `contextWindow` 是 Cloud `POST /api/show` 的 `model_info.<family>.context_length`（钉在静态快照上；登录后 live show 覆盖），不是猜的家族默认，也不是 `cmd/launch/models.go` extraCloudModelLimits。`/api/tags` 的 `details` 是空的；Cloud 忽略 `options.num_ctx`（[ollama#16598](https://github.com/ollama/ollama/issues/16598)；[docs/context-length](https://docs.ollama.com/context-length)）。

DSH `input` 也来自同一份 show JSON：`capabilities` 含 `vision`（大小写不敏感）→ `['text','image']`，否则 `['text']`。`/api/tags` 没有 capabilities。名字 regex（`gemma|vision|vl`）只在 show 没有 `capabilities` 时兜底。不要发明 `audio`。2026-09-03 快照：`glm-5.3-flash` / `kimi-k3` / `qwen3.5:397b` / `mistral-large-3:675b` 等 8 行图文；`glm-5.3` / `gpt-oss:*` 等 11 行纯文本。

`/api/tags` 无 key 也 200（公共 Cloud 目录）。登录后仍带 Bearer，和文档一致。

## 额度

官方 Cloud usage 页（ollama.com Cloud usage）有 Session / Weekly 两条。wire 无公开文档，但 `GET https://ollama.com/api/usage` + Bearer 稳定 200（与 oh-my-pi / pi-ollama-cloud-usage 同形）。

```text
GET  /api/usage   Authorization: Bearer
POST /api/me      Authorization: Bearer  body {}
```

`limits.session.usage` / `limits.weekly.usage` 是 **0..1 分数**，不是 0–100。`0.095` = 已用 9.5% = **剩余 90.5%**。不要把 0.095 当成 0.095%。

`/api/me` 是 PascalCase：`Email` / `Name` / `Plan`。`Plan: "pro"` → 徽章 **Pro**。GET `/api/me` 是 405。

2026-09-03 live `GET /api/usage` 的 `limits.session` / `limits.weekly` 只有 `usage` + `models`，没有 `resets_at`。官方 Cloud UI 仍画 session / weekly 倒计时。定价文案：session 每 5 小时、weekly 每 7 天。社区观察（[ollama#12532](https://github.com/ollama/ollama/issues/12532)）session 是**全局 5h unix 桶**（`18000 - (epoch % 18000)`）。

`parseOllamaLimitWindow`：先读 `resets_at` / `reset_at` / `resetAt` / `next_reset`。Session 缺 stamp → `ollamaSessionResetAt`（下一 UTC 5h 边界）。Weekly 缺 stamp **不**编 `Date.now()+7d`（#12532 的 weekly 公式带未证实的 `- 4 days` 偏移）。有 `resetAt` 后 Settings `formatReset` 画「{n}后重置」（一律相对时间），写在该条 `QuotaMeter` 百分比行下方，不夹在两条中间。

**不要**刮 ollama.com/settings HTML。行标签仍是 `t.primary`（5 小时）/ `t.weekly`（每周）。

卡片画两条剩余条（`QuotaMeter` / `RemainingBar`，剩余 N%，减填），不是官方「% used」条。Weekly `note` 每条 `name × count` 一行（`\n` + `.osubs-note` `pre-wrap`），含 `web search` / `web fetch`，不加图表库。

`QuotaStore` 对 ollama 走 `fetchOllamaQuota`，刷新按钮与别的家族一样。localhost:11434 不在这个家族。

## 缓存

无文档化 cache-read，也无 conversation / shard id。

- `applyOllamaCache` 剥 `prompt_cache_key` / `prompt_cache_retention` / `prompt_cache_options` / `session_id`
- `ollamaCacheHeaders()` 空。不写 Codex `session-id` / `x-client-request-id`，不写 Grok `x-grok-conv-id`
- 不发明 `cached_tokens`
- 不 `Date.now()` 当 session id
- `ollamaCacheSessionId` 只给 analyzer 标签；**不**写进 upstream body

DSH 每步前置的 runtime snapshot 因此无法在 Ollama Cloud 上做 prefix pin。这是 vendor 限制，不是漏实现。见 error.md。

## 不要

- 把这个 tab 做成 localhost:11434 包装
- 把 `id_ed25519.pub` 当 API key
- 假装 `ollama signin` 是公开 PKCE
- 选 Responses「因为本地 Ollama 也有 `/v1/responses`」
- 抄 Codex / Grok / GLM / Kiro / Antigravity / Cursor 的 cache 头或停车形状
- 把 0..1 `usage` 当成已经是百分数
- 从上次点击起算 `now+5h`，或编 `now+7d` weekly；刮 ollama.com/settings HTML
- 发明 `cached_tokens`
- 用 128k/200k/256k 家族启发式当 DSH `contextWindow`，或把 launch `extraCloudModelLimits` 抄进 picker
- 用名字 regex 当 picker `input` 的主路径（`glm-5.3-flash` 对不上 `gemma|vl`，但 show 有 `vision`）
- 发明 `audio` 模态

## 归因

- Auth：https://docs.ollama.com/api/authentication
- Cloud：https://docs.ollama.com/cloud（`https://ollama.com/api/chat` + Bearer；`GET /api/tags`；retirements）
- OpenAI compat（localhost only in that page）：https://docs.ollama.com/api/openai-compatibility
- Cloud `/v1`：docs.ollama.com Factory 集成 `https://ollama.com/v1/` + `OLLAMA_API_KEY`；本仓库 2026-09-03 探活 401≠404

总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
