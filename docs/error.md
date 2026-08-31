# 错误记录

## 2026-08-31：额度刷新时间只精确到小时

### 现象

设置 → Antigravity。Claude Sonnet 4.5 / Gemini 3 Pro 显示「5 小时后重置」，Gemini 3 Flash「4 小时后重置」。真实 `resetTime` 有分钟，被 `Math.round(minutes / 60)` 抹掉。

### 证据

- `formatReset`：不足 60 分钟才写分钟；1–47 小时 `Math.round(minutes / 60)` 只出「N 小时后重置」。
- 4 小时 32 分钟会显示成 5 小时。Codex / Kiro / 重置券过期同一套函数。

### 根因

相对时间文案按最大单位四舍五入，不是解析丢了 `resetAt`。

### 修复

按天 / 小时 / 剩余分钟拼接，0 的单位省略。满 14 天仍走绝对时间（已带时:分）。

### 验证

- `npm test`：`4h32m` → `4 小时 32 分钟后重置`；整点 5 小时不加 0 分钟；源码不再 `Math.round(minutes / 60)`。

## 2026-08-31：Antigravity 额度要拆成 Gemini / Claude+GPT 的每周 + 5 小时，套餐仍是 STANDARD

### 现象

官方 Model Quota 面板是两组：Gemini Models、Claude and GPT models，每组 Weekly remaining + Five Hour remaining。插件卡片仍是按模型系列一条 remainingFraction。套餐还可能显示 Standard（Code Assist `currentTier`）。

### 证据

- 官方 RPC 是 `v1internal:retrieveUserQuotaSummary`（`groups[].buckets[]`）。`fetchAvailableModels.quotaInfo` 只有 5 小时窗口。
- `antigravityPlanType` 在 paidTier 缺失时回落到 `currentTier.id` = `STANDARD TIER`。Google AI Pro 账号的 Code Assist 档仍是 STANDARD。

### 根因

额度解析 + 套餐字段。不是 UI 进度条组件本身。

### 修复

- 先打 `retrieveUserQuotaSummary`；失败再回落 `fetchAvailableModels`。
- 套餐优先 `paidTier.name` / `id`（Google AI Pro / Ultra）。`currentTier` 的 STANDARD / legacy 是 Code Assist SKU，不显示。Free 仍读 `currentTier: free-tier`。
- 设置卡抬头优先额度里的 planLabel，不再被登录时写进去的 STANDARD TIER 盖住。

### 验证

- `npm test`：99%/96% + 100%/100% 两组；`currentTier` 单独 STANDARD 时 planType 为空；`free-tier` 仍是 Free；`Google AI Pro` → Pro。

## 2026-08-31：Antigravity 缓存命中率显示 0

### 现象

DSH 会话 `oauth-antigravity` / `gemini-3.7-flash-high`（「项目代码结构分析」）。8 步 tool loop，input 从 9855 涨到 25598，每条 `assistant/message.usage` 只有 `inputTokens/outputTokens/totalTokens`，**没有** `cacheReadTokens`。页脚缓存命中率 0%。

### 证据

- Google `usageMetadata.cachedContentTokenCount` 是隐式缓存命中数。`mapAntigravityUsage` 只抄了 `promptTokenCount` / `candidatesTokenCount` / `thoughtsTokenCount`，没写 `prompt_tokens_details.cached_tokens`。DSH openai-completions 因此不填 `cacheReadTokens`。
- DSH 每步会再塞一条 runtime-context system snapshot。全部进 `systemInstruction` 会改 Gemini 隐式缓存前缀。

### 根因

代理层 OpenAI 用量翻译，外加 system 前缀不稳。不是 sessionId 没钉（已经钉了），也不是额度。

### 修复

- `cachedContentTokenCount` / `cached_content_token_count` / `cacheTokensDetails` → `prompt_tokens_details.cached_tokens`。
- 同一 DSH `session_id` 第一次的 `systemInstruction` 钉住；后续多出来的 system 文本挂到 `contents` 末尾。

### 验证

- `npm test`：18360 cached → `cached_tokens: 18360`；同 session 第二条 snapshot 在 contents 末尾，systemInstruction 不变。

## 2026-08-31：Kiro 对话 501 generateAssistantResponse 未翻译

### 现象

用户已登录 Kiro（Auth / 额度 / 目录都活着）。Composer 选 **DeepSeek 3.2**（`oauth-kiro` / `deepseek-3.2`）。DSH 重试 5/5 后显示：

```
501: {"message":"Kiro chat is AWS generateAssistantResponse, not OpenAI. Auth, quota, and the catalog are live; the translator is a follow-up."}
```

请求是 `POST /kiro/v1/chat/completions`（`hello`，无 tools）。不是 密钥无效。

### 证据

- 插件自己的 stub：`src/oauth/proxy.ts` 对 `/kiro/v1/chat/completions` 和 `/kiro/v1/responses` 一律 `send(501, …translator is a follow-up)`。
- 目录已声明 `api: openai-completions`、`baseURL …/kiro/v1`。DSH 按 OpenAI chat 发，不会自己改成 AWS Event Stream。
- 上游是 `POST https://q.<region>.amazonaws.com/` + `X-Amz-Target: AmazonCodeWhispererStreamingService.GenerateAssistantResponse` + `application/x-amz-json-1.0`，响应 `application/vnd.amazon.eventstream`。协议对齐 kiro-proxy PROTOCOL.md / kiro.rs / kiroxy。

### 根因

代理层。认证、额度、`KIRO_MODELS` 已接；聊天翻译故意留空。不是 Codex / Grok hop，也不是 DSH 密钥或 `dsh-tool-fs-search`。

### 修复

- 新增 `src/oauth/kiro/request.ts`：OpenAI messages → `conversationState`（`modelId` 带点、`origin: AI_EDITOR`、`developer`→system、history 成对、`conversationId` 用 `codexCacheSessionId` 钉死，禁止 `Date.now()`）。
- Event Stream 帧（`assistantResponseEvent` / `toolUseEvent` / `contextUsageEvent` / exception）→ `chat.completion` JSON 和 `stream: true` SSE。
- `forwardKiro` 替换 501。刷新走 `tokens.kiro.session()`。头复用 `kiroUsageHeaders` 的 UA / `tokentype`，另加 chat 专用 `accept: application/vnd.amazon.eventstream`（额度 JSON 的 `accept: application/json` 不动）。
- `profileArn` 来自 `kiroStreamingProfileArn(session)`。上游 401/403 改写成 **400**（非 AUTH），避免 DSH 画「API 密钥无效」。
- `/kiro/v1/responses` 仍 501（DSH 走 chat/completions）。tools 已映射进 `userInputMessageContext.tools`；本条验收是无 tools 的 `hello`。

### 验证

- `npm test`：messages→conversationState、eventstream fixture→content、SSE chunks、proxy 不再对 `POST /kiro/v1/chat/completions` 回 501、同一 `session_id` 两轮 `conversationId` 相同、403→400。无 live AWS 调用。

## 2026-08-31：Antigravity 流式对话 DSH 显示「用量 0 tok」且首 token 从半句开始

### 现象

