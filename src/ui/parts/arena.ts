// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// The 榜单 tab: arena.ai's public agent leaderboard, read through the `arena`
// RPC and laid out as the workbench's own table (Rank + rank-interval glyph /
// mono model + org mark / Net Improvement with its diverging whisker bar /
// Confirmed Success).

    // Mirrors ARENA_TTL_MS on the host: a stored answer older than this makes
    // entering the tab ask again; 刷新 always does.
    const ARENA_TTL_MS = 60 * 60_000
    const ARENA_STORE = 'dsh-plugin-oauth-subs.arena'
    const ARENA_CATEGORY_STORE = 'dsh-plugin-oauth-subs.arena-category'
    const ARENA_CATEGORIES = [
      ['overall', 'arenaCatOverall', ''],
      ['code', 'arenaCatCode', '/code'],
      ['chat', 'arenaCatChat', '/chat'],
      ['work', 'arenaCatWork', '/work'],
    ] as const
    // The board this tab reads; the footer link goes to the category route
    // being viewed. Routes are not the upstream dataSource
    // slugs (chat → consumer, work → gdp) — never build URLs from those.
    const ARENA_SOURCE_URL = 'https://arena.ai/leaderboard/agent'

    function readStoredArena() {
      try {
        const parsed = JSON.parse(localStorage.getItem(ARENA_STORE) ?? 'null')
        return parsed && typeof parsed.at === 'number' && typeof parsed.boards === 'object' && parsed.boards !== null ? parsed : null
      } catch {
        return null
      }
    }
    function writeStoredArena(data) {
      try { localStorage.setItem(ARENA_STORE, JSON.stringify(data)) } catch { /* quota / private mode */ }
    }
    function readStoredArenaCategory() {
      try {
        const raw = localStorage.getItem(ARENA_CATEGORY_STORE)
        return ARENA_CATEGORIES.some(([id]) => id === raw) ? raw : 'overall'
      } catch {
        return 'overall'
      }
    }
    function writeStoredArenaCategory(id) {
      try { localStorage.setItem(ARENA_CATEGORY_STORE, id) } catch { /* private mode */ }
    }
    const ARENA_VIEW_STORE = 'dsh-plugin-oauth-subs.arena-view'
    function readStoredArenaView() {
      try { return localStorage.getItem(ARENA_VIEW_STORE) === 'pareto' ? 'pareto' : 'rank' } catch { return 'rank' }
    }
    function writeStoredArenaView(id) {
      try { localStorage.setItem(ARENA_VIEW_STORE, id) } catch { /* private mode */ }
    }

    /**
     * The Pareto frontier of `rows`: models no other model beats on both cost
     * (cheaper) and net improvement (higher). Sweep cheapest→dearest keeping
     * every new best. Rows without cost data cannot place on the chart.
     */
    function arenaFrontier(rows, xOf = (row) => row.costUsd) {
      const priced = rows.filter((row) => xOf(row) != null && row.value != null)
        .sort((a, b) => xOf(a) - xOf(b))
      const front = []
      let best = -Infinity
      for (const row of priced) {
        if (row.value > best) { front.push(row); best = row.value }
      }
      return front
    }

    /** `$1.74` / `$0.05` — arena's own cost formatting. */
    const arenaUsd = (n) => (n >= 1 ? `$${String(n.toFixed(2)).replace(/\.?0+$/, '')}` : `$${n.toFixed(2)}`)
    /**
     * `28.8K` / `10K` / `1.5M` — the site's own `formatTokensPerTask`, which
     * takes the *Mtok* figure and rounds it to two decimals BEFORE choosing a
     * branch. That is why 999.6K reads as `1M`, why 227K stays an integer,
     * and why 66.525K reads as `66.5K`; under 1K the raw count shows.
     */
    const arenaTok = (n) => {
      const mtok = Number((n / 1e6).toFixed(2))
      if (mtok >= 1) return `${mtok}M`
      const k = Number((n / 1e3).toFixed(1))
      return k >= 1 ? `${k}K` : String(Math.round(n))
    }
    /** `+14.33%` / `-1.20%` — the pareto view signs its figures. */
    const arenaSignPct = (v) => (v >= 0 ? '+' : '') + arenaPct(v)

    /**
     * The site's `formatPricePerMillionUsd`, read off its own chunk: a whole
     * number keeps no decimals ($15), everything else is fixed to two
     * ($1.40, $0.83). Cost/Task keeps `arenaUsd` — the two agree on every
     * live cost figure, and the price column is the one the formatter was
     * named for.
     */
    const arenaPriceUsd = (n) => (n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`)
    /** `$4 / $20` — the site's Price $/M cell (input / output per million). */
    const arenaPrice = (row, t) => (row.priceIn == null || row.priceOut == null)
      ? t.arenaNoValue
      : `${arenaPriceUsd(row.priceIn)} / ${arenaPriceUsd(row.priceOut)}`

    /**
     * The active projection's X figure for one row: the percentile column the
     * site's task-length filter asks for, falling back to the median (a
     * cached answer from before those fields shipped has neither). Null means
     * the row cannot place — unpriced, or no token sample.
     */
    function arenaXOf(row, metric, pct) {
      if (metric === 'tokens') {
        const m = (pct === '25' ? row.tokensM25 : pct === '95' ? row.tokensM95 : null) ?? row.tokensM
        return m != null ? m * 1e6 : null
      }
      // The trailing `?? null` keeps the contract exact: a row shape without
      // the field at all is as unplaceable as one carrying null.
      return (pct === '25' ? row.costUsd25 : pct === '95' ? row.costUsd95 : null) ?? row.costUsd ?? null
    }

    /**
     * The site's per-(projection, percentile) axis label. ONE string serves
     * both the frontier chart's foot line and the per-task card's sub-line —
     * on the site they are the same `xValueLabel` + `windowLabel` pair
     * ("Median output tokens" + " (last 14 days)"), so p95 reads
     * "Long-task output tokens, P95 (last 14 days)" in both places.
     */
    function arenaAxisLabel(t, metric, pct) {
      const key = (metric === 'tokens' ? 'arenaAxisTokens' : 'arenaAxisCost')
        + (pct === '25' ? 'P25' : pct === '95' ? 'P95' : '')
      return t[key] + t.arenaWindow14
    }

    /** `the median` / `the 25th percentile` — the ⓘ sentence's subject. */
    function arenaStatNoun(t, pct) {
      return t[pct === '25' ? 'arenaStatP25' : pct === '95' ? 'arenaStatP95' : 'arenaStatMedian']
    }

    /**
     * Org → brand-palette scatter swatch, matching the site's
     * `hsl(var(--brand-{color}-{n}))` picks as rendered today.
     */
    const ARENA_SCATTER_COLOR = {
      Anthropic: 'teal', OpenAI: 'blue8', Google: 'yellow', DeepSeek: 'blue7',
      Meta: 'blue8', SpaceXAI: 'neutral7', Tencent: 'blue6', 'Z.ai': 'neutral6',
      Moonshot: 'yellow7', StepFun: 'blue5', Alibaba: 'blue5', Mistral: 'blue5',
      MiniMax: 'yellow8', Upstage: 'red', Xiaomi: 'neutral6',
    }

    /**
     * Per-task card — the second block of the site's pareto page: a header
     * (title + ⓘ popover, sub-line), a right-side legend chip + Sort menu,
     * and the priced models as horizontal bars. It is projection-aware, not
     * cost-only: the site renders the SAME component with `kind: cost |
     * output-mtok`, so the Cost | Output Tokens tab swaps the title
     * ("Cost per Task" → "Output Tokens per Task"), the sub-line, every
     * figure, the bar scale, the Sort options, the ⓘ sentence, and the
     * frontier the Pareto-optimal filter narrows to. Bars scale to the
     * column max of the ACTIVE projection (verified against the site's own
     * inline rect widths, e.g. 66.5K of a 227K max = 29.3124%). The width is
     * the inline SVG rect trick the site uses (hsl(var(--brand-green-8)) — a
     * darker green than the frontier line); frontier members get the green
     * rank tile. Rows render in full — the site hides the tail behind a
     * "+ Show N more" expander, the maintainer wants it expanded.
     */
    function ArenaCostList({ t, rows, metric, pct, xOf }) {
      // The same xOf the chart sweeps, so the card's figures, its bar scale
      // and its Pareto filter can never disagree with the frontier above it.
      const priced = rows.filter((row) => xOf(row) != null && row.value != null)
      const [sort, setSort] = useState('ranking')
      const [open, setOpen] = useState(false)
      const [onlyFront, setOnlyFront] = useState(false)
      const onFrontier = new Set(arenaFrontier(rows, xOf).map((row) => row.model))
      const pool = onlyFront ? priced.filter((row) => onFrontier.has(row.model)) : priced
      // The list always renders in full — the site hides rows behind a
      // "+ Show N more" toggle, but the maintainer wants it expanded so the
      // Pareto-optimal filter reads as the whole frontier, not a window.
      const sorted = [...pool].sort((a, b) => {
        if (sort === 'cost-desc') return xOf(b) - xOf(a)
        if (sort === 'cost-asc') return xOf(a) - xOf(b)
        return (a.rank - b.rank) || (b.value - a.value)
      })
      const max = Math.max(0.0001, ...priced.map((row) => xOf(row)))
      const TRACK = 404 // px — the site's rect tops out at 404 inside a ~508 svg
      const barW = (x) => Math.max(4, (x / max) * TRACK)
      const tokens = metric === 'tokens'
      /** `$1.11/任务` or `61.1K/任务` — one figure per row, both projections. */
      const fig = (row) => (tokens ? arenaTok(xOf(row)) : arenaUsd(xOf(row))) + t.arenaPerTask
      const sortItems = [
        ['ranking', t.arenaSortRanking],
        ['cost-desc', tokens ? t.arenaSortTokensDesc : t.arenaSortCostDesc],
        ['cost-asc', tokens ? t.arenaSortTokensAsc : t.arenaSortCostAsc],
      ]
      return h('div', { className: 'osubs-acostcard' },
        h('div', { className: 'osubs-acost-head' },
          h('div', { className: 'osubs-acost-titlebox' },
            h('h3', { className: 'osubs-acost-title' },
              tokens ? t.arenaCostTitleTokens : t.arenaCostTitle,
              // The site's ⓘ is a Radix tooltip: a short trigger label plus a
              // projection- AND percentile-aware sentence ("Each bar shows the
              // 95th percentile across a model's priced tasks").
              h('button', {
                className: 'osubs-acost-info',
                'aria-label': tokens ? t.arenaCostInfoTokensLabel : t.arenaCostInfoLabel,
                title: fill(tokens ? t.arenaCostInfoTokens : t.arenaCostInfo, { stat: arenaStatNoun(t, pct) }),
              },
                h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
                  h('circle', { cx: 12, cy: 12, r: 10 }),
                  h('path', { d: 'M12 16v-4' }),
                  h('path', { d: 'M12 8h.01' })))),
            h('p', { className: 'osubs-acost-sub' }, arenaAxisLabel(t, metric, pct))),
          h('div', { className: 'osubs-acost-tools' },
            // the site's "Pareto optimal" chip is a filter toggle
            // (aria-pressed + data-slot=tooltip-trigger), not a label —
            // pressing it narrows the list to frontier members only.
            h('button', {
              type: 'button',
              className: `osubs-acost-legend${onlyFront ? ' osubs-acost-legend--on' : ''}`,
              'aria-pressed': onlyFront,
              onClick: () => setOnlyFront((v) => !v),
            },
              h('i', { 'aria-hidden': 'true' }), t.arenaCostLegend),
            h('div', { className: 'osubs-acost-sort' },
              h('button', {
                className: 'osubs-acost-sortbtn', 'aria-haspopup': 'menu', 'aria-expanded': open,
                onClick: () => setOpen((o) => !o),
              },
                `${t.arenaSortPrefix ?? 'Sort'}: ${sortItems.find(([id]) => id === sort)?.[1]}`,
                h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
                  h('path', { d: 'M6 9l6 6 6-6' }))),
              open && h('div', { className: 'osubs-acost-menu', role: 'menu' },
                sortItems.map(([id, label]) => h('button', {
                  key: id, role: 'menuitem',
                  className: `osubs-acost-item${sort === id ? ' osubs-acost-item--on' : ''}`,
                  onClick: () => { setSort(id); setOpen(false) },
                }, label)))))),
        h('div', { className: 'osubs-acost-list' },
          sorted.map((row, i) => h('div', { className: 'osubs-acost-row', key: `${i}-${row.model}` },
            h('span', { className: `osubs-acost-num${onFrontier.has(row.model) ? ' osubs-acost-num--front' : ''}` }, String(i + 1)),
            h(ArenaMark, { org: row.org }),
            h('span', { className: 'osubs-acost-name', title: row.model },
              row.url
                ? h('a', { className: 'osubs-acost-link', href: row.url, target: '_blank', rel: 'noreferrer' }, row.model)
                : row.model),
            h('span', { className: 'osubs-acost-figs osubs-acost-figs--side' },
              h('span', { className: 'osubs-acost-usd' }, fig(row)),
              h('span', { className: `osubs-acost-pct${row.value < 0 ? ' osubs-acost-pct--bad' : ''}` }, arenaSignPct(row.value))),
            h('span', { className: 'osubs-acost-track' },
              h('svg', { className: 'osubs-acost-svg', 'aria-hidden': 'true' },
                h('rect', { x: 0, y: 6, height: 32, rx: 2, width: barW(xOf(row)) })),
              h('span', { className: 'osubs-acost-bar', style: { width: `${(xOf(row) / max) * 100}%` } }),
                h('span', { className: 'osubs-acost-figs osubs-acost-figs--float', style: { left: `${barW(xOf(row)) + 8}px` } },
                h('span', { className: 'osubs-acost-usd' }, fig(row)),
                h('span', { className: `osubs-acost-pct${row.value < 0 ? ' osubs-acost-pct--bad' : ''}` }, arenaSignPct(row.value))))))))
    }

    /**
     * 帕累托 view — the board's Pareto Frontier, charted from the snapshot +
     * costStats payload, to the layout measured on the live page
     * (docs/error.md 2026-10-09).
     *
     * The site draws the chart as a fixed-pixel 788×380 svg (no viewBox)
     * sitting inside a relatively-positioned wrapper; everything but the
     * grid + green polyline is HTML absolutely positioned over it:
     *   - the plot area is (80, 30) → (768, 310), i.e. left margin 80 (Y
     *     ticks at x=-8 relative to the plot's own coordinate system),
     *     top margin 30 (X ticks at y=19 below the plot's bottom),
     *   - background scatters: 8×8 squares at `left:{px-4} top:{py-4}` in
     *     a `overflow-hidden` layer cropped to the plot (44 non-frontier
     *     priced rows), each in `hsl(var(--brand-{color}-{n}))` by org,
     *     opacity .7 — they're HTML divs, not svg circles,
     *   - frontier markers: 28×28 white squares with a 2px rgb(64,184,65)
     *     border and the org icon inside, absolute at `{px-14, py-14}`,
     *     inside a second absolute layer offset (-18, -18) so labels can
     *     overflow the plot top,
     *   - chip labels share the marker layer: sans 10px, centred ~40px
     *     above the marker, lane-shifted when they'd collide, dropped
     *     when no lane fits — the site drops 2 of today's 8,
     *   - the green polyline itself runs through the marker centres and
     *     leads 10px past both plot edges, 2.5px rgb(64,184,65) stroke.
     *   - X ticks ($0.05..$5) are drawn BELOW the plot at svg y≈349
     *     (i.e. `T + PH + 39`), not on top — the earlier "top axis"
     *     reading confused the marker-layer offset for tick position.
     *
     * We keep the svg at fixed 788×380 with no viewBox so a narrow pane
     * letterboxes it like the site's own card (which clips on small
     * viewports rather than rescaling).
     */
    function ArenaPareto({ t, rows }) {
      const [hovered, setHovered] = useState(null) // row ref for the tooltip card
      // The site's X-metric toggle: Cost (USD/task) vs Output Tokens
      // (median output tokens/task, in raw token count from tokensM*1e6).
      // Switching re-derives the frontier — a cheaper-token model is a
      // different winner than a cheaper-dollar one.
      const [metric, setMetric] = useState('cost')
      // The site's task-length dropdown: 25th / 50th / 95th percentile. It
      // only re-keys the X figure — cheaper-at-p25 reshuffles the frontier
      // the same way the metric tab does.
      const [pct, setPct] = useState('50')
      const [pctOpen, setPctOpen] = useState(false)
      // The stored zoom window is in the old metric's log10 space — carrying
      // it across a switch would map dollar ticks onto token ticks. Also
      // re-derives the frontier via the new xOf below.
      const pickMetric = (id) => { setMetric(id); setWin(null); setHovered(null) }
      const pickPct = (id) => { setPct(id); setPctOpen(false); setWin(null); setHovered(null) }
      // Zoom state: the visible X window in log10 space. The full dataset
      // domain is [fullLo, fullHi]; [lo, hi] is the current window the site
      // narrows on ⌘scroll / +/- / drag-pan (an @visx/zoom-style transform).
      const [win, setWin] = useState(null) // null = full extent
      const dragRef = useRef(null)
      const svgRef = useRef(null)
      const wrapRef = useRef(null) // .osubs-apwrap — read its clamped width for tooltip edge-flip
      // The percentile re-keys the X figure — but a stale cache from before
      // the fields shipped has none of them. arenaXOf falls back to P50 rather
      // than emptying `priced` and crashing on the frontier sweep.
      const xOf = (row) => arenaXOf(row, metric, pct)
      const front = arenaFrontier(rows, xOf)
      if (front.length === 0) return h('p', { className: 'osubs-hint' }, t.arenaParetoEmpty)
      const priced = rows.filter((row) => xOf(row) != null && row.value != null)
      const fullLo = Math.log10(Math.min(...priced.map((row) => xOf(row))) * 0.7)
      const fullHi = Math.log10(Math.max(...priced.map((row) => xOf(row))) * 1.3)
      const lo = win ? win[0] : fullLo
      const hi = win ? win[1] : fullHi
      // Clamp a candidate window so it never zooms out past the full extent
      // and never collapses narrower than ~5% of it.
      const clampWin = (a, b) => {
        const MIN = (fullHi - fullLo) * 0.05
        let w = b - a
        if (w < MIN) { const c = (a + b) / 2; a = c - MIN / 2; b = c + MIN / 2; w = MIN }
        const W = fullHi - fullLo
        if (w >= W) return null // back to full extent
        if (a < fullLo) { b += fullLo - a; a = fullLo }
        if (b > fullHi) { a -= b - fullHi; b = fullHi }
        if (a < fullLo) { a = fullLo }
        if (b > fullHi) { b = fullHi }
        return [a, b]
      }
      const zoomAt = (factor, lx) => {
        // factor>1 zooms in (shrinks the window) centred on log-coordinate lx.
        setWin((cur) => {
          const a = cur ? cur[0] : fullLo, b = cur ? cur[1] : fullHi
          return clampWin(lx - (lx - a) / factor, lx + (b - lx) / factor)
        })
      }
      const panBy = (dlx) => setWin((cur) => {
        const a = cur ? cur[0] : fullLo, b = cur ? cur[1] : fullHi
        return clampWin(a + dlx, b + dlx)
      })
      // Per-metric tick ladder + axis/tick formatting. Cost uses the $ ladder
      // the site ships; tokens log-scale over K/M magnitudes.
      const METRIC = metric === 'tokens'
        ? { ladder: [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6], fmt: arenaTok, axis: t.arenaMetricTokens }
        : { ladder: [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20], fmt: arenaUsd, axis: t.arenaMetricCost }
      const ticks = METRIC.ladder.filter((v) => {
        const l = Math.log10(v)
        return l >= lo - 1e-9 && l <= hi + 1e-9
      })
      const vLo = Math.min(0, ...priced.map((row) => row.value))
      const vHi = Math.max(0, ...priced.map((row) => row.value))
      const yMin = vLo - Math.abs(vLo) * 0.34
      const yMax = vHi + Math.abs(vHi) * 0.947
      const yStep = [0.05, 0.1, 0.2, 0.25, 0.5, 1].find((s) => (yMax - yMin) / s <= 9) ?? 1
      const yTicks = []
      for (let v = Math.ceil(yMin / yStep - 1e-9) * yStep; v <= yMax + 1e-9; v += yStep) {
        yTicks.push(Math.round(v * 1e9) / 1e9)
      }
      // Plot rect matches the site exactly: (80,30) → (768,310) inside a
      // 788×380 svg. X ticks live at y=349 (below the plot).
      const W = 788, H = 380, L = 80, T = 30, PW = 688, PH = 280
      const R = L + PW, B = T + PH
      // X is a reversed log scale over the *current window* [lo,hi].
      const px = (c) => L + (hi - Math.log10(Math.max(c, Math.pow(10, lo)))) / (hi - lo) * PW
      const py = (v) => T + (yMax - v) / (yMax - yMin) * PH
      // Convert an svg pixel-x back to a log10 cost — the wheel-zoom anchor.
      const lxAt = (pxv) => hi - ((pxv - L) / PW) * (hi - lo)
      const svgX = (clientX) => {
        const r = svgRef.current && svgRef.current.getBoundingClientRect()
        return r ? (clientX - r.left) * (W / r.width) : L + PW / 2
      }
      const onWheel = (e) => {
        e.preventDefault()
        const f = Math.exp(-(e.deltaY || 0) * 0.0022)
        zoomAt(f, lxAt(svgX(e.clientX)))
      }
      const onDown = (e) => {
        dragRef.current = { x: e.clientX }
        if (e.currentTarget.setPointerCapture) try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
      }
      const onMove = (e) => {
        const d = dragRef.current
        if (!d) return
        const dxPx = e.clientX - d.x
        if (dxPx === 0) return
        d.x = e.clientX
        const r = svgRef.current && svgRef.current.getBoundingClientRect()
        const scale = r ? W / r.width : 1
        panBy((dxPx * scale / PW) * (hi - lo))
      }
      const onUp = () => { dragRef.current = null }
      // A data point is visible when its cost falls inside the current window.
      const inWin = (c) => { const l = Math.log10(c); return l >= lo - 1e-9 && l <= hi + 1e-9 }
      const placed = front.filter((row) => inWin(xOf(row)))
        .map((row) => ({ row, x: px(xOf(row)), y: py(row.value) })).sort((a, b) => b.x - a.x)
      // Frontier line spans all points (so the curve stays continuous across
      // the clip edge) but is clipped to the plot rect; endpoints lead out.
      const allPlaced = front.map((row) => ({ row, x: px(xOf(row)), y: py(row.value) })).sort((a, b) => b.x - a.x)
      const leftEnd = allPlaced[allPlaced.length - 1], rightEnd = allPlaced[0]

      // Chip labels: sans 10px, centred ~40px above their marker. The
      // frontier line and already-placed chips block lanes; a blocked chip
      // steps up in 23px lanes, falls to 30px below its marker, and is
      // dropped when neither fits — the site's own chart drops two of
      // today's eight this way.
      const CHIP_H = 21, LANE = 23
      const chipW = (name) => name.length * 5.4 + 12
      const segs = [[L - 10, leftEnd.y, leftEnd.x, leftEnd.y]]
      for (let i = 0; i < placed.length - 1; i++) segs.push([placed[i].x, placed[i].y, placed[i + 1].x, placed[i + 1].y])
      segs.push([rightEnd.x, rightEnd.y, R + 10, rightEnd.y])
      const lineHits = (x1, y1, x2, y2) => segs.some(([sx1, sy1, sx2, sy2]) => {
        for (let i = 0; i <= 12; i++) {
          const f = i / 12
          const x = sx1 + (sx2 - sx1) * f, y = sy1 + (sy2 - sy1) * f
          if (x >= x1 - 2 && x <= x2 + 2 && y >= y1 - 2 && y <= y2 + 2) return true
        }
        return false
      })
      const chips = []
      for (const p of [...placed].reverse()) {
        const w = chipW(p.row.model)
        const cx = Math.min(Math.max(p.x, L + w / 2 + 2), R - w / 2 - 2)
        const rect = (top) => ({ x1: cx - w / 2, x2: cx + w / 2, y1: top, y2: top + CHIP_H })
        const free = (r) => !lineHits(r.x1, r.y1, r.x2, r.y2)
          && !chips.some((c) => r.x1 < c.x2 - 1 && c.x1 < r.x2 - 1 && Math.abs(r.y1 - c.y1) < LANE)
        let top = null
        if (free(rect(p.y - 40))) top = p.y - 40
        else {
          for (let ty = p.y - 40 - LANE; ty >= T - 18 && top === null; ty -= LANE) if (free(rect(ty))) top = ty
          for (let ty = p.y + 30; ty + CHIP_H <= B + 18 && top === null; ty += LANE) if (free(rect(ty))) top = ty
        }
        if (top === null) continue
        chips.push({ ...rect(top), cx, p })
      }

      const pctTick = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`
      // Marker layer is offset (-18, -18) from the scatter layer (62, 12)
      // — chips can rise 18px above the plot top and dip 18px past the
      // bottom before colliding with the axis band.
      const ML = L - 18, MT = T - 18
      const chart = h('div', { className: 'osubs-apwrap', ref: wrapRef },
        h('svg', {
          // viewBox keeps the 788×380 logical coordinate system so px/py and
          // the HTML overlay offsets stay unchanged — the browser scales the
          // whole thing down when the column is narrower (the site clips at
          // narrow widths; scaling is the same data, just legible).
          className: 'osubs-apchart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t.arenaParetoSub,
          ref: svgRef, onWheel: onWheel, onDoubleClick: () => setWin(null),
          onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerLeave: onUp,
        },
          yTicks.map((v) => h('line', { key: `gy${v}`, className: 'osubs-apgrid', x1: L, x2: R, y1: py(v), y2: py(v) })),
          ticks.map((c) => h('line', { key: `gx${c}`, className: 'osubs-apgrid', x1: px(c), x2: px(c), y1: T, y2: B })),
          h('line', { className: 'osubs-apaxis', x1: L, x2: R, y1: T, y2: T }),
          h('line', { className: 'osubs-apaxis', x1: L, x2: L, y1: T, y2: B }),
          yTicks.map((v) => h('g', { key: `y${v}` },
            h('line', { className: 'osubs-apaxis', x1: L - 8, x2: L, y1: py(v), y2: py(v) }),
            h('text', { className: 'osubs-aptick', x: L - 12, y: py(v) + 4, textAnchor: 'end' }, pctTick(v)))),
          ticks.map((c) => h('g', { key: `x${c}` },
            h('line', { className: 'osubs-apaxis', x1: px(c), x2: px(c), y1: B, y2: B + 8 }),
            h('text', { className: 'osubs-aptick', x: px(c), y: B + 19, textAnchor: 'middle' }, METRIC.fmt(c)))),
          // Clip the frontier to the plot rect so zoomed/panned edges slide
          // off cleanly instead of over-drawing the axes.
          h('defs', null, h('clipPath', { id: 'apclip' }, h('rect', { x: L, y: T, width: PW, height: PH }))),
          h('g', { clipPath: 'url(#apclip)' },
            h('polyline', { className: 'osubs-apline', points: allPlaced.map((p) => `${p.x},${p.y}`).join(' ') }),
            h('line', { className: 'osubs-apline', x1: L - 10, x2: leftEnd.x, y1: leftEnd.y, y2: leftEnd.y }),
            h('line', { className: 'osubs-apline', x1: rightEnd.x, x2: R + 10, y1: rightEnd.y, y2: rightEnd.y })),
          // The site draws a visible r=5 green dot at every frontier point —
          // not an invisible hot-spot. The white marker tile sits on top of it.
          placed.map(({ row, x, y }) => h('circle', {
            key: row.model, className: 'osubs-aphot', cx: x, cy: y, r: 5, fill: '#40b841',
            onMouseEnter: () => setHovered({ row, x, y }),
            onMouseLeave: () => setHovered((cur) => cur?.row === row ? null : cur),
          }))),
        // Background scatter layer: 8×8 org-colored squares, one per
        // non-frontier priced model, clipped to the plot area. Hover lifts
        // one to scale(1.8) + opacity 1 and pops the tooltip card.
        // left/top are percentages of the wrap so the squares stay glued to
        // their data point when the viewBox shrinks below 788px.
        h('div', { className: 'osubs-apscat', 'aria-hidden': 'true' },
          priced.filter((row) => !front.includes(row) && inWin(xOf(row))).map((row) => h('span', {
            key: row.model, className: `osubs-apsc osubs-apsc--${ARENA_SCATTER_COLOR[row.org] ?? 'neutral'}`,
            style: { left: `${((px(xOf(row)) - L) / PW) * 100}%`, top: `${((py(row.value) - T) / PH) * 100}%` },
            onMouseEnter: () => setHovered({ row, x: px(xOf(row)), y: py(row.value) }),
            onMouseLeave: () => setHovered((cur) => cur?.row === row ? null : cur),
          }))),
        // Marker layer: 28×28 white tiles with a 2px green border and the
        // org icon inside, centred on each frontier point. Hover lifts them
        // to scale(1.15). The layer is offset -18/-18 so chip labels can
        // rise above the plot top.
        h('div', { className: 'osubs-apmark', 'aria-hidden': 'true' },
          placed.map(({ row, x, y }) => h('span', {
            key: row.model, className: 'osubs-apmk',
            // Centre on the data point inside the -18/-18-offset layer:
            // left/top is the point's percentage of the layer's 724×316 box
            // and translate(-50%,-50%) drops the tile centre onto it.
            style: { left: `${((x - ML) / 724) * 100}%`, top: `${((y - MT) / 316) * 100}%` },
            onMouseEnter: () => setHovered({ row, x, y }),
            onMouseLeave: () => setHovered((cur) => cur?.row === row ? null : cur),
          }, h(ArenaMark, { org: row.org }))),
          // Site draws a dashed green leader from each chip back to its
          // marker when the label is knocked out of the default centred spot.
          // Leader line: 1px dashed run from the marker down to the bottom of
          // a displaced chip (site draws these so a bumped label still reads
          // as its point). Heights/offsets are layer (724×316) percentages.
          chips.map((c) => h('span', {
            key: `lead-${c.p.row.model}`, className: 'osubs-aplead', 'aria-hidden': 'true',
            style: {
              left: `${((c.cx - ML) / 724) * 100}%`, top: `${((c.p.y - MT) / 316) * 100}%`,
              height: `${(Math.max(0, c.y1 + CHIP_H - c.p.y - 2) / 316) * 100}%`,
            },
          })),
          chips.map((c) => h('span', {
            key: `lab-${c.p.row.model}`, className: 'osubs-aplab',
            style: { left: `${((c.cx - ML) / 724) * 100}%`, top: `${((c.y1 - MT) / 316) * 100}%` },
          }, c.p.row.model))),
        // Tooltip card — 18px icon + name(sm medium) + org·license(xs) +
        // Score/Cost row, anchored centred horizontally on the point and
        // ~10px above it. The wrap clips at the card edge, so near the
        // left/right rim we shift the anchor to keep the ~220px card inside
        // the wrap; near the top we flip below.
        hovered && h('div', {
          className: `osubs-aptip${hovered.y < 90 ? ' osubs-aptip--below' : ''}`, role: 'tooltip',
          style: (() => {
            // Keep the ~220px card inside the *visible* wrap — the wrap clips
            // at the column edge, so use its rendered width, not the svg's 788.
            // hovered.x/y are viewBox coords; scale to the rendered wrap.
            const wrapW = wrapRef.current ? wrapRef.current.clientWidth : W
            const wrapH = wrapRef.current ? wrapRef.current.clientHeight : H
            const HALF = 110 + 8 // half card + edge pad
            const cx = Math.min(Math.max(hovered.x * (wrapW / W), HALF), Math.max(HALF, wrapW - HALF))
            return { left: `${cx}px`, top: `${hovered.y * (wrapH / H)}px` }
          })(),
        },
          h(ArenaMark, { org: hovered.row.org }),
          h('div', { className: 'osubs-aptip-body' },
            h('p', { className: 'osubs-aptip-name' }, hovered.row.model),
            h('p', { className: 'osubs-aptip-org' }, [hovered.row.org, hovered.row.license].filter(Boolean).join(' · ')),
            h('p', { className: 'osubs-aptip-figs' },
              h('span', null, `${t.arenaScore}: `, h('b', { className: 'osubs-aptip-pos' }, arenaSignPct(hovered.row.value))),
              h('span', null, `${metric === 'tokens' ? t.arenaMetricTokens : t.arenaCostPerTask}: `,
                metric === 'tokens' ? arenaTok(xOf(hovered.row)) : arenaUsd(xOf(hovered.row)))))))

      // The site's list below the chart is the frontier itself, ranked by
      // improvement: a green timeline of square nodes with the model, its
      // org·license line, and value/cost on the right. It carries its own
      // "Pareto Optimal Models" heading — and on the site BOTH the sub-line
      // (Net Improvement x Cost/task → x Output tokens) and the right-hand
      // figure follow the metric tab (28.8K/task vs $1.77/task).
      const ranked = [...front].sort((a, b) => b.value - a.value)
      const fig = (row) => metric === 'tokens'
        ? `${arenaTok(xOf(row))}${t.arenaPerTask}`
        : `${arenaUsd(xOf(row))}${t.arenaPerTask}`
      const list = h('aside', { className: 'osubs-apside' },
        h('header', { className: 'osubs-aphead osubs-aphead--side' },
          h('div', { className: 'osubs-aphead-l' },
            h('span', { className: 'osubs-aptitle' }, t.arenaOptimalTitle),
            h('span', { className: 'osubs-apsub' }, fill(t.arenaOptimalSub, { n: metric === 'tokens' ? t.arenaMetricTokens : t.arenaMetricCostAxis })))),
        h('div', { className: 'osubs-aplist' },
          ranked.map((row, i) => h('div', { className: 'osubs-aprow', key: row.model },
            h('span', { className: 'osubs-apnode', 'aria-hidden': 'true' },
              i < ranked.length - 1 && h('i', null)),
            h(ArenaMark, { org: row.org }),
            h('span', { className: 'osubs-apwho' },
              row.url
                ? h('a', { className: 'osubs-apname', href: row.url, target: '_blank', rel: 'noreferrer', title: row.model }, row.model)
                : h('span', { className: 'osubs-apname', title: row.model }, row.model),
              h('span', { className: 'osubs-apsub' }, [row.org, row.license].filter(Boolean).join(' · '))),
            h('span', { className: 'osubs-apfigs' },
              h('span', { className: `osubs-apval${row.value < 0 ? ' osubs-apval--bad' : ''}` }, arenaSignPct(row.value)),
              h('span', { className: 'osubs-apcost' }, fig(row)))))))

      return h('div', { className: 'osubs-aparetto' },
        // The site puts chart and optimal list side-by-side inside ONE card:
        // a flex row — chart column (flex-1) on the left, a fixed-width
        // (w-72) optimal-list column on the right, collapsing to stacked on
        // narrow panes (@4xl breakpoint).
        h('div', { className: 'osubs-aptwo' },
          h('div', { className: 'osubs-apmain' },
            h('header', { className: 'osubs-aphead' },
              h('div', { className: 'osubs-aphead-l' },
                h('span', { className: 'osubs-aptitle' }, t.arenaParetoTitle),
                h('span', { className: 'osubs-apsub' }, metric === 'tokens' ? t.arenaParetoSubTokens : t.arenaParetoSub)),
              // The site's chart chrome: a ⌘-scroll hint chip plus a +/−
              // zoom pair. Zoom rescales only the X (cost) log-domain;
              // ⌘scroll / pinch zooms at the pointer, drag pans, dbl-click resets.
              h('div', { className: 'osubs-apctrl' },
                // The site's X-metric segmented control: role=tab +
                // aria-selected, sitting left of the zoom chrome. Switching
                // re-derives the frontier and resets the zoom window.
                h('span', { className: 'osubs-apmetric', role: 'tablist' },
                  [['cost', t.arenaMetricCost], ['tokens', t.arenaMetricTokens]].map(([id, label]) => h('button', {
                    key: id, type: 'button', role: 'tab',
                    className: `osubs-apmetab${metric === id ? ' osubs-apmetab--on' : ''}`,
                    'aria-selected': metric === id,
                    onClick: () => pickMetric(id),
                  }, label))),
                // The site's task-length dropdown — same Radix menu pattern
                // as the cost card's sort button. Each option carries a
                // sub-line (Shorter/Median/Longer tasks).
                h('span', { className: 'osubs-acost-sort osubs-appct' },
                  h('button', {
                    type: 'button', className: 'osubs-acost-sortbtn',
                    'aria-haspopup': 'menu', 'aria-expanded': pctOpen, 'aria-label': t.arenaPctLabel,
                    onClick: () => setPctOpen((o) => !o),
                  },
                    t[`arenaPct${pct}`],
                    h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
                      h('path', { d: 'M6 9l6 6 6-6' }))),
                  pctOpen && h('div', { className: 'osubs-acost-menu', role: 'menu' },
                    [['25', t.arenaPct25, t.arenaPct25Sub], ['50', t.arenaPct50, t.arenaPct50Sub], ['95', t.arenaPct95, t.arenaPct95Sub]].map(([id, label, sub]) => h('button', {
                      key: id, role: 'menuitem',
                      className: `osubs-acost-item osubs-appct-item${pct === id ? ' osubs-acost-item--on' : ''}`,
                      onClick: () => pickPct(id),
                    },
                      h('span', { className: 'osubs-appct-tick', 'aria-hidden': 'true' }, pct === id ? '✓' : ''),
                      h('span', { className: 'osubs-appct-lines' },
                        h('span', { className: 'osubs-appct-name' }, label),
                        h('span', { className: 'osubs-appct-sub' }, sub)))))),
                h('span', { className: 'osubs-apscroll' },
                  h('kbd', { className: 'osubs-apkbd' }, '⌘'), t.arenaScrollHint),
                h('span', { className: 'osubs-apzoom' },
                  h('button', {
                    type: 'button', className: 'osubs-apzoomb', 'aria-label': t.arenaZoomIn,
                    onClick: () => zoomAt(1.4, (lo + hi) / 2),
                  }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M12 5v14M5 12h14' }))),
                  h('button', {
                    type: 'button', className: 'osubs-apzoomb', 'aria-label': t.arenaZoomOut,
                    onClick: () => zoomAt(1 / 1.4, (lo + hi) / 2),
                  }, h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', 'aria-hidden': 'true' }, h('path', { d: 'M5 12h14' })))))),
            chart,
            // The site draws the axis caption under the plot from the same
            // (projection, percentile) label the per-task card's sub-line
            // uses — one string, two places.
            h('p', { className: 'osubs-apfoot' }, arenaAxisLabel(t, metric, pct))),
          list),
        // The per-task card follows the SAME projection: swapping Cost for
        // Output Tokens re-renders its title, sub-line, figures, bar scale,
        // Sort labels, ⓘ sentence and frontier filter.
        h(ArenaCostList, { t, rows, metric, pct, xOf }))
    }

    /**
     * Org marks — real svg inner markup pulled from the arena.ai leaderboard
     * (docs/error.md 2026-10-09 第七次追加). Each entry is `viewBox` + the
     * verbatim child elements of the site's icon svg. Gradient/clipPath
     * ids are rewritten to a per-org stable key (`ag-{org}`) so two
     * different orgs can't collide on React's `_r_*_` ids.
     */
    const ARENA_EXTRA_MARKS = {
      Anthropic: { viewBox: '0 0 24 24', raw: '<path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z"></path>' },
      DeepSeek: { viewBox: '0 0 24 24', raw: '<path d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z" fill="#4D6BFE"></path>' },
      'Z.ai': { viewBox: '0 0 1000 1000', raw: '<rect width="1000" height="1000" rx="151.97" fill="#000000" class="fill-black dark:fill-white"></rect><path d="M517.21,207.58l-48.19,68.5c-7.57,10.67-19.97,17.21-33.39,17.21H172.99v-86.06C172.99,207.58,517.21,207.58,517.21,207.58z" fill="#ffffff" class="fill-white dark:fill-black"></path><path d="M844.22,207.58L431.16,792.76H155.78L568.84,207.58H844.22z" fill="#ffffff" class="fill-white dark:fill-black"></path><path d="M482.79,792.76l48.54-68.84c7.57-10.67,19.97-17.21,33.39-17.21h262.3v86.06H482.79z" fill="#ffffff" class="fill-white dark:fill-black"></path>' },
      OpenAI: { viewBox: '0 0 16 16', raw: '<path d="M14.9449 6.54871C15.3128 5.45919 15.1861 4.26567 14.5978 3.27464C13.7131 1.75461 11.9345 0.972595 10.1974 1.3406C9.42464 0.481584 8.3144 -0.00692594 7.15045 7.42132e-05C5.37487 -0.00392587 3.79946 1.1241 3.2532 2.79113C2.11256 3.02164 1.12799 3.72615 0.551837 4.72468C-0.339497 6.24071 -0.1363 8.15175 1.05451 9.45178C0.686626 10.5413 0.813308 11.7348 1.40162 12.7258C2.28637 14.2459 4.06498 15.0279 5.80204 14.6599C6.5743 15.5189 7.68504 16.0074 8.849 15.9999C10.6256 16.0044 12.2015 14.8754 12.7478 13.2069C13.8884 12.9764 14.873 12.2718 15.4491 11.2733C16.3394 9.75728 16.1357 7.84774 14.9454 6.54771L14.9449 6.54871ZM8.85001 14.9544C8.13907 14.9554 7.45043 14.7099 6.90468 14.2604C6.92951 14.2474 6.97259 14.2239 7.00046 14.2069L10.2293 12.3668C10.3945 12.2743 10.4959 12.1008 10.4949 11.9133V7.42173L11.8595 8.19925C11.8742 8.20625 11.8838 8.22025 11.8858 8.23625V11.9558C11.8838 13.6099 10.5263 14.9509 8.85001 14.9544ZM2.32133 12.2028C1.9651 11.5958 1.8369 10.8843 1.95902 10.1938C1.98284 10.2078 2.02489 10.2333 2.05479 10.2503L5.28366 12.0903C5.44733 12.1848 5.65003 12.1848 5.81421 12.0903L9.75604 9.84429V11.3993C9.75705 11.4153 9.74945 11.4308 9.73678 11.4408L6.47295 13.3004C5.01915 14.1264 3.1625 13.6354 2.32184 12.2028H2.32133ZM1.47155 5.24819C1.82626 4.64017 2.38619 4.17516 3.05305 3.93366C3.05305 3.96116 3.05152 4.00966 3.05152 4.04366V7.72424C3.05051 7.91124 3.15186 8.08475 3.31654 8.17725L7.25838 10.4228L5.89376 11.2003C5.88008 11.2093 5.86285 11.2108 5.84765 11.2043L2.58331 9.34327C1.13255 8.51426 0.63494 6.68272 1.47104 5.24869L1.47155 5.24819ZM12.6834 7.82274L8.74157 5.57669L10.1062 4.79968C10.1199 4.79068 10.1371 4.78918 10.1523 4.79568L13.4166 6.65522C14.8699 7.48373 15.3681 9.31827 14.5284 10.7523C14.1732 11.3593 13.6138 11.8243 12.9474 12.0663V8.27575C12.9489 8.08875 12.8481 7.91574 12.6839 7.82274H12.6834ZM14.0414 5.8057C14.0176 5.7912 13.9756 5.7662 13.9457 5.7492L10.7168 3.90916C10.5531 3.81466 10.3504 3.81466 10.1863 3.90916L6.24442 6.15521V4.60017C6.2434 4.58417 6.251 4.56867 6.26367 4.55867L9.52751 2.70063C10.9813 1.87311 12.84 2.36563 13.6781 3.80066C14.0323 4.40667 14.1605 5.11618 14.0404 5.8057H14.0414ZM5.50257 8.57726L4.13744 7.79974C4.12275 7.79274 4.11312 7.77874 4.11109 7.76274V4.04316C4.11211 2.38713 5.47368 1.0451 7.15197 1.0461C7.86189 1.0461 8.54902 1.2921 9.09476 1.74011C9.06993 1.75311 9.02737 1.77661 8.99899 1.79361L5.77012 3.63365C5.60493 3.72615 5.50358 3.89916 5.50459 4.08666L5.50257 8.57626V8.57726ZM6.24391 7.00022L7.99972 5.9997L9.75553 6.99972V9.00027L7.99972 10.0003L6.24391 9.00027V7.00022Z"></path>' },
      Google: { viewBox: '0 0 24 24', raw: '<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path><path d="M1 1h22v22H1z" fill="none"></path>' },
      SpaceXAI: { viewBox: '69 99 832 319', raw: '<path d="M900.551 99.7843C804.619 107.606 427.549 154.353 166.092 417.192H69.0684L79.9091 406.388C134.623 353.529 376.727 129.506 900.551 99.4932V99.7843Z"></path><path d="M572.178 417.192H496.133L346.301 308.126C360.108 299.443 374.004 291.173 387.943 283.297L572.178 417.192Z"></path><path d="M450.645 417.193H374.634L351.576 400.422H222.839C231.902 392.374 241.077 384.561 250.349 376.977H319.308L283.623 351.019C296.378 341.528 309.274 332.437 322.274 323.728L450.645 417.193Z"></path><path d="M173.984 216.084L232.598 258.681C218.01 267.271 204.357 275.774 191.613 284.091L98.0385 216.047L173.984 216.084Z"></path>' },
      Moonshot: { viewBox: '0 0 24 25', raw: '<path fill="#1783FF" d="M21.7202 0.939941C22.9502 0.939941 23.9502 1.93994 23.9502 3.16994C23.9502 4.39994 22.9502 5.39994 21.7202 5.39994H19.7502C19.6002 5.39994 19.4902 5.27994 19.4902 5.13994V3.16994C19.4902 1.93994 20.4902 0.939941 21.7202 0.939941Z"></path><path class="fill-black dark:fill-white" d="M9.39 13.9501L17.82 5.59012C17.98 5.43012 17.89 5.12012 17.68 5.12012H13.14C13.14 5.12012 13.04 5.14012 13 5.18012L3.92 14.1901C3.78 14.3301 3.57 14.2101 3.57 13.9801V5.39012C3.57 5.24012 3.47 5.12012 3.35 5.12012H0.219999C0.0999993 5.12012 0 5.24012 0 5.39012V23.9201C0 24.0701 0.0999993 24.1901 0.219999 24.1901H3.35C3.47 24.1901 3.57 24.0701 3.57 23.9201V20.1401C3.57 20.0601 3.6 19.9801 3.65 19.9301L6.47 17.1401C6.54 17.0701 6.63 17.0601 6.71 17.1101L14.24 22.6501C15.47 23.4801 16.85 23.9901 18.25 24.1401C18.37 24.1501 18.48 24.0301 18.48 23.8701V20.3101C18.48 20.1701 18.4 20.0601 18.29 20.0501C17.47 19.9201 16.66 19.6001 15.94 19.1101L9.42 14.3901C9.28 14.3001 9.27 14.0701 9.39 13.9501Z"></path>' },
      Meta: { viewBox: '0 0 24 24', raw: '<path d="M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z" fill="url(#ag-meta-meta-fill-0)"></path><path d="M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z" fill="url(#ag-meta-meta-fill-1)"></path><path d="M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z" fill="url(#ag-meta-meta-fill-2)"></path><path d="M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z" fill="url(#ag-meta-meta-fill-3)"></path><path d="M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z" fill="url(#ag-meta-meta-fill-4)"></path><path d="M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z" fill="url(#ag-meta-meta-fill-5)"></path><path d="M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z" fill="#0082FB"></path><path d="M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z" fill="url(#ag-meta-meta-fill-6)"></path><path d="M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z" fill="#0082FB"></path><path d="M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z" fill="url(#ag-meta-meta-fill-7)"></path><path d="M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z" fill="url(#ag-meta-meta-fill-8)"></path><path d="M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z" fill="url(#ag-meta-meta-fill-9)"></path><path d="M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z" fill="url(#ag-meta-meta-fill-10)"></path><path d="M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z" fill="url(#ag-meta-meta-fill-11)"></path><path d="M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z" fill="url(#ag-meta-meta-fill-12)"></path><defs><linearGradient id="ag-meta-meta-fill-0" x1="75.897%" x2="26.312%" y1="89.199%" y2="12.194%"><stop offset=".06%" stop-color="#0867DF"></stop><stop offset="45.39%" stop-color="#0668E1"></stop><stop offset="85.91%" stop-color="#0064E0"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-1" x1="21.67%" x2="97.068%" y1="75.874%" y2="23.985%"><stop offset="13.23%" stop-color="#0064DF"></stop><stop offset="99.88%" stop-color="#0064E0"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-2" x1="38.263%" x2="60.895%" y1="89.127%" y2="16.131%"><stop offset="1.47%" stop-color="#0072EC"></stop><stop offset="68.81%" stop-color="#0064DF"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-3" x1="47.032%" x2="52.15%" y1="90.19%" y2="15.745%"><stop offset="7.31%" stop-color="#007CF6"></stop><stop offset="99.43%" stop-color="#0072EC"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-4" x1="52.155%" x2="47.591%" y1="58.301%" y2="37.004%"><stop offset="7.31%" stop-color="#007FF9"></stop><stop offset="100%" stop-color="#007CF6"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-5" x1="37.689%" x2="61.961%" y1="12.502%" y2="63.624%"><stop offset="7.31%" stop-color="#007FF9"></stop><stop offset="100%" stop-color="#0082FB"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-6" x1="34.808%" x2="62.313%" y1="68.859%" y2="23.174%"><stop offset="27.99%" stop-color="#007FF8"></stop><stop offset="91.41%" stop-color="#0082FB"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-7" x1="43.762%" x2="57.602%" y1="6.235%" y2="98.514%"><stop offset="0%" stop-color="#0082FB"></stop><stop offset="99.95%" stop-color="#0081FA"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-8" x1="60.055%" x2="39.88%" y1="4.661%" y2="69.077%"><stop offset="6.19%" stop-color="#0081FA"></stop><stop offset="100%" stop-color="#0080F9"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-9" x1="30.282%" x2="61.081%" y1="59.32%" y2="33.244%"><stop offset="0%" stop-color="#027AF3"></stop><stop offset="100%" stop-color="#0080F9"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-10" x1="20.433%" x2="82.112%" y1="50.001%" y2="50.001%"><stop offset="0%" stop-color="#0377EF"></stop><stop offset="99.94%" stop-color="#0279F1"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-11" x1="40.303%" x2="72.394%" y1="35.298%" y2="57.811%"><stop offset=".19%" stop-color="#0471E9"></stop><stop offset="100%" stop-color="#0377EF"></stop></linearGradient><linearGradient id="ag-meta-meta-fill-12" x1="32.254%" x2="68.003%" y1="19.719%" y2="84.908%"><stop offset="27.65%" stop-color="#0867DF"></stop><stop offset="100%" stop-color="#0471E9"></stop></linearGradient></defs>' },
      Xiaomi: { viewBox: '0 0 24 24', raw: '<rect x="2" y="2" width="20" height="20" rx="4.5" stroke="currentColor" stroke-width="1.5" fill="none"></rect><path d="M6.5 16V8.5H8.2L10.2 12.5L12.2 8.5H13.9V16H12.2V11.8L10.2 15.5L8.2 11.8V16H6.5Z" fill="currentColor"></path><path d="M15.3 10.2H17V16H15.3V10.2Z" fill="currentColor"></path><circle cx="16.15" cy="8.8" r="0.95" fill="currentColor"></circle>' },
      MiniMax: { viewBox: '0 0 24 24', raw: '<defs><linearGradient id="ag-minimax" x1="0%" x2="100.182%" y1="50.057%" y2="50.057%"><stop offset="0%" stop-color="#E2167E"></stop><stop offset="100%" stop-color="#FE603C"></stop></linearGradient></defs><path d="M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z" fill="url(#ag-minimax)" fill-rule="nonzero"></path>' },
      Mistral: { viewBox: '0 0 191 135', raw: '<g clip-path="url(#ag-mistral)"><path d="M54.3221 0H27.1531V27.0892H54.3221V0Z" fill="#FFD800"></path><path d="M162.984 0H135.815V27.0892H162.984V0Z" fill="#FFD800"></path><path d="M81.4823 27.0913H27.1531V54.1805H81.4823V27.0913Z" fill="#FFAF00"></path><path d="M162.99 27.0913H108.661V54.1805H162.99V27.0913Z" fill="#FFAF00"></path><path d="M162.972 54.168H27.1531V81.2572H162.972V54.168Z" fill="#FF8205"></path><path d="M54.3221 81.2593H27.1531V108.349H54.3221V81.2593Z" fill="#FA500F"></path><path d="M108.661 81.2593H81.4917V108.349H108.661V81.2593Z" fill="#FA500F"></path><path d="M162.984 81.2593H135.815V108.349H162.984V81.2593Z" fill="#FA500F"></path><path d="M81.4879 108.339H-0.00146484V135.429H81.4879V108.339Z" fill="#E10500"></path><path d="M190.159 108.339H108.661V135.429H190.159V108.339Z" fill="#E10500"></path></g><defs><clipPath id="ag-mistral"><rect width="190.141" height="135" fill="white"></rect></clipPath></defs>' },
      Alibaba: { viewBox: '-120 -117 702 702', raw: '<path d="M230.19 0C236.183 0.986667 241.253 3.32 245.4 7C248.067 9.36667 251.303 13.9167 255.11 20.65C261.63 32.17 265.443 38.8467 266.55 40.68C268.917 44.6067 270.243 49.1967 270.53 54.45C270.535 54.595 270.597 54.7324 270.701 54.8331C270.806 54.9338 270.945 54.9901 271.09 54.99C327.11 55.03 362.75 55.0133 378.01 54.94C386.703 54.9 392.297 55.38 394.79 56.38C403.65 59.95 407.64 64.5 412.81 73.7C415.477 78.4533 418.88 84.3433 423.02 91.37C426.54 97.3433 428.477 101.613 428.83 104.18C430.1 113.45 428.81 119.09 423.63 127.83C420.397 133.277 417.233 138.77 414.14 144.31C408.09 155.14 404.24 160.41 394.14 164.05C391.913 164.857 388.087 165.257 382.66 165.25C247.273 165.203 176.433 165.213 170.14 165.28C162.24 165.367 157.04 164.893 154.54 163.86C146.02 160.35 142.11 156.15 137.12 147.48C129.833 134.84 125.44 127.197 123.94 124.55C120.373 118.283 119.223 111.61 120.49 104.53C121.117 101.043 123.733 95.5367 128.34 88.01C128.407 87.8967 141.797 64.72 168.51 18.48C171.717 12.9267 174.48 9.12333 176.8 7.07C181 3.35 186.07 0.993333 192.01 0H230.19Z" fill="#082DFF"></path><path d="M61.8104 292.97C61.8911 292.921 61.9499 292.844 61.9743 292.754C61.9986 292.664 61.9864 292.569 61.9404 292.49C60.9871 290.783 43.0304 259.687 8.07041 199.2C3.96374 192.093 1.71041 187.24 1.31041 184.64C0.697076 180.66 0.763743 176.647 1.51041 172.6C1.97041 170.107 3.57041 166.47 6.31041 161.69C12.5637 150.783 17.2137 142.803 20.2604 137.75C23.9404 131.643 28.9504 127.503 35.2904 125.33C38.9037 124.097 44.1204 123.553 50.9404 123.7C57.4271 123.84 63.9004 123.847 70.3604 123.72C76.9537 123.593 81.8171 124.11 84.9504 125.27C89.0371 126.783 92.6637 129.057 95.8304 132.09C97.5437 133.737 99.9271 137.237 102.98 142.59C107.34 150.25 142.154 210.557 207.42 323.51C211.667 330.87 213.984 335.837 214.37 338.41C215.004 342.63 214.877 346.91 213.99 351.25C213.53 353.51 211.714 357.353 208.54 362.78C206.387 366.467 202.064 373.9 195.57 385.08C191.877 391.44 186.717 395.687 180.09 397.82C177.044 398.8 172.587 399.287 166.72 399.28C112.94 399.213 84.6404 399.207 81.8204 399.26C74.9471 399.4 70.1404 398.943 67.4004 397.89C63.0404 396.203 59.3037 393.867 56.1904 390.88C54.5104 389.267 52.0504 385.603 48.8104 379.89C44.5771 372.437 40.5937 365.523 36.8604 359.15C32.9471 352.463 31.7537 345.47 33.2804 338.17C33.9804 334.83 35.8004 330.667 38.7404 325.68C45.1671 314.767 49.1804 307.853 50.7804 304.94C53.6704 299.68 56.9304 295.96 61.8104 292.97Z" fill="#082DFF"></path><path d="M293.97 468H255.86C249.84 467.08 244.73 464.777 240.53 461.09C237.783 458.683 234.65 454.337 231.13 448.05C225.804 438.543 222.557 432.873 221.39 431.04C218.43 426.36 216.633 422.273 216 418.78C214.653 411.34 215.767 404.53 219.34 398.35C289.247 277.323 324.903 215.54 326.31 213C330.13 206.093 333.324 201.577 335.89 199.45C341.344 194.943 347.644 192.637 354.79 192.53C365.35 192.383 375.427 192.383 385.02 192.53C392.5 192.643 398.934 194.993 404.32 199.58C406.94 201.807 410.347 206.707 414.54 214.28C416.954 218.633 429.964 241.173 453.57 281.9C457.99 289.513 460.384 294.607 460.75 297.18C461.33 301.207 461.227 305.287 460.44 309.42C459.994 311.773 458.323 315.463 455.43 320.49C452.41 325.73 447.884 333.507 441.85 343.82C438.177 350.113 433.1 354.33 426.62 356.47C423.14 357.61 418.334 358.143 412.2 358.07C401.767 357.943 393.924 357.927 388.67 358.02C382.66 358.13 377.62 357.27 372.63 354.4C372.593 354.379 372.553 354.365 372.511 354.359C372.469 354.354 372.426 354.357 372.385 354.368C372.344 354.379 372.306 354.398 372.272 354.424C372.239 354.451 372.211 354.483 372.19 354.52C351.37 390.513 333.14 422.113 317.5 449.32C314.26 454.947 311.43 458.83 309.01 460.97C304.877 464.617 299.864 466.96 293.97 468Z" fill="#082DFF"></path>' },
      Upstage: { viewBox: '0 0 24 24', raw: '<defs><linearGradient id="ag-upstage" gradientUnits="userSpaceOnUse" x1="11.927" y1="0" x2="11.927" y2="24"><stop offset="0" stop-color="#AEBCFE"></stop><stop offset="1" stop-color="#805DFA"></stop></linearGradient></defs><path d="M19.763 0l-.373 1.297h2.594L22.354 0h-2.591zM16.192 2.27l-.376 1.298h5.52l.37-1.298h-5.514zM12.897 4.54l-.376 1.298h8.166l.37-1.298h-8.16zM2.85 6.81l-.377 1.298h17.565l.37-1.297H2.848zM3.884 9.081l-.376 1.297H19.39l.37-1.297H3.882zM4.088 24l.376-1.297H1.866L1.5 24h2.588zM7.662 21.73l.376-1.297H2.515L2.15 21.73h5.513zM10.957 19.459l.376-1.297h-8.17l-.366 1.297h8.16zM21.005 17.189l.376-1.297H3.812l-.366 1.297h17.559zM19.967 14.919l.376-1.297H4.461l-.366 1.297h15.872zM18.786 12.649l.376-1.297H4.26l-.366 1.297h14.893z" fill="url(#ag-upstage)"></path>' },
      StepFun: { viewBox: '0 0 24 24', raw: '<path d="M13.422,.0852C6.8417-.6989,.8723,3.9976,.0852,10.578c-.7842,6.5803,3.9124,12.5498,10.4899,13.3368,6.5803,.7842,12.5498-3.9124,13.3368-10.4899C24.6989,6.8417,20.0024,.8723,13.422,.0852Zm-4.6483,19.5279h-4.3869v-4.3869h4.3869v4.3869Zm5.4183,0h-4.3869v-4.3869h4.3869v4.3869Zm0-5.4211h-4.3869v-4.3869h4.3869v4.3869Zm0-5.4183h-4.3869v-4.3869h4.3869v4.3869Zm5.4183,0h-4.3869v-4.3869h4.3869v4.3869Z"></path>' },
      Tencent: { viewBox: '0 0 24 24', raw: '<g fill="none" fill-rule="evenodd"><circle cx="12" cy="12" fill="#0055E9" r="12"></circle><path d="M12 0c.518 0 1.028.033 1.528.096A6.188 6.188 0 0112.12 12.28l-.12.001c-2.99 0-5.242 2.179-5.554 5.11-.223 2.086.353 4.412 2.242 6.146C3.672 22.1 0 17.479 0 12 0 5.373 5.373 0 12 0z" fill="#A8DFF5"></path><path d="M5.286 5a2.438 2.438 0 01.682 3.38c-3.962 5.966-3.215 10.743 2.648 15.136C3.636 22.056 0 17.452 0 12c0-1.787.39-3.482 1.09-5.006.253-.435.525-.872.817-1.311A2.438 2.438 0 015.286 5z" fill="#0055E9"></path><path d="M12.98.04c.272.021.543.053.81.093.583.106 1.117.254 1.538.44 6.638 2.927 8.07 10.052 1.748 15.642a4.125 4.125 0 01-5.822-.358c-1.51-1.706-1.3-4.184.357-5.822.858-.848 3.108-1.223 4.045-2.441 1.257-1.634 2.122-6.009-2.523-7.506L12.98.039z" fill="#00BCFF"></path><path d="M13.528.096A6.187 6.187 0 0112 12.281a5.75 5.75 0 00-1.71.255c.147-.905.595-1.784 1.321-2.501.858-.848 3.108-1.223 4.045-2.441 1.27-1.651 2.14-6.104-2.676-7.554.184.014.367.033.548.056z" fill="#ECECEE"></path></g>' },
      Thinky: { viewBox: '0 0 400 400', raw: '<path d="M64.6888 139.29C73.9954 139.297 79.4621 139.287 81.0887 139.26C81.1644 139.259 81.2397 139.272 81.31 139.3C81.3803 139.327 81.4443 139.368 81.4983 139.42C81.5523 139.472 81.5952 139.535 81.6245 139.603C81.6537 139.672 81.6688 139.745 81.6687 139.82V145.02C81.6687 145.158 81.614 145.29 81.5164 145.388C81.4189 145.485 81.2867 145.54 81.1488 145.54H68.9688C68.8176 145.54 68.6726 145.601 68.5657 145.71C68.4588 145.819 68.3988 145.966 68.3988 146.12V183.27C68.3988 183.352 68.3822 183.433 68.3498 183.508C68.3174 183.583 68.27 183.651 68.2102 183.708C68.1505 183.765 68.0798 183.81 68.0022 183.839C67.9247 183.869 67.8419 183.883 67.7588 183.88C67.1788 183.86 66.1721 183.85 64.7387 183.85C63.3054 183.857 62.2954 183.87 61.7087 183.89C61.6265 183.891 61.5447 183.876 61.4683 183.846C61.3919 183.816 61.3224 183.772 61.2637 183.715C61.2051 183.658 61.1585 183.59 61.1268 183.516C61.095 183.441 61.0787 183.361 61.0788 183.28L60.9987 146.13C60.9987 145.976 60.9387 145.829 60.8318 145.72C60.7249 145.611 60.5799 145.55 60.4287 145.55L48.2487 145.57C48.1805 145.57 48.1128 145.556 48.0498 145.53C47.9867 145.504 47.9293 145.466 47.8811 145.418C47.8328 145.369 47.7945 145.312 47.7683 145.249C47.7422 145.186 47.7287 145.118 47.7287 145.05L47.7188 139.85C47.7187 139.775 47.7338 139.702 47.763 139.633C47.7923 139.565 47.8352 139.502 47.8892 139.45C47.9432 139.398 48.0072 139.357 48.0775 139.33C48.1478 139.302 48.223 139.289 48.2987 139.29C49.9254 139.317 55.3888 139.317 64.6888 139.29Z"></path><path d="M125.549 161.63C125.549 175.496 125.539 182.753 125.519 183.4C125.514 183.537 125.457 183.666 125.36 183.761C125.263 183.857 125.134 183.91 124.999 183.91H118.669C118.545 183.91 118.425 183.86 118.337 183.772C118.249 183.684 118.199 183.564 118.199 183.44V165.2C118.201 165.154 118.193 165.109 118.176 165.067C118.16 165.024 118.135 164.985 118.103 164.953C118.072 164.92 118.034 164.894 117.992 164.877C117.95 164.859 117.905 164.85 117.859 164.85C114.713 164.836 111.453 164.83 108.079 164.83C104.706 164.83 101.446 164.84 98.2994 164.86C98.2092 164.86 98.1227 164.896 98.059 164.959C97.9952 165.023 97.9594 165.11 97.9594 165.2L97.9694 183.45C97.9694 183.574 97.9199 183.694 97.8317 183.782C97.7436 183.87 97.624 183.92 97.4994 183.92H91.1694C91.0365 183.92 90.9085 183.868 90.8118 183.775C90.7151 183.682 90.657 183.555 90.6494 183.42C90.6294 182.766 90.616 175.506 90.6094 161.64C90.6094 147.773 90.6194 140.513 90.6394 139.86C90.647 139.724 90.7051 139.597 90.8018 139.504C90.8985 139.411 91.0265 139.36 91.1594 139.36H97.4894C97.614 139.36 97.7336 139.409 97.8217 139.497C97.9099 139.586 97.9594 139.705 97.9594 139.83V158.07C97.958 158.115 97.9658 158.16 97.9823 158.203C97.9988 158.245 98.0236 158.284 98.0554 158.317C98.0871 158.349 98.125 158.375 98.1669 158.393C98.2088 158.411 98.2539 158.42 98.2994 158.42C101.439 158.433 104.699 158.44 108.079 158.44C111.453 158.44 114.713 158.43 117.859 158.41C117.948 158.407 118.032 158.37 118.093 158.307C118.155 158.243 118.189 158.158 118.189 158.07V139.82C118.189 139.695 118.239 139.576 118.327 139.487C118.415 139.399 118.535 139.35 118.659 139.35H124.979C125.114 139.347 125.244 139.398 125.343 139.491C125.442 139.584 125.502 139.713 125.509 139.85C125.529 140.503 125.543 147.763 125.549 161.63Z"></path><path d="M144.742 139.28H138.342C138.071 139.28 137.852 139.5 137.852 139.77V183.35C137.852 183.621 138.071 183.84 138.342 183.84H144.742C145.012 183.84 145.232 183.621 145.232 183.35V139.77C145.232 139.5 145.012 139.28 144.742 139.28Z"></path><path d="M172.426 163.28C170.366 160.033 167.9 156.206 165.026 151.8C165.005 151.767 164.974 151.743 164.937 151.73C164.901 151.717 164.861 151.716 164.824 151.727C164.787 151.738 164.755 151.761 164.732 151.792C164.709 151.823 164.696 151.861 164.696 151.9L164.706 183.36C164.706 183.497 164.653 183.63 164.557 183.727C164.461 183.825 164.332 183.88 164.196 183.88H158.186C158.048 183.88 157.916 183.825 157.819 183.727C157.721 183.63 157.666 183.497 157.666 183.36L157.656 139.94C157.656 139.764 157.726 139.597 157.85 139.473C157.973 139.349 158.141 139.28 158.316 139.28L163.326 139.27C163.609 139.27 163.887 139.341 164.136 139.475C164.386 139.609 164.599 139.803 164.756 140.04C168.956 146.353 173.253 152.966 177.646 159.88C179.706 163.126 182.173 166.953 185.046 171.36C185.068 171.392 185.099 171.416 185.135 171.429C185.172 171.443 185.211 171.444 185.248 171.432C185.285 171.421 185.318 171.398 185.341 171.367C185.364 171.336 185.376 171.298 185.376 171.26L185.366 139.8C185.366 139.731 185.379 139.664 185.405 139.601C185.431 139.537 185.468 139.48 185.516 139.432C185.563 139.384 185.619 139.345 185.681 139.319C185.743 139.293 185.809 139.28 185.876 139.28L191.886 139.27C192.024 139.27 192.156 139.324 192.254 139.422C192.351 139.519 192.406 139.652 192.406 139.79L192.426 183.22C192.426 183.395 192.357 183.562 192.233 183.686C192.109 183.81 191.941 183.88 191.766 183.88H186.756C186.475 183.88 186.197 183.811 185.948 183.678C185.698 183.546 185.485 183.354 185.326 183.12C181.12 176.806 176.82 170.193 172.426 163.28Z"></path><path d="M219.692 164.97H212.382C212.265 164.97 212.153 165.016 212.07 165.099C211.988 165.181 211.942 165.293 211.942 165.41V183.45C211.942 183.567 211.895 183.679 211.813 183.761C211.73 183.844 211.618 183.89 211.502 183.89H205.042C204.925 183.89 204.813 183.844 204.73 183.761C204.648 183.679 204.602 183.567 204.602 183.45V139.73C204.602 139.613 204.648 139.501 204.73 139.419C204.813 139.336 204.925 139.29 205.042 139.29H211.532C211.648 139.29 211.76 139.336 211.843 139.419C211.925 139.501 211.972 139.613 211.972 139.73V158.05C211.972 158.167 212.018 158.279 212.1 158.361C212.183 158.444 212.295 158.49 212.412 158.49H219.552C219.629 158.49 219.704 158.469 219.771 158.431C219.838 158.392 219.893 158.337 219.932 158.27L230.762 139.51C230.8 139.443 230.855 139.388 230.922 139.349C230.989 139.311 231.064 139.29 231.142 139.29H238.252C238.329 139.29 238.404 139.311 238.471 139.349C238.538 139.388 238.593 139.444 238.632 139.51C238.67 139.577 238.691 139.653 238.691 139.73C238.69 139.807 238.67 139.883 238.632 139.95L226.292 161.31C226.253 161.379 226.233 161.457 226.235 161.536C226.236 161.616 226.26 161.693 226.302 161.76L239.692 183.21C239.732 183.276 239.755 183.352 239.756 183.43C239.758 183.508 239.739 183.585 239.702 183.653C239.664 183.721 239.609 183.778 239.542 183.818C239.476 183.858 239.399 183.879 239.322 183.88H231.972C231.897 183.879 231.824 183.859 231.759 183.823C231.695 183.786 231.64 183.733 231.602 183.67L220.062 165.18C220.023 165.117 219.968 165.064 219.904 165.027C219.839 164.991 219.766 164.971 219.692 164.97Z"></path><path d="M255.428 139.29H249.108C248.815 139.29 248.578 139.527 248.578 139.82V183.34C248.578 183.633 248.815 183.87 249.108 183.87H255.428C255.721 183.87 255.958 183.633 255.958 183.34V139.82C255.958 139.527 255.721 139.29 255.428 139.29Z"></path><path d="M283.182 163.26C281.122 160.013 278.659 156.19 275.792 151.79C275.773 151.752 275.741 151.722 275.703 151.705C275.664 151.688 275.621 151.685 275.58 151.697C275.539 151.709 275.504 151.735 275.481 151.77C275.458 151.805 275.447 151.848 275.452 151.89L275.462 183.33C275.462 183.467 275.408 183.6 275.312 183.697C275.217 183.795 275.087 183.85 274.952 183.85H268.942C268.804 183.85 268.672 183.795 268.574 183.697C268.477 183.6 268.422 183.467 268.422 183.33V139.93C268.422 139.754 268.491 139.587 268.615 139.463C268.739 139.339 268.907 139.27 269.082 139.27H274.082C274.366 139.269 274.646 139.338 274.898 139.473C275.149 139.607 275.363 139.802 275.522 140.04C279.715 146.346 284.005 152.956 288.392 159.87C290.452 163.116 292.915 166.94 295.782 171.34C295.801 171.377 295.832 171.407 295.871 171.424C295.91 171.441 295.953 171.444 295.994 171.432C296.034 171.42 296.069 171.394 296.093 171.359C296.116 171.324 296.126 171.282 296.122 171.24L296.112 139.8C296.112 139.662 296.166 139.529 296.261 139.432C296.357 139.334 296.487 139.28 296.622 139.28H302.632C302.7 139.28 302.768 139.293 302.831 139.319C302.894 139.345 302.951 139.384 303 139.432C303.048 139.48 303.086 139.537 303.112 139.601C303.138 139.664 303.152 139.731 303.152 139.8V183.19C303.152 183.365 303.082 183.532 302.959 183.656C302.835 183.78 302.667 183.85 302.492 183.85H297.492C297.21 183.85 296.932 183.781 296.683 183.648C296.434 183.516 296.22 183.324 296.062 183.09C291.862 176.783 287.569 170.173 283.182 163.26Z"></path><path d="M350.101 160.12V176.06C350.101 176.457 349.943 176.839 349.661 177.12L343.541 183.24C343.345 183.439 343.11 183.598 342.851 183.706C342.592 183.814 342.313 183.87 342.031 183.87H322.311C322.146 183.87 321.981 183.836 321.827 183.771C321.673 183.706 321.531 183.61 321.411 183.49L315.201 177.28C315.068 177.147 314.962 176.99 314.89 176.818C314.818 176.646 314.781 176.464 314.781 176.28V147.23C314.782 146.654 315.008 146.103 315.411 145.7L320.851 140.26C321.156 139.955 321.518 139.714 321.916 139.549C322.314 139.384 322.74 139.3 323.171 139.3H342.201C342.473 139.3 342.743 139.353 342.993 139.458C343.244 139.563 343.471 139.716 343.661 139.91L349.541 145.79C349.9 146.148 350.101 146.633 350.101 147.14V151.59C350.101 151.76 350.034 151.922 349.914 152.042C349.794 152.162 349.631 152.23 349.461 152.23H343.391C343.219 152.23 343.054 152.161 342.932 152.039C342.81 151.918 342.741 151.752 342.741 151.58V149.37C342.741 149.224 342.712 149.08 342.655 148.946C342.598 148.812 342.516 148.691 342.411 148.59L339.751 145.93C339.647 145.822 339.521 145.737 339.382 145.678C339.243 145.62 339.093 145.59 338.941 145.59H325.961C325.768 145.59 325.582 145.665 325.441 145.8L322.551 148.69C322.418 148.823 322.312 148.982 322.24 149.157C322.168 149.332 322.131 149.52 322.131 149.71V172.69C322.131 173.234 322.276 173.772 322.551 174.25C323.038 175.096 323.891 176.04 325.111 177.08C325.376 177.3 325.712 177.42 326.061 177.42H339.001C339.182 177.42 339.361 177.384 339.527 177.316C339.694 177.247 339.845 177.147 339.971 177.02L342.311 174.68C342.505 174.486 342.658 174.256 342.763 174.002C342.868 173.748 342.921 173.475 342.921 173.2V166.42C342.921 166.279 342.865 166.144 342.766 166.045C342.667 165.946 342.532 165.89 342.391 165.89H333.871C333.72 165.89 333.575 165.83 333.468 165.723C333.361 165.616 333.301 165.471 333.301 165.32V160.03C333.301 159.879 333.361 159.734 333.468 159.627C333.575 159.52 333.72 159.46 333.871 159.46H349.451C349.624 159.46 349.789 159.529 349.911 159.653C350.033 159.777 350.101 159.945 350.101 160.12Z"></path><path d="M56.7794 246.6C56.886 246.6 56.9494 246.573 56.9694 246.52C62.3427 234.487 66.7294 224.547 70.1294 216.7C70.2033 216.531 70.3249 216.387 70.4794 216.285C70.634 216.184 70.8146 216.13 70.9994 216.13H76.9294C77.0646 216.13 77.1944 216.184 77.29 216.279C77.3856 216.375 77.4394 216.505 77.4394 216.64V260.41C77.4394 260.492 77.4067 260.571 77.3486 260.629C77.2904 260.687 77.2116 260.72 77.1294 260.72H70.6794C70.6051 260.72 70.5339 260.691 70.4814 260.638C70.4289 260.586 70.3994 260.514 70.3994 260.44V231.93C70.4016 231.882 70.3869 231.834 70.3576 231.796C70.3283 231.758 70.2862 231.732 70.2383 231.722C70.1905 231.711 70.1397 231.717 70.0944 231.739C70.0491 231.76 70.012 231.796 69.9894 231.84L59.4494 254.37C59.3546 254.574 59.2074 254.749 59.023 254.877C58.8385 255.005 58.6233 255.082 58.3994 255.1C58.3727 255.107 57.8327 255.11 56.7794 255.11C55.7194 255.11 55.176 255.107 55.1494 255.1C54.9272 255.08 54.7141 255.003 54.5315 254.875C54.3489 254.746 54.2034 254.572 54.1094 254.37L43.5794 231.83C43.5567 231.786 43.5197 231.75 43.4744 231.729C43.4291 231.707 43.3783 231.701 43.3304 231.712C43.2825 231.722 43.2405 231.749 43.2112 231.786C43.1819 231.824 43.1671 231.872 43.1694 231.92L43.1494 260.43C43.1494 260.504 43.1199 260.576 43.0674 260.628C43.0149 260.681 42.9436 260.71 42.8694 260.71H36.4194C36.3372 260.71 36.2583 260.677 36.2002 260.619C36.142 260.561 36.1094 260.482 36.1094 260.4L36.1394 216.63C36.1394 216.495 36.1931 216.365 36.2887 216.27C36.3844 216.174 36.5141 216.12 36.6494 216.12H42.5794C42.7641 216.12 42.9448 216.174 43.0993 216.275C43.2538 216.377 43.3755 216.521 43.4494 216.69C46.8427 224.543 51.2227 234.487 56.5894 246.52C56.6094 246.573 56.6727 246.6 56.7794 246.6Z"></path><path d="M105.369 250.18C100.836 250.173 98.3227 250.176 97.8294 250.19C97.6014 250.198 97.3814 250.274 97.1978 250.408C97.0142 250.541 96.8754 250.727 96.7994 250.94L93.5394 259.96C93.4572 260.185 93.3076 260.38 93.1108 260.518C92.914 260.656 92.6796 260.73 92.4394 260.73H86.6194C86.5226 260.729 86.4275 260.705 86.3418 260.66C86.2562 260.615 86.1825 260.55 86.1268 260.471C86.0711 260.392 86.035 260.3 86.0216 260.205C86.0081 260.109 86.0176 260.011 86.0494 259.92L101.669 216.73C101.743 216.529 101.884 216.361 102.069 216.254C102.253 216.146 102.469 216.106 102.679 216.14C102.753 216.153 103.653 216.16 105.379 216.16C107.113 216.16 108.016 216.153 108.089 216.14C108.3 216.106 108.516 216.146 108.7 216.254C108.884 216.361 109.026 216.529 109.099 216.73L124.669 259.94C124.701 260.031 124.711 260.129 124.697 260.225C124.684 260.32 124.648 260.412 124.592 260.491C124.536 260.57 124.463 260.635 124.377 260.68C124.291 260.725 124.196 260.749 124.099 260.75L118.279 260.74C118.039 260.74 117.805 260.666 117.608 260.528C117.411 260.39 117.261 260.195 117.179 259.97L113.929 250.95C113.853 250.737 113.715 250.551 113.531 250.418C113.347 250.284 113.127 250.208 112.899 250.2C112.406 250.186 109.896 250.18 105.369 250.18ZM99.0194 243.47C98.9971 243.533 98.9902 243.6 98.9991 243.666C99.008 243.732 99.0326 243.795 99.0707 243.85C99.1088 243.905 99.1594 243.949 99.2183 243.981C99.2772 244.012 99.3427 244.029 99.4094 244.03L111.329 244.01C111.396 244.009 111.462 243.992 111.52 243.961C111.579 243.929 111.63 243.885 111.668 243.83C111.706 243.775 111.731 243.712 111.74 243.646C111.749 243.58 111.742 243.513 111.719 243.45L105.739 226.08C105.712 225.995 105.659 225.921 105.587 225.869C105.515 225.816 105.428 225.788 105.339 225.788C105.25 225.788 105.164 225.816 105.092 225.869C105.02 225.921 104.966 225.995 104.939 226.08L99.0194 243.47Z"></path><path d="M138.909 238.44C138.909 245.994 138.909 249.777 138.909 249.79C138.954 250.173 139.08 250.544 139.279 250.88C139.966 252.02 140.976 253.094 142.309 254.1C142.549 254.282 142.844 254.38 143.149 254.38H155.009C155.2 254.381 155.388 254.34 155.559 254.26C158.159 253.014 159.466 251.097 159.479 248.51C159.479 248.322 159.554 248.142 159.687 248.008C159.82 247.875 160.001 247.8 160.189 247.8H165.799C165.96 247.8 166.116 247.86 166.236 247.969C166.356 248.078 166.432 248.228 166.449 248.39C166.789 251.69 166.989 253.54 164.579 255.93C162.399 258.09 160.519 260.67 157.759 260.72C151.719 260.82 145.709 260.817 139.729 260.71C139.075 260.698 138.452 260.433 137.989 259.97L132.139 254.12C131.778 253.752 131.568 253.264 131.549 252.75C131.542 252.564 131.539 247.794 131.539 238.44C131.539 229.087 131.542 224.314 131.549 224.12C131.57 223.611 131.78 223.126 132.139 222.76L137.989 216.91C138.452 216.448 139.075 216.183 139.729 216.17C145.709 216.064 151.719 216.06 157.759 216.16C160.519 216.21 162.399 218.79 164.579 220.95C166.989 223.34 166.789 225.19 166.449 228.49C166.432 228.653 166.356 228.803 166.236 228.912C166.116 229.021 165.96 229.081 165.799 229.08H160.189C160.001 229.08 159.82 229.006 159.687 228.873C159.554 228.739 159.479 228.559 159.479 228.37C159.466 225.784 158.159 223.867 155.559 222.62C155.388 222.541 155.2 222.5 155.009 222.5H143.149C142.844 222.501 142.549 222.599 142.309 222.78C140.976 223.787 139.966 224.86 139.279 226C139.08 226.337 138.954 226.708 138.909 227.09C138.909 227.104 138.909 230.887 138.909 238.44Z"></path><path d="M194.009 235.22C197.382 235.22 200.642 235.213 203.789 235.2C203.835 235.2 203.88 235.191 203.922 235.173C203.963 235.155 204.001 235.13 204.033 235.097C204.065 235.064 204.09 235.026 204.106 234.983C204.123 234.941 204.13 234.895 204.129 234.85V216.6C204.129 216.475 204.179 216.356 204.267 216.268C204.355 216.179 204.474 216.13 204.599 216.13H210.929C211.064 216.13 211.193 216.183 211.29 216.278C211.387 216.373 211.444 216.503 211.449 216.64C211.469 217.293 211.479 224.553 211.479 238.42C211.479 252.287 211.466 259.547 211.439 260.2C211.431 260.335 211.373 260.462 211.277 260.555C211.18 260.648 211.052 260.7 210.919 260.7H204.589C204.464 260.7 204.345 260.65 204.257 260.562C204.169 260.474 204.119 260.355 204.119 260.23L204.129 241.98C204.129 241.89 204.093 241.803 204.029 241.74C203.966 241.676 203.879 241.64 203.789 241.64C200.642 241.627 197.382 241.62 194.009 241.62C190.629 241.613 187.369 241.62 184.229 241.64C184.139 241.64 184.052 241.676 183.989 241.74C183.925 241.803 183.889 241.89 183.889 241.98V260.23C183.889 260.355 183.84 260.474 183.751 260.562C183.663 260.65 183.544 260.7 183.419 260.7H177.089C176.955 260.7 176.825 260.647 176.728 260.552C176.631 260.457 176.574 260.327 176.569 260.19C176.549 259.543 176.539 252.283 176.539 238.41C176.539 224.543 176.549 217.287 176.569 216.64C176.574 216.501 176.633 216.37 176.732 216.275C176.831 216.179 176.963 216.127 177.099 216.13H183.429C183.554 216.13 183.673 216.179 183.761 216.268C183.85 216.356 183.899 216.475 183.899 216.6L183.889 234.85C183.888 234.895 183.896 234.941 183.912 234.983C183.929 235.026 183.953 235.064 183.985 235.097C184.017 235.13 184.055 235.155 184.097 235.173C184.139 235.191 184.184 235.2 184.229 235.2C187.369 235.213 190.629 235.22 194.009 235.22Z"></path><path d="M230.72 216.17H224.18C223.943 216.17 223.75 216.362 223.75 216.6V260.28C223.75 260.517 223.943 260.71 224.18 260.71H230.72C230.957 260.71 231.15 260.517 231.15 260.28V216.6C231.15 216.362 230.957 216.17 230.72 216.17Z"></path><path d="M258.377 240.12C256.324 236.874 253.861 233.047 250.987 228.64C250.966 228.608 250.935 228.584 250.898 228.57C250.862 228.557 250.822 228.556 250.785 228.568C250.748 228.579 250.715 228.602 250.692 228.633C250.669 228.664 250.657 228.702 250.657 228.74V260.21C250.657 260.279 250.644 260.346 250.618 260.409C250.593 260.472 250.555 260.53 250.508 260.578C250.46 260.626 250.404 260.665 250.342 260.691C250.28 260.717 250.214 260.73 250.147 260.73H244.137C243.999 260.73 243.867 260.676 243.77 260.578C243.672 260.481 243.617 260.348 243.617 260.21V216.77C243.617 216.595 243.687 216.427 243.811 216.304C243.934 216.18 244.102 216.11 244.277 216.11H249.287C249.57 216.111 249.848 216.182 250.097 216.316C250.347 216.45 250.56 216.644 250.717 216.88C254.917 223.194 259.214 229.81 263.607 236.73C265.667 239.977 268.134 243.804 271.007 248.21C271.029 248.243 271.06 248.267 271.096 248.28C271.133 248.293 271.172 248.294 271.209 248.283C271.246 248.272 271.279 248.249 271.302 248.218C271.325 248.187 271.337 248.149 271.337 248.11V216.64C271.337 216.572 271.35 216.504 271.376 216.441C271.402 216.378 271.439 216.321 271.487 216.273C271.534 216.224 271.59 216.186 271.652 216.16C271.714 216.134 271.78 216.12 271.847 216.12H277.857C277.995 216.12 278.127 216.175 278.225 216.273C278.322 216.37 278.377 216.502 278.377 216.64V260.08C278.377 260.255 278.308 260.423 278.184 260.547C278.06 260.671 277.892 260.74 277.717 260.74H272.707C272.425 260.74 272.146 260.669 271.897 260.535C271.648 260.4 271.435 260.207 271.277 259.97C267.071 253.657 262.771 247.04 258.377 240.12Z"></path><path d="M319.601 238.35C319.601 238.65 319.608 239.53 319.621 240.99C319.621 241.13 319.566 241.265 319.466 241.364C319.367 241.464 319.232 241.52 319.091 241.52H298.411C298.266 241.52 298.126 241.579 298.023 241.684C297.919 241.789 297.861 241.931 297.861 242.08V253.91C297.861 254.026 297.908 254.138 297.99 254.221C298.073 254.303 298.185 254.35 298.301 254.35H321.011C321.139 254.35 321.261 254.4 321.351 254.49C321.441 254.58 321.491 254.702 321.491 254.83V260.21C321.491 260.326 321.444 260.438 321.36 260.521C321.275 260.603 321.161 260.65 321.041 260.65L291.031 260.64C290.936 260.639 290.843 260.605 290.768 260.543C290.694 260.481 290.642 260.395 290.621 260.3C290.601 260.22 290.588 252.91 290.581 238.37C290.575 223.83 290.578 216.52 290.591 216.44C290.612 216.344 290.664 216.258 290.738 216.196C290.813 216.134 290.906 216.1 291.001 216.1L321.011 216.06C321.071 216.058 321.131 216.069 321.187 216.09C321.243 216.112 321.293 216.144 321.336 216.185C321.379 216.226 321.413 216.275 321.436 216.329C321.46 216.383 321.471 216.441 321.471 216.5V221.88C321.471 222.007 321.421 222.129 321.331 222.219C321.241 222.309 321.119 222.36 320.991 222.36L298.281 222.38C298.165 222.38 298.053 222.426 297.97 222.509C297.888 222.591 297.841 222.703 297.841 222.82L297.861 234.65C297.861 234.798 297.919 234.941 298.023 235.046C298.126 235.151 298.266 235.21 298.411 235.21L319.091 235.19C319.232 235.19 319.367 235.246 319.466 235.345C319.566 235.444 319.621 235.579 319.621 235.72C319.608 237.18 319.601 238.056 319.601 238.35Z"></path><path d="M331.672 248.5H336.992C337.135 248.501 337.277 248.533 337.407 248.594C337.537 248.655 337.652 248.743 337.743 248.853C337.835 248.963 337.901 249.091 337.937 249.229C337.973 249.366 337.978 249.51 337.952 249.65C337.592 251.657 338.372 253.17 340.292 254.19C340.568 254.334 340.873 254.41 341.182 254.41H353.282C353.57 254.41 353.849 254.334 354.092 254.19C357.592 252.18 356.722 248.24 356.592 244.51C356.552 243.343 355.838 242.313 354.452 241.42C354.197 241.257 353.895 241.17 353.582 241.17H338.612C337.831 241.17 337.079 240.857 336.522 240.3L331.382 235.16C330.978 234.757 330.752 234.21 330.752 233.64V223.39C330.751 223.174 330.794 222.961 330.876 222.762C330.959 222.563 331.079 222.382 331.232 222.23L336.402 217.05C336.998 216.461 337.799 216.13 338.632 216.13H356.252C356.47 216.13 356.687 216.173 356.89 216.257C357.092 216.341 357.276 216.464 357.432 216.62L362.742 221.93C362.948 222.136 363.111 222.381 363.223 222.65C363.334 222.92 363.392 223.208 363.392 223.5V227.25C363.392 227.539 363.277 227.816 363.072 228.021C362.868 228.225 362.591 228.34 362.302 228.34H356.902C356.75 228.34 356.601 228.304 356.466 228.235C356.331 228.166 356.215 228.065 356.126 227.942C356.038 227.819 355.981 227.676 355.959 227.526C355.938 227.376 355.952 227.223 356.002 227.08C356.568 225.413 355.888 224 353.962 222.84C353.673 222.67 353.346 222.577 353.012 222.57C349.605 222.517 346.182 222.5 342.742 222.52C340.022 222.54 338.152 223.37 338.022 226.21C337.862 229.55 337.282 234.46 341.522 234.57C346.055 234.697 351.048 234.71 356.502 234.61C356.751 234.607 357 234.654 357.231 234.748C357.463 234.842 357.674 234.983 357.852 235.16L362.882 240.19C363.192 240.497 363.438 240.863 363.607 241.266C363.775 241.669 363.861 242.102 363.862 242.54V252.96C363.861 253.337 363.786 253.711 363.64 254.059C363.494 254.408 363.281 254.724 363.012 254.99L358.292 259.72C357.975 260.037 357.598 260.288 357.182 260.46C356.767 260.632 356.322 260.72 355.872 260.72H338.562C338.131 260.72 337.705 260.635 337.308 260.471C336.912 260.306 336.553 260.064 336.252 259.76L331.192 254.71C331.004 254.523 330.856 254.3 330.755 254.055C330.654 253.81 330.602 253.546 330.602 253.28V249.56C330.602 249.279 330.714 249.009 330.915 248.81C331.116 248.612 331.388 248.5 331.672 248.5Z"></path>' },
    }

    function ArenaMark({ org }) {
      const mark = ARENA_EXTRA_MARKS[org]
      if (mark) {
        return h('svg', {
          className: 'osubs-amark', viewBox: mark.viewBox,
          fill: 'currentColor', 'aria-hidden': 'true',
          dangerouslySetInnerHTML: { __html: mark.raw },
        })
      }
      // Unmapped org: the initial on a muted tile.
      return h('span', { className: 'osubs-amark osubs-amark--alt', 'aria-hidden': 'true' }, String(org || '?').slice(0, 1).toUpperCase())
    }

    // Column labels go through the locale table (t.arenaCol*) — the
    // maintainer wants the whole page translated, not just the chrome.

    const clamp100 = (x) => Math.max(0, Math.min(100, x))
    const arenaPct = (v) => `${(v * 100).toFixed(2)}%`

    /** Arena's up/down glyph: direction is the value's sign, inverted for
        tool-hallucination-style columns where a positive rate is good news. */
    function ArrowUp({ down }) {
      return h('svg', {
        className: 'osubs-aarrow', viewBox: '0 0 24 24', 'aria-hidden': 'true',
        fill: 'currentColor',
      }, h('path', { d: down
        ? 'M5.30711 8.71299C5.4232 8.43273 5.69668 8.25 6.00002 8.25H18C18.3034 8.25 18.5768 8.43273 18.6929 8.71299C18.809 8.99324 18.7449 9.31583 18.5304 9.53033L12.5304 15.5303C12.2375 15.8232 11.7626 15.8232 11.4697 15.5303L5.46969 9.53033C5.25519 9.31583 5.19103 8.99324 5.30711 8.71299Z'
        : 'M5.30711 15.287C5.4232 15.5673 5.69668 15.75 6.00002 15.75H18C18.3034 15.75 18.5768 15.5673 18.6929 15.287C18.809 15.0068 18.7449 14.6842 18.5304 14.4697L12.5304 8.46967C12.2375 8.17678 11.7626 8.17678 11.4697 8.46967L5.46969 14.4697C5.25519 14.6842 5.19103 15.0068 5.30711 15.287Z' }))
    }

    /**
     * Value + arrow + ±CI, arena's exact stack (arrow ▲14.33% over ±2.18%).
     * Live-measured rule (2026-10-14, all 52 rows × 5 signals): the colour
     * follows the raw sign ("positive" class iff value > 0), while the arrow
     * flips for an inverted signal — tool_hallucination positive reads as a
     * green DOWN (a hallucination rate is better when it is lower).
     */
    function ArenaScore({ value, ci, invert }) {
      if (value === null || value === undefined) return h('span', { className: 'osubs-a mute' }, '—')
      const good = value >= 0
      const down = invert ? value > 0 : value < 0
      return h('span', { className: 'osubs-astack' },
        h('span', { className: `osubs-avalue${value === 0 ? '' : good ? ' osubs-aok' : ' osubs-abad'}` },
          value !== 0 && h(ArrowUp, { down }),
          arenaPct(Math.abs(value))),
        ci !== null && ci !== undefined && h('span', { className: 'osubs-aci' }, `±${arenaPct(ci)}`))
    }

    /** The Net Improvement diverging bar: a 100-wide track, a centre hairline,
        the value fill from centre, and the CI whisker — scaled so the widest
        |value|+ci in the column exactly reaches the edge (arena's own rule). */
    function ArenaScoreBar({ value, ci, scale, t }) {
      const at = (x) => clamp100(50 + (x / (scale || 1)) * 50)
      const x1 = at(value - ci)
      const x2 = at(value + ci)
      const edge = at(value)
      const left = Math.min(50, edge)
      const width = Math.abs(edge - 50)
      return h('svg', {
        className: 'osubs-abar', viewBox: '0 0 100 16', preserveAspectRatio: 'none',
        role: 'img', 'aria-label': `${t.arenaColNet} ${arenaPct(value)}`,
      },
        h('rect', { x: 0, y: 0, width: 100, height: 16, rx: 1.5, className: 'osubs-abar-track' }),
        h('rect', { x: left, y: 0, width, height: 16, rx: 1.5, className: value >= 0 ? 'osubs-abar-ok' : 'osubs-abar-bad' }),
        h('line', { x1: 50, x2: 50, y1: -3, y2: 19, className: 'osubs-abar-mid' }),
        h('line', { x1, x2, y1: 8, y2: 8, className: 'osubs-abar-ci' }))
    }

    /** Rank + its interval: `1` over `1 ⋯ 6` (dot-with-lines glyph between). */
    function ArenaRank({ row, t }) {
      return h('span', { className: 'osubs-arank' },
        h('span', { className: 'osubs-arank-n' }, String(row.rank)),
        h('span', { className: 'osubs-arank-spread', title: fill(t.arenaRankRange, { min: row.spreadMin, max: row.spreadMax }) },
          h('span', null, String(row.spreadMin)),
          h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' },
            h('circle', { cx: 12, cy: 12, r: 3 }),
            h('path', { d: 'M9 12H3' }),
            h('path', { d: 'M15 12L21 12' })),
          h('span', null, String(row.spreadMax))))
    }

    function ArenaSkeleton() {
      return h('div', { className: 'osubs-usk' },
        h('span', { className: 'osubs-sk osubs-sk--chart' }),
        h('span', { className: 'osubs-sk osubs-sk--n' }))
    }

    // View-as toggle glyphs, traced from the site's own buttons (lucide
    // `list` for Ranking, axes-plus-curve for Pareto): 24-grid, 1.5 stroke.
    function ViewIconRank() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M8 6h12' }), h('path', { d: 'M8 12h12' }), h('path', { d: 'M8 18h12' }),
        h('circle', { cx: 4, cy: 6, r: .75 }), h('circle', { cx: 4, cy: 12, r: .75 }), h('circle', { cx: 4, cy: 18, r: .75 }))
    }
    function ViewIconPareto() {
      return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M20 20H4V4' }),
        h('path', { d: 'M4 7l8 8 3-3 4.5 4.5' }))
    }

    function ArenaPanel({ t, data, error, busy, browserBusy, browserNotice, onRefresh, onVerify, onCancelVerify }) {
      const [category, setCategory] = useState(readStoredArenaCategory)
      const [query, setQuery] = useState('')
      const [license, setLicense] = useState('all')
      const [sort, setSort] = useState({ key: 'rank', dir: 1 })
      const [viewMode, setViewMode] = useState(readStoredArenaView)
      const pickView = (id) => { setViewMode(id); writeStoredArenaView(id) }
      const shot = useShot(t)
      const shareRef = useRef(null)
      const pickCategory = (id) => { setCategory(id); writeStoredArenaCategory(id); setSort({ key: 'rank', dir: 1 }) }
      const board = data?.boards?.[category] ?? null
      const rows = board?.rows ?? null
      const needsBrowser = browserBusy || !!data?.blocked || !!data?.archived || (!data && !!error)
      const fallbackShot = !!(data?.blocked || data?.archived || data?.error)

      // 分享 keeps the board and its source footline. Controls, verification
      // status and operational hints drop out via [data-noshot]. The painted
      // footer keeps the snapshot date and category, not the plugin identity.
      const head = h('header', { className: 'osubs-uhead', 'data-noshot': '' },
        h('span', { className: 'osubs-noshot' },
          board && h('span', { className: 'osubs-note osubs-uhead-note' },
            fill(t.arenaUpdated, new Date(board.lastUpdated || data.at).toLocaleDateString(localeOf(), { year: 'numeric', month: 'short', day: 'numeric' })),
            ' · ', fill(t.arenaSessions, (board.totalSessions).toLocaleString(localeOf())),
            ' · ', fill(t.arenaModels, String(board.modelCount))),
          h(Button, {
            size: 'sm', disabled: busy, onClick: onRefresh,
            label: h('span', { className: 'osubs-refresh' + (busy ? ' osubs-refresh--spin' : '') }, h(IconRefresh), t.quotaRefresh),
          }),
          needsBrowser && h(Button, { size: 'sm', disabled: busy, onClick: onVerify, label: browserBusy ? t.arenaBrowserVerifying : t.arenaBrowserVerify }),
          browserBusy && h(Button, { size: 'sm', onClick: onCancelVerify, label: t.arenaBrowserCancel }),
          h(ShareButton, { t, busy: shot.busy, disabled: !board, onClick: () => { if (board) shot.start(shareRef.current, shotFooter(t, {
            identity: false,
            at: board.lastUpdated || data.at,
            atLabel: fill(t.arenaUpdated, stamp(board.lastUpdated || data.at)),
            scope: `${t.tabArena} · ${t[ARENA_CATEGORIES.find(([id]) => id === category)?.[1] ?? 'arenaCatOverall']}${license !== 'all' ? ` · ${{ proprietary: t.arenaLicenseProprietary, open: t.arenaLicenseOpen }[license]}` : ''}${viewMode === 'pareto' ? ` · ${t.arenaViewPareto}` : ''}`,
          }), `oauth-subs-arena-${stamp(Date.now()).slice(0, 10)}.png`) } })),
        h('div', { className: 'osubs-seg', role: 'group' }, ARENA_CATEGORIES.map(([id, key]) => h(Button, {
          key, size: 'sm', variant: category === id ? 'primary' : undefined,
          onClick: () => pickCategory(id), label: t[key],
        }))))

      const browserHint = (browserBusy || browserNotice) && h('p', { className: 'osubs-hint', role: 'status', 'aria-live': 'polite', 'data-noshot': '' },
        browserBusy ? t.arenaBrowserWaiting : browserNotice)
      if (rows === null) {
        return h('section', { className: 'osubs-card', 'aria-busy': busy },
          head, browserHint, error ? h('p', { className: 'osubs-hint osubs-bad' }, error) : h(ArenaSkeleton))
      }

      // Diverging-bar scale: the widest |value|+ci fills the half-track.
      const scale = Math.max(0.0001, ...rows.map((row) => Math.abs(row.value) + (row.ci ?? 0)))
      const licenses = [['all', t.arenaLicenseAll], ['proprietary', t.arenaLicenseProprietary], ['open', t.arenaLicenseOpen]]
      const needle = query.trim().toLowerCase()
      const shown = rows.filter((row) => {
        if (license === 'proprietary' && row.license !== 'Proprietary') return false
        if (license === 'open' && row.license === 'Proprietary') return false
        if (!needle) return true
        return `${row.model} ${row.org}`.toLowerCase().includes(needle)
      })
      const sorted = [...shown].sort((a, b) => {
        if (sort.key === 'rank') return (a.rank - b.rank) * sort.dir
        const key = sort.key
        return ((a[key] ?? 0) - (b[key] ?? 0)) * sort.dir
      })

      const sortButton = (key, label, align?) => h('button', {
        type: 'button',
        className: `osubs-ahead-btn${sort.key === key ? ' osubs-ahead-btn--on' : ''}${align ? ' osubs-ahead-btn--end' : ''}`,
        onClick: () => setSort((current) => (
          current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: -1 }
        )),
        title: label,
      }, label, h('span', { className: 'osubs-ahead-arrow' }, sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''))

      // Column set, order and cell formats are the live board's own
      // (re-identified 2026-10-14 through the browser: docs/error.md): rank ·
      // model · Net Improvement (the only diverging bar) · the five signal
      // columns · Sessions · Cost/Task (P50) · Output Tokens/Task (P50) ·
      // Price $/M. `--sigx` marks the four signal columns that drop first in
      // a narrow pane; the site drops columns there too.
      const table = h('div', { className: 'osubs-atable', role: 'table' },
        h('div', { className: 'osubs-atrow osubs-atrow--head', role: 'row' },
          h('span', { className: 'osubs-atcell osubs-atcell--rank', role: 'columnheader' }, sortButton('rank', t.arenaColRank)),
          h('span', { className: 'osubs-atcell osubs-atcell--model', role: 'columnheader' }, t.arenaColModel),
          h('span', { className: 'osubs-atcell osubs-atcell--score', role: 'columnheader' }, sortButton('value', t.arenaColNet, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--sig', role: 'columnheader' }, sortButton('success', t.arenaColSuccess, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'columnheader' }, sortButton('praise', t.arenaColPraise, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'columnheader' }, sortButton('steer', t.arenaColSteer, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'columnheader' }, sortButton('bash', t.arenaColBash, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'columnheader' }, sortButton('halluc', t.arenaColHalluc, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--num', role: 'columnheader' }, sortButton('sessions', t.arenaColSessions, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--cost', role: 'columnheader' }, sortButton('costUsd', t.arenaColCost, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--num', role: 'columnheader' }, sortButton('tokensM', t.arenaColTokens, true)),
          h('span', { className: 'osubs-atcell osubs-atcell--num osubs-atcell--price', role: 'columnheader' }, sortButton('priceIn', t.arenaColPrice, true))),
        sorted.length === 0 && h('div', { className: 'osubs-atrow osubs-atrow--empty' }, h('span', { className: 'osubs-mempty' }, t.arenaNoMatch)),
        sorted.map((row) => h('div', { className: 'osubs-atrow', role: 'row', key: `${row.rank}-${row.model}` },
          h('span', { className: 'osubs-atcell osubs-atcell--rank', role: 'cell' }, h(ArenaRank, { row, t })),
          h('span', { className: 'osubs-atcell osubs-atcell--model', role: 'cell' },
            h('span', { className: 'osubs-amodel' },
              h(ArenaMark, { org: row.org }),
              h('span', { className: 'osubs-amodel-who' },
                row.url
                  ? h('a', { className: 'osubs-amodel-n', href: row.url, target: '_blank', rel: 'noreferrer', title: row.model }, row.model)
                  : h('span', { className: 'osubs-amodel-n', title: row.model }, row.model),
                h('span', { className: 'osubs-amodel-s' }, [row.org, row.license].filter(Boolean).join(' · '))))),
          h('span', { className: 'osubs-atcell osubs-atcell--score', role: 'cell' },
            h('span', { className: 'osubs-ascore' },
              h(ArenaScore, { value: row.value, ci: row.ci }),
              h(ArenaScoreBar, { value: row.value, ci: row.ci ?? 0, scale, t }))),
          h('span', { className: 'osubs-atcell osubs-atcell--sig', role: 'cell' },
            h(ArenaScore, { value: row.success, ci: row.successCi })),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'cell' },
            h(ArenaScore, { value: row.praise, ci: row.praiseCi })),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'cell' },
            h(ArenaScore, { value: row.steer, ci: row.steerCi })),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'cell' },
            h(ArenaScore, { value: row.bash, ci: row.bashCi })),
          h('span', { className: 'osubs-atcell osubs-atcell--sig osubs-atcell--sigx', role: 'cell' },
            h(ArenaScore, { value: row.halluc, ci: row.hallucCi, invert: true })),
          h('span', { className: 'osubs-atcell osubs-atcell--num', role: 'cell', title: t.arenaColSessions },
            h('span', { className: 'osubs-acost' }, Number(row.sessions || 0).toLocaleString(localeOf()))),
          h('span', { className: 'osubs-atcell osubs-atcell--cost', role: 'cell' },
            row.costUsd != null
              ? h('span', { className: 'osubs-acost', title: t.arenaColCost }, arenaUsd(row.costUsd))
              : h('span', { className: 'osubs-acost osubs-a mute' }, t.arenaNoValue)),
          h('span', { className: 'osubs-atcell osubs-atcell--num', role: 'cell', title: t.arenaColTokens },
            row.tokensM != null
              ? h('span', { className: 'osubs-acost' }, arenaTok(row.tokensM * 1e6))
              : h('span', { className: 'osubs-acost osubs-a mute' }, t.arenaNoValue)),
          h('span', { className: 'osubs-atcell osubs-atcell--num osubs-atcell--price', role: 'cell', title: t.arenaColPrice },
            h('span', { className: 'osubs-acost' }, arenaPrice(row, t))))))

      return h(Fragment || 'div', null, h('section', { className: 'osubs-arena', ref: shareRef, 'aria-busy': busy },
        head, browserHint,
        (error || (!browserBusy && (data?.error || data?.blocked || data?.archived))) && h('p', { className: 'osubs-hint', 'data-noshot': '' },
          error || (data?.blocked ? t.arenaBlocked : data?.error ? fill(t.arenaStale, data.error) : t.arenaArchived)),
        h('div', { className: 'osubs-atools', 'data-noshot': '' },
          h('div', { className: 'osubs-seg', role: 'group' }, [['rank', t.arenaViewRank], ['pareto', t.arenaViewPareto]].map(([id, label]) => h(Button, {
            key: id, size: 'sm', variant: viewMode === id ? 'primary' : undefined,
            onClick: () => pickView(id),
            label: h('span', { className: 'osubs-vseg' }, id === 'rank' ? h(ViewIconRank) : h(ViewIconPareto), label),
          }))),
          h('div', { className: 'osubs-msearch osubs-asearch' },
            h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': 'true' },
              h('circle', { cx: 11, cy: 11, r: 7 }),
              h('path', { d: 'M20 20l-3.5-3.5' })),
            h('input', {
              type: 'search', value: query, placeholder: t.arenaSearch,
              onChange: (event) => setQuery(event.target.value),
              'aria-label': t.arenaSearch,
            })),
          h('div', { className: 'osubs-seg', role: 'group' }, licenses.map(([id, label]) => h(Button, {
            key: id, size: 'sm', variant: license === id ? 'primary' : undefined,
            onClick: () => setLicense(id), label,
          }))),
          shown.length !== rows.length ? h('span', { className: 'osubs-mcount' }, `${shown.length} / ${rows.length}`) : null),
        viewMode === 'pareto' ? h(ArenaPareto, { t, rows: sorted }) : table,
        h('p', { className: 'osubs-hint osubs-afoot' },
          t.arenaSource, ' ',
          h('a', {
            className: 'osubs-link osubs-afoot-link',
            href: ARENA_SOURCE_URL + (ARENA_CATEGORIES.find(([id]) => id === category)?.[2] ?? ''),
            target: '_blank', rel: 'noreferrer',
          },
            'arena.ai',
            h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
              h('path', { d: 'M7 17 17 7' }),
              h('path', { d: 'M9 7h8v8' }))),
          ' · ', t.arenaSourceNote,
          fallbackShot ? h('span', { className: 'osubs-afoot-cache' }, ' · ', t.arenaShotCache) : null,
          // The snapshot's own date is in the header note; this is when we
          // last pulled it, so a stale cache reads differently from a fresh
          // one at a glance.
          data?.at ? h('span', { className: 'osubs-afoot-at' },
            ' · ', fill(t.arenaFetched, stamp(data.at))) : null)
      ), shot.layer)
    }
