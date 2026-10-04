# 错误记录

同一根因 / 同一用户可见故障只留一条 `##`（后续跟进并进该条，标题用最晚日期）。每条只写 **现象** / **根因** / **修复** 三行，各 1–2 句；只留 grep 代码得不到的症状、根因与落点，不写过程与清单。

## 2026-10-04：Antigravity 指纹停在 hub 2.11.0，本机旧安装还会把它压得更低

**现象**：对话 User-Agent 要么是回退 `antigravity/hub/2.11.0`，要么被本机 Antigravity.app 2.12.2 盖住。Cloud Code 拒过期客户端（「This version of Antigravity is no longer supported」）。
**根因**：回退钉在 2026-08-30 的 2.11.0；版本探测无条件采用已安装版本。官方 hub 更新清单 `latest-arm64-mac.yml` 已是 2.19.1，启动参数仍是 `--subclient_type hub`、`--override_ide_version`、daily-cloudcode-pa。
**修复**：回退改为 2.19.1。已安装版本比回退新才采用，否则用回退。UA 形状不变：`antigravity/hub/<ver> <os>/<arch>`。

## 2026-10-04：Kiro 静态目录补上 claude-sonnet-5.5，chat 列表仍不放行

**现象**：治理列表（`KIRO_CONSOLE`）有 `claude-sonnet-5.5`，本机 chat 列表（`origin=AI_EDITOR`）没有。
**根因**：治理列表不是权限列表。登录后的选择器只采用 chat 列表，缺行的 id 对话会 400 `INVALID_MODEL_ID`。
**修复**：静态 fallback 按治理列表的 `tokenLimits` 收了这一行，`skip` 已删。登录选择器不补这一行，等 chat 列表出现它再出现。

## 2026-10-04：Antigravity 注册表换上 Claude 5.5，Cloud Code 仍只服务 4.6

**现象**：CLIProxyAPI 的 antigravity 注册表用 `claude-opus-5-5-high` / `claude-sonnet-5-5-high` 换掉了 `claude-opus-4-6-thinking` / `claude-sonnet-4-6`，但本机 `fetchAvailableModels`（33 个 id）仍只回 4.6、没有 5.5。同日其余家族相对 2026-10-03 没有新的可收行。
**根因**：目录源的公开注册表超前于订阅后端。注册表列出不等于 Cloud Code 在服务，注册表缺行也不等于已下架。
**修复**：两行按注册表收进目录。4.6 仍留着，因为活列表还在服务。额度分组仍是冻结的 SkillStar 表，不改。

## 2026-10-03：Devin swe-2-max 首 token 卡在 270s 预算上，一步静默被掐成两次 504

**现象**：`oauth-devin` / `swe-2` / `max`，上下文约 11.5 万且当轮没有缓存读时，同一步连续两次 `504 devin upstream: no output within 270s (1 attempts)`，每次刚好 270.0s；第三次 268s 才吐出第一个块（178 个输出 token，`inputTokens` 115371、无 `cacheRead`）。这一步界面空白约 13 分钟。前一步仍是缓存命中、十几秒返回。
**根因**：共用输出前预算 270s 放在宿主 300s 流空闲看门狗前面。看门狗只在解析出非空 text / reasoning / tool 块时重置，usage 帧和空字节都不算数。`swe-2-max` 冷前缀的首 token 就落在这条线上，计时器把还活着的 `GetChatMessage` 整秒掐断；预算用尽后内部重试排不进去（还要再留 120s 首字节），宿主只能整段重开。
**修复**：Devin 的输出前预算和空闲改为 290s（`DEVIN_STREAM_BUDGET_MS`），仍早于宿主看门狗。首字节 120s 不变。超过看门狗的静默仍然救不了——不向宿主交出可见内容块，就无法把 300s 往后拨。

## 2026-10-03：目录刷新日——codex 跟版 0.160.0、kiro 治理列表超前 chat 列表、OpenCode Go 六行回潮、command-code 价目表换单表

**现象**：`npm run models` 干跑：codex 0.160.0 活目录 8 行无新行；kiro 治理列表（`origin=KIRO_CONSOLE`）多 `claude-sonnet-5.5`，且 `deepseek-3.2` / `minimax-m2.1` / `qwen3-coder-next` 的输入收成 text；OpenCode Go 带 key 列表把 2026-09-30 轮下的 6 行又列出来；command-code 1.74.1 的价目表从 kD/lD/… 多表换成一张按 billing id 的单表（`promptCost`/`completionCost`/`cacheWrite5mCost`/`cacheHitCost` 在 bundle 里已不存在），且不再带 `contextTiers` / `timeOfDay`。
**根因**：① Kiro 的治理列表本来就超前于 chat 列表（真正的 picker）——`claude-sonnet-5.5` 只在治理列表，2026-10-03 实测 chat 列表 8 行没有它；② OpenCode Go 上游列表当天可变，「09-30 轮下」不是永久下架；③ command-code 1.74.x 重构显示费率表，峰谷价 / 超阈档在新表里没有对应物。
**修复**：codex 钉 0.160.0（纯跟版）；kiro 加 `skip` 规则拒收 `claude-sonnet-5.5`、三行 `input` 随 chat 列表收成 text；OpenCode Go 重收 `kimi-k2.6` / `qwen3.6-plus` / `qwen3.7-max`（后两行活测带 `reasoning_content` → DeepSeek 方言 compat，`kimi-k2.6` 无 → plain），`glm-5.1` / `omen-alpha` / `minimax-m2.5` 因 models.dev 无元数据仍不收；command-code 基础价与新增 `cacheWrite` 按 1.74.1 单表更新，`tod.*` / tier 字段按合并规则保留（源不再声明，维护者确认取消后再删）。用户可见：Command Code 5 行 deepseek 可关思考、`space-bunny-alpha` 多 `max` 档、GLM-5 涨到 $1/$3.2、15 行多缓存写价；OpenCode Go 3 行回归、cline `kimi-k3` 与 copilot `claude-opus-4.8-fast` 价目更新。

## 2026-10-02：WorkBuddy / WorkBuddy AI 两家族整体移除（落地当日撤，非故障）

**现象**：无用户可见故障——活测收口同日，维护者裁定两家（腾讯 CodeBuddy 国内版 + 国际版）不再随插件分发，家族整体下架。
**根因**：产品取舍，与 wire 无关；下方 2026-10-02 活测条目的结论（非流式 400(11101)、refresh token 一次性、CLI UA 门控）仍为事实，magpie `3515d99` 归因随家族一并留档。
**修复**：`src/oauth/workbuddy{,-ai}` 与目录 15+16 行、`catalog-rates.test.ts` 的 credits 费率豁免、`docs/oauth.md` 总表两行一并删除；老用户残留的 `workbuddy[-ai]` session 文件由 `RETIRED_PROVIDER_IDS` 机制在同路径外自然废弃，不做迁移。

## 2026-10-02：WorkBuddy / WorkBuddy AI 活测收口——非流式 400(11101)、refresh token 一次性、`workbuddy.cn` 域

**现象**：链接登录（微信快捷 / Google broker）、额度（Free 1200 / 100 credits，字符串容量解析）、活目录（CLI UA，15 / 16 行与静态表**逐 id 一致**）、流式对话（SSE `: heartbeat` 注释行开头、`data: [DONE]` 收尾、usage 带 `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens`/`credit`）两家全通。非流式一律 `400 {code:11101, "Non-stream chat request is currently not supported"}`（magpie #124 原文），代理按转发契约原样透出不重试。`X-Refresh-Token` 刷新成功且 **refresh token 轮换（一次性）**——`workbuddyImported` 只重读桌面文件、绝不兑换 refresh token 的设计由此坐实。
**根因**：三个 wire 事实与假设有出入——① 登录页 authUrl host 是 `www.workbuddy.cn` / `www.workbuddy.ai`（state 接口返回，未硬编码）；国内版账号 `domain` 字段实际值 `www.workbuddy.cn`（非站点回退值 `copilot.tencent.com`；X-Domain 用账号自身 domain，符合 wbDomain 语义）；② 上游 usage 自带 prompt-cache 命中/未命中统计，但 wire 仍无缓存亲和字段，维持「剥 DSH 缓存字段 + `dsh-workbuddy[-ai]` 分析器常量」策略（冷启动 `prompt_cache_hit_tokens: 0` 一致）；③ magpie 的「unapproved channel」拒答在 2026-10-02 用短 Codex 式系统提示**未复现**（两家 200）——拒答应针对完整官方系统提示或旧网关行为；中性补齐与普通 agent 提示均畅通，DSH 会话不受影响。
**修复**：无需改码（均为确认性观察）；两个 README 补「活测」小节。残余：桌面端导入（`workbuddy-desktop[-ai].info`）本机无桌面端未活测，靠单元测试与 magpie 对照；真实 DSH 长会话缓存命中率待 `npm run analyze` 后续观察。

## 2026-10-01：目录刷新日——Pixel Canary 退役（command-code + cline）、Devin 撤 Claude Sonnet 4.5 两行

**现象**：command-code 1.73.1 给 `stealth/pixel-canary` 行加 `get hidden(){isPixelCanaryEnded()}`（门 `2026-10-01T06:00:00Z`，npm CHANGELOG：stealth 预览 9/30 23:00 PT 结束）；cline feed 同日撤下同名行。Devin `GetCliModelConfigs`（737 个原始 config）里 `claude-sonnet-4.5` / `-thinking` 整行消失（不是变无家族；同代 `claude-opus-4.5` 仍在，排除账号/出口过滤）。
**根因**：上游按日程退役/清理旧模型；`npm run models` 对静态家族分别报 `? stealth/pixel-canary`（cline）与 manual 家族不探（command-code）。
**修复**：两家族的 pixel-canary 目录行 + 价目行删（command-code 86→85、cline 11→10）；devin 两行随源删（80→78）。codex 0.159.3、command-code 1.73.1 均无新模型；cline `mimo-v2.6-flash` 窗口随 models.dev 桶 1048576→1050000。

## 2026-09-30：Copilot 活目录解析出 0 行——上游把 `model_picker_enabled` 整体翻成 false

**现象**：登录态 `GET {endpoints.api}/models` 正常回 60 行，但每行 `model_picker_enabled: false`（`gh` 的 `gho_`、Copilot CLI 的 `gho_`、设备码 `tid=` 三种凭据视角一致）；`toCopilotPickerModels` 过滤后剩 0 行，活目录静默回落静态楼，`npm run models -- copilot` 报全部行 `?`（0 from source），无任何报错。
**根因**：2026-09-29 该字段还在真实反映 picker（「只在 `/responses` 上服务」先例靠它列出）；上游随后把标志整体置 false，可用的收录信号只剩 `policy` + `supported_endpoints` + `capabilities.supports`。
**修复**：收录标准改为能力视图（维护者 2026-09-30 裁定「最稳定」方案）：带 `policy` 对象（值不读，账号开关不抖动）+ 端点规则 + `tool_calls` + 别名/快照 `LIVE_SKIP_IDS`；自管行（search/exec 代理、embeddings、gpt-4o 时代、free-auto、带日期快照）恰好全不带 `policy`，一个门全杀。本次目录变更按解析器口径人工对活载荷 diff 落盘（copilot/README.md 模型 2026-09-30）。

## 2026-09-30：Copilot premium 额度耗尽时，非基础模型一律 `400 model_not_supported`（不是 429）

**现象**：premium 剩 0% 的账号（individual，10-01 重置）对 `kimi-k3`、`gpt-5-mini`、`claude-haiku-4.5` 等——包括 `restricted_to` 明确含 `free`/`pro` 的行——`/chat/completions` 全回 `400 {"code":"model_not_supported"}`，只有 `gpt-4o-mini` 这类基础行 200；错误码长得像模型不存在，不是配额错。
**根因**：premium 请求池耗尽的拒绝落在这个 code 上（对 Copilot CLI 的 `gho_` 视图也成立：它只能看到 8 个基础行）；`billing.restricted_to` 说的是套餐可用性，不管当期余额。
**修复**：诊断口径——活测 Copilot 端点/模型前先看 `copilot_internal/user` 的 `percent_remaining`；0% 时只能测基础行，等重置后再验。9 个活端点标注 responses-only 的目录行（gpt-5.4-mini/5.5/5.6 全家/6 系/mai-code-1.1-flash）真伪挂起在此（copilot/README.md 模型）。

## 2026-09-30：家族登录后不再默认开启这一家所有模型（登录默认）

**现象**：新登录一个家族，它整份目录立刻进 `settings.yaml` 与 DSH 选择器（Devin 80 行、Command Code 86 行），用户得一个个关；只登录不勾选还会被当成「登录后全关、yaml 缺路由」的坏状态。
**根因**：勾选默认全开（`ModelSwitch.isEnabled`），同步又不看家族是什么时候登录的；全关恢复只看「已登录 + 全关」，分不出用户的选择和登录默认。
**修复**：登录默认——插件实例启动时已在册的家族记进 `seenLogins`（升级不动老安装），之后登录的家族进 `awaitingPick`：当前与随后发现的行全部关着，直到用户在模型页勾一行（全选 / 全关 / 显式 `selected` 也算）才结算；`recoverEmptyLoggedInFamilies` 跳过 `awaitingPick`，不再把故意全关当坏状态修掉。回归 `test/login-defaults.test.ts`，模型页给这家显示「登录后默认不勾选」。

## 2026-09-30：Ollama Cloud 三协议活测——都接单，但选 Responses 会静默丢上下文

