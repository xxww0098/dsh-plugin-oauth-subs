# Settings workbench — page override

Applies only to the OAuth workbench (`src/ui/client.ts` + `src/ui/parts/`).
Shell geometry, theme, remaining-bar colors, and dialog chrome live in
[`../MASTER.md`](../MASTER.md). This file owns what each region renders.

No hero, no feature grid, no glass CTA slab.

## Tabs and rail

Tabs: 额度 / 模型 / 用量 / 榜单 / 设置. Switching swaps the pane. The top
bar and the rail stay put.

The family rail shows on 额度, 模型, and 用量: 全部, then `FAMILY_ORDER`.
榜单 and 设置 are full-width. 用量 appends a usage-only **DeepSeek** entry
after the families (host `deepseek-official` / `deepseek-account`; no quota
card, no model rows). Leaving 用量 clears that scope back to 全部.

Every rail row carries a models-on mark: a miniature switch drawn in its on
state (knob right) plus that family's switched-on model count, in the same
right-aligned tail as the view's own count (额度 = accounts, 模型 = models,
用量 = models in use). Hover reads `已启用 3 / 12 个模型`. Nothing renders at
zero, so an unmarked row means nothing is on; a signed-out family never
counts, and a switch flip shows at once (the same optimistic override the
switch uses). The mark is the rail's only green — the fill a 模型 switch
shows when it is on — while the count behind it stays faint ink.

Both numbers sit in fixed slots in one right-aligned tail: the switch glyph
starts at the same x on every row (its digits hang right) and the count
keeps a right-aligned `min-width` slot, so a 1-to-3-digit number never
moves the column beside it. Aligned columns are the point — a mark that
floats with the neighbouring number's width reads as broken. The rail is
228px wide so the longest names (Command Code, OpenCode Go) stay whole
beside the two columns.

One primary CTA opens the centered Dialog.

## 模型

One searchable table. Model name and tag chips on the left, `Switch` on
the right. Family group headers appear only when more than one group is
shown. The pane, toolbar, and column head stay fixed
(`osubs-pane-panel--fill`); only `.osubs-mtable` scrolls, and the column
head is sticky.

Logged-out groups stay listed: locked switches, `登录后同步`, and a 登录
jump to that family's 额度 card. A family that signed in here and is still
waiting for its pick is all-off on purpose. It shows `登录后默认不勾选`
(登录默认; [`docs/models.md`](../../docs/models.md)) beside `0 / N`, not an
error state.

Context window:

- Every row has one window tag (`osubs-tag--ctx`). Customized rows use the
  accent `--custom` tint. No context-variant rows.
- The tag opens a centered Dialog: family mark + model name, a stat strip
  (当前 only when customized / 目录默认 / 上限), a mono k/m input, and a
  0…ceiling slider (`role="slider"`).
- The slider fill follows the draft: accent while editing, bad when out of
  range. Dragging the track or using arrow keys writes the draft as k/m
  shorthand at a 1K step. Round-size presets that fit the range are
  buttons (dot on the track, label in the ends row) and fill the draft
  directly. The catalog default is a tick, not a node.
- 保存 disables when the draft matches the saved value. Typing the default
  folds into 恢复默认. That control is an outline icon+label button at the
  footer's left edge. It stages the default into the draft whenever the
  draft is not already the default, and applying folds into the same reset.
  Its tooltip names the value it restores.
- When any row is customized, the toolbar grows 恢复默认窗口.
- Locked families and switched-off rows keep editable windows. The override
  persists to `models.json` and lands in the route only when the row is
  enabled. A dormant edit does not rewrite settings.

Price tag: a row whose family has a `rates.json` table carries a coin tag
(`osubs-ptag`, focusable like the window tag). Hover or focus opens
`osubs-rtip` with USD-per-1M-token lines: uncached input, output, cache-hit
read; cache-write only when priced; peak-band lines under a separator when
the row has `tod` (footnote: shared effectiveFrom + UTC peak windows);
over-threshold tier rows when `tierThreshold` is set.

默认档位 sits in the toolbar: a native `select` (不设置 + DSH level names
Off…Max), styled like the search field. It edits the families in the rail
scope. 全部 writes and unifies every family. One family writes only itself.
Differing values read 混合. The pick shows at once (optimistic, like the
switches) while the route rewrite waits on the host reconcile. Rules:
[`docs/models.md`](../../docs/models.md) 默认档位.

## 用量

One card, no in-card title (the tab names it).

