# Antigravity OAuth

本文件是 `src/oauth/antigravity/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

Google **Antigravity hub**（`Antigravity.app`），Cloud Code `daily-cloudcode-pa`。不要模仿 **Antigravity IDE.app** / prod `cloudcode-pa`（除非 daily 5xx 才回落）。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 公开 Google 客户端、hub 指纹、onboard、loadCodeAssist、套餐、模型目录 |
| [`request.ts`](request.ts) | OpenAI chat ↔ `generateContent` / SSE；用量映射（含缓存 token） |
| [`cache.ts`](cache.ts) | `request.sessionId` + 钉住首段 `systemInstruction`。多余快照变 **trailing user** |

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

```text
DSH chat/completions  →  POST daily-cloudcode-pa.googleapis.com/v1internal:generateContent
                         (stream: streamGenerateContent?alt=sse)
```

`openaiToAntigravity`：

- 需要 `project` + `model`。`userAgent: "antigravity"`，`requestType: "agent"`。
- `system` / `developer` → `systemInstruction.parts`（先经过 pin）。
- tool 结果必须是 **单个** protobuf Struct（`functionResponsePayload`）。数组会 400 `Proto field is not repeating`。
- `request.sessionId` = `antigravitySessionIdOf`。
- SSE 文本是累积的，用 `incrementalSuffix` 切成 OpenAI delta；终帧带 `mapAntigravityUsage`，否则 DSH 显示「用量 0 tok」。

## 模型

`ANTIGRAVITY_MODELS` 对齐 CLIProxyAPI `models.json` 的 `antigravity` 行。llm-pi-ai 只接 text/image，音频/视频行也标 vision。
思考：Gemini `low/medium/high`；Claude `low/high`；GPT-OSS `false`。

## 额度

两段：

1. `loadCodeAssist` → `paidTier` 套餐（`antigravityPlanType`）+ 预付 credits。**不要**用 Code Assist `currentTier`（那是 `STANDARD TIER`）。
2. `fetchAvailableModels` → 按 `ANTIGRAVITY_QUOTA_GROUPS` 分组画条（Claude/GPT、Gemini 3.1 Pro Series、…）。每条带 `quotaInfo.resetTime`，标签精确到 **分钟**（`src/utils/relative-time.ts`）。

卡片套餐：Pro / Ultra / Ultra 5x / 20x / Free / Standard / Legacy。空时不要填 Standard。

## 缓存

Gemini **隐式缓存** 钉的是稳定的 `systemInstruction` + contents 前缀。粘滞 id 是 `request.sessionId`，不是 Codex 头，也不是 `x-grok-conv-id`。

DSH 每步再插 runtime-context system。不处理则 `systemInstruction` 每轮都变，命中 0。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `antigravitySessionIdOf` | DSH `session_id` / `prompt_cache_key`，否则常量 **`dsh-antigravity`** |
| 2 | `pinAntigravitySystemInstruction` | 每个 DSH session 钉住 **第一次** system 文本；增量以 **user** 回合追加（Gemini 没有 GLM 那种 trailing system） |
| 3 | `mapAntigravityUsage` | `cachedContentTokenCount` / `cacheTokensDetails` → OpenAI `prompt_tokens_details.cached_tokens` |

常量 session（`dsh-antigravity`）**不**进 pin map：没有 DSH 会话时不要把所有用户钉成同一段 system。
禁止 `` sessionId: `-${Date.now()}` ``，否则每请求换会话，缓存必 0。

进程内 `SYSTEM_PINS`（cap 64）只服务 Antigravity。测试用 `resetAntigravitySystemPins()`。不要和 GLM 共用 Map。

## 不要

- 不要默认打 IDE prod Cloud Code。
- 不要把 `cachedContentTokenCount` 丢掉（DSH 命中率会显示 0）。
- 不要用 `currentTier` 当套餐 pill。
- 不要把 Antigravity extras 停成 GLM trailing system。
- 不要 fingerprint 成第三方包装（Google 会封）。

## 追溯

| 问题 | 记录 |
|---|---|
| 缓存命中率 0（没映射 cached tokens） | [`docs/error.md`](../../../docs/error.md) 2026-08-31 Antigravity 缓存 0 |
| sessionId 用 Date.now() | 同文件 2026-08-30 GLM 思考链 / Antigravity sessionId |
| 套餐 STANDARD TIER | 同文件 2026-08-31 Antigravity 套餐 |
| 额度条没有刷新时间 / 只到小时 | 同文件 2026-08-31 刷新时间 |
| 用量 0 tok / 首 token 半句 | 同文件 2026-08-31 Antigravity 流式 |
| function_response 列表 400 | 同文件 2026-08-30 INVALID_ARGUMENT |
| 打了 IDE prod 不是 hub daily | 同文件 2026-08-30 Cloud Code |
| 403 VALIDATION_REQUIRED 显示成密钥无效 | 同文件 2026-08-31 VALIDATION_REQUIRED |

测试：`test/antigravity.test.ts`、`test/cache-families.test.ts`、`test/proxy.test.ts`。
