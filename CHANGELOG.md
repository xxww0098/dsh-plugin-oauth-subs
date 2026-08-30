# Changelog

## 0.0.34

- **AWS Kiro** family tab. Social / GitHub / Google portal PKCE, Builder ID and Enterprise IdC device-code, Microsoft Entra / Azure AD refresh, and `ksk_` API keys. Settings shows one card per stored credential with that account's quota. Chat still talks AWS `generateAssistantResponse` — this release is auth, quota, catalog, and `/kiro/v1/models`.

## 0.0.33

- Drop Grok Fast. Grok 4.6 accepted `service_tier: "priority"` on the wire but a 2026-08-30 interleaved run showed no speed gain (ratio 0.994). No `grok-*-fast` picker row, no Priority field on xAI. A stale `grok-4.6-fast` id is peeled to `grok-4.6`.
- Codex Fast matches Codex CLI 0.149+: peel eligible `-fast`, send `service_tier: "priority"`, add `x-codex-routing-hint: model=<id>;tier=priority`, and force `store: false`. Identity is `codex_cli_rs/0.151.0`. Ineligible leftovers such as `gpt-5.4-mini-fast` are peeled locally.
- About: drop **Open release page** / **打开发布页**. Opening the tab still only compares GitHub latest vs installed. Tapping **检查更新** when latest is newer runs `dsh plugin --profile web update dsh-plugin-oauth-subs` (PATH `dsh`, this package only). After a successful write, restart `dsh web`.
- GLM **导入本机会话** reads ZCode Desktop `~/.zcode/v2/config.json`. BigModel CLI init posts `{ provider: "bigmodel" }` (`zcode` now 500s).

## 0.0.32

- AGENTS.md: checklist for a new OAuth family (tab icon, one card per account, design rules).

## 0.0.31

- Drop the “one card per account” helper line on provider pages.

## 0.0.30

- Account plan sits after the email. No “套餐 / Plan” label.

## 0.0.29

- Model picker checkboxes and All/None stay disabled until that family is signed in.

## 0.0.28

- Model picker no longer shows 文本 / 图文 input tags.

## 0.0.27

- About: one 13px typeface for the fact rows. OS is only **macOS / Windows / Linux** — no “本机”.

## 0.0.26

- Settings shows **quota on every account card**, not only the one in use. Refresh/reset stay per card. Switching still picks the chat account.

## 0.0.25

- Codex plan badge splits **Pro 20x** (`pro`, $200) and **Pro 5x** (`prolite`, $100). GLM `pro` stays Pro.

## 0.0.24

- Settings tabs are brand icons (LobeHub `@lobehub/icons`): Codex, Grok, **Z.ai** for 智谱 GLM, a grid for Models, GitHub for About. Hover still shows the name.

## 0.0.23

- Settings: **one card per account**. Email, plan, switch/logout, and (for the active account) quota plus Codex reset credits live in that box. Family header no longer repeats the plan badge.

## 0.0.22

- GLM-5.3 and GLM-5.3-Flash declare thinking depth **low / high / max** (official `reasoning_effort`; default max). Thinking cannot be turned off. No `medium`. GLM-5-Turbo stays without a depth ladder. The Harness session picker reads this from the catalog; `oauth-glm` also sets `compat.supportsReasoningEffort` so the localhost proxy actually sends `reasoning_effort`.

## 0.0.21

- About no longer lists a fake Windows / macOS / Linux download for the generic zip. Check for updates, then open the GitHub release. This is a DSH plugin, not a desktop installer.

## 0.0.20

- GLM catalog is three Coding Plan models: **GLM-5.3** (text), **GLM-5.3-Flash** (image + text), **GLM-5-Turbo** (text). Drop GLM-5.2 / 5.1 / 5 / 4.7. Flash is the missing multimodal row. `llm-pi-ai` `input` is no longer hardcoded `['text', 'image']` for every family — text-only GLM rows stay text so the Harness picker will not offer image paste on them. Turbo window is 200K / 128K out.

## 0.0.19

- GLM has two OAuth buttons, matching ZCode's welcome screen: **Z.ai (全球)** and **BigModel (中国)**. CLI init now sends ZCode's internal provider ids (`zai` / `zcode`). Chat and quota follow the active account's region (`api.z.ai` vs `open.bigmodel.cn`).
- BigModel skips the Z.ai business-login key mint and uses the poll JWT as the Coding Plan bearer. Z.ai / BigModel accounts with the same email can both stay signed in.
- Paste an API key as the third welcome option. Import from `~/.zcode` now picks the region from the provider key name.

## 0.0.18