DSH / SkillStar 会话 `oauth-antigravity` / `gemini-3.7-flash-high`（reasoningEffort high，会话「项目结构与代码分析」）产出长中文回答（约 24 步、1m21s）。页脚是 **用量 0 tok**、**首 token 平均 2.4秒 · 0 tok/s**。最终组装文本完整，但该步第一条 `text-delta` 从正文第 303 字中途开始（`` ` 遍历所有适配目标... ``），前缀从未出现在 streamed delta 里。每条 `assistant/message` 的 `usage` 都是 `{inputTokens:0, outputTokens:0, totalTokens:0}`，`replayState.response.usage` 为 `null`，`api: openai-completions`。

### 证据

- `antigravityToOpenai`（非流）已经把 `usageMetadata.{promptTokenCount,candidatesTokenCount,totalTokenCount}` 映射成 OpenAI `usage`，但漏了 `thoughtsTokenCount`。
- `antigravityToOpenaiChunk` 从不写 `usage`。`forwardAntigravity` 流循环只在 `delta.content || delta.tool_calls` 时才写出 chunk，Google 最后一帧常见「只有 usage / finish」被丢掉。
- 收尾 chunk 是 `antigravityToOpenaiChunk({}, { done: true })`，空 body，DSH 永远看不到 usage。
- Google `streamGenerateContent` SSE 的 `part.text` / tool args 是**累计全文**。chunk 把 `delta.content` 设成目前为止的全文后，DSH openai-completions 客户端按累计做 diff，第一条 `text-delta` 变成后一帧的后缀，前缀（约 300 字）和首 token / tok/s 都错。

### 根因

代理层 OpenAI-compat 翻译（`src/oauth/antigravity/request.ts` + `forwardAntigravity`）。不是 fingerprint / hub URL / sessionId pinning / VALIDATION_REQUIRED，也不是 generativelanguage / API key。GLM/Codex 没有对 Antigravity thought 文本的 `reasoning_content` 流约定，思考正文继续不转发。

### 修复

- `mapAntigravityUsage`：`prompt_tokens = promptTokenCount`；`completion_tokens = candidatesTokenCount + (thoughtsTokenCount || 0)`；`total_tokens = totalTokenCount`，缺则 prompt+completion。有 `thoughtsTokenCount` 时写 `completion_tokens_details.reasoning_tokens`。非流 `antigravityToOpenai` 共用。思考 token 必须进 `completion_tokens`，否则思考模型 tok/s 仍是 ~0。
- `createAntigravityOpenaiStream` 每流保存已发出的可见文本 / tool args 和最后一次 `usageMetadata`。累计帧只发出新后缀；后一帧更短则整段重发，不做负切片。`part.thought` 仍不进 `delta.content`，但 usage 照记。
- 流路径在 `data: [DONE]` 之前必写一帧收尾 chunk：`choices[0].delta` 为空、`finish_reason` 为 `stop` / `tool_calls` / 映射值，并带上过程中见过的最后一次 usage。只有 usage/finish 的帧不再被丢掉。

### 验证

- `npm test`：`thoughtsTokenCount` 映射；累计 SSE `Hello` → `Hello world` 变成 `Hello` 然后 ` world`；mock stream 最后一帧只有 usage 时客户端 SSE 有非零 `prompt_tokens` / `completion_tokens` / `total_tokens` 再 `[DONE]`；先 thought 再可见文本时第一条 `delta.content` 是可见字；tool-call 流仍是 `tool_calls`。

## 2026-08-31：Kiro 模型没有思考深度，也没标明 text / image

### 现象

DSH 模型选择器里 OAuth · Kiro 的 Claude / GPT 没有思考深度档；附件能力也不清楚是纯文字还是图文。

### 证据

- `kiroModel()` 只写了 `id/name/contextWindow/input`，没有 `reasoningEfforts`。`toHarnessModel` 因此不带档位。
- `oauth-kiro` 没有 `compat.supportsReasoningEffort`，pi-ai 对 localhost completions 会丢掉 `reasoning_effort`。
- 官方 [effort](https://kiro.dev/docs/models/effort/)：GPT-5.6 `none|low|medium|high|xhigh|max`；Opus 5/4.8/4.7、Sonnet 5 另有 `xhigh`；Opus/Sonnet 4.6 到 `max`；Haiku、DeepSeek、MiniMax、GLM-5、Qwen 无档。
- Input：GPT/Claude 图文；DeepSeek / MiniMax / GLM-5 / Qwen 纯文字（catalog 里已有，需在测试里钉死）。

### 根因

模型表。不是 hop（chat 仍 501）。

### 修复

每行写 `reasoningEfforts` + `input`；`oauth-kiro` 加 `compat.supportsReasoningEffort` + `thinkingFormat: openai`。

### 验证

- `npm test`：Sol / Opus 5 / Sonnet 4.6 档位、Haiku/GLM `false`、glm-5 `['text']`、opus `['text','image']`。

## 2026-08-31：Antigravity 额度条没有刷新时间

### 现象

设置 → Antigravity。已登录卡有 Claude/GPT、Gemini 分组进度条和剩余百分比，没有「N小时后重置」。Codex / Kiro 同一套 `QuotaRow` 会显示。

### 证据

- `fetchAvailableModels` 的 `quotaInfo.resetTime`（ISO）本来就有。`buildAntigravityQuotaRow` 只在缺 `remainingFraction` 时用它当 remaining 0，行上不写 `resetAt`。
- UI `QuotaRow` 已经 `formatReset(row.resetAt)`。

### 根因

额度解析。SkillStar 分组抄了 remaining，漏了 reset。

### 修复

每组取 remaining 最低那条模型的 `resetTime`（`resetAtOf`），写到行上。

### 验证

- `npm test`：`remainingFraction` + `resetTime` 并存时 `resetAt` 是 ISO 毫秒；组内取最低 remaining 那条的时间。

## 2026-08-31：Kiro 登录成功后「打开授权页」还在

### 现象

设置 → AWS Kiro。Social 已登录（邮箱 + FREE + 使用中 + SOCIAL + 额度条），状态是 **已登录**，卡片下方仍有 **打开授权页**。

### 证据

- `login` RPC 把 `{ authorizeUrl }` 写入 React `pending[provider]`，只在 `logout` / `cancel` / `key` 时清掉。
- 轮询 `status` 会把 `busy` 变成 false、画出账号卡，但 `pending.authorizeUrl` 还在。
- `pending?.authorizeUrl && h('a', …, t.openUrl)` 没有看 `busy`。配对码同样。粘贴回调表单已经有 `busy &&`。

### 根因

设置页。授权链接跟服务端 busy 脱节，不是 Kiro token 没换完。

### 修复

- 配对码 / 打开授权页仅在 `busy` 时渲染。
- snapshot 该 provider 已不 busy 时清掉 client `pending`。

### 验证

- `npm test`：client 源码断言 `pending?.authorizeUrl && busy`。

## 2026-08-31：DSH 换模型会丢掉 reasoningEffort，选择器回到 Default

### 现象

用户 DSH 0.1.2-alpha.2。OAuth 系列（Codex / Grok / GLM / Kiro / Antigravity）里把思考深度设成 High 等非 Default 档后，在会话里换模型，思考深度选择器回到 **Default**，而不是上次选的档。本机 `~/.dsh/settings.yaml` 的 `agent-default-model` 在上次切换后**没有** `reasoningEffort`（省略的 Default，不是字符串 `"default"`）。

### 证据

- `dsh-client-ui-model-selection` `choose` / `selectionOf` 在**换模型**时永远组 `{ provider, model, ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: defaultEffort }) }`。上一会话的 effort **不会**抄过来。Default 行只在 `defaultEffort` 缺失时注入（`effort.providerDefault`，中文界面也是英文 “Default”）。点 Default 是省略字段，不写 `"default"`。
- Host `SessionCommandController.selectModel` 顺序：`llm.resolveCallConfig` → `selectForNextRequest`（会话 `model/selection` 事件，**活着的选择器读这个**）→ `agentDefaultModel.saveSelection`（YAML `replace` 整节 `agent-default-model`）。
- 因此事后改 YAML **只影响新会话**，当前 composer 仍停在 Default，直到再一次 `selectModel`。
- `settings.watch` 只挂在 `settings.register()` 的 scope 上；`agent-default-model` 已被核心注册。正确观察是 `ctx.on("settings/updated", (ns, next, prev, source) => …)`（以及 `settings/document-updated`）。
- 目录里各模型已有 `reasoningEfforts`。能力在，缺的是跨模型持久化。不是 Codex / Grok hop，也不是 hytime/dsh-thinking-effort。

### 根因

DSH 换模型从不复制上一档 effort。只 `mutate` YAML 或给 oauth-* 路由写 `reasoning:` 都不能修活选择器：前者赶不上 `selectForNextRequest`；后者变成整条路由的 `defaultEffort`，藏掉 Default 行，而且 GLM/Claude 子集会 `UNSUPPORTED_REASONING_EFFORT`。

### 修复

- **不要**写 `llm-pi-ai.providers.oauth-*.reasoning`。
- **不要** `settings.replace` 整节 `agent-default-model`，除非连 provider+model 一并重写（那正是 DSH 清 effort 的写法）。`saveSelection({ provider, model, reasoningEffort })` 可以，因为它重述了三者。
- 用 `settings/updated`（`ns === "agent-default-model"`）缓存上次**显式**档到内存 + `<dataDir>/reasoning-effort.json`。省略 / Default 不记。`off` 仅在用户明确选 Off 时记。
- oauth-* 换模型且 effort 消失：按**新**模型 `reasoningEfforts` 键还原；`xhigh`/`max` 没有则夹到最高可用（`max` > `xhigh` > `high` > `medium` > `low`）。`reasoningEfforts: false` 跳过。
- 活会话：对当前已是该 provider/model 的 session 调 `sessionController.selectModel({ sessionId, provider, model, reasoningEffort })`，让 `selectForNextRequest` **带着** effort 再跑一遍。没有 session API 时退到 `agentDefaultModel.saveSelection` 或 `settings.mutate` 只写 `reasoningEffort`——此时当前 composer 仍停在 Default，需要再选一次模型才会跟上。
- 已是目标档的事件直接忽略，避免环。

### 验证

- `npm test`：目标有该档则 `selectModel`；AG 上 xhigh→high；非 oauth no-op；`settings/updated` 回写不环；`reasoning-effort.json` 读回；`syncHarnessModels` **不**写 provider `reasoning`。Codex / Grok hop 未改。

## 2026-08-31：Antigravity 套餐 pill 显示 STANDARD TIER

### 现象

设置 → Antigravity。已登录卡抬头是邮箱 + **STANDARD TIER** + **使用中**。用户有 Google AI Pro/Ultra 时也不显示 Pro / Ultra。

### 证据

- `loadCodeAssist` 对 Google AI Pro 返回 `currentTier.id = standard-tier` / `STANDARD TIER`（Gemini Code Assist SKU），真正订阅在 `paidTier.id = g1-pro-tier`（gemini-cli#22648，`g1-ultra-tier` 同理）。
- `antigravityPlanType` 只读 `currentTier`。`fetchAntigravityQuota` 又优先用登录时写入的 `session.planType`，刷新额度也不会改 pill。
- `ANTIGRAVITY_PLAN_NAMES` 没有 `standard_tier` / `g1_pro_tier`，`formatPlanLabel` 对全大写原样吐出 STANDARD TIER。

### 根因

额度层。把 Code Assist 的 currentTier 当成 Antigravity / Google AI 套餐。

### 修复

- `antigravityPlanType` / 额度刷新优先 `paidTier`，没有才回落 `currentTier`。
- 映射：`g1-pro-tier` → Pro，`g1-ultra-tier` → Ultra，`free-tier` → Free，`STANDARD TIER` → Standard。

### 验证

- `npm test`：paidTier + currentTier 并存时 planLabel 是 Pro；只有 STANDARD TIER 时是 Standard。

## 2026-08-31：Kiro Social 换票仍 HTTP 500（#39 两边都 origin-only）

### 现象

用户本地已是 0.0.42（#38 / #39）。设置 → AWS Kiro Social，浏览器走完授权后，插件 `exchangeKiroSocialCode` 仍回：

```
kiro social token failed (HTTP 500): {"message":"Oops, something went wrong. Please try again later."}
```

与 #38 / #39 用户报错原文相同。

### 证据

- 授权 URL 的 `redirect_uri` 已是 origin-only `http://localhost:<port>`（#39，对齐 KiroIDE portal）。
- 换票 POST 体也用 `kiroSocialRedirectUri` 裁成 origin-only。`OAuthFlowManager.settle` 只交出 `code`，丢掉落地 path 与 `login_option` / `loginOption`。
- cockpit-tools `kiro_oauth.rs`（同一 portal `https://app.kiro.dev/signin`、同一端口、同一 token host）：portal 注册 origin-only；换票 `redirect_uri` 是 `http://localhost:<port><actualPath>?login_option=<google|github>`。actualPath 是浏览器真正打到的 `/oauth/callback` 或 `/signin/callback`；`login_option` 来自回跳 query，小写。换票 JSON 仍只有 `{ code, code_verifier, redirect_uri }`。
- 听 `127.0.0.1`、对外 hostname 必须是 `localhost`。注册 URI 里不能再出现 `127.0.0.1`。
- 次要：`KIRO_USAGE_VERSION` 仍是 `0.9.2`；GitHub Kiro 议题写现 IDE 是 **1.0.0**。`exchangeKiroSocialCode` 对空 session 调 `kiroMachineId()`，每次登录新 64-hex。`/kiro/v1/chat/completions` 仍是 501（translator 不在本 PR）。本机无 Kiro.app、settings.yaml 尚无 `oauth-kiro`。

### 根因

本插件 Kiro Social PKCE。#39 把授权和换票都收成 origin-only，修了 hostname，但 Kiro auth 服务要的是**落地回调 URL**（path + `login_option`）。不是 Codex / Grok / GLM / Antigravity。对话 501 是另一层，本条只修登录 500。

### 修复

- `waitCode()` 仍只返回 code 字符串（Codex / Grok / Antigravity 不变）。Kiro 额外 `attempt.callback()`：pathname + `login_option`（及可选 `issuer_url`）。
- `kiroSocialTokenRedirectUri`：origin + 落地 path；有 `login_option` 时加 `?login_option=`。缺 query 仍带真实 path，不再 origin-only。
- 授权 URL 继续 origin-only。`127.0.0.1` 在授权/换票 `redirect_uri` 里改写成 `localhost`。回跳仍接受 `/`、`/oauth/callback`、`/signin/callback`。
- UA 改为 `KiroIDE-1.0.0-<64hex>`。打开授权页之前分配并挂在 attempt 上的 `machineId`，换票复用；已有 Kiro 会话则沿用其 machineId。

### 验证

- `npm test`：授权 query 仍是 `http://localhost:<port>`；换票 body 含 `/signin/callback?login_option=google`（模拟回跳）；`127.0.0.1` 不出现在授权或换票 `redirect_uri`；UA `KiroIDE-1.0.0-<64hex>`；同一次登录 authorize 前与换票共用一个 machineId。无 live AWS 调用。不实现 generateAssistantResponse 翻译。

## 2026-08-31：Antigravity 对话 403 VALIDATION_REQUIRED 被 DSH 显示成「API 密钥无效」

### 现象

用户 Mac，插件 0.0.42。OAuth 登录成功，`GET /antigravity/v1/models` 200，`DSH_OAUTH_SUBS_API_KEY` 与 `proxy-key` 一致（32 字符），settings.yaml 有 `oauth-antigravity`。对话 `POST /antigravity/v1/chat/completions` 被 Google Cloud Code 回 **HTTP 403**：

```
PERMISSION_DENIED / VALIDATION_REQUIRED / "Verify your account to continue."
domain cloudcode-pa.googleapis.com
```

`validation_url` 是一次性 Google continue 链接（带 `plt=`，不记入本条）。daily-cloudcode-pa 与 cloudcode-pa 都是同一 403。额度条正常：`loadCodeAssist` / `fetchAvailableModels` 不走这道闸。

DSH **不是**从 Google 原文发明「API 密钥无效」。会话 `b8ebc450-a911-4716-90c2-64c340989947`（08:35 CST，`oauth-antigravity` / `gemini-3.7-flash-high`）：`failure.code` = **`AUTH`**；i18n `message.turnError` = 「本轮运行失败」，`message.failure.auth` = 「API 密钥无效」。llm-pi-ai 把插件转发的 **401/403** 收成 AUTH 就会显示这句。

### 证据

- 代理原样转发上游 403 JSON → DSH 标 AUTH → 「本轮运行失败 API 密钥无效」。
- 额度 API 不触发 VALIDATION_REQUIRED，所以卡片上看起来「已登录、额度可用」。
- 这不是 refresh token 失效，不能当 permanent refresh 清会话。

### 根因

代理层（`forwardAntigravity`）。OAuth bearer 有效，Cloud Code 仍要求 Google 账号验证才能 `generateContent`。DSH 把 403 当成密钥 AUTH。不是 Codex / Grok hop，也不是本机 proxy-key 错了。

### 修复

- `parseAntigravityValidation` 识别 `VALIDATION_REQUIRED` / `Verify your account`，抽出 `validationUrl`。
- 会话与 snapshot 记 `needsValidation` + `validationUrl`（Settings 卡展示）。不把 `plt=` 打进日志。
- 设置页 Antigravity 卡：中文条「Google 需要验证此账号才能对话」+ 打开 `validationUrl` 的按钮。
- 对话错误改写为 **HTTP 400**（非 AUTH 状态），`error.message` 中文验证句、`error.code: VALIDATION_REQUIRED`。绝不回 Google 原始 403/401。
- `isAntigravityPermanentRefreshError` 对 VALIDATION_REQUIRED 为 false，不清登录。
- 登录后 / 点刷新额度时用极小 `generateContent` 探测，卡片可在再次对话前出现横幅。

### 验证

- `npm test`：检测 + 改写后的 400（不是 401/403）+ snapshot 字段 + Settings 文案 + permanent-refresh 不为真。无 live Google 调用。不打印 `plt=`。

## 2026-08-30：Kiro Social 登录在 #38 之后仍会 Google 500

### 现象

用户已装 0.0.41（#38 授权/换票共用 origin-only `redirect_uri`）。设置 → AWS Kiro Social，走 Google 社交登录时 Cognito 仍回 `Oops, something went wrong`（HTTP 500）。本机 dummy code 仍是 400，真 code + 对不上的 `redirect_uri` 是同一形态。

### 证据

- 官方 KiroIDE 注册的是 **`http://localhost:3128`**（hostname `localhost`，无 path）。
- #38 之后插件仍 `kiroSocialFlow().listen.host === '127.0.0.1'`，`OAuthFlowManager` 拼出 `http://127.0.0.1:${port}/oauth/callback`，`kiroSocialRedirectUri` 裁成 `http://127.0.0.1:${port}`。Cognito `redirect_uri` 精确匹配，Google 社交常见 500。
- `listenHosts`：`host === 'localhost'` 才绑 `127.0.0.1` + `::1`；redirect 却写 `http://${spec.listen.host}`。两边必须同时是 `localhost`。
- 回跳 handler 只认 `pathname === '/oauth/callback'`。Origin-only 注册后浏览器可能落到 `/`、`/oauth/callback` 或 `/signin/callback`。

### 根因

