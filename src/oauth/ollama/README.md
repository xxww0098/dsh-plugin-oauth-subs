# Ollama Cloud

本文件是 `src/oauth/ollama/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

Ollama **Cloud** 订阅（[ollama.com](https://ollama.com)）。**不是**本机 `127.0.0.1:11434` daemon，也不是 `ollama launch dsh`。那个本地宿主已经在 DSH 里，这个 tab 不包一层 localhost。

> 非正式集成。只用用户自己在 ollama.com 创建的 API key。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 目录、API key session、Bearer 头、`/api/me` 身份（尽力）、退役表 |
| [`import.ts`](import.ts) | `OLLAMA_API_KEY` 环境变量。不是 `ollama signin` |
| [`catalog.ts`](catalog.ts) | 登录后 `GET /api/tags` + `POST /api/show`；静态 `OLLAMA_MODELS` 只做离线 fallback |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。没有文档化的 sticky id / cache-read |

调度：[`../proxy.ts`](../proxy.ts) `family === 'ollama'` 剥 cache 字段，`forward()` 到 `https://ollama.com/v1/chat/completions`。
额度：无文档化 quota JSON，卡片 idle。
套餐：无 plan slug，不走 Codex `pro` → Pro 20x。

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

身份：`POST https://ollama.com/api/me` 尽力取 email；失败用 `ollama-<sha256 前 8>`，不当账号名打印 key。

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

`/api/tags` 无 key 也 200（公共 Cloud 目录）。登录后仍带 Bearer，和文档一致。

## 额度

ollama.com **没有**文档化的 usage / quota JSON。`/api/quota` 404；`/api/usage` 无文档。`QuotaStore` 对 ollama 直接 idle。卡片仍渲染，额度块不画。不要发明仪表盘。

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
- 发明额度条或 `cached_tokens`
- 用 128k/200k/256k 家族启发式当 DSH `contextWindow`，或把 launch `extraCloudModelLimits` 抄进 picker

## 归因

- Auth：https://docs.ollama.com/api/authentication
- Cloud：https://docs.ollama.com/cloud（`https://ollama.com/api/chat` + Bearer；`GET /api/tags`；retirements）
- OpenAI compat（localhost only in that page）：https://docs.ollama.com/api/openai-compatibility
- Cloud `/v1`：docs.ollama.com Factory 集成 `https://ollama.com/v1/` + `OLLAMA_API_KEY`；本仓库 2026-09-03 探活 401≠404
