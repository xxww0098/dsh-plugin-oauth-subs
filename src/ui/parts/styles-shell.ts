// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// Stylesheet, part 1: tokens, page shell, cards, accounts, forms, quota rows, reset stack.

    const STYLE_ID = 'dsh-oauth-subs-style'

    const CSS_SHELL = `
.osubs {
  --osubs-line: color-mix(in oklab, currentColor 16%, transparent);
  --osubs-edge: color-mix(in oklab, currentColor 30%, transparent);
  --osubs-hair: color-mix(in oklab, currentColor 10%, transparent);
  --osubs-fill: color-mix(in oklab, currentColor 6%, transparent);
  --osubs-fill-2: color-mix(in oklab, currentColor 12%, transparent);
  --osubs-muted: color-mix(in oklab, currentColor 66%, transparent);
  --osubs-faint: color-mix(in oklab, currentColor 64%, transparent);
  --osubs-ok: color-mix(in oklab, #2f9e44 65%, currentColor);
  --osubs-warn: color-mix(in oklab, #b45309 70%, currentColor);
  --osubs-bad: color-mix(in oklab, #e5484d 62%, currentColor);
  --osubs-ring: color-mix(in oklab, currentColor 45%, transparent);
  --osubs-accent: var(--dsw-alias-button-primary-fill, #4d6bfe);
  --osubs-s1: 4px;
  --osubs-s2: 8px;
  --osubs-s3: 12px;
  --osubs-s4: 16px;
  --osubs-s5: 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 1000px;
  height: 100%;
  padding: 0 var(--osubs-s5) var(--osubs-s5);
  overflow: hidden;
  font-variant-numeric: tabular-nums;
}
.osubs, .osubs * { box-sizing: border-box; min-width: 0; }
.osubs ::selection { background: color-mix(in oklab, currentColor 18%, transparent); }
.osubs p, .osubs h3, .osubs h4 { margin: 0; }

.osubs button,
.osubs [role="button"],
.osubs-link,
.osubs-dsw-mask,
.osubs-dsw-x,
.osubs-dsw-btn { cursor: pointer; }
.osubs-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 32px; padding: 0 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit;
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1;
  white-space: nowrap; cursor: pointer; appearance: none; -webkit-appearance: none;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1), color 140ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-btn:hover:not(:disabled) { background: var(--osubs-fill); border-color: color-mix(in oklab, currentColor 45%, transparent); }
.osubs-btn:active:not(:disabled) { background: var(--osubs-fill-2); }
.osubs-btn:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-btn[disabled] { opacity: .45; cursor: default; background: transparent; border-color: var(--osubs-edge); }
/* Disabled primary keeps its own fill: the transparent reset above would
   leave the primary foreground (white on light hosts) on the page bg. */
.osubs-btn--primary[disabled] {
  opacity: 1; border-color: transparent;
  background: var(--osubs-fill-2);
  color: var(--osubs-faint);
}
.osubs-btn--primary {
  height: 36px; padding: 0 16px; font-size: 13px; font-weight: 600;
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill, var(--osubs-fill-2));
  color: var(--dsw-alias-label-primary-foreground, inherit);
}
.osubs-btn--primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, color-mix(in oklab, currentColor 19%, transparent));
  border-color: transparent;
}
.osubs-btn--danger {
  font-weight: 600;
  color: var(--osubs-bad);
  border-color: color-mix(in oklab, var(--osubs-bad) 42%, transparent);
  background: color-mix(in oklab, var(--osubs-bad) 14%, transparent);
}
.osubs-btn--danger:hover:not(:disabled) {
  background: color-mix(in oklab, var(--osubs-bad) 22%, transparent);
  border-color: color-mix(in oklab, var(--osubs-bad) 58%, transparent);
}
.osubs-btn--sm { height: 28px; padding: 0 10px; font-size: 11px; }
.osubs-btn--update {
  color: var(--osubs-warn);
  border-color: color-mix(in oklab, var(--osubs-warn) 55%, transparent);
  background: color-mix(in oklab, var(--osubs-warn) 10%, transparent);
}
.osubs-btn--update::after {
  content: ''; width: 6px; height: 6px; margin-left: 6px; border-radius: 50%;
  background: var(--osubs-warn); flex: none;
}
.osubs-btn--update:hover:not(:disabled) {
  background: color-mix(in oklab, var(--osubs-warn) 16%, transparent);
  border-color: color-mix(in oklab, var(--osubs-warn) 70%, transparent);
}

.osubs-seg { display: inline-flex; border: 1px solid var(--osubs-edge); border-radius: 8px; overflow: hidden; flex: none; }
.osubs-seg .osubs-btn { border: 0; border-radius: 0; }
.osubs-seg .osubs-btn + .osubs-btn { box-shadow: inset 1px 0 0 0 var(--osubs-edge); }
.osubs-seg .osubs-btn:focus-visible { outline-offset: -2px; }

.osubs-card {
  display: flex; flex-direction: column; gap: var(--osubs-s3);
  padding: var(--osubs-s4) var(--osubs-s4) 20px;
  border: 1px solid var(--osubs-line); border-radius: 14px;
}
.osubs-card-head {
  display: flex; justify-content: space-between; gap: var(--osubs-s3);
  align-items: center; flex-wrap: wrap;
}
/* Legend card: the provider name sits on the card's top border — the
   line runs out to both sides and is knocked out behind the text
   (fieldset-legend style). Scoped to provider cards only; the Version
   card keeps its plain head. */
.osubs-card--legend { position: relative; }
.osubs-card--legend .osubs-card-title {
  position: absolute; top: 0; left: 8px; transform: translateY(-50%);
  padding: 0 8px; z-index: 1;
  background: var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-card-title {
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
}
/* Fixed three-region layout: this 64px topbar and the family rail never
   move; only .osubs-pane scrolls. The bar is a full-bleed strip with a
   bottom seam; its blank area is a window-drag region, the tab buttons
   stay clickable. */
.osubs-ptabs {
  flex: none;
  display: flex; align-items: flex-end; gap: 18px; height: 64px;
  margin: 0 calc(-1 * var(--osubs-s5)); padding: 0 var(--osubs-s5);
  border-bottom: 1px solid var(--osubs-line);
  -webkit-app-region: drag;
}
.osubs-ptab {
  height: 40px; padding: 0 2px; -webkit-app-region: no-drag;
  border: 0; border-radius: 0;
  background: transparent; color: var(--osubs-muted);
  font: inherit; font-size: 13px; font-weight: 500; line-height: 1;
  cursor: pointer; appearance: none; -webkit-appearance: none;
  box-shadow: inset 0 -2px 0 transparent;
  transition: color 160ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-ptab:hover:not(.osubs-ptab--on) { color: inherit; }
.osubs-ptab--on { color: var(--osubs-accent); box-shadow: inset 0 -2px 0 var(--osubs-accent); }
.osubs-ptab:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: -2px; }
.osubs-body { flex: 1 1 auto; min-height: 0; display: flex; align-items: stretch; gap: 20px; padding-top: var(--osubs-s4); }
/* top padding gives the legend title room to straddle the first card's
   border inside the scrollport instead of clipping at its edge */
.osubs-pane { display: flex; flex-direction: column; gap: var(--osubs-s4); min-width: 0; min-height: 0; flex: 1 1 auto; overflow-y: auto; padding-top: 10px; }
.osubs-pane-panel { display: flex; flex-direction: column; gap: var(--osubs-s4); min-width: 0; }
.osubs-pane-panel[hidden] { display: none !important; }
/* 额度: 分享 sits right above the cards; the list box pads up over the first
   card's legend title (which straddles its border) so the image keeps it. */
.osubs-qbar { display: flex; justify-content: flex-end; margin-bottom: calc(-1 * var(--osubs-s2, 8px)); }
.osubs-qlist { display: flex; flex-direction: column; gap: var(--osubs-s4); padding-top: 12px; margin-top: -12px; }
.osubs-qlist[hidden] { display: none; }
/* Set only while 分享 measures and clones (renderLongShot). */
.osubs-shooting [data-noshot],
.osubs-shooting .osubs-pane-panel:has(> [data-noshot]) { display: none !important; }
.osubs-pane-panel--fill { flex: 1 1 auto; min-height: 0; }
.osubs-pane-panel--fill > .osubs-card { flex: 1 1 auto; min-height: 0; }
.osubs-pane-panel--fill .osubs-mtools,
.osubs-pane-panel--fill .osubs-card > .osubs-note { flex: none; }
.osubs-pane-panel--fill .osubs-mtable { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
.osubs-pane-panel--fill .osubs-mhead {
  position: sticky; top: 0; z-index: 1;
  background: linear-gradient(var(--osubs-fill), var(--osubs-fill)), var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-rail-label {
  padding: 0 10px 4px;
  font-size: 11px; letter-spacing: .04em; color: var(--osubs-faint);
}
.osubs-rail {
  flex: 0 0 176px; display: flex; flex-direction: column; gap: 2px;
  overflow-y: auto; min-height: 0;
}
.osubs-rail-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 32px; padding: 4px 10px;
  border: 0; border-radius: 8px;
  background: transparent; color: inherit;
  font: inherit; font-size: 12.5px; line-height: 1.3; text-align: left;
  cursor: pointer; appearance: none; -webkit-appearance: none;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rail-item:hover:not(.osubs-rail-item--on) { background: var(--osubs-fill); }
.osubs-rail-item--on { background: var(--osubs-fill-2); font-weight: 600; }
.osubs-rail-item:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: -1px; }
.osubs-rail-ic { display: inline-flex; align-items: center; flex: none; color: var(--osubs-muted); }
.osubs-rail-item--on .osubs-rail-ic { color: var(--osubs-accent); }
.osubs-rail-icon { width: 16px; height: 16px; flex: none; }
.osubs-rail-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.osubs-rail-count { flex: none; font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums; }
.osubs-tab-icon { width: 18px; height: 18px; display: block; flex: none; }
.osubs-about { display: flex; flex-direction: column; gap: var(--osubs-s3); font-size: 13px; line-height: 1.45; }
.osubs-about .osubs-link,
.osubs-about .osubs-hint,
.osubs-about .osubs-note { font-size: inherit; font-family: inherit; }
.osubs-kv { display: grid; }
.osubs-kv-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--osubs-s4); flex-wrap: wrap;
  padding: 8px 0; border-top: 1px solid var(--osubs-hair);
  font-size: 13px; line-height: 1.45;
}
.osubs-kv > :first-child { border-top: 0; padding-top: 0; }
.osubs-kv-row > :first-child { color: var(--osubs-muted); flex: none; }
.osubs-kv-row > :last-child { text-align: right; min-width: 0; }
.osubs-select {
  appearance: none; font: inherit; font-size: 13px; line-height: 1.45;
  color: inherit; cursor: pointer; text-align: right;
  background: color-mix(in oklab, currentColor 6%, transparent);
  border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
  border-radius: 8px; padding: 4px 28px 4px 10px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px, 5px 5px; background-repeat: no-repeat;
}
.osubs-select:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-select:disabled { opacity: 0.55; cursor: default; }
.osubs-version-pick { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

/* About status banner: icon tile + one-line conclusion + subcopy; the apply
   CTA or the latest tag docks on the right. Tint encodes actionability —
   warn when an installable release exists, bad on a failed check, neutral
   otherwise (「已是最新」 only gets an ok icon tile, a quiet state stays
   quiet). */
.osubs-vstat {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--osubs-hair); border-radius: 12px;
  background: var(--osubs-fill);
}
.osubs-vstat--warn {
  border-color: color-mix(in oklab, var(--osubs-warn) 42%, transparent);
  background: color-mix(in oklab, var(--osubs-warn) 10%, transparent);
}
.osubs-vstat--bad {
  border-color: color-mix(in oklab, var(--osubs-bad) 42%, transparent);
  background: color-mix(in oklab, var(--osubs-bad) 10%, transparent);
}
.osubs-vstat-ic {
  flex: none; width: 30px; height: 30px; border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--osubs-fill-2); color: var(--osubs-muted);
}
.osubs-vstat-ic svg { width: 15px; height: 15px; display: block; }
.osubs-vstat-ic--ok { color: var(--osubs-ok); background: color-mix(in oklab, var(--osubs-ok) 16%, transparent); }
.osubs-vstat--warn .osubs-vstat-ic { color: var(--osubs-warn); background: color-mix(in oklab, var(--osubs-warn) 16%, transparent); }
.osubs-vstat--bad .osubs-vstat-ic { color: var(--osubs-bad); background: color-mix(in oklab, var(--osubs-bad) 16%, transparent); }
.osubs-vstat-main { flex: 1 1 220px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.osubs-vstat-title { font-size: 13px; font-weight: 600; }
.osubs-vstat-sub { font-size: 11px; line-height: 1.45; color: var(--osubs-faint); }
.osubs-vstat-side { display: flex; align-items: center; gap: 10px; flex: none; margin-left: auto; }
.osubs-vstat-num {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px; color: var(--osubs-muted); white-space: nowrap;
}
.osubs-vstat-num--warn { color: var(--osubs-warn); }
.osubs-vstat--busy .osubs-vstat-ic { animation: osubs-pulse 1.4s ease-in-out infinite; }

/* Auto-update row: whole row toggles, note explains the 15-minute cadence. */
.osubs-kv-row.osubs-auto-row { align-items: center; position: relative; cursor: pointer; }
.osubs-kv-row.osubs-auto-row > :first-child { color: inherit; }
.osubs-auto-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; cursor: pointer; }
.osubs-auto-name { font-size: 13px; line-height: 1.45; }
.osubs-auto-note { font-size: 11px; line-height: 1.45; color: var(--osubs-faint); }
.osubs-auto-row .osubs-auto { flex: none; }
.osubs-auto-row input {
  position: absolute; width: 1px; height: 1px; margin: 0;
  opacity: 0; pointer-events: none;
}
.osubs-auto-track {
  flex: none; width: 30px; height: 17px; border-radius: 99px;
  border: 1px solid var(--osubs-edge); background: var(--osubs-fill-2);
  position: relative;
  transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-auto-track::before {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 11px; height: 11px; border-radius: 99px;
  background: color-mix(in oklab, currentColor 62%, transparent);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-auto-row input:checked ~ .osubs-auto-track {
  background: color-mix(in oklab, var(--osubs-ok) 30%, transparent);
  border-color: color-mix(in oklab, var(--osubs-ok) 60%, transparent);
}
.osubs-auto-row input:checked ~ .osubs-auto-track::before {
  transform: translateX(13px);
  background: var(--osubs-ok);
}
.osubs-auto-row:has(input:focus-visible) { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-about-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.osubs-head-main { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
.osubs-hints { display: flex; flex-direction: column; gap: 8px; }
.osubs-link--icon .osubs-tab-icon { display: inline; width: 13px; height: 13px; margin-right: 4px; vertical-align: -2px; opacity: .85; }

/* Donate tab: QR cards arrive as data URIs from the host (assets/donate/).
   The source codes have different aspect ratios — pin a shared height and
   let width float so the caption row stays level. */
.osubs-donate { display: flex; gap: var(--osubs-s5); flex-wrap: wrap; align-items: center; }
.osubs-donate-qr { display: flex; flex-direction: column; align-items: center; gap: var(--osubs-s2); }
/* Alipay is pushed to the right so the sticker sits between the two codes. */
.osubs-donate-qr--end { margin-left: auto; }
.osubs-donate-qr img { height: 320px; width: auto; max-width: 100%; display: block; border-radius: 10px; }
.osubs-donate-meme { align-self: center; margin: 0 auto; }
.osubs-donate-meme img { height: 200px; width: auto; max-width: 240px; display: block; }
.osubs-donate-name { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: var(--osubs-muted); }
.osubs-donate-name::before { content: ''; flex: none; width: 8px; height: 8px; border-radius: 99px; background: var(--osubs-donate-brand, var(--osubs-muted)); }
.osubs-hold { position: relative; display: inline-flex; align-items: center; user-select: none; }
.osubs-hold-tip {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 8;
  max-width: 240px; padding: 6px 8px;
  font-size: 12px; line-height: 1.4; white-space: normal; text-align: left;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--osubs-line); border-radius: 8px;
  pointer-events: none;
  animation: osubs-tip-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.osubs-acct {
  display: flex; flex-direction: column; gap: 12px; width: 100%;
  padding: 14px 16px 16px;
  border: 1px solid var(--osubs-line); border-radius: 12px;
  background: transparent; color: inherit; font: inherit; text-align: left;
  cursor: pointer;
  transition: border-color 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-acct--on { border-color: color-mix(in oklab, currentColor 60%, transparent); background: transparent; }
.osubs-acct-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--osubs-s3); flex-wrap: wrap;
}
.osubs-acct-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 180px; }
.osubs-acct-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.osubs-accts { display: flex; flex-direction: column; gap: 12px; }
.osubs-acct-add {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  width: 100%; min-height: 34px; padding: 0 14px;
  border: 1px dashed var(--osubs-edge); border-radius: 12px;
  background: transparent; color: var(--osubs-muted);
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1.3;
  cursor: pointer; appearance: none; -webkit-appearance: none;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1), color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-acct-add:hover { background: var(--osubs-fill); color: inherit; border-color: color-mix(in oklab, currentColor 45%, transparent); }
.osubs-acct-add:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-verify {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--osubs-warn) 42%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, var(--osubs-warn) 10%, transparent);
}
.osubs-hint.osubs-warn { color: var(--osubs-warn); }
.osubs-glm-logins { display: flex; flex-direction: column; gap: 6px; }
.osubs-glm-login {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 44px; padding: 10px 14px;
  border: 1px solid var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill-2); color: inherit;
  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.3;
  cursor: pointer; text-align: left; appearance: none; -webkit-appearance: none;
}
.osubs-glm-login:hover { background: color-mix(in oklab, currentColor 19%, transparent); }
.osubs-glm-login:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-glm-ghost {
  background: transparent; font-weight: 500; color: var(--osubs-muted);
}
.osubs-glm-ghost:hover { color: inherit; }
.osubs-logins { display: flex; flex-direction: column; gap: 6px; }
.osubs-login {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 44px; padding: 10px 14px;
  border: 1px solid var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill-2); color: inherit;
  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.3;
  cursor: pointer; text-align: left; appearance: none; -webkit-appearance: none;
}
.osubs-login:hover { background: color-mix(in oklab, currentColor 19%, transparent); }
.osubs-login:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-login-ghost {
  background: transparent; font-weight: 500; color: var(--osubs-muted);
}
.osubs-login-ghost:hover { color: inherit; }
/* Row affordance: chevron points into the flow; an expanded inline form
   turns it down; the pressed row spins until the host answers. */
.osubs-login, .osubs-glm-login {
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1), border-color 140ms cubic-bezier(0.16, 1, 0.3, 1), color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-login > span:first-child, .osubs-glm-login > span:first-child { flex: 1 1 auto; }
.osubs-login::after, .osubs-glm-login::after {
  content: ''; flex: none; width: 6px; height: 6px; margin-right: 3px;
  border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg); opacity: .5;
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 140ms ease;
}
.osubs-login:hover::after, .osubs-glm-login:hover::after { opacity: .9; }
.osubs-login[aria-expanded="true"], .osubs-glm-login[aria-expanded="true"] {
  color: inherit; border-color: color-mix(in oklab, currentColor 45%, transparent);
  background: var(--osubs-fill);
}
.osubs-login[aria-expanded="true"]::after, .osubs-glm-login[aria-expanded="true"]::after { transform: rotate(45deg); opacity: .9; }
.osubs-login[aria-busy="true"]::after, .osubs-glm-login[aria-busy="true"]::after {
  width: 12px; height: 12px; margin-right: 0; border: 1.5px solid currentColor; border-right-color: transparent;
  border-radius: 50%; transform: none; opacity: .8; animation: osubs-spin .7s linear infinite;
}
.osubs-login:disabled, .osubs-glm-login:disabled { cursor: default; }
.osubs-login:disabled:not([aria-busy="true"]), .osubs-glm-login:disabled:not([aria-busy="true"]) { opacity: .5; }
.osubs-login:disabled:hover, .osubs-glm-login:disabled:hover { background: var(--osubs-fill-2); }
.osubs-login-ghost:disabled:hover, .osubs-glm-ghost:disabled:hover { background: transparent; }
.osubs-logins > .osubs-fields, .osubs-glm-logins > form {
  padding: 12px; border: 1px solid var(--osubs-line); border-radius: 12px;
  background: var(--osubs-fill);
  animation: osubs-tip-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.osubs-field-label { font-size: 12px; font-weight: 600; }
.osubs-inline { display: flex; gap: 8px; }
.osubs-inline > .osubs-input { flex: 1 1 auto; height: 36px; }
.osubs-inline > .osubs-btn { height: 36px; flex: none; }
.osubs-fields { display: flex; flex-direction: column; gap: 8px; }
.osubs-fields > .osubs-input {
  flex: none; width: 100%; height: 36px; box-sizing: border-box;
}
.osubs-textarea {
  flex: 1 1 240px; min-height: 72px; padding: 8px 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; caret-color: currentColor; font: inherit; font-size: 12.5px;
  resize: vertical;
}
.osubs-textarea::placeholder { color: var(--osubs-faint); }
.osubs-textarea:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-eyebrow { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--osubs-muted); }
.osubs-tag {
  flex: none; padding: 2px 5px; border-radius: 5px;
  background: var(--osubs-fill-2); color: color-mix(in oklab, currentColor 75%, transparent);
  font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  line-height: 1.4; white-space: nowrap;
}
.osubs-tag--plain { text-transform: none; letter-spacing: .02em; }
.osubs-tag--on {
  color: inherit;
  background: transparent;
  box-shadow: inset 0 0 0 1px color-mix(in oklab, currentColor 55%, transparent);
}
.osubs-tag--warn {
  color: var(--osubs-bad);
  background: color-mix(in oklab, var(--osubs-bad) 14%, transparent);
}
.osubs-tag--ctx {
  border: 0; font-family: inherit; cursor: pointer;
}
.osubs-tag--ctx:hover {
  color: currentColor;
  background: color-mix(in oklab, currentColor 14%, transparent);
}
.osubs-tag--ctx:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-tag--custom {
  color: var(--osubs-ok);
  background: color-mix(in oklab, var(--osubs-ok) 16%, transparent);
}

.osubs-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
.osubs-hint {
  display: block; max-width: 100%;
  font-size: 12px; line-height: 1.55; color: var(--osubs-muted);
  overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap;
}
.osubs-hint.osubs-bad { max-height: 4.65em; overflow-x: hidden; overflow-y: auto; }
.osubs-note { font-size: 11px; color: var(--osubs-faint); white-space: pre-wrap; overflow-wrap: anywhere; }
.osubs-qnote { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
.osubs-qnote-label { font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--osubs-faint); }
.osubs-qnote-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.osubs-qnote-chip { display: inline-flex; align-items: baseline; gap: 4px; font-weight: 500; }
.osubs-qnote-count { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px; color: var(--osubs-muted); }
.osubs-bad { color: var(--osubs-bad); overflow-wrap: anywhere; word-break: break-word; max-width: 100%; }
.osubs-actions { display: flex; flex-wrap: wrap; gap: 8px; }

.osubs-input {
  flex: 1 1 240px; height: 36px; padding: 0 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; caret-color: currentColor; font: inherit; font-size: 12.5px;
}
.osubs-input::placeholder { color: var(--osubs-faint); }
.osubs-input:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
/* A measurement field: mono figures, and a bad-value border that matches
   the readout instead of only tinting the hint text. */
.osubs-input--num {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.osubs-input--bad { border-color: color-mix(in oklab, var(--osubs-bad) 65%, transparent); }

/* Context-window dialog: the fact strip (now / catalog default / ceiling)
   replaces a sentence of hint text. */
.osubs-ctx-stats {
  display: flex; gap: var(--osubs-s4);
  padding: 10px 12px; border-radius: 12px;
  background: var(--osubs-fill);
}
.osubs-ctx-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.osubs-ctx-stat-label {
  font-size: 10px; letter-spacing: .05em; text-transform: uppercase;
  color: var(--osubs-faint);
}
.osubs-ctx-stat-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* "Customized" uses the same green tint as the --custom row tag. */
.osubs-ctx-stat--now .osubs-ctx-stat-value { color: var(--osubs-ok); }

/* The scale is the slider: a quota-bar-idiom track over 0…ceiling you
   drag or arrow-key at a 1K step, writing the draft back as k/m shorthand.
   At rest it shows the row's effective window; a parseable draft repaints
   it accent, an out-of-range draft repaints it bad. Preset nodes sit on
   the track as dots and under it as labels — either fills the draft. */
.osubs-ctx-scale { display: flex; flex-direction: column; gap: 6px; padding: 4px 2px 0; }
.osubs-ctx-readout {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  font-size: 12px; line-height: 1.5; color: var(--osubs-muted);
}
.osubs-ctx-tokens {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
}
.osubs-ctx-readout.osubs-bad .osubs-ctx-pct { color: inherit; }
.osubs-ctx-pct {
  flex: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
.osubs-ctx-slider { position: relative; }
.osubs-ctx-track {
  position: relative; height: 6px; border-radius: 99px;
  background: var(--osubs-hair);
  touch-action: none;
}
.osubs-ctx-track:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 4px; }
/* The knob is purely visual; the track itself owns pointer + keys. */
.osubs-ctx-thumb {
  position: absolute; top: 50%; width: 14px; height: 14px;
  border-radius: 99px; transform: translate(-50%, -50%);
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-edge);
  box-shadow: 0 1px 3px color-mix(in oklab, currentColor 20%, transparent);
  pointer-events: none;
}
/* Preset nodes: small punched dots on the track (same chrome as the
   default tick); the matching labels sit in the ends row below. */
.osubs-ctx-node {
  position: absolute; top: 50%; width: 10px; height: 10px; padding: 0;
  border-radius: 99px; transform: translate(-50%, -50%);
  border: 1px solid var(--osubs-edge);
  background: var(--dsw-alias-bg-layer-2, Canvas);
  cursor: pointer;
}
.osubs-ctx-node:hover:not(:disabled) { border-color: var(--osubs-accent); }
.osubs-ctx-node:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-ctx-key {
  position: absolute; top: 0; padding: 0 4px;
  border: 0; border-radius: 6px; transform: translateX(-50%);
  background: transparent; font: inherit;
  color: var(--osubs-accent); cursor: pointer;
}
.osubs-ctx-key:hover:not(:disabled) { background: var(--osubs-fill); }
.osubs-ctx-key:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-ctx-node:disabled, .osubs-ctx-key:disabled { opacity: .4; cursor: default; }
.osubs-ctx-fill {
  position: absolute; inset: 0; border-radius: 99px;
  transform-origin: left center;
  background: color-mix(in oklab, currentColor 45%, transparent);
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
/* Catalog default sits on the scale as a punched-out marker that reads on
   the hair track and across the fill alike. */
.osubs-ctx-tick {
  position: absolute; top: -3px; bottom: -3px; width: 4px;
  border-radius: 2px; transform: translateX(-50%);
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-edge);
}
.osubs-ctx-ends {
  position: relative;
  display: flex; justify-content: space-between;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
/* Reset docks at the footer's left edge; the rest is the outline
   dialog button's own chrome. */
.osubs-ctx-reset { margin-right: auto; gap: 6px; }
.osubs-ctx-reset svg { display: block; }

.osubs-link { font-size: 12.5px; color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in oklab, currentColor 55%, transparent); width: fit-content; transition: text-decoration-color 140ms cubic-bezier(0.16, 1, 0.3, 1); }
.osubs-link--action { border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; cursor: pointer; }
.osubs-link--action:disabled { cursor: default; opacity: .6; }
.osubs-link:hover { text-decoration-color: currentColor; }
.osubs-link:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; border-radius: 2px; }

.osubs-quota { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid var(--osubs-hair); }

.osubs-qrow { display: flex; flex-direction: column; gap: 6px; }
.osubs-qrow-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12px; }
.osubs-qcluster { display: flex; flex-direction: column; gap: 10px; }
.osubs-qcluster + .osubs-qcluster {
  margin-top: 2px; padding-top: 10px;
  border-top: 1px solid var(--osubs-hair);
}
.osubs-qgroup {
  font-size: 12.5px; font-weight: 600; line-height: 1.35;
  color: var(--osubs-muted);
}
.osubs-qmeter { display: flex; flex-direction: column; gap: 4px; }
.osubs-qreset { font-size: 11px; color: var(--osubs-faint); text-align: right; line-height: 1.35; }
.osubs-bar { height: 6px; border-radius: 99px; background: var(--osubs-hair); overflow: hidden; }
.osubs-bar > i { display: block; height: 100%; border-radius: 99px; background: color-mix(in oklab, currentColor 82%, transparent); transform-origin: left center; transition: background-color 220ms cubic-bezier(0.16, 1, 0.3, 1); }
/* fieldset + legend: the title sits on (and cuts) the dashed top border. */
.osubs-qbox {
  display: flex; flex-direction: column; gap: 0;
  min-width: 0; margin: 2px 0 0; padding: 0 14px 4px;
  border: 1px dashed var(--osubs-edge); border-radius: 10px;
  background: transparent;
}
.osubs-qbox-title {
  font-size: 13px; font-weight: 600; line-height: 1.35;
  padding: 0 6px; margin-left: -6px;
}
.osubs-reset-row {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: 14px;
  min-height: 60px; padding: 10px 0;
  border-radius: 0;
  transition: background-color 700ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-reset-row + .osubs-reset-row { border-top: 1px dashed var(--osubs-line); }
.osubs-reset-row--spent {
  background: color-mix(in oklab, currentColor 6%, transparent);
  transition-duration: 140ms;
}
.osubs-reset-meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.osubs-reset-when { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
.osubs-reset-when::first-letter { text-transform: uppercase; }
.osubs-reset-rel { font-size: 11.5px; color: var(--osubs-muted); }
.osubs-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.osubs-rstack { position: relative; flex: none; width: 40px; height: 44px; margin-top: 6px; }
.osubs-rstack::before, .osubs-rstack::after {
  content: ''; position: absolute; opacity: 0;
  border: 1px solid color-mix(in oklab, currentColor 55%, transparent); border-bottom: 0;
  transition: opacity 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rstack::before { left: 4px; right: 4px; top: -4px; height: 4px; border-radius: 5px 5px 0 0; }
.osubs-rstack::after { left: 8px; right: 8px; top: -7px; height: 3px; border-radius: 4px 4px 0 0; }
.osubs-rstack[data-depth="2"]::before,
.osubs-rstack[data-depth="3"]::before,
.osubs-rstack[data-depth="3"]::after { opacity: 1; }
/* Ink card: currentColor fill; the digits knock out to the host surface. */
.osubs-rcard {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1px solid transparent; border-radius: 7px;
  background: currentColor;
  overflow: hidden;
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rcard-n {
  display: block; font-size: 19px; font-weight: 650; line-height: 1; letter-spacing: -0.02em;
  color: var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-rcard-u { font-size: 10px; line-height: 1; color: color-mix(in oklab, var(--dsw-alias-bg-layer-2, Canvas) 75%, transparent); }
.osubs-rstack--empty .osubs-rcard { border: 1px dashed var(--osubs-edge); background: transparent; }
.osubs-rstack[tabindex] { outline: none; }
.osubs-rstack[tabindex]:focus-visible .osubs-rcard { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-rtip {
  position: absolute; left: 0; top: calc(100% + 8px); z-index: 8;
  display: flex; flex-direction: column; gap: 4px;
  width: max-content; max-width: 260px; padding: 8px 10px;
  font-size: 12px; line-height: 1.4; white-space: nowrap;
  color: inherit;
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-line); border-radius: 8px;
  box-shadow: 0 8px 20px -10px color-mix(in oklab, currentColor 40%, transparent);
  animation: osubs-tip-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.osubs-rtip-line { display: flex; align-items: baseline; gap: 8px; }
.osubs-rtip-i { min-width: 1.2em; text-align: right; color: var(--osubs-muted); font-size: 11px; }
`