本插件 Kiro Social PKCE。#38 修了 path 漂移，没修 **hostname**（`127.0.0.1` vs `localhost`），也没放宽 Kiro 回跳 path。不是 Codex / Grok / GLM / Antigravity。

### 修复

- `kiroSocialFlow().listen.host = 'localhost'`。loopback 仍绑 `127.0.0.1` + `::1`，注册/换票 origin 是 `http://localhost:<port>`。
- Kiro 回跳额外接受 `/` 与 `/signin/callback`（`callbackPaths`）。Codex / Grok / Antigravity 仍只认各自的 `callbackPath`。
- 换票仍 origin-only；`redirect_from: KiroIDE`；UA 仍 `KiroIDE-${KIRO_USAGE_VERSION}-${machineId}`。不打印 token。

### 验证

- `npm test`：授权 query 与换票 body 都是 `http://localhost:<port>`；loopback 对 `/` 和 `/oauth/callback` 收 code；Codex `/` 与 `/oauth/callback` 仍 404。无 live AWS 调用。

## 2026-08-30：GLM Coding Plan 思考链被清、Antigravity sessionId 用 Date.now

### 现象

0.0.41 已有 GLM `developer`→`system`（#37）和 Antigravity Struct wrap（#36）。真实对话仍断：GLM-5.3 / Flash 不带 `thinking.clear_thinking: false`，或把上一轮 `reasoning_content` 丢掉，前缀对不上；Antigravity `openaiToAntigravity` 在缺 `sessionId` 时写成 `` `-${Date.now()}` ``，既打爆 prompt cache，也可能让 hub 400。

### 证据

- 官方思考模式：https://docs.z.ai/guides/capabilities/thinking-mode 。5.3 / Flash 强制 thinking，`type: disabled` 400。Coding Plan 要保思考前缀必须 `clear_thinking: false` **且** 原样回放 `reasoning_content`。Turbo 是 hybrid，不能强关。
- DSH 助手消息常用别名 `reasoning`，不是 Zhipu 的 `reasoning_content`。
- `rewriteUpstreamBody` 只给 `codex` / `grok` 钉 `prompt_cache_key`。GLM hop 的 `x-session-id` 是进程启动时随机的 `GLM_PROCESS_SESSION_ID`，插件一重启就换，也跨会话共用。
- Antigravity `request.sessionId` 回退 `-${Date.now()}`。

### 根因

代理层。不是 DSH host，不是 fs-search。Codex / Grok 钉 key 行为本来就是对的。

### 修复

- `normalizeGlmChatBody`：5.3 / Flash 始终 `thinking: { type: 'enabled', clear_thinking: false }`；Turbo 不强制关，thinking 开着时补 `clear_thinking: false`。不剥 `reasoning_content` / `reasoning`；DSH `reasoning` 抄到 `reasoning_content`。角色改写保留。
- `codexCacheSessionId` 抽到 `src/utils/cache-session.ts`，GLM / Antigravity 也从 `prompt_cache_key` || `session_id` 钉同一套 1–64 `[A-Za-z0-9._:-]`。
- GLM hop：`glmUpstreamHeaders(session, pin)` 的 `x-session-id` 用该 pin（按 DSH 会话稳，不按进程）。`x-request-id` / `x-zcode-trace-id` / `x-query-id` 仍每请求随机。额度/biz 无 pin 时仍用进程 `sess_<24hex>`。
- Antigravity hop 先走 `rewriteUpstreamBody`，再把 pin 交给 `openaiToAntigravity`。**永不** `-${Date.now()}`；两边都缺时用稳定常量 `dsh-antigravity`。
- 不把 Codex-only `prompt_cache_retention` / `prompt_cache_options` 转给 GLM / AG。

### 验证

- `npm test`：developer→system 仍在；`thinking.clear_thinking === false`；assistant `reasoning` → `reasoning_content`；`x-session-id` 等于 pin；Antigravity tool 数组仍包 Struct；`sessionId` 等于 DSH pin，不匹配 `/^-\d+$/`；Codex / Grok 钉 key 行为不变。无 live Zhipu / Google 调用。

## 2026-08-30：Antigravity Gemini 长会话 400 INVALID_ARGUMENT（function_response 列表）

### 现象

DSH web，模型 Gemini 3.7 Flash High，长会话约 151 步。本轮失败：

```
400 INVALID_REQUEST
Invalid JSON payload received. Unknown name "response" at
'request.contents[109].parts[0].function_response': Proto field is not repeating,
cannot start list.
```

同样的字段违规出现在 `contents[134]`。`status: INVALID_ARGUMENT`。

### 证据

- 用户截图，daily-cloudcode-pa `generateContent` / `streamGenerateContent`。
- 本插件 `POST /antigravity/v1/chat/completions` → `openaiToAntigravity` 把 OpenAI `role: tool` 转成 Gemini `contents[].parts[].functionResponse`。
- Gemini proto：`FunctionResponse.response` 是**单个** `Struct`，`functionResponse` 本身也不是 repeated。多工具结果必须是**多个 parts**，每个 part 一个对象。
- 旧 `tryJson`：对象（含数组）原样返回；JSON 字符串 `JSON.parse`。OpenAI / DSH 的 tool `content` 经常是 part 数组或 `"[...]"`，于是 `functionResponse.response` 变成 JSON 数组。

### 根因

代理转换层（`src/oauth/antigravity/request.ts`）。`response` 被赋成数组后，protobuf JSON 把 `response` 当成要开 list 的 repeated 字段，Struct 不是 repeating → 400。不是 Codex 前缀、不是 DSH host、不是 fs-search。Codex / Grok / GLM / Kiro 不走这个 converter。

### 修复

`functionResponsePayload`（只用于 tool 结果，不用 `typeof === 'object'` 当 Struct）：普通对象原样作为 `response`；数组 / `JSON.parse` 出的 null / number / bool 包成 `{ result: … }`；非 JSON 字符串仍走原来的 `{ text: value }`。连续 `role: tool` 合成一条 user content 的多个 `functionResponse` parts。绝不把 `functionResponse` 或 `response` 写成 JSON 数组。`functionCall.args` 仍走 `tryJson`。

### 验证

- `npm test`：`openaiToAntigravity` 对 tool content 为 JSON 数组字符串、真实数组、JSON 对象字符串、普通字符串、null/空；连续两条 tool → 两个 parts；复现 400 的数组 fixture 不再发出 `"functionResponse":[` 或 `"response":[`。

## 2026-08-30：GLM 首轮 400 `1214 角色信息不正确`

### 现象

DSH web，新会话第一轮（1 round / 1 step），模型 GLM-5.3-Flash Max。注入 AGENTS.md、CLAUDE.md、`@deepseek-ai/dsh-system-prompt` 后：

```
本轮运行失败 400: {"code":"1214","message":"角色信息不正确"}
INVALID_REQUEST
```

### 证据

- 本插件 `POST /glm/v1/chat/completions` → `glmCodingUrl`（`api.z.ai` / `open.bigmodel.cn` `/api/coding/paas/v4/chat/completions`），`rewriteUpstreamBody('glm')` 只跑 `applyFastMode`，`messages` 原样转发。
- DSH / llm-pi-ai 系统提示走 OpenAI `role: "developer"`。Zhipu Coding Plan Chat Completions 只认 `system` / `user` / `assistant` / `tool`。`developer` 就是 1214。
- 公开复现：openclaw#23115、openai/codex#9612。

### 根因

代理层（本插件）。GLM hop 没有把 instructional 角色收成 Zhipu 允许的四个。Codex Responses 自己吃 `developer`；Grok / Antigravity / Kiro 不走这条 chat/completions 改写。

### 修复

`src/oauth/glm/request.ts` `normalizeGlmChatBody`：有 `messages` 时，`developer` 以及其它未知 instructional 角色 → `system`。`system` / `user` / `assistant` / `tool` 不动；`tool_calls` / `tool_call_id` 原样。只有 `input`、没有 `messages` 的 body 不改。`rewriteUpstreamBody` 仅 `family === 'glm'` 调用。

### 验证

- `npm test`：DSH 形 `developer`+user → `system`+user；已是 `system` 不变；`tool` 仍是 `tool`；Codex / Grok body 的 `developer` 不被这条改写。无 live Zhipu 调用。

## 2026-08-30：Kiro Social 换票 HTTP 500（redirect_uri 授权/换票不一致）

### 现象

设置 → AWS Kiro Social，未登录。浏览器走完 `打开授权页` 后，插件 `exchangeKiroSocialCode` POST `https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token`，AWS 回：

```
失败: kiro social token failed (HTTP 500): {"message":"Oops, something went wrong. Please try again later."}
```

本环境 dummy code 是 HTTP 400 `Bad request`（端点活着）。真 code + 对不上的 `redirect_uri` 是 Cognito 常见的 500 形态。

### 证据

- `kiroSocialFlow().buildAuthorizeUrl` 用 origin：`http://127.0.0.1:3128`（`redirect_from=KiroIDE`）。
- `OAuthFlowManager.start` 存的是完整回跳：`http://127.0.0.1:3128/oauth/callback`。
- `completePkce` 把 `attempt.redirectUri` 原样交给 `exchangeKiroSocialCode`，换票 JSON 是 `{ code, code_verifier, redirect_uri }` 带 path。
- CLIProxyAPI / kiro.rs social 换票体同样三个字段，但 `redirect_uri` 必须和授权时一样（origin，无 path）。KiroIDE 仍会打到 `/oauth/callback`。
- 换票 UA 曾是裸 `KiroIDE-0.9.2`；refresh 已是 `KiroIDE-0.9.2-<64hex>`。

### 根因

代理层（本插件 Kiro Social PKCE）。授权和换票的 `redirect_uri` 漂移。不是 loopback 端口/path，也不是 Codex / Grok / GLM / Antigravity。

### 修复

`kiroSocialRedirectUri` 一律裁成 origin，授权 URL 和换票 body 共用。换票头对齐 CLIProxyAPI social：`Accept: application/json, text/plain, */*`，`User-Agent: KiroIDE-0.9.2-<64hex>`（`kiroMachineId`，与 refresh 同形）。回跳端口和 `/oauth/callback` 不动。

### 验证

- `npm test`：授权 query 与换票 body 的 `redirect_uri` 都是 origin；UA 匹配 `KiroIDE-0.9.2-<64hex>`；把 path 写回换票 body 会红。无 live AWS 调用。

## 2026-08-30：勾选 GLM / Antigravity / Kiro 不写 settings.yaml

### 现象

0.0.38 live web profile。设置 → OAuth 订阅 → 模型：OAuth · GLM 3/3、OAuth · Antigravity 13/13、OAuth · Kiro 3/3（未登录灰显「登录后同步」）。打开 DSH 配置文件，`llm-pi-ai.providers` 只有 `oauth-codex` / `oauth-grok` / 其它非本插件路由，**没有** `oauth-glm` / `oauth-antigravity` / `oauth-kiro`。

### 证据

- `~/.dsh/settings.yaml` `llm-pi-ai.providers` keys：`opencode-go`、`oauth-codex`、`oauth-grok`、`deepseek`。
- `models.json`：GLM 当前三条不在 `disabled`（只有退役 glm-4.7/5/5.1/5.2）——选择器 3/3 正确，yaml 仍无路由。Antigravity 当前 13 个 id 里 12 个在 `disabled`（只留 `gemini-3.7-flash-high`）；全选/勾选没清掉，yaml 也没有 `oauth-antigravity`。`enabled: []`。
- `auth.json` 有 glm + antigravity 会话，无 kiro（Kiro 灰显符合预期）。
- 不是 PR #23 残留全关：那条只在**当前 catalog key 全关**时恢复。GLM 3/3 已开、AG 1/13 已开，`recoverEmptyLoggedInFamilies` 不会跑。

### 根因

DSH `@deepseek-ai/dsh-llm-pi-ai` 的 profile schema 只接受 `api: openai-completions | openai-responses | anthropic-messages`（`Schema.union`）。GLM / Kiro / Antigravity 本地 hop 是 chat completions（`/glm/v1`、`/kiro/v1`、`/antigravity/v1`），却写成了裸 `api: 'openai'`。`settings.mutate('llm-pi-ai', …)` 整段校验失败后**保留上次合法 section**，所以 Codex/Grok 的 `openai-responses` 还在，glm/ag/kiro 的 `set`（以及同批 `unset`）都是空操作。启动 `controller.sync()` 把失败吞成 `llm-pi-ai sync failed` warn。dsh-plugin-cpa-local 从不写裸 `openai`。

### 修复（0.0.40）

- GLM / Kiro / Antigravity 改为 `api: openai-completions`，保留 `compat.supportsReasoningEffort` + `thinkingFormat: openai`（GLM/AG）。Codex/Grok 仍是 `openai-responses`。不改成 Responses，避免把 Responses 体打到 completions hop。
- `syncHarnessModels` 不再吞 mutate：包一层 `llm-pi-ai mutate failed: …`，`setModels` RPC 原样抛给选择器。能 `settings.get` 时回读，缺 `providers.oauth-*` 当失败。
- 已登录且至少一条当前 catalog key 开启 ⇒ `set` 该路由（AG 12/13 关也写那一条；全选清当前 `disabled` 再写满）。主动全关仍 unset。Kiro 未登录选择器继续锁；登录 / `onAuthChanged` 的 `sync()` 写 `oauth-kiro`。

