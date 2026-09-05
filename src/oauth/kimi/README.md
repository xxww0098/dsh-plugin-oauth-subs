# Kimi Code Plan OAuth

本文件是 `src/oauth/kimi/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬约定在仓库根 [`AGENTS.md`](../../../AGENTS.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

**不是** ChatGPT Codex / xAI Grok。上游是 Moonshot Kimi Code Plan
`https://api.kimi.com/coding/v1/chat/completions`（OpenAI Completions 方言）。
登录对齐官方 Kimi Code CLI / MIT [pi-provider-kimi-code](https://github.com/Leechael/pi-provider-kimi-code) 的设备码，**没有 PKCE**。

不要 vendoring `moonshot_search` / `moonshot_fetch` / `kimi_datasource`。

## 文件

| 文件 | 职责 |
|---|---|
| [`index.ts`](index.ts) | client_id、设备码 spec、换票、刷新、X-Msh 头、session、`/me` 身份 |
| [`import.ts`](import.ts) | `~/.kimi-code/credentials/kimi-code.json` + 只读 `~/.kimi/…`；可选 `KIMI_API_KEY` |
| [`catalog.ts`](catalog.ts) | 登录后 `GET /coding/v1/models`；静态 `KIMI_MODELS` 只做 fallback |
| [`request.ts`](request.ts) | DSH `reasoning_effort` → `thinking` / `thinking.effort` |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段；前缀哈希停车。禁止抄 `session-id` / `x-grok-conv-id` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'kimi'` → `applyKimiCache` + `applyKimiThinking`，`forward()` 到 `KIMI_CHAT_URL`。
额度：[`../quota.ts`](../quota.ts) `fetchKimiQuota`（`/usages` + `/me`）。
套餐：`/me` 的 `user_level_name`，走 [`../plan.ts`](../plan.ts) 原样美化，不发明档位。

## 协议

DSH `api: openai-completions`。不要写 `kimi-openai-completions`：DSH 闭集只有
`openai-responses` | `openai-completions` | `anthropic-messages`，第四个值会整段丢掉。

```text
DSH POST /kimi/v1/chat/completions
  → applyKimiCache（剥 prompt_cache_key / session_id / retention；快照停到 messages suffix）
  → applyKimiThinking（目录声明思考时写 thinking.effort）
  → POST https://api.kimi.com/coding/v1/chat/completions
     Authorization: Bearer <access>
     User-Agent + X-Msh-Platform / X-Msh-Device-Id …
```

`baseURL` 是 `${origin}/kimi`。Completions SDK 打到 `/kimi/v1/chat/completions`。

`reasoningEfforts` 键只有 `off|minimal|low|medium|high|xhigh|max`。值是 Kimi `thinking.effort`（默认图：minimal/low→low，medium/high→high，xhigh/max→max）。`off` 的值是 `off`，映射成 `thinking: { type: 'disabled' }`。

## 登录

默认 **设备码**，浏览器不回 127.0.0.1。**没有 PKCE**。

| 项 | 值 |
|---|---|
| `client_id` | `17e5f671-d194-4dfb-9706-5516cb48c098` |
| device | `POST https://auth.kimi.com/api/oauth/device_authorization` body 只有 `client_id` |
| token | `POST https://auth.kimi.com/api/oauth/token` `grant_type=urn:ietf:params:oauth:grant-type:device_code` |
| 刷新 | 同 token URL，`grant_type=refresh_token`。401 / 403 / `invalid_grant` = 永久，必须重登 |
| UA | `dsh-plugin-oauth-subs` + `X-Msh-*`（设备 id 在插件 data dir，不是 `~/.kimi-code`） |

`authorization_pending` = 继续等；`slow_down` = interval +5s；`expired_token` = **重新** device_authorization（`DeviceFlowManager.restartOnExpired`）。

入口：`kimiDeviceSpec` → `DeviceFlowManager.start('kimi')` → `completeKimiDevice` → `kimiSession`。
导入：[`import.ts`](import.ts) `importKimiAuth`。空花名册只自动导入 `kimi-code.json` 一次。已存 session **绝不**静默覆盖。

粘贴 `KIMI_API_KEY` / `sk-` 是 KEY source，不刷新。

身份：`GET /coding/v1/me` 尽力取 email / nickname / `user_level_name`。失败用 `kimi-<sha256 前 8>`，不当账号名打印 token。

## 模型

登录 / 导入 / 额度刷新后 `refreshKimiCatalog`：

```text
GET https://api.kimi.com/coding/v1/models
Authorization: Bearer <access>
```

失败或空列表回落静态三行：`kimi-for-coding`、`kimi-for-coding-highspeed`、`k3`（text+image，256k / 32k）。

## 额度

`GET /coding/v1/usages` + `GET /coding/v1/me`。条是 **剩余**（`remainingPercent`）。
`/me.user_level_name` 当天的 plan 徽章。API 没给 `resetTime` 就不写重置时刻，不发明 5h / 周窗。

## 缓存

Kimi 是 **前缀哈希**，没有分片键。

| 步骤 | 函数 | 做什么 |
|---|---|---|
| 1 | `kimiCacheSessionId` | 清洗 DSH id（1–64，`[A-Za-z0-9._:-]`） |
| 2 | `applyKimiCache` | 剥 Codex/Grok 字段；首段 system 钉住，后续快照停到 **messages suffix** |
| 3 | `kimiCacheHeaders` | 空。不写 `session-id` / `x-grok-conv-id` |

`dsh-kimi` 只给分析器标签，**不**写进 upstream body。不要发明 `cached_tokens`。不要 `Date.now()`。

## 不要

- 不要加 PKCE。
- 不要把 `api` 写成 `kimi-openai-completions` 或 Responses / Anthropic。
- 不要给 Kimi 写 Codex `session-id` / `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要 vendoring moonshot 工具。
- 不要假装成 Pi（UA / `X-Msh-Platform` 用本插件，不是 `pi-provider-kimi-code`）。
- 不要 npm `@lobehub/icons`。Settings 图标是 LobeHub static SVG path。

## 归因

设备码对照 MIT [Leechael/pi-provider-kimi-code](https://github.com/Leechael/pi-provider-kimi-code)；`client_id` 与官方 Kimi Code CLI 相同。不要扮成 Pi。总表见 [`docs/oauth.md`](../../../docs/oauth.md)。

## 追溯

| 问题 | 记录 |
|---|---|
| 自定义 api 字符串整段 settings 被丢 | [`docs/error.md`](../../../docs/error.md) 2026-09-03 Kimi api 闭集 |
| `@lobehub/icons` 在经典脚本里是空的 | 同文件 Settings 图标 |

测试：`test/kimi.test.ts`、`test/cache-families.test.ts`、`test/device-flow.test.ts`。
