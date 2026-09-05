# OpenCode Free

本文件是 `src/oauth/opencode/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** ChatGPT Codex / xAI Grok / OpenCode Zen 付费 / OpenCode Go 订阅。
上游是 OpenCode Zen 中继上的 **匿名免费档**：`https://opencode.ai/zen/v1`（多数模型 Completions；Muse Spark 是 Responses）。
一线对照 [anomalyco/opencode](https://github.com/anomalyco/opencode) **v1.18.29**。无账号时官方 CLI 过滤 `cost.input === 0` 并把 `apiKey` 设成 `"public"`。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | Completions / Responses URL、官方 Free 白名单、`isOpencodeResponsesModel`、匿名 session、`Bearer public` + `opencode/1.18.29` hop 头 |
| [`catalog.ts`](catalog.ts) | `GET /zen/v1/models` ∩ `OPENCODE_OFFICIAL_FREE`；models.dev overlay。静态楼 7 个官方 id |
| [`request.ts`](request.ts) | Completions：`reasoning_effort`。Muse：chat ↔ Zen Responses。禁止同时发 `thinking`。`cache_read_*` → `cached_tokens` |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。`x-opencode-session` / `x-opencode-request`。禁止抄 `session-id` / `x-grok-conv-id` / `x-session-affinity` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'opencode'` → `applyOpencodeCache` + `applyOpencodeThinking` + `opencodeCacheHeaders`。`isOpencodeResponsesModel`（`muse-spark*`）走 `OPENCODE_RESPONSES_URL`；其余走 `OPENCODE_CHAT_URL`。
额度：没有匿名用量 API。卡仍渲染，quota idle / 空条，套餐固定 Free。

## 协议

DSH `api: openai-completions`。不要写第四个 api 字符串。

```text
DSH POST /opencode/v1/chat/completions
  → applyOpencodeCache（剥 prompt_cache_key / session_id / retention）
  → applyOpencodeThinking（目录有 effort 图才写顶层 reasoning_effort；绝不带 thinking）
  → muse-spark*：
       chatToOpencodeResponses（messages → input，max_tokens → max_output_tokens≥16，
         reasoning_effort → reasoning.effort，tools / stream）
       POST https://opencode.ai/zen/v1/responses
       再译回 chat.completion / chat.completion.chunk
  → 其余官方 Free（big-pickle / mimo / ling / nemotron）：
       POST https://opencode.ai/zen/v1/chat/completions
     Authorization: Bearer public
     User-Agent: opencode/1.18.29
     x-opencode-client: cli
     x-opencode-session: DSH pin（缺省 dsh-opencode）
     x-opencode-request: 本跳 UUID
```

`baseURL` 是 `${origin}/opencode`。Completions SDK 打到 `/opencode/v1/chat/completions`。DSH `api` 仍是 `openai-completions`，不要改成 Responses。
`POST /opencode/v1/responses` 只给 Muse 透传到 Zen Responses；非 Muse 回 400。

## 登录

无 OAuth、无 key。**空 roster 自动启用**：plugin start / `snapshot()` / `sync()` 若 `auth.json` 没有 `opencode`，写入 `opencodeSession()`（store 哨兵 `anonymous`）并 `syncHarnessModels`，让 `oauth-opencode` 进 llm-pi-ai。不覆盖已有 session。Settings「启用免费模型」是同一哨兵的幂等写入。

`accessToken` **绝不**当 Bearer 发出。官方无 key 哨兵是 `public`（Zen `raw === "public"` 当成没 key；`GET /models` 也一样）。store 哨兵 `anonymous` 当 Bearer 会走付费 key 路径然后 401。

## 模型

启用后 `refreshOpencodeCatalog`：

```text
GET https://opencode.ai/zen/v1/models
Authorization: Bearer public
User-Agent: opencode/1.18.29
```

只收官方 Free 白名单（`OPENCODE_OFFICIAL_FREE`，7 个 id）且仍出现在 live `/models` 里的行。`big-pickle` 官方免费但不带 `-free`；`deepseek-v4-flash-free` / `laguna-s-2.1-free` 带 `-free` 但已不在官方定价。失败或空列表回落静态楼（同样 7 个）。不要用后缀启发式。

Zen `/models` 只有 `{id,object,created,owned_by}`。能力来自 models.dev provider `opencode`（同一次 refresh 拉一次，跟 Zen 共用 5 分钟 TTL）。**不要**把 Zen 没列出的 slug 加进 picker（hy3-free / kimi-k2.5-free 等）。models.dev 挂了就用楼默认。

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

默认辅助模型：`ling-3.0-flash-fin-free`（官方 Free、Completions、live 200）。

## 缓存

官方 CLI `packages/opencode/src/session/llm/request.ts` 对 `providerID.startsWith("opencode")` 发：

| 头 | 官方 | 本 hop |
|---|---|---|
| `x-opencode-session` | `input.sessionID` | DSH pin（`session_id` / `prompt_cache_key`，缺省 `dsh-opencode`） |
| `x-opencode-request` | `input.user.id` | 本跳 UUID（重试回放） |
| `x-opencode-client` | Flag 默认 `cli` | `cli` |
| `User-Agent` | `opencode/${InstallationVersion}` | `opencode/1.18.29` |
| `x-opencode-project` | 有 `Instance.project.id` 才发 | **不发** |
| `x-parent-session-id` | 子代理 | **不发** |

Zen `handler.ts`：`stickyId = sessionId || workspaceID || ip`。空 session 按 IP 混会话，prompt cache 对不齐。Go 文档要求带 `x-opencode-session` 才能优化缓存。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `opencodeCacheSessionId` | 清洗 DSH id（1–64，`[A-Za-z0-9._:-]`） |
| 2 | `applyOpencodeCache` | 剥 Codex/Grok 字段。pin **不**写进 body |
| 3 | `opencodeCacheHeaders` | `x-opencode-session` + `x-opencode-request`。不写 `session-id` / `x-grok-conv-id` / `x-session-affinity` |

命中：Zen 若回 `cache_read_input_tokens` / `cached_tokens` / `prompt_tokens_details.cached_tokens`，`mapOpencodeUsage` 译成 OpenAI `prompt_tokens_details.cached_tokens`。没有字段不发明 0。不要 `Date.now()`。

## 不要

- 不要把 store 哨兵 `anonymous`、空串或过期 Zen key 当 Bearer（只有官方 `public` 是无 key 哨兵）。
- 不要把启用藏在 Settings 点击后面；空 roster 必须自动写哨兵并 sync。
- 不要在 Completions 行写 `reasoningEfforts: false`。没有 effort 图就省略字段，也不要全家 stamp `compat`。
- 不要同时发 `thinking` 和 `reasoning_effort`。
- 不要把 models.dev 里的 audio/video/pdf 写进 picker `input`。
- 不要把 Zen 没列出的 models.dev slug 加进 picker。
- 不要把 Zen 付费或 Go 订阅模型塞进匿名 picker（`ox-alpha-free` 后缀像免费，但是 Go 订阅）。
- 不要用 `*-free` 后缀决定匿名资格。白名单是官方 7 个 id。
- 不要把过期 `deepseek-v4-flash-free` / `laguna-s-2.1-free` 加回 picker。
- 不要发明 `x-opencode-project` / `x-parent-session-id`（官方有条件才发）。
- 不要把非 opencode 提供商的 `x-session-affinity` / `X-Session-Id` 抄到 Zen。
- 不要把 Codex `session-id` / `prompt_cache_key` / `store: false` / `include` 抄到 Zen Responses。
- 不要把 OpenRouter 的 `http-referer` / `x-title` 发到 Zen（官方 CLI 不发）。
- 不要把 `api` 写成 Responses / Anthropic / 自定义字符串。DSH 仍是 Completions；Muse 只在 hop 里译成 Zen `/v1/responses`。
- 不要把官方 Free（含 MiMo / Big Pickle）藏起来或把非 Muse 改打 Responses。
- 不要 npm `@lobehub/icons`。

## 归因

一线：[anomalyco/opencode](https://github.com/anomalyco/opencode) **v1.18.29**（`provider.ts` `apiKey: "public"`；`session/llm/request.ts` 头；`console/.../zen/util/handler.ts` `stickyId` / `public`）。Zen 定价：[opencode.ai/docs/zen](https://opencode.ai/docs/zen)。社区逆向旁路：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) `plugins/model-providers/opencode-free`（不要发无法识别的 Bearer）。能力 overlay：[anomalyco/models.dev](https://github.com/anomalyco/models.dev)（原 sst/models.dev）`GET https://models.dev/api.json`。总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

## 追溯

| 问题 | 记录 |
|---|---|
| 不发 `x-opencode-session`，缓存按 IP 混 | [`docs/error.md`](../../../docs/error.md) 2026-09-05 OpenCode Free session 头 |
| 带非 `public` Bearer 打免费档 401 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free Bearer |
| 硬编码目录 delist 后仍 401 | 同条：live `GET /models` |
| 空 roster 要先点启用才能聊 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free 自动启用 |
| picker 全是 text / 无 effort | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free models.dev |
| Muse Spark completions 500 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Muse Spark 500 |
| 目录漏 Big Pickle、含过期 DeepSeek/Laguna | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free 官方白名单 |

测试：`test/opencode.test.ts`、`test/cache-families.test.ts`。
