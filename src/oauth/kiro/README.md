# Kiro OAuth

本文件是 `src/oauth/kiro/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

AWS **Kiro / CodeWhisperer**。协议对齐 [ZyphrZero/kiro.rs](https://github.com/ZyphrZero/kiro.rs) 与 Kiro IDE。对话 **不是** OpenAI Responses，是 `GenerateAssistantResponse` eventstream。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 五种凭据、portal PKCE、刷新、profileArn、用量头、静态目录 |
| [`catalog.ts`](catalog.ts) | 登录后 `ListAvailableModels` 活目录；静态 `KIRO_MODELS` 只做离线 fallback |
| [`import.ts`](import.ts) | 卡密 / JSON / CSV / kiro.rs / IDE token 解析；SSO client 配对 |
| [`idc-flow.ts`](idc-flow.ts) | AWS SSO OIDC register + JSON device poll（Builder ID / 企业 IdC） |
| [`request.ts`](request.ts) | OpenAI chat ↔ `conversationState` + eventstream → `chat.completion` |
| [`transport.ts`](transport.ts) | AWS HTTP 生命周期、EventStream 错误传播、按 toolUseId 分配 OpenAI 流索引 |
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
- `conversationId` = DSH `session_id` / `prompt_cache_key` **加上 model**（`session:deepseek-3.2`），缺 pin 时 `dsh-kiro:<model>`，`isKiroFallback` 为真时不钉系统提示。**永远不要** `Date.now()`。静态目录各钉各的，切换 picker 不共用一条 AWS conversation。
- tools 仍在 **current** `userInputMessageContext.tools`（官方也是挂 current，不在 conversationState 顶层）。
- **effort 走 `additionalModelRequestFields`**（请求体顶层，与 `conversationState` 同级）。形状以模型自己的 schema（`List-Available-Models` 的 `additionalModelRequestFieldsSchema`）为准：Claude `{ output_config: { effort } }`，GPT-5.6 `{ reasoning: { effort } }`；schema 是封闭的（`additionalProperties: false`），字段或取值不在里面就 400（`Invalid additionalModelRequestFields: property 'output_config' is not defined in the schema…`），所以只在该模型的目录行有档位（`reasoningEfforts` 从同一份 schema 读出）且取值在档位内时才发。活测（2026-09-29）：Opus 5.5 default 花 0.186 credit、low 0.184、**max 0.804（4.3×，35s 对 10s）**；GPT-5.6 Luna none 0.064 / max 0.516（8×，28s 对 4s）。以前这条路没接，DSH 里选的档位是空操作，模型一直跑 schema 默认档（Sonnet 4.6 high、Opus 5.5 medium、Luna high）。`thinking: { type: 'adaptive', display: 'summarized' }` 也被接受，但没有任何思考事件流出来（`display: summarized` 无效果），所以不发。
- **缓存是服务端自动的，只是不上报。** `List-Available-Models` 的 `promptCaching` 写着 `supportsPromptCaching: true`（Sonnet 4.6 最多 4 个 checkpoint、每个至少 1024 token）。活测（2026-09-29）：同一个约 15K token 的前缀连发三次，Haiku 0.0364 → 0.0193 → 0.0193 credit，Sonnet 0.118 → 0.063 → 0.063（重复请求约省一半），但事件里没有 `metadataEvent`，没有 `cacheReadInputTokens`。所以 Kiro 的命中率是**测不到，不是没命中**：`npm run analyze` 目录模式显示 `n/a`，单会话显示 `UNMEASURED`。kiro.rs 也写「上游 prompt cache 按内容前缀匹配、与会话 id 无关」，稳定前缀（本家 `cache.ts` 钉系统提示）仍是对的。
- 输出撞上限：流内 `ContentLengthExceededException` 帧（kiro.rs 读作 stop_reason `max_tokens`）以 `finish_reason: length` 收尾并保留已出文本，不再当 502 销毁（宿主会重试同一个还会撞上限的请求）。**活测（2026-09-29）没能复现这个帧**：用 schema 里的 `max_tokens: 1024` 逼出上限，流是静默结束的，没有异常帧也没有 stopReason，只能看到文本被截断，所以这种截断我们分辨不出来（`finish_reason` 仍是 `stop`）。
- 图片：user 消息里 `data:image/{png,jpeg,gif,webp};base64,…` 的 `image_url` 变成该条 `userInputMessage.images: [{format, source: {bytes}}]`（jpg → jpeg；远程 URL 和其他类型不发，一张被拒会让整轮 400）。**只有最近一条带图的 user 消息保留图片**，更早的不再重发（Kiro 自己的 agent 与 magpie 都这样；kiro.rs 是当前消息带图、历史里同图去重）。之前目录声明 `image` 而这里只留文本，图片被静默丢掉。线格来自 kiro.rs `KiroImage` 与 magpie `gateway/kiro.go`，2026-09-29 IdC 账号活测 haiku 4.5：红 / 蓝两张 64×64 图都读对。
- `toolResults` 必须紧跟带该 `toolUseId` 的 `assistantResponseMessage`（history user 或 current）。`relocateDisplacedToolResults` 先按 id 把错位的 result 挪回发出它的 assistant 后面（并发交错：A / user / B / result(A) → AWS 400）；再走原来的 `flushAssistant` 再 `flushUser`。不编造 “Tool results provided.”；有 `toolResults` 时 `content` 保持空串，只有既无文本也无 results 才写占位 `.`。
- `normalizeToolUseId`：已符合 `^[a-zA-Z0-9_.:-]{1,64}$` 的 id 只做 `call_` / `toolu_` / `tool_` → `tooluse_`；带 `|` 或超长的 OpenAI Responses 复合 id（`call_…|fc_…`）用稳定 sha256 映成 `tooluse_<32>`，use 和 result 共用同一张表。
- 上游 401/403 先经 `run` 的刷新钩子（`tokens.ts` `forcedRefresh` → `refreshNow`）刷一次再试；仍失败改写成 400（非 AUTH），避免 DSH 把订阅打成「API 密钥无效」。`MONTHLY_REQUEST_COUNT` → 429 `usage limit reached: <厂商原文>`（`upstream.ts` `quotaFailure`，不带 Retry-After）：DSH 的 `classifyPiAiError` 先判额度措辞、后判 429，所以归为 QUOTA_EXCEEDED、不重试。这个措辞是契约，去掉就会变回可锤的 429。`INSUFFICIENT_MODEL_CAPACITY` → 503；`USER_REQUEST_RATE_EXCEEDED` → 429（有则带 Retry-After，不带额度措辞）；超大 / `TOO_BIG` 保持 400/413，但消息前缀 `input is too long for the model's context window: `——DSH 只在 `CONTEXT_WINDOW_EXCEEDED` 时压缩后继续，pi-ai 适配器靠措辞判定（`isContextWindowExceededError` / `OVERFLOW_PATTERNS`），Kiro 原文 `Input is too long.` 两套都不匹配（回归 `test/kiro.test.ts` 内嵌宿主正则原文）。流内异常（非流式）走同一套分类定状态码。不要再抄 kiro-cli 403 级联。
- eventstream 里结构化 thinking / `text`（无 `content`）映成 Completions `reasoning_content`。不要把思考压成 `<thinking>` XML 写进 `content`。
- 网络块不是帧边界。`KiroEventStreamParser` 拒绝非法帧长 / header 长度，`finish()` 拒绝 EOF 残帧；不能在毒前缀后继续积累数据。见[故障记录](../../../docs/error.md)。
- 流式工具按 `toolUseId` 分配稳定且互异的 OpenAI `index`，参数片段始终是字符串；交错工具不能拼成同一个调用。
- 传输层跑在 `upstreamRequest().run` 里（首字节 120s / 预算 270s / 空闲 270s，每块上游数据 `touch()`）；第一块映射后的输出之前不写头。输出前：厂商异常帧按 `classifyKiroHopError` 回 HTTP 状态、不重放；畸形帧 / EOF 残帧 / 断流是传输故障，由 `run` 重试。输出后任何失败都 `destroy`，不写 `error` SSE，不追加成功 `finish_reason` / `[DONE]`；停止消费并释放上游 reader。