### 验证

- `npm test`：假 settings store 校验 DSH `api` union。已登录 GLM 3/3 / AG 全选 / Kiro sync 的 mutations 含 `set`，随后 `get` 看得到 `providers.oauth-*`。裸 `api: openai` 整批拒绝、store 不变。mutate 失败从 `setModels` 抛出。Kiro catalog 以 kiro.dev（#33）为准。

## 2026-08-30：Antigravity 已登录卡没有额度条

### 现象

设置 → Antigravity。已登录卡抬头是邮箱 + **STANDARD TIER** + **使用中** + **退出**，卡身空白。没有 Claude/GPT、Gemini 分组进度条。

### 证据

- `src/oauth/quota.ts` `QuotaStore.#load`：`provider === 'antigravity'` 直接写入 `{ status: 'idle', planType: session.planType, rows: [] }`，不打 Cloud Code。
- `test/antigravity.test.ts` 原断言 `snapshot shows idle quota`，`fetchFn` 抛 `must not hit a quota API`。
- `docs/error.md` 0.0.38 指纹条写过「没有公开的 Antigravity 额度 API」。
- SkillStar 权威路径：`crates/skillstar-usage/src/cloud_code.rs`（`load_code_assist` + `fetch_model_quotas` + `parse_model_windows`）与 `fetchers/oauth/antigravity.rs`。

### 根因

额度层（本插件）。0.0.38 接了登录 / 指纹 / 聊天 hop，额度故意 idle。UI 对 `status === 'idle'` 整块不渲染（`QuotaBlock` return null），所以不是「读失败」，是从未请求。

### 修复（0.0.40）

抄 SkillStar 分组，主机跟 hub daily（#34），不另发明接口：

1. `POST https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`，Bearer + 现有 `antigravity/hub/<ver> <os>/<arch>`。daily 5xx / 传输失败才回落 prod `cloudcode-pa`。4xx 不回落。
2. Body：`{ metadata: { ideType: "ANTIGRAVITY" } }`；有 `session.projectId` 时加 `cloudaicompanionProject` 与 `metadata.duetProject`。缓存 project 400 则去掉 project 再打一次。
3. `POST` 同一 daily host `v1internal:fetchAvailableModels`，body `{ project }` 或 `{}`。回落规则与聊天相同。401 = 鉴权失败。
4. `models` 按 SkillStar `antigravity_quota_groups()` 分组；`remainingFraction` / `remaining_fraction` / `remaining`（含 `"75%"`）；缺 remaining 但有 `resetTime` 当 0。组内取 min。`remainingPercent = round(remaining*100)`。
5. 行 `kind: 'product'`，标签用组名（`gemini-3.1-flash-image` 用 `displayName`）。套餐 pill 仍用 session 的 STANDARD TIER / `antigravityPlanType`。失败 `status: error` + 现有 `quotaFailed`，不再静默空卡。不加 GLM 的 150%配额。

### 验证

- `npm test`：SkillStar fixture `0.25` / `"75%"` / `1.0` 分出 Claude/GPT 25%、Gemini 3.1 Pro Series 75%、Gemini 2.5 Flash 100%、Gemini 3.1 Flash Image 50%。
- QuotaStore 有 session 时不再 idle；happy path 只打 daily；load 500 → `error`。Codex / Grok / GLM / Kiro 额度测试未改行为。

## 2026-08-30：Antigravity 聊天打了 IDE 的 prod Cloud Code，不是 hub daily

### 现象

插件把 `loadCodeAssist` / `generateContent` / `streamGenerateContent` 打到 `https://cloudcode-pa.googleapis.com`。那是 **Antigravity IDE.app** 的 `--cloud_code_endpoint`（`--subclient_type ide`），不是要模仿的 **Antigravity.app / hub**。

### 证据

用户本机 Mac，`/Applications/Antigravity.app` 2.11.0，`~/Library/Logs/Antigravity/main.log` 最近一次 spawn（2026-08-30 15:35）。身份相关 flag（不含 csrf / host_bridge token）：

- `--standalone --override_ide_name antigravity --subclient_type hub --override_ide_version 2.11.0 --override_user_agent_name antigravity`
- `--api_server_url https://generativelanguage.googleapis.com`（Gemini API，不是 coding hop）
- `--cloud_code_endpoint https://daily-cloudcode-pa.googleapis.com`
- AutoUpdater latest **2.11.0**

同会话 `language_server.log` 实际 POST：

- `https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`
- `https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`

该分钟没有聊天，没有 `streamGenerateContent` 行；coding RPC 按同一 `--cloud_code_endpoint` 推断为 **daily**。对照：Antigravity IDE.app 走 `--subclient_type ide --cloud_code_endpoint https://cloudcode-pa.googleapis.com`，不要模仿。

### 根因

代理层。0.0.38 把 CLIProxyAPI 的 prod `cloudcode-pa` 当默认 API host；只有 `onboardUser` 打 daily。hub UA（`antigravity/hub/…`）配 IDE 主机，和官方 Antigravity.app 不一致。

### 修复（0.0.40）

- 默认 Cloud Code = `https://daily-cloudcode-pa.googleapis.com`。
- `loadCodeAssist` / `fetchAvailableModels` / `generateContent` / `streamGenerateContent` 先打 daily。`onboardUser` 本来就是 daily，不动。
- daily 传输失败或 5xx 才回落 prod `cloudcode-pa`（IDE/prod fallback，不是 hub 默认）。4xx 不回落。
- UA 仍是 `antigravity/hub/<ver> {os}/{arch}`（`--subclient_type hub` + `--override_ide_version` + `--override_user_agent_name antigravity`）。版本优先 Antigravity.app 2.11.0，不读 IDE.app 2.5.5。
- 聊天头只有 User-Agent；body `ideType: ANTIGRAVITY`。DSH 入站 `/antigravity/v1/chat/completions` 仍是本机 openai-completions；上游是 daily `v1internal:generateContent` / `streamGenerateContent`。
- 不把 csrf / host_bridge token 写进代码或文档。

### 验证

- `npm test`：hub RPC URL 锁在 `daily-cloudcode-pa`；登录 / 聊天 happy path 不打 prod；daily 503 才回落 prod；403 不回落；UA 仍是 hub 形。

## 2026-08-30：Antigravity 指纹版本停在 2.9.1，不像现网桌面

### 现象

`antigravityVersion()` 永远返回 `ANTIGRAVITY_FALLBACK_VERSION = '2.9.1'`，不读本机官方桌面。cloudcode-pa 聊天 / loadCodeAssist 的 UA 是 `antigravity/hub/2.9.1 <os>/<arch>`。用户本机 Mac 官方客户端是 **Antigravity.app 2.11.0**（`com.google.antigravity`）。同机还有 **Antigravity IDE.app 2.5.5**（`com.google.antigravity-ide`），不能拿来当 UA 版本。

### 证据

- 本机 `/Applications/Antigravity.app` `CFBundleShortVersionString` **2.11.0**。
- `/Applications/Antigravity IDE.app` 是 2.5.5，忽略。
- 官方 language_server 的 protobuf `ClientMetadata.ide_type` 是 `ANTIGRAVITY`；UA 运行时格式化（日志 `Request User-Agent to %s`），不是写死的 `hub/2.9.1`。
- CLIProxyAPI `AntigravityRequestUserAgent` 形状仍是 `antigravity/hub/{ver} {os}/{arch}`。官方 Manager 聊天 hop **不**发 `Client-Metadata` / `x-goog-api-client`。
- SkillStar `crates/skillstar-usage/src/cloud_code.rs` `detect_ide_version`：macOS 读 `Antigravity.app` Info.plist，Windows `LocalAppData\Programs\antigravity\Antigravity.exe` FileVersion，linux `antigravity --version`。

### 根因

代理层（本插件）。0.0.38 抄了 CLIProxyAPI 的 hub UA + `ideType: ANTIGRAVITY`，但版本只留了 CLIProxyAPI 的 2.9.1 地板，没有读官方 Antigravity.app。

### 修复（0.0.40）

- 地板改为 **2.11.0**（当前官方桌面）。
- `antigravityVersion()` 优先本机 Antigravity.app 短版本（同上 SkillStar 三端探测），读不到再用 2.11.0。**不**读 Antigravity IDE.app。
- 保持 hub UA、`ideType: ANTIGRAVITY`、聊天头只有 User-Agent。不把 OAuth client secret 从二进制再抄一遍（插件已有官方 client id）。

### 验证

- `npm test`：地板 2.11.0；plist / CLI / FileVersion 解析；UA 匹配 `antigravity/hub/<ver> darwin/arm64`（或本机 platform）；UA 无 `dsh-plugin`；chat 头无 `Client-Metadata` / `x-goog-api-client`。

## 2026-08-30：GLM 对话/额度带第三方 UA，拿不到 ZCode 1.5 倍额度

### 现象

官方限时（至 2026-08-31）：「GLM Coding Plan 用户在 ZCode 中登录使用即可享受全天 1.5 倍使用额度」，同等调用按 67% 扣减。本插件走 `api.z.ai` / `open.bigmodel.cn` 的 `/api/coding/paas/v4` 与 `/api/monitor/usage/quota/limit` 时，`User-Agent` 是 `dsh-plugin-oauth-subs/0.0.22`，没有 `X-ZCode-*` / `Referer` / `X-Title`，上游按第三方客户端记账，吃不到 Desktop 加成。

### 证据

- `src/oauth/glm/index.ts`：`GLM_USER_AGENT = 'dsh-plugin-oauth-subs/0.0.22'`；`glmUpstreamHeaders` 只发 Bearer + accept + 该 UA。
- 对话 hop：`src/oauth/proxy.ts` `POST /glm/v1/chat/completions` → `glmCodingUrl`，`headersOf: glmUpstreamHeaders`。`forward()` 原样展开 `headersOf`，不会剥额外头。
- 额度：`fetchGlmQuota` 同样用 `glmUpstreamHeaders`。
- 官方 Desktop 3.10.1（2026-08-28，https://zcode.z.ai/en/changelog）。Coding Plan hop 的指纹来自 Desktop `resources/glm/zcode.cjs` 的 `eao()` / `rao()`，不是 Electron host 对 `zcode.z.ai` 的 `Z Code@electron` / `ZCode/unknown`（旧 dump：vibe-coding-labs/zcode-reverse-engineer）。不要抄 CLIProxyAPI 的 claude-cli 伪装头。

### 根因

代理层（本插件）。把插件名写进 Coding Plan 上游 UA，Z.ai 按非 ZCode Desktop 计费。

### 修复（0.0.38）

`glmDesktopHeaders` / `glmUpstreamHeaders` 与 biz GET/POST（`api.z.ai` / `open.bigmodel.cn` 的 login、customer、api_keys、quota）改为 Desktop 3.10.1：

- `User-Agent: ZCode/3.10.1 ai-sdk/anthropic/3.0.81`
- `X-ZCode-App-Version: 3.10.1`，`X-ZCode-Agent: glm`
- `x-zcode-trace-id` / `x-request-id` / `x-query-id` 每请求新 hex；`x-session-id` 进程内稳定 `sess_<24hex>`
- `HTTP-Referer` + `Referer: https://zcode.z.ai`，`X-Title: Z Code`

`zcode.z.ai` CLI init/poll 用 `ZCode/3.10.1`，不带 Desktop 套件，也不带插件名。`GLM_KEY_NAME` 仍是本地 key 标签，不进 UA。

### 验证

- `npm test`：UA / X-ZCode / Referer / X-Title 锁定；每请求 id 变化、session id 稳定；chat/quota/biz hop 头里没有 `dsh-plugin-oauth-subs`。
- 代理 `POST /glm/v1/chat/completions` 原样转发这些头。

## 2026-08-30：GLM 卡要看见官方「150%配额」限时加成

### 现象

ZCode Coding Plan 限时：在 ZCode 里登录使用全天 1.5 倍额度（同样调用按 67% 计）。用户要设置页已登录 GLM 账号卡上直接看到 **150%配额**，不要只写在说明里。

### 根因

账号卡 pill 只有套餐 / 使用中 / 中国（全球）。没有加成标记。额度条数学也不该改——这是展示文案，不是把 used/total 乘 1.5。

### 修复（0.0.38）

已登录 GLM 卡抬头 pill 行加 **150%配额**（en **150% quota**）。额度标题下多一行 `ZCode 登录使用享 150%配额` / `ZCode session: 150% quota`。不做日期开关。Codex / Grok / Antigravity 卡不出现。额度数字不动。

### 验证

- `npm test`：GLM 卡 render 含 `150%配额` / `150% quota`；codex / grok / antigravity 不含。

## 2026-08-30：GLM 账号卡身份显示 zcode，不是邮箱

### 现象

设置 → 智谱 GLM。已登录卡抬头是 **zcode**，后面 LITE / 使用中 / 中国。本机 vault `activeId: zcode@bigmodel`，`account: "zcode"`。

### 证据

用户现场截图。BigModel CLI poll 经常没有 `user.email`；`completeGlmCli` 把 `session.account` 写成 `ready.email ?? ready.accountId`，`accountId` 落到 CLI app id `zcode`（`GLM_BIGMODEL_APP_ID`）。`publicSession('glm')` 原样输出 `session.account`。

### 根因

