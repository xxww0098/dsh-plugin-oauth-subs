// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// Per-family account card and the add-account dialog (ProviderCard).

    function AccountCard({ t, id, row, quota, onSwitch, onLogout, onRefreshQuota, onResetQuota }) {
      const regionLabel = (region) => region === 'bigmodel' ? t.glmRegionCn : t.glmRegionGlobal
      const planLabel = planOf({ ...row, quota }, id)
      const [refreshBusy, setRefreshBusy] = useState(false)
      const refreshing = refreshBusy || quota?.status === 'loading'
      const clickable = !row.active
      return h('article', {
        className: `osubs-acct${row.active ? ' osubs-acct--on' : ''}`,
        role: clickable ? 'button' : undefined,
        tabIndex: clickable ? 0 : undefined,
        onClick: clickable ? () => onSwitch(id, row.id) : undefined,
        onKeyDown: clickable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSwitch(id, row.id)
          }
        } : undefined,
        style: clickable ? undefined : { cursor: 'default' },
      },
        h('div', { className: 'osubs-acct-head' },
          h('div', { className: 'osubs-acct-main' },
            h('div', { className: 'osubs-acct-row' },
              h('span', { className: 'osubs-mono', 'data-shot-mask': '' }, identityOf(row, id)),
              planLabel && h('span', { className: 'osubs-tag' }, planLabel),
              row.active && h('span', { className: 'osubs-tag osubs-tag--on' }, t.inUse),
              id === 'glm' && row.region && h('span', { className: 'osubs-tag' }, regionLabel(row.region)),
              id === 'kiro' && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel),
              (id === 'cursor' || id === 'ollama' || id === 'kimi' || id === 'copilot' || id === 'devin' || id === 'cline' || id === 'command-code') && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel),
              id === 'opencode-go' && row.workspaceName && h('span', { className: 'osubs-tag osubs-tag--plain' }, row.workspaceName),
              id === 'grok' && quota?.hasGrokCodeAccess === true && h('span', { className: 'osubs-tag osubs-tag--plain', title: t.grokCodeHint }, t.grokCode),
              id === 'grok' && quota?.subscriptionStatus && quota.subscriptionStatus !== 'active' && h('span', { className: 'osubs-tag osubs-tag--warn' }, quota.subscriptionStatus),
            ),
          ),
          h('div', { className: 'osubs-actions', 'data-noshot': '', onClick: (event) => event.stopPropagation() },
            !row.active && h(Button, { size: 'sm', onClick: () => onSwitch(id, row.id), label: t.switchTo }),
            h(Button, {
              size: 'sm',
              disabled: refreshing,
              onClick: async () => {
                if (refreshBusy) return
                setRefreshBusy(true)
                try {
                  await Promise.all([
                    onRefreshQuota(id, row.id),
                    new Promise((resolve) => setTimeout(resolve, 400)),
                  ])
                } finally {
                  setRefreshBusy(false)
                }
              },
              label: h('span', { className: 'osubs-refresh' + (refreshing ? ' osubs-refresh--spin' : '') },
                h(IconRefresh), t.quotaRefresh),
            }),
            h(Button, { size: 'sm', onClick: () => onLogout(id, row.id), label: t.logout }),
          ),
        ),
        h('div', { onClick: (event) => event.stopPropagation() },
          id === 'antigravity' && row.needsValidation && h('div', { className: 'osubs-verify' },
            h('p', { className: 'osubs-hint osubs-warn' }, t.antigravityVerify),
            row.validationUrl && h(Button, {
              size: 'sm',
              onClick: () => { window.open(row.validationUrl, '_blank', 'noopener') },
              label: t.antigravityVerifyGo,
            }),
          ),
          h(QuotaBlock, {
            t,
            family: id,
            quota,
            onReset: (id === 'codex' || id === 'glm' || id === 'grok') && onResetQuota
              ? (credit) => onResetQuota(id, row.id, credit?.id)
              : undefined,
          }),
          id === 'opencode-go' && quota?.useBalance && Number(quota.balance) > 0
            && h('p', { className: 'osubs-hint' }, fill(t.opencodeGoBalance, `$${Number(quota.balance).toFixed(2)}`)),
        ),
      )
    }

    function ProviderCard({ t, id, title, account, pending, onLogin, onImport, onLogout, onCancel, onManual, onSwitch, onRefreshQuota, onResetQuota, onUseKey, onGoSave }) {
      const [addOpen, setAddOpen] = useState(false)
      const [paste, setPaste] = useState('')
      const [apiKey, setApiKey] = useState('')
      const [keyRegion, setKeyRegion] = useState('zai')
      // One inline method form at a time; toggling another closes the first.
      const [method, setMethod] = useState('')
      const showKey = method === 'key'
      const showIdc = method === 'idc'
      const showEntra = method === 'entra'
      const showRefresh = method === 'refresh'
      const toggleMethod = (next) => setMethod((current) => current === next ? '' : next)
      // Guards double-clicks between the click and the host flipping busy.
      const [starting, setStarting] = useState('')
      const [startUrl, setStartUrl] = useState('')
      const [entraEndpoint, setEntraEndpoint] = useState('')
      const [entraClient, setEntraClient] = useState('')
      const [entraScopes, setEntraScopes] = useState('')
      const [refreshToken, setRefreshToken] = useState('')
      const [goCookie, setGoCookie] = useState('')
      const [goWorkspace, setGoWorkspace] = useState('')
      const [goBusy, setGoBusy] = useState(false)
      const [goMessage, setGoMessage] = useState('')
      const roster = Array.isArray(account?.accounts) ? account.accounts : []
      const loggedIn = Boolean(account?.loggedIn) || roster.length > 0
      const busy = Boolean(account?.busy)
      const closeAdd = () => {
        setGoMessage('')
        setMethod('')
        setAddOpen(false)
      }
      // Starts a login/import once; the pressed row spins until the host
      // answers, the others stay disabled so a double-click can't fork flows.
      const begin = async (key, action, close = false) => {
        if (starting) return
        setStarting(key)
        try {
          await action()
        } finally {
          setStarting('')
        }
        if (close) closeAdd()
      }
      const startAttrs = (key) => ({
        disabled: Boolean(starting),
        'aria-busy': starting === key ? 'true' : undefined,
      })
      useEffect(() => {
        if (busy) setAddOpen(true)
      }, [busy])
      // One dashed tail row is the add/login entry: last line of the
      // account list, or the card's only row when logged out. Hidden
      // while busy — the continue/cancel row takes over mid-auth.
      const addRow = !busy && h('button', {
        type: 'button',
        className: 'osubs-acct-add',
        'data-noshot': '',
        onClick: () => setAddOpen(true),
      },
        h(IconPlus),
        t.addAccount,
      )
      // A family with no account is only an add row: left out of 分享 images.
      return h('section', { className: 'osubs-card osubs-card--legend', 'data-noshot': roster.length === 0 ? '' : undefined },
        h('h3', { className: 'osubs-card-title' }, title),
        roster.length > 0 && h('div', { className: 'osubs-accts' },
          roster.map((row) => h(AccountCard, {
            t,
            id,
            row,
            quota: row.quota,
            onSwitch,
            onLogout,
            onRefreshQuota,
            onResetQuota,
            key: row.id,
          })),
          addRow,
        ),
        roster.length === 0 && addRow,
        account?.detail && h('p', { className: 'osubs-hint osubs-bad' }, `${t.error}: ${account.detail}`),
        pending?.userCode && busy && h(PairCode, { t, code: pending.userCode }),
        pending?.authorizeUrl && busy && h('a', {
          className: 'osubs-link',
          href: pending.authorizeUrl,
          target: '_blank',
          rel: 'noreferrer',
        }, t.openUrl),
        busy && h('div', { className: 'osubs-actions' },
          h(Button, {
            variant: 'primary',
            onClick: () => setAddOpen(true),
            label: t.continueAuth,
          }),
          h(Button, { onClick: () => onCancel(id), label: t.cancel }),
        ),
        addOpen && h(CenterDialog, {
          titleId: `osubs-add-${id}`,
          title: t.addAccountTitle,
          closeLabel: t.dialogClose,
          onClose: closeAdd,
          cardClass: 'osubs-dsw-card osubs-dsw-card--add',
          bodyClass: 'osubs-dsw-body osubs-dsw-body--stack',
          icon: FAMILY_ICON[id] && h('span', { className: 'osubs-dsw-mark', style: FAMILY_COLOR[id] ? { color: FAMILY_COLOR[id] } : undefined },
            h(TabIcon, { name: FAMILY_ICON[id], className: 'osubs-dsw-mark-icon' })),
          subtitle: title,
        },
        busy && h(AuthPanel, {
          t,
          id,
          pending,
          paste,
          onPaste: setPaste,
          onManual: () => { if (paste.trim()) onManual(id, paste.trim()) },
          onCancel: () => { onCancel(id); closeAdd() },
        }),
        !busy && account?.detail && h('p', { className: 'osubs-dsw-error', role: 'alert' }, `${t.error}: ${account.detail}`),
        id !== 'glm' && id !== 'kiro' && id !== 'ollama' && id !== 'opencode-go' && !busy && h('div', { className: 'osubs-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-login',
            ...startAttrs('primary'), onClick: () => begin('primary', () => onLogin(id)),
          },
            h('span', null, id === 'chatgpt' ? t.chatgptLogin : id === 'grok' || id === 'kimi' || id === 'copilot' || id === 'cline' ? t.device : loggedIn ? t.addAccount : t.login),
          ),
          id === 'grok' && h('button', {
            type: 'button',
            className: 'osubs-login',
            ...startAttrs('pkce'), onClick: () => begin('pkce', () => onLogin(id, 'pkce')),
          },
            h('span', null, t.pkce),
          ),
          id === 'kimi' && h('button', {
            type: 'button',
            className: 'osubs-login',
            'aria-expanded': showKey, onClick: () => toggleMethod('key'),
          },
            h('span', null, t.kimiLoginApiKey),
          ),
          id === 'kimi' && showKey && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, apiKey)
              setApiKey('')
              setMethod('')
              closeAdd()
            },
          },
            h('input', {
              className: 'osubs-input',
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
              placeholder: t.kimiKeyPlaceholder,
              type: 'password',
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.kimiLoginApiKey,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.kimiKeyHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.kimiKeyGo }),
            ),
          ),
          id === 'copilot' && h('button', {
            type: 'button',
            className: 'osubs-login',
            'aria-expanded': showKey, onClick: () => toggleMethod('key'),
          },
            h('span', null, t.copilotLoginApiKey),
          ),
          id === 'copilot' && showKey && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, apiKey)
              setApiKey('')
              setMethod('')
              closeAdd()
            },
          },
            h('input', {
              className: 'osubs-input',
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
              placeholder: t.copilotKeyPlaceholder,
              type: 'password',
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.copilotLoginApiKey,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.copilotKeyHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.copilotKeyGo }),
            ),
          ),
          id === 'devin' && h('button', {
            type: 'button',
            className: 'osubs-login',
            'aria-expanded': showKey, onClick: () => toggleMethod('key'),
          },
            h('span', null, t.devinLoginApiKey),
          ),
          id === 'devin' && showKey && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, apiKey)
              setApiKey('')
              setMethod('')
              closeAdd()
            },
          },
            h('input', {
              className: 'osubs-input',
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
              placeholder: t.devinKeyPlaceholder,
              type: 'password',
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.devinLoginApiKey,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.devinKeyHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.devinKeyGo }),
            ),
          ),
          id === 'command-code' && h('button', {
            type: 'button',
            className: 'osubs-login',
            'aria-expanded': showKey, onClick: () => toggleMethod('key'),
          },
            h('span', null, t.commandCodeLoginApiKey),
          ),
          id === 'command-code' && showKey && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, apiKey)
              setApiKey('')
              setMethod('')
              closeAdd()
            },
          },
            h('input', {
              className: 'osubs-input',
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
              placeholder: t.commandCodeKeyPlaceholder,
              type: 'password',
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.commandCodeLoginApiKey,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.commandCodeKeyHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.commandCodeKeyGo }),
            ),
          ),
          id !== 'chatgpt' && h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
          },
            h('span', null, id === 'cursor' ? t.cursorImport : id === 'kimi' ? t.kimiImport : id === 'copilot' ? t.copilotImport : id === 'devin' ? t.devinImport : id === 'cline' ? t.clineImport : id === 'command-code' ? t.commandCodeImport : t.import),
          ),
        ),
        id === 'ollama' && !busy && h('div', { className: 'osubs-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-login',
            'aria-expanded': showKey, onClick: () => toggleMethod('key'),
          },
            h('span', null, t.ollamaLoginApiKey),
          ),
          id === 'ollama' && showKey && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, apiKey)
              setApiKey('')
              setMethod('')
              closeAdd()
            },
          },
            h('input', {
              className: 'osubs-input',
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
              placeholder: t.ollamaKeyPlaceholder,
              type: 'password',
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.ollamaLoginApiKey,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.ollamaKeyHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.ollamaKeyGo }),
            ),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
          },
            h('span', null, t.ollamaImport),
          ),
        ),
        id === 'opencode-go' && !busy && h('p', { className: 'osubs-hint' }, t.opencodeGoHint),
        id === 'opencode-go' && !busy && h('form', {
          className: 'osubs-fields',
          onSubmit: async (event) => {
            event.preventDefault()
            if (goBusy) return
            setGoBusy(true)
            setGoMessage('')
            try {
              await onGoSave({
                apiKey: apiKey.trim() ? apiKey : undefined,
                cookie: goCookie.trim() ? goCookie : undefined,
                workspace: goWorkspace.trim() ? goWorkspace : undefined,
              })
              setApiKey('')
              setGoCookie('')
              setGoWorkspace('')
              closeAdd()
            } catch (error) {
              const text = error instanceof Error ? error.message : String(error)
              setGoMessage(isUnknownOauthMethod(text) ? t.opencodeGoHostStale : t.opencodeGoFailed + ': ' + text)
            } finally {
              setGoBusy(false)
            }
          },
        },
          h('span', { className: 'osubs-eyebrow' }, t.opencodeGoKey),
          h('input', {
            className: 'osubs-input',
            type: 'password',
            autoComplete: 'off',
            spellCheck: false,
            placeholder: roster.some((row) => row.apiKeySet) ? t.opencodeGoKeySet : t.opencodeGoKeyPlaceholder,
            value: apiKey,
            onChange: (event) => setApiKey(event.target.value),
          }),
          h('span', { className: 'osubs-eyebrow' }, t.opencodeGoCookie),
          h('input', {
            className: 'osubs-input',
            type: 'password',
            autoComplete: 'off',
            spellCheck: false,
            placeholder: roster.some((row) => row.cookieSet) ? t.opencodeGoCookieSet : t.opencodeGoCookiePlaceholder,
            value: goCookie,
            onChange: (event) => setGoCookie(event.target.value),
          }),
          h('span', { className: 'osubs-eyebrow' }, t.opencodeGoWorkspace),
          h('input', {
            className: 'osubs-input',
            autoComplete: 'off',
            spellCheck: false,
            placeholder: t.opencodeGoWorkspacePlaceholder,
            value: goWorkspace,
            onChange: (event) => setGoWorkspace(event.target.value),
          }),
          h('div', { className: 'osubs-actions' },
            h(Button, { type: 'submit', variant: 'primary', disabled: goBusy, label: t.opencodeGoSave }),
          ),
        ),
        id === 'opencode-go' && goMessage && h('p', { className: 'osubs-hint osubs-bad' }, goMessage),
        id === 'glm' && !busy && h('div', { className: 'osubs-glm-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-glm-login',
            ...startAttrs('zai'), onClick: () => begin('zai', () => onLogin(id, 'zai')),
          },
            h('span', null, loggedIn ? t.glmAddZai : t.glmLoginZai),
            h('span', { className: 'osubs-tag' }, t.glmRegionGlobal),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-glm-login',
            ...startAttrs('bigmodel'), onClick: () => begin('bigmodel', () => onLogin(id, 'bigmodel')),
          },
            h('span', null, loggedIn ? t.glmAddBigmodel : t.glmLoginBigmodel),
            h('span', { className: 'osubs-tag' }, t.glmRegionCn),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-glm-login osubs-glm-ghost',
            'aria-expanded': showKey, onClick: () => toggleMethod('key'),
          },
            h('span', null, t.glmLoginApiKey),
          ),
          id === 'glm' && showKey && !busy && h('form', {
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, apiKey, keyRegion)
              setApiKey('')
              setMethod('')
              closeAdd()
            },
            style: { display: 'flex', flexDirection: 'column', gap: 8 },
          },
            h('div', { className: 'osubs-actions' },
              h(Button, {
                size: 'sm',
                variant: keyRegion === 'zai' ? 'primary' : undefined,
                onClick: () => setKeyRegion('zai'),
                label: t.glmRegionGlobal,
              }),
              h(Button, {
                size: 'sm',
                variant: keyRegion === 'bigmodel' ? 'primary' : undefined,
                onClick: () => setKeyRegion('bigmodel'),
                label: t.glmRegionCn,
              }),
            ),
            h('input', {
              className: 'osubs-input',
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
              placeholder: t.glmKeyPlaceholder,
              type: 'password',
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.glmKeyLabel,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.glmKeyHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.glmKeyGo }),
            ),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-glm-login osubs-glm-ghost',
            ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
          },
            h('span', null, t.import),
          ),
        ),
        id === 'kiro' && !busy && h('div', { className: 'osubs-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-login',
            ...startAttrs('social'), onClick: () => begin('social', () => onLogin(id, 'social')),
          },
            h('span', null, loggedIn ? t.kiroAddSocial : t.kiroLoginSocial),
            h('span', { className: 'osubs-tag' }, 'Social'),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login',
            ...startAttrs('builder'), onClick: () => begin('builder', () => onLogin(id, 'builder')),
          },
            h('span', null, loggedIn ? t.kiroAddBuilder : t.kiroLoginBuilder),
            h('span', { className: 'osubs-tag' }, 'Builder'),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login',
            'aria-expanded': showIdc, onClick: () => toggleMethod('idc'),
          },
            h('span', null, loggedIn ? t.kiroAddIdc : t.kiroLoginIdc),
            h('span', { className: 'osubs-tag' }, 'IdC'),
          ),
          id === 'kiro' && showIdc && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              begin('idc', () => onLogin(id, 'idc', { startUrl: startUrl.trim() }))
            },
          },
            h('input', {
              className: 'osubs-input',
              value: startUrl,
              onChange: (event) => setStartUrl(event.target.value),
              placeholder: t.kiroStartUrlPlaceholder,
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.kiroStartUrl,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.kiroStartUrlHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !startUrl.trim() || starting === 'idc', label: t.kiroStartUrlGo }),
            ),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            'aria-expanded': showEntra, onClick: () => toggleMethod('entra'),
          },
            h('span', null, t.kiroLoginEntra),
          ),
          id === 'kiro' && showEntra && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, refreshToken, {
                mode: 'external_idp',
                tokenEndpoint: entraEndpoint,
                clientId: entraClient,
                scopes: entraScopes,
              })
              setRefreshToken('')
              setMethod('')
              closeAdd()
            },
          },
            h('input', {
              className: 'osubs-input',
              value: entraEndpoint,
              onChange: (event) => setEntraEndpoint(event.target.value),
              placeholder: t.kiroEntraEndpointPlaceholder,
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.kiroEntraEndpoint,
              autoComplete: 'off',
            }),
            h('input', {
              className: 'osubs-input',
              value: entraClient,
              onChange: (event) => setEntraClient(event.target.value),
              placeholder: t.kiroEntraClient,
              'aria-label': t.kiroEntraClient,
              autoComplete: 'off',
            }),
            h('textarea', {
              className: 'osubs-textarea',
              value: refreshToken,
              onChange: (event) => setRefreshToken(event.target.value),
              placeholder: t.kiroEntraRefresh,
              'aria-label': t.kiroEntraRefresh,
            }),
            h('input', {
              className: 'osubs-input',
              value: entraScopes,
              onChange: (event) => setEntraScopes(event.target.value),
              placeholder: t.kiroEntraScopes,
              'aria-label': t.kiroEntraScopes,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.kiroEntraHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !(refreshToken.trim() && entraEndpoint.trim() && entraClient.trim()), label: t.kiroEntraGo }),
            ),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            'aria-expanded': showKey, onClick: () => toggleMethod('key'),
          },
            h('span', null, t.kiroLoginApiKey),
          ),
          id === 'kiro' && showKey && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, apiKey, { mode: 'api_key' })
              setApiKey('')
              setMethod('')
              closeAdd()
            },
          },
            h('input', {
              className: 'osubs-input',
              value: apiKey,
              onChange: (event) => setApiKey(event.target.value),
              placeholder: t.kiroKeyPlaceholder,
              type: 'password',
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.kiroLoginApiKey,
              autoComplete: 'off',
            }),
            h('p', { className: 'osubs-hint' }, t.kiroKeyHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !apiKey.trim(), label: t.kiroKeyGo }),
            ),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            'aria-expanded': showRefresh, onClick: () => toggleMethod('refresh'),
          },
            h('span', null, t.kiroLoginRefresh),
          ),
          id === 'kiro' && showRefresh && !busy && h('form', {
            className: 'osubs-fields',
            onSubmit: (event) => {
              event.preventDefault()
              onUseKey(id, refreshToken, { mode: 'social' })
              setRefreshToken('')
              setMethod('')
              closeAdd()
            },
          },
            h('textarea', {
              className: 'osubs-textarea',
              value: refreshToken,
              onChange: (event) => setRefreshToken(event.target.value),
              placeholder: t.kiroRefreshPlaceholder,
              autoFocus: true,
              spellCheck: false,
              'aria-label': t.kiroLoginRefresh,
            }),
            h('p', { className: 'osubs-hint' }, t.kiroRefreshHint),
            h('div', { className: 'osubs-actions' },
              h(Button, { type: 'submit', variant: 'primary', disabled: !refreshToken.trim(), label: t.kiroRefreshGo }),
            ),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            ...startAttrs('import'), onClick: () => begin('import', () => onImport(id), true),
          },
            h('span', null, t.import),
          ),
        ),
        ),
      )
    }
