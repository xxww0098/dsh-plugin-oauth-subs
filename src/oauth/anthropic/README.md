# Anthropic subscription (Claude Pro/Max)

Anthropic 订阅 OAuth。直接打 `api.anthropic.com/v1/messages`（Anthropic Messages wire），
是本仓库第二个 `anthropic-messages` hop（第一个是 GLM 的 ZCode 网关）。

## 归因（先于一切代码）

- 一线客户端：**Claude Code CLI**（当前钉 `claude-cli/2.1.280`）。本家族没有公开客户端源码，
  登录 / 请求指纹逐项对照 **senpi / pi-ai**（[code-yeongyu/oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)
  的引擎 `@code-yeongyu/senpi`，包内 `node_modules/@earendil-works/pi-ai/dist/`
  `auth/oauth/anthropic.js` + `api/anthropic-messages.js`，2026-09-26 dev 快照）。
- 社区对照：Claude Code OAuth 流的社区逆向（claude-code-router 系 fork、
  opencode-anthropic-console）与统一限额头读取器（`pi-usage-limit-tracker`、
  `@mtrojnar/pi-usage`、`oc-anthropic-multi-account`）。

### 登录（PKCE + loopback）

| 项 | 值 | 出处 |
|---|---|---|
| client_id | `9d1c250a-e61b-44e9-88ed-594fedd33385` | pi-ai（Claude Code 公开 client id） |
| authorize | `https://claude.ai/oauth/authorize`（参数带 `code=true`） | pi-ai authParams |
| token | `https://platform.claude.com/v1/oauth/token`（JSON POST；`console.anthropic.com/v1/oauth/token` 是旧拼写） | pi-ai |
| scope | `org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload` | pi-ai SCOPES |
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
  `user-agent: claude-cli/2.1.280`、`x-app: cli`（pi-ai OAuth lane 原样）。
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

订阅 lane **没有 usage 端点**（senpi 也只做响应式分类）。上游在每条 Messages 响应
（200 与 429 都算）携带统一限额头：

```
anthropic-ratelimit-unified-5h-utilization / -5h-reset
anthropic-ratelimit-unified-7d-utilization / -7d-reset
```

（utilization 是 0..1；reset 是时间戳。社区读取器：pi-usage-limit-tracker 等。）
`fetchAnthropicQuota` 发一条 1-token 探针（`max_tokens: 1` + haiku）读头——与社区
用量表同款 tiny-probe 做法；429 不是错误（窗口打满照样报利用率）。探针每次刷新约
1–10 token 成本，配额刷新有 TTL 节流。**不要发明**更高频的轮询或额外端点。

### 不要发明

- 第一个 scope / beta 值 / client id 的变体；`anthropic-beta` 里加未钉住的 feature。
- 会话 / 缓存 id 字段（Messages API 没有这些字段，加了 400）。
- `cache_control` 检查点（宿主 lane 已经管理，本 hop 重放会双重标记）。
- dated 模型行（`-20251001` 等）——订阅按 alias 服务，目录保持 alias。
- 更快的额度轮询、专用 usage 端点、macOS Keychain 导入（`security` 弹窗，不做）。

## 导入

`~/.claude/.credentials.json`（Claude Code 文件存储，`claudeAiOauth` 字段）。
Keychain（"Claude Code-credentials"）不读。