身份层（`completeGlmCli` / `publicSession` / 导入）。没有解码 poll JWT，也没打 ZCode 用的 userinfo。`zcode` / `zai` / `bigmodel` / `glm` 是站点/客户端 id，不是用户。

### 修复（0.0.38）

- 可见身份只走邮箱或其它人类 id：poll 字段、JWT `email` / `preferred_username`（不验签）、ZCode userinfo。
  - 全球：`GET https://chat.z.ai/api/oauth/userinfo`（失败再试 `api.z.ai/api/biz/customer/getCustomerInfo`）
  - 中国：`GET https://open.bigmodel.cn/api/biz/customer/getCustomerInfo`
- `publicSession` / 卡抬头永不展示 `zcode` / `zai` / `bigmodel` / `glm`。
- `accountIdOf` 在有邮箱后是 `email@bigmodel`（或 `@zai`）。快照时若 vault 仍是 app id，能解析到邮箱就改写 session 并换 key，switch / logout 仍按新 id。

### 验证

- `npm test`：BigModel complete 无 poll email、JWT/userinfo 有邮箱 → `account` 不是 zcode；`publicSession` 对 `account: "zcode"` 不回 zcode。

## 2026-08-30：GLM 额度两条「本周期」，没有 5 小时 / 每周 / ZCode MCP

### 现象

同一张 GLM 卡额度区两条杠都标 **本周期**：`0 / 2000 · 剩余 100%` 和 `880 / 2000 · 剩余 56%`。官方 Coding Plan 是 5 小时窗口 + 每周窗口（Lite 2,000 / 10,000），MCP（Web Search / Web Reader / Zread）另算。

### 证据

用户现场截图。Lite 5 小时额度就是 2000；两条都是 2000 说明 weekly / MCP 被标成 `kind: 'cycle'`，或根本没从 `limits[]` 的 `unit`/`number`/`TIME_LIMIT` 认出来。

### 根因

`GET api.z.ai|open.bigmodel.cn/api/monitor/usage/quota/limit` 的 live 形状是 `data.limits[]`：

| type | unit | number | 窗口 |
|---|---|---|---|
| `CREDIT_LIMIT` / `TOKENS_LIMIT` | 3 | 5 | 5 小时（Lite usage=2000） |
| `CREDIT_LIMIT` / `TOKENS_LIMIT` | 6 | 1 或 7 | 每周（Lite usage=10000） |
| `TIME_LIMIT` | 5 | 1 | ZCode MCP；`usageDetails[].modelCode` = `search-prime` / `web-reader` / `zread` |

旧 `parseGlmQuota` 只拿 `duration`/`window` 判断 5h / week，没有就 `cycle` → UI **本周期**。CREDIT_LIMIT 行没有 duration 字符串。MCP 在同 URL 的 `TIME_LIMIT`；若只有 CREDIT_LIMIT，再 GET 同站 ` /api/monitor/usage/tool-usage`。不编造额度数字。

### 修复（0.0.38）

按 type / duration / name / `unit`+`number` 映射 `primary` / `weekly` / `mcp`。UI（仅 GLM）：**5 小时剩余** / **每周剩余** / **ZCode MCP**（en: 5-hour remaining / Weekly remaining / ZCode MCP），剩余百分比 + used/total。额度仍在账号卡内，刷新仍按卡。Codex / Grok 文案不动。

### 验证

- `npm test`：截图形 CREDIT_LIMIT（两条 2000）+ weekly 10000 + TIME_LIMIT MCP → 三行 kind 正确，没有 `cycle`。

## 2026-08-30：GLM 模型勾选 0/3，settings.yaml 没有 oauth-glm

### 现象

本机 DSH web profile，插件 0.0.33。设置 → 模型 → **OAuth · GLM** 显示 **已开启 0 / 3**（GLM-5.3、GLM-5.3-Flash、GLM-5-Turbo 全未勾）。用户勾选或点全选，DSH 里仍然没有这条路由。

### 证据

- `auth.json` `glm.activeId = zcode@bigmodel`，vault 里有 BigModel 会话（已登录）。
- `~/.dsh/profiles/web/data/dsh-plugin-oauth-subs/models.json` 的 `disabled` 含全部当前 GLM key：`oauth-glm/glm-5.3`、`oauth-glm/glm-5.3-flash`、`oauth-glm/glm-5-turbo`，外加旧 6 模型目录残留 `glm-4.7` / `glm-5` / `glm-5.1` / `glm-5.2`。
- `~/.dsh/settings.yaml` `llm-pi-ai.providers` 只有 `oauth-codex` 和 `oauth-grok`，**没有 `oauth-glm`**。

### 根因

`syncHarnessModels` 只给「已登录且至少有一条当前目录 key 开启」的系列写路由。`selectedForSync` + `filterProviders` 在当前三条全在 `disabled` 时丢掉 `oauth-glm`，mutate 先 unset 再也不 set。旧目录 6 行时的全关把后来仍在目录里的三条也写进了 `disabled`；全选必须打开**当前** id，不能只翻残留 key。登录后的 `sync()` 不会把「空选择器 / 残留全关」当成要恢复的状态，已登录 GLM 会卡在 0/3 且没有 DSH 路由。勾选本身（`toggle` / `setFamily`）对当前 catalog key 是有效的；锁到登录（`catalog[].loggedIn`）在 vault session 下应为 true，不是这次的阻断点。

### 修复（0.0.38）

- `setFamily(true)` 只 enable 当前 catalog id；`disabled` 里的退役 id 保持不动、不复活。
- 登录 / 启动 `sync()`：某系列已登录且当前 catalog key 全关时，视为残留全关，打开当前 key 再写入 `providers.oauth-glm`（`api openai`，`baseURL` origin `/glm/v1`，`compat.thinkingFormat openai`）。不复活退役 id。选择器里主动全关仍会 unset 路由（`setModels` 不走恢复）。
- snapshot `catalog` GLM `loggedIn: true` 当 `getSession('glm')` 是 vault 账号。

### 验证

- `npm test`：GLM 已登录 + 当前 key 全在 disabled → toggle `glm-5.3` → mutate 含 `oauth-glm` 且只有 `glm-5.3`。
- `setFamily('glm', true)` 打开 5.3 / Flash / Turbo，`disabled` 仍可留着 `glm-4.7`。
- `sync()` 在当前 GLM key 全关时恢复三条并写入路由。
- 选择器全关 GLM 仍 unset `oauth-glm`。

## 2026-08-30：Antigravity 第三方包装指纹不一致会被 Google 封

### 现象

第三方 Antigravity 包装用 Google OAuth 登录后，cloudcode-pa 对聊天返回 403 / 账号被拦。decolua/9router#1226：OAuth / loadCodeAssist 走 `IDE_UNSPECIFIED` / `PLATFORM_UNSPECIFIED` / `GEMINI` 字符串，聊天却走数字枚举 `ideType: 9` + `User-Agent: antigravity/…`。Google 按官方 IDE 指纹拦不一致的客户端。

### 证据

- decolua/9router#1226（第三方包装混用未指定字符串与数字 chat 头）。
- CLIProxyAPI 当前 `internal/auth/antigravity` + `internal/misc/antigravity_version.go`（main @ f0de1d0）：
  - 短 UA：`antigravity/hub/<version> <os>/<arch>`（userinfo、loadCodeAssist、generateContent）
  - 长 UA：短 UA + ` google-api-nodejs-client/10.3.0`（仅 onboardUser）
  - `X-Goog-Api-Client: gl-node/22.21.1`（仅 onboardUser；不是旧的 `google-cloud-sdk vscode_cloudshelleditor/0.1`）
  - loadCodeAssist metadata：`{"ideType":"ANTIGRAVITY"}` 字符串，不是 `IDE_UNSPECIFIED`，也不是数字 `9`
  - onboardUser metadata：`ide_type` / `ide_version` / `ide_name: antigravity`
  - 聊天体：`userAgent: "antigravity"` + 必填 `project`
- 0.0.38 当时没有公开的 Antigravity 额度 API；卡片照常画，额度块保持 idle。0.0.40 起额度走 daily `loadCodeAssist` + `fetchAvailableModels`（见上条）。

### 根因

控制面和聊天面必须是**同一套**官方 Antigravity IDE 身份。混用 Gemini CLI / `google-api-nodejs-client` 默认 UA / `dsh-plugin` / `CLIProxyAPI` / Node undici 默认 UA，或 OAuth 用未指定枚举而聊天用数字 `ideType: 9`，都会被当成第三方包装。空 `project` 的 generateContent 是 403 / 封号风险。

### 修复（0.0.38）

本插件只认一种编码，控制面和聊天共用：

1. 产品名永远是 Antigravity IDE。UA 家族是 `antigravity/hub/<version> <os>/<arch>`，版本下限 2.9.1（Cloud Code 拒 < 2.9.0）。
2. metadata 用 CLIProxyAPI 现网的**字符串** `ANTIGRAVITY`，不用 `IDE_UNSPECIFIED` / `PLATFORM_UNSPECIFIED` / `GEMINI`，也不改成数字 `ideType: 9`。数字枚举（`9` = ANTIGRAVITY，`pluginType: 2` = GEMINI，platform 1–5）是另一套官方形状；现网 CLIProxyAPI 控制面仍发字符串，混用两套才是 #1226 的炸点。
3. onboardUser 额外带 Node helper UA + `X-Goog-Api-Client: gl-node/22.21.1`，与 CLIProxyAPI 一致；不把这套头抄到 loadCodeAssist（CLIProxyAPI 测试断言那边为空）。
4. OAuth client_id / secret / scopes / `http://localhost:<port>/oauth-callback` 来自 CLIProxyAPI constants（就是官方安装应用客户端）。`access_type=offline` + `prompt=consent`。
5. session 必存 `projectId`；generateContent 缺 project 直接 403，不上游。
6. refresh 用同一 client_id/secret；刷新后指纹不变。
7. 不发明 `~/.zcode` 式路径。导入只认官方 CLI `~/.gemini/antigravity-cli/antigravity-oauth-token` 和 CLIProxyAPI `~/.cli-proxy-api/antigravity-*.json`。

### 验证

- `npm test`：loadCodeAssist / onboardUser / generateContent 的 UA 都是 `antigravity/hub/`；metadata 含 `ANTIGRAVITY`；零 `IDE_UNSPECIFIED`、`dsh-plugin`、`DeepSeek`、`CLIProxy`、Node 默认 UA。

## 2026-08-30：Kiro 对话不是 OpenAI

### 现象

Kiro 上游是 AWS `generateAssistantResponse` 事件流（`q.{region}.amazonaws.com`），不是 `/v1/chat/completions`。不能拿 GLM 那套直通当聊天。

### 根因

Kiro IDE / kiro.rs 走 CodeWhisperer Runtime；Bearer 之外还要 `tokentype`、profileArn、machineId。

### 非修复（0.0.34）

本任务只接 **认证 + 额度 + 目录 + 设置页 tab**。`GET /kiro/v1/models` 可用；`POST /kiro/v1/chat/completions` 返回 501。聊天翻译是后续任务。

### 验证

- `npm test`：Kiro 登录/导入/额度/目录用例。

## 2026-08-30：关于页「打开发布页」是假安装入口；检查更新只比版本

### 现象

设置 → OAuth 订阅 → 关于。检查更新只打 `api.github.com/.../releases/latest`，装的是 0.0.24，显示 **有新版本**。底下还有 **打开发布页**，点开 GitHub release / zip。DSH 插件的真实升级是 `dsh plugin --profile web update`，不是下 zip。0.0.21 已经去掉假 Win/mac/linux 下载行，但发布页链接还在。

### 根因

`checkUpdate` 只做 GitHub 比版本。关于页把 `latest.url` 画成独立 CTA。宿主没有自动升级器；用户本机的 zsh 包装才是「停 DSH → `dsh plugin --profile web update` → 再开 `dsh web`」。CLI 文档：`dsh plugin --profile <args...>` 转发给 profile 目录里的 pnpm，跑完要重启 profile，热重载只管 `cordis.patch.yml`，不管 bundle 更新。

### 修复（0.0.33）

- 去掉「打开发布页」/ Open release page。仓库链接、版本行、**有新版本** 状态保留。
- 打开关于页仍只比较版本（不重装）。点 **检查更新** 且 latest > installed 时 spawn PATH 上的 `dsh plugin --profile web update dsh-plugin-oauth-subs`（只动本包）。已是最新不重装。
- 成功后提示重启 `dsh web`。找不到 `dsh`、超时、非 0 退出都写在关于页。不 `npm i -g`，不杀当前进程。

### 验证

- `npm test`：`apply: false` 不 spawn；`status === current` 不 spawn；有新版本时参数正好是 `dsh plugin --profile web update dsh-plugin-oauth-subs`；ENOENT → `missing-dsh`。

## 2026-08-30：Grok Fast 无加速；Codex Fast 只靠 body 字段，回显一直是 default

### 现象

用户本机 Mac，本地插件代理 `127.0.0.1:8318`，ChatGPT Pro + Grok X Premium+。交错 default 与 `-fast`，同一 prompt（整数 1–180），`reasoning.effort` low，`stream` true。Codex 请求体必须是 list `input` + `store: false`（string input 先 400，再 400 “Store must be set to false”）。

**Grok 4.6**

