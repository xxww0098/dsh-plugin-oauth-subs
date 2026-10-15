# 上游对照

每个家族照着哪个官方客户端或社区逆向实现、钉在哪个版本。改某家的登录、对话或缓存前，先按这里找到对照源；该家具体「抄什么 / 不要发明什么」写在它 README 的「归因」节。

本插件只把 DSH 接到各家订阅后端，不是第二套 LLM 适配器。社区仓只拿来对照 wire，不 vendor 整棵树，也不引入 Bun 或对方的 SDK。

## 总表

| 家族 | 一线对照 | 社区 / 文档 | 本 hop 钉住 | 设计源 |
|---|---|---|---|---|
| Codex | [openai/codex](https://github.com/openai/codex) `rust-v0.162.1`（钉 0.162.1） | Codex CLI `models.json` + 活目录 `GET .../codex/models`（**按 `client_version` 门控**：GPT-6 Sol/Luna ≥ 0.155.0，GPT-6.1 Sol ≥ 0.159.0）；[#37345](https://github.com/openai/codex/issues/37345) routing-hint | UA `codex_cli_rs/0.162.1`；请求体 `content-encoding: zstd` | [`codex/README.md`](../src/oauth/codex/README.md) |
| ChatGPT（Sign in with ChatGPT） | [OpenAI 官方 siwc 开源客户端文档](https://developers.openai.com/siwc/token-sharing-open-source) | [earendil-works/pi](https://github.com/earendil-works/pi) `openai-chatgpt.ts`；[openclaw/openclaw](https://github.com/openclaw/openclaw) `token-sharing-oauth.runtime.ts`；[pingdotgg/t3code](https://github.com/pingdotgg/t3code) `CodexChatGptAuth.ts` | `dynamic_agent_client` 注册 → 颁发 `oaiapp_`；`ext_agent_host_id`；Bearer → `api.openai.com/v1/responses` | [`chatgpt/README.md`](../src/oauth/chatgpt/README.md) |
| Grok | [xai-org/grok-build](https://github.com/xai-org/grok-build) | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（`~/.hermes/auth.json` 导入） | UA `grok-cli/0.2.93` | [`grok/README.md`](../src/oauth/grok/README.md) |
| GLM | **[zai-org/ZCode](https://github.com/zai-org/ZCode)** `872ad96`（tree 3.14.0）+ [docs.z.ai](https://docs.z.ai/devpack/quick-start) | ZCode 已开源：`official-coding-plan-gateway.ts`、`config/provider/zcode-builtin.json`、`runner-attribution.ts`；**团队套餐**对照 magpie `internal/provider/zcode_team.go`（← ZCode 3.14.3 `host/index.js`） | UA `ZCode/3.10.1 ai-sdk/anthropic/3.0.81`；Coding Plan Anthropic 走 `zcode.z.ai/api/v1/ultra[-zai]/anthropic`；团队席位额度 `quota/limit?type=2` + `Bigmodel-Organization/Project` | [`glm/README.md`](../src/oauth/glm/README.md) |
| Kiro | Kiro IDE / `List-Available-Models`（origin = chat 的 `AI_EDITOR`）；[kiro.dev/docs/models](https://kiro.dev/docs/models) 仅作离线参考 | [ZyphrZero/kiro.rs](https://github.com/ZyphrZero/kiro.rs)；[mikeyobrien/pi-provider-kiro](https://github.com/mikeyobrien/pi-provider-kiro) `0.10.2` | eventstream `GenerateAssistantResponse` | [`kiro/README.md`](../src/oauth/kiro/README.md) |
| Antigravity | Antigravity.app hub 2.22.0 | [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)（registry `models.json` 的 `antigravity` 键）；[Rahularya01/pi-antigravity](https://github.com/Rahularya01/pi-antigravity) | UA `antigravity/hub/2.22.0`；daily-cloudcode-pa | [`antigravity/README.md`](../src/oauth/antigravity/README.md) |
| Cursor | Cursor CLI `loginDeepControl` | [Rahularya01/pi-cursor](https://github.com/Rahularya01/pi-cursor)；[fitchmultz/pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk)（`@cursor/sdk@1.0.27`）；[docs models-and-pricing](https://cursor.com/docs/models-and-pricing)（静态底表） | 指纹 `cli-2026.07.23-e383d2b`；`x-cursor-client-type: cli` | [`cursor/README.md`](../src/oauth/cursor/README.md) |
| Ollama Cloud | [docs.ollama.com/cloud](https://docs.ollama.com/cloud) | [ollama/ollama#12532](https://github.com/ollama/ollama/issues/12532)、[#16598](https://github.com/ollama/ollama/issues/16598) | Bearer `OLLAMA_API_KEY` → `ollama.com/v1` | [`ollama/README.md`](../src/apikey/ollama/README.md) |
| Kimi | 官方 Kimi Code CLI | [Leechael/pi-provider-kimi-code](https://github.com/Leechael/pi-provider-kimi-code)；[官方模型表](https://www.kimi.com/code/docs/en/kimi-code/models.html) | 设备码、无 PKCE | [`kimi/README.md`](../src/oauth/kimi/README.md) |
| Devin | Devin CLI `3000.10.31`（app.devin.ai PKCE + server.codeium.com Connect/proto） | [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) `pi-catalog` devin + vendored `exa.*` protos | MITM 实测指纹 `ide_name: chisel` / `3000.10.31` / `Basic <tok>-<tok>`；`devin-session-token$` 前缀只加一次 | [`devin/README.md`](../src/oauth/devin/README.md) |
| Cline | Cline CLI `3.0.70`（npm `cline` + `@cline/core` / `@cline/llms` `0.0.92`） | [cline/cline](https://github.com/cline/cline) tag `cli-v3.0.70`（Apache-2.0）；模型事实取 `GET /api/v1/ai/cline/models`。社区对照 [`@magpie-community/opencode-cline-auth`](https://github.com/magpie-community/plugins/tree/main/packages/cline) | WorkOS 设备码 + `POST /api/v1/auth/register` 兑换；Bearer `workos:<jwt>`；`X-Task-ID` 会话钉 | [`cline/README.md`](../src/oauth/cline/README.md) |
| 宿主 | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | DSH `llm-pi-ai` `api` 闭集 | 本机回环代理 | [`README.md`](../README.md) |
| OpenCode Go + Zen（API key，一个家族两个产品） | [opencode.ai/docs/go](https://opencode.ai/docs/go/) / [opencode.ai/docs/zen](https://opencode.ai/docs/zen/) | [stablyai/orca](https://github.com/stablyai/orca)；[steipete/CodexBar](https://github.com/steipete/CodexBar)（`OpenCodeGoUsageFetcher`、`OpenCodeConsoleUsageFetcher`、`OpenCodeZenBillingParser`） | 宿主内置 pi-ai `opencode-go` / `opencode` 由用户在 DSH 模型页自行开启；插件不写这两个 profile。插件自有六条目录路由：Go 的 `Subs · OpenCode Go · Chat/Responses/Anthropic`（`/zen/go/v1`，带必需的 `x-opencode-session`，pi-ai 0.85.1 不发会话头）与 Zen 的 `Subs · OpenCode Zen · Chat/Responses/Anthropic`（`/zen/v1`，无该头），都经 `OPENCODE_API_KEY` 直连；不服务的公开 ID 不进目录。额度：Go 走 Console `/console/api/{orgs,go/status,billing/status,user}` + `x-org-id`（未迁移账号兜底旧 `/workspace/{id}/go`），Zen 另读 `/console/api/usage/summary?range=30d` + `billing/status` 的预付段 | [`opencode-go/README.md`](../src/apikey/opencode-go/README.md) |
| Command Code | npm `command-code@1.82.3`（bin `cmd`/`command-code`） | 无公开源码仓；全部归因自安装 bundle `dist/{index,cli}.mjs`；社区对照 [`@magpie-community/opencode-commandcode-auth`](https://github.com/magpie-community/plugins/tree/main/packages/commandcode) | 私有 JSONL 协议 `POST api.commandcode.ai/alpha/generate`（**非** OpenAI 兼容）；studio loopback 登录回调直接带 apiKey；`COMMAND_CODE_API_KEY` → `~/.commandcode/auth.json`；`threadId` uuid 亲和；目录 = 钉住注册表 + 公开 `GET /provider/v1/models` 刷新；拒绝分类（版本门 / 不在套餐 / 额度）改写后再交给宿主 | [`command-code/README.md`](../src/apikey/command-code/README.md) |

CLIProxyAPI 同时包了 Codex / Grok / Antigravity 等多家。**只**在 Antigravity 上抄它的公开 client / UA / `models.json` 形状。不要把它的多家族共用层抄进本仓库的 `cache.ts`。

跨家族**令牌生命周期**另抄了它的四个模式（不是代码）：`tryRefreshAfterUnauthorized`（上游 401 → `TokenManager.refreshNow` 强制刷新重试一次：`upstream.ts` `upstreamRequest().run({ refresh })`，钩子由 `tokens.ts` `forcedRefresh` 生成）、`authAutoRefreshLoop`（`AuthController.startTokenSweep` 每 60s 按各家 preempt 窗口提前刷新）、`refreshFailureBackoff`（`REFRESH_FAILURE_BACKOFF_MS` 5min；瞬时失败时仍有效的旧 access token 继续服务）、`MergeExistingAuthMetadata`（`saveSession` 同 id 重登录保留非凭据字段）。它的 cooldown / 多凭据调度 / 配额响应头观察（`quota_signals.go`）**未**引入：本插件每家族只用 active 账号，不做静默跨账号 failover。

## 怎么对照

1. 官方 CLI 有源码 → 钉 tag / 版本，抄 **那一版实际发出的** 头、body 字段、UA。
2. 官方只有闭源客户端 → 对照社区 MIT 逆向，本目录只抽 hop 用到的字段。
3. 对方有、本 hop 用不到的字段（installation-id、parent-thread、SDK client-type）**不要发明发出去**。
4. AGPL 仓只对照**数据格式**（卡密 / JSON 形状），解析器自己写，源码不进树。
5. 缓存按家族隔离。对照仓 A 的头不能写到家族 B。见 [`docs/rules.md`](rules.md)。

升级一线对照（换 tag / 版本）时，同一 PR 更新本表的钉住版本和那一家 README 的「归因」节；目录端点变了，同时改 `scripts/models.ts` 里该键的适配器（[`docs/models.md`](models.md)）。

新家族的接入顺序与清单见 [`docs/new-family.md`](new-family.md)。
