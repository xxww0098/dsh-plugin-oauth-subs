# Contributing

Read [`AGENTS.md`](AGENTS.md) first. Host code is TypeScript under `src/`. Settings UI is React under `src/ui`. Recurring faults go in [`docs/error.md`](docs/error.md). Reference hops (official CLI + community reverse) go in [`docs/oauth.md`](docs/oauth.md).

## Tests

```sh
npm test
```

Node 22. Tests are `node:test` files under `test/` and import **compiled** `lib/`. Do not write credentials or live `auth.json` fixtures. Use disposable directories and loopback servers for lifecycle and transport regressions.

The host build type-checks, with `strictNullChecks` and `useUnknownInCatchVariables` on: `tsconfig.json` sets both and no longer sets `noCheck`, so `npm run build` — and therefore `npm test` — fails on a host type error. `strict` and `noImplicitAny` are still off, and option bags are deliberately typed `any`, so the checker catches misspelled properties, wrong arity, malformed literals, null-safety violations, and un-narrowed catch variables; it does **not** give a fully typed surface. Do not hide diagnostics with casts or new suppressions.

`noImplicitAny` is the one remaining big switch and is **not** a cleanup: it reports roughly 2000 errors that are almost all "annotate this parameter", so enabling it means designing the type surface module by module, not sweeping. See [docs/error.md](docs/error.md) before attempting it.

CI also runs a ratchet that tracks two counts and fails when either rises above `scripts/typecheck-baseline.json` (both **0**): `errors` and `strict`. It passes `--noCheck false` and `--strictNullChecks --useUnknownInCatchVariables` explicitly, so removing any of those switches from `tsconfig.json` cannot silently weaken checking again:

```sh
node --experimental-strip-types scripts/typecheck-ratchet.ts          # check
node --experimental-strip-types scripts/typecheck-ratchet.ts --update # accept debt
```

Raising a baseline is a deliberate act a reviewer should see; keep both at 0.

## Session diagnosis

When a user reports slow Codex turns or a flood of `stream ended before a terminal response event`, ask for the `session.jsonl` (or the DSH session zip) and run:

```sh
node --experimental-strip-types scripts/analyze-session.ts path/to/session.jsonl
```

A healthy long session should stay above **80%** weighted cache hit with **zero affinity misses**. Compaction and `request/header` rebuilds rewrite the prefix and are labeled separately — do not file those as shard regressions. `Error: tool call timed out after 30000ms` is `dsh-tool-fs-search` + timeout-policy, not this proxy; do not add a fake `toolTimeoutMs` here. Record true affinity misses in `docs/error.md`.

## Ownership boundaries

The [audit choices ledger](docs/choices.md) records the tradeoffs behind the current lifecycle and transport boundaries, including compatibility and verification limits.

- `src/oauth/proxy.ts` owns loopback authentication, routing, and passthrough retry/commit policy. It dispatches cache policy rather than sharing identities between vendors.
- Vendor-specific wire translation and its HTTP/stream lifecycle belong together under that family's folder. The translating transports are documented in [Kiro](src/oauth/kiro/README.md), [Antigravity](src/oauth/antigravity/README.md), and [Cursor](src/oauth/cursor/README.md). Shared HTTP response primitives live in `src/utils/http.ts` and must not know any vendor.
- `src/oauth/tokens.ts` owns account-scoped refresh coalescing; `src/oauth/store.ts` owns atomic conditional writes. A refresh or metadata result from an old login cannot activate, delete, or recreate a newer login. Chat and background quota hydration must use that same owner.
- `src/ui/` is the React classic-script settings client; host modules stay framework-free. `src/utils/` is only for provider-independent mechanisms, never shared cache rewrites.
- Generated `lib/` is rebuilt from source. Cross-family contracts live in [AGENTS.md](AGENTS.md), incidents in [docs/error.md](docs/error.md), and upstream attribution in [docs/oauth.md](docs/oauth.md).
