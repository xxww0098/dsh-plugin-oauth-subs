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
   row 1 and stretch their gaps; Devin then OpenCode Go wrap inside
   this group). Right `.osubs-tabs-util` stays 36px, Models on row 1
   and GitHub/About on row 2. Do not add a third API-key capsule. Do
   not `margin-left: auto`, nav `space-between`, or
   `width: max-content` on the family capsule.
2. One family card (or Models / About)
3. Account cards in a column
4. One primary CTA → centered Dialog

## Density

Tighter than a marketing Swiss page. Card gap 12px, pane gap 18px,
buttons 32px (primary 36px). Still 13px UI / 12.5px emails.

## About cards

The About tab is two update cards (OAuth Subs Plugin / DeepSeek Harness)
with one shared anatomy — no account cards, no dialog:

- Card head: title + status pill on the left (`osubs-pill` — ok `已是最新`,
  warn `有新版本`, bad `检查失败`/`更新失败`, neutral otherwise); a
  check-only 检查更新 button on the right. It never installs.
- Version band (`.osubs-ver`): `当前 → 最新` mono numerals with an SVG
  arrow; the arrow pulses while applying. The apply CTA
  (`更新到 vX` / `重试更新到 vX`, `osubs-btn--update`) docks right and
  shows elapsed seconds while running. Check and apply are separate
  actions — never one button that silently switches roles.
- kv list (`.osubs-kv`) is hairline-separated rows (`--osubs-hair`):
  muted label left, value right. Versions/tags are mono
  (`osubs-mono`); npm dist-tags render as `osubs-tag--plain` chips.
  The last row is the auto-update row (`.osubs-auto-row`): the whole
  row is the label — title + a faint note (`每小时检查一次…` plus
  `上次检查 HH:mm · 结果` from `update-state.json`) on the left,
  `osubs-auto-track` switch on the right.
- Repo rows link out with the LobeHub GitHub mark (`osubs-link--icon`).
- Error detail, stale-process, and apply-result hints live under the list
  in `.osubs-hints`; the pill carries the headline state. A successful
  manual apply auto-restarts dsh web (same as auto-update); only an old
  host that ignores `restart` falls back to the manual-restart hint.

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

GLM opaque `user.id` (PR #80) and Cursor JWT `sub` identity (in-flight
PR). Hop, cache, and quota math on the wire. Version bumps.
