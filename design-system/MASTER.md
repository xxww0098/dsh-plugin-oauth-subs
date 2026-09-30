# Settings workbench — design system

The **dsh-plugin-oauth-subs** workbench is a keyed `main` panel behind a
`sidebar.panellist` glyph (「订阅」, gauge icon) under the 插件 button in
the host rail — not a Settings section, not a landing. Page composition
and per-view behavior: [`pages/settings-workbench.md`](pages/settings-workbench.md).
Cross-family rules: [`docs/rules.md`](../docs/rules.md).

## Compose

| Layer | Choice | Why |
|---|---|---|
| Product | Authenticated OAuth workbench | Account cards, quota, login — not a hero |
| Style | `minimalism-and-swiss-style` | Enterprise / SaaS / professional tools |
| Color | B2B Service slate as **intent** | Inherit host mixes; never paint a gray page |
| Type | Host UI sans | 13px UI / 12.5px emails. No display serif |
| Overlay | Centered Dialog | Never Sheet / Drawer — operator rejected both |
| Motion | Subtle + `prefers-reduced-motion` | Keep the reduce block |

## Shell

Fixed three-region layout; the page itself never scrolls
(`overflow: hidden`) so the scrollbar can never overlap the tab strip:

- **Top** — `.osubs-ptabs`: horizontal text tabs 额度 / 模型 / 用量 / 设置,
  bottom-aligned in a tall bar so headroom stays above them, edge-to-edge
  1px seam, active = accent + inset underline. Blank area is
  `-webkit-app-region: drag` for window drag; tab buttons are `no-drag`.
- **Left** — `.osubs-rail`: fixed provider column under the tabs, shown
  on Quota, Models and Usage (Version is full-width). 全部 + every family
  in `FAMILY_ORDER`, each with brand mark + name + count.
- **Right** — `.osubs-pane`: the only scroller, except the Models view
  where the panel fills the pane (`osubs-pane-panel--fill`) so the pane,
  toolbar and column head stay put and only `.osubs-mtable` scrolls.

Exact sizes/padding live in the CSS; keep 四周留白 on all sides.

Theme:

- Inherit the host theme; tokens are `currentColor` mixes
  (`--osubs-line`, `--osubs-fill`, `--osubs-muted`, …). No hardcoded
  light-theme grays — dark host stays dark.
- No glassmorphism on the shell; `backdrop-blur` only on the Dialog
  mask.

Brand marks (`TabIcon` / `TAB_ICONS`):

- Prefer the official LobeHub `*-color.svg` inlined verbatim as `raw`
  when the set ships one; otherwise the mono path tinted by
  `FAMILY_COLOR` at the lobehub brand hue.
- Officially-mono brands stay theme-mono — do not invent a hue.
- All icons are inline SVG; no icon packages, no emoji marks.

Models view: `Switch` controls in a searchable `ModelsPanel` table, not
checkbox lists; logged-out families stay listed with locked switches and
a sign-in jump to their Quota card — never dim or hide locked rows.

No family-level identity row; no shared quota block under a heading.

## Remaining bars

Every quota bar is a **remaining** bar: fill and caption come from
`remainingPercent` (`100 - usedPercent` fallback). Copy is
`剩余 {n}%` / `{n}% left` — never `已用` / `% used`. `used / total` may
sit as secondary text in real units only. The fill is a continuous
green→red ramp on remaining (`quotaFillColor`): 100% = `--osubs-ok`,
50% = `--osubs-warn`, 0% = `--osubs-bad`, mixed in hsl so the midpoint
stays amber — never vendor, never used%. Caption text still reserves
color for a warning via `quotaTone`: ink above 40%, warn ≤ 40%,
bad ≤ 15%. The active card and 「使用中」 tag are monochrome too
(ink border / outlined tag), not green.

## Dialog

- All login methods (OAuth flows, device/PKCE, paste / API-key / local
  import) live **inside** the centered Dialog (`CenterDialog`,
  `.osubs-dsw*`); the card keeps only the primary CTA and mid-auth
  pairing state. Destructive confirm = `WarnDialog`
  (`role="alertdialog"`).
- Escape and overlay click close non-destructive dialogs.
- Clickable controls use `cursor: pointer`; focus is always visible
  (`:focus-visible` ring).

## Stack

Classic-script factory in `src/ui/client.ts` (views in `src/ui/parts/`): `h()` hyperscript + React
hooks via `require('react')`. No Vue / Svelte / raw DOM helpers / npm
icon packages. `lib/` is generated — never hand-edit.

## Do not

- Ship a Hero / Glass landing Master for this page.
- Color bars by vendor.
- Leave extra login buttons in a permanent row under the cards.
- Hand-edit `lib/`.
- Vendor ui-ux-pro-max-skill CSVs into this repo.
