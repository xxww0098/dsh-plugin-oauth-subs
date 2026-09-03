# OpenCode Free

本文件是 `src/oauth/opencode/` 的设计源。改登录、目录、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

**不是** ChatGPT Codex / xAI Grok / OpenCode Zen 付费 / OpenCode Go 订阅。
上游是 OpenCode Zen 中继上的 **匿名免费档**：`https://opencode.ai/zen/v1`（OpenAI Completions）。
对齐 Nous Hermes `opencode-free`：无账号、无 API key。任何无法识别的 `Authorization` bearer 都会 401。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 中继 URL、匿名 session、**不带** Authorization 的 hop 头 |
| [`catalog.ts`](catalog.ts) | 匿名 `GET /zen/v1/models`，只留可匿名的 `*-free`；静态 `OPENCODE_MODELS` 只做 fallback |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。禁止抄 `session-id` / `x-grok-conv-id`。不发明 `cached_tokens` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'opencode'` → `applyOpencodeCache`，`forward()` 到 `OPENCODE_CHAT_URL`。
额度：没有匿名用量 API。卡仍渲染，quota idle / 空条，套餐固定 Free。

## 协议

DSH `api: openai-completions`。不要写第四个 api 字符串。

```text
DSH POST /opencode/v1/chat/completions
  → applyOpencodeCache（剥 prompt_cache_key / session_id / retention）
  → POST https://opencode.ai/zen/v1/chat/completions
     无 Authorization
     User-Agent: dsh-plugin-oauth-subs
     HTTP-Referer + X-Title 标明本插件
```

`baseURL` 是 `${origin}/opencode`。Completions SDK 打到 `/opencode/v1/chat/completions`。

## 登录

无 OAuth、无 key。Settings 一键「启用免费模型」写入匿名 session（store 里 `accessToken` 是哨兵 `anonymous`，**绝不**当 Bearer 发出）。

不要假扮 OpenCode CLI 的 User-Agent（`big-pickle` 只给官方 CLI 放行，本插件目录不收它）。

## 模型

启用后 `refreshOpencodeCatalog`：

```text
GET https://opencode.ai/zen/v1/models
（匿名，不带 Authorization）
```

只收 `id` 以 `-free` 结尾、且不在 Go 订阅黑名单（`ox-alpha-free`）里的行。失败或空列表回落静态楼（当前 live 快照）。目录会轮换；delist 的模型必须从楼里删掉，否则 picker 会 401。

默认辅助模型：`laguna-s-2.1-free`（Hermes：非 UA 门控里最快的免费档）。

## 缓存

官方 `/v1/chat/completions` 没有文档化的 conversation / shard / cache-read 字段。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `opencodeCacheSessionId` | 清洗 DSH id（1–64，`[A-Za-z0-9._:-]`） |
| 2 | `applyOpencodeCache` | 剥 Codex/Grok 字段 |
| 3 | `opencodeCacheHeaders` | 空。不写 `session-id` / `x-grok-conv-id` |

`dsh-opencode` 只给分析器标签，**不**写进 upstream body。不要发明 `cached_tokens`。不要 `Date.now()`。

## 不要

- 不要发 `Authorization`（空串 / 哨兵 / 过期 Zen key 都会 401）。
- 不要把 Zen 付费或 Go 订阅模型塞进匿名 picker（`ox-alpha-free` 后缀像免费，但是 Go 订阅）。
- 不要假扮 OpenCode CLI UA 去拿 `big-pickle`。
- 不要把 `api` 写成 Responses / Anthropic / 自定义字符串。
- 不要 npm `@lobehub/icons`。

## 追溯

| 问题 | 记录 |
|---|---|
| 带 Bearer 打免费档 401 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 OpenCode Free |
| 硬编码目录 delist 后仍 401 | 同条：live `GET /models` |

测试：`test/opencode.test.ts`、`test/cache-families.test.ts`。
