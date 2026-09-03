# Settings workbench — design system

This is the composed system for **dsh-plugin-oauth-subs** Settings.
It is an authenticated OAuth workbench inside DSH, not a marketing
landing. Binding UI rules stay in [`AGENTS.md`](../AGENTS.md)
(`Settings — one account, one card` / `Settings — design details`).
This file is the visual contract those sections point at.

Catalog note: the first SaaS product-type hit in
`nextlevelbuilder/ui-ux-pro-max-skill` is Hero + Features + CTA /
Glassmorphism. That is a landing. **Do not persist that Master here.**
The overlay below is what this plugin actually ships.

## Compose

| Layer | Choice | Why |
|---|---|---|
| Product | Authenticated OAuth workbench | Account cards, quota, login — not a hero |
| Style | `minimalism-and-swiss-style` | Enterprise / SaaS / professional tools |
| Color | B2B Service slate as **intent** | `#0F172A` / `#334155` — inherit host mixes, do not paint a gray page |
| Type | Host UI sans (Inter-class) | 13px UI / 12.5px emails. No display serif |
| Pattern | Account card stack | One session → one card |
| Overlay | Centered Dialog | Reuse `.osubs-dsw*`. Never Sheet / Drawer |
| Motion | Subtle + `prefers-reduced-motion` | Keep the existing reduce block |

## Shell

- Inherit the host theme. Tokens are `currentColor` mixes already in
  AGENTS.md: `--osubs-line` 16%, `--osubs-fill` 6%, `--osubs-muted` 66%.
- No glassmorphism on the shell. Optional `backdrop-blur-xs` **only**
  on the centered Dialog overlay (`--dsw-mask-blur`).
- No hardcoded light-theme grays. Dark host stays dark.
- Icon-only tabs, sticky `.osubs-nav`, 8 icons per row then wrap
  (first eight family tabs on row 1, OpenCode + Models + About on row 2).
- No family-level identity row. No shared quota block under the heading.

## Remaining bars

Every quota bar is a **remaining** bar: fill and caption are
`remainingPercent` (100% → 0%). Copy is `剩余 {n}%` / `{n}% left`.

- Prefer `row.remainingPercent`. Else `100 - row.usedPercent`.
- Never caption the bar `已用` / `% used`.
- `used / total` may sit as secondary text when those are real units.
- Color encodes remaining via `quotaTone`, not family, not used%:

| Remaining | Tone | Token |
|---|---|---|
| > 40 | ok | `--osubs-ok` |
| ≤ 40 | warn | `--osubs-warn` |
| ≤ 15 | bad | `--osubs-bad` |

## Dialog

- Add-account / extra login chrome: centered Dialog (`CenterDialog`,
  `.osubs-dsw` + `.osubs-dsw-card`).
- Destructive confirm: existing `WarnDialog` (`role="alertdialog"`).
- Never Sheet, Drawer, or a 侧边抽屉. Operator rejected those.
- Empty roster: one primary CTA opens the dialog.
- Logged-in: “添加账号” opens the same dialog.
- GLM Z.ai / BigModel, Kiro Social / IdC / import, Grok device / PKCE,
  Cursor import, paste / API-key / manual flows live **inside** the
  dialog.
- Escape and overlay click close non-destructive dialogs.
- Clickable controls use `cursor: pointer`. Focus is visible
  (`:focus-visible` ring).

## Type, chips, icons

- 13px UI, 12.5px emails (mono). Tags are small, not a second heading.
- `.osubs-tag` is one line (`white-space: nowrap`). Full value visible;
  no wrap, no `title`-only truncation.
- Account title is human (email). Opaque ids are a separate identity
  bug — do not regress, do not block on those PRs.
- SVG icons only (LobeHub tab marks, `IconClose`, `IconWarning`). No
  emoji marks.
- Chinese copy is short. No help-desk filler under headings.

## Stack

Classic-script factory in `src/ui/client.ts`: `h()` hyperscript + React
hooks. Do not add Vue, Svelte, raw DOM helpers, or npm-install shadcn /
icon packages.

## Do not

- Ship a Hero / Glass landing Master for this page.
- Color bars by vendor.
- Leave extra login buttons in a permanent row under the cards.
- Hand-edit `lib/`.
- Vendor ui-ux-pro-max-skill CSVs into this repo.
