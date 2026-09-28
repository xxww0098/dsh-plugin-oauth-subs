# 错误记录

同一根因 / 同一用户可见故障只留一条 `##`（后续跟进并进该条，标题用最晚日期）。新条目只要 **现象** / **根因** / **修复**，各 1–2 行。

## 2026-09-29：对照 magpie（yetone/magpie）审网关 / 账号 / 额度 / hop——采纳 8 处小改，多账号故障转移与冷却维持不学

**现象**：没有单一现象；对照出的缺口分散在下面同日各条里（冷读额度串行、状态文件非原子写、CI 与自更新都不验 `lib/`、导入登录被重登继承、Copilot 目录含 `/responses`-only 行、Kiro 丢图片、Kiro 超长提示宿主不压缩）。
**根因**：这些是我们没有、magpie 有明确处理的地方；magpie 的头号特性（网关内多账号故障转移 / 冷却 / 按缓存亲和选号 / 计费头 + 请求体哈希冒充 Claude Code / 自动接受 Copilot 条款）不采纳，理由分别是 `specs/request-path-upgrades/choices.md` 决定 5、不加强对厂商的冒充、不替用户接受厂商条款。
**修复**：见各条。**待活测才能动的线索**（不凭对照改）：Cursor 丢图片入参、Kiro effort 未上线、Kiro 遇输出上限（`ContentLengthExceededException`）当失败、Codex / Grok 换号后重放他号封存的 reasoning、Cursor 并行 tool call 每个占一次 Run、Cursor 团队区域 401 应为 403、Grok 客户端版本 `0.2.93` 对官方 `1.0.41`、Codex 重置额度未指明 `credit_id`、Anthropic 用量 429 无 Retry-After 退避、额度快照不落盘。

## 2026-09-29：Kiro 目录声明支持图片，请求里却只留文本，图片被静默丢掉

**现象**：用默认模型 Kiro `claude-opus-5.5`（目录 `input: [text, image]`）读图 / 贴截图，模型像没看到图一样回答，没有任何报错。
**根因**：`openaiToKiro` 的 `flattenContent` 只取 `type === 'text'` 的部分，`image_url` 一律丢弃。
**修复**：`data:` 图片按 kiro.rs `KiroImage` / magpie `buildKiro` 的线格发成 `userInputMessage.images`，只保留最近一条带图的 user 消息，远程 URL 与非 png/jpeg/gif/webp 不发。回归 `test/kiro-request.test.ts`。**未用活账号验证线格**；Cursor 有同样的丢图，线格更复杂，仍待活测。

## 2026-09-29：Kiro「Input is too long」宿主认不出是上下文溢出，不会压缩，整轮失败

**现象**：Kiro 会话超过真实上下文后，宿主直接报 INVALID_REQUEST，不自动压缩（只有 `CONTEXT_WINDOW_EXCEEDED` 才触发压缩后继续）。
**根因**：pi-ai 适配器用 `isContextOverflow` + `isContextWindowExceededError` 按措辞判定；Kiro 原文 `Input is too long.` 两套都不匹配（Bedrock 那条要 `for requested model`）。
**修复**：`kiroClientErrorBody` 对 `kiro_too_big` 加前缀 `input is too long for the model's context window: `，状态码仍是 400/413。回归 `test/kiro.test.ts`（内嵌宿主正则原文）。对照 magpie `kiroFailure`。

## 2026-09-29：导入的 Codex / Claude 登录改用浏览器重登后，账号仍被当成导入登录（只读，终会再变陈旧）

**现象**：Codex / Claude 的本机导入登录变陈旧，按提示「重新登录」走浏览器授权，新令牌能用一阵，过期后又报 `imported login is stale`。
**根因**：`saveSession` 合并同账号的旧字段，`source`（导入路径 / `keychain:…`）不在 `SESSION_CREDENTIAL_KEYS`；Codex / Anthropic 的浏览器登录不写 `source`（Cline / Kimi / Cursor 显式写 `oauth` / `pkce`），旧值被继承，`imported.is()` 仍为真，只重读 CLI 文件、从不用自己的 refresh token 换票。
**修复**：`source` 归入 `SESSION_CREDENTIAL_KEYS`（重登总是重新给出）。回归 `test/store.test.ts`「a browser re-login is a login of its own…」。对照 magpie `upsertLogin`（重登整条替换）。

## 2026-09-29：Copilot 选择器列出只在 `/responses` 上服务的模型，回环 hop 只有 `/chat/completions`

**现象**：（推断，本机无 Copilot 凭据、未活测）登录后目录里会有 Copilot 只在 `/responses` 上服务的行，选中后 hop 打 `/chat/completions` 拿不到该模型。
**根因**：`toCopilotPickerModels` 不看 `/models` 行的 `supported_endpoints`；hop 只有一个端点。opencode `plugin/github-copilot/models.ts` 与 magpie `copilotAPIs` 都按这个字段选端点。
**修复**：`supported_endpoints` 非空且不含 `/chat/completions` 的行不进目录，字段缺省或为空照收；静态楼没动（没有活目录可对）。回归 `test/copilot.test.ts`「live picker skips rows Copilot serves off /chat/completions」。

## 2026-09-29：重启 / 热重载后设置页首屏要等所有家族额度逐个读完

**现象**：宿主重启或热重载后，插件面板要等各家族额度读取时间之和才出第一屏；某个上游慢或挂起时，整页跟着卡到它超时（每家 10s）。
**根因**：`#buildSnapshot` 对 13 个家族逐个 `await #ensureAccountQuota`，冷缓存时每个都同步等上游；这是 0.0.26 起逐家族加行留下的串行，不是有意限流。
**修复**：`Promise.all(PROVIDER_IDS.map(…))`，冷读耗时降为最慢的那个上游。回归 `test/controller.test.ts`「a cold snapshot asks every signed-in family for its quota at once」。对照 magpie 的 `quotas()`（各厂商同时问）。

## 2026-09-29：`signed-out.json` / 出站代理 / 更新偏好非原子写，崩溃时撕裂文件读成「没设置」

**现象**：（潜在，未见实例）写到一半宿主被杀，`signed-out.json` 撕裂后读成 `[]`，退出过的家族重启又自动登录；`outbound-proxy.json` 撕裂后读成「没配代理」，请求悄悄直连。
**根因**：这三处用裸 `writeFile`（先截断再写），读端把解析失败当默认值；其余状态文件早就走 `writePrivateText`（临时文件 + rename，0600）。
**修复**：三处改走 `writePrivateText`；`test/atomic-writes.test.ts` 扫描 `src/`，裸 `writeFile(` 只允许 `private-text.ts` 与 `models.ts`（临时文件 + rename 用户自己的 patch）。对照 magpie 的 `edit.WriteAtomic`。

## 2026-09-29：CI 不检查已提交的 `lib/` 是否与 `src/` 一致

**现象**：历史上有 13 次「chore: rebuild lib …」补提交（按提交标题统计）；GitHub 地址安装与自更新读的是提交里的 `lib/`，src 改了没带构建产物就会发出旧代码。
**根因**：`npm test` 在 runner 上重新构建 `lib/`，提交里的那份从没被测过；`package-surface` 只查文件存在。
**修复**：CI 在 `npm test` 之后跑 `git status --porcelain -- lib`，非空即失败；自更新换装前也校验暂存副本有 `lib/index.js`（`swapPackageDirs`），缺了就拒绝、旧目录不动；顺带加 `concurrency`（顶掉的旧运行自动取消）和 `permissions: contents: read`。

## 2026-09-28：添加账号弹窗里展开的输入框掉到列表最底部

**现象**：Kiro「Enterprise / API Key / Refresh」等方式行展开后，输入框渲染在所有方式行和「导入」之后，离被点的那一行很远。
**根因**：`ProviderCard` 把每个内联表单写成 `.osubs-logins` 列表的兄弟节点，统一排在列表后面。
**修复**：表单移进列表、紧跟触发它的方式行（Kimi / Copilot / Devin / Command Code / Ollama / GLM / Kiro 全部）；样式选择器由 `+` 改为 `>`。

## 2026-09-28：退出账号后，重启 / 热重载又自动登录回来

**现象**：在 Cursor / Devin / Cline / Command Code（以及 Ollama / Kimi / Copilot）点「退出」，`auth.json` 里的账号确实删了，但宿主重启或插件热重载后账号又回来了，看起来像退出没生效。
**根因**：这 7 个家族每次启动都会自动导入：该家族没有账号时，就从本机 CLI / IDE 凭证（Cursor 钥匙串、Devin toml、Cline / Command Code CLI 文件）导入一次。`*AutoImportTried` 只存在内存里，重建实例后就清零，于是自动导入把刚退出的账号又写了回去。
**修复**：`logout` 把家族名写进 `auth.json` 旁边的 `signed-out.json`，自动导入遇到在列表里的家族就跳过。手动「导入本机会话」和重新登录不受影响，也不需要清除这个标记：自动导入只在该家族没有账号时运行。回归测试 `test/cursor.test.ts`「signing out survives a restart」。

## 2026-09-28：Kiro Builder ID 额度读取失败 · Invalid profileArn.（HTTP 400）

**现象**：粘贴凭证导入的 Builder ID（`idc`，无 `profileArn`）账号卡报「额度读取失败 · Invalid profileArn. (HTTP 400)」，对话正常。
**根因**：`kiroEffectiveProfileArn` 认定 `BUILDER_ID_PROFILE_ARN` 是占位、不发给用量端点，而导入的 Builder ID 本来就没存 ARN，`getUsageLimits` 只能不带 ARN 发出。活测：不带 ARN 回 400 `Invalid profileArn.`，带 Builder ID 常量回 200（KIRO POWER）。重试只在 403 时继续，400 直接抛出。
**修复**：额度改用对话 / 目录同一个 ARN（`kiroStreamingProfileArn` 改名 `kiroProfileArn`；social → Social 常量、其余 → Builder ID 常量、api_key 不带），删除 `kiroEffectiveProfileArn` 和不带 ARN 的重试；只有 403 才换区。

## 2026-09-28：Grok 首轮第二步只回会话标题就结束（「会断」）

**现象**：新会话 `grok-4.7` 第一轮跑完一次工具调用，第二步只输出一行标题（如「排查TPS数据异常」）就正常结束；推理里写着 "create a concise title"。
**根因**：DSH 的会话标题请求和主对话用同一个 `prompt_cache_key`，两个请求同时发出。`pinGrokSystemPrefix` 按 conv id 让第一个到达的 system 钉住。标题请求先到时，钉住的就是标题 prompt，主对话被放到 input 后缀，Grok 就照标题 prompt 回了。
**修复**：`changedRegion` 发现共享部分不到较短文本一半时返回 `null`，视为另一个 prompt，这时重钉并原样发出，不再放进后缀。前插快照、中段改写照旧只放变化区。回归测试 `test/grok-request.test.ts`「an unrelated system prompt … re-pins」。
**跟进（同日）**：Completions 路由也有 session id 之后（`cacheRetention: 'long'`），Kiro / Cursor / Copilot / Kimi / GLM（Completions + Anthropic）/ Antigravity 同样把不相关的新头整段放进后缀，旧钉头在前。各家 `cache.ts` 自带一份 `unrelatedPrompt`，门槛和 Grok 相同：未达门槛重钉原样发，达到门槛仍走原停车逻辑。没有照搬 Cline 的「非扩展即重钉」，因为 DSH 每步前插快照，那样每步都会破缓存。回归测试 `test/cache-families.test.ts`「<family>: a session-title prompt pinned first …」。

## 2026-09-28：Devin / Command Code 在代理内重放上游 5xx（Command Code 还有 429）

**现象**：上游返回 5xx 或 Connect 错误时，代理先自己重放 3 次再回 502，宿主又按 SERVER 重试 5 次，一次故障最多打出 15 次上游请求。Command Code 连 429 和厂商标了 `isRetryable` 的 `error` 事件也重放。
**根因**：两家各有私有的 `runRetrying`，`devinRetryable` / `commandCodeRetryable` 把状态码 ≥500（以及无状态的 trailer 错误、429）当成传输故障。这违背了「4xx/5xx 转发、代理内不重试」的契约（09-27 条）。
**修复**：TransportError 带显式 `retryable`，只有传输故障（socket 错、空 body、无消息结束、未 finish 就断流）为 true；HTTP 状态、trailer 错误、`error` 事件转发一次，交给宿主重试。

## 2026-09-28：Kiro 月度额度耗尽（始 09-03）——400 改为 429 + 额度措辞

**现象**：09-03 时 `MONTHLY_REQUEST_COUNT` 被当成普通 429 反复重试，当时改成回 400 止住了。但 400 会被宿主归为 INVALID_REQUEST，提示成「请求无效」，与额度耗尽的实际情况不符。
**根因**：宿主只按错误文本分类，`classifyPiAiError` 先判断额度措辞（`isQuotaExceededError`），再判断 429。当时的文案不带额度措辞，只能靠 400 来避免被重试。
**修复**：回 429，文案前缀 `usage limit reached: `，type `insufficient_quota`，宿主归为 QUOTA_EXCEEDED、不重试，提示也准确。非流式的流内异常也按同一分类定状态码。测试把宿主的额度正则钉进 `kiro.test.ts`。

## 2026-09-28：Kiro 官方模型目录与 GPT-5.6 1M 窗口更新

**现象**：Kiro 设置页选择器缺少官方新模型 Claude Fable 5.1；GPT-5.6 全系上下文仍为 272K；Sonnet 4 显示名未对齐官方 4.0；活目录合并缺少对 `supportedInputTypes` 图像输入能力的动态解析。
**根因**：Kiro 官方在 2026-09-14 将 GPT-5.6 Sol / Terra / Luna 升级至 1M 窗口，9-25 官方模型表上线 Claude Fable 5.1（1M 窗口、6x 计费，US East）并将 Sonnet 4 标为 4.0；`KIRO_GPT_CONTEXT` 和离线回退表未同步更新。
**修复**：`KIRO_GPT_CONTEXT` 升级为 1,000,000；离线回退目录加入 `claude-fable-5.1` 并保留 `claude-fable-5` 兼容行；`claude-sonnet-4` 显示名更新为 Claude Sonnet 4.0；活目录解析增加 `supportedInputTypes` 支持，并与 `inferKiroReasoning` / `inferKiroWindow` 联动。
**跟进（同日，活目录）**：Kiro 选择器里列出的 Claude 在两个账号上都用不了，发出去是 400 `INVALID_MODEL_ID`。后端按 origin 放行模型：chat 发 `AI_EDITOR`，而目录请求用的是 `KIRO_CLI`；静态文档行又无条件合并进选择器，账号用不了的模型也会列出来。`origin=KIRO_CONSOLE` 能列出全部 21 个（含 `claude-opus-5.5`），但那是治理目录，拿它发 chat 是请求格式错误。出口直连、Cloudflare `loc=CN`，和 Cursor 一样按出口区域过滤：换到 `loc=US` 出口后当场出现 Claude（Power 19 个，Free 8 个）。全模型活测：Power 的 19 个模型流式 + 非流式 38/38 返回 200，Free 的 8 个也全部 200；列表外的模型（Fable 5.1 / 5，Free 上的 Opus / GPT）都是 400 `INVALID_MODEL_ID`。修复：目录请求改用 `KIRO_CHAT_ORIGIN`；目录缓存 key 加上出口代理，手动刷新时强制重拉；活列表非空就直接当选择器，窗口 / 输出 / 输入 / effort 全部读接口字段；静态表改成 `KIRO_CONSOLE` 快照，只在离线时用。Auto 按用户要求从 Kiro 和 Cursor 的选择器里移除。

## 2026-09-28：Claude 两种登录全断 = 只开了 Console 门，且导入换票会毁掉本机 refresh

**现象**：浏览器登录进 Claude Console（API 账单账号），Max/Pro 的 Claude.ai 订阅对不上；旧地址 `claude.ai/oauth/authorize` 仍是 Cloudflare 403。导入若拿共享 refresh 去换票，钥匙串里的 refresh 被轮换作废，Claude Code 自己的登录一起死。
**根因**：2.1.283 把两种登录拆开——`CLAUDE_AI_AUTHORIZE_URL=https://claude.com/cai/oauth/authorize`、`CONSOLE_AUTHORIZE_URL=https://platform.claude.com/oauth/authorize`（`AVn()` 按 `loginWithClaudeAi` 选择）。插件只钉了 Console。无 cookie 的 `claude.com/cai/oauth/authorize` 会 307 到 `claude.ai/oauth/authorize`（Cloudflare），真浏览器能落到 Claude.ai 登录页。导入读的是同一份钥匙串 refresh；`grant_type=refresh_token` 会轮换，写不回 store 就把本机登录毁掉。scope 还缺 `user:plugins`。
**修复**：登录拆成 Claude.ai 订阅与 Console 两个按钮，分别打上面两个 host。导入只读钥匙串/文件，不写、不删 `.credentials.json`；已导入会话到期后重新读取本机 store，不用共享 refresh 换票。scope 补 `user:plugins`，指纹钉 2.1.283。钥匙串拒绝读取时报 `anthropic-import-locked`，不再假装「没登录」。

## 2026-09-28：Claude 额度抓取不稳定 = 每次刷新都附赠一次真实计费的 Messages 探针

**现象**：Claude 账号卡额度时好时坏——偶发报错、429、或某几条 meter 掉线。
**根因**：`fetchAnthropicQuota` 每次刷新**并行**打两个端点：`GET /api/oauth/usage` + 真实 `POST /v1/messages`（`max_tokens:1` ping）只为读 `anthropic-ratelimit-unified-*` 头。探针是计费推理调用——账号真到 5h 顶、上游过载或排队时它就 429/超时，而 usage 端点本身限流又凶，两请求并发把失败面翻倍；且探针纯属冗余，usage 一次响应已带全 5h/7d/`limits[]` scoped。
**修复**：对齐 stablyai/orca `claude-oauth-usage-request.ts`——usage 端点为唯一来源（指纹收窄到 `Bearer` + `anthropic-beta: oauth-2025-04-20` + UA），计费 Messages 探针与统一限额头解析整路删除，失败抛错由调用方服务上一快照；Fable 旧字段补 `fable_weekly` / `fable_seven_day` / `seven_day_fable` 拼写。

## 2026-09-28：Cursor 取消后 h2 流仍在跑；每次 Run / 一元 RPC 都新建 h2 连接

**现象**：取消对话 / unary 超时后远端流未关闭，仍在收文本或回 KV（09-08）；为了停上游改成每次 Run 和目录 RPC 独占一条 h2 连接，结束时 `client.destroy()`，于是每次都重新 TCP + TLS（经代理还要 CONNECT / SOCKS5 握手）。
**根因**：`client.close` 只优雅关闭、不终止活动流，data handler 不看结算状态；取消只能靠销毁独占会话实现，`cursorH2Connect` 每次 `http2.connect`。
**修复**：`cursorH2Connect` 按 (origin, 出口代理) 池化一个会话，并发拨号合并；close / GOAWAY / error / 60s 无帧出池，会话 `unref()`，插件 effect 清理时 `clearCursorH2Pool()`。`runCursorAgent` / `cursorUnaryRpc` 结束或取消只 `stream.close(NGHTTP2_CANCEL)` 自己的流，结算后不再处理消息，事件消费逐条等待（背压传回上游）；放弃后才落地的拨号入池不交给该调用方。
**活测（2026-09-28，宿主 Node v24.21.0）**：worktree `lib/` 的 `runCursorAgent` 连续 2 次 composer-2.5（未刷新）：均回 PONG（5.3s / 3.6s），`http2.connect` 共 1 次。

## 2026-09-28：Antigravity 长会话约第 128 次工具调用后前缀逐轮断裂

