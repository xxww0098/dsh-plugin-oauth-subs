# Contributing

Read [`AGENTS.md`](AGENTS.md) first — it is binding and indexes every doc: stack, commands and release flow in [`docs/development.md`](docs/development.md), cross-family rules in [`docs/rules.md`](docs/rules.md), the new-family pipeline in [`docs/oauth.md`](docs/oauth.md).

## Tests and type checks

`npm test` (Node 22) builds and runs `node:test` files under `test/`, which import compiled `lib/`. Never commit credentials or live `auth.json` fixtures; use disposable directories and loopback servers.

The host build type-checks with `strictNullChecks` and `useUnknownInCatchVariables`, so a host type error fails `npm test`. `strict` / `noImplicitAny` stay off and option bags are deliberately `any`: the checker catches typos, arity, literals, and null safety, not a fully typed surface. Don't hide diagnostics with casts or suppressions. `noImplicitAny` is a type-surface design job per module, not a sweep.

CI's ratchet (`scripts/typecheck-ratchet.ts`, baseline `scripts/typecheck-baseline.json`, both counts 0) re-passes those switches explicitly, so weakening `tsconfig.json` can't silently loosen checking. Raising the baseline (`--update`) is a reviewer-visible act.

## Session diagnosis

For slow turns or `stream ended before a terminal response event`, get the `session.jsonl` and run `npm run analyze -- path/to/session.jsonl`. A healthy long session stays above 80% weighted cache hit with zero affinity misses. Compaction and `request/header` rebuilds are labeled separately — not shard regressions. `tool call timed out after 30000ms` belongs to `dsh-tool-fs-search`, not this proxy. Record true affinity misses in `docs/error.md`. Kiro reports no cache field, so its hit reads `n/a` / `UNMEASURED`; when the plugin data directory holds `prefix-estimate.jsonl`, the analyzer adds the proxy's cacheable-prefix estimate as `≤x%` — an upper bound (it assumes the server cache is still warm), useful for spotting a prefix the plugin broke, not a measured hit.

The session only records `terminated` when a stream breaks after output. The proxy's own reason (retries and mid-response failures, with elapsed time and silence since the last upstream data) is appended to `upstream.log` in the plugin data directory (`~/.dsh/profiles/<profile>/data/dsh-plugin-oauth-subs/`). Per-step time-to-first-token and generation time come from each `assistant/message` event's `stream[]` timings (`time`, `time0` + `dt[]`); `npm run analyze` does not report them.

## Ownership boundaries

- `src/oauth/proxy.ts` owns loopback auth and routing; the passthrough attempt and pre-output commit gate live in `passthrough.ts`, the body read and per-family cache dispatch in `proxy-body.ts`. None of them share identities across vendors.
- `src/oauth/quota.ts` owns the quota cache and family dispatch; each family's quota endpoints and parsing live in its own `quota.ts`.
- `src/oauth/models.ts` projects catalogs into routes; `harness-sync.ts` writes them to the host, and `model-switch.ts` holds the picker state.
- `src/oauth/controller.ts` owns state and the RPC entry points; the work behind them is plain functions taking the controller: `login.ts`, `account-quota.ts`, `self-update.ts`, `account-marks.ts`, and each family's `accounts.ts` (auto-import, identity, catalog discovery, login completion).
- Vendor wire translation and its HTTP/stream lifecycle live together in the family folder (see the [Kiro](src/oauth/kiro/README.md), [Antigravity](src/oauth/antigravity/README.md), [Cursor](src/oauth/cursor/README.md) READMEs). `src/utils/` holds only vendor-agnostic mechanisms — never cache rewrites.
- `src/oauth/tokens.ts` owns account-scoped refresh coalescing; `src/oauth/store.ts` owns atomic conditional writes. Every login save mints a new generation, so a refresh or metadata result from an old login (even with identical tokens) can't activate, delete, or recreate a newer one. Chat and quota hydration use the same owner.
- Late quota/identity results merge only the fields they changed (including deletions) against their source snapshot, so concurrent enrichers don't erase each other.
- Credential writes are serialized within one process only; atomic rename is not a cross-process lock. Multi-process refresh would need its own lock design.
- Errors, cancellation, and success stay distinct: a stream that fails after output ends with an error event, not stop/DONE, and is never silently retried into duplicate text.
- Explicit model selection is one global persisted flag (`selectionExplicit`); legacy files without it still get the old all-off-family recovery. Per-family flags are an open product choice.
- `src/ui/` is the React classic-script client: `client.ts` is the factory shell and `parts/*.ts` hold the views, stitched into one closure by `scripts/ui-bundle.ts`; host modules stay framework-free. `lib/` is always rebuilt, never hand-patched.
