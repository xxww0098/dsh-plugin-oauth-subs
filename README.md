# dsh-plugin-oauth-subs

[简体中文](README.zh.md) | English

[![CI](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml/badge.svg)](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml)

Use a **ChatGPT / Codex**, **xAI Grok**, **Zhipu GLM**, **AWS Kiro**, **Google Antigravity**, **Cursor**, **Ollama Cloud**, **Kimi Code Plan**, **GitHub Copilot**, **Devin Agent**, or **Cline** subscription—or an **OpenCode Go** / **Command Code** API key—inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Every family except OpenCode Go goes through a local loopback proxy; OpenCode Go routes directly to its API. Model routes use the DSH `api` values `openai-responses`, `openai-completions`, and `anthropic-messages`.

![Subscription workbench — quota tab with per-account cards and provider rail](docs/readme-workbench.jpg)

## Install

```sh
dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs
dsh web
```

Open **订阅 / Subscriptions** under **插件 Plugins** in the sidebar. The workbench has three tabs — **额度 Quota**, **模型 Models**, **版本 Version** — with one card per account.

**Desktop** is managed by the Electron app — `dsh plugin --profile desktop` is rejected. Install via **插件 → 添加插件** with the repo URL instead. Data lives under `~/.dsh/profiles/desktop/data/dsh-plugin-oauth-subs/` and is **not** shared with the web profile; to migrate, quit the app and copy `auth.json` (plus `models.json` for picker state) across. The proxy port (`8318`) is a global loopback bind — two profiles cannot run simultaneously (`EADDRINUSE`); set a different `config.port` under `id: oauth-subs` in the profile's `cordis.patch.yml` to override. If the desktop app exits instantly on launch, run `launchctl unsetenv ELECTRON_RUN_AS_NODE`.

Updates self-install from the Version card (**检查更新 → 安装更新**, or the 15-minute auto-update switch); a restart loads the new copy, and `data/` survives. If `node_modules` is newer than the running process, the card flags the stale process. On a local-directory link, `npm run build` hot-reloads instead, and `npm run dev` watches the sources and rebuilds on every save.

## Families

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

Tokens live in `<profile>/data/dsh-plugin-oauth-subs/auth.json` (`0600`); OpenCode Go accounts in `opencode-go.json`; model selections in `models.json` — all in that data directory.

## How it works

| Plane | Role |
|---|---|
| Subscriptions panel | Login / import / logout, then model sync |
| llm-pi-ai | DSH call plane; routes families to the loopback proxy (OpenCode Go direct) |
| Loopback proxy | `http://127.0.0.1:8318/{codex,grok}/v1/responses`, `/glm/v1/messages`, `/<family>/v1/chat/completions` |
| Upstream | Refreshed subscription bearer or the active API key |

The proxy binds only to loopback and requires `DSH_OAUTH_SUBS_API_KEY`. After the panel closes, DSH keeps using the configured routes.

## Models & quota

The **Models** tab has per-family switches (all on by default); a row's window badge opens a dialog to raise that row's input window up to its ceiling. Reasoning effort is set in the Harness session menu, not the Models tab. `-fast` variants exist where the vendor supports them (Codex Priority; Devin backend variant). Fast and larger windows spend quota faster.

The **Quota** tab shows a plan badge plus usage/reset bars for every account (Ollama Cloud: session/weekly usage), refreshed about once a minute or via **Refresh quota**.

Per-family model catalogs, efforts, windows, quota endpoints, and pricing sources: [docs/models.md](docs/models.md), [docs/oauth.md](docs/oauth.md), and the family READMEs.

## Diagnose

```sh
npm run analyze -- path/to/session.jsonl              # one session
npm run analyze -- --dir ~/.dsh/sessions --since 30d  # aggregate every session
```

Healthy: weighted cache hit ≥ **80%**, **zero affinity misses**. Calls are labeled `cold_start` / `delta` / `compaction` / `rebuild` / `affinity_miss`, so compaction is not flagged as a shard regression. Details: [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/error.md](docs/error.md).

## Options

| Option | Default | Notes |
|---|---|---|
| `port` | `8318` | Loopback proxy port |
| `provider` | `oauth` | llm-pi-ai route prefix; every family lands at `oauth-<id>` |
| `dataDir` | profile data dir | `auth.json`, `models.json`, and `proxy-key` |
| `grokLogin` | `device` | `device` or `pkce` |
| `proxyUrl` | settings / env | Outbound HTTP(S) proxy for model / quota / login hops |
| `cursorProxy` | — | Cursor upstream proxy (`http://` or `socks5://`) for region-gated models |

## Develop

```sh
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md).
