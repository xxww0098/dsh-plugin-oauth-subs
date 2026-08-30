# dsh-plugin-oauth-subs

简体中文 | [English](README.md)

[![CI](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml/badge.svg)](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml)

把 **ChatGPT / Codex**、**xAI Grok**、**智谱 GLM**、**AWS Kiro** 和 **Google Antigravity** 订阅接到 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。登录走官方 OAuth；Kiro 还可贴 `ksk_` API key。

本机 Responses 代理 + `llm-pi-ai` 路由同步。

## 安装

```sh
dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs
dsh web
```

打开 **设置 → OAuth 订阅**。顶栏图标页签固定不随滚动移出：Codex、Grok、**Z.ai（智谱 GLM）**、**Kiro**、**Antigravity**、模型、关于。每个系列可登录多个账号，**每个账号一张卡片，额度各自显示**；点卡片切换当前对话账号。**GLM** 与 ZCode 欢迎页一样，分 **Z.ai（全球）** 和 **BigModel（中国）** 两套 OAuth，也可粘贴 API key。登录后签发 Coding Plan 密钥。**Kiro** 叠放 Social / GitHub / Google、Builder ID、企业 IdC、Entra / Azure AD，以及 `ksk_` 密钥。**Antigravity** 是和官方 IDE 一样的 Google 登录。**关于** 里有 GitHub 仓库链接。检查更新会对比 GitHub 最新版，有新版本时跑 `dsh plugin --profile web update dsh-plugin-oauth-subs`。重启 `dsh web` 后才会加载新模块。也可以用 `cordis.patch.yml` 手动挂载：

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
| 智谱 GLM · Z.ai（全球） | ZCode CLI 轮询，`provider: zai`，再换发 `id.secret` | `client_P8X5CMWmlaRO9gyO-KSqtg` | `api.z.ai/api/coding/paas/v4` |
| 智谱 GLM · BigModel（中国） | 同一 CLI 轮询，`provider: bigmodel`，poll JWT 即密钥 | `zcode` | `open.bigmodel.cn/api/coding/paas/v4` |
| AWS Kiro · Social | `app.kiro.dev` 门户 PKCE，回调端口 3128…53153 | （门户无固定 client） | `prod.us-east-1.auth.desktop.kiro.dev` |
| AWS Kiro · Builder ID | AWS SSO OIDC 设备码，每次登录注册 public client | 登录时签发 | `https://view.awsapps.com/start` |
| AWS Kiro · Enterprise / IdC | 同一设备码，打组织自己的 Start URL | 登录时签发 | `https://oidc.{region}.amazonaws.com` |
| AWS Kiro · Entra / Azure AD | 粘贴 refresh token；public client `refresh_token` grant | 你的 Entra client id | `*.microsoftonline.com` token 端点 |
| AWS Kiro · API key | 粘贴 `ksk_…` | — | Bearer，不刷新 |
| Google Antigravity | Google OAuth，回环 `localhost:51121/oauth-callback`，可粘贴回调 | `1071006060591-…apps.googleusercontent.com` | `cloudcode-pa.googleapis.com/v1internal:streamGenerateContent` |

已在本机登录过 Codex CLI、Grok CLI、Hermes、ZCode Desktop、Kiro IDE、kiro.rs、Antigravity CLI 或 CLIProxyAPI 时，点 **导入本机会话**：

- `~/.codex/auth.json`
- `~/.grok/auth.json`
- `~/.hermes/auth.json`
- `~/.zcode/v2/config.json`（ZCode Desktop；旧路径 `~/.zcode/cli/config.json` / `~/.zcode/config.json` 仍读）
- `credentials.json`（kiro.rs 当前目录）
- `~/.kiro/credentials.json`
- `~/.aws/sso/cache/kiro-auth-token.json`
- `~/.gemini/antigravity-cli/antigravity-oauth-token`
- `~/.cli-proxy-api/antigravity-*.json`

令牌写在 profile 数据目录 `data/dsh-plugin-oauth-subs/auth.json`，权限 `0600`。每个系列的多个账号存在这个文件的保险库里；旧的单会话文件仍能读。开启/关闭的模型写在同目录的 `models.json`。

## 工作原理