**现象**：无 key 探活 `/v1/responses` 与 `/v1/messages` 都回 401 而非 404（README 旧文只确认过 chat/completions）；带 Pro key 活测三协议的非流式 / 流式 / 工具调用 / 图像输入 / prefix 缓存读数全部成立。
**根因**：Cloud 后端现在三种闭集协议全上了，但 `/v1/responses` 的状态语义是假的——`previous_response_id` 接受后忽略（code-word 第二轮无记忆、回显 null），`store:true` 回落 false；唯一收益只剩无状态 input 链，与 Completions 等价。
**修复**：协议仍为 `openai-completions` 薄透传（`reasoning_effort` 原生值直发，选 Anthropic 要加翻译层、选 Responses 拿到一个会静默丢上下文的假状态）；`/ollama/v1/responses` 的 501 文案改为「本 hop 只用 Completions」，不再说 Cloud 没有 Responses；结论写进 `src/apikey/ollama/README.md` 协议节。


## 2026-09-30：目录刷新日——各源同日增删（Devin 撤 6.1-sol off 档/thinking-fast、Go 套餐轮下 6 行、窗口口径补齐）

**现象**：2026-09-30 二次刷新时 Devin `GetCliModelConfigs` 已无 `gpt-6-1-sol` 的 `off`（`*-none`）档、`-thinking-fast` 行（当天早上刚收的行当天被撤）；OpenCode Go **带 key** 的 `/v1/models` 轮下 `glm-5.1`/`kimi-k2.6`/`minimax-m2.5`/`qwen3.7-max`/`qwen3.6-plus`/`omen-alpha`（无认证 curl 仍列全部 43 个 id，是公开缓存视图）；grok CLI 列表把 4.5/4.6 的 `context_window` 降到 256K；Cursor 活列表把 Sonnet 5/5.5 非 Max Mode `context` 抬 300K、Gemini 3.1 Pro/3.8 Flash 抬 1M、`claude-sonnet-5-5` 的 `supportsImages` 翻 false。
**根因**：上游当天就增删档位/变体与套餐成员，目录快照≠稳定态；OpenCode Go 的无认证列表与带 key 列表是两个视图（带 key 才是订阅服务集）；4.5/4.6 是 2026-09-29 窗口口径修复（取非 Max Mode 基础窗）当时只改了 4.7、源里 4.5/4.6 还报 500K，本次源追齐。
**修复**：devin 两行随源收掉 off 档并删 thinking-fast 行；opencode-go 六行删（适配器读带 key 列表，出处已写 README）；grok 4.5/4.6 收 256K；cursor 四条窗口按活列表（= Run 注册表口径）收、sonnet-5-5 行收 text-only。command-code 升钉 1.72.2 收 `gpt-6.1-sol` + `inclusionai/ling-3.1-flash:free`，cline 收 feed 新行 `openai/gpt-6.1-sol`，opencode-go 收 `longcat-2.5-preview-free`（活测确认 DeepSeek 方言）。

## 2026-09-30：用量页 swe-2 一场 9.6M 只记 ~2.5M；Devin 热调用 uncached 全记 0

**现象**：宿主给一场 Devin swe-2 会话计 ~10M（totalTokens 含缓存读），用量页 7 天 swe-2 只有 2.5M。扫 30 天会话：`oauth-devin` 3863 次有缓存读的调用里 3828 次 `inputTokens=0`（99%），其余上报缓存的家族全部 0%。
**根因**：两条。① Devin `ModelUsageStats` 是 Anthropic 式不相交桶（`input_tokens` 只算未命中），hop 却直填 OpenAI `prompt_tokens`（应含缓存），宿主按 `prompt_tokens−cached−write` 回推时热调用全被 clamp 成 0；缓存写又写在宿主不读的顶层 `prompt_cache_write_tokens`（pi-ai 只读 `prompt_tokens_details.cache_write_tokens`，command-code 同病）。② 用量页 Token 只算 未命中输入+输出、不含缓存读，与宿主会话 totalTokens 口径不一致，用户对账必差一个缓存读。
**修复**：`mapDevinUsage` 求和 `input+cacheRead+cacheWrite` 成整段 `prompt_tokens`，读/写都进 `prompt_tokens_details`；`mapCommandCodeUsage` 缓存写挪进同一 details（其 `inputTokens` 本就是 AI SDK 含缓存总量，不动）；用量页 输入=整段 prompt，Token 与宿主一致；`live-smoke` 加 devin 用量桶检查。历史会话被 clamp 掉的 uncached 记录时即丢，不可恢复。

## 2026-09-30：同一家族超过 64 个会话后，还在跑的最早会话丢钉、前缀整段失效

**现象**：插件实例不重启、累计开到第 65 个会话（含子代理）时，最早开始、仍在跑的会话下一步用当前快照重钉 system 前缀，已缓存的整段前缀作废。本机 Kiro 一天就有 28–33 个会话，热重载会清表，所以开发时很少碰到。
**根因**：8 个家族的 system 钉住表（Kiro 前缀估算基线同理）上限 64 个会话，满了删 `Map` 里最早插入的，而查到时不更新位置，删的是最早开始的会话，不管它还在不在用。
**修复**：各家 `cache.ts` 查到即重新插入（`usePin`；Antigravity `pinRecord`、Kiro 基线同样），上限不变，淘汰最久没有请求的会话。回归 `test/cache-families.test.ts`、`test/kiro-request.test.ts`（旧代码上都失败）。

## 2026-09-30：Sign in with ChatGPT 模型没有 Fast 行

**现象**：ChatGPT 家族模型页只有基础行，没有 Codex 那样的 `-fast`。
**根因**：首版按官方错误表「不支持的 service-tier 覆盖报 `unsupported_capability`」推断本路由不支持 Priority，未活测。活测 8 行都 200 接受 `service_tier: priority`，`gpt-5.6-luna` 交替 6 次 85.8 vs 56.4 tok/s（1.52×）。
**修复**：`fastTier` 行派生 `-fast`，本家 `peelChatgptFast` 剥成 `priority`；其它 tier 仍剥掉。回归 `test/chatgpt.test.ts`。

## 2026-09-30：Sign in with ChatGPT 卡片没有额度进度条和重置卡

**现象**：新 `chatgpt` 家族登录成功、对话正常（活测 `gpt-5.5` / `gpt-6.1-sol` / `gpt-6-sol` / `gpt-6-luna` 都 `response.completed`），但卡片只有「管理用量」链接，没有 Codex 那样的 5 小时 / 每周条、套餐徽章和重置卡。
**根因**：官方流程没有额度数据源：token 只能打 `api.openai.com/v1`（siwc 禁止打 `chatgpt.com/backend-api`，`wham/usage` 与重置卡都在那里）；活测响应头无限额头、SSE 无 `codex.rate_limits` 帧；access / ID token 不带 `chatgpt_plan_type`。活目录 `/v1/models` 只列 5 行（缺 6.1 Sol / 6 Sol / 6 Luna，但三者都能用）；同前缀两次请求缓存 1792/2818 → 0/2818，命中不稳。
**修复**：不发明额度：卡片保留「管理用量」→ chatgpt.com/settings/usage；要看条和重置卡用同一账号的 Codex 家族。活目录发现后补回它漏列的静态行（活测可用），按目录「新→旧」排序、目录外的新 slug 置顶（服务器顺序不按发布排），回归 `test/chatgpt.test.ts`。模型页曾只显示 5 行即此因（热重载前的发现结果）。

## 2026-09-30：Kimi 未登录时 `k3` 与 `k3-256k` 都显示 256K，看不出区别

**现象**：模型页 Kimi K3 与 Kimi K3 256K 两行窗口徽标都是 256K，像是重复行。
**根因**：静态行把 `k3` 也保守钉在 256K；官方表里两者是同一个 K3，`k3` 最高 1M（Pro / Allegretto 及以上），`k3-256k` 固定 256K、额度约一半。
**修复**：`k3` 静态默认窗改为 1048576（官方表）；Plus / Moderato 账号在模型页改小窗口或选 `k3-256k`，登录后活目录 `context_length` 仍覆盖。

## 2026-09-30：模型页只有 Command Code 有金币价格徽标

**现象**：模型页的金币 tooltip 只出现在 Command Code 行，其余 13 个家族（Codex / Kiro / Cursor / Devin …）一行都没有。
**根因**：`rates.json` 只有 `command-code` 一张手抄表，`controller.ts` 也只喂了 `commandCodePricing()`；加载器又要求每行必有 `cacheRead`，而 Bedrock 等源对部分模型不标缓存价。
**修复**：`npm run rates`（`scripts/rates.ts`）从各家价目源写全部家族（Cursor / Devin 官方表、models.dev 本家或厂商桶，`-fast` 孪生另取 priority 价），`catalogPricing()` 带全部家族；`cacheRead` 改可选，缺价的 tooltip 行不显示。源里确实没价的 7 行（Kimi `kimi-for-coding`、Devin Fusion ×4、Grok `grok-4.7-build-fast`、Go `omen-alpha`）仍无徽标。回归 `test/catalog-rates.test.ts`。

## 2026-09-30：Kiro Opus 变慢：选的档位从 9-29 起真的生效

**现象**：Kiro Opus 5.5 会话 74% 的 LLM 时间在流推理；9-29 起每步推理字数是之前的 2.6×（high）/ 6.4×（xhigh），p90 步时 63s → 96s / 145s。
**根因**：`4fab779` 让 Kiro 真正发 effort，会话里的 high / xhigh 从空操作变成真的更长的推理（Opus 5.5 的 schema 默认是 medium）。不是插件的 effort 记忆带进来的，它早已不生效（见「换模型会丢掉 reasoningEffort」条）。
**修复**：代码不改，档位照选的发；要快就选 medium。

## 2026-09-30：DSH 存的默认模型会被插件的 compaction 同步删掉

**现象**：profile patch 里 `agent-default-model`（Kiro Opus 5.5）落在插件托管的 compaction 标记之间，下一次模型同步会把它连同标记区一起删掉，默认模型丢失。
**根因**：DSH 追加新条目时放在最后一项之后、我们的结束注释之前，于是落进标记区；`stripCompactionBlock` 把标记区整段删除。
**修复**：只删我们自己的 `compaction-basic` 条目，区内的外来条目挪到标记区上方保留。回归 `test/models.test.ts`（旧代码上失败）。

## 2026-09-30：Kiro 首字 ~105s 后静默 242s 被断，宿主重试白等约 6 分钟；代理侧原因没留存

**现象**：9-29 两次（21:02、22:46）首个推理块 ~105s 才到，出字约 1 秒后静默 241.9s，宿主只记下 `terminated`，重试 6s 就出字。
**根因**：上游在出字后卡住，谁断的查不到（代理的原因只写 stderr，没留存）；105s 仍在 120s 首字节窗口内，出字后又不能重放，只能等断开。同类断流 Kiro-Go #142、OmniRoute #11922、官方 IDE kirodotdev/Kiro#9600 都有。
**修复**：Kiro 首次尝试 90s 内没有真正输出（元数据帧不算）就在写头前放弃重试（`firstOutputMs`，只管第一次，重试用剩余预算）；重试与输出后失败另追加到数据目录的 `upstream.log`，带已用时长与距上次数据的静默时长。回归 `test/upstream.test.ts`。

## 2026-09-30：Kiro 文本 / 推理块没按增量原样拼接：重复开头的内容被吞，推理丢空格

**现象**：让模型输出 60 个 `-`，收到 48 个（`ab`×20 收到 22 个字符、`0`×50 收到 42 个）；推理块边界的空格全丢，Opus 5.5 的推理读成 `modelfetching approach byfinding`。
**根因**：最初的翻译器没把块当增量：`mergeKiroText` 把「以已有文本开头」的块当累计快照只发新后缀（`-`×12 之后是 `-`×48，前 12 个被吞；只在开头的短累计文本触发，罕见），`thinkingTextFromPayload` 逐块 trim 推理。
**修复**：删掉 `mergeKiroText`，文本与 thinking 直接拼接；推理块原样返回，字段选择不变。回归 `test/kiro-request.test.ts`、`test/kiro-transport.test.ts`（含 12 / 48 两块与推理边界空格的真实形状；推理那条在旧代码上失败）。

## 2026-09-29：默认输入窗照抄厂商总窗，压缩晚到被网关拒（Copilot GPT / OpenCode Go Responses Luna / GLM 套餐 400K / Grok 4.7 输入窗口）

**现象**：Copilot `gpt-*`、OpenCode Go Responses 两行 Luna（1050K）、GLM-5.3 / Flash（1M）、Grok 4.7（500k）的窗口徽标都是厂商登记的最大窗，宿主要到接近该值才压缩，中途先被网关拒。
**根因**：目录把厂商总窗或 Max Mode 窗当成 `contextWindow`，没区分「默认输入档」与「最大窗」；实际默认档是 Copilot GPT 256K、Luna 258K、GLM 套餐 400K、Grok 4.7 非 Max Mode 256k。
**修复**：`contextWindow` 取默认输入档（`COPILOT_GPT_CONTEXT_WINDOW` / `OPENCODE_GO_LUNA_CONTEXT` / GLM 400K / `GROK_47_CONTEXT`），厂商大窗挂 `maxContextWindow` 作该行自定义窗上限（API key 家族没有上限槽就只报默认档）；`maxContextOfRow` 按家族查上限，同名 `gpt-*` 不串家族。

## 2026-09-29：Grok 重置卡读不到，README 写成「没有重置 API」

**现象**：Grok 卡片没有重置卡一栏，README 断言 Grok 没有重置 API。
**根因**：重置卡不在 grok CLI，而在 grok.com 网页计费的 gRPC-web `GetRemainingResets` / `RedeemReset`，CLI bearer 可用；README 只查了 CLI。
**修复**：`grok/reset-frame.ts` 编解码，`fetchGrokQuota` 并行读卡（失败保留上次卡数）；兑换时重读列表、按哈希 id 找回 token，token 不出宿主。

## 2026-09-29：GLM 重置卡读不到，卡片只有窗口没有「重置」

**现象**：GLM 卡片只有 5 小时 / 每周 / MCP 三条，看不到账号里攒的重置卡。
**根因**：重置卡是独立的 biz 端点 `customer-package-reset/list` / `use`，不在 monitor quota 里；过期时间没有时区，BigModel 实为 +08:00。
**修复**：`fetchGlmQuota` 并行读卡（失败保留上次卡数），`QuotaStore.consume` 兑换，传输失败复用 `requestId` 防双扣；UI 按 5 小时 / 周分行。

