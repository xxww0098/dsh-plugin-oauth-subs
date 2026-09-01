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
      README.md            family design: login, chat, quota, cache (traceable)
      index.ts             catalog, identity, session, OAuth endpoints
      request.ts           Responses body: prefix stabilize, strip retention
      cache.ts             prompt_cache_key + session-id / x-client-request-id
    grok/                  xAI Grok only
      README.md
      index.ts             catalog, identity, device/PKCE endpoints
      device-flow.ts       RFC 8628
      cache.ts             prompt_cache_key + x-grok-conv-id (not Codex headers)
    glm/                   Zhipu GLM Coding Plan (Z.ai global + BigModel China)
      README.md
      index.ts             catalog, CLI poll OAuth, key mint, headers
      cli-flow.ts          ZCode /oauth/cli/init + poll (`zai` / `bigmodel`)
      request.ts           Anthropic default + Completions leftover; thinking
      cache.ts             implicit prefix hash; Completions `user` / Anthropic `metadata.user_id` + `cache_control`
    kiro/                  AWS Kiro (Social / Builder ID / IdC / Entra / API key)
      README.md
      index.ts             catalog, identity, portal PKCE, refresh, usage headers
      import.ts            kami / JSON / CSV / kiro.rs / IDE SSO-cache pairing
      idc-flow.ts          AWS SSO OIDC register + JSON device poll
      request.ts           OpenAI chat ↔ generateAssistantResponse eventstream
      cache.ts             conversationId (never Date.now())
    antigravity/           Google Antigravity (cloudcode-pa)
      README.md
      index.ts             catalog, identity, Google OAuth, fingerprint
      request.ts           OpenAI chat ↔ generateContent
      cache.ts             generateContent sessionId + systemInstruction pin
  ui/                      React Settings (classic-script factory)
    client.ts
  utils/                   shared, provider-agnostic
    jwt.ts
    pkce.ts
    fast-mode.ts
    context-mode.ts
    analyze-session.ts
    relative-time.ts       remaining-time labels, precise to the minute
    update.ts              GitHub latest-release check
