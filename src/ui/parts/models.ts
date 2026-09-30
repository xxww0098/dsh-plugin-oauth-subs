// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// Models page: price tags, model rows, the switch table, and the context-window dialog.

    /** 4096 → '4K', 1000000 → '1M', 1048576 → '1M' — same shape as the
        catalog's formatWindow (src/utils/context-mode.ts). */
    function formatTokens(tokens) {
      if (tokens % 1_000_000 === 0) return `${tokens / 1_000_000}M`
      if (tokens % 1000 !== 0) {
        if (tokens % 1_048_576 === 0) return `${tokens / 1_048_576}M`
        if (tokens % 1024 === 0) return `${tokens / 1024}K`
      }
      return `${Math.round(tokens / 1000)}K`
    }

    /** `400000` / `400k` / `1.5m` → integer tokens; anything else is invalid. */
    function parseContextInput(text) {
      const match = /^(\d+(?:\.\d+)?)([kKmM])?$/.exec(String(text ?? '').trim())
      if (!match) return undefined
      const scale = match[2] === undefined ? 1 : match[2].toLowerCase() === 'm' ? 1_000_000 : 1_000
      const tokens = Math.round(Number(match[1]) * scale)
      return Number.isSafeInteger(tokens) ? tokens : undefined
    }

    const CONTEXT_WINDOW_MIN = 4096
    const CONTEXT_WINDOW_ABS_MAX = 2_097_152

    /** upstream formatUsd: full precision when the value needs it, else $0.60. */
    function priceUsd(value) {
      const rounded = Number(value).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
      const dot = rounded.indexOf('.')
      return `$${(dot === -1 ? 0 : rounded.length - dot - 1) >= 2 ? rounded : Number(value).toFixed(2)}`
    }

    /** Gold-coin mark: ring + a centered $, sized like the eye icon. */
    function IconCoin() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M8 4.3v7.4', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }),
        h('path', { d: 'M10.1 5.9c-.4-.7-1.2-1.1-2.1-1.1-1.2 0-2.1.7-2.1 1.6 0 2.2 4.2 1.1 4.2 3.1 0 1-.9 1.8-2.1 1.8-.9 0-1.7-.4-2.1-1', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }),
      )
    }

    /** One tooltip line; a price the source does not list (absent cache read) is omitted, never shown as $0. */
    function PriceLine({ label, value }) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return null
      return h('span', { className: 'osubs-ptip-line' },
        h('span', { className: 'osubs-ptip-l' }, label),
        h('span', { className: 'osubs-ptip-v' }, priceUsd(value)),
      )
    }

    /**
     * Money tag on a Models-tab row: hover/focus lists the model's
     * USD-per-1M-token rates (src/catalog/rates.json). Peak bands render under
     * the standard rows with the shared time-of-day schedule as a footnote;
     * tier rows ("over N context") come after the base triple.
     */
    function PriceTag({ t, pricing, tod }) {
      const [open, setOpen] = useState(false)
      const [tipId] = useState(() => `osubs-ptip-${++resetTipSeq}`)
      useEffect(() => {
        if (!open) return
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])
      if (!pricing) return null
      const hasPeak = Boolean(pricing.tod?.peak)
      const todNote = hasPeak && tod ? fill(t.priceTodNote, {
        date: tod.effectiveFrom,
        win: (tod.peakWindowsUtc ?? []).map((w) => `${String(w[0]).padStart(2, '0')}:00–${String(w[1]).padStart(2, '0')}:00`).join(', '),
      }) : null
      return h('span', {
        className: 'osubs-ptag',
        tabIndex: 0,
        'aria-label': t.priceTag,
        'aria-describedby': open ? tipId : undefined,
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
      },
        h(IconCoin),
        open && h('span', { id: tipId, role: 'tooltip', className: 'osubs-rtip' },
          hasPeak ? h(PriceLine, { label: t.priceIn, value: pricing.tod.offPeak.in }) : h(PriceLine, { label: t.priceIn, value: pricing.in }),
          hasPeak ? h(PriceLine, { label: t.priceOut, value: pricing.tod.offPeak.out }) : h(PriceLine, { label: t.priceOut, value: pricing.out }),
          hasPeak ? h(PriceLine, { label: t.priceCache, value: pricing.tod.offPeak.cacheRead }) : h(PriceLine, { label: t.priceCache, value: pricing.cacheRead }),
          pricing.cacheWrite != null && h(PriceLine, { label: t.priceWrite, value: pricing.cacheWrite }),
          pricing.cacheWrite1h != null && pricing.cacheWrite1h !== pricing.cacheWrite && h(PriceLine, { label: t.priceWrite1h, value: pricing.cacheWrite1h }),
          hasPeak && h('span', { className: 'osubs-ptip-sep' }),
          hasPeak && h(PriceLine, { label: `${t.pricePeak} · ${t.priceIn}`, value: pricing.tod.peak.in }),
          hasPeak && h(PriceLine, { label: `${t.pricePeak} · ${t.priceOut}`, value: pricing.tod.peak.out }),
          hasPeak && h(PriceLine, { label: `${t.pricePeak} · ${t.priceCache}`, value: pricing.tod.peak.cacheRead }),
          Array.isArray(pricing.tiers) && pricing.tiers.length > 0 && h('span', { className: 'osubs-ptip-sep' }),
          Array.isArray(pricing.tiers) && pricing.tiers.map((tier, i) => h('span', { key: i },
            h('span', { className: 'osubs-ptip-note' }, fill(t.priceTier, formatTokens(pricing.tierThreshold))),
            h(PriceLine, { label: t.priceIn, value: tier.in }),
            h(PriceLine, { label: t.priceOut, value: tier.out }),
            h(PriceLine, { label: t.priceCache, value: tier.cacheRead }),
          )),
          todNote && h('span', { className: 'osubs-ptip-note' }, todNote),
        ),
      )
    }

    function ModelRow({ t, model, family, tod, onToggle, onContext, locked, overrides }) {
      const enabled = Boolean(overrides?.[model.key] ?? model.enabled) && !locked
      return h('div', { className: 'osubs-mrow' },
        h('div', { className: 'osubs-mname' },
          h('span', null, model.name),
          Array.isArray(model.input) && model.input.includes('image')
            && h('span', { className: 'osubs-vision', title: t.visionTag }, h(IconEye)),
          // The window tag is a button: every model row's entry into the
          // custom input-context editor (route contextWindow + compaction).
          model.window && h('button', {
            type: 'button',
            className: `osubs-tag osubs-tag--ctx${model.custom ? ' osubs-tag--custom' : ''}`,
            title: model.custom ? fill(t.ctxCustomTitle, model.window) : t.ctxTagTitle,
            'aria-label': `${model.name} ${t.ctxTagTitle}`,
            onClick: () => onContext?.({ ...model, family }),
          }, model.window),
          model.rate && h('span', { className: 'osubs-tag osubs-tag--plain', title: t.rateTag }, `×${model.rate}`),
          h(PriceTag, { t, pricing: model.pricing, tod }),
        ),
        h(Switch, {
          checked: enabled,
          disabled: Boolean(locked),
          label: model.name,
          onChange: (on) => onToggle(model.key, on),
        }),
      )
    }

    function ModelsPanel({ t, catalog, scope, railIdOf, query, onQuery, onToggle, onFamily, onAll, onOpenFamily, onContext, onResetContexts, overrides, efforts, onEffort }) {
      const all = Array.isArray(catalog) ? catalog : []
      // 默认档位 edits the families in scope: 全部 sets (and unifies) every family.
      const effortFamilies = all.filter((group) => scope === 'all' || railIdOf(group.family) === scope).map((group) => group.family)
      const effortValues = [...new Set(effortFamilies.map((family) => efforts?.[family] ?? ''))]
      const effort = effortValues.length > 1 ? 'mixed' : (effortValues[0] ?? '')
      const q = String(query ?? '').trim().toLowerCase()
      const groups = all
        .filter((group) => scope === 'all' || railIdOf(group.family) === scope)
        .map((group) => ({
          ...group,
          models: (Array.isArray(group.models) ? group.models : [])
            .filter((model) => !q || `${model.name} ${model.id}`.toLowerCase().includes(q)),
        }))
        .filter((group) => !q || group.models.length > 0)
      const total = groups.reduce((n, group) => n + group.models.length, 0)
      const enabled = groups.reduce((n, group) => (
        n + (group.loggedIn ? group.models.filter((model) => model.enabled).length : 0)
      ), 0)
      const hasCustom = groups.some((group) => group.models.some((model) => model.custom))
      const scopeAll = scope === 'all'
      const single = groups.length === 1 ? groups[0] : undefined
      const rows = []
      for (const group of groups) {
        if (!single) {
          const groupOn = group.loggedIn ? group.models.filter((model) => model.enabled).length : 0
          rows.push(h('div', { className: 'osubs-mgroup', key: `g:${group.provider}` },
            h('span', null, group.displayName),
            h('span', { className: 'osubs-mgroup-side' },
              group.loggedIn && h('span', { className: 'osubs-note' }, fill(t.modelsEnabled, `${groupOn} / ${group.models.length}`)),
              group.loggedIn && h('div', { className: 'osubs-seg' },
                h(Button, { size: 'sm', onClick: () => onFamily(group.family, true), label: t.modelsAll }),
                h(Button, { size: 'sm', onClick: () => onFamily(group.family, false), label: t.modelsNone }),
              ),
              !group.loggedIn && h('span', { className: 'osubs-note' }, t.modelsNeedLogin),
              !group.loggedIn && h(Button, { size: 'sm', onClick: () => onOpenFamily?.(group.family), label: t.login }),
            ),
          ))
        }
        for (const model of group.models) {
          rows.push(h(ModelRow, {
            t, model, family: railIdOf(group.family), tod: group.pricingTimeOfDay, onToggle, onContext,
            locked: !group.loggedIn, overrides, key: model.key,
          }))
        }
      }
      return h('section', { className: 'osubs-card' },
        h('div', { className: 'osubs-mtools' },
          h('div', { className: 'osubs-msearch' },
            h(IconSearch),
            h('input', {
              value: query,
              placeholder: t.modelsSearch,
              'aria-label': t.modelsSearch,
              autoComplete: 'off',
              onChange: (event) => onQuery(event.target.value),
            }),
          ),
          h('label', { className: 'osubs-meffort', title: t.modelsEffortHint },
            h('span', null, t.modelsEffort),
            h('select', { value: effort, onChange: (event) => onEffort?.(event.target.value || null, effortFamilies, scope === 'all') },
              effort === 'mixed' && h('option', { value: 'mixed', disabled: true }, t.modelsEffortMixed),
              h('option', { value: '' }, t.modelsEffortNone),
              // Same names as DSH's own picker (it capitalizes the level id).
              ['off', 'low', 'medium', 'high', 'xhigh', 'max'].map((level) => h('option', { key: level, value: level }, level[0].toUpperCase() + level.slice(1))),
            ),
          ),
          h('span', { className: 'osubs-mcount' }, fill(t.modelsEnabled, `${enabled} / ${total}`)),
          scopeAll && h('div', { className: 'osubs-seg' },
            h(Button, { size: 'sm', onClick: () => onAll(true), label: t.modelsAll }),
            h(Button, { size: 'sm', onClick: () => onAll(false), label: t.modelsNone }),
          ),
          hasCustom && h(Button, { size: 'sm', onClick: onResetContexts, label: t.ctxResetAll }),
          single && (single.loggedIn
            ? h('div', { className: 'osubs-seg' },
              h(Button, { size: 'sm', onClick: () => onFamily(single.family, true), label: t.modelsAll }),
              h(Button, { size: 'sm', onClick: () => onFamily(single.family, false), label: t.modelsNone }),
            )
            : h(Fragment || 'span', null,
              h('span', { className: 'osubs-note' }, t.modelsNeedLogin),
              h(Button, { size: 'sm', variant: 'primary', onClick: () => onOpenFamily?.(single.family), label: t.login }),
            )),
        ),
        h('p', { className: 'osubs-note' }, t.modelsHint),
        h('div', { className: 'osubs-mtable' },
          h('div', { className: 'osubs-mhead' },
            h('span', null, t.modelsColumnName),
            h('span', null, t.modelsColumnOn),
          ),
          rows.length === 0 && h('p', { className: 'osubs-hint osubs-mempty' },
            all.length === 0 ? t.loading : t.modelsEmpty),
          ...rows,
        ),
      )
    }

    /** Edit one model row's input-context window; `null` resets to catalog.
        Edits cap at the row's own maximum (`contextMax`: the vendor's large
        window when advertised, else the catalog window). Typing the catalog
        default folds into the same reset so `contexts` only holds real
        deviations (and the row's `--custom` tint never lies). */
    function ContextEditDialog({ t, model, onClose, onSubmit }) {
      const [value, setValue] = useState('')
      const [busy, setBusy] = useState(false)
      const trackRef = useRef(null)
      const parsed = parseContextInput(value)
      const max = Number(model.contextMax)
      const ceiling = Number.isFinite(max) && max > 0 ? max : CONTEXT_WINDOW_ABS_MAX
      const current = Number(model.contextValue)
      const catalogDefault = Number(model.contextDefault)
      const editing = value.trim() !== ''
      const inRange = parsed !== undefined && parsed >= CONTEXT_WINDOW_MIN && parsed <= ceiling
      const bad = editing && !inRange
      const unchanged = inRange && Number.isFinite(current) && parsed === current
      // The scale always has a position: the parsed draft when it parses,
      // else the window the row currently runs at.
      const shown = parsed !== undefined ? parsed : (Number.isFinite(current) ? current : 0)
      const shownRatio = Math.max(0, Math.min(1, shown / ceiling))
      const defaultRatio = Number.isFinite(catalogDefault) && catalogDefault < ceiling
        ? Math.min(98, Math.max(2, (catalogDefault / ceiling) * 100))
        : undefined
      // The track doubles as the slider: drag (or arrow keys) writes the
      // k/m shorthand back into the draft at a 1K step, and each preset
      // node is a button that fills the draft directly. The catalog
      // default already sits on the track as the tick, so it never gets a
      // node; nodes within ~2% of an end would crowd the end labels.
      // Binary labels are lossy ('1M' parses back as 1000000), so the
      // draft falls back to exact digits when the label would not round-trip.
      const draft = (tokens) => {
        const label = formatTokens(tokens)
        setValue(parseContextInput(label) === tokens ? label : String(tokens))
      }
      const endLabel = model.windowMax ?? formatTokens(ceiling)
      const presets = [128_000, 256_000, 512_000, 1_000_000]
        .filter((tokens) => tokens >= CONTEXT_WINDOW_MIN && tokens < ceiling && tokens !== catalogDefault
          && formatTokens(tokens) !== endLabel)
      const slideTo = (clientX) => {
        const box = trackRef.current?.getBoundingClientRect()
        if (!box || box.width <= 0) return
        const ratio = Math.max(0, Math.min(1, (clientX - box.left) / box.width))
        draft(Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, Math.round(ratio * ceiling / 1000) * 1000)))
      }
      const slide = {
        onPointerDown: (event) => {
          if (busy || (event.button != null && event.button !== 0)) return
          trackRef.current?.setPointerCapture?.(event.pointerId)
          slideTo(event.clientX)
        },
        onPointerMove: (event) => {
          if (event.buttons & 1) slideTo(event.clientX)
        },
        onKeyDown: (event) => {
          if (busy) return
          const base = Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, shown))
          let next
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = base - 1000
          else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = base + 1000
          else if (event.key === 'PageDown') next = base - 64_000
          else if (event.key === 'PageUp') next = base + 64_000
          else if (event.key === 'Home') next = CONTEXT_WINDOW_MIN
          else if (event.key === 'End') next = ceiling
          else return
          event.preventDefault()
          draft(Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, Math.round(next / 1000) * 1000)))
        },
      }
      const submit = async (context) => {
        if (busy) return
        setBusy(true)
        const ok = await onSubmit(context)
        setBusy(false)
        if (ok !== false) onClose()
      }
      const mark = model.family && FAMILY_ICON[model.family]
      return h(CenterDialog, {
        titleId: 'osubs-ctx',
        title: t.ctxDialogTitle,
        subtitle: model.name,
        icon: mark && h('span', {
          className: 'osubs-dsw-mark',
          style: FAMILY_COLOR[model.family] ? { color: FAMILY_COLOR[model.family] } : undefined,
        }, h(TabIcon, { name: mark, className: 'osubs-dsw-mark-icon' })),
        closeLabel: t.dialogClose,
        onClose: busy ? () => undefined : onClose,
        cardClass: 'osubs-dsw-card osubs-dsw-card--add',
        bodyClass: 'osubs-dsw-body osubs-dsw-body--stack',
        footer: [
          // Outline button at the footer's left edge, icon + label so it
          // reads as an action, not chrome. It stages the catalog default
          // into the draft (exact digits, so applying folds into the same
          // reset) — enabled whenever the draft isn't already the default,
          // and for a customized row even before anything is typed.
          h('button', {
            key: 'reset', type: 'button',
            className: 'osubs-dsw-btn osubs-dsw-btn--outline osubs-ctx-reset',
            title: `${t.ctxReset}（${model.windowDefault}）`,
            disabled: busy || !Number.isFinite(catalogDefault) ||
              (editing ? parsed === catalogDefault : !model.custom),
            onClick: () => setValue(String(catalogDefault)),
          }, h(IconRefresh), t.ctxReset),
          h('button', {
            key: 'save', type: 'submit', form: 'osubs-ctx-form',
            className: 'osubs-dsw-btn osubs-dsw-btn--primary',
            disabled: busy || !inRange || unchanged,
          }, busy ? t.ctxSaving : t.ctxSave),
        ],
      },
      h('div', { className: 'osubs-ctx-stats' },
        model.custom && h('div', { className: 'osubs-ctx-stat osubs-ctx-stat--now' },
          h('span', { className: 'osubs-ctx-stat-label' }, t.ctxStatNow),
          h('span', { className: 'osubs-ctx-stat-value' }, model.window),
        ),
        h('div', { className: 'osubs-ctx-stat' },
          h('span', { className: 'osubs-ctx-stat-label' }, t.ctxStatDefault),
          h('span', { className: 'osubs-ctx-stat-value' }, model.windowDefault),
        ),
        h('div', { className: 'osubs-ctx-stat' },
          h('span', { className: 'osubs-ctx-stat-label' }, t.ctxStatMax),
          h('span', { className: 'osubs-ctx-stat-value' }, model.windowMax),
        ),
      ),
      h('form', {
        id: 'osubs-ctx-form',
        className: 'osubs-fields',
        onSubmit: (event) => {
          event.preventDefault()
          if (inRange && !unchanged) {
            void submit(Number.isFinite(catalogDefault) && parsed === catalogDefault ? null : parsed)
          }
        },
      },
        h('input', {
          className: `osubs-input osubs-input--num${bad ? ' osubs-input--bad' : ''}`,
          value,
          onChange: (event) => setValue(event.target.value),
          placeholder: '400k',
          autoFocus: true,
          spellCheck: false,
          autoComplete: 'off',
          inputMode: 'decimal',
          'aria-label': t.ctxDialogTitle,
          'aria-invalid': bad || undefined,
          'aria-describedby': 'osubs-ctx-feedback',
        }),
        h('p', { className: 'osubs-note' }, t.ctxSyntax),
      ),
      h('div', { className: 'osubs-ctx-scale' },
        h('div', {
          id: 'osubs-ctx-feedback',
          className: `osubs-ctx-readout${bad ? ' osubs-bad' : ''}`,
          'aria-live': 'polite',
        },
          h('span', { className: 'osubs-ctx-tokens' },
            editing && parsed === undefined
              ? t.ctxInvalid
              : bad
                ? fill(t.ctxOutOfRange, `${CONTEXT_WINDOW_MIN.toLocaleString('en-US')}–${ceiling.toLocaleString('en-US')}`)
                : fill(t.ctxPreview, shown.toLocaleString('en-US'))),
          h('span', { className: 'osubs-ctx-pct' }, `${Math.round((shown / ceiling) * 100)}%`),
        ),
        // A slider's children are presentational to AT, so the preset
        // buttons sit beside the track in the wrapper, not inside it.
        h('div', { className: 'osubs-ctx-slider' },
          h('div', {
            ref: trackRef,
            className: 'osubs-ctx-track',
            role: 'slider',
            tabIndex: busy ? -1 : 0,
            'aria-valuemin': CONTEXT_WINDOW_MIN,
            'aria-valuemax': ceiling,
            'aria-valuenow': Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, shown)),
            'aria-valuetext': fill(t.ctxPreview, Math.max(CONTEXT_WINDOW_MIN, Math.min(ceiling, shown)).toLocaleString('en-US')),
            'aria-label': t.ctxDialogTitle,
            'aria-disabled': busy || undefined,
            ...slide,
          },
            h('i', {
              className: 'osubs-ctx-fill',
              style: {
                transform: `scaleX(${shownRatio})`,
                background: bad
                  ? 'var(--osubs-bad)'
                  : editing ? 'var(--osubs-accent)' : undefined,
              },
            }),
            defaultRatio !== undefined && h('b', {
              className: 'osubs-ctx-tick',
              style: { left: `${defaultRatio}%` },
              title: `${t.ctxStatDefault} ${model.windowDefault}`,
            }),
            h('i', {
              className: 'osubs-ctx-thumb',
              style: { left: `${shownRatio * 100}%` },
            }),
          ),
          presets.map((tokens) => h('button', {
            key: tokens,
            type: 'button',
            className: 'osubs-ctx-node',
            style: { left: `${(tokens / ceiling) * 100}%` },
            disabled: busy,
            'aria-label': formatTokens(tokens),
            onPointerDown: (event) => event.stopPropagation(),
            onClick: () => draft(tokens),
          })),
        ),
        h('div', { className: 'osubs-ctx-ends' },
          h('span', null, formatTokens(CONTEXT_WINDOW_MIN)),
          presets.map((tokens) => h('button', {
            key: tokens,
            type: 'button',
            className: 'osubs-ctx-key',
            style: { left: `${(tokens / ceiling) * 100}%` },
            disabled: busy,
            onClick: () => draft(tokens),
          }, formatTokens(tokens))),
          h('span', null, endLabel),
        ),
      ),
      )
    }
