# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a person already running DeepSeek Harness locally on their own machine, using their own vendor subscriptions. Job: get those plans into DSH so chat uses them instead of buying separate API keys.

Success: signed in, remaining quota visible per account, wanted models enabled in the picker, chat going through this plugin’s loopback proxy.

## Product Purpose

dsh-plugin-oauth-subs is a DeepSeek Harness plugin. It signs the operator into ChatGPT Codex, xAI Grok, Zhipu GLM (Z.ai / BigModel), AWS Kiro, Google Antigravity, Cursor, Ollama Cloud, Kimi Code Plan, and GitHub Copilot with official OAuth or documented local import, then syncs routes into llm-pi-ai.

It is not a second LLM adapter. After Settings closes, DSH still calls the loopback proxy.

## Positioning

Neighboring products cannot truthfully claim this: official (or documented CLI/IDE) subscription auth for those families, inside DSH Settings, with a loopback hop that maps each family onto DSH’s closed api union (`openai-responses` | `openai-completions` | `anthropic-messages`) without inventing a fourth protocol.

## Operating Context

- Install: `dsh plugin --profile web add …` then `dsh web`.
- Surface: Settings → OAuth 订阅 (icon tabs: families, then Models and About).
- Tokens live in the DSH profile data dir (`auth.json` 0600); models in `models.json` beside it.
- Chat plane: llm-pi-ai → `127.0.0.1:8318` → vendor. Bind is loopback-only.
- About can check and apply plugin GitHub updates and DSH npm versions; GitHub-only DSH tags are display, not installable.
- Host theme, locale, and dialog chrome come from DSH web; this plugin does not ship a standalone site.

## Capabilities and Constraints

- Nine OAuth families, each with its own tab, catalog, cache, and hop (see AGENTS.md and `docs/oauth.md`).
- Many accounts per family; one stored session is one card; quota (remaining bars) lives on every card; click card to switch. Ollama Cloud has no quota bars.
- Add-account chrome is a centered dialog, not a sheet or drawer.
- Model checkboxes sync into llm-pi-ai; unsigned families show rows disabled until login.
- Do not invent vendor APIs, Codex/Grok cache headers on other families, or a fourth DSH `api` value.
- Settings UI is a classic-script React factory (`src/ui/client.ts)); host is Cordis/Node. Edit `src/`, not `lib/`.
- Undecided: no committed WCAG target beyond visible focus, names, and disabled states.

## Brand Commitments

- Product name: dsh-plugin-oauth-subs / OAuth 订阅.
- Settings inherit the DSH host theme (`currentColor` mixes). Do not paint a light-theme gray marketing page. Do not color quota bars by family.
- Voice: operator-facing, bilingual zh/en in Settings copy. No marketing hero.

## Evidence on Hand

- Shipped Settings UI: `src/ui/client.ts`.
- Visual contract notes: `design-system/MASTER.md`, `design-system/pages/settings-workbench.md`.
- Binding product/UI rules: `AGENTS.md`.
- Family hops: `docs/oauth.md` and `src/oauth/<id>/README.md`.
- Fault log: `docs/error.md`.
- Do not fabricate testimonials, customers, benchmarks, or pricing.

## Product Principles

1. Spend the operator’s existing subscription, don’t sell them a new API.
2. One account, one card, remaining quota on that card.
3. Inherit the host; color only action, selection, and status.
4. Official hops only; document them; never a second adapter.
5. Settings finish the job: login, quota, models, then get out of the way.
