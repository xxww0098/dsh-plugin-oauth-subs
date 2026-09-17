# AGENTS.md

This file is binding for every change in **dsh-plugin-oauth-subs**.
Chat instructions do not override it.
本文件是硬约定；对话里的临时说法不能盖掉这里的规则。

## Stack

- Host: TypeScript only under `src/` (no new `.js`). Compiled to `lib/` via
  `npm run build` — never hand-edit `lib/`.
- Settings UI: React in `src/ui/client.ts` (classic-script factory,
  `tsc -p tsconfig.ui.json`, `createElement` + hooks, `require('react')`).
  No Vue/Svelte/raw DOM; no React in the host half.
- Tests/scripts: TypeScript, `node --experimental-strip-types` (`test/`,
  `scripts/`). Tests import the compiled `lib/`.

## Commands

```sh
npm run build   # src/ → lib/
npm test        # build + node:test (Node 22+)
npm run analyze -- path/to/session.jsonl
```

## Index

- Source of truth per family — `src/oauth/<id>/README.md` (login, hop,
  models, quota, cache, do-not, 归因). Codex / Grok / GLM / Kiro /
  Antigravity / Cursor / Kimi / Copilot / Devin live in `src/oauth/`;
  Ollama Cloud + OpenCode Go live in `src/apikey/`.
- Fault log — `docs/error.md`. Every recurring fault or user-visible
  finding goes there **in the same PR** (≤12 lines: 现象/根因/修复).
- Hop references — `docs/oauth.md`. Official/community repos per family;
  update its table whenever a hop copies a new client or reverse.
- UI page rules — `design-system/MASTER.md` +
  `design-system/pages/settings-workbench.md` (tabs, cards, quota bars,
  dialogs). Family tabs are icon-only 36×36 LobeHub mono paths inlined in
  `TAB_ICONS`; one stored session = one `AccountCard`; quota bars are
  remaining-bars; add-account chrome is a centered Dialog.

## Rules (cross-family)

- `<family>`-only code → `src/oauth/<id>/` (or `src/apikey/<id>/`). Every
  family has a `README.md` + its own `cache.ts` — never import another
  family's cache helper, never revive `src/utils/cache-session.ts`, never
  put cache rewrite in `src/utils/`. `proxy.ts` only dispatches.
- Never stamp `Date.now()`/random as a conversation/cache id; missing DSH
  ids fall back to a family-owned constant (`dsh-<id>[:<model>]`). Never
  write Codex `session-id`/`prompt_cache_key` or Grok `x-grok-conv-id`
  upstream to other vendors.
- DSH `api` is a closed union: `openai-completions` / `openai-responses` /
  `anthropic-messages`. `reasoningEfforts` keys are `off|minimal|low|
  medium|high|xhigh|max`; vendor spellings are values, never keys.
- Model rows carry real `name`/`contextWindow`/`maxTokens`/`input`
  (`text`/`image` only) — trace each to a source recorded in the family
  README.
- Public sessions never expose tokens, refresh secrets, or opaque account
  ids (`user-…`, `devin-team$…`).
- Adding a family: new `src/oauth/<id>/` + README + `docs/oauth.md` row +
  error.md note + tests + tab icon, all in one PR — checklist detail in
  `docs/oauth.md` 新家族.
- Never merge generated `lib/` that was hand-patched. One task → one PR;
  never bump `package.json`/lockfile, tag, or release — the maintainer
  does.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
