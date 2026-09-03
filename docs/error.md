# 错误记录

同一根因 / 同一用户可见故障只留一条 `##`（后续跟进并进该条，标题用最晚日期）。新条目只要 **现象** / **根因** / **修复**，各 1–2 行。

## 2026-09-03：OpenCode Free 带 Bearer 会 401；硬编码目录 delist 后仍 401

### 现象
匿名 `https://opencode.ai/zen/v1` 打 `*-free` 带任意 Authorization（空串、哨兵 `anonymous`、过期 Zen key）都 401。硬编码 `hy3-free` 在目录轮换后 picker 仍 401。

### 根因
Hermes `opencode-free` 把 SDK Bearer 盖成空头。本插件 hop 若转发 store 哨兵同样 401。Zen 免费档会 delist。`ox-alpha-free` 看起来免费但是 Go 订阅。`big-pickle` 只给官方 CLI UA。

### 修复
hop **不带** Authorization。live `GET /zen/v1/models` 只收匿名 `*-free`（去掉 Go keyed）。静态楼是 2026-09-03 live 快照，不含 hy3-free / big-pickle。

## 2026-09-03：Kimi Code 不能写自定义 api；设备码过期要重开


### 现象
`api: kimi-openai-completions` 整段 `llm-pi-ai` 被丢。设备码过期后一直转圈。Settings 里 `import { Kimi }` 图标空白。

### 根因
DSH `api` 只有三值。Kimi 上游是 Completions。`expired_token` 必须重新 `device_authorization`。经典脚本 UI 不打包 `@lobehub/icons`。

### 修复
`api: openai-completions`，hop `/kimi/v1/chat/completions`。`DeviceFlowManager.restartOnExpired`。LobeHub `kimi.svg` path 进 `TAB_ICONS`。

## 2026-09-03：两张 Cursor 卡刷新时间一种日期一种倒计时

### 现象
PRO 卡「9月24日 13:23」，ULTRA 卡「13天9小时50分钟后重置」。同一 Settings 栏两套格式。

### 根因
`formatReset` / `formatRelativeReset` 满 14 天改打 `toLocaleString`。两套餐 `resetAt` 一个约 21 天、一个 13 天。

### 修复
额度重置一律相对时间（天/小时/分钟）。`formatStamp` 只留给重置券过期。删 14 天门槛。

## 2026-09-03：Settings tab 九个 icon 仍挤一行

### 现象
7 家族 + Models + About 九个 icon-only tab 在宽栏仍并排一行。用户要一行 8 个、第 9 个换到第二行。

### 根因
`.osubs-tabs` 是 `flex-wrap` 无列数。格子钉 36px 后够宽就 9 个并排，不会在第 8 个后折行。

### 修复
8 列 grid：`grid-template-columns: repeat(8, 36px)`，About 落到第二行。禁止 `flex: 1 1 0` / 把格子 `min-width` 收到 0。

## 2026-09-03：Ollama 卡无额度条、抬头是 ollama-sha8

### 现象
已登录卡只有 KEY / 使用中，无套餐、无剩余条。抬头 `ollama-3f67f6bb`。官方 Cloud usage 是 Pro + Session 0% used + Weekly 9.5% used。

### 根因
`QuotaStore#load` 对 ollama 直接 idle。`POST /api/me` 字段是 `Email`/`Name`/`Plan`，解析只读了小写 email。`limits.*.usage` 是 0..1 分数。

### 修复
并行 GET `/api/usage` + POST `/api/me`。`usedPercent = fraction * 100`，剩余条。`pro`→Pro。刷新后把 Email 写回 session，opaque `ollama-<hex>` `replaceAccountId`。无 `resets_at` 不编倒计时。

## 2026-09-03：Ollama picker 把 glm-5.3-flash 标成纯文本

### 现象
DSH 在 `glm-5.3-flash` 上挡图片（不支持图片）。Cloud `POST /api/show` 的 `capabilities` 含 `vision`。

### 根因
`inferOllamaInput` 只认 `/gemma|vision|\bvl\b|-vl/`。`glm-5.3-flash` / `kimi-k3` / `qwen3.5` / `mistral-large-3` 等 vision 行对不上。`/api/tags` `details` 空，没有 capabilities。

### 修复
`ollamaShowInput` 读 show.capabilities（大小写不敏感）。`applyOllamaShowWindows` 同时钉 `input`。19 行快照按 2026-09-03 show 表烘焙（flash 图文，`glm-5.3` 纯文本）。无 capabilities 才回落名字 regex。不发明 audio。

## 2026-09-03：Cursor 刷新后仍是 auth0|… / PRO / 已用 0%；Ollama 图标被挤没

### 现象
PKCE 卡抬头 `auth0|user_…`、PRO、已用 0%/0%。IDE 卡 PRO（实 Ultra）、API 已用 0%（实 0.454%）。点刷新额度不变。Ollama 图标在窄 Settings 栏消失。

### 根因
`GetCurrentPeriodUsage` 无 email，缺 `membershipType` 时默认 Pro。`clampPct` 把 0.454 收成 0。刷新没打 GetEmail / `full_stripe_profile`。九个 tab `flex:1 1 0` 被 `min-width:0` 压到 0。

### 修复
刷新并行 GetEmail（必要时 GetMe）+ stripe。回填 `cachedEmail` / opaque `replaceAccountId`。套餐用 `individualMembershipType`。已用>0 且四舍五入为 0 则显示 1。条走 `RemainingBar`/`QuotaMeter`（剩余）。Tab wrap，每格 36px。

## 2026-09-03：Kiro 复合 tool id / 静态目录缺口 / 思考 XML

### 现象
Responses 形 `call_…|fc_…` 超 64 且含 `|` → AWS 400。picker 仍是静态表，缺 Auto / `claude-fable-5`。`MONTHLY_REQUEST_COUNT` 被当 429 锤。思考事件写成 `<thinking>` 进 `content`。

