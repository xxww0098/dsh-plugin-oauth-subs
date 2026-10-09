# dsh-plugin-oauth-subs

[简体中文](README.zh.md) | English

[![CI](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml/badge.svg)](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml)

**Use the AI subscriptions you already pay for, inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).** Sign in once and your ChatGPT / Codex, Grok, GLM, Kiro, Antigravity, Cursor, Ollama Cloud, Kimi, Copilot, Devin or Cline plan becomes a model you can pick in any session — with quota, models and usage in one workbench.

![Subscription workbench — quota tab with per-account cards and provider rail](docs/readme-workbench.jpg)

<details>
<summary><b>More pages</b> — 模型 Models · 用量 Usage · 榜单 Leaderboard · 设置 Settings</summary>

<br>

### 模型 Models

![Models tab — model catalog with per-family enable switches](docs/screenshots/models.jpg)

### 用量 Usage

![Usage tab — token, cache-read, call, latency and estimated-cost panels](docs/screenshots/usage.jpg)

### 榜单 Leaderboard

![Leaderboard tab — model ranking by net improvement](docs/screenshots/ranking.jpg)

### 设置 Settings

![Settings tab — version, repository, auto-update and proxy](docs/screenshots/settings.jpg)

</details>

## Quick start

**1 · Install the plugin**

```sh
dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs
dsh web
```

On the desktop app, use **插件 Plugins → 添加插件** and paste the same repo URL instead — the command above is web-only.

**2 · Open the workbench**

Sidebar → **插件 Plugins** → **订阅 Subscriptions**.

**3 · Add an account**

Pick your service and sign in. Most take one click — the browser opens, you approve, you are back. Already signed in on this computer? Choose **Import local …** and the plugin picks up the login you already have.

**4 · Use your models**

Open the **模型 Models** tab, switch on the families you want, then pick a model from the model menu in a Harness session.

## The workbench

| Tab | What it does |
|---|---|
| **额度 Quota** | One card per account — plan badge, usage and reset bars. Refreshes about once a minute, or tap **刷新额度**. |
| **模型 Models** | The model list. Switch families on or off, and raise a model's input window. |
| **用量 Usage** | Tokens, cache hits, calls, latency and estimated cost — by model or by session. |
| **榜单 Leaderboard** | Daily model ranking snapshot. |
| **设置 Settings** | Updates, proxy, and where the plugin comes from. |

## Supported services

| Service | How you sign in |
|---|---|
| **ChatGPT / Codex** | Sign in with ChatGPT, or import your local Codex login |
| **xAI Grok** | Device code — approve it in the browser |
| **Zhipu GLM** | Z.ai / BigModel login, or import your local ZCode login |
| **AWS Kiro** | Social, Builder ID, IdC or Entra sign-in, an `ksk_` key, or a pasted JSON/CSV |
| **Google Antigravity** | Google sign-in, or import your local Antigravity token |
| **Cursor** | Sign in, or **Import local Cursor** |
| **Ollama Cloud** | Paste an API key |
| **Kimi Code Plan** | Device code, or import your local Kimi login |
| **GitHub Copilot** | Device code, or import your local Copilot login |
| **Devin Agent** | Sign in, or import your local Devin credentials |
| **Cline** | Device code, or import your local Cline login |
| **Command Code** | Paste an API key, or import your local login |
| **OpenCode Go** | Paste an API key — add your console workspace to see quota |

## Good to know

- **Accounts stay on your machine.** Everything is stored in your local DSH profile; the only traffic is to the service you signed into.
- **`-fast` models cost more quota.** They answer sooner and spend your plan faster — reach for them when latency matters.
- **Reasoning effort** is picked in the Harness session menu, not in the Models tab.
- **Updates install themselves.** The **设置 Settings** tab can also check and install on demand.
- **Cost is an estimate,** worked out from published prices — not from your bill.

## If something looks wrong

| What you see | What to try |
|---|---|
| The tab still shows an old version | **设置 Settings → 检查更新 → 安装更新**, then restart |
| A model is missing | Open **模型 Models** and check its family is switched on |
| Quota looks stale | Tap **刷新额度** — it also refreshes on its own about once a minute |
| The desktop app closes the moment it opens | Run `launchctl unsetenv ELECTRON_RUN_AS_NODE` in Terminal, then start it again |

<details>
<summary><b>Advanced</b> — configuration, families, internals and diagnostics</summary>

<br>

### Families and routes

