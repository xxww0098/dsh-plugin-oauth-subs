# dsh-plugin-oauth-subs

简体中文 | [English](README.md)

[![CI](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml/badge.svg)](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml)

把 **ChatGPT / Codex 订阅** 和 **xAI Grok 订阅** 接到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。登录走官方 OAuth，不需要 API Key。

本机 Responses 代理 + `llm-pi-ai` 路由同步。

## 安装

```sh
dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs
dsh web
```

打开 **设置 → OAuth 订阅**。也可以用 `cordis.patch.yml` 手动挂载：

```yaml
- insert:
    - id: oauth-subs
      name: dsh-plugin-oauth-subs
```

```sh
pnpm dsh web --patch ./cordis.patch.yml
```

## 登录

| 提供商 | 流程 | 客户端 | 上游 |
|---|---|---|---|
| ChatGPT Codex | PKCE，回环 `localhost:1455`（占用则 `1457`），可粘贴回调 | `app_EMoamEEZ73f0CkXaXp7hrann` | `chatgpt.com/backend-api/codex/responses` |
| xAI Grok | **设备码（默认）**；PKCE 回环 `127.0.0.1:56121` 作备选 | `b1a00492-073a-47ea-816f-4c329264a828` | `api.x.ai/v1/responses` |

已在本机登录过 Codex CLI、Grok CLI 或 Hermes 时，点 **导入本机会话**：

- `~/.codex/auth.json`
- `~/.grok/auth.json`
- `~/.hermes/auth.json`

令牌写在 profile 数据目录 `data/dsh-plugin-oauth-subs/auth.json`，权限 `0600`。开启/关闭的模型写在同目录的 `models.json`。

## 工作原理

```text
设置页（控制面）
  └─ OAuth 登录 / 导入 / 退出，同步模型

DeepSeek Harness（调用面）
  └─ llm-pi-ai
       └─ http://127.0.0.1:8318/{codex,grok}/v1/responses
            └─ 使用刷新后的订阅令牌访问上游
```

本插件不是第二套 LLM 适配器。设置页关闭后，DSH 仍通过 `llm-pi-ai` 调本机代理。代理只监听回环地址，并用本地凭证 `DSH_OAUTH_SUBS_API_KEY` 鉴权。

## 可靠性

代理负责缓存亲和与流重试。长 Codex 会话里有两条契约：

1. **缓存分片。** Codex 的 `prompt_cache_key` 会同时写成 `session-id` 和 `x-client-request-id`。键会被清洗成 `[A-Za-z0-9._:-]` 并裁到 64 字符，而不是直接丢掉——会话 id 过长时仍然要钉在同一分片。键缺失或非法时回退 `session_id`。裁过的键会写回请求体，避免 Codex 对超过 64 字符的值返回 400。
2. **稳定前缀。** Codex 按 `instructions` 再 `input` 的最长前缀匹配缓存。重复的 leading developer/system 会剥掉；多出来的 plan / header 文本停到 **input 末尾**，对话前缀才能继续命中。`prompt_cache_retention` 会删掉（gpt-5.6 拒绝该字段）。
3. **提交门。** 产出内容之前的静默断流会在响应头提交前重试，避免 llm-pi-ai 把干净 EOF 当成 TRANSPORT 连重试 5 次。

完整 `session-772f7f3a-…` SkillStar 会话验收（`oauth-codex` / `gpt-5.6-terra-fast`，211 次调用，71 分钟）：

| | 2026-08-26 事故 | 0.0.14 亲和头之后 |
|---|---|---|
| 加权缓存命中 | 27.4% | **95.6%** |
| 前缀复用（中位） | — | **99.6%** |
| 亲和丢失 | 47 / 90 零缓存 | **0** |
| 前缀改写 | — | 1 次适配器重建 + 9 次压缩 |
| TRANSPORT 故障 | 29 | 0 |

剩下的未缓存几乎都是新的工具输出（`delta`），加上预期的前缀改写：退出 plan（step 55，169k）和 DSH 压缩（330k）。每次改写后的下一拍复用约 99%。这不是分片走丢。

健康规则：加权命中 ≥ **80%**，**亲和丢失为 0**，且无 TRANSPORT。压缩 / `request/header` 重建造成的零缓存不会判失败。细节见 [docs/error.md](docs/error.md)。

## 诊断会话

导出 DSH 的 `session.jsonl`（或解压会话压缩包）后打分：

```sh
npm run analyze -- path/to/session.jsonl
node scripts/analyze-session.mjs --json path/to/session.jsonl
node scripts/analyze-session.mjs --fail-below 80 path/to/session.jsonl
```

分析器按 turn+step 只计一次 `assistant/message` 的 usage（后面的 `assistant/chunk` usage 是重复记账）。每步会标 `cold_start` / `delta` / `compaction` / `rebuild` / `affinity_miss`，避免把压缩会话误判成分片回归。工具错误会分成 `host_timeout` / `cascade_abort` / `invalid`，与 TRANSPORT 分开。glob/grep 的 30s 预算在 `dsh-tool-fs-search` 上，本代理加不长。也可 `import` `dsh-plugin-oauth-subs/analyze-session`。

## Fast 模式

本质是 **Priority Processing**（请求里写 `service_tier: "priority"`），不是换一个模型族。