- Grok quota. SuperGrok / X Premium+ unified-billing accounts no longer show a blank gauge (prepaid `0` + empty Grok Code). CLI `/v1/billing?format=credits` often omits `creditUsagePercent`; the plugin now also POSTs grok.com `GetGrokCreditsConfig` (gRPC-web, same bearer as `grok login`) and fills the weekly pool. Fallback: `onDemandUsed` / `onDemandCap`. Hide prepaid when it is 0. Settings shows **每周** plus a retry hint if xAI still returns no percent.

## 0.0.17

- Grok cache affinity. The proxy now sticky-routes xAI prompt cache: sanitized `prompt_cache_key` (falling back to `session_id`) is written back into the Responses body and sent as `x-grok-conv-id`. Codex `session-id` / `x-client-request-id` stay Codex-only — they do nothing on this backend.
- Analyzer: a later call with prefix reuse < 10% is an affinity miss even when xAI reports a 512-token block (wrong-shard signature), not a prefix rewrite.

## 0.0.16

- Settings is three tabs: **Codex**, **Grok**, **Models**.
- Multiple accounts per family. Sign in again to add; click a row to switch; logout removes that account only. Chat and quota use the active account. Legacy single-session `auth.json` files still load.
- Checking a model syncs it into the Harness picker immediately. The leftover **Sync model list** button is gone. Hint copy is one line.
- Codex reset box title is **重置券** (was 重置额度).
- Settings adds an **About** tab: GitHub repo link, installed version, and a win/mac/linux update check against the latest GitHub release.
- Source is TypeScript throughout: Settings UI (`src/ui/client.ts`), tests, and the analyze CLI. Runtime `lib/` is compiled.
- **GLM / Z.ai Coding Plan OAuth.** Settings adds a **智谱 GLM** tab. Login uses ZCode's CLI poll (`zcode.z.ai/api/v1/oauth/cli/init` → browser → poll → business login → durable `id.secret` key). Chat goes to `api.z.ai/api/coding/paas/v4`. Import reads `~/.zcode/cli/config.json`.

## 0.0.15

- Codex reset credits refresh the **weekly** window, not the 5-hour window.
- Codex reset opens DeepSeek Harness `RiskConfirmation` (checkbox ack + confirm). If the primitive is not on the module table, the Settings page uses a `--dsw-alias-*` clone of the same dialog.
- Drop the unused Codex / Grok loopback hint lines from the Settings cards.
- Redesign Codex reset-quota UI: nest a credit box inside the ChatGPT Codex card and render one reset button per credit, keyed to that credit’s expiry instead of a lumped “N left” control. The snapshot now forwards each available credit (`id`, `expiresAt`).
- Restructure the source tree into `src/oauth/{codex,grok}`, `src/ui`, and `src/utils`. Host code is TypeScript; Settings UI stays React. Compiled output lives in `lib/`. Binding conventions: `AGENTS.md`. Recurring faults still go in `docs/error.md`.

- Add `scripts/analyze-session.mjs` to score a DeepSeek Harness `session.jsonl` for Codex cache affinity, token spend, tool errors, and transport faults.
- Classify each call as `cold_start` / `delta` / `compaction` / `rebuild` / `affinity_miss`, so compaction and leaving plan mode are not reported as shard misses.
- Close the 2026-08-26 cache-affinity runtime acceptance on the full 211-call `gpt-5.6-terra-fast` session: **95.6%** weighted hit, **99.6%** median prefix reuse, **0** affinity misses, 0 TRANSPORT.
- Clip and sanitize `prompt_cache_key` to 64 `[A-Za-z0-9._:-]` characters instead of dropping the affinity headers.
- Stabilize the Codex input prefix: strip a duplicate leading developer/system, and park extra plan/header text at the **suffix** so conversation history can still cache.
- Fall back to `session_id` when `prompt_cache_key` is missing or illegal; write the clipped key back into the request body; drop an unusable key rather than forwarding it.
- Strip `prompt_cache_retention` / `prompt_cache_options` (gpt-5.6 returns 400; Codex #39397).
- Classify tool errors as `host_timeout` / `cascade_abort` / `invalid`. glob/grep 30s is `dsh-tool-fs-search`, not this proxy; sibling `read aborted` is a host `Promise.all` cascade. Do not treat them as TRANSPORT.
- Add GitHub Actions CI (`npm test` on Node 22).

## 0.0.14

- Align the Codex catalog with the live backend: drop `gpt-5.3-codex`, `minimal` effort, and the `-ultra` alias; Fast and large-context variants follow each catalog row.

## 0.0.13

- Hold the client response uncommitted until a Codex stream produces output, so a silent pre-output break can be retried instead of reaching llm-pi-ai as a clean EOF.
