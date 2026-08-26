# dsh-plugin-oauth-subs

简体中文 | [English](README.md)

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

## Fast 模式

本质是 **Priority Processing**（请求里写 `service_tier: "priority"`），不是换一个模型族。

| 模型 | Fast |
|---|---|
| GPT 旗舰（`gpt-5.5`、`gpt-5.4`、`gpt-5.6-sol` 等） | 可以。设置页开关，或在模型列表选带 `-fast` 的条目。 |
| Codex 系列（`gpt-5.3-codex`、`gpt-5.3-codex-spark`） | 不行。Codex Responses API 不接受 `service_tier`，代理会剥掉。 |
| Grok 4.6 | 可以。 |
| 更早的 Grok | 不行。 |

默认关闭。开启后大约快 1.5 倍，用量大约 2.5 倍。选 Codex 系列模型时开关无效，代理会剥掉该字段。

登录、刷新令牌、对话和额度走同一套官方客户端身份：Codex 为成对的 `originator: codex_cli_rs` 与 `User-Agent: codex_cli_rs/<version>`；Grok 为 `x-xai-token-auth: xai-grok-cli` 与 `User-Agent: grok-cli/<version>`。不模拟浏览器 TLS 指纹。

## 模型选择

设置 → OAuth 订阅 会列出 Codex 与 Grok 的全部目录（含 `-fast` 条目）。每一行是独立开关。每个系列有 **全选** / **全关**。

默认全部开启。关掉的模型不会写入下一次 `llm-pi-ai` 同步，DeepSeek Harness 的模型列表里也就看不到。选择保存在 `models.json`（记录关闭的 key），以后目录新增的模型默认是开的。

未登录也可以先勾选，登录后再同步。**同步到模型列表** 会按当前勾选重写路由。

## 额度

登录后，设置页账号卡片会显示官方额度。

| 订阅 | 接口 | 显示 |
|---|---|---|
| ChatGPT Codex | `chatgpt.com/backend-api/wham/usage` | 套餐等级（Plus / Pro / Team …）+ 5 小时窗口 + 每周窗口，展示**剩余**百分比和重置时间 |
| ChatGPT Codex 重置 | `…/wham/rate-limit-reset-credits` 与 `/consume` | 银行的 5 小时重置次数；Codex 卡片上的确认按钮 |
| xAI Grok | `cli-chat-proxy.grok.com/v1/billing?format=credits`，并读 `/v1/user?include=subscription` | 套餐等级（SuperGrok / X Premium+ …）+ 本周期用量、预付余额、产品分项 |

额度约每分钟刷新一次，也可点卡片上的 **刷新额度**。读失败不影响对话。

登录后账号标题旁显示 **套餐** 徽章：Codex 来自 JWT `chatgpt_plan_type` 与 usage 的 `plan_type`；Grok 来自 JWT `tier` 与 billing / user 的 `subscription_tier`。

进度条按剩余百分比从绿过渡到黄再到红（`hsl(剩余 × 1.2, 78%, 38%)`）。

ChatGPT / Codex Plus、Pro 可能有银行的 5 小时重置次数。还有剩余次数时，Codex 卡片显示 **重置额度 · 剩 N 次**。确认后插件会 `POST` `chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume`，请求体为 `{ redeem_request_id }`，并带 `idempotencyKey`。Grok 没有对应能力。

## 配置

| 选项 | 默认 | 说明 |
|---|---|---|
| `port` | `8318` | 本机代理端口 |
| `bind` | `127.0.0.1` | 监听地址 |
| `provider` | `oauth` | 同步到 DSH 的路由 ID 前缀（`oauth-codex` / `oauth-grok`） |
| `dataDir` | profile 数据目录 | `auth.json`、`models.json` 与 `proxy-key` 位置 |
| `grokLogin` | `device` | `device` 或 `pkce` |
| `fastMode` | `false` | GPT 旗舰与 Grok 4.6 的默认 Fast / Priority Processing |

## 开发

```sh
node --test 'test/*.test.mjs'
```
