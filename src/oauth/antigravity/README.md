# Antigravity OAuth

本文件是 `src/oauth/antigravity/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Google **Antigravity hub**（`Antigravity.app`），Cloud Code `daily-cloudcode-pa`。不要模仿 **Antigravity IDE.app** / prod `cloudcode-pa`（除非 daily 5xx 才回落）。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 公开 Google 客户端、hub 指纹、onboard、loadCodeAssist、套餐、模型目录 |
| [`request.ts`](request.ts) | OpenAI chat ↔ `generateContent` / SSE；用量映射（含缓存 token） |
| [`transport.ts`](transport.ts) | Cloud Code HTTP 生命周期、验证错误回传、增量 UTF-8 解码与 SSE 输出 |
| [`cache.ts`](cache.ts) | `request.sessionId` + 钉住首段 `systemInstruction` / 等价 tools / `thinkingConfig`。多余快照变 **trailing user** |

调度：[`../proxy.ts`](../proxy.ts) `family === 'antigravity'` 剥 retention，取出 `antigravitySessionIdOf`；真正 pin 在 `openaiToAntigravity`。
额度：[`quota.ts`](quota.ts) `fetchAntigravityQuota` / `parseAntigravityModelQuota` / `antigravityPlanType`。
套餐：`ANTIGRAVITY_PLAN_NAMES`（`g1-pro-tier` → **Pro**，不要显示 `STANDARD TIER`）。

## 登录

公开 installed-app 客户端（CLIProxyAPI `constants.go`，不是私钥）：

| 项 | 值 |
|---|---|
| authorize | `https://accounts.google.com/o/oauth2/v2/auth` |
| token | `https://oauth2.googleapis.com/token` |
| loopback | `127.0.0.1:51121` `/oauth-callback` |
| 模仿 | Antigravity.app hub **2.19.1**（官方更新清单 `latest-arm64-mac.yml`，2026-10-04）。本机 plist 更旧时不采用。忽略 IDE.app |
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
- `generationConfig.maxOutputTokens` 用线 id 钳位表发出。不要把未钳的 DSH `max_tokens` 原样转发。
- `request.sessionId` = `antigravitySessionIdOf`（有 DSH session 原样；否则 `dsh-antigravity:<model>`）。
- `request.tools` / `generationConfig.thinkingConfig` 按 session 钉住，避免 DSH 抖前缀。不发 `implicitCacheConfig`。
- **thinkingConfig：** `claude-*` / `gpt-oss-*` **整段省略**。不要用 `reasoning_effort` 改写 flash `-high` 线 id。`gemini-3.5-flash*`（含 `gemini-3.5-flash-lite`）/ `gemini-3-flash-agent`（legacy，上游 500，不在 catalog）/ `gemini-3.1-pro-*` / `gemini-pro-agent` 用 Pi 的 `thinkingBudget`（id 已带 effort 时也可省略）。其它 Gemini flash 仍可用 sticky `thinkingLevel`。
- 转换后 **合并相邻同 role** 的 `contents`（Cloud Code 否则 400）。多余 system 快照只停在末尾，**不要**插进 model `functionCall` 组和它的 `functionResponse` 之间。
- Gemini 3 / Cloud Code 的 `functionCall` part 必须带回原 `thoughtSignature`（[Google thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)）。官方 wire 是 **part 级** camelCase，也接受 `thought_signature` / 嵌在 `functionCall` 里的入站。`collectAntigravityParts` 把它抄到 OpenAI `tool_calls` 的 `thoughtSignature` / `thought_signature` / `extra_content.google.thought_signature`；`openaiToAntigravity` 写回 part。DSH 若剥掉未知键，进程内按真实 `sessionId` + tool id / `name+args` 再贴（#72）：回退 id 不存签名；每会话 4096 键 LRU（查找也刷新）、最多 64 会话、全局 64 MiB 超出先淘汰最久没用的整个会话。一组 Gemini 3 functionCall **第一条查找后仍无签名** → 丢掉这组 unsigned `functionCall`，配对的 tool 结果改成 user `[Observation from \`name\`:\n…]` 文本。Claude / GPT-OSS **仍发** unsigned `functionCall`。**不要**编空串或 `skip_thought_signature_validator`。`part.thought` 仍不进可见文本；若签名只在 thought part 上，转给随后第一条无签名的 functionCall。
- chat 头 **只有** User-Agent。不要加 `anthropic-beta` / `Client-Metadata` / `x-goog-api-client`。
- `forwardAntigravity` 跑在 `upstreamRequest(...).run` 里（`src/oauth/upstream.ts` 的计时 / 重试 / 失败映射）：第一块映射输出才写响应头。200 体里的 Google RPC 错误（外层 `error` 或 `response.error`）由 `antigravityBodyError` 转成带 `error.code`（否则 RPC `status` 名）状态码的失败——输出前回 JSON，输出后 destroy，**不要**收成 `stop` + `[DONE]`。Cloud Code 流总以带 `finishReason` 的帧结束，没有就是截断。输出前 401 刷新一次再试。不要猜额度谓词：Antigravity 还没有已知的额度耗尽负载，429 原样转发。
- SSE 文本是累积的，用 `incrementalSuffix` 切成 OpenAI delta；终帧带 `mapAntigravityUsage`，否则 DSH 显示「用量 0 tok」。`transport.ts` 跨网络块保持 UTF-8 解码状态，网络分片不能成为字符边界（[故障记录](../../../docs/error.md#2026-09-08antigravity-流式多字节字符损坏)）。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"antigravity"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

最近核对：2026-10-04，[router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) `main` 的 `antigravity` 数组，并用本机 `fetchAvailableModels` 对过线 id。注册表新增 `claude-opus-5-5-high` / `claude-sonnet-5-5-high`（1M / 128K / text+image，无 `thinking.levels` → `low`/`high`），已收入目录。同一天活列表（33 个 id）仍只有 4.6、没有 5.5；4.6 继续留着，不因注册表缺行而删。价目是 models.dev `anthropic` 的 `claude-opus-5-5` / `claude-sonnet-5-5`（线 id 去掉 `-high`）。

上次核对：2026-09-23，同一份注册表。

- 来源：CLIProxyAPI registry 的 `antigravity` 数组。id 是 Cloud Code 线 id，不是 Gemini API 裸 id；线 id 就是 picker id。
- 字段映射：`display_name` → `name`（去掉档位括号，例：`Gemini 3.1 Pro (High)` → Gemini 3.1 Pro）；`context_length` → `contextWindow`；`max_completion_tokens` → `maxTokens`；`supportedInputModalities` 只取 `text` / `image`。
- 思考：registry 有 `thinking.levels` 的 Gemini 行统一折成 `low` / `medium` / `high` 三档（`minimal` 折进去，不拆独立行）；Claude 行只有 `low` / `high`；没有 `thinking` 的行（GPT-OSS）为 `false`。
- 每个 Gemini Flash 版本只收一行 `-high` 线 id，effort 走 `reasoningEfforts`；不要把 `-low` / `-medium` 拆成独立行，也不要发 Gemini API 的裸 id（无 `-high`）。
- 不收：registry 已删、上游 Cloud Code 回 500 UNKNOWN 的 id（上游 `35e3d97dac`，本机 hub 日志也从未出现）；Antigravity 选择器里没有的变体（例：3.8 Flash Cyber）。`request.ts` 钳位表 / `usesThinkingBudgetWire` 里的历史 id 只给旧请求兜底，不进 picker。
- `ANTIGRAVITY_QUOTA_GROUPS` 是冻结的 SkillStar 分组，新增的 Flash 版本不往里加。

## 额度

两段：

1. `loadCodeAssist` → `paidTier` 套餐（`antigravityPlanType`）+ 预付 credits。**不要**用 Code Assist `currentTier`（那是 `STANDARD TIER`）。
2. `fetchAvailableModels` → 按 `ANTIGRAVITY_QUOTA_GROUPS` 分组画条（Claude/GPT、Gemini 3.1 Pro Series、…）。每组的条序固定 **5 小时（`primary`）在上、每周（`weekly`）在下**。每条带 `quotaInfo.resetTime`，标签精确到 **分钟**（Settings UI 内联副本 `src/ui/parts/format.ts`）。

卡片套餐：Pro / Ultra / Ultra 5x / 20x / Free / Standard / Legacy。空时不要填 Standard。

## 缓存

Gemini **隐式缓存** 钉的是稳定前缀：`systemInstruction` + contents 前缀 + **tools**。粘滞 id 是 `request.sessionId`，不是 Codex 头，也不是 `x-grok-conv-id`。官方 CLI（`agy` 1.2.16 / hub 2.19.1）打同一条 `streamGenerateContent?alt=sse`，**不**调 CreateCachedContent，也 **不**发 `implicitCacheConfig`（那是 DURABLE_CACHE_TRUSTED_USERS）。`--subclient_type hub` 是 language_server 旗标，不要上 HTTP。

DSH 每步再插 runtime-context system，工具 JSON 的 key 顺序也会抖。不处理则前缀每轮都变，Google 连 `cachedContentTokenCount` 都不回。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `antigravitySessionIdOf` | DSH `session_id` / `prompt_cache_key` 原样（官方 `LLM_SESSION_ID` = 一条对话，跨模型共用）。两边都缺时 **`dsh-antigravity:<model>`**（裸 `dsh-antigravity` 只在没有 model 时） |
| 2 | `pinAntigravitySystemInstruction` | 每个 session 钉住 **第一次** system 文本；增量以 **user** 回合追加（Gemini 没有 GLM 那种 trailing system） |
| 3 | `pinAntigravityTools` | 每个 session 钉住 **第一次** tools JSON。后来 DSH 只是 key 顺序 / 声明顺序抖、names+schemas 等价 → 复用首份字节。增删工具才换列表（接受 miss） |
| 4 | `pinAntigravityThinking` | sticky-first：后续请求没带 `reasoning_effort` 时沿用首份（带或不带）；显式换了 `reasoning_effort` 就是用户改了推理强度，新值替换 pin。不要补 `implicitCacheConfig` |
| 5 | `mapAntigravityUsage` / `cachedTokensOf` | `cachedContentTokenCount` / `cacheTokensDetails` / CLI `cache_read_tokens` / `cacheReadTokens` / `cacheReadInputTokens` → OpenAI `prompt_tokens_details.cached_tokens` |

`requestId` 每 HTTP 调用仍是新的 `agent-<uuid>`，它不是缓存键。不要写 `cachedContent` 资源名。

回退 id（裸 `dsh-antigravity` 或 `dsh-antigravity:<model>`，`isAntigravityFallback`）**不**进 pin map：没有 DSH 会话时，system / tools / thinking 都不跨会话钉。
禁止 `` sessionId: `-${Date.now()}` ``，否则每请求换会话，缓存必 0。

进程内 `SESSION_PINS`（cap 64，淘汰最久没有请求的会话）只服务 Antigravity。测试用 `resetAntigravitySystemPins()`。不要和 GLM 共用 Map。

## 不要

- 不要默认打 IDE prod Cloud Code。
- 不要把 `cachedContentTokenCount` / CLI `cache_read_tokens` 丢掉（DSH 命中率会显示 0）。
- 不要发 `implicitCacheConfig` 或 CreateCachedContent。
- 不要把 `--subclient_type hub` 写进 HTTP。
- 不要编造 `thoughtSignature` / 空串 / `skip_thought_signature_validator`。缺就省略字段。Gemini 3 一组都查不到签名时丢掉 functionCall，不要补假签名。
- 不要把 OpenAI JSON Schema（`additionalProperties` / `anyOf` / `$ref` / `format` / `nullable`）写进 Claude / GPT-OSS 的 protobuf `parameters`。
- 不要给 Gemini 3 发 `functionCall.id`。
- 不要在 chat / loadCodeAssist / fetchAvailableModels 上加 `Client-Metadata`、`x-goog-api-client` 或 `anthropic-beta`（onboardUser 已有较长 UA + `x-goog-api-client`）。
- 不要抄 Pi 的 2.8.0 UA / `vscode_cloudshelleditor` / `cachedContents` / `implicitCacheConfig`。fingerprint 仍是 hub 2.19.1 + daily-cloudcode-pa。
- 不要把 picker id 收成裸 `gemini-3.8-flash`。线 id 就是 picker id（`gemini-3.8-flash-high`、`gemini-pro-agent`，…）。
- 不要用 `currentTier` 当套餐 pill。
- 不要把 Antigravity extras 停成 GLM trailing system。
- 不要 fingerprint 成第三方包装（Google 会封）。
- 不要把 `api` 改成 Responses / Anthropic。

## 归因

一线：官方 **Antigravity.app hub 2.19.1**（`--subclient_type hub`，`--override_ide_version`，daily-cloudcode-pa；2026-10-04 更新清单，启动参数与 2.12.2 相同）。社区对照：[router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)、[Rahularya01/pi-antigravity](https://github.com/Rahularya01/pi-antigravity)；thought 签名语义：[Google thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)。

| 抄 | 出处 | 本 hop |
|---|---|---|
| hub 指纹、daily-cloudcode-pa 端点 | 官方 Antigravity.app hub 2.19.1（更新清单 `latest-arm64-mac.yml`） | `ANTIGRAVITY_FALLBACK_VERSION` / `antigravityChatHeaders` |
| 模型页价格徽标（USD / 1M） | models.dev `google` / `anthropic`；`gemini-pro-agent`、`-low`、`gemini-3-flash`、`gpt-oss-120b-medium` 的映射写在 `scripts/rates.ts` | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| 公开 installed-app 客户端、短 UA、onboard UA | CLIProxyAPI `constants.go` | `ANTIGRAVITY_CLIENT_ID` / `antigravityOnboardUserHeaders` |
| 模型行 | CLIProxyAPI `internal/registry/models/models.json` 的 `antigravity` 行 | 目录 `antigravity` 键（见「模型」） |
| `maxOutputTokens` 钳位 | pi-antigravity `getMaxOutputTokens` | `antigravityMaxOutputTokens` |
| functionCall 组的签名回放 | Google thought signatures | `thoughtSignatureOf` |

**不要发明：** 与上游对照相关的每一条都已在上面「不要」节，这里不重复。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