- Head, left: 更新于 HH:MM, 刷新, 分享. Head, right: 今天 / 7 天 / 30 天.
  今天 is 24 hourly bars. The first open defaults to 今天; later opens
  restore the last choice.
- Stat strip (`osubs-ustats`, four cards, always one row; 2×2 under
  560px):
  - Token = 输入 + 输出. 输入 is the whole prompt (uncached + 缓存读 +
    缓存写), the host session total the user reconciles against.
  - 缓存读 is a subset of 输入, with 命中率. The rate counts only calls
    whose usage carries a cache field. A family that reports none (Kiro)
    reads 「—」 / 上游未报告缓存, never 0%.
  - 调用, with 次失败 (attempts that failed and were not retried).
  - 估算成本: `≈$…` from `rates.json` at read time. An estimate, not a
    bill. Models without a rate row are left out and named as 「x/y
    模型有价目」. `$0` is a price and shows as priced.

  No 首字延迟 card: mean step-start → first frame and output tok/s are per
  call, not per range (one burst reply averages the range's number down and
  says nothing about speed). They ride each 按模型 row's sub line over calls
  that streamed ≥ 1 s, where the calls behind the mean sit in the same
  line.
- Bars stack output on input in two tones of the accent. No legend and no
  vendor tints. The stat sub-line and the bar tooltip name the tones.
  Hover or focus a bar for 输入 / 输出 / 缓存读 / 调用 in an `osubs-rtip`.
  估算 rides along when the bucket priced above $0.
- Table head: 按模型 / 按会话. The toggle is `data-noshot`. The head label
  shows the active mode and its count.
  - 按模型: mark (family name on hover) + model; sub line (calls ·
    failures · TTFT · tok/s · ≈$ when priced); share bar; tokens with
    share% below.
  - 按会话: 最近写入时间 (file mtime, `M/d HH:MM`) and an 8-char id chip.
    Click copies the full session id. The chip, the copy, and the full id
    stay out of the shared image; the full id sits in the chip's `title`.
    Sub line: top models, `另 N 个` when more, calls, failures. Share bar
    against the busiest session. Tokens with ≈$ or share% below. A
    family-scoped rail narrows each session to that family's share.

Data is the host's own session files, read on demand. The proxy records
nothing. The host scans in a worker, caches each file's hourly rows by
mtime+size (`usage-cache.json`), and memoizes for 5 min. The page keeps
the last answer in localStorage and shows it at once, asking again only
past 5 min or on 刷新. The first scan shows a skeleton, not 加载中. This
plugin's routes count, plus the host DeepSeek providers above. Other host
providers are not reported.

分享 renders the whole card, not only the visible part, as a long PNG:
clone with computed styles inlined, draw via SVG foreignObject onto a
canvas, no library. Only styles that differ from what the image computes
on its own are inlined, which is what keeps the button quick: a 40-row
card inlines ~23k properties instead of ~467k, its SVG markup drops from
~15 MB to ~0.9 MB, the decode from ~133 ms to ~10 ms, and the thumbnail
lands 2.3× earlier — pixel-identical output, pinned by diffing both
renders. Custom properties ride the clone root (they are inherited; a
descendant keeps its own only where its inline style resolves `var()`);
an inherited property is dropped when it equals the parent's value, but
only while the tag has no UA rule for it (h3 `font-size`, p margins,
button font); everything else is dropped when it equals the tag's UA
default, read from a hidden same-origin iframe probe. Two families never
prune, each one a measured regression: an SVG image resolves fonts per
element (a pruned `font-family` re-measures the text), and `min-width` /
`min-height` keep a context-dependent `auto` for flex/grid items that a
block-level probe reads as `0px`. The clone keeps no frozen **width** on
a text-bearing box: an SVG image resolves the font on its own, so a
shrink-to-fit box pinned to the page's pixel width wraps inside that
width and paints over the line below it (剩余 100% over its own reset
line). Absolute boxes keep their geometry, and every height stays
inlined — bars and card chrome depend on it. Footer under a rule: plugin
+ version and repo on the left; 分析日期 (the scan time) and scope ·
range on the right. 榜单 is the exception: its painted footer keeps only
the snapshot date and scope, because the source footline already names
arena.ai. Head controls (更新于 / 刷新 / 分享, `.osubs-noshot`)
stay out of the image.

