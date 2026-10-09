// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// Family tables, the Usage page, and the 分享 long screenshot.

    const FAMILY_ORDER = [
      'codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama',
      'kimi', 'copilot', 'devin', 'cline', 'opencode-go', 'command-code',
    ]
    const FAMILY_NAME = {
      codex: 'Codex', chatgpt: 'ChatGPT', grok: 'Grok', glm: 'GLM', kiro: 'Kiro', antigravity: 'Antigravity',
      cursor: 'Cursor', ollama: 'Ollama', kimi: 'Kimi', copilot: 'Copilot', devin: 'Devin',
      cline: 'Cline', 'opencode-go': 'OpenCode Go', 'command-code': 'Command Code',
    }
    const FAMILY_ICON = {
      codex: 'codex', chatgpt: 'openai', grok: 'grok', glm: 'zai', kiro: 'kiro', antigravity: 'antigravity',
      cursor: 'cursor', ollama: 'ollama', kimi: 'kimi', copilot: 'copilot', devin: 'devin',
      cline: 'cline', 'opencode-go': 'opencodeGo', 'command-code': 'commandCode',
    }
    // Brand tints for rail icons whose LobeHub mark is mono-only; codex,
    // kiro, antigravity, kimi, copilot and devin render their
    // official colored SVG via `raw`, while grok/cursor/ollama/opencode-go
    // stay monochrome like their official marks. Hues follow the brand.
    const FAMILY_COLOR = {
      glm: '#6366f1', cline: '#ee6a5e',
    }
    // Rail entries the Usage view adds after the plugin's families: host
    // providers it reports usage for but does not manage (no quota card, no
    // model switches). `deepseek` = DSH's own deepseek-official / -account.
    const USAGE_ONLY_FAMILIES = ['deepseek']
    const usageFamilyName = (t, id) => FAMILY_NAME[id] ?? (id === 'deepseek' ? t.usageDeepseek : id)
    const usageFamilyIcon = (id) => FAMILY_ICON[id] ?? (USAGE_ONLY_FAMILIES.includes(id) ? id : undefined)
    const railIdOf = (fam) => String(fam ?? '').startsWith('opencode-go') ? 'opencode-go' : String(fam ?? '')

    // Usage rows from the `usage` RPC ({ at, rows }), per hour/family/model:
    // [hour epoch, family, model, calls, input, output, cacheRead, cacheWrite,
    //  failed, cachePrompt, timed, ttftMs, decodeMs, decodeOut] — see
    // src/utils/usage.ts for what each counts.
    const HOUR_MS = 3_600_000
    // The page keeps the last answer and shows it at once on every open; it
    // asks again only past this age, or on 刷新. The host memoizes as long.
    const USAGE_TTL_MS = 5 * 60_000
    const USAGE_STORE = 'dsh-plugin-oauth-subs.usage'
    function readStoredUsage() {
      try {
        const parsed = JSON.parse(localStorage.getItem(USAGE_STORE) ?? 'null')
        return parsed && typeof parsed.at === 'number' && Array.isArray(parsed.rows) ? parsed : null
      } catch {
        return null
      }
    }
    function writeStoredUsage(usage) {
      try { localStorage.setItem(USAGE_STORE, JSON.stringify(usage)) } catch { /* quota / private mode */ }
    }
    // The range picker remembers the last choice; a first open (or a bad
    // stored value) falls back to 今天.
    const USAGE_RANGE_STORE = 'dsh-plugin-oauth-subs.usage-range'
    function readStoredRange(): number | 'today' {
      try {
        const raw = localStorage.getItem(USAGE_RANGE_STORE)
        if (raw === 'today') return 'today'
        const days = Number(raw)
        return days === 7 || days === 30 ? days : 'today'
      } catch {
        return 'today'
      }
    }
    function writeStoredRange(range: number | 'today') {
      try { localStorage.setItem(USAGE_RANGE_STORE, String(range)) } catch { /* private mode */ }
    }
    const dayKey = (ms) => {
      const d = new Date(ms)
      return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    }
    function compactNumber(n) {
      for (const [size, unit] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
        if (n >= size) return `${(n / size).toFixed(n >= size * 100 ? 0 : 1).replace(/\.0$/, '')}${unit}`
      }
      return String(Math.round(n))
    }
    const formatMs = (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`)
    /** 1 / 2 / 5 × 10^n at or above `n`, so the gridlines land on round values. */
    function niceCeil(n) {
      if (n <= 0) return 1
      const base = 10 ** Math.floor(Math.log10(n))
      return ([1, 2, 5, 10].find((step) => step * base >= n) ?? 10) * base
    }
    /** Distinct models per family seen in the rows (the rail count on the Usage view). */
    function usageModelCounts(rows) {
      const seen = new Map()
      for (const row of rows ?? []) (seen.get(row[1]) ?? seen.set(row[1], new Set()).get(row[1])).add(row[2])
      return (id) => seen.get(id)?.size ?? 0
    }

    const emptyUsage = () => ({ calls: 0, input: 0, output: 0, cacheRead: 0, failed: 0, cachePrompt: 0, timed: 0, ttft: 0, decodeMs: 0, decodeOut: 0, cost: 0 })
    function addUsage(sum, row, cost = null) {
      sum.calls += row[3]
      // 输入 is the whole prompt — uncached + cache read + cache write — so
      // Token reconciles with the host's per-session totalTokens (what the
      // user compares against); 缓存读 stays its own card as the cached
      // share of that prompt.
      sum.input += row[4] + row[6] + row[7]
      sum.output += row[5]
      sum.cacheRead += row[6]
      sum.failed += row[8] ?? 0
      sum.cachePrompt += row[9] ?? 0
      sum.timed += row[10] ?? 0
      sum.ttft += row[11] ?? 0
      sum.decodeMs += row[12] ?? 0
      sum.decodeOut += row[13] ?? 0
      // Unpriced rows add nothing: an estimate that ignores them stays lower,
      // and the card's cover sub-line says which models are missing.
      sum.cost += cost ?? 0
      return cost != null
    }
    /** `$0.42` → `<$0.01` / cents / dollars; large like tokens (`$1.2k`). */
    function compactUsd(n) {
      if (!(n > 0)) return '$0'
      if (n < 0.01) return '<$0.01'
      if (n < 10) return `$${n.toFixed(2)}`
      if (n < 1000) return `$${String(n.toFixed(1)).replace(/\.0$/, '')}`
      return `$${compactNumber(n)}`
    }
    // Token counts everything the call moved: the whole prompt in, the reply
    // out. The hit rate still only counts calls whose usage carries a cache
    // field (Kiro's never do: n/a, not 0%).
    const usageTokens = (sum) => sum.input + sum.output
    const usageHit = (sum) => (sum.cachePrompt ? sum.cacheRead / sum.cachePrompt : null)
    const usageTtft = (sum) => (sum.timed ? sum.ttft / sum.timed : null)
    const usageSpeed = (sum) => (sum.decodeMs ? sum.decodeOut / (sum.decodeMs / 1000) : null)

    // ── Long screenshot (用量 → 分享) ───────────────────────────────────────
    // The card is cloned with every computed style inlined and drawn through an
    // SVG foreignObject onto a canvas (Chromium keeps that canvas untainted);
    // the footer is painted below it. The clone is detached from the scrolling
    // pane, so the whole card lands in the image however far it is scrolled.
    // PNG: the clipboard only takes image/png, and flat UI stays sharp in it.
    // ponytail: ::before/::after content is not copied — the usage card has none.
    function inlineClone(source) {
      const copy = source.cloneNode(false)
      if (source.nodeType !== 1) return copy
      const style = getComputedStyle(source)
      let text = ''
      for (let i = 0; i < style.length; i++) text += `${style[i]}:${style.getPropertyValue(style[i])};`
      // The element's own inline style goes last: a bar still animating toward
      // its `height: %` is captured at its target, not mid-transition.
      copy.setAttribute('style', `${text}animation:none;transition:none;${source.getAttribute('style') ?? ''}`)
      // An account's identity is masked in the image, never on the page.
      if (source.hasAttribute('data-shot-mask')) {
        copy.textContent = maskIdentity(source.textContent)
        // The masked text is shorter: let the box shrink to it.
        copy.style.width = 'auto'
        copy.style.inlineSize = 'auto'
        return copy
      }
      for (const child of Array.from(source.childNodes) as any[]) {
        if (child.nodeType === 1 && child.hasAttribute('data-noshot')) continue
        copy.appendChild(inlineClone(child))
      }
      return copy
    }

    /** `alice@example.com` → `a***@e***.com`; a bare username → `a***`. */
    function maskIdentity(text) {
      const value = String(text ?? '').trim()
      const hide = (part) => (part.length <= 1 ? '*' : `${part[0]}***`)
      const at = value.indexOf('@')
      if (at <= 0) return hide(value)
      const domain = value.slice(at + 1)
      const dot = domain.lastIndexOf('.')
      return `${hide(value.slice(0, at))}@${dot > 0 ? hide(domain.slice(0, dot)) + domain.slice(dot) : hide(domain)}`
    }

    /** The first opaque background up the tree, else a surface that fits the ink. */
    function shotSurfaceOf(node) {
      for (let el = node; el; el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor
        if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return bg
      }
      const [r, g, b] = (getComputedStyle(node).color.match(/\d+(\.\d+)?/g) ?? ['0', '0', '0']).map(Number)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128 ? '#1c1c1f' : '#ffffff'
    }

    async function renderLongShot(node, footer) {
      // `osubs-shooting` drops every [data-noshot] from the live layout for
      // this synchronous stretch only (no paint happens in between), so the
      // measured size and the inlined heights close up around what is left out.
      node.classList.add('osubs-shooting')
      let width, height, clone
      try {
        width = Math.ceil(node.offsetWidth)
        height = Math.ceil(node.offsetHeight)
        clone = inlineClone(node)
      } finally {
        node.classList.remove('osubs-shooting')
      }
      // The node's own margin (the quota list pads up over a legend title with
      // a negative one) would shift the image inside its frame.
      clone.style.margin = '0'
      clone.classList.remove('osubs-shooting')
      const markup = new XMLSerializer().serializeToString(clone)
      const image = new Image()
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`)}`
      await image.decode()
      const style = getComputedStyle(node)
      const pad = 24
      const total = height + pad * 2 + 64
      // Chromium caps a canvas side near 16k px: a very long card drops toward 1x.
      const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1, 16000 / total))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round((width + pad * 2) * scale)
      canvas.height = Math.round(total * scale)
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.fillStyle = shotSurfaceOf(node)
      ctx.fillRect(0, 0, width + pad * 2, total)
      ctx.drawImage(image, pad, pad, width, height)
      // Footer: a rule, then plugin + version / repo on the left, date / scope on the right.
      const top = pad + height + 20
      ctx.strokeStyle = style.color
      ctx.globalAlpha = 0.28
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad, top + 0.5)
      ctx.lineTo(pad + width, top + 0.5)
      ctx.stroke()
      ctx.fillStyle = style.color
      ctx.textBaseline = 'top'
      ctx.globalAlpha = 1
      ctx.font = `600 13px ${style.fontFamily}`
      ctx.fillText(footer.title, pad, top + 12)
      ctx.textAlign = 'right'
      ctx.fillText(footer.date, pad + width, top + 12)
      ctx.globalAlpha = 0.62
      ctx.font = `12px ${style.fontFamily}`
      ctx.fillText(footer.scope, pad + width, top + 32)
      ctx.textAlign = 'left'
      ctx.fillText(footer.repo, pad, top + 32)
      return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob'))), 'image/png'))
    }

    /**
     * Write a PNG (or its pending promise, so the click's user activation still
     * covers it). A write that never settles — seen when the window cannot
     * reach the system clipboard — counts as failed after a few seconds.
     */
    function copyPng(png) {
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return Promise.resolve(false)
      return Promise.race([
        navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(() => true, () => false),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
      ])
    }

    const stamp = (ms) => {
      const d = new Date(ms)
      const two = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
    }
    const shortStamp = (ms) => {
      const d = new Date(ms)
      const two = (n) => String(n).padStart(2, '0')
      return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`
    }

    function IconShare() {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
        h('path', { d: 'M12 15V3' }),
        h('path', { d: 'm7 8 5-5 5 5' }),
        h('path', { d: 'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6' }),
      )
    }

    const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const THUMB = { width: 180, height: 120, gap: 20 }
    const THUMB_STAY_MS = 5000

    /**
     * The macOS screenshot thumbnail: flies from the card's visible rect into the
     * bottom-right corner (width/height/left/top, so the top-anchored image
     * keeps its proportions in flight), stays while hovered, then slides out.
     * A click opens the preview. Reduced motion: it only fades in and out.
     */
    function ShotThumb({ url, from, copied, t, onOpen, onDone }) {
      const ref = useRef(null)
      const timer = useRef(0)
      const to = {
        left: window.innerWidth - THUMB.gap - THUMB.width,
        top: window.innerHeight - THUMB.gap - THUMB.height,
        width: THUMB.width,
        height: THUMB.height,
      }
      const leave = () => {
        const el = ref.current
        if (!el) return
        const out = reducedMotion()
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [{ transform: 'none', opacity: 1 }, { transform: `translateX(${THUMB.width + THUMB.gap * 2}px)`, opacity: 0.4 }]
        el.animate(out, { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.then(onDone, onDone)
      }
      const arm = () => {
        clearTimeout(timer.current)
        timer.current = window.setTimeout(leave, THUMB_STAY_MS)
      }
      useEffect(() => {
        const el = ref.current
        if (reducedMotion() || !from) {
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 })
        } else {
          const box = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` })
          el.animate([
            { ...box(from), borderRadius: '14px', boxShadow: '0 0 0 0 transparent' },
            { ...box(to), borderRadius: '10px' },
          ], { duration: 560, easing: 'cubic-bezier(0.2, 0.9, 0.2, 1)' })
        }
        arm()
        return () => clearTimeout(timer.current)
      }, [])
      return h('button', {
        ref,
        type: 'button',
        className: 'osubs-thumb',
        style: { left: to.left, top: to.top, width: to.width, height: to.height },
        'aria-label': t.usageShotOpen,
        onClick: () => { clearTimeout(timer.current); onOpen() },
        onMouseEnter: () => clearTimeout(timer.current),
        onMouseLeave: arm,
        onFocus: () => clearTimeout(timer.current),
        onBlur: arm,
      },
        h('img', { src: url, alt: '' }),
        h('span', { className: 'osubs-thumb-badge' }, copied === null ? t.usageCopyingShort : t.usageCopiedShort))
    }

    /** The footer every shared image carries: plugin + version, repo, date, scope. */
    const shotFooter = (t, { version, repo, at, scope }) => ({
      title: version && version !== '—' ? `${t.pluginAboutTitle} v${version}` : t.pluginAboutTitle,
      repo: String(repo).replace(/^https?:\/\//, ''),
      date: fill(t.usageAnalyzed, stamp(at)),
      scope,
    })

    /**
     * 分享 for any view: walks busy → thumb → dialog, macOS style — a flash over
     * the node's on-screen rect, the thumbnail flies to the corner, a click on
     * it opens the preview. A copy that fails skips the thumbnail and opens the
     * preview to save from. `layer` renders the flash, thumbnail and dialog.
     * { phase, from, flash, png, url, copied: null (copying) | boolean, error, fileName }
     */
    function useShot(t) {
      const [shot, setShot] = useState(null)
      const close = () => {
        if (shot?.url) URL.revokeObjectURL(shot.url)
        setShot(null)
      }
      // The image renders while the clipboard write already holds the click's
      // user activation; the copy outcome lands whenever the clipboard answers.
      const start = (node, footer, fileName) => {
        if (!node || shot?.phase === 'busy') return
        if (shot?.url) URL.revokeObjectURL(shot.url)
        // The part of the node on screen: where the flash lands and the thumbnail takes off.
        const rect = node.getBoundingClientRect()
        const pane = node.closest('.osubs-pane')?.getBoundingClientRect() ?? rect
        const left = Math.max(rect.left, pane.left)
        const top = Math.max(rect.top, pane.top)
        const from = { left, top, width: Math.min(rect.right, pane.right) - left, height: Math.min(rect.bottom, pane.bottom) - top }
        const png = renderLongShot(node, footer)
        setShot({ phase: 'busy', from, flash: !reducedMotion(), copied: null, fileName })
        png.then(
          (blob) => setShot((current) => current && { ...current, phase: current.copied === false ? 'dialog' : 'thumb', png: blob, url: URL.createObjectURL(blob) }),
          (caught) => setShot({ phase: 'dialog', error: caught instanceof Error ? caught.message : String(caught) }))
        void copyPng(png).then((copied) => setShot((current) => current && !current.error && {
          ...current,
          copied,
          phase: copied === false && current.phase === 'thumb' ? 'dialog' : current.phase,
        }))
      }
      const save = () => {
        const link = document.createElement('a')
        link.href = shot.url
        link.download = shot.fileName
        link.click()
      }
      const dialog = () => h(CenterDialog, {
        titleId: 'osubs-shot',
        title: t.usageShareTitle,
        subtitle: shot.error ? fill(t.usageShareFailed, shot.error) : shot.copied === null ? t.usageCopying : shot.copied ? t.usageCopied : t.usageCopyFailed,
        closeLabel: t.dialogClose,
        onClose: close,
        cardClass: 'osubs-dsw-card osubs-dsw-card--shot',
        footer: shot.png && h(Fragment || 'span', null,
          h(Button, {
            size: 'sm', disabled: shot.copied === null, label: t.usageCopy,
            onClick: () => {
              setShot((current) => current && { ...current, copied: null })
              void copyPng(shot.png).then((copied) => setShot((current) => current && { ...current, copied }))
            },
          }),
          h(Button, { size: 'sm', variant: 'primary', onClick: save, label: t.usageSave })),
      }, shot.url && h('div', { className: 'osubs-shot' }, h('img', { src: shot.url, alt: t.usageShareTitle })))
      const layer = shot && h(Fragment || 'span', null,
        shot.flash && h('div', {
          className: 'osubs-flash',
          'aria-hidden': 'true',
          style: { left: shot.from.left, top: shot.from.top, width: shot.from.width, height: shot.from.height },
          onAnimationEnd: () => setShot((current) => current && { ...current, flash: false }),
        }),
        shot.phase === 'thumb' && h(ShotThumb, {
          key: shot.url,
          url: shot.url,
          from: shot.from,
          copied: shot.copied,
          t,
          onOpen: () => setShot((current) => current && { ...current, phase: 'dialog' }),
          onDone: close,
        }),
        shot.phase === 'dialog' && dialog())
      return { busy: shot?.phase === 'busy', start, layer }
    }

    function ShareButton({ t, busy, disabled, onClick }) {
      return h(Button, {
        size: 'sm', disabled: disabled || busy, onClick,
        label: h('span', { className: 'osubs-refresh' + (busy ? ' osubs-refresh--spin' : '') }, h(IconShare), busy ? t.usageSharing : t.usageShare),
      })
    }

    function UsageSkeleton() {
      return h('div', { className: 'osubs-usk', 'aria-hidden': 'true' },
        h('div', { className: 'osubs-ustats' }, [0, 1, 2, 3].map((i) => h('div', { key: i, className: 'osubs-ustat' },
          h('i', { className: 'osubs-sk osubs-sk--n' }), h('i', { className: 'osubs-sk osubs-sk--l' })))),
        h('i', { className: 'osubs-sk osubs-sk--chart' }))
    }

    function UsagePanel({ t, data, error, scope, busy, onRefresh, version, repo }) {
      const [range, setRange] = useState<number | 'today'>(readStoredRange)
      const [hover, setHover] = useState(-1)
      const [by, setBy] = useState<'model' | 'session'>('model')
      const [copiedId, setCopiedId] = useState(null)
      const shot = useShot(t)
      const cardRef = useRef(null)
      const rows = data?.rows ?? null
      const ranges = [['today', t.usageToday], [7, fill(t.usageDays, 7)], [30, fill(t.usageDays, 30)]]
      const rangeLabel = ranges.find(([id]) => id === range)?.[1]
      const pickRange = (id) => { setRange(id); writeStoredRange(id); setHover(-1) }
      const share = () => {
        if (!data) return
        setHover(-1)
        shot.start(cardRef.current, shotFooter(t, {
          version, repo, at: data.at,
          scope: `${scope === 'all' ? t.allFamilies : usageFamilyName(t, scope)} · ${rangeLabel}`,
        }), `oauth-subs-usage-${stamp(data.at).slice(0, 10)}.png`)
      }

      const head = h('header', { className: 'osubs-uhead' },
          // Controls stay out of the shared image (the footer carries the date).
          h('span', { className: 'osubs-noshot', 'data-noshot': '' },
            data && h('span', { className: 'osubs-note osubs-uhead-note' }, fill(t.usageUpdated, new Date(data.at).toLocaleTimeString(localeOf(), { hour: '2-digit', minute: '2-digit' }))),
            h(Button, {
              size: 'sm', disabled: busy, onClick: onRefresh,
              label: h('span', { className: 'osubs-refresh' + (busy ? ' osubs-refresh--spin' : '') }, h(IconRefresh), t.quotaRefresh),
            }),
            h(ShareButton, { t, busy: shot.busy, disabled: !rows, onClick: share })),
          h('div', { className: 'osubs-seg', role: 'group' }, ranges.map(([id, label]) => h(Button, {
            key: id, size: 'sm', variant: range === id ? 'primary' : undefined,
            onClick: () => pickRange(id), label,
          }))))
      if (rows === null) {
        return h('section', { className: 'osubs-card', 'aria-busy': !error },
          head, error ? h('p', { className: 'osubs-hint osubs-bad' }, error) : h(UsageSkeleton))
      }

      // Buckets oldest first: today's 24 hours, or local calendar days ending today.
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const hourly = range === 'today'
      const bucketKey = (ms) => (hourly ? `${dayKey(ms)}:${new Date(ms).getHours()}` : dayKey(ms))
      const buckets = hourly
        ? Array.from({ length: 24 }, (_, hour) => ({ key: `${dayKey(today.getTime())}:${hour}`, label: `${hour}:00`, ...emptyUsage() }))
        : Array.from({ length: range }, (_, i) => {
          const d = new Date(today)
          d.setDate(d.getDate() - (range - 1 - i))
          return { key: dayKey(d.getTime()), label: `${d.getMonth() + 1}/${d.getDate()}`, ...emptyUsage() }
        })
      const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
      const models = new Map()
      const total = emptyUsage()
      const costs = Array.isArray(data?.costs) ? data.costs : []
      rows.forEach((row, i) => {
        if (scope !== 'all' && row[1] !== scope) return
        const bucket = byKey.get(bucketKey(row[0] * HOUR_MS))
        if (!bucket) return
        const cost = costs[i] ?? null
        addUsage(bucket, row, cost)
        addUsage(total, row, cost)
        const key = `${row[1]}/${row[2]}`
        const model = models.get(key) ?? models.set(key, { family: row[1], model: row[2], priced: false, ...emptyUsage() }).get(key)
        addUsage(model, row, cost)
        // A $0 rate row is still a priced model (Cline's free group).
        if (cost != null) model.priced = true
      })
      const top = niceCeil(Math.max(...buckets.map(usageTokens)))
      const ranked = [...models.values()].filter((model) => model.calls || model.failed)
        .sort((a, b) => usageTokens(b) - usageTokens(a) || b.calls - a.calls)
      const peak = Math.max(1, usageTokens(ranked[0] ?? total))
      // Hours: every 6th. Days: all 7; at 30, every 5th back from today.
      const labelled = (i) => (hourly ? i % 6 === 0 : range <= 7 || (range - 1 - i) % 5 === 0)
      const hit = usageHit(total)
      const ttft = usageTtft(total)
      const speed = usageSpeed(total)
      const inOut = (sum) => fill(t.usageInOut, { a: compactNumber(sum.input), b: compactNumber(sum.output) })
      const pricedModels = ranked.filter((row) => row.priced).length
      const costSub = ranked.length && pricedModels < ranked.length
        ? fill(t.usageCostCover, { a: pricedModels, b: ranked.length })
        : t.usageCostSub
      // 按会话: one row per session, newest first (the host aggregates each
      // session file). A scoped rail narrows to that family's share of it.
      const sessionList = ((data?.sessions ?? []) as any[])
        .map((session) => {
          if (scope === 'all') {
            return { id: session.id, lastAt: session.lastAt, calls: session.calls, failed: session.failed,
              tokens: session.input + session.output, cost: session.cost, models: session.models ?? [] }
          }
          const models = (session.models ?? []).filter((model) => model.family === scope)
          if (!models.length) return null
          return { id: session.id, lastAt: session.lastAt,
            calls: models.reduce((n, m) => n + m.calls, 0), failed: 0,
            tokens: models.reduce((n, m) => n + m.tokens, 0), cost: models.reduce((n, m) => n + m.cost, 0), models }
        })
        .filter(Boolean)
        .slice(0, 50)
      const sessionPeak = Math.max(1, ...sessionList.map((session) => session.tokens))
      const copySessionId = (id) => {
        try {
          void navigator.clipboard?.writeText(id).then(() => {
            setCopiedId(id)
            setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500)
          }, () => undefined)
        } catch { /* no clipboard: the full id stays in the chip's title */ }
      }
      const sessionModelsSub = (session) => [
        [session.models[0]?.model, session.models[1]?.model,
          session.models.length > 2 ? fill(t.usageModelsMore, { n: session.models.length - 2 }) : ''].filter(Boolean).join(' · '),
        [fill(t.usageCallsN, session.calls.toLocaleString('en-US')),
          session.failed ? fill(t.usageFailed, session.failed) : ''].filter(Boolean).join(' · '),
      ].filter(Boolean).join(' · ')

      const stat = (label, value, sub, title?) => h('div', { className: 'osubs-ustat', title },
        h('span', { className: 'osubs-ustat-l' }, label),
        h('span', { className: 'osubs-ustat-v' }, value),
        sub && h('span', { className: 'osubs-ustat-s' }, sub))
      const tipLine = (label, value) => h('div', { className: 'osubs-ptip-line' },
        h('span', { className: 'osubs-ptip-l' }, label),
        h('span', { className: 'osubs-ptip-v' }, value.toLocaleString('en-US')))
      const modelSub = (row) => [
        fill(t.usageCallsN, row.calls.toLocaleString('en-US')),
        row.failed ? fill(t.usageFailed, row.failed) : '',
        usageTtft(row) != null ? fill(t.usageTtftShort, formatMs(usageTtft(row))) : '',
        usageSpeed(row) != null ? `${Math.round(usageSpeed(row))} tok/s` : '',
        row.priced ? fill(t.usageEstShort, { v: compactUsd(row.cost) }) : '',
      ].filter(Boolean).join(' · ')

      return h(Fragment || 'div', null, h('section', { className: 'osubs-card', ref: cardRef },
        head,
        error && h('p', { className: 'osubs-hint osubs-bad' }, error),
        h('div', { className: 'osubs-ustats' },
          stat(t.usageTokens, compactNumber(usageTokens(total)), inOut(total)),
          stat(t.usageCacheRead, hit != null || total.cacheRead ? compactNumber(total.cacheRead) : '—', hit != null ? fill(t.usageHit, `${Math.round(hit * 100)}%`) : t.usageHitNa, t.usageHitNote),
          stat(t.usageCalls, total.calls.toLocaleString('en-US'), total.failed ? fill(t.usageFailed, total.failed) : ''),
          stat(t.usageTtft, ttft != null ? formatMs(ttft) : '—', speed != null ? fill(t.usageSpeed, Math.round(speed)) : ''),
          stat(t.usageCost, total.cost > 0 || pricedModels ? compactUsd(total.cost) : '—', costSub, t.usageCostNote)),
        total.calls === 0 && total.failed === 0
          ? h('p', { className: 'osubs-hint' }, t.usageEmpty)
          : h(Fragment || 'div', null,
            h('div', { className: 'osubs-uchart', role: 'img', 'aria-label': `${hourly ? t.usageChartHourly : t.usageChart}: ${compactNumber(usageTokens(total))}` },
              h('div', { className: 'osubs-uaxis', 'aria-hidden': 'true' },
                h('span', null, compactNumber(top)), h('span', null, compactNumber(top / 2)), h('span', null, '0')),
              h('div', { className: 'osubs-uplot' },
                buckets.map((bucket, i) => h('div', {
                  key: bucket.key,
                  className: `osubs-ucol${hover === i ? ' osubs-ucol--on' : ''}`,
                  tabIndex: 0,
                  'aria-label': `${bucket.label} ${t.usageTokens} ${usageTokens(bucket).toLocaleString('en-US')}`,
                  onMouseEnter: () => setHover(i),
                  onMouseLeave: () => setHover(-1),
                  onFocus: () => setHover(i),
                  onBlur: () => setHover(-1),
                },
                  // Output stacked on input, one bar per bucket.
                  h('span', { className: 'osubs-ubar', style: { height: `${(usageTokens(bucket) / top) * 100}%` } },
                    bucket.output > 0 && h('i', { className: 'osubs-ubar-out', style: { flexGrow: bucket.output } }),
                    bucket.input > 0 && h('i', { className: 'osubs-ubar-in', style: { flexGrow: bucket.input } })),
                  // Right-anchored a bit early: at 30 bars the rightmost
                  // right-opening tip still clears the card edge.
                  hover === i && h('div', { className: `osubs-rtip osubs-utip${i >= Math.floor(buckets.length * 0.45) ? ' osubs-utip--end' : ''}`, role: 'tooltip' },
                    h('strong', null, bucket.label),
                    tipLine(t.usageInput, bucket.input),
                    tipLine(t.usageOutput, bucket.output),
                    h('div', { className: 'osubs-ptip-sep' }),
                    tipLine(t.usageCacheRead, bucket.cachePrompt || bucket.cacheRead ? bucket.cacheRead : '—'),
                    tipLine(t.usageCalls, bucket.calls),
                    bucket.cost > 0 && tipLine(t.usageCostTip, compactUsd(bucket.cost)),
                    bucket.failed > 0 && tipLine(t.usageFailedLabel, bucket.failed))))),
              h('div', { className: 'osubs-uxlabels', 'aria-hidden': 'true' },
                buckets.map((bucket, i) => h('span', { key: bucket.key }, labelled(i) ? bucket.label : '')))),
            h('div', { className: 'osubs-utable' },
              h('div', { className: 'osubs-urow osubs-urow--head osubs-urow--pick' },
                h('span', null, by === 'model' ? t.usageByModel : fill(t.usageSessionsN, sessionList.length)),
                h('span', { className: 'osubs-useg', role: 'group', 'data-noshot': '' },
                  [['model', t.usageByModel], ['session', t.usageBySession]].map(([id, label]) => h(Button, {
                    key: id, size: 'sm', variant: by === id ? 'primary' : undefined,
                    onClick: () => setBy(id), label,
                  })))),
              by === 'model'
                ? ranked.map((row) => h('div', { className: 'osubs-urow', key: `${row.family}/${row.model}` },
                  h('span', { className: 'osubs-umodel' },
                    usageFamilyIcon(row.family) && h('span', { className: 'osubs-rail-ic', title: usageFamilyName(t, row.family), style: FAMILY_COLOR[row.family] ? { color: FAMILY_COLOR[row.family] } : undefined },
                      h(TabIcon, { name: usageFamilyIcon(row.family), className: 'osubs-rail-icon' })),
                    h('span', { className: 'osubs-umodel-who' },
                      h('span', { className: 'osubs-umodel-n' }, row.model),
                      h('span', { className: 'osubs-umodel-s' }, modelSub(row)))),
                  h('span', { className: 'osubs-ushare' },
                    h('i', { style: { width: `${Math.max(1.5, (usageTokens(row) / peak) * 100)}%` } })),
                  h('span', { className: 'osubs-unum' },
                    h('b', null, compactNumber(usageTokens(row))),
                    h('small', null, `${Math.round((usageTokens(row) / Math.max(1, usageTokens(total))) * 100)}%`))))
                : sessionList.map((session) => h('div', { className: 'osubs-urow', key: session.id },
                  h('span', { className: 'osubs-umodel' },
                    h('span', { className: 'osubs-umodel-who' },
                      h('span', { className: 'osubs-umodel-n osubs-usess-n' },
                        shortStamp(session.lastAt),
                        h('button', {
                          type: 'button', className: 'osubs-ucopy', 'data-noshot': '',
                          title: session.id, 'aria-label': t.usageCopyId,
                          onClick: () => copySessionId(session.id),
                        }, copiedId === session.id ? t.usageCopiedShort : session.id.slice(0, 8))),
                      h('span', { className: 'osubs-umodel-s', title: session.models.map((model) => `${model.family}/${model.model}`).join('\n') },
                        sessionModelsSub(session)))),
                  h('span', { className: 'osubs-ushare' },
                    h('i', { style: { width: `${Math.max(1.5, (session.tokens / sessionPeak) * 100)}%` } })),
                  h('span', { className: 'osubs-unum' },
                    h('b', null, compactNumber(session.tokens)),
                    h('small', null, session.cost > 0
                      ? fill(t.usageEstShort, { v: compactUsd(session.cost) })
                      : `${Math.round((session.tokens / Math.max(1, usageTokens(total))) * 100)}%`)))))),
      ), shot.layer)
    }
