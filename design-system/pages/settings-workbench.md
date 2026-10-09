# Settings workbench — page override

Applies only to the OAuth workbench (`src/ui/client.ts` + `src/ui/parts/`). The shell
geometry and theme rules live in [`../MASTER.md`](../MASTER.md); this
file owns *what each region renders and how views behave*.

## This page is not a landing

No hero, no feature grid, no glass CTA slab.

## Regions → views

- **Tabs**: 额度 / 模型 / 用量 / 设置 — switching swaps the pane content; the
  topbar and rail stay put.
- **Family rail** (Quota + Models + Usage): selects one family or 全部.
  Quota view renders the matching `ProviderCard`(s) in `FAMILY_ORDER`;
  Models view scopes `ModelsPanel` to that family. Absent on Version.
- **Models view**: one searchable table — model name + tag chips left,
  `Switch` right; family group headers appear only when more than one
  group is shown. Only the table scrolls (`osubs-pane-panel--fill`
  clamps the card to pane height; the column head is sticky) — the
  toolbar, hint and pane stay fixed. Logged-out groups stay listed with
  locked switches, `登录后同步` note, and a 登录 jump to that family's
  Quota card. A family that signed in here but is still waiting for its
  pick is all-off on purpose and carries the `登录后默认不勾选` note
  (登录默认; `docs/models.md`) next to its `0 / N` count instead of
  looking broken. Every row carries its input-context window as a tag
  button (`osubs-tag--ctx`; customized rows use the accent
  `--custom` tint) — one default-window row per model, no context
  variant rows. Clicking opens the centered input-context Dialog —
  family mark + model name in the head, a stat strip (当前 only when
  customized / 目录默认 / 上限), a mono k/m shorthand input, and a
  0…ceiling slider (`role="slider"`) whose fill follows the draft
  (accent when editing, bad when out of range) — dragging the track or
  arrow-keying it writes the draft back as k/m shorthand at a 1K step,
  and the round-size preset nodes that fit inside the range (dot on the
  track, label in the ends row) are buttons that fill the draft
  directly; the catalog default stays a tick, not a node;
  保存 disables on a no-change value and typing the default folds
  into 恢复默认 (the reset is an outline icon+label button at the
  footer's left edge — it stages the default into the draft whenever
  the draft isn't already the default, and applying folds into the
  same reset; its tooltip names the value it restores). When
  any row is customized, the toolbar grows a global 恢复默认窗口
  button. Locked families and switched-off rows keep editable windows:
  the override persists to models.json and only lands in the route when
  the row is enabled — a dormant edit never triggers a settings rewrite.
  Rows from a family with a rates.json table (command-code) carry a coin
  tag (`osubs-ptag`, focusable like the ctx tag button) that hover/focus-
  opens an `osubs-rtip` listing USD-per-1M-token rows — uncached input /
  output / cache-hit read, cache-write lines only when priced, peak-band
  lines under a separator when the row has a `tod` (footnoted with the
  shared effectiveFrom + UTC peak windows), and over-threshold tier rows
  when `tierThreshold` is set.
  The toolbar also carries 默认档位: a native `select` (不设置 + the
  DSH level names Off…Max) styled like the search field. It edits the
  families in the rail scope — 全部 writes (and unifies) every family,
  a family writes only itself, and differing values read 混合. The pick
  shows at once (optimistic, like the switches) while the route rewrite
  waits on the host reconcile; rules in `docs/models.md` 默认档位.
