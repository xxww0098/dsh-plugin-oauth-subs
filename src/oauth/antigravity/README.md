# Antigravity OAuth

本文件是 `src/oauth/antigravity/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

Google **Antigravity hub**（`Antigravity.app`），Cloud Code `daily-cloudcode-pa`。不要模仿 **Antigravity IDE.app** / prod `cloudcode-pa`（除非 daily 5xx 才回落）。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 公开 Google 客户端、hub 指纹、onboard、loadCodeAssist、套餐、模型目录 |
| [`request.ts`](request.ts) | OpenAI chat ↔ `generateContent` / SSE；用量映射（含缓存 token） |
| [`cache.ts`](cache.ts) | `request.sessionId` + 钉住首段 `systemInstruction` / 等价 tools / `thinkingConfig`。多余快照变 **trailing user** |

调度：[`../proxy.ts`](../proxy.ts) `family === 'antigravity'` 剥 retention，取出 `antigravitySessionIdOf`；真正 pin 在 `openaiToAntigravity`。
额度：[`../quota.ts`](../quota.ts) `fetchAntigravityQuota` / `parseAntigravityModelQuota` / `antigravityPlanType`。
套餐：`ANTIGRAVITY_PLAN_NAMES`（`g1-pro-tier` → **Pro**，不要显示 `STANDARD TIER`）。

## 登录

公开 installed-app 客户端（CLIProxyAPI `constants.go`，不是私钥）：

| 项 | 值 |
|---|---|
| authorize | `https://accounts.google.com/o/oauth2/v2/auth` |
| token | `https://oauth2.googleapis.com/token` |
| loopback | `127.0.0.1:51121` `/oauth-callback` |
| 模仿 | Antigravity.app **2.11.0**（Mac plist `/Applications/Antigravity.app`，忽略 IDE.app 2.5.5） |
| UA | `antigravity/hub/<ver> <os>/<arch>`。chat / loadCodeAssist **只有** User-Agent，不要 `Client-Metadata` / `x-goog-api-client` |
| body metadata | `{ ideType: 'ANTIGRAVITY' }` |
| Cloud Code | daily 优先，prod 仅 5xx / 传输失败（`fetchAntigravityCloudCode`） |

登录后 `onboardUser`（daily-only）拿到 `cloudaicompanionProject`。缺 project 不能 `generateContent`。
`VALIDATION_REQUIRED`（403）不要翻译成 DSH「API 密钥无效」。
导入：`importAntigravityAuth`。

## 对话

DSH `api: openai-completions`。原生是 Cloud Code `generateContent`，三种闭集都对不上，Completions + 翻译层是唯一划算的。不要改 Responses / Anthropic。

```text
DSH chat/completions  →  POST daily-cloudcode-pa.googleapis.com/v1internal:generateContent
                         (stream: streamGenerateContent?alt=sse)
```

`openaiToAntigravity`：

- 需要 `project` + `model`。`userAgent: "antigravity"`，`requestType: "agent"`。
- `system` / `developer` → `systemInstruction`（先经过 pin）。Cloud Code 要 `role: "user"`（Pi `GeminiRole.User`）。不要换成 Pi 的 Antigravity 人设；DSH system 原样钉住。
- 第一条 `contents` 必须是 `role: "user"`。对话以 `model` 开头（助手问候 / leftover）时，前面补 `{ role: "user", parts: [{ text: "Hello" }] }`，否则 Google 400。
- tool 结果必须是 **单个** protobuf Struct（`functionResponsePayload`）。数组会 400 `Proto field is not repeating`。
- **工具 schema 按 runtime 拆，不要把 OpenAI JSON Schema 倒进 protobuf `parameters`。**
  - Gemini：`functionDeclarations.parametersJsonSchema`（`$ref` 展开后剥 `$schema` / `$defs`）。`additionalProperties` / `anyOf` / `format` / `nullable` 进 protobuf `parameters` 会 `Unknown name` 400。
  - Claude（`claude-*`）/ GPT-OSS（`gpt-oss-*`）：只发 allowlist `{type, description, properties, required, items, enum}` 的 legacy `parameters`。递归。`["string","null"]` 收成第一个非 null 标量。enum 必须全是 string，否则丢掉。根 schema 必须是 `type: object`。