### 根因
翻译层 + 离线目录。hop 仍是 `q.<region>.amazonaws.com` `GenerateAssistantResponse`，不是 `runtime.*.kiro.dev`。

### 修复
非法 id 稳定 remap 成 `tooluse_<32>`（use/result 同一函数）。登录后 `ListAvailableModels`（空/403 再探 us-east-1 / eu-central-1）。`MONTHLY_REQUEST_COUNT` → 400。thinking → `reasoning_content`。GPT-5.6 Sol/Terra/Luna 不删。

## 2026-09-03：Ollama Cloud — signin 不是 Bearer，无 cache-read

### 现象
社区把 `ollama signin` / `id_ed25519.pub` 当 Cloud key。还指望 cache 命中率。

### 根因
本家族是 Cloud API key + Completions 薄透传，不是 localhost:11434，也不是 PKCE。signin 身份不能当 Bearer。cache-read 官方没给。

### 修复
粘贴 API key + 空花名册 `OLLAMA_API_KEY`（在添加账号 Dialog 里）。hop：`POST /ollama/v1/chat/completions` → `https://ollama.com/v1/chat/completions`。**不能**把 local signin 变成 Bearer，也不能发明 `cached_tokens`。额度见上条 `/api/usage`。

## 2026-09-03：Ollama contextWindow 不能猜家族默认

### 现象
picker 把 Cloud 窗口写成 128k/200k/256k。`minimax-m2.7` 超报（200000 vs 196608）。`glm-5.3` / `kimi-k3` / `deepseek-v4-*` 实际是 1M。

### 根因
`/api/tags` 的 `details` 空。家族 regex 不是 Cloud cap。`extraCloudModelLimits` 过期。

### 修复
`contextWindow` = `POST /api/show` `model_info.*.context_length`，钉在 19 行快照；登录后 live show 覆盖；失败回落快照，不回落 128k regex。

## 2026-09-03：Cursor 卡抬头是 JWT `sub`，不是邮箱 / 用户名

### 现象
Settings → Cursor 抬头是 WorkOS 形 `provider|user_…`。登录和两条额度杠正常。

### 根因
`cursorAccountFromToken` 在无 email 时回落 JWT `sub`。vscdb 没读 `cursorAuth/cachedEmail`。GetCurrentPeriodUsage 经常也没有 email。

### 修复
可见身份：JWT `email` / `preferred_username`，然后 cachedEmail，然后 GetEmail / GetMe，然后 usage email。永不展示 `sub` / `cursor` / `provider|user_*`。没有人类 id 就省略抬头。vault 仍可用 `sub`，刷新后 `replaceAccountId`。

## 2026-09-03：GLM 账号卡身份显示内部 id，不是邮箱（始 08-30）

### 现象
已登录卡抬头先是 **zcode**（CLI app id），挡住站点 id 后又变成 poll `user.id` / 短字母数字 handle。登录成功，用户名不对。

### 根因
身份层。`zcode` / `zai` / `bigmodel` / `glm`、纯数字 uid、UUID / 长 hex、无 `@` 的短 handle 都是智谱内部 id。官方展示是 JWT `email` / `preferred_username`，或 userinfo / `getCustomerInfo`。`accountFromJwt` 不取 `sub` / `id`。

### 修复
`isGlmOpaqueAccount` 拒绝上述值。优先邮箱，其次电话，再次人类 `customerName`。没有邮箱就打 userinfo；失败省略抬头，不回落 uid。已存 opaque vault 行 snapshot 回填。卡抬头不走 `accountIdOf`。

## 2026-09-03：Cursor 选择器仍是静态 5 行 — 活目录没接到 picker / yaml

### 现象
Settings / `oauth-cursor.models` 只有冻结的 5 个 id。账号在 Cursor 里能用的 Auto / Claude / Gemini 进不了勾选格。

### 根因
`fetchCursorUsableModels` 已能 unary `GetUsableModels`，`buildProviders` 只读 `CURSOR_MODELS`。发现层写了、目录层没用。

### 修复
`refreshCursorCatalog` 登录 / 导入 / 额度后拉活列表；失败回落静态 5，不挡对话。`toCursorPickerModels` 收成一行/家族。`reasoningEfforts` 键只有 `off|low|medium|high|xhigh`。活列表进 yaml。

## 2026-09-03：Cursor 额度条把美分封顶画成「40000 / 40000」

### 现象
卡片 `40000 / 40000`、一条「本周期」。仪表盘其实是「补全 & Composer」与「API 调用」两条已用百分比。`includedSpend` / `limit` 是美元封顶。

### 根因
`parseCursorPeriodUsage` 只发 `kind: 'cycle'`，used/total 取 spend cap，忽略 `autoPercentUsed` / `apiPercentUsed`。

### 修复
两条 `kind: 'product'`（`auto` / `api`）。不写 includedSpend/limit。`resetAt` = `billingCycleEnd`。条是剩余（`100 - used`），不要 `showUsed` / 「已用」。

## 2026-09-03：Cursor 本机导入 — Keychain 可能弹授权，vscdb 键名可能改

### 现象
「导入本机 Cursor」或空花名册自动导入时，第一次读 macOS Keychain 会弹系统授权；或 Cursor 改了 `state.vscdb` `ItemTable` 键名后导入变空。

### 根因
本机登录复用，不是第二套 OAuth。Keychain / vscdb schema 由官方 CLI / IDE 拥有。

### 修复
顺序：`CURSOR_ACCESS_TOKEN` → Keychain+vscdb → 仍有效的本地 access → refresh。空花名册才自动导入，已有 PKCE/session 不覆盖。WSL 只解析当前 Windows 用户，不扫 Public / Default / 其他 profile。弹窗与键变更：**本插件不能消掉系统授权，也不能钉死官方 schema**；失败走空文案。