| Provider | Login / import | DSH api |
|---|---|---|
| ChatGPT Codex | PKCE `localhost:1455` (paste-callback ok); import `~/.codex/auth.json` | `openai-responses` |
| ChatGPT (Sign in with ChatGPT) | Official app flow on the loopback; ID token verified against JWKS | `openai-responses` |
| xAI Grok | Device-code (default) or PKCE; import `~/.grok/auth.json`, `~/.hermes/auth.json` | `openai-responses` |
| Zhipu GLM (Z.ai / BigModel) | ZCode CLI login poll; import `~/.zcode/v2/config.json` | `anthropic-messages` |
| AWS Kiro | Social PKCE / Builder ID / IdC / Entra / `ksk_` key; paste JSON · kami · CSV; import `~/.kiro/credentials.json` | `openai-completions` |
| Google Antigravity | Google OAuth `localhost:51121` (paste-callback ok); import `~/.gemini/antigravity-cli/` token | `openai-completions` |
| Cursor | PKCE, or **Import local Cursor** (macOS Keychain / `state.vscdb`) | `openai-completions` |
| Ollama Cloud | Paste API key / `OLLAMA_API_KEY` | `openai-completions` |
| Kimi Code Plan | Device-code; import `~/.kimi-code/credentials/kimi-code.json`; `KIMI_API_KEY` | `openai-completions` |
| GitHub Copilot | Device-code; import `~/.config/github-copilot/hosts.json`; `GITHUB_TOKEN` | `openai-completions` |
| Devin Agent | PKCE `127.0.0.1:59653`; import `~/.local/share/devin/credentials.toml`; paste `devin-session-token$…` | `openai-completions` |
| Cline | Device-code; import `~/.cline/data/settings/providers.json` | `openai-completions` |
| Command Code | Paste API key / `COMMAND_CODE_API_KEY` / import `~/.commandcode/auth.json`; or studio browser login | `openai-completions` |
| OpenCode Go | Paste API key (+ optional Console cookie/workspace for quota); direct, no proxy | `openai-completions` / `openai-responses` |

Per-family design, pinned client versions, and upstream hops: [docs/oauth.md](docs/oauth.md) and each `src/oauth/<id>/README.md` / `src/apikey/<id>/README.md`.

### How it works

| Plane | Role |
|---|---|
| Subscriptions panel | Login / import / logout, then model sync |
| llm-pi-ai | DSH call plane; routes families to the loopback proxy (OpenCode Go direct) |
| Loopback proxy | `http://127.0.0.1:8318/{codex,grok}/v1/responses`, `/glm/v1/messages`, `/<family>/v1/chat/completions` |
| Upstream | Refreshed subscription bearer or the active API key |

The proxy binds only to loopback and requires `DSH_OAUTH_SUBS_API_KEY`. After the panel closes, DSH keeps using the configured routes.

### Models and quota

The **Models** tab has per-family switches (all on by default); a row's window badge opens a dialog to raise that row's input window up to its ceiling. Reasoning effort is set in the Harness session menu, not the Models tab. `-fast` variants exist where the vendor supports them (Codex Priority; Devin backend variant). Fast and larger windows spend quota faster.

The **Quota** tab shows a plan badge plus usage/reset bars for every account (Ollama Cloud: session/weekly usage), refreshed about once a minute or via **Refresh quota**.

Per-family model catalogs, efforts, windows, quota endpoints, and pricing sources: [docs/models.md](docs/models.md), [docs/oauth.md](docs/oauth.md), and the family READMEs.

### Where data lives

Tokens live in `<profile>/data/dsh-plugin-oauth-subs/auth.json` (`0600`); OpenCode Go accounts in `opencode-go.json`; model selections in `models.json` — all in that data directory.

### Options

| Option | Default | Notes |
|---|---|---|
| `port` | `8318` | Loopback proxy port |
| `provider` | `oauth` | llm-pi-ai route prefix; every family lands at `oauth-<id>` |
| `dataDir` | profile data dir | `auth.json`, `models.json`, and `proxy-key` |
| `grokLogin` | `device` | `device` or `pkce` |
| `proxyUrl` | settings / env | Outbound HTTP(S) proxy for model / quota / login hops |
| `cursorProxy` | — | Cursor upstream proxy (`http://` or `socks5://`) for region-gated models |

### Diagnose

```sh
npm run analyze -- path/to/session.jsonl              # one session
npm run analyze -- --dir ~/.dsh/sessions --since 30d  # aggregate every session
```

Healthy: weighted cache hit ≥ **80%**, **zero affinity misses**. Calls are labeled `cold_start` / `delta` / `compaction` / `rebuild` / `affinity_miss`, so compaction is not flagged as a shard regression. Details: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/error.md](docs/error.md).

</details>

## Contributing

Issues and pull requests are welcome. Build, test and release commands live in [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md).
