# dsh-plugin-oauth-subs

[简体中文](README.zh.md) | English

Use a **ChatGPT / Codex subscription** and an **xAI Grok subscription** inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Official OAuth, no API keys.

A loopback Responses proxy plus `llm-pi-ai` route sync.

## Install

```sh
dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs
dsh web
```

Open **Settings → OAuth subs**. Or mount the bundle patch by hand:

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

Already signed in on this machine via Codex CLI, Grok CLI, or Hermes? Use **Import local session**:

- `~/.codex/auth.json`
- `~/.grok/auth.json`
- `~/.hermes/auth.json`

Tokens live at `<profile>/data/dsh-plugin-oauth-subs/auth.json` with mode `0600`. Enabled-model choices live in `models.json` next to it.

## How it works

```text
Settings (control plane)
  └─ OAuth login / import / logout, then model sync

DeepSeek Harness (call plane)
  └─ llm-pi-ai
       └─ http://127.0.0.1:8318/{codex,grok}/v1/responses
            └─ refreshed subscription bearer against upstream
```

This is not a second LLM adapter. After you close Settings, DSH still calls the loopback proxy through `llm-pi-ai`. The proxy binds loopback only and checks the local credential `DSH_OAUTH_SUBS_API_KEY`.

## Fast mode

It is **Priority Processing** (`service_tier: "priority"`), not a different model family.

| Model | Fast |
|---|---|
| GPT flagships (`gpt-5.5`, `gpt-5.4`, `gpt-5.6-sol`, …) | Yes. Settings toggle, or pick the `-fast` sibling in the model list. |
| Codex series (`gpt-5.3-codex`, `gpt-5.3-codex-spark`) | No. The Codex Responses API rejects `service_tier`; the proxy strips it. |
| Grok 4.6 | Yes (`service_tier: "priority"`). |
| Older Grok ids | No. |

Default is off. Fast is quicker (~1.5×) and spends more (~2.5×). Codex-series models ignore the switch; the proxy strips the field.

Login, token refresh, chat, and quota use one official client identity: Codex pairs `originator: codex_cli_rs` with `User-Agent: codex_cli_rs/<version>`; Grok sends `x-xai-token-auth: xai-grok-cli` and `User-Agent: grok-cli/<version>`. No TLS fingerprint impersonation.

## Models

Settings → OAuth subs lists every Codex and Grok catalog id, including `-fast` and `-900k` siblings. Each row is an on/off checkbox. **All on** / **All off** apply per family.

Default is all on except **900K**. ChatGPT Codex advertises 272K for GPT-5.4 and GPT-5.6 Sol / Terra / Luna, but those four slugs accept ~900K. Pick `gpt-5.6-sol-900k` (and the Terra / Luna / 5.4 twins) to opt in. The `-900k` suffix is host-side only — the proxy strips it before the upstream request. GPT-5.5 and GPT-5.4 Mini stay at 272K.

900K spends quota faster. Leave it off unless the session actually needs the large window.

Turning a model off removes it from the next `llm-pi-ai` sync — it disappears from the Harness picker. Choices persist in `models.json`. A catalog id added later stays on until you turn it off (900K ids stay off until you turn them on).

You can pre-select while signed out; the family applies on the next sign-in. **Sync model list** rewrites the live routes from the current selection.

## Quota

After sign-in, each account card shows official remaining quota.

| Subscription | Endpoint | Display |
|---|---|---|
| ChatGPT Codex | `chatgpt.com/backend-api/wham/usage` | Plan badge (Plus / Pro / Team …) plus 5-hour + weekly windows, **remaining** percent and reset time |
| ChatGPT Codex reset | `…/wham/rate-limit-reset-credits` + `/consume` | Banked 5-hour reset count and expiry; confirm button on the Codex card |
| xAI Grok | `cli-chat-proxy.grok.com/v1/billing?format=credits` plus `/v1/user?include=subscription` | Plan badge (SuperGrok / X Premium+ …) plus period usage, prepaid balance, product split |

Quota refreshes about once a minute, or immediately from **Refresh quota**. A failed read does not block chat.

After sign-in the account title shows a **Plan** badge. Codex reads JWT `chatgpt_plan_type` and usage `plan_type`. Grok reads JWT `tier` and billing / user `subscription_tier`.

Bars interpolate green → yellow → red with remaining percent (`hsl(remaining × 1.2, 78%, 38%)`).

ChatGPT / Codex Plus and Pro may bank extra 5-hour resets. When the account has unused credits, the Codex card shows **Reset quota · N left** plus when that credit expires. Confirm, then the plugin `POST`s `chatgpt.com/backend-api/wham/rate-limit-reset-credits/consume` with `{ redeem_request_id }` plus `idempotencyKey`. Grok has no equivalent.

## Options

| Option | Default | Notes |
|---|---|---|
| `port` | `8318` | Loopback proxy port |
| `bind` | `127.0.0.1` | Listen address |
| `provider` | `oauth` | llm-pi-ai route prefix (`oauth-codex` / `oauth-grok`) |
| `dataDir` | profile data dir | `auth.json`, `models.json`, and `proxy-key` |
| `grokLogin` | `device` | `device` or `pkce` |
| `fastMode` | `false` | Default Fast / Priority Processing for GPT flagships and Grok 4.6 |

## Develop

```sh
node --test 'test/*.test.mjs'
```