**现象**：按调用序号统计的命中率，0–119 次 88–94%，120–159 次 49.9%，160–199 次 40.9%。
**根因**：签名表每会话 256 键、先进先出（重复 set 不刷新），每次调用占 2 键；约第 128 次起最早的签名被淘汰，那条 functionCall 被改写成文本，前缀从这里断。
**修复**：`request.ts` 签名桶只给真实会话 id（`isAntigravityFallback` 为门，回退 id 不存也不查）；每会话 4096 键、get 和 set 都刷新（Map 插入序 = LRU）；最多 64 会话；全局 key + 签名文本 64 MiB，超出先淘汰最久没用的整个会话。合成回放 300 次调用：第 1 次的签名仍挂着，没有 functionCall 变文本，相邻两轮 `contents` 前缀逐字节延长（243 → 26462@128 → 62410@300 字节）。
**活测（2026-09-28）**：gemini-3-flash 真实签名长度 140（low）/ 2516（high）字符；设想的 32 MiB 对应 128 B/键，「典型 × 4096 × 64」≈ 640 MiB 远超，所以上限按实测改为 64 MiB：满载会话（4096 键 × ~2.6 KB）≈ 10.5 MiB，可整存约 6 个。gemini-3.1-pro-high 这次 400 INVALID_ARGUMENT，未取到样本。

## 2026-09-28：Codex 请求体明文上传，长会话每轮几百 KB 到 MB

**现象**：Codex 请求体不压缩，光 `instructions` 就约 128KB，长会话每轮上传几百 KB 到 MB（宿主自带的 openai-codex provider 早已用 zstd）。
**根因**：`forward()` 只发 `JSON.stringify` 后的明文 Buffer，没有按家族编码请求体的接缝。
**修复**：`forward()` 新增路由参数 `encodeBody(buffer) → { body, headers }`，只转交；Codex 路由传 `codex/request.ts` 的 `encodeCodexBody`（`zlib.zstdCompressSync` 默认级别 + `content-encoding: zstd`，不设大小门槛），在尝试循环之前压一次，重试复用同一个 Buffer；其他家族不传，仍是明文。后端若回 400 / 415 不回退明文。
**活测（2026-09-28，宿主 Node v24.21.0，worktree `lib/` 的 `createProxy`，未刷新）**：41307 B → 9722 B（23.5%）。流式 gpt-5.6-luna 200（2.2s，`response.completed`）；流式与非流式各 1 次 gpt-5.4-mini 回 400「model is not supported」——后端已解压并读出 `model`，非编码问题；非流式成功路径未单独验。无 ExperimentalWarning。

## 2026-09-28：导入的厂商 CLI 登录被插件拿去换票，插件和 CLI 互相登出

**现象**：从 Codex / Cursor / Cline / Kimi / Claude Code 导入的登录临期时，插件用与 CLI 共享的 refresh token 换票；会轮换的家族里，后换的一方拿到 `invalid_grant` / `refresh_token_reused`，被登出。本机实例：Cline `cli` 登录的 vault 到期是 09-28，`providers.json` 里的仍停在 09-26，说明插件一直在自己换票。
**根因**：`TokenManager` 不区分登录归属，导入的会话也走各家族的 `refresh`。Cursor 导入时还会对过期的 Keychain / vscdb 当场换一次票。
**修复**：`TokenManager` 新增 `imported: { is, reread, cli }` 钩子，由各家族注入（`codexImported` / `cursorImported` / `clineImported` / `kimiImported` / `anthropicImported`）。导入的会话临期时只重读源 store，过期时间晚于现在 + 15s 才采用，只覆盖 token 字段，经版本守卫写回；否则抛 `ImportedLoginStale`（`LoginRequiredError`，403，不算永久失败），不删号，走 10s / 5min 负缓存。Codex 导入记 `source: <路径>`，过期改取 JWT `exp`；Cursor 删掉导入时的换票。Devin `cli_toml`、Copilot `cli` 不在此列。重读到的账号标识（Codex `accountId`、Cursor JWT `sub`、Cline `userId`）与存储行不同 = CLI 换了号，同样抛 `ImportedLoginStale`、不采用（Kimi / Claude Code 的 store 没有账号标识）。轮换证据写在各家族 README：Cursor 不轮换，其余四家都轮换。
**活测（只读，宿主 Node v24.21.0）**：各源重读 1 次，网络调用 0：Codex 文件可解析，有效到 10-04；Cursor Keychain 有效到 11-20，vscdb 到 11-23；Cline 可解析但已过期，临期即报 stale；Claude Code Keychain 可解析但已过期（CLI 下次运行时会刷新）；Kimi 未安装。本机存量 Codex 登录没有 `source`，要手动重新导入一次。

## 2026-09-28：上游空闲约 4s 就断连，下一轮重新握手

**现象**：两轮之间空闲超过约 4s（codex 14%，其余家族 10–16%），下一个请求要重新 TCP + TLS 握手（chatgpt.com 约 1.7s，ollama.com 约 0.5s）。
**根因**：chatgpt.com / ollama.com 不发 `Keep-Alive` 响应头，undici 退回默认 `keepAliveTimeout` 4s，池里的 socket 空闲 4s 即关闭。
**修复**：`outbound.ts` 的直连 `Agent` 与 `ProxyAgent`（经 `...opts` 传到隧道 Agent）同一处设 `keepAliveTimeout: 60_000`、`keepAliveMaxTimeout: 600_000`。陈旧 socket 在输出前 ECONNRESET 由上游重试兜底，不另写代码。`test/outbound.test.ts` 用不发 Keep-Alive 的本地服务端间隔 6s 两次请求：直连与 CONNECT 隧道各 1 个连接，全局 fetch 对照为 2。
**活测（2026-09-28，宿主 Node v24.21.0）**：worktree `lib/` 的 `outboundFetch` 直连 Codex `GET /models` 于 0s / 30s / 55s 各一次，全 200，`undici:client:connected` 共 1 次；耗时 1343 / 568 / 571ms。

## 2026-09-28：会话 id 串用——Completions 路由从没收到 DSH 会话 id，回退 id 仍会 pin；GLM `x-session-id` 每进程随机

**现象**：八条回环 Completions 路由（kiro / antigravity / cursor / ollama / kimi / copilot / devin / cline）的会话键永远是 `dsh-<id>[:<model>]`，第一个会话的系统提示（Antigravity 还有 tools / thinking / 签名桶）被钉给后来的会话；GLM 无 pin 时 `x-session-id` 是每进程随机的 `sess_<24hex>`，重启 / 热重载就换。
**根因**：pi-ai openai-completions 只在路由 `cacheRetention === 'long'` 时发 `prompt_cache_key = sessionId`，我们的路由从没设；Cursor 先删 `prompt_cache_key` 再推导 id。回退 id 带 `:<model>` 后缀，kiro / cursor / antigravity 的守卫只比对裸常量；kimi / copilot / cline 没有守卫；四个传输层又各自二次推导会话 id。
**修复**：`buildProviders` 只给 Completions 路由加 `cacheRetention: 'long'`，`assertPersistedProviders` 校验它落进 settings.yaml；Cursor 先推导再删；上游仍不见 `prompt_cache_key`。`/health` 的 `inboundCacheKeys` 按家族计入站带 / 不带 key 的次数。七个家族的 `cache.ts` 各一个解析器 + `is<Fam>Fallback`（等于常量或以 `<常量>:` 开头），所有 pin 以谓词为门；传输层直接用传入的 `cacheSessionId`。Antigravity thinking pin 显式换 `reasoning_effort` 才替换。GLM 用 `dsh-glm`。防火墙测试扫所有 `cache.ts` 与导出请求头构建函数的模块，会话 id 位置不许出现时钟 / 随机数。
**活测**：GLM（bigmodel，ZCode 网关）带 `x-session-id: dsh-glm` → 200。`/health` 计数需宿主热重载，合入后在主检出看；Command Code（`toWireThreadId` 只收 UUID）在维护者 WIP 里，待落地后补。

## 2026-09-28：上游卡住或断流时代理比宿主 300s 看门狗更晚收场，失败被收成成功 / SSE 错误块

**现象**：上游静默时代理不断流，只等宿主 300s 看门狗（09-10 `grok-4.6` 连续两次 `stream idle timeout`）；有头无体 3×120s+5s≈365s 才回 502；头发出后的异常被收成干净 EOF 或 `{error}` SSE 块（宿主归 `PI_AI_ERROR`），截断的 Cursor / Kiro / Devin 流、带 `body.error` 的 Antigravity 流被当成功答复；Connect 错误不分码一律 502，Devin 5xx 在代理内重放；Cline / Kiro 额度被当 RATE_LIMIT / 400；「未登录」回 500；401 刷新后的重试丢了 stream `accept` / zstd / Copilot `x-initiator`。
**根因**：计时只有 proxy 读循环里每次尝试重置的 `withIdleTimeout`，没有首字节与总预算；Cursor / Kiro / Antigravity / Devin 各自管 HTTP / h2，各带重试、错误块分支、drain 等待与读循环（Devin 读循环没有 `finally`，抛错时钉住 socket）；错误帧只取文案不取 code；mapper 在第一个事件（含 usage / 错误）就提交 role 块；401 重试把家族头合并在已构建的头之上。
**修复**：`src/oauth/upstream.ts` 独占计时 / 预算 / 重试 / 失败映射与头后写出：每次尝试首字节 120s，输出前预算 270s（从路由入口起算，含 `tokens.session()`），`已用 + 退避 + 120s ≤ 270s` 才重试，否则 504；传输故障耗尽 502；输出后空闲 270s，头发出后一律 `destroy`（`answerFailure`）。`writeSse` / `pumpBody`（读完必 cancel + releaseLock）/ `quotaFailure` 各一份，401 刷新钩子由 `tokens.ts` `forcedRefresh` 生成。HTTP 与 Connect 错误（`connectCodeStatus`）只转发一次；role 块随第一块内容才发。分析器补扫嵌套 failure（`stream idle timeout` = transport）。
- Completions / Responses（`proxy.ts`）：Codex turn-state 回放、GLM 网关回退在同一次尝试内；401 刷新后按首次构建整份重组请求头；Cline `INFERENCE_CAP_ERROR` → 429 `usage limit reached:`；`LoginRequiredError` → 403。
- Cursor：首字节覆盖 h2 拨号 + 首个 DATA 帧；非 200 的 h2 头按原状态；残帧 EOF 拒绝；`unauthenticated` 刷新一次。
- Kiro：parser 遇非法帧长 / header 长度即报错，畸形帧 / 残帧 / 断流在输出前重试；月度额度 → 429 `usage limit reached:`；401/403 刷新一次，仍被拒改 400（不进 AUTH）。
- Antigravity：`body.error` 按 `error.code`（否则 RPC status 名）转状态；没有 `finishReason` 的 EOF = 截断。
- Devin：删 `runRetrying` / `devinRetryable`；usage / stop 帧不提交头；没有 Connect end 帧或带残帧的 EOF = 截断（输出前重试、输出后 destroy）。
**活测（2026-09-28，宿主 Node v24.21.0，worktree `lib/` 的 `createProxy`，未刷新）**：Codex gpt-5.6-luna 200（3.2s）；Cline deepseek-v4.1-flash 200（2.2s）；Cursor composer-2.5 200（5.2s，cached 10549/11394）；Kiro deepseek-3.2 200（1.2s，免费档 haiku / auto 400 未重放）；Antigravity 2 次 200，终帧都带 `finishReason`；Devin swe-2 200（6.3s）。

## 2026-09-28：设置页切走后仍每 1.5s 轮询，额度每分钟约 78 次请求

**现象**：本机 13 个账号，插件面板打开过一次后，即使切到别的主面板，设置页仍每 1.5s 发一次 `status`，额度接口约每分钟 78 次。
**根因**：主面板切走后仍保留挂载，轮询只看 `document.hidden`；`setInterval` 不等上一次 `snapshot()` 完成，并发的 snapshot 各跑一遍；被动额度 TTL 只有 10s；GLM userinfo 与 Cursor `state.vscdb` 身份回填每次 snapshot 都跑，GLM `getJson`/`postJson` 没有超时。
**修复**：`client.ts` 新增纯函数 `panelVisible(el, doc)`（`!doc.hidden && el.checkVisibility?.() !== false`），只在可见时刷新，上一次完成后才排下一次，`visibilitychange` 回到前台立即刷新；`AuthController.snapshot()` 单飞，共享进行中的 promise，settle 后清掉；`QUOTA_TTL_MS` 与 OpenCode Go 额度 TTL 改为 60s，「刷新额度」仍绕过 TTL 并复用 `QuotaStore` 按账号去重；GLM / Cursor 身份回填每账号每 60s 最多一次（`onAuthChanged` 清表），Cursor 只在有账号缺人类 id 时才打开 `state.vscdb`；GLM `getJson`/`postJson` 加 10s 超时。
**待验**：宿主保留的隐藏主面板上 `checkVisibility()` 是否返回 false，只能在运行中的宿主里确认；如果无效，改用 IntersectionObserver。

## 2026-09-28：Codex/Grok 提交闸门在真实流上从不生效，「只有前导就断流」照样漏到客户端

**现象**：08-26 事故签名（只收到 `response.created` 就断流）本应在代理内重试，但真实流上闸门第一个 chunk 就提交响应头；`specs/request-path-upgrades/assets/repro/gate-frames.mjs` 旧版对 `response.created` 打印 `output true`。
**根因**：`hasOutputEvent` 用正则扫缓冲文本里任意 `"type"`，`response.created` 回显的 `text.format.type` / `tools[].type` 被当成输出；前导回显约 128KB `instructions`，单凭字节也会超 64KiB 上限提交。
**修复**：新纯模块 `src/oauth/responses-sse.ts`：`classifySseFrame` 只看完整帧的 `event:` 行（没有则 `data` 顶层 `type`），`SseFrameScanner` 按 latin1 保存未完成帧尾（字节精确、UTF-8 切断无害）。`CommitGate` 第一个 output 帧才提交；前导字节不计 64KiB，只计无法分类的帧；缓冲超 2 MiB 放行提交并 `console.error` 一行。删 `EVENT_TYPE` / `hasOutputEvent` / `hasPreambleEvent`。
**活测（2026-09-28，宿主 Node v24.21.0）**：worktree `lib/` 的 `createProxy` 各发 1 次极小流式请求，未刷新。Codex（gpt-5.6-luna）与 Grok（grok-4.7）前导都只有 `response.created` + `response.in_progress`（各带 `event:` 行），第一个输出都是 `response.output_item.added`；没有新前导类型，本次 Codex 未出现 `codex.rate_limits`。前导实测 2950B / 2034B（提示极小，DSH 真实前导约 2×128KB，远低于 2 MiB）。脱敏夹具 `test/fixtures/{codex,grok}-preamble.sse` 的 `instructions` 刻意补到 200 KiB。

## 2026-09-28：换票超时后才成功被丢弃、过期令牌每请求都打端点、403 被当永久失败删号

**现象**：token 端点慢于 20s 时换票结果被丢，下一请求再兑换同一 refresh token（轮换家族回 `invalid_grant` → 登出）；令牌已过期且端点持续失败时每个请求都打一次端点；Copilot / Kimi / Cline / Devin / Cursor 的 403、Cursor 的一次 5xx/429（known-bad 守卫）、以及 Cursor / Devin / Kiro 消息里碰巧出现 `401`/`403` 字样的 5xx 都会删登录。
**根因**：`#refresh` 的 `waitFor` 超时后既不持久化迟到结果、也释放了 inflight；过期令牌故意绕过失败退避；永久失败判定散在 12 个家族谓词里，一半用正则扫消息文本。
**修复**：`src/oauth/tokens.ts` 单一所有者——`isPermanentRefreshFailure(error, extraCodes)` 只认结构化 401 / `invalid_grant|invalid_client|unauthorized_client` + 家族额外码（仅 Codex 有），家族谓词全部删除；`OAuthEndpointError`/`oauthError` 搬进 `tokens.ts`（`error.code` 对象形也解析），Devin（`GetUserStatus`）/Cursor/Kiro/Antigravity 抛带 status/`oauthCode` 的 `OAuthEndpointError`；Cursor 的 known-bad 守卫整个删掉（09-26 它把一次 5xx/429 记成坏 token 逼重登），永久失败记忆与退避只归 `TokenManager`。换票自身挂在 inflight 上直到 settle 或 `REFRESH_LATE_CAP_MS`=120s：期间同版本不再发第二次换票，迟到成功照常经版本守卫的 `updateAccountSession` 写回，迟到的永久失败不删号（交给下一次及时的换票判）。过期令牌失败后 `REFRESH_EXPIRED_RETRY_MS`=10s 内直接重放上次失败；有效令牌仍是 5 分钟退避。
**验证**：`test/token-lifecycle.test.ts`（mock `Date`，保留文件级 keepalive）慢换票迟到成功 / 挂死换票 120s 上限 / 过期+失败端点 10s 内 5 次调用 1 次换票 / 10 个家族 × 5 行的表驱动判定；不做活测（活测进程不许刷新）。

## 2026-09-28：配了出站代理（设置页 / `proxyUrl` / `HTTPS_PROXY`）插件整体卡死；Cursor 与未穿线的调用点仍直连

**现象**：任一来源配了出站代理后，回环代理不监听、设置页 `status` 永远等待，重启也不恢复（`assets/repro/outbound-deadlock.mjs` 打印 `ready STILL PENDING`）；能跑时 Cursor `GetUsableModels` / Run 仍从本机出口发出，没被传 `fetchFn` 的调用点也悄悄直连。
**根因**：`outbound.ts` 用 `require('undici')` 懒加载 `ProxyAgent`，而 undici 不在 `dependencies`，`load()` 在 resolve `ready` 前抛出，启动链卡在 `await outbound.ready`；`setUrl` 先写文件再构建，坏 URL 落盘后每次重启都卡。出站所有权靠一路穿线，`src/` 里 92 处 `fetchFn = fetch` 默认值是全局 fetch；Cursor h2 拨号不问出站代理。
**修复**：`undici@^7` 进 `dependencies`，`outbound.ts` 是全仓唯一 undici 导入方和模块级唯一所有者：`configureOutbound()` + `outboundFetch`（直连 `Agent` / `ProxyAgent`，已配置时等 `ready` 再选路）+ `outboundProxyFor(url)`；`ready` 必然 settle，失败进 `snapshot().error`；`setUrl` 构建 → 写文件 → 替换；不可用的代理报 `outbound proxy unavailable: …`，绝不悄悄直连；92 处默认值换成 `outboundFetch`。Cursor 拨号 `cursorProxy` → `PI_CURSOR_PROXY` / `CURSOR_PROXY` → `outboundProxyFor`（NO_PROXY / 回环直连），h2 10s 未连上即销毁。设置页主栏在 `snap.proxy.error` 时加一行 `.osubs-hint.osubs-bad`。`test/outbound-firewall.test.ts` 扫 undici 导入、`= fetch` 默认值、裸 `fetch(`、`setGlobalDispatcher`。
**活测（2026-09-28，宿主 Node v24.21.0 + undici 7.30.0）**：repro 翻转为 `ready resolved`；`fetchCodexQuota` 经代理 `127.0.0.1:9` → `outbound proxy unavailable: … ECONNREFUSED`，不配代理正常；`outboundFetch` 的 Codex `GET /models` 200，Cursor `GetUsableModels` 241 个模型。

## 2026-09-27：CI 恒定取消 token-lifecycle 后 5 个测试 = unref'd 刷新超时把事件循环排空

**现象**：`506869d` 起每次 CI `fail 0 / cancelled 5`——`token-lifecycle.test.ts` 第 454 行起的 5 个测试全部 `cancelledByParent`（"event loop has already resolved"），再后两个测试根本没注册；本地 macOS 全绿不复现。
**根因**：`tokens.ts waitFor` 的超时 timer 按惯例 `unref`（插件计时器不钉住宿主），而测试的等待链只剩「unref'd 计时器 + 永不 settle 的 mock promise」= 零 ref'd handle——Linux CI 上循环排空，node:test 判定文件根测试已结束，pending 与排队中的后续测试一并取消；macOS 有 ambient handle 兜底所以本地不炸。
**修复**：测试侧补一个文件级 `setInterval` keepalive + `after()` 清理——宿主进程的事件循环本就不会空，测试环境要模拟这个前提；生产 `unref` 语义保留不动。

## 2026-09-27：Claude 家族「导入本机 Claude Code」在 macOS 必失败——凭据只在 Keychain，明文文件被删