- **Usage view**: one card — no in-card title (the 用量 tab names it);
  head carries 更新于 HH:MM + 刷新/分享 on the left and the 今天 / 7 天 /
  30 天 segmented range on the right (今天 = 24 hourly bars); a first open
  defaults to 今天, and every later open restores the last choice. A stat
  strip (`osubs-ustats`, auto-fit so five cards sit in one row on a wide
  pane): Token (= 输入 + 输出, 输入 being the whole prompt — uncached +
  缓存读 + 缓存写, the host session totalTokens the user reconciles
  against; 输入/输出 below), 缓存读 (a subset of 输入) with 命中率 —
  the rate counts only calls whose usage carries a cache field, so a family
  that reports none (Kiro) reads 「—」 / 上游未报告缓存, never 0% — 调用
  (with 次失败: attempts that failed and were not retried), 首字延迟
  (mean step-start → first frame, with output tok/s over calls that
  streamed ≥ 1 s; burst replies say nothing about speed), and 估算成本
  (`≈$…` priced from `rates.json` at read time — an estimate, not a bill;
  models without a rate row are left out and named in the sub line as
  「x/y 模型有价目」; `$0` is a price, shown as priced). The bar chart
  stacks output on input in two tones of the accent (no legend — the
  stat sub-line and the bar tooltip name them; never vendor tints);
  hover/focus a bar for the 输入/输出/缓存读/调用 breakdown in an
  `osubs-rtip` (估算 rides along when the bucket priced above $0).
  The table head carries a 按模型 / 按会话 toggle (the toggle itself is
  `data-noshot`, the head label shows the active one with its count).
  按模型 rows: mark (family name on hover) + model, a sub line
  (calls · failures · TTFT · tok/s · ≈$ when priced), a share bar, tokens
  with the share% below. 按会话 rows: 最近写入时间 (file mtime, `M/d
  HH:MM`) with an 8-char id chip whose click copies the full session id
  (chip + copy stay out of the shared image; the full id sits in the
  chip's `title`), a sub line (top models, `另 N 个` when more · calls ·
  failures), a share bar against the busiest session, tokens with ≈$ or
  share% below; a family-scoped rail narrows each session to that
  family's share.
  Data is the host's own session files, read on demand — the proxy records
  nothing. The host scans in a worker thread, caches each file's hourly rows
  by mtime+size (`usage-cache.json`), and memoizes the answer for 5 min;
  the page keeps the last answer in localStorage and shows it at once on
  every open, asking again only past 5 min or on 刷新. The first scan shows
  a skeleton, not 加载中. This plugin's routes count, plus the host's own
  DeepSeek providers (`deepseek-official` / `deepseek-account`) as a
  usage-only rail entry **DeepSeek** after the families (LobeHub
  `deepseek-color`; no quota card or model rows, so leaving the Usage view
  resets that scope to 全部). Other host providers are not reported.
  分享 renders the whole card (not just the visible part) as a long PNG —
  cloned with computed styles inlined, drawn via SVG foreignObject onto a
  canvas, no library — with a footer under a rule: plugin + version and
  repo on the left, 分析日期 (the scan time) and scope · range on the
  right. The head controls (更新于 / 刷新 / 分享, `.osubs-noshot`) stay out
  of the image. The PNG goes straight to the clipboard (the write starts
  inside the click so its user activation holds; a write that never
  settles counts as failed after 4 s). The motion is the macOS screenshot:
  a white flash over the card's on-screen rect, then `ShotThumb` flies from
  that rect into the window's bottom-right corner (180×120, image
  top-anchored, 已复制 badge), stays 5 s — paused while hovered or
  focused — and slides out; clicking it opens the preview Dialog
  (再次复制 / 保存图片). A failed copy skips the thumbnail and opens the
  Dialog so the image can be saved. Reduced motion: no flash or flight,
  the thumbnail only fades. PNG, not JPG: the clipboard only takes image/png and
  flat UI text stays sharp in it.
- **Version view**: the single plugin update card, full-width. Header actions are 更新日志 then 检查更新. The changelog is a centered dialog of the last 3 GitHub releases: version heading, bold category, bullet list, footer 关闭.
- One primary CTA → centered Dialog.

## Density

Tighter than a marketing Swiss page; exact gaps/sizes live in the CSS
tokens. Still 13px UI / 12.5px emails.

## Version card

- Header: plugin title + check button only — status never lives in the
  head (no pill row).
- One status banner (`osubs-vstat`): icon tile + one-line conclusion +
  subcopy, with the apply CTA or latest tag docked on the right. Tint
  encodes actionability — warn when an installable release exists, bad
  on a failed check, neutral otherwise; 「已是最新」 gets only an
  ok-tinted icon tile, a quiet state must not glow.