| 模型 | Fast |
|---|---|
| GPT-5.6 Sol / Terra / Luna、GPT-5.5、GPT-5.4 | 可以。在模型列表选带 `-fast` 的条目。 |
| GPT-5.4 Mini、GPT-5.3 Codex Spark | 不行。它们目录里的 `service_tiers` 是空的，不会生成 `-fast` 条目。 |
| Grok 4.6 | 可以。 |
| 更早的 Grok | 不行。xAI Responses API 不接受该字段，代理会剥掉。 |

默认关闭。在 `gpt-5.6-luna` 上实测：**输出 88.3 对 57.5 token/秒，1.54 倍**，与目录标称的 "1.5x speed, increased usage" 吻合。提升只在生成吞吐上——首 token 时间和缓存命中不受影响。

登录、刷新令牌、对话和额度走同一套官方客户端身份：Codex 为成对的 `originator: codex_cli_rs` 与 `User-Agent: codex_cli_rs/<version>`；Grok 为 `x-xai-token-auth: xai-grok-cli` 与 `User-Agent: grok-cli/<version>`。不模拟浏览器 TLS 指纹。

## 模型选择

设置 → OAuth 订阅 会列出 Codex 与 Grok 的全部目录（含 `-fast` 与 `-900k` 条目）。每一行是独立开关。每个系列有 **全选** / **全关**。

默认全部开启，**900K 除外**。选带 **Fast** 的条目（`gpt-5.6-sol-fast`、`grok-4.6-fast`）才会走 Priority Processing。`-fast` 只在本机目录里，发给上游前会剥掉并加上 `service_tier: "priority"`。GPT-5.4 Mini 和 GPT-5.3 Codex Spark 没有 Fast 条目。

GPT-5.6 Sol / Terra / Luna 实际可到 **872K**，GPT-5.4 可到 **1M**，都远超默认窗口。选 `gpt-5.6-sol-900k`（以及 Terra / Luna / 5.4 对应项）即可开启——`-900k` 只是一个稳定的本机 id，真实上限逐模型不同，发给上游前会剥掉。GPT-5.5、GPT-5.4 Mini 和 Spark 没有大窗口条目。

900K 和 Fast 都更耗额度。

关掉的模型不会写入下一次 `llm-pi-ai` 同步，DeepSeek Harness 的模型列表里也就看不到。选择保存在 `models.json`。以后目录新增的普通模型默认是开的；新增的 900K 条目默认关闭。

未登录也可以先勾选，登录后再同步。**同步到模型列表** 会按当前勾选重写路由。

Grok 4.6 思考深度为 **low / medium / high / xhigh**。Grok 4.5 为 **low / medium / high**（没有 xhigh）。思考不能关掉；不选时上游默认 **high**。Grok 4 没有深度选项。Codex 的 GPT-5.6 Sol / Terra / Luna 在 **low / medium / high / xhigh** 之上还有 **max**。其余 Codex 模型最高到 **xhigh**。不提供 `minimal`：所有 Codex 模型都拒绝该取值。

在 DeepSeek Harness **会话**里点模型名称 → **推理等级** 设置，不在「设置 → 模型」。安装或改目录后点一次 **同步到模型列表**。

## 额度

登录后，设置页账号卡片会显示官方额度。

| 订阅 | 接口 | 显示 |
|---|---|---|
| ChatGPT Codex | `chatgpt.com/backend-api/wham/usage` | 套餐等级（Plus / Pro / Team …）+ 5 小时窗口 + 每周窗口，展示**剩余**百分比和重置时间 |
| ChatGPT Codex 重置 | `…/wham/rate-limit-reset-credits` 与 `/consume` | 银行的 5 小时重置次数和过期时间；Codex 卡片上的确认按钮 |
| xAI Grok | `cli-chat-proxy.grok.com/v1/billing?format=credits`，并读 `/v1/user?include=subscription` | 套餐等级（SuperGrok / X Premium+ …）+ 本周期用量、预付余额、产品分项 |

额度约每分钟刷新一次，也可点卡片上的 **刷新额度**。读失败不影响对话。

登录后账号标题旁显示 **套餐** 徽章：Codex 来自 JWT `chatgpt_plan_type` 与 usage 的 `plan_type`；Grok 来自 JWT `tier` 与 billing / user 的 `subscription_tier`。

进度条按剩余百分比从绿过渡到黄再到红（`hsl(剩余 × 1.2, 78%, 38%)`）。

ChatGPT / Codex Plus、Pro 可能有银行的 5 小时重置次数。还有剩余次数时，Codex 卡片显示 **重置额度 · 剩 N 次**，并标出该次重置何时过期。确认后插件会 `POST` `chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume`，请求体为 `{ redeem_request_id }`，并带 `idempotencyKey`。Grok 没有对应能力。

## 配置

| 选项 | 默认 | 说明 |
|---|---|---|
| `port` | `8318` | 本机代理端口 |
| `provider` | `oauth` | 同步到 DSH 的路由 ID 前缀（`oauth-codex` / `oauth-grok`） |
| `dataDir` | profile 数据目录 | `auth.json`、`models.json` 与 `proxy-key` 位置 |
| `grokLogin` | `device` | `device` 或 `pkce` |

## 开发

```sh
npm test
npm run analyze -- path/to/session.jsonl
```

见 [CONTRIBUTING.md](CONTRIBUTING.md)。