The click paints before the capture: the flash and the busy button go up
first, and the capture starts one frame later, so the ~150 ms of cloning
never reads as an unacknowledged click. The decoded SVG is already the
finished image, so the thumbnail and the preview show it while the PNG is
still encoding; the clipboard and 保存图片 take the PNG, and their buttons
stay disabled until it lands. The write is still created in the click's
own task, so user activation holds. A write that never settles counts as
failed after 4 s.

Motion matches the macOS screenshot: a white flash over the card's
on-screen rect, then `ShotThumb` flies from that rect to the window's
bottom-right (180×120, image top-anchored, 已复制 badge), stays 5 s
(paused while hovered or focused), and slides out. Clicking it opens the
preview Dialog (再次复制 / 保存图片). A failed copy skips the thumbnail
and opens the Dialog so the image can be saved. Reduced motion: no flash
or flight; the thumbnail only fades. PNG, not JPG: the clipboard only
takes `image/png`, and flat UI text stays sharp in it.

## 榜单

Full-width, like 设置. arena.ai's public agent leaderboard, laid out as the
workbench's own table and fed by the `arena` RPC. Data-source conclusions:
[`docs/error.md`](../../docs/error.md) 2026-10-09.

The 榜单 view uses all available panel width, beyond the shell's usual
1000px cap. Model names stay fully visible and wrap as needed; the model
track has a minimum width at every breakpoint. A very narrow table can
scroll horizontally inside its own border without scrolling the page.

- Head, left: 更新于 (upstream snapshot date), sessions, model count, 刷新.
  浏览器验证 is not a permanent sibling of 刷新. It appears only while
  verification is running, when the answer is blocked or archived, or when a
  failed load left no board. Verification opens installed Chrome on the plugin
  machine using the plugin's own Node process. While it runs, refresh and
  verification disable, 取消验证 remains available, and an inline live status
  asks the user to finish in Chrome. The cached board stays visible. Success
  updates both caches and shows a completion line that dismisses after 5
  seconds. Failure keeps the board with a retryable error and leaves the
  button available.
  Head, right: 综合 / 代码 / 对话 / 办公 (arena's four server routes; the
  pick persists).
