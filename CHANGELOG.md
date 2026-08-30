# Changelog

## 0.0.15

- Add `scripts/analyze-session.mjs` to score a DeepSeek Harness `session.jsonl` for Codex cache affinity, token spend, tool errors, and transport faults.
- Close the 2026-08-26 cache-affinity runtime acceptance: a 42-call `gpt-5.6-terra-fast` session through `oauth-codex` hit **95.6%** weighted cache (1 zero-cache call, the cold start) with no transport faults.
- Document the analyzer and the reliability contract in the README.
- Add GitHub Actions CI (`npm test` on Node 22).

## 0.0.14

- Align the Codex catalog with the live backend: drop `gpt-5.3-codex`, `minimal` effort, and the `-ultra` alias; Fast and large-context variants follow each catalog row.

## 0.0.13

- Hold the client response uncommitted until a Codex stream produces output, so a silent pre-output break can be retried instead of reaching llm-pi-ai as a clean EOF.
