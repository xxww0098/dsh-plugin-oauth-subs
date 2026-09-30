# Kimi Code Plan OAuth

本文件是 `src/oauth/kimi/` 的设计源。改登录、额度、对话或缓存先改这里再改代码。
跨家族硬规则在 [`docs/rules.md`](../../../docs/rules.md)；故障记录在 [`docs/error.md`](../../../docs/error.md)；对照仓库在 [`docs/oauth.md`](../../../docs/oauth.md)。

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
| [`request.ts`](request.ts) | DSH `reasoning_effort` → `thinking` / `thinking.effort`；流式要 `include_usage`；`cache_read_*` 出现才译成 `cached_tokens` |
| [`cache.ts`](cache.ts) | 剥 Codex / Grok 字段；前缀哈希停车。禁止抄 `session-id` / `x-grok-conv-id` |

调度：[`../proxy.ts`](../proxy.ts) `family === 'kimi'` → `applyKimiCache` + `applyKimiThinking`，`forward()` 到 `KIMI_CHAT_URL`。
额度：[`quota.ts`](quota.ts) `fetchKimiQuota`（`/usages` + `/me`）。
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
| 刷新 | 同 token URL，`grant_type=refresh_token`。401 / `invalid_grant` = 永久，必须重登；403 按临时失败 |
| UA | `dsh-plugin-oauth-subs` + `X-Msh-*`（设备 id 在插件 data dir，不是 `~/.kimi-code`） |

`authorization_pending` = 继续等；`slow_down` = interval +5s；`expired_token` = **重新** device_authorization（`DeviceFlowManager.restartOnExpired`）。

入口：`kimiDeviceSpec` → `DeviceFlowManager.start('kimi')` → `completeKimiDevice` → `kimiSession`。
导入：[`import.ts`](import.ts) `importKimiAuth`。空花名册只自动导入 `kimi-code.json` 一次。已存 session **绝不**静默覆盖。

**导入只读**（决定 4）：`source: 'cli'` 的登录临期时，`kimiImported` 钩子只重读 `kimi-code.json`，过期 > 现在 + 15s 才采用；文件也过期 → `ImportedLoginStale`（403）「… run kimi or use browser login」，不删登录。`kimi-code.json` 只有 token、没有账号标识，所以不校验「CLI 换了号」。`oauth` 登录照常刷新。

轮换证据：来源一 MoonshotAI/kimi-cli `1.52.0` `src/kimi_cli/auth/oauth.py`——`refresh_token()` 的响应经 `OAuthToken.from_response` 必取 `refresh_token`，`save_tokens` 写回 `~/.kimi/credentials/kimi-code.json`（跨进程 `.lock`），注释明写 rotated ⇒ 会轮换。来源二（被动观察：插件自有登录在宿主自然刷新前后各记一次 refresh token sha256 前 8 位）：待合入后记录。

粘贴 `KIMI_API_KEY` / `sk-` 是 KEY source，不刷新。

身份：`GET /coding/v1/me` 尽力取 email / nickname / `user_level_name`。失败用 `kimi-<sha256 前 8>`，不当账号名打印 token。

## 模型

行在 [`src/catalog/models.json`](../../catalog/models.json) 的 `"kimi"` 键；行格式、来源与 `npm run models` 更新流程见 [`docs/models.md`](../../../docs/models.md)。本节只记本家的取舍与出处。

登录 / 导入 / 额度刷新后 `refreshKimiCatalog` 打 `GET https://api.kimi.com/coding/v1/models`（Bearer access token），活目录非空即替换静态行；失败或空列表回落静态行。

- 静态行按[官方模型表](https://www.kimi.com/code/docs/en/kimi-code/models.html)的模型 ID 收录。
- `k3` 静态窗口取 1M（官方表 `1048576`，Pro / Allegretto 及以上）；Plus / Moderato 账号上 `k3` 最多 256K，要么在模型页把窗口改小，要么用固定 256K 的 `k3-256k`。其余行静态窗口保守取 256K（`kimi-for-coding` 的 1M 同样只在较高档位开放）。登录后活目录的 `context_length` 覆盖静态值。
- 思考档官方为 low / high / max，走 `KIMI_REASONING` 映射；活目录按行声明的档位收窄。
- 本机无 Kimi 凭据，活端点未实测（无 token 401）。

最近核对：2026-09-23，官方模型表；`k3` 默认窗改为 1M 按同一张表。

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

`dsh-kimi` 只给分析器标签，**不**写进 upstream body，也不钉系统提示（`isKimiFallback`）。上游若带回 `cached_tokens` / `cache_read_*`，hop 译成 `prompt_tokens_details.cached_tokens`；没有字段不发明 0。流式缺省 `include_usage`。不要 `Date.now()`。

## 不要

- 不要加 PKCE。
- 不要把 `api` 写成 `kimi-openai-completions` 或 Responses / Anthropic。
- 不要给 Kimi 写 Codex `session-id` / `prompt_cache_key` 或 Grok `x-grok-conv-id`。
- 不要 vendoring moonshot 工具。
- 不要假装成 Pi（UA / `X-Msh-Platform` 用本插件，不是 `pi-provider-kimi-code`）。
- 不要 npm `@lobehub/icons`。Settings 图标是 LobeHub static SVG path。

## 归因

一线：官方 Kimi Code CLI。设备码对照 MIT [Leechael/pi-provider-kimi-code](https://github.com/Leechael/pi-provider-kimi-code)；模型目录对照[官方模型表](https://www.kimi.com/code/docs/en/kimi-code/models.html)。

| 抄 | 出处 | 本 hop |
|---|---|---|
| 设备码流程（无 PKCE） | pi-provider-kimi-code | `kimiDeviceSpec` |
| 模型页价格徽标（USD / 1M） | models.dev `moonshotai`（platform.kimi.ai 定价）；按官方模型表 `k3`/`k3-256k` → K3、`kimi-for-coding-highspeed` → K2.7 Code HighSpeed；`kimi-for-coding`（K2.8 Preview）无公开价，不出徽标 | `src/catalog/rates.json`，`npm run rates` 写入（见 [docs/models.md](../../../docs/models.md) 费率表） |
| `client_id` `17e5f671-d194-4dfb-9706-5516cb48c098` | 官方 Kimi Code CLI | `KIMI_CLIENT_ID` |
| 凭据导入 `~/.kimi-code/credentials/kimi-code.json` | 官方 Kimi Code CLI | `importKimiAuth` |
| 模型 id 与思考档 | 官方模型表 | 见「模型」 |

**不要发明：** 与上游对照相关的每一条都已在上面「不要」节，这里不重复。

跨家族对照总表见 [`docs/oauth.md`](../../../docs/oauth.md)。