## 2026-09-29：上下文窗口弹窗提示里 `{max}` 原样显示

**现象**：「输入上下文窗口」弹窗提示显示字面量「最大 {max}」。
**根因**：`fill()` 只替换 `{n}`；`describeCatalog` 也没暴露目录默认窗，提示里分不清默认值与生效值。
**修复**：`fill` 支持命名占位符（缺键保持字面量）；`describeCatalog` 行补默认窗与生效窗字段，弹窗分列当前 / 默认 / 上限。

## 2026-09-29：统一目录 JSON 用 import attributes 直接编不过

**现象**：`import … with { type: 'json' }` 在 `npm run build` 报 TS2823。
**根因**：仓库钉 `module: Node16`，不支持 import attributes；换 `nodenext` 会改全仓 emit，还依赖宿主 Node 的支持。
**修复**：`src/catalog/index.ts` 用 `readFileSync(new URL('./models.json', import.meta.url))` 读入；tsconfig `include` 加 `src/**/*.json`，让 tsc 把 JSON 发射进 `lib/catalog/`。

## 2026-09-29：模型页开关点了要 ~3 秒才翻转

**现象**：模型页开关点击后约 3 秒才变，像没点中。
**根因**：开关完全受控于快照，要等 `setModels` → 宿主 `settings.mutate`（写 settings.yaml 并 reconcile，秒级）→ 再重建一次快照。
**修复**：UI 乐观翻转，RPC 失败或快照不一致时回落；直接用 `setModels` 返回的快照，省掉第二次 `status`。

## 2026-09-29：各家族静态目录落后于上游，模型发布或轮换后离线楼缺行（始 09-23）

**现象**：新模型上架（如 Sonnet 5.5）或轮换后，各家离线目录缺行或留着已下线 id；Cursor 回退参数与活目录不一致。
**根因**：静态目录按各自来源手工快照，没有统一的对照检查；Cursor 归并活目录时还取了含 Max Mode 的最大窗。
**修复**：用 `npm run models` 对照各家接口刷新（流程与取舍见 `docs/models.md`），源里还没有的模型不提前加；Cursor 活目录优先取非 Max 变体的窗口。

## 2026-09-29：移除 Claude（Anthropic）家族

**现象**：Claude 家族用订阅 OAuth 令牌直连 `api.anthropic.com`，有被判为第三方流量（计入 Extra Usage）的风险。
**根因**：维护者决定下架；改为驱动本机 `claude` 是另一套架构，不做。
**修复**：删 `src/oauth/anthropic/`；`RETIRED_FAMILY_IDS` 仍 unset 残留的 `oauth-anthropic` 路由，`auth.json` 里的 `anthropic` vault 不再读取；默认模型若指向它，需在 DSH 里重选。

## 2026-09-29：Command Code 卡片「刷新额度」不刷新它自己，还把别的家族扫一遍

**现象**：点 Command Code 的「刷新额度」，它的额度不动，反而多打一轮别的家族的额度请求。
**根因**：`refreshQuota(provider)` 的家族判断是手写的 `||` 串，漏了 `command-code`，掉进「无参数 = 全家族」分支。
**修复**：判断与聚合都改用 `PROVIDER_IDS`，新家族不会再被漏掉。

## 2026-09-29：Kiro 输出撞上限被当成失败，宿主重试同一个还会撞上限的请求

**现象**：回复撞输出上限后流被销毁，宿主按 TRANSPORT 重试同一请求，又撞上限。
**根因**：流内 `ContentLengthExceededException` 帧走了 502 异常分支；它的含义是 stop_reason `max_tokens`，之前的文本是好的。
**修复**：该帧以 `finish_reason: length` 收尾并保留文本；活测里静默结束、不带这个帧的截断仍无法分辨。

## 2026-09-29：Codex 套餐徽章：Pro 没区分 5x / 20x，`promax` 显示成「Promax」（始 08-30）

**现象**：Pro 5x / 20x 卡上都只显示 Pro；新的 `promax` 套餐显示成「Promax」。
**根因**：$200 的 slug 是 `pro`、$100 是 `prolite`；`CODEX_PLAN_NAMES` 没有 `promax`，回落成首字母大写。
**修复**：`pro` → Pro 20x、`prolite` → Pro 5x，`promax` / `pro_max`（含 `chatgpt_` 前缀）→ Pro Max；官方没公布倍数，不写。

## 2026-09-29：额度读数不新鲜：重启 / 热重载后要等网络、首屏逐家读完、进页和对话后不刷新（始 09-28）

**现象**：重载后额度卡先空白，首屏要等所有家族依次读完（慢上游拖到 10s）；进入额度页或刚跑完对话，看到的仍是最多 1 分钟前的读数。
**根因**：`QuotaStore` 只有内存缓存、60s 固定 TTL，与对话和进页无关；`#buildSnapshot` 逐家串行 await；过期的错误条目也在快照链里同步重拉。
**修复**：缓存落盘到 `quota-snapshot.json`（`PersistedCache`，启动先回旧读数再后台重读）；冷快照各家并行；对话结束（`onQuotaUsed`）和进页（`revalidateQuota`）把新鲜期收紧到 15s 后台重读，错误条目同样先回旧值再重读。

## 2026-09-29：Kiro 上游 500 / 503 被标成 invalid_request_error，宿主不重试，长 turn 被打断

**现象**：上游高负载 500 被宿主判为 INVALID_REQUEST，直接终止长 turn；容量不足的 503 同样从不重试。
**根因**：宿主按 `<status> <error JSON>` 文本分类，`invalid.?request` 排在 5xx 之前；`kiroClientErrorBody` 除 429 外一律写 `invalid_request_error`。
**修复**：5xx 写 `api_error`、429 写 `rate_limit_error`、4xx 不变；非流式的流内异常也改为 502，与流式一致。

## 2026-09-29：Kiro 对没有 tools 的工具历史 400；无参工具流式参数为空串

**现象**：历史里有 tool_use / tool_result 但请求不带 `tools`（压缩、摘要请求）时，Bedrock 400 要求定义 toolConfig；无参工具的流式 `arguments` 是空串。
**根因**：Bedrock 规定出现工具块就必须声明 toolConfig；Kiro 对无参工具不发参数文本。
**修复**：没有 tools 时把工具调用与结果改写成文本（`toolHistoryAsText`）；流式收尾给无参工具补 `{}`。

## 2026-09-29：Kiro 缓存按请求前缀内容命中，不按 conversationId；工具定义在前缀里

**现象**：代码与 README 里「缓存亲和是 conversationId」的说法不成立。
**根因**：活测：换 conversationId 发同样内容照样命中；只改一个工具的 description，整段缓存作废。
**修复**：无代码改动（系统提示本就在稳定前缀里）；README 改正，并写明会话内工具列表必须逐字节稳定。

## 2026-09-29：热重载后 18–40 秒里旧实例持续失败（Kiro 41 次 `UND_ERR_CLOSED` / `DESTROYED`）

**现象**：热重载后十几到几十秒内，多个会话同时报 undici「client 已关闭」并重试耗尽。
**根因**：卸载时 `proxy.close()` 与 `outbound.close()` 并行执行；`server.close()` 只断空闲连接，在途的 keep-alive 连接留在旧服务器上，下一个请求由连接池已关的旧处理器接手。
**修复**：关闭后的应答都带 `Connection: close`，并定期扫掉变空闲的连接，等最后一条结束才 resolve；outbound 挂在它之后关闭。

## 2026-09-29：Cursor 第二轮起失忆：历史用 protobuf turn 发，服务端不读

**现象**：第二轮问上一轮的内容答「对话里没有」；工具调用后续跑，模型说「你没提问」或重新调用工具。
**根因**：历史编成 protobuf `ConversationTurn`，当前服务端只读 root blob 里的 AI-SDK JSON 消息。
**修复**：整段对话按 JSON 消息放进 root blob（图片同路），续跑时的 user 消息固定为 `Continue.`；删掉 protobuf turn 编码。

## 2026-09-29：Cursor 并行 tool call 只拿到第一个，其余丢了

**现象**：模型一步发出多个调用，DSH 每轮只收到一个。
**根因**：`runCursorAgent` 见到第一个 MCP exec 就结束，其余调用在随后一两秒内才到。
**修复**：收齐调用直到 step checkpoint，3s 兜底（`toolBatchGraceMs`）。

## 2026-09-29：Kiro 里选的 effort 档位是空操作，模型一直跑 schema 默认档

**现象**：给 Kiro 模型选 low 或 max 没有任何区别。
**根因**：请求转换丢掉了 `reasoning_effort`，从没发 `additionalModelRequestFields`；该字段是封闭 schema，形状错会 400。
**修复**：按模型 schema 的形状发（Claude `output_config.effort`，GPT `reasoning.effort`），只在目录行有该档位时才发。

## 2026-09-30：`npm run analyze` 里 Kiro 命中率恒为 0.0% 是测不到，不是没命中（始 09-28）

**现象**：Kiro 会话命中率 0%、TPS 为空，被报成 affinity-miss。
**根因**：Kiro 的流里没有 `metadataEvent`，不下发任何 cache 字段；服务端其实按前缀缓存（重复请求 credit 约减半）；输出 token 兜底只按正文估。
**修复**：家族从未出现过 cache 字段时报 `n/a` / `UNMEASURED`，而不是 0%；输出按正文 + 思考 + 工具参数估。9-30 跟进：代理把每次请求的可缓存前缀估算写进 `prefix-estimate.jsonl`，分析器对 Kiro 显示 `≤x%`（上限，不是实测命中）。

## 2026-09-29：对照 magpie（yetone/magpie）审网关 / 账号 / 额度 / hop——采纳一批小改，多账号故障转移与冷却维持不学

**现象**：没有单一故障，对照出的缺口已各自成条（冷读串行、非原子写、`lib/` 未校验、导入登录被继承、Copilot `/responses` 行、Kiro 图片 / 超长 / 撞上限）。
**根因**：这些是 magpie 有明确处理、我们没有的地方。
**修复**：见各条；网关内多账号故障转移、冷却、按缓存亲和选号、自动接受 Copilot 条款均不采纳。活测确认 Grok 版本头没有门槛、跨账号重放封存的 reasoning 不被拒，不改。

## 2026-09-29：Kiro 目录声明支持图片，请求里却只留文本，图片被静默丢掉

**现象**：带图提问时 Kiro 模型像没看到图一样回答，也不报错。
**根因**：`openaiToKiro` 的 `flattenContent` 只取文本部分。
**修复**：`data:` 图片发成 `userInputMessage.images`，只保留最近一条带图的 user 消息；远程 URL 和不支持的格式不发。

## 2026-09-29：Kiro「Input is too long」宿主认不出是上下文溢出，不会压缩，整轮失败

**现象**：会话超过真实上下文后，宿主报 INVALID_REQUEST，不自动压缩。
**根因**：宿主按措辞判定上下文溢出，Kiro 原文 `Input is too long.` 不匹配任何一条规则。
**修复**：`kiro_too_big` 的错误文案加前缀 `input is too long for the model's context window: `，状态码不变。

## 2026-09-29：导入的厂商 CLI 登录被插件拿去换票，插件和 CLI 互相登出；浏览器重登后仍被当成导入登录（始 09-28）

**现象**：导入的 Codex / Cursor / Cline / Kimi 登录临期时，插件与 CLI 轮换同一个 refresh 互相登出；导入登录陈旧后卡片只显示厂商 401 原文；用浏览器重登后，过期又报 `imported login is stale`。
**根因**：`TokenManager` 不区分登录归属，导入会话也拿共享 refresh 换票；陈旧状态被吞掉；`saveSession` 合并旧字段时继承了导入的 `source`。
**修复**：导入会话只重读源 store、不换票，不可用时抛 `ImportedLoginStale`（403，不删号），卡片提示重跑 CLI 或改用浏览器登录；`source` 归入 `SESSION_CREDENTIAL_KEYS`，重登总会重写它。

## 2026-09-29：Copilot 选择器列出只在 `/responses` 上服务的模型，回环 hop 只有 `/chat/completions`

**现象**：（推断，未活测）登录后目录会列出只在 `/responses` 上服务的行，选中后 hop 拿不到该模型。
**根因**：`toCopilotPickerModels` 不看 `supported_endpoints`，而 hop 只有一个端点。
**修复**：`supported_endpoints` 非空且不含 `/chat/completions` 的行不进目录。

## 2026-09-29：`signed-out.json` / 出站代理 / 更新偏好非原子写，崩溃时撕裂文件读成「没设置」

**现象**：（潜在）写到一半被杀时，退出过的家族重启又自动登录，或代理配置读成空、请求悄悄直连。
**根因**：这三处用裸 `writeFile`（先截断再写），读端把解析失败当默认值。
**修复**：改走 `writePrivateText`（临时文件 + rename）；`test/atomic-writes.test.ts` 禁止新增裸 `writeFile`。

## 2026-09-29：CI 不检查已提交的 `lib/` 是否与 `src/` 一致（始 09-26）

**现象**：GitHub 地址安装与自更新读的是已提交的 `lib/`，src 改了没带构建产物就会发出旧代码（历史上多次「rebuild lib」补提交）。
**根因**：git / npm 安装不重新构建；CI 在 runner 上重建后才测试，已提交的那份从没被验证过。
**修复**：CI 先删 `lib/` 再 `npm test`，之后 `git status -- lib` 非空即失败；自更新换装前校验暂存副本有 `lib/index.js`；`test/package-surface.test.ts` 守清单、入口与版本号。

## 2026-09-29：热链（本地目录）安装在版本卡上被当成发布版（始 09-26）