lib/                       tsc + UI tsc — generated, do not edit
docs/error.md              fault log
test/                      node:test TypeScript, import compiled lib/
scripts/                   CLI (TypeScript)
```

Rules:

- Codex-only code → `src/oauth/codex/`. Grok-only code → `src/oauth/grok/`. GLM-only code → `src/oauth/glm/`. Kiro-only code → `src/oauth/kiro/`. Antigravity-only code → `src/oauth/antigravity/`.
- **Each family has `README.md`.** Login, session, chat hop, models, quota, and cache for that vendor are written there so a later change can be traced to files and to `docs/error.md`. Cross-family rules stay in this file; do not let family READMEs contradict it.
- **Cache is per family.** Each `src/oauth/<id>/cache.ts` owns that vendor's prompt-cache identity, headers, and prefix pin. Do not import Codex cache helpers from Grok / GLM / Kiro / Antigravity. Do not share a `codexCacheSessionId` in `src/utils/`. `proxy.ts` only dispatches.
- Shared crypto / session scoring → `src/utils/`.
- Settings React → `src/ui/`.
- Do not flatten modules back into a single `lib/*.js` bag.

## Prompt cache — 设计规范（硬约定，禁止混用）

Each OAuth family has a **different** prompt cache. Copying Codex
suffix-park, Grok shard headers, GLM `user` / `x-session-id`, Gemini
`systemInstruction`, or Kiro `conversationId` onto another vendor is a
bug. `proxy.ts` only **dispatches**; it must not pin a shared key.

Family-level detail (endpoints, functions, historical faults) lives in
`src/oauth/<id>/README.md`. This section is the invariant list. When the
two disagree, fix the README — do not weaken these invariants.

### Invariants

- One file: `src/oauth/<id>/cache.ts`. Identity, headers, prefix pin, and
  field stripping for that vendor live **only** there.
- Do **not** import another family's cache helper. Do **not** revive
  `src/utils/cache-session.ts` or a shared `codexCacheSessionId`.
- Do **not** stamp `Date.now()` (or any per-request random) as a session /
  conversation / cache id. Missing DSH ids fall back to a **stable
  constant** owned by that family (`dsh-antigravity`, `dsh-kiro`, …).
- DSH may send `session_id` and/or `prompt_cache_key`. Mapping those onto
  the vendor wire is family-owned. Reading DSH's key is fine; writing
  Codex fields upstream is not, unless that vendor actually uses them.
- `src/utils/analyze-session.ts` may **label** hits by family. It must
  not rewrite upstream bodies.

### `cache.ts` contract

Export (names may vary, behavior must not):

1. `<id>CacheSessionId(key)` — sanitize that family's id. Empty / non-string
   → `undefined`. Clip is family-owned (today 1–64 of `[A-Za-z0-9._:-]`,
   but the function still lives in that folder so the charset can diverge).
2. Apply / pin helper used by `request.ts` or `proxy.ts`
   (`applyCodexCache`, `applyGrokCache`, `applyGlmCache` /
   `applyGlmAnthropicCache`,
   `antigravitySessionIdOf` + `pinAntigravitySystemInstruction` /
   `pinAntigravityTools` / `pinAntigravityThinking`,
   `kiroConversationId`).
3. Header helper if the vendor sticky-routes on headers
   (`codexCacheHeaders`, `grokAffinityHeaders`). GLM headers stay in
   `glm/index.ts` (`x-session-id`, Anthropic `anthropic-version`) and call
   `glmCacheSessionId`.
4. `reset*Pins()` when the family keeps an in-process prefix map (tests
   call this between cases).

`proxy.rewriteUpstreamBody` switches on `family` and calls **that**
helper. No `pinCache = family === 'codex' || family === 'grok' || …`.

### DSH → vendor

DSH / llm-pi-ai often prepends a **runtime-context snapshot** as another
leading system/developer every step (`This snapshot supersedes…`). That
rewrite busts any prefix cache. Parking is family-owned and the park
**shape** follows the vendor, not Codex.

```text
DSH body:  session_id?  prompt_cache_key?  messages/input  (volatile leading system)

Codex:     prompt_cache_key + headers session-id / x-client-request-id
           extra developer parked at input suffix
Grok:      prompt_cache_key + header x-grok-conv-id
           no Codex session-id headers
GLM:       drop prompt_cache_key / retention / options
           Anthropic default: metadata.user_id + header x-session-id
           first system block cache_control: ephemeral
           extra system as text blocks without cache_control
           Completions leftover: body.user + header x-session-id
           extra system parked at messages suffix
Antigravity: request.sessionId (fallback `dsh-antigravity:<model>`)
           first systemInstruction + equivalent tools pinned; extra → trailing user
           thinkingConfig sticky-first; no implicitCacheConfig
Kiro:      conversationState.conversationId (+ model)
           drop Codex/Grok cache fields
           system as first history user+ack; extra snapshots at history suffix
```

### Per family

**Codex** (`src/oauth/codex/cache.ts` + prefix lift in `request.ts`)

- Backend matches the longest stable prefix of top-level `instructions`
  then `input`. Extra leading `developer` / `system` in `input` (plan
  dumps, header rebuilds) must not stay at the front.
- Sticky: `session-id` = `x-client-request-id` = `prompt_cache_key`.
- Strip `prompt_cache_retention` / `prompt_cache_options` (gpt-5.6 400).
- Healthy long session: weighted hit ≥ 80%, **zero** affinity misses.
  Compaction / plan-rebuild zeros are not shard misses.

**Grok** (`src/oauth/grok/cache.ts`)

- xAI sticky-routes the prompt cache by **shard**, keyed on
  `x-grok-conv-id`. Codex `session-id` / `x-client-request-id` are ignored
  and must not be copied.
- Body still carries `prompt_cache_key` with the same cleaned id.
- A later **512-token** cache block with <10% reuse is an **affinity miss**
  (wrong shard), not a prefix rewrite.

**GLM** (`src/oauth/glm/cache.ts` + thinking in `request.ts`)

- Z.AI Coding Plan is an **implicit content-hash** of leading system +
  history. There is **no** shard key.
  https://docs.z.ai/guides/capabilities/cache
- Default hop is Anthropic. Sticky: `metadata.user_id` + `x-session-id`.
  Completions leftover: OpenAI `user` + `x-session-id`. Quota/biz hops
  without a DSH pin keep the process-level `sess_<24hex>` (not a chat
  cache id).
- **Do not** send `prompt_cache_key`, `prompt_cache_retention`, or
  `prompt_cache_options`.
- Completions leftover: pin the first leading `system` run per DSH
  session. Later snapshots go after the conversation (`role: system` at
  the **messages suffix**).
- Anthropic: pin the first `system` text block with
  `cache_control: { type: 'ephemeral' }`. Extra snapshots become extra
  text blocks **without** `cache_control`. Pin map key is
  `${sessionId}\0anthropic` so Completions and Anthropic do not collide.
- GLM-5.3 / Flash: `thinking: { type: 'enabled', clear_thinking: false }`
  on **both** hops. Official thinking-mode docs are Completions-shaped;
  Anthropic thinking/signatures are unproven. Keep previous
  `reasoning_content` on Completions leftover. A 576-token remnant after
  a leading splice is a **prefix break**, not a Grok affinity miss.
- Hits: OpenAI `prompt_tokens_details.cached_tokens` /
  `cache_read_input_tokens`. Anthropic stamps `cache_control`.

**Antigravity** (`src/oauth/antigravity/cache.ts` + usage map in `request.ts`)

- Gemini implicit-caches `systemInstruction` + contents prefix.
- Sticky: `request.sessionId` on generateContent. DSH `session_id` is
  one conversation (keep as-is). Fallback `dsh-antigravity:<model>`
  (bare `dsh-antigravity` only when model is unknown). Never
  `` `-${Date.now()}` ``.
- Pin the first `systemInstruction` text per DSH session. Extra snapshot
  text is a trailing **user** turn (Gemini has no trailing system the way
  GLM messages do).
- Pin the first `request.tools` JSON when names+schemas are equivalent
  (canonical key order). Added or removed tools are a real change.
- `thinkingConfig` is sticky-first. Do **not** send `implicitCacheConfig`.
- Map `cachedContentTokenCount` / `cacheTokensDetails` / CLI
  `cache_read_tokens` / `cacheReadTokens` / `cacheReadInputTokens` →
  OpenAI `prompt_tokens_details.cached_tokens` or DSH hit rate stays 0%.

**Kiro** (`src/oauth/kiro/cache.ts`)

- AWS CodeWhisperer conversation cache. Sticky:
  `conversationState.conversationId` = DSH pin **plus model id**.
  Fallback `dsh-kiro:<model>` (bare `dsh-kiro` only when model is
  unknown). Never `Date.now()`. Switching the picker must not reuse
  another model's conversation.
- Official wire has no system field. Park system as the first history
  `userInputMessage` + canned ack (`I will follow these instructions.`).
  Do not prepend the system blob onto every `currentMessage.content`.
  Pin the first system text per conversationId; extra DSH snapshots
  become another user+ack pair at the **history suffix**.
- Tools stay on current `userInputMessageContext.tools` (not a
  conversationState-level field).
- Hits: `cacheReadInputTokens` → OpenAI `prompt_tokens_details.cached_tokens`.
- No Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Gemini
  `systemInstruction` field.

### New family checklist (cache)

When adding `src/oauth/<id>/`:

1. Add `cache.ts` **and** document it in that family's `README.md` in the
   same PR.
2. Document the backend (prefix hash / shard / conversation / other) in
   this section — one row in the table below **and** the bullets above.
3. Wire `proxy.ts` with an explicit `family === '<id>'` branch. Do not
   extend a shared `pinCache` boolean.
4. Tests: sanitizer, sticky id across two turns, “does not inherit Codex
   / Grok headers or `prompt_cache_key` unless this vendor uses them”,
   and prefix-park if DSH snapshots would bust the cache.
5. Usage mapping: if the vendor returns cache hits under a non-OpenAI
   name, translate them so DSH `cacheReadTokens` is non-zero.

| Family | Backend cache | Sticky identity | Park extras | Hit field |
|---|---|---|---|---|
| Codex | prefix of `instructions` then `input` | `session-id` + `x-client-request-id` = `prompt_cache_key` | developer at **input suffix** | `cacheReadTokens` |
| Grok | conversation shard | `x-grok-conv-id` (+ body `prompt_cache_key`) | n/a (shard, not prefix) | `cacheReadTokens`; 512 + reuse<10% = affinity miss |
| GLM | content hash of leading system + history | Anthropic: `metadata.user_id` + `x-session-id` + first-block `cache_control`; Completions leftover: `user` + `x-session-id` | Completions: system at **messages suffix**; Anthropic: extra system text blocks without cache_control | `cached_tokens` / `cache_read_input_tokens` |
| Antigravity | Gemini `systemInstruction` + contents + tools | `request.sessionId` (fallback + model) | extra as trailing **user** | `cachedContentTokenCount` / `cache_read_tokens` → `cached_tokens` |
| Kiro | CodeWhisperer conversation | `conversationId` + model | system as first history user+ack; extra at history suffix | `cacheReadInputTokens` → `cached_tokens` |

### Do not

- Share one sanitizer / pin map / header helper across families.
- Write Codex `session-id` or `prompt_cache_key` to GLM / Kiro / Antigravity.
- Write Grok `x-grok-conv-id` to anyone else.
- Park GLM extras as a Gemini user turn, or Gemini extras as a GLM
  trailing system, “because parking is the same idea”.
- Treat a GLM 576-token remnant as a Grok affinity miss, or a Grok 512
  block as a GLM prefix break.
- Put cache rewrite in `src/utils/`.

## Harness protocol — 设计规范（硬约定）

DSH `llm-pi-ai` `api` is a **closed union**:

- `openai-completions`
- `openai-responses`
- `anthropic-messages`

Bare `openai` is refused and the whole section write is dropped, so the
family never lands in `settings.yaml`. One provider = one `api`. Do not
invent a fourth value.

### Rule

Pick the DSH shape that matches the **vendor-native** wire among those
three. If the vendor is none of them, use Completions plus a hop
translator in that family's `request.ts`. Do not pick Responses or
Anthropic just to avoid Completions — the extra DSH adapter still has
to exist, and you lose the native Completions path.

Family hops live in `src/oauth/<id>/README.md`. This section is the
invariant list. When the two disagree, fix the README.

### Per family

| Family | DSH `api` | Why | Hop |
|---|---|---|---|
| Codex | `openai-responses` | ChatGPT backend is Responses | passthrough `POST /codex/v1/responses` |
| Grok | `openai-responses` | xAI `api.x.ai/v1/responses` | passthrough `POST /grok/v1/responses` |
| GLM | `anthropic-messages` | ZCode Desktop default is Anthropic (`ai-sdk/anthropic`). Coding Plan also has Completions `paas/v4`. Generic Responses `api.z.ai/api/v1` is **not** Coding Plan dedicated. | `POST /glm/v1/messages` → `/api/anthropic/v1/messages`. Completions leftover `/glm/v1/chat/completions` until the next `sync()`. |
| Kiro | `openai-completions` | Native is AWS EventStream `GenerateAssistantResponse` | Completions adapter |
| Antigravity | `openai-completions` | Native is `generateContent` | Completions adapter |

`baseURL` must match how that SDK posts. Anthropic SDK posts
`{baseURL}/v1/messages`, so GLM is `${origin}/glm` (not `${origin}/glm/v1`).
`/glm/v1/v1/messages` is leftover-settings safety only.

### `reasoningEfforts` keys

DSH `llm-pi-ai` thinking levels are a **closed union**: `off` | `minimal` | `low` | `medium` | `high` | `xhigh` | `max`. Keys are picker levels; **values** are the vendor wire spelling (`off: "none"` for Kiro GPT). A key like `none` fails the whole section write — same class of bug as bare `api: openai`. `toHarnessModel` throws before mutate. Do not invent a fourth key.

### GLM 150%

The Coding Plan 1.5× boost is **identity** (ZCode Desktop UA /
`X-ZCode-*`), not protocol. Fingerprint matches Desktop 3.10.1 from
`zcode.cjs` (`eao` / `rao`). This plugin has **not** compared quota
slope vs official Desktop. Official promo copy ran through 2026-08-31.
Switching GLM to Anthropic aligns the hop with ZCode's default (the UA
already said `ai-sdk/anthropic` while Completions was posted). Do
**not** claim the protocol switch "earns 150%".

### Do not

- Switch Codex / Grok to Completions.
- Switch Kiro / Antigravity to Responses or Anthropic (native is still
  none of the three; you would keep a translator and lose DSH's native
  Completions path).
- Set GLM `api: openai-responses` (generic `api.z.ai/api/v1` is not
  Coding Plan).
- Drop the Completions leftover route until the next `sync()` has
  rewritten leftover `openai-completions` settings.
- Stamp GLM Completions-only `compat` (`supportsReasoningEffort`,
  `thinkingFormat`) on the Anthropic route. DSH `assertServiceable`
  rejects those fields and the atomic `llm-pi-ai` mutate drops every
  owned route in that write, including `oauth-kiro`.
- Use a vendor effort name (`none`, `adaptive`, `disabled`) as a
  `reasoningEfforts` **key**. Map it as the value of a DSH level.

## Adding a new OAuth family

A family is one top-level tab (Codex / Grok / GLM / Kiro / Antigravity today) plus its own
`src/oauth/<id>/` module. Do not piggyback a new vendor onto an existing
tab. Follow this checklist in one PR.

### Host

1. **README** `src/oauth/<id>/README.md` in the same PR: what the vendor
   is, file map, login, session, **protocol** (`api` + hop), chat hop,
   models, quota, **cache**, do-not, and links into `docs/error.md`. Keep
   it traceable (function names, endpoints, wire fields). AGENTS.md is
   the cross-family contract; the family README is the design source for
   that folder.
2. **Module** `src/oauth/<id>/index.ts`: catalog (`id`, `name`,
   `contextWindow`, `maxTokens`, `input`, `reasoningEfforts`), OAuth
   endpoints, session builder, User-Agent, refresh. Extra flow files stay
   in that folder (`device-flow.ts`, `cli-flow.ts`, …).
3. **Store** already keys by provider string. Use a short id (`codex`,
   `grok`, `glm`). `saveSession` / `listStoredSessions` keep **many
   accounts per family**; `switchAccount` picks the chat session. Do not
   invent a second credential file.
4. **Controller** (`src/oauth/controller.ts`): wire login / cancel /
   logout / switch / import / quota in the same places Codex and Grok
   already branch. Snapshot must return
   `accounts.<id> = { …status, activeId, accounts: AccountRow[] }`.
5. **Quota** (`src/oauth/quota.ts`): cache key is `provider\0accountId`.
   Snapshot hydrates **every** stored account (`ensureAll` /
   `#accountsWithQuota`), not only the active one. A missing quota API is
   fine — the card still renders, quota block stays idle.
6. **Catalog** (`src/oauth/models.ts`): add `${prefix}-<id>` to
   `ownedProviderIds`, `buildProviders`, `catalogProviders`,
   `describeCatalog`. Pick `api` from the closed union per the protocol
   section. `baseURL` must match how that SDK posts. `toHarnessModel`
   copies `model.input` and `reasoningEfforts`; do not hard-code image
   on every row. `reasoningEfforts` keys must be DSH thinking levels
   (`off|minimal|low|medium|high|xhigh|max`); vendor `none` is the
   **value** of `off`, not a key.
7. **Plan labels** (`src/oauth/plan.ts`): map wire slugs to the product
   name users see (`Pro 20x`, `SuperGrok Heavy`, `Lite`). Family-specific
   collisions (`glm` `pro` → `Pro`, Codex `pro` → `Pro 20x`) belong here.
8. **Proxy / tokens / cache**: all five families chat through the local
   proxy. Pick `api` per the protocol section. Prompt cache **must** be
   a new `src/oauth/<id>/cache.ts`. Do not import another family's cache
   helper, and do not revive `src/utils/cache-session.ts`.
9. **Tests** under `test/`: login parse, session round-trip, catalog
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
- Order: families first (Codex, Grok, GLM, Kiro, then the new one), then
  Models, then About (GitHub icon). Insert the new family **before**
  Models.
- Add `COPY.zh.<id>Title` / `COPY.en.<id>Title` for the hover string and
  the page heading.

```text
[ Codex ] [ Grok ] [ Z.ai ] [ Kiro ] [ Antigravity ] [ New ] [ ▦ ] [ GitHub ]
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
- Icon tabs live in `.osubs-nav` (`position: sticky; top: 0`). They stay
  on screen while the settings scroller moves. Background is
  `--dsw-alias-bg-layer-2` (the panel). Bleed `24px` matches the host
  `.options` side padding so cards cannot peek in the gutter.
- Cards: 12px radius, 1px `--osubs-line`, 14×16 padding. Active uses
  `--osubs-edge` + `--osubs-fill`.
- Type: 13px UI, 12.5px emails. Tags (`osubs-tag`) for plan / in-use /
  Fast / 900K — small, not a second heading. About kv rows are one 13px
  face; OS is only `macOS` / `Windows` / `Linux` (no “本机”). Release
  time is `YYYY-MM-DD HH:mm:ss` in `Asia/Shanghai`, not UTC.
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
- Auto-release, auto-merge, or bump `package.json` / lockfile version.
  Bug fixes: open the PR and stop. The maintainer merges, bumps, and
  tags. One task → one PR.
- Add a family without `src/oauth/<id>/README.md`.
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
GLM uses a content-hash prefix (`user` / `x-session-id`); a 576-token remnant
after a leading-system splice is a **prefix break**, not a Grok affinity miss.
Antigravity hits are `cachedContentTokenCount`. Kiro hits are
`cacheReadInputTokens`.
`Error: tool call timed out after 30000ms` is `dsh-tool-fs-search`, not
this proxy — record it in `docs/error.md`, do not add `toolTimeoutMs` here.

## PR

- Keep `docs/error.md` in the same PR as the behavior change.
- Do not merge generated `lib/` that was hand-patched.
- Tests stay green on Node 22 (`npm test`).
- One task, one PR. Open it; do not squash-merge. Do not bump
  `package.json` (or the lockfile version), do not tag, and do not
  `gh release` unless the maintainer asked.
