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

A healthy long session after warmup should stay above **80%** weighted cache hit, with zero later `cacheReadTokens: 0` calls. Record regressions in `docs/error.md`.

## Layout

| Path | Owns |
| --- | --- |
| `lib/proxy.js` | Loopback Responses proxy, cache-affinity headers, stream commit gate |
| `lib/codex.js` / `lib/grok.js` | Catalog, identity headers, OAuth endpoints |
| `lib/client.js` | Settings UI (classic script, `__ModuleLoader__`) |
| `lib/analyze-session.js` | Session.jsonl scoring |
| `docs/error.md` | Recurring faults and the acceptance that closed them |
