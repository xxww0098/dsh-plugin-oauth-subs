# Kiro OAuth

本文件是 `src/oauth/kiro/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)。

AWS **Kiro / CodeWhisperer**。协议对齐 [ZyphrZero/kiro.rs](https://github.com/ZyphrZero/kiro.rs) 与 Kiro IDE。对话 **不是** OpenAI Responses，是 `GenerateAssistantResponse` eventstream。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 五种凭据、portal PKCE、刷新、profileArn、用量头、目录 |
| [`import.ts`](import.ts) | 卡密 / JSON / CSV / kiro.rs / IDE token 解析；SSO client 配对 |
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

`canonicalizeKiroMethod` 把 `oauth`/`github`/`google`/`gmail`/`gh` → `social`，`builder-id`/`builderid` → `idc`，`azuread`/`entra` → `external_idp`。
没有 `authMethod` 时 `inferKiroAuthMethod` 看 provider / 是否带 clientId+secret：GitHub/Google 是 social，Builder ID / Enterprise 是 idc。

导入：`parseKiroImportText` / `sessionsFromKiroAuth` / `importKiroAuth`。格式蒸馏自 [kiro-manager-lite](https://github.com/lucks-cloud/kiro-manager-lite)（**不**抄 AGPL 源码）和 kiro.rs：

| 来源 | 形状 |
|---|---|
| 卡密 | `邮箱----密码----RefreshToken----ClientId----ClientSecret----登录方式`（也认 Tab / 连续空格 / 逗号） |
| 精简 JSON | `[{ email, refreshToken, provider, clientId, clientSecret }]` |
| 完整备份 | `{ app: "kiro-account-lite", accounts: [{ email, idp, credentials }] }` |
| CSV / TXT | 表头 `邮箱` / `email` / `refreshToken` / `登录方式` |
| kiro.rs | `credentials.json` 数组或对象 |
| Kiro IDE | `~/.aws/sso/cache/kiro-auth-token.json`；IdC 用 `clientIdHash` 配对旁边的 OIDC 注册 json |
| API key | 一行一个 `ksk_…` |

**导入本机会话** 扫本地文件，**一次写入全部账号**（不再只取第一条）。IDE token 缺 clientId/secret 时补上 SSO 缓存里的注册，否则 Builder ID 之后刷新会 401。Settings **粘贴凭证** 吃上面任何一种文本；只有 refresh、没有 access 时会按方法走 `refreshKiro`。

登录成功后 Settings 必须清掉「打开授权页」（`busy === false`），否则授权条还挂在已登录卡下面。

## 对话

DSH `api: openai-completions`。原生是 AWS EventStream `GenerateAssistantResponse`，三种闭集都对不上，Completions + 翻译层是唯一划算的。不要改 Responses / Anthropic（翻译层还在，还丢掉 DSH 原生 Completions）。

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
- 思考：GPT-5.6 DSH 档位 `off`–`max`，关思考的 **wire** 是 `none`（`off: "none"`）。Opus 5 / 4.8 / 4.7、Sonnet 5 有 `xhigh`；4.6 家族到 `max`；Haiku / OSS 为 `false`。不要把 `none` 当 DSH 键——整段 `oauth-kiro` 写不进 settings.yaml。
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
- 不要把 `api` 改成 Responses / Anthropic。
- 不要把 `none` 写成 `reasoningEfforts` 的键（DSH 只认 `off|minimal|low|medium|high|xhigh|max`）。
- 不要把 kiro-manager-lite 的 AGPL 源码贴进来；只蒸馏格式，解析器写自己的。

## 追溯

| 问题 | 记录 |
|---|---|
| 对话 501 未翻译 | [`docs/error.md`](../../../docs/error.md) 2026-08-31 Kiro 501 |
| Social 换票 500（redirect_uri） | 同文件 2026-08-30 / 08-31 Kiro Social |
| 登录成功授权页还在 | 同文件 2026-08-31 打开授权页 |
| 模型缺思考深度 / 输入类型 | 同文件 2026-08-31 Kiro 模型 |
| GPT `none` 键写不进 settings.yaml | 同文件 2026-08-31 Kiro reasoningEfforts |
| 对话不是 OpenAI | 同文件 2026-08-30（已在 0.0.50 做成翻译层） |
| 导入只吃第一条 / IDE 丢 client 注册 | 同文件 2026-08-31 Kiro 导入 |

测试：`test/kiro.test.ts`、`test/cache-families.test.ts`、`test/proxy.test.ts`。
