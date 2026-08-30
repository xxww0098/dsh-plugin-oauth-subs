# Changelog

## 0.0.15

- Codex reset credits refresh the **weekly** window, not the 5-hour window. Settings copy, confirm dialog, and README now say so.
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
