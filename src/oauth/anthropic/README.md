# Anthropic subscription (Claude Pro/Max)

Anthropic 订阅 OAuth。直接打 `api.anthropic.com/v1/messages`（Anthropic Messages wire），
是本仓库第二个 `anthropic-messages` hop（第一个是 GLM 的 ZCode 网关）。

## 归因（先于一切代码）

- 一线客户端：**Claude Code CLI**（当前钉 `claude-cli/2.1.283`）。本家族没有公开客户端源码，
  登录 / 请求指纹逐项对照 **senpi / pi-ai**（[code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)
  的引擎 `@code-yeongyu/senpi`，包内 `node_modules/@earendil-works/pi-ai/dist/`
  `auth/oauth/anthropic.js` + `api/anthropic-messages.js`，2026-09-26 dev 快照）。
- 社区对照：Claude Code OAuth 流的社区逆向（claude-code-router 系 fork、
  opencode-anthropic-console）与统一限额头读取器（`pi-usage-limit-tracker`、
  `@mtrojnar/pi-usage`、`oc-anthropic-multi-account`）。

### 登录（PKCE + loopback）

| 项 | 值 | 出处 |
|---|---|---|
| client_id | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` | 2.1.283 二进制 `CLIENT_ID`（pi-ai 的 `…-44e9-88ed-594fedd33385` 已退役） |
| authorize · Claude.ai | `https://claude.com/cai/oauth/authorize`（`code=true`） | 2.1.283 `CLAUDE_AI_AUTHORIZE_URL`，`loginWithClaudeAi` 为真。`claude.ai/oauth/authorize` 是旧拼写，Cloudflare 人机墙后 |
| authorize · Console | `https://platform.claude.com/oauth/authorize`（`code=true`） | 2.1.283 `CONSOLE_AUTHORIZE_URL`，`loginWithClaudeAi` 为假 |
| token | `https://platform.claude.com/v1/oauth/token`（JSON POST；两种登录共用） | 2.1.283 `TOKEN_URL` |
| scope | `org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload user:plugins` | 2.1.283 `c6r()`（`user:plugins` 在 prod `PLUGINS_SCOPE_REGISTERED`） |
| callback | 任意 localhost 端口的 `/callback`（Claude Code 每次登录绑随机端口；本仓库用共享 flow manager 监听器） | pi-ai anthropic-callback-listener.js |
| state | 授权与 token 交换都回传（pi-ai 把 `state` 一起 POST） | pi-ai exchangeAuthorizationCode |

刷新：`grant_type=refresh_token` + `client_id`，JSON。`invalid_grant` / `invalid_client` /
`unauthorized_client` 判永久失败（重新登录）。

### 账号身份

OAuth token 是不透明 `sk-ant-oat01-…`，无 JWT 声明。身份来自
`GET https://api.anthropic.com/api/oauth/profile`（`user:profile` scope，
社区从 Claude Code 登录后调用钉住）：`account.uuid` 进 vault 当账号键（不外露），
`account.email` 做卡片标签。profile 拉取是 best-effort：失败不拦登录，
退回 refresh-token 后缀 id。

### hop（`POST /anthropic/v1/messages`）

- 上游 `https://api.anthropic.com/v1/messages`，头：`Authorization: Bearer <oauth>`、
  `anthropic-version: 2023-06-01`、`anthropic-beta: claude-code-20250219,oauth-2025-04-20`、
  `user-agent: claude-cli/2.1.283`、`x-app: cli`（pi-ai OAuth lane 原样）。
- **宿主本来就说 anthropic-messages**：system / tools / thinking / `cache_control`
  全部是 llm-pi-ai 自己的 lane，本 hop 不碰。thinking 由宿主按模型 id 自动分派——
  自适应 id（opus-5/4-8/4-7/4-6、sonnet-5/4-6、fable-5）走 `output_config.effort`，
  经典 id（opus-4-5、sonnet-4-5、haiku-4-5）走 budget thinking；因此路由**不带**
  `forceAdaptiveThinking` / `allowEmptySignature`（那是 GLM 网关的 workaround，
  真 Anthropic 的 thinking 块有签名，原样回放即可）。
- 本家族只做边缘修复：剥离 DSH 专有字段（`session_id` / `prompt_cache_key` /
  `prompt_cache_retention` / `prompt_cache_options`，Messages API 对未知顶层字段
  400）、补默认 `max_tokens`、剥非 Anthropic 的 `service_tier`（fast/priority 是
  Codex 概念）。

### 缓存

Anthropic 前缀缓存按内容寻址（system → tools → messages 前缀本身），检查点由宿主
放置。`anthropic/cache.ts` 只负责**稳定前缀**：不发明会话 id 字段、不 stamp
`Date.now()`、剥离 DSH 字段。派生的 conversation id（`metadata.user_id` 优先）只做
quota 键与日志，**从不写回上游**。没有 Codex / Grok 式亲和头。

### 模型目录

静态目录（`ANTHROPIC_MODELS`），逐行对照 pi-ai `providers/data/anthropic.json`
（Claude 订阅集合，dash id 是 api.anthropic.com 拼写），窗口 / 输入 / 阶梯再用本仓库
Kiro 家族（同底模型）交叉核对：

