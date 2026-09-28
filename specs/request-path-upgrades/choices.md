# 实施中的自主决定（choices 账本）

spec 没写到、由实施者自己拍板的决定。每条：决定 → 理由 → 结论（sound / provisional / user）。
最终收尾时按最终代码重写本文件。

## 编排

- **在 `rpu/integration` 集成分支上实施，不碰 `main`。** 维护者的 WIP（约 60 个文件，含 Command
  Code、donate、Anthropic 导入只读修复）仍未提交且在持续改动；用户选择「自己提交」后又指示
  继续。所以各 slice 从 HEAD（48b78b8）+ spec 提交分支，合进 `rpu/integration`，由维护者在
  WIP 落地后 rebase/合并。→ provisional（user）：WIP 与 `controller.ts`、`proxy.ts`、
  `client.ts`、`models.ts`、`quota.ts` 必有冲突，需维护者合并时处理。
- **依赖 WIP 的部分暂缓**：05d（Command Code 源码只在 WIP 里）、08 的 Command Code 部分、07 的
  Anthropic 迁移（`#refreshAnthropic` 只在 WIP 里）。→ provisional，WIP 落地后补。

## 02a

- **错误行放在主栏 `.osubs-pane` 顶部**（与现有 RPC 错误提示同款 `.osubs-hint.osubs-bad`），
  因为 `client.ts` 没有「出站代理区域」，只有 `proxyGet`/`proxySet` RPC。→ sound。
- **死端口也进 `snapshot().error`**：代理 URL 能构建、但连不上时，记录最近一次代理路径失败，
  下次成功或 `setUrl` 清掉；否则 spec 要求的 `HTTPS_PROXY=http://127.0.0.1:9` 在设置页看不到。
  → sound。
- **代理路径上除中止外的失败都包成 `outbound proxy unavailable: <detail> via <脱敏代理>`**；
  中止原样抛出，保留代理的中止处理。→ sound。
- **`close()` 后如仍配置了代理，`error = 'closed'`**：迟到的请求失败而不是直连。→ sound。
- **`setUrl` 的构建错误原样抛给调用方**，不包装。→ sound。

## 01

- **时间窗按事件自身时间戳 `[since, until)` 计**；mtime 早于 `since` 的文件直接跳过。→ sound。
- **多版本去重**：版本取 `session` 事件的 `version`，缺失时取文件名 `.vN.`；无 id 的会话按路径作键。→ sound。
- **解析失败的文件计为 unreadable 并跳过**（当前数据 0 个），不中断整次运行。→ sound。
- **`idleTimeout300` / `proxyExhausted` / `proxy504` 同时计入被重试的和终态的失败**：每次都真实付出了等待。→ sound。
- **`poolIdle` = 请求开始 − 同 provider 在它之前最近一次成功响应结束**（不是「上一请求结束」）：并发子代理让后者对 codex 失去意义。→ sound。
- **失败消息额外脱敏**：家目录/tmp 路径 → `<path>`，长字母数字 id → `<t>`（真实消息里有 `/Users/...` 和 `req_…`）。→ sound。
- **不屏蔽 zstd 的 ExperimentalWarning**：Node 24.21 / 26.8 都不打印。→ sound。
- **ttfb 检查点未触发**（最大 p99 = oauth-ollama 72.5s），但 oauth-ollama 有 38/7134（0.53%）次成功调用首字节 >120s（最长 297s），04 会把它们切断重试。spec 15 只给 Devin 预设了放宽规则。→ provisional：交给 15，按 Devin 同款规则（>0.5% 且基线成功）评估 Ollama。

## 02b

- **配置后 `outboundFetch` 先等 prefs 加载（`ready` 必然 settle）再路由**；只有从未调用
  `configureOutbound` 时才直接走直连 Agent。spec 写「加载完成前走直连」，但那会让早期请求
  绕过设置文件里保存的代理。→ sound（比 spec 更严，守住「绝不悄悄直连」）。
- **NO_PROXY / 回环只约束 Cursor 的「出站代理回落」**；显式 `cursorProxy` / `PI_CURSOR_PROXY` /
  `CURSOR_PROXY` 原样使用（保持现状，现有隧道测试经显式代理拨 127.0.0.1）。→ sound。