**现象**：Claude 标签页点「导入本机 Claude Code」报「未找到 ~/.claude/.credentials.json」。本机实测：`~/.local/bin/claude auth status` = `{loggedIn:false, authMethod:"none"}`；`~/.claude/` 无 `.credentials.json`（只剩 `.credentials.lock`）；Keychain 无 `Claude Code-credentials`（109 项里只有 Claude Desktop 的 `Claude Safe Storage`）；`~/.claude.json` 的 `oauthAccount`（claude_max / default_claude_max_20x）是不含 token 的残留缓存。直接跑 `lib/oauth/anthropic/import.js` 复现 `anthropic-import-empty`。
**根因**：`import.ts` 只读 `~/.claude/.credentials.json`，但钉住的 `claude-cli/2.1.280` 在 macOS 把 OAuth 凭据存 **Keychain**，且 keychain 写成功后会**删掉明文文件**：二进制里 `var Joe="-credentials"`、`function RD(n=""){…return \`Claude Code\${nn().OAUTH_FILE_SUFFIX}\${n}\${c}\`}`（服务名 `Claude Code-credentials`、账号 `tA()`=`$USER`）、`function A(e){return N()&&e!==void 0?oe(e):ne}`（darwin 异步读走 Keychain）、组合存储 `keychain-with-plaintext-fallback` 的 `update()` 在 `e.update()` 成功后 `await r.delete(s)` 删明文。文件只是 Linux/Windows 回退 ⇒ **登录了也读不到**。次要缺口：`credentialsPaths()` 未认 `CLAUDE_CONFIG_DIR`（Claude Code 认，并据此给服务名加 `-<sha256(configDir)前8位>` 后缀）。
**修复**：`src/oauth/anthropic/import.ts` 改按钉住客户端的顺序取凭据——darwin 先 `security find-generic-password -a $USER -w -s "Claude Code-credentials"`（服务名 / 账号 / `CLAUDE_CONFIG_DIR` hash 后缀 / `CLAUDE_CODE_OAUTH_CLIENT_ID` 变体逐项照抄二进制 `RD()`/`tA()`，超时 30s 留给系统授权弹窗），失败或非 darwin 再读 `<CLAUDE_CONFIG_DIR 或 ~/.claude>/.credentials.json`（现在认 `CLAUDE_CONFIG_DIR`）；显式传 `paths` 时只读文件（测试 / 已知路径）。UI 文案改成「未找到本机 Claude Code 登录（钥匙串或 ~/.claude/.credentials.json）」，家族 README 与 `docs/oauth.md` 的「Keychain 不读」同步改口。**活测（2026-09-27）**：往登录钥匙串临时写入一条假 `Claude Code-credentials`（`-A`，同一脚本跑完即删、已确认删除），从仓库 `lib/` 直接跑 `importAnthropicAuth()` → `source=keychain:Claude Code-credentials`，token / expiresAt / scopes 全部取到；本机 Claude Code 仍是登出状态，真登录 + 首次系统授权弹窗 + UI 点击这三段待补测。

## 2026-09-27：Claude (Anthropic) 订阅——Fable 专属周限额进度条缺失

**现象**：Claude 账号卡显示 5h/7d 用量，却没有 Fable 单独周限额。
**归因**：Messages 的 `anthropic-ratelimit-unified-{5h,7d}-{utilization,reset}` 只给统一窗口；钉住的 Claude Code CLI 2.1.280 还调用 `GET api.anthropic.com/api/oauth/usage`，Max 实测 `limits[]` 以 `weekly_scoped` + `scope.model.display_name=Fable` 返回专属百分比与重置时间。
**修复**：保留 Messages 头作现有 5h/7d 来源，并合并 usage 的 `weekly_scoped` 行；即使 `is_active=false`、利用率为 0 也显示。UI 标签为「每周 · Fable」；错误时两种数据源互为回退。
**活测**：用户已完成浏览器登录，截图确认账号卡和原 5h/7d 条；真实 saved session 调用新 `fetchAnthropicQuota()` 返回 5h 11%/89% remaining、weekly 3%/97%、Fable 0%/100%（有 `resetAt`）；`npm test` 749/749。前缀缓存命中与 401 自动刷新仍另待测。

## 2026-09-27：对照 omo/senpi（pi-ai）审请求与刷新链路——token 端点挂死仍钉住 inflight；4xx/5xx 契约维持不学它的代理内重试

**现象**：分析 code-yeongyu/oh-my-openagent（引擎为 `@code-yeongyu/senpi`，pi-ai 层）的 OAuth 缓存与请求实现后对照本项目：①token 端点「接了连接不回包」时，共享 inflight 永不 settle——等待方 30s 超时放行了，但该账号后续每个请求仍各等满 30s 直到 undici 自身超时；②各家族重试退避 [1000, 4000] 固定值，多会话并发故障时会同步重试（thundering herd）；③401 刷新重试前白付 1–4s 退避。
**根因**：`tokens.ts` 对 owner（`#refresh`）没有交换超时——上一条 2026-10-23 记录里「各家 refresh* 均无超时，共享 inflight 永不 settle」只修了等待方（`REFRESH_WAIT_MS`），owner 侧未封口；退避无抖动、无差别。
**修复**：`TokenManager` 增加 `REFRESH_EXCHANGE_TIMEOUT_MS`（20s，senpi/pi-ai 同款封口为 15s）：交换超时记为瞬时失败退避，token 仍有效则继续用旧 token，inflight 槽位释放给下一次尝试；`forward()` 退避加 SDK 同款 shrink-only 25% 抖动（`retryDelayMs`），且只在真重试前生效——401 刷新重试与网关 reroute 不再付退避；转发的 4xx/5xx 顺带透传 `retry-after-ms`。senpi 的代理内 429/5xx 重试（SDK 契约）**不采纳**：本项目 2026-10-23 已定「4xx/5xx 带 retry-after 转发、客户端按上游节奏退避」，代理内重试会叠加宿主重试倍数；cursor 会话投毒轮换（0-token resource_exhausted 换 conversation id）、Rendezvous 多账号亲和、cache-keepalive 暖 ping（其闸门只认 api.anthropic.com，本项目无此 lane）均无对应故障证据，暂不引入。

## 2026-09-27：热链改动其实不用重启应用 = 漏配 dsh-hmr 的 root

**现象**：文档与 About 卡都写着热链改完要「重启宿主」，用户质疑「不是热更新吗」；2026-09-27 同一处复发——热链 profile 的版本卡仍挂着「自动更新」开关与「每小时检查一次，装好新版后重启宿主生效 · 上次检查 21:55 · 已是最新」，用户再问「我们现在不是热更新了吗」（热链既没有「装新版」这一步，也没有重启）。
**根因**：DSH 自带 `@deepseek-ai/dsh-hmr`（源码模块热重载）与 `@deepseek-ai/dsh-client-hmr`（client entry 轮询热替换），但 base 组合包默认给 `hmr` 的 `root: []`——只监听 patch / 清单，不监听源码；热链仓库在 profile 之外，不配 `root` 就永远走不到热重载。第二次复发是文案没跟 `linked` 分叉：`installedPackageDirs` 按 realpath 跳过 symlink，热链没有可替换的安装副本，`autoUpdateHourly` 的重启承诺与自动更新结果的「已是最新」（拿仓库正式号比 release tag）在热链下都不成立。
**修复**：desktop profile patch 加 `- id: hmr` + `config.root: [<仓库绝对路径>]`；AGENTS.md 新增「热重载（本地插件目录）」小节（宿主半 `dsh-hmr`、UI 半 `dsh-client-hmr` 500ms 轮询、换包版本仍需重启）。2026-09-27 收口残留：AboutPanel 的 `AutoUpdateRow` **保留**（用户明确要求别移除开关），note 在 `linked` 时改用 `autoUpdateLinked`「本地链接：npm run build 后热重载生效，无需重启宿主（需 profile 配 hmr root）」且不再拼 release 结果（`autoRunText` 拿仓库正式号比 tag 只会是「已是最新」）；宿主 watch 不动；design-system 版本卡与双语 README 同步；`test/ui-client.test.ts` 覆盖。

## 2026-09-26：热链安装的 About 看不出是本地开发版（当前版本与正式版同号）

**现象**：用面板「本地插件目录」装成本仓库热链后，关于页仍显示「当前版本 0.0.105 / 最新版本 v0.0.105 · 已是最新」，与正式发布版无从区分——用户读成「当前版本没反应过来」。
**根因**：热链的版本号就是仓库 `package.json`（按约定必须是正式号），而 `localUpdateInfo` 只报 `running`/`disk` 版本，没区分「profile 里的真实副本」与「指向仓库的 link」。
**修复**：`localUpdateInfo` 增加 `linked`/`linkedPath`（realpath 落在 `~/.dsh/profiles` 之外即热链）与派生版本 `devVersion`——`npm run dev-build` 每次构建把仓库根 `.dev-build.json`（git-ignored）的计数 +1，About 的「当前版本」显示 `0.0.105-dev.N`（无 stamp 时退回 `-dev`），另列本地路径并撤掉自动更新 CTA；仓库清单与正式安装包仍按正式号显示；`test/dev-version.test.ts` + `test/update.test.ts` 覆盖。

## 2026-09-26：插件面板新增三种安装来源，本项目的测试/发布流程没跟上

**现象**：DSH 插件面板可直接按包名 / GitHub 地址 / 本地目录安装；本项目文档仍只有「打 tgz + pnpm add」一条路，且 `dsh-plugin-oauth-subs` 在 npm 上 404（「包名」入口装了会 not-found），GitHub 地址入口依赖仓库里**已提交**的 `lib/`。
**根因**：来源由 DSH 插件管理器解析（`parseInstallSpec`：绝对路径 / git / tarball / registry）；本地目录落成 `link:`，git 与 registry 走 pnpm，git / npm 安装**不会**重新构建，打包产物必须随源码提交。
**修复**：AGENTS.md 测试/发布章节按三种入口重写（本地目录热链做开发、测试版号 tgz 验打包产物、GitHub tag 走发布；发布门禁含 `lib/` 提交与 GitHub 地址冒烟）；新增 `test/package-surface.test.ts` 守 `dsh.bundle.patch` / `files` / 入口 / 版本号（提交的号不许带 prerelease），`prepublishOnly` 跑 `npm test`。

## 2026-09-26：OpenCode Go 卡片只剩百分比 = key 兜底漏掉同一 Console 接口的 Bearer 形态

**现象**：只存 API key（或 cookie 已失效）的 OpenCode Go 卡片只剩「剩余 X%」，没有旧版的 `$used / $limit` 具体金额；同一账号 `/zen/go/v1/usage` 只回 `percent`/`resetsAt`。
**根因**：cookie 失效后的 key 兜底只打官方 usage API（无金额）；实测 `GET /console/api/go/status` 也认 `Authorization: Bearer <key>`（无 cookie、无 `x-org-id`），回包带 `access.meters.{fiveHour,week,month}` 的 `usedMicroCents`/`limitMicroCents`——2026-09-26 本机 key 实测 200，`month` 74% 与 usage API 一致。
**修复**：key 路径先打 `go/status` Bearer（复用 `parseOpencodeGoConsoleStatus`，`unit:'usd'` 行 + `useBalance`/`renewalProduct`），被拒才退回 `/zen/go/v1/usage` 百分比；`test/opencode-go.test.ts` 补两条用例，家族 README 记明次序。

## 2026-09-26：文档把 OpenCode Go 和旧更新流程写错

**现象**：双语 README 缺 OpenCode Go 家族行、导入表与家族表连在一起，仍称 Ollama Cloud 有 20 个回退模型；产品与设计稿描述已移除的 DSH 更新 / 重启按钮，部分相对链接打不开。
**根因**：模型目录与桌面更新流程变更后，入口文档和设计稿没有同步；相对链接按错误目录解析。
**修复**：双语入口补直连路由与账号位置，模型行数对齐本轮目录审查；产品 / 设计稿改成单张插件更新卡；修正本地链接并核对 24 份受版本控制的 Markdown。

## 2026-09-26：全家族请求时好时坏 = TokenManager 刷新状态机把可恢复的刷新变成请求失败

**现象**：token 端点一次抖动后，已过期账号的请求连续 5 分钟秒失败（重放缓存错误）；token 端点挂住时该账号所有请求一起挂死；preempt 窗口内（token 仍有效）每个请求都要等刷新 RTT；别的写者已轮换 refresh token 时本请求报 `login expired` / `session changed`。
**根因**：`tokens.ts` 的失败退避对已过期 token 直接 `throw failed.error`，sweep 一次失败就锁死 5 分钟；各家 `refresh*` 均无超时，共享 inflight 永不 settle；due-but-valid 也同步 await 刷新；刷新成功但 `updateAccountSession` 版本不匹配、或 `invalid_grant` 而 `deleteSession` 未删（已被轮换）时不回读存储。
**修复**：退避只豁免仍有效的 token，过期一律重试（inflight 去重）；请求最多等 `REFRESH_WAIT_MS`（30s），刷新本身仍是该版本唯一 owner（不二次兑换 refresh token），超时且 token 仍有效就用旧 token；剩余 >30s 的 due token 后台刷新、立即放行；保存失配 / 非本次删除的 `invalid_grant` 回读同 id 的新会话（`#successor`）再决定报错。顺带 `attemptUpstream` 转发上游 4xx/5xx 时带上 `retry-after`，客户端按上游节奏退避。

## 2026-09-25：OpenCode Go 抓不到额度 = dashboard 迁移成 Console SPA，旧刮页与旧 cookie 双失效

**现象**：OpenCode Go 卡片额度一直「cookie is invalid or expired」，重贴 cookie 也一样。活测本机账号：`/_server` server-fn 回包成「302 → /console/login」，`/console/api/*` 对旧 `auth` cookie 401。
**根因**：opencode.ai 把已迁移工作区的 dashboard 换成 Console SPA（`/console/<id>/go` 只剩 `<div id="app">` 壳），额度改走 JSON API `/console/api/{orgs,go/status,billing/status,user}` + `x-org-id` 头 + `__Host-console_session`/`console_session` cookie；旧 `/_server`/`/workspace/{id}/go` 刮页路径对迁移账号失效，且 `parseOpencodeGoCookie` 白名单没有 console cookie，新 cookie 根本存不进 vault。
**修复**：`quota.ts` 改 console 优先 + legacy 兜底（对齐 CodexBar `OpenCodeGoLegacyFallback` 次序：console 失败且有 `auth` cookie 才走旧刮页；带 console cookie 时 legacy 的 invalid-cookie 不盖 console 真实错误）；`go/status` 的 `access.meters.{fiveHour,week,month}` micro-cents 计花费行（`unit:'usd'`，month 无 resetsAt 用 `access.endsAt`），`access:null` 看 prepaid 余额，有则余额兜底无则 `no_subscription`；`billing/status`→useBalance/balance，`/user`→邮箱，`/orgs`→workspace id+name。`parseOpencodeGoCookie` 放行 `__Host-console_session`/`console_session`；`normalizeOpencodeGoWorkspaceId` 收 `org_` 与 `/console/<id>` URL。注意：迁移账号必须重贴 Console 页 cookie，旧 `auth` 串对 console 必然 401。

## 2026-09-25：Desktop profile 上「检查更新→更新」必败 = Electron 独占管理拒绝 CLI plugin 变更

**现象**：desktop profile 跑插件时 About 页点更新，`dsh plugin --profile desktop update` 被宿主拒绝（`managed exclusively by the Electron application`），成功后还会 `scheduleDshWebRestart`+`exit(0)` 把宿主进程杀掉而无 `dsh web` 兜底。
**根因**：自更新链路只按 `profileFromBaseUrl` 换 `--profile` 参数，没区分「CLI 可写」与「Electron 托管」profile。
**修复**：插件定为专攻 desktop——先删净宿主生命周期面（`checkDshUpdate`/`restartDsh` RPC、npm/`dsh` spawn 机械、`scheduleDshWebRestart`/`stampDshHostVersion`、DSH 版本卡/重启按钮），再以 `installRelease` 重建升级：下载 tag 的 GitHub tarball → `tar -xf` 抽出 → `rename`+`fs.cp` 原子换所有已装目录（`profiles/<p>/node_modules`、跨 profile 共享副本、`.dsh-module-fallback`，按 realpath 去重；失败回滚 .bak）。`data/` 在 node_modules 外不受影响；运行进程保持旧模块，`staleProcess`/`apply.restart` 提示重启宿主/应用生效。自动更新恢复为单布尔 `autoUpdate`（`update-prefs.json`）+ `update-state.json` 最近结果 + 每小时 watch；About 页开关行回归。无已装目录时 apply 降级 `manual` + `dsh plugin update` 命令兜底。
**发布前审查补救**：拷贝先在同级临时目录完成并验版本，所有副本保留备份到全部换完；任一失败逆序回滚，回滚失败的备份不删除。自安装串行排队、work 路径唯一；目标只认 profile 下真实目录（不再从本插件 self-resolve）；运行版本在模块加载时钉住，换盘后仍提示重启。

## 2026-09-24：全家族会话「卡死」= 路由 maxTokens 写真实输出上限，把自动压缩阈值饿死

**现象**：长会话状态在跑但长时间无思考。分析两个导出 session（oauth-codex gpt-6-luna / oauth-devin swe-2）：每步跑**两次**压缩摘要调用（30–55s/次，无思考输出），analyzer 记 `compaction 44 / 38` 次重写；中途切 swe-2 时携带 141k/240k tokens 直接超其有效预算被判「超上下文」。
**根因**：路由行把厂商输出上限当 `maxTokens` 写进 llm-pi-ai，宿主 `dsh-compaction-basic` 阈值 = `min(窗口×0.8, 窗口 − 该值 − headroom 65536)`：codex 258k→64464（25%）、swe-2 262k→68464（26%）、grok 500k=maxTokens 时阈值转负、自动压缩整体禁用；114k 窗口模型连 65536 headroom 都放不下。
**修复**：`toHarnessModel` 路由 `maxTokens` 封顶 `HARNESS_REQUEST_MAX_TOKENS`=32768（llm-pi-ai 自身默认；真实上限仍留家族目录行，Devin/Antigravity/GLM hop 用自己的 cap，Codex/Copilot 本就 strip）；`syncHarnessModels` 向 profile `cordis.patch.yml` 末尾维护一段 marker 包裹的 `id: compaction-basic` override——`modelPolicies` 里窗口 <655360 的模型 `headroomTokens` 按窗口 10% 收缩（compaction-basic Config 无 volatile 字段且 live entry 嵌在 cordis:group 里，`settings.mutate`/`configEditor` 都够不到，patch 层 id 扁平匹配可达；手写同名条目存在则整体跳过）。另：Devin `forwardDevin` 不走 `forward()` 重试环，摘要调用 `UND_ERR_SOCKET` 后 5 次重试全 `ECONNRESET` 把整轮打死——补 head 未提交前有界重试（3 次，1s/4s 退避），对齐 passthrough 家族语义。线上 `cordis.patch.yml` 旧值在下一次 sync（登录 / 导入 / 额度刷新 / warmCatalogs）自动改写。

## 2026-09-22：Cursor `grok-4.7` 一跑就「AI Model Not Found: Invalid parameters for registry model」= effort 参数 id/value 全错

**现象**：oauth-cursor 选 Grok 4.7（±fast）任何 effort 都整轮失败，上游回 `Invalid parameters for registry model: "grok-4.7"`；不带 effort 的请求正常。
**根因**：`cursorModelParameters` 对所有家族一律发 `{id:'reasoning', value:'extra-high'}`，但 grok-4.7 注册表要的是 `reasoning_effort`=`xhigh`——参数 id 和值都按家族分（4.5/4.6 是 `effort`，gpt-5.5 是 `reasoning`=`extra-high`，kimi/glm 是 `reasoning`=`max`），错一个就 400。
**修复**：`CURSOR_PARAM_STYLES` + live AvailableModels 变体逐字导出每族参数样式（effortParam / efforts / contexts / fast），`cursorModelParameters` 按样式发 context→effort→fast，未知家族省略 effort；picker `reasoningEfforts` 改按家族广告值（composer-2.5/default 不再假提供 effort）。活测 2026-09-22（Pro 账号）：grok-4.7±fast xhigh、grok-4.6±fast、kimi-k3 max、glm-5.2 max、composer-2.5±fast、default 全 200。

## 2026-09-23：全家族模型目录年检——Devin / Antigravity / Cursor / Cline / Kimi 有缺行，Grok / GLM / Kiro / Ollama 无漂移

**现象**：按家族逐个对活目录/一线客户端盘点：Devin 静态 floor 只有 17 行，账号 live `GetCliModelConfigs` 是 598 configs → 81 picker 行 / 49 家族；Antigravity 上游 registry 12 行换成 `gemini-3.5-flash-lite`，且 2026-09-01 已删 `gemini-3-flash-agent` / `gemini-3.5-flash-low` / `-extra-low`（Cloud Code 500 UNKNOWN）；Cursor 官方 docs 新增 `claude-opus-5-5` / `muse-spark-1.3`；Cline feed 轮换 `spacexai/grok-4.7` / `cline-free/mimo-v2.6-flash` 上线、`x-ai/grok-4.5` / `z-ai/glm-5.3-flash` 下线；Kimi 官方模型表四个 ID 缺 `k3-256k`。
**根因**：各家目录源不同（live RPC / 公开 feed / 官方 docs / 上游 registry），静态 floor 与活目录没有统一的轮换检查；离线回落会一直停在旧快照。
**修复**：Devin `DEVIN_MODELS` 整表对齐 live 81 行；Antigravity 换 `gemini-3.5-flash-lite` 并删三个已 500 的 legacy id；Cursor 静态楼补 Opus 5.5 / Muse Spark 1.3（Opus 5 / GPT-5.5 转 Hidden by default 但保留）；Cline 快照重写为 2026-09-23 feed；Kimi 补 `k3-256k`；OpenCode Go 按官方 `/models` + 端点表补齐为两条自有路由（`OpenCode Go` completions 27 行 + `OpenCode Go · Responses` 5 行，共 32 行；同名别名 `deepseek-flash` 只留 docs 现行 id），7 个两种协议都回 `Model is unavailable` 的公开 id 不收。Grok（`~/.grok/models_cache.json` 1.0.41 四行一致）、GLM（套餐仍 5.3 / 5.3-Flash）、Kiro（live List-Available-Models 20 行一致）、Ollama（`/api/tags` 20 行一致）核实无漂移，未改。
**未覆盖**：Kimi / Copilot 仍无本机凭据（Kimi 端点 401、Copilot 的 gh `gho_` 换票 403）。Kimi 按官方模型表补 `k3-256k`；Copilot 静态楼按 GitHub 官方 docs 数据表（release-status / auto-model-selection）+ models.dev `github-copilot` 重刷，`gpt-6-luna` / `gpt-6-sol` / `claude-opus-5.5` 三个 id 待活目录确认；OpenCode Go 已按官方端点补齐（completions 27 + responses 5；另 7 个公开 id 网关不服务，README 记明），不再有宿主侧缺口。

## 2026-09-23：Codex 目录轮换——GPT-6 Sol / Luna 只对 `client_version` ≥ 0.155.0 下发，5.4 系列与 Spark 已 400

**现象**：本机 Codex `models_cache.json`（client 0.155.0，2026-09-22 抓取）已列出 `gpt-6-sol` / `gpt-6-luna`，插件目录没有；用插件 identity（0.153.4）打 `GET .../codex/models` 只回 7 行（无 Sol/Luna），0.155.1 回 9 行。另 `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.3-codex-spark` 还在 picker 里。
**根因**：chatgpt.com 的模型活目录按 `?client_version` 分档（Astra 当年也需 ≥ 0.153.0），identity 钉在 0.153.4 就看不见新行——但 `/codex/responses` 本身不分档，Sol 用 0.153.4 头也 200，所以是纯目录漏。5.4 三行则已从活目录消失，实测 Responses 400 `not supported when using Codex with a ChatGPT account`（与 `gpt-5.3-codex` 同码），目录里属陈旧行。
**修复**：`CODEX_CLIENT_VERSION` / UA 升 0.155.1；`CODEX_MODELS` 补 Sol / Luna（258K 默认 + `-900k` 872K + Fast + `max`），删 5.4 / 5.4-mini / Spark（连带删 `CODEX_SPARK_CONTEXT_WINDOW`）。`gpt-reserve` 是 `visibility: hide`，不进目录。活测 2026-09-23（本机 ChatGPT 账号）：0.155.1 列表 9 行；`gpt-6-sol` @0.153.4 与 @0.155.1、`gpt-6-luna` @0.155.1 各一轮 Responses 200 completed；5.4 三行均 400。

## 2026-09-22：Grok 4.7 Fast 的真模型 id 被 Codex `-fast` 规则剥成不存在的模型

**现象**：Grok 目录新增 `grok-4.7-build-fast`（真后端变体）与 Cursor 活目录新增 `grok-4.7` ± fast 后，任何走 Grok 该行的请求都会被共享 `applyFastMode` 把 `model` 剥成不存在的 `grok-4.7-build`；实测 `grok-4.7-fast` 上游 404，`grok-4.7-build` 也不在目录里。
**根因**：`peelFastSuffix` 按 Codex Priority 旧约定对所有 `*-fast` 一律剥后缀，但 Grok 4.7 的 `-fast` 是**真模型 id**（`GET cli-chat-proxy.grok.com/v1/models`：name `Grok 4.7 Fast`，description `Fast variant. 2x the price.`），不是 `service_tier`。
**修复**：Grok 分支不再经过 `applyFastMode`；`normalizeGrokResponsesBody` 接管模型名——`GROK_FAST_MODEL_IDS` 里的 id 原样透传（含 `x-grok-model-override`），其余残留 `-fast` 别名照旧剥，`service_tier` 永不发。活测 2026-09-22（本机已存账号直连本 hop）：Grok `grok-4.7` / `grok-4.7-build-fast` 200、`grok-4.7-fast` 404；Cursor 活目录同轮返回 `grok-4.7` ± fast（500k / text-only），`grok-4.7` 与 `grok-4.7-fast` 各跑一轮均 200。

## 2026-09-21：GLM anthropic-messages 路由 401「API 密钥无效」= 代理只认 Bearer，不认 Anthropic SDK 的 x-api-key

**现象**：oauth-glm 任一模型一调用即「本轮运行失败 · API 密钥无效」（AUTH），换模型也一样；上游 key 直连网关 / 直连 / monitor 全部 200。
**根因**：`createProxy.authorized` 只读 `Authorization: Bearer`；llm-pi-ai 的 `anthropic-messages` 走 Anthropic SDK，api-key 凭据发的是 `x-api-key`（`authToken` 只给 `sk-ant-oat*`），代理 401 `{"error":"unauthorized"}`，hop 根本没跑。
**修复**：`authorized` 同时接受 `x-api-key` 与 Bearer 两种拼写（同一 proxy key）；`test/proxy.test.ts` 补 x-api-key 放行 + 错 key 仍 401 回归。

## 2026-09-21：GLM 已登录却「当前用户不存在coding plan」= 存了 config.json 的旧 key，不是 credentials.json 的 provisioned key

**现象**：GLM 卡已登录（中国 / 150%），额度显示「额度读取失败 · glm quota failed: 当前用户不存在coding plan」，对话也 429「套餐已到期」——但用户是 Max。
**根因**：插件存的 `accessToken` 是 `~/.zcode/v2/config.json` 里 `builtin:bigmodel-coding-plan.options.apiKey` 那把已被 ZCode 标 `coding_plan_not_entitled` 的旧 key（`6fc665a4…`）。真凭据在 `credentials.json`：provisioned `account-provider:…:api-key`（`cd17e6b4…`，monitor + 对话都 200，level=max）。`glmKeyFromZcodeCredentials` 原先返回 `oauth:bigmodel:access_token` 业务 JWT——它只能查 monitor，打 Coding Plan 对话稳定 500，不是 chat key。
**修复**：`glmKeyFromZcodeCredentials` 优先 provisioned `api-key`（按 `oauth:active_provider` 选 region），OAuth token 降为 `oauthAccess` 仅供 userinfo/身份；`glmSession` 持久化 `oauthAccess`；bigmodel `fetchGlmUserinfo` 改用 `oauthAccess` 优先（api-key 打 userinfo 是 403）。已存旧 session 用「导入本机会话」或直接改写 auth.json 换成 provisioned key。顺带接上 MCP 额度：真端点是 `GET zcode.z.ai/api/v1/mcp/usage`（双头 zcodeJwt + X-Bigmodel-Authorization api-key），不是 monitor `tool-usage`（对该账号回空 body）。

## 2026-09-21：GLM 卡「周额度未返回」= monitor 的 HTTP 200 业务错误被当成空额度

**现象**：`/api/monitor/usage/quota/limit` 回 HTTP 200 + `{"code":500,"msg":"当前用户不存在coding plan","success":false}`，插件解析出 0 行但 store 记 `ready`，卡片只显示「周额度未返回，点刷新重试」，看起来像 hop 坏了。
**根因**：`fetchGlmQuota` 只看 HTTP 状态，没解业务信封；`readJson` 只在 `!response.ok` 时抛。该账号确实没有生效的 Coding Plan——同一账号的 OAuth 兑换也会 `invalid_flow`、本地 key 也回同一句，三条证据同源。
**修复**：`fetchGlmQuota` 在 `success === false` 或 `code ∉ {0,200}` 时抛 `glm quota failed: <msg>`，store 转 `error`，卡片显示「额度获取失败 · glm quota failed: 当前用户不存在coding plan」。判定「没额度」先看这条上游原文，再谈套餐是否要续费。

## 2026-09-21：BigModel 登录成功但额度/身份全 401「令牌已过期」= 把 zcode JWT 当 bearer

**现象**：GLM 卡显示已登录（中国 / 150% 配额），额度只有「周额度未返回，点刷新重试」、抬头没名字；`open.bigmodel.cn/api/monitor/usage/quota/limit` 与 `/api/biz/customer/getCustomerInfo` 都回 `{"code":401,"msg":"令牌已过期或验证不正确"}`（`chat.z.ai/api/oauth/userinfo` 也 401）。本机存的 GLM token 解出来是 `{user_id, sub, iat}`、没有 `exp`，且 `accessToken === zcodeJwt`。
**根因**：BigModel 路径把 **zcode JWT** 当成了 Coding Plan bearer。`completeGlmCli` 取 `ready.zcodeJwt || ready.oauthAccess`，`parseCliPoll` 的 token 链 `zai → zcode → bigmodel` 也可能先拿到 JWT。官方 `bigmodelProviderAdapter.ts:184-194` 写死：付费套餐打 bigmodel.cn 业务接口只能用 `data.bigmodel.access_token`，zcode JWT 只写 `zcodejwttoken` 给 Start Plan——「继续把 zcode JWT 写进 `oauth:bigmodel:access_token`，套餐预览会稳定报令牌已过期」；`bigmodelUsageQuotaProvider` 也固定读该 token。
**修复**：`glmProviderAccessToken(data, region)` 只按 region 取 `data[provider].access_token`（`data.access_token` 兜底），`data.token` 永不顶替；`parseCliPoll` / `glmCliPoll` 加 `region`；BigModel `completeGlmCli` 只用 `ready.oauthAccess`，缺了直接报「without a bigmodel access token (the zcode JWT cannot chat)」；`fetchGlmUserinfo` 对 BigModel 先发业务 token（JWT 会 401，身份才回填得上）。旧 session 必须重新登录。

## 2026-09-21：「本机会话导入」报 no GLM / ZCode session found —— 其实找到了 key，是套餐未生效

**现象**：`~/.zcode/v2/config.json` 明明存在、`builtin:bigmodel-coding-plan.options.apiKey` 有 49 字符明文 key，导入却报 `no GLM / ZCode session found in …`（用户会以为文件没找到）。
**根因**：新版 ZCode 把 coding-plan key 放在 provider `options.apiKey`，同时用 `enabled: false` + `systemDisabledReason` 标死；`glmKeyFromZcodeConfig` 只返回可用 key，找不到就统一报「没会话」。实测该 key 打 `open.bigmodel.cn/api/monitor/usage/quota/limit` 返回 `{"code":500,"msg":"当前用户不存在coding plan"}`；本机 ZCode `coding-plan-cache.json` 四个 provider 全是 `coding_plan_not_entitled`，`billing/balance` 回 `plans: []`，订阅接口还报 `coding_plan_system_busy`——账号侧确实没有可用 Coding Plan（或平台套餐服务在抖），OAuth 的 `invalid_flow` 同源。
**修复**：新增 `glmKeyCandidateFromZcodeConfig`（最佳候选 + `usable` + `systemDisabledReason`）；`glmKeyFromZcodeConfig` 现在**连系统禁用的 coding-plan key 一起返回并导入**（结果带 `note` 写原因）——那个 flag 来自 ZCode 缓存权益检查，会过期也会错（平台 `coding_plan_system_busy` 时同样标 `not_entitled`），拒绝它等于本机没有任何可导入凭据；真假交给额度和对话回答。**硬跳过的仍只有 start-plan JWT**。不做解密 `credentials.json`。

## 2026-09-21：GLM 浏览器授权「Authorization Failed」= 上游 OAuth 兑换失败（BigModel 已知缺陷）

**现象**：点 GLM 登录 → 浏览器授权页完成后，落地页报「Authorization Failed / 授权失败 / 请返回 ZCode 重试」；服务端随即把 flow 判死，poll 终态 `3004 invalid_flow`。协议级复现（桌面端完全离场）：`bigmodel.cn` 同意页显示「授权成功」，落地页 `GET /api/v1/oauth/cli/callback/bigmodel?authCode&state` 被拒（通用失败页），flow 作废。另有 `POST /api/v1/oauth/token` 500 `{"code":2007,"msg":"http error"}` 的 zai 变体。
**根因**：`zcode.z.ai` 服务端兑换授权码的缺陷，不是客户端 flow 形状问题——本 hop 的 init/poll 参数与官方 CLI `auth-login-polling.ts` 逐字一致；Desktop 的 `redirect_uri→/app/oauth/login` 改写只服务 `zcode://` 深链，落地页网桥 GET 同一个失败接口。上游 tracker：zai-org/feedback #718（BigModel 必现）、#705（3.12.3 网桥/深链双重核销）、#523（Linux token 端点 500）、#116（zai business token）。
**修复（客户端侧）**：`glmLoginFailureMessage` 把 `invalid_flow` / `2007` 译成带 tracker 与替代路径的卡片报错；轮询语义照官方（`expires_at` 秒×1000、failed/未知立即失败、5xx/408/429/传输错误重试）。**绕行**：换另一区域按钮，或在厂商控制台建 Coding Plan API key 后用 GLM 页「API key」框粘贴（`useKey`，存成 `account: api-key`）。

## 2026-09-21：GLM 授权页「Authorization Failed」时插件还在轮询、要等超时

**现象**：浏览器授权页报「Something went wrong during authorization / 授权失败」，插件侧没有立刻失败——`status: failed` 被当成 pending，一直轮到 5 分钟兜底；服务端 `expires_at`（epoch 秒）被丢弃，真实有效期短于 5 分钟时也不收口；一次 5xx / 断网直接判死。
**根因**：`parseCliPoll` 只认 `ready`，其余一律按 pending；`parseCliInit` 的 `expiresAt > 1e12` 判断把官方秒级时间戳全部替换成 `Date.now() + 300_000`；轮询异常没有可分类的 HTTP status。
**修复**：照 `auth-login-polling.ts`：`expires_at` 秒 ×1000（ms / 相对值兼容）、`poll_interval_sec` 地板 1s、`failed` / 未知状态立即 `glm authorization failed`（带服务端 `msg`）、5xx / 408 / 429 / 传输错误按间隔重试、其它 4xx 与 `GlmBusinessError` 终止；`readJson` 改抛带 `status` 的 `GlmHttpError`。授权页本身失败来自服务端（重开一次新 flow），插件负责把同一结论及时呈现。

## 2026-09-21：GLM Coding Plan 对话直连 model 端点，不是官方网关路径（150% 归因）

**现象**：插件默认 `POST api.z.ai/api/anthropic/v1/messages`（BigModel 走 `open.bigmodel.cn`）。ZCode 开源后对照源码，官方**从不**这样发。
**根因**：`official-coding-plan-gateway.ts` 把两个官方 Anthropic 端点按协议 / 主机 / 有效端口 / 路径改写成 `zcode.z.ai/api/v1/ultra-zai/anthropic`（BigModel `/ultra/anthropic`），正文 / query / 除 `host` 外全部头（含 `authorization`）透传；NOTICE.md「官方 Coding Plan 模型网关转发」说网关做套餐权益校验。「150% 是身份」只对一半：身份头之外，路径也得是网关这条。
**修复**：`glmAnthropicUrl` 默认返回网关 URL；`glmAnthropicDirectUrl` 作 401/403/404 一次性回退（`forward` 的 `fallbackUrl`），网关拒绝不断对话。身份头补 `X-Release-Channel` / `X-Client-Language` / `X-Client-Timezone` / `X-Platform` / `X-Os-Category` / `X-Os-Version` / `x-zcode-session-type: main`，`X-Title` 改官方 `Z Code@electron`。倍数发放仍在上游服务端，未做用量斜率活测，文档不宣称已吃上。

## 2026-09-21：GLM Anthropic 思考形与官方 catalog 不一致；缓存缺滚动 breakpoint

**现象**：Anthropic hop 发 pi-ai/Claude 形状的 `thinking: { type, budget_tokens, display, clear_thinking }`，且非 system 消息上没有自己的 `cache_control`；官方 catalog 的 GLM map 是 `thinking: { type }` + `output_config.effort`，缓存还在最新非 system 消息上放滚动 breakpoint。
**根因**：`budget_tokens` / `display` 是 Claude 形状，ZCode 给 GLM 的 map（`zcode-builtin.json` `modelApiRules`，`apiTypeMatch: anthropic-messages`）不发；`clear_thinking: false` 是标准 API 的 Preserved Thinking opt-in（Coding Plan 端点默认开，docs.z.ai 思考页），ZCode 客户端也不发。缓存侧 `finalizeLatestNonSystemMessageCacheControl` 只留一个滚动 breakpoint；pi-ai 只盖最后一条 user，assistant-last / 回放旧 breakpoint 没兜底。
**修复**：`applyGlmAnthropicThinking` 按 catalog 重写（5.3 / Flash 强制 `enabled`；5.2 保留 `disabled`；Turbo 不强制），删 `budget_tokens` / `display` / `reasoning_effort`，只留 `output_config.effort`；`clear_thinking: false` 留作活测保险。`stabilizeGlmAnthropicMessageCache` 清旧 breakpoint 并盖到最新非 system 消息；路由加 `compat.forceAdaptiveThinking`（picker 档位 → `output_config.effort`）与 `allowEmptySignature`（unsigned thinking 不被 text 化）。

## 2026-09-21：GLM 目录取舍——5.2 是自动改道别名、FlashX 未上套餐、Turbo 输出上限 128k→64k

**现象**：ZCode `builtinProviderModelRules` 对 `account:zai-|bigmodel-individual-coding-plan` 仍启用四条（5.3 / 5.3-Flash / 5.2 / 5-Turbo），一度据把 5.2 加回 picker；官方 devpack overview 说的是「所有套餐均支持 GLM-5.3、GLM-5.3-Flash」，历史 id 自动改道（5.2 / 5.1 → 5.3，4.7 → 5.3-Flash）；`glm-5.3-flashx` 官方 Flash 文档写明「not yet available on the plan」。Turbo 的 `maxOutputTokens` 是 64k，插件写了 128k。
**根因**：catalog 的 enabled 列表是客户端向后兼容（老 session 的 id 还能发），不等于套餐现售模型；5.2 的 `off` 档在后端按 5.3 处理时会 400（5.3 强制思考）。
**修复**：`GLM_MODELS` 不复活 5.2、不加 FlashX，保持 5.3 / 5.3-Flash / Turbo；Turbo `maxTokens` 改 64k，`glmMaxTokens` 缺省按模型取 128k / 64k；proxy 保留 5.2 的线上形状给旧路由兜底。

## 2026-09-19：catch 变量收紧（useUnknownInCatchVariables，25 条）；noImplicitAny 实测**不是**可清扫项

**现象**：`strictNullChecks` 落地后逐个开关实测——`strictFunctionTypes` / `strictBindCallApply` / `strictPropertyInitialization` / `noImplicitThis` / `alwaysStrict` 全是 **0**（`declare` 字段那一轮顺手清掉了），`--strict` 只剩 **25** 条 `useUnknownInCatchVariables`；而 `--noImplicitAny` 是 **2082** 条。
**根因**：25 条全是 `catch (error)` 后直接读 `error.message` / `error?.code`——把 catch 变量从 `any` 收紧成 `unknown` 正是这个开关要抓的东西。2082 条里 **1726 条**是 TS7006「参数隐式 any」（`value` 139 / `session` 128 / `payload` 73 / `id` 62 …），绝大多数**只能标 `: any`**。
**修复**：在 [`src/utils/http.ts`](../src/utils/http.ts) 里 `describeError(error: unknown)` 旁边加两个同风格的无 cast 助手 `errorCode(error)` / `errorMessage(error)`（用 `'code' in error` 收窄），替换 7 个文件 25 处 `error.message` / `error?.code`。开启 `"useUnknownInCatchVariables": true`，695 tests 全绿。
**判断（不做的事）**：`noImplicitAny` **不清扫**。给 1726 个参数补 `: any` 只是把「隐式」变「显式」，不产生任何安全性，属于用注解掩盖诊断；它需要的是逐模块设计类型面。这条结论已写进棘轮脚本头部，避免以后有人再当清扫项试一遍。
**收口**：棘轮第二项改名 `strict`，显式传 `--strictNullChecks --useUnknownInCatchVariables`；两项基线均 **0**。

## 2026-09-19：strictNullChecks 收敛 431→0 并开关落地，棘轮两项归零

**现象**：`noCheck` 摘掉后宿主半已真检查，但 `strictNullChecks` 仍未开；`npx tsc --noEmit --strictNullChecks` 报 **431** 条（TS2345 217 / TS2339 152 / TS18048 31 / TS2322 18 …），`controller.ts`、`cursor/proto.ts`、`devin/proto.ts` 是重灾区。
**根因**：**369 条**来自推断规则而非真的 null 安全问题——`const xs = []` 在 strictNullChecks 下被推断成 `never[]`（之后每次 push / 读取都报 never），`let x = undefined` 被推断成 `undefined`。另有 4 个家族 catalog 的模块级缓存写成 `models: /** @type {any[] | undefined} */ (undefined)`：那个 JSDoc 在 `.ts` 里**根本不生效**，于是 `models` 的类型真的就是 `undefined`。
**修复**：在声明处补显式类型——110 处 `const x: any[] = []`、4 处 catalog 缓存改成真类型注解、7 处参数默认值 `= []`；`listStoredSessions` 改 `flatMap` 丢掉不可能出现的 `undefined` 行（一处消掉 controller 二十余条）。再把 6 个我**上一轮加的** `= undefined` 默认值补外层 `: any`。剩 20 条逐条加守卫或提升局部变量，**不用 cast**。宿主半 **431→0**。
**并行**：`src/apikey/**` + `src/utils/**` + `src/index.ts`（24→0）由 subagent 同时进行，文件集与 `src/oauth/**` 不相交；`src/oauth/cline/**` 是维护者当时正在改的文件，**当时全程未动**——等它停笔两小时后再清掉最后 17 条（同为 `never[]` 家族）。
**踩坑**：strictNullChecks 下 `key = undefined` 不是「可选」，而是把该键定型成字面量 `undefined`，反而拒绝真值；要修只能给整个解构参数加外层 `: any`——写成 `key: any = undefined` 是**重命名**（同 2026-09-19 那条的 `runFn` 陷阱）。
**收口**：`"strictNullChecks": true` 已进 `tsconfig.json`——宿主半现在**真做 null 检查**，`npm run build` 会拦。棘轮两项基线均归 **0**，并分别显式传 `--noCheck false` / `--strictNullChecks`：任一开关将来被移除都会立刻失败。

## 2026-09-19：宿主半 `noCheck` 下的 1917 条类型错误——逐条核对全是声明缺口，不是 bug，并加债务棘轮

**现象**：`npx tsc --noEmit --noCheck false` 报 1917 条（TS2339 1625 / TS2554 117 / TS2353 80 / TS2551 53 …），而 `tsconfig.json` 的 `noCheck: true` 让 `npm run build` 一条都不查，`tests 全绿`与`类型安全`是两件事。
**根因**：宿主类是 JS 风格——构造函数里 `this.x = …` 但类体不声明字段，tsc 于是把每个 `this.<字段>` 都当「属性不存在」。把 53 条 TS2551 与 117 条 TS2554 逐条追到定义后确认**没有一条是真错**：属性都在构造函数里赋值（`AuthController` 的 `outboundProxy`/`setOutboundProxy` 由 `src/index.ts` 外部挂载），省略的尾参在函数体里都有 `??` / `=== undefined` 兜底。`AuthController` 一个类占 620 条。
**修复**：四步都**零运行时改动**，不用 cast、不新增抑制。① 调用方合法省略的尾参在**定义处**标 `?`（`saveSession` options、`deleteSession` source、`refreshQuota` accountId、`settle` / `h2-session finish`、cache 家族的 `explicit`、`QuotaStore.peek/clear/refresh/ensure/consume` …），TS2554 归零。
② 给 JS 风格类补 `declare` 字段（`AuthController` 58 个、`TokenManager` / `CommitGate` / `QuotaStore` / `ModelSwitch` / `Pump` / `OpencodeGoStore` / 四个 FlowManager / 三个错误类），`error.code = …` 改 `Object.assign(new Error(…), { code })`。
③ `fn({ a, b = 1 } = {})` 的选项对象，tsc 只把**带默认值的键**算进参数类型，于是每个 `fn({ 必填键 })` 都报「多余属性」；同理**一个默认值都没有**的解构参数被推断成 `{}`，`fn(options = {})` 这种整体形参也一样。这些选项袋统一在参数上标 `: any`（`update.ts`、各 session builder、各 `toOpenai*` 翻译函数、`runFn`/`fetchFn` 测试缝、各家族 `options`/`payload`）。
④ 无默认值键的解构参数、`options = {}` 形参、被条件扩展的局部对象字面量，以及 40 余处上游 JSON / `Object.entries` 的 `unknown`——同一套按需 `: any` 收尾。合计 **1917→0**。
**踩坑 1**：解构里写 `{ runFn: any = f }` 是**重命名绑定**（把局部变量改名成 `any`），不是注解；没有 `= {}` 默认值时注解必须写在花括号外——`{ runFn = f }: any`。写错会静默丢掉 `runFn`，cursor/devin 4 个传输测试立刻 502，tsc 报 `TS2304 Cannot find name 'runFn'`——见到这个码先查解构。
**踩坑 2**：批量注解别用「标识符 + `= {}`」的宽松正则，它同时踩两个雷：把语句位置的赋值 `record = {}` 改成 `record: any = {}`（变成 label + 给未定义变量 `any` 赋值，运行期 `ReferenceError: any is not defined`，只有 antigravity 那条路径会炸），以及把已注解的 `: any = {}` 再注一遍并**复制** `= {}`（190 处）。两处都是 `npm test` 抓出来的——批量改类型后必须跑全量测试，并 grep 生成物确认没有注解漏进 `lib/*.js`。
**收口**：归零后删掉 `tsconfig.json` 的 `noCheck: true`——`npm run build` 从「只擦类型」变成**真做类型检查**，`npm test` 随之会在类型错误上失败。CI 棘轮 `scripts/typecheck-ratchet.ts` + `typecheck-baseline.json` 基线降到 **0**，且脚本显式传 `--noCheck false`，将来有人把开关加回来它仍会拦下。`strict` / `noImplicitAny` 仍未开、选项袋仍是 `any`，所以它抓的是拼错属性、错实参个数、坏字面量，**不是** null 安全。

## 2026-09-19：Cline 活测命中率 74%——大头是上游分片轮换，附带修掉 system 头钉串模型

**现象**：`npm run analyze` 一份 70 调用的会话：命中率 74.0%，12 次 affinity_miss 占未缓存 token 的 74%（1.55M/2.08M）；每次 miss 都是整体 miss（reuse<10%）且**下一次调用立刻 ~100% 命中**——缓存条目在上游还活着，只是这次请求落到了没有它的分片/供应商上。miss 间隔 24s–10min 不等，排除 TTL。
**根因**：Cline 背后是 OpenRouter 隐式前缀缓存，亲和只有 `X-Task-ID` 一个字段（CLI 同款已正确发送），上游按供应商池路由时缓存不随人走——免费/便宜模型尤其明显；hop 侧无法再钉。附带发现真 bug：DSH 在 Completions 调用上**根本不发** `session_id`/`prompt_cache_key`（整个运行时 grep 为零），`SYSTEM_PINS` 永远落在常量 `dsh-cline` 上 = 进程级单钉；会话中 `kimi-k3`→`deepseek-v4.1-flash` 换模型后新 system 头与旧钉不兼容，旧逻辑把整段新 prompt 停到 messages 尾部、继续发旧模型身份头（剩余 54 次调用 + 下个会话都会串）。
**修复**：`stabilizeClineSystemPrefix` 只在「新头是旧头的纯扩展」时停车；不兼容的头直接重钉（前缀本来就已断，冷写不可避免，但模型拿到正确的 system prompt）。kimi/copilot 同款 stabilize 有同一模式，本次未动，换模型多的家族应跟进。回归测试：`test/cline.test.ts`「an incompatible system head re-pins」。

## 2026-09-19：README 缺 Devin / Cline 两个已落地家族——代码 11 家，文档只写 9/10

**现象**：`store.ts` `PROVIDER_IDS` 已有 11 个家族（含 Devin、Cline），但 `README.md` / `README.zh.md` 的系列表、导入路径表、回环行、Fast 表、额度表都查不到这两家，`PRODUCT.md` 写「Nine OAuth families」，`AGENTS.md` Index 漏 Cline；`proxyUrl` / `cursorProxy` 两个 Config 选项也不在 Options 表。新用户按 README 找不到 Devin / Cline 的登录入口。
**根因**：两个家族都按「新家族」流程落地了 `src/oauth/<id>/` + README + `docs/oauth.md` + error.md + 测试，但步骤 7「README 归因补齐」只补了家族 README，根 README / PRODUCT 没跟着收口——`PROVIDER_IDS` 是唯一权威清单，文档抄漏了。
**修复**：双语 README 的系列 / 路径 / 回环 / Fast / 额度表补齐 Devin、Cline，Options 表补 `proxyUrl`、`cursorProxy`；PRODUCT.md 改 11 家；AGENTS.md Index 补 Cline。不改码，纯文档对齐 `PROVIDER_IDS`。

## 2026-09-19：Cline 免费档活测——4/5 可用且不扣余额，muse-spark 区域门

**现象**：feed 的 `free` 桶 5 个模型进目录后要确认真能跑：`cline-free/muse-spark-1.3-contributor` 每次 403 `{"error":"access forbidden: … is not available in your region","success":false}`，其余 4 个正常。
**根因**：区域门在上游按出口 IP 判，与本 hop 无关（同账号、同 token、直接打 `api.cline.bot` 也是 403）；插件没有也不该按地区猜着过滤目录——feed 是 Cline 自己的推荐列表，换个地区/出口就能用。
**修复**：不改码。活测记录：`cline-free/deepseek-v4.1-flash` / `z-ai/glm-5.3-flash` / `cline-free/solar-pro4` / `poolside/laguna-s-2.1:free` 四条全部 200：流式出字、`reasoning_effort: low` 被接受、非流式解包后 `tool_calls` 返回 `get_weather({"city":"Paris"})`（`finish_reason: tool_calls`）；`/usages` 台账里这些调用的 `creditsUsed` 全是 `0`，余额停在 $0.335787 未动；laguna 第二次还带回 `cached_tokens: 32`。muse-spark 只能靠非受限地区出口（插件出站代理设置，未实测）。
**踩坑**：免费档里有推理模型，`max_tokens` 给小（32）时 reasoning token 会吃满预算、`content` 为空但 `finish_reason: stop` —— 不是 hop bug；给到 512 就正常出字。

## 2026-09-19：Cline 卡片只有余额没有进度条——credit 账号没有分母，ClinePass 才有三条窗口

**现象**：Cline 卡片只有「额度余额 $0.34」，没有进度条，看起来像漏做。
**根因**：`cline` 是 credit（usage-billing）产品：`/balance` 只给余量，`/usages` 只给流水，`/users/me/plan` 对无订阅账号 404——没有「窗口 + 上限」就没有分母。官方 CLI 同样只打 `Credits: $x.xx`（`apps/cli/src/tui/interactive-welcome.ts`），整棵 TUI 搜不到 cline 的百分数字段。
**修复**：补上只对订阅账号生效的三条窗口条：`GET /users/me/plan/usage-limits` 的 `limits[] = {type: five_hour|weekly|monthly, percentUsed, resetsAt}` 直接给服务端百分比（转成 DSH 的剩余条），cap 取 `plan.entitlements.cline_pass.inferenceCapThreshold`，单位 1e-8 USD；cap 缺失只画纯百分比条，不补默认值；credit 账号行为不变（仍是余额行）。
**未验证**：本机账号无订阅，两个 plan 端点都 404，三条窗口的**数值**没有活体样本。已验证路由真实存在——`/users/me/plan/usage-limits` 回应用级 404 `{"data":null,"error":"no plan history found for user"}`，未知路由回 `{"error":"Not Found"}`；形状取自 MIT `pi-clinepass` `0.1.5` `src/usage.ts`。拿到订阅账号后需重跑 `fetchClineQuota` 复核。

## 2026-09-19：Cline hop 活测三条结论（响应信封 / `workos:` 前缀 / 隐式缓存）

**现象**：接入 Cline（CLI 3.0.62，WorkOS 设备码）时本机账号活测暴露三件事——①非流式对话回 `200 {"data":{…choices…},"success":true}`，直通给 DSH 时读不到 `choices`；②裸 JWT 当 bearer 一律 401 `Please make sure you're using the latest version of Cline`；③`anthropic/claude-opus-5` 连打两次 `cached_tokens` 都是 0，`openai/gpt-6-astra` 第二次 1461/1464。
**根因**：Cline 只给**非流式**回包套 `{success,data}` 信封（SSE 不套），CLI 因为始终 `stream: true` 从没撞上；bearer 必须是 `workos:<jwt>`（`provider-auth-registry.ts` `formatAccessToken` 加的前缀）；Anthropic 经 OpenRouter 要显式 `cache_control` 断点，CLI 不发，隐式前缀缓存只对 OpenAI 系生效。
**修复**：`unwrapClineEnvelope` 在非流式分支先解包再过 usage 映射；`formatClineAccessToken` 幂等加前缀（导入 / 粘贴 / 刷新同一入口）；`CLINE_REASONING` 无 `off` 键（CLI 禁用思考时不发字段）、`max`→`xhigh`。活测：设备码 → `POST /auth/register` → `/users/me` + `/balance`（微美元）+ `/plan`（无订阅 404）全通，proxy 流式与非流式都拿到 `ok` 与 usage。

## 2026-09-18：xAI Grok 额度显示「0 / 0」——上游改了 GetGrokCreditsConfig schema

**现象**：SuperGrok Heavy 账号额度卡只有「每周 0 / 0」和重置倒计时，没有用量条；billing JSON 与 gRPC 帧都 200。
**根因**：①billing 的 `onDemandCap{val:0}`（pay-as-you-go 关闭）被 `grokOnDemandBag` 当成真额度包，造出 0/0 行；②上游把 GetGrokCreditsConfig 的 usage float 从 nested field 1 移走（周期挪到 nested field 8 `{type,start,end}`），解码器只认旧形状，拿不到 percent 也填不进 0/0 行。
**修复**：`grokOnDemandBag` 与 monthly 一样要求 `total > 0`；`decodeGrokCreditsFrame` 读 nested field 8 的 start/end（旧 field 4/5 保留回退），有周期无 usage 时按 proto3 省略零值 = 0% 已用（与 grok.com 网页一致）；snapshot 的 `periodStart` 并入行。活测：Heavy 账号返回 weekly 100% 剩余 + 正确 resetAt。

## 2026-09-18：令牌生命周期对齐 CLIProxyAPI——401 刷新重试 / 后台 sweep / 失败退避

**现象**：对照 router-for-me/CLIProxyAPI 后发现三处缺口——①上游 401（令牌被吊销/轮转但未到 expiresAt）直接透传给客户端，用户只能重登；②令牌纯惰性刷新，闲置后首个请求付刷新 RTT，refresh token 静默死亡只在请求中暴露；③token 端点瞬时故障时每个请求都重打端点，且仍有效的旧 access token 被白白丢弃；④同账号重登录整体覆盖 session，丢 projectId / cachedEmail 等水合字段。
**根因**：`TokenManager` 只有「到期前 preempt 窗口内惰性刷新」一条路径，无强制刷新、无失败退避；`saveSession` 无合并语义。
**修复**：`refreshNow(id, failedAccessToken)`（已轮转的并发刷新直接复用，不二次兑换 refresh token）；上游 401 经 `upstreamRequest().run({ refresh })`（钩子 `tokens.ts` `forcedRefresh`）刷新一次重试，失败则原样透传上游 401 body；`startTokenSweep` 每 60s 扫全部已存账号；瞬时刷新失败记 5min 退避且未过期令牌继续服务；`saveSession` 同 id 合并非凭据字段（`SESSION_CREDENTIAL_KEYS` 除外）。自有 transport 的家族（Kiro / Cursor / Devin / Antigravity）现在共用同一钩子。

## 2026-09-17：手动更新「经常失败」——装上了但不重启、update 超时即放弃

**现象**：关于页手动点更新常报失败或装完版本仍旧；自动更新却稳定。根因有三：①手动 apply 不传 restart，装上后进程仍跑旧模块，用户不重启就永远「有新版本」；②`dsh plugin update`（pnpm update，对 git spec 常 no-op）一超时就不再走确定性的 `add <repo>#tag`；③GUI 启动的 dsh web PATH 极简，spawn 的 dsh 找不到 pnpm/node。
**修复**：手动 apply 默认 `restart !== false`（与自动更新、DSH 卡一致，装完自动重启）；`applyHostUpdate` 在 update 超时后仍重试 `add #tag`；`runDshPlugin` 与 npm 一样补 PATH 默认值。UI 拆开「检查更新」与「更新到 vX」，加版本带、进度秒数与自动更新「上次检查」行（`update-state.json` 记录 lastRun）。

## 2026-09-17：Devin hop 的三个活测结论（双前缀 / ide_name / fast）

**现象**：接入 Devin 时发现三类会做错的事——①给已带 `devin-session-token$` 的 token 再加前缀，上游 401；②`GetCliModelConfigs` 用 `ide_name: devin` 只回 1 条 stub config（209→1），MITM 真二进制后确认 `chisel`/`3000.10.31` 才是 CLI 真实指纹；③`GetCliModelConfigs` 有 `*-fast` 真后端变体，过 `applyFastMode` 会把模型 id 剥掉 `-fast`。
**根因**：token 导入/粘贴/paste 共用入口，不 normalize 就双前缀；服务端按客户端身份区分目录；共享 fast-mode 语义把「快档」当后缀 flag，和 Devin 把它当独立模型冲突。
**修复**：`normalizeDevinToken` 幂等加前缀；身份按真 CLI MITM 固定 `chisel`/`3000.10.31` + `os` + `Basic <tok>-<tok>`（`windsurf` 也能回全量但那是 windsurf 指纹，不是 devin 的）；Devin 分支跳过 `applyFastMode`，`-fast` 收成独立 picker 行 `*-fast`。

## 2026-09-17：宿主/页面版本错配时「导入」把 Grok 会话写进 devin 槽