```text
设置页（控制面）
  └─ OAuth 登录 / 导入 / 退出，同步模型

DeepSeek Harness（调用面）
  └─ llm-pi-ai
       └─ http://127.0.0.1:8318/{codex,grok}/v1/responses
       └─ http://127.0.0.1:8318/{glm,antigravity}/v1/chat/completions
            └─ 使用刷新后的订阅令牌访问上游
```

本插件不是第二套 LLM 适配器。设置页关闭后，DSH 仍通过 `llm-pi-ai` 调本机代理。代理只监听回环地址，并用本地凭证 `DSH_OAUTH_SUBS_API_KEY` 鉴权。

技术栈、模块树、以及「错误写入 `docs/error.md`」写在 [AGENTS.md](AGENTS.md)。宿主半边是 `src/oauth` 与 `src/utils` 的 TypeScript，设置页是 `src/ui` 的 React。不要手改编译产物 `lib/`。

```text
src/
  oauth/codex/     Codex 目录、身份、Responses 请求体
  oauth/grok/      Grok 目录、身份、设备码
  oauth/kiro/      Kiro Social / Builder ID / IdC / Entra / API key
  oauth/           代理、PKCE、额度、模型
  oauth/antigravity/ Google OAuth + cloudcode-pa 指纹
  ui/              React 设置页（classic-script factory）
  utils/           jwt、pkce、fast/context、会话分析器
```

## 可靠性

代理负责缓存亲和与流重试。长 Codex 会话里有两条契约：

