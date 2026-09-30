// Settings UI part — inlined into the client.ts factory by scripts/ui-bundle.ts.
// RPC + local-store helpers, fill / reset / amount formatters, plan labels, opaque-identity filters.

    function localeOf() {
      const lang = (typeof document !== 'undefined' && document.documentElement.lang)
        || (typeof navigator !== 'undefined' && navigator.language)
        || 'zh'
      return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }

    // Main panels stay mounted when inactive (retained), so "mounted" is not
    // "shown": the window must be visible and the panel itself rendered.
    function panelVisible(el, doc) {
      return !doc.hidden && el?.checkVisibility?.() !== false
    }

    function callRpc(rpc, method, payload?) {
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

    const STATUS_STORE = 'dsh-plugin-oauth-subs.status'

    function readStoredSnap() {
      try {
        const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(STATUS_STORE)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : null
      } catch {
        return null
      }
    }

    function writeStoredSnap(snap) {
      try {
        if (typeof localStorage === 'undefined' || !snap || typeof snap !== 'object') return
        localStorage.setItem(STATUS_STORE, JSON.stringify(snap))
      } catch { /* quota / private mode */ }
    }

    function isUnknownOauthMethod(message) {
      return /unknown oauth-subs method /i.test(String(message || ''))
    }

    function fill(template, n) {
      // A record fills named placeholders (`{n}`, `{max}`, …); missing keys
      // stay literal so a template never ends up with `undefined`.
      if (n !== null && typeof n === 'object') {
        return String(template).replace(/\{(\w+)\}/g, (match, key) => (
          n[key] === undefined || n[key] === null ? match : String(n[key])
        ))
      }
      return String(template).replace('{n}', String(n))
    }

    function formatReset(resetAt, t, kind = 'reset') {
      if (typeof resetAt !== 'number' || resetAt <= 0) return ''
      const units = kind === 'expires'
        ? { soon: t.expiresSoon, suffix: t.expiresIn, minute: t.unitMinutes, hour: t.unitHours, day: t.unitDays }
        : { soon: t.resetSoon, suffix: t.resetIn, minute: t.unitMinutes, hour: t.unitHours, day: t.unitDays }
      const delta = resetAt - Date.now()
      if (delta <= 0) return units.soon
      const totalMinutes = Math.max(1, Math.round(delta / 60_000))
      const days = Math.floor(totalMinutes / 1440)
      const hours = Math.floor((totalMinutes % 1440) / 60)
      const minutes = totalMinutes % 60
      const bits = []
      if (days) bits.push(fill(units.day, days))
      if (hours) bits.push(fill(units.hour, hours))
      if (minutes || bits.length === 0) bits.push(fill(units.minute, minutes))
      return fill(units.suffix, bits.join(' '))
    }

    function formatDay(stamp) {
      const date = new Date(stamp)
      if (!Number.isFinite(date.getTime())) return ''
      return `${date.getMonth() + 1}/${date.getDate()}`
    }

    function formatStamp(resetAt) {
      if (typeof resetAt !== 'number' || resetAt <= 0) return ''
      try {
        return new Date(resetAt).toLocaleString(localeOf(), {
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

    /** Cline credits and cap amounts are USD (upstream units are 1e-8 / 1e-6). */
    function formatUsd(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      return '$' + value.toFixed(2)
    }

    /** Compact token counts: 103691253 -> 103.7M, 1200000000 -> 1.2B. */
    function formatTokenAmount(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      if (value >= 1e9) return `${Math.round(value / 1e8) / 10}B`
      if (value >= 1e6) return `${Math.round(value / 1e5) / 10}M`
      if (value >= 1e3) return `${Math.round(value / 1e2) / 10}K`
      return String(Math.round(value))
    }

    const AMOUNT_UNITS_KEY = 'osubs-amount-units'
    function readExactAmountUnits() {
      try { return localStorage.getItem(AMOUNT_UNITS_KEY) === 'exact' } catch { return false }
    }
    function writeExactAmountUnits(exact) {
      try { localStorage.setItem(AMOUNT_UNITS_KEY, exact ? 'exact' : 'compact') } catch { /* private mode */ }
    }

    const PLAN_LABELS = {
      free: 'Free',
      free_plan: 'Free',
      free_trial: 'Free',
      go: 'Go',
      plus: 'Plus',
      chatgpt_plus: 'Plus',
      pro: 'Pro 20x',
      chatgpt_pro: 'Pro 20x',
      pro20x: 'Pro 20x',
      pro_20x: 'Pro 20x',
      prolite: 'Pro 5x',
      pro_lite: 'Pro 5x',
      chatgpt_prolite: 'Pro 5x',
      chatgpt_pro_lite: 'Pro 5x',
      pro5x: 'Pro 5x',
      pro_5x: 'Pro 5x',
      team: 'Team',
      business: 'Business',
      enterprise: 'Enterprise',
      edu: 'Edu',
      student: 'Student',
      lite: 'Lite',
      max: 'Max',
      coding_lite: 'Lite',
      coding_pro: 'Pro',
      coding_max: 'Max',
      kiro_free: 'Free',
      kirofree: 'Free',
      kiro_pro: 'Pro',
      kiropro: 'Pro',
      kiro_proplus: 'Pro+',
      kiro_pro_plus: 'Pro+',
      kiroproplus: 'Pro+',
      proplus: 'Pro+',
      kiro_powered: 'Powered',
      kiropowered: 'Powered',
      powered: 'Powered',
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

    function formatPlanLabel(raw, family) {
      if (raw === undefined || raw === null || raw === '') return ''
      if (typeof raw === 'number' && Number.isInteger(raw)) return PLAN_LABELS[raw] ?? String(raw)
      const trimmed = String(raw).trim()
      if (!trimmed) return ''
      const slug = trimmed.toLowerCase().replace(/\+/g, 'plus').replace(/[_\-\s]+/g, '_').replace(/^_|_$/g, '')
      const compact = slug.replace(/_/g, '')
      if (family === 'glm') {
        if (slug === 'pro' || slug === 'coding_pro') return 'Pro'
        if (slug === 'lite' || slug === 'coding_lite') return 'Lite'
        if (slug === 'max' || slug === 'coding_max') return 'Max'
      }
      if (family === 'kiro') {
        if (slug === 'kiro_pro' || slug === 'kiropro' || slug === 'pro') return 'Pro'
        if (slug === 'kiro_proplus' || slug === 'kiro_pro_plus' || compact === 'kiroproplus' || slug === 'proplus' || slug === 'pro_plus') return 'Pro+'
        if (slug === 'kiro_free' || slug === 'kirofree' || slug === 'free') return 'Free'
        if (slug === 'kiro_powered' || slug === 'kiropowered' || slug === 'powered') return 'Powered'
      }
      if (family === 'antigravity') {
        if (slug === 'g1_pro_tier' || slug === 'g1protier' || slug === 'g1pro' || slug === 'pro' || slug === 'google_ai_pro' || slug === 'ai_pro') return 'Pro'
        if (slug === 'g1_ultra_5x_tier' || slug === 'g1_ultra_5x' || slug === 'ultra_5x' || slug === 'ultra5x') return 'Ultra 5x'
        if (slug === 'g1_ultra_20x_tier' || slug === 'g1_ultra_20x' || slug === 'ultra_20x' || slug === 'ultra20x') return 'Ultra 20x'
        if (slug === 'g1_ultra_tier' || slug === 'g1ultratier' || slug === 'g1ultra' || slug === 'ultra' || slug === 'google_ai_ultra' || slug === 'ai_ultra') return 'Ultra'
        if (slug === 'g1_plus_tier' || slug === 'g1plustier' || slug === 'plus' || slug === 'google_ai_plus') return 'Plus'
        if (slug === 'free' || slug === 'free_tier' || slug === 'freetier') return 'Free'
        if (slug === 'standard' || slug === 'standard_tier' || slug === 'standardtier') return 'Standard'
        if (slug === 'legacy' || slug === 'legacy_tier' || slug === 'legacytier') return 'Legacy'
      }
      if (family === 'ollama') {
        if (slug === 'pro' || compact === 'pro') return 'Pro'
        if (slug === 'free' || compact === 'free') return 'Free'
        if (slug === 'max' || compact === 'max') return 'Max'
        if (slug === 'team' || compact === 'team') return 'Team'
        if (slug === 'plus' || compact === 'plus') return 'Plus'
        if (slug === 'hobby' || compact === 'hobby') return 'Hobby'
        if (slug === 'enterprise' || compact === 'enterprise') return 'Enterprise'
      }
      if (family === 'copilot') {
        if (slug === 'proplus' || slug === 'pro_plus' || compact === 'proplus') return 'Pro+'
        if (slug === 'pro' || compact === 'pro') return 'Pro'
        if (slug === 'free' || compact === 'free') return 'Free'
        if (slug === 'business' || compact === 'business') return 'Business'
        if (slug === 'enterprise' || compact === 'enterprise') return 'Enterprise'
        if (slug === 'individual' || compact === 'individual') return 'Individual'
      }
      if (family === 'devin') {
        if (slug === '16' || slug === 'devin_pro' || slug === 'pro' || compact === 'pro') return 'Pro'
        if (slug === '17' || slug === 'devin_max' || slug === 'max' || compact === 'max') return 'Max'
        if (slug === '14' || slug === '15' || slug === 'devin_teams' || slug === 'teams' || slug === 'devin_teams_v2') return 'Teams'
        if (slug === '19' || slug === 'devin_free' || slug === 'free' || compact === 'free') return 'Free'
        if (slug === '20' || slug === 'devin_trial' || slug === 'trial') return 'Trial'
        if (slug === '12' || slug === 'devin_enterprise' || slug === 'enterprise' || compact === 'enterprise') return 'Enterprise'
      }
      if (family === 'command-code') {
        if (slug === 'individual_go' || slug === 'go') return 'Go'
        if (slug === 'individual_goat' || slug === 'goat') return 'GOAT'
        if (slug === 'individual_provider' || slug === 'provider') return 'Provider'
        if (slug === 'individual_pro' || slug === 'individual_pro_v1' || slug === 'pro') return 'Pro'
        if (slug === 'individual_max' || slug === 'max') return 'Max'
        if (slug === 'individual_ultra' || slug === 'ultra') return 'Ultra'
        if (slug === 'teams_pro') return 'Teams Pro'
        if (slug === 'free' || slug === 'individual_free') return 'Free'
      }
      return PLAN_LABELS[slug] || PLAN_LABELS[compact] || trimmed
    }

    function isAssistOnlyPlan(raw) {
      const compact = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
      return compact === 'standard' || compact === 'standardtier' || compact === 'legacy' || compact === 'legacytier'
    }

    function planOf(account, family) {
      const labels = [
        account?.quota?.planLabel,
        account?.planLabel,
        formatPlanLabel(account?.quota?.planType || account?.planType, family),
      ]
      for (const label of labels) {
        if (typeof label !== 'string' || !label.trim()) continue
        if (family === 'antigravity' && isAssistOnlyPlan(label)) continue
        return label
      }
      return ''
    }

    function isGlmAppIdentity(value) {
      if (typeof value !== 'string' || !value.trim()) return false
      return /^(zcode|zai|bigmodel|glm)(@|$)/i.test(value.trim())
    }

    function isGlmOpaqueIdentity(value) {
      if (typeof value !== 'string' || !value.trim()) return false
      const raw = value.trim()
      if (isGlmAppIdentity(raw)) return true
      if (raw.includes('@')) return false
      if (/^[+]?[\d\s().-]+$/.test(raw) && /[+\s().-]/.test(raw)) return false
      // Only unambiguous ids are hidden: pure digits, UUID, long hex. A
      // letters+digits handle (xxww0098 / fwfeibn6) is a real username — the
      // backend already vetted session.account, so don't drop it here.
      if (/^\d+$/.test(raw)) return true
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return true
      return /^[0-9a-f]{16,}$/i.test(raw)
    }

    function isCursorOpaqueIdentity(value) {
      if (typeof value !== 'string' || !value.trim()) return false
      const raw = value.trim()
      if (raw.toLowerCase() === 'cursor') return true
      if (/^cursor-[A-Za-z0-9_-]{4,}$/i.test(raw)) return true
      if (/^[A-Za-z0-9._-]+\|[A-Za-z0-9._-]+$/.test(raw) && !raw.includes('@')) return true
      if (/^user_[A-Za-z0-9]{16,}$/i.test(raw)) return true
      return false
    }

    function isOllamaOpaqueIdentity(value) {
      return /^ollama-[0-9a-f]{8}$/i.test(String(value ?? '').trim())
    }

    function isKimiOpaqueIdentity(value) {
      return /^kimi-[0-9a-f]{8}$/i.test(String(value ?? '').trim())
    }

    function isCopilotOpaqueIdentity(value) {
      return /^copilot-[0-9a-f]{8}$/i.test(String(value ?? '').trim())
    }

    function isDevinOpaqueIdentity(value) {
      const raw = String(value ?? '').trim()
      return /^devin-[A-Za-z0-9_-]{4,}$/i.test(raw) || /^devin-team\$[A-Za-z0-9_-]+$/i.test(raw) || /^user-[0-9a-f]{16,}$/i.test(raw)
    }

    function isCommandCodeOpaqueIdentity(value) {
      const raw = String(value ?? '').trim()
      return /^command-code-(account|[0-9a-z]{8})$/i.test(raw)
        || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    }

    function identityOf(row, family) {
      const account = typeof row?.account === 'string' ? row.account.trim() : ''
      if (family === 'glm') return account && !isGlmOpaqueIdentity(account) ? account : ''
      if (family === 'cursor') return account && !isCursorOpaqueIdentity(account) ? account : ''
      if (family === 'ollama') return account && !isOllamaOpaqueIdentity(account) ? account : ''
      if (family === 'kimi') return account && !isKimiOpaqueIdentity(account) ? account : ''
      if (family === 'copilot') return account && !isCopilotOpaqueIdentity(account) ? account : ''
      if (family === 'devin') return account && !isDevinOpaqueIdentity(account) ? account : ''
      if (family === 'command-code') return account && !isCommandCodeOpaqueIdentity(account) ? account : ''
      if (account && !isGlmAppIdentity(account)) return account
      return account || row?.id || ''
    }
