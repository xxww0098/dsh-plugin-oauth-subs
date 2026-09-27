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

## 本地安装与发布

插件面板「添加插件」认三种来源（包名 / GitHub 地址 / 本地目录），本仓库三种都要能装；完整流程与版本号规则见 [AGENTS.md](AGENTS.md) 的「安装 / 测试 / 发布」一节：

- **开发/测试**：面板选「本地插件目录」填本仓库绝对路径（profile 里落成 `link:`），日常用 `npm run dev-build`（build + 递增 `.dev-build.json` 计数，About 显示 `0.0.105-dev.N`）；配好 profile 的 `hmr` 后构建即热重载，不用重启宿主；依赖走仓库自己的 `node_modules`（先 `npm install`）。
- **验证发布版**：填 GitHub 地址（可加 `#vX.Y.Z`）——装的是仓库里**已提交**的 `lib/`，不会重新构建，所以构建产物必须随源码提交。
- **安装包测试**：本地打 tgz 验证打包产物时必须用测试版本号 `<仓库版本>-test.<n>`；仓库 `package.json` 永远是正式号（`test/package-surface.test.ts` 会把关）。
- **发布门禁（维护者）**：`npm test` 全绿 → 提交 `lib/` → `git tag vX.Y.Z` + GitHub Release → 需要面板「包名」安装时 `npm publish`（`prepublishOnly` 会先跑 `npm test`）。

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