**现象**：热链版本卡显示「当前 0.0.105 · 已是最新」并提示重启宿主，箭头还指向更旧的 tag；实际 build 后热重载即生效。
**根因**：热链的清单号就是仓库正式号，About 不区分 link 与安装副本；宿主 `hmr` 默认 `root: []`，不监听源码。
**修复**：`localUpdateInfo` 给出 `linked` / `devVersion`（`npm run dev-build` 递增），版本卡显示「本地链接 · 运行 dev 号」、撤掉更新 CTA，只留当前 / 最新两槽；profile patch 给 `hmr` 配仓库绝对路径（见 `docs/development.md`）。

## 2026-09-29：GLM Coding Plan 对话直连 model 端点、不走官方网关；「150%配额」标识撤下（始 09-21）

**现象**：插件直连 `api.z.ai/api/anthropic`（BigModel 为 `open.bigmodel.cn`），官方从不这样发；卡片常驻一个未经验证的「150%配额」标识。
**根因**：官方把请求改写到 `zcode.z.ai/api/v1/ultra[-zai]/anthropic` 网关做套餐权益校验；1.5 倍由服务端按身份发放，本 hop 从未验证过倍数。
**修复**：`glmAnthropicUrl` 默认走网关，直连只作 401 / 403 / 404 的一次性回退；删掉标识与 `glm/boost.ts`，网关与身份头不动。

## 2026-09-28：添加账号弹窗里展开的输入框掉到列表最底部

**现象**：登录方式行展开后，输入框渲染在所有方式行和「导入」之后。
**根因**：内联表单写成了方式列表的兄弟节点，统一排在列表后面。
**修复**：表单移进列表，紧跟触发它的方式行（各家族都改）。

## 2026-09-28：退出账号后，重启 / 热重载又自动登录回来

**现象**：会自动导入本机 CLI / IDE 凭据的家族，点「退出」后一重启账号又回来。
**根因**：「已尝试自动导入」只记在内存里，重建实例后清零，又导入一遍。
**修复**：`logout` 把家族写进 `signed-out.json`，自动导入跳过它；手动导入和重新登录不受影响。

## 2026-09-28：Kiro Builder ID 额度读取失败 · Invalid profileArn.（HTTP 400）

**现象**：粘贴导入的 Builder ID 账号额度报 400，对话正常。
**根因**：额度请求把 Builder ID 的占位 ARN 当成可省略，不带 ARN 就是 400；重试也只在 403 时换区。
**修复**：额度与对话、目录共用 `kiroProfileArn`；只有 403 才换区。

## 2026-09-28：Grok 首轮第二步只回会话标题就结束（「会断」）

**现象**：新会话首轮工具调用后，第二步只输出一行标题就结束。
**根因**：会话标题请求与主对话共用 `prompt_cache_key` 且并发，系统前缀先到先钉，钉住的是标题 prompt。
**修复**：`changedRegion` 在共享部分不足较短文本一半时视为无关 prompt，重钉并原样发出；其他家族的 `cache.ts` 用同一门槛（`unrelatedPrompt`）。

## 2026-09-28：Devin / Command Code 在代理内重放上游 5xx（Command Code 还有 429）

**现象**：上游一次 5xx，代理先重放 3 次，宿主再重试 5 次，最多打 15 次上游。
**根因**：私有重试逻辑把 ≥500、trailer 错误、429 都当传输故障，违背「代理内不重试」的约定。
**修复**：TransportError 带显式 `retryable`，只有 socket 错误、空 body、未收尾断流可重试；HTTP 状态与错误事件原样转发一次。

## 2026-09-28：Kiro 月度额度耗尽（始 09-03）——400 改为 429 + 额度措辞

**现象**：`MONTHLY_REQUEST_COUNT` 回 400 虽然止住了重试，但宿主提示「请求无效」。
**根因**：宿主只按文本分类：先认额度措辞，再认 429；旧文案没有额度措辞。
**修复**：回 429，文案前缀 `usage limit reached: `、type `insufficient_quota`，宿主归为 QUOTA_EXCEEDED 且不重试；宿主正则原文钉进测试。

## 2026-09-28：Kiro 官方模型目录与 GPT-5.6 1M 窗口更新；选择器 Claude 400 INVALID_MODEL_ID

**现象**：选择器里的 Claude 发出去 400 `INVALID_MODEL_ID`，缺新模型，GPT-5.6 窗口也是旧值。
**根因**：目录请求用的 origin 与 chat 不同，而后端按 origin 和出口区域放行模型；静态行又被无条件并进选择器。
**修复**：目录改用 chat 的 `AI_EDITOR` origin，缓存 key 含出口代理，活列表非空即作为选择器；静态表只作离线快照。

## 2026-09-28：Cursor 取消后 h2 流仍在跑；每次 Run / 一元 RPC 都新建 h2 连接

**现象**：取消或超时后远端流仍在收数据；每次请求都重新做 TCP + TLS 握手。
**根因**：`client.close` 只做优雅关闭，不终止活动流；每次都新建 `http2.connect`。
**修复**：按（origin，出口代理）池化 h2 连接，关闭 / GOAWAY / 空闲时出池；取消时只 `NGHTTP2_CANCEL` 自己那条流。

## 2026-09-28：Antigravity 长会话约第 128 次工具调用后前缀逐轮断裂

**现象**：长会话约 120 次工具调用后，缓存命中率从 ~90% 掉到 40–50%。
**根因**：签名表每会话只有 256 个键、先进先出，最早的签名被淘汰后，对应的 functionCall 被改写成文本，前缀断裂。
**修复**：签名只存真实会话 id，每会话 4096 键 LRU，并对会话数与总内存设上限。

## 2026-09-28：Codex 请求体明文上传，长会话每轮几百 KB 到 MB

**现象**：Codex 请求体不压缩，长会话每轮要上传几百 KB 到 MB。
**根因**：`forward()` 没有按家族编码请求体的接缝。
**修复**：`forward()` 加 `encodeBody`，Codex 用 zstd 并带 `content-encoding: zstd`；后端 400 / 415 时不回退明文。

## 2026-09-28：上游空闲约 4s 就断连，下一轮重新握手

**现象**：两轮之间空闲超过约 4 秒，下一个请求要重新握手（chatgpt.com 约 1.7s）。
**根因**：上游不发 `Keep-Alive` 头，undici 退回默认的 4 秒 `keepAliveTimeout`。
**修复**：直连与代理 Agent 都设 `keepAliveTimeout: 60_000`；陈旧 socket 的 ECONNRESET 由重试兜底。

## 2026-09-28：会话 id 串用——Completions 路由从没收到 DSH 会话 id，回退 id 仍会 pin；GLM `x-session-id` 每进程随机

**现象**：Completions 路由的会话键永远是回退常量，第一个会话的系统提示被钉给后续所有会话；GLM 会话 id 每次重启都换。
**根因**：pi-ai 只在 `cacheRetention === 'long'` 时发 `prompt_cache_key`；回退 id 带 `:<model>` 后缀，守卫只比对裸常量。
**修复**：Completions 路由加 `cacheRetention: 'long'`；各家 `is<Fam>Fallback` 作为 pin 的门槛；GLM 用常量 `dsh-glm`；防火墙测试禁止用时钟或随机数生成会话 id。

## 2026-09-28：上游卡住或断流时代理比宿主 300s 看门狗更晚收场，失败被收成成功 / SSE 错误块（始 08-26）

**现象**：上游静默时只能等宿主 300s 看门狗；响应头发出后的断流被收成干净 EOF 或错误块，截断的流被当成成功；并发时 `stream ended before a terminal response event` 被盲重试。
**根因**：只有每次尝试重置的空闲超时，没有首字节超时和总预算；各家自己管 HTTP 与重试；`finally` 里的 `end()` 把中断当成正常结束。
**修复**：`src/oauth/upstream.ts` 统一计时、重试与失败映射：首字节 120s、输出前总预算 270s（超出回 504），响应头发出后一律 `destroy`；提交闸门在首个输出之前不发头。

## 2026-09-28：设置页切走后仍每 1.5s 轮询，额度每分钟约 78 次请求

**现象**：插件面板打开过一次后，切到别的面板仍每 1.5 秒发 `status`。
**根因**：隐藏的面板仍然挂载，轮询只看 `document.hidden`；`setInterval` 不等上一次快照完成。
**修复**：只在面板可见时串行刷新（`panelVisible`），快照单飞；身份回填每账号 60s 最多一次。

## 2026-09-28：Codex/Grok 提交闸门在真实流上从不生效，「只有前导就断流」照样漏到客户端

**现象**：只收到 `response.created` 就断流，本应在代理内重试，实际第一个 chunk 就提交了响应头。
**根因**：「是否已有输出」靠正则扫任意 `"type"`，前导里回显的 `text.format.type` 被当成输出。
**修复**：`src/oauth/responses-sse.ts` 按 `event:` 行给帧分类，`CommitGate` 见到首个输出帧才提交，前导不计入缓冲上限。

## 2026-09-28：TokenManager 刷新把可恢复故障变成请求失败或登出（始 09-26）

**现象**：token 端点抖一次，过期账号连续几分钟秒失败；端点挂住时请求全挂死；换票超时后才成功的结果被丢弃，下次重用同一 refresh 被登出；403 或一次 5xx 就删号。
**根因**：退避对过期 token 也直接重放错误；刷新本身没有超时，inflight 永不 settle；超时后不持久化迟到结果；永久失败靠各家正则扫文本判断。
**修复**：请求最多等 `REFRESH_WAIT_MS`，换票本身有 `REFRESH_EXCHANGE_TIMEOUT_MS`，迟到结果在 `REFRESH_LATE_CAP_MS` 内仍会持久化；`isPermanentRefreshFailure` 只认结构化 401 / `invalid_grant`；版本失配时回读存储。代理内对 429 / 5xx 不重试。

## 2026-09-28：配了出站代理（设置页 / `proxyUrl` / `HTTPS_PROXY`）插件整体卡死；Cursor 与未穿线的调用点仍直连

**现象**：配置出站代理后，回环代理不监听、设置页 `status` 永远等待；Cursor 和部分调用点仍然直连。
**根因**：懒加载的 undici 不在依赖里，加载失败让 `ready` 永不 resolve；很多调用点默认用全局 `fetch`。
**修复**：undici 进依赖，`outbound.ts` 成为唯一出站入口（`ready` 必 settle，失败时明确报错），Cursor h2 拨号也走它；`test/outbound-firewall.test.ts` 守卫。

## 2026-09-28：Command Code 新家族接入 + 活测收口

**现象**：唯一推理入口 `POST /alpha/generate` 是私有 JSONL 事件流，不兼容三种闭集 api。
**根因**：浏览器登录的回调直接带 `apiKey`，没有 code 交换；`threadId` 必须是 uuid，否则亲和被丢；没有模型目录端点。
**修复**：hop 做翻译层，登录流程用 `spec.collect` 接住回调里的凭据；非 uuid 的键哈希成 uuid v5；目录取自 CLI bundle 的注册表。

## 2026-09-28：会话 zstd 只解出第一帧 / 基线把 v3、v4 双份会话算两遍

**现象**：分析会话时只得到第一帧的数据；同一会话的多个版本文件被重复计入。
**根因**：DSH 每次追加写一个独立 zstd 帧，一次性解压只解第一帧；统计按文件而不是按 `session.id`。
**修复**：逐帧解压并丢弃截断的尾帧；同一 `session.id` 只留最高版本。

## 2026-09-27：CI 恒定取消 token-lifecycle 后 5 个测试 = unref'd 刷新超时把事件循环排空

**现象**：CI 每次都有 5 个测试被取消，本地 macOS 全绿。
**根因**：刷新超时的 timer 是 `unref` 的，测试里没有 ref 的 handle，Linux 上事件循环排空，node:test 取消后续测试。
**修复**：测试文件加 keepalive 定时器并在 `after()` 清理；生产代码的 `unref` 不动。

## 2026-09-26：OpenCode Go 路由与宿主：内置 27 个模型被带进 DSH、无 key 仍写路由、勾选后路由没进 DSH（始 09-11）

**现象**：有 key 时 DSH 模型列表多出内置 `opencode-go` 的 27 个模型；无 key 也写路由；勾选后 DSH 提供商列表却没有路由。
**根因**：llm-pi-ai 只注册 profile 点名的路由，插件替用户写 `providers.opencode-go` 就等于激活了内置目录；路由写入不看 key；同步用了不存在的 `settings.get()`，读不到就静默跳过。
**修复**：只写插件自有的两条路由，不写 `providers.opencode-go`（只清理旧插件自己写的同形 profile）；无 key 时 unset 自有路由；改用 `settings.describe()`，读写失败报错。

## 2026-09-26：OpenCode Go 额度读不到：Console 迁移、旧 cookie 失效、key 兜底只剩百分比、刷新挂死（始 09-25）

**现象**：额度一直「cookie is invalid or expired」；只存 key 的卡片只剩百分比；刷新偶尔一直不返回。
**根因**：已迁移工作区的额度改走 `/console/api/*` + `x-org-id` + `console_session` cookie；`go/status` 也认 Bearer key 并带金额；key 分支漏了 `await`，超时被提前清掉。
**修复**：Console 接口优先、旧刮页兜底，放行 console cookie；key 路径先打 `go/status`，被拒才退回 usage 百分比；两处改为 `return await`，整次调用共用一份超时预算。

## 2026-09-26：OpenCode Go 账号：只能存一个、卡片只显示密钥尾号（始 09-11）

**现象**：只能存一套 key / cookie / workspace，不能切号；只有 key 的账号卡片标题是 `…CBk5`。
**根因**：vault 是单条结构，页签是自绘面板；只有 key 时接口拿不到任何身份。
**修复**：改为多账号 0600 vault（旧文件自动迁移），活动账号的 key 镜像到 `OPENCODE_API_KEY`，走通用账号卡；卡片可以「修改名称」，存本地显示名。

## 2026-09-26：桌面端中文设置下插件仍显示英文