## 2026-09-03：Cursor Run 没有文档化的 cache-read 字段

### 现象
长对话 `cacheReadTokens` / 命中率可能一直是 0%，即使 `conversation_id` 粘住了。

### 根因
Cursor Agent conversation cache。Run 没有与 Codex / Gemini / Kiro 对等的稳定 cache-read 字段。

### 修复
粘性 id + system pin 在 `src/oauth/cursor/cache.ts`。看见 `cached_tokens` 才映射。**非修复**：不能发明 cache-read。命中率 0% 不代表 conversation 断了。禁止 `Date.now()`。

## 2026-09-03：Cursor 非流 Completions 是收集 Run 流后再回一条 JSON

### 现象
DSH `openai-completions` 非流 POST `/cursor/v1/chat/completions`。上游 `AgentService/Run` 本身是 Connect 流。

### 根因
协议层。Cursor 原生是 protobuf，只能 Completions + 翻译；不是 SSE-only。

### 修复
`forwardCursor` 非流等 Run 结束后 `cursorToOpenai`。`stream: true` 仍写 SSE。`POST /cursor/v1/responses` → 501。

## 2026-09-03：Cursor Connect/protobuf 是社区逆向，官方改线会断

### 现象
对话走 `agentn.us.api5.cursor.sh` `agent.v1.AgentService/Run`。字段号、host、CLI 指纹随时可能被改掉，表现为 4xx / 空流 / 工具步对不上。

### 根因
上游未公开稳定 REST。本插件不能拥有 Cursor 的 wire。

### 修复
最小编码器 + Node `http2`。**改线后对照社区协议再改 `src/oauth/cursor/`**，不要从别的家族抄 cache / hop。指纹钉 `x-cursor-client-version: cli-2026.05.01-eea359f`。

## 2026-09-03：Antigravity Cloud Code 400 — JSON Schema、首条必须是 user

### 现象
Claude / GPT-OSS 自定义工具立刻 400：`Unknown name "additionalProperties"`（或 anyOf / `$ref` / format / nullable）。Gemini 3 若 `contents[0].role === "model"` 或 `systemInstruction` 缺 `role: "user"` 同样 400。`maxOutputTokens` 超线 id 上限也是 400。

### 根因
`openaiToAntigravity`（`src/oauth/antigravity/request.ts`）。Cloud Code Claude/GPT 桥吃 protobuf `Schema`，不是 JSON Schema。Gemini 3 要求第一条 user。

### 修复
Gemini：`parametersJsonSchema`。Claude / GPT-OSS：allowlist `parameters`，配对 `functionCall.id`（Gemini 3 不发 id）。model 开头补 `Hello` user；`systemInstruction.role = "user"`。Claude 永远 `VALIDATED`。`maxOutputTokens` 只走钳位表。chat 头只有 User-Agent；**不要**加 `anthropic-beta` / `Client-Metadata` / `x-goog-api-client`。不改 fingerprint、`requestType: "agent"`、picker 线 id。

## 2026-09-03：Antigravity Gemini 3.8 Flash 线 id 是 `gemini-3.8-flash-high`

### 现象
官方文档 / 选择器是 Gemini 3.8 Flash（Medium 档）。Gemini API 裸 id 是 `gemini-3.8-flash`。那不是 Cloud Code 线 id。

### 根因
Cloud Code 用 effort 后缀 id。把裸 `gemini-3.8-flash` 发给 daily-cloudcode-pa 会走错线。CCA 当天没有 3.8 ≠ 线上没有。

### 修复
`ANTIGRAVITY_MODELS` 一行 `gemini-3.8-flash-high` / `Gemini 3.8 Flash`（窗口同 3.7）。不加 Cyber，不发明 quota 条，不把 `-low` / `-medium` 拆成独立 checkbox。

## 2026-09-03：Antigravity 工具轮 400 缺 `thought_signature`（始 09-01）

### 现象
`Function call is missing a thought_signature in functionCall parts`（`INVALID_ARGUMENT`）。DSH 工具再放进 `contents` 时签名丢了。

### 根因
`collectAntigravityParts` / `openaiToAntigravity`。签名在 part 级 `thoughtSignature`，不是 OpenAI `tool_calls` 标准键。DSH Completions 没有一等该字段。

### 修复
入站读 part / `functionCall` 上的签名，抄到 `tool_calls`（含 `extra_content.google.thought_signature`）；DSH 剥键时按 session 再贴回 part 级。缺签名不编空串 / 不发 `skip_thought_signature_validator`。Gemini 3 一组仍无签名：丢掉这组 `functionCall`，匹配 tool 结果改成 user Observation。Claude / GPT-OSS 仍发 unsigned。

## 2026-09-03：Kiro tool_result 与 tool_use 不相邻（始 09-01）

### 现象
`unexpected tool_use_id found in tool_result blocks`。交错 `assistant(A) / user / assistant(B) / toolResult(A)` 仍 400。

### 根因
先 `flushUser` 会把 pending result 贴到错的 assistant。只靠位置 flush 不能处理 displaced result。`parkKiroSystemExtra` 也可能插进 unpaired `toolUses` 与 `toolResults` 中间。

### 修复
`relocateDisplacedToolResults` 先按 id 纯重排（不编造、不丢已有 call 的 result）。再 `flushAssistant` 再 `flushUser`。extra system 仍挂后缀，永不夹在一对中间。

## 2026-09-01：Codex 上游 400 `Unsupported parameter: session_id`

### 现象
DSH 长会话带 `session_id` 时 chatgpt.com 400。只带同一值的 `prompt_cache_key` 是 200。

### 根因
`applyCodexCache` 把 `session_id` 抄到 `prompt_cache_key` 和亲和头，但原字段还留在对话 Responses body。chatgpt.com 不认这个 DSH 字段。

