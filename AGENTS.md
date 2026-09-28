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
npm run build      # src/ → lib/（发布 / CI）
npm run dev-build  # build + 递增本地 dev 计数（日常开发；About 显示 0.0.105-dev.N）
npm test           # build + node:test (Node 22+)
npm run analyze -- path/to/session.jsonl
```

## 安装 / 测试 / 发布（对应插件面板三个入口）

插件面板「添加插件」认三种来源，本项目三种都要能装：

| 面板入口 | profile 里是什么 | 用途 | 改完怎么生效 |
|---|---|---|---|
| 本地插件目录（仓库绝对路径） | `link:<repo>` | 开发/测试首选；依赖走仓库自己的 `node_modules`（先 `npm install`） | `npm run dev-build` 后**热重载**（宿主半见下节 `hmr` 配置，UI 半自动替换）；About 的当前版本 = 递增的 `0.0.105-dev.N`（仓库清单仍是正式号） |
| GitHub 地址 `https://github.com/xxww0098/dsh-plugin-oauth-subs`（可加 `#v0.0.105`） | `github:…` | 验证「用户从仓库装发布版」 | 装的是仓库里**已提交**的 `lib/`；改代码要重新构建 + 提交才生效 |
| 包名 `dsh-plugin-oauth-subs` | registry | 发布后的常规安装 | 要求该包已在 npm（当前未发布，`npm view` 404）；`npm publish` 后可用 |

- 三种来源都要求 `dsh.bundle.patch`（`./cordis.patch.yml`）与可解析的 peer `@deepseek-ai/cordis`：面板在 pnpm 之前先校验，不通过不下载（git / tarball 是抓取后判定，失败会恢复 profile 清单与锁文件）。
- `lib/` 是仓库里构建好的，git / npm 安装**不会**重新构建——提交前必须 `npm run build`。
- 先确认在看哪个 profile：`ls -la ~/.dsh/profiles/*/node_modules/dsh-plugin-oauth-subs`（symlink = link 到本仓库；实体目录 = 安装副本）。web profile 默认就是 link。
- 插件自更新不会碰 link：`installedPackageDirs` 只认 `~/.dsh/profiles/` 下的真实副本（realpath 去重），指向仓库的 symlink 被跳过。
- 热链要在界面上认得出：`localUpdateInfo` 给出 `linked` / `linkedPath`（realpath 落在 `~/.dsh/profiles` 之外即热链）与 `devVersion`，About 的当前版本直接显示 `<版本>-dev.<n>`、另列本地路径、撤掉「安装更新」CTA；**自动更新开关保留**，但热链下 note 换成 `autoUpdateLinked`（「本地链接：npm run build 后热重载生效，无需重启宿主」，需 profile 配 hmr root）且不显示 release 结果——否则仓库正式号会被当成发布版报「已是最新」，并在热更新下继续承诺重启。

### 热重载（本地插件目录）

DSH 自带两半热重载，但宿主半默认**只监听配置**（base 组合包给 `hmr` 的 `root: []`），要监听源码得在 profile patch 里显式加一条：

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml
- id: hmr
  name: "@deepseek-ai/dsh-hmr"
  config:
    root:
      - /absolute/path/to/this/repo   # 热链仓库在 profile 之外，必须绝对路径
```

- 宿主半（`lib/**/*.js`）：`dsh-hmr` 监听 `root` 下的文件，命中已加载模块（realpath 匹配）就做模块替换 + 插件重载——`npm run build` 完即生效，**不用重启应用**；patch / 清单改动本身就由它监听，所以这条配置加进去也立刻生效。
- UI 半（`lib/ui/client.js`）：`dsh-client-hmr` 按 mtime/ctime/size 每 500ms 轮询每个 client entry，重建后自动替换进已打开的页面，**不用刷新页面**。
- 仍要重启的：换包版本（tgz / npm / GitHub 安装或更新——DSH 明说换包版本必须重启）、依赖或框架变化（HMR 走 `loader.exit()` 全量重启）、以及没配 `hmr` `root` 时的宿主半改动。
- 热重载会重建插件实例：内存里的 quota 缓存与 UI 组件状态会丢（会话 / 工作区不受影响）。

### 版本号

- **仓库 `package.json` 永远是正式版本号**，不改、不提交测试号——正式号只属于维护者的发布。
- 「本地插件目录」热链的清单号仍是仓库正式号（清单不许改），About 显示**派生版本** `<仓库版本>-dev.<n>`（`localUpdateInfo.devVersion`）：`n` 由 `npm run dev-build` 每次构建 +1，存在仓库根的 `.dev-build.json`（git-ignored，换正式号自动从 1 重数）；没有该文件时退回 `-dev`。工作树一眼区别于发布版，正式安装包 / 发布版照常显示自己的号（`0.0.105-test.1` / `0.0.105`）。
- 打**安装包**做本地安装测试（tgz / 验打包产物）时必须打测试版本号
  `<仓库版本>-test.<n>`（可带主题如 `0.0.105-go-quota`）；测试版 semver 低于同号正式版，
  About 卡会提示可更新到正式版（预期），`update-state.json` 与已安装 `package.json`
  能一眼看出装的是哪个测试号。
- `test/package-surface.test.ts` 挡三类事故：提交的版本号带 prerelease 后缀、
  `files` 列了不存在的路径、`dsh.bundle.patch` / 入口 `lib/index.js` / `lib/ui/client.js` 缺失。

### 打安装包做本地测试

```sh
npm run build