**现象**：宿主语言选了中文，插件页仍是英文。
**根因**：插件只读 `navigator.language`，而桌面端的语言设置同步在 `<html lang>` 上。
**修复**：优先读 `document.documentElement.lang`，日期也按该语言格式化。

## 2026-09-26：RPC 路由可被 body.method 改写成任意特权方法

**现象**：向任意已注册路径 POST 带 `method` 字段，就能调用 `key` / `logout` / `proxySet` 等特权方法。
**根因**：路由处理器优先取 `body.method`，而不是路由自己的名字。
**修复**：始终按路由自身的名字派发。

## 2026-09-26：Devin 收到 temperature/top_p = null 时被当成 0

**现象**：未设置的 `top_p` 传 `null` 时下发成 0，采样退化成贪心。
**根因**：`Number(null)` 为 0 且是有限数，默认值被跳过。
**修复**：`numericOr` 只接受有限数字或非空数字字符串，显式的 0 保留。

## 2026-09-26：analyze-session --fail-below 在管道里丢报告

**现象**：接管道或重定向时，不达标退出导致报告被截断。
**根因**：`process.exit(1)` 紧跟异步 stdout 写入，进程先于缓冲刷出就退出了。
**修复**：改为设 `process.exitCode = 1`，让进程自然退出。

## 2026-09-26：流式转发在客户端断开后挂死；未读的响应体占住 socket（Antigravity / Kiro / Cursor / Cline / Devin）

**现象**：客户端中途断开后转发循环卡在 `drain`；上游读失败时客户端收不到结束；反复刷新额度耗尽连接池。
**根因**：被销毁的 response 不再发 `drain`；部分读循环没有 try/finally；非 ok 响应的 body 既不读也不 cancel。
**修复**：写路径统一用 `waitForDrain`（与 close / error / abort 竞速），读循环补 finally；非 ok 响应先 `body.cancel()` 再重试或返回。

## 2026-09-26：几处请求超时形同虚设或干脆没有

**现象**：Cline 额度的套餐信息偶尔静默丢失；Kiro 模型发现与插件自更新下载可能永久卡住。
**根因**：Cline 的超时计时在前一个顺序请求之前就开始了；Kiro management 与 tarball 下载没有 AbortSignal。
**修复**：计时挪到真正发请求之前；Kiro management 加 15s 上界、下载加 60s 超时。

## 2026-09-26：模型目录缓存按引用外泄（含刷新成功路径）

**现象**：调用方对目录返回值 `.sort()` / `.push()` 会污染进程级缓存。
**根因**：返回的是内部数组的引用。
**修复**：所有目录函数的返回点都改为返回副本。

## 2026-09-26：Copilot 401/403 重试丢掉会话来源与 refresh token

**现象**：粘贴 / 环境变量 / CLI 来源的会话遇到一次 401 后变成 oauth 语义，refresh token 也丢了。
**根因**：catch 分支硬编码了 `source: 'oauth'`，`refreshToken` 没有回退到原值。
**修复**：catch 分支与主路径一致：保留原 source，refresh token 回退到原值。

## 2026-09-26：Kimi 思考档门禁恒真，以及掩码 / 导入 / 前缀四处小故障

**现象**：Kimi 按模型的思考能力判断失效；OpenCode Go 把掩码存成了 cookie；一个不可读的导入候选中断整轮搜索；Cline 大写前缀原样进了请求。
**根因**：判断条件恒为真；cookie 解析没识别掩码；读取只容忍 ENOENT；前缀比较时小写化了，返回的却是原串。
**修复**：删掉恒真项；掩码直接拒绝；读取失败的候选视为无会话继续；前缀大小写归一。

## 2026-09-26：typecheck-ratchet 三处漏判

**现象**：tsc 失败时可能报「0 errors」通过；非定位型诊断不计入；Windows 上被 import 时仍执行 main。
**根因**：只看 `spawnSync` 的错误、不看退出码；正则只匹配带位置的诊断；入口判断手拼 `file://`。
**修复**：退出码不是 0 / 1 就抛错；非定位诊断计入 `<global>`；入口判断改用 `pathToFileURL`。

## 2026-09-26：登录流程并发 start() 绕过占用检查；注册失败不释放回调端口

**现象**：双击「登录」会同时起两次登录，泄漏一个；授权 URL 构建失败后，回调端口和计时器不释放。
**根因**：占用检查与占用写入之间隔着 await，不是原子的；失败路径只清了预留位。
**修复**：四个流程管理器在首个 await 之前就占位（`starting` 集合）；失败时关闭 server 与连接、清掉计时器再抛。

## 2026-09-26：三处「没有上界」的增长/扇出

**现象**：Ollama 刷新目录时对每个模型并发 `/api/show` 易被限流；Grok 设备码过期后无限重启；Devin JWT 缓存无限增长。
**根因**：并发、重启次数、缓存容量都没有上限。
**修复**：分别设上限：每批 4 个、重启最多 3 次、缓存最多 16 条。

## 2026-09-26：sendJson 遇到不可序列化 body 直接崩 / codex 缓存头不校验控制字符

**现象**：body 为 `undefined` 或有循环引用时在写头之前崩溃，客户端收不到响应；缓存头的值不经校验就塞进 HTTP 头。
**根因**：没有序列化失败的兜底，也不校验头值里的控制字符。
**修复**：序列化失败时回落成 `'null'`；头值含控制字符时不发该头。

## 2026-09-26：Antigravity 同一个 $ref 被引用两次时解析不完整

**现象**：schema 里同一定义被两处 `$ref` 引用时，第二处带着未解析的 `$ref` 发给上游。
**根因**：`visited` 同时用作环检测和「已处理」备忘录。
**修复**：`visited` 只记当前递归路径，重复引用照常解析，环仍然被拦住。

## 2026-09-26：Devin 的 devin-session-token$… 被当成显示名

**现象**：`devin-session-token$…` 形态的不透明 id 露到界面上。
**根因**：不透明 id 的判断只匹配 `devin-team$…`。
**修复**：模式放宽为 `devin-<word>$<token>`。

## 2026-09-25：插件自更新：Desktop profile 上 CLI 更新必败，装完后运行版本仍旧（始 09-05）

**现象**：desktop profile 点更新时 `dsh plugin` 被拒（由 Electron 独占管理）；装成功后 About 仍显示旧版。
**根因**：自更新依赖 CLI 修改 profile；运行中的进程加载的是更新前的模块，版本号冻结在加载那一刻。
**修复**：改为下载 tag 源码包、原子替换所有已装目录（失败时回滚），提示重启宿主生效；插件不再管理宿主的生命周期；磁盘版本与运行版本不一致时用诊断行提示。

## 2026-09-24：全家族会话「卡死」= 路由 maxTokens 写真实输出上限，把自动压缩阈值饿死

**现象**：长会话每步都跑两次压缩摘要；切到小窗口模型时直接判「超上下文」。
**根因**：路由的 `maxTokens` 写的是厂商输出上限，而压缩阈值 = 窗口 − `maxTokens` − 余量，被压到很低甚至为负。
**修复**：`toHarnessModel` 把 `maxTokens` 封顶在 `HARNESS_REQUEST_MAX_TOKENS`（32768），并在 patch 里维护压缩余量的覆盖。

## 2026-09-23：Codex 目录轮换——GPT-6 Sol / Luna 只对 `client_version` ≥ 0.155.0 下发，5.4 系列与 Spark 已 400（始 08-26）

**现象**：本机 Codex 已列出新模型，插件目录没有；已下线的模型仍在 picker 里，`minimal` / `ultra` 档选了也 400。
**根因**：活目录按 `?client_version` 分档，identity 版本落后就看不到新行；`ultra` 是 CLI 的多 agent 模式，不是 wire effort。
**修复**：升级 `CODEX_CLIENT_VERSION` / UA，目录补新行、删下线行，effort 去掉 `minimal` / `ultra`；模型事实只记在目录一处。

## 2026-09-22：Cursor `grok-4.7` 一跑就「AI Model Not Found: Invalid parameters for registry model」= effort 参数 id/value 全错

**现象**：选 Grok 4.7 任何 effort 都失败，不带 effort 正常。
**根因**：参数一律发 `{id:'reasoning', value:'extra-high'}`，而参数 id 和取值按家族不同，上游逐字校验。
**修复**：参数样式从活的 AvailableModels 逐家族导出（`CURSOR_PARAM_STYLES`），未知家族不发 effort。

## 2026-09-22：Grok 4.7 Fast 的真模型 id 被 Codex `-fast` 规则剥成不存在的模型

**现象**：`grok-4.7-build-fast` 请求被剥成不存在的 `grok-4.7-build`。
**根因**：共享的 `applyFastMode` 按 Codex Priority 约定剥掉所有 `*-fast`，而 Grok 的这个 id 就是真模型。
**修复**：Grok 分支不走 `applyFastMode`，真 fast id 原样透传，永不发 `service_tier`。

## 2026-09-21：GLM anthropic-messages 路由 401「API 密钥无效」= 代理只认 Bearer，不认 Anthropic SDK 的 x-api-key

**现象**：GLM 任一模型一调用就报「API 密钥无效」，上游 key 直连正常。
**根因**：回环代理鉴权只读 `Authorization: Bearer`，Anthropic SDK 发的是 `x-api-key`。
**修复**：鉴权同时接受 `x-api-key` 与 Bearer。

## 2026-09-21：GLM 已登录却「当前用户不存在coding plan」= 抓错登录，存了 config.json 的旧 key 而非 provisioned key

**现象**：Max 用户的 GLM 卡报「当前用户不存在coding plan」，对话 429「套餐已到期」。
**根因**：存的是 `~/.zcode/v2/config.json` 里已被标为未授权的旧 key；真正能对话的是 `credentials.json` 里 provisioned 的 `api-key`。
**修复**：优先导入 provisioned `api-key`，OAuth token 只用于 userinfo；旧 session 需要重新导入。

## 2026-09-21：GLM 卡「周额度未返回」= monitor 的 HTTP 200 业务错误被当成空额度

**现象**：monitor 回 HTTP 200 加业务错误，卡片只显示「周额度未返回」。
**根因**：`fetchGlmQuota` 只看 HTTP 状态，不解析业务信封。
**修复**：`success === false` 或 `code` 不是 0 / 200 时抛出上游原文。

## 2026-09-21：BigModel 登录成功但额度/身份全 401「令牌已过期」= 把 zcode JWT 当 bearer

**现象**：GLM 卡已登录，但 BigModel 额度与身份接口全部 401。
**根因**：把 zcode JWT 当成了 BigModel 的 bearer；官方只用 `data.bigmodel.access_token`。
**修复**：按 region 取业务 token（`glmProviderAccessToken`）；旧 session 需要重新登录。

## 2026-09-21：「本机会话导入」报 no GLM / ZCode session found —— 其实找到了 key，是套餐未生效

**现象**：本机有 coding-plan key，导入却报找不到会话。
**根因**：ZCode 用 `enabled: false` 标记该 key，标记来自可能过期或出错的权益缓存；导入只收可用 key。
**修复**：被系统禁用的 key 也导入并带上原因提示，真假交给额度和对话去判断；只硬跳过 start-plan JWT。

## 2026-09-21：GLM 浏览器授权「Authorization Failed」：上游兑换失败，插件还在轮询到超时

**现象**：授权页报失败（BigModel 已知缺陷），插件却把 `failed` 当 pending 一直轮询到 5 分钟；一次 5xx 又直接判死。
**根因**：上游兑换授权码有缺陷；轮询只认 `ready`，秒级过期时间被当成毫秒，异常没有可分类的状态码。
**修复**：照官方轮询逻辑：`failed` / 未知状态立即报错，5xx / 408 / 429 / 传输错误重试；失败文案附上 tracker 与绕行方法（换区域或粘贴 API key）。

## 2026-09-21：GLM Anthropic 思考形与官方 catalog 不一致；缓存缺滚动 breakpoint

**现象**：hop 发 Claude 形状的 thinking 字段，非 system 消息也没有 `cache_control`。
**根因**：ZCode 给 GLM 只发 `thinking: { type }` + `output_config.effort`，并在最新的非 system 消息上放滚动 breakpoint。
**修复**：按官方 catalog 重写 thinking，并给最新的非 system 消息加 breakpoint；路由 compat 用 `forceAdaptiveThinking` / `allowEmptySignature`。

## 2026-09-21：GLM 目录取舍——5.2 是自动改道别名、FlashX 未上套餐、Turbo 输出上限 128k→64k

**现象**：曾经按 ZCode 的启用规则把 5.2 加回 picker；FlashX 官方写明未上套餐；Turbo 输出上限写成了 128k。
**根因**：客户端的启用列表只是向后兼容，不等于套餐在卖；5.2 在后端改道到 5.3，选 `off` 档会 400。
**修复**：目录保持 5.3 / 5.3-Flash / Turbo，不复活 5.2、不加 FlashX，Turbo 改为 64k；proxy 保留 5.2 的线上形状给旧路由兜底。

## 2026-09-19：宿主半类型检查：`noCheck` 下 1917 条错误清零，strictNullChecks / useUnknownInCatchVariables 落地，noImplicitAny 不清扫

**现象**：`noCheck: true` 让构建不做类型检查；打开后出现上千条错误，测试全绿并不代表类型安全。
**根因**：几乎全是声明缺口（字段未声明、可省参数没标 `?`、推断成 `never[]`），不是 bug；`noImplicitAny` 只能靠补 `: any`，补了也不增加安全性。
**修复**：在定义处补声明、不用 cast，删掉 `noCheck` 并打开两个开关；棘轮脚本显式传这些开关、基线为 0；批量改类型后必须跑全量测试。

## 2026-09-19：Cline 活测命中率 74%——大头是上游分片轮换，附带修掉 system 头钉串模型

**现象**：命中率 74%，miss 都是整体 miss，下一次立刻恢复；会话中换模型后仍发旧模型的 system 头。
**根因**：OpenRouter 的隐式缓存只靠 `X-Task-ID` 亲和，按供应商池路由时缓存不跟人，hop 无解；不兼容的新 system 头被停到了尾部。
**修复**：新头只在是旧头的纯扩展时才停到尾部，否则重钉。