1. **缓存分片（Codex）。** Codex 的 `prompt_cache_key` 会同时写成 `session-id` 和 `x-client-request-id`。键会被清洗成 `[A-Za-z0-9._:-]` 并裁到 64 字符，而不是直接丢掉——会话 id 过长时仍然要钉在同一分片。键缺失或非法时回退 `session_id`。裁过的键会写回请求体，避免 Codex 对超过 64 字符的值返回 400。
2. **缓存分片（Grok）。** xAI 的 prompt cache **按服务器分片**。代理把同一套清洗键写回 Responses 的 `prompt_cache_key`，并发送 `x-grok-conv-id`。Codex 的 `session-id` / `x-client-request-id` 不会抄过去——这端不认。热身后复用 < 10%（包括 xAI 错分片时返回的 512 token 块）算亲和丢失。
3. **稳定前缀。** Codex 按 `instructions` 再 `input` 的最长前缀匹配缓存。重复的 leading developer/system 会剥掉；多出来的 plan / header 文本停到 **input 末尾**，对话前缀才能继续命中。`prompt_cache_retention` 会删掉（gpt-5.6 拒绝该字段）。
4. **提交门。** 产出内容之前的静默断流会在响应头提交前重试，避免 llm-pi-ai 把干净 EOF 当成 TRANSPORT 连重试 5 次。

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
node --experimental-strip-types scripts/analyze-session.ts --json path/to/session.jsonl
node --experimental-strip-types scripts/analyze-session.ts --fail-below 80 path/to/session.jsonl
```

分析器按 turn+step 只计一次 `assistant/message` 的 usage（后面的 `assistant/chunk` usage 是重复记账）。每步会标 `cold_start` / `delta` / `compaction` / `rebuild` / `affinity_miss`，避免把压缩会话误判成分片回归。工具错误会分成 `host_timeout` / `cascade_abort` / `invalid`，与 TRANSPORT 分开。glob/grep 的 30s 预算在 `dsh-tool-fs-search` 上，本代理加不长。也可 `import` `dsh-plugin-oauth-subs/analyze-session`。

## Fast 模式

Codex 上本质是 **Priority Processing**，不是换一个模型族。代理会剥掉本机 `-fast`，并按 Codex CLI 0.149+ 的线格式请求：请求体 `service_tier: "priority"`，再加上头 `x-codex-routing-hint: model=<id>;tier=priority`。ChatGPT 订阅 Responses 必须 `store: false`，否则 400。

| 模型 | Fast |
|---|---|
| GPT-5.6 Sol / Terra / Luna、GPT-5.5、GPT-5.4 | 可以。在模型列表选带 `-fast` 的条目。 |
| GPT-5.4 Mini、GPT-5.3 Codex Spark | 不行。它们目录里的 `service_tiers` 是空的，不会生成 `-fast` 条目。残留的 `*-fast` id 会在本地剥掉，不会转给上游。 |
| Grok | 不行。Grok 4.6 线上会接受 `service_tier: "priority"`，但 2026-08-30 交错实测无加速（83.34 对 82.80 tok/s，比 0.994）。更早的 id 拒绝该字段，代理会剥掉。 |

ChatGPT Codex 即使请求了 Priority，回显也经常是 `created=auto` / `completed=default`——这不能当确认（openai/codex#14204）。2026-08-26 Luna 曾测到 88.3 对 57.5 tok/s（1.54 倍）；2026-08-30 交错复测没有稳定提升（均值 1.33 倍，成对比 1.90 再 0.93）。提升只在生成吞吐上——首 token 时间和缓存命中不受影响。

登录、刷新令牌、对话和额度走同一套官方客户端身份：Codex 为成对的 `originator: codex_cli_rs` 与 `User-Agent: codex_cli_rs/<version>`；Grok 为 `x-xai-token-auth: xai-grok-cli` 与 `User-Agent: grok-cli/<version>`。GLM 走 ZCode CLI 轮询：国际站 `provider: zai`（client `client_P8X5CMWmlaRO9gyO-KSqtg`，再 `api.z.ai/api/auth/z/login` 换长期 `id.secret`）；国内站 `provider: bigmodel`（`bigmodel.cn/login`，poll JWT 直接当 Coding Plan 密钥）。对话和额度按 **ZCode Desktop 3.10.1** 指纹发出（`User-Agent: ZCode/3.10.1 ai-sdk/anthropic/3.0.81`、`X-ZCode-App-Version`、`X-ZCode-Agent: glm`、`Referer` / `X-Title: Z Code`），打 `api.z.ai` 或 `open.bigmodel.cn` 的 `/api/coding/paas/v4`。`zcode.z.ai` 上的 CLI init/poll 仍用 CLI 形态的 `ZCode/3.10.1`。不模拟浏览器 TLS 指纹。

## 模型选择

设置 → OAuth 订阅 → **模型** 会列出 Codex、Grok、GLM、**Kiro** 与 Antigravity 的全部目录（含 Codex `-fast` 与 `-900k` 条目）。每一行是独立开关。每个系列有 **全选** / **全关**。

Kiro 对齐 [kiro.dev/docs/models](https://kiro.dev/docs/models/)（不含 Auto 路由）：GPT-5.6 Sol / Terra / Luna，Claude Opus 5 / 4.8 / 4.7 / 4.6 / 4.5，Claude Sonnet 5 / 4.6 / 4.5 / 4，Claude Haiku 4.5，DeepSeek 3.2，MiniMax M2.5 / M2.1，GLM-5，Qwen3 Coder Next。id 用 Kiro 原生写法（`claude-opus-5`、`claude-sonnet-4.6`、`gpt-5.6-sol`）。Claude 与 GPT-5.6 声明图文输入；开源权重行只有文本。

GLM 只显示三个 Coding Plan 模型：**GLM-5.3**（文本）、**GLM-5.3-Flash**（图文）、**GLM-5-Turbo**（文本）。只有 Flash 是多模态；纯文本行不会向 Harness 声明 image 输入。

默认全部开启，**900K 除外**。选 Codex 带 **Fast** 的条目（`gpt-5.6-sol-fast`）才会走 Priority Processing。`-fast` 只在本机目录里，发给上游前会剥掉，并加上 `service_tier: "priority"` 和 `x-codex-routing-hint`。Grok 没有 Fast 条目。GPT-5.4 Mini 和 GPT-5.3 Codex Spark 没有 Fast；残留的 `gpt-5.4-mini-fast` 会剥成 `gpt-5.4-mini`。

GPT-5.6 Sol / Terra / Luna 实际可到 **872K**，GPT-5.4 可到 **1M**，都远超默认窗口。选 `gpt-5.6-sol-900k`（以及 Terra / Luna / 5.4 对应项）即可开启——`-900k` 只是一个稳定的本机 id，真实上限逐模型不同，发给上游前会剥掉。GPT-5.5、GPT-5.4 Mini 和 Spark 没有大窗口条目。

900K 和 Fast 都更耗额度。

关掉的模型不会写入下一次 `llm-pi-ai` 同步，DeepSeek Harness 的模型列表里也就看不到。选择保存在 `models.json`。以后目录新增的普通模型默认是开的；新增的 900K 条目默认关闭。

未登录也可以先勾选，登录后再同步。勾选会立刻按当前选择重写路由。

Grok 4.6 思考深度为 **low / medium / high / xhigh**。Grok 4.5 为 **low / medium / high**（没有 xhigh）。思考不能关掉；不选时上游默认 **high**。Codex 的 GPT-5.6 Sol / Terra / Luna 在 **low / medium / high / xhigh** 之上还有 **max**。其余 Codex 模型最高到 **xhigh**。不提供 `minimal`：所有 Codex 模型都拒绝该取值。

GLM-5.3 与 GLM-5.3-Flash 的思考深度为 **low / high / max**（默认 **max**）。没有 `medium`，也不能关掉思考——`thinking.type: disabled` 会 400。GLM-5-Turbo 没有深度选项（思考默认开着）。会话选择器只列出目录声明的档位。

在 DeepSeek Harness **会话**里点模型名称 → **推理等级** 设置，不在「设置 → 模型」。登录、退出、勾选都会自动同步。

## 额度

登录后，设置页账号卡片会显示官方额度。

| 订阅 | 接口 | 显示 |
|---|---|---|
| ChatGPT Codex | `chatgpt.com/backend-api/wham/usage` | 套餐等级（Plus / Pro / Team …）+ 5 小时窗口 + 每周窗口，展示**剩余**百分比和重置时间 |
| ChatGPT Codex 重置 | `…/wham/rate-limit-reset-credits` 与 `/consume` | 银行的周窗口重置券和过期时间；Codex 卡片上按券各一颗确认按钮 |
| xAI Grok | `cli-chat-proxy.grok.com/v1/billing?format=credits`，并读 `/v1/user?include=subscription` | 套餐等级（SuperGrok / X Premium+ …）+ 本周期用量、预付余额、产品分项 |
| 智谱 GLM | `api.z.ai` 或 `open.bigmodel.cn` 的 `monitor/usage/quota/limit` | 套餐徽章（Lite / Pro / Max）+ Coding Plan 积分窗口；站点随当前账号 |
| Google Antigravity | 无公开额度接口 | 卡片照常渲染，额度块保持空闲 |

额度约每分钟刷新一次，也可点卡片上的 **刷新额度**。读失败不影响对话。

登录后账号标题旁显示 **套餐** 徽章：Codex 来自 JWT `chatgpt_plan_type` 与 usage 的 `plan_type`（`pro` → **Pro 20x**，$200；`prolite` → **Pro 5x**，$100）；Grok 来自 JWT `tier` 与 billing / user 的 `subscription_tier`。

进度条按剩余百分比从绿过渡到黄再到红（`hsl(剩余 × 1.2, 78%, 38%)`）。

ChatGPT / Codex Plus、Pro 可能有银行的周窗口重置券。还有剩余券时，Codex 卡片里会嵌一套 **重置券** 框，**每张券一颗按钮**，标着这张券何时过期。点 **重置** 会打开 DeepSeek Harness 的风险确认弹窗（警告图标、勾选确认，再点确认）。确认后插件会 `POST` `chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume`，请求体为 `{ redeem_request_id }`，并带 `idempotencyKey`。消耗的是 **周额度窗口**。Grok 没有对应能力。

## 配置

| 选项 | 默认 | 说明 |
|---|---|---|
| `port` | `8318` | 本机代理端口 |
| `provider` | `oauth` | 同步到 DSH 的路由 ID 前缀（`oauth-codex` / `oauth-grok` / `oauth-glm` / `oauth-antigravity`） |
| `dataDir` | profile 数据目录 | `auth.json`、`models.json` 与 `proxy-key` 位置 |
| `grokLogin` | `device` | `device` 或 `pkce` |

## 开发

```sh
npm test
npm run analyze -- path/to/session.jsonl
```

见 [CONTRIBUTING.md](CONTRIBUTING.md)。
