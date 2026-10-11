# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a person already running DeepSeek Harness locally, using vendor subscriptions or an OpenCode Go API key. Job: use those accounts from the DSH model picker.

Success: account connected, available quota visible where the provider exposes it, wanted models enabled in the picker, and chat reaching the selected provider.

## Product Purpose

dsh-plugin-oauth-subs is a DeepSeek Harness plugin. It connects Codex, ChatGPT, xAI Grok, Zhipu GLM (Z.ai / BigModel), AWS Kiro, Google Antigravity, Cursor, Ollama Cloud, Kimi Code Plan, Devin, Cline, OpenCode Go, and Command Code through their supported login, import, or API-key flows, then syncs routes into llm-pi-ai.

After the workbench is left, DSH continues using the configured loopback or direct routes.

## Positioning

The workbench is a main panel on the host rail, under the 插件 button (glyph 「订阅」). It is not a Settings section and not a standalone site. Subscription chat uses a loopback hop; OpenCode Go uses its direct API routes. Every route stays within DSH’s `openai-responses`, `openai-completions`, and `anthropic-messages` API types.

## Operating Context

- Install: `dsh plugin --profile web add …` then `dsh web`.
- Surface: 插件 → 订阅. Text tabs: 额度 / 模型 / 用量 / 榜单 / 设置. A family rail sits on the first three.
- Subscription tokens live in the DSH profile data dir (`auth.json` 0600); OpenCode Go accounts use `opencode-go.json`; model selections use `models.json`.
- Chat plane: llm-pi-ai → loopback `127.0.0.1:8318` → subscription provider, or direct OpenCode Go API. The proxy binds only to loopback.
- 设置 checks GitHub plugin releases and installs a selected plugin release into the profile. The running version changes after the host or app restarts.
- Host theme, locale, and dialog chrome come from DSH web.

## Capabilities and Constraints

- Thirteen families in `FAMILY_ORDER`: ten under `src/oauth/` (codex, chatgpt, grok, glm, kiro, antigravity, cursor, kimi, devin, cline) and three under `src/apikey/` (ollama, opencode-go, command-code). OpenCode Go uses direct routes without a loopback hop (see [AGENTS.md](AGENTS.md) and [docs/oauth.md](docs/oauth.md)).
- Many accounts per family; one stored session is one card; remaining quota lives on every card that exposes it; click the card to switch. Ollama Cloud has no remaining bars. ChatGPT has no quota payload and links out to manage usage.
- Add-account chrome is a centered dialog, not a sheet or drawer.
- Model switches sync into llm-pi-ai; signed-out families stay listed with locked switches until login.
- Do not invent vendor APIs, Codex/Grok cache headers on other families, or a fourth DSH `api` value.
- The workbench is a classic-script React factory (`src/ui/client.ts`); host is Cordis/Node. Edit `src/`, not `lib/`.
- Undecided: no committed WCAG target beyond visible focus, names, and disabled states.

## Brand Commitments

- Product name: dsh-plugin-oauth-subs / OAuth 订阅.
- The workbench inherits the DSH host theme (`currentColor` mixes). Do not paint a light-theme gray marketing page. Do not color quota bars by family.
- Voice: operator-facing, bilingual zh/en in workbench copy. No marketing hero.

## Evidence on Hand

- Shipped workbench: `src/ui/client.ts`.
- Visual contract notes: `design-system/MASTER.md`, `design-system/pages/settings-workbench.md`.
- Binding rules: `AGENTS.md` (index) → `docs/rules.md`, `docs/development.md`.
- Provider hops and direct routes: `docs/oauth.md`, `src/oauth/<id>/README.md`, and `src/apikey/<id>/README.md`.
- Fault log: `docs/error.md`.
- Do not fabricate testimonials, customers, benchmarks, or pricing.

## Product Principles

1. Spend the operator’s existing subscription, don’t sell them a new API.
2. One account, one card, remaining quota on that card.
3. Inherit the host; color only action, selection, and status.
4. Official hops only; document them; never a second adapter.
5. The workbench finishes the job: login, quota, models, then get out of the way.