- Claude / GPT-OSS 的 `functionCall` / `functionResponse` 带 `id`（`[A-Za-z0-9_-]`，最长 64）。Gemini 3 **不要**发 `functionCall.id`。工具结果用同一个 sanitized id 配对。
- Claude：**永远** `request.toolConfig.functionCallingConfig.mode = VALIDATED`（没有 tools 也发）。Gemini 有 tools 时默认 `AUTO`，DSH `tool_choice` 才映射 `NONE` / `ANY`。不要给 Gemini 3 发会改 thoughtSignature 行为的 toolConfig。
- `generationConfig.maxOutputTokens` 钳到 Cloud Code 线 id 上限（flash 65536，`gemini-3.1-pro` / `gemini-pro-agent` 65535，Claude 64000，GPT-OSS 32768）。超发 400。
- `request.sessionId` = `antigravitySessionIdOf`（有 DSH session 原样；否则 `dsh-antigravity:<model>`）。
- `request.tools` / `generationConfig.thinkingConfig` 按 session 钉住，避免 DSH 抖前缀。不发 `implicitCacheConfig`。
- Gemini 3 / Cloud Code 的 `functionCall` part 必须带回原 `thoughtSignature`（[Google thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)）。官方 wire 是 **part 级** camelCase，也接受 `thought_signature` / 嵌在 `functionCall` 里的入站。`collectAntigravityParts` 把它抄到 OpenAI `tool_calls` 的 `thoughtSignature` / `thought_signature` / `extra_content.google.thought_signature`；`openaiToAntigravity` 写回 part。DSH 若剥掉未知键，进程内按 `sessionId` + tool id / `name+args` 再贴（#72）。一组 Gemini 3 functionCall **查找后仍无签名** → 丢掉这组 unsigned `functionCall`，配对的 tool 结果改成 user `[Observation from …]` 文本（Pi `droppedToolCallIds`）。**不要**编空串或 `skip_thought_signature_validator`。`part.thought` 仍不进可见文本；若签名只在 thought part 上，转给随后第一条无签名的 functionCall。
- Claude 思考：chat 请求加 `anthropic-beta: interleaved-thinking-2025-05-14`。Gemini / GPT-OSS / loadCodeAssist **不加**。chat 头仍是 User-Agent + 这一条 beta；不要抄 Pi 的 `Client-Metadata` / `x-goog-api-client`。
- SSE 文本是累积的，用 `incrementalSuffix` 切成 OpenAI delta；终帧带 `mapAntigravityUsage`，否则 DSH 显示「用量 0 tok」。

## 模型

`ANTIGRAVITY_MODELS` 对齐 CLIProxyAPI `models.json` 的 `antigravity` 行（Cloud Code 线 id，不是 Gemini API 裸 id）。llm-pi-ai 只接 text/image，音频/视频行也标 vision。
思考：Gemini `low/medium/high`；Claude `low/high`；GPT-OSS `false`。

Gemini 3.6 / 3.7 / 3.8 Flash 各一行 picker：`gemini-3.X-flash-high` + `reasoningEfforts` low/medium/high。不要发 Gemini API 的 `gemini-3.8-flash`（无 `-high`）。不要拆 `-low` / `-medium` 成独立行（3.7 也没拆）。3.8 Flash Cyber 不在 Antigravity 选择器，不要加。`ANTIGRAVITY_QUOTA_GROUPS` 仍是冻结 SkillStar 条；3.7 也不在里面，3.8 同样不加。

## 额度

两段：

1. `loadCodeAssist` → `paidTier` 套餐（`antigravityPlanType`）+ 预付 credits。**不要**用 Code Assist `currentTier`（那是 `STANDARD TIER`）。
2. `fetchAvailableModels` → 按 `ANTIGRAVITY_QUOTA_GROUPS` 分组画条（Claude/GPT、Gemini 3.1 Pro Series、…）。每条带 `quotaInfo.resetTime`，标签精确到 **分钟**（`src/utils/relative-time.ts`）。

卡片套餐：Pro / Ultra / Ultra 5x / 20x / Free / Standard / Legacy。空时不要填 Standard。

## 缓存

Gemini **隐式缓存** 钉的是稳定前缀：`systemInstruction` + contents 前缀 + **tools**。粘滞 id 是 `request.sessionId`，不是 Codex 头，也不是 `x-grok-conv-id`。官方 CLI（`agy` 1.1.22 / hub 2.11.0）打同一条 `streamGenerateContent?alt=sse`，**不**调 CreateCachedContent，也 **不**发 `implicitCacheConfig`（那是 DURABLE_CACHE_TRUSTED_USERS）。`--subclient_type hub` 是 language_server 旗标，不要上 HTTP。

