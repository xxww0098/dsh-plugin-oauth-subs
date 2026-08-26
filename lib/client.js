/**
 * Browser half. Registers the "OAuth 订阅" settings section.
 *
 * DSH client-modules serves this file as a classic script and requires the
 * `__ModuleLoader__.load` handoff (id = package name). Shared requires are
 * only `react` plus the shell table; everything else stays inlined.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-oauth-subs',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const { createElement: h, useCallback, useEffect, useState } = require('react')

    const name = 'dsh-plugin-oauth-subs-client'
    const inject = ['slots', 'connection']

    const COPY = {
      zh: {
        nav: 'OAuth 订阅',
        codexTitle: 'ChatGPT Codex',
        grokTitle: 'xAI Grok',
        codexHint: 'Codex CLI 客户端 · PKCE · localhost:1455',
        grokHint: '设备码（默认）或 PKCE · 127.0.0.1:56121',
        login: '登录',
        pkce: 'PKCE 登录',
        device: '设备码登录',
        import: '导入本机会话',
        logout: '退出',
        cancel: '取消',
        paste: '粘贴回调地址',
        pastePlaceholder: 'http://localhost:1455/auth/callback?code=…&state=…',
        submitPaste: '提交',
        sync: '同步到模型列表',
        loggedOut: '未登录',
        loggedIn: '已登录',
        busy: '等待授权…',
        openUrl: '打开授权页',
        userCode: '配对码',
        copy: '复制',
        error: '失败',
        noRpc: '宿主 RPC 不可用。确认插件已加载到 web profile。',
        quota: '额度',
        quotaRefresh: '刷新额度',
        quotaLoading: '正在读取额度…',
        quotaFailed: '额度读取失败',
        quotaReset: '重置额度',
        quotaResetLeft: '重置额度 · 剩 {n} 次',
        quotaResetConfirm: '确认重置 Codex 5 小时额度？将消耗 1 次银行重置次数（剩余 {n} 次）。',
        quotaResetBusy: '正在重置…',
        leftPercent: '剩余 {n}%',
        resetMinutes: '{n} 分钟后重置',
        resetHours: '{n} 小时后重置',
        resetDays: '{n} 天后重置',
        resetSoon: '即将重置',
        expiresMinutes: '{n} 分钟后过期',
        expiresHours: '{n} 小时后过期',
        expiresDays: '{n} 天后过期',
        expiresSoon: '即将过期',
        primary: '5 小时',
        weekly: '每周',
        cycle: '本周期',
        prepaid: '预付余额',
        grokCode: 'Grok Code',
        plan: '套餐',
        modelsTitle: '模型',
        modelsHint: '勾选要同步到 DeepSeek Harness 的模型。Fast 是 Priority Processing；900K 是大上下文；Ultra 是 GPT-5.6 多 agent（effort=ultra）。后两者默认关闭。思考深度在会话里点模型名称 → 推理等级（最高 max，没有 ultra 这一档）。关闭后从模型列表移除。未登录的系列会在登录后生效。',
        modelsOn: '已开启 {n}',
        modelsAll: '全选',
        modelsNone: '全关',
        modelsNeedLogin: '登录后同步',
        fastTag: 'Fast',
        largeTag: '900K',
        ultraTag: 'Ultra',
      },
      en: {
        nav: 'OAuth subs',
        codexTitle: 'ChatGPT Codex',
        grokTitle: 'xAI Grok',
        codexHint: 'Codex CLI client · PKCE · localhost:1455',
        grokHint: 'Device-code (default) or PKCE · 127.0.0.1:56121',
        login: 'Sign in',
        pkce: 'PKCE sign-in',
        device: 'Device-code sign-in',
        import: 'Import local session',
        logout: 'Sign out',
        cancel: 'Cancel',
        paste: 'Paste callback URL',
        pastePlaceholder: 'http://localhost:1455/auth/callback?code=…&state=…',
        submitPaste: 'Submit',
        sync: 'Sync model list',
        loggedOut: 'Signed out',
        loggedIn: 'Signed in',
        busy: 'Waiting for authorization…',
        openUrl: 'Open authorize URL',
        userCode: 'User code',
        copy: 'Copy',
        error: 'Failed',
        noRpc: 'Host RPC is unavailable. Confirm the plugin is loaded into the web profile.',
        quota: 'Quota',
        quotaRefresh: 'Refresh quota',
        quotaLoading: 'Reading quota…',
        quotaFailed: 'Could not read quota',
        quotaReset: 'Reset quota',
        quotaResetLeft: 'Reset quota · {n} left',
        quotaResetConfirm: 'Reset the Codex 5-hour window? This spends 1 banked reset ({n} remaining).',
        quotaResetBusy: 'Resetting…',
        leftPercent: '{n}% left',
        resetMinutes: 'resets in {n} min',
        resetHours: 'resets in {n} h',
        resetDays: 'resets in {n} d',
        resetSoon: 'reset imminent',
        expiresMinutes: 'expires in {n} min',
        expiresHours: 'expires in {n} h',
        expiresDays: 'expires in {n} d',
        expiresSoon: 'expires soon',
        primary: '5-hour',
        weekly: 'Weekly',
        cycle: 'This period',
        prepaid: 'Prepaid',
        grokCode: 'Grok Code',
        plan: 'Plan',
        modelsTitle: 'Models',
        modelsHint: 'Enable models to sync into DeepSeek Harness. Fast is Priority Processing. 900K is the large Codex window. Ultra is GPT-5.6 multi-agent (effort=ultra). 900K and Ultra are off by default. Set thinking depth in the session model menu → Reasoning (top is max; DSH has no ultra level). Disabled models leave the picker. Families that are signed out apply on the next sign-in.',
        modelsOn: '{n} on',
        modelsAll: 'All on',
        modelsNone: 'All off',
        modelsNeedLogin: 'Syncs after sign-in',
        fastTag: 'Fast',
        largeTag: '900K',
        ultraTag: 'Ultra',
      },
    }

    function localeOf() {
      const lang = typeof navigator !== 'undefined' ? navigator.language : 'zh'
      return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    function callRpc(rpc, method, payload) {
      if (rpc && typeof rpc.call === 'function') {
        return Promise.resolve(rpc.call('/oauth-subs-auth', method, payload ?? {})).then((result) => {
          if (result && typeof result === 'object' && 'ok' in result) {
            if (result.ok) return result.value
            throw new Error(result.error?.message ?? 'rpc')
          }
          return result
        })
      }
      if (rpc && typeof rpc.request === 'function') {
        return rpc.request(`/oauth-subs-auth/${method}`, payload)
      }
      const nested = rpc?.['/oauth-subs-auth'] ?? rpc?.oauthSubs
      if (nested && typeof nested[method] === 'function') return nested[method](payload)
      throw new Error('rpc')
    }

    function fill(template, n) {
      return String(template).replace('{n}', String(n))
    }

    function quotaColor(remaining) {
      const pct = Math.max(0, Math.min(100, Number(remaining) || 0))
      return `hsl(${pct * 1.2} 78% 38%)`
    }

    function formatReset(resetAt, t, kind = 'reset') {
      if (typeof resetAt !== 'number' || resetAt <= 0) return ''
      const delta = resetAt - Date.now()
      const labels = kind === 'expires'
        ? { minutes: t.expiresMinutes, hours: t.expiresHours, days: t.expiresDays, soon: t.expiresSoon }
        : { minutes: t.resetMinutes, hours: t.resetHours, days: t.resetDays, soon: t.resetSoon }
      if (delta <= 0) return labels.soon
      const minutes = Math.max(1, Math.round(delta / 60_000))
      if (minutes < 60) return fill(labels.minutes, minutes)
      const hours = Math.round(minutes / 60)
      if (hours < 48) return fill(labels.hours, hours)
      const days = Math.round(hours / 24)
      if (days < 14) return fill(labels.days, days)
      try {
        return new Date(resetAt).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return ''
      }
    }

    function formatAmount(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      if (Number.isInteger(value)) return String(value)
      return String(Math.round(value * 10) / 10)
    }

    const PLAN_LABELS = {
      free: 'Free',
      free_plan: 'Free',
      free_trial: 'Free',
      go: 'Go',
      plus: 'Plus',
      pro: 'Pro',
      team: 'Team',
      business: 'Business',
      enterprise: 'Enterprise',
      edu: 'Edu',
      student: 'Student',
      0: 'Free',
      1: 'SuperGrok',
      2: 'X Basic',
      3: 'X Premium',
      4: 'X Premium+',
      5: 'SuperGrok Heavy',
      6: 'SuperGrok Lite',
      7: 'SuperGrok Plus',
      supergrok: 'SuperGrok',
      x_basic: 'X Basic',
      x_premium: 'X Premium',
      x_premium_plus: 'X Premium+',
      xpremiumplus: 'X Premium+',
      super_grok_heavy: 'SuperGrok Heavy',
      supergrokheavy: 'SuperGrok Heavy',
      super_grok_pro: 'SuperGrok Heavy',
      supergrokpro: 'SuperGrok Heavy',
      super_grok_lite: 'SuperGrok Lite',
      super_grok_plus: 'SuperGrok Plus',
    }

    function formatPlanLabel(raw) {
      if (raw === undefined || raw === null || raw === '') return ''
      if (typeof raw === 'number' && Number.isInteger(raw)) return PLAN_LABELS[raw] ?? String(raw)
      const trimmed = String(raw).trim()
      if (!trimmed) return ''
      const slug = trimmed.toLowerCase().replace(/\+/g, 'plus').replace(/[_\-\s]+/g, '_').replace(/^_|_$/g, '')
      const compact = slug.replace(/_/g, '')
      return PLAN_LABELS[slug] || PLAN_LABELS[compact] || trimmed
    }

    function planOf(account) {
      return account?.quota?.planLabel
        || account?.planLabel
        || formatPlanLabel(account?.quota?.planType || account?.planType)
    }

    function PlanBadge({ t, label }) {
      if (!label) return null
      return h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 99,
          border: '1px solid color-mix(in oklab, currentColor 20%, transparent)',
          background: 'color-mix(in oklab, currentColor 8%, transparent)',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.25,
          whiteSpace: 'nowrap',
        },
      },
        h('span', {
          style: {
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: 0.62,
            fontWeight: 500,
          },
        }, t.plan),
        h('span', null, label),
      )
    }

    function rowLabel(row, t) {
      if (row.kind === 'product' && row.product) return row.product
      if (row.kind === 'primary') {
        const minutes = row.windowMinutes
        if (typeof minutes === 'number' && minutes > 0 && (minutes < 240 || minutes > 360)) {
          if (minutes % 60 === 0) return `${minutes / 60}h`
          return `${minutes}m`
        }
        return t.primary
      }
      if (row.kind === 'weekly') return t.weekly
      if (row.kind === 'cycle') return t.cycle
      if (row.kind === 'prepaid') return t.prepaid
      return row.kind ?? t.quota
    }

    function QuotaRow({ t, row }) {
      if (row.kind === 'prepaid') {
        return h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 } },
          h('span', { style: { opacity: 0.7 } }, t.prepaid),
          h('span', { style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }, formatAmount(row.remaining)),
        )
      }
      const remaining = typeof row.remainingPercent === 'number' ? row.remainingPercent : undefined
      const color = remaining === undefined ? 'currentColor' : quotaColor(remaining)
      const amount = row.used !== undefined && row.total !== undefined
        ? `${formatAmount(row.used)} / ${formatAmount(row.total)}`
        : ''
      const reset = formatReset(row.resetAt, t)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' } },
          h('span', { style: { fontSize: 12, opacity: 0.72 } }, rowLabel(row, t)),
          h('span', { style: { fontSize: 12, color, fontVariantNumeric: 'tabular-nums' } },
            amount ? `${amount} · ` : '',
            remaining === undefined ? '' : fill(t.leftPercent, remaining),
          ),
        ),
        remaining !== undefined && h('div', {
          style: {
            height: 10,
            borderRadius: 99,
            background: 'color-mix(in oklab, currentColor 10%, transparent)',
            overflow: 'hidden',
          },
        },
          h('div', {
            style: {
              width: '100%',
              height: '100%',
              borderRadius: 99,
              background: color,
              transform: `scaleX(${Math.max(0, Math.min(100, remaining)) / 100})`,
              transformOrigin: 'left center',
              transition: 'transform 240ms ease, background-color 240ms ease',
            },
          }),
        ),
        reset && h('span', { style: { fontSize: 11, opacity: 0.55 } }, reset),
      )
    }

    function QuotaBlock({ t, quota, onRefresh, onReset }) {
      const [busy, setBusy] = useState(false)
      if (!quota || quota.status === 'idle') return null
      const rows = Array.isArray(quota.rows) ? quota.rows : []
      const available = quota.resetCredits?.availableCount ?? 0
      const expires = formatReset(quota.resetCredits?.nextExpiresAt, t, 'expires')
      const confirmReset = async () => {
        if (typeof onReset !== 'function' || busy) return
        if (typeof window !== 'undefined' && !window.confirm(fill(t.quotaResetConfirm, available))) return
        setBusy(true)
        try {
          await onReset()
        } finally {
          setBusy(false)
        }
      }
      return h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 4,
          paddingTop: 16,
          borderTop: '1px solid color-mix(in oklab, currentColor 12%, transparent)',
        },
      },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.62 } }, t.quota),
          h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
            available > 0 && onReset && h('div', {
              style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
            },
              h('button', {
                type: 'button',
                onClick: confirmReset,
                disabled: busy,
                style: { fontSize: 12, minHeight: 32 },
              }, busy ? t.quotaResetBusy : fill(t.quotaResetLeft, available)),
              expires && h('span', { style: { fontSize: 11, opacity: 0.55 } }, expires),
            ),
            h('button', { type: 'button', onClick: onRefresh, style: { fontSize: 12, minHeight: 32 } }, t.quotaRefresh),
          ),
        ),
        quota.status === 'loading' && rows.length === 0 && h('p', { style: { margin: 0, fontSize: 12, opacity: 0.7 } }, t.quotaLoading),
        quota.status === 'error' && rows.length === 0 && h('p', { style: { margin: 0, fontSize: 12, color: '#b42318' } }, `${t.quotaFailed}${quota.error ? ` · ${quota.error}` : ''}`),
        rows.map((row) => h(QuotaRow, { t, row, key: row.key })),
        quota.hasGrokCodeAccess === true && h('p', { style: { margin: 0, fontSize: 11, opacity: 0.6 } }, t.grokCode),
      )
    }

    function ProviderCard({ t, id, title, hint, account, pending, onLogin, onImport, onLogout, onCancel, onManual, onRefreshQuota, onResetQuota }) {
      const [paste, setPaste] = useState('')
      const status = account?.loggedIn ? t.loggedIn : account?.busy ? t.busy : t.loggedOut
      const planLabel = account?.loggedIn ? planOf(account) : ''
      return h('section', {
        style: {
          border: '1px solid color-mix(in oklab, currentColor 14%, transparent)',
          borderRadius: 16,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minWidth: 0,
          boxSizing: 'border-box',
        },
      },
        h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 180px' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, title),
              planLabel && h(PlanBadge, { t, label: planLabel }),
            ),
            h('p', { style: { margin: 0, opacity: 0.62, fontSize: 12 } }, hint),
          ),
          h('span', { style: { fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7, flexShrink: 0 } }, status),
        ),
        account?.account && h('p', { style: { margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 } }, account.account),
        account?.detail && h('p', { style: { margin: 0, color: '#b42318', fontSize: 13 } }, `${t.error}: ${account.detail}`),
        pending?.userCode && h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('span', { style: { fontSize: 12, opacity: 0.7 } }, t.userCode),
          h('code', { style: { fontSize: 22, letterSpacing: '0.12em', fontWeight: 600 } }, pending.userCode),
        ),
        pending?.authorizeUrl && h('a', {
          href: pending.authorizeUrl,
          target: '_blank',
          rel: 'noreferrer',
          style: { fontSize: 13 },
        }, t.openUrl),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          !account?.loggedIn && !account?.busy && h('button', { type: 'button', onClick: () => onLogin(id) }, t.login),
          id === 'grok' && !account?.loggedIn && !account?.busy && h('button', { type: 'button', onClick: () => onLogin(id, 'pkce') }, t.pkce),
          !account?.loggedIn && h('button', { type: 'button', onClick: () => onImport(id) }, t.import),
          account?.busy && h('button', { type: 'button', onClick: () => onCancel(id) }, t.cancel),
          account?.loggedIn && h('button', { type: 'button', onClick: () => onLogout(id) }, t.logout),
        ),
        account?.busy && pending?.mode === 'pkce' && h('form', {
          onSubmit: (event) => {
            event.preventDefault()
            onManual(id, paste)
          },
          style: { display: 'flex', gap: 8, flexWrap: 'wrap' },
        },
          h('input', {
            value: paste,
            onChange: (event) => setPaste(event.target.value),
            placeholder: t.pastePlaceholder,
            style: { flex: '1 1 240px', minHeight: 40, padding: '8px 12px' },
          }),
          h('button', { type: 'submit' }, t.submitPaste),
        ),
        account?.loggedIn && h(QuotaBlock, {
          t,
          quota: account.quota,
          onRefresh: () => onRefreshQuota(id),
          onReset: id === 'codex' && onResetQuota ? () => onResetQuota(id) : undefined,
        }),
      )
    }

    function ModelRow({ t, model, onToggle }) {
      return h('label', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 40,
          padding: '0 4px',
          cursor: 'pointer',
          borderRadius: 12,
        },
      },
        h('input', {
          type: 'checkbox',
          checked: Boolean(model.enabled),
          onChange: () => onToggle(model.key, !model.enabled),
          style: { width: 16, height: 16, flexShrink: 0, accentColor: 'currentColor' },
        }),
        h('span', { style: { flex: '1 1 auto', minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' } }, model.name),
        model.ultra && h('span', {
          style: {
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 99,
            border: '1px solid color-mix(in oklab, currentColor 18%, transparent)',
            opacity: 0.7,
            fontWeight: 600,
          },
        }, t.ultraTag),
        model.large && h('span', {
          style: {
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 99,
            border: '1px solid color-mix(in oklab, currentColor 18%, transparent)',
            opacity: 0.7,
            fontWeight: 600,
          },
        }, t.largeTag),
        model.fast && h('span', {
          style: {
            fontSize: 10,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            padding: '2px 6px',
            borderRadius: 99,
            border: '1px solid color-mix(in oklab, currentColor 18%, transparent)',
            opacity: 0.7,
            fontWeight: 600,
          },
        }, t.fastTag),
      )
    }

    function ModelFamily({ t, group, onToggle, onFamily }) {
      const models = Array.isArray(group.models) ? group.models : []
      const enabledCount = models.filter((model) => model.enabled).length
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 } },
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            minHeight: 36,
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            h('h4', { style: { margin: 0, fontSize: 13, fontWeight: 600 } }, group.displayName),
            !group.loggedIn && h('span', { style: { fontSize: 11, opacity: 0.55 } }, t.modelsNeedLogin),
          ),
          h('div', { style: { display: 'flex', gap: 6 } },
            h('button', {
              type: 'button',
              onClick: () => onFamily(group.family, true),
              style: { fontSize: 12, minHeight: 32 },
            }, t.modelsAll),
            h('button', {
              type: 'button',
              onClick: () => onFamily(group.family, false),
              style: { fontSize: 12, minHeight: 32 },
            }, t.modelsNone),
          ),
        ),
        h('p', { style: { margin: 0, fontSize: 11, opacity: 0.55 } }, fill(t.modelsOn, `${enabledCount} / ${models.length}`)),
        h('div', {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            opacity: group.loggedIn ? 1 : 0.78,
          },
        }, models.map((model) => h(ModelRow, { t, model, onToggle, key: model.key }))),
      )
    }

    function ModelPicker({ t, catalog, onToggle, onFamily }) {
      const groups = Array.isArray(catalog) ? catalog : []
      const total = groups.reduce((sum, group) => sum + (group.models?.length ?? 0), 0)
      const enabled = groups.reduce((sum, group) => sum + (group.models ?? []).filter((model) => model.enabled).length, 0)
      if (groups.length === 0) return null
      return h('section', {
        style: {
          border: '1px solid color-mix(in oklab, currentColor 14%, transparent)',
          borderRadius: 16,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        },
      },
        h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { style: { minWidth: 0, flex: '1 1 320px' } },
            h('h3', { style: { margin: 0, fontSize: 16, fontWeight: 600 } }, t.modelsTitle),
            h('p', { style: { margin: '4px 0 0', opacity: 0.62, fontSize: 12 } }, t.modelsHint),
          ),
          h('span', { style: { fontSize: 12, opacity: 0.7, flexShrink: 0 } }, fill(t.modelsOn, `${enabled} / ${total}`)),
        ),
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 20,
            alignItems: 'start',
          },
        }, groups.map((group) => h(ModelFamily, {
          t,
          group,
          onToggle,
          onFamily,
          key: group.provider,
        }))),
      )
    }

    function SettingsSection({ rpc, close: _close }) {
      const t = COPY[localeOf()]
      const [snap, setSnap] = useState(null)
      const [pending, setPending] = useState({})
      const [error, setError] = useState('')

      const refresh = useCallback(async () => {
        if (rpc === undefined) return
        try {
          const next = await callRpc(rpc, 'status')
          setSnap(next)
          setError('')
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : t.noRpc)
        }
      }, [rpc, t.noRpc])

      useEffect(() => {
        void refresh()
        const timer = setInterval(() => void refresh(), 1500)
        return () => clearInterval(timer)
      }, [refresh])

      const run = async (method, payload) => {
        try {
          const result = await callRpc(rpc, method, payload)
          if (method === 'login') {
            setPending((current) => ({ ...current, [payload.provider]: result }))
            if (result?.authorizeUrl && typeof window !== 'undefined') {
              window.open(result.authorizeUrl, '_blank', 'noopener')
            }
          }
          await refresh()
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      }

      if (rpc === undefined) {
        return h('p', null, t.noRpc)
      }

      return h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          width: '100%',
          maxWidth: 960,
          boxSizing: 'border-box',
        },
      },
        error && h('p', { style: { color: '#b42318', margin: 0, fontSize: 13 } }, error),
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            alignItems: 'start',
          },
        },
          h(ProviderCard, {
            t,
            id: 'codex',
            title: t.codexTitle,
            hint: t.codexHint,
            account: snap?.accounts?.codex,
            pending: pending.codex,
            onLogin: (id, mode) => run('login', { provider: id, mode }),
            onImport: (id) => run('import', { provider: id }),
            onLogout: (id) => run('logout', { provider: id }),
            onCancel: (id) => run('cancel', { provider: id }),
            onManual: (id, input) => run('manual', { provider: id, input }),
            onRefreshQuota: (id) => run('quota', { provider: id }),
            onResetQuota: (id) => run('reset', { provider: id }),
          }),
          h(ProviderCard, {
            t,
            id: 'grok',
            title: t.grokTitle,
            hint: t.grokHint,
            account: snap?.accounts?.grok,
            pending: pending.grok,
            onLogin: (id, mode) => run('login', { provider: id, mode }),
            onImport: (id) => run('import', { provider: id }),
            onLogout: (id) => run('logout', { provider: id }),
            onCancel: (id) => run('cancel', { provider: id }),
            onManual: (id, input) => run('manual', { provider: id, input }),
            onRefreshQuota: (id) => run('quota', { provider: id }),
          }),
        ),
        h(ModelPicker, {
          t,
          catalog: snap?.catalog,
          onToggle: (key, on) => run('models', { key, on }),
          onFamily: (family, on) => run('models', { family, on }),
        }),
        h('div', {
          style: {
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: 4,
          },
        }, h('button', { type: 'button', onClick: () => run('sync', {}), style: { minHeight: 40 } }, t.sync)),
      )
    }

    function apply(ctx) {
      const connection = ctx.get('connection')
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'oauth-subs',
        order: 91,
        label: () => COPY[localeOf()].nav,
        inject: () => ({ rpc: connection?.rpc }),
      }, SettingsSection))
    }

    exports.name = name
    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