- Echo：default → `service_tier` `default`；`-fast` → created 和 completed 都是 `priority`（字段线上被接受）。
- 吞吐：default 81.20 / 85.48 tok/s（均值 83.34）；fast 85.08 / 80.51（均值 82.80，比 0.994）。无加速。
- 探针：POST grok-4.5 带 body `service_tier=priority` → HTTP 200，echo `default`（插件剥掉，符合设计）。

**Codex gpt-5.6-luna**

- 插件剥掉 `-fast`（model echo 是 `gpt-5.6-luna`）。
- Echo：created=`auto`，completed=`default`，default 和 `-fast` 两边一样。从未出现 `priority`。
- 吞吐：default 37.79 / 54.74（均值 46.27）；fast 71.76 / 51.08（均值 61.42，比 1.33）。成对比 1.90× 然后 0.93×，不是稳定的 Priority 提升。
- 探针：`gpt-5.4-mini-fast` → HTTP 400 `The 'gpt-5.4-mini-fast' model is not supported when using Codex with a ChatGPT account.` 不合格 `-fast` 没剥掉，上游看到假 id。

README 曾写 Luna Fast 88.3 vs 57.5 tok/s（1.54×，2026-08-26）。今晚没复现。`fast-mode.json` 磁盘上是 `{on:false}`（旧 UI 开关），后缀剥离不读这个文件。

### 根因

1. **Grok**：xAI Responses 接受 Grok 4.6 的 `priority`，但不给吞吐。继续挂 `-fast` 是撒谎。
2. **Codex**：插件只写了 body `service_tier: "priority"`。Codex CLI 0.149+（openai/codex#37345）还会发 `x-codex-routing-hint: model=<id>;tier=priority`，ChatGPT 订阅路径 `store` 必须是 `false`。回显 `auto`/`default` 本身不是失败判据（openai/codex#14204 官方也说 ChatGPT 鉴权下 `response.service_tier` 不可靠），但缺 hint 时请求形状和 CLI 不一致。Plus 账号上 CLI 带 hint 的对照（#32191）同样 echo `default`、吞吐无差；本机 Pro 今晚也没稳定 1.5×。
3. **不合格 `-fast`**：`peelFastSuffix` 只在 `fastTier` 为真时剥后缀，mini / 过期 id 原样转发。

### 修复（0.0.33）

- 删掉 Grok Fast：目录、选择器、Settings 文案、README 不再出现 `grok-*-fast`。代理永不给 Grok 写 `service_tier`。残留 `grok-4.6-fast` 只剥后缀。
- Codex 合格 `-fast`：剥后缀 + `service_tier: "priority"` + `x-codex-routing-hint: model=<id>;tier=priority`，并强制 `store: false`。客户端身份跟到 `codex_cli_rs/0.151.0`。
- 不合格 Codex `-fast`（mini / Spark / 过期 id）本地剥掉，不再把假 id 转给上游。
- 保留 Codex `-fast` 选择器行：目录仍标 Fast，CLI 仍这样请求。文档不再把 2026-08-26 的 1.54× 写成当前事实；回显 `default`/`auto` 不能当 Priority 成功判据。

### 验证

- `npm test`：Grok 无 `-fast` 行；`grok-4.6-fast` / `gpt-5.4-mini-fast` 剥后缀且不带 `service_tier`；Codex `-fast` 请求带 `priority`、`store: false`、`x-codex-routing-hint=model=…;tier=priority`。

## 2026-08-30：GLM「导入本机会话」是空操作

### 现象

设置页智谱 GLM → **导入本机会话**。本机已用 ZCode Desktop 登录 BigModel Coding Plan，按钮点了没反应。插件 0.0.24。

### 证据

本机 `~/.zcode/cli/config.json` 与 `~/.zcode/config.json` 都不存在。活会话在 **`~/.zcode/v2/config.json`**（`provider` 下）：

- `builtin:bigmodel-coding-plan`.options.apiKey 非空（Coding Plan 密钥，站点 BigModel）
- `builtin:bigmodel-start-plan`.options.apiKey 是 JWT
- `builtin:zai-coding-plan` / `builtin:bigmodel` / `builtin:zai` 的 apiKey 为空
- `~/.zcode/v2/credentials.json` 是 `enc:v1:…`，不必解密

同一份 `glmKeyFromZcodeConfig` 对着 v2 文件能选出 `builtin:bigmodel-coding-plan`，region `bigmodel`。

### 根因

`glmAuthSearchPaths` 只扫了旧 CLI 路径，没扫 Desktop `v2/config.json`。解析本身已经会跳过空 apiKey。

### 修复（0.0.33）

搜索路径加上 `~/.zcode/v2/config.json`（放在最前）。多把钥匙时优先 coding-plan / start-plan，且非 JWT 的 Coding Plan 密钥压过 JWT。不读加密 credentials。

### 验证

- `glmAuthSearchPaths()[0]` 以 `.zcode/v2/config.json` 结尾。
- 夹具 `importGlmAuth` 读 v2 文件，session.region 为 `bigmodel`，token 是 coding-plan 那把。
- `npm test` 全绿。

## 2026-08-30：BigModel OAuth 登录线上 500

### 现象

设置页 **连接 BigModel 继续使用** 立刻失败。插件 0.0.24。

### 证据

2026-08-30 对 `POST https://zcode.z.ai/api/v1/oauth/cli/init`：

| body | 结果 |
|---|---|
| `{provider:"zai"}` | HTTP 200，`flow_id` + `authorize_url`（连打会 429） |
| `{provider:"zcode"}` | HTTP 500 `{"code":1000,"msg":"something went wrong"}`（复现两次） |
| `{provider:"bigmodel"}` | HTTP 200，`flow_id` + `authorize_url`，授权页 `bigmodel.cn/login` |

0.0.19 把国内站改成 `zcode` 时写过「ZCode 内部 id 是 `zcode`」。今晚这条已经 500。

### 根因

`GLM_CLI_PROVIDERS.bigmodel` 仍发 `zcode`。init API 现在要 `bigmodel`。

### 修复（0.0.33）

`GLM_CLI_PROVIDERS.bigmodel = 'bigmodel'`。region 别名 `zcode` → `bigmodel` 仍留给导入路径上的 provider 名。`GLM_BIGMODEL_APP_ID` 仍是 `zcode`（授权 URL 的 app_id）。

### 验证

- `glmCliProvider('bigmodel') === 'bigmodel'`。
- `glmCliInit({ region: 'bigmodel' })` body `provider` 为 `bigmodel`。
- 线上再打一次 init：HTTP 200，authorize host `bigmodel.cn`，path `/login`。
- `npm test` 全绿。

## 2026-08-30：多账号额度只显示当前账号

### 现象

Grok 两张卡：使用中的那张有额度，另一张只有邮箱和切换。必须先切换才看得到额度。

### 根因

`QuotaStore` 按 provider 缓存，只读 `TokenManager` 的当前 session。UI 也只在 `row.active` 时挂 `QuotaBlock`。

### 修复（0.0.26）

按 `provider + accountId` 分别拉额度；snapshot 每张卡带自己的 `quota`。刷新/重置走该卡的 session。切换不再清空别的账号缓存。

### 验证

- `npm test`：两份 Grok session 在 snapshot 里各有一份 remainingPercent。

## 2026-08-30：Codex Pro 徽章没区分 5x / 20x

### 现象

设置页 Codex 账号卡只显示 **套餐 Pro**。ChatGPT Pro 已拆成 $100 Pro 5x 和 $200 Pro 20x，看不出是哪一档。

### 根因

JWT / usage 的 slug：`$200` 仍是 `pro`，`$100` 是 `prolite`（openai/codex#29243）。`formatPlanLabel` 把两者都画成 Pro。

### 修复（0.0.25）

`pro` → **Pro 20x**，`prolite` → **Pro 5x**。GLM 的 `pro` 仍显示 Pro。

### 验证

- `npm test`：`formatPlanLabel('pro') === 'Pro 20x'`，`formatPlanLabel('prolite') === 'Pro 5x'`，`formatPlanLabel('pro', 'glm') === 'Pro'`。

## 2026-08-30：多个账号挤在一条横条里，额度和身份拆开

### 现象

- Codex / Grok 页：账号是一行 pill（邮箱 + 使用中 + 套餐 + 退出），额度在整张家族卡片底部。
- Grok 两个账号时，下面只有一份额度，看不出属于哪张账号。

### 根因

`ProviderCard` 把 roster 画成 `.osubs-acct` 横条，`QuotaBlock` 挂在家族卡片末尾，只绑当前账号。套餐徽章还在标题上重复一次。

### 修复（0.0.23）

每个账号一张卡片：身份、套餐、操作在上头；当前账号的额度（含 Codex 重置券）进同一框。未使用的账号没有额度块。标题不再重复套餐。

### 验证

- `npm test` 全绿。
- 设置页：一个账号一张卡片。

## 2026-08-30：GLM 思考深度没写进目录，会话选不了

### 现象

- Codex / Grok 在 Harness 会话 → 模型 → **推理等级** 能选深度。
- OAuth · GLM 三行都是 `reasoningEfforts: false`。选 GLM-5.3 / Flash 时没有 low / high / max，请求也不带 `reasoning_effort`，上游一直用默认 **max**。

### 根因

0.0.20 只补了模型清单和输入类型，没抄官方思考档。Z.AI 文档（GLM-5.3 / Flash）：

| 模型 | 思考深度 | 可关闭 | 默认 |
|---|---|---|---|
| GLM-5.3 | `low` / `high` / `max` | 否（`disabled` 会 400） | `max` |
| GLM-5.3-Flash | 同上 | 否 | `max` |
| GLM-5-Turbo | 无（只有 thinking on/off，Coding Plan 默认开） | 深度选择器不提供 | 开着 |

没有 `medium`。DSH `reasoningEfforts` 的键是选择器档位、值是线上拼写；不写 `off` 表示不能关。另外 `oauth-glm` 的 baseURL 是 `127.0.0.1`，pi-ai 不会按 z.ai 猜 `supportsReasoningEffort`，不显式打开的话档位到不了请求体。

### 修复（0.0.22）

`GLM_REASONING = { low, high, max }` 写在 5.3 与 Flash 上；Turbo 仍是 `false`。路由加 `compat.supportsReasoningEffort` + `thinkingFormat: openai`（发 `reasoning_effort`）。

### 验证

- 5.3 / Flash `reasoningEfforts` 正好是 low/high/max，没有 off / medium。
- Turbo 仍是 `false`。
- `oauth-glm.compat.thinkingFormat === 'openai'`。
- `npm test` 全绿。

## 2026-08-30：关于页把一份通用 zip 拆成 Win / macOS / Linux 三行下载

### 现象

- 设置 → 关于。检查更新后出现三张下载卡，每张都标 **通用包**，文件名都是 `dsh-plugin-oauth-subs-0.0.16.zip`。
- 本机 macOS 那行多一个「本机」徽章，另外两行同样能下同一份 zip。

### 根因

`pickDownloads` 把 GitHub 的 generic zip 复制到 win/mac/linux 三行。发布从来没有平台包，这三行是假的安装器 UI。DSH 插件用仓库安装，不靠下载 zip。

### 修复（0.0.21）

通用 zip 不再生成下载行。关于页当时还留了「打开发布页」。只有文件名带 win/mac/linux 的资源才会出现下载行。0.0.33 去掉发布页链接，检查更新在有新版本时会跑 `dsh plugin --profile web update`。

### 验证

- 只有 `dsh-plugin-oauth-subs-0.0.15.zip` → `pickDownloads` 空数组。
- `plugin-win.zip` 只出 Windows 一行。
- `npm test` 全绿。

## 2026-08-30：智谱 GLM 模型清单错了，缺 Flash，且全部标成图文

### 现象

- 设置 → 模型 → OAuth · GLM 显示 6 条：GLM-5.3、GLM-5.1、GLM-5 Turbo、GLM-5.2、GLM-5、GLM-4.7。
- 没有 **GLM-5.3-Flash**（Coding Plan 已放量，原生多模态，图文输入）。
- `toHarnessModel` 把所有系列的 `input` 写死成 `['text', 'image']`。GLM-5.3 / GLM-5-Turbo 官方是纯文本，贴图会打到不认 image_url 的模型上。

### 根因

0.0.16 加 GLM 时按当时 Coding Plan 抄了 5.3/5.2/5.1/5/5-turbo/4.7。Flash 2026-08-26 才上 Coding Plan，目录没跟上。pi-ai 的 `input` 字段决定 Harness 能不能贴图，不能全家共用。

官方输入：

| 模型 | id | 输入 | 窗口 |
|---|---|---|---|
| GLM-5.3 | `glm-5.3` | 文本 | 1M / 128K |
| GLM-5.3-Flash | `glm-5.3-flash` | 视频、图像、文本、文件（pi-ai 只接线 `text`+`image`） | 1M / 128K |
| GLM-5-Turbo | `glm-5-turbo` | 文本 | 200K / 128K |

### 修复（0.0.20）

`GLM_MODELS` 只留这三行，带各自的 `input`。`toHarnessModel` 读目录而不再写死图文。设置页 GLM 行标 **文本** / **图文**。

### 验证

- catalog ids 正好是 `glm-5.3` / `glm-5.3-flash` / `glm-5-turbo`。
- Flash `input` 含 `image`；5.3 与 Turbo 只有 `text`。
- Codex / Grok 默认仍是 `text`+`image`。
- `npm test` 全绿。