## 2026-09-19：Cline 免费档活测——4/5 可用且不扣余额，muse-spark 区域门

**现象**：一个免费模型每次 403「not available in your region」，其余免费模型正常且不扣额度。
**根因**：区域门由上游按出口 IP 判定，与 hop 无关；推理模型 `max_tokens` 太小时 reasoning 吃满预算，`content` 为空。
**修复**：不改代码、不按地区过滤目录；需要非受限地区出口；推理模型要给足 `max_tokens`。

## 2026-09-19：Cline 卡片只有余额没有进度条——credit 账号没有分母，ClinePass 才有三条窗口

**现象**：Cline 卡片只有余额，没有进度条，看起来像漏做。
**根因**：credit 账号只有余量和流水，没有分母；官方 CLI 也只显示 Credits。
**修复**：订阅账号才读 usage-limits 画 5 小时 / 周 / 月剩余条，缺上限就不补默认值（数值未活测）。

## 2026-09-19：Cline hop 活测三条结论（响应信封 / `workos:` 前缀 / 隐式缓存）

**现象**：非流式回包读不到 `choices`；裸 JWT 当 bearer 一律 401；Anthropic 模型 `cached_tokens` 恒为 0。
**根因**：非流式回包套了 `{success,data}` 信封；bearer 必须是 `workos:<jwt>`；经 OpenRouter 的 Anthropic 模型需要显式 `cache_control`，CLI 不发。
**修复**：非流式先解信封；前缀幂等添加并统一大小写；effort 表没有 `off`，`max` 映射为 `xhigh`。

## 2026-09-18：xAI Grok 额度显示「0 / 0」——上游改了 GetGrokCreditsConfig schema（始 08-30）

**现象**：额度卡只有「预付余额 0」或「每周 0 / 0」，没有周用量条。
**根因**：付费账号是共享周池，数据在 grok.com 的 `GetGrokCreditsConfig`（周期后来挪到 nested field 8）；上限为 0 的 on-demand 包被当成了额度包。
**修复**：并行读 CLI billing 与 gRPC credits，缺百分比时用 gRPC 周池；上限为 0 的包和没有数字的行不画；解码读 field 8 并保留旧字段回退。

## 2026-09-18：令牌生命周期对齐 CLIProxyAPI——401 刷新重试 / 后台 sweep / 失败退避

**现象**：令牌被吊销时上游 401 直接透传只能重登；闲置后的首个请求要付刷新 RTT；同账号重登丢失 projectId 等字段。
**根因**：`TokenManager` 只有到期前的惰性刷新，没有强制刷新和失败退避；`saveSession` 整体覆盖。
**修复**：401 时强制刷新并重试一次，每 60s 后台扫描提前刷新，瞬时失败退避 5 分钟；`saveSession` 合并非凭据字段。

## 2026-09-17：Devin hop 的三个活测结论（双前缀 / ide_name / fast）

**现象**：已带 `devin-session-token$` 的 token 再加一次前缀就 401；`ide_name: devin` 只拿到一条占位目录；`-fast` 模型被剥掉后缀。
**根因**：导入与粘贴共用入口却没做归一化；服务端按客户端身份给目录（真实指纹是 `chisel`）；Devin 的 fast 是独立模型。
**修复**：`normalizeDevinToken` 幂等加前缀；身份固定为 CLI 指纹；Devin 分支跳过 `applyFastMode`。

## 2026-09-17：宿主与页面版本错配：「导入」把 Grok 会话写进 devin 槽，保存报 unknown method（始 09-11）

**现象**：页面已热更而宿主还是旧版时，点导入把 Grok 会话写进了 `devin` 键；点保存报 `unknown oauth-subs method`。
**根因**：旧宿主对未知 provider 回落到 Grok 导入；宿主进程的 ESM 缓存里仍是旧的 RPC 表。
**修复**：`importFrom` 先校验 `PROVIDER_IDS`，未知就抛错；页面把 unknown provider / method 显示成「重启宿主」提示。

## 2026-09-17：Devin hop 的孤立 cache_read=0 是上游行为，不是 hop bug

**现象**：长会话偶发孤立的 `cache_read_tokens=0`，下一跳立刻恢复。
**根因**：上游 ephemeral 缓存异步提交并定期失效，与 pin / cascade 无关（A/B 测试证伪）。
**修复**：hop 侧无解；顺带按 jwt 过期时间复用 `GetUserJwt`，401 时丢缓存重试一次。

## 2026-09-17：Cursor 区域锁模型全挂 + 勾选格停在静态底表（始 09-03）

**现象**：Claude / Gemini / GPT 报「not supported in your region」；账号可用的活目录模型进不了勾选格，已下线模型又被静态底表塞回来。
**根因**：Cursor 按出口 IP 做区域锁，而 h2 连接不支持代理；活目录没接到 picker，静态底表与活目录的合并策略不对。
**修复**：h2 支持经 CONNECT / SOCKS5 代理（`cursorProxy` / `PI_CURSOR_PROXY`）；启动时拉活目录并 sync，活目录非空就是真相、不回填静态行；目录缓存键并入出口。

## 2026-09-11：OpenCode Go 全家族 400 MissingSessionID

**现象**：每轮都报 `400 MissingSessionID`，内置模型直连也一样。
**根因**：Go 网关硬性要求 `x-opencode-session`；pi-ai 不发这个头，llm-pi-ai 的 compat gate 还会扣留该字段。
**修复**：路由写常量头 `x-opencode-session: dsh-opencode-go`（单分片回退，等宿主原生按会话发送后可去掉）。

## 2026-09-11：未登录家族的模型被勾选

**现象**：未登录的家族模型行仍显示打勾。
**根因**：勾选状态直接取自 ModelSwitch 的偏好，不看登录状态。
**修复**：锁定的家族渲染为未勾选，计数显示 `0 / m`。

## 2026-09-11：空 reasoningEfforts 让整段 llm-pi-ai 路由写不进（始 08-30）

**现象**：启动后 `llm-pi-ai.providers` 缺整批插件路由，也没有报错文案。
**根因**：展开 `false` 得到 `{}`、`api` 写成闭集之外的值、reasoning 键用了厂商拼写、Anthropic 路由带 Completions compat——任一项都让宿主的原子 mutate 整段被拒，而失败被吞掉了。
**修复**：`false` 原样保留；mutate 前用 `assertDshServiceableProvider` 自检，写入失败抛给界面，回读缺路由也视为失败。

## 2026-09-10：OpenCode Go 页没有 API key 输入，cookie/workspace 框被撑到 240px 高

**现象**：页面只能填 cookie 和工作区，输入框异常高。
**根因**：面板不写 `OPENCODE_API_KEY`；竖排布局里 `flex: 1 1 240px` 把高度撑成 240px。
**修复**：面板首项为 API key，保存时写入凭据；竖排输入框固定高度。

## 2026-09-10：Cursor Run 把 requestContext / KV set / MCP 调用一律当拒绝，模型跑不通

**现象**：Cursor 任一模型一调用就 500，工具轮拿不到结果。
**根因**：请求上下文、KV 写入、MCP 调用都回了拒绝或错类型的结果。
**修复**：requestContext 回 success 并带上 DSH 工具定义；KV 按 get / set 回对应结果；原生工具回类型化拒绝，让模型退回 MCP 工具。

## 2026-09-10：Grok leading 文本改写后整块重挂，未变前缀不缓存

**现象**：长会话每步约 10k token 未命中，加权命中卡在 ~90%。
**根因**：只有追加式改动才挂增量，前插或中段改写都会把整段 leading 文本重挂到后缀。
**修复**：`changedRegion` 取最长公共前缀 + 后缀，只重挂变化的区域。

## 2026-09-10：关于页检查失败 GitHub releases 403

**现象**：About 的最新版本显示 `-`，报 GitHub 403。
**根因**：未认证的 GitHub API 每小时 60 次，用尽后回 403。
**修复**：API 失败后改用本机 `gh`，再退到 `/releases/latest` 的 302；有 token 时带上。

## 2026-09-09：关于页检查更新 405 `/oauth-subs-auth/status`

**现象**：「检查更新」无反应，报 HTTP 405。
**根因**：注册 RPC 时用的 `ctx` 被框架替换成 connection 提供方，没有 `webServer`，POST 落到了 SPA fallback。
**修复**：`registerRpc` 同时 inject connection 与 webServer，并把 `ctx` 绑回调用方的 scope。

## 2026-09-09：Completions 透传没把 cache_read 交给 DSH

**现象**：Copilot / Kimi / GLM 长聊的命中率恒为 0%，上游其实回了 cache_read。
**根因**：流式默认不带 `include_usage`，很多上游就不回 usage；各家的 cache 字段拼写不一，没有映射。
**修复**：Completions hop 默认补 `include_usage`，把上游 cache 字段翻译成 `prompt_tokens_details.cached_tokens`；没有字段就不发明 0。

## 2026-09-09：代理透传 content-encoding: gzip 但 body 已被解压

**现象**：非流式响应带着 gzip 头，body 却是明文，客户端解压报错。
**根因**：undici fetch 自动解压，代理却保留了描述原始字节的 `content-encoding` / `content-length`。
**修复**：转发时剥掉这两个头，由 Node 重新分帧。

## 2026-09-08：账号刷新跨越切换或注销后误写凭据

**现象**：刷新期间切号会被切回；A 的永久失败可能删掉 B；注销后旧的刷新或额度补全可能复活账号。
**根因**：刷新按厂商共用 inflight，保存时重读 active；异步补全不校验来源快照。
**修复**：刷新按账号加登录代次归并，store 串行条件写回并校验来源凭据；元数据只差量写入来源账号，不激活。

## 2026-09-08：OAuth 错误回调无需 state 即可取消登录

**现象**：向 loopback 回调发一个不带 state 或 state 错误的 error 参数，就能终止合法登录。
**根因**：处理器在核对 state 之前就接受了 error。
**修复**：成功与失败回调都先校验 state，不匹配回 400。

## 2026-09-08：显式模型全关被后续同步重新开启（始 08-30）

**现象**：用户关掉一族全部模型后，同步或重启又把模型打开；也有反过来登录后全关、yaml 缺路由的旧状态。
**根因**：全关恢复逻辑分不清用户的选择和历史坏状态。
**修复**：持久化显式选择标记，同步尊重用户选择；没有标记的旧文件仍可恢复，新模型按默认开启。

## 2026-09-08：Kiro 交错工具调用被拼成同一个调用

**现象**：同一轮的多个工具被客户端合并成一个。
**根因**：流转换把 index 固定为 0。
**修复**：每个 `toolUseId` 分配稳定且互不相同的 index，参数分片统一转成字符串。

## 2026-09-08：Antigravity 流式多字节字符损坏

**现象**：中文、重音字符或 emoji 在网络分片处变成替换字符。
**根因**：每个 byte chunk 单独 `toString('utf8')`。
**修复**：用有状态的 `TextDecoder` 增量解码，EOF 时刷新。

## 2026-09-08：无响应体的上游回复令本地请求挂起

**现象**：上游回无 body 的响应（如 204）后，本地请求一直挂到客户端超时。
**根因**：body 为 null 时只提交了响应头就返回，没有结束本地响应。
**修复**：无 body 时走统一的释放 / 结束路径。

## 2026-09-06：切到 Codex 整卡闪入

**现象**：每次切页签，整张卡重新出现，入场动画一闪。
**根因**：条件渲染先卸载再挂载，叠加入场动画。
**修复**：各页签面板常驻，用 `hidden` 切换；重挂时先用上次的 status 画卡。

## 2026-09-06：未登录 Copilot 模型列表被收成「登录后同步」

**现象**：未登录家族的模型页只剩标题和登录按钮，看不到禁用的模型行。
**根因**：未登录时不渲染模型列表。
**修复**：未登录也画模型行，开关保持禁用。

## 2026-09-06：Cursor composer-2 下线致流中断「Stream ended without finish_reason」

**现象**：模型下线后，客户端只看到「Stream ended without finish_reason」。
**根因**：静态底表把已下线的模型塞回在线列表；首包前就发了 200 头，中途出错既没有错误内容也没有收尾。
**修复**：在线列表非空时以它为准；提取 Connect 错误说明；延迟到首包才提交头，并安全收尾。

## 2026-09-05：Ollama 每周条不画「n后重置」

**现象**：每周条只有剩余百分比，没有倒计时。
**根因**：接口的 weekly 窗口不给重置时间。
**修复**：按全局 UTC 7 天桶推算（周一 00:00 UTC）；接口给了时间则优先用接口的。

## 2026-09-05：GLM 体验套餐（Start Plan）对话 3007，决定不支持

**现象**：体验套餐对话一直报 `3007 captcha verify failed`。
**根因**：ZCode 给体验套餐的 hop 注入阿里云 captcha 头，插件不伪造。
**修复**：不支持体验套餐，导入时跳过 start-plan JWT。

## 2026-09-05：模型里看不到 GitHub Copilot

**现象**：用户找不到 Copilot 模型（本机未登录）。
**根因**：只有登录后才写路由；锁定组的标题不够明确，还被长列表顶出了视口。
**修复**：标题改为 `OAuth · GitHub Copilot`，未登录时给出「登录后同步」和登录入口。

## 2026-09-05：移除 OpenCode Go Free（Zen 匿名免费档）

**现象**：OpenCode Free / Go Free 页签与 `oauth-opencode` 路由仍在。
**根因**：维护者下架整条产品线；它原本是照 Hermes 做成的匿名 Zen 免费档，与 OpenCode Go 的产品意图不符。
**修复**：删掉 `src/oauth/opencode/`；`RETIRED_FAMILY_IDS` 仍 unset 残留的 `oauth-opencode`。OpenCode Go 另作 API key 家族接入。

