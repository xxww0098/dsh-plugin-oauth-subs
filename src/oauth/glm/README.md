# GLM OAuth（Z.ai / BigModel）

本文件是 `src/oauth/glm/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

Zhipu **Coding Plan**（付费 Lite/Pro/Max）。两个站点、同一套 ZCode CLI poll。默认对话走 **Anthropic Messages**（ZCode Desktop 默认协议），**不**走 chatgpt.com。

**ZCode 已开源**（<https://github.com/zai-org/ZCode>，`872ad96 feat: open source`，tree `3.14.0`）。本文件里「官方怎么发」都能追到那一份源码：网关改写、身份头、catalog 思考 map、Anthropic 缓存 breakpoint。

官方 Anthropic：<https://docs.z.ai/devpack/quick-start>
官方缓存：<https://docs.z.ai/guides/capabilities/cache>
官方思考（Completions 形）：<https://docs.z.ai/guides/capabilities/thinking-mode>

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | 区域、端点（含 ZCode 网关 + 直连回退）、CLI init/poll、biz bearer（z.ai z/login 交换 / BigModel 直用 OAuth token）+ 铸 key、官方身份头、会话 |
| [`cli-flow.ts`](cli-flow.ts) | 浏览器打开 `authorize_url`，轮询 `/oauth/cli/poll/{flow_id}`。无 loopback、无 PKCE |
| [`request.ts`](request.ts) | Anthropic 官方思考 map（`thinking` + `output_config.effort`）+ Completions 残留；再调 cache |
| [`cache.ts`](cache.ts) | 隐式前缀哈希。Completions：钉首段 system，多余停 **messages 末尾**。Anthropic：钉 system 首块 `cache_control` + **最新非 system 消息滚动 breakpoint**。剥掉 Codex `prompt_cache_key` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'glm'` + `wire === 'anthropic'` → `normalizeGlmAnthropicBody`；Completions 残留 → `normalizeGlmChatBody`。`x-session-id` 在 `glmDesktopHeaders`；Anthropic 另加 `anthropic-version`。
额度：[`quota.ts`](quota.ts) `fetchGlmQuota` / `parseGlmQuota` / `mergeGlmToolUsage`；重置卡 `parseGlmResetCards` / `consumeGlmResetCard`。
套餐：`GLM_PLAN_NAMES`（`coding_pro` → **Pro**，不要和 Codex `pro` → Pro 20x 搞混）。
协议：[`../models.ts`](../models.ts) `api: anthropic-messages`，`baseURL: ${origin}/glm`（Anthropic SDK 打 `{baseURL}/v1/messages`）。
**体验套餐（Start Plan）不支持：** ZCode Desktop 对 zcode-plan hop 强制注入阿里云 captcha 头，插件不伪造、不接 captcha SDK，没这颗头网关 `400 code 3007 captcha verify failed`。目录 / 路由只留 Coding Plan；导入跳过 start-plan JWT。试用对话请在 ZCode.app。

## 登录

ZCode 欢迎页两颗按钮 = 两个 CLI provider id：**`zai`**（全球）和 **`bigmodel`**（国内）。`zcode` 当 provider 会 500。

```text
POST zcode.z.ai/api/v1/oauth/cli/init   { provider: "zai" | "bigmodel" }
打开 data.authorize_url
轮询 /oauth/cli/poll/{flow_id}

两个区域都铸 id.secret（Coding Plan 聊天 bearer）：
Z.ai：     data.zai.access_token → POST api.z.ai/api/auth/z/login 换 biz token → 铸 id.secret
BigModel： data.bigmodel.access_token 直接当 biz/keys API 的 bearer 铸 id.secret
           （z/login 打 open.bigmodel.cn 回 500「z.ai用户信息异常」，那是 z.ai 身份专用）；
           铸 key 失败降级回 OAuth token（身份 / 额度仍可用，聊天与修复前一致）；
           OAuth token 存 oauthAccess 供 userinfo；
           data.token（zcode JWT）只给 Start Plan，绝不能当 bearer
```

入口：`GlmCliFlowManager.start` → `glmCliInit` / `glmCliPoll` → `completeGlmCli` → `glmSession`。

