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

## 新家族接入顺序（对抗审查定稿）

每个新 `<id>` 家族按 0→7 顺序执行；每步有出口门禁，不过门禁不进
下一步。`docs/oauth.md` 新家族是**文件清单**，本节是**顺序与理由**。

### 流水线

0. **归因（先于一切代码）** — 钉住一线客户端版本 + 社区对照，写进
   `docs/oauth.md` 总表。产出：登录方式（PKCE / 设备码 / CLI poll）、
   chat 端点与 wire 协议、缓存亲和字段、模型目录来源、quota 端点、
   UA / 指纹、「不要发明」清单。没有归因不动手写代码——后面每一步的
   「抄」都来自这里。
1. **登录 / session** — `<id>/index.ts` 端点 + flow + session builder +
   refresh + UA；`store.ts` `PROVIDER_IDS` / `accountIdOf` /
   `publicSession`；`controller.ts` login / cancel / logout / switch /
   import 分支。出口：session round-trip 测试过；opaque id 不外露。
2. **hop + cache（同一 PR，原子）** — `proxy.ts` `family === '<id>'`
   分支 + `<id>/cache.ts` + `<id>/request.ts` normalize。出口：cache
   隔离测试 + proxy 路由测试过。
3. **quota** — `quota.ts` 分支，cache key `provider\0accountId`；
   snapshot hydrate 每个已存账号。出口：`snapshot shows quota on every
   <id> account`。
4. **models** — 见下「模型参数 → 模型页」。
5. **UI** — `ui/client.ts` tab / 图标 / copy（zh+en）；`src/index.ts`
   re-export。
6. **测试** — `test/<id>.test.ts`：login parse、session round-trip、
   catalog、cache 隔离、proxy 路由、quota snapshot。
7. **活测 + 文档收口** — `npm run analyze` 看命中率；`docs/error.md`
   记活测结论；README 归因补齐。出口：活测结论落 error.md 才算完成。

### 第一步：先缓存还是先 OAuth？

都不是——第一步是归因（步骤 0）。在缓存与 OAuth 之间：**先登录，
hop 与 cache 同一 PR 原子落地，缓存命中率最后验证**。

- 先做缓存 = 写无法运行的死代码：cache 字段（`session-id` /
  `x-grok-conv-id` / `cascade_id` / 前缀拼接位置）由该家 wire 协议
  决定，没有 hop 就没有可验证的 cache。
- hop 做完再补缓存 = 重复犯过的故障：`Date.now()` 会话 id、别家缓存
  头串台、把 DSH `session_id` 原样发上游被 400。缓存是 wire 设计的
  一部分，不是事后优化。
- 所以：归因钉住缓存字段 → 登录 → hop+cache 同 PR →
  `npm run analyze` 活测命中率收口。

### 第二步：模型参数 → 模型页

「全部找到再渲染」拆成四段，每段有硬约束：

1. **找全（归因）**：`id` / `name` / `contextWindow` / `maxTokens` /
   `input` / `reasoningEfforts` 全部要有出处——钉住客户端的
   `models.json`、官方文档、或厂商目录端点（Cursor `GetUsableModels`、
   Devin `GetCliModelConfigs`），逐条记进家族 README。不发明数字；
   订阅后端不服务的模型不进目录（`gpt-5.3-codex` 先例）。
2. **静态目录**：`<id>/index.ts` `<ID>_MODELS`。`reasoningEfforts`
   键只用 DSH 闭集七值，厂商拼写进 value；`input` 只 `text`/`image`。
3. **接线**：`models.ts` `FAMILY_IDS` + `buildProviders` +
   `catalogProviders` + `familyOfProvider` 后缀；`controller.ts`
   snapshot / accounts 分支；有活目录的家族加 `<id>CatalogModels()`
   并在 login / import / 额度刷新 / `warmCatalogs` 时重 sync
   （Cursor / Devin 先例）。`api` 取闭集三值之一；`baseURL` 对齐该
   SDK 真实 post 路径（Completions 家 `…/<id>`，Anthropic / Responses
   按各家注释）；`compat` 只许 `openai-completions`。
4. **渲染**：`describeCatalog` → Settings 模型页（未登录也列出、
   锁定 +「登录后同步」）；`sync()` → `settings.yaml` `oauth-<id>`
   路由（只写已登录 + 已勾选）。变体：`-900k` 走
   `withPickerVariants` / `context-mode`（默认关）；`-fast` 只在该家
   有真 Fast 语义时加（Codex Priority / Cursor RequestedModel / Devin
   后端变体），没有就不发明。

### 对抗审查清单（每个新家族 PR 自答）

- [ ] `grep` 该家 diff：`Date.now()` / `randomUUID()` /
  `Math.random()` 不出现在会话 / 缓存 id 位置；缺 DSH id 时回退
  `dsh-<id>` 常量。
- [ ] DSH `session_id` 不原样发上游（Codex 是复制到
  `prompt_cache_key` 后 strip，不是透传）。
- [ ] `<id>/cache.ts` 不 import 别家 cache；`src/utils/` 没有新增
  缓存改写；对照仓的多家族共用层没有进树。
- [ ] 别家缓存头没写进本家请求（Codex `session-id` /
  `prompt_cache_key`、Grok `x-grok-conv-id` 不出现在 `<id>` 分支）。
- [ ] `api` / `reasoningEfforts` 键 / `compat` 没出闭集——
  `assertDshServiceableProvider` 是本地闸门，过了它才可能过宿主原子
  mutate。
- [ ] `familyOfProvider` 加了 `-<id>` 后缀，否则模型页归错家族。
- [ ] `publicSession` 不暴露 token / refresh / opaque account id。
- [ ] quota cache key 是 `provider\0accountId`；snapshot hydrate 每个
  已存账号，不只 active。
- [ ] 每个模型参数在 README 有出处；`catalogProviders` /
  `buildProviders` 该传的 `<id>Models` 都传了（漏传 = 活目录不进
  picker 的已犯故障）。
- [ ] 活测命中率与结论进了 `docs/error.md`；单测全绿不等于可合并。

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
