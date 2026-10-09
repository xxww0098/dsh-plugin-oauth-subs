// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// Stylesheet, part 2: usage, models, dialogs, auth, switches, responsive + motion; ensureStyles.

    const CSS_VIEWS = `
/* Usage tab: stat strip, output-on-input bar chart (CSS columns, two tones
   of the accent — never vendor tints), per-model rows with share bars. */
/* No in-card title: the 用量 tab already names the view. The note+actions
   group hugs the left, the range picker the right; in the 分享 image the
   .osubs-noshot controls drop out, so margin-left:auto keeps the picker at
   the right edge there too. */
.osubs-uhead { display: flex; align-items: center; gap: var(--osubs-s3); flex-wrap: wrap; }
.osubs-uhead > .osubs-seg { margin-left: auto; }
.osubs-uhead-note { margin-right: 2px; }
/* Skipped when the card is cloned for 分享; lays out as if absent. */
.osubs-noshot { display: contents; }
.osubs-dsw-card--shot { width: min(720px, 100%); }
/* 分享, macOS style: a white flash over the captured card, then a floating
   thumbnail in the window's bottom-right corner (ShotThumb animates it in). */
.osubs-flash {
  position: fixed; z-index: 60; pointer-events: none;
  background: #fff; border-radius: 14px;
  animation: osubs-flash 380ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes osubs-flash { 0% { opacity: 0; } 16% { opacity: 0.88; } 100% { opacity: 0; } }
.osubs-thumb {
  position: fixed; z-index: 61; padding: 0; overflow: hidden; cursor: pointer;
  background: var(--dsw-alias-bg-layer-2, Canvas);
  border: 1px solid var(--osubs-edge); border-radius: 10px;
  box-shadow: 0 14px 34px -10px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.04);
}
.osubs-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.osubs-thumb:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-thumb-badge {
  position: absolute; left: 6px; bottom: 6px; padding: 2px 7px;
  font-size: 11px; line-height: 1.4; color: #fff;
  background: rgba(0, 0, 0, 0.62); border-radius: 999px;
}
.osubs-shot {
  max-height: min(62vh, 640px); overflow-y: auto;
  border: 1px solid var(--osubs-line); border-radius: 10px;
}
.osubs-shot img { display: block; width: 100%; height: auto; }
/* auto-fit: the five stat cards (incl. the cost estimate) sit in one row on a
   wide pane and wrap evenly when narrow; the 560px rule pins 2 columns. */
.osubs-ustats { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: var(--osubs-s3); }
.osubs-ustat {
  display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 10px 12px;
  border: 1px solid var(--osubs-line); border-radius: 10px;
}
.osubs-ustat-l { font-size: 11px; color: var(--osubs-muted); }
.osubs-ustat-v { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.osubs-ustat-s { font-size: 11px; color: var(--osubs-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Input/output read as two tones of the accent with no legend — the stat
   sub-line and each bar's tooltip name them. */
.osubs-ubar-in { background: color-mix(in oklab, var(--osubs-accent) 42%, transparent); }
.osubs-ubar-out { background: var(--osubs-accent); }
.osubs-uchart {
  display: grid; grid-template-columns: auto 1fr; grid-template-rows: 180px auto;
  column-gap: 8px; row-gap: 6px;
}
.osubs-uaxis {
  display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end;
  font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
  margin: -0.6em 0;
}
/* Gridlines at 50% / 100%: recessive hairlines behind the bars. */
.osubs-uplot {
  position: relative; display: flex; align-items: flex-end; gap: 2px;
  border-bottom: 1px solid var(--osubs-edge);
  background:
    linear-gradient(var(--osubs-hair), var(--osubs-hair)) top / 100% 1px no-repeat,
    linear-gradient(var(--osubs-hair), var(--osubs-hair)) center / 100% 1px no-repeat;
}
.osubs-ucol {
  position: relative; flex: 1 1 0; min-width: 0; height: 100%;
  display: flex; align-items: flex-end; justify-content: center;
  border-radius: 4px; outline: none; cursor: default;
}
.osubs-ucol:hover, .osubs-ucol--on { background: var(--osubs-fill); }
.osubs-ucol:focus-visible { box-shadow: inset 0 0 0 2px var(--osubs-ring); }
.osubs-ubar {
  display: flex; flex-direction: column; width: min(100%, 28px);
  border-radius: 4px 4px 0 0; overflow: hidden;
  transition: height 240ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-ubar > i { display: block; flex-basis: 0; min-height: 0; }
.osubs-ubar-out + .osubs-ubar-in { border-top: 1px solid var(--dsw-alias-bg-layer-2, Canvas); }
.osubs-ucol--on .osubs-ubar { filter: saturate(1.25) brightness(1.06); }
.osubs-utip { top: 4px; left: calc(100% + 6px); min-width: 150px; pointer-events: none; }
.osubs-utip--end { left: auto; right: calc(100% + 6px); }
.osubs-uxlabels {
  grid-column: 2; display: flex; gap: 2px;
  font-size: 11px; color: var(--osubs-faint); font-variant-numeric: tabular-nums;
}
.osubs-uxlabels > span { flex: 1 1 0; min-width: 0; text-align: center; white-space: nowrap; overflow: visible; }
.osubs-utable { display: flex; flex-direction: column; margin-top: var(--osubs-s3); }
.osubs-urow {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(56px, 18%) 200px;
  align-items: center; gap: var(--osubs-s3); padding: 8px 2px;
  border-top: 1px solid var(--osubs-hair);
}
.osubs-urow--head { border-top: 0; padding-top: 0; font-size: 11px; color: var(--osubs-muted); }
.osubs-umodel { display: flex; align-items: center; gap: 8px; min-width: 0; }
.osubs-umodel-who { display: flex; flex-direction: column; min-width: 0; }
.osubs-umodel-n, .osubs-umodel-s { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.osubs-umodel-s { font-size: 11px; color: var(--osubs-faint); }
.osubs-unum { display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; }
.osubs-unum small { font-size: 11px; color: var(--osubs-faint); white-space: nowrap; }
.osubs-ushare { height: 6px; border-radius: 3px; background: var(--osubs-fill); overflow: hidden; }
.osubs-ushare > i { display: block; height: 100%; border-radius: 3px; background: color-mix(in oklab, var(--osubs-accent) 72%, transparent); }
/* The 按模型/按会话 head: the label left, the toggle right (out of shots). */
.osubs-urow--pick { display: flex; justify-content: space-between; align-items: center; }
.osubs-useg { display: inline-flex; gap: 4px; }
.osubs-usess-n { display: inline-flex; align-items: center; gap: 6px; }
.osubs-ucopy {
  font: inherit; font-size: 11px; font-family: var(--osubs-mono, ui-monospace, monospace);
  color: var(--osubs-muted); background: none; border: 1px solid var(--osubs-line);
  border-radius: 5px; padding: 0 5px; cursor: pointer; line-height: 18px;
}
.osubs-ucopy:hover { color: var(--osubs-ink); border-color: var(--osubs-muted); }
/* Loading skeleton: the tiles and chart hold their place while the first scan runs. */
.osubs-usk { display: flex; flex-direction: column; gap: var(--osubs-s3); }
.osubs-sk { display: block; border-radius: 6px; background: var(--osubs-fill); animation: osubs-pulse 1.4s ease-in-out infinite; }
.osubs-sk--n { width: 56%; height: 22px; margin-top: 4px; }
.osubs-sk--l { width: 36%; height: 11px; margin-top: 6px; }
.osubs-sk--chart { height: 200px; }
@media (max-width: 560px) {
  .osubs-ustats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .osubs-urow { grid-template-columns: minmax(0, 1fr) 150px; }
  .osubs-ushare { display: none; }
}

/* Models-tab price tag + tooltip (src/catalog/rates.json rows). */
.osubs-ptag {
  position: relative; flex: none; display: inline-flex;
  color: var(--osubs-warn); border-radius: 5px; cursor: default;
}
.osubs-ptag svg { width: 12px; height: 12px; display: block; }
.osubs-ptag:hover, .osubs-ptag:focus-visible {
  color: color-mix(in oklab, var(--osubs-warn) 80%, currentColor);
}
.osubs-ptag:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-ptag .osubs-rtip { top: calc(100% + 4px); padding: 9px 11px; gap: 5px; }
.osubs-ptip-line { display: flex; align-items: baseline; justify-content: space-between; gap: 18px; }
.osubs-ptip-l { color: var(--osubs-muted); }
.osubs-ptip-v { font-variant-numeric: tabular-nums; }
.osubs-ptip-sep { border-top: 1px solid var(--osubs-line); margin: 3px 0; }
.osubs-ptip-note { color: var(--osubs-faint); font-size: 11px; white-space: normal; max-width: 240px; line-height: 1.45; }
.osubs-rstack--empty .osubs-rcard-n { color: var(--osubs-faint); }
.osubs-rstack--empty .osubs-rcard-u { color: var(--osubs-faint); }
.osubs-rstack--busy .osubs-rcard {
  transform: translateY(-3px);
  box-shadow: var(--rcard-edge), 0 4px 10px -5px color-mix(in oklab, currentColor 45%, transparent);
}

/* Urgent: the earliest banked card expires inside 24h. The stack's ink
   (face + the cards stepped to its right) goes bad-red; under 1h the face breathes with a
   period that tightens as expiry nears, and under 10min the face swaps
   the count for a live seconds countdown. */
.osubs-rstack { transition: color 480ms cubic-bezier(0.16, 1, 0.3, 1), width 200ms cubic-bezier(0.16, 1, 0.3, 1); }
.osubs-rstack--urgent { color: var(--osubs-bad); }
.osubs-rcard::after {
  content: ''; position: absolute; inset: 2px; border-radius: 5px;
  background: var(--osubs-bad); opacity: 0; pointer-events: none;
  transition: opacity 480ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-rstack--urgent .osubs-rcard::after { opacity: 1; }
.osubs-rcard-n, .osubs-rcard-u { position: relative; z-index: 1; }
.osubs-rstack--blink .osubs-rcard {
  animation: osubs-rblink var(--osubs-blink-int, 1600ms) ease-in-out infinite;
}
@keyframes osubs-rblink {
  0%, 100% {
    filter: brightness(1);
    box-shadow: var(--rcard-edge), 0 0 0 0 color-mix(in oklab, var(--osubs-bad) 0%, transparent);
  }
  50% {
    filter: brightness(1.45);
    box-shadow: var(--rcard-edge), 0 2px 12px -1px color-mix(in oklab, var(--osubs-bad) 65%, transparent);
  }
}
.osubs-rcard-n--cd { font-size: 15px; letter-spacing: -0.04em; }
.osubs-rcard-u--cd { color: color-mix(in oklab, var(--dsw-alias-bg-layer-2, Canvas) 85%, transparent); }
@keyframes osubs-rcd-tick {
  from { transform: scale(1.16); }
  to { transform: scale(1); }
}
.osubs-rcard-n--tick { animation: osubs-rcd-tick 300ms cubic-bezier(0.16, 1, 0.3, 1); }
.osubs-reset-rel--bad { color: var(--osubs-bad); font-weight: 600; font-variant-numeric: tabular-nums; }

.osubs-rcard--ghost {
  z-index: 3; pointer-events: none;
  animation: osubs-card-spend 560ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.osubs-rcard-n--in { animation: osubs-count-in 380ms 150ms cubic-bezier(0.16, 1, 0.3, 1) both; }
@keyframes osubs-card-spend {
  0% { transform: translateY(-3px); opacity: 1; }
  28% { transform: translate(3px, -10px) rotate(4deg); opacity: 1; }
  100% { transform: translate(20px, -26px) rotate(15deg) scale(0.9); opacity: 0; filter: blur(1.5px); }
}
@keyframes osubs-count-in {
  from { transform: translateY(70%); opacity: 0; filter: blur(2px); }
  to { transform: none; opacity: 1; filter: none; }
}
@keyframes osubs-fade-out { to { opacity: 0; } }

.osubs-dsw {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.osubs-dsw-mask {
  position: absolute; inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, .24));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
  animation: osubs-fade 240ms ease-out both;
}
.osubs-dsw-card {
  position: relative; z-index: 1;
  animation: osubs-dialog-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
  display: flex; flex-direction: column; gap: 20px;
  width: min(440px, 100%);
  max-height: calc(100vh - 48px);
  padding: 0 0 24px;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-inverted, color-mix(in oklab, currentColor 10%, transparent));
  border-radius: 24px;
  background: var(--dsw-alias-bg-layer-2, Canvas);
  color: var(--dsw-alias-label-primary, CanvasText);
  box-shadow: var(--dsw-shadow-lv3, 0 18px 48px color-mix(in oklab, #000 22%, transparent));
}
.osubs-dsw-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 22px 14px 12px 24px;
}
.osubs-dsw-title {
  margin: 0;
  font-size: 16px; line-height: 24px; font-weight: 500;
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-dsw-x {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 0; border-radius: 8px;
  background: transparent; color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
}
.osubs-dsw-x:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in oklab, currentColor 8%, transparent)); }
.osubs-dsw-x:focus-visible,
.osubs-dsw-btn:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-dsw-card--add { width: min(480px, 100%); }
.osubs-dsw-card:focus { outline: none; }
.osubs-dsw-heading { display: flex; align-items: center; gap: 12px; min-width: 0; }
.osubs-dsw-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.osubs-dsw-sub { margin: 0; font-size: 12px; line-height: 16px; color: var(--osubs-muted, color-mix(in oklab, currentColor 66%, transparent)); }
.osubs-dsw-mark {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: 10px;
  border: 1px solid color-mix(in oklab, currentColor 12%, transparent);
  background: color-mix(in oklab, currentColor 5%, transparent);
}
.osubs-dsw-mark-icon { width: 20px; height: 20px; display: block; }
.osubs-dsw-card--add .osubs-dsw-head { padding-bottom: 4px; }
.osubs-dsw-card--add .osubs-dsw-body input,
.osubs-dsw-card--add .osubs-dsw-body textarea { font-size: 13px; }
.osubs-dsw-error {
  margin: 0; padding: 10px 12px; border-radius: 10px;
  font-size: 12px; line-height: 1.5; overflow-wrap: anywhere;
  color: var(--osubs-bad, #e5484d);
  background: color-mix(in oklab, var(--osubs-bad, #e5484d) 10%, transparent);
  max-height: 6em; overflow-y: auto;
}
.osubs-auth { display: flex; flex-direction: column; gap: 14px; }
.osubs-auth-status { display: flex; align-items: flex-start; gap: 10px; }
.osubs-auth-dot {
  flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%;
  background: var(--osubs-warn, #b45309);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--osubs-warn, #b45309) 18%, transparent);
  animation: osubs-pulse 1.6s ease-in-out infinite;
}
.osubs-auth-copy { display: flex; flex-direction: column; gap: 2px; }
.osubs-auth-title { font-size: 14px; font-weight: 600; line-height: 1.4; }
.osubs-auth-open { align-self: stretch; gap: 6px; text-decoration: none; }
.osubs a.osubs-btn--primary,
.osubs a.osubs-btn--primary:link,
.osubs a.osubs-btn--primary:visited,
.osubs a.osubs-btn--primary:hover {
  color: var(--dsw-alias-label-primary-foreground, Canvas);
  text-decoration: none;
}
.osubs-auth-ext { display: block; flex: none; opacity: .85; }
.osubs-auth-paste { padding-top: 12px; border-top: 1px solid var(--osubs-hair); }
.osubs-auth-foot { display: flex; justify-content: flex-end; }
.osubs-pair {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}
.osubs-pair-label { font-size: 11px; color: var(--osubs-muted); }
.osubs-pair-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 20px; font-weight: 600; letter-spacing: .14em;
  user-select: all;
}
.osubs-pair--lg {
  flex-direction: column; align-items: stretch; gap: 8px;
  padding: 14px; border: 1px dashed var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill); text-align: center;
}
.osubs-pair--lg .osubs-pair-code { font-size: 26px; letter-spacing: .2em; padding: 2px 0; }
.osubs-pair-copy {
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  height: 26px; padding: 0 9px; border: 1px solid var(--osubs-edge); border-radius: 7px;
  background: transparent; color: inherit; font: inherit; font-size: 11.5px; cursor: pointer;
  transition: background-color 140ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-pair--lg .osubs-pair-copy { align-self: center; }
.osubs-pair-copy:hover { background: var(--osubs-fill-2); }
.osubs-pair-copy:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-pair-copy svg { display: block; }
.osubs-dsw-body { display: flex; flex-direction: column; padding: 0 24px; }
.osubs-dsw-body--stack {
  gap: 10px;
  max-height: min(64vh, 520px);
  overflow: auto;
  padding-bottom: 8px;
}
.osubs-dsw-warning {
  display: flex; align-items: flex-start; gap: 10px;
  color: var(--dsw-alias-label-secondary, color-mix(in oklab, currentColor 72%, transparent));
  font-size: 14px; line-height: 22px;
}
.osubs-dsw-warning p { margin: 0; }
.osubs-dsw-icon { flex: none; margin-top: 2px; color: var(--dsw-alias-state-error-primary, #e5484d); }
.osubs-dsw-ack {
  display: flex; align-items: flex-start; gap: 10px; margin-top: 20px;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px; line-height: 22px; cursor: pointer;
}
.osubs-dsw-ack input {
  flex: none; width: 16px; height: 16px; margin: 3px 0 0;
  accent-color: var(--dsw-alias-button-primary-fill, currentColor);
}
.osubs-dsw-foot {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 0 24px;
}
.osubs-dsw-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 36px; padding: 0 16px;
  border-radius: 18px; border: 1px solid transparent;
  background: transparent; color: inherit;
  font: inherit; font-size: 14px; font-weight: 500; line-height: 1;
  cursor: pointer;
}
.osubs-dsw-btn--outline {
  min-width: 72px;
  border-color: var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 18%, transparent));
}
.osubs-dsw-btn--outline:hover { background: var(--dsw-alias-interactive-bg-hover, color-mix(in oklab, currentColor 8%, transparent)); }
.osubs-dsw-btn--primary {
  min-width: 136px;
  background: var(--dsw-alias-button-primary-fill, #0f1115);
  color: var(--dsw-alias-label-primary-foreground, #fff);
}
.osubs-dsw-btn--primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover, color-mix(in oklab, #0f1115 88%, #fff));
}
.osubs-dsw-btn:disabled { opacity: .4; cursor: default; pointer-events: none; }

/* About changelog: wider than the login dialog so three release sections
   read as a list, not a narrow column. Hairlines match the reference
   notes card (title rule, version rule, pinned close). */
.osubs-dsw-card--notes { width: min(640px, 100%); gap: 0; }
.osubs-dsw-card--notes .osubs-dsw-head {
  border-bottom: 1px solid var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 10%, transparent));
}
.osubs-dsw-body--notes {
  overflow: auto;
  padding: 8px 24px 4px;
  gap: 0;
}
.osubs-dsw-card--notes .osubs-dsw-foot {
  padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 10%, transparent));
}
.osubs-notes { display: flex; flex-direction: column; }
.osubs-notes-rel + .osubs-notes-rel {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--dsw-alias-border-l2, color-mix(in oklab, currentColor 10%, transparent));
}
.osubs-notes-ver {
  margin: 10px 0 0;
  font-size: 15px; line-height: 22px; font-weight: 650;
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-notes-sec { margin-top: 14px; }
.osubs-notes-cat {
  margin: 0 0 8px;
  font-size: 14px; line-height: 20px; font-weight: 650;
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-notes-list {
  margin: 0; padding: 0 0 0 1.2em;
  display: flex; flex-direction: column; gap: 8px;
  list-style: disc;
}
.osubs-notes-list li {
  font-size: 13px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary, color-mix(in oklab, currentColor 72%, transparent));
}
.osubs-notes-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
  padding: 0 4px; border-radius: 4px;
  background: color-mix(in oklab, currentColor 8%, transparent);
  color: var(--dsw-alias-label-primary, inherit);
}
.osubs-notes-status {
  margin: 12px 0;
  font-size: 13px; line-height: 1.5;
  color: var(--dsw-alias-label-secondary, var(--osubs-muted));
}

.osubs-mtools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.osubs-msearch { position: relative; flex: 1 1 160px; max-width: 300px; }
.osubs-msearch svg {
  position: absolute; left: 9px; top: 50%; transform: translateY(-50%);
  width: 13px; height: 13px; color: var(--osubs-faint); pointer-events: none;
}
.osubs-msearch input {
  width: 100%; height: 30px; padding: 0 10px 0 28px; box-sizing: border-box;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; caret-color: currentColor;
  font: inherit; font-size: 12px;
}
.osubs-msearch input::placeholder { color: var(--osubs-faint); }
.osubs-msearch input:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-meffort { display: inline-flex; align-items: center; gap: 6px; flex: none; font-size: 12px; }
.osubs-meffort > span { color: var(--osubs-muted); }
.osubs-meffort select {
  height: 30px; padding: 0 8px; border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; font: inherit; font-size: 12px;
}
.osubs-meffort select:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-mcount {
  margin-left: auto; flex: none;
  font-size: 12px; color: var(--osubs-muted); white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.osubs-mtable { border: 1px solid var(--osubs-line); border-radius: 10px; overflow: hidden; }
.osubs-mtable > * + * { border-top: 1px solid var(--osubs-hair); }
.osubs-mhead {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  height: 34px; padding: 0 12px;
  font-size: 11px; color: var(--osubs-faint); background: var(--osubs-fill);
}
.osubs-mgroup {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: 34px; padding: 4px 12px;
  font-size: 12px; font-weight: 700; letter-spacing: .02em;
  background: var(--osubs-fill);
}
.osubs-mgroup-side { display: inline-flex; align-items: center; gap: 8px; flex: none; font-weight: 600; color: var(--osubs-muted); }
.osubs-mrow {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 42px; padding: 4px 12px;
}
.osubs-mrow:hover { background: var(--osubs-fill); }
.osubs-mname { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; font-size: 13px; }
.osubs-vision { flex: none; display: inline-flex; margin-left: -2px; color: var(--osubs-faint); }
.osubs-vision svg { width: 13px; height: 13px; display: block; }
.osubs-mempty { padding: 14px 12px; }

.osubs-switch { position: relative; display: inline-flex; flex: none; cursor: pointer; }
.osubs-switch input {
  position: absolute; width: 1px; height: 1px; margin: 0;
  opacity: 0; pointer-events: none;
}
.osubs-switch-track {
  display: block; width: 34px; height: 20px; border-radius: 99px;
  border: 1px solid var(--osubs-edge); background: var(--osubs-fill-2);
  position: relative;
  transition: background-color 160ms cubic-bezier(0.16, 1, 0.3, 1), border-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-switch-track::before {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 99px;
  background: color-mix(in oklab, currentColor 62%, transparent);
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1), background-color 160ms cubic-bezier(0.16, 1, 0.3, 1);
}
.osubs-switch input:checked ~ .osubs-switch-track {
  background: color-mix(in oklab, var(--osubs-ok) 30%, transparent);
  border-color: color-mix(in oklab, var(--osubs-ok) 60%, transparent);
}
.osubs-switch input:checked ~ .osubs-switch-track::before { transform: translateX(14px); background: var(--osubs-ok); }
.osubs-switch:has(input:focus-visible) .osubs-switch-track { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-switch:has(input:disabled) { cursor: default; opacity: .55; }

@media (max-width: 720px) {
  .osubs { padding: 0 var(--osubs-s3) var(--osubs-s3); }
  .osubs-ptabs {
    margin: 0 calc(-1 * var(--osubs-s3)); padding: 0 var(--osubs-s3);
  }
  .osubs-body { flex-direction: column; }
  .osubs-rail { flex: none; width: 100%; position: static; flex-direction: row; flex-wrap: wrap; }
  .osubs-rail-item { width: auto; }
}

@keyframes osubs-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
@keyframes osubs-spin { to { transform: rotate(360deg) } }
.osubs-refresh { display: inline-flex; align-items: center; gap: 5px; }
.osubs-refresh svg { width: 12px; height: 12px; display: block; }
.osubs-refresh--spin svg { animation: osubs-spin .8s linear infinite; }
@keyframes osubs-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes osubs-dialog-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
@keyframes osubs-tip-in {
  from { opacity: 0; transform: translateY(-3px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .osubs-auth-dot { animation: none !important; }
  .osubs-logins > .osubs-fields, .osubs-glm-logins > form { animation: none !important; }
  .osubs-login::after, .osubs-glm-login::after { transition: none !important; }
  .osubs-dsw-mask,
  .osubs-dsw-card,
  .osubs-hold-tip { animation: none !important; }
  .osubs-vstat--busy .osubs-vstat-ic { animation: none !important; }
  .osubs-refresh--spin svg { animation: osubs-pulse 1.4s ease-in-out infinite !important; }
  .osubs-rstack--blink .osubs-rcard,
  .osubs-rcard-n--tick { animation: none !important; }
  .osubs-bar > i { transition: background-color 160ms ease; }
  .osubs-auto-track, .osubs-auto-track::before,
  .osubs-switch-track, .osubs-switch-track::before,
  .osubs-ctx-fill, .osubs-ctx-thumb, .osubs-ctx-node,
  .osubs-ptab, .osubs-rail-item, .osubs-ubar { transition: none !important; }
  .osubs-sk { animation: none !important; }
  .osubs-flash { display: none; }
  .osubs-dsw-card { transform: none; }
  .osubs-rcard--ghost { animation: osubs-fade-out 240ms ease forwards !important; }
  .osubs-rtip { animation: none !important; }
  .osubs-rcard-n--in { animation: osubs-fade 240ms ease both !important; }
  .osubs-rstack--busy .osubs-rcard { transform: none; }
}
`

    const CSS = CSS_SHELL + CSS_VIEWS

    function ensureStyles() {
      if (typeof document === 'undefined') return
      let el = document.getElementById(STYLE_ID)
      if (!el) {
        el = document.createElement('style')
        el.id = STYLE_ID
        document.head.appendChild(el)
      }
      el.textContent = CSS
    }
