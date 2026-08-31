# dsh-plugin-oauth-subs

[简体中文](README.zh.md) | English

[![CI](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml/badge.svg)](https://github.com/xxww0098/dsh-plugin-oauth-subs/actions/workflows/ci.yml)

Use a **ChatGPT / Codex**, **xAI Grok**, **Zhipu GLM**, **AWS Kiro**, or **Google Antigravity** subscription inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Official OAuth, plus Kiro API keys.

A loopback Responses proxy plus `llm-pi-ai` route sync.

## Install

```sh
dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs
dsh web
```

Open **Settings → OAuth subs**. Icon tabs stay pinned at the top: Codex, Grok, **Z.ai (GLM)**, **Kiro**, **Antigravity**, Models, About. Sign in more than once per family; **one card per account, each with its own quota**. Click a card to switch the chat account. **GLM** matches ZCode's welcome screen: **Z.ai (global)** and **BigModel (China)** OAuth, plus paste-an-API-key. **Kiro** stacks Social / GitHub / Google, Builder ID, Enterprise IdC, Entra / Azure AD, and `ksk_` keys. **Antigravity** is Google login like the official IDE. **About** links the GitHub repo. Check for updates compares GitHub latest and, when newer, runs `dsh plugin --profile web update dsh-plugin-oauth-subs`. Restart `dsh web` to load the new module. Or mount the bundle patch by hand:

```yaml
- insert:
    - id: oauth-subs
      name: dsh-plugin-oauth-subs
```

```sh
pnpm dsh web --patch ./cordis.patch.yml
```

## Sign-in

| Provider | Flow | Client | Upstream |
|---|---|---|---|
| ChatGPT Codex | PKCE on `localhost:1455` (falls back to `1457`); paste-callback supported | `app_EMoamEEZ73f0CkXaXp7hrann` | `chatgpt.com/backend-api/codex/responses` |
| xAI Grok | **Device-code (default)**; PKCE on `127.0.0.1:56121` as fallback | `b1a00492-073a-47ea-816f-4c329264a828` | `api.x.ai/v1/responses` |
| Zhipu GLM · Z.ai (global) | ZCode CLI poll, `provider: zai`, then mint `id.secret` | `client_P8X5CMWmlaRO9gyO-KSqtg` | `api.z.ai/api/coding/paas/v4` |
| Zhipu GLM · BigModel (China) | Same CLI poll, `provider: bigmodel`; poll JWT is the bearer | `zcode` | `open.bigmodel.cn/api/coding/paas/v4` |
| AWS Kiro · Social | Portal PKCE at `app.kiro.dev`; callback ports 3128…53153 | (none — portal) | Auth `prod.us-east-1.auth.desktop.kiro.dev` |
| AWS Kiro · Builder ID | AWS SSO OIDC device code; registers a public client each login | issued at login | `https://view.awsapps.com/start` |
| AWS Kiro · Enterprise / IdC | Same device code against the org Start URL | issued at login | `https://oidc.{region}.amazonaws.com` |
| AWS Kiro · Entra / Azure AD | Paste refresh token; public-client `refresh_token` grant | your Entra client id | `*.microsoftonline.com` token endpoint |
| AWS Kiro · API key | Paste `ksk_…` | — | Bearer, no refresh |
| Google Antigravity | Google OAuth on `localhost:51121/oauth-callback`; paste-callback supported | `1071006060591-…apps.googleusercontent.com` | `daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent` (hub; prod is IDE fallback) |

Already signed in on this machine via Codex CLI, Grok CLI, Hermes, ZCode Desktop, Kiro IDE, kiro.rs, Antigravity CLI, or CLIProxyAPI? Use **Import local session**:

- `~/.codex/auth.json`
- `~/.grok/auth.json`
- `~/.hermes/auth.json`
- `~/.zcode/v2/config.json` (ZCode Desktop; also older `~/.zcode/cli/config.json` / `~/.zcode/config.json`)
- `credentials.json` (kiro.rs CWD dump)
- `~/.kiro/credentials.json`
- `~/.aws/sso/cache/kiro-auth-token.json`
- `~/.gemini/antigravity-cli/antigravity-oauth-token`
- `~/.cli-proxy-api/antigravity-*.json`

Tokens live at `<profile>/data/dsh-plugin-oauth-subs/auth.json` with mode `0600`. Multiple accounts per family sit in that file as a vault; a legacy single-session file still loads. Enabled-model choices live in `models.json` next to it.

## How it works

```text
Settings (control plane)
  └─ OAuth login / import / logout, then model sync

DeepSeek Harness (call plane)
  └─ llm-pi-ai
       └─ http://127.0.0.1:8318/{codex,grok}/v1/responses
       └─ http://127.0.0.1:8318/{glm,antigravity}/v1/chat/completions
            └─ refreshed subscription bearer against upstream
```

This is not a second LLM adapter. After you close Settings, DSH still calls the loopback proxy through `llm-pi-ai`. The proxy binds loopback only and checks the local credential `DSH_OAUTH_SUBS_API_KEY`.

Stack, module tree, and the `docs/error.md` rule are in [AGENTS.md](AGENTS.md). Host code is TypeScript under `src/oauth` and `src/utils`. Settings is React under `src/ui`. Do not edit compiled `lib/`.

```text
src/
  oauth/codex/     Codex catalog, identity, Responses body
  oauth/grok/      Grok catalog, identity, device-code
  oauth/kiro/      Kiro Social / Builder ID / IdC / Entra / API key
  oauth/           proxy, PKCE, quota, models
  oauth/antigravity/ Google OAuth + cloudcode-pa fingerprint
  ui/              React Settings (classic-script factory)
  utils/           jwt, pkce, fast/context, session analyzer
```

## Reliability

The proxy is the cache-affinity and stream-retry path. Two contracts matter on a long Codex turn:

1. **Cache shard (Codex).** A Codex `prompt_cache_key` is forwarded as both `session-id` and `x-client-request-id`. Keys are sanitized to `[A-Za-z0-9._:-]` and clipped to 64 characters instead of dropped — a too-long session id must still pin the shard. Missing or illegal keys fall back to `session_id`. The clipped key is written back into the body so Codex does not 400 on a >64-character value.
2. **Cache shard (Grok).** xAI stores prompt cache **per server**. The proxy writes the same sanitized key as Responses `prompt_cache_key` and sends `x-grok-conv-id`. Codex `session-id` / `x-client-request-id` are not copied — they do nothing on this backend. A later call that reuses <10% of the previous prompt, including xAI's 512-token block on the wrong shard, is an affinity miss.
3. **Stable prefix.** Codex matches the longest prefix of `instructions` then `input`. Duplicate leading developer/system items are stripped; extra plan or header text is parked at the **input suffix** so the conversation prefix can still hit. `prompt_cache_retention` is dropped (gpt-5.6 rejects it).
4. **Commit gate.** A silent pre-output break is retried before headers are committed, so llm-pi-ai does not see a clean EOF and fire five TRANSPORT retries.

Acceptance on the full `session-772f7f3a-…` SkillStar turn (`oauth-codex` / `gpt-5.6-terra-fast`, 211 calls, 71 min):

| | 2026-08-26 incident | After 0.0.14 affinity headers |
|---|---|---|
| Weighted cache hit | 27.4% | **95.6%** |
| Prefix reuse (median) | — | **99.6%** |
| Affinity misses | 47 / 90 zero-cache | **0** |
| Prefix rewrites | — | 1 adapter rebuild + 9 compaction |
| TRANSPORT faults | 29 | 0 |

The remaining uncached tokens are almost all new tool output (`delta`) plus expected prefix rewrites: leaving plan mode (step 55, 169k) and DSH compaction (330k). The next call after each rewrite reused ~99%. That is not a shard miss.

Healthy rule: weighted hit ≥ **80%**, **zero affinity misses**, no TRANSPORT. Compaction / `request/header` rebuild zeros do not fail the session. Details: [docs/error.md](docs/error.md).

## Diagnose a session

Export the DSH `session.jsonl` (or unzip the session archive) and score it:

```sh
npm run analyze -- path/to/session.jsonl
node --experimental-strip-types scripts/analyze-session.ts --json path/to/session.jsonl
node --experimental-strip-types scripts/analyze-session.ts --fail-below 80 path/to/session.jsonl
```

The analyzer reads `assistant/message` usage once per turn+step (the later `assistant/chunk` usage event is a duplicate). It labels each call `cold_start` / `delta` / `compaction` / `rebuild` / `affinity_miss` so a compacted session is not flagged as a shard regression. Tool errors are split into `host_timeout` / `cascade_abort` / `invalid` and are not TRANSPORT. glob/grep's 30s budget lives on `dsh-tool-fs-search`, not this proxy — this plugin cannot raise it. Import as `dsh-plugin-oauth-subs/analyze-session`.

## Fast mode

On Codex it is **Priority Processing**, not a different model family. The proxy peels host-side `-fast` and asks the ChatGPT Codex backend the same way Codex CLI 0.149+ does: body `service_tier: "priority"` plus header `x-codex-routing-hint: model=<id>;tier=priority`. `store` is forced `false` (the subscription Responses API 400s otherwise).

| Model | Fast |
|---|---|
| GPT-5.6 Sol / Terra / Luna, GPT-5.5, GPT-5.4 | Yes. Pick the `-fast` sibling in the model list. |
| GPT-5.4 Mini, GPT-5.3 Codex Spark | No. Their catalog rows carry an empty `service_tiers`, so no `-fast` sibling exists. A stale `*-fast` id is peeled locally instead of forwarded. |
| Grok | No. Grok 4.6 accepts `service_tier: "priority"` on the wire but a 2026-08-30 interleaved run showed no speed gain (83.34 vs 82.80 tok/s, ratio 0.994). Older ids reject the field; the proxy strips it. |

ChatGPT Codex often echoes `created=auto` / `completed=default` even when Priority is requested — that echo is not a confirmation (openai/codex#14204). A 2026-08-26 Luna run measured 88.3 vs 57.5 tok/s (1.54×); a 2026-08-30 interleaved rerun did not reproduce a stable lift (mean 1.33×, pair ratios 1.90 then 0.93). Throughput-only; TTFT and cache are unchanged.

Login, token refresh, chat, and quota use one official client identity: Codex pairs `originator: codex_cli_rs` with `User-Agent: codex_cli_rs/<version>`; Grok sends `x-xai-token-auth: xai-grok-cli` and `User-Agent: grok-cli/<version>`. GLM uses ZCode's CLI poll: global `provider: zai` (client `client_P8X5CMWmlaRO9gyO-KSqtg`, then `api.z.ai/api/auth/z/login` to mint `id.secret`); China `provider: bigmodel` (`bigmodel.cn/login`, poll JWT is the Coding Plan bearer). Chat and quota hop as **ZCode Desktop 3.10.1** (`User-Agent: ZCode/3.10.1 ai-sdk/anthropic/3.0.81`, `X-ZCode-App-Version`, `X-ZCode-Agent: glm`, `Referer` / `X-Title: Z Code`) to `api.z.ai` or `open.bigmodel.cn` `/api/coding/paas/v4`. CLI init/poll against `zcode.z.ai` stays a CLI-shaped `ZCode/3.10.1` identity. Antigravity chat / loadCodeAssist hop as `antigravity/hub/<ver> <os>/<arch>` (installed **Antigravity.app** or **2.11.0**) to **daily-cloudcode-pa** with body `ideType: ANTIGRAVITY` and User-Agent only. No TLS fingerprint impersonation.

## Models

Settings → OAuth subs → **Models** lists every Codex, Grok, GLM, **Kiro**, and Antigravity catalog id, including Codex `-fast` and `-900k` siblings. Each row is an on/off checkbox. **All on** / **All off** apply per family.

Kiro follows [kiro.dev/docs/models](https://kiro.dev/docs/models/) (no Auto router): GPT-5.6 Sol / Terra / Luna, Claude Opus 5 / 4.8 / 4.7 / 4.6 / 4.5, Claude Sonnet 5 / 4.6 / 4.5 / 4, Claude Haiku 4.5, DeepSeek 3.2, MiniMax M2.5 / M2.1, GLM-5, Qwen3 Coder Next. Ids are Kiro native (`claude-opus-5`, `claude-sonnet-4.6`, `gpt-5.6-sol`). Claude and GPT-5.6 advertise image input; the open-weight rows are text.

GLM is three Coding Plan models: **GLM-5.3** (text), **GLM-5.3-Flash** (image + text), **GLM-5-Turbo** (text). Flash is the only multimodal row — text-only GLM models do not advertise image input to the Harness picker.

Default is all on except **900K**. Pick a Codex **Fast** sibling (`gpt-5.6-sol-fast`) for Priority Processing. The `-fast` suffix is host-side only — the proxy strips it and sends `service_tier: "priority"` plus `x-codex-routing-hint`. Grok has no Fast sibling. GPT-5.4 Mini and GPT-5.3 Codex Spark have no Fast sibling; a leftover `gpt-5.4-mini-fast` is peeled to `gpt-5.4-mini`.

GPT-5.6 Sol / Terra / Luna accept **872K** and GPT-5.4 accepts **1M**, well past their default window. Pick `gpt-5.6-sol-900k` (and the Terra / Luna / 5.4 twins) to opt in — the `-900k` suffix is a stable host-side id even though the real ceiling is per-model, and the proxy strips it before the upstream request. GPT-5.5, GPT-5.4 Mini and Spark have no large variant.

Both 900K and Fast spend quota faster.

Turning a model off removes it from the next `llm-pi-ai` sync — it disappears from the Harness picker. Choices persist in `models.json`. A catalog id added later stays on until you turn it off (900K ids stay off until you turn them on).

You can pre-select while signed out; the family applies on the next sign-in. Checking a model rewrites the live routes immediately.

Grok 4.6 thinking depth is **low / medium / high / xhigh**. Grok 4.5 is **low / medium / high** (no xhigh). Reasoning cannot be turned off; if you leave it unset the API uses **high**. Codex GPT-5.6 Sol / Terra / Luna add **max** on top of **low / medium / high / xhigh**. Other Codex models stop at **xhigh**. `minimal` is not offered: every Codex model rejects it.

GLM-5.3 and GLM-5.3-Flash thinking depth is **low / high / max** (default **max**). There is no `medium`, and thinking cannot be turned off — `thinking.type: disabled` 400s. GLM-5-Turbo has no depth control (thinking stays on by default). The session picker only lists levels the catalog declares.

Set the level in the DeepSeek Harness session model menu → **Reasoning**. It is not on Settings → Models. Login, logout, and each checkbox already sync the picker.

## Quota

After sign-in, each account card shows official remaining quota.

| Subscription | Endpoint | Display |
|---|---|---|
| ChatGPT Codex | `chatgpt.com/backend-api/wham/usage` | Plan badge (Plus / Pro / Team …) plus 5-hour + weekly windows, **remaining** percent and reset time |
| ChatGPT Codex reset | `…/wham/rate-limit-reset-credits` + `/consume` | Banked weekly-window reset credits and expiry; one confirm button per credit on the Codex card |
| xAI Grok | `cli-chat-proxy.grok.com/v1/billing?format=credits` plus `/v1/user?include=subscription` | Plan badge (SuperGrok / X Premium+ …) plus period usage, prepaid balance, product split |
| Zhipu GLM | `api.z.ai` or `open.bigmodel.cn` `monitor/usage/quota/limit` | Plan badge (Lite / Pro / Max) plus Coding Plan credit windows; host follows the active account |
| Google Antigravity | daily-cloudcode-pa `loadCodeAssist` + `fetchAvailableModels` (prod only on 5xx / transport) | Plan badge (Pro / Ultra / Free / Standard) plus SkillStar model-group remaining bars |

Quota refreshes about once a minute, or immediately from **Refresh quota**. A failed read does not block chat.

After sign-in the account title shows a **Plan** badge. Codex reads JWT `chatgpt_plan_type` and usage `plan_type` (`pro` → **Pro 20x** / $200, `prolite` → **Pro 5x** / $100). Grok reads JWT `tier` and billing / user `subscription_tier`.

Bars interpolate green → yellow → red with remaining percent (`hsl(remaining × 1.2, 78%, 38%)`).

ChatGPT / Codex Plus and Pro may bank extra weekly-window resets. When the account has unused credits, the Codex card nests a **Reset credits** box and draws **one button per credit**, labeled with that credit’s expiry. Clicking **Reset** opens the DeepSeek Harness risk-confirmation dialog (warning icon, checkbox acknowledgement, then confirm). Confirm, then the plugin `POST`s `chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume` with `{ redeem_request_id }` plus `idempotencyKey`. That spend refreshes the **weekly** window. Grok has no equivalent.

## Options

| Option | Default | Notes |
|---|---|---|
| `port` | `8318` | Loopback proxy port |
| `provider` | `oauth` | llm-pi-ai route prefix (`oauth-codex` / `oauth-grok` / `oauth-glm` / `oauth-antigravity`) |
| `dataDir` | profile data dir | `auth.json`, `models.json`, and `proxy-key` |
| `grokLogin` | `device` | `device` or `pkce` |

## Develop

```sh
npm test
npm run analyze -- path/to/session.jsonl
```

See [CONTRIBUTING.md](CONTRIBUTING.md).