- Only two version slots exist: 当前版本 (a linked tree shows its
  derived `-dev` build there) and 最新版本 (the release tag, shown as
  the banner's side number or inside its conclusion). 磁盘 / 本地路径
  / 加载自 are not version concepts and never render as rows — a
  disk≠running divergence is a diagnostic hint (`updateStaleProcess`),
  and installing never restarts the host.
- Restart guidance names what the user actually restarts, picked from
  `restartKind` (`isElectronManagedProfile`): the desktop profile says
  quit and reopen the app (`updateInstalledApp`, `updateStaleProcessApp`,
  `autoUpdateHourlyApp`); everything else says restart the host and
  spells out that the host is the dsh process.
- The stale-process hint is link-aware (`updateStaleProcessLinked`):
  a linked tree's divergence is restart-only (code rides `hmr`), and
  the install-copy advice must not leak in — reinstalling would
  replace the hot link with an installed copy.
- A 「本地插件目录」 link keeps the banner neutral: the conclusion names
  the link + running dev build, the subcopy is `autoUpdateLinked`
  (`npm run build` hot-reloads, needs an `hmr` root), and a newer
  release only tints the side tag — never an update CTA.
- Key/value list: repo + the auto-update switch. The switch note carries
  the 15-minute cadence + last run from `update-state.json`; on a linked
  tree it reports only the last check (the hot-reload semantics are on
  the banner, and a link's release-tag outcome would always read
  「已是最新」).
- Errors and install results sit below the list — keep them actionable,
  including the manual-install fallback when the profile's plugin dir
  cannot be resolved; on a linked tree a failed check drops to a bad
  hint line so the banner keeps its link identity.

## Quota

`QuotaRow` is remaining-only; Cursor `kind === 'product'` is not a
used-bar exception. Each window's reset sits inside that row's
`QuotaMeter` — a missing `resetAt` draws nothing, never a shared line
between meters. Codex reset credits and GLM reset cards share one
`ResetBank` in the card and open `WarnDialog`, not the add-account
Dialog. One row per window (Codex: weekly; GLM: 5-hour + weekly), led
by an ink count card (`currentColor` fill, digits knocked out to the
host surface; dashed outline at 0). One drawn card per banked card,
stepped 8px right — the face is not a stand-in for a capped depth. Each
card's edge is an inset surface line — white on the light workbench —
so it stays on the black face instead of disappearing into the page.
The bank sits inside a dashed frame with dashed row dividers — no nested fills. Hover or
focus on the count card opens a tooltip with one expiry line per card,
earliest first (Esc closes); the row names only the window and
the earliest expiry, and its button spends that earliest card. A count
drop flies the old top card off the stack and rolls the new number in
(reduced motion: fade only). The reset line is the relative countdown
alone (`formatReset`), never a period date range.

Structured `noteItems` (Ollama weekly model usage) render as
`.osubs-qnote` — faint label over `osubs-tag--plain` chips, each
`name` + mono `×count`. Free-text `note` is the fallback for families
without structured items.

### 分享 on 额度

A right-aligned 分享 above the cards shares the cards in rail scope with
the same flow as 用量 (`useShot`: flash, corner thumbnail, clipboard,
preview; footer scope reads `<scope> · 额度`). The image is a public
artifact, so it differs from the page: each account identity
(`[data-shot-mask]`) is masked — `a***@e***.com`, a bare username
`a***` — and `[data-noshot]` parts drop out: the 添加账号 row, the
account action buttons, and whole families with no account. They are
removed from the live layout only while `renderLongShot` measures and
clones (`.osubs-shooting`, synchronous, never painted), so the image
closes up around them. The page itself never masks or hides anything.

The active account (`.osubs-acct--on`) shows a monochrome circled check
immediately to the right of the identity, before the plan tag. The words
stay on `aria-label` and `title` (`t.inUse`); there is no 「使用中」 chip.

### Account card actions

An account head ends in three **icon-only** buttons: 切换 (only when the
row is not the active account) promotes that account, 刷新 re-reads its
quota, 退出 signs out and drops the stored account. Their glyph is the
whole label, so the name rides on `aria-label` + `title` (`t.switchTo` /
`t.quotaRefresh` / `t.logout`) through the shared `Button`'s square
`.osubs-btn--icon` variant — whose side comes from the height the size
modifier already sets, so no fixed width appears. The trio keeps the head
from wrapping to a third line on a narrow pane; 刷新 spins in place while
its read is in flight. All three stay in the `[data-noshot]` action row, so
the shared 额度 image still drops them.

## Rail icons

Source of truth: `@lobehub/icons-static-svg`, pinned (`1.95.1`) — the
same set lobehub.com/icons renders. Fetch
`https://unpkg.com/@lobehub/icons-static-svg@<ver>/icons/<name>.svg` and
inline it into `TAB_ICONS`. Never add the npm dep and never hotlink a
URL: the panel is a compiled single-file webview, so icons only exist
as strings.

Pick the entry form in this order:

1. `icons/<name>-color.svg` exists → `{ raw: '<inner markup>' }`. Strip
   the `<svg>` wrapper and `<title>`; rename every `id` + `url(#…)` to an
   `osubs-<short>-N` prefix so defs never collide (`osubs-lg-codex`,
   `osubs-ag-*`, `osubs-copilot-*`). Renders with its own fills via
   `dangerouslySetInnerHTML`.
2. The color variant's glyph is `#fff` (it assumes a dark tile, e.g.
   `kimi-color.svg`) → same `raw`, but prepend a tile rect
   `<rect width="24" height="24" rx="5" fill="#000"/>` so the mark reads
   on light themes.