### 修复
写出清洗后的 `prompt_cache_key` 后 `delete session_id`。头仍是 `session-id` = `x-client-request-id` = `prompt_cache_key`。不把 Codex `prompt_cache_key` 抄给别的家族。

## 2026-09-01：Kiro overlay 后 usage 仍 0/0/0 — 现场没有 metadataEvent

### 现象
refresh 429 修好后每个 200 仍是 `{prompt_tokens:0,completion_tokens:0,total_tokens:0}`。现场 eventstream 常见 `contextUsageEvent` / `meteringEvent`，很少下发 `metadataEvent.tokenUsage`。

### 根因
`mapKiroUsage` 只认 `metadataEvent`。`contextUsageEvent` 是百分比；`meteringEvent` 是 credit，不是 token。

### 修复
有 `tokenUsage`（含 snake_case）优先，并加 `cacheWriteInputTokens`。否则 `prompt_tokens = contextUsagePercentage/100 * contextWindow`，completion 按输出字数估。不把 metering credit 当 token，不编 `cached_tokens`。连 contextUsage 也没有则保持 0/0/0。

## 2026-09-01：Kiro 0.0.57 live — 每轮 refresh 429

### 现象
短聊能通，但多数轮死在 `kiro social refresh failed (HTTP 429)`，DSH 看到的是 500。`expiresAt` 在大量 200 之后仍停在旧毫秒戳。

### 根因
`expiresAtOf()` 看见已有 `>1e12` 就丢掉 refresh JSON 的 `expiresIn`，于是每条请求都打 `/refreshToken`。`readJson()` 非 2xx 无 `.status`，代理 `error.status ?? 500`。

### 修复
刷新成功后一律用新的 `expiresIn` / `expiresAt` 写 `expiresAt`（IdC / Entra 同一条）。`KiroHttpError` 带 `status` + `Retry-After`，代理原样回 429。eventstream 头解码所有 AWS 类型（勿只认 type-7 string）。

## 2026-08-31：Antigravity 长聊缓存命中率 0 / Google 不回 cached_tokens

### 现象
页脚命中率 0%。早期是 mapper 没抄 `cachedContentTokenCount`；钉了 system 之后 Google 仍常不回该字段（工具 JSON / `thinkingConfig` 闪断）。

### 根因
Gemini 隐式缓存吃 **systemInstruction + contents 前缀 + tools**。DSH 每步塞 runtime-context snapshot，工具 key 顺序和 `reasoning_effort` 有无会抖。缺 session 时各模型共用 `dsh-antigravity`。禁止 `` `-${Date.now()}` ``。

### 修复
`pinAntigravitySystemInstruction`：首次钉住，多余 snapshot → trailing **user**。`pinAntigravityTools`：names+schemas 等价则复用首份字节。`pinAntigravityThinking` sticky-first。不发 `implicitCacheConfig`。fallback `dsh-antigravity:<model>`。`cachedTokensOf` 兼读 `cache_read_tokens` / `cacheReadTokens` / `cacheReadInputTokens`。

## 2026-08-31：Kiro 18 个模型多轮 cacheReadInputTokens 偏低

### 现象
长 system + tools 前缀下多轮 cache 偏低；同一 DSH session 换模型还打到同一条 AWS conversation。

### 根因
`openaiToKiro` 把全部 system 拼进每一轮 `currentMessage`。`conversationId` 回落裸 `dsh-kiro` 且不带 model。`cacheReadInputTokens` 没映到 `prompt_tokens_details.cached_tokens`。官方 wire 无 system 字段。

### 修复
system 钉 history 首对 user + ack `I will follow these instructions.`；增量 snapshot 挂后缀（不插在 toolUses/toolResults 之间）。`conversationId` = DSH pin **加 model**；缺 pin 时 `dsh-kiro:<model>`。禁止 `Date.now()`。`cacheReadInputTokens` → `cached_tokens`。不写 Codex / Grok 缓存字段。

## 2026-08-31：Kiro 登录后 settings.yaml 没有 oauth-kiro

### 现象
Kiro 已登录、选择器勾选亮着，`llm-pi-ai.providers` 仍没有 `oauth-kiro`。Composer 选不到。先修 `none` 键后 yaml 仍冻住。

### 根因
`syncHarnessModels` 一次原子 mutate。两枚杀手：Kiro GPT `reasoningEfforts` 键写成 `none`（DSH 闭集是 `off|minimal|low|medium|high|xhigh|max`）；GLM 改 `anthropic-messages` 后仍带 Completions-only `compat.supportsReasoningEffort` / `thinkingFormat`。`assertServiceable` 拒整段，上次合法 section 保留。

### 修复
`KIRO_REASONING_GPT` 为 `off: "none"`（键 `off`，值 `none`）。**不要复活键 `none`。** GLM Anthropic 路由不写 `compat`。Kiro / Antigravity Completions 仍可带 `supportsReasoningEffort`。mutate 前 `assertDshServiceableProvider`。裸 `api: openai` 是另一条。

## 2026-08-31：Kiro 导入只吃第一条，且 IDE token 丢了 IdC client 注册

### 现象
「导入本机会话」只返回第一个账号。卡密 / 精简 JSON / CSV 被当成非法 Social refresh。Builder ID 从 IDE 文件导入后刷新缺 `clientId`/`clientSecret`。

### 根因
导入器按 Codex「找一份 auth.json」写。SSO cache 里 token 与 `{hash}.json` OIDC 注册被当成互不相关。

### 修复
`src/oauth/kiro/import.ts` 自写解析。写入全部账号；IDE token 配对 `clientIdHash` 注册。Settings「粘贴凭证」同一套。

## 2026-08-31：GLM 默认协议应对齐 ZCode Anthropic，150% 不是协议证明

