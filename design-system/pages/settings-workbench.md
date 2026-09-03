# Settings workbench — page override

Deviations from [`../MASTER.md`](../MASTER.md) that apply only to the
OAuth Settings section (`src/ui/client.ts`). Cross-family layout rules
stay in AGENTS.md; this page does not repeat them.

## This page is not a landing

No hero, no feature grid, no glass CTA slab. The first catalog hit for
SaaS (Hero + Features + CTA / Glassmorphism) stops at the overlay
already recorded in MASTER. Settings is a stacked workbench:

1. Sticky icon tabs (`.osubs-nav`): **two capsules**, docked with
   `gap: 4px`. Left `.osubs-tabs` is family-only `repeat(8, 36px)`
   (8 families fill row 1; a 9th wraps inside this group). Right
   `.osubs-tabs-util` stacks Models on row 1 and GitHub/About on row 2.
   Do not `margin-left: auto` or `space-between`.
2. One family card (or Models / About)
3. Account cards in a column
4. One primary CTA → centered Dialog

## Density

Tighter than a marketing Swiss page. Card gap 12px, pane gap 18px,
buttons 32px (primary 36px). Still 13px UI / 12.5px emails.

## Quota

`QuotaRow` is remaining-only on this page. Cursor `kind === 'product'`
is not a used-bar exception. Codex reset credits stay in the card and
still open `WarnDialog`, not the add-account Dialog.

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
