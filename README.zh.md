# dsh-plugin-oauth-subs

简体中文 | [English](README.md)

[![CI](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml/badge.svg)](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml)

把 **ChatGPT / Codex**、**xAI Grok**、**智谱 GLM**、**AWS Kiro**、**Google Antigravity**、**Cursor**、**Ollama Cloud**、**Kimi Code Plan**、**GitHub Copilot**、**Devin Agent**、**Cline** 的订阅，或 **OpenCode Go** / **Command Code** 的 API key 接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。除 OpenCode Go 外的每个家族都走本机回环代理；OpenCode Go 直连其 API。模型路由使用 DSH `api` 值 `openai-responses`、`openai-completions`、`anthropic-messages`。

![订阅工作台 —— 额度页签、账号卡片与供应商栏](docs/readme-workbench.jpg)

<details>
<summary><b>更多页面</b> —— 模型 · 用量 · 榜单 · 设置</summary>

<br>

### 模型

![模型页 —— 模型目录与各家族启用开关](docs/screenshots/models.jpg)

### 用量

![用量页 —— Token、缓存读、调用、首字延迟与估算成本](docs/screenshots/usage.jpg)

### 榜单

![榜单页 —— 按净提升排序的模型榜单](docs/screenshots/ranking.jpg)

### 设置

![设置页 —— 版本、仓库、自动更新与代理](docs/screenshots/settings.jpg)

</details>

## 安装

```sh
dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs
dsh web
```

在侧边栏的 **插件 Plugins** 下打开 **订阅 / Subscriptions**。工作台分为 **额度**、**模型**、**用量**、**榜单**、**设置** 等页签——额度页每个账号一张卡片。

**Desktop** 由 Electron 应用管理——`dsh plugin --profile desktop` 会被拒绝，请改用 **插件 → 添加插件** 粘贴仓库地址安装。数据在 `~/.dsh/profiles/desktop/data/dsh-plugin-oauth-subs/`，与 web profile **不**共享；迁移：退出应用后把 `auth.json`（连同保存选择器状态的 `models.json`）复制过去。代理端口（`8318`）是全局回环绑定——两个 profile 不能同时运行（`EADDRINUSE`）；要改端口，在该 profile 的 `cordis.patch.yml` 里给 `id: oauth-subs` 设不同的 `config.port`。若桌面应用启动即退，运行 `launchctl unsetenv ELECTRON_RUN_AS_NODE`。

更新从 **设置** 卡片自安装（**检查更新 → 安装更新**，或每 15 分钟检查一次的自动更新开关）；重启后加载新副本，`data/` 保留。若 `node_modules` 比运行中的进程新，卡片会标记过期进程。本地目录链接时则改走 `npm run build` 热重载；挂着 `npm run dev` 可监听源码、保存即自动重建。

## 家族

| 提供商 | 登录 / 导入 | DSH api |
|---|---|---|
| ChatGPT Codex | PKCE `localhost:1455`（可粘贴回调）；导入 `~/.codex/auth.json` | `openai-responses` |
| ChatGPT（Sign in with ChatGPT） | 官方应用流程走回环；ID token 经 JWKS 验签 | `openai-responses` |
| xAI Grok | 设备码（默认）或 PKCE；导入 `~/.grok/auth.json`、`~/.hermes/auth.json` | `openai-responses` |
| 智谱 GLM（Z.ai / BigModel） | ZCode CLI 登录轮询；导入 `~/.zcode/v2/config.json` | `anthropic-messages` |
| AWS Kiro | Social PKCE / Builder ID / IdC / Entra / `ksk_` 密钥；粘贴 JSON · kami · CSV；导入 `~/.kiro/credentials.json` | `openai-completions` |
| Google Antigravity | Google OAuth `localhost:51121`（可粘贴回调）；导入 `~/.gemini/antigravity-cli/` 的 token | `openai-completions` |
| Cursor | PKCE，或 **导入本机 Cursor**（macOS Keychain / `state.vscdb`） | `openai-completions` |
| Ollama Cloud | 粘贴 API key / `OLLAMA_API_KEY` | `openai-completions` |
| Kimi Code Plan | 设备码；导入 `~/.kimi-code/credentials/kimi-code.json`；`KIMI_API_KEY` | `openai-completions` |
| GitHub Copilot | 设备码；导入 `~/.config/github-copilot/hosts.json`；`GITHUB_TOKEN` | `openai-completions` |
| Devin Agent | PKCE `127.0.0.1:59653`；导入 `~/.local/share/devin/credentials.toml`；粘贴 `devin-session-token$…` | `openai-completions` |
| Cline | 设备码；导入 `~/.cline/data/settings/providers.json` | `openai-completions` |
| Command Code | 粘贴 API key / `COMMAND_CODE_API_KEY` / 导入 `~/.commandcode/auth.json`；或 studio 浏览器登录 | `openai-completions` |
| OpenCode Go | 粘贴 API key（可选加 Console cookie / 工作区以读额度）；直连，不走代理 | `openai-completions` / `openai-responses` |

