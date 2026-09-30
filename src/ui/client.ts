/**
 * Browser half. Registers the "OAuth 订阅" workbench as a main sidebar
 * panel (左栏插件按钮下方的订阅入口 → 额度/模型/设置).
 *
 * DSH client-modules serves the compiled classic script and requires the
 * `__ModuleLoader__.load` handoff (id = package name). Shared requires are
 * only `react` plus the shell table; everything else stays inlined.
 */

interface ModuleLoader {
  load: (mod: { id: string; factory: (require: (id: string) => any) => unknown }) => void
}

interface Window {
  __ModuleLoader__: ModuleLoader
}

type ReactLike = {
  createElement: (...args: any[]) => any
  useCallback: (fn: any, deps?: any[]) => any
  useEffect: (fn: () => any, deps?: any[]) => void
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void]
  useRef: (initial?: any) => { current: any }
  Fragment?: any
}

type Copy = Record<string, string>

window.__ModuleLoader__.load({
  id: 'dsh-plugin-oauth-subs',
  factory: (require) => {
    const module = { exports: {} as { name?: string; inject?: string[]; apply?: (ctx: any) => void } }
    const exports = module.exports
    const { createElement: h, useCallback, useEffect, useState, useRef, Fragment } = require('react') as ReactLike

    function tryHost(id) {
      try { return require(id) } catch { return undefined }
    }
    const primitives = tryHost('@deepseek-ai/dsh-client-ui-primitives')
    const HostRisk = primitives && (primitives.RiskConfirmation || primitives.default && primitives.default.RiskConfirmation)

    const name = 'dsh-plugin-oauth-subs-client'
    const inject = ['slots', 'connection']

    //@part copy

    //@part format

    //@part styles-shell

    //@part styles-views

    ensureStyles()

    //@part quota

    //@part provider-card

    //@part models

    //@part about

    //@part usage

    function SettingsSection({ rpc, close: _close }) {
      const t = COPY[localeOf()]
      const [snap, setSnap] = useState(readStoredSnap)
      const [pending, setPending] = useState({})
      const [error, setError] = useState('')
      const [view, setView] = useState('quota')
      const [family, setFamily] = useState('all')
      const [query, setQuery] = useState('')
      // Seed from the last stored snapshot so reopening the tab shows the
      // previously fetched versions instantly instead of a loading flash.
      const [update, setUpdate] = useState(() => readStoredSnap()?.update ?? null)
      const [updateBusy, setUpdateBusy] = useState(false)
      // Model switches flip on click: the models RPC then rewrites the
      // llm-pi-ai routes through a host settings reconcile that takes seconds.
      // The next snapshot reconciles each key; a failed run() reverts it.
      const [modelOverrides, setModelOverrides] = useState({})
      // The model row whose input-context window is being edited (Models view).
      const [contextEdit, setContextEdit] = useState(null)
      // 额度 → 分享: the cards in scope as one long image (identities masked,
      // the add-account row left out); same flow as 用量's.
      const quotaShot = useShot(t)
      const quotaListRef = useRef(null)
      // 用量: the last answer shows at once (kept across opens); entering the
      // tab asks again only when it is older than USAGE_TTL_MS, 刷新 always.
      const [usage, setUsage] = useState(readStoredUsage)
      const [usageError, setUsageError] = useState('')
      const [usageBusy, setUsageBusy] = useState(false)
      const loadUsage = async (fresh) => {
        setUsageBusy(true)
        try {
          const result = await callRpc(rpc, 'usage', fresh ? { fresh: true } : undefined)
          // An older host answers the bare row list.
          const next = Array.isArray(result) ? { at: Date.now(), rows: result } : result
          if (next && typeof next.at === 'number' && Array.isArray(next.rows)) {
            setUsage(next)
            writeStoredUsage(next)
          }
          setUsageError('')
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setUsageError(isUnknownOauthMethod(message) ? t.hostStale : message)
        } finally {
          setUsageBusy(false)
        }
      }
      useEffect(() => {
        if (view !== 'usage' || usageBusy) return
        if (usage && Date.now() - usage.at < USAGE_TTL_MS) return
        void loadUsage(false)
      }, [view])

      // `fresh` after the user's own action: the answer must not come from a
      // poll's snapshot that was already building before the write.
      // `revalidateQuota` goes with (re)entering the quota view: the host
      // re-reads readings older than its 15s floor behind the cached answer.
      const refresh = useCallback(async (fresh = false, revalidateQuota = false) => {
        if (rpc === undefined) return
        try {
          const payload = fresh || revalidateQuota
            ? { ...(fresh ? { fresh: true } : {}), ...(revalidateQuota ? { revalidateQuota: true } : {}) }
            : undefined
          const next = await callRpc(rpc, 'status', payload)
          setSnap(next)
          writeStoredSnap(next)
          setError('')
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : t.noRpc)
        }
      }, [rpc, t.noRpc])

      const root = useRef(null)
      // A pending login finishes on the host and only shows up via this poll,
      // so keep the quick cadence then; idle, quota moves at most every 15s.
      const loginPending = useRef(false)
      loginPending.current = Object.values(pending).some(Boolean)
      useEffect(() => {
        // Poll only while the panel is actually on screen; the next tick is
        // armed after the previous refresh settles, so polls never overlap.
        // A hidden tick costs no RPC — it re-checks visibility, so switching
        // back to a retained panel refreshes on the next tick, and a window
        // becoming visible again refreshes at once.
        let live = true
        let busy = false
        let timer
        // The first visible tick and every hidden→shown transition count as
        // entering the page, so quota older than the host floor is re-read.
        let wasShown = false
        const tick = async () => {
          if (busy) return
          busy = true
          clearTimeout(timer)
          const shown = panelVisible(root.current, document)
          const entered = shown && !wasShown
          wasShown = shown
          // A status RPC that never settles must not stop polling for good.
          if (shown) {
            await Promise.race([refresh(false, entered), new Promise((resolve) => setTimeout(resolve, 30_000))])
          }
          busy = false
          if (live) timer = setTimeout(tick, loginPending.current ? 1500 : 3000)
        }
        const onVisibility = () => { if (!document.hidden) void tick() }
        document.addEventListener('visibilitychange', onVisibility)
        void tick()
        return () => {
          live = false
          clearTimeout(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [refresh])

      useEffect(() => {
        if (!snap?.accounts) return
        setPending((current) => {
          let changed = false
          const next = { ...current }
          for (const id of Object.keys(current)) {
            if (!current[id] || snap.accounts[id]?.busy) continue
            next[id] = undefined
            changed = true
          }
          return changed ? next : current
        })
      }, [snap])

      const run = async (method, payload) => {
        try {
          const result = await callRpc(rpc, method, payload)
          if (method === 'login') {
            setPending((current) => ({ ...current, [payload.provider]: result }))
            if (result?.authorizeUrl && typeof window !== 'undefined') {
              window.open(result.authorizeUrl, '_blank', 'noopener')
            }
          }
          if (method === 'logout' || method === 'cancel' || method === 'key') {
            setPending((current) => ({ ...current, [payload.provider]: undefined }))
          }
          if (method === 'update') {
            setUpdate(result)
            setSnap((current) => current ? { ...current, update: { ...current.update, ...result } } : current)
            return result
          }
          if (method === 'models' && result && typeof result === 'object') {
            // setModels already returns a fresh snapshot — adopt it instead of
            // spending a second status RPC + snapshot build on convergence.
            setSnap(result)
            writeStoredSnap(result)
          } else {
            await refresh(true)
          }
          return true
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          if (isUnknownOauthMethod(message)) return false
          if (/^unknown provider /i.test(message)) {
            // Newer page on an older host: the family exists here but not in
            // the running build (login/import would misbehave or do nothing).
            setError(t.hostStale)
            return false
          }
          setError(message === 'cursor-import-empty' ? t.cursorImportEmpty : message === 'ollama-import-empty' ? t.ollamaImportEmpty : message === 'kimi-import-empty' ? t.kimiImportEmpty : message === 'copilot-import-empty' ? t.copilotImportEmpty : message === 'devin-import-empty' ? t.devinImportEmpty : message === 'cline-import-empty' ? t.clineImportEmpty : message === 'command-code-import-empty' ? t.commandCodeImportEmpty : message)
          return false
        }
      }

      // quiet: a cached result is already on screen — refresh silently in the
      // background instead of flashing the busy/checking state again.
      const checkUpdate = async (apply = false, quiet = false) => {
        if (!quiet) setUpdateBusy(true)
        try {
          await run('update', { apply })
        } finally {
          if (!quiet) setUpdateBusy(false)
        }
      }

      useEffect(() => {
        if (view === 'version') {
          // Re-check on every open, but quietly when a cached result is
          // already rendered — only the very first visit shows busy.
          if (!updateBusy) void checkUpdate(false, update !== null)
        }
      }, [view])

      // A usage-only rail entry has no quota card or model rows: leaving the
      // Usage view falls back to 全部 instead of an empty pane.
      useEffect(() => {
        if (view !== 'usage' && USAGE_ONLY_FAMILIES.includes(family)) setFamily('all')
      }, [view])

      // Returning to the quota view counts as entering the page; the mount
      // case is covered by the poll's first tick.
      const prevView = useRef(view)
      useEffect(() => {
        const before = prevView.current
        prevView.current = view
        if (view === 'quota' && before !== 'quota') void refresh(false, true)
      }, [view, refresh])

      const catalogKeysOf = (fam?) => (snap?.catalog ?? [])
        .filter((group) => fam === undefined || group.family === fam)
        .flatMap((group) => (group.models ?? []).map((model) => model.key))
      const toggleModels = (payload, keys, on) => {
        setModelOverrides((current) => {
          const next = { ...current }
          for (const key of keys) next[key] = on
          return next
        })
        void Promise.resolve(run('models', payload)).then((ok) => {
          if (ok !== false) return
          setModelOverrides((current) => {
            const next = { ...current }
            for (const key of keys) delete next[key]
            return next
          })
        })
      }
      // Drop overrides once a snapshot reports the clicked state (or the row
      // vanished); a stale snapshot keeps them so the switch stays put.
      useEffect(() => {
        setModelOverrides((current) => {
          const keys = Object.keys(current)
          if (keys.length === 0) return current
          const state = new Map()
          for (const group of snap?.catalog ?? []) {
            for (const model of group.models ?? []) state.set(model.key, Boolean(model.enabled))
          }
          let changed = false
          const next = { ...current }
          for (const key of keys) {
            const enabled = state.get(key)
            if (enabled === undefined || enabled === Boolean(current[key])) {
              delete next[key]
              changed = true
            }
          }
          return changed ? next : current
        })
      }, [snap])

      // 默认档位 shows the pick at once (the route rewrite behind it waits on the
      // host settings reconcile); a failed RPC reverts, a matching snapshot drops it.
      const [effortOverrides, setEffortOverrides] = useState({})
      const setEffort = (level, families, all) => {
        setEffortOverrides((current) => ({ ...current, ...Object.fromEntries(families.map((family) => [family, level ?? ''])) }))
        void Promise.resolve(run('models', { effort: level, ...(all ? {} : { families }) })).then((ok) => {
          if (ok !== false) return
          setEffortOverrides((current) => Object.fromEntries(Object.entries(current).filter(([family]) => !families.includes(family))))
        })
      }
      useEffect(() => {
        setEffortOverrides((current) => {
          const pending = Object.entries(current).filter(([family, level]) => (snap?.efforts?.[family] ?? '') !== level)
          return pending.length === Object.keys(current).length ? current : Object.fromEntries(pending)
        })
      }, [snap])

      if (rpc === undefined) {
        return h('p', { className: 'osubs-hint' }, t.noRpc)
      }

      const panel = (id, child, show, fill = false) => h('div', {
        key: id,
        hidden: !show,
        className: `osubs-pane-panel${fill ? ' osubs-pane-panel--fill' : ''}`,
        role: 'tabpanel',
      }, child)

      const card = (id) => h(ProviderCard, {
        t,
        id,
        title: FAMILY_NAME[id] ?? id,
        account: snap?.accounts?.[id],
        pending: pending[id],
        onLogin: (provider, mode, extra) => run('login', { provider, mode, ...extra }),
        onImport: (provider) => run('import', { provider }),
        onLogout: (provider, accountId) => run('logout', { provider, id: accountId }),
        onCancel: (provider) => run('cancel', { provider }),
        onManual: (provider, input) => run('manual', { provider, input }),
        onSwitch: (provider, accountId) => run('switch', { provider, id: accountId }),
        onRefreshQuota: (provider, accountId) => run('quota', { provider, id: accountId }),
        onResetQuota: id === 'codex' || id === 'glm' || id === 'grok'
          ? (provider, accountId, credit) => run('reset', { provider, id: accountId, ...(provider === 'glm' || provider === 'grok' ? { credit } : {}) })
          : undefined,
        onUseKey: (provider, key, extra) => run('key', { provider, key, ...(typeof extra === 'string' ? { region: extra } : extra || {}) }),
        onGoSave: async (payload) => {
          await callRpc(rpc, 'goSave', payload)
          await refresh(true)
        },
      })

      const catalogGroups = Array.isArray(snap?.catalog) ? snap.catalog : []
      const accountCountOf = (id) => {
        const roster = snap?.accounts?.[id]?.accounts
        return Array.isArray(roster) ? roster.length : 0
      }
      const modelCountOf = (id) => catalogGroups.reduce(
        (n, group) => n + (railIdOf(group.family) === id && Array.isArray(group.models) ? group.models.length : 0), 0)
      const usageCountOf = usageModelCounts(usage?.rows)
      const railCount = (id) => view === 'models' ? modelCountOf(id) : view === 'usage' ? usageCountOf(id) : accountCountOf(id)
      const railFamilies = view === 'usage' ? [...FAMILY_ORDER, ...USAGE_ONLY_FAMILIES] : FAMILY_ORDER
      const railItems = [
        { id: 'all', name: t.allFamilies, count: railFamilies.reduce((n, id) => n + railCount(id), 0) },
        ...railFamilies.map((id) => ({ id, name: usageFamilyName(t, id), icon: usageFamilyIcon(id), color: FAMILY_COLOR[id], count: railCount(id) })),
      ]
      const quotaPanel = (id) => panel(
        id, card(id), view === 'quota' && (family === 'all' || family === id),
      )

      return h('div', { className: 'osubs', ref: root },
        h('div', { className: 'osubs-ptabs', role: 'tablist' },
          h(PageTab, { id: 'quota', label: t.quota, view, onSelect: setView }),
          h(PageTab, { id: 'models', label: t.modelsTitle, view, onSelect: setView }),
          h(PageTab, { id: 'usage', label: t.tabUsage, view, onSelect: setView }),
          h(PageTab, { id: 'version', label: t.tabSettings, view, onSelect: setView }),
          h(PageTab, { id: 'donate', label: t.tabDonate, view, onSelect: setView }),
        ),
        h('div', { className: 'osubs-body' },
          (view === 'quota' || view === 'models' || view === 'usage') && h('div', { className: 'osubs-rail' },
            h('div', { className: 'osubs-rail-label' }, t.providers),
            railItems.map((item) => h(RailItem, { item, current: family, onSelect: setFamily, key: item.id }))),
          h('div', { className: 'osubs-pane' },
          error && h('p', { className: 'osubs-hint osubs-bad' }, error),
          snap?.proxy?.error && h('p', { className: 'osubs-hint osubs-bad' }, fill(t.proxyError, snap.proxy.error)),
          view === 'quota' && h('div', { className: 'osubs-qbar' },
            h(ShareButton, {
              t,
              busy: quotaShot.busy,
              onClick: () => quotaShot.start(quotaListRef.current, shotFooter(t, {
                version: aboutVersionOf(snap?.update, update),
                repo: aboutRepoOf(snap?.update, update),
                at: Date.now(),
                scope: `${family === 'all' ? t.allFamilies : usageFamilyName(t, family)} · ${t.quota}`,
              }), `oauth-subs-quota-${stamp(Date.now()).slice(0, 10)}.png`),
            })),
          // The cards' own box (the pane scrolls and is only as tall as the
          // window), so 分享 captures every card in scope.
          h('div', { className: 'osubs-qlist', ref: quotaListRef, hidden: view !== 'quota' },
            quotaPanel('codex'),
            quotaPanel('chatgpt'),
            quotaPanel('grok'),
            quotaPanel('glm'),
            quotaPanel('kiro'),
            quotaPanel('antigravity'),
            quotaPanel('cursor'),
            quotaPanel('ollama'),
            quotaPanel('kimi'),
            quotaPanel('copilot'),
            quotaPanel('devin'),
            quotaPanel('cline'),
            quotaPanel('opencode-go'),
            quotaPanel('command-code')),
          panel('models', h(ModelsPanel, {
            t,
            catalog: snap?.catalog,
            scope: family,
            railIdOf,
            query,
            onQuery: setQuery,
            onToggle: (key, on) => toggleModels({ key, on }, [key], on),
            onFamily: (fam, on) => toggleModels({ family: fam, on }, catalogKeysOf(fam), on),
            onAll: (on) => toggleModels({ all: on }, catalogKeysOf(), on),
            overrides: modelOverrides,
            onContext: setContextEdit,
            onResetContexts: () => { void run('models', { resetContexts: true }) },
            efforts: { ...snap?.efforts, ...effortOverrides },
            onEffort: setEffort,
            onOpenFamily: (fam) => { setFamily(railIdOf(fam)); setView('quota') },
          }), view === 'models', true),
          panel('usage', h(UsagePanel, {
            t,
            data: usage,
            error: usageError,
            scope: family,
            busy: usageBusy,
            onRefresh: () => { void loadUsage(true) },
            version: aboutVersionOf(snap?.update, update),
            repo: aboutRepoOf(snap?.update, update),
          }), view === 'usage'),
          panel('version', h(AboutPanel, {
            t,
            local: snap?.update,
            update,
            busy: updateBusy,
            onCheck: () => checkUpdate(false),
            onApply: () => checkUpdate(true),
            autoUpdate: snap?.autoUpdate === true,
            autoState: snap?.autoUpdateState,
            onAutoUpdate: (checked) => {
              setSnap((current) => current ? { ...current, autoUpdate: checked } : current)
              void run('autoUpdate', { autoUpdate: checked })
            },
          }), view === 'version'),
          panel('donate', h(DonatePanel, {
            t,
            rpc,
            active: view === 'donate',
          }), view === 'donate'),
          ),
        ),
        contextEdit && h(ContextEditDialog, {
          t,
          model: contextEdit,
          onClose: () => setContextEdit(null),
          // `models` RPC adopts the returned snapshot on success; a failed
          // run keeps the dialog open with the error already surfaced.
          onSubmit: (context) => run('models', { contextKey: contextEdit.key, context }),
        }),
        quotaShot.layer,
      )
    }

    /** Sidebar rail glyph: a quota gauge — arc + needle. Matches the
        host's outline icon idiom; the PanelRow button owns the chrome. */
    function PanelGlyph({ size }) {
      return h('svg', {
        viewBox: '0 0 20 20', width: size, height: size,
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      },
        h('path', { d: 'M3.4 14a6.8 6.8 0 1 1 13.2 0' }),
        h('path', { d: 'M10 13.6 13.4 8.4' }),
        h('circle', { cx: 10, cy: 13.7, r: 1.5, fill: 'currentColor', stroke: 'none' }),
      )
    }

    function apply(ctx) {
      const connection = ctx.get('connection')
      const label = () => COPY[localeOf()].panel
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: 'oauth-subs',
        label,
        inject: () => ({ rpc: connection?.rpc }),
      }, SettingsSection))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: 'oauth-subs',
        order: 5,
        label,
      }, PanelGlyph))
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