- **保留 `createOutboundSession` 作为 `configureOutbound` 背后的工厂**，冻结的 repro 仍能跑。→ sound。
- **`close()` 后会话仍是 current，直到新实例 `configureOutbound` 替换**：迟到请求失败而不是直连，
  热重载顺序无关。→ sound。
- **每个会话自带直连 Agent，`close()` 两个一起释放**。→ sound。
- **`outboundProxyFor` 是 async（等 prefs）**；`cursorH2Connect` 本来就是 async。→ sound。
- **Cursor 目录缓存键改用实际出口（`cursorEgressProxy`）**：换出站代理后按区域重拉目录。→ sound。
- **10s 连接超时也覆盖经代理隧道的会话**（隧道内 TLS 同样会挂）。→ sound。
- **防火墙额外拦 `?? fetch`、`|| fetch`、`globalThis.fetch`、`require`/`import('undici')`**。→ sound。
- **Cursor 区域错误提示仍只看 `cursorUpstreamProxy()`**，建议配 `cursorProxy` 依然成立，未改。→ sound。

## 03

- **夹具只存真实前导帧（Codex 2950 B / Grok 2034 B，脱敏），测试加载时把 `instructions` 补到 200 KiB**；
  delta / done 帧由测试合成。实测 `instructions` 只有 20 B，把 400 KB 的填充提交进仓库没有信息量。→ sound。
- **额外脱敏 `id`、`prompt_cache_key`、`safety_identifier`**（账号/会话派生）。→ sound。
- **扫描器用 latin1 保存帧尾**，字节数精确，帧完整后才按 UTF-8 解码；每次 push 只从旧尾部倒数 3 字节开始找分隔符。→ sound。
- **未完成帧的字节不计入 64 KiB 上限**，只受 2 MiB 总量约束：否则一个正在到达的 128 KB `response.created` 会强制提交。→ sound。
- **流结束时没有空行收尾的最后一帧不分类**：前导后跟它仍会重试，与 SSE 客户端丢弃未终止事件一致。→ sound。
- **`MAX_PREAMBLE_BYTES` 改名 `MAX_UNCLASSIFIED_BYTES`**；`CommitGate` 多收一个 `family` 参数给 2 MiB 日志用。→ sound。
- 活测：Codex、Grok 前导都是 `response.created` → `response.in_progress` → 首个输出 `response.output_item.added`，都带 `event:` 行，无新前导类型。

## 06

- **20s 换票等待保留，但只是单次请求的等待上限**：超时计为失败（触发 10s / 5min 退避）并把该次换票标为「迟到」，换票本身不再超时，最长占位 120s。→ sound。
- **同版本的等待者加入进行中的换票**（上限内），而不是立即失败。→ sound。
- **迟到的失败照常记录**，由下一次按时的尝试决定是否删号。→ sound。
- **上游 401 触发的 `/v1` 强制刷新跳过两种退避**（沿用现状），但仍不能在未决换票期间发起第二次。→ sound。
- **错误码只读 `error.oauthCode`**；`oauthCodeOf` 同时认对象形态 `{error:{code}}`（Codex 的额外码需要）。→ sound。
- **只有 Codex 有 `extraCodes`**（`refresh_token_expired` / `reused` / `invalidated`）；GLM、Ollama 的刷新从不抛带类型错误，无额外码。→ sound。
- **Antigravity 改用共享 `oauthError`，删掉它的 validation-required 例外**（那些响应是 403，本来就算临时）。→ sound。
- **随新规则而来的行为变化**：Grok 也把 401 / `invalid_client` / `unauthorized_client` 算永久；Kiro social 端点若只在消息文本里说 refresh token 失效且状态非 401，现在按临时失败每 10s 重试，而不是删号。→ provisional：Kiro 若出现「永远刷新失败但不删号」的循环，按 06「会改变本 slice 的反馈」把真实错误码加进 Kiro `extraCodes`。
- **Devin 聊天路径错误上的 `permanent`（仅 401）保留**，虽然刷新判定之外没人读它。→ provisional：整 spec 审查时确认是否删除。

## 08

- **`buildProviders` 末尾一个循环给所有 Completions 路由加 `cacheRetention: 'long'`**，新路由自动带上。→ sound。
- **「上游不带 `prompt_cache_key`」只约束 Completions 家族**；Codex / Grok 本来就刻意上送。`prompt_cache_retention` 对所有家族都剥离（现状如此）。→ sound。
- **`/health` 计数是模块级的**，不是每个 proxy 实例一份（避免给 `rewriteUpstreamBody` 加参数、动 5 个调用点）；热重载重新导入模块会清零。→ sound。
- **只有非空字符串算「带 key」**；所有家族都计数。→ sound。
- **持久化校验严格比对**：存储值必须与写入值完全一致（非 Completions 路由必须没有该字段）。→ sound。
- DSH 会话 id 形如 `session-<uuid v4>`（44 字符）；Command Code 的 `toWireThreadId` 会丢掉它，WIP 落地后在 `command-code/cache.ts` 用去前缀或 UUIDv5 做稳定映射。→ provisional（依赖 WIP）。

## 14

- **合并 promise 存在私有 `#snapshotRun`，`snapshot()` 包 `#buildSnapshot()`**。→ sound。
- **改动类 RPC（切换账号、模型开关）调 `snapshot(true)` 开新一轮**，后续轮询加入新一轮；被取代的旧轮 settle 时不清掉新轮。子代理原实现会让改动后的 RPC 拿到改动前的名单（集成审查发现并修复，有回归测试）。→ sound。
- **身份发现节流表**：私有 `Map`，键 `provider\0accountId`，窗口复用 `quota.ttlMs`；构造器包一层 `onAuthChanged` 清表，不改调用点。只把仍缺名字的行计入节流。→ sound。
- **主面板从隐藏回到可见时，下一个 tick（≤1.5s）才刷新**，只有窗口级 `visibilitychange` 立即刷新。→ sound。
- **轮询间隔仍是 1.5s**（登录流程状态需要），额度来自 60s 缓存。→ sound。
- **额度拉取失败同样等满 TTL** 才重试；手动「刷新额度」立即重试。→ sound。
- **OpenCode Go 自己的额度 TTL 也从 10s 改到 60s**。→ sound。
- **`checkVisibility()` 对宿主保留的隐藏主面板是否有效：未验证**（需在运行中的宿主里看 DevTools）。→ provisional：合入主干后验证，无效则按 spec 改 IntersectionObserver。

## 09

- **保留 `antigravitySessionIdOf` 这个名字**（`sessionId` 是它的线上字段名），不改成 `<fam>ConversationId`。→ sound。
- **kiro / cursor / antigravity 解析器保留可选的 `explicit` 第二参数**，构建器把传输层的 id 经它传入。→ sound。
- **谓词把空 / 缺失 id 也算回退**。→ sound。
- **「显式改推理强度」= 非空且不同于已 pin 的 `reasoning_effort`**；省略时保持 pin。原测试期望「无 effort → low 仍保持 pin」，已改写。→ sound。
- **`isDevinFallback` 导出但源码不调用**（Devin 没有 pin），只为各家族契约统一、供测试用。→ provisional：整 spec 审查时判断是否删掉。
- **Devin 无 id 时 `applyDevinCache` 返回 `dsh-devin:<model>`**（原为 `undefined`）；`devinCascadeId(payload)` 改为哈希 `devin-<key>`，删掉「已是 UUID 就直通」；代理路径的 cascade id 不变，只影响不传 `cascadeId` 的直接调用方。→ sound。
- **防火墙按行扫描**：同一行上时钟/随机调用与会话 id 词或 `*SESSION*` 常量共现即失败；扫描所有 `cache.ts` 和导出 `*Headers(` 的模块（全源码扫描噪声太大）。→ sound。
- 活测：唯一已登录的 GLM 账号在 bigmodel 区，请求经 ZCode 网关（`zcode.z.ai`）而不是 Z.ai 直连；`x-session-id: dsh-glm` 回 200。Z.ai 直连未验证。→ provisional：有 Z.ai 账号时补一次。

## 11

- **测试真等 6s，不注入更短的超时**：间隔必须超过 undici 固定的 4s 回落才有意义，缩短就不诚实；因此 `createOutboundSession` 不加超时参数。→ sound。
- **代理路径用本地 CONNECT 代理 + 非本地主机名测试**（本地地址总是绕过代理）；同一次运行里放一个全局 `fetch` 对照组（得 2 个连接）。→ sound。
- 活测：Codex `GET /models` 在 0s/30s/55s 共用 1 个连接，后两次快约 0.8s。