### 现象
插件把 GLM 写成 Completions，但 ZCode Desktop UA 是 `ai-sdk/anthropic`，默认 hop 是 Anthropic Messages。

### 根因
把「有 Completions 兼容」当成 DSH 该选的 `api`。闭集规则：三种里哪条是上游原生就选哪条。150% 是 **身份** 计费，不是协议。

### 修复
`oauth-glm`：`api: anthropic-messages`，`baseURL: ${origin}/glm`。`POST /glm/v1/messages` → `/api/anthropic/v1/messages`。Completions 残留留到下次 `sync()`。**不要**说切协议就能吃上 150%。不要把 Completions-only `compat` 盖到 Anthropic 路由上。Codex / Grok / Kiro / Antigravity / Cursor 协议不动。

## 2026-08-31：各家 OAuth 缓存被混成 Codex 一套

### 现象
Grok / GLM / Kiro / Antigravity 共用 `codexCacheSessionId` 和同一个 `pinCache`，body 上被写 `prompt_cache_key`，头上抄 Codex `session-id`。

### 根因
把「清洗 DSH session id」当成可共享的缓存实现。各家后端键、头、前缀钉法都不一样。

### 修复
每家一个 `src/oauth/<id>/cache.ts`。`proxy.ts` 只分发。删除 `src/utils/cache-session.ts`。**不要**把 Codex `session-id` / `prompt_cache_key` 写给 GLM / Kiro / Antigravity / Cursor；**不要**把 Grok `x-grok-conv-id` 写给别人。停车形状跟家族，不跟 Codex。

## 2026-08-31：额度刷新时间只精确到小时

### 现象
「5 小时后重置」其实还有分钟。4 小时 32 分被显示成 5 小时。

### 根因
`formatReset` 对 1–47 小时 `Math.round(minutes / 60)`，不是解析丢了 `resetAt`。

### 修复
按天 / 小时 / 剩余分钟拼接，0 的单位省略。额度重置不再在满 14 天改打绝对日期。

## 2026-08-31：Antigravity 额度条 / 套餐 STANDARD（始 08-30）

### 现象
先是已登录卡身空白（额度 idle）。后来有条但没有重置时间、按模型系列一条 remaining、pill 显示 **STANDARD TIER**。官方是 Gemini / Claude+GPT 两组，每组 Weekly + Five Hour；订阅在 `paidTier`。

### 根因
0.0.38 故意不打额度 API。之后只读 `fetchAvailableModels.quotaInfo`（5 小时）和登录时的 `currentTier`（Code Assist SKU = STANDARD）。`resetAt` 没抄上。

### 修复
先 `retrieveUserQuotaSummary`，失败再回落 `fetchAvailableModels`。两组 weekly + 5h；每组 `resetAt` 取 remaining 最低那条。套餐优先 `paidTier`（Pro / Ultra）；`STANDARD TIER` 不显示。Free 仍读 `currentTier: free-tier`。失败 `status: error`，不再静默空卡。

## 2026-08-31：Kiro 对话 501 → generateAssistantResponse 翻译（始 08-30）

### 现象
已登录、额度 / 目录都活着，Composer 对话 `501`：`Kiro chat is AWS generateAssistantResponse, not OpenAI`。

### 根因
上游是 CodeWhisperer EventStream（`X-Amz-Target: …GenerateAssistantResponse`），不是 `/v1/chat/completions`。0.0.34 故意 stub 501。

### 修复
`src/oauth/kiro/request.ts`：OpenAI messages ↔ `conversationState` + eventstream。`forwardKiro` 替换 501。`conversationId` 禁止 `Date.now()`。上游 401/403 改写 **400**（非 AUTH）。`/kiro/v1/responses` 仍 501。

## 2026-08-31：Antigravity 流式对话「用量 0 tok」且首 token 从半句开始

### 现象
页脚用量 0 tok；第一条 `text-delta` 从正文中途开始。最终组装文本完整。

### 根因
Google SSE `part.text` 是**累计全文**；chunk 把全文当 delta，DSH 按累计 diff 丢掉前缀。只有 usage/finish 的末帧被丢掉；`thoughtsTokenCount` 没进 `completion_tokens`。

### 修复
累计帧只发新后缀。`[DONE]` 前必写带 usage 的收尾 chunk。`completion_tokens` 含 `thoughtsTokenCount`。`part.thought` 仍不进可见 `delta.content`。

## 2026-08-31：Kiro 模型没有思考深度，也没标明 text / image

### 现象
选择器里 Claude / GPT 没有思考档；附件能力看不出纯文字还是图文。

### 根因
`kiroModel()` 没有 `reasoningEfforts`；路由没有 `compat.supportsReasoningEffort`。

### 修复
每行写 `reasoningEfforts` + `input`。GPT 官方 `none` 必须是键 `off` 的值（见上条 yaml）。Haiku / DeepSeek / MiniMax / GLM-5 / Qwen 无档。

## 2026-08-31：Kiro 登录成功后「打开授权页」还在

### 现象
Social 已登录、状态「已登录」，卡片下方仍有「打开授权页」。

### 根因
`pending.authorizeUrl` 只在 logout / cancel 时清；轮询已不 busy 仍渲染该链接。

### 修复
配对码 / 打开授权页仅在 `busy` 时渲染。snapshot 已不 busy 时清掉 client `pending`。

## 2026-08-31：DSH 换模型会丢掉 reasoningEffort，选择器回到 Default

### 现象
OAuth 系列把思考深度设成 High 后换模型，选择器回到 Default。YAML `agent-default-model` 省略了 `reasoningEffort`。

### 根因
DSH `choose` 换模型时只带新模型的 `defaultEffort`，不抄上一档。只改 YAML 赶不上活选择器。