DSH 每步再插 runtime-context system，工具 JSON 的 key 顺序也会抖。不处理则前缀每轮都变，Google 连 `cachedContentTokenCount` 都不回。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `antigravitySessionIdOf` | DSH `session_id` / `prompt_cache_key` 原样（官方 `LLM_SESSION_ID` = 一条对话，跨模型共用）。两边都缺时 **`dsh-antigravity:<model>`**（裸 `dsh-antigravity` 只在没有 model 时） |
| 2 | `pinAntigravitySystemInstruction` | 每个 session 钉住 **第一次** system 文本；增量以 **user** 回合追加（Gemini 没有 GLM 那种 trailing system） |
| 3 | `pinAntigravityTools` | 每个 session 钉住 **第一次** tools JSON。后来 DSH 只是 key 顺序 / 声明顺序抖、names+schemas 等价 → 复用首份字节。增删工具才换列表（接受 miss） |
| 4 | `pinAntigravityThinking` | sticky-first：第一次发过 `thinkingLevel` 就一直带同一份；第一次没带就一直不带。不要补 `implicitCacheConfig` |
| 5 | `mapAntigravityUsage` / `cachedTokensOf` | `cachedContentTokenCount` / `cacheTokensDetails` / CLI `cache_read_tokens` / `cacheReadTokens` / `cacheReadInputTokens` → OpenAI `prompt_tokens_details.cached_tokens` |

`requestId` 每 HTTP 调用仍是新的 `agent-<uuid>`，它不是缓存键。不要写 `cachedContent` 资源名。

裸常量（`dsh-antigravity`）**不**进 pin map：没有 model、也没有 DSH 会话时不要把所有用户钉成同一段。`dsh-antigravity:<model>` 会进 pin map，换 picker 不会串到别的模型。
禁止 `` sessionId: `-${Date.now()}` ``，否则每请求换会话，缓存必 0。

进程内 `SESSION_PINS`（cap 64）只服务 Antigravity。测试用 `resetAntigravitySystemPins()`。不要和 GLM 共用 Map。

## 不要

- 不要默认打 IDE prod Cloud Code。
- 不要把 `cachedContentTokenCount` / CLI `cache_read_tokens` 丢掉（DSH 命中率会显示 0）。
- 不要发 `implicitCacheConfig` 或 CreateCachedContent。
- 不要把 `--subclient_type hub` 写进 HTTP。
- 不要编造 `thoughtSignature` / 空串 / `skip_thought_signature_validator`。缺就省略字段。Gemini 3 一组都查不到签名时丢掉 functionCall，不要补假签名。
- 不要把 OpenAI JSON Schema（`additionalProperties` / `anyOf` / `$ref` / `format` / `nullable`）写进 Claude / GPT-OSS 的 protobuf `parameters`。
- 不要给 Gemini 3 发 `functionCall.id`。
- 不要在 chat / loadCodeAssist / fetchAvailableModels 上加 `Client-Metadata` 或 `x-goog-api-client`（onboardUser 已有较长 UA + `x-goog-api-client`）。
- 不要抄 Pi 的 2.8.0 UA / `vscode_cloudshelleditor` / `cachedContents` / `implicitCacheConfig`。fingerprint 仍是 hub 2.11.0 + daily-cloudcode-pa。
- 不要把 picker id 收成裸 `gemini-3.8-flash`。线 id 就是 picker id（`gemini-3.8-flash-high`、`gemini-pro-agent`，…）。
- 不要用 `currentTier` 当套餐 pill。
- 不要把 Antigravity extras 停成 GLM trailing system。
- 不要 fingerprint 成第三方包装（Google 会封）。
- 不要把 `api` 改成 Responses / Anthropic。

## 追溯

| 问题 | 记录 |
|---|---|
| 缓存命中率 0（没映射 cached tokens） | [`docs/error.md`](../../../docs/error.md) 2026-08-31 Antigravity 缓存 0 |
| 0.0.57 长聊 Google 不回 cached_tokens（tools / thinking 前缀抖） | 同文件 2026-08-31 Antigravity 隐式缓存前缀 |
| sessionId 用 Date.now() | 同文件 2026-08-30 GLM 思考链 / Antigravity sessionId |
| 套餐 STANDARD TIER | 同文件 2026-08-31 Antigravity 套餐 |
| 额度条没有刷新时间 / 只到小时 | 同文件 2026-08-31 刷新时间 |
| 用量 0 tok / 首 token 半句 | 同文件 2026-08-31 Antigravity 流式 |
| Claude/GPT JSON Schema → protobuf `parameters` 400 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 Cloud Code custom-tool |
| Gemini 3 首条 contents 必须是 user | 同文件 2026-09-03 first-turn-must-be-user |
| 不要抄 Pi chat Client-Metadata | 同文件 2026-09-03 Client-Metadata |
| functionCall 缺 thought_signature 400 | 同文件 2026-09-01 Antigravity thoughtSignature |
| function_response 列表 400 | 同文件 2026-08-30 INVALID_ARGUMENT |
| 打了 IDE prod 不是 hub daily | 同文件 2026-08-30 Cloud Code |
| 403 VALIDATION_REQUIRED 显示成密钥无效 | 同文件 2026-08-31 VALIDATION_REQUIRED |

测试：`test/antigravity.test.ts`、`test/cache-families.test.ts`、`test/proxy.test.ts`。
