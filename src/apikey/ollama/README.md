# Ollama Cloud

本文件是 `src/apikey/ollama/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Ollama **Cloud** 订阅（[ollama.com](https://ollama.com)）。**不是**本机 `127.0.0.1:11434` daemon，也不是 `ollama launch dsh`。那个本地宿主已经在 DSH 里，这个 tab 不包一层 localhost。

> 非正式集成。只用用户自己在 ollama.com 创建的 API key。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 目录、API key session、Bearer 头、`/api/me` 身份、`/api/usage` URL、退役表 |
| [`import.ts`](import.ts) | `OLLAMA_API_KEY` 环境变量。不是 `ollama signin` |
| [`catalog.ts`](catalog.ts) | 登录后 `GET /api/tags` + `POST /api/show`（窗口 + `capabilities` → `input`）；静态 `OLLAMA_MODELS` 只做离线 fallback |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。没有文档化的 sticky id；cache-read 由上游 `usage` 自带 |

调度：[`../../oauth/proxy.ts`](../../oauth/proxy.ts) `family === 'ollama'` 剥 cache 字段，`forward()` 到 `https://ollama.com/v1/chat/completions`。
额度：[`quota.ts`](quota.ts) `fetchOllamaQuota` 并行 `GET /api/usage` + `POST /api/me`。`limits.*.usage` 是 0..1 分数。有 `resets_at` / `reset_at` / `resetAt` / `next_reset` 就用。Session 缺 stamp 时用下一 UTC 5h unix 桶（`18000 - (epoch % 18000)`，[ollama#12532](https://github.com/ollama/ollama/issues/12532)），不是从上次点击起算 5h。Weekly 缺 stamp 时用下一 UTC 7d 桶、偏移 −4d（`604800 - ((epoch - 4d) % 604800)`，周一 00:00 UTC），不编 `now+7d`。
套餐：`me.Plan`（`pro` → Pro），不走 Codex `pro` → Pro 20x。

## 协议

DSH `api: openai-completions`。原生 wire 是 `POST https://ollama.com/api/chat`（与 localhost `/api/chat` 同形），对不上三种闭集。

官方 OpenAI 兼容文档只写了 `localhost:11434/v1`。Cloud 侧：

- [Factory 集成](https://docs.ollama.com/integrations) 写死 `base_url: https://ollama.com/v1/` + `OLLAMA_API_KEY`
- 无 key / 坏 Bearer 打 `POST https://ollama.com/v1/chat/completions` 返回 **401** `{"error":{"message":"Unauthorized"}}`，不是 404

所以 hop 是 **薄透传**，不翻译 `/api/chat` NDJSON。

2026-09-30 活测（deepseek-v4.1-flash，Pro key）：Cloud 现在**三种闭集都接单**——`/v1/chat/completions`、`/v1/responses`、`/v1/messages`（Anthropic 形）。三者的流式事件、工具调用、图像输入、服务端 prefix 缓存读数都成立。仍选 Completions，三个理由：

1. **透传零成本**。body 原样转发，连 `reasoning_effort`（`none|low|medium|high|max`）都是 Ollama 原生值；选 Messages 要凭空加一层 Anthropic → Completions 翻译。
2. **Responses 的状态语义是假的**。Cloud 接受但**忽略** `previous_response_id` 与 `store`（活测 code-word 无记忆、`previous_response_id` 回显 null、`store:true` 回落 false）。DSH 走 Responses 是要无状态 `input` 链，这层能跑通，但换成没有任何收益，而 OpenAI Responses SDK 一旦发 `previous_response_id` 链就会静默丢上下文——把假药当真药更危险。
3. **usage 字段等价**。三者都报 prefix 缓存读数（Completions `prompt_tokens_details.cached_tokens`、Responses `input_tokens_details.cached_tokens`、Messages `cache_read_input_tokens`），换协议拿不到更多缓存信号。

`/ollama/v1/responses` 的 501 文案因此不写「Cloud 没有 Responses」——它有，是我们不用。

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

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"ollama"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

登录 / 导入 / 额度刷新后 `refreshOllamaCatalog`：

```text
GET https://ollama.com/api/tags
POST https://ollama.com/api/show  { "model": "<id>" }
Authorization: Bearer <key>
```

`/api/tags` 给 id（一行一个 `name`），活目录非空即替换静态行；失败或空列表回落静态行，不挡对话。不列本机-only 模型。两个端点无 key 也 200（公共 Cloud 目录），登录后仍带 Bearer，与文档一致。

- `contextWindow` = `/api/show` 的 `model_info.<family>.context_length`。不猜家族默认，也不抄 `cmd/launch/models.go` extraCloudModelLimits：`/api/tags` 的 `details` 是空的，Cloud 又忽略 `options.num_ctx`（[ollama#16598](https://github.com/ollama/ollama/issues/16598)；[docs/context-length](https://docs.ollama.com/context-length)）。见 docs/error.md 2026-09-03 Ollama contextWindow 不能猜家族默认。
- `input` 来自同一份 show：`capabilities` 含 `vision`（大小写不敏感）→ text+image，否则 text。名字 regex（`gemma|vision|vl`）只在 show 没有 `capabilities` 时兜底。不要发明 `audio`。
- 退役 id（`ollamaRetired` 键）来自 Cloud retirements 表，已过期的 upcoming 也算退役；活列表里出现也不进 picker。
- 上限槽：`maxContextWindow`（自定义输入窗上限）对 ollama 行生效；`toOllamaPickerModels` 按 id 把静态楼的上限带进活行（`applyOllamaShowWindows` 用 spread，字段保留）。`/api/show` 只给一个 `context_length`，Cloud 又不吃 `num_ctx`，没有第二档可挂，行上目前不写。

最近核对：2026-09-26，公开 `/api/tags` + `/api/show`。

## 额度

官方 Cloud usage 页（ollama.com Cloud usage）有 Session / Weekly 两条。wire 无公开文档，但 `GET https://ollama.com/api/usage` + Bearer 稳定 200（与 oh-my-pi / pi-ollama-cloud-usage 同形）。

```text
GET  /api/usage   Authorization: Bearer
POST /api/me      Authorization: Bearer  body {}
```

`limits.session.usage` / `limits.weekly.usage` 是 **0..1 分数**，不是 0–100。`0.095` = 已用 9.5% = **剩余 90.5%**。不要把 0.095 当成 0.095%。

`/api/me` 是 PascalCase：`Email` / `Name` / `Plan`。`Plan: "pro"` → 徽章 **Pro**。GET `/api/me` 是 405。

2026-09-03 live `GET /api/usage` 的 `limits.session` / `limits.weekly` 只有 `usage` + `models`，没有 `resets_at`。官方 Cloud UI 仍画 session / weekly 倒计时。定价文案：session 每 5 小时、weekly 每 7 天。社区观察（[ollama#12532](https://github.com/ollama/ollama/issues/12532)）两条都是**全局 unix 桶**：session `18000 - (epoch % 18000)`；weekly `604800 - ((epoch - 4d) % 604800)`（周一 00:00 UTC；2026-08/09 多人对上官方 UI）。

`parseOllamaLimitWindow`：先读 `resets_at` / `reset_at` / `resetAt` / `next_reset`。Session 缺 stamp → `ollamaSessionResetAt`（下一 UTC 5h 边界）。Weekly 缺 stamp → `ollamaWeeklyResetAt`（下一 UTC 7d 边界，偏移 −4d）。不编 `Date.now()+5h` / `+7d`。有 `resetAt` 后 Settings `formatReset` 画「{n}后重置」（一律相对时间），写在该条 `QuotaMeter` 百分比行下方，不夹在两条中间。

**不要**刮 ollama.com/settings HTML。行标签仍是 `t.primary`（5 小时）/ `t.weekly`（每周）。

卡片画两条剩余条（`QuotaMeter` / `RemainingBar`，剩余 N%，减填），不是官方「% used」条。Weekly `note` 每条 `name × count` 一行（`\n` + `.osubs-note` `pre-wrap`），含 `web search` / `web fetch`，不加图表库。

`QuotaStore` 对 ollama 走 `fetchOllamaQuota`，刷新按钮与别的家族一样。localhost:11434 不在这个家族。

## 缓存

无 conversation / shard id。cache-read 是有的：上游 `usage.prompt_tokens_details.cached_tokens` 原样透传（deepseek-v4.1-flash 30 天加权命中 97.5%；glm-5.3-flash 多数请求不回该字段，厂商侧）。

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
- 选 Responses / Anthropic 因为「Cloud 也有这两个端点」——两者都接单但没有任何收益：Responses 的 `previous_response_id` / `store` 被静默忽略（2026-09-30 活测），Anthropic 要加翻译层
- 抄 Codex / Grok / GLM / Kiro / Antigravity / Cursor 的 cache 头或停车形状
- 把 0..1 `usage` 当成已经是百分数
- 从上次点击起算 `now+5h` / `now+7d`（要用 #12532 全局桶）；刮 ollama.com/settings HTML
- 发明 `cached_tokens`
- 用 128k/200k/256k 家族启发式当 DSH `contextWindow`，或把 launch `extraCloudModelLimits` 抄进 picker
- 用名字 regex 当 picker `input` 的主路径（`glm-5.3-flash` 对不上 `gemma|vl`，但 show 有 `vision`）
- 发明 `audio` 模态

## 归因

一线是 Ollama 官方文档，不是 localhost daemon；社区观察只补文档没写的额度重置规则。

| 抄 | 出处 | 本 hop |
|---|---|---|
| Cloud 认证：`Authorization: Bearer $OLLAMA_API_KEY` | [Authentication](https://docs.ollama.com/api/authentication) | `OLLAMA_API_KEY` Bearer |
| 模型页价格徽标（USD / 1M） | models.dev `ollama-cloud` | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| 原生 wire `https://ollama.com/api/chat` + `GET /api/tags`；退役表 | [Cloud](https://docs.ollama.com/cloud) | 目录 + `ollamaRetired` |
| Cloud `/v1` 入口 `https://ollama.com/v1/` + `OLLAMA_API_KEY`（官方 [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility) 页只写 localhost） | [Factory 集成](https://docs.ollama.com/integrations)；本仓库 2026-09-03 探活无 key 回 401 而非 404 | Completions 透传 |
| Cloud 已开 `/v1/responses` + `/v1/messages`，但忽略 `previous_response_id` / `store`；三协议缓存读数等价 | 本仓库 2026-09-30 活测（code-word 记忆、tool round-trip、cache 复测） | 仍 Completions |
| `/api/show` 的 `model_info.<family>.context_length` + `capabilities` | Cloud 实测（例：[`deepseek-v4.1-flash`](https://ollama.com/library/deepseek-v4.1-flash) 2026-09-11 → `deepseek_v41.context_length` 1048576，`capabilities` 含 `vision`） | `contextWindow` / `input` |
| Cloud 忽略 `num_ctx`，窗口只能读 `/api/show` | [ollama#16598](https://github.com/ollama/ollama/issues/16598) | 同上 |
| session = UTC 5h unix 桶；weekly = UTC 7d 桶偏移 −4d（周一 00:00 UTC） | [ollama#12532](https://github.com/ollama/ollama/issues/12532) | `ollamaSessionResetAt` / `ollamaWeeklyResetAt` |

**不要发明：** sticky conversation id（Cloud 没有文档化的会话亲和字段）。其余禁令（`cached_tokens`、`id_ed25519.pub` 当 key、包一层 localhost）在「不要」节。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
