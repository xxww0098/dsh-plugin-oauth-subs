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

    const STYLE_ID = 'dsh-oauth-subs-style'

    const CSS = `
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
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: 1000px;
  font-variant-numeric: tabular-nums;
}
.osubs, .osubs * { box-sizing: border-box; min-width: 0; }
.osubs ::selection { background: color-mix(in oklab, currentColor 18%, transparent); }
.osubs p, .osubs h3, .osubs h4 { margin: 0; }

.osubs-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 32px; padding: 0 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit;
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1;
  white-space: nowrap; cursor: pointer; appearance: none; -webkit-appearance: none;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.osubs-btn:hover { background: var(--osubs-fill); border-color: color-mix(in oklab, currentColor 45%, transparent); }
.osubs-btn:active { background: var(--osubs-fill-2); }
.osubs-btn:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-btn[disabled] { opacity: .45; cursor: default; background: transparent; border-color: var(--osubs-edge); }
.osubs-btn--primary {
  height: 36px; padding: 0 16px; font-size: 13px; font-weight: 600;
  border-color: transparent; background: var(--osubs-fill-2);
}
.osubs-btn--primary:hover { background: color-mix(in oklab, currentColor 19%, transparent); border-color: transparent; }
.osubs-btn--sm { height: 28px; padding: 0 10px; font-size: 11px; }

.osubs-seg { display: inline-flex; border: 1px solid var(--osubs-edge); border-radius: 8px; overflow: hidden; flex: none; }
.osubs-seg .osubs-btn { border: 0; border-radius: 0; }
.osubs-seg .osubs-btn + .osubs-btn { box-shadow: inset 1px 0 0 0 var(--osubs-edge); }
.osubs-seg .osubs-btn:focus-visible { outline-offset: -2px; }

.osubs-card {
  display: flex; flex-direction: column; gap: 14px;
  padding: 16px 18px 18px;
  border: 1px solid var(--osubs-line); border-radius: 14px;
}
.osubs-grid { display: grid; gap: 16px; align-items: start; grid-template-columns: repeat(auto-fit, minmax(min(290px, 100%), 1fr)); }

.osubs-status { display: inline-flex; align-items: center; gap: 6px; flex: none; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--osubs-muted); }
.osubs-status::before { content: ""; width: 6px; height: 6px; border-radius: 99px; background: var(--osubs-faint); }
.osubs-status--on::before { background: var(--osubs-ok); }
.osubs-status--busy::before { background: var(--osubs-warn); animation: osubs-pulse 1.4s ease-in-out infinite; }

.osubs-eyebrow { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: var(--osubs-muted); }
.osubs-badge {
  display: inline-flex; align-items: baseline; gap: 6px; flex: none;
  padding: 3px 9px; border-radius: 99px;
  border: 1px solid var(--osubs-line); background: var(--osubs-fill);
  font-size: 12px; font-weight: 600; line-height: 1.25; white-space: nowrap;
}
.osubs-badge > i { font-style: normal; font-size: 9.5px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; color: var(--osubs-muted); }
.osubs-tag {
  flex: none; padding: 2px 5px; border-radius: 5px;
  background: var(--osubs-fill-2); color: color-mix(in oklab, currentColor 75%, transparent);
  font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; line-height: 1.4;
}

.osubs-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
.osubs-hint { font-size: 12px; line-height: 1.55; color: var(--osubs-muted); }
.osubs-note { font-size: 11px; color: var(--osubs-faint); }
.osubs-bad { color: var(--osubs-bad); }
.osubs-actions { display: flex; flex-wrap: wrap; gap: 8px; }

.osubs-input {
  flex: 1 1 240px; height: 36px; padding: 0 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; font: inherit; font-size: 12.5px;
}
.osubs-input::placeholder { color: var(--osubs-faint); }
.osubs-input:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }

.osubs-link { font-size: 12.5px; color: inherit; text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in oklab, currentColor 35%, transparent); width: fit-content; }
.osubs-link:hover { text-decoration-color: currentColor; }

.osubs-quota { display: flex; flex-direction: column; gap: 12px; margin-top: 2px; padding-top: 14px; border-top: 1px solid var(--osubs-hair); }
.osubs-quota-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.osubs-qrow { display: flex; flex-direction: column; gap: 5px; }
.osubs-qrow-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12px; }
.osubs-bar { height: 6px; border-radius: 99px; background: var(--osubs-hair); overflow: hidden; }
.osubs-bar > i { display: block; height: 100%; border-radius: 99px; transform-origin: left center; transition: transform 340ms cubic-bezier(.2,.8,.2,1), background-color 240ms ease; }

.osubs-family { display: flex; flex-direction: column; gap: 10px; }
.osubs-family + .osubs-family { padding-top: 18px; border-top: 1px solid var(--osubs-hair); }
.osubs-family-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.osubs-models { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(215px, 100%), 1fr)); column-gap: 14px; row-gap: 1px; }
.osubs-model {
  display: flex; align-items: center; gap: 9px;
  min-height: 32px; padding: 0 8px; border-radius: 7px; cursor: pointer;
  transition: background-color 120ms ease;
}
.osubs-model:hover { background: var(--osubs-fill); }
.osubs-model:has(input:focus-visible) { outline: 2px solid var(--osubs-ring); outline-offset: -1px; }
.osubs-model input { flex: none; width: 14px; height: 14px; margin: 0; accent-color: currentColor; cursor: pointer; }
.osubs-model > span { flex: 1 1 auto; font-size: 12.5px; overflow-wrap: anywhere; }

.osubs-foot { display: flex; justify-content: flex-end; align-items: center; gap: 12px; flex-wrap: wrap; }

@keyframes osubs-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
@media (prefers-reduced-motion: reduce) { .osubs *, .osubs *::before { animation: none !important; transition: none !important; } }
`

    function ensureStyles() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
      const el = document.createElement('style')
      el.id = STYLE_ID
      el.textContent = CSS
      document.head.appendChild(el)
    }

    ensureStyles()

    function quotaTone(remaining) {
      if (typeof remaining !== 'number' || !Number.isFinite(remaining)) return null
      if (remaining <= 15) return 'bad'
      if (remaining <= 40) return 'warn'
      return 'ok'
    }

    function Button({ label, onClick, variant, size, type = 'button', disabled }) {
      const classes = ['osubs-btn']
      if (variant) classes.push(`osubs-btn--${variant}`)
      if (size) classes.push(`osubs-btn--${size}`)
      return h('button', { type, onClick, disabled, className: classes.join(' ') }, label)
    }

    function PlanBadge({ t, label }) {
      if (!label) return null
      return h('span', { className: 'osubs-badge' }, h('i', null, t.plan), label)
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
        return h('div', { className: 'osubs-qrow-head' },
          h('span', { style: { color: 'var(--osubs-muted)' } }, t.prepaid),
          h('span', { className: 'osubs-mono' }, formatAmount(row.remaining)),
        )
      }
      const remaining = typeof row.remainingPercent === 'number' ? row.remainingPercent : undefined
      const tone = quotaTone(remaining)
      const color = tone ? `var(--osubs-${tone})` : 'inherit'
      const amount = row.used !== undefined && row.total !== undefined
        ? `${formatAmount(row.used)} / ${formatAmount(row.total)}`
        : ''
      const reset = formatReset(row.resetAt, t)
      return h('div', { className: 'osubs-qrow' },
        h('div', { className: 'osubs-qrow-head' },
          h('span', { style: { color: 'var(--osubs-muted)' } }, rowLabel(row, t)),
          h('span', { style: { color, fontWeight: 500 } },
            amount ? `${amount} · ` : '',
            remaining === undefined ? '' : fill(t.leftPercent, remaining),
          ),
        ),
        remaining !== undefined && h('div', { className: 'osubs-bar' },
          h('i', {
            style: {
              background: color,
              transform: `scaleX(${Math.max(0, Math.min(100, remaining)) / 100})`,
            },
          }),
        ),
        reset && h('span', { className: 'osubs-note' }, reset),
      )
    }

    function QuotaBlock({ t, quota, onRefresh, onReset }) {
      const [busy, setBusy] = useState(false)
      if (!quota || quota.status === 'idle') return null
      const rows = Array.isArray(quota.rows) ? quota.rows : []
      const available = quota.resetCredits?.availableCount ?? 0
      const expires = formatReset(quota.resetCredits?.nextExpiresAt, t, 'expires')
      const canReset = available > 0 && typeof onReset === 'function'
      const confirmReset = async () => {
        if (!canReset || busy) return
        if (typeof window !== 'undefined' && !window.confirm(fill(t.quotaResetConfirm, available))) return
        setBusy(true)
        try {
          await onReset()
        } finally {
          setBusy(false)
        }
      }
      return h('div', { className: 'osubs-quota' },
        h('div', { className: 'osubs-quota-head' },
          h('span', { className: 'osubs-eyebrow' }, t.quota),
          h('div', { className: 'osubs-actions' },
            canReset && h(Button, {
              size: 'sm',
              disabled: busy,
              onClick: confirmReset,
              label: busy ? t.quotaResetBusy : fill(t.quotaResetLeft, available),
            }),
            h(Button, { size: 'sm', onClick: onRefresh, label: t.quotaRefresh }),
          ),
        ),
        canReset && expires && h('span', { className: 'osubs-note', style: { marginTop: -6, textAlign: 'right' } }, expires),
        quota.status === 'loading' && rows.length === 0 && h('p', { className: 'osubs-hint' }, t.quotaLoading),
        quota.status === 'error' && rows.length === 0 && h('p', { className: 'osubs-hint osubs-bad' }, `${t.quotaFailed}${quota.error ? ` · ${quota.error}` : ''}`),
        rows.map((row) => h(QuotaRow, { t, row, key: row.key })),
        quota.hasGrokCodeAccess === true && h('p', { className: 'osubs-note' }, t.grokCode),
      )
    }

    function ProviderCard({ t, id, title, hint, account, pending, onLogin, onImport, onLogout, onCancel, onManual, onRefreshQuota, onResetQuota }) {
      const [paste, setPaste] = useState('')
      const loggedIn = Boolean(account?.loggedIn)
      const busy = Boolean(account?.busy)
      const status = loggedIn ? t.loggedIn : busy ? t.busy : t.loggedOut
      const planLabel = loggedIn ? planOf(account) : ''
      return h('section', { className: 'osubs-card' },
        h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 180px' } },
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              h('h3', { style: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }, title),
              planLabel && h(PlanBadge, { t, label: planLabel }),
            ),
            h('p', { className: 'osubs-hint' }, hint),
          ),
          h('span', {
            className: `osubs-status${loggedIn ? ' osubs-status--on' : busy ? ' osubs-status--busy' : ''}`,
          }, status),
        ),
        account?.account && h('p', { className: 'osubs-mono' }, account.account),
        account?.detail && h('p', { className: 'osubs-hint osubs-bad' }, `${t.error}: ${account.detail}`),
        pending?.userCode && h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { className: 'osubs-eyebrow' }, t.userCode),
          h('code', { style: { fontSize: 20, letterSpacing: '0.14em', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }, pending.userCode),
        ),
        pending?.authorizeUrl && h('a', {
          className: 'osubs-link',
          href: pending.authorizeUrl,
          target: '_blank',
          rel: 'noreferrer',
        }, t.openUrl),
        h('div', { className: 'osubs-actions' },
          !loggedIn && !busy && h(Button, { variant: 'primary', onClick: () => onLogin(id), label: t.login }),
          id === 'grok' && !loggedIn && !busy && h(Button, { onClick: () => onLogin(id, 'pkce'), label: t.pkce }),
          !loggedIn && h(Button, { onClick: () => onImport(id), label: t.import }),
          busy && h(Button, { onClick: () => onCancel(id), label: t.cancel }),
          loggedIn && h(Button, { onClick: () => onLogout(id), label: t.logout }),
        ),
        busy && pending?.mode === 'pkce' && h('form', {
          onSubmit: (event) => {
            event.preventDefault()
            onManual(id, paste)
          },
          style: { display: 'flex', gap: 8, flexWrap: 'wrap' },
        },
          h('input', {
            className: 'osubs-input',
            value: paste,
            onChange: (event) => setPaste(event.target.value),
            placeholder: t.pastePlaceholder,
            'aria-label': t.paste,
          }),
          h(Button, { type: 'submit', variant: 'primary', label: t.submitPaste }),
        ),
        loggedIn && h(QuotaBlock, {
          t,
          quota: account.quota,
          onRefresh: () => onRefreshQuota(id),
          onReset: id === 'codex' && onResetQuota ? () => onResetQuota(id) : undefined,
        }),
      )
    }

    function ModelRow({ t, model, onToggle }) {
      return h('label', { className: 'osubs-model' },
        h('input', {
          type: 'checkbox',
          checked: Boolean(model.enabled),
          onChange: () => onToggle(model.key, !model.enabled),
        }),
        h('span', null, model.name),
        model.ultra && h('span', { className: 'osubs-tag' }, t.ultraTag),
        model.large && h('span', { className: 'osubs-tag' }, t.largeTag),
        model.fast && h('span', { className: 'osubs-tag' }, t.fastTag),
      )
    }

    function ModelFamily({ t, group, onToggle, onFamily }) {
      const models = Array.isArray(group.models) ? group.models : []
      const enabledCount = models.filter((model) => model.enabled).length
      return h('div', { className: 'osubs-family', style: { opacity: group.loggedIn ? 1 : 0.72 } },
        h('div', { className: 'osubs-family-head' },
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
            h('h4', { style: { fontSize: 13, fontWeight: 600 } }, group.displayName),
            h('span', { className: 'osubs-note' }, fill(t.modelsOn, `${enabledCount} / ${models.length}`)),
            !group.loggedIn && h('span', { className: 'osubs-note' }, `· ${t.modelsNeedLogin}`),
          ),
          h('div', { className: 'osubs-seg' },
            h(Button, { size: 'sm', onClick: () => onFamily(group.family, true), label: t.modelsAll }),
            h(Button, { size: 'sm', onClick: () => onFamily(group.family, false), label: t.modelsNone }),
          ),
        ),
        h('div', { className: 'osubs-models' },
          models.map((model) => h(ModelRow, { t, model, onToggle, key: model.key })),
        ),
      )
    }

    function ModelPicker({ t, catalog, onToggle, onFamily }) {
      const groups = Array.isArray(catalog) ? catalog : []
      const total = groups.reduce((sum, group) => sum + (group.models?.length ?? 0), 0)
      const enabled = groups.reduce((sum, group) => sum + (group.models ?? []).filter((model) => model.enabled).length, 0)
      if (groups.length === 0) return null
      return h('section', { className: 'osubs-card', style: { padding: '18px 20px 20px', gap: 18 } },
        h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 320px', maxWidth: '62ch' } },
            h('h3', { style: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }, t.modelsTitle),
            h('p', { className: 'osubs-hint' }, t.modelsHint),
          ),
          h('span', { className: 'osubs-badge' }, fill(t.modelsOn, `${enabled} / ${total}`)),
        ),
        groups.map((group) => h(ModelFamily, { t, group, onToggle, onFamily, key: group.provider })),
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
        return h('p', { className: 'osubs-hint' }, t.noRpc)
      }

      const card = (id, title, hint) => h(ProviderCard, {
        t,
        id,
        title,
        hint,
        account: snap?.accounts?.[id],
        pending: pending[id],
        onLogin: (provider, mode) => run('login', { provider, mode }),
        onImport: (provider) => run('import', { provider }),
        onLogout: (provider) => run('logout', { provider }),
        onCancel: (provider) => run('cancel', { provider }),
        onManual: (provider, input) => run('manual', { provider, input }),
        onRefreshQuota: (provider) => run('quota', { provider }),
        onResetQuota: id === 'codex' ? (provider) => run('reset', { provider }) : undefined,
      })

      return h('div', { className: 'osubs' },
        error && h('p', { className: 'osubs-hint osubs-bad' }, error),
        h('div', { className: 'osubs-grid' },
          card('codex', t.codexTitle, t.codexHint),
          card('grok', t.grokTitle, t.grokHint),
        ),
        h(ModelPicker, {
          t,
          catalog: snap?.catalog,
          onToggle: (key, on) => run('models', { key, on }),
          onFamily: (family, on) => run('models', { family, on }),
        }),
        h('div', { className: 'osubs-foot' },
          h(Button, { variant: 'primary', onClick: () => run('sync', {}), label: t.sync }),
        ),
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