**现象**：`dsh web` 跑着旧版宿主、Settings 页已是新版时，点「导入本机 Devin CLI」无报错也没有 Devin 账户；auth.json 的 `devin` 键却多出一份 Grok 会话（`auth.x.ai` token、`SuperGrok` 套餐），模型界面没有 `oauth-devin` 路由。
**根因**：旧版 `importFrom` 对不认识的 provider 落到末尾 `importGrokAuth()` fallthrough，再以调用方的 provider 名 `saveSession('devin', grokSession)`；占住槽位后 `#maybeAutoImportDevin` 只看 `rows.length` 永不自动导入。另发现 `sync()` 漏传 `devinModels`，活目录不进 DSH 路由。
**修复**：`importFrom` 先校验 `PROVIDER_IDS`，未知 provider 抛 `unknown provider`；新增 `isDevinSessionToken`（`devin-session-token$` 前缀）形状检查，auto-import 只认本家族会话（外来行留给 refresh 401 自清）；`sync()` 补传 `devinModels`；页面把 `unknown provider` 错误翻译成 `hostStale`「重启 dsh web」横幅（沿用 `opencodeGoHostStale` 的错配先例）。

## 2026-09-17：Devin hop 的孤立 cache_read=0 是上游行为，不是 hop bug

**现象**：两个 session（88 跳 96% / 115 跳 93%）各有孤立 `cache_read_tokens=0`（墙钟 ~5–8min 一次），下一跳立刻恢复读满前缀；活测同 cascade 连打 8 跳复现——read 恒落后 1–3 跳、偶发 0。
**根因**：上游 `PromptCacheOptions{type:1}`（ephemeral）缓存异步提交 + 定期失效；与 pin/cascade/effort/splice 无关——A/B 活测证伪 message_id 回传影响（上游自发 `bot-uuid`，回传与否命中率一致）。
**修复**：hop 侧无解；顺藤摸到 `GetUserJwt` 每跳都打（RTT ≈2s），jwt `exp`≈15min——`devinChatAuth` 按 exp−90s 复用 per-token，chat 401 丢缓存重试一次 token-only。另外修分析器误报：tool/result 序列化 envelope 的 `content`/`arguments`/`parts` 载的是文件文本（读 error.md 触发 `TRANSPORT`/`stream idle timeout` 误报 2 条），现剥掉 payload 键再扫描。

## 2026-09-17：Cursor 区域锁模型全挂 + 勾选格停在静态底表

**现象**：Cursor 勾选格里 Claude / Gemini / GPT-5.x 一跑就 `Model not available: This model provider is not supported in your region`；同时账号实际可用的 `default`(Auto) / `kimi-k3` / `kimi-k2.7-code` / `glm-5.2` / `*-fast` 不进勾选格，活目录（GetUsableModels 23 行）从未落到 picker。
**根因**：Cursor 按请求出口 IP 做合规区锁（官方解法就是 `http.proxy`，本 hop 的 `http2.connect` 没有任何代理支持）；活目录只在登录 / 导入 / 手动刷额度时拉取，静态底表一直顶在 picker 上。
**修复**：新增 `cursor/upstream-proxy.ts` —— `PI_CURSOR_PROXY` / `CURSOR_PROXY` / 插件配置 `cursorProxy`（http://、https://、socks5://）时 Run 与目录 RPC 走 CONNECT/SOCKS5 隧道再 TLS+h2（`cursorH2Connect`，connectFn 允许异步）；`warmCatalogs()` 在启动时为已登录家族跑活目录并重 sync；目录缓存键并入代理出口；区域错误追加指向该配置的提示；picker 名字去掉 `Cursor ` 品牌前缀。跑通验证：default / composer-2.5(±fast) / grok-4.5/4.6(±fast) / glm-5.2 / kimi-k2.7-code / kimi-k3 全 200。

## 2026-09-15：OpenCode Go 的内置 27 个模型被插件带进 DSH 模型列表

**现象**：`OPENCODE_API_KEY` 一旦存在，DSH 模型列表就多出内置 `opencode-go` 的 27 个模型；插件 Settings > 模型 家族组只列 `deepseek-flash` 一条，用户没在 DSH 模型设置页开过它，删掉下次 sync 又回来。
**根因**：llm-pi-ai 只注册 profile 点名的目录路由；`ensureOpencodeGoRoute` 有 key 就补写 `providers.opencode-go = { apiKeyEnv, x-opencode-session }`，等于替用户把内置目录整条激活（旧版裸 `{ apiKeyEnv }` 还会被升级成同一形状）。
**修复**：sync 不再创建/刷新 `providers.opencode-go`，只写插件自有的 `opencode-go-flash`，并 unset 旧版本插件自己写的同形 profile（裸 `{ apiKeyEnv }` 等用户形状不动）；没有任何账号带 key 时清掉镜像的 `OPENCODE_API_KEY`，路由不再滞留。

## 2026-09-11：OpenCode Go 全家族 400 MissingSessionID

**现象**：默认模型 `opencode-go-flash/deepseek-flash` 每轮报 `400 {"type":"MissingSessionID","message":"…missing x-opencode-session…"}`；实测内置 `glm-5.3` 直连同样 400，带上 `x-opencode-session` 才 200。
**根因**：Console Go 现在硬性要求该头（官方文档 "Your client should … send a stable session ID in `x-opencode-session`"）。DSH 有每会话 `sessionId`，但 pi-ai 0.85.1 的 completions/`sendSessionAffinityHeaders` 都不映射它，llm-pi-ai compat gate 又 withhold 该字段，profile 无法转发会话 id。
**修复**：`ensureOpencodeGoRoute` 给 `opencode-go`（内置目录）和 `opencode-go-flash` 两条 profile 都写稳定头 `x-opencode-session: dsh-opencode-go`；旧 `{ apiKeyEnv }` 形态自动升级；无 key 仍整条 unset。这是单机单 shard 的常量回退，等 DSH/pi-ai 原生按会话发送后可去掉。

## 2026-09-11：未登录家族的模型被勾选，OpenCode Go 无 key 仍写进 DSH

**现象**：Settings > 模型 里 Kimi / Copilot / OpenCode Go 未登录时勾选框仍打勾（灰的，`已开启 3 / 3`）；OpenCode Go 没有 `OPENCODE_API_KEY` 也把两条路由写进 `llm-pi-ai`，DSH 模型列表里出现不能用的模型。
**根因**：`describeCatalog.enabled` 只是 ModelSwitch 的用户偏好，`ModelRow` 直接拿它当 `checked`；`ensureOpencodeGoRoute` 不看 key，缺失就补。
**修复**：锁定的家族一律渲染未勾选、计数 `0 / m`；`sync()` 把 `#opencodeGoKeySet()` 传给 `ensureOpencodeGoRoute(apiKeySet)`，无 key 时插件自写的 `opencode-go` / `opencode-go-flash` 都 unset（用户自建路由不动）；`goSave` / `goClear` / `switch` / `logout` 后触发 sync。

## 2026-09-11：OpenCode Go 只能存一个账号，展示框架也不是通用账号卡

**现象**：Settings > OpenCode Go 只能保存一个 key/cookie/workspace，再加会覆盖；没有其它 OAuth 家族那种账号卡，不能切号、也不能一账号一条额度。
**根因**：`opencode-go.json` 是单 entry 结构，key 直接写死 `OPENCODE_API_KEY`；页签是自绘面板，没复用 `ProviderCard` / `AccountCard`。
**修复**：`store.ts` 改多账号 0600 vault（旧单账号文件自动迁移，key 随账号落盘），活动账号 key 镜像到 `OPENCODE_API_KEY`；`switch` / `logout` / `quota` 走通用 RPC；UI 改 `card('opencode-go')`，添加走 `ProviderCard` 的居中 Dialog（`goSave`）。

## 2026-09-11：模型页不显示 OpenCode Go 模型，插件却在重复部署 28 个

**现象**：Settings > 模型 只有 9 个 OAuth 家族，没有 OpenCode Go；`OPENCODE_API_KEY` 未注入时也看不到 Go 模型。DSH 模型设置页里却有内置的 OpenCode Go（27 个）。
**根因**：`catalogProviders` 只投影 OAuth 家族；插件还试图把官方 28 个模型全写进 3 条 `opencode-go*` 路由，覆盖/复制了 DSH 内置 pi-ai catalog（内置 provider 只缺 `deepseek-flash`）。
**修复**：改「内置目录 + 单模型补充」——`providers.opencode-go` 只写 `apiKeyEnv`（不带 `api`/`models`，DSH 复用它自带的 27 个模型），插件只写 `opencode-go-flash`（`deepseek-flash`）；picker 只列补充路由，快照按 `OPENCODE_API_KEY` 标记 `loggedIn`（无 key 只锁勾选、不隐藏）。

## 2026-09-11：空 reasoningEfforts 让 3 条 OpenCode Go 路由整段写不进

**现象**：v0.0.87 启动后 `llm-pi-ai.providers` 里没有任何 `opencode-go*`；Composer 选不到 Go 模型，也没有报错文案。
**根因**：`opencode-go/models.ts` 的 `model()` 用 `{ ...reasoningEfforts }` 存 `false`，JS 展开得到 `{}`；DSH strict 校验把空 dict 当配置错误，`settings.mutate('llm-pi-ai')` 整次原子写被拒，`ensureOpencodeGoRoute` 只吞成 `{status:'error'}`。
**修复**：`false` 原样保留；`assertDshServiceableProvider` 同步拒绝空 dict。全量 3 路由已改为只补 `deepseek-flash`，不再有 `false` 行。

## 2026-09-11：OpenCode Go 保存报 unknown method；添加还是页内表单不是悬浮窗

**现象**：Settings > OpenCode Go 粘贴 API key/cookie 点保存，红字 `保存失败: unknown oauth-subs method goSave`；添加 UI 是页内表单。
**根因**：`dsh web` 宿主进程启动早于 v0.0.87；`client.js` 被 live 重载成新版，Node ESM 缓存里的宿主还是旧版 RPC 表，故 `goSave` 不识别。面板也违反「添加账号用居中 Dialog」的 UI 约定。
**修复**：OpenCode Go 页改为单账号卡片 + `CenterDialog`（key/cookie/workspace、清除、错误都在窗内）；客户端把 unknown method 映射成「重启 dsh web 后再保存」。宿主 RPC 不变，重启宿主后保存生效。

## 2026-09-10：关于页 DSH 只读 latest dist-tag，next 上的 rc 被判成 npm 未发布

**现象**：npm 已有 0.1.5-rc.2（`next` tag），About 仍显示「GitHub 有新 Tag dsh-v0.1.5-rc.2（npm 尚未发布）」；「最新发布」停在 0.1.5-rc.1，「稳定版」显示 —。
**根因**：`fetchDshLatest` 用 `dist-tags.latest || next || alpha` 当最新发布，`latest`=rc.1 永远压过 `next`=rc.2；服务端 npm 载荷没带 `stable`，覆盖了客户端 fallback 的稳定版字段。
**修复**：npm 最新发布取全量版本排序首位（与 npm 页一致），`stable` 单独取 `latest` tag 并随载荷返回；rc.2 > rc.1 即 status `update`。

## 2026-09-10：OpenCode Go 页没有 API key 输入，cookie/workspace 框被撑到 240px 高

**现象**：Settings > OpenCode Go 只能填 cookie 和工作区；对话密钥要去 DSH API Keys。两个输入框异常高。
**根因**：面板没写 `OPENCODE_API_KEY`；`.osubs-fields` 是竖排，子项 `.osubs-input { flex: 1 1 240px }` 把高度拉成 240px。
**修复**：面板第一项是 API key，`goSave` 经 `credentials.set('OPENCODE_API_KEY')` 写入宿主凭据；cookie/workspace 仍只读额度。`.osubs-fields > .osubs-input` 改为 `flex: none; height: 36px`。

## 2026-09-10：OpenCode Go 页签误放右侧工具列

**现象**：Settings 顶栏 OpenCode Go 图标在右侧 Models/About 列，不在左侧家族胶囊。
**根因**：新增时把 `apikey` tab 放进了 `.osubs-tabs-util`。
**修复**：`apikey` 放进左侧 `.osubs-tabs`，排在 Copilot 之后换到第 2 行左侧；右侧 util 只留 Models + About。实现仍在 `src/apikey/opencode-go/`，不走 hop、不另开第三胶囊。

## 2026-09-10：Cursor Run 把 requestContext / KV set / MCP 调用一律当拒绝，模型跑不通

**现象**：Cursor 任一模型一调用即 500 `{"error":"dsh owns tool execution"}`；工具轮次也拿不到结果。
**根因**：Run 握手的 `ExecServerMessage.request_context_args` 被统一回 `ExecClientThrow`，上游判 `Failed to get request context`；`KvClientMessage` 对 `setBlobArgs` 也回 `getBlobResult`；原生 read/shell 与 MCP 调用同样先 throw，MCP 参数被丢。
**修复**：`requestContextArgs` 回 `RequestContextResult.success`（带 DSH 工具定义）；KV 按 get/set 回对应 result；原生 Cursor 工具回类型化 rejection 让模型回退 MCP；MCP 调用带真实参数交给 DSH，结束后以工具结果续跑（`parseTurns` 完成轮 + 工具输出作当前动作）。

## 2026-09-10：OpenCode Go 以 API key 模块加入（cookie + 工作区读额度）

**现象**：需要 OpenCode Go 页签显示剩余额度，但 Go 不属于 OAuth 订阅；对话在 DSH 配 `OPENCODE_API_KEY` 即可，不应再包一层回环网关。
**根因**：Go 是 API key 制（Responses 直连 `opencode.ai/zen/go/v1`）。额度只在 Web 侧 cookie + 工作区可见，官方未给 Bearer 用量接口。
**修复**：新增 `src/apikey/opencode-go/`（`store.ts` 存 `<dataDir>/opencode-go.json` 的 cookie + workspace，`quota.ts` 刮 `/workspace/{wrk_}/go`）；`sync()` 用 `ensureOpencodeGoRoute` 在缺失时补 3 条路由（`opencode-go` / `-responses` / `-anthropic`，`models.ts` 钉 28 个模型的 name/id/api/context/input/思考档）；已存在不覆盖；`RETIRED_FAMILY_IDS` 仍 unset `oauth-opencode`，无 `proxy.ts` hop。

## 2026-09-10：Grok leading 文本改写后整块重挂，未变前缀不缓存

**现象**：`grok-4.6` 长会话每步约 10k token 命中不到，加权命中卡在 ~90%，热身前段 44–68%；分析器把前段标成 `prefix_break`（`affinity-miss` 0）。
**根因**：`pinGrokSystemPrefix` 只在「新文本 = 旧文本 + 后缀」时挂增量；前插快照 / 中段改写等任何非后缀变化都把**整段** leading blob 当 extra 重挂到 input 后缀。钉住前缀虽 byte-stable，但重挂的整段每步都变，未变部分也进不了缓存（gap ≈ leading 块大小）。
**修复**：`changedRegion` 取最长公共前缀 + 最长公共后缀（不重叠），再外扩到整行边界，只把变化区域挂后缀；钉住前缀保持 byte-stable。`test/grok-request.test.ts` 覆盖前插快照与中段改写。

## 2026-09-10：关于页检查失败 GitHub releases 403

**现象**：About 当前版本正常，最新版本 `-`，红字 `检查失败 · GitHub releases 403`；DSH 卡 GitHub Tag 也是 `-`。
**根因**：未认证 `api.github.com` 每小时 60 次用尽后回 403。`fetchLatest` 把非 200 直接抛错，没有走 github.com 页面。
**修复**：API 失败后先试本机 `gh api repos/…/releases/latest`（PATH / Homebrew / `GH_BIN`），再读 github.com `/releases/latest` 的 302。有 `GITHUB_TOKEN` / `GH_TOKEN` 时带 Bearer。

## 2026-09-09：关于页检查更新 405 `/oauth-subs-auth/status`

**现象**：设置 > OAuth 订阅 > About，「检查更新」无反应，红字 `transport failure for /oauth-subs-auth/status: HTTP 405`，最新版本显示 `-`。
**根因**：`rpc.handle` 用 `this.ctx.webServer.register` 挂前缀。插件没 inject `webServer` 会直接拒读；inject 了 Cordis 仍把 `this.ctx` shadow 成 connection 提供方 fiber，那边也没有 `webServer`。通道没挂上，POST 落到 SPA fallback 回 405。
**修复**：`registerRpc` 同时 inject `connection` + `webServer`，并把 traced service 的 `ctx` 绑回调用方 scope 再 `handle('/oauth-subs-auth')`。

## 2026-09-09：关于页更新插件报 PATH 上找不到 dsh

**现象**：About 已显示本机 DSH 版本，点插件「检查更新」红字 `PATH 上找不到 dsh`，0.0.82 装不上。
**根因**：`runDshPlugin` spawn PATH 上的 `dsh`。GUI / Homebrew 启动的进程 PATH 没有那份；关于页用的是 `DSH_BIN_PATH` / `process.argv[1]`。
**修复**：插件更新 spawn 当前进程那份 DSH（`.js` 入口用 `process.execPath`）。找不到才回落到 PATH `dsh`。

## 2026-09-09：Completions 透传没把 cache_read 交给 DSH

**现象**：Copilot / Kimi / GLM Completions 残留长聊 DSH `cacheReadTokens` 一直是 0%，上游 usage 里其实有 `cache_read_input_tokens`。
**根因**：`mapCopilotUsage` 只在单测里跑；代理 SSE/JSON 原样转发。流式默认不带 `stream_options.include_usage`，很多 Completions 上游根本不回 usage。
**修复**：这三家 Completions hop 缺省要 `include_usage`（已显式设置则不改）。JSON 和 SSE 的 `usage` 译成 `prompt_tokens_details.cached_tokens`。没有字段不发明 0。Anthropic / Responses 不改。Completions 流不走 Codex preamble 闸（没有 `response.created`），否则小回复会等到 120s。

## 2026-09-09：代理透传 content-encoding: gzip 但 body 已被解压

**现象**：非流式上游响应（xAI Cloudflare 对 JSON 响应 gzip）经代理后带 `content-encoding: gzip` 头但 body 是明文，客户端 gunzip 报 incorrect header check / terminated，Grok 非流式调用不可用。
**根因**：undici fetch 自动解压 gzip，代理转发已解压字节却保留上游 `content-encoding` / `content-length`（描述的是上游线上字节）。
**修复**：`forwardedHeaders` 剥离 `content-encoding` / `content-length`（wire-only），Node 重新分帧；回归测试覆盖。

## 2026-09-08：账号刷新跨越切换或注销后误写凭据

**现象**：A 刷新期间切到 B 会被切回 A；A 的永久失败可能删除 B；注销后旧刷新 / 额度补全可能复活账号。
**根因**：刷新按厂商共用 inflight，保存和删除操作重新读取 active；后台额度绕过刷新归并且异步补全无来源快照校验。
**修复**：刷新按账号和登录代次归并，store 进程内串行条件写回 / 删除校验来源凭据；聊天与额度共用 TokenManager，metadata 只向来源账号做差量更新（含显式删除旧验证字段）且不激活账号。

## 2026-09-08：OAuth 错误回调无需 state 即可取消登录

**现象**：向 loopback callback 发送无 state 或错误 state 的 error 参数即可终止正在等待的合法登录。
**根因**：handler 在核对 state 前接受 error / error_description 并结算登录。
**修复**：成功和失败回调均先校验 state；不匹配回 400 且保留当前尝试，合法失败仍正常报告。

## 2026-09-08：显式模型全关被后续同步重新开启

**现象**：用户全关一族后，当次路由消失，但普通同步或重启又启用模型。
**根因**：旧全关恢复逻辑只看当前目录是否全禁用，无法区别用户选择与历史坏状态。
**修复**：持久化显式选择标记；用户操作后同步尊重选择，无标记旧文件仍可恢复，新增普通模型仍按原默认启用。

## 2026-09-08：Kiro 交错工具调用被拼成同一个调用

**现象**：同轮多个工具被客户端合并，参数中还可能混入对象而非字符串。
**根因**：流转换固定 index 为 0，仅带 name 的分片才序列化对象参数。
**修复**：每个 toolUseId 分配稳定且互异的 OpenAI index，所有参数分片统一为字符串，停止帧不重复输出。

## 2026-09-08：Antigravity 流式多字节字符损坏