命中：有 `metadataEvent.tokenUsage`（或嵌套 `metadataEvent` / snake_case）时用精确字段，`cacheReadInputTokens` → `prompt_tokens_details.cached_tokens`。

**现场 wire 往往没有 `metadataEvent`。** kiro-cli / kirogo / kiro.rs 实测 `:event-type` 是 `initial-response`、`assistantResponseEvent`、`toolUseEvent`、`contextUsageEvent`、`meteringEvent`。`meteringEvent.usage` 是 **credit**，不是 token。没有 tokenUsage 时，`prompt_tokens` = `contextUsagePercentage / 100 *` 该模型 `contextWindow`；`completion_tokens` 按正文 + 思考 + 工具参数的字数估（只算正文会让思考 + 工具步骤恒为 0）。没有 cache 字段时命中率不可测，`npm run analyze` 报 `UNMEASURED`。AWS 连 context 也没下发时才保持 0/0/0。头解码仍要走过非 string 类型。

## 模型

**选择器以接口为准，不以文档为准。** 登录 / 导入 / 额度刷新 / 启动 warmup 后，`refreshKiroCatalog` 打 management `https://management.<region>.kiro.dev/` `List-Available-Models`，`origin` 用对话同一个 `KIRO_CHAT_ORIGIN`（`AI_EDITOR`）。遇到空列表或区域 403 会再探 `us-east-1` / `eu-central-1`，不在第一个 403 停。结果按 token hash 缓存。**活列表非空就是选择器本身**，同时写进 `oauth-kiro.models` yaml，不再补静态行。每行从接口读：`tokenLimits` → 窗口 / 输出上限，`supportedInputTypes` → `text` / `image`，`additionalModelRequestFieldsSchema` → effort（Claude 读 `output_config.effort`，GPT 读 `reasoning.effort`，`none` → `off`；schema 为 `null` 就是不支持思考）。静态行只提供排序和美化名（`GPT-5.6 Sol`、`Claude Sonnet 4.0`），接口没给的字段才用它补。**Auto 不进选择器**（2026-09-28 移除），活列表列出来也跳过。对话 hop **仍是** `q.<region>.amazonaws.com` GenerateAssistantResponse。

