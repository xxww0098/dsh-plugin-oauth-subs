# Ollama Cloud

本文件是 `src/apikey/ollama/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Ollama **Cloud** 订阅（[ollama.com](https://ollama.com)）。**不是**本机 `127.0.0.1:11434` daemon，也不是 `ollama launch dsh`。那个本地宿主已经在 DSH 里，这个 tab 不包一层 localhost。

> 非正式集成。只用用户自己在 ollama.com 创建的 API key。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 目录、API key session、Bearer 头、`/api/me` 身份、`/api/balance` URL、退役表 |
| [`import.ts`](import.ts) | `OLLAMA_API_KEY` 环境变量。不是 `ollama signin` |
| [`catalog.ts`](catalog.ts) | 登录后 `GET /api/tags` + `POST /api/show`（窗口 + `capabilities` → `input`）；静态 `OLLAMA_MODELS` 只做离线 fallback |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。没有文档化的 sticky id；cache-read 由上游 `usage` 自带 |

调度：[`../../oauth/proxy.ts`](../../oauth/proxy.ts) `family === 'ollama'` 剥 cache 字段，`forward()` 到 `https://ollama.com/v1/chat/completions`。
额度：[`quota.ts`](quota.ts) `fetchOllamaQuota` 并行 `GET /api/balance` + `POST /api/me`。2026-10-07 起（[ollama#18829](https://github.com/ollama/ollama/pull/18829)）官方 balance 端点取代了老 `GET /api/usage` 的 `limits.*.usage` 分数（该端点现在是 `?range=24h|7d|30d` 的请求计数历史，没有额度语义，不调）。`included` 是 oneOf 两形状：legacy 计划给 `session` / `weekly` 的 `remaining_percent`（0..100，**剩余**语义，75 = 剩 75%）+ `resets_at`；信用计划给 `balance_usd` / `allowance_usd` / `period{from,until}`。`purchased.balance_usd` > 0 时出一条 `prepaid` 行。`resets_at` 缺失时才回落 #12532 桶算（session 下一 UTC 5h unix 桶、weekly 下一 UTC 7d 桶偏移 −4d），不编 `now+5h` / `now+7d`。
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

最近核对：2026-10-07，公开 `/api/tags` + `/api/show`：新收 `mistral-large-4`（1M 窗 / 16384 输出 / text+image / off–max）；models.dev `ollama-cloud` 桶没有它的价目，不写费率行、不出版本徽标。

上次核对：2026-09-26，公开 `/api/tags` + `/api/show`。

## 额度

2026-10-07 起（[ollama#18829](https://github.com/ollama/ollama/pull/18829)，服务器 `x-build-time` 2026-10-09 已带）官方文档化两个端点，本家额度读 [Balance](https://docs.ollama.com/api/balance)：

```text
GET  /api/balance  Authorization: Bearer   ← 额度条数据源
POST /api/me       Authorization: Bearer body {}   ← 身份（GET 405）
```

`included` 是 **oneOf** 两形状（[openapi.yaml](https://github.com/ollama/ollama) `BalanceResponse`）：

- **legacy 计划**（2026-10-10 实测 Pro 账号仍走这条）：`included.session` / `included.weekly` 各给 `remaining_percent`（0..100，**剩余**语义，75 = 剩 75%，不要当已用）+ `resets_at`（UTC）。出 Session（`t.primary`，`windowMinutes: 300`）+ Weekly（`t.weekly`）两条剩余条，`usedPercent = 100 − remaining_percent`。
- **信用计划**：`included.balance_usd` / `allowance_usd` + `period{from, until}`（按套餐月度重置）。出一条 primary 剩余条，`remainingPercent = balance_usd / allowance_usd × 100`，`used` / `total`（`unit: 'usd'`）画 `formatUsd` 金额，`resetAt = period.until`。

`purchased.balance_usd` 是未过期的已购余额，> 0 时出一条 `prepaid`（`t.prepaid` 预付余额）行，不并进 included 百分比。两形状都有它。

老 wire 的 `limits.*.usage` 0..1 分数随 2026-10-07 改版消失；`GET /api/usage?range=24h|7d|30d` 现在是请求计数 / token / USD 的历史序列（`totals` + `buckets`，按天或小时），**没有**剩余额度语义，也不再有按模型拆分（上游列在 coming soon）。所以额度不调它，也不伪造 weekly 按模型 note。

限频：balance 与 usage 各 **10 req/min/user，跨该用户所有 API key 共享**，429 带 `Retry-After`。`QuotaStore` TTL 60s、每次刷新 balance + me 两发，手动刷新节奏安全；不要加轮询或每 key 并刷。

`parseOllamaBalance`：legacy 行的 `resetAt` 直接用 `resets_at`；stamp 缺失才回落 #12532 全局 unix 桶（session `18000 - (epoch % 18000)`，weekly `604800 - ((epoch - 4d) % 604800)`，周一 00:00 UTC——2026-10-10 实测 `resets_at` 周值正是下周一 00:00 UTC，与桶算互证）。不编 `Date.now()+5h` / `+7d`。有 `resetAt` 后 Settings `formatReset` 画「{n}后重置」（一律相对时间），写在该条 `QuotaMeter` 百分比行下方。

**不要**刮 ollama.com/settings HTML。卡片画剩余条（`QuotaMeter` / `RemainingBar`，剩余 N%，减填），不是官方「% used」条。

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
- 把 `remaining_percent`（剩余语义）当已用；把信用计划的 `balance_usd / allowance_usd` 直接当百分数
- 有 `resets_at` 还自己用 #12532 桶算；stamp 缺失时从上次点击起算 `now+5h` / `now+7d`（要用 #12532 全局桶）；刮 ollama.com/settings HTML
- 把 `/api/usage?range=` 的请求计数历史当额度读，或编造按模型 note（上游 coming soon）
- 发明 `cached_tokens`
- 对 balance 加轮询或每 key 并刷（官方 10 req/min/user 跨 key 共享）
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
| 额度 wire：`GET /api/balance`，`included` oneOf legacy（`session`/`weekly` 的 `remaining_percent` + `resets_at`）与 credits（`balance_usd`/`allowance_usd`/`period`），`purchased.balance_usd` 独立 | 官方 [Balance](https://docs.ollama.com/api/balance)（[ollama#18829](https://github.com/ollama/ollama/pull/18829)）+ 本仓库 2026-10-10 活测（Pro 账号走 legacy 形状，weekly `resets_at` 落下周一 00:00 UTC） | `fetchOllamaQuota` / `parseOllamaBalance` |
| `/api/usage` 改版为请求计数历史（`?range=24h|7d|30d`，`totals` + `buckets`），老 `limits.*.usage` 分数废弃 | 官方 [Cloud usage](https://docs.ollama.com/api/cloud-usage) + 本仓库 2026-10-10 活测（老形状实测消失） | 不调（无额度语义） |
| balance / usage 限频 10 req/min/user 跨 key 共享，429 带 `Retry-After` | 官方两页 Rate limits 节 | 不轮询 |
| `/api/show` 的 `model_info.<family>.context_length` + `capabilities` | Cloud 实测（例：[`deepseek-v4.1-flash`](https://ollama.com/library/deepseek-v4.1-flash) 2026-09-11 → `deepseek_v41.context_length` 1048576，`capabilities` 含 `vision`） | `contextWindow` / `input` |
| Cloud 忽略 `num_ctx`，窗口只能读 `/api/show` | [ollama#16598](https://github.com/ollama/ollama/issues/16598) | 同上 |
| session/weekly 重置 stamp 缺失时的回落 = UTC 5h unix 桶 / UTC 7d 桶偏移 −4d（周一 00:00 UTC） | [ollama#12532](https://github.com/ollama/ollama/issues/12532)（2026-10-10 实测官方 `resets_at` 与桶算互证） | `ollamaSessionResetAt` / `ollamaWeeklyResetAt`（仅缺 stamp 时） |

**不要发明：** sticky conversation id（Cloud 没有文档化的会话亲和字段）。其余禁令（`cached_tokens`、`id_ed25519.pub` 当 key、包一层 localhost）在「不要」节。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