轮询语义照官方 `auth-login-polling.ts`：`expires_at` 是 **epoch 秒**（×1000，不是进程自己编的 5 分钟）；`poll_interval_sec` 地板 **1s**；`status: failed` 与未知状态**立即**失败（`glm authorization failed` + 服务端 `msg`）；5xx / 408 / 429 / 传输错误按间隔重试，其它 4xx 与业务信封错误终止。浏览器授权页报「Authorization Failed / 授权失败」时，插件会在一个轮询周期内给出同一结论，而不是空转到超时。
**上游事故（先查再当 bug）**：浏览器落地页的「Authorization Failed / 授权失败」是 `zcode.z.ai/api/v1/oauth/cli/callback/{provider}` 兑换授权码失败后自己渲染的页；失败会把 flow 判死，poll 拿 `3004 invalid_flow`。官方 tracker 已挂：zai-org/feedback #718（BigModel authCode 兑换必现失败，30+ 次 0 成功）、#705（3.12.3 网桥 / deep-link 双重核销 → 500 `2007`）、#523（Linux token 端点 500 `2007`）、#116（zai 侧 business token `zai_oauth_required`）。客户端 init/poll 参数与官方 CLI `auth-login-polling.ts` 逐字一致，改 flow 形状修不了服务端。
`glmLoginFailureMessage` 把 `invalid_flow` / `2007 http error` 译成带 tracker 与替代路径的卡片报错。**绕行**：换另一区域按钮；或在厂商控制台建 Coding Plan API key，用 GLM 页的 **API key** 框粘贴（`AuthController.useKey`：`id.secret` / Coding Plan 密钥 + 区域，存成 `account: api-key`）。ZCode Desktop 那条 `redirect_uri→/app/oauth/login` 改写只服务 `zcode://` 深链，落地页的网桥 GET 同一个失败接口，不要抄。
刷新：Coding Plan key 不过期（`GLM_NEVER_EXPIRES`），`refreshGlm` 是空操作。
导入：`importGlmAuth` 读本机 ZCode 配置，**先 `credentials.json` 后 `config.json`**。`glmKeyFromZcodeCredentials` 解 `enc:v1` AES-256-GCM（SHA-256 over `ZCODE_CREDENTIAL_SECRET` 或机器派生 fallback）。**对话+额度的真 bearer 是 provisioned `account-provider:coding-plan:account:<region>-…-coding-plan:account:<id>:api-key`**（ZCode OAuth 后 provision 进 provider 条目的 key）；`oauth:<region>:access_token` 业务 JWT 只能打 monitor/userinfo，**不是 chat key**（打 Coding Plan 对话稳定 500），降为 `oauthAccess` 供身份回填；`zcodejwttoken` 仅身份。没有 provisioned key 才退回 OAuth token。config.json 的 `options.apiKey` 可能是已被标 `coding_plan_not_entitled` 的旧死 key（error.md 2026-09-21 GLM「不存在coding plan」）。`glmKeyFromZcodeConfig` 认 `builtin:*-coding-plan`（含 `options.baseURL` 含 `zcode-plan` 的 JWT key——那是 start-plan，直接跳过）。可用 key 优先；**只剩系统禁用的 coding-plan key 也导入**（`glmKeyFromZcodeConfig` 返回 `usable` + `systemDisabledReason`，`importGlmAuth` 把原因写进结果 `note`）。理由：那个 flag 来自 ZCode 的缓存权益检查，会过期也会错（平台 `coding_plan_system_busy` 时一样标 `coding_plan_not_entitled`），而 key 就是 ZCode provider 条目里那把；拒绝它等于用户本机没有任何可导入的凭据，真假交给额度 / 对话回答。**唯一硬跳过的是 start-plan JWT**（zcode-plan hop 是 captcha 墙）。不读 `coding-plan-cache.json`（`enabled` 已够）。卡片身份只走 `pickGlmHumanAccount`：邮箱，其次电话，再次 `customerName` / nickname。**禁止**显示 `zcode` / `zai` / `bigmodel` / `glm`、poll `user.id`、JWT `sub` / `user_id`、数字 uid。userinfo 失败就空着抬头，不要回落到 uid。已存的 opaque `account` 在 snapshot 时打 userinfo 回填（`#resolveGlmIdentities`），每账号每 60s 最多一次、登录态变化重置；`getJson` / `postJson` 10s 超时，挂住的 userinfo 不会卡住合并后的 snapshot。

Settings：两颗堆叠登录按钮（只这一家）。Tab 图标用 **Z.ai**（`zai`），不是智谱字母。

## 团队套餐（Team Plan）

组织在 Z.ai / BigModel 买的 **GLM Coding Plan 团队套餐**按席位发给成员，由 ZCode 3.14.3 `host/index.js` 定义、magpie `internal/provider/zcode_team.go` 对照（本节同步自后者，插件侧落地为登录自动发现 + TEAM 作用域额度）：

