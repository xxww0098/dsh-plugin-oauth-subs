# GitHub Copilot OAuth

本文件是 `src/oauth/copilot/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** ChatGPT Codex / OpenCode Zen / GitHub Copilot CLI 的 `copilot.com`。
上游是 Copilot Chat API `https://api.githubcopilot.com`（OpenAI Completions 方言）。
登录是 RFC 8628 设备码，**没有 PKCE**。

一线设备流形状对照 [anomalyco/opencode](https://github.com/anomalyco/opencode) `packages/opencode/src/plugin/github-copilot/copilot.ts`。
**client_id 不抄 OpenCode 的 `Ov23li8tweQw6odWQebz`**：那个 OAuth App 发 `gho_`，`/copilot_internal/v2/token` 404，预览模型 400 `model_not_supported`（opencode#19338 / #20759）。
本 hop 用 VS Code Copilot GitHub App 公开 `Iv1.b507a08c87ecfe98`（`ghu_`），再换短时 `tid=` session token。这是 copilot.vim / goose / Cherry Studio 同一条线。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | client_id、设备码 spec、换票、刷新、vscode-chat 身份头、session、`/user` |
| [`import.ts`](import.ts) | `~/.config/github-copilot/hosts.json`、OpenCode `auth.json`、`COPILOT_GITHUB_TOKEN` / `GITHUB_TOKEN` / `GH_TOKEN` |
| [`catalog.ts`](catalog.ts) | 登录后 `GET {api}/models`；静态 `COPILOT_MODELS` 只做 fallback |
| [`request.ts`](request.ts) | GPT 剥 `max_tokens`；`reasoning_effort`；`cache_read_*` → `cached_tokens` |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段。`X-Interaction-Id` = DSH pin。禁止抄 `session-id` / `x-grok-conv-id` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'copilot'` → `applyCopilotCache` + `applyCopilotThinking` + `copilotUpstreamHeaders`，`forward()` 到 `{endpoints.api}/chat/completions`。
额度：[`../quota.ts`](../quota.ts) `fetchCopilotQuota`（`GET api.github.com/copilot_internal/user`，`Authorization: token <ghu_>`）。
套餐：`copilot_plan`（free / pro / pro+ / business / enterprise），走 [`../plan.ts`](../plan.ts)。**禁止**落到 Codex `pro` → Pro 20x。

## 协议

DSH `api: openai-completions`。不要写第四个 api 字符串。

```text
DSH POST /copilot/v1/chat/completions
  → applyCopilotCache（剥 prompt_cache_key / session_id / retention；快照停到 messages suffix）
  → applyCopilotThinking（目录有 effort 图才保留 reasoning_effort；gpt* 剥 max_tokens）
  → POST {endpoints.api}/chat/completions
     Authorization: Bearer <tid= session>
     User-Agent: GitHubCopilotChat/0.35.0
     Editor-Version: vscode/1.107.0
     Editor-Plugin-Version: copilot-chat/0.35.0
     Copilot-Integration-Id: vscode-chat
     Openai-Intent: conversation-edits
     X-GitHub-Api-Version: 2026-06-01
     X-Interaction-Id: DSH pin（缺省 dsh-copilot）
     x-initiator: user | agent
     Copilot-Vision-Request: true  （messages 含 image_url 才发）
```

`baseURL` 是 `${origin}/copilot`。Completions SDK 打到 `/copilot/v1/chat/completions`。
`POST /copilot/v1/responses` 回 501。v1 不译 `/v1/messages`（Claude 在 Copilot 上仍走 Completions）。

## 登录

默认 **设备码**，浏览器打开 `https://github.com/login/device`。**没有 PKCE**。**不做 GHES / GHE.com**（v1 只 github.com）。

| 项 | 值 |
|---|---|
| `client_id` | `Iv1.b507a08c87ecfe98`（VS Code Copilot GitHub App） |
| scope | `read:user` |
| device | `POST https://github.com/login/device/code` JSON `{client_id,scope}` |
| token | `POST https://github.com/login/oauth/access_token` JSON device_code grant |
| 换票 | `GET https://api.github.com/copilot_internal/v2/token` `Authorization: token <ghu_>` |
| 刷新 | 再换票。GitHub App `refresh_token` 过期才走 GitHub token URL。401 / 403 = 永久，必须重登 |
| UA / 身份 | `GitHubCopilotChat/0.35.0` + vscode-chat 头。session token 绑定这套头，缺了 Business/预览 403 |

`authorization_pending` = 继续等；`slow_down` = interval +5s；`expired_token` = **重新** device（`DeviceFlowManager.restartOnExpired`）。

入口：`copilotDeviceSpec` → `DeviceFlowManager.start('copilot')` → `completeCopilotDevice` → `copilotSession`。
导入：[`import.ts`](import.ts) `importCopilotAuth`。空花名册只自动导入 `hosts.json` / OpenCode `auth.json` 一次。已存 session **绝不**静默覆盖。

粘贴 `ghu_` / `ghp_` / `GITHUB_TOKEN` 是 KEY source：立刻换票，不走 GitHub refresh_token。

身份：`GET https://api.github.com/user` 取 `login`。失败用 `copilot-<sha256 前 8>`，不当账号名打印 token。

`gho_`（OpenCode 自家 OAuth App）换票 404 时把 raw token 当 Bearer（GA 模型能聊，预览模型不要指望）。

## 模型

登录 / 导入 / 额度刷新后 `refreshCopilotCatalog`：

```text
GET {endpoints.api}/models
Authorization: Bearer <tid=>
Copilot-Integration-Id: vscode-chat
```

只收 `model_picker_enabled` 且 `policy.state !== disabled` 且声明 `tool_calls` 的行。失败或空列表回落静态楼。不要把 `/v1/messages`-only 行改打 Anthropic。

`capabilities.supports.reasoning_effort` → DSH `reasoningEfforts`（键是 picker 档，值是 vendor 拼写）。没有 effort 图就省略字段。

默认辅助模型：`gpt-4.1`（官方 utility / 静态楼都有）。

## 额度

`GET https://api.github.com/copilot_internal/user`（GitHub `ghu_` + vscode-chat 头，**不是** `tid=` session）。
条是 **剩余**（`quota_snapshots.premium_interactions.percent_remaining`）。
`copilot_plan` 当天的 plan 徽章。`quota_reset_date` 有就写重置时刻，不发明 5h 窗。
同一 JSON 里的 `login` 当账号名。

## 缓存

Copilot Completions 是 **前缀哈希** + `X-Interaction-Id` 会话粘滞。官方 OpenCode 发 `X-Interaction-Id: sessionID`。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `copilotCacheSessionId` | 清洗 DSH id（1–64，`[A-Za-z0-9._:-]`） |
| 2 | `applyCopilotCache` | 剥 Codex/Grok 字段；首段 system 钉住，后续快照停到 **messages suffix** |
| 3 | `copilotCacheHeaders` / `copilotUpstreamHeaders` | `X-Interaction-Id`。不写 `session-id` / `x-grok-conv-id` |

命中：上游 `prompt_tokens_details.cached_tokens` / `cache_read_input_tokens` → `mapCopilotUsage`。没有字段不发明 0。不要 `Date.now()`。缺省 pin `dsh-copilot` **会**写成 `X-Interaction-Id`（官方总是发 session id）。

## 不要

- 不要用 OpenCode `Ov23li8tweQw6odWQebz` 当 client_id（`gho_` 换不出 `tid=`）。
- 不要把 `ghu_` 直接当 `Authorization: Bearer` 打 `api.githubcopilot.com`（Business / 预览要 session token）。
- 不要加 PKCE、不要做 GHES。
- 不要把 `api` 写成 Responses / Anthropic / 自定义字符串。
- 不要给 Copilot 写 Codex `session-id` / `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要发明 `X-Interaction-Type: agent-session-name-generation`（那是 OpenCode 标题代理）。
- 不要把 Copilot `pro` 格式化成 Codex **Pro 20x**。
- 不要 npm `@lobehub/icons`。Settings 图标复用已内联的 GitHub path。

## 归因

设备流形状：[anomalyco/opencode](https://github.com/anomalyco/opencode) `plugin/github-copilot`（`X-Interaction-Id` / 设备码 JSON）。
client_id + 换票：VS Code Copilot GitHub App `Iv1.b507a08c87ecfe98`；对照 [goose `githubcopilot.rs`](https://github.com/aaif-goose/goose)、[Cherry Studio `CopilotService.ts`](https://github.com/CherryHQ/cherry-studio)、[hermes-agent `copilot_auth.py`](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/copilot_auth.py)（OpenCode `Ov23li8` 发 `gho_`，换票 404）。
身份头 / 额度：`Copilot-Integration-Id: vscode-chat`；额度 `Authorization: token <ghu_>` 打 `GET copilot_internal/user`。
总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

## 追溯

| 问题 | 记录 |
|---|---|
| OpenCode `Ov23li8` 换不出 session token | [`docs/error.md`](../../../docs/error.md) 2026-09-05 Copilot Iv1 + tid |

测试：`test/copilot.test.ts`、`test/cache-families.test.ts`、`test/device-flow.test.ts`。