各家族的设计、钉住的客户端版本与上游 hop：[docs/oauth.md](docs/oauth.md) 与各 `src/oauth/<id>/README.md` / `src/apikey/<id>/README.md`。

令牌存于 `<profile>/data/dsh-plugin-oauth-subs/auth.json`（`0600`）；OpenCode Go 账号在 `opencode-go.json`；模型选择在 `models.json`——都在该数据目录里。

## 工作原理

| 平面 | 作用 |
|---|---|
| 订阅面板 | 登录 / 导入 / 退出，随后同步模型 |
| llm-pi-ai | DSH 调用面；把各家族路由到回环代理（OpenCode Go 直连） |
| 回环代理 | `http://127.0.0.1:8318/{codex,grok}/v1/responses`、`/glm/v1/messages`、`/<family>/v1/chat/completions` |
| 上游 | 刷新后的订阅 bearer，或当前生效的 API key |

代理只绑定回环地址，并要求 `DSH_OAUTH_SUBS_API_KEY`。面板关闭后，DSH 继续使用已配置的路由。

## 模型与额度

**模型**页签按家族提供开关（默认全开）；行上的窗口徽标可打开对话框，在该行上限内上调输入窗口。推理等级在 Harness **会话**模型菜单里设，不在「模型」页签。上游支持处提供 `-fast` 变体（Codex Priority；Devin 后端变体）。Fast 与更大的窗口都更耗额度。

**额度**页签为每个账号显示套餐徽章与用量 / 重置进度条（Ollama Cloud：会话 / 每周用量），约每分钟刷新一次，或点 **刷新额度**。

各家族的模型目录、推理等级、窗口、额度接口与费率出处：[docs/models.md](docs/models.md)、[docs/oauth.md](docs/oauth.md) 与各家族 README。

## 诊断

```sh
npm run analyze -- path/to/session.jsonl              # one session
npm run analyze -- --dir ~/.dsh/sessions --since 30d  # aggregate every session
```

健康标准：加权缓存命中 ≥ **80%**，**亲和丢失为 0**。每次调用都打上 `cold_start` / `delta` / `compaction` / `rebuild` / `affinity_miss` 标签，避免把压缩误判成分片回归。细节见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [docs/error.md](docs/error.md)。

## 选项

| 选项 | 默认 | 说明 |
|---|---|---|
| `port` | `8318` | 本机回环代理端口 |
| `provider` | `oauth` | llm-pi-ai 路由前缀；每个家族都落在 `oauth-<id>` |
| `dataDir` | profile 数据目录 | `auth.json`、`models.json` 与 `proxy-key` |
| `grokLogin` | `device` | `device` 或 `pkce` |
| `proxyUrl` | 设置页 / 环境变量 | 模型 / 额度 / 登录出站 HTTP(S) 代理 |
| `cursorProxy` | — | Cursor 上游代理（`http://` 或 `socks5://`），用于区域门模型 |

## 开发

```sh
npm test
```

见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [docs/development.md](docs/development.md)。
