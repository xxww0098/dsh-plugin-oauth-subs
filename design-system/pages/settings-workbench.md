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
  group is shown. Logged-out groups stay listed with locked switches,
  `登录后同步` note, and a 登录 jump to that family's Quota card.
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
- Key/value list: repo + runtime details; final row holds the hourly
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

## Dialog vs card

The card owns identity and state: title + status pill, account cards +
quota rows, mid-auth pairing code + authorize URL, one CTA
(登录 / 添加账号 / 继续授权), Cancel while busy.

The Dialog owns methods: every family's login / import / paste / key /
manual flows live inside it. A mid-auth pairing code may repeat inside
the dialog so a just-opened login never hides the user code; overlay /
Escape still closes it.

## What this page does not own

Vendor hop, cache, and quota math on the wire. Release version bumps.
