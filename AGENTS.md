# AGENTS.md

This file is binding for every change in **dsh-plugin-oauth-subs**.
Chat instructions do not override it.

本文件是本仓库的硬约定。对话里的临时说法不能盖掉这里的规则。

## Stack — TypeScript + React

- **Host (Cordis / Node):** TypeScript only. New code lives under `src/` as `.ts`.
  Do not add new `.js` in `src/`.
- **Settings UI:** React + TypeScript (`src/ui/client.ts`). The DSH client
  loader is a classic-script factory compiled by `tsc -p tsconfig.ui.json`
  into `lib/ui/client.js`. It `require('react')` and renders with
  `createElement` / hooks. Do not add Vue, Svelte, or raw DOM helpers.
- **Tests and scripts** are TypeScript (`test/*.test.ts`, `scripts/*.ts`),
  run with Node `--experimental-strip-types`.
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
    glm/                   Zhipu GLM Coding Plan (Z.ai global + BigModel China)
      index.ts             catalog, CLI poll OAuth, key mint, headers
      cli-flow.ts          ZCode /oauth/cli/init + poll (`zai` / `zcode`)
  ui/                      React Settings (classic-script factory)
    client.ts
  utils/                   shared, provider-agnostic
    jwt.ts
    pkce.ts
    fast-mode.ts
    context-mode.ts
    analyze-session.ts
    update.ts              GitHub latest-release check