## 2026-09-05：额度「n后重置」夹在两条进度条中间

**现象**：重置文案浮在两条窗口之间，分不清属于哪一条。
**根因**：文案画在整个 meter 后面，布局让它和下一条的标签同列。
**修复**：重置文案移进各自那条 meter，没有 `resetAt` 就不画。

## 2026-09-05：Copilot 用 OpenCode Ov23li8 换不出 tid=（Copilot Iv1 + tid）

**现象**：设备码登录后预览模型 400，Business 账号 403，换 token 端点 404。
**根因**：OpenCode 自家的 OAuth App 发 `gho_`，GitHub 不给它 vscode-chat session；VS Code 用的是公开的 `Iv1.b507a08c87ecfe98`。
**修复**：设备码改用 `Iv1` client_id 换 `tid=`；导入的 `gho_` 换票 404 时退回 raw Bearer（只有 GA 模型）。

## 2026-09-05：本地 DSH Cursor 缓存命中率显示为 0%（始 09-03）

**现象**：长 Cursor 会话 `cacheReadTokens` 一直是 0。
**根因**：hop 忽略了 `TurnEndedUpdate` 的 cache 字段；历史 turn 的 id 每跳都 `randomUUID()`，前缀字节全变。
**修复**：解码 cache 字段；turn id 改为内容哈希；`x-request-id` 与 original request id 对齐。

## 2026-09-05：本地 DSH Codex 缓存命中率异常偏低

**现象**：长会话加权命中约 27%，退出 plan 或重建 header 时缓存前缀被顶掉。
**根因**：转发丢了 `session-id` / `thread-id` / `x-client-request-id`；多余的 leading developer 留在 `input` 开头。
**修复**：三个头都等于 `prompt_cache_key`，重试时回放 `x-codex-turn-state`；剥掉与 instructions 重复的 leading developer，其余放到后缀。

## 2026-09-04：Grok 缓存命中率卡在 ~70%，热身后反复出现 512 token 块（始 08-30）

**现象**：多数步复用约 99%，但间歇出现 cache read 正好 512 的低命中，加权掉到约 70%。
**根因**：xAI 缓存按服务器分片，需要 grok-build 整套 sticky 头；Responses 要求 `input` 逐字节重放，而 snapshot 被插在了最前面。
**修复**：发完整 `x-grok-*` sticky 头（不发 Codex 头），钉住首个 system，snapshot 挂到后缀；分析器把「512 且复用 <10%」记为 affinity_miss。

## 2026-09-03：额度失败红字撑破账号卡

**现象**：额度读取失败时，长 JSON 单行贴出，冲出卡片右缘。
**根因**：原样拼接错误文本，提示不换行。
**修复**：只截取错误首行（≤160 字），允许任意断行，全文放进 `title`。

## 2026-09-03：Ollama 额度卡：无额度条、抬头是 ollama-sha8、周模型 note 溢出

**现象**：已登录卡没有套餐和剩余条，抬头是哈希 id；周用量 note 挤成一行溢出。
**根因**：`/api/me` 的字段是首字母大写的，却只读小写；`limits.*.usage` 是 0..1 分数；note 用 ` · ` 拼成一行。
**修复**：并行读 `/api/usage` 与 `/api/me`，按分数换算百分比，邮箱写回 session；note 每条换行。

## 2026-09-03：页签栏布局：九个 icon 挤一行、右侧空白、胶囊对不齐

**现象**：页签 icon 挤成一行或被压没，右侧留一大块空白。
**根因**：无列数的 flex-wrap，格子宽度可以被压到 0；nav 不吃剩余宽度。
**修复**：页签改为左侧供应商栏（见 `design-system/pages/settings-workbench.md`）；格子宽度固定，不允许被压到 0。

## 2026-09-03：Kimi Code 不能写自定义 api（Kimi api 闭集）；设备码过期要重开；Settings 图标空白

**现象**：`api: kimi-openai-completions` 让整段 `llm-pi-ai` 被丢；设备码过期后一直转圈；图标空白。
**根因**：DSH 的 `api` 只有三个值；`expired_token` 必须重新申请设备码；经典脚本 UI 不打包 `@lobehub/icons`（Settings 图标要内联）。
**修复**：改用 `openai-completions`；设备码过期自动重开；图标 path 内联进 `TAB_ICONS`。

## 2026-09-03：额度刷新时间：只精确到小时，两张卡一种日期一种倒计时（始 08-31）

**现象**：4 小时 32 分被显示成「5 小时后重置」；同一栏一张卡显示日期、另一张显示倒计时。
**根因**：按小时四舍五入；满 14 天就改用绝对日期。
**修复**：按天 / 小时 / 分钟拼接并省略 0 单位，额度重置一律用相对时间。

## 2026-09-03：GLM 账号卡身份显示内部 id，不是邮箱（GLM 身份 user.id，始 08-30）

**现象**：已登录卡抬头显示 **zcode**、poll 的 `user.id` 或短 handle，而不是用户名。
**根因**：`zcode` / `zai` / `bigmodel`、纯数字 uid、UUID、没有 `@` 的短 handle 都是智谱内部 id；官方展示的是 JWT `email` / `preferred_username` 或 userinfo。
**修复**：`isGlmOpaqueAccount` 拒绝这些值，身份按邮箱 → 电话 → 客户名取，拿不到就省略抬头；snapshot 回填已存的 opaque 行。

## 2026-09-03：Ollama contextWindow 不能猜家族默认；input 看 show 的 capabilities

**现象**：目录把 Cloud 窗口写成 128k / 200k / 256k 的家族默认值（有的超报，有的其实是 1M）；`glm-5.3-flash` 被标成纯文本。
**根因**：`/api/tags` 的 `details` 为空、没有 capabilities，家族正则不是 Cloud 的真实上限。
**修复**：窗口取 `POST /api/show` 的 `model_info.*.context_length`，`input` 取 show 的 `capabilities`（含 vision 即图文），名字正则只在 show 缺字段时兜底。

## 2026-09-03：Ollama Cloud — signin 不是 Bearer，无 cache-read

**现象**：社区把 `ollama signin` 的身份当 Cloud key 用，并指望有缓存命中率。
**根因**：本家族是 Cloud API key + Completions 薄透传；signin 身份不能当 Bearer，官方也不回 cache-read。
**修复**：只接受粘贴的 API key 或 `OLLAMA_API_KEY`；不发明 `cached_tokens`。

## 2026-09-03：Cursor 卡身份与套餐不对：抬头是 JWT `sub`，套餐显示 PRO、已用 0%

**现象**：卡片抬头显示 `provider|user_…`，Ultra 显示成 PRO，已用 0.454% 显示成 0%。
**根因**：身份在没有 email 时回落到 JWT `sub`；usage 接口没有 email，缺 `membershipType` 时默认 Pro；百分比被取整成 0。
**修复**：身份依次取 JWT email → 本机 `cachedEmail` → GetEmail / GetMe，永不显示 `sub`；套餐取 `individualMembershipType`；已用大于 0 但取整为 0 时显示 1。

## 2026-09-03：Cursor 额度条把美分封顶画成「40000 / 40000」

**现象**：卡片显示一条「40000 / 40000」，而仪表盘是两条已用百分比。
**根因**：解析只取美元封顶作 used / total，忽略了 `autoPercentUsed` / `apiPercentUsed`。
**修复**：改为 auto / api 两条产品条，按剩余画，重置时间取计费周期结束。

## 2026-09-03：Cursor 本机导入 — Keychain 可能弹授权，vscdb 键名可能改

**现象**：首次导入读 Keychain 会弹系统授权；Cursor 改了 `state.vscdb` 键名后导入变空。
**根因**：Keychain 与 vscdb 的 schema 归官方客户端所有，插件无法消除授权，也钉不死 schema。
**修复**：按 `CURSOR_ACCESS_TOKEN` → Keychain + vscdb → 本地 access 的顺序找；只在账号列表为空时自动导入。

## 2026-09-03：Cursor Connect/protobuf 是社区逆向，官方改线会断

**现象**：字段号、host 或 CLI 指纹一变，表现为 4xx、空流或工具步对不上。
**根因**：上游没有公开的稳定 REST，wire 不归本插件管。
**修复**：改线时对照社区协议与 `@cursor/sdk` 改 `src/oauth/cursor/`，不从别家抄 cache 或 hop；指纹钉在 `x-cursor-client-version`。

## 2026-09-03：Antigravity Cloud Code 400 — custom-tool JSON Schema、first-turn-must-be-user；不加 Client-Metadata 等头

**现象**：Claude / GPT-OSS 工具 400「Unknown name additionalProperties」；Gemini 3 首条是 `model` 也 400。
**根因**：Cloud Code 的 Claude / GPT 桥吃 protobuf `Schema` 而不是 JSON Schema；Gemini 3 要求第一条是 user。
**修复**：Gemini 用 `parametersJsonSchema`，Claude / GPT-OSS 用白名单过滤 `parameters`；以 model 开头时补一条 user；不加 `Client-Metadata` / `anthropic-beta` 等官方不发的头。

## 2026-09-03：Antigravity Gemini 3.8 Flash 线 id 是 `gemini-3.8-flash-high`

**现象**：官方选择器叫 Gemini 3.8 Flash，Gemini API 的裸 id `gemini-3.8-flash` 不是 Cloud Code 线 id。
**根因**：Cloud Code 用带 effort 后缀的 id，裸 id 会走错线。
**修复**：目录一行 `gemini-3.8-flash-high`，不把 `-low` / `-medium` 拆成独立行。

## 2026-09-03：Antigravity 工具轮 400 缺 `thought_signature`（始 09-01）

**现象**：报「Function call is missing a thought_signature」。
**根因**：签名在 part 级 `thoughtSignature` 上，DSH Completions 没有这个字段，回放工具轮时丢失。
**修复**：入站把签名放进 `tool_calls` 的 `extra_content.google`，出站按会话贴回 part；没有签名就丢掉该组 functionCall，结果改为 user 文本。

## 2026-09-03：Kiro 工具轮 400：复合 tool id、tool_result 与 tool_use 不相邻（始 09-01）；思考写成 XML

**现象**：`call_…|fc_…` 这类 id 超长且含 `|` 时 AWS 400；交错的工具结果报 `unexpected tool_use_id`；思考以 `<thinking>` 进了 content。
**根因**：id 没做合法化；按位置 flush 处理不了错位的结果，额外的 system 片段还可能插进一对调用与结果之间。
**修复**：非法 id 稳定映射成 `tooluse_<32>`（调用和结果用同一函数）；先按 id 重排错位结果再 flush，system 片段挂到后缀；思考走 `reasoning_content`。

## 2026-09-01：Codex 上游 400 `Unsupported parameter: session_id`

**现象**：带 `session_id` 的请求被 chatgpt.com 400，只带同值的 `prompt_cache_key` 则 200。
**根因**：`applyCodexCache` 把 `session_id` 抄到 `prompt_cache_key` 后，原字段仍留在 body 里。
**修复**：写出 `prompt_cache_key` 后删除 `session_id`；亲和头与它同值，不抄给别家。

## 2026-09-01：Kiro overlay 后 usage 仍 0/0/0 — 现场没有 metadataEvent（Kiro usage 真实事件）

**现象**：每个 200 的 usage 都是 0/0/0。
**根因**：实际事件流只有 `contextUsageEvent`（百分比）和 `meteringEvent`（credit），很少有 `metadataEvent.tokenUsage`。
**修复**：有 `tokenUsage` 就用；否则 `prompt_tokens` = 百分比 × 该行窗口，输出按字数估；不把 credit 当 token，不编造 `cached_tokens`。

## 2026-09-01：Kiro 0.0.57 live — 每轮 refresh 429

**现象**：多数轮死在 `kiro social refresh failed (HTTP 429)`，DSH 看到 500。
**根因**：已有过期时间时新的 `expiresIn` 被丢弃，于是每个请求都刷新；刷新错误不带状态码，代理回落成 500。
**修复**：刷新成功一律写回新的过期时间；错误带 `status` 与 `Retry-After` 原样回 429。

## 2026-08-31：Antigravity 长聊缓存命中率 0 / Google 不回 cached_tokens（隐式缓存前缀）

**现象**：命中率 0%，钉住 system 后 Google 仍常不回 `cachedContentTokenCount`。
**根因**：Gemini 隐式缓存吃 systemInstruction + contents 前缀 + tools，DSH 每步的 snapshot、工具键顺序与 effort 抖动都会破坏前缀；缺会话时各模型共用一个回退 id。
**修复**：钉住 systemInstruction / tools / thinking，多余的 snapshot 挪到末尾 user；回退 id 带 model；兼读多种 cache 字段拼写。

## 2026-08-31：Kiro 18 个模型多轮 cacheReadInputTokens 偏低（Kiro 缓存）

**现象**：长 system + tools 前缀下多轮缓存偏低；同一会话换模型仍打到同一个 AWS conversation。
**根因**：全部 system 每轮都拼进 `currentMessage`，破坏了前缀；`conversationId` 回落到不带 model 的裸常量。
**修复**：system 钉在 history 首对 user + ack，增量挂后缀；`conversationId` 带 model，缺 pin 时用 `dsh-kiro:<model>`（命中按前缀，见 09-29 Kiro 缓存条）。

## 2026-08-31：Kiro 登录后 settings.yaml 没有 oauth-kiro（Kiro reasoningEfforts / GLM Anthropic compat）

**现象**：Kiro 已登录、已勾选，`llm-pi-ai.providers` 里仍没有 `oauth-kiro`。
**根因**：原子 mutate 被整段拒绝：Kiro GPT 的 effort 键写成了厂商拼写 `none`，GLM Anthropic 路由还带着 Completions 专用的 `compat`。
**修复**：厂商拼写只进 value（`off: "none"`）；Anthropic 路由不写 Completions compat；mutate 前先 `assertDshServiceableProvider`。

## 2026-08-31：Kiro 导入只吃第一条，且 IDE token 丢了 IdC client 注册

