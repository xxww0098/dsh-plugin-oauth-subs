# AGENTS.md

This file is binding for every change in **dsh-plugin-oauth-subs**.
Chat instructions do not override it.

本文件是本仓库的硬约定。对话里的临时说法不能盖掉这里的规则。

## Stack — TypeScript + React

- **Host (Cordis / Node):** TypeScript only. New code lives under `src/` as `.ts`.
  Do not add new `.js` in `src/oauth` or `src/utils`.
- **Settings UI:** React. The DSH client loader is a classic-script factory
  (`src/ui/client.js`) that `require('react')` and renders with
  `createElement` / hooks. New UI is React (JSX/TSX compiled into that
  factory). Do not add Vue, Svelte, or raw DOM helpers for Settings.
- **Do not** put React in the host half. The proxy, OAuth flows, and quota
  run in Node and must stay framework-free TypeScript.
- Public runtime is compiled **JavaScript** in `lib/` (`npm run build`).
  Edit `src/`, never hand-edit `lib/`.

## Errors → `docs/error.md`

Every recurring fault, runtime acceptance, or “not this plugin” finding
is written to [`docs/error.md`](docs/error.md). Do not leave a new failure
mode only in chat, a commit message, or a code comment.

For each entry record:

1. Date and symptom (what the user / session.jsonl showed).
2. Evidence (session id, model, counts).
3. Root cause (which layer: proxy / Codex prefix / DSH host / fs-search).
4. Fix or explicit non-fix (and why this plugin cannot own it).
5. Verification (`npm test`, analyzer scores, acceptance numbers).

Analyzer-only labels are not a substitute for an `docs/error.md` entry when
the behavior is user-visible.

## Source tree

```text
src/
  index.ts                 Cordis plugin apply / Config / public re-exports
  oauth/                   subscription auth + loopback Responses proxy
    proxy.ts
    controller.ts
    flow.ts                shared PKCE (Codex; Grok fallback)
    store.ts
    tokens.ts
    quota.ts
    import-auth.ts
    models.ts
    plan.ts
    codex/                 ChatGPT Codex only
      index.ts             catalog, identity, session, OAuth endpoints
      request.ts           Responses body: prefix stabilize, strip retention
    grok/                  xAI Grok only
      index.ts             catalog, identity, device/PKCE endpoints
      device-flow.ts       RFC 8628
  ui/                      React Settings (classic-script factory)
    client.js
  utils/                   shared, provider-agnostic
    jwt.ts
    pkce.ts
    fast-mode.ts
    context-mode.ts
    analyze-session.ts
lib/                       tsc + copied UI — generated, do not edit
docs/error.md              fault log
test/                      node:test, import compiled lib/
```

Rules:

- Codex-only code → `src/oauth/codex/`. Grok-only code → `src/oauth/grok/`.
- Shared crypto / session scoring → `src/utils/`.
- Settings React → `src/ui/`.
- Do not flatten modules back into a single `lib/*.js` bag.

## Commands

```sh
npm run build          # src/ → lib/
npm test               # build + node:test
npm run analyze -- path/to/session.jsonl
```

Healthy long Codex session: weighted cache hit ≥ 80%, **zero** affinity
misses, no TRANSPORT. Compaction / plan rebuild zeros are not shard misses.
`Error: tool call timed out after 30000ms` is `dsh-tool-fs-search`, not
this proxy — record it in `docs/error.md`, do not add `toolTimeoutMs` here.

## PR

- Keep `docs/error.md` in the same PR as the behavior change.
- Do not merge generated `lib/` that was hand-patched.
- Tests stay green on Node 22 (`npm test`).