**现象**：中文、重音字符或 emoji 在网络分片处变成替换字符。
**根因**：每个 byte chunk 单独 toString('utf8')，截断的多字节字符无法由下一块补全。
**修复**：厂商 transport 使用有状态 TextDecoder 增量解码并在 EOF 刷新，再解析 SSE；逐字节分片回归保留原文。

## 2026-09-08：无响应体的上游回复令本地请求挂起

**现象**：上游返回无 body 的响应（如 204）后，本地请求一直等到客户端超时。
**根因**：透传在 body 为 null 时仅提交响应头便提前返回，没有结束本地响应。
**修复**：无 body 同样走统一释放 / 结束路径；流式空回复仍经过无输出重试判定，reader 在结束或失败后释放。

## 2026-09-07：DSH 更新后 dsh web 无限重启；本机版本忽高忽低

### 现象
关于页点「更新宿主」或勾选自动更新后 `dsh web` 反复重启，本机版本一直停在 0.1.2-alpha.5；换个终端启动又显示别的版本。

### 根因
探测把 `$_`、PATH 上的 `dsh`、各全局 prefix 都当候选，报出的不是当前进程那份；`npm install -g` 写进 `npm prefix -g`（`~/.local`），运行中的是 `/opt/homebrew`；宿主只看 npm 退出码 0 就重启，重启后版本未变再装再重启。

### 修复
只认 `DSH_BIN_PATH` / `process.argv[1]` 这份；安装用 `--prefix` 指向该份所在 npm prefix；装完探测版本须与目标精确一致才重启，否则报 `installed-unchanged` 不重启，且自动更新记住该目标、下个整点跳过（手动点击仍重试）。前端本机版本按宿主 → 快照 → 静态戳取值，不再取三者最新。

## 2026-09-06：切到 Codex 整卡闪入

### 现象
每次打开 Codex（及其他家族）整张卡重新出现，入场动画一闪，刺眼。

### 根因
`tab === id && card()` 卸载再挂载，加上 `.osubs-pane > *` clip/opacity 入场。

### 修复
各 tab 面板常驻 `hidden` 切换；去掉 pane 入场动画。Settings 重挂时用 localStorage 上次 status 先画出账号卡，避免空壳再整卡灌入。额度条不再从 100% scale 过渡到真实剩余。

## 2026-09-06：未登录 Copilot 模型列表被收成「登录后同步」

### 现象
模型页 GitHub Copilot 未登录时只剩标题、已开启 10/10 和登录按钮，没有和其他 OAuth 一样列出禁用 checkbox。

### 根因
`ModelFamily` 在 `!loggedIn` 时不渲染 `.osubs-models`。

### 修复
未登录仍画出模型行，checkbox 保持 disabled；全选/全关仍换成登录。

## 2026-09-06：关于页本机 DSH 版本无法从已下发静态资源读取

### 现象
本机版本一直是 —。GitHub Tag / npm 能显示。HTML、manifest、shell JS、client-modules bundle 均无 semver。

### 根因
dsh web 不下发 package.json；boot 图只有 content hash。宿主 RPC 未重启时也读不到 CLI 版本。

### 修复
把本机版本写入已下发的 `lib/ui/client.js` 哨兵 `DSH_HOST_VERSION_STAMP`；插件 apply 时盖戳，前端优先读该静态常量。

## 2026-09-06：自动更新勾选报 unknown oauth-subs method autoUpdate

### 现象
关于页勾选「检测到新版本时自动更新」立刻失败，红字 `unknown oauth-subs method autoUpdate`，checkbox 弹回未选。

### 根因
前端已热更，宿主 Cordis 进程仍是旧 RPC 表，没有 `autoUpdate`。失败后 `snap.autoUpdate` 仍为空，受控 checkbox 被打回。

### 修复
勾选先写入 localStorage 并乐观更新 UI；RPC 缺失时静默忽略；宿主就绪后再把本地偏好同步上去。

## 2026-09-06：关于页未展示 DSH 本机与官方/npm 最新版本

### 现象
关于页 DeepSeek Harness 本机版本为 —；官方 Tag / npm 版本曾整块缺失。后来 Tag 与 npm 能显示，但仍提示「请在终端重启 dsh web」，且无法选定版本回退。

### 根因
宿主进程未加载新后端时 `dshUpdate` RPC 不存在；本机探测不能在浏览器里完成。安装成功后只提示手动重启，没有版本下拉。

### 修复
去掉重启提示；npm 版本下拉支持升级/回退；安装成功后自动重启 `dsh web`。

## 2026-09-06：DSH 官方 GitHub Tag 无法直接通过 git/tarball 作为 npm 包安装

### 现象
尝试通过 GitHub Tag（如 `dsh-v0.1.3-alpha.1`）的 Git URL 或 Tarball 直接执行 `npm install -g` 报错退出，未能作为全局 CLI 安装。

### 根因
DSH 官方仓库为 pnpm monorepo，根目录为 `private: true` 且无构建产物 `lib/bin.js`（被 gitignore），必须依赖官方 CI 编译发布至 npm。

### 修复
监控分别请求 GitHub Tags 与 npm registry；仅在 npm 发布新版时允许更新，仅有 GitHub Tag 时展示提示且不盲目调用安装。

## 2026-09-06：Cursor composer-2 下线致流中断「Stream ended without finish_reason」

### 现象
Cursor 官方下线 composer-2 / composer-1.5，对话报错 `ERROR_MODEL_NO_LONGER_SUPPORTED`；代理丢弃 Connect 错误详情且直接截断流，客户端显示「Stream ended without finish_reason」。

### 根因
静态模型底表强制把 composer-2 / composer-1.5 重新塞入已发现列表；流式代理在收到上游首包前过早发送 SSE 200 头，中间出错未以内容形式输出并干净终止。

### 修复
`mergeCursorStaticFloor` 优先信任非空在线列表并从静态底表移除已下线模型；`consumeCursorFrames` 提取 Connect 错误说明；`forwardCursor` 延迟首包并安全收尾。

## 2026-09-05：Ollama 每周条不画「n后重置」

### 现象
5 小时条有「3 小时 17 分钟后重置」。每周条只剩剩余 %，倒计时空。官方 Cloud UI 两条都有。`GET /api/usage` 的 `limits.weekly` 仍只有 `usage` + `models`。

### 根因
`ollamaWindowResetAt` 缺 stamp 时只给 session 推 5h unix 桶。Weekly 只信 wire。#12532 的 `604800-((epoch-4d)%604800)` 当时当未证实偏移留下。

### 修复
Weekly 缺 stamp → `ollamaWeeklyResetAt`（下一 UTC 7d 桶、偏移 −4d = 周一 00:00 UTC）。Wire stamp 仍优先。不 `now+7d`，不刮 settings HTML。

## 2026-09-05：GLM 体验套餐（Start Plan）对话 3007，决定不支持

### 现象
体验套餐 JWT 打 `https://zcode.z.ai/api/v1/zcode-plan/anthropic/v1/messages` 一直 `400 {"code":3007,"msg":"captcha verify failed"}`（有/无 Desktop 指纹都一样）；同一 JWT 打 `open.bigmodel.cn` 是 401。

### 根因
ZCode Desktop 对 zcode-plan hop 注入阿里云 captcha 头。插件不伪造、不接 captcha SDK，这颗头过不去。

### 修复
不支持体验套餐：`glmKeyFromZcodeConfig` 跳过 start-plan JWT、不捡 `enabled: false` 的死 coding-plan key（没有可用的就导入失败）；目录 / 路由只留 Coding Plan 三行。试用对话在 ZCode.app。

## 2026-09-05：模型里看不到 GitHub Copilot

### 现象
0.0.74 用户说「模型里面没有显示 GitHub Copilot 的模型」。本机 `auth.json` 无 `copilot` session。

### 根因
Harness picker 只在登录后写入 `oauth-copilot`。Settings 目录虽有锁定组，标题是 `OAuth · Copilot`，且九家长 checkbox 把最后的 Copilot 顶出视口。

### 修复
展示名改为 `OAuth · GitHub Copilot`。未登录家族只留标题 +「登录后同步」+ 登录跳转，不再铺禁用 checkbox。

## 2026-09-05：移除 OpenCode Go Free

### 现象
Settings 仍有 OpenCode Go Free 页签，`oauth-opencode` 还在 llm-pi-ai。

### 根因
维护者要求整条产品线下架（Zen 匿名免费档与 Go Free 都不要），不是再改名。

### 修复
删 `src/oauth/opencode/`。FAMILY_IDS / 目录 / 代理 hop / Settings 页签去掉。`RETIRED_FAMILY_IDS` 仍 unset 残留 `oauth-opencode`。

## 2026-09-05：额度「n后重置」夹在两条进度条中间

### 现象
Ollama Cloud（及其他共用 `QuotaRow` 的卡）「5 小时」和「每周」之间浮着「3 小时 16 分钟后重置」，分不清属于哪条窗口。

### 根因
`QuotaRow` 把 `formatReset` 画在整条 meter 后面。`.osubs-qmeter { display: contents }` 让重置行和下一窗口标签同一列，间距看起来像共享说明。

### 修复
重置改到该条 `QuotaMeter` 内、百分比行下方、进度条上方。无 `resetAt` 的窗口不画。两条都有就各画各的。

## 2026-09-05：OpenCode Go Free 被做成了 Zen 匿名免费档

### 现象
Settings 家族叫 OpenCode Free，picker 是 `big-pickle` / `ling-3.0-flash-fin-free` / Muse Contributor Free 等 Zen `/zen/v1` 行。

### 根因
实现抄了 Hermes `opencode-free`（匿名 Zen）。产品意图是 OpenCode Go（`/zen/go/v1` + API key），不是 Zen 免费档。

### 修复
hop 改 `https://opencode.ai/zen/go/v1`，目录 live Go ∩ 去掉 `OPENCODE_ZEN_FREE`，贴 Go API key；废匿名哨兵。

## 2026-09-05：Copilot 用 OpenCode Ov23li8 换不出 tid=

### 现象
设备码登录后预览模型 400 `model_not_supported`，Business 403。`GET /copilot_internal/v2/token` 404。

### 根因
OpenCode 自家 OAuth App `Ov23li8tweQw6odWQebz` 发 `gho_`，GitHub 不给 vscode-chat session。VS Code / goose / Cherry Studio / hermes 走公开 `Iv1.b507a08c87ecfe98`（`ghu_`）。

### 修复
设备码 `client_id` 用 `Iv1.b507a08c87ecfe98`，换 `tid=` 再打 `api.githubcopilot.com`。导入的 OpenCode `gho_` 404 时退回 raw Bearer（只保 GA 模型）。

## 2026-09-05：OpenCode Free 无 x-opencode-session，缓存按 IP 混

### 现象
长聊 DSH `cacheReadTokens` 一直是 0。同一对话后续轮次像全新 prompt。匿名流量和别的会话挤在同一 sticky 提供商上。

### 根因
hop 对齐 hermes「不发 Authorization」，`opencodeCacheHeaders()` 为空。官方 CLI v1.18.29 发 `Bearer public` + `x-opencode-session`（Zen `stickyId`；空则回落到 IP）+ `x-opencode-request` + `x-opencode-client: cli`。