- Below: a 排名 / 性价比 view seg (persisted; the site's Ranking/Pareto),
  then search (model or org),
  then 全部 / 闭源 / 开源. Both panes honour category, license and search.
  The `n / total` count appears only when search or license changes the
  visible row count; an unfiltered board does not repeat the header model count.
  The seg buttons carry the site's View-as glyphs: Ranking = lucide `list`,
  Pareto = axes + curve (13px, stroke 1.5).
- **排名 pane** — the live board's twelve columns in its own order
  (re-identified 2026-10-14, docs/error.md): Rank (number over its min⋯max
  interval); Model
  (ink org mark —
  LobeHub mono, initial tile for unmapped orgs — mono model name,
  `org · license` sub line); Net Improvement (▲14.33% over ±2.18%, ok/bad
  by sign, plus the board's only diverging whisker, scaled to the column's
  max(|value|+ci) — the site's `avgScoreDomain`); the five signals in the
  site's order — Confirmed Success, Praise vs Complaint, Steerability, Bash
  Reliability (`bash_reliability_no_prereq`), Tool Hallucination (a positive
  rate is a green Down) — each the centred value over ±CI, no bar; Sessions
  (grouped count); Cost/Task (P50) and Output Tokens/Task (P50) (`$5.61` /
  `111.9K`, `N/A` whenever the board's own sample gate hides the figure:
  cost needs ≥50 priced samples and half the samples priced, tokens half the
  samples tokenised); Price $/M (`$4 / $20` via the site's
  `formatPricePerMillionUsd` — a whole number stays bare, everything else
  two decimals).
  Column heads sort. Rank is the default. English column labels and model
  names are the board's content, not chrome (zh shows our own labels). A
  narrow pane drops columns in retreat order — the four secondary signals
  with Price, then Sessions/Tokens, then Cost — keeping rank · model · Net
  Improvement · Confirmed Success.
- **性价比 pane** (the board's Pareto Frontier) — charted from the same
  cached rows (no extra fetch), drawn to the measured chart spec
  (docs/error.md 2026-10-09): 788×380 svg, 688×280 plot, dashed grid on
  both axes, a reversed log X (dearest left, domain `[min×0.7, max×1.3]`
  over all priced rows) whose tick ladder sits BELOW the plot, Y domain
  `[min×1.34, max×1.947]` with d3-style step ticks, the ok-green 2.5px
  frontier line leading 10px past both plot edges, r=5 dots, sans 10px
  chip labels that lane-shift around the line and each other (dropped when
  nothing fits, like the site), the centred mono axis caption under the
  plot, then the frontier itself as a timeline list — green square
  nodes with connectors, ink org mark, sans name over `org · license`,
  ok/bad `+X.XX%` and `$X/task` right-aligned.
- The pane's header carries the site's two filters: a 成本 | 输出 Token
  `role=tablist` pair (Cost | Output Tokens) and a 第 25/50/95 百分位
  dropdown (shorter / median / longer tasks). Both re-derive the frontier
  and reset the chart's zoom window — the `[lo,hi]` window lives in the
  old metric's log10 space, and a cheaper-token model is not a
  cheaper-dollar one.
- Everything under the chart follows the active projection, as on the site
  (ONE component rendered with `kind: cost | output-mtok`): the axis
  caption (the same string under the chart and under the card, e.g.
  `Long-task output tokens, P95 (last 14 days)`), the per-task card's
  title (每任务成本 / 每任务输出 Token), every figure (`$1.11/任务` vs
  `61.1K/任务`), the bar scale (the max of ALL priced rows in that
  projection, not just the visible ones), the Sort options (排名 /
  每任务成本|输出 Token 高→低), the ⓘ sentence, and the frontier that both
  the green rank tiles and the 性价比最优 filter chip use.
- 分享 uses the same long-shot pipeline as 用量. The shot targets the
  whole section with `[data-noshot]` controls dropped, so the image carries
  the board: the active pane (sticky head + filtered rows, or the chart +
  frontier list) plus the source footline, over the painted
  footer. The painted footer omits plugin name, version and repo. Its scope
  reads `榜单 · 分类` (plus license when filtered, plus 性价比 in that view).
  The date is the snapshot's 更新于. Operational hints — challenge
  instructions, refresh errors, archive explanations, and the verification
  status — stay out of the image. A fallback board (blocked, archived, or a
  partial refresh) adds only a short `缓存快照` mark to the footline.
  During the shot the section leaves the fill layout and the active pane
  unscrolls to full height.
- Only the active pane scrolls (fill panel, sticky head). The footline is
  `数据来源 arena.ai ↗ · 快照日期以上游发布为准`, plus `缓存快照` when the
  board is a fallback. The link opens the
  official board for the category being viewed (`osubs-link`, `flex: none`
  so it never joins the fill layout).
- The host caches boards in `arena-cache.json` on a 1 h TTL. The page
  keeps the last answer in localStorage, same contract as 用量. A
  partially failed refresh keeps the stale boards and shows a hint line. arena.ai now answers `/` and any `leaderboard` path with a Cloudflare
  managed challenge to every non-browser client, so a refresh can come back
  wholly gated (docs/error.md 2026-10-14): the answer carries `blocked` and
  the hint names the challenge and points to 浏览器验证. Hide this old hint
  during verification. The verification status and controls stay out of 分享.
  The host polls a bounded browser job through the existing `arena` RPC;
  it does not depend on a DSH browser API or embed the challenge in an iframe.

## 设置

Two sibling cards, full-width. The plugin update card is on top. 代理 is
below.

代理 is a plain-head card, not a provider legend card. Title 代理. Header
action: a three-segment `osubs-seg` (自动 / 关闭 / 自定义; active =
primary). Body: one status line (跟随系统代理：URL / 跟随环境变量代理：URL
/ 未检测到…直连 / 已关闭…直连), a custom-URL `osubs-inline` row (input +
保存) shown only in 自定义, and a scope hint. 自动 and 关闭 persist
immediately (optimistic, revert on RPC failure). 自定义 without a saved
URL only previews; 保存 persists. A config-pinned `proxyUrl` disables the
segment and shows the lock hint. The raw custom URL never enters the
stored snapshot (localStorage); only redacted forms do.

The update card keeps a plain head: 更新日志, then 检查更新. The changelog
is a centered dialog of the last 3 GitHub releases: version heading, bold
category, bullet list, footer 关闭.

### Version card

- Header: plugin title + check button only. Status never lives in the
  head (no pill row).
- One status banner (`osubs-vstat`): icon tile + one-line conclusion +
  subcopy, with the apply CTA or latest tag docked on the right. Tint
  encodes actionability — warn when an installable release exists, bad
  on a failed check, neutral otherwise. 「已是最新」 gets only an
  ok-tinted icon tile. A quiet state must not glow.
- Only two version slots exist: 当前版本 (a linked tree shows its derived
  `-dev` build there) and 最新版本 (the release tag, as the banner's side
  number or inside its conclusion). 磁盘 / 本地路径 / 加载自 are not
  version concepts and never render as rows. A disk≠running divergence is
  a diagnostic hint (`updateStaleProcess`). Installing never restarts the
  host.
- Restart copy comes from `restartKind` (`isElectronManagedProfile`). The
  desktop profile says quit and reopen the app (`updateInstalledApp`,
  `updateStaleProcessApp`, `autoUpdateHourlyApp`). Everything else says
  restart the host and spells out that the host is the dsh process.
- The stale-process hint is link-aware (`updateStaleProcessLinked`). A
  linked tree's divergence is restart-only (code rides `hmr`). The
  install-copy advice must not leak in: reinstalling would replace the
  hot link with an installed copy.
- A 「本地插件目录」 link keeps the banner neutral. The conclusion names
  the link and the running dev build. The subcopy is `autoUpdateLinked`
  (`npm run build` hot-reloads, needs an `hmr` root). A newer release only
  tints the side tag, never an update CTA.
- Key/value list: repo + the auto-update switch. The switch note carries
  the 15-minute cadence and the last run from `update-state.json`. On a
  linked tree it reports only the last check. Hot-reload semantics stay
  on the banner. A link's release-tag outcome would always read 「已是最新」.
- Errors and install results sit below the list and stay actionable,
  including the manual-install fallback when the profile's plugin dir
  cannot be resolved. On a linked tree a failed check drops to a bad hint
  line so the banner keeps its link identity.

## 额度

Remaining-bar color and copy are in [`../MASTER.md`](../MASTER.md).
`QuotaRow` is remaining-only. Cursor `kind === 'product'` is not a
used-bar exception.

OpenCode's two products share one account (one key, one vault) and still keep
their own panels: `ProviderCard` for Go, `ZenQuotaPanel` for the Zen wallet.
Both carry the family legend box — the Zen panel only leaves out the
add-account row, because there is no second credential to add. A wallet card
without that legend reads as part of the OpenCode Go section, in the pane and
in the shared image alike.

Each window's reset sits inside that row's `QuotaMeter`. A missing
`resetAt` draws nothing, never a shared line between meters. The reset
line is the relative countdown alone (`formatReset`), never a period date
range. One row per window (Codex: weekly; GLM: 5-hour + weekly), led by an
ink count card (`currentColor` fill, digits knocked out to the host
surface; dashed outline at 0).

Codex reset credits and GLM reset cards share one `ResetBank` and open
`WarnDialog`, not the add-account Dialog. One drawn card per banked card,
stepped 8px right. The face is not a stand-in for a capped depth. Each
card's edge is an inset surface line (white on the light workbench) so it
stays on the black face. The bank sits in a dashed frame with dashed row
dividers and no nested fills. Hover or focus on the count card opens a
tooltip with one expiry line per card, earliest first (Esc closes). The
row names only the window and the earliest expiry. Its button spends that
earliest card. A count drop flies the old top card off the stack and rolls
the new number in (reduced motion: fade only).

Structured `noteItems` (Ollama weekly model usage) render as `.osubs-qnote`:
a faint label over `osubs-tag--plain` chips, each `name` + mono `×count`.
Free-text `note` is the fallback when a family has no structured items.

The active account (`.osubs-acct--on`) shows a monochrome circled check
immediately to the right of the identity, before the plan tag. The words
stay on `aria-label` and `title` (`t.inUse`). There is no 「使用中」 chip.

### 分享

A right-aligned 分享 above the cards shares the cards in rail scope with
the same flow as 用量 (`useShot`: flash, corner thumbnail, clipboard,
preview). Footer scope reads `<scope> · 额度`. Its hover title
(`usageShareMask`) states what the image does to identities —
分享截图会隐藏账号（邮箱/用户名打码）. 用量 / 榜单 leave the hint off:
their images carry no account identity.

The image is a public artifact, so it differs from the page. Each account
identity (`[data-shot-mask]`) is masked: `a***@e***.com`, or a bare
username `a***`. `[data-noshot]` parts drop out: the 添加账号 row, the
account action buttons, and whole families with no account. They leave the
layout only while `renderLongShot` measures and clones (`.osubs-shooting`,
synchronous, never painted), so the image closes up around them. The page
itself never masks or hides anything.

### Account actions

An account head ends in three icon-only buttons. 切换 (only when the row
is not the active account) promotes that account. 刷新 re-reads its quota.
退出 signs out and drops the stored account. The glyph is the whole label.
The name rides on `aria-label` + `title` (`t.switchTo` / `t.quotaRefresh` /
`t.logout`) through `Button`'s square `.osubs-btn--icon` variant. Its side
comes from the height the size modifier already sets, so no fixed width
appears. The trio keeps the head from wrapping to a third line on a narrow
pane. 刷新 spins in place while its read is in flight. All three stay in
the `[data-noshot]` action row, so the shared 额度 image still drops them.
A failed read draws its `osubs-bad` line whether or not rows are present:
the rows in an error entry are the previous reading, and hiding the line
behind them made a frozen card look like a successful refresh.

退出 is the destructive one, so the row button never runs it: it stages the
account and opens `WarnDialog` (`role="alertdialog"`, `idPrefix:
'osubs-logout'`), which names that account (`identityOf(row, family)`, the
family name when the identity is opaque) and says the stored credential is
deleted and signing in again is required. 确认退出 stays disabled until
「我确认退出此账号」 is ticked; 取消, Escape, and an overlay click close it
without an RPC. The dialog is the shared destructive confirm — the
reset-card copy is only its default.

## Rail icons

Source of truth: `@lobehub/icons-static-svg`, pinned (`1.95.1`), the same
set lobehub.com/icons renders. Fetch
`https://unpkg.com/@lobehub/icons-static-svg@<ver>/icons/<name>.svg` and
inline it into `TAB_ICONS`. Do not add the npm dep and do not hotlink a
URL. The panel is a compiled single-file webview, so icons exist only as
strings.

Pick the entry form in this order:

1. `icons/<name>-color.svg` exists → `{ raw: '<inner markup>' }`. Strip
   the `<svg>` wrapper and `<title>`. Rename every `id` and `url(#…)` to
   an `osubs-<short>-N` prefix so defs never collide (`osubs-lg-codex`,
   `osubs-ag-*`). Renders with its own fills via
   `dangerouslySetInnerHTML`.
2. The color variant's glyph is `#fff` (it assumes a dark tile, for
   example `kimi-color.svg`) → the same `raw`, with a tile rect prepended:
   `<rect width="24" height="24" rx="5" fill="#000"/>`, so the mark reads
   on light themes.
3. Mono-only mark and the brand has a distinct hue → `{ d: '<path>' }`
   plus `FAMILY_COLOR[<id>]` (`fill: currentColor`, tinted; `clip: true`
   adds `clipRule="evenodd"`). Cite the hue source in the comment.
4. Mono-only mark and the official brand is itself monochrome
   (grok / cursor / ollama / opencode) → `{ d: '<path>' }` alone. It
   inherits muted/accent like the rail text. Do not invent a tint.
5. LobeHub does not carry the vendor → take the vendor's own brand SVG
   (site logo or press kit), apply the same inlining rules, and note the
   source URL in the comment.

Wiring: `TAB_ICONS[<key>]` and `FAMILY_ICON[<family>] = '<key>'`.
`FAMILY_COLOR` only for case 3. Sizes come from CSS: 16px rail
(`.osubs-rail-icon`), 18px default (`.osubs-tab-icon`), 13px inline links.
Keep the inventory comment above `TAB_ICONS` in sync. The mono/color
filename sets are pinned in `test/ui-client.test.ts`. Add a
`<id>: { d:|raw:` assertion in the family test.

## Dialog vs card

The card owns identity and state: title on the top border (legend style,
no head row), account cards, quota rows, and the mid-auth pairing code
plus authorize URL. The add/login entry is one dashed tail row
(`.osubs-acct-add` → `setAddOpen(true)`): the last line of the account
list, or the card's only row when logged out. While busy it yields to a
继续授权 + Cancel row.

The Dialog owns methods. Every family's login, import, paste, key, and
manual flow lives inside it. Header = family mark + 添加账号 + family
name. Method rows carry a chevron (it rotates when that row's inline form
is open). Only one form is open at a time, and the form renders directly
under its own row, never after the whole list. The row spins while
starting. The other rows disable so a double click cannot fork two flows.
Key fields are masked and autofocused. Submit stays disabled until
non-empty.

Mid-auth, the method list is replaced by `AuthPanel`: waiting status, the
pairing code (large, one-click copy), a full-width 打开授权页 CTA, the
callback paste (PKCE/OAuth only), and Cancel. Focus moves into the dialog,
Tab is trapped, and focus returns to the opener on close. Overlay click
and Escape still close it.

## What this page does not own

Vendor hop, cache, and quota math on the wire. Release version bumps.