3. Mono-only mark and the brand has a distinct hue → `{ d: '<path>' }`
   + `FAMILY_COLOR[<id>]` (renders `fill: currentColor` tinted;
   `clip: true` adds `clipRule="evenodd"`). Cite the hue source in the
   comment.
4. Mono-only mark and the official brand is itself monochrome
   (grok/cursor/ollama/opencode) → `{ d: '<path>' }` alone — inherits
   muted/accent like the rail text. Do not invent a tint.
5. LobeHub does not carry the vendor → take the vendor's own brand SVG
   (site logo / press kit), apply the same inlining rules, note the
   source URL in the comment.

Wiring: `TAB_ICONS[<key>]` + `FAMILY_ICON[<family>] = '<key>'`;
`FAMILY_COLOR` only for case 3. Sizes come from CSS: 16px rail
(`.osubs-rail-icon`), 18px default (`.osubs-tab-icon`), 13px inline
links. Keep the inventory comment above `TAB_ICONS` in sync — the
mono/color filename sets are pinned in `test/ui-client.test.ts`; add a
`<id>: { d:|raw:` assertion in the family test.

## Dialog vs card

The card owns identity and state: title on the top border (legend
style, no head row), account cards + quota rows, mid-auth pairing code
+ authorize URL. The add/login entry is one dashed tail row
(`.osubs-acct-add` → `setAddOpen(true)`) — last line of the account
list, or the card's only row when logged out; while busy it yields to
a 继续授权 + Cancel row.

The Dialog owns methods: every family's login / import / paste / key /
manual flows live inside it. Header = family mark + 添加账号 + family
name. Method rows carry a chevron (rotates when its inline form is open;
only one form open at a time; the form renders directly under its own
row, never after the whole list) and spin while starting — the other rows
disable so a double click can't fork two flows. Key fields are masked,
autofocused, and their submit stays disabled until non-empty.

Mid-auth the method list is replaced by `AuthPanel`: waiting status,
the pairing code (large, one-click copy), a full-width 打开授权页 CTA,
the callback paste (PKCE/OAuth only), and Cancel. Focus moves into the
dialog, Tab is trapped, and focus returns to the opener on close;
overlay / Escape still close it.

## What this page does not own

Vendor hop, cache, and quota math on the wire. Release version bumps.
