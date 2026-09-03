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
is written to [`docs/error.md`](docs/error.md) **in the same PR** as the
behavior change. Do not leave a new failure mode only in chat, a commit
message, or a code comment.

Each new incident is **≤12 lines**: one `## YYYY-MM-DD：short title`
(newest first; same root cause → one heading) and only **现象** / **根因** /
**修复** (1–2 lines each). No 证据 or 验证 subsections.

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
    cursor/                Cursor subscription (Connect/protobuf)
      README.md            family design: login, chat, quota, cache (traceable)
      index.ts             catalog, identity, PKCE poll, CLI fingerprint, refresh
      pkce-flow.ts         loginDeepControl + auth/poll
      import.ts            Keychain / IDE state.vscdb / CURSOR_ACCESS_TOKEN
      refresh-guard.ts     known-bad refresh backoff
      request.ts           OpenAI chat ↔ AgentService/Run
      cache.ts             conversationId (never Date.now())
      proto.ts             minimal Connect/protobuf subset
      h2-session.ts        Node http2 in-process transport
    ollama/                Ollama Cloud (ollama.com API key — not localhost:11434)
      README.md            family design: login, chat, quota, cache (traceable)
      index.ts             catalog, identity, API key session, Bearer headers
      import.ts            OLLAMA_API_KEY env (not ollama signin)
      catalog.ts           live GET /api/tags; static fallback
      cache.ts             strip Codex/Grok fields; no sticky id (non-fix)
    kimi/                  Moonshot Kimi Code Plan (device-code)
      README.md            family design: login, chat, quota, cache (traceable)
      index.ts             catalog, identity, device endpoints, X-Msh headers
      import.ts            ~/.kimi-code/credentials/kimi-code.json + KIMI_API_KEY
      catalog.ts           live GET /coding/v1/models; static fallback
      request.ts           Completions thinking / thinking.effort
      cache.ts             prefix-hash; strip Codex/Grok fields
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
design-system/             Settings workbench design (MASTER + page overrides)
test/                      node:test TypeScript, import compiled lib/
scripts/                   CLI (TypeScript)
```

Rules:

- Codex-only code → `src/oauth/codex/`. Grok-only code → `src/oauth/grok/`. GLM-only code → `src/oauth/glm/`. Kiro-only code → `src/oauth/kiro/`. Antigravity-only code → `src/oauth/antigravity/`. Cursor-only code → `src/oauth/cursor/`. Ollama-only code → `src/oauth/ollama/`. Kimi-only code → `src/oauth/kimi/`.
- **Each family has `README.md`.** Login, session, chat hop, models, quota, and cache for that vendor are written there so a later change can be traced to files and to `docs/error.md`. Cross-family rules stay in this file; do not let family READMEs contradict it.
- **Cache is per family.** Each `src/oauth/<id>/cache.ts` owns that vendor's prompt-cache identity, headers, and prefix pin. Do not import Codex cache helpers from Grok / GLM / Kiro / Antigravity / Cursor / Ollama / Kimi. Do not share a `codexCacheSessionId` in `src/utils/`. `proxy.ts` only dispatches.
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
  constant** owned by that family (`dsh-antigravity`, `dsh-kiro`, `dsh-cursor`, `dsh-ollama`, `dsh-kimi`, …).
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
  `kiroConversationId`, `applyOllamaCache`, `applyKimiCache`).
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

Codex:     prompt_cache_key + headers session-id / x-client-request-id; drop session_id
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
           (never between assistant toolUses and matching toolResults)
Cursor:    conversationId on AgentRunRequest (fallback `dsh-cursor:<model>`)
           drop Codex/Grok cache fields
           first system pinned in root_prompt_messages_json; extras as extra system blobs
Ollama:    drop Codex/Grok cache fields; no sticky conversation id (non-fix)
Kimi:      drop Codex/Grok cache fields; prefix-hash; extra system at messages suffix
```

### Per family

**Codex** (`src/oauth/codex/cache.ts` + prefix lift in `request.ts`)

- Backend matches the longest stable prefix of top-level `instructions`
  then `input`. Extra leading `developer` / `system` in `input` (plan
  dumps, header rebuilds) must not stay at the front.
- Sticky: `session-id` = `x-client-request-id` = `prompt_cache_key`.
- Strip DSH `session_id` after copying onto `prompt_cache_key` (chatgpt.com `Unsupported parameter`).
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
- Round-trip Gemini `thoughtSignature` on **functionCall parts**
  (`request.ts`). OpenAI `tool_calls` carry extra keys; a per-session
  map reattaches if DSH strips them. Do not invent a dummy / empty
  signature. Thought-only parts stay out of visible text.
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
  become another user+ack pair at the **history suffix**. Never insert
  that pair between an assistant `toolUses` and the matching
  `toolResults` (splice before the unpaired trailing assistant).