**现象**：导入本机会话只得到第一个账号；Builder ID 导入后刷新缺 `clientId` / `clientSecret`。
**根因**：导入器照 Codex「找一份 auth.json」写，SSO 缓存里的 token 与 `{hash}.json` 里的 OIDC 注册被当成无关文件。
**修复**：写入全部账号，IDE token 按 `clientIdHash` 配对注册；「粘贴凭证」共用同一解析器。

## 2026-08-31：GLM 默认协议应对齐 ZCode Anthropic，150% 不是协议证明（GLM Anthropic）

**现象**：插件把 GLM 写成 Completions，而 ZCode Desktop 默认走 Anthropic Messages。
**根因**：把「有 Completions 兼容」当成了该选的 `api`；倍数按身份发放，与协议无关。
**修复**：`oauth-glm` 用 `anthropic-messages`；不给 Anthropic 路由写 Completions 专用 compat。

## 2026-08-31：各家 OAuth 缓存混用成 Codex 一套

**现象**：Grok / GLM / Kiro / Antigravity 共用 Codex 的会话 id 清洗与 pin，被写进 `prompt_cache_key` 和 Codex 的 `session-id` 头。
**根因**：把「清洗 DSH 会话 id」当成可共享的缓存实现，而各家的键、头、前缀钉法都不同。
**修复**：每家一个 `src/oauth/<id>/cache.ts`，`proxy.ts` 只分发；Codex / Grok 的缓存字段不写给别家（见 `docs/rules.md`）。

## 2026-08-31：Antigravity 额度条 / 套餐 STANDARD（始 08-30）

**现象**：卡片无重置时间、按模型系列各一条，套餐显示 STANDARD TIER；官方是两组各 Weekly + Five Hour。
**根因**：只读了 `fetchAvailableModels` 的 5 小时额度和 Code Assist SKU。
**修复**：先读 `retrieveUserQuotaSummary`，失败回落 `fetchAvailableModels`；两组各画 weekly + 5h；套餐优先 `paidTier`。

## 2026-08-31：Kiro 对话 501 → generateAssistantResponse 翻译（始 08-30）

**现象**：Kiro 对话回 501。
**根因**：上游是 CodeWhisperer EventStream 的 `GenerateAssistantResponse`，不是 OpenAI 接口，早期版本只放了 501 占位。
**修复**：`src/oauth/kiro/request.ts` 做 messages ↔ `conversationState` 与 eventstream 的翻译；`/kiro/v1/responses` 仍回 501。

## 2026-08-31：Antigravity 流式对话「用量 0 tok」且首 token 从半句开始

**现象**：用量显示 0 tok，第一段文本从正文中途开始。
**根因**：Google SSE 的 `part.text` 是累计全文，被当成了 delta；只含 usage / finish 的末帧被丢。
**修复**：累计帧只发新后缀，结束前必写带 usage 的收尾 chunk，思考 token 计入输出。

## 2026-08-31：Kiro 模型没有思考深度，也没标明 text / image

**现象**：选择器里的 Claude / GPT 没有思考档，看不出是否支持图片。
**根因**：目录行缺 `reasoningEfforts` 与 `input`。
**修复**：每行写 `reasoningEfforts` 与 `input`（后改为从活目录的 schema 读取，见 Kiro README）。

## 2026-08-31：Kiro 登录成功后「打开授权页」还在

**现象**：已登录，卡片下方仍显示「打开授权页」。
**根因**：授权 URL 只在登出或取消时才清掉。
**修复**：配对码与授权页只在登录进行中时渲染。

## 2026-09-30：DSH 换模型会丢掉 reasoningEffort，选择器回到 Default（插件的恢复已删）

**现象**：设成 High 后换模型，选择器回到 Default。
**根因**：DSH 换模型时只带新模型的 `defaultEffort`，不沿用上一档。
**修复**：08-31 做过「记住上次显式档位、换模型时还原」；9-30 删除：它监听的 `settings/updated` 现在的宿主已不发（只剩 `settings/document-updated`），`reasoning-effort.json` 9-22 起没写过，早已不生效，而且全插件共用一个值，会把别家的档位（如 DeepSeek 的 max）带进 Kiro Opus。

## 2026-08-31：Kiro Social 换票 HTTP 500（`redirect_uri`，始 08-30）

**现象**：走完授权页后换票报 HTTP 500。
**根因**：Kiro 换票要的是落地的回调 URL（path + `login_option`），与授权时 origin-only 的 `redirect_uri` 不同，对不上就 500。
**修复**：授权 URL 保持 origin-only 的 `http://localhost:<port>`，换票用落地 URL；`127.0.0.1` 改写为 `localhost`。

## 2026-08-31：Antigravity 对话 403 VALIDATION_REQUIRED 被显示成「API 密钥无效」

**现象**：额度正常，对话报 403 `VALIDATION_REQUIRED`，DSH 显示「API 密钥无效」。
**根因**：这是账号验证闸，不是 refresh 失效，原样转发 403 被宿主当成 AUTH。
**修复**：改写为 400（非 AUTH），卡片提示并打开 `validationUrl`。

## 2026-08-30：GLM 思考链被清（Antigravity sessionId）

**现象**：GLM-5.3 / Flash 对话丢了思考前缀。
**根因**：思考模式要求 `clear_thinking: false` 并回放思考；对 5.3 / Flash 发 `type: disabled` 会 400。
**修复**：5.3 / Flash 始终开启思考且 `clear_thinking: false`，保留并回放 `reasoning_content`。

## 2026-08-30：Antigravity Gemini 长会话 400 INVALID_ARGUMENT — function_response 列表

**现象**：报「Proto field is not repeating, cannot start list」。
**根因**：`functionResponse.response` 是单个 Struct，工具 content 数组被写成了 JSON 数组。
**修复**：对象原样，数组 / 标量包成 `{ result }`；连续的工具结果合成多个 parts，绝不写成数组。

## 2026-08-30：GLM 首轮 400 `1214 角色信息不正确`

**现象**：新会话第一轮注入系统提示后 400「角色信息不正确」。
**根因**：DSH 的系统提示是 `role: "developer"`，Coding Plan 不认。
**修复**：GLM 分支把 `developer` 改成 `system`。

## 2026-08-30：Antigravity 指纹 / Cloud Code 主机必须像官方 hub，不像 IDE / 第三方包装

**现象**：打 prod `cloudcode-pa`、用旧 UA 或混用 IDE / 第三方标识，会被 Google 403 或封号。
**根因**：控制面与对话面必须是同一套官方 Antigravity hub 身份。
**修复**：默认 `daily-cloudcode-pa`，只在 5xx / 传输失败时回落 prod；UA 取本机 Antigravity.app 版本（有地板值）；缺 `projectId` 直接 403。

## 2026-08-30：GLM 对话/额度带第三方 UA，拿不到 ZCode 1.5 倍额度（GLM UA）

**现象**：上游按插件的第三方 UA 记账。
**根因**：倍数按身份（ZCode Desktop UA / `X-ZCode-*`）发放，不按协议。
**修复**：对话与额度用 ZCode 的 UA、`X-ZCode-*` 与 Referer；不抄 claude-cli 伪装头。

## 2026-08-30：GLM 额度两条「本周期」，没有 5 小时 / 每周 / ZCode MCP（GLM 额度窗口）

**现象**：两条额度都标「本周期」，官方是 5 小时 + 每周，MCP 另算。
**根因**：`limits[]` 用 `type` / `unit` + `number` 区分窗口，旧解析只认 duration 字符串。
**修复**：映射成 primary / weekly / mcp 三条。

## 2026-08-30：GLM 思考深度没写进目录，会话选不了

**现象**：GLM-5.3 / Flash 没有思考档，上游一直跑默认的 max。
**根因**：目录 `reasoningEfforts: false`，Completions 不会自己猜。
**修复**：5.3 / Flash 写 low / high / max，Turbo 仍为 `false`。

## 2026-08-30：关于页假安装入口（zip 三行 + 打开发布页）

**现象**：关于页把一份通用 zip 拆成 Win / macOS / Linux 三行下载。
**根因**：`pickDownloads` 把通用 zip 复制成了三个假安装器。
**修复**：通用 zip 不生成下载行，去掉发布页入口。

## 2026-08-30：Grok Fast 无加速；Codex Fast 只靠 body 字段（Grok/Codex Fast）

**现象**：Grok `-fast` 回显 priority 却不提速；Codex `-fast` 回显 default。
**根因**：xAI 接受 priority 但不给吞吐；Codex 还需要 `x-codex-routing-hint` 与 `store: false`。
**修复**：删掉 Grok Fast，永不写 Grok 的 `service_tier`；Codex 合格的 `-fast` 剥后缀并发 priority + routing hint + `store: false`。

## 2026-08-30：智谱 GLM 双站 OAuth / BigModel init 500

**现象**：国内账号打到 `api.z.ai`；加了中国站按钮后 CLI init 500。
**根因**：ZCode 分 Z.ai（`zai`）与 BigModel（`bigmodel`），国内 CLI provider id 被误写成 `zcode`（那是授权 URL 的 app id）。
**修复**：两颗登录按钮，BigModel 用 `bigmodel`；session 带 `region`，账号 id 带站点后缀。

## 2026-08-30：多个账号挤在一条横条里，额度只显示当前账号

**现象**：多账号挤成横条，非当前账号要先切换才能看额度。
**根因**：额度缓存按 provider 只存当前 session，UI 只在当前账号上挂额度。
**修复**：一个 session 一张卡、额度在卡内；缓存键 `provider\0accountId`，snapshot 为每个已存账号补齐额度。


## 2026-09-30：Codex `gpt-6.1-sol` 探查不到 = `CODEX_CLIENT_VERSION` 钉得低于下发门

**现象**：`npm run models` 干跑 `codex +0`，但 Codex CLI 已列 GPT-6.1 Sol。
**根因**：活目录 `GET .../codex/models?client_version=` 按版本分档下发——6.1 要 ≥ 0.159.0，钉住的 0.155.1 下后端只回 9 行。与 2026-09-23 那次（6 Sol/Luna ≥ 0.155.0）同一机制。
**修复**：`CODEX_CLIENT_VERSION` 升到 npm latest `0.159.0`（UA 同步）；目录补 `gpt-6.1-sol`（272K/872K、image、off–max + Fast）。钉住版本从此跟 latest 走，不随旧注释停住。

## 2026-09-30：GLM BigModel 登录后聊天全挂 500「1234 网络错误」（#168）

**现象**：bigmodel 区域 OAuth 登录、额度、身份全正常，但所有模型的补全一律失败：网关 `zcode.z.ai/api/v1/ultra/anthropic` 401 1002「Authorization Token非法」→ 回退直连 `open.bigmodel.cn` 500 `1234 网络错误`；任何时段重试一样。
**根因**：`completeGlmCli` 对 bigmodel 不铸 key，把 poll 的 OAuth business token（`data.bigmodel.access_token`）直接当聊天 bearer。该 token 过得了鉴权，但服务端拿它找不到 Coding Plan 上下文，内部转发失败回误导性的「1234 网络错误」——导入路径 `glmKeyFromZcodeCredentials` 的注释早就写了同一结论（业务 JWT「不是 chat key，打 Coding Plan 对话稳定 500」），直接登录路径没同步。官方 ZCode 客户端就是自动在账号上开 API Key 聊天的。附带实测：bigmodel 的 z/login（`/api/auth/z/login`）对 poll token 回 `500 z.ai用户信息异常`（z.ai 身份专用），但 biz/keys API（getCustomerInfo / api_keys / copy）直接认 OAuth token；`getCustomerInfo` 只认 OAuth token（API Key 403「APIKey not allow access」），所以 OAuth token 必须留在 `oauthAccess`。
**修复**：`mintGlmApiKey` 的 biz bearer 按区域取（z.ai 走 z/login；bigmodel 用 OAuth token 直探 getCustomerInfo、失败才回退 z/login）；`completeGlmCli` 双区域统一铸造，OAuth token 存 `oauthAccess`，bigmodel 铸失败降级回 OAuth token（身份 / 额度可用）。存量会话（bigmodel + accessToken 是三段 JWT）由 `upgradeGlmLegacyBearers` 在 snapshot sweep 里每进程每账号自动重铸一次，失败保留原 bearer。（v0.0.110 及之前登录的账号即此形态。）

## 2026-09-30：Kiro Social 登录选「Your organization」报 missing authorization code（#167）

**现象**：Social 登录打开 portal 授权页后选「Your organization」、填组织 URL 与 Region、点 Continue，页面报 `missing authorization code`，登录挂起直到超时（Windows 11 企业版必现）。
**根因**：portal 对组织账号不给授权码，而是回调 `login_option=awsidc&issuer_url=…&idc_region=…`（无 `code`）——这是让客户端改走 IAM Identity Center 设备流的指令。通用 flow 引擎的 social 回调只认 `code`，无 code 时回 400 且不 settle。
**修复**：`OAuthFlowManager` 的 `spec.collect` 支持 async 并新增 `spec.callbackPage(result)` 自定义回调页；`kiroSocialFlow({ startIdc })` 的 `collect` 用 `kiroIdcRedirectOf` 识别该回调（无 code + `awsidc` + https `issuer_url`；`idc_region` 非法落回默认区），转手 `KiroIdcFlowManager` 设备流，回调页把浏览器重定向到设备确认页（预填配对码）；`completePkce` 对该 pivot 结果走 `completeKiroIdc` 收尾。手粘同样形状的回调 URL 也走同一 pivot。


## 2026-08-26：`Error: tool call timed out after 30000ms` 不是本插件

**现象**：会话里 glob / read / grep 超时，但 TRANSPORT 为 0。
**根因**：fs 工具由 `@deepseek-ai/dsh-tool-fs-search` 执行，默认超时 30s；本插件不跑这些工具。
**修复**：不在本插件处理；要加长超时去改 `dsh-tool-fs-search`。
