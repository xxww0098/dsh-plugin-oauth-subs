# OAuth 参考仓库

本文件是跨家族 hop 的**参考仓索引**。改某家登录 / 对话 / 缓存先对照这里钉住的官方 CLI 或社区逆向，再改 `src/oauth/<id>/`。

| 文件 | 职责 |
|---|---|
| 本文件 | 官方 / 社区仓库、钉住的版本、抄什么、不发明什么 |
| [`src/oauth/<id>/README.md`](../src/oauth/codex/README.md) | 那一家的设计源（端点、函数、wire 字段） |
| [`AGENTS.md`](../AGENTS.md) | 跨家族硬约定（缓存不混用、`api` 闭集） |
| [`docs/error.md`](error.md) | 故障与验收 |

**不是**第二套 LLM 适配器文档。本插件只把 DSH 接到各家订阅后端。社区仓用来对照 wire，不 vendor 整棵树，不引入 Bun / 对方 SDK。

## 总表

| 家族 | 一线对照 | 社区 / 文档 | 本 hop 钉住 | 设计源 |
|---|---|---|---|---|
| Codex | [openai/codex](https://github.com/openai/codex) `rust-v0.153.4` | Codex CLI `models.json`；[#37345](https://github.com/openai/codex/issues/37345) routing-hint | UA `codex_cli_rs/0.153.4` | [`codex/README.md`](../src/oauth/codex/README.md) |
| Grok | [xai-org/grok-build](https://github.com/xai-org/grok-build) | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（`~/.hermes/auth.json` 导入） | UA `grok-cli/0.2.93` | [`grok/README.md`](../src/oauth/grok/README.md) |
| GLM | ZCode Desktop 3.10.1 + [docs.z.ai](https://docs.z.ai/devpack/quick-start) | 无公开 ZCode 源码仓 | UA `ZCode/3.10.1 ai-sdk/anthropic/3.0.81` | [`glm/README.md`](../src/oauth/glm/README.md) |
| Kiro | Kiro IDE / [kiro.dev/docs/models](https://kiro.dev/docs/models) | [ZyphrZero/kiro.rs](https://github.com/ZyphrZero/kiro.rs)；[mikeyobrien/pi-provider-kiro](https://github.com/mikeyobrien/pi-provider-kiro) `0.10.2` | eventstream `GenerateAssistantResponse` | [`kiro/README.md`](../src/oauth/kiro/README.md) |
| Antigravity | Antigravity.app hub 2.11.0 | [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)；[Rahularya01/pi-antigravity](https://github.com/Rahularya01/pi-antigravity) | UA `antigravity/hub/2.11.0`；daily-cloudcode-pa | [`antigravity/README.md`](../src/oauth/antigravity/README.md) |
| Cursor | Cursor CLI `loginDeepControl` | [Rahularya01/pi-cursor](https://github.com/Rahularya01/pi-cursor)；[fitchmultz/pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk)（`@cursor/sdk@1.0.27`） | 指纹 `cli-2026.07.23-e383d2b`；`x-cursor-client-type: cli` | [`cursor/README.md`](../src/oauth/cursor/README.md) |
| Ollama Cloud | [docs.ollama.com/cloud](https://docs.ollama.com/cloud) | [ollama/ollama#12532](https://github.com/ollama/ollama/issues/12532)、[#16598](https://github.com/ollama/ollama/issues/16598) | Bearer `OLLAMA_API_KEY` → `ollama.com/v1` | [`ollama/README.md`](../src/oauth/ollama/README.md) |
| Kimi | 官方 Kimi Code CLI | [Leechael/pi-provider-kimi-code](https://github.com/Leechael/pi-provider-kimi-code) | 设备码、无 PKCE | [`kimi/README.md`](../src/oauth/kimi/README.md) |
| GitHub Copilot | [anomalyco/opencode](https://github.com/anomalyco/opencode) `plugin/github-copilot` | [goose githubcopilot.rs](https://github.com/aaif-goose/goose)；[Cherry Studio CopilotService.ts](https://github.com/CherryHQ/cherry-studio)；[hermes-agent copilot_auth.py](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/copilot_auth.py) | UA `GitHubCopilotChat/0.35.0`；client `Iv1.b507a08c87ecfe98` | [`copilot/README.md`](../src/oauth/copilot/README.md) |
| 宿主 | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | DSH `llm-pi-ai` `api` 闭集 | 本机回环代理 | [`README.md`](../README.md) |

CLIProxyAPI 同时包了 Codex / Grok / Antigravity 等多家。**只**在 Antigravity 上抄它的公开 client / UA / `models.json` 形状。不要把它的多家族共用层抄进本仓库的 `cache.ts`。

## 怎么对照

1. 官方 CLI 有源码 → 钉 tag / 版本，抄 **那一版实际发出的** 头、body 字段、UA。
2. 官方只有闭源客户端 → 对照社区 MIT 逆向，本目录只抽 hop 用到的字段。
3. 对方有、本 hop 用不到的字段（installation-id、parent-thread、SDK client-type）**不要发明发出去**。
4. AGPL 仓只蒸馏**数据格式**（卡密 / JSON 形状），解析器自己写，源码不进树。
5. 缓存按家族隔离。对照仓 A 的头不能写到家族 B。见 [`AGENTS.md`](../AGENTS.md) Prompt cache。

升级一线对照（例如 Codex `0.153.4` → 更新 tag）时：改 `src/oauth/<id>/` **同一 PR** 更新本表的钉住版本和那一家 README。

## Codex

一线：[openai/codex](https://github.com/openai/codex) tag **`rust-v0.153.4`**（2026-09-04 `models.json`）。

| 抄 | 路径 / issue | 本 hop |
|---|---|---|
| `session-id` + `thread-id` | `codex-rs/codex-api/src/requests/headers.rs` `build_session_headers` | `codexCacheHeaders`：三值都等于 DSH pin（一轮对话一条 thread） |
| `x-client-request-id` = `thread-id` | 同上 | 同 pin |
| 同 turn 重试回放 `x-codex-turn-state` | `codex-rs/core/src/client.rs` | `proxy.ts` `RetryableUpstream` |
| Fast → Priority | [#37345](https://github.com/openai/codex/issues/37345) | body `service_tier: priority` + `x-codex-routing-hint` |
| 剥 `max_output_tokens` | [#39397](https://github.com/openai/codex/issues/39397) | `request.ts` |
| `pro` / `prolite` 徽章 | [#29243](https://github.com/openai/codex/issues/29243) | `plan.ts` Pro 20x / Pro 5x |
| 目录 | CLI `models.json` | `CODEX_MODELS`；Astra 默认 258K |

**不要发明：** `x-codex-installation-id`、`x-codex-turn-metadata`、`parent-thread-id`（官方 CLI 有，本 hop 不发）。不要把 DSH `session_id` 送上 chatgpt.com。

## Grok

一线：[xai-org/grok-build](https://github.com/xai-org/grok-build) Responses 路径。导入旁路：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) 的 `~/.hermes/auth.json`。

| 抄 | 本 hop |
|---|---|
| `GrokRequestHeaders`：`x-grok-conv-id` / `x-grok-session-id` / `x-grok-req-id` / `x-grok-model-override` | `grokAffinityHeaders` |
| 重试 `x-grok-transient-retry` | 同函数 |
| `instructions: null`，前缀 byte-for-byte 重放 | `normalizeGrokResponsesBody` 不抬顶层 `instructions` |
| 设备码默认 | `device-flow.ts` |

**不要发明：** Codex `session-id` / `x-client-request-id`（xAI 忽略，会打错分片）。不要自造 grok-shell UA；保持 `grok-cli/0.2.93`。

## GLM

一线是闭源 **ZCode Desktop 3.10.1**（[changelog](https://zcode.z.ai/en/changelog)）+ 官方文档，没有 GitHub 源码仓。

| 文档 | 用途 |
|---|---|
| [Coding Plan 快开始](https://docs.z.ai/devpack/quick-start) | Anthropic 默认协议 |
| [缓存](https://docs.z.ai/guides/capabilities/cache) | 隐式前缀 + `cache_control` |
| [思考](https://docs.z.ai/guides/capabilities/thinking-mode) | Completions 形；Anthropic thinking **未实测** |

指纹来自 Desktop `zcode.cjs`（`eao` / `rao`），不是第三方包装。CLI poll 走 `zcode.z.ai`，provider 只能是 `zai` / `bigmodel`。

**不要发明：** Codex `prompt_cache_key`、Grok 分片头、第四种 DSH `api`。不要宣称切 Anthropic 就能吃 150%（那是 Desktop 身份，不是协议）。不要发明 `X-Aliyun-Captcha-Verify-Param` 或在本 hop 解 zcode-plan 验证码（3007 是 Desktop 渲染墙，不是指纹缺口）。

## Kiro

一线：Kiro IDE + [kiro.dev/docs/models](https://kiro.dev/docs/models)。协议对齐 MIT [ZyphrZero/kiro.rs](https://github.com/ZyphrZero/kiro.rs)（`build_history`、eventstream）。目录缺口 `claude-fable-5` 来自 [mikeyobrien/pi-provider-kiro](https://github.com/mikeyobrien/pi-provider-kiro) `0.10.2` bootstrap。

导入格式蒸馏自 AGPL [lucks-cloud/kiro-manager-lite](https://github.com/lucks-cloud/kiro-manager-lite)：**只记卡密 / JSON / CSV 形状，不抄源码**。解析器是 `kiro/import.ts` 自己的。

**不要发明：** `conversationId: Date.now()`；把 system 每轮拼进 `currentMessage.content`；把 `meteringEvent.usage` 当 token；把 AGPL 解析器贴进树。

## Antigravity

一线：本机 **Antigravity.app 2.11.0** hub（`--subclient_type hub`，daily-cloudcode-pa）。公开 installed-app 客户端、短 UA、onboard UA、`models.json` 的 `antigravity` 行对照 [router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) `constants.go`。`maxOutputTokens` 钳位对照 [Rahularya01/pi-antigravity](https://github.com/Rahularya01/pi-antigravity) `getMaxOutputTokens`。thought 签名：[Google thought signatures](https://ai.google.dev/gemini-api/docs/thought-signatures)。

**不要发明：** IDE.app / prod `cloudcode-pa` 当默认；chat 上的 `Client-Metadata` / `x-goog-api-client`；`implicitCacheConfig`；假 `thoughtSignature`；Pi 的 2.8.0 UA / `vscode_cloudshelleditor`。

## Cursor

非正式集成。Wire / PKCE / HTTP/2 改编自 MIT：

- [Rahularya01/pi-cursor](https://github.com/Rahularya01/pi-cursor)（`src/auth/oauth.ts`、`docs/protocol.md`、`src/client/h2-session.ts`、`proto/agent.proto`）。`DEFAULT_CURSOR_CLIENT_VERSION` = `cli-2026.07.23-e383d2b`
- [ephraimduncan/opencode-cursor](https://github.com/ephraimduncan/opencode-cursor)

缓存命中字段对照 [fitchmultz/pi-cursor-sdk](https://github.com/fitchmultz/pi-cursor-sdk) 钉的 **`@cursor/sdk@1.0.27`**：`TurnEndedUpdate.cache_read_tokens`（proto field 3）、Run handshake `x-original-request-id`。

pi-cursor-sdk 自己走 **API key + `Agent.create`**，不是 OAuth。本 hop 是 `loginDeepControl`，所以 **`x-cursor-client-type` 保持 `cli`**，不要改成 `sdk`。不 npm `@cursor/sdk`，不 vendor 整棵 proto。

**不要发明：** `x-parent-request-id` / `x-root-parent-request-id`；历史 turn 的 `randomUUID()`（必须内容哈希）；`Date.now()` conversation id。

## Ollama Cloud

一线是官方文档，不是 localhost daemon。

| 文档 / issue | 本 hop |
|---|---|
| [Authentication](https://docs.ollama.com/api/authentication) | `OLLAMA_API_KEY` Bearer |
| [Cloud](https://docs.ollama.com/cloud) | `https://ollama.com/api/chat` + `GET /api/tags` |
| Factory 集成 `https://ollama.com/v1/` | Completions 透传 |
| [ollama#12532](https://github.com/ollama/ollama/issues/12532) | session 窗口 = UTC 5h unix 桶 |
| [ollama#16598](https://github.com/ollama/ollama/issues/16598) | Cloud 忽略 `num_ctx`；窗口来自 `/api/show` |

**不要发明：** `cached_tokens`、sticky conversation id、把 `id_ed25519.pub` 当 API key、包一层 `localhost:11434`。

## Kimi

一线：官方 Kimi Code CLI。设备码（无 PKCE）对照 MIT [Leechael/pi-provider-kimi-code](https://github.com/Leechael/pi-provider-kimi-code)。`client_id` `17e5f671-d194-4dfb-9706-5516cb48c098`。导入 `~/.kimi-code/credentials/kimi-code.json`。

**不要发明：** PKCE；第四种 DSH `api` 字符串；Codex / Grok 缓存头；把 UA 扮成 `pi-provider-kimi-code`。不要 vendoring `moonshot_search` / `moonshot_fetch`。

## GitHub Copilot

一线设备流形状：[anomalyco/opencode](https://github.com/anomalyco/opencode) `packages/opencode/src/plugin/github-copilot/copilot.ts`（JSON 设备码、`X-Interaction-Id`、`x-initiator`、`Copilot-Vision-Request`）。

**client_id 不抄 OpenCode `Ov23li8tweQw6odWQebz`**（发 `gho_`，`/copilot_internal/v2/token` 404）。本 hop 用 VS Code GitHub App 公开 `Iv1.b507a08c87ecfe98`（`ghu_` → `tid=`），对照 goose / Cherry Studio / hermes-agent。

| 抄 | 本 hop |
|---|---|
| 设备码 RFC 8628 JSON `{client_id,scope:read:user}` | `copilotDeviceSpec` `jsonBody: true` |
| `GET copilot_internal/v2/token` | `exchangeCopilotToken`；401/403 永久 |
| vscode-chat 身份头 | `Copilot-Integration-Id: vscode-chat`；UA `GitHubCopilotChat/0.35.0` |
| `X-Interaction-Id` = session | `copilotCacheHeaders` / `copilotUpstreamHeaders` |
| GPT 不发 `maxOutputTokens` | `applyCopilotThinking` 剥 `max_tokens` |
| `GET copilot_internal/user` | `fetchCopilotQuota`（`token ghu_`，不是 `tid=`） |

**不要发明：** OpenCode `Ov23li8` client_id；PKCE / GHES；`X-Interaction-Type: agent-session-name-generation`；把 Copilot `pro` 显示成 Codex Pro 20x；第四种 DSH `api`；把 Claude 改打 `/v1/messages`。

## 新家族

加 `src/oauth/<id>/` 的同一 PR：

1. 家族 README 写 **归因**（官方 CLI + 社区仓 + 钉住的版本）。
2. 本文件总表加一行，并补「抄 / 不要发明」。
3. 不要把对照仓的多家族共用层引进 `src/utils/`。