- Tools stay on current `userInputMessageContext.tools` (not a
  conversationState-level field).
- Hits: `cacheReadInputTokens` → OpenAI `prompt_tokens_details.cached_tokens`.
- No Codex `prompt_cache_key`, no Grok `x-grok-conv-id`, no Gemini
  `systemInstruction` field.

**Cursor** (`src/oauth/cursor/cache.ts` + Run hop in `request.ts`)

- Cursor Agent conversation. Sticky: `AgentRunRequest.conversation_id`
  = DSH pin **plus model id**. Fallback `dsh-cursor:<model>` (bare
  `dsh-cursor` only when model is unknown). Never `Date.now()`.
- System lives in `conversationState.root_prompt_messages_json` blobs.
  Pin the first system text per conversationId; extra DSH snapshots
  become another system blob in that list (Cursor prefix), not a GLM
  trailing system or a Gemini trailing user.
- No Codex `prompt_cache_key` / `session-id`, no Grok `x-grok-conv-id`.
- Hits: Run has no documented cache-read field. Map one if the wire
  grows one; otherwise DSH hit rate may stay 0%.

**Ollama** (`src/oauth/ollama/cache.ts`)

- Ollama Cloud `/v1/chat/completions` has no documented conversation /
  shard / cache-read field. Do **not** invent `cached_tokens` or a sticky
  id. `applyOllamaCache` only strips Codex/Grok fields.
- Fallback constant `dsh-ollama` is analyzer-only; it is **not** written
  upstream. Never `Date.now()`.
- No Codex `session-id` / `prompt_cache_key`, no Grok `x-grok-conv-id`.
- Hits: none documented. DSH hit rate stays 0%.

**Kimi** (`src/oauth/kimi/cache.ts` + thinking in `request.ts`)

- Coding Plan is an implicit **prefix hash** of leading system + history.
  There is **no** shard key. https://platform.moonshot.cn (Kimi Code).
- `applyKimiCache` strips `prompt_cache_key` / `session_id` / retention.
  Pin the first leading `system` run per DSH session; extra snapshots
  go at the **messages suffix** (Completions shape, not Gemini user).
- Fallback constant `dsh-kimi` is analyzer-only; it is **not** written
  upstream. Never `Date.now()`.
- No Codex `session-id` / `prompt_cache_key`, no Grok `x-grok-conv-id`.
- Hits: none documented on Completions (`cached_tokens` if a field appears).

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
| Codex | prefix of `instructions` then `input` | `session-id` + `x-client-request-id` = `prompt_cache_key`; drop DSH `session_id` | developer at **input suffix** | `cacheReadTokens` |
| Grok | conversation shard | `x-grok-conv-id` (+ body `prompt_cache_key`) | n/a (shard, not prefix) | `cacheReadTokens`; 512 + reuse<10% = affinity miss |
| GLM | content hash of leading system + history | Anthropic: `metadata.user_id` + `x-session-id` + first-block `cache_control`; Completions leftover: `user` + `x-session-id` | Completions: system at **messages suffix**; Anthropic: extra system text blocks without cache_control | `cached_tokens` / `cache_read_input_tokens` |
| Antigravity | Gemini `systemInstruction` + contents + tools | `request.sessionId` (fallback + model) | extra as trailing **user** | `cachedContentTokenCount` / `cache_read_tokens` → `cached_tokens` |
| Kiro | CodeWhisperer conversation | `conversationId` + model | system as first history user+ack; extra at history suffix (not between toolUses / toolResults) | `cacheReadInputTokens` → `cached_tokens` |
| Cursor | Agent conversation (`conversation_id`) | `conversationId` + model; fallback `dsh-cursor:<model>` | extra DSH snapshots as extra `root_prompt_messages_json` system blobs | none documented on Run (`cached_tokens` if a field appears) |
| Ollama | none documented | no sticky conversation id (non-fix); `dsh-ollama` analyzer-only | n/a | none documented (`cached_tokens` if a field appears) |
| Kimi | prefix hash of leading system + history | no shard key; `dsh-kimi` analyzer-only | extra system at **messages suffix** | none documented (`cached_tokens` if a field appears) |

### Do not

