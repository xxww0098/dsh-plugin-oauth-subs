# Settings workbench — page override

Applies only to the OAuth workbench (`src/ui/client.ts`). The shell
geometry and theme rules live in [`../MASTER.md`](../MASTER.md); this
file owns *what each region renders and how views behave*.

## This page is not a landing

No hero, no feature grid, no glass CTA slab.

## Regions → views

- **Tabs**: 额度 / 模型 / 版本 — switching swaps the pane content; the
  topbar and rail stay put.
- **Family rail** (Quota + Models only): selects one family or 全部.
  Quota view renders the matching `ProviderCard`(s) in `FAMILY_ORDER`;
  Models view scopes `ModelsPanel` to that family. Absent on Version.
- **Models view**: one searchable table — model name + tag chips left,
  `Switch` right; family group headers appear only when more than one
  group is shown. Only the table scrolls (`osubs-pane-panel--fill`
  clamps the card to pane height; the column head is sticky) — the
  toolbar, hint and pane stay fixed. Logged-out groups stay listed with
  locked switches, `登录后同步` note, and a 登录 jump to that family's
  Quota card.
- **Version view**: the single plugin update card, full-width.
- One primary CTA → centered Dialog.

## Density

Tighter than a marketing Swiss page; exact gaps/sizes live in the CSS
tokens. Still 13px UI / 12.5px emails.

## Version card

- Header: plugin title, status pill, check button. Checking and
  installing are separate actions — the install button appears in the
  version band only when a newer GitHub release exists.
- Version band compares running vs latest release. If the profile copy
  is newer than the running process, show the disk version + restart
  hint; installing never restarts the host.
- Key/value list: repo + runtime details; final row holds the 15-minute
  auto-update switch and last check result from `update-state.json`.
- A 「本地插件目录」 link keeps that switch — only its note forks
  (`autoUpdateLinked`: `npm run build` hot-reloads, needs an `hmr`
  root, and no release-tag outcome) because a link has no installed copy
  to swap and would otherwise always read 「已是最新」.
- Errors and install results sit below the list — keep them actionable,
  including the manual-install fallback when the profile's plugin dir
  cannot be resolved.

## Quota

`QuotaRow` is remaining-only; Cursor `kind === 'product'` is not a
used-bar exception. Each window's reset sits inside that row's
`QuotaMeter` — a missing `resetAt` draws nothing, never a shared line
between meters. Codex reset credits stay in the card and open
`WarnDialog`, not the add-account Dialog.

Structured `noteItems` (Ollama weekly model usage) render as
`.osubs-qnote` — faint label over `osubs-tag--plain` chips, each
`name` + mono `×count`. Free-text `note` is the fallback for families
without structured items.

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

The card owns identity and state: title + status pill, account cards +
quota rows, mid-auth pairing code + authorize URL, one CTA
(登录 / 添加账号 / 继续授权), Cancel while busy.

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
