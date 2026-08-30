# 错误记录

## 2026-08-30：Antigravity 已登录卡没有额度条

### 现象

设置 → Antigravity。已登录卡抬头是邮箱 + **STANDARD TIER** + **使用中** + **退出**，卡身空白。没有 Claude/GPT、Gemini 分组进度条。用户截图：徽章下面直接跳到「打开授权页」。

### 证据

- 现场截图（`antigravity-no-quota.png`）：`.osubs-acct` 只有身份行，没有 `.osubs-quota`。
- `src/oauth/quota.ts` `QuotaStore.#load`：`provider === 'antigravity'` 直接写入 `{ status: 'idle', planType: session.planType, rows: [] }`，不打 Cloud Code。
- `test/antigravity.test.ts` 原断言 `snapshot shows idle quota`，`fetchFn` 抛 `must not hit a quota API`。
- `docs/error.md` 0.0.38 指纹条写过「没有公开的 Antigravity 额度 API」。
- SkillStar 权威路径：`crates/skillstar-usage/src/cloud_code.rs`（`load_code_assist` + `fetch_model_quotas` + `parse_model_windows`）与 `fetchers/oauth/antigravity.rs`（`load_code_assist_with_project_fallback`）。

### 根因

额度层（本插件）。0.0.38 接了登录 / 指纹 / 聊天 hop，额度故意 idle。UI 对 `status === 'idle'` 整块不渲染（`QuotaBlock` return null），所以不是「读失败」，是从未请求。

### 修复（0.0.39）

抄 SkillStar，不另发明接口：

1. `POST https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist`，Bearer + 现有 `antigravity/hub/<ver> <os>/<arch>`（不改成 SkillStar 的短 `antigravity/<ver>`，避免指纹回退）。
2. Body：`{ metadata: { ideType: "ANTIGRAVITY" } }`；有 `session.projectId` 时加 `cloudaicompanionProject` 与 `metadata.duetProject`。缓存 project 400 则去掉 project 再打一次。
3. `POST v1internal:fetchAvailableModels`，body `{ project }` 或 `{}`。基址顺序：daily-cloudcode-pa → daily sandbox → cloudcode-pa。先成功且能解析出窗口的胜出。401 = 鉴权失败。
4. `models`（或根对象）按 SkillStar `antigravity_quota_groups()` 分组；`remainingFraction` / `remaining_fraction` / `remaining`（含 `"75%"`）；缺 remaining 但有 `resetTime` 当 0。组内取 min。`remainingPercent = round(remaining*100)`。
5. 行 `kind: 'product'`，标签用组名（`gemini-3.1-flash-image` 用 `displayName`）。套餐 pill 仍用 session 的 STANDARD TIER / `antigravityPlanType`。失败 `status: error` + 现有 `quotaFailed`，不再静默空卡。不加 GLM 的 150%配额。

### 验证

- `npm test`：SkillStar fixture `0.25` / `"75%"` / `1.0` 分出 Claude/GPT 25%、Gemini 3.1 Pro Series 75%、Gemini 2.5 Flash 100%、Gemini 3.1 Flash Image 50%。
- QuotaStore 有 session 时不再 idle；load 500 → `error`。Codex / Grok / GLM / Kiro 额度测试未改行为。

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
- 0.0.38 当时没有接额度 hop，卡片照常画、额度块 idle。0.0.39 起走 SkillStar 的 loadCodeAssist + fetchAvailableModels，UA 仍是这一套 `antigravity/hub/`。

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
