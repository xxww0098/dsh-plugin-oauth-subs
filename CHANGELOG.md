# Changelog

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