lib/                       tsc + UI tsc — generated, do not edit
docs/error.md              fault log
test/                      node:test TypeScript, import compiled lib/
scripts/                   CLI (TypeScript)
```

Rules:

- Codex-only code → `src/oauth/codex/`. Grok-only code → `src/oauth/grok/`. GLM-only code → `src/oauth/glm/`.
- Shared crypto / session scoring → `src/utils/`.
- Settings React → `src/ui/`.
- Do not flatten modules back into a single `lib/*.js` bag.

## Adding a new OAuth family

A family is one top-level tab (Codex / Grok / GLM today) plus its own
`src/oauth/<id>/` module. Do not piggyback a new vendor onto an existing
tab. Follow this checklist in one PR.

### Host

1. **Module** `src/oauth/<id>/index.ts`: catalog (`id`, `name`,
   `contextWindow`, `maxTokens`, `input`, `reasoningEfforts`), OAuth
   endpoints, session builder, User-Agent, refresh. Extra flow files stay
   in that folder (`device-flow.ts`, `cli-flow.ts`, …).
2. **Store** already keys by provider string. Use a short id (`codex`,
   `grok`, `glm`). `saveSession` / `listStoredSessions` keep **many
   accounts per family**; `switchAccount` picks the chat session. Do not
   invent a second credential file.
3. **Controller** (`src/oauth/controller.ts`): wire login / cancel /
   logout / switch / import / quota in the same places Codex and Grok
   already branch. Snapshot must return
   `accounts.<id> = { …status, activeId, accounts: AccountRow[] }`.
4. **Quota** (`src/oauth/quota.ts`): cache key is `provider\0accountId`.
   Snapshot hydrates **every** stored account (`ensureAll` /
   `#accountsWithQuota`), not only the active one. A missing quota API is
   fine — the card still renders, quota block stays idle.
5. **Catalog** (`src/oauth/models.ts`): add `${prefix}-<id>` to
   `ownedProviderIds`, `buildProviders`, `catalogProviders`,
   `describeCatalog`. `toHarnessModel` copies `model.input` and
   `reasoningEfforts`; do not hard-code image on every row.
6. **Plan labels** (`src/oauth/plan.ts`): map wire slugs to the product
   name users see (`Pro 20x`, `SuperGrok Heavy`, `Lite`). Family-specific
   collisions (`glm` `pro` → `Pro`, Codex `pro` → `Pro 20x`) belong here.
7. **Proxy / tokens** only if chat actually goes through the local
   Responses proxy. GLM talks to Z.ai / BigModel directly — do not force
   a proxy hop.
8. **Tests** under `test/`: login parse, session round-trip, catalog
   input types, and `snapshot shows quota on every <id> account`.

### Settings — tab icon

`src/ui/client.ts` is a **classic script**. Do not `import` `@lobehub/icons`.
Follow [lobehub.com/icons/skill.md](https://lobehub.com/icons/skill.md) by
inlining the mono SVG path from
`https://unpkg.com/@lobehub/icons-static-svg@1.94.0/icons/<name>.svg`
into `TAB_ICONS`.

- Tabs are **icon-only**. Visible label is `title` + `aria-label` (hover /
  screen reader). Never put the family name in the tab button.
- Size 18×18, `viewBox="0 0 24 24"`, `fill="currentColor"`. Match the
  official brand mark, not a generic letter. GLM uses the **Z.ai** icon
  (`zai`), not Zhipu.
- Order: families first (Codex, Grok, GLM, then the new one), then
  Models, then About (GitHub icon). Insert the new family **before**
  Models.
- Add `COPY.zh.<id>Title` / `COPY.en.<id>Title` for the hover string and
  the page heading.

```text
[ Codex ] [ Grok ] [ Z.ai ] [ New ] [ ▦ ] [ GitHub ]
```

### Settings — one account, one card

Reuse `AccountCard`. Do not draw a family-level identity row or a shared
quota block under the heading.

Layout of each card (`.osubs-acct`):

```text
┌─────────────────────────────────────────────────────────┐
│  email@x                  PlanTag  使用中     [退出]     │
│  额度                                                    │
│  ████████░░░░  剩余 73%                                   │
│  [刷新额度]                                              │
└─────────────────────────────────────────────────────────┘
```

Binding UI rules:

- **One stored session → one card.** Cards stack in `.osubs-accts`
  (`flex-direction: column`, 12px gap). Never a compact list of emails
  sharing one quota.
- **Click the card** to switch. Active card is `.osubs-acct--on` (stronger
  border + fill) with an `使用中` / `In use` tag. Inactive cards keep a
  `切换` button; the whole card is also the hit target.
- **Quota lives inside the card**, always, including inactive accounts.
  Refresh (and Codex-style reset, if any) is per card and
  `stopPropagation` so it does not switch. Switching still selects the
  chat account; it must not be the only way to see quota.
- **Head row:** `account || id` (mono) · plan tag · in-use tag · optional
  region tag. Plan sits **after the email**. Do **not** prefix `套餐` /
  `Plan`. Do **not** put the plan on its own row.
- **No helper copy** under the family title. Heading is the title + a
  status pill (`未登录` / `已登录` / `等待授权…`). No
  “每个账号一张卡片…” paragraph.
- Login actions sit **below** the cards (or replace `还没有登录账号` when
  the roster is empty). “添加账号” after the first session; do not
  restyle the first login as a fake card.

### Settings — design details

- Inherit the host theme. Colors are `currentColor` mixes
  (`--osubs-line` 16%, `--osubs-fill` 6%, `--osubs-muted` 66%). No
  hardcoded light-theme grays.
- Cards: 12px radius, 1px `--osubs-line`, 14×16 padding. Active uses
  `--osubs-edge` + `--osubs-fill`.
- Type: 13px UI, 12.5px emails. Tags (`osubs-tag`) for plan / in-use /
  Fast / 900K — small, not a second heading. About kv rows are one 13px
  face; OS is only `macOS` / `Windows` / `Linux` (no “本机”).
- Model picker: family name + `已开启 n / m`. **No 文本 / 图文 tags.**
  Checkboxes and All/None stay **disabled until that family is signed
  in**.
- Keep GLM dual-login (Z.ai vs BigModel) as two stacked buttons on that
  family only. A new family gets one primary login unless it truly has
  two official OAuth sites.

### Do not

- Merge two vendors into one tab because the icons are similar.
- Show quota only on the active card.
- npm-install a React icon package into the classic-script UI.
- Hand-edit `lib/`.
- Auto-release; one task → one PR.

## Commands

```sh
npm run build          # src/ → lib/
npm test               # build + node:test
npm run analyze -- path/to/session.jsonl
```

Healthy long Codex session: weighted cache hit ≥ 80%, **zero** affinity
misses, no TRANSPORT. Compaction / plan rebuild zeros are not shard misses.
Grok uses `x-grok-conv-id` + body `prompt_cache_key`, not Codex
`session-id` headers; a later 512-token cache block with <10% reuse is an
affinity miss (wrong xAI shard), not a prefix rewrite.
`Error: tool call timed out after 30000ms` is `dsh-tool-fs-search`, not
this proxy — record it in `docs/error.md`, do not add `toolTimeoutMs` here.

## PR

- Keep `docs/error.md` in the same PR as the behavior change.
- Do not merge generated `lib/` that was hand-patched.
- Tests stay green on Node 22 (`npm test`).
- One task, one PR. Do not tag / `gh release` unless asked.
