# Settings workbench — page override

Deviations from [`../MASTER.md`](../MASTER.md) that apply only to the
OAuth Settings section (`src/ui/client.ts`). The Settings page rules
(tabs, account cards, quota bars, dialogs) live here — AGENTS.md only
indexes this page.

## This page is not a landing

No hero, no feature grid, no glass CTA slab. The first catalog hit for
SaaS (Hero + Features + CTA / Glassmorphism) stops at the overlay
already recorded in MASTER. Settings is a stacked workbench:

1. Sticky icon tabs (`.osubs-nav`): **two capsules**, docked with
   `gap: 4px`. Left `.osubs-tabs` is family-only `repeat(9, 36px)` +
   `justify-content: space-between` + `flex: 1 1 auto` (9 icons fill
   row 1 and stretch their gaps; Devin, Cline, and OpenCode Go wrap
   inside this group). Right `.osubs-tabs-util` stays 36px, Models on row 1
   and About on row 2. Do not add a third API-key capsule. Do
   not `margin-left: auto`, nav `space-between`, or
   `width: max-content` on the family capsule.
2. One family card (or Models / About)
3. Account cards in a column
4. One primary CTA → centered Dialog

## Density

Tighter than a marketing Swiss page. Card gap 12px, pane gap 18px,
buttons 32px (primary 36px). Still 13px UI / 12.5px emails.

## About cards

The About tab has one plugin update card — no account cards or dialog:

- The header shows the plugin title, a status pill, and a check button.
  Checking and installing are separate actions; the install button appears
  in the version band only when a newer GitHub release is available.
- The version band compares the running plugin with the latest release.
  If the profile copy is newer than the running process, show the disk
  version and a restart hint; installing does not restart the host or app.
- The key/value list shows repository and runtime details. Its final row
  holds the hourly auto-update switch and the last check result from
  `update-state.json`.
- Errors and installation results sit below the list. Keep their message
  actionable, including a manual install fallback when automatic install
  cannot find the profile's plugin directory.

## Quota

`QuotaRow` is remaining-only on this page. Cursor `kind === 'product'`
is not a used-bar exception. Each window's reset sits inside that
row's `QuotaMeter` (under the percent row, above the bar). A missing
`resetAt` draws nothing on that bar — never a shared line between
meters. Codex reset credits stay in the card and still open
`WarnDialog`, not the add-account Dialog.

A row's structured `noteItems` (Ollama weekly model usage) renders as
`.osubs-qnote`: an uppercase faint label (本周模型用量) over a
flex-wrap row of `osubs-tag--plain` chips, each `name` + a mono
`×count`. Free-text `note` stays the fallback for families without
structured items.

## Dialog vs card

| On the card | In the add-account Dialog |
|---|---|
| Title + status pill | Family login methods |
| Account cards + quota | GLM Z.ai / BigModel / API key |
| Mid-auth pairing code + authorize URL | Kiro Social / IdC / Entra / paste |
| One CTA (登录 / 添加账号 / 继续授权) | Grok device vs PKCE |
| Cancel while busy | Cursor / local import |
| | Callback paste / manual / keys |

Mid-auth pairing code may also repeat inside the dialog so a just-opened
login does not hide the user code. Overlay / Escape still closes the
non-destructive dialog; Cancel on the card stops the flow.

## What this page does not own

Vendor hop, cache, and quota math on the wire. Release version bumps.