- Share one sanitizer / pin map / header helper across families.
- Write Codex `session-id` or `prompt_cache_key` to GLM / Kiro / Antigravity / Cursor / Ollama / Kimi.
- Write Grok `x-grok-conv-id` to anyone else.
- Park GLM extras as a Gemini user turn, or Gemini extras as a GLM
  trailing system, “because parking is the same idea”.
- Insert a Kiro extra system user+ack between an assistant `toolUses`
  and the matching `toolResults`.
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
| Cursor | `openai-completions` | Native is Connect/protobuf `AgentService/Run` | Completions adapter `POST /cursor/v1/chat/completions` |
| Ollama | `openai-completions` | Native is `/api/chat`. Cloud also serves OpenAI `https://ollama.com/v1/chat/completions` (401 without Bearer; Factory docs use that `/v1`). | thin passthrough `POST /ollama/v1/chat/completions` → `https://ollama.com/v1/chat/completions` |
| Kimi | `openai-completions` | Kimi Code Plan default is OpenAI Completions at `api.kimi.com/coding/v1`. Do **not** invent `kimi-openai-completions`. | thin hop `POST /kimi/v1/chat/completions` → `https://api.kimi.com/coding/v1/chat/completions` |

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
- Switch Kiro / Antigravity / Cursor / Ollama / Kimi to Responses or Anthropic (native is still
  none of the three for Kiro/AG/Cursor; Kimi's Coding Plan default is Completions).
  Do not pick Responses for Ollama because local `localhost:11434/v1/responses` exists.
  Do not invent `kimi-openai-completions`.
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

A family is one top-level tab (Codex / Grok / GLM / Kiro / Antigravity / Cursor / Ollama / Kimi today) plus its own
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
8. **Proxy / tokens / cache**: all eight families chat through the local
   proxy. Pick `api` per the protocol section. Prompt cache **must** be
   a new `src/oauth/<id>/cache.ts`. Do not import another family's cache
   helper, and do not revive `src/utils/cache-session.ts`.
   Cursor Keychain / `state.vscdb` / `CURSOR_ACCESS_TOKEN` import is
   **user-owned local login reuse**, not a second OAuth. Auto-import
   only when the cursor roster is empty. Never silently overwrite a
   stored PKCE/session. Never scan sibling OS profiles.
   Ollama `OLLAMA_API_KEY` env import is the documented programmatic
   path. Auto-import only when the ollama roster is empty. `ollama
   signin` is local-daemon SSH signing — not a Bearer we can hop.
   Kimi `kimi-code.json` import is official CLI reuse (plus optional
   `KIMI_API_KEY`). Auto-import only the CLI json when the kimi roster
   is empty. Never overwrite a stored session. Never write back to
   `~/.kimi-code`.
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
- Order: families first (Codex, Grok, GLM, Kiro, Antigravity, Cursor, Ollama, Kimi), then
  Models, then About (GitHub icon). Insert a new family **before**
  Models. Layout is **8 icons per row** (`.osubs-tabs` 8-column 36px grid);
  eight families fill row 1; Models + About wrap to row 2. Do not pack
  every tab on one flex row. Do not `flex: 1 1 0` or shrink tab
  `min-width` to 0.
- Add `COPY.zh.<id>Title` / `COPY.en.<id>Title` for the hover string and
  the page heading.

```text
[ Codex ] [ Grok ] [ Z.ai ] [ Kiro ] [ Antigravity ] [ Cursor ] [ Ollama ] [ Kimi ]
[ ▦ ] [ GitHub ]
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

The bar is a **remaining** bar (`remainingPercent`, 100% → 0%). Fill width
and caption are the leftover share. Copy is `剩余 {n}%` / `{n}% left`.

Workbench tokens and overlay rules: [`design-system/MASTER.md`](design-system/MASTER.md).
Settings-only deviations: [`design-system/pages/settings-workbench.md`](design-system/pages/settings-workbench.md).

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
- **Quota bars are remaining bars.** `QuotaRow` fill and caption use
  `remainingPercent`. If the API only gives used%, convert
  `remaining = 100 - used` for the bar. Never caption a bar `已用` /
  `% used`. Cursor product rows must not special-case `showUsed`.
  Amounts like `used / total` may stay as secondary text when they are
  real units; the bar itself is remaining.
- **Bar color tracks remaining** via `quotaTone`: remaining `>40` ok,
  `≤40` warn, `≤15` bad (`--osubs-ok` / `--osubs-warn` / `--osubs-bad`).
  Do not color by family. Do not use a single always-green bar.
- **Head row:** human title is email (`account`); opaque ids are a
  separate identity bug (PRs #80 GLM, in-flight Cursor) — do not regress,
  do not block on those PRs. Plan tag · in-use tag · optional region tag
  sit **after** the email. Do **not** prefix `套餐` / `Plan`. Do **not**
  put the plan on its own row.
- **Chips stay one line.** `.osubs-tag` is `white-space: nowrap`. Show
  the full value; do not wrap a chip and do not hide it behind `title`
  only.
- **No helper copy** under the family title. Heading is the title + a
  status pill (`未登录` / `已登录` / `等待授权…`). No
  “每个账号一张卡片…” paragraph.
- **Add-account chrome is a centered Dialog**, not a row of extra
  buttons under the cards and not a side sheet. Empty roster: one
  primary CTA opens the dialog. Logged-in: “添加账号” opens the same
  dialog. GLM Z.ai vs BigModel, Kiro Social/IdC/import, Grok device vs
  PKCE, Cursor import, paste/API-key/manual flows live **inside** the
  dialog. Destructive still uses the existing confirm dialog
  (`.osubs-dsw*` / `WarnDialog`). Reuse that centered pattern; never
  Sheet / Drawer. `cursor-pointer` on clickable controls; visible
  focus; Escape / overlay click closes non-destructive dialogs.

### Settings — design details

- Inherit the host theme. Colors are `currentColor` mixes
  (`--osubs-line` 16%, `--osubs-fill` 6%, `--osubs-muted` 66%). B2B
  slate (`#0F172A` / `#334155`) is accent **intent** only — do not
  hardcode a light-theme gray page. Optional `backdrop-blur-xs` only on
  the centered Dialog overlay. No glassmorphism on the shell.
- Icon tabs live in `.osubs-nav` (`position: sticky; top: 0`). They stay
  on screen while the settings scroller moves. Background is
  `--dsw-alias-bg-layer-2` (the panel). Bleed `24px` matches the host
  `.options` side padding so cards cannot peek in the gutter.
  `.osubs-tabs` is an 8-column 36px grid (`repeat(8, 36px)`); ten tabs
  wrap — row 1 is the eight families, row 2 is Models + About. Never
  `flex: 1 1 0` / `min-width: 0` on the tab cells.
- Cards: 12px radius, 1px `--osubs-line`, 14×16 padding. Active uses
  `--osubs-edge` + `--osubs-fill`.
- Type: host UI sans (Inter-class), 13px UI, 12.5px emails. No display
  serif. Tags (`osubs-tag`) for plan / in-use / Fast / 900K — small, not
  a second heading. About kv rows are one 13px face; OS is only
  `macOS` / `Windows` / `Linux` (no “本机”). Release time is
  `YYYY-MM-DD HH:mm:ss` in `Asia/Shanghai`, not UTC.
- Icons are inline SVG (LobeHub mono paths / existing `IconClose` /
  `IconWarning`). Do not use emoji as UI marks.
- Model picker: family name + `已开启 n / m`. **No 文本 / 图文 tags.**
  Checkboxes and All/None stay **disabled until that family is signed
  in**.
- A new family gets one primary CTA that opens the add-account dialog
  unless it truly has two official OAuth sites. Extra methods (GLM
  Z.ai / BigModel, Kiro Social / IdC / import, Grok device / PKCE,
  Cursor import) stay **inside** that dialog, not as extra buttons on
  the card.

### Do not

- Merge two vendors into one tab because the icons are similar.
- Show quota only on the active card.
- Caption a quota bar as used (`已用` / `% used`) or color it by family.
- Put add-account / extra login chrome in a side sheet, drawer, or a
  permanent button row under the cards.
- npm-install a React icon package or shadcn into the classic-script UI.
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
`cacheReadInputTokens`. Cursor sticky-routes on `conversation_id`;
Run has no documented cache-read field.
Ollama Cloud has no documented cache-read or conversation id; do not invent one.
Kimi Code is prefix-hash only; strip Codex/Grok fields and park extra system at the messages suffix. Do not invent a shard id.
`Error: tool call timed out after 30000ms` is `dsh-tool-fs-search`, not
this proxy — record it in `docs/error.md`, do not add `toolTimeoutMs` here.

## PR

- Keep `docs/error.md` in the same PR as the behavior change.
- Do not merge generated `lib/` that was hand-patched.
- Tests stay green on Node 22 (`npm test`).
- One task, one PR. Open it; do not squash-merge. Do not bump
  `package.json` (or the lockfile version), do not tag, and do not
  `gh release` unless the maintainer asked.