- 1M 窗 / 128k 上限：fable-5-1、fable-5、opus-5-5、opus-5、opus-4-8、opus-4-7、
  opus-4-6、sonnet-5、sonnet-4-6
- 200k / 64k：opus-4-5、sonnet-4-5（1M 窗 / 64k）、haiku-4-5
- 阶梯同 Kiro：Opus 5 / 4.8 / 4.7 与 Sonnet 5 / Fable 加 `xhigh`；4.6 家族止于
  `max`；经典行不带 effort 阶梯（保持宿主原生 budget thinking）。
- 无 live 目录端点（订阅没有 models API），登录 / 刷新不重拉。
- 没有 Fast 变体（Anthropic 无 Fast 语义）；不发明 `-900k`。

### 额度

Claude Code CLI 2.1.283 也提供 OAuth 用量端点 `GET https://api.anthropic.com/api/oauth/usage`（二进制中可见，Max 账号已活测）。它的 `limits[]` 按
`kind` 区分 session、weekly_all 与 weekly_scoped；后者通过
`scope.model.display_name` 提供模型专属周限额（例如 Fable），`percent` 为 0..100、`resets_at` 为
时间戳。未激活的 scoped meter 仍应展示，不能因 `is_active: false` 而隐藏。

Fable 周限额有两条上报路径，按优先级取一条：`limits[]` 的
`weekly_scoped`（display_name=Fable；unified 头里同桶叫 `7d_oi` overage-included，
Claude Code 标签映射即 "Fable 5 limit"）→ 顶层旧字段（`seven_day_overage_included` /
`fable_weekly` / `fable_seven_day` / `seven_day_fable`，后三个拼写按
[stablyai/orca](https://github.com/stablyai/orca) `claude-oauth-usage-request.ts`）。
其余 `seven_day_*` 旧字段（opus / sonnet / cowork / oauth_apps）也映射为 scoped 行；
`limits[]` 已覆盖的同名 meter 不重复发行。该端点对非官方 UA 限流很凶（活测连续
429），usage 非 200 时保留上一快照的 scoped 行，200 但不带 scoped 才算 meter 消失。

额度刷新**只发一个请求**：`GET /api/oauth/usage` 一次返回 5h / 7d / 全部 scoped
行（orca 同源设计——usage 端点是唯一来源）。请求指纹收窄为
`Authorization` + `anthropic-beta: oauth-2025-04-20` + `user-agent`（OAuth 管理端点，
不发 Messages lane 的 `anthropic-version` / `x-app` / `claude-code-20250219` beta）。
旧版每次刷新都附赠一次真实计费的 1-token Messages 探针读统一限额头，已删除——
usage 失败直接抛错，调用方照旧服务上一快照。刷新由家族 quota 缓存节流。
不要发明额外端点或更高频轮询。

### 不要发明

- 第一个 scope / beta 值 / client id 的变体；`anthropic-beta` 里加未钉住的 feature。
- 会话 / 缓存 id 字段（Messages API 没有这些字段，加了 400）。
- `cache_control` 检查点（宿主 lane 已经管理，本 hop 重放会双重标记）。
- dated 模型行（`-20251001` 等）——订阅按 alias 服务，目录保持 alias。
- 未由钉住客户端或活测验证的 quota endpoint、或更高频轮询；Keychain 只读钉住的 `Claude Code-credentials`（不自造服务名、不做写入）。

## 导入

按钉住客户端（`claude-cli/2.1.283`）的读取顺序：

1. **macOS Keychain**（仅 darwin）：`security find-generic-password -a "$USER" -w -s "Claude Code-credentials"`。
   服务名照抄二进制 `var Joe="-credentials"` + `Claude Code${OAUTH_FILE_SUFFIX}${n}${c}`：`CLAUDE_CONFIG_DIR` /
   `CLAUDE_SECURESTORAGE_CONFIG_DIR` 有值时追加 `-<sha256(configDir)前8位>`，`CLAUDE_CODE_OAUTH_CLIENT_ID` 有值时是
   `Claude Code-custom-oauth-credentials`；账号是 `tA()` 的 `$USER`（不合 `/^[a-zA-Z0-9._-]+$/` 退回
   `claude-code-user`）。超时 30s——首次读会弹一次系统授权，要留出点「始终允许」的时间。
2. **`<CLAUDE_CONFIG_DIR 或 ~/.claude>/.credentials.json`**（明文回退，同一份 `claudeAiOauth` 字段）。

两个 store 存同一份文档，2.1.283 先写 Keychain，写成功后**删掉明文文件**。
本插件只读：不 `add-generic-password`、不写 `.credentials.json`。已导入会话到期后重新读同一份 store，
不用共享 refresh 换票——换票会轮换 refresh，写不回就把 Claude Code 的登录毁掉。
传 `paths` 时只按显式路径找（测试用），不碰 Keychain。钥匙串拒绝读取报 `anthropic-import-locked`，
不假装「没登录」。
