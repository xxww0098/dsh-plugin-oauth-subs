# 跨家族硬规则

每个家族都要守的规则；违反任一条都不能合并。本文件与 [`AGENTS.md`](../AGENTS.md) 同等约束。单个家族的例外与理由写在该家 README。

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
  README. Route `maxTokens` is a per-request budget, not the vendor cap:
  `toHarnessModel` clamps it to `HARNESS_REQUEST_MAX_TOKENS` (32768) because
  the host reserves it against the window for compaction pressure; the real
  cap stays on the family catalog row.
- settings.yaml `name` is the picker's model alias — always `<agent>/<id>`
  (`harnessModelAlias` + `HARNESS_MODEL_AGENT`, mirroring the UI
  `FAMILY_NAME`; e.g. `OpenCode Go/deepseek-v4.1-flash`). The host shows
  it without the provider group, so the alias must name the family.
  Catalog rows keep the pretty `name` for the plugin's own Models page —
  adding a model row never touches the alias; any new route writer applies
  the same helper at its write seam.
- 路由 `displayName`（宿主「设置 → 模型」列表行名）一律 `Subs · <家族名> · <协议>`：
  协议段由该路由 DSH `api` 推导——`openai-completions` → `Chat`、
  `openai-responses` → `Responses`、`anthropic-messages` → `Anthropic`。
  OAuth 家族写在 `src/oauth/models.ts` `buildProviders`，OpenCode Go 写在
  `src/apikey/opencode-go/models.ts` 的两条自有路由上；同一前缀 `Subs`
  不暗示登录方式（Go / Command Code 仍是 API key 直连）。协议段不是厂商
  品牌：GLM 是 `Subs · GLM · Anthropic`，不是 `Subs · GLM`。
- Public sessions never expose tokens, refresh secrets, or opaque account
  ids (`user-…`, `devin-team$…`).
- Adding a family lands in one PR; order, gates and file checklist are in
  [`docs/new-family.md`](new-family.md).
- Never merge generated `lib/` that was hand-patched. One task → one PR;
  never bump `package.json`/lockfile, tag, or release — the maintainer
  does.