### 修复
对齐 [anomalyco/opencode](https://github.com/anomalyco/opencode) v1.18.29。`Bearer public` 是无 key 哨兵（不是 store 的 `anonymous`）。session 头写 DSH pin。Zen 若回 `cache_read_*` 再译成 `cached_tokens`。

## 2026-09-05：Cursor 选择器只有 Composer 2 / 1.5 等 5 个

### 现象
Settings OAuth · Cursor `已开启 2/5`。没有 Composer 2.5、Grok 4.6、Claude Opus 5、Fable 5.1、GPT-5.6、Gemini。

### 根因
静态 `CURSOR_MODELS` 停在年中 5 行。活目录非空时整表替换静态，GetUsableModels 仍返回旧 5 个时官方新模型进不了 picker。

### 修复
静态对齐 [cursor.com/docs/models-and-pricing](https://cursor.com/docs/models-and-pricing)（Composer 2.5 / Grok 4.6 / Fable 5.1 / Opus 5 / Gemini 3.1 Pro / 3.8 Flash / GPT-5.6 Sol·Terra·Luna）。`mergeCursorStaticFloor` 把活家族叠在静态楼上。

## 2026-09-05：本地 DSH Cursor 缓存命中率显示为 0%

### 现象
长 Cursor 会话 DSH `cacheReadTokens` 一直是 0。同一 `conversation_id` 的后续轮次仍像全新 prompt。

### 根因
`TurnEndedUpdate` 在 `@cursor/sdk` 1.0.27 已有 `cache_read_tokens`，hop 只把 field 14 当结束标志。历史 turn 的 `messageId` / `requestId` 每跳 `randomUUID()`，conversationState prefix 字节全变。CLI 指纹停在 `cli-2026.05.01-eea359f`。

### 修复
解码 field 3 → `prompt_tokens_details.cached_tokens`。turn id 改内容哈希。`x-request-id` = `x-original-request-id`。CLI 指纹对齐 pi-cursor `cli-2026.07.23-e383d2b`。不改 `client-type: sdk`（本 hop 是 CLI OAuth）。

## 2026-09-05：关于页更新成功但重启后版本仍旧

### 现象
磁盘与 pnpm-lock 已是 0.0.71，About 仍显示 0.0.70。触发是周四夜起一直活着的 Homebrew `dsh web`；zsh wrapper 的 `~/.dsh.pid` 杀不到那个 PID，用户以为已重启。

### 根因
旧进程仍加载更新前模块，且 `installedVersion()` 把 `require('../../package.json')` 冻在加载时。
About 优先 snapshot 旧 version；apply 成功后仍返回更新前的 `info.version`。

### 修复
每次读 package.json（失败返回空）。About 取检查结果与 snapshot 的较新者。apply 成功后再读一遍再返回。

## 2026-09-03：OpenCode Free 目录漏 Big Pickle、含过期 DeepSeek/Laguna

### 现象
picker 有 `deepseek-v4-flash-free`（400 Model is unavailable）和 `laguna-s-2.1-free`（503）。官方 Free 里的 `big-pickle` 进不了目录。

### 根因
`isOpencodeFreeSlug` 只认 `*-free`。Zen `/models` 还挂着过期 slug；`big-pickle` 官方免费但不带 `-free`。

### 修复
匿名 picker 改官方 7 个 id 白名单 ∩ live `/models`。静态楼同样 7 个。DeepSeek/Laguna 下架。

## 2026-09-03：OpenCode Muse Spark 500 Internal server error

### 现象
DSH 选 Muse Spark 1.3 Xhigh 五次重试都是 `500 Internal server error`。同 hop 打 `muse-spark-*-contributor-free` completions 500；直连 Zen `/zen/v1/responses` 200。

### 根因
`proxy.ts` 把 OpenCode 全家转发到 `/zen/v1/chat/completions`，`/opencode/v1/responses` 还 501。Zen 文档把 Muse Spark 放在 `/zen/v1/responses`。

### 修复
`isOpencodeResponsesModel` 认 `muse-spark*`。Completions hop 把 chat body 译成 Responses 打 Zen `/v1/responses`，再译回 chat.completion。`POST /opencode/v1/responses` 对 Muse 不再 501。

## 2026-09-03：额度失败红字撑破账号卡

### 现象
Kimi 卡「额度读取失败」把 429 JSON（`resource_exhausted` / protobuf details）单行贴出，红字冲出卡片右缘。

### 根因
`QuotaBlock` 原样拼接 `quota.error`。`.osubs-hint` 不换行。上游 body 是无空格长 JSON。

### 修复
解析 `error.message` / `message` / `code`，截首行 ≤160。`.osubs-hint` / `.osubs-bad` `overflow-wrap: anywhere`。全文只留 `title`。

## 2026-09-03：OpenCode Free picker 全是 text、没有思考档

### 现象
8 个 live `*-free` 在 DSH 里都是 `input: ['text']`、无 `reasoningEfforts`。muse / mimo 实际能图，laguna / deepseek / muse 有 effort 档。

### 根因
Zen `GET /zen/v1/models` 只有 `{id,object,created,owned_by}`。能力在 models.dev `opencode.models`。目录没 overlay，又不敢写 `reasoningEfforts: false`。

### 修复
Zen 定 id，models.dev overlay 窗口 / `text|image` / effort 图。空 options + reasoning 省略字段。有图才 stamp Completions `compat`。hop 只发顶层 `reasoning_effort`。

## 2026-09-03：OpenCode Free 空 roster 未登录，settings 没有 oauth-opencode

### 现象
plugin 0.0.68 重启后 `POST /opencode/v1/chat/completions` 500 `OpenCode Free is not logged in`。`auth.json` 无 `opencode`，`settings.yaml` 无 `oauth-opencode`，用户无法选模型或对话。

### 根因
匿名 Zen 仍要先点 Settings「启用免费模型」才写哨兵并 sync。空 roster 不自动启用。Completions 行 `reasoningEfforts: false` 可能让 DSH 丢掉整段 mutate。

### 修复
空 roster 在 start / snapshot / sync 写 `opencodeSession()` 并 `syncHarnessModels`。不覆盖已有 session。hop 仍不带 Authorization。省略 `reasoningEfforts`，不 stamp Completions `compat`。

## 2026-09-03：OpenCode Free 带 Bearer 会 401；硬编码目录 delist 后仍 401

### 现象
匿名 `https://opencode.ai/zen/v1` 打 `*-free` 带任意 Authorization（空串、哨兵 `anonymous`、过期 Zen key）都 401。硬编码 `hy3-free` 在目录轮换后 picker 仍 401。

### 根因
Hermes `opencode-free` 把 SDK Bearer 盖成空头。本插件 hop 若转发 store 哨兵同样 401。Zen 免费档会 delist。`ox-alpha-free` 看起来免费但是 Go 订阅。`big-pickle` 只给官方 CLI UA。

### 修复
store 哨兵 `anonymous` / 空串 / 过期 Zen key 不当 Bearer。官方无 key 是 `Bearer public`（见上条 session 头）。live `GET /zen/v1/models` ∩ 官方 Free 白名单，不含 hy3-free / Go keyed。

## 2026-09-03：Ollama 周模型 note 一行溢出

### 现象
Weekly 下 `glm-5.3-flash × 1317 · web search × 3 · web fetch × 2` 挤成一行溢出。

### 根因
`ollamaModelsNote` 用 ` · ` 拼一条。`span.osubs-note` 不换行。

### 修复
每条 `name × count` 换行。`.osubs-note` `white-space: pre-wrap` + `overflow-wrap: anywhere`。web search / web fetch 保留。

## 2026-09-03：tab 栏右侧空白 / 两胶囊对不齐

### 现象
OAuth 和 Models/GitHub 两胶囊贴左边后，整条 tab 右侧还有一大块空白。icon 挤在 36px 格子里。

### 根因
`.osubs-tabs` `width: max-content` + `flex: none`，8×36 不吃剩余宽度。更早是 nav `space-between` / util `margin-left: auto` 把第二胶囊推到最右。

### 修复
两胶囊保留，nav `flex-start` + `gap: 4px`。OAuth 胶囊 `flex: 1 1 auto`，`repeat(8, 36px)` + `justify-content: space-between`，剩余宽度进 8 个 icon 之间。util 仍 36px。空态 OpenCode 主按钮是「启用免费模型」，不是「登录」。

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
Responses 形 `call_…|fc_…` 超 64 且含 `|` → AWS 400。picker 仍是静态表，缺 Auto / `claude-fable-5`。思考事件写成 `<thinking>` 进 `content`。（月度额度那一项已移到 09-28 条。）

### 根因
翻译层 + 离线目录。hop 仍是 `q.<region>.amazonaws.com` `GenerateAssistantResponse`，不是 `runtime.*.kiro.dev`。

### 修复
非法 id 稳定 remap 成 `tooluse_<32>`（use/result 同一函数）。登录后 `ListAvailableModels`（空/403 再探 us-east-1 / eu-central-1）。thinking → `reasoning_content`。GPT-5.6 Sol/Terra/Luna 不删。

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
最小编码器 + Node `http2`。**改线后对照社区协议与 `@cursor/sdk` 再改 `src/oauth/cursor/`**，不要从别的家族抄 cache / hop。指纹钉 `x-cursor-client-version: cli-2026.07.23-e383d2b`。

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
搜索路径最前加 `~/.zcode/v2/config.json`。多钥匙优先 **可用** coding-plan，非 JWT 压过 JWT（start-plan JWT 后按体验套餐不支持处理）。不读加密 `credentials.json`。

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

## 2026-09-04：Grok 缓存命中率卡在 ~70%，热身后反复出现 512 token 块

### 现象
多数步 ~99% 复用，中间几拍 `cacheReadTokens` **正好 512**、命中 <1%，下一拍立刻回到 ~99%。加权被拉到 ~70%。只带 `x-grok-conv-id` 后长会话仍会掉下来。

### 根因
xAI prompt cache **按服务器分片**（粒度 512），粘性头是 grok-build 整套：`x-grok-conv-id` / `x-grok-session-id` / `x-grok-req-id` / `x-grok-model-override`（body 等价 `prompt_cache_key`）。不带粘性就打到只有全局系统前缀的机器。同时 grok-build Responses 要求下一次 **byte-for-byte** 重放 `input`；DSH 每步把 snapshot 插到 `input` 最前。分析器若只认 `cacheReadTokens === 0` 会把 512 块误判成 `prefix_break`。

### 修复
完整 grok-build sticky 头（**仍然不**发送 Codex `session-id` / `x-client-request-id`）。每个 conv 钉第一次 system/developer，增量 snapshot 挂 **input 后缀**。`prompt_cache_key` 默认 conv id。分析器：512 + 复用 <10% = `affinity_miss`。健康：加权 ≥80%，亲和丢失 0。

## 2026-09-05：本地 DSH Codex 缓存命中率异常偏低

### 现象
长会话加权命中约 27%。同一会话不能稳打到同一缓存分片；退出 plan / header 重建时 leading developer 顶掉已缓存前缀。

### 根因
转发丢掉 `session-id` / `thread-id` / `x-client-request-id`。Codex CLI 0.153.4 `build_session_headers` 同时发 session（prompt cache）和 thread（粘滞）；chatgpt.com 按前者命中前缀、按后者粘分片。DSH 多出来的 leading developer 留在 `input` 开头会 bust。

### 修复
`session-id` = `thread-id` = `x-client-request-id` = `prompt_cache_key`（DSH 一轮对话就是一条 thread；可回退 `session_id`）。同一 DSH 请求的重试回放 `x-codex-turn-state`。剥与 `instructions` 重复的 leading developer/system，多余文本停到 **input 后缀**。剥 `prompt_cache_retention` / `prompt_cache_options`。Grok 不继承这套头。压缩 / plan 重建零缓存不是分片丢失。健康：加权 ≥80%，**亲和丢失 0**，无 TRANSPORT。

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

## 2026-09-26：桌面端中文设置下插件仍显示英文

### 现象
DeepSeek Harness 语言已选中文，OAuth 订阅页仍显示英文。

### 根因
插件只读 `navigator.language`；桌面端语言设置同步到 `<html lang>`，可与系统语言不同。

### 修复
优先读取宿主页面的 `document.documentElement.lang`，空值时才回退浏览器语言；日期也用该语言格式化。

## 2026-09-26：OpenCode Go 旧 cookie 失效后额度空白

### 现象
桌面端显示 `OpenCode Go cookie is invalid or expired`，但 Console 网页仍可看额度。

### 根因
本地只存旧 `auth` cookie；额度刷新只允许 cookie，忽略仍有效的 API key。

### 修复
cookie 缺失或读取失败时用 API key 的 `/zen/go/v1/usage` 读用量百分比与重置时间；账号仍可显示额度。

## 2026-09-26：OpenCode Go 账号显示密钥尾号

### 现象
额度已恢复，账号卡片仍显示 `…CBk5`，无法分辨账号。

### 根因
只有 API key 的账号没有邮箱；Go 用量接口也不返回身份，界面退回密钥尾号。

### 修复
账号卡片增加「修改名称」；本地保存显示名称并优先用作标题，不改 API key 或额度。

## 2026-09-26：OpenCode Go 已勾选模型没有进入 DSH

### 现象
插件模型页已勾选 OpenCode Go，DSH 提供商列表仍没有对应路由。

### 根因
路由同步用不存在的 `settings.get()` 读取宿主配置，收到 `unreadable` 后静默跳过。

### 修复
改用 DSH 的 `settings.describe()` 读取现有配置；有 Go key 时读不到配置，或写入失败时向界面报错。

## 2026-09-26：部分家族的离线模型目录滞后

### 现象
OpenCode Go 少 GPT-6 Luna / Space Bunny Free；Cline 少 3 条当前免费模型；Ollama 离线目录仍列 3 条云端已消失的 ID；Cursor 回退参数与活目录不一致，活目录还把 Max Mode 窗口计入普通行。

### 根因
静态快照停在 9 月 23 日或更早；登录活发现覆盖不了离线、失败和未登录时的 picker；Cursor 归并活目录时取了所有变体的最大窗口。

### 修复
按各家公开/账号目录更新静态目录，Cursor 活目录优先取非 Max 变体窗口，Go 新增两行用当前 key 验证协议与思考档；其余家族审查结果见 `docs/model-audit-2026-09-26.md`。

## 2026-09-26：OpenCode Go 额度刷新可能永久挂住（10s 超时被提前解除）

### 现象
只存 API key 的 OpenCode Go 账号，额度刷新偶尔一直不返回，卡片停在加载状态。

### 根因
`fetchOpencodeGoQuota` 的 key 分支写成 `return fetchKeyOpencodeGoQuota(...)`，`try/finally` 立刻执行 `clearTimeout`，`AbortController` 再没人 abort，10s 超时形同虚设。

### 修复
key 分支改成 `return await ...`，与 cookie 分支一致，超时期间 abort 真正生效。

## 2026-09-26：RPC 路由可被 body.method 改写成任意特权方法

### 现象
向任意已注册路径（如 `/api/oauth-subs-auth/status`）POST 时带上 `method` 字段，即可调用 `key` / `logout` / `proxySet` / `import` / `reset` 等特权方法，绕过按路由绑定。

### 根因
fetch 路由处理器优先取 `body.method` 而不是注册时的路由名，`dispatch` 又只按方法名查表，等于把方法选择权交给请求体。

### 修复
始终用路由自身的 `name` 派发；UI 本来就按 `/oauth-subs-auth/<method>` 调用，不需要 body 里的 method。

## 2026-09-26：Devin 收到 temperature/top_p = null 时被当成 0

### 现象
OpenAI 客户端把未设置的 `temperature` / `top_p` 传成 `null` 时，Devin 实际下发 0；`top_p=0` 让采样退化到只剩最高概率 token。

### 根因
`Number(null)` 与 `Number('')` 都等于 0，而 `Number.isFinite(0)` 为真，「未设置」被判成合法数值，默认值 0.4 / 1 被跳过。

### 修复
新增 `numericOr`：只接受真正的有限数字或非空数字字符串，null/undefined/`''` 一律回落默认值，显式 0 仍保留。

## 2026-09-26：analyze-session --fail-below 在管道里丢报告

### 现象
`npm run analyze -- --json --fail-below N` 接管道或重定向时，命中率不达标就退出，报告被截断甚至完全丢失。

### 根因
`process.exit(1)` 紧跟异步 `process.stdout.write`，管道场景 stdout 是异步缓冲，exit 先终止进程。

### 修复
改成 `process.exitCode = 1` 并 return，让进程自然退出把缓冲刷完。

## 2026-09-26：三家流式响应在客户端断开后挂死（Antigravity / Kiro / Cursor）

### 现象
客户端中途断开后转发循环停在 `once(response, 'drain')` 永不返回，上游连接一直被占住；上游读取失败时既没有 SSE 错误事件也没有 `end()`，客户端一直挂着。

### 根因
被销毁的 response 只会发 `close`/`error`，永远不发 `drain`，单等 `drain` 就是无限等待；Antigravity 读循环外层没有 try/finally，Kiro/Cursor 的 catch 里写错误事件本身还会再抛。

### 修复
三家写路径统一改成 `waitForDrain`（drain/close/error/abort 竞速，断开即抛）；Antigravity 读循环补 try/finally 释放 reader，Kiro/Cursor 的错误上报改成不可抛。

## 2026-09-26：几处请求超时形同虚设或干脆没有

### 现象
Cline 额度的 plan/caps 偶尔静默丢失；Kiro 模型发现可能永久卡住；插件自更新下载卡死时一直不返回。

### 根因
Cline 的 `planWait` 在顺序执行的 `me` 请求之前就启动，慢 `me` 吃光 plan 预算且 abort 被 `.catch(() => undefined)` 吞掉；Kiro `requestManagement` 与 `update.ts` 的 tarball 下载都没有 AbortSignal。

### 修复
Cline 把 `planWait` 挪到真正发请求前（各自独立预算）；Kiro management 调用加 15s 上界；tarball 下载加 60s 超时并在 finally 清理计时器。

## 2026-09-26：模型目录缓存按引用外泄（含刷新成功路径）

### 现象
调用方对 `*CatalogModels()` / `refresh*Catalog()` 的返回值做 `.sort()`/`.push()` 会污染进程级缓存，之后所有读取都拿到被改过的目录。

### 根因
`return cached.models` 与刷新成功路径的 `return parsed` 直接把内部数组引用交出去（只有静态回退路径做了拷贝）。

### 修复
所有返回点改为返回副本（ollama / kimi / kiro / copilot / cline / cursor 六家，含 cline 与 copilot 的刷新成功路径）。

## 2026-09-26：Copilot 401/403 重试丢掉会话来源与 refresh token

### 现象
paste/env/cli 来源的 Copilot 会话碰到一次 401/403 后语义变成 oauth（来源标签、密钥过期处理都变），且 GitHub 未轮换 refresh token 时旧值被丢弃。

### 根因
catch 分支硬编码 `source: 'oauth'`，`refreshToken` 只取 `rotated.githubRefreshToken ?? rotated.githubToken`，没有像主路径那样回退 `session.refreshToken`。

### 修复
catch 分支对齐主路径：source 保留 cli/paste/env，refreshToken 回退 `session.refreshToken`。

## 2026-09-26：Kimi 思考档门禁恒真，以及掩码 / 导入 / 前缀四处小故障

### 现象
Kimi 的 per-model 思考能力判断被架空；OpenCode Go 把界面掩码 `••••••••` 存成真 cookie；导入时一个不可读的候选文件会中断整轮多路径搜索；Cline 存成 `Workos:` 的前缀原样带进请求。

### 根因
`Object.values(KIMI_REASONING).includes('off')` 是编译期常量恒真；`parseOpencodeGoCookie` 没用已有的 `isOpencodeGoCookieMask`；`readJson`/`readPrivateText` 只容忍 ENOENT；前缀判断用小写比较却返回原串。

### 修复
删掉恒真项；掩码直接拒绝；导入候选读取失败视为「此路无会话」继续下一个；前缀大小写归一。

## 2026-09-26：typecheck-ratchet 三处漏判

### 现象
ratchet 可能在类型检查实际失败时报「0 errors」通过；非定位型诊断（坏配置、全局错误）完全不计入；入口判断在 Windows 上永不成立，脚本被 import 时还会执行 main。

### 根因
只检查 `spawnSync` 的 `result.error`（仅覆盖 spawn 失败），不看 tsc 退出码；正则只匹配 `file(line,col): error`；用 `file://` + `process.argv[1]` 手拼 URL 比较。

### 修复
tsc 退出码非 0/1 直接抛错；非定位型 `error TS` 计入 `<global>`；改用 `pathToFileURL(process.argv[1]).href`。

## 2026-09-26：四个登录流程管理器可被并发 start() 绕过占用检查

### 现象
双击「登录」或界面重试时，同一 provider 会同时起两次登录：两个回调监听端口（OAuthFlowManager）或两次 device 注册；先 settle 的那个把另一个的占用记录删掉，后一个成了无人认领的泄漏。

### 根因
`attempts.has(provider)` 检查与 `attempts.set(provider, attempt)` 之间隔着 `await`（listen / glmCliInit / device-code 请求 / registerKiroOidcClient），守卫在这段时间里不是原子的。

### 修复
四个管理器（flow.ts、glm/cli-flow.ts、grok/device-flow.ts、kiro/idc-flow.ts）新增 `starting` 预留集合：守卫改为 `isBusy()`（含 starting），首个 await 之前先占位，注册成功后释放、失败路径清理；补两条并发回归测试。

## 2026-09-26：三处「没有上界」的增长/扇出

### 现象
Ollama 云目录刷新会对每个模型同时发一个 `POST /api/show`（20+ 行就 20+ 并发），易被上游限流；Grok 设备码 `expired_token` 重启没有次数上限；Devin 的 `userJwtCache` 只写不清，长驻宿主按 session 无限增长。

### 根因
`applyOllamaShowWindows` 用无上限 `Promise.all` 扇出；`restartOnExpired` 每次都重置 deadline；`userJwtCache` 只在重新铸造时覆盖，没有容量上限。

### 修复
`/api/show` 按 4 个一批分批；Grok 重启上限 3 次；Devin 缓存上限 16 条（FIFO 淘汰，未命中重铸即可）。

## 2026-09-26：未消费的响应体把 socket 占住

### 现象
Cline 信用额度账号的 plan/limits 404 与 Devin 401 重试路径都不读 body，undici 下未读 body 会一直占着 socket，反复刷新额度会耗尽连接池。

### 根因
`.then((response) => response.ok ? response.json() : undefined)` 在非 ok 时既不读也不 cancel；401 重试前也没释放被拒的响应。

### 修复
Cline 加 `drainBody(response)`（`body.cancel()`）用于两条 404 路径；Devin 重试前 cancel 掉 401 的 body。

## 2026-09-26：sendJson 遇到不可序列化 body 直接崩 / codex 缓存头不校验控制字符

### 现象
`sendJson(response, status, undefined)` 或循环引用时，`JSON.stringify` 返回 `undefined` 或抛错，`Buffer.byteLength(undefined)` 在 writeHead 之前就崩，客户端拿不到任何响应；`codexCacheHeaders` 只检查非空字符串就把值塞进三个 HTTP 头。

### 根因
缺少「不可序列化」兜底；缺少 header 值控制字符校验。

### 修复
`sendJson` 对 string/其它分别处理并 try/catch，失败回落 `'null'`；`codexCacheHeaders` 命中 `[\u0000-\u001f\u007f]` 直接返回 `{}`。

## 2026-09-26：OpenCode Go 额度兜底分支：双份超时预算 + 同类漏 await

### 现象
cookie 链路失败后走 key 兜底时，最坏耗时可接近两倍超时；且该分支同样可能永久挂住。

### 根因
兜底新建了 `AbortSignal.timeout(timeoutMs)`（第二份预算），并且写成 `return fetchKey...`——外层 `finally` 立即 `clearTimeout`，和之前修过的 key-only 路径是同一个漏 `await`。

### 修复
复用外层 `ac.signal` 并改为 `return await`，整次调用只吃一份预算。

## 2026-09-26：flow 注册失败不释放已绑定的回调端口

### 现象
`listen()` 成功后若 `spec.buildAuthorizeUrl()` 抛错，回调监听端口与超时计时器都不会释放。

### 根因
注册失败路径只清理了预留位，没有关掉已经绑定的 server。

### 修复
失败时 `server.close()` + `closeAllConnections()` + `clearTimeout(timer)` 后再抛。

## 2026-09-26：Antigravity 同一个 $ref 被引用两次时解析不完整

### 现象
工具 schema 里同一份定义被两个位置 `$ref` 时，第二处仍带着未解析的 `$ref` 发给上游。

### 根因
`dereferenceSchema` 的 `visited` 同时当环检测与「已处理」备忘录用，第二次遇到同一对象直接原样返回。

### 修复
`visited` 改为只记录当前递归路径（`finally` 中 delete），重复引用照常解析，真正的环仍被拦住。

## 2026-09-26：Devin 的 devin-session-token$… 被当成显示名

### 现象
形如 `devin-session-token$eyJ…` 的不透明 id 没被 `isDevinOpaqueAccount` 拦住，会当作显示名露到界面上。

### 根因
只匹配了 `devin-team$…`，而 session token 形态里 `$` 前面是 `devin-session-token`。

### 修复
模式放宽为 `/^devin-[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/i`，覆盖两种形态。

## 2026-09-28：Command Code 新家族接入 + 活测收口

### 现象
新增 `command-code`（`src/apikey/command-code/`）。归因自 npm `command-code@1.66.0` bundle：推理唯一入口 `POST api.commandcode.ai/alpha/generate`，AI-SDK 风格 JSONL 事件流，**不兼容** OpenAI/Anthropic/Responses 任一闭集；hop 做成翻译层（`request.ts`/`transport.ts`），不做薄透传。

### 根因 / 钉住的协议点
- 登录两条：浏览器（`commandcode.ai/studio/auth/cli` → loopback `:5959-5968/callback`）回调**直接带** `apiKey/userId/userName/keyName/state`，无 code 交换——`flow.ts` 加了 `spec.collect` 钩子承接凭据包；API key 走 `COMMAND_CODE_API_KEY` → `~/.commandcode/auth.json`（与 CLI `getCommandAuthKey` 同序）。
- `threadId` 是会话亲和键，非 uuid 会被上游丢——cache.ts 对非 uuid 的 DSH 键做 sha256→uuid v5 推导，缺省回 `dsh-command-code:<model>` 常量种子。
- 目录无 `/alpha/models`，静态 82 行取自 bundle 注册表 `uD`（剔 hidden/别名），effort 拼写逐模型取 `kr` 表。
- 额度四端点与 CLI `fetchUsageData` 同序；`windowLimits.{fiveHour,weekly}` 为 null（账号未限速）时不产行，credits 全零且无订阅时 credits 行隐藏（CLI 同款）。

### 活测结论
真 key（`xxww0098` 账号）实测：`whoami`/`credits`/`subscriptions`/`usage/summary` 全 200，身份正确提升为 `xxww0098`；`generate` 请求过了形状校验、在计费门拿 402（该账号 0 额度、无订阅）——wire 已验证到计费校验层，完整对话需有额度的账号再验。单测 19 条 + 全量 778 绿。

## 2026-09-28：会话 zstd 只解出第一帧 / 基线把 v3、v4 双份会话算两遍

### 现象
`zstdDecompressSync(buf)` 解 `~/.dsh/sessions` 只得到 120 KB（实际 1.16 GB，496 个文件全是多帧，最多 5647 帧）；原型基线把同一会话的 `session.jsonl.zstd` 与 `session.v3/v4.jsonl.zstd` 各算一遍，oauth-ollama 命中率少算 3.5pp，grok 300s 超时多算 3 次。

### 根因
DSH 每次追加写一个独立 zstd 帧，Node 的一次性解压只解第一帧；原型按文件而不是按 `session.id` 统计。

### 修复
`analyze-session.ts` `decodeSessionBuffer` 按 `{ info: true }` 的 `engine.bytesWritten` 逐帧前进，截断的尾帧丢弃；目录模式同一 `session.id` 只留最高 `version`。全量 496 个文件与 `zstd -dc` 逐行一致，基线见 `specs/request-path-upgrades/assets/baseline-30d.*`。

## 2026-09-28：Kiro 会话 TPS / 缓存命中率全空

### 现象
`oauth-kiro` / `claude-opus-5.5` 会话 49 次调用，37 次 `outputTokens: 0`，全部没有 cache 字段；analyze 报 `REGRESSION affinity-miss 48`，界面没有 TPS 与命中率。

### 根因
现场 wire 没有 `metadataEvent.tokenUsage`，走 `contextUsageEvent` 兜底；兜底输出只按可见 `content` 字数估，思考与工具参数不计，思考 + 工具步骤恒为 0。analyze 把「上游不给 cache 字段」当成亲和失效。

### 修复
`resolveKiroUsage` 兜底按 正文 + 思考 + 工具参数 估输出（流式 / 非流式同一口径）；analyze 在所有调用都没有 cache 字段时报 `UNMEASURED`，不再算 affinity-miss。Kiro 真实命中率仍不可测，直到上游下发 tokenUsage。
