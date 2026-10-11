// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// The standalone 代理 card in the 设置 tab: tri-state (自动 / 关闭 / 自定义)
// over the plugin's single outbound owner.

    /** A prefs/snapshot view reduced to the fields the status snapshot may
        carry. The raw custom URL must never enter it — the stored snapshot
        lands in localStorage; only `resolved`/`url` redacted forms do. */
    function proxyDisplayFields(view) {
      if (!view || typeof view !== 'object') return undefined
      const next: any = {
        mode: view.mode,
        url: view.resolved ?? view.url ?? '',
        source: view.source,
        configured: view.configured === true,
      }
      if (view.error) next.error = view.error
      return next
    }

    function ProxyCard({ t, proxy, rpc, onProxy }) {
      const mode = ['auto', 'off', 'custom'].includes(proxy?.mode) ? proxy.mode : 'auto'
      const locked = proxy?.source === 'config'
      const [draft, setDraft] = useState(undefined) // undefined = prefill in flight
      const [busy, setBusy] = useState(false)
      const [bad, setBad] = useState('')
      const gen = useRef(0)

      // Prefill the custom URL from proxyGet — raw (credentials included),
      // card-local memory only; the stored snapshot keeps the redacted form.
      useEffect(() => {
        const my = ++gen.current
        Promise.resolve()
          .then(() => callRpc(rpc, 'proxyGet'))
          .then((result) => {
            if (gen.current !== my) return
            setDraft(typeof result?.url === 'string' ? result.url : '')
            onProxy?.(proxyDisplayFields(result))
          })
          .catch(() => {
            if (gen.current === my) setDraft('')
          })
      }, [])

      const apply = (payload, optimistic) => {
        const prev = proxy
        if (optimistic) onProxy?.(optimistic)
        setBusy(true)
        setBad('')
        Promise.resolve()
          .then(() => callRpc(rpc, 'proxySet', payload))
          .then((result) => {
            if (typeof result?.url === 'string') setDraft(result.url)
            onProxy?.(proxyDisplayFields(result) ?? optimistic)
          })
          .catch((caught) => {
            const message = caught instanceof Error ? caught.message : String(caught)
            setBad(isUnknownOauthMethod(message) ? t.hostStale : message)
            onProxy?.(prev)
          })
          .finally(() => setBusy(false))
      }

      const pick = (next) => {
        if (busy || locked || next === mode) return
        // 自定义 without a saved URL is not a persistable state — the seg
        // only previews it; 保存 (with a URL) persists the mode. auto/off
        // persist immediately and keep the stored draft for the way back.
        if (next === 'custom') {
          onProxy?.({ ...proxy, mode: 'custom' })
          return
        }
        apply({ mode: next, url: draft ?? '' }, { ...proxy, mode: next })
      }

      const save = () => {
        if (busy || locked) return
        apply({ mode: 'custom', url: draft ?? '' }, { ...proxy, mode: 'custom' })
      }

      const statusText = mode === 'off'
        ? t.proxyOffNote
        : mode === 'custom'
          ? (proxy?.configured && proxy?.url ? fill(t.proxyCustomHint, proxy.url) : t.proxyCustomHintEmpty)
          : proxy?.source === 'os' && proxy?.url
            ? fill(t.proxyFollowOs, proxy.url)
            : proxy?.source === 'env' && proxy?.url
              ? fill(t.proxyFollowEnv, proxy.url)
              : t.proxyNoProxy

      const seg = h('div', { className: 'osubs-seg', role: 'group', 'aria-label': t.proxyTitle },
        [['auto', t.proxyAuto], ['off', t.proxyOff], ['custom', t.proxyCustom]].map(([id, label]) => h(Button, {
          key: id,
          size: 'sm',
          disabled: locked || busy,
          variant: mode === id ? 'primary' : undefined,
          onClick: () => pick(id),
          label,
        })))

      return h('section', { className: 'osubs-card' },
        h('header', { className: 'osubs-card-head' },
          h('div', { className: 'osubs-head-main' },
            h('h3', { className: 'osubs-card-title' }, t.proxyTitle)),
          seg),
        h('div', { className: 'osubs-about' },
          h('p', { className: 'osubs-hint' }, statusText),
          mode === 'custom' && h('div', { className: 'osubs-inline' },
            h('input', {
              className: 'osubs-input' + (bad ? ' osubs-input--bad' : ''),
              type: 'text',
              value: draft ?? '',
              placeholder: t.proxyUrlPlaceholder,
              'aria-label': t.proxyUrlPlaceholder,
              spellCheck: false,
              autoComplete: 'off',
              disabled: busy || locked,
              onChange: (event) => setDraft(event.currentTarget.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') save()
              },
            }),
            h(Button, {
              size: 'sm',
              variant: 'primary',
              mark: true,
              disabled: busy || locked,
              onClick: save,
              label: t.proxySave,
            })),
          bad && h('p', { className: 'osubs-hint osubs-bad' }, bad),
          locked && h('p', { className: 'osubs-hint osubs-warn' }, t.proxyConfigLocked),
          h('div', { className: 'osubs-hints' },
            h('p', { className: 'osubs-hint' }, t.proxyScopeNote))))
    }
