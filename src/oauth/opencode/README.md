# OpenCode Go Free

本文件是 `src/oauth/opencode/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** ChatGPT Codex / xAI Grok / OpenCode Zen 付费 / **OpenCode Zen 匿名免费档**。
上游是 **OpenCode Go**：`https://opencode.ai/zen/go/v1`（多数模型 Completions；GPT-5.6 Luna / Grok 4.x / Muse Spark Contributor 是 Responses）。
官方 Go 是 $10/月订阅，必须贴 [opencode.ai/auth](https://opencode.ai/auth) 的 API key（`OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY`）。匿名打 chat 会 `Missing API key`。

历史把本家族做成了 Hermes `opencode-free`（Zen `/zen/v1` 匿名：`big-pickle` / `ling-3.0-flash-fin-free` / `mimo-v2.5-free` / `muse-spark-*-contributor-free` / `nemotron-*-free`）。那是另一条产品线，**禁止**再进本 picker / hop。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | Go Completions / Responses URL、Zen-free 黑名单、`isOpencodeResponsesModel`、key session、Bearer hop 头 |
| [`catalog.ts`](catalog.ts) | 匿名 `GET /zen/go/v1/models` 去掉 `OPENCODE_ZEN_FREE`；models.dev **`opencode-go`** overlay。静态楼是 live Go 快照 |
| [`import.ts`](import.ts) | `OPENCODE_API_KEY` / `OPENCODE_GO_API_KEY`。空 roster 才自动导入。不写回 CLI |
| [`request.ts`](request.ts) | Completions：`reasoning_effort`。Luna / Grok 4.x / Muse：chat ↔ Go Responses。禁止同时发 `thinking` |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。官方 `x-opencode-session` = DSH pin（缺省 `dsh-opencode`）。不发明 `cached_tokens` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'opencode'` → `applyOpencodeCache` + `applyOpencodeThinking`。`isOpencodeResponsesModel`（`muse-spark*` / `gpt-5.6-luna` / `grok-4.*`）走 `OPENCODE_RESPONSES_URL`；其余走 `OPENCODE_CHAT_URL`。
额度：没有公开用量 API。卡仍渲染，quota idle / 空条，套餐芯片 **Go Free**。

## 协议

DSH `api: openai-completions`。不要写第四个 api 字符串。

```text
DSH POST /opencode/v1/chat/completions
  → applyOpencodeCache（剥 prompt_cache_key / session_id / retention）
  → applyOpencodeThinking（目录有 effort 图才写顶层 reasoning_effort；绝不带 thinking）
  → muse-spark* / gpt-5.6-luna / grok-4.*：
       chatToOpencodeResponses（messages → input，max_tokens → max_output_tokens≥16，
         reasoning_effort → reasoning.effort，tools / stream）
       POST https://opencode.ai/zen/go/v1/responses
       再译回 chat.completion / chat.completion.chunk
  → 其余 Go 模型：
       POST https://opencode.ai/zen/go/v1/chat/completions
     Authorization: Bearer <Go API key>
     x-opencode-session: DSH pin
     User-Agent: dsh-plugin-oauth-subs
     HTTP-Referer + X-Title 标明本插件
```

`baseURL` 是 `${origin}/opencode`。Completions SDK 打到 `/opencode/v1/chat/completions`。DSH `api` 仍是 `openai-completions`，不要改成 Responses。
`POST /opencode/v1/responses` 只给 Luna / Grok 4.x / Muse 透传到 Go Responses；其余回 400。

官方 MiniMax / Qwen Go 行走 Anthropic `/v1/messages`。本 hop 仍是 Completions；live 目录若列出它们也会出现在 picker，打 Completions。不要为此把 DSH `api` 改成 Anthropic。

## 登录

无 OAuth。Settings 对话框粘贴 API key（`useKey` → `opencodeSession({ source: 'paste' })`）。空 roster 可自动导入环境变量 `OPENCODE_GO_API_KEY` 或 `OPENCODE_API_KEY`（`source: 'env'`）。不覆盖已有 session。旧 Zen 匿名哨兵 `anonymous` 在 snapshot / sync 时删掉，不当登录。

`accessToken` **要**当 Bearer 发出。不要假扮 OpenCode CLI 的 User-Agent。不要把哨兵 `anonymous` 当 key。

## 模型

启用后 `refreshOpencodeCatalog`：

```text
GET https://opencode.ai/zen/go/v1/models
（目录匿名，不带 Authorization）
```

只收仍出现在 live Go `/models` 且 **不是** `OPENCODE_ZEN_FREE` 的行。不要用 `*-free` 后缀当资格。`ox-alpha-free` 是 Go 历史上的 $0 行（models.dev `opencode-go`，已 deprecated）；live 没列出就不要加进 picker。失败或空列表回落静态楼（当前 live Go Completions / Responses 快照，不含 Zen free）。

Go `/models` 只有 `{id,object,created,owned_by}`。能力来自 models.dev provider **`opencode-go`**（同一次 refresh 拉一次，跟 Go 共用 5 分钟 TTL）。**不要** overlay Zen provider `opencode`，也不要把 Zen 没（也不该）列出的 slug 加进 picker。models.dev 挂了就用楼默认。

DSH picker：

| models.dev | picker |
|---|---|
| `modalities.input` 含 `image` | `['text','image']` |
| 否则 | `['text']` |
| `reasoning_options` effort `values` | 同名 DSH 键（`off\|minimal\|low\|medium\|high\|xhigh\|max`）。值是 vendor 拼写。有 `none`/`off` 才写 `off` |
| `type: toggle` | `{ off: 'none', high: 'high' }`。hop：`off` → `reasoning_effort: "none"`，`high` → `"high"` |
| `reasoning: true` 且 options 空 | **省略** `reasoningEfforts`（不要 `false`）。模型走 vendor 默认思考 |
| `limit.context` / `limit.output` | `contextWindow` / `maxTokens` |

不要把 `audio` / `video` / `pdf` 写进 `input`。有任意一行 effort 图才 stamp Completions `compat.supportsReasoningEffort` + `thinkingFormat: 'openai'`。不要全家 `false`。

默认辅助模型：`glm-5.3-flash`（Go Completions、live、官方促销档）。

## 缓存

官方 Go 文档要求 `x-opencode-session` 以便优化 prompt cache。`/v1/chat/completions` 没有文档化的 cache-read 字段。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `opencodeCacheSessionId` | 清洗 DSH id（1–64，`[A-Za-z0-9._:-]`） |
| 2 | `applyOpencodeCache` | 剥 Codex/Grok 字段 |
| 3 | `opencodeCacheHeaders` | `x-opencode-session` = pin。不写 `session-id` / `x-grok-conv-id` |

`dsh-opencode` 只在缺 DSH pin 时写入 `x-opencode-session`，**不**写进 upstream body。不要发明 `cached_tokens`。不要 `Date.now()`。

## 不要

- 不要打 `https://opencode.ai/zen/v1`（那是 Zen，含匿名免费档）。
- 不要把 Zen free 行（`big-pickle` / `ling-3.0-flash-fin-free` / `mimo-v2.5-free` / `muse-spark-*-contributor-free` / `nemotron-*-free` 等）加进 picker。
- 不要空 roster 自动写 `anonymous` 哨兵。
- 不要在 hop 上漏 Bearer（Go chat 无 key 是 `Missing API key`）。也不要把哨兵当 Bearer。
- 不要在 Completions 行写 `reasoningEfforts: false`。没有 effort 图就省略字段，也不要全家 stamp `compat`。
- 不要同时发 `thinking` 和 `reasoning_effort`。
- 不要把 models.dev 里的 audio/video/pdf 写进 picker `input`。
- 不要把 models.dev `opencode`（Zen）里多出来的 slug 加进 picker。
- 不要用 `*-free` 后缀决定资格。
- 不要假扮 OpenCode CLI UA。
- 不要把 `api` 写成 Responses / Anthropic / 自定义字符串。DSH 仍是 Completions；Luna / Grok / Muse 只在 hop 里译成 Go `/v1/responses`。
- 不要把 Codex `session-id` / `prompt_cache_key` / `store: false` / `include` 抄到 Go Responses。
- 不要 npm `@lobehub/icons`。

## 归因

一线：[opencode.ai/docs/go](https://opencode.ai/docs/go) + [anomalyco/opencode](https://github.com/anomalyco/opencode)。能力 overlay：[sst/models.dev](https://github.com/sst/models.dev) `opencode-go`。Hermes `opencode-go`（`OPENCODE_GO_API_KEY` → `/zen/go/v1`）对照 keyed hop；**不要**再抄 Hermes `opencode-free`（那是 Zen 匿名）。总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

## 追溯

| 问题 | 记录 |
|---|---|
| 家族误接 Zen 匿名免费档 | [`docs/error.md`](../../../docs/error.md) 2026-09-05 OpenCode Go Free 不是 Zen |
| 带 Bearer 打 Zen 免费档 401 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free Bearer（历史；本 hop 已离开 Zen） |
| 硬编码目录 delist 后仍 401 | 同条：live `GET /models` |
| 空 roster 要先点启用才能聊 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free 自动启用（已废；现为贴 key） |
| picker 全是 text / 无 effort | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free models.dev |
| Muse Spark completions 500 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Muse Spark 500 |
| 目录漏 Big Pickle、含过期 DeepSeek/Laguna | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free 官方白名单（Zen 历史） |

测试：`test/opencode.test.ts`、`test/cache-families.test.ts`。
