# 开发、安装与发布

构建、热重载、版本号、本地安装测试、活测与发布门禁。本文件与 [`AGENTS.md`](../AGENTS.md) 同等约束。测试与类型检查的细则见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)。

## Stack

- Host: TypeScript only under `src/` (no new `.js`). Compiled to `lib/` via
  `npm run build` — never hand-edit `lib/`.
- Settings UI: React classic-script factory. `src/ui/client.ts` is the
  `__ModuleLoader__.load` shell; each `//@part <name>` line is replaced by
  `src/ui/parts/<name>.ts` (`scripts/ui-bundle.ts` → `.ui-build/client.ts`, one
  shared closure, one `lib/ui/client.js`, `tsc -p tsconfig.ui.json`). UI tests
  read `assembleUi()`, not the shell. `createElement` + hooks, `require('react')`.
  No Vue/Svelte/raw DOM; no React in the host half.
- Tests/scripts: TypeScript, `node --experimental-strip-types` (`test/`,
  `scripts/`). Tests import the compiled `lib/`.

## Commands

```sh
npm run build      # src/ → lib/（发布 / CI）
npm run dev-build  # build + 递增本地 dev 计数（日常开发；About 显示 0.0.105-dev.N）
npm test           # build + node:test (Node 22+)
npm run analyze -- path/to/session.jsonl
npm run models     # 模型目录对照各家接口（干跑；--write 写回）→ docs/models.md
npm run rates      # 模型页价格表对照各家价目源（干跑；--write 写回）→ docs/models.md 费率表
```

## 安装来源（对应插件面板三个入口）

插件面板「添加插件」认三种来源，本项目三种都要能装：

| 面板入口 | profile 里是什么 | 用途 | 改完怎么生效 |
|---|---|---|---|
| 本地插件目录（仓库绝对路径） | `link:<repo>` | 开发/测试首选；依赖走仓库自己的 `node_modules`（先 `npm install`） | `npm run dev-build` 后**热重载**（宿主半见下节 `hmr` 配置，UI 半自动替换）；About 的当前版本 = 递增的 `0.0.105-dev.N`（仓库清单仍是正式号） |
| GitHub 地址 `https://github.com/xxww0098/dsh-plugin-oauth-subs`（可加 `#v0.0.105`） | `github:…` | 验证「用户从仓库装发布版」 | 装的是仓库里**已提交**的 `lib/`；改代码要重新构建 + 提交才生效 |
| 包名 `dsh-plugin-oauth-subs` | registry | 发布后的常规安装 | 要求该包已在 npm（当前未发布，`npm view` 404）；`npm publish` 后可用 |

- 三种来源都要求 `dsh.bundle.patch`（`./cordis.patch.yml`）与可解析的 peer `@deepseek-ai/cordis`：面板在 pnpm 之前先校验，不通过不下载（git / tarball 是抓取后判定，失败会恢复 profile 清单与锁文件）。
- `lib/` 是仓库里构建好的，git / npm 安装**不会**重新构建——提交前必须 `npm run build`；CI 先删掉 `lib/` 再 `npm test`，之后检查 `git status -- lib` 是否干净，不干净（含删了 src 却留着 lib）即失败。
- 先确认在看哪个 profile：`ls -la ~/.dsh/profiles/*/node_modules/dsh-plugin-oauth-subs`（symlink = link 到本仓库；实体目录 = 安装副本）。web profile 默认就是 link。
- 插件自更新不会碰 link：`installedPackageDirs` 只认 `~/.dsh/profiles/` 下的真实副本（realpath 去重），指向仓库的 symlink 被跳过。
- 热链在版本页要认得出：`localUpdateInfo` 给出 `linked` / `linkedPath`（realpath 落在 `~/.dsh/profiles` 之外即热链）与 `devVersion`；热链下不显示「安装更新」、不报 release 结果、不承诺重启——否则仓库正式号会被当成发布版报「已是最新」。版本卡怎么显示见 [`design-system/pages/settings-workbench.md`](../design-system/pages/settings-workbench.md) Version card。

## 热重载（本地插件目录）

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

## 版本号

- **仓库 `package.json` 永远是正式版本号**，不改、不提交测试号——正式号只属于维护者的发布。
- 「本地插件目录」热链的清单号仍是仓库正式号（清单不许改），About 显示**派生版本** `<仓库版本>-dev.<n>`（`localUpdateInfo.devVersion`）：`n` 由 `npm run dev-build` 每次构建 +1，存在仓库根的 `.dev-build.json`（git-ignored，换正式号自动从 1 重数）；没有该文件时退回 `-dev`。工作树一眼区别于发布版，正式安装包 / 发布版照常显示自己的号（`0.0.105-test.1` / `0.0.105`）。
- 打**安装包**做本地安装测试（tgz / 验打包产物）时必须打测试版本号
  `<仓库版本>-test.<n>`（可带主题如 `0.0.105-go-quota`）；测试版 semver 低于同号正式版，
  About 卡会提示可更新到正式版（预期），`update-state.json` 与已安装 `package.json`
  能一眼看出装的是哪个测试号。
- `test/package-surface.test.ts` 挡住安装面的事故：提交的版本号带 prerelease 后缀、`files` 或入口缺失。

## 打安装包做本地测试

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

## 活测

单测绿不等于装对了：从**实际在跑的那份**导入该家族模块，用真实凭据跑一遍。

已有现成脚本的家族直接跑（只读：不刷新令牌、不写 store，请求极小但真实，会花一点额度）：

```sh
npm run build && npm run live -- cursor,kiro   # 可加 --profile / --account N / --timeout 90
```

它经真实代理走完 Cursor 记忆 / 并行 tool call / 图片与 Kiro 图片 / effort 档位；新增家族的检查往 `scripts/live-smoke.ts` 的 `CHECKS` 加一项。下面是没有脚本时的手写做法。

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
真实凭据在 `~/.dsh/profiles/<profile>/data/dsh-plugin-oauth-subs/`（`auth.json` + 各家族 vault；同目录的 `quota-snapshot.json` 是额度读数的落盘缓存，可随时删）。
`node` 不在 PATH 时用 DSH 运行时自带的 node（`~/.dsh/dsh-runtimes/*/dependencies/node/bin/node`）。

## 发布门禁（维护者）

1. `npm test` 全绿（构建 + 用例 + 安装面包表检查）。
2. 版本号是本次正式号（无 prerelease 后缀）；`docs/error.md` 与家族 README 已收口。
3. `npm run build` 后把 `lib/` 一起提交——GitHub 地址安装直接读仓库里的 `lib/`，不会重新构建。
4. `git tag vX.Y.Z` + GitHub Release（插件自更新读 tag 的源码包）；发布后至少用面板「GitHub 地址 + `#vX.Y.Z`」装一次冒烟。
5. 需要面板「包名」安装时 `npm publish`：`prepublishOnly` 会先跑 `npm test`。
6. 本地安装不是发版：测试号只活在打出来的 tgz 和 profile 里（见上「版本号」）。