### 修复
**不要**写 `llm-pi-ai.providers.oauth-*.reasoning`。用 `settings/updated` 缓存上次显式档；oauth-* 换模型按新模型键还原（`xhigh`/`max` 没有则夹到最高可用）。对当前 session 再 `selectModel` 带上 effort。

## 2026-08-31：Kiro Social 换票 HTTP 500（`redirect_uri`，始 08-30）

### 现象
走完「打开授权页」后 `exchangeKiroSocialCode` 仍 `HTTP 500` `Oops, something went wrong`。dummy code 是 400；真 code + 对不上的 `redirect_uri` 是 Cognito 常见 500。#38/#39 之后仍炸。

### 根因
授权 / 换票 `redirect_uri` 漂移：先是 origin vs path，再是 `127.0.0.1` vs `localhost`，最后两边都 origin-only —— Kiro 换票要的是**落地回调 URL**（path + `login_option`）。

### 修复
授权 URL 继续 origin-only `http://localhost:<port>`。换票 `redirect_uri` = origin + 落地 path，有则 `?login_option=`。`127.0.0.1` 在授权/换票里改写成 `localhost`。回跳接受 `/`、`/oauth/callback`、`/signin/callback`。UA `KiroIDE-1.0.0-<64hex>`，同一次登录复用 `machineId`。

## 2026-08-31：Antigravity 对话 403 VALIDATION_REQUIRED 被显示成「API 密钥无效」

### 现象
OAuth 活着、额度正常，对话 Cloud Code **403** `VALIDATION_REQUIRED` / `Verify your account to continue.` DSH 把 403 收成 AUTH →「API 密钥无效」。

### 根因
`forwardAntigravity` 原样转发 403。这是账号验证闸，不是 refresh 失效，也不是本机 proxy-key 错了。

### 修复
识别后改写 **HTTP 400**（非 AUTH），卡片条 + 打开 `validationUrl`。不把 `plt=` 打进日志。`isAntigravityPermanentRefreshError` 对此为 false，不清登录。

## 2026-08-30：GLM 思考链被清

### 现象
GLM-5.3 / Flash 对话断思考前缀：不带 `thinking.clear_thinking: false`，或丢掉上一轮 `reasoning_content`。

### 根因
官方思考模式要求 `clear_thinking: false` 且回放思考。DSH 助手常用别名 `reasoning`。`type: disabled` 对 5.3 / Flash 是 400。

### 修复
5.3 / Flash 始终 `thinking: { type: 'enabled', clear_thinking: false }`。Turbo 不强制关。不剥 `reasoning_content` / `reasoning`；`reasoning` 抄到 `reasoning_content`。

## 2026-08-30：Antigravity Gemini 长会话 400 — function_response 列表

### 现象
`Unknown name "response" … Proto field is not repeating, cannot start list`（`INVALID_ARGUMENT`）。

### 根因
`functionResponse.response` 是单个 Struct。OpenAI tool `content` 常是数组，被写成 JSON 数组。

### 修复
对象原样；数组 / 标量包 `{ result }`；字符串走 `{ text }`。连续 tool 合成多个 `functionResponse` parts。绝不把 `functionResponse` 或 `response` 写成 JSON 数组。

## 2026-08-30：GLM 首轮 400 `1214 角色信息不正确`

### 现象
新会话第一轮注入 AGENTS.md 等之后 400 `角色信息不正确`。

### 根因
DSH 系统提示是 `role: "developer"`。Zhipu Coding Plan Completions 只认 `system` / `user` / `assistant` / `tool`。

### 修复
`normalizeGlmChatBody`：`developer` 及未知 instructional → `system`。只改 `family === 'glm'`。Codex Responses 自己吃 `developer`。

## 2026-08-30：勾选 GLM / Antigravity / Kiro 不写 settings.yaml（`api: openai`）

### 现象
选择器 3/3 已开，`llm-pi-ai.providers` 只有 oauth-codex / oauth-grok。启动 `sync()` 吞成 `llm-pi-ai sync failed`。

### 根因
DSH `api` 闭集只有 `openai-completions | openai-responses | anthropic-messages`。三家写成裸 `api: 'openai'`，整段 mutate 被拒。

### 修复
Completions 家族写 `openai-completions`。**不要**写裸 `openai`。mutate 失败要抛给选择器，能回读则缺 `providers.oauth-*` 当失败。

## 2026-08-30：Antigravity 指纹 / 主机必须像官方 hub，不像 IDE / 第三方包装

### 现象
打 prod `cloudcode-pa`（IDE `--subclient_type ide`）或 UA 停在 `hub/2.9.1`；混用 `IDE_UNSPECIFIED` / 数字 `ideType: 9` / `dsh-plugin` UA 会被 Google 403 / 封。

### 根因
控制面和聊天面必须是同一套官方 **Antigravity.app / hub** 身份。CLIProxyAPI 的 prod 主机、IDE.app 版本、Gemini CLI 默认头都不能抄。

### 修复
默认 `https://daily-cloudcode-pa.googleapis.com`；5xx / 传输失败才回落 prod，**4xx 不回落**。UA `antigravity/hub/<ver> <os>/<arch>`，版本读 Antigravity.app（地板 2.11.0），**不**读 Antigravity IDE.app。metadata 字符串 `ANTIGRAVITY`。chat 头只有 User-Agent。session 必存 `projectId`；缺 project 直接 403，不上游。

## 2026-08-30：GLM 对话/额度带第三方 UA，拿不到 ZCode 1.5 倍额度

### 现象
官方限时「在 ZCode 中登录使用」1.5 倍额度。插件 UA 是 `dsh-plugin-oauth-subs/…`，上游按第三方记账。

### 根因
150% 是 **身份**（ZCode Desktop UA / `X-ZCode-*`），不是协议。把插件名写进 Coding Plan UA。

