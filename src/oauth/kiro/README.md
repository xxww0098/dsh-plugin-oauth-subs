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
| Social / OAuth | Google / GitHub | portal PKCE `app.kiro.dev`，callback 端口 `KIRO_CALLBACK_PORTS` | **authorize 和 token 的 `redirect_uri` 必须字节一致**。Cognito 常是 origin-only（`http://127.0.0.1:PORT`），path 可能是 `/`、`/oauth/callback`、`/signin/callback`。`refreshKiroSocial` 成功后必须用 refresh JSON 的 `expiresIn` / `expiresAt` **重写** `expiresAt`，不能留旧毫秒戳，否则 TokenManager 每轮都刷新 → `/refreshToken` 429。429 带 `status` + `Retry-After` 回给 DSH，不要改成 500。 |
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

- `developer` 以及未知角色 → system。官方 wire **没有**独立 system 字段（[kiro.rs](https://github.com/ZyphrZero/kiro.rs) `build_history` / kiro-proxy PROTOCOL.md）。system 钉成 **history 第一条** `userInputMessage` + 固定 ack `I will follow these instructions.`，**不要**每轮拼进 `currentMessage.content`。
- 历史是 `userInputMessage` / `assistantResponseMessage` 成对。当前 user 文本只是这一轮。
- `conversationId` = DSH `session_id` / `prompt_cache_key` **加上 model**（`session:deepseek-3.2`），缺 pin 时 `dsh-kiro:<model>`。**永远不要** `Date.now()`。18 个目录模型各钉各的，切换 picker 不共用一条 AWS conversation。
- tools 仍在 **current** `userInputMessageContext.tools`（官方也是挂 current，不在 conversationState 顶层）。
- `toolResults` 必须紧跟带该 `toolUseId` 的 `assistantResponseMessage`（history user 或 current）。新 assistant 到时先 `flushAssistant`（上一条 tool_use）再 `flushUser`（它的 tool_results）；首条 user 文本仍先入 history。**不要**把 extra system user+ack 插在这一对中间（AWS 400 `unexpected tool_use_id` / `kiro_upstream`）。
- 上游 401/403 改写成 400（非 AUTH），避免 DSH 把订阅打成「API 密钥无效」。

命中：有 `metadataEvent.tokenUsage`（或嵌套 `metadataEvent` / snake_case）时用精确字段，`cacheReadInputTokens` → `prompt_tokens_details.cached_tokens`。

**现场 wire 往往没有 `metadataEvent`。** kiro-cli / kirogo / kiro.rs 实测 `:event-type` 是 `initial-response`、`assistantResponseEvent`、`toolUseEvent`、`contextUsageEvent`、`meteringEvent`。`meteringEvent.usage` 是 **credit**，不是 token。没有 tokenUsage 时，`prompt_tokens` = `contextUsagePercentage / 100 *` 该模型 `contextWindow`；`completion_tokens` 按输出字数估。AWS 连 context 也没下发时才保持 0/0/0。头解码仍要走过非 string 类型。

## 模型

`KIRO_MODELS` 对齐 [kiro.dev/docs/models](https://kiro.dev/docs/models)（不含 Auto）+ [effort](https://kiro.dev/docs/models/effort)。id 用点号（`claude-sonnet-5`）。

- GPT-5.6 / Claude：输入 `text+image`。OSS（DeepSeek / MiniMax / GLM-5 / Qwen）：`text`。
- 思考：GPT-5.6 DSH 档位 `off`–`max`，关思考的 **wire** 是 `none`（`off: "none"`）。Opus 5 / 4.8 / 4.7、Sonnet 5 有 `xhigh`；4.6 家族到 `max`；Haiku / OSS 为 `false`。不要把 `none` 当 DSH 键——整段 `oauth-kiro` 写不进 settings.yaml。
- 目录必须有 Opus 5、Opus 4.8；Sonnet 主推是 **Claude Sonnet 5**（4.5 仍保留）。

## 额度

`fetchKiroQuota` 打用量 host（`us-east-1` / `eu-central-1`）。`parseKiroUsage` 一条 cycle：`currentUsage` / `usageLimit` + 进行中的 trial / bonus。卡片显示进度条。没有 Codex 重置卷。

## 缓存

AWS 按 **CodeWhisperer conversation** 粘滞。没有 Codex 前缀、没有 Grok 分片、没有 Gemini `systemInstruction` 字段。system 的稳定位置是 **history 首对**，不是 current 正文。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `kiroCacheSessionId` | 清洗 DSH `session_id` / `prompt_cache_key` / model |
| 2 | `kiroConversationId` | pin + **model**；否则 **`dsh-kiro:<model>`** |
| 3 | `pinKiroSystemPrefix` | 每个 conversationId 钉第一次 system；DSH snapshot 增量挂 history **后缀**（再一对 user+ack）。后缀若会夹在 assistant `toolUses` 和 current `toolResults` 之间，改插到那条 assistant **前面** |
| 4 | `openaiToKiro` | 写入 `conversationId`；current 不再重倒 system；`parkKiroSystemExtra` 保证 tool 对相邻 |
| 5 | `mapKiroUsage` / `resolveKiroUsage` | 精确 `tokenUsage` 优先；否则 `contextUsageEvent` % × 窗口 |

proxy 只删 `prompt_cache_retention` / `prompt_cache_options`，**不**把 `prompt_cache_key` 转给 AWS。
测试用 `resetKiroSystemPins()`。不要和 GLM / Antigravity 共用 Map。

## 不要

- 不要 `conversationId: \`-${Date.now()}\``。
- 不要把整段 system 每轮拼进 `currentMessage.content`（current 一变，AWS 前缀就 miss）。
- 不要 18 个模型共用一个 `dsh-kiro` conversationId。
- 不要给 Kiro 写 Codex `session-id` / `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要在新 assistant 上先 `flushUser` 再 `flushAssistant`（会把上一轮 tool_result 写到 tool_use 前面；0.0.58 第三跳 400）。
- 不要把 extra system user+ack 插在 `toolUses` 和匹配的 `toolResults` 中间。
- 不要把 tools 挪到 conversationState 顶层（官方挂 current `userInputMessageContext`）。
- 不要把 Social 的 `redirect_uri` 在 authorize 和 token 之间改掉（HTTP 500）。
- 不要在 refresh 成功后保留旧 `expiresAt`（TokenManager 会每轮打 `/refreshToken` → 429）。
- 不要把 refresh 429 映射成代理 500；原样回 429（有则带 Retry-After）。
- 不要只 stub `GenerateAssistantResponse`（会 501）。
- 不要在 eventstream 非 string 头上 `break`（会丢掉 `:event-type`）。
- 不要只认 `metadataEvent.tokenUsage`。现场流经常只有 `contextUsageEvent` + `meteringEvent`（credit）。
- 不要把 `meteringEvent.usage` 当 token。
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
| 0.0.55 仍写不进 yaml：GLM Anthropic 带了 Completions compat | 同文件 2026-08-31 GLM Anthropic compat / Kiro yaml |
| 对话不是 OpenAI | 同文件 2026-08-30（已在 0.0.50 做成翻译层） |
| 导入只吃第一条 / IDE 丢 client 注册 | 同文件 2026-08-31 Kiro 导入 |
| 18 模型缓存 miss（system 每轮进 current + 共用 conversationId） | 同文件 2026-08-31 Kiro 缓存 |
| 第二轮 tool 前 flushUser 把 tool_result 写到 tool_use 前面（400） | 同文件 2026-09-01 Kiro tool pairing |
| 每轮 refresh 429 + usage 0/0/0 | 同文件 2026-09-01 Kiro 0.0.57 live |
| overlay 后 usage 仍 0/0/0（header-type 不够） | 同文件 2026-09-01 Kiro usage 真实事件 |

测试：`test/kiro.test.ts`、`test/cache-families.test.ts`、`test/proxy.test.ts`。