## 04

- **`upstreamRequest` 多收一个 `response`**（只读 `headersSent`，作为 `committed()` 的提交点）。→ sound。
- **`run` 不等传输层自己察觉超时**：忽略中止信号的 hop 也会按时放弃；`attemptUpstream` 每次 read 后检查尝试是否已中止，迟到的 read 不会到达客户端。→ sound。
- **hop 抛出的未识别错误一律算可重试的传输故障**；刻意抛出的 `RequestError`（含 `LoginRequiredError`）从不重试。→ sound。
- **`UpstreamFailure.code` 取 `transport | timeout | http | quota`**，另加 `retryAfterMs` 以继续转发 `retry-after-ms`。→ sound。
- **非流式的「还能否再试」同样预留 120s**，尽管它的首字节窗口是剩余预算。→ sound（保守）。
- **最终状态码**：最后一次失败是超时 → 504，否则 502 +「failed n times」（预算太短没重试时也会出现「failed 1 times」）。→ sound。
- **GLM 网关回退在同一次尝试内完成**；401 刷新重试沿用同一尝试序号（Grok `retryAttempt` 头不变）。→ sound。
- **Cline 额度回复不带 `retry-after`**（宿主不重试额度错误）；只匹配顶层 `payload.code === 'INFERENCE_CAP_ERROR'`。→ sound。
- **repro 用 2s 首字节 / 5.5s 预算**而非等比缩放（退避不缩放），保持「第二次塞得下、第三次塞不下」的形状。→ sound。
- **人工检查点「未登录 → 403 在 DSH 里怎么显示」未做**：需要真实宿主，而宿主加载的是 `main`。→ provisional（user）：合入主干后看；显示误导就按 04 改 409。

## 10

- **总量上限从 32 MiB 调到 64 MiB**：活测真实签名 140 / 2516 字符（gemini-3-flash low / high），32 MiB 只够约 128 B/键；一个满会话 ≈ 4096 × 2.6 KB ≈ 10.5 MiB，64 MiB 约容 6 个满会话，当前会话永远最新不会被整体淘汰。spec 的「典型大小 × 4096 × 64」≈ 640 MiB 不是合理上限。→ sound（按 spec「按实测调整」执行）。
- **字节预算同时计键文本和签名文本**（键是 `name+args` JSON，可能很大）。→ sound。
- **仅当前会话自身超预算时才淘汰它最旧的键**，其余情况整会话淘汰。→ sound。
- **已知的存量问题未改**：上游不给 `functionCall.id` 时每个响应的调用都叫 `call_1…`，`id:` 键跨轮碰撞；先查 `name+args` 键，所以只在它缺失时可能挂错签名。→ provisional：不在 F7 范围，留给后续。

## 集成审查（W0–W3 合并树）

- **修复**：`index.ts` 的 `snapshot` 包装丢掉了 `fresh`，14 的「改动后开新一轮」在生产里是死代码；`status` RPC 现在接受 `{ fresh }`，UI 的动作后刷新传 `fresh`；轮询每次刷新最多等 30s，挂死的 RPC 不再永久停掉轮询；未配置时的出站会话改为懒创建，配置时关掉，热重载不再遗留第二个 Agent。
- **不修，记录**：
  - 换票挂过 120s 后允许第二次换票，若厂商已轮换，第二次按时的 `invalid_grant` 会删号（spec 接受的残余风险，120s 上限是 spec 定值）。→ provisional：15 观察。
  - 代理路径上的任何非中止失败都显示为「出站代理不可用」，包括经健康代理访问某个上游时的 DNS/TLS 错误（02a 的设计取舍：宁可多报）。→ sound。
  - 保活 60s 后，若上游在 60s 内静默关闭空闲连接，非对话 POST（刷新、登录换码、额度）不会被重试，只会一次性失败后进退避。→ provisional：按 11 的规则由 15 看 ECONNRESET 计数。
  - `assertPersistedProviders` 严格比对 `cacheRetention`：若宿主读回时丢掉/默认化该字段，每次 sync 都会抛错。→ provisional：08 合入主干后的活测验证。