### 修复
Desktop 3.10.1：`User-Agent: ZCode/3.10.1 ai-sdk/anthropic/3.0.81` + `X-ZCode-*` + `Referer: https://zcode.z.ai`。CLI init/poll 只用 `ZCode/3.10.1`。不要抄 claude-cli 伪装头。本插件没有和官方 Desktop 对比过用量斜率。

## 2026-08-30：GLM 卡要看见官方「150%配额」

### 现象
用户要在已登录 GLM 账号卡上直接看到 **150%配额**，不要只写在说明里。

### 根因
pill 只有套餐 / 使用中 / 区域。额度条数学不该改。

### 修复
抬头加 **150%配额**；额度标题下一行说明。不做日期开关。**不要**把 used/total 乘 1.5。Codex / Grok / Antigravity 卡不出现。

## 2026-08-30：GLM 额度两条「本周期」，没有 5 小时 / 每周 / ZCode MCP

### 现象
两条杠都标 **本周期**（各 2000）。官方是 5 小时 + 每周，MCP 另算。

### 根因
`limits[]` 用 `type` / `unit`+`number` 区分窗口；旧解析只认 duration 字符串，没有就 `cycle`。

### 修复
映射 `primary` / `weekly` / `mcp`。UI（仅 GLM）：**5 小时剩余** / **每周剩余** / **ZCode MCP**。不编造额度数字。

## 2026-08-30：GLM 模型勾选 0/3，settings.yaml 没有 oauth-glm

### 现象
已登录，选择器 **已开启 0 / 3**。勾选或全选后 yaml 仍无 `oauth-glm`。`disabled` 含当前三条 + 退役旧 id。

### 根因
`syncHarnessModels` 只给「至少一条当前 catalog key 开启」的系列写路由。旧目录全关把后来仍在目录里的三条也写进 `disabled`；登录 `sync()` 不把残留全关当成要恢复。

### 修复
`setFamily(true)` 只 enable 当前 catalog id，不复活退役 id。已登录且当前 key 全关 → 打开当前 key 再写路由。选择器里主动全关仍 unset。

## 2026-08-30：关于页假安装入口（zip 三行 + 打开发布页）

### 现象
关于页把一份通用 zip 拆成 Win / macOS / Linux 三行下载，后来又留「打开发布页」。检查更新只比版本。真实升级是 `dsh plugin --profile web update`。

### 根因
`pickDownloads` 把 generic zip 复制成三行假安装器。宿主没有自动升级器。

### 修复
通用 zip 不生成下载行；去掉「打开发布页」。有新版本时 spawn `dsh plugin --profile web update dsh-plugin-oauth-subs`。不 `npm i -g`，不杀当前进程。

## 2026-08-30：Grok Fast 无加速；Codex Fast 只靠 body 字段

### 现象
Grok `-fast` 回显 `priority` 但吞吐无差。Codex `-fast` 回显一直 `default`/`auto`；不合格 id（mini）原样转发会 400。

### 根因
xAI 接受 `priority` 但不给吞吐。Codex CLI 还要 `x-codex-routing-hint` + `store: false`。回显 `default` 本身不是失败判据。`peelFastSuffix` 只在 `fastTier` 为真时剥。

### 修复
删掉 Grok Fast；残留只剥后缀，永不给 Grok 写 `service_tier`。Codex 合格 `-fast`：剥后缀 + `service_tier: priority` + `x-codex-routing-hint` + `store: false`。不合格 `-fast` 本地剥掉。文档不再把某次 1.54× 写成当前事实。

## 2026-08-30：GLM「导入本机会话」是空操作

### 现象
本机已用 ZCode Desktop 登录 BigModel，按钮点了没反应。活会话在 `~/.zcode/v2/config.json`。

### 根因
`glmAuthSearchPaths` 只扫了旧 CLI 路径。

### 修复
搜索路径最前加 `~/.zcode/v2/config.json`。多钥匙优先 coding-plan / start-plan，非 JWT 压过 JWT。不读加密 `credentials.json`。

## 2026-08-30：智谱 GLM 双站 OAuth / BigModel init 500

### 现象
先是只有一颗「登录」，国内账号打到 `api.z.ai`。加上中国按钮后，`provider: "zcode"` 的 CLI init 线上 500；`bigmodel` 才 200 并打开 `bigmodel.cn/login`。

### 根因
ZCode 拆成 Z.ai（`zai` → `api.z.ai`）与 BigModel（init `bigmodel` → `open.bigmodel.cn`）。0.0.19 误把国内 CLI id 写成 `zcode`。`GLM_BIGMODEL_APP_ID` 仍是授权 URL 上的 `zcode`。

### 修复
两颗按钮。`GLM_CLI_PROVIDERS.bigmodel = 'bigmodel'`。session 带 `region`，账号 id `email@zai` / `email@bigmodel`。导入路径上 `zcode` → `bigmodel` 仍是别名。

## 2026-08-30：多个账号挤在一条横条里，额度只显示当前账号

### 现象
邮箱挤成 pill 横条，额度挂在家族卡片底部。第二张 Grok 卡只有邮箱，必须先切换才看得到额度。

### 根因
`ProviderCard` 把 roster 画成横条；`QuotaStore` 按 provider 只读当前 session；UI 只在 `row.active` 时挂 `QuotaBlock`。

### 修复
一个 session 一张卡，额度永远在卡内（含未使用）。缓存键 `provider\0accountId`。snapshot 每张卡带自己的 `quota`。切换不清别人的缓存。标题不重复套餐。

## 2026-08-30：Codex Pro 徽章没区分 5x / 20x

### 现象
ChatGPT Pro 已拆 $100 Pro 5x / $200 Pro 20x，卡上只显示 **Pro**。

### 根因
`$200` slug 仍是 `pro`，`$100` 是 `prolite`。`formatPlanLabel` 都画成 Pro。