## 2026-08-30：智谱 GLM 只有一条 OAuth，国内 BigModel 登不进去

### 现象

- ZCode 欢迎页有两个授权入口：**连接 Z.ai 继续使用（全球）** 和 **连接 BigModel 继续使用（中国）**，底下还有 **使用 API key**。
- 插件 0.0.16–0.0.18 的智谱 GLM 页只有一颗「登录」，`AuthController.login('glm')` 把 `region` 写死成 `'zai'`。CLI init 还把国内站打成 `provider: "bigmodel"`，ZCode 内部 id 其实是 `zcode`。
- 国内 Coding Plan 账号因此一直走 `api.z.ai`，额度、对话都打到国际站。

### 根因

ZCode Desktop 把 GLM 拆成两套 OAuth：

| 欢迎页 | CLI provider | 授权 | 对话 / 额度 |
|---|---|---|---|
| Z.ai · 全球 | `zai` | `chat.z.ai/api/oauth/authorize` | `api.z.ai/api/coding/paas/v4` |
| BigModel · 中国 | `zcode` | `bigmodel.cn/login` | `open.bigmodel.cn/api/coding/paas/v4` |

两端共用 `zcode.z.ai/api/v1/oauth/cli/init` + poll。Z.ai 还要 `api.z.ai/api/auth/z/login` 再签发 `id.secret`；BigModel 没有这步，poll 回来的 JWT 就是 Coding Plan bearer。账号 id 以前只用 email，两个站点会互相覆盖。

### 修复（0.0.19）

设置页两颗授权按钮（全球 / 中国）+ 粘贴 API key。CLI init 发 `zai` / `zcode`。session 带 `region`，账号 id 为 `email@zai` / `email@bigmodel`。代理和额度按当前账号切上游。

### 验证

- `glmCliInit({ region: 'bigmodel' })` body `provider` 为 `zcode`。
- `completeGlmCli` BigModel 不打 biz mint。
- 同一 email 的 Z.ai + BigModel 能共存。
- `npm test` 全绿。

## 2026-08-30：xAI Grok 额度读出来是预付 0、Grok Code 空行


### 现象

- 环境：DSH 插件设置 → xAI Grok 页，0.0.17。两个已登录账号（X Premium+ / SuperGrok Heavy）。
- 点「刷新额度」后只看到「预付余额 0」和一行没有数字的「Grok Code」，没有周额度条。
- 登录和套餐徽章正常，所以 OAuth token 是活的，坏的是额度解析。

### 根因

xAI 2026-06 起把付费账号收成**共享周池**。CLI 代理 `GET cli-chat-proxy.grok.com/v1/billing?format=credits` 仍会 200，但对 `isUnifiedBillingUser: true` 的 SuperGrok / X Premium+ 常常：

1. **省略** `config.creditUsagePercent`（proto3 JSON 不写默认值；统一计费也不再填月度 included 额度）。
2. 给出 `prepaidBalance: 0`（没买过 Extra Usage Credits）。
3. `productUsage` 里有 `Grok Code` 但没有 `usagePercent`。

插件把 0 预付和空产品行渲染成「额度」，周池百分比其实在 grok.com `GetGrokCreditsConfig`（gRPC-web，OIDC bearer，空请求帧）。Grok CLI `/usage` 走的是同一条 credits 配置。

对照：官方 grok-build `billing.rs`（`credit_usage_percent` 可缺省、`prepaid_balance` 是加购余额）；CodexBar / OmniRoute 在 JSON 没有 percent 时回退 grok.com gRPC。

### 修复（0.0.18）

`fetchGrokQuota` 并行打三条：CLI billing JSON、CLI user、`POST grok.com/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`。JSON 已有 percent 时以 JSON 为准；缺了就用 gRPC 的 weekly 0–1 ratio / 0–100 float。`onDemandUsed.val / onDemandCap.val` 作第三回退。预付 0 和没有数字的产品行不再画出来。JWT `sub` 写入 `x-userid`。

### 验证

- `parseGrokBilling`：统一计费空壳 → 0 行；onDemand 袋 → 25% used。
- `decodeGrokCreditsFrame`：ratio 0.425 → 43%；42.4 → 42%；grpc-status 16 trailer → undefined。
- `QuotaStore`：billing 省略 percent + gRPC 0.19 → 每周剩余 81%。
- `npm test` 全绿。
## 2026-08-30：Grok 缓存命中率卡在 ~70%，热身后反复出现 512 token 块

### 现象

- 环境：本地 DSH + `dsh-plugin-oauth-subs` 0.0.16，模型 `oauth-grok` / `grok-4.6-fast`。
- 证据：SkillStar 会话 `session-68aec6a7-25e0-476a-86e2-9bceff327f13`（标题「修复 GitHub Trees API 403 WARN」）。
- 27 次模型调用。多数步骤前缀复用中位 ~99%，但 step 8 / 10 / 15 / 20 的 `cacheReadTokens` **正好是 512**，未缓存输入 58k–96k，命中率 < 1%。
- 下一拍立刻回到 ~99% 复用，说明前缀本身没坏，只是这一拍没打到写过缓存的那台机器。
- 加权命中被这四次错分片拉到 80% 上下（诊断台截图约 70%），对照 8/26 Codex 事故几乎没改善。亲和丢失若只认 `cacheReadTokens === 0` 会记成 0，512 块被误判成 `prefix_break`。

### 根因

xAI 的 prompt cache **按服务器分片**。Chat Completions 用 HTTP 头 `x-grok-conv-id` 做粘性路由；Responses API 等价字段是请求体 `prompt_cache_key`。缓存粒度是 **512 token 一块**。不带粘性标识时，负载均衡把同一会话打到不同机器：那台机器上只有一段全局可见的系统前缀（一块 = 512），对话历史全部 miss。

0.0.16 的代理只给 **Codex** 派生亲和头（`session-id` / `x-client-request-id`），并且有意不把这两颗头抄给 Grok（Codex 后端才认）。Grok 路径上：

1. 不发送 `x-grok-conv-id`。
2. 不从 `session_id` 回填 `prompt_cache_key`。
3. 分析器要求 `cacheReadTokens === 0` 才算亲和丢失，所以 512 块被当成前缀改写。

这和 8/26 Codex 事故是同一类故障（少了分片钉），只是 xAI 的错分片签名不是零缓存，而是一整块 512。