# 打测试版 tgz：版本号只改在临时副本里，仓库 package.json 不动
ver=$(node -p "require('./package.json').version")-test.1   # 或 -go-quota 标主题
tmp=$(mktemp -d); mkdir -p "$tmp/out"
rsync -a --exclude node_modules --exclude .git --exclude graft --exclude .DS_Store ./ "$tmp/pkg/"
(cd "$tmp/pkg" && npm version "$ver" --no-git-tag-version && npm pack --pack-destination "$tmp/out")
cp "$tmp/out/dsh-plugin-oauth-subs-$ver.tgz" ~/.dsh/local-packages/

# 装进 desktop profile（先备份清单）；装完必须确认是测试号
cd ~/.dsh/profiles/desktop
cp package.json "package.json.bak-$(date +%s)"; cp pnpm-lock.yaml "pnpm-lock.yaml.bak-$(date +%s)"
pnpm add "file:$HOME/.dsh/local-packages/dsh-plugin-oauth-subs-$ver.tgz"
node -p "require('./node_modules/dsh-plugin-oauth-subs/package.json').version"   # 0.0.105-test.1
```

装完**重启宿主**（宿主启动时加载 `lib/`）；回退 profile 清单用 `package.json.bak-*` / `pnpm-lock.yaml.bak-*`。
只改 UI 也一样（`lib/ui/client.js` 在包里）；重启后点对应家族的「刷新额度」再看。

### 活测

单测绿不等于装对了：从**实际在跑的那份**导入该家族模块，用真实凭据跑一遍。

```sh
node --input-type=module -e '
  const fs = await import("node:fs")
  const data = process.env.HOME + "/.dsh/profiles/desktop/data/dsh-plugin-oauth-subs"
  const entry = Object.values(JSON.parse(fs.readFileSync(data + "/opencode-go.json", "utf8")).accounts)[0]
  const mod = await import(process.env.HOME
    + "/.dsh/profiles/desktop/node_modules/dsh-plugin-oauth-subs/lib/apikey/opencode-go/quota.js")
  console.log(await mod.fetchOpencodeGoQuota(entry))'
```

换成该家族的 `<id>/quota.js`（或 `index.js` 里的 fetch）与对应 vault 文件；link 安装时该路径就是仓库。
真实凭据在 `~/.dsh/profiles/<profile>/data/dsh-plugin-oauth-subs/`（`auth.json` + 各家族 vault）。
`node` 不在 PATH 时用 DSH 运行时自带的 node（`~/.dsh/dsh-runtimes/*/dependencies/node/bin/node`）。

### 发布门禁（维护者）

1. `npm test` 全绿（构建 + 用例 + 安装面包表检查）。
2. 版本号是本次正式号（无 prerelease 后缀）；`docs/error.md` 与家族 README 已收口。
3. `npm run build` 后把 `lib/` 一起提交——GitHub 地址安装直接读仓库里的 `lib/`，不会重新构建。
4. `git tag vX.Y.Z` + GitHub Release（插件自更新读 tag 的源码包）；发布后至少用面板「GitHub 地址 + `#vX.Y.Z`」装一次冒烟。
5. 需要面板「包名」安装时 `npm publish`：`prepublishOnly` 会先跑 `npm test`。
6. 本地安装**不是**发版：不改仓库 `package.json` / lockfile、不打 tag、不 publish；
   测试号只活在打出来的 tgz 和 profile 里，正式号由维护者发布时使用。

## Index

- Source of truth per family — `src/oauth/<id>/README.md` (login, hop,
  models, quota, cache, do-not, 归因). Codex / Grok / GLM / Kiro /
  Antigravity / Cursor / Kimi / Copilot / Devin / Cline / Anthropic live in
  `src/oauth/`; Ollama Cloud + OpenCode Go live in `src/apikey/`.
- Fault log — `docs/error.md`. Every recurring fault or user-visible
  finding goes there **in the same PR** (≤12 lines: 现象/根因/修复).
- Hop references — `docs/oauth.md`. Official/community repos per family;
  update its table whenever a hop copies a new client or reverse.
- UI page rules — `design-system/MASTER.md` +
  `design-system/pages/settings-workbench.md` (page tabs, rail, cards,
  quota bars, dialogs). Entry is a `sidebar.panellist` glyph under the
  插件 rail button → a keyed `main` panel (not Settings); top nav is
  额度/模型/版本 `PageTab`s; families live in a left rail with 16px
  LobeHub marks inlined in `TAB_ICONS` (sourcing rules →
  settings-workbench.md Rail icons); one stored session = one
  `AccountCard`; quota bars are remaining-bars; model toggles are
  `Switch` rows; add-account chrome is a centered Dialog.

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
   re-export。图标从哪来、`d`/`raw`/tint 怎么选 →
   `design-system/pages/settings-workbench.md` Rail icons。
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
   `catalogProviders` + `familyOfProvider` 后缀 + `HARNESS_MODEL_AGENT`
   agent 名；`controller.ts`
   snapshot / accounts 分支；有活目录的家族加 `<id>CatalogModels()`
   并在 login / import / 额度刷新 / `warmCatalogs` 时重 sync
   （Cursor / Devin 先例）。`api` 取闭集三值之一；`baseURL` 对齐该
   SDK 真实 post 路径（Completions 家 `…/<id>`，Anthropic / Responses
   按各家注释）；`compat` 只许 `openai-completions`。
4. **渲染**：`describeCatalog` → Settings 模型页（未登录也列出、
   锁定 +「登录后同步」，行名仍是美化 `name`）；`sync()` →
   `settings.yaml` `oauth-<id>` 路由（只写已登录 + 已勾选，行 `name`
   落 `<agent>/<id>` 别名）。变体：`-900k` 走
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
- [ ] `HARNESS_MODEL_AGENT` 有 `<id>` 条目且与 UI `FAMILY_NAME` 同
  名——漏了 settings.yaml 别名退回裸 provider id。
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