### 修复
`pro` → **Pro 20x**，`prolite` → **Pro 5x**。GLM 的 `pro` 仍显示 Pro。

## 2026-08-30：GLM 思考深度没写进目录，会话选不了

### 现象
GLM-5.3 / Flash 没有 low / high / max，请求不带 `reasoning_effort`，上游一直默认 max。

### 根因
目录 `reasoningEfforts: false`。localhost Completions 不会猜 `supportsReasoningEffort`。5.3 / Flash 无 `off` / `medium`；`disabled` 400。

### 修复
`GLM_REASONING = { low, high, max }` 写在 5.3 / Flash；Turbo 仍 `false`。Anthropic 路由不要盖 Completions `compat`（见 yaml 条）。

## 2026-08-30：智谱 GLM 模型清单错了，缺 Flash，且全部标成图文

### 现象
选择器 6 条旧 id，没有 GLM-5.3-Flash。全家 `input` 写死 `['text','image']`。5.3 / Turbo 官方是纯文本。

### 根因
0.0.16 按当时 Coding Plan 抄清单。`toHarnessModel` 硬编码图文。

### 修复
只留 `glm-5.3` / `glm-5.3-flash` / `glm-5-turbo`，各自 `input`。`toHarnessModel` 读目录。不要硬编码每行都图文。

## 2026-08-30：xAI Grok 额度读出来是预付 0、Grok Code 空行

### 现象
刷新后只见「预付余额 0」和没有数字的「Grok Code」，没有周额度条。OAuth 活着。

### 根因
付费账号是共享周池。CLI billing 对统一计费常省略 `creditUsagePercent`、给出 `prepaidBalance: 0`。周池在 grok.com `GetGrokCreditsConfig`。

### 修复
并行 CLI billing + user + gRPC credits。JSON 已有 percent 用 JSON；缺了用 gRPC weekly。预付 0 和没有数字的产品行不画。

## 2026-08-30：Grok 缓存命中率卡在 ~70%，热身后反复出现 512 token 块

### 现象
多数步 ~99% 复用，中间几拍 `cacheReadTokens` **正好 512**、命中 <1%，下一拍立刻回到 ~99%。加权被拉到 ~70%。

### 根因
xAI prompt cache **按服务器分片**，粘性头是 `x-grok-conv-id`（body 等价 `prompt_cache_key`）。粒度 512。不带粘性就打到只有全局系统前缀的机器。分析器若只认 `cacheReadTokens === 0` 会把 512 块误判成 `prefix_break`。

### 修复
Grok：写 `prompt_cache_key` + `x-grok-conv-id`。**仍然不**发送 Codex `session-id` / `x-client-request-id`。分析器：512 + 复用 <10% = `affinity_miss`。健康：加权 ≥80%，亲和丢失 0。

## 2026-08-26：本地 DSH Codex 缓存命中率异常偏低

### 现象
长会话加权命中约 27%。同一会话不能稳打到同一缓存分片；退出 plan / header 重建时 leading developer 顶掉已缓存前缀。

### 根因
转发只重建 OAuth 头，丢掉 `session-id` / `x-client-request-id`。Codex 按 `instructions` 再 `input` 最长前缀匹配；DSH 多出来的 leading developer 留在 `input` 开头会 bust。

### 修复
`session-id` = `x-client-request-id` = `prompt_cache_key`（可回退 `session_id`）。剥与 `instructions` 重复的 leading developer/system，多余文本停到 **input 后缀**。剥 `prompt_cache_retention` / `prompt_cache_options`。Grok 不继承这两颗头。压缩 / plan 重建零缓存不是分片丢失。健康：加权 ≥80%，**亲和丢失 0**，无 TRANSPORT。

## 2026-08-26：`Error: tool call timed out after 30000ms` 不是本插件

### 现象
验收会话里 glob / read / grep `host_timeout` / `cascade_abort`，TRANSPORT 为 0。

### 根因
DSH 把 fs 工具交给 `@deepseek-ai/dsh-tool-fs-search`，默认 `timeoutMs` **30000**。oauth-subs 是 Responses 回环，**不跑** glob / read / grep。

### 修复
**非修复。** 不要在本插件加 `toolTimeoutMs`，也不要在代理层重试 glob。要加长预算改 `dsh-tool-fs-search`，或等 DSH 让补丁能打到 agent-preset。

## 2026-08-26：并发子代理全线 `stream ended before a terminal response event`

### 现象
七会话同时恢复后，走 oauth-codex 的全报该 TRANSPORT（llm-pi-ai 读完 SSE 没等到 `response.completed`），盲重试 5 次。走别的 provider 的活着。头发出前的同类故障曾是 `500 "fetch failed"`。

### 根因
上游瞬时断流。`forward()` 的 `finally { response.end() }` 把已发出头的中断收成「HTTP 200 + 干净 EOF」，真实原因丢失。

### 修复
头已发出且非客户端断连 → `response.destroy(error)`，不要假装正常结束。`CommitGate`：未证明产出前不提交头；未提交断流可重试（3 次）；耗尽回 502。已产出内容之后不能重放。不保证上游不再抖动。

## 2026-08-26：Codex 目录漂移（minimal / 下线 id / ultra / -fast）

### 现象
排查 TRANSPORT 时打到真实接口：`minimal` 400、`gpt-5.3-codex` 对 ChatGPT 账号已下线、`ultra` 400、不合格 `-fast` 400、窗口写死 900K 不准、`/codex/v1/models` 缺 `client_version` 400。

### 根因
同一批模型事实在多个文件各抄一份。`ultra` 是 CLI 多智能体委派，不是 wire effort。

### 修复
事实收进一张 `codexModel()` 表。去掉 `minimal`、下线 id、`ultra` 别名（只能退化成 `max`）。`-fast` 与窗口按模型。补 `client_version`。
