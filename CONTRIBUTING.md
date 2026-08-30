# Contributing

## Tests

```sh
npm test
```

Node 22. Tests are `node:test` files under `test/`. Do not write credentials or live `auth.json` fixtures.

## Session diagnosis

When a user reports slow Codex turns or a flood of `stream ended before a terminal response event`, ask for the `session.jsonl` (or the DSH session zip) and run:

```sh
node scripts/analyze-session.mjs path/to/session.jsonl
```

A healthy long session should stay above **80%** weighted cache hit with **zero affinity misses**. Compaction and `request/header` rebuilds rewrite the prefix and are labeled separately — do not file those as shard regressions. Record true affinity misses in `docs/error.md`.

## Layout

| Path | Owns |
| --- | --- |
| `lib/proxy.js` | Loopback Responses proxy, cache-affinity headers, stream commit gate |
| `lib/codex-request.js` | Codex body shaping: lift instructions, stabilize input prefix, strip gpt-5.6-rejected fields |
| `lib/codex.js` / `lib/grok.js` | Catalog, identity headers, OAuth endpoints |
| `lib/client.js` | Settings UI (classic script, `__ModuleLoader__`) |
| `lib/analyze-session.js` | Session.jsonl scoring |
| `docs/error.md` | Recurring faults and the acceptance that closed them |