```text
登录 mint 顺序（照 magpie zcodeSignedIn，个人优先）：
  getCustomerInfo → 个人项目 = 非 projectType-2 的默认项目（type 2 一律跳过）
    → 铸个人 key（现状）→ GET /api/biz/subscription/list 找 status VALID
      VALID / 探不出（传输失败不当「无套餐」）→ 个人会话（现状行为）
      明确无 VALID → 团队兜底：
        projectType 2 的项目逐个 GET /api/biz/team/subscribe/product/querySubscribeDetail
          EFFECTIVE + memberGrantStatus VALID → 铸团队 key（name zcode-team-api-key, keyType 2）
            → 会话带 team {org, project}，planType = productName（缺省 team → Team）
          EFFECTIVE + UNASSIGNED → 「找管理员要席位」
          EXPIRED → 「团队套餐已到期」
        个人 key 已铸出 → 照旧返回个人会话（不回归现有登录），配额卡继续显示厂商原因
        无个人项目且无席位 → 登录失败并给上面的话
```

- 团队项目发现：`organizations[].projects[]` 里 `projectType`/`type` == `2`（`isBigModelTeamCodingPlanProject`）。
- 团队业务/额度端点额外带 `Bigmodel-Organization` / `Bigmodel-Project`，`Set-Language` BigModel 用 `zh`、Z.ai 用 `en`（`createBigModelUsageHeaders`）。
- **对话不加团队头**：团队 key 像个人 key 一样携带（magpie：requests carry it as a person's key is carried, with no more headers）——hop 不动。
- 会话 `team {org, project}` 只存私有 `auth.json`；`publicSession` 不外露（非 token 但属内部 id）。
- 手粘 API key / ZCode 导入不识别团队切换（`setting.json` 的 `team-coding-plan` 选择不读）：粘贴的团队 key 聊天可用，额度按个人作用域读，卡片可能报业务信封错误——这是已知边界，不是 bug。
- BigModel 的 `subscribeEndTime` 按 +08:00 读、Z.ai 按 UTC（同重置卡时区约定）；unix 秒 / 毫秒都认（`zcodeWhen`）。

## 协议

DSH `llm-pi-ai` `api` 是闭集：`openai-completions` | `openai-responses` | `anthropic-messages`。选和上游原生最贴的那一种。

Z.AI Coding Plan 同时开三条：

| 上游 | URL | 是不是 Coding Plan | 选不选 |
|---|---|---|---|
| Anthropic Messages（官方网关） | `https://zcode.z.ai/api/v1/ultra[-zai]/anthropic/v1/messages` | 是。官方客户端**总是**把 Coding Plan 端点改写到网关 | **默认** |
| Anthropic Messages（直连回退） | `https://api.z.ai/api/anthropic[/v1/messages]`、`https://open.bigmodel.cn/api/anthropic[/v1/messages]` | 是 | 只作网关拒绝时的回退 |
| OpenAI Completions | `…/coding/paas/v4/chat/completions` | 是 | 残留 hop，直到下一次 `sync()`；不走网关 |
| OpenAI Responses | `https://api.z.ai/api/v1` | **不是** Coding Plan 专用 | 不选 |

所以 `oauth-glm` 写 `api: anthropic-messages`。不要改 `openai-responses`。

## 对话

```text
DSH anthropic-messages  →  本机代理 POST /glm/v1/messages  →
  Coding Plan zai:      zcode.z.ai/api/v1/ultra-zai/anthropic/v1/messages
  Coding Plan bigmodel: zcode.z.ai/api/v1/ultra/anthropic/v1/messages
  网关 401/403/404 时一次性回退直连（api.z.ai / open.bigmodel.cn）

残留（下次 sync 前）：
DSH openai-completions  →  POST /glm/v1/chat/completions  →
  …/api/coding/paas/v4/chat/completions
```

网关不是本插件发明的：`official-coding-plan-gateway.ts` 按协议 + 主机 + 有效端口 + 路径精确匹配两个官方 Anthropic 端点，命中即改发 `zcode.z.ai`，**方法 / 正文 / query / 除 `host` 外的全部头（含 `authorization`）原样透传**；NOTICE.md「官方 Coding Plan 模型网关转发」写的是同一件事，网关侧做套餐权益校验后转发。直连不是官方路径，回退只为网关拒绝这把 key 时不断对话。

`/glm/v1/v1/messages` 只防旧 `baseURL: ${origin}/glm/v1` 被 Anthropic SDK 再拼一层。

头：`glmAnthropicHeaders` = `glmUpstreamHeaders` + `anthropic-version: 2023-06-01`。身份/环境头照 `bootstrap/src/model-config.ts`（`buildCliZCodeSourceHeaders`）+ `runtime-platform-headers.ts`：`user-agent`、`X-ZCode-App-Version`、`X-ZCode-Agent: glm`、`X-Release-Channel`、`X-Client-Language`、`X-Client-Timezone`、`X-Platform`、`X-Os-Category`、`X-Os-Version`、`HTTP-Referer`、`X-Title`；请求归因头照 `runner-attribution.ts`：`x-session-id`、`x-request-id`、`x-zcode-trace-id`、`x-query-id`、`x-zcode-session-type`（本 hop 统一 `main`）。SSE 原样转发（DSH anthropic-messages 要的就是 Anthropic SSE）。版本仍钉 Desktop `3.10.1`；开源 tree 是 `3.14.0`，官方下载页 `3.14.1`，未做活测就不动这个指纹。

`normalizeGlmAnthropicBody`：

1. Anthropic 必须有 `max_tokens`；缺则按 catalog 上限（5.3 / Flash / 5.2 = 128000，Turbo = 64000）。
2. `applyGlmAnthropicThinking`：官方 catalog map（见「模型」），5.3 / Flash 强制 `thinking: { type: enabled }`，5.2 保留 `disabled`，Turbo 不强制开；同时**删掉** Anthropic-only 的 `budget_tokens` / `display` 与 `reasoning_effort`，只留 `output_config.effort`。
3. `applyGlmAnthropicCache`（见下）。

`normalizeGlmChatBody`（残留 Completions）：

1. 非 `system/user/assistant/tool` 的角色（DSH `developer`）改成 `system`，否则 400 `1214 角色信息不正确`。
2. assistant 的 `reasoning` 补成 `reasoning_content`。
3. 同一套 `applyGlmThinking`。
4. `applyGlmCache`。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"glm"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

最近核对：2026-09-29，官方 devpack overview + [glm-5.3 模型页](https://docs.z.ai/guides/llm/glm-5.3) + ZCode catalog。

- 收哪些 id：官方 devpack overview 只保证 GLM-5.3 / GLM-5.3-Flash，历史 id 由套餐自动改道。目录收 ZCode `builtinProviderModelRules` 仍启用的那组，外加 maintainer 既有取舍（Turbo）。Coding Plan `/models` 端点只给 id，参数取 ZCode catalog 与官方模型页。
- 窗口：基线 `contextWindow` 是**套餐网关实际收的输入上限**，不是官方模型页的最大窗（例：5.3 官方写 1M，套餐只收 400K）。基线定在套餐上限，宿主压缩才会先于网关拒绝；官方最大窗挂在行的 `maxContextWindow`，作为模型页自定义输入窗的上限（见 [`docs/models.md`](../../../docs/models.md) 自定义窗口）。不派生 `-1m` 变体行；hop 剥后缀逻辑只为兼容旧路由。
- 输入：catalog 里的 video / pdf 剥掉，只留 text / image。
- 不进目录（取舍经过见 [`docs/error.md`](../../../docs/error.md) 2026-09-21 GLM 目录取舍）：
  - `glm-5.3-flashx`：官方 Flash 文档写明「not yet available on the plan」；订阅后端不服务的模型不进目录。官方上线再补。
  - `glm-5.2` 等改道 id：后端按 5.3 处理，5.2 的 `off` 档（`thinking.type: disabled`）会 400（5.3 强制思考）。proxy 仍保留 5.2 的线上形状，给旧 session / 手写路由兜底，但 picker 不复活它（`GLM_STALE`）。

思考的线上形状来自 catalog `modelApiRules`（`apiTypeMatch: anthropic-messages`）：5.3 / Flash `{"thinking":{"type":"enabled"},"output_config":{"effort":<level>}}`；5.2 `disabled` → `{"thinking":{"type":"disabled"}}`，否则同上；Turbo 只有 `thinking.type`。`reasoningEfforts` 的值就是 `output_config.effort` 的拼写，路由 compat 写 `forceAdaptiveThinking` 让 pi-ai 把 picker 档位派发成 `output_config.effort`；`allowEmptySignature` 让没有 signature 的 thinking block 按 `signature: ""` 回放（`anthropic-reasoning-metadata.ts` 同款），不被降级成 text。

Anthropic 路由**不要**写任何 Completions-only `compat`（`supportsReasoningEffort`、`thinkingFormat`）。`forceAdaptiveThinking` / `allowEmptySignature` 是 `anthropic-messages` 自己的 compat 字段（DSH `COMPAT_GATES`）。DSH `assertServiceable` 会拒掉 Anthropic 路由上的 Completions compat，整段原子 mutate 失败，`oauth-kiro` 也写不进 settings.yaml。Kiro / Antigravity 仍是 `openai-completions`，可以保留 `supportsReasoningEffort`。

### 上下文与压缩

压缩阈值由宿主 `@deepseek-ai/dsh-compaction-basic`（`resolveCompactSpec`）决定，不是本插件发明的算法：

```text
thresholdTokens = floor(min(W × thresholdRatio, W − O − headroomTokens))
retainTokens    = floor((W − O) × retainRatio)        # 逐字保留的近期历史
触发：最新一次路由请求 envelope 的估算 token ≥ thresholdTokens
```

默认 `thresholdRatio 0.8` / `retainRatio 0.16` / `headroomTokens 65536`。`O` = 该请求预留的输出（生效 `maxTokens`；本 hop 路由写的是 `min(厂商上限, 32768)`，见 [`../models.ts`](../models.ts) `HARNESS_REQUEST_MAX_TOKENS`）；`B` = 本插件按行写进 profile patch 的 `headroomTokens`，窗口 < ~640K 的行取 `floor(W × 10%)`，更大的窗口留默认 65536（`compactionHeadroomOf`）。

| 行 | W | O | B | 触发压缩 | 逐字保留 |
|---|---|---|---|---|---|
| `glm-5.3` | 400000 | 32768 | 40000 | **320000**（80%） | 58757 |
| `glm-5.3-flash` | 400000 | 32768 | 40000 | **320000**（80%） | 58757 |
| `glm-5-turbo` | 200000 | 32768 | 20000 | **147232**（73.6%） | 26757 |

表里的阈值 / 保留是公式代入值（W ≥ ~328K 时阈值恒为 `0.8W`），不是官方数字；`headroomTokens` 被 [`test/models.test.ts`](../../../test/models.test.ts) 钉住，窗口被 [`test/glm.test.ts`](../../../test/glm.test.ts) 钉住。Turbo 的阈值随 O 变（O=0 时 160000），5.3 / Flash 的 320000 对任何 O ≤ 47232 都成立。

**不要在 Coding Plan 上把 5.3 / Flash 的窗口改到 400K 以上**：400K 是套餐网关的单请求输入上限（2026-09-29 活测记录，见 [`docs/error.md`](../../../docs/error.md)），不是可配置项。填 500K 时阈值正好 = 400000，压缩余量为 0——估算误差或一轮工具输出就能把请求顶过网关被拒；填 1M 则要到 ~800K 才压缩，400K–800K 整段会话必被拒。要更长输入只能换按量 API key（官方 1M 窗）。

官方计价档位（2026-09-30 核对 [智谱 API 定价](https://docs.bigmodel.cn/cn/guide/start/pricing) / [Z.AI Pricing](https://docs.z.ai/guides/overview/pricing)；只有按量计费才有单价，Coding Plan 走 5h / 周 credits）：

| 行 | 官方档位 |
|---|---|
| GLM-5.3 | 1M 单一价，无长度档（BigModel ¥8 输入 / ¥28 输出） |
| GLM-5.3-Flash | 1M 单一价（¥0.8 / ¥2.8） |
| GLM-5-Turbo | 输入 `[0, 32K)` ¥5 / ¥22 → `≥32K` ¥7 / ¥26（缓存命中 ¥1.2 → ¥1.8） |

同代的 GLM-5.1 / GLM-5 也是 32K 分界，GLM-4.7 另有 200K 档。价格随官方调整，`npm run models` 只搬目录参数、不搬价格。

## 额度

`GET glmQuotaUrl(region)` + `GET glmMcpUsageUrl()`（兜底 `glmToolUsageUrl`）。MCP 额度是独立端点 `GET https://zcode.z.ai/api/v1/mcp/usage`（usage-stats.ts `fetchMcpQuotaSnapshot`），**双头**：`authorization: Bearer <zcodeJwt>` + `X-Bigmodel-Authorization: Bearer <api-key>` + `Bigmodel-Target-Type: PERSONAL`；api.z.ai / open.bigmodel.cn 打它是 404。没有 `zcodeJwt` 就跳过（`glmMcpUsageHeaders` 返回 undefined）。回 `{data:{level,total_usage:{used,limit,remaining},next_refresh_at}}` → `parseGlmMcpUsage` 一条 `mcp` 行。

条必须按窗口拆：5 小时 / 每周 / ZCode MCP，不要两条都叫「本周期」。`glmWindowKind` 认 `five_hour` / `weekly` / `mcp`。
monitor 接口是 **HTTP 200 + 业务信封**：`success === false` 或 `code ∉ {0,200}` 时 `fetchGlmQuota` 直接抛 `glm quota failed: <msg>`（如「当前用户不存在coding plan」），store 记 error，卡片显示具体原因；**不要**把它当「ready 但 0 行」，那只会显示「周额度未返回」让人以为 hop 坏了。
重置卡（「重置卡」，类 Codex reset credits）：`GET glmResetCardUrl(region, 'list')` = `{biz}/api/biz/customer-package-reset/list?targetType=PERSONAL`，同一把 provisioned api-key bearer + 桌面指纹，与 monitor 并行。回 `data.fiveHourResets[]` / `data.weekResets[]`，每项 `{recordId, grantType, expireTime, available}`；桶名即 `resetType`（`FIVE_HOUR` / `WEEK`），5h 卡只清 5h 窗、周卡只清周窗。`parseGlmResetCards` 只留 `available` 且未过期的卡，按过期升序；**两个桶数组缺一 / 业务信封非成功 → undefined**，store 保留上次的卡数，不当成 0 张。套餐没有 5h / 周窗口时直接清空，不调。`expireTime` 没有时区：BigModel 是 +08:00（`lastWeekResetTime` = 周窗 `nextResetTime` − 7d 只在 +08:00 成立，2026-09-29 活测），Z.ai 按 UTC 读（未活测）。兑换 `POST …/use` body `{targetType:'PERSONAL', resetType, recordId, requestId}`，HTTP 200 不算成功、要看信封；传输失败时同一张卡复用 `requestId`（进程内），业务拒绝才换新 id。UI 按类型各一行「剩 N 张」，按钮消耗该类最早过期的一张，先过 `WarnDialog`。出处：ZCode 开源树里没有这个端点，参照 OmniRoute `open-sse/services/usage/glmResetCards.ts`（`241e63b`）；list 已活测，`use` 未活测（会真扣卡）。


团队席位（会话带 `team {org, project}`）的额度是 **TEAM 作用域**：窗口走 `GET {biz}/api/monitor/usage/quota/limit?type=2` + 团队头（magpie `zhipuTeamWindows`）；重置卡走 `customer-package-reset/list?targetType=TEAM`，list 兑换 body 的 `targetType` 同步 `TEAM`（`zhipuTeamResets`），bearer 优先 `oauthAccess`（magpie 用 business 登录读成员重置），没有才退回团队 key。MCP 两端点是 PERSONAL 作用域，团队会话不问。刷新时若 `oauthAccess` 可用，顺手读 `querySubscribeDetail`：`productName` 回填 `planType`，`EXPIRED` → `subscriptionStatus: 'expired'`。团队额度路径目前只有单测，无真实席位活测（见 error.md）。
卡片**不显示**「150%配额」标识。能说清的部分：官方 ZCode 的 Coding Plan 对话**只走** `zcode.z.ai` 平台网关（`official-coding-plan-gateway.ts` + NOTICE.md），网关做套餐权益校验；本 hop 走同一条网关路径 + 同套身份头。发放倍数与「用桌面版斜率」仍在上游服务端，源码看不到，**没有**活测对比过用量斜率——所以不宣称「已经吃上 150%」。

## 缓存

Z.AI Coding Plan 是 **隐式内容哈希**：对「前导 system + 历史」做前缀匹配。**没有**分片键，也 **没有** `prompt_cache_key`。

DSH 每步再插一条 leading system（`This snapshot supersedes…`）。前缀一变，整段 miss。

Completions 残留：

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `glmCacheSessionId` | 从 `user` / `session_id` / `prompt_cache_key` 取 id 并清洗 |
| 2 | 删除 | `prompt_cache_key`、`prompt_cache_retention`、`prompt_cache_options` |
| 3 | `stabilizeGlmSystemPrefix` | 每个 DSH session 钉住 **第一次** leading system；后来的快照以 `role: system` 挂到 **messages 末尾** |
| 4 | body `user` | 空则填 session id |
| 5 | 头 `x-session-id` | `glmDesktopHeaders`（没有 DSH pin 时用常量 `GLM_STABLE_SESSION`（`dsh-glm`），重启与热重载后不变；绝不用随机数或时间戳） |

Anthropic 默认：

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `glmCacheSessionId` | 从 `metadata.user_id` / `session_id` / `prompt_cache_key` / `user` 取 id |
| 2 | 删除 | 同上 Codex 字段 |
| 3 | `stabilizeGlmAnthropicSystem` | 钉住第一次 `system` 文本块，并盖 `cache_control: { type: 'ephemeral' }`；后来的快照变成 **额外 text 块、不加 cache_control**（ZCode 把 system 拆成 cli_prefix / stable / dynamic 三段，段段带 breakpoint；DSH 只有一段字符串，停车后等价） |
| 4 | `stabilizeGlmAnthropicMessageCache` | 清掉所有非 system 消息上的 `cache_control`，只在**最新一条非 system 消息**的内容块上盖 `cache_control`（ZCode `finalizeLatestNonSystemMessageCacheControl`）。pi-ai 已给最后一条 user 盖过，这里幂等；assistant-last / 回放带旧 breakpoint 也归一到同一形。tools 上的 breakpoint 不动 |
| 5 | `metadata.user_id` | 空则填 session id |
| 6 | 头 `x-session-id` + `anthropic-version` | `glmAnthropicHeaders` |

Pin map 的 Anthropic 键是 `${sessionId}\0anthropic`，和 Completions 的 `sessionId` **不撞**。

命中字段：Completions 残留把 `cached_tokens` / `cache_read_input_tokens` 译到 `prompt_tokens_details.cached_tokens`（流式缺省 `include_usage`）。Anthropic 靠 `cache_control`，SSE 原样转发。没有字段不发明 0。

判定：前缀被切开后剩 **576 token** 残骸 = **prefix break**，不是 Grok affinity miss。思考模型必须回放上一轮思考；Completions 残留靠 `clear_thinking: false` + 保留 `reasoning_content`；Anthropic 的 Preserved Thinking 在 Coding Plan 端点默认开，插件仍带 `clear_thinking: false`（标准 API 的 opt-in）作保险，ZCode 客户端本身不发这个字段。

进程内 `SYSTEM_PINS`（cap 64，淘汰最久没有请求的会话）只服务 GLM。测试用 `resetGlmSystemPins()`。不要 import Antigravity 的 pin map。

## 不要

- 不要给 GLM 写 Codex `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要把 GLM extras 停成 Gemini trailing user（「停车是同一个思路」也算混用）。
- 不要用 `zcode` 当 CLI provider。
- 不要把卡片账号显示成 `zcode` / poll `user.id`（如 `dnarplz6`）/ JWT `sub`。
- 不要把 `api` 改成 `openai-responses`（`api.z.ai/api/v1` 不是 Coding Plan）。
- 不要宣称已经吃上 150%。官方路径 = 网关 + 身份头，发放在上游服务端，没有活测对比过用量斜率。
- 不要把 Anthropic 对话默认打回 `api.z.ai` / `open.bigmodel.cn` 直连——官方客户端只走网关；直连只在网关回 401/403/404 时一次性回退。
- 不要在 Anthropic 路由写 Completions-only `compat`（`supportsReasoningEffort` / `thinkingFormat: openai`）；`forceAdaptiveThinking` / `allowEmptySignature` 才是这一协议的字段。
- 不要在 Anthropic hop 发 `thinking.budget_tokens` / `thinking.display` / `reasoning_effort`，官方 catalog 只发 `thinking.type` + `output_config.effort`（代理会删掉前三个）。
- 不要复活 `glm-5.2`（套餐自动改道 5.3，`off` 档会 400），也不要把 `glm-5.3-flashx` 塞进 picker（官方写明还没上套餐）。Turbo 不要编思考档位 / 128k 输出（catalog 是 64k，无档位）。
- 不要把 GLM-5.3 / Flash 的自定义窗口设到 400K 以上（500K、1M 都不行）：400K 是套餐网关的单请求输入上限，不是可配置项；窗口越大压缩越晚，只会更早撞网关。算法与每行阈值见「模型 · 上下文与压缩」。
- 不要在下次 `sync()` 改写残留设置之前拆掉 Completions hop。
- 不要导入 start-plan JWT（体验套餐不支持，zcode-plan hop 是 captcha 墙）；系统禁用的 coding-plan key 要导入并带原因。
- 不要把 `data.token`（zcode JWT）写进 BigModel 的 bearer 位——`bigmodel.cn` 会稳定回「令牌已过期或验证不正确」。也不要把 OAuth business token 当聊天 bearer：它过得了鉴权但服务端找不到 Coding Plan 上下文，网关 401 1002、直连 500「1234 网络错误」（issue #168，2026-09-30 实测；与导入路径 `glmKeyFromZcodeCredentials` 的结论一致）。聊天 bearer 只能是铸造的 `id.secret`；OAuth token 只留 `oauthAccess` 打 userinfo / 额度。
- 不要给 BigModel 的铸 key 流程先打 z/login：`open.bigmodel.cn/api/auth/z/login` 对 poll token 回 `500 z.ai用户信息异常`（z.ai 身份专用）；biz/keys API（getCustomerInfo / api_keys / copy）直接认 OAuth token。`glmBizBearer` 先探 getCustomerInfo、失败才回退 z/login。
- 存量升级只认「bigmodel 且 accessToken 是三段 JWT」：`id.secret` 是两段，`upgradeGlmLegacyBearers`（snapshot sweep，每进程每账号一次）不会碰 z.ai 会话、手粘 key 或导入的 provisioned key；铸失败保留原 bearer，等下次进程重试。
- 不要把体验套餐的 Desktop `baseURL`（`…/zcode-plan/anthropic`）当成 hop URL，也不要伪造阿里云 captcha 头。试用对话在 ZCode.app。
- 不要在个人铸 key 时选到 `projectType 2` 的团队项目（magpie `zcodeMintKey` 显式跳过）：团队项目只走团队席位分支；也不要给对话请求加 `Bigmodel-Organization` / `Bigmodel-Project` 头——团队 key 不需要。

## 归因

一线：**[zai-org/ZCode](https://github.com/zai-org/ZCode)**（`872ad96 feat: open source`，tree `3.14.0`；[changelog](https://zcode.z.ai/en/changelog) 当前稳定版 `3.14.1`）+ 官方文档。指纹仍钉 Desktop 3.10.1（`zcode.cjs` `eao` / `rao`），版本没跟开源 tree 走。

| 抄 | 出处 | 本 hop |
|---|---|---|
| Coding Plan Anthropic 端点改发 `zcode.z.ai/api/v1/ultra-zai/anthropic`（BigModel `/ultra/anthropic`），除 `host` 外原样透传 | `apps/zcode-cli/packages/adapters/src/model/official-coding-plan-gateway.ts`；NOTICE.md「官方 Coding Plan 模型网关转发」 | `glmAnthropicGatewayUrl` |
| 模型页价格徽标（USD / 1M） | models.dev `zai`（Z.AI 美元标价；Coding Plan 本身按 credits 计） | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| 身份 / 环境头：`X-ZCode-Agent: glm`、`X-Release-Channel`、`X-Client-Language/Timezone`、`X-Platform`、`X-Os-Category`、`X-Os-Version`、`X-Title: Z Code@cli\|electron` | `apps/zcode-cli/packages/bootstrap/src/model-config.ts` + `runtime-platform-headers.ts` | `glmDesktopHeaders` |
| `x-session-id` / `x-request-id` / `x-zcode-trace-id` / `x-query-id` / `x-zcode-session-type` | `adapters/src/model/runner-attribution.ts` | `glmDesktopHeaders` |
| 非 system 消息只留一个滚动 `cache_control` | `core/src/runtime/helpers/provider-request-messages.ts` `finalizeLatestNonSystemMessageCacheControl` | [`cache.ts`](cache.ts) |
| Anthropic 思考 map（`thinking` + `output_config.effort`）；ctx / 输出上限 | `config/provider/zcode-builtin.json` `modelApiRules` / `modelRules` | `applyGlmAnthropicThinking`；目录取舍见「模型」 |
| 无 signature 的 thinking 块按 `signature: ""` 回放，不降级成 text | `adapters/src/model/anthropic-reasoning-metadata.ts` | 路由 compat `allowEmptySignature` |
| 对话 + 额度的 bearer 是 provisioned `account-provider:…:api-key`；`oauth:<region>:access_token` 只打 monitor / userinfo，降为 `oauthAccess`；`zcodejwttoken` 仅身份 | `~/.zcode/v2/credentials.json` + `isProviderProvisioningAccountCredentialKey` | [`../import-auth.ts`](../import-auth.ts) `glmKeyFromZcodeConfig` |
| 重置卡 `{biz}/api/biz/customer-package-reset/list?targetType=PERSONAL` / `…/use`（ZCode 开源树里没有） | 社区 [OmniRoute](https://github.com/diegosouzapw/OmniRoute) `open-sse/services/usage/glmResetCards.ts`（`241e63b`） | `glmResetCardUrl`；stamp 时区 BigModel +08:00 是本仓活测结论，不是 OmniRoute 的 UTC |
| 团队套餐：席位发现（projectType 2 / querySubscribeDetail EFFECTIVE+VALID / UNASSIGNED / EXPIRED）、团队 key（`zcode-team-api-key` keyType 2）、`quota/limit?type=2` + `Bigmodel-Organization/Project` 头、重置卡 `targetType=TEAM`、`subscribeEndTime` 时区 | magpie `internal/provider/zcode_team.go`（PLUGIN-SERVED 弃用内置，设计冻结于此）← ZCode 3.14.3 `host/index.js`（`isBigModelTeamCodingPlanProject` / `ensureBigModelTeamPlanProjectApiKeyWithStatus` / `buildQuotaLimitUrl` / `createBigModelUsageHeaders`） | `mintGlmCodingKey` / `glmTeamHeaders` / `glm/quota.ts` 团队分支 |

官方文档：[Coding Plan 快开始](https://docs.z.ai/devpack/quick-start)（Anthropic 默认协议）、[缓存](https://docs.z.ai/guides/capabilities/cache)（隐式前缀 + `cache_control`）、[思考](https://docs.z.ai/guides/capabilities/thinking-mode)（Completions 形；Coding Plan 端点默认 Preserved Thinking，`clear_thinking: false` 是标准 API 的 opt-in）、[devpack overview](https://docs.z.ai/devpack/overview)（套餐模型）、[API 定价](https://docs.bigmodel.cn/cn/guide/start/pricing) / [Z.AI Pricing](https://docs.z.ai/guides/overview/pricing)（计价档位，见「模型 · 上下文与压缩」）。catalog 的 `builtinProviderModelRules` 仍启用 5.2 / Turbo 是给老 session 的向后兼容，不等于现售菜单。

**不要发明：** 第四种 DSH `api`。`x-aliyun-captcha-verify-param` 只有 Desktop 3.11.2 `zcode.cjs` `isZcodePlanOpenAiCompatibleBaseUrl` 才注入，不抄。缓存头混用、直连默认、Anthropic 字段与 150% 的禁令见「不要」。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