外部对照：xAI 文档 *Maximizing Cache Hits*（`x-grok-conv-id` / `prompt_cache_key` 等价、缺了就换机器）；OpenCode [#35033](https://github.com/anomalyco/opencode/issues/35033)；Hermes [#22705](https://github.com/NousResearch/hermes-agent/issues/22705)。

### 修复（0.0.17）

`src/oauth/proxy.ts` 对 Grok 也从 `prompt_cache_key` || `session_id` 派生同一套清洗键（`[A-Za-z0-9._:-]`，裁到 64）：

1. 写回请求体 `prompt_cache_key`（Responses API 文档字段）。
2. 发送 `x-grok-conv-id`（负载均衡粘性路由；grok-cli 网关认这颗头）。
3. **仍然不**发送 Codex 的 `session-id` / `x-client-request-id`。

`src/oauth/grok/index.ts` 的 `grokAffinityHeaders()` 是唯一出口。分析器把「复用 < 10%」标成 `affinity_miss`，不再要求缓存读取必须为 0。

### 验证

- `test/proxy.test.ts`：Grok 带 `prompt_cache_key` / 回退 `session_id` / 过长裁剪 / 空键删除；Codex 路径仍无 `x-grok-conv-id`。
- `test/analyze-session.test.ts`：512 块 + 复用 < 10% → `affinity_miss`，下一拍 `delta`。
- `npm test` 全绿。

装上 0.0.17 后，同一条 Grok 长会话不应再出现「512 块 + 下一拍 99%」的错分片锯齿。健康规则不变：加权命中 ≥ 80%，亲和丢失 0，无 TRANSPORT。

## 2026-08-26：本地 DSH Codex 缓存命中率异常偏低

### 现象

- 环境：本地 DSH 安装的 `dsh-plugin-oauth-subs`，模型为 `gpt-5.6-luna-fast`。
- 证据：`dsh-session-session-d92203fe-406c-489f-b677-8a64f4d16c9f.zip`。
- 90 次模型调用中有 47 次缓存读取为 0。
- 总未缓存输入为 5,689,541 tokens，缓存读取为 2,145,792 tokens，加权缓存命中率约 27.4%。
- 主会话命中率约 28.6%，两个子代理分别约 33.7% 和 17.4%。

### 根因

DSH 的通用 Responses 适配器会发送稳定的 `prompt_cache_key`、`session_id` 和
`x-client-request-id`。插件保留了请求体中的 `prompt_cache_key`，但转发到 Codex
订阅后端时只重新构造 OAuth 与内容类型请求头，丢失了两个会话亲和请求头，导致相同
会话不能稳定路由到同一缓存分片。

上下文压缩不是主因：本次主会话的压缩只集中发生在第 36 步前，而低命中贯穿整个会话。
`prompt_cache_options` 也不是本次主因：默认 short-cache 请求没有发送该字段。

### 修复

`lib/proxy.js` 从格式合法且不超过 64 字符的 Codex `prompt_cache_key` 派生并发送：

```text
session-id: <prompt_cache_key>
x-client-request-id: <prompt_cache_key>
```

不接受请求头直接覆盖该值，Grok 和没有缓存键的请求保持原行为。

### 验证

- 修复前的本地重放：请求体保留缓存键，但两个上游亲和头均为空。
- 修复后的聚焦回归测试：通过，确认两个上游请求头都等于缓存键。
- `node --check lib/proxy.js`：通过。
- `git diff --check`：通过。
- 完整测试当时为 89/90 通过；唯一失败是并行安全加固新增的“token 加载期间客户端断连”测试，与缓存亲和修复无关。

### 运行时验收（2026-08-30 关闭）

- 证据：完整 `session-772f7f3a-332c-4e0c-bff1-6074123474e3`（SkillStar，标题「极简模式快速开关 Agent 技能」），含子代理 `2e1afbbc-…`。
- 模型：`oauth-codex` / `gpt-5.6-terra-fast`，`reasoningEffort: max`，窗口 258000。
- 主会话 211 次调用、71 分钟：未缓存 1,370,864，缓存读取 30,068,480，输出 121,278。
- 加权命中 **95.6%**，前缀复用中位数 **99.6%**，亲和丢失 **0**，TRANSPORT 0。
- 子代理 17 次调用，命中 91.0%，复用中位 99.0%，亲和丢失 0。
- 热身后的一次零缓存（step 55，168,767 未缓存）发生在 `request/header reason=change` 且退出 plan 之后，是前缀重建，不是分片走丢；step 56 立刻 99.2% 命中、168,448 缓存读取。
- 另外 9 次命中下跌与 `compaction/prune` 或 `compaction/start` 对齐（合计约 330k 未缓存）。压缩后下一拍同样回到 ~99% 复用。
- 未缓存构成：增量工具输出 860k，压缩 330k，plan 重建 169k，冷启动 12k，亲和丢失 0。
- 健康规则改为：加权命中 ≥80%，**亲和丢失为 0**，且无 TRANSPORT。压缩 / 适配器重建造成的零缓存不再判失败。
- 诊断：`node --experimental-strip-types scripts/analyze-session.ts path/to/session.jsonl`。

### 前缀稳定（0.0.15，分析之后落地的优化）

亲和头修好之后，插件还能动的是 **input 前缀**，不是再分类一次压缩。

Codex 按 `instructions` 再 `input` 的最长前缀匹配缓存。DSH / llm-pi-ai 会把 system 既放在 `instructions` 又放在 `input[0]` developer。退出 plan 或 `request/header reason=change` 时，多出来的 developer（plan dump、header 重建）如果留在 `input` 开头，会把已经缓存的对话前缀顶掉——step 55 的 168,767 未缓存就是这个形状：`plan/mode active:false` 紧挨着 header 重建。

`lib/codex-request.js` 现在：

1. 剥掉与 `instructions` 重复的 leading developer/system。
2. 把多出来的 leading 文本挪到 `input` **末尾**（对话历史仍从 `input[0]` 开始）。模型还能读到 plan，前缀可以继续命中。
3. `lib/proxy.js` 在 `prompt_cache_key` 缺失或清洗后为空时回退 `session_id`；裁过的键写回请求体；无法使用的键直接删除，避免 Codex 400。
4. 转发前删除 `prompt_cache_retention` / `prompt_cache_options`（gpt-5.6，Codex #39397）。

压缩本身（~330k）和 DSH 改写 system（38,775 → 36,433 字符）仍然会冷写前缀，插件不能冻结 DSH 的 system。能保住的是 **instructions 不变时的对话历史**。

验证：`test/codex-request.test.mjs`（剥重、后缀停放、不提升对话中段的 developer）与 `test/proxy.test.mjs`（session_id 回退、body 回写、retention 剥离、Grok 不继承亲和头）。

### 工具超时不在本插件（2026-08-30）

完整验收会话 `session-772f7f3a-…` 有 12 条 `tool/code-dispatch isError`，**0** 条 TRANSPORT：

| 条数 | 工具 | 原因 | 签名 |
|---|---|---|---|
| 7 | glob | `host_timeout` | `Error: tool call timed out after 30000ms` |
| 3 | glob / read | `cascade_abort` | `glob was aborted…` / `read aborted` / `resolve aborted` |
| 1 | read | `cascade_abort` | 与 glob 同一 `Promise.all` |
| 1 | grep | `invalid` | ripgrep `unclosed group` |

这不是代理掐的。oauth-subs 是 Responses 回环代理，**不跑** glob / read / grep。DSH 宿主把 `glob` / `grep` 交给 `@deepseek-ai/dsh-tool-fs-search`，工具定义上的 `timeoutMs` 默认 **30000**，由 `@deepseek-ai/dsh-tool-call-timeout-policy` 在 `tools/execute` 上落地成上面那句错误。`read` 本身不声明预算；它被掐是因为模型用 `Promise.all` 把 glob 和 read 绑在一起，glob 到点后宿主取消同组调用。

本插件里能看到的超时全不是这条路径：

- `lib/oauth-flow.js`：登录
- `lib/quota.js`：配额拉取
- `COMMIT_DEADLINE_MS`（120s）：SSE 提交门
- `abortOnDisconnect`：只有 llm-pi-ai 断开代理连接时才 abort 上游

TRANSPORT=0 也排除了「代理把 LLM 流掐掉 → 工具被取消」这条耦合。

不要在 oauth-subs 里加 `toolTimeoutMs`，也不要在代理层重试 glob。用户补丁目前到不了挂载模型可见工具的代理平面（[deepseek-harness#4484](https://github.com/deepseek-ai/deepseek-harness/discussions/4484)）。要加长预算，改 `dsh-tool-fs-search` 的 `timeoutMs`，或等 DSH 让补丁能打到 agent-preset。

另外：fs-search 的 glob 在 pattern **不含 `/`** 时按任意深度的 basename 匹配。会话里 `*`、`vitest.config.*` 都会扫整棵 SkillStar 树（含 ignored，不含 VCS），外置卷 `/Volumes/Acasis` 上 30s 很容易打满。

分析器把这三类分开记，不判健康失败。

## 2026-08-26：并发子代理全线 `stream ended before a terminal response event`

### 现象

- 环境：本地 DSH 安装的 `dsh-plugin-oauth-subs` 0.0.12，模型 `gpt-5.6-luna-fast`。
- 证据：`dsh-session-session-d92203fe-406c-489f-b677-8a64f4d16c9f.zip`（与上一条同一份会话）。
- 19:41 DSH 重启装入 0.0.12（`settings.yaml` 重写，contextWindow 272000→258000）。
- 19:44:15 七个会话同时恢复；19:44:39 起走 `oauth-codex` 的 6 个会话（主会话 + 5 个子代理）
  全部报 `OpenAI Responses stream ended before a terminal response event`，共 29 次 TRANSPORT。
- 每个会话重试 5 次后放弃，退避 500ms → ~8000ms±10%（用户看到的 8443ms 是最后一次）。
- 唯一存活的 `b082f542` 走的是 `opencode-go` / deepseek-v4-flash，不经过本插件。
- 同一份会话早前 15:31/15:35/15:37 出现过 3 次 `500 "fetch failed"`。

### 根因

上游是一次瞬时的 socket 级故障，而**插件把它伪装成了正常结束**。

`OpenAI Responses stream ended before a terminal response event` 不是上游返回的错误，
是 llm-pi-ai 读完 SSE 没等到 `response.completed` 时自己生成的，并且命中它的 TRANSPORT
重试名单（`@earendil-works/pi-ai/dist/utils/retry.js`），所以会不带任何上游信息盲重试 5 次。

`lib/proxy.js` 的 `forward()` 原本以 `finally { if (!response.writableEnded) response.end() }`
收尾：一旦上游流在**响应头发出之后**中断，读流抛出的错误被 `finally` 抢先干净收尾，客户端
收到的是一个「HTTP 200 + 干净 EOF」，上游真实原因整个丢失。

15:31–15:37 那 3 次 `500 "fetch failed"` 是同一类故障发生在**响应头之前**，走
`handle().catch()` 才漏了出来——这是本次定位的关键对照。

### 排除项（均实测真实接口，不能复现）

0.0.12 在请求路径上只改了一行（新增 `accept: text/event-stream`），逐项验证后全部排除：

- `accept: application/json` vs `text/event-stream`：ttfb / 字节数 / 事件数完全一致。
- 6 路并发短流：全部 `response.completed`。
- 6 路并发 × 75k 冷 prefill（450k 未命中 token）：ttfb 仅 3–5s。
- `service_tier: priority`（`-fast` 走的路径）+ 长输出：干净完成。
- 配额：周窗口 `used_percent: 2`，无 5 小时窗口，`limit_reached: false`。

结论：上游瞬时故障，重启导致 7 个会话同时恢复只是诱因。插件的责任是让它无法诊断。


#### 第一层：不再把断流伪装成正常结束

- `forward()` 增加 `catch`：响应头已发出且非客户端主动断连时，`console.error` 打印真实
  原因并 `response.destroy(error)`；日志附带断流前的静默时长与已收字节数。
- 新增 `describeError()`，把 undici 光秃秃的 `fetch failed` 拼上 `error.cause.code`。

#### 第二层：提交门 + 上游重试（针对本次失败签名）

失败签名是「`response.created` 之后零内容事件」，说明**客户端还没拿到任何有用字节**，
因此这段窗口内重试是安全的。`CommitGate` 在流证明自己在产出之前，不向客户端提交响应头：

- 缓冲期间只要出现**非前导事件**（`response.created` / `in_progress` / `queued` 之外的
  任何类型，含 `response.failed`），立即提交并原样吐出缓冲——真实错误不会被重试掉。
- 缓冲超过 64KB 或超过 120s 强制提交，避免无界缓冲和触发客户端的 header 超时。
- 未提交状态下断流或 `fetch` 抛错 → 换一次上游请求重试，共 3 次，退避 1s / 4s。
  这同时覆盖了 15:31 那批 `500 "fetch failed"`（响应头之前断）。
- 3 次耗尽 → 返回带真实原因的 502 JSON，而不是静默 EOF。
- 重试条件收紧到只匹配事故签名（`bytes === 0 || sawPreamble`）：`stream: true` 却收到
  非 SSE body 时原样转发，不当作故障。

效果是把 DSH 侧的重试地平线从 5 次放大到 5×3 次，且 DSH 完全感知不到被吸收的那几次。

### 对抗性审查

针对新逻辑逐条构造攻击并落成测试，其中两条打中了实现：

- **非流式响应被吞**：`push()` 在非门控路径上 flush 了空缓冲并返回 `false`，导致调用方
  跳过写入，body 变空。已修（非门控直接 commit 并返回 `true`）。
- **`hasOutputEvent` 永远返回 false**：web stream 的 chunk 是 `Uint8Array` 不是 `Buffer`，
  `chunk.toString('latin1')` 忽略参数、返回逗号分隔的数字串，正则永不命中。已修
  （`Buffer.from(chunk).toString('latin1')`）。
- **规则过度扩张**：预存测试「proxy asks upstream for SSE when the body streams」抓到
  `stream: true` + 非 SSE body 被误判为空流重试。已收紧。

其余攻击面（真实 `response.failed` 被重试掉、已提交后仍重试、客户端断连时空转重试、
缓冲无界增长、前导事件重复送达客户端）均已覆盖且通过。

### 外部依据

- `nodejs/undici#5450` —— 并发下 `TypeError: fetch failed` 的成因是连接池复用了远端已
  关闭的 socket；维护者明确回应「Client 的整个队列会随 socket 拆除而 error」，推荐
  `interceptor.retry` / `RetryAgent`。本插件不引入 undici 依赖，用自己的重试循环等价覆盖。
- undici `RetryHandler` 文档：**不重试有状态 body**（stream / AsyncIterable），且续传依赖
  `Range` / 206。SSE 响应两条都不满足，所以 `RetryAgent` 无法处理中途断流——必须自己在
  代理层做提交门。本插件请求体是 `Buffer`，可安全重放。

### 验证

- 单元：`test/proxy.test.mjs` 18 个用例，含上述全部对抗场景；`npm test` **97/97 通过**。
- 端到端：用新代码起本地代理打真实 `chatgpt.com/backend-api/codex/responses`，
  6 路并发 `gpt-5.6-luna-fast`，6/6 `response.completed`，
  `event: response.created` 帧数恒为 1（提交门字节透明，未重复送达前导事件）。
- 复现尝试（均无法触发，说明触发条件在上游侧）：16 路并发 priority 长流、
  6 路 × 75k 冷 prefill、accept 头 A/B、配额检查。

### 已知边界

- **不保证上游不再抖动**。本次修复保证的是抖动不再演变成「子代理全灭、work 丢失」。
- 重试会让上游重复计费一次；相对 DSH 原本的 5 次盲重试是净改善。
- 若断流发生在**已产出内容之后**（本次事故不属于此类，deepseek 那条属于），无法重放，
  只能如实报错——这是协议决定的，不是实现取舍。

### 同类项目怎么做的

对照 `router-for-me/CLIProxyAPI`（48.8k★，同为 Codex OAuth 转 API）与
`QuantumNous/new-api`（46.4k★，LLM 网关）的实现：

**CLIProxyAPI 独立收敛到了同一个设计。** `internal/runtime/executor/codex_executor_stream.go`
有一段 "bootstrap" 逻辑，注释写得很直白：

> `isCodexHandshakeMetadataEvent` reports whether an event carries no generated output and is
> therefore safe to hold back **before the downstream response headers are committed**.

它的 handshake 白名单是 `response.created` / `response.in_progress` / `codex.rate_limits` /
`codex.response.metadata`，上限按**事件数**（`codexBootstrapMaxBufferedEvents = 16`）。
本次已把两个 `codex.*` 帧并入我们的 `PREAMBLE_EVENT_TYPES`。

它做这件事的原因值得记下：**chatgpt.com 会返回 HTTP 200，然后把拒绝塞在 SSE 流里面**
（`newCodexBootstrapOverloadErr` 专门处理流内的 `server_is_overloaded` / `rate_limit_exceeded`，
转成 503 好让别的凭据接手）。本次事故是这个模式的退化形态：流内连错误事件都没有。

它还有 `codexIncompleteStreamError`，消息是
`"stream disconnected before completion: stream closed before response.completed"`，
状态码 408，并实现 `IsRequestScoped() = true` —— 即这类错误**不惩罚/冷却凭据**，
按单次请求故障处理。

**new-api 的两个机制，我们不需要或已有等价物：**

- `STREAMING_TIMEOUT`（默认 300s）——上游流空闲超时。Node 的 undici `bodyTimeout` 默认同为
  300s，等价保护已经免费拿到，不需要自己实现。
- 下游 SSE 心跳 `: PING\n\n`（默认 10s）——在长静默期保活客户端连接。与提交门互斥：
  头没提交就发不了心跳。我们选了可重试性，代价是那段窗口不发心跳；因为 undici 的
  `headersTimeout` 是 300s，而提交门 120s 强制提交，边界安全。
- new-api 的 `StreamStatus.IsNormalEnd()` 把 `StreamEndReasonEOF` 算作**正常结束**——
  和我们修复前踩的是同一个坑，区别是它至少把 `EndReason` 记了下来。

**考虑过但没做**：照搬 CLIProxyAPI 的「流内 overload 拒绝 → 重试」。它的价值主要在多凭据
failover，而本插件是单账号；且对 `rate_limit_exceeded` 做 1s/4s 退避重试只会拖延错误上报。
本次事故也没有这个签名。等出现证据再做。

### 目录漂移（0.0.14 已修）

实测真实接口发现的目录漂移，本次事故排查时记录、在 0.0.14 一并对齐：

- `CODEX_REASONING` 曾向所有模型暴露 `minimal`，而所有 Codex 模型均以 400 拒绝
  （`Unsupported value: 'minimal' is not supported`）。已移除。
- `CODEX_MODELS` 曾列 `gpt-5.3-codex`，该模型对 ChatGPT 账号已下线
  （`not supported when using Codex with a ChatGPT account`）。已移除；`gpt-5.3-codex-spark` 保留。
- `-ultra` 别名：目录把 `ultra` 列进 `supported_reasoning_levels`，但 Responses API 对
  Sol / Terra / Luna 一律 400（`Invalid value: 'ultra'`）——那是 Codex CLI 客户端侧的多智能体
  委派（`multi_agent_version`），不是 wire 上的 effort。别名只能退化成 `max`，与直接选 `max`
  完全等价，已整体删除。
- `-fast` 曾按 `gpt-` 前缀发放，而 `gpt-5.4-mini` 与 `gpt-5.3-codex-spark` 的 `service_tiers`
  为空。改为逐模型读目录。
- 大窗口曾写死 900K，实际是 Sol / Terra / Luna 872K、gpt-5.4 1M。改为逐模型。
- `/codex/v1/models` 缺 `client_version` 查询参数，必返 400。已补。

根因是同一批模型事实在四个文件里各抄了一份（第五份是 `models.js` 里重写的
`withPickerVariants`，而三个 `with*Variants` 是死代码）。0.0.14 把事实收进 `lib/codex.js`
一张表，其余模块查 `codexModel()`。
