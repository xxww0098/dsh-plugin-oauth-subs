# Kiro OAuth

本文件是 `src/oauth/kiro/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

AWS **Kiro / CodeWhisperer**。协议对齐 [ZyphrZero/kiro.rs](https://github.com/ZyphrZero/kiro.rs) 与 Kiro IDE。对话 **不是** OpenAI Responses，是 `GenerateAssistantResponse` eventstream。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 五种凭据、portal PKCE、刷新、profileArn、用量头、目录 |
| [`idc-flow.ts`](idc-flow.ts) | AWS SSO OIDC register + JSON device poll（Builder ID / 企业 IdC） |
| [`request.ts`](request.ts) | OpenAI chat ↔ `conversationState` + eventstream → `chat.completion` |
| [`cache.ts`](cache.ts) | `conversationState.conversationId`。禁止 `Date.now()` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'kiro'` 剥 Codex retention，取出 `kiroConversationId`；真正组 AWS body 在 `openaiToKiro`。
额度：[`../quota.ts`](../quota.ts) `fetchKiroQuota` / `parseKiroUsage`。
套餐：`KIRO_PLAN_NAMES`（Free / Pro / Pro+ / Powered）。

## 登录（五种凭据）

`KIRO_METHODS`：`social` | `idc` | `external_idp` | `api_key`。Builder ID 在存储里是 `idc` + 官方 Start URL。

| 方法 | 用户看见 | 怎么登录 | 换票注意 |
|---|---|---|---|
| Social / OAuth | Google / GitHub | portal PKCE `app.kiro.dev`，callback 端口 `KIRO_CALLBACK_PORTS` | **authorize 和 token 的 `redirect_uri` 必须字节一致**。Cognito 常是 origin-only（`http://127.0.0.1:PORT`），path 可能是 `/`、`/oauth/callback`、`/signin/callback` |
| Builder ID | 个人 AWS | `idc-flow.ts` + `https://view.awsapps.com/start`，profile `BUILDER_ID_PROFILE_ARN` | |
| Enterprise / IdC | 企业 IAM IC | 同一套 device poll，用户填 org Start URL | `kiroAccountKind` → `idc` |
| Entra / Azure AD | 企业 SSO | `external_idp`，token endpoint 必须是 `*.microsoftonline.com` / `.us` / `.cn` | `refresh_token` grant |
| API Key | `ksk_…` | 直接 bearer，`KIRO_NEVER_EXPIRES` | |

`canonicalizeKiroMethod` 把 `oauth`/`github`/`google` → `social`，`builder-id` → `idc`，`azuread`/`entra` → `external_idp`。
导入：`importKiroAuth` / `sessionFromKiroAuth`。
登录成功后 Settings 必须清掉「打开授权页」（`busy === false`），否则授权条还挂在已登录卡下面。

## 对话

```text
DSH chat/completions  →  POST https://q.<region>.amazonaws.com/
  X-Amz-Target: AmazonCodeWhispererStreamingService.GenerateAssistantResponse
  Content-Type: application/x-amz-json-1.0
  Accept: application/vnd.amazon.eventstream
  x-amzn-kiro-agent-mode: vibe
```

`openaiToKiro`：

- `developer` 以及未知角色 → system 文本，拼进 **current** `userInputMessage.content`（Kiro 没有独立 system 字段）。
- 历史是 `userInputMessage` / `assistantResponseMessage` 成对。
- `conversationId` = `kiroConversationId(payload, conversationId)`，**永远不要** `Date.now()`。
- 上游 401/403 改写成 400（非 AUTH），避免 DSH 把订阅打成「API 密钥无效」。

命中：eventstream 上的 `cacheReadInputTokens`。

## 模型

`KIRO_MODELS` 对齐 [kiro.dev/docs/models](https://kiro.dev/docs/models)（不含 Auto）+ [effort](https://kiro.dev/docs/models/effort)。id 用点号（`claude-sonnet-5`）。

- GPT-5.6 / Claude：输入 `text+image`。OSS（DeepSeek / MiniMax / GLM-5 / Qwen）：`text`。
- 思考：GPT-5.6 `none`–`max`；Opus 5 / 4.8 / 4.7、Sonnet 5 有 `xhigh`；4.6 家族到 `max`；Haiku / OSS 为 `false`。
- 目录必须有 Opus 5、Opus 4.8；Sonnet 主推是 **Claude Sonnet 5**（4.5 仍保留）。

## 额度

`fetchKiroQuota` 打用量 host（`us-east-1` / `eu-central-1`）。`parseKiroUsage` 一条 cycle：`currentUsage` / `usageLimit` + 进行中的 trial / bonus。卡片显示进度条。没有 Codex 重置卷。

## 缓存

AWS 按 **CodeWhisperer conversation** 粘滞。没有 Codex 前缀、没有 Grok 分片、没有 Gemini `systemInstruction` pin。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `kiroCacheSessionId` | 清洗 DSH `session_id` / `prompt_cache_key` |
| 2 | `kiroConversationId` | 有 pin 用 pin，否则常量 **`dsh-kiro`** |
| 3 | `openaiToKiro` | 写入 `conversationState.conversationId` |

proxy 只删 `prompt_cache_retention` / `prompt_cache_options`，**不**把 `prompt_cache_key` 转给 AWS。

## 不要

- 不要 `conversationId: \`-${Date.now()}\``。
- 不要给 Kiro 写 Codex `session-id` 或 Grok `x-grok-conv-id`。
- 不要把 Social 的 `redirect_uri` 在 authorize 和 token 之间改掉（HTTP 500）。
- 不要只 stub `GenerateAssistantResponse`（会 501）。

## 追溯

| 问题 | 记录 |
|---|---|
| 对话 501 未翻译 | [`docs/error.md`](../../../docs/error.md) 2026-08-31 Kiro 501 |
| Social 换票 500（redirect_uri） | 同文件 2026-08-30 / 08-31 Kiro Social |
| 登录成功授权页还在 | 同文件 2026-08-31 打开授权页 |
| 模型缺思考深度 / 输入类型 | 同文件 2026-08-31 Kiro 模型 |
| 对话不是 OpenAI | 同文件 2026-08-30（已在 0.0.50 做成翻译层） |

测试：`test/kiro.test.ts`、`test/cache-families.test.ts`、`test/proxy.test.ts`。