- **后端按 origin 放行模型**（2026-09-28 活测）。chat 发 `AI_EDITOR`，只有这个 origin 的列表才是能对话的模型；不在列表里的模型会 400 `INVALID_MODEL_ID`。Builder ID Power：GPT-5.6 ×3 + 5 个 OSS；Social Free：5 个 OSS。两个账号都**没有** Claude，在所有 chat origin（`AI_EDITOR` / `CLI` / `KIRO_CLI` / `IDE` / `MD_IDE`）下发 Claude 都是 `INVALID_MODEL_ID`。当时出口直连、Cloudflare `loc=CN`。列表按**出口区域**过滤（与 Cursor 同理）：要用 Claude 就给插件配一个非中国大陆出口的出站代理（`outbound-proxy.json` / 插件 `proxyUrl` / `HTTPS_PROXY`），chat、目录、额度都会走它。目录缓存 key 是 token 加出口代理；手动「刷新」总是重拉，因为系统 VPN 切换出口时 key 感知不到。同一账号换到 `loc=US` 出口后当场实测：Builder ID Power 19 个（GPT-5.6 ×3 + Claude 11 + OSS 5），Social Free 8 个（Sonnet 4.5 / 4、Haiku 4.5 + OSS 5），Haiku chat 200。接口和官网都没有 GPT-6，GPT 只有 5.6 Sol / Terra / Luna。
- **全模型活测（2026-09-28，`loc=US`）**：经本地代理 `/kiro/v1/chat/completions`，Builder ID Power 列出的 19 个模型，流式和非流式都返回 200 `OK`（38/38）。Social Free 列出的 8 个也全部 200。列表外的模型都是 400 `INVALID_MODEL_ID`：Fable 5.1 / Fable 5（企业预览），以及 Free 账号上的 Opus 4.8 / GPT-5.6 Luna。每个账号的列表就是它的实际权限。
- `origin=KIRO_CONSOLE` 返回全部 21 个模型（治理目录，含 Claude 与 `claude-opus-5.5`），但它**不是**权限列表，发 chat 时是 `Improperly formed request`。不要拿它当选择器。合法 origin 可以用非法值让接口报错列出：`CLI, MD_IDE, AI_EDITOR, IDE, KIRO_WEB, SM_AI_STUDIO_IDE, KIRO_CONSOLE, KIRO_CLI`。
- `KIRO_MODELS` 只是离线 fallback（活列表失败或为空时用）：取 2026-09-28 `KIRO_CONSOLE` 快照去掉 Auto，外加兼容 ID `claude-fable-5`（[pi-provider-kiro](https://github.com/mikeyobrien/pi-provider-kiro) bootstrap）。id 用点号（`claude-sonnet-5`、`claude-fable-5.1`）。快照值：Opus 5.5 / 5 / 4.8 / 4.7、Fable 5.1、GPT-5.6 输出上限 128K，其余 64K；DeepSeek 3.2 164K、MiniMax 196K、Qwen3 Coder Next 256K（官方文档表写的 128K / 200K 是取整值）。
- 思考：GPT-5.6 DSH 档位 `off`–`max`，关思考的 **wire** 是 `none`（`off: "none"`）。Opus 5.5 / 5 / 4.8 / 4.7、Sonnet 5、Fable 5 / 5.1 有 `xhigh`；4.6 家族到 `max`；Haiku / Opus 4.5 / Sonnet 4.5 / 4.0 / OSS 为 `false`。不要把 `none` 当 DSH 键——整段 `oauth-kiro` 写不进 settings.yaml。
- 目录必须有 Opus 5、Opus 4.8；Sonnet 主推是 **Claude Sonnet 5**（4.5 与 4.0 仍保留）。

## 额度

`fetchKiroQuota` 打用量 host（`us-east-1` / `eu-central-1`）。`profileArn` 与对话、目录同源（`kiroProfileArn`）：Builder ID 不带 ARN 会 400 `Invalid profileArn.`。只有 403 才换下一个区。`parseKiroUsage` 一条 cycle：`currentUsage` / `usageLimit` + 进行中的 trial / bonus。卡片显示进度条。没有 Codex 重置卷。

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
- 不要把目录模型共用一个 `dsh-kiro` conversationId。
- 不要把带 `|` 的 OpenAI Responses tool id 原样发给 AWS（`REQUEST_BODY_INVALID`）。
- 不要在错位 tool_result 上编造合成 “Tool results provided.” 或丢掉已有 call 的 result。
- 不要把思考压成 `<thinking>` XML 写进 assistant `content`。
- 不要把 chat hop 改到 `runtime.<region>.kiro.dev`（未在本 hop 的 JSON + eventstream 上证明）。
- 不要只在第一个 ListAvailableModels 403 就放弃；再探另一个 canonical region。
- 不要给 Kiro 写 Codex `session-id` / `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要在新 assistant 上先 `flushUser` 再 `flushAssistant`（会把上一轮 tool_result 写到 tool_use 前面；0.0.58 第三跳 400）。
- 不要把 extra system user+ack 插在 `toolUses` 和匹配的 `toolResults` 中间。
- 不要把 tools 挪到 conversationState 顶层（官方挂 current `userInputMessageContext`）。
- 不要把 Social 的 `redirect_uri` 在 authorize 和 token 之间改掉（HTTP 500）。
- 不要在 refresh 成功后保留旧 `expiresAt`（TokenManager 会每轮打 `/refreshToken` → 429）。
- 不要把 refresh 429 映射成代理 500；原样回 429（有则带 Retry-After）。
- 刷新永久失败只认 `KiroHttpError` 的 401 或 body `error` 码（`invalid_grant` 等），不扫消息文本。
- 不要只 stub `GenerateAssistantResponse`（会 501）。
- 不要在 eventstream 非 string 头上 `break`（会丢掉 `:event-type`）。
- 不要只认 `metadataEvent.tokenUsage`。现场流经常只有 `contextUsageEvent` + `meteringEvent`（credit）。
- 不要把 `meteringEvent.usage` 当 token。
- 不要把 `api` 改成 Responses / Anthropic。
- 不要把 `none` 写成 `reasoningEfforts` 的键（DSH 只认 `off|minimal|low|medium|high|xhigh|max`）。
- 不要把 kiro-manager-lite 的 AGPL 源码贴进来；只蒸馏格式，解析器写自己的。

## 归因

协议：[ZyphrZero/kiro.rs](https://github.com/ZyphrZero/kiro.rs)。导入格式蒸馏自 AGPL [lucks-cloud/kiro-manager-lite](https://github.com/lucks-cloud/kiro-manager-lite)（不抄源码）。`claude-fable-5`：[mikeyobrien/pi-provider-kiro](https://github.com/mikeyobrien/pi-provider-kiro) `0.10.2`。总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

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
| 复合 tool id / 错位 result / 静态目录缺口 | 同文件 2026-09-03 Kiro tool-id / displaced-result / live-catalog |
| 每轮 refresh 429 + usage 0/0/0 | 同文件 2026-09-01 Kiro 0.0.57 live |
| overlay 后 usage 仍 0/0/0（header-type 不够） | 同文件 2026-09-01 Kiro usage 真实事件 |

测试：`test/kiro.test.ts`、`test/cache-families.test.ts`、`test/proxy.test.ts`。
