# Contributing

Read [`AGENTS.md`](AGENTS.md) first. Host code is TypeScript under `src/`. Settings UI is React under `src/ui`. Recurring faults go in [`docs/error.md`](docs/error.md).

## Tests

```sh
npm test
```

Node 22. Tests are `node:test` files under `test/` and import **compiled** `lib/`. Do not write credentials or live `auth.json` fixtures.

## Session diagnosis

When a user reports slow Codex turns or a flood of `stream ended before a terminal response event`, ask for the `session.jsonl` (or the DSH session zip) and run:

```sh
node --experimental-strip-types scripts/analyze-session.ts path/to/session.jsonl
```

A healthy long session should stay above **80%** weighted cache hit with **zero affinity misses**. Compaction and `request/header` rebuilds rewrite the prefix and are labeled separately — do not file those as shard regressions. `Error: tool call timed out after 30000ms` is `dsh-tool-fs-search` + timeout-policy, not this proxy; do not add a fake `toolTimeoutMs` here. Record true affinity misses in `docs/error.md`.

## Layout

| Path | Owns |
| --- | --- |
| `src/oauth/proxy.ts` | Loopback Responses proxy, cache-affinity headers, stream commit gate |
| `src/oauth/codex/` | Codex catalog, identity, Responses body (prefix stabilize) |
| `src/oauth/grok/` | Grok catalog, identity, device-code flow |
| `src/oauth/kiro/` | Kiro Social / Builder ID / IdC / Entra / API key |
| `src/oauth/antigravity/` | Antigravity catalog, Google OAuth, cloudcode-pa fingerprint |
| `src/ui/client.ts` | Settings UI (React classic-script, compiled to `lib/ui/client.js`) |
| `src/utils/analyze-session.ts` | Session.jsonl scoring |
| `docs/error.md` | Recurring faults and the acceptance that closed them |
| `AGENTS.md` | Binding stack, tree, and error-log rules |