/**
 * Browser half. Registers the "OAuth 订阅" settings section.
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
}

type Copy = Record<string, string>

window.__ModuleLoader__.load({
  id: 'dsh-plugin-oauth-subs',
  factory: (require) => {
    const module = { exports: {} as { name?: string; inject?: string[]; apply?: (ctx: any) => void } }
    const exports = module.exports
    const { createElement: h, useCallback, useEffect, useState } = require('react') as ReactLike

    function tryHost(id) {
      try { return require(id) } catch { return undefined }
    }
    const primitives = tryHost('@deepseek-ai/dsh-client-ui-primitives')
    const HostRisk = primitives && (primitives.RiskConfirmation || primitives.default && primitives.default.RiskConfirmation)

    const name = 'dsh-plugin-oauth-subs-client'
    const inject = ['slots', 'connection']

    const COPY: { zh: Copy; en: Copy } = {
      zh: {
        nav: 'OAuth 订阅',
        codexTitle: 'ChatGPT Codex',
        grokTitle: 'xAI Grok',
        glmTitle: '智谱 GLM',
        kiroTitle: 'AWS Kiro',
        antigravityTitle: 'Antigravity',
        antigravityPastePlaceholder: 'http://localhost:51121/oauth-callback?code=…&state=…',
        antigravityVerify: 'Google 需要验证此账号才能对话',
        antigravityVerifyGo: '去验证',
        cursorTitle: 'Cursor',
        cursorImport: '导入本机 Cursor',
        cursorImportEmpty: '本机没有 Cursor CLI 或 IDE 登录',
        ollamaTitle: 'Ollama Cloud',
        ollamaLoginApiKey: '粘贴 API Key',
        ollamaKeyPlaceholder: 'ollama.com API key',
        ollamaKeyGo: '保存密钥',
        ollamaKeyHint: '在 ollama.com/settings/keys 创建。也可设置环境变量 OLLAMA_API_KEY。',
        ollamaImport: '导入 OLLAMA_API_KEY',
        ollamaImportEmpty: '未找到 OLLAMA_API_KEY',
        kimiTitle: '月之暗面',
        kimiLoginApiKey: '粘贴 API Key',
        kimiKeyPlaceholder: 'KIMI_API_KEY 或 sk-…',
        kimiKeyGo: '保存密钥',
        kimiKeyHint: '粘贴 Kimi Code API key。也可导入本机 ~/.kimi-code/credentials/kimi-code.json。',
        kimiImport: '导入本机 Kimi Code',
        kimiImportEmpty: '未找到 kimi-code.json 或 KIMI_API_KEY',
        opencodeTitle: 'OpenCode Free',
        opencodeEnable: '启用免费模型',
        opencodeEnableHint: '匿名接入 OpenCode Zen 免费档，无需账号或 API key。',
        login: '登录',
        addAccount: '添加账号',
        addAccountTitle: '添加账号',
        continueAuth: '继续授权',
        dialogClose: '关闭',
        glmLoginZai: '连接 Z.ai',
        glmLoginBigmodel: '连接 BigModel',
        glmAddZai: '添加 Z.ai 账号',
        glmAddBigmodel: '添加 BigModel 账号',
        glmLoginApiKey: '使用 API key',
        glmRegionGlobal: '全球',
        glmRegionCn: '中国',
        glmKeyLabel: 'API key',
        glmKeyPlaceholder: 'id.secret 或 Coding Plan 密钥',
        glmKeyGo: '保存密钥',
        glmKeyHint: '贴 Z.ai 或 BigModel 的 Coding Plan 密钥。',
        glmPickRegion: '站点',
        kiroLoginSocial: '连接 Social / GitHub / Google',
        kiroAddSocial: '添加 Social 账号',
        kiroLoginBuilder: '连接 Builder ID',
        kiroAddBuilder: '添加 Builder ID',
        kiroLoginIdc: '连接 Enterprise / IdC',
        kiroAddIdc: '添加 IdC 账号',
        kiroLoginEntra: '企业 SSO · Entra / Azure AD',
        kiroLoginApiKey: '使用 Kiro API key',
        kiroLoginRefresh: '粘贴凭证',
        kiroStartUrl: 'Start URL',
        kiroStartUrlPlaceholder: 'https://d-xxxxxxxxxx.awsapps.com/start',
        kiroStartUrlGo: '继续',
        kiroStartUrlHint: 'IAM Identity Center 门户 Start URL。',
        kiroEntraEndpoint: 'Token 端点',
        kiroEntraEndpointPlaceholder: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
        kiroEntraClient: 'Client ID',
        kiroEntraRefresh: 'Refresh token',
        kiroEntraScopes: 'Scopes（可选）',
        kiroEntraGo: '保存企业 SSO',
        kiroEntraHint: 'Public client 的 refresh_token。端点须为 microsoftonline。',
        kiroKeyPlaceholder: 'ksk_…',
        kiroKeyHint: 'Kiro headless API key，作 Bearer 使用。',
        kiroRefreshPlaceholder: '卡密 / JSON / CSV / Social refresh / ksk_…',
        kiroRefreshHint: '支持卡密、JSON、CSV、Social refresh 或 ksk_。可一次导入多个。',
        kiroKeyGo: '保存密钥',
        kiroRefreshGo: '导入凭证',
        switchTo: '切换',
        inUse: '使用中',
        noAccounts: '还没有登录账号',
        pkce: 'PKCE 登录',
        device: '设备码登录',
        import: '导入本机会话',
        logout: '退出',
        cancel: '取消',
        paste: '粘贴回调地址',
        pastePlaceholder: 'http://localhost:1455/auth/callback?code=…&state=…',
        submitPaste: '提交',
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
        quotaUnknown: '周额度未返回，点刷新重试',
        quotaReset: '重置',
        quotaResetBank: '重置券',
        quotaResetHint: '每张券过期时间不同。点一次消耗一张，刷新周额度。',
        quotaResetLeft: '重置券 · 剩 {n} 次',
        quotaResetWarnTitle: '警告',
        quotaResetConfirm: '将消耗这张重置券（{n} 过期），并立即刷新 Codex 周额度窗口。此操作无法撤销。',
        quotaResetAck: '我已了解风险，确认消耗这张重置券',
        quotaResetConfirmOk: '确认重置',
        quotaResetClose: '关闭',
        quotaResetBusy: '正在重置…',
        quotaResetEmpty: '没有可用的重置券。',
        quotaResetExpires: '{n} 过期',
        leftPercent: '剩余 {n}%',
        cursorComposer: '补全 & Composer',
        cursorApi: 'API 调用',
        resetIn: '{n}后重置',
        expiresIn: '{n}后过期',
        unitMinutes: '{n} 分钟',
        unitHours: '{n} 小时',
        unitDays: '{n} 天',
        resetSoon: '即将重置',
        expiresSoon: '即将过期',
        primary: '5 小时',
        weekly: '每周',
        cycle: '本周期',
        glmPrimary: '5 小时剩余',
        glmWeekly: '每周剩余',
        glmMcp: 'ZCode MCP',
        glmBoost: '150%配额',
        glmBoostHint: 'ZCode 登录使用享 150%配额',
        prepaid: '预付余额',
        grokCode: 'Grok Code',
        agGemini: 'Gemini 模型',
        agClaudeGpt: 'Claude 和 GPT 模型',
        modelsTitle: '模型',
        modelsHint: '勾选即同步。Fast 仅 Codex Priority，更耗额度；900K 默认关。',
        modelsOn: '已开启 {n}',
        modelsAll: '全选',
        modelsNone: '全关',
        modelsNeedLogin: '登录后同步',
        fastTag: 'Fast',
        largeTag: '900K',
        aboutTitle: '关于',
        repo: '仓库',
        repoOpen: '打开仓库',
        installed: '当前版本',
        onDisk: '磁盘',
        loadedFrom: '加载自',
        latest: '最新版本',
        os: '系统',
        checkUpdate: '检查更新',
        checking: '正在检查…',
        updateInstalling: '正在更新…',
        updateReady: '有新版本 {n}',
        updateCurrent: '已是最新',
        updateAhead: '本地版本领先发布',
        updateUnknown: 'GitHub 没有可用的版本号',
        updateError: '检查失败',
        updateInstalled: '已写入 web profile。当前进程仍是旧模块，请重启 dsh web 后生效。',
        updateStaleProcess: '磁盘已是 {n}，但本进程加载的是另一份。退出全部 dsh web 后若仍如此，请 remove 再从 GitHub 重装。',
        updateFailed: '更新失败：{n}',
        updateUnchanged: '命令已成功但磁盘版本未变：{n}',
        updateMissingDsh: 'PATH 上找不到 dsh。确认已安装 DeepSeek Harness，再点检查更新。',
        updateTimeout: 'dsh plugin update 超时。可先移除再从 GitHub 重装：dsh plugin --profile web remove dsh-plugin-oauth-subs && dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs',
        platformWin: 'Windows',
        platformMac: 'macOS',
        platformLinux: 'Linux',
        published: '发布于 {n}',
      },
      en: {
        nav: 'OAuth subs',
        codexTitle: 'ChatGPT Codex',
        grokTitle: 'xAI Grok',
        glmTitle: 'Zhipu GLM',
        kiroTitle: 'AWS Kiro',
        antigravityTitle: 'Antigravity',
        antigravityPastePlaceholder: 'http://localhost:51121/oauth-callback?code=…&state=…',
        antigravityVerify: 'Google needs to verify this account before chat',
        antigravityVerifyGo: 'Verify',
        cursorTitle: 'Cursor',
        cursorImport: 'Import local Cursor',
        cursorImportEmpty: 'No Cursor CLI or IDE login on this machine',
        ollamaTitle: 'Ollama Cloud',
        ollamaLoginApiKey: 'Paste API key',
        ollamaKeyPlaceholder: 'ollama.com API key',
        ollamaKeyGo: 'Save key',
        ollamaKeyHint: 'Create a key at ollama.com/settings/keys. Or set OLLAMA_API_KEY in the environment.',
        ollamaImport: 'Import OLLAMA_API_KEY',
        ollamaImportEmpty: 'OLLAMA_API_KEY not found',
        kimiTitle: 'Kimi',
        kimiLoginApiKey: 'Paste API key',
        kimiKeyPlaceholder: 'KIMI_API_KEY or sk-…',
        kimiKeyGo: 'Save key',
        kimiKeyHint: 'Paste a Kimi Code API key. Or import ~/.kimi-code/credentials/kimi-code.json.',
        kimiImport: 'Import local Kimi Code',
        kimiImportEmpty: 'No kimi-code.json or KIMI_API_KEY found',
        opencodeTitle: 'OpenCode Free',
        opencodeEnable: 'Enable free models',
        opencodeEnableHint: 'Anonymous OpenCode Zen free models. No account or API key.',
        login: 'Sign in',
        addAccount: 'Add account',
        addAccountTitle: 'Add account',
        continueAuth: 'Continue authorization',
        dialogClose: 'Close',
        glmLoginZai: 'Continue with Z.ai',
        glmLoginBigmodel: 'Continue with BigModel',
        glmAddZai: 'Add Z.ai account',
        glmAddBigmodel: 'Add BigModel account',
        glmLoginApiKey: 'Use API key',
        glmRegionGlobal: 'Global',
        glmRegionCn: 'China',
        glmKeyLabel: 'API key',
        glmKeyPlaceholder: 'id.secret or Coding Plan key',
        glmKeyGo: 'Save key',
        glmKeyHint: 'Paste a Z.ai or BigModel Coding Plan key.',
        glmPickRegion: 'Site',
        kiroLoginSocial: 'Continue with Social / GitHub / Google',
        kiroAddSocial: 'Add Social account',
        kiroLoginBuilder: 'Continue with Builder ID',
        kiroAddBuilder: 'Add Builder ID',
        kiroLoginIdc: 'Continue with Enterprise / IdC',
        kiroAddIdc: 'Add IdC account',
        kiroLoginEntra: 'Enterprise SSO · Entra / Azure AD',
        kiroLoginApiKey: 'Use Kiro API key',
        kiroLoginRefresh: 'Paste credentials',
        kiroStartUrl: 'Start URL',
        kiroStartUrlPlaceholder: 'https://d-xxxxxxxxxx.awsapps.com/start',
        kiroStartUrlGo: 'Continue',
        kiroStartUrlHint: 'IAM Identity Center portal Start URL.',
        kiroEntraEndpoint: 'Token endpoint',
        kiroEntraEndpointPlaceholder: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
        kiroEntraClient: 'Client ID',
        kiroEntraRefresh: 'Refresh token',
        kiroEntraScopes: 'Scopes (optional)',
        kiroEntraGo: 'Save enterprise SSO',
        kiroEntraHint: 'Public-client refresh_token. Endpoint must be microsoftonline.',
        kiroKeyPlaceholder: 'ksk_…',
        kiroKeyHint: 'Kiro headless API key, used as the bearer.',
        kiroRefreshPlaceholder: 'Kami / JSON / CSV / Social refresh / ksk_…',
        kiroRefreshHint: 'Kami, JSON, CSV, Social refresh, or ksk_. Import one or many.',
        kiroKeyGo: 'Save key',
        kiroRefreshGo: 'Import credentials',
        switchTo: 'Switch',
        inUse: 'In use',
        noAccounts: 'No accounts yet',
        pkce: 'PKCE sign-in',
        device: 'Device-code sign-in',
        import: 'Import local session',
        logout: 'Sign out',
        cancel: 'Cancel',
        paste: 'Paste callback URL',
        pastePlaceholder: 'http://localhost:1455/auth/callback?code=…&state=…',
        submitPaste: 'Submit',
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
        quotaUnknown: 'Weekly quota missing. Refresh to retry.',
        quotaReset: 'Reset',
        quotaResetBank: 'Reset credits',
        quotaResetHint: 'Each credit expires on its own clock. Spend one to refresh the weekly window.',
        quotaResetLeft: 'Reset quota · {n} left',
        quotaResetWarnTitle: 'Warning',
        quotaResetConfirm: 'This spends the credit that expires {n} and immediately refreshes the Codex weekly window. It cannot be undone.',
        quotaResetAck: 'I understand the risk and want to spend this credit',
        quotaResetConfirmOk: 'Reset now',
        quotaResetClose: 'Close',
        quotaResetBusy: 'Resetting…',
        quotaResetEmpty: 'No reset credits left.',
        quotaResetExpires: 'Expires {n}',
        leftPercent: '{n}% left',
        cursorComposer: 'Tab completion & Composer',
        cursorApi: 'API',
        resetIn: 'resets in {n}',
        expiresIn: 'expires in {n}',
        unitMinutes: '{n} min',
        unitHours: '{n} h',
        unitDays: '{n} d',
        resetSoon: 'reset imminent',
        expiresSoon: 'expires soon',
        primary: '5-hour',
        weekly: 'Weekly',
        cycle: 'This period',
        glmPrimary: '5-hour remaining',
        glmWeekly: 'Weekly remaining',
        glmMcp: 'ZCode MCP',
        glmBoost: '150% quota',
        glmBoostHint: 'ZCode session: 150% quota',
        prepaid: 'Prepaid',
        grokCode: 'Grok Code',
        agGemini: 'Gemini Models',
        agClaudeGpt: 'Claude and GPT models',
        modelsTitle: 'Models',
        modelsHint: 'Check to sync. Fast is Codex Priority only and spends more. 900K is off by default.',
        modelsOn: '{n} on',
        modelsAll: 'All on',
        modelsNone: 'All off',
        modelsNeedLogin: 'Syncs after sign-in',
        fastTag: 'Fast',
        largeTag: '900K',
        aboutTitle: 'About',
        repo: 'Repository',
        repoOpen: 'Open repo',
        installed: 'Installed',
        onDisk: 'On disk',
        loadedFrom: 'Loaded from',
        latest: 'Latest',
        os: 'OS',
        checkUpdate: 'Check for updates',
        checking: 'Checking…',
        updateInstalling: 'Updating…',
        updateReady: 'Update available {n}',
        updateCurrent: 'Up to date',
        updateAhead: 'Local version is ahead of the latest release',
        updateUnknown: 'GitHub did not return a version',
        updateError: 'Update check failed',
        updateInstalled: 'Written to the web profile. This process still has the old module — restart dsh web to load it.',
        updateStaleProcess: 'On disk is {n}, but this process loaded a different copy. If that remains after quitting every dsh web, remove and re-add from GitHub.',
        updateFailed: 'Update failed: {n}',
        updateUnchanged: 'Command finished but the on-disk version did not change: {n}',
        updateMissingDsh: 'dsh was not found on PATH. Confirm DeepSeek Harness is installed, then try again.',
        updateTimeout: 'dsh plugin update timed out. Remove and re-add from GitHub: dsh plugin --profile web remove dsh-plugin-oauth-subs && dsh plugin --profile web add https://github.com/xxww0098/dsh-plugin-oauth-subs',
        platformWin: 'Windows',
        platformMac: 'macOS',
        platformLinux: 'Linux',
        published: 'Published {n}',
      },
    }

    function localeOf() {
      const lang = typeof navigator !== 'undefined' ? navigator.language : 'zh'
      return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
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

    function fill(template, n) {
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

    function formatStamp(resetAt) {
      if (typeof resetAt !== 'number' || resetAt <= 0) return ''
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
      if (family === 'opencode') {
        if (slug === 'free' || compact === 'free') return 'Free'
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
      if (/^\d+$/.test(raw)) return true
      return /^[A-Za-z0-9]{2,24}$/.test(raw) && /[A-Za-z]/.test(raw) && /\d/.test(raw)
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

    function identityOf(row, family) {
      const account = typeof row?.account === 'string' ? row.account.trim() : ''
      if (family === 'glm') return account && !isGlmOpaqueIdentity(account) ? account : ''
      if (family === 'cursor') return account && !isCursorOpaqueIdentity(account) ? account : ''
      if (family === 'ollama') return account && !isOllamaOpaqueIdentity(account) ? account : ''
      if (family === 'kimi') return account && !isKimiOpaqueIdentity(account) ? account : ''
      if (account && !isGlmAppIdentity(account)) return account
      return account || row?.id || ''
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
  gap: 0;
  width: 100%;
  max-width: 1000px;
  font-variant-numeric: tabular-nums;
}
.osubs, .osubs * { box-sizing: border-box; min-width: 0; }
.osubs ::selection { background: color-mix(in oklab, currentColor 18%, transparent); }
.osubs p, .osubs h3, .osubs h4 { margin: 0; }

.osubs button,
.osubs [role="button"],
.osubs-link,
.osubs-dsw-mask,
.osubs-dsw-x,
.osubs-dsw-btn { cursor: pointer; }
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
.osubs-btn--danger {
  font-weight: 600;
  color: var(--osubs-bad);
  border-color: color-mix(in oklab, var(--osubs-bad) 42%, transparent);
  background: color-mix(in oklab, var(--osubs-bad) 14%, transparent);
}
.osubs-btn--danger:hover {
  background: color-mix(in oklab, var(--osubs-bad) 22%, transparent);
  border-color: color-mix(in oklab, var(--osubs-bad) 58%, transparent);
}
.osubs-btn--sm { height: 28px; padding: 0 10px; font-size: 11px; }

.osubs-seg { display: inline-flex; border: 1px solid var(--osubs-edge); border-radius: 8px; overflow: hidden; flex: none; }
.osubs-seg .osubs-btn { border: 0; border-radius: 0; }
.osubs-seg .osubs-btn + .osubs-btn { box-shadow: inset 1px 0 0 0 var(--osubs-edge); }
.osubs-seg .osubs-btn:focus-visible { outline-offset: -2px; }

.osubs-card {
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px 18px 18px;
  border: 1px solid var(--osubs-line); border-radius: 14px;
}
.osubs-card-head {
  display: flex; justify-content: space-between; gap: 12px;
  align-items: center; flex-wrap: wrap;
}
.osubs-card-title {
  font-size: 15px; font-weight: 600; letter-spacing: -0.01em;
}
/* Pin the icon tabs to the top of the host settings scroller
   (options overflow-y auto). Bleed 24px to match that column's
   side padding so cards cannot peek in the gutter. */
.osubs-nav {
  position: sticky; top: 0; z-index: 6; flex: none;
  display: flex; justify-content: flex-start; align-items: flex-start; gap: 4px;
  margin: 0 -24px; padding: 0 24px 16px;
  background: var(--dsw-alias-bg-layer-2, Canvas);
}
.osubs-pane { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.osubs-tabs {
  display: grid; grid-template-columns: repeat(8, 36px); justify-content: space-between;
  gap: 4px; padding: 4px; flex: 1 1 auto;
  border: 1px solid var(--osubs-line); border-radius: 12px;
  background: var(--osubs-fill);
}
.osubs-tabs-util {
  display: grid; grid-template-columns: 36px; grid-auto-rows: 36px;
  gap: 4px; padding: 4px; flex: none;
  border: 1px solid var(--osubs-line); border-radius: 12px;
  background: var(--osubs-fill);
}
.osubs-tab {
  width: 36px; height: 36px; min-width: 36px; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 0; border-radius: 9px;
  background: transparent; color: inherit;
  cursor: pointer;
}
.osubs-tab--on { background: var(--osubs-fill-2); }
.osubs-tab:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-tab-icon { width: 18px; height: 18px; display: block; flex: none; }
.osubs-about { display: flex; flex-direction: column; gap: 12px; font-size: 13px; line-height: 1.45; }
.osubs-about .osubs-link,
.osubs-about .osubs-hint,
.osubs-about .osubs-note { font-size: inherit; font-family: inherit; }
.osubs-kv { display: grid; gap: 10px; }
.osubs-kv-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
  font-size: 13px; line-height: 1.45;
}
.osubs-kv-row > :first-child { color: var(--osubs-muted); flex: none; }
.osubs-kv-row > :last-child { text-align: right; }
.osubs-acct {
  display: flex; flex-direction: column; gap: 12px; width: 100%;
  padding: 14px 16px 16px;
  border: 1px solid var(--osubs-line); border-radius: 12px;
  background: transparent; color: inherit; font: inherit; text-align: left;
  cursor: pointer;
}
.osubs-acct--on { border-color: var(--osubs-edge); background: var(--osubs-fill); }
.osubs-acct-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; flex-wrap: wrap;
}
.osubs-acct-main { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1 1 180px; }
.osubs-acct-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.osubs-accts { display: flex; flex-direction: column; gap: 12px; }
.osubs-verify {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--osubs-warn) 42%, transparent);
  border-radius: 8px;
  background: color-mix(in oklab, var(--osubs-warn) 10%, transparent);
}
.osubs-hint.osubs-warn { color: var(--osubs-warn); }
.osubs-glm-logins { display: flex; flex-direction: column; gap: 8px; }
.osubs-glm-login {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 44px; padding: 10px 14px;
  border: 1px solid var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill-2); color: inherit;
  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.3;
  cursor: pointer; text-align: left; appearance: none; -webkit-appearance: none;
}
.osubs-glm-login:hover { background: color-mix(in oklab, currentColor 19%, transparent); }
.osubs-glm-login:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-glm-ghost {
  background: transparent; font-weight: 500; color: var(--osubs-muted);
}
.osubs-glm-ghost:hover { color: inherit; }
.osubs-logins { display: flex; flex-direction: column; gap: 8px; }
.osubs-login {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; min-height: 44px; padding: 10px 14px;
  border: 1px solid var(--osubs-edge); border-radius: 12px;
  background: var(--osubs-fill-2); color: inherit;
  font: inherit; font-size: 13px; font-weight: 600; line-height: 1.3;
  cursor: pointer; text-align: left; appearance: none; -webkit-appearance: none;
}
.osubs-login:hover { background: color-mix(in oklab, currentColor 19%, transparent); }
.osubs-login:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 2px; }
.osubs-login-ghost {
  background: transparent; font-weight: 500; color: var(--osubs-muted);
}
.osubs-login-ghost:hover { color: inherit; }
.osubs-fields { display: flex; flex-direction: column; gap: 8px; }
.osubs-textarea {
  flex: 1 1 240px; min-height: 72px; padding: 8px 12px;
  border: 1px solid var(--osubs-edge); border-radius: 8px;
  background: transparent; color: inherit; font: inherit; font-size: 12.5px;
  resize: vertical;
}
.osubs-textarea::placeholder { color: var(--osubs-faint); }
.osubs-textarea:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
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
  font-size: 10px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase;
  line-height: 1.4; white-space: nowrap;
}
.osubs-tag--plain { text-transform: none; letter-spacing: .02em; }

.osubs-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; overflow-wrap: anywhere; }
.osubs-hint {
  display: block; max-width: 100%;
  font-size: 12px; line-height: 1.55; color: var(--osubs-muted);
  overflow-wrap: anywhere; word-break: break-word; white-space: pre-wrap;
}
.osubs-hint.osubs-bad { max-height: 4.65em; overflow-x: hidden; overflow-y: auto; }
.osubs-note { font-size: 11px; color: var(--osubs-faint); white-space: pre-wrap; overflow-wrap: anywhere; }
.osubs-bad { color: var(--osubs-bad); overflow-wrap: anywhere; word-break: break-word; max-width: 100%; }
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

.osubs-quota { display: flex; flex-direction: column; gap: 12px; padding-top: 12px; border-top: 1px solid var(--osubs-hair); }
.osubs-quota-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.osubs-qrow { display: flex; flex-direction: column; gap: 5px; }
.osubs-qrow-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 12px; }
.osubs-qcluster { display: flex; flex-direction: column; gap: 8px; }
.osubs-qcluster + .osubs-qcluster {
  margin-top: 2px; padding-top: 10px;
  border-top: 1px solid var(--osubs-hair);
}
.osubs-qgroup {
  font-size: 12.5px; font-weight: 600; line-height: 1.35;
  color: var(--osubs-muted);
}
.osubs-qmeter { display: contents; }
.osubs-bar { height: 6px; border-radius: 99px; background: var(--osubs-hair); overflow: hidden; }
.osubs-bar > i { display: block; height: 100%; border-radius: 99px; transform-origin: left center; transition: transform 340ms cubic-bezier(.2,.8,.2,1), background-color 240ms ease; }
.osubs-qbox {
  display: flex; flex-direction: column; gap: 10px;
  margin-top: 2px; padding: 12px;
  border: 1px solid var(--osubs-line); border-radius: 10px;
  background: var(--osubs-fill);
}
.osubs-qbox-head { display: flex; flex-direction: column; gap: 4px; }
.osubs-reset-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
  min-height: 44px; padding: 8px 10px;
  border: 1px solid var(--osubs-line); border-radius: 8px;
  background: color-mix(in oklab, #fff 40%, transparent);
}
.osubs-reset-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.osubs-reset-when { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
.osubs-reset-rel { font-size: 11px; color: var(--osubs-muted); }

.osubs-dsw {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.osubs-dsw-mask {
  position: absolute; inset: 0;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, .24));
  backdrop-filter: var(--dsw-mask-blur, blur(2px));
}
.osubs-dsw-card {
  position: relative; z-index: 1;
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
.osubs-model:has(input:disabled) { cursor: default; }
.osubs-model:has(input:disabled):hover { background: transparent; }
.osubs-model:has(input:focus-visible) { outline: 2px solid var(--osubs-ring); outline-offset: -1px; }
.osubs-model input { flex: none; width: 14px; height: 14px; margin: 0; accent-color: currentColor; cursor: pointer; }
.osubs-model input:disabled { cursor: default; }
.osubs-model > span { flex: 1 1 auto; font-size: 12.5px; overflow-wrap: anywhere; }

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

    function formatQuotaError(raw, limit = 160) {
      const text = String(raw ?? '').replace(/\s+/g, ' ').trim()
      if (!text) return ''
      const http = text.match(/\bHTTP\s+(\d{3})\b/i)?.[1]
      const jsonAt = text.indexOf('{')
      let human = ''
      if (jsonAt >= 0) {
        const blob = text.slice(jsonAt)
        let parsed
        try { parsed = JSON.parse(blob) } catch { parsed = undefined }
        const err = parsed && typeof parsed === 'object' ? parsed.error : undefined
        if (err && typeof err === 'object') {
          if (typeof err.message === 'string' && err.message.trim()) human = err.message.trim()
          else if (typeof err.code === 'string' && err.code.trim()) human = err.code.trim()
        } else if (typeof err === 'string' && err.trim()) {
          human = err.trim()
        }
        if (!human && parsed && typeof parsed === 'object') {
          if (typeof parsed.message === 'string' && parsed.message.trim()) human = parsed.message.trim()
          else if (typeof parsed.code === 'string' && parsed.code.trim()) human = parsed.code.trim()
        }
        if (!human) {
          const named = blob.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/)
          const coded = blob.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)"/)
          const pick = named?.[1] || coded?.[1]
          if (pick) {
            try { human = JSON.parse(`"${pick}"`) } catch { human = pick }
          }
        }
      }
      if (!human) {
        human = (jsonAt >= 0 ? text.slice(0, jsonAt) : text).replace(/:\s*$/, '').trim()
      }
      if (http && human && !new RegExp(`\\bHTTP\\s+${http}\\b`, 'i').test(human)) {
        human = `${human} (HTTP ${http})`
      }
      if (human.length <= limit) return human
      return `${human.slice(0, limit).trimEnd()}…`
    }

    function remainingPercentOf(row) {
      if (typeof row?.remainingPercent === 'number' && Number.isFinite(row.remainingPercent)) {
        return Math.max(0, Math.min(100, row.remainingPercent))
      }
      if (typeof row?.usedPercent === 'number' && Number.isFinite(row.usedPercent)) {
        return Math.max(0, Math.min(100, 100 - row.usedPercent))
      }
      return undefined
    }

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

    // LobeHub mono SVG paths from @lobehub/icons-static-svg@1.94.0
    // https://unpkg.com/@lobehub/icons-static-svg@1.94.0/icons/{codex,grok,zai,kiro,antigravity,cursor,ollama,kimi,opencode,github}.svg
    const TAB_ICONS = {
      codex: { d: 'M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z', clip: true },
      grok: { d: 'M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815' },
      zai: { d: 'M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z' },
      kiro: { d: 'M4.594 6.677C6.67-2.226 18.746-2.211 21.16 6.632c.353 1.297 1.725 7.582-1.673 13.747-1.545 2.797-5.841 5.49-6.99 1.883C8.6 25.477 3.315 24.1 5.789 18.609l-.318.143c-3.57 1.305-3.863-1.208-3.173-2.513.45-.84.727-1.335.937-1.897.353-.975.458-1.568.593-2.498.27-1.837.277-3.607.765-5.167zm8.37.01a.92.92 0 00-.81.428c-.217.323-.33.825-.33 1.462 0 .705.15 1.89 1.14 1.89h.008c.757 0 1.214-.705 1.214-1.89 0-.622-.127-1.125-.367-1.455a1.014 1.014 0 00-.855-.435zm4.08 0a.92.92 0 00-.81.428c-.217.323-.33.825-.33 1.462 0 .705.15 1.89 1.14 1.89h.008c.757 0 1.215-.705 1.215-1.89 0-.622-.128-1.125-.368-1.455a1.014 1.014 0 00-.855-.435z' },
      antigravity: { d: 'M21.751 22.607c1.34 1.005 3.35.335 1.508-1.508C17.73 15.74 18.904 1 12.037 1 5.17 1 6.342 15.74.815 21.1c-2.01 2.009.167 2.511 1.507 1.506 5.192-3.517 4.857-9.714 9.715-9.714 4.857 0 4.522 6.197 9.714 9.715z', clip: true },
      cursor: { d: 'M22.106 5.68L12.5.135a.998.998 0 00-.998 0L1.893 5.68a.84.84 0 00-.419.726v11.186c0 .3.16.577.42.727l9.607 5.547a.999.999 0 00.998 0l9.608-5.547a.84.84 0 00.42-.727V6.407a.84.84 0 00-.42-.726zm-.603 1.176L12.228 22.92c-.063.108-.228.064-.228-.061V12.34a.59.59 0 00-.295-.51l-9.11-5.26c-.107-.062-.063-.228.062-.228h18.55c.264 0 .428.286.296.514z', clip: true },
      ollama: { d: 'M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z', clip: true },
      // LobeHub `Kimi` icon (`@lobehub/icons-static-svg` icons/kimi.svg)
      kimi: { d: 'M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z', clip: true },
      // LobeHub `OpenCode` icon (`@lobehub/icons-static-svg` icons/opencode.svg)
      opencode: { d: 'M16 6H8v12h8V6zm4 16H4V2h16v20z', clip: true },
      github: { d: 'M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z' },
      models: { d: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z' },
    }

    function TabIcon({ name }) {
      const icon = TAB_ICONS[name]
      return h('svg', {
        className: 'osubs-tab-icon',
        viewBox: '0 0 24 24',
        width: 18,
        height: 18,
        fill: 'currentColor',
        fillRule: 'evenodd',
        'aria-hidden': 'true',
      }, h('path', icon.clip ? { d: icon.d, clipRule: 'evenodd' } : { d: icon.d }))
    }

    function Tab({ id, label, current, onSelect, icon }) {
      return h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': current === id,
        'aria-label': label,
        title: label,
        className: `osubs-tab${current === id ? ' osubs-tab--on' : ''}`,
        onClick: () => onSelect(id),
      }, h(TabIcon, { name: icon }))
    }

    function antigravityGroupLabel(product, t) {
      const text = String(product ?? '')
      if (/claude|gpt/i.test(text)) return t.agClaudeGpt
      if (/gemini/i.test(text)) return t.agGemini
      return text
    }

    function rowLabel(row, t, family) {
      if (family === 'ollama') {
        if (row.kind === 'primary') return t.primary
        if (row.kind === 'weekly') return t.weekly
      }
      if (family === 'glm' || family === 'antigravity') {
        if (row.kind === 'primary') return t.glmPrimary
        if (row.kind === 'weekly') return t.glmWeekly
        if (family === 'glm' && (row.kind === 'mcp' || (row.kind === 'product' && /mcp|zread|web.?search/i.test(row.product ?? '')))) {
          return t.glmMcp
        }
      }
      if (row.kind === 'heading') return antigravityGroupLabel(row.product, t)
      if (family === 'cursor' && row.kind === 'product') {
        if (row.product === 'auto' || row.key === 'product:auto') return t.cursorComposer
        if (row.product === 'api' || row.key === 'product:api') return t.cursorApi
      }
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
      if (row.kind === 'mcp') return t.glmMcp
      return row.kind ?? t.quota
    }

    function RemainingBar({ remainingPercent, tone }) {
      const color = tone ? `var(--osubs-${tone})` : undefined
      return h('div', { className: 'osubs-bar' },
        h('i', {
          style: {
            background: color,
            transform: `scaleX(${Math.max(0, Math.min(100, remainingPercent)) / 100})`,
          },
        }),
      )
    }

    function QuotaMeter({ t, remainingPercent, amount, label }) {
      const tone = quotaTone(remainingPercent)
      const color = tone ? `var(--osubs-${tone})` : 'inherit'
      const caption = remainingPercent === undefined ? '' : fill(t.leftPercent, remainingPercent)
      return h('div', { className: 'osubs-qmeter' },
        h('div', { className: 'osubs-qrow-head' },
          h('span', { style: { color: 'var(--osubs-muted)' } }, label),
          h('span', { style: { color, fontWeight: 500 } },
            amount ? `${amount} · ` : '',
            caption,
          ),
        ),
        remainingPercent !== undefined && h(RemainingBar, { remainingPercent, tone }),
      )
    }

    function QuotaRow({ t, row, family }) {
      if (row.kind === 'heading') {
        return h('div', { className: 'osubs-qgroup' }, antigravityGroupLabel(row.product, t))
      }
      if (row.kind === 'prepaid') {
        return h('div', { className: 'osubs-qrow-head' },
          h('span', { style: { color: 'var(--osubs-muted)' } }, t.prepaid),
          h('span', { className: 'osubs-mono' }, formatAmount(row.remaining)),
        )
      }
      const remaining = remainingPercentOf(row)
      const amount = row.used !== undefined && row.total !== undefined
        ? `${formatAmount(row.used)} / ${formatAmount(row.total)}`
        : ''
      const reset = formatReset(row.resetAt, t)
      return h('div', { className: 'osubs-qrow' },
        h(QuotaMeter, {
          t,
          remainingPercent: remaining,
          amount,
          label: rowLabel(row, t, family),
        }),
        reset && h('span', { className: 'osubs-note' }, reset),
        row.note && h('span', { className: 'osubs-note' }, row.note),
      )
    }

    function resetCreditRows(quota) {
      const bank = quota?.resetCredits
      if (!bank) return []
      if (Array.isArray(bank.credits) && bank.credits.length > 0) return bank.credits
      const count = bank.availableCount ?? 0
      if (count <= 0) return []
      return Array.from({ length: count }, (_, index) => ({
        id: `available-${index + 1}`,
        expiresAt: bank.nextExpiresAt,
      }))
    }

    function IconWarning({ size = 18 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 14 14', fill: 'none',
        className: 'osubs-dsw-icon', 'aria-hidden': 'true',
      },
        h('path', { d: 'M6.3002 3.32843H7.69986V7.79657H6.3002V3.32843Z', fill: 'currentColor' }),
        h('path', { d: 'M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z', fill: 'currentColor' }),
        h('path', { d: 'M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z', fill: 'currentColor' }),
      )
    }

    function IconClose({ size = 14 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
      },
        h('path', { d: 'M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z', fill: 'currentColor' }),
        h('path', { d: 'M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z', fill: 'currentColor' }),
      )
    }

    function CenterDialog({ titleId, title, closeLabel, onClose, cardClass, bodyClass, children }) {
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onClose])
      return h('div', { className: 'osubs-dsw', role: 'presentation' },
        h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onClose }),
        h('div', {
          className: cardClass || 'osubs-dsw-card',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
        },
          h('div', { className: 'osubs-dsw-head' },
            h('h2', { id: titleId, className: 'osubs-dsw-title' }, title),
            h('button', {
              type: 'button',
              className: 'osubs-dsw-x',
              'aria-label': closeLabel,
              onClick: onClose,
            }, h(IconClose)),
          ),
          h('div', { className: bodyClass || 'osubs-dsw-body' }, children),
        ),
      )
    }

    function WarnDialog({ t, when, acknowledged, onAcknowledgedChange, onCancel, onConfirm }) {
      const description = fill(t.quotaResetConfirm, when)
      useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [onCancel])
      if (typeof HostRisk === 'function') {
        return h(HostRisk, {
          open: true,
          title: t.quotaResetWarnTitle,
          description,
          acknowledgeLabel: t.quotaResetAck,
          cancelLabel: t.cancel,
          closeLabel: t.quotaResetClose,
          confirmLabel: t.quotaResetConfirmOk,
          acknowledged,
          onAcknowledgedChange,
          onCancel,
          onConfirm,
        })
      }
      return h('div', { className: 'osubs-dsw', role: 'presentation' },
        h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onCancel }),
        h('div', {
          className: 'osubs-dsw-card',
          role: 'alertdialog',
          'aria-modal': 'true',
          'aria-labelledby': 'osubs-warn-title',
          'aria-describedby': 'osubs-warn-body',
        },
          h('div', { className: 'osubs-dsw-head' },
            h('h2', { id: 'osubs-warn-title', className: 'osubs-dsw-title' }, t.quotaResetWarnTitle),
            h('button', {
              type: 'button',
              className: 'osubs-dsw-x',
              'aria-label': t.quotaResetClose,
              onClick: onCancel,
            }, h(IconClose)),
          ),
          h('div', { className: 'osubs-dsw-body' },
            h('div', { className: 'osubs-dsw-warning' },
              h(IconWarning),
              h('p', { id: 'osubs-warn-body' }, description),
            ),
            h('label', { className: 'osubs-dsw-ack' },
              h('input', {
                type: 'checkbox',
                checked: acknowledged,
                autoFocus: true,
                onChange: (event) => onAcknowledgedChange(event.currentTarget.checked),
              }),
              h('span', null, t.quotaResetAck),
            ),
          ),
          h('div', { className: 'osubs-dsw-foot' },
            h('button', { type: 'button', className: 'osubs-dsw-btn osubs-dsw-btn--outline', onClick: onCancel }, t.cancel),
            h('button', {
              type: 'button',
              className: 'osubs-dsw-btn osubs-dsw-btn--primary',
              disabled: !acknowledged,
              onClick: onConfirm,
            }, t.quotaResetConfirmOk),
          ),
        ),
      )
    }

    function QuotaResetBox({ t, quota, onReset }) {
      const [busyId, setBusyId] = useState(null)
      const [pending, setPending] = useState(null)
      const [acked, setAcked] = useState(false)
      const credits = resetCreditRows(quota)
      if (typeof onReset !== 'function') return null
      const ask = (credit) => {
        if (busyId) return
        setAcked(false)
        setPending(credit)
      }
      const close = () => {
        setPending(null)
        setAcked(false)
      }
      const confirm = async () => {
        if (!pending || busyId || !acked) return
        const credit = pending
        const key = credit.id ?? 'reset'
        setPending(null)
        setAcked(false)
        setBusyId(key)
        try {
          await onReset(credit)
        } finally {
          setBusyId(null)
        }
      }
      const pendingWhen = pending
        ? (formatStamp(pending.expiresAt) || formatReset(pending.expiresAt, t, 'expires') || '—')
        : ''
      return h('div', { className: 'osubs-qbox' },
        h('div', { className: 'osubs-qbox-head' },
          h('span', { className: 'osubs-eyebrow' }, t.quotaResetBank),
          h('p', { className: 'osubs-hint' }, t.quotaResetHint),
        ),
        credits.length === 0
          ? h('p', { className: 'osubs-note' }, t.quotaResetEmpty)
          : credits.map((credit, index) => {
            const stamp = formatStamp(credit.expiresAt)
            const relative = formatReset(credit.expiresAt, t, 'expires')
            const key = credit.id ?? `credit-${index}`
            const busy = busyId !== null
            return h('div', { className: 'osubs-reset-row', key },
              h('div', { className: 'osubs-reset-meta' },
                h('span', { className: 'osubs-reset-when' },
                  stamp ? fill(t.quotaResetExpires, stamp) : t.quotaReset,
                ),
                relative && relative !== stamp && h('span', { className: 'osubs-reset-rel' }, relative),
              ),
              h(Button, {
                size: 'sm',
                disabled: busy,
                onClick: () => ask(credit),
                label: busyId === key ? t.quotaResetBusy : t.quotaReset,
              }),
            )
          }),
        pending && h(WarnDialog, {
          t,
          when: pendingWhen,
          acknowledged: acked,
          onAcknowledgedChange: setAcked,
          onCancel: close,
          onConfirm: confirm,
        }),
      )
    }

    function renderQuotaRows(rows, t, family) {
      const nodes = []
      let cluster
      const flush = () => {
        if (!cluster) return
        nodes.push(h('div', { className: 'osubs-qcluster', key: cluster.key },
          h('div', { className: 'osubs-qgroup' }, antigravityGroupLabel(cluster.title, t)),
          cluster.rows.map((row) => h(QuotaRow, { t, row, family, key: row.key })),
        ))
        cluster = undefined
      }
      for (const row of rows) {
        if (row.kind === 'heading') {
          flush()
          cluster = { key: row.key, title: row.product, rows: [] }
          continue
        }
        if (cluster && (row.kind === 'weekly' || row.kind === 'primary')) {
          cluster.rows.push(row)
          continue
        }
        flush()
        nodes.push(h(QuotaRow, { t, row, family, key: row.key }))
      }
      flush()
      return nodes
    }

    function QuotaBlock({ t, quota, onRefresh, onReset, family }) {
      if (!quota || quota.status === 'idle') return null
      const rows = Array.isArray(quota.rows) ? quota.rows : []
      const hasUsage = rows.some((row) => (
        typeof row.usedPercent === 'number'
        || typeof row.remainingPercent === 'number'
        || (row.kind === 'prepaid' && typeof row.remaining === 'number' && row.remaining > 0)
        || (row.used !== undefined && row.total !== undefined)
      ))
      return h('div', { className: 'osubs-quota' },
        h('div', { className: 'osubs-quota-head' },
          h('span', { className: 'osubs-eyebrow' }, t.quota),
          h('div', { className: 'osubs-actions' },
            h(Button, { size: 'sm', onClick: onRefresh, label: t.quotaRefresh }),
          ),
        ),
        family === 'glm' && h('p', { className: 'osubs-note' }, t.glmBoostHint),
        quota.status === 'loading' && rows.length === 0 && h('p', { className: 'osubs-hint' }, t.quotaLoading),
        quota.status === 'error' && !hasUsage && h('p', {
          className: 'osubs-hint osubs-bad',
          title: quota.error || undefined,
        }, `${t.quotaFailed}${quota.error ? ` · ${formatQuotaError(quota.error)}` : ''}`),
        quota.status === 'ready' && !hasUsage && family !== 'opencode' && h('p', { className: 'osubs-hint' }, t.quotaUnknown),
        renderQuotaRows(rows, t, family),
        h(QuotaResetBox, { t, quota, onReset }),
      )
    }

    function AccountCard({ t, id, row, quota, onSwitch, onLogout, onRefreshQuota, onResetQuota }) {
      const regionLabel = (region) => region === 'bigmodel' ? t.glmRegionCn : t.glmRegionGlobal
      const planLabel = planOf({ ...row, quota }, id)
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
              h('span', { className: 'osubs-mono' }, identityOf(row, id)),
              planLabel && h('span', { className: 'osubs-tag' }, planLabel),
              row.active && h('span', { className: 'osubs-tag' }, t.inUse),
              id === 'glm' && row.region && h('span', { className: 'osubs-tag' }, regionLabel(row.region)),
              id === 'kiro' && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel),
              (id === 'cursor' || id === 'ollama' || id === 'kimi') && row.methodLabel && h('span', { className: 'osubs-tag' }, row.methodLabel),
              id === 'glm' && h('span', { className: 'osubs-tag osubs-tag--plain' }, t.glmBoost),
            ),
          ),
          h('div', { className: 'osubs-actions', onClick: (event) => event.stopPropagation() },
            !row.active && h(Button, { size: 'sm', onClick: () => onSwitch(id, row.id), label: t.switchTo }),
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
            onRefresh: () => onRefreshQuota(id, row.id),
            onReset: id === 'codex' && onResetQuota ? () => onResetQuota(id, row.id) : undefined,
          }),
        ),
      )
    }

    function ProviderCard({ t, id, title, account, pending, onLogin, onImport, onLogout, onCancel, onManual, onSwitch, onRefreshQuota, onResetQuota, onUseKey }) {
      const [addOpen, setAddOpen] = useState(false)
      const [paste, setPaste] = useState('')
      const [apiKey, setApiKey] = useState('')
      const [keyRegion, setKeyRegion] = useState('zai')
      const [showKey, setShowKey] = useState(false)
      const [showIdc, setShowIdc] = useState(false)
      const [showEntra, setShowEntra] = useState(false)
      const [showRefresh, setShowRefresh] = useState(false)
      const [startUrl, setStartUrl] = useState('')
      const [entraEndpoint, setEntraEndpoint] = useState('')
      const [entraClient, setEntraClient] = useState('')
      const [entraScopes, setEntraScopes] = useState('')
      const [refreshToken, setRefreshToken] = useState('')
      const roster = Array.isArray(account?.accounts) ? account.accounts : []
      const loggedIn = Boolean(account?.loggedIn) || roster.length > 0
      const busy = Boolean(account?.busy)
      const status = busy ? t.busy : loggedIn ? t.loggedIn : t.loggedOut
      const closeAdd = () => setAddOpen(false)
      useEffect(() => {
        if (busy) setAddOpen(true)
      }, [busy])
      return h('section', { className: 'osubs-card' },
        h('header', { className: 'osubs-card-head' },
          h('h3', { className: 'osubs-card-title' }, title),
          h('span', {
            className: `osubs-status${loggedIn ? ' osubs-status--on' : busy ? ' osubs-status--busy' : ''}`,
          }, status),
        ),
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
        ),
        account?.detail && h('p', { className: 'osubs-hint osubs-bad' }, `${t.error}: ${account.detail}`),
        pending?.userCode && busy && h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { className: 'osubs-eyebrow' }, t.userCode),
          h('code', { style: { fontSize: 20, letterSpacing: '0.14em', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }, pending.userCode),
        ),
        pending?.authorizeUrl && busy && h('a', {
          className: 'osubs-link',
          href: pending.authorizeUrl,
          target: '_blank',
          rel: 'noreferrer',
        }, t.openUrl),
        h('div', { className: 'osubs-actions' },
          h(Button, {
            variant: 'primary',
            onClick: () => id === 'opencode' ? onLogin(id) : setAddOpen(true),
            label: busy ? t.continueAuth : id === 'opencode' ? t.opencodeEnable : loggedIn ? t.addAccount : t.login,
          }),
          busy && h(Button, { onClick: () => onCancel(id), label: t.cancel }),
        ),
        addOpen && h(CenterDialog, {
          titleId: `osubs-add-${id}`,
          title: t.addAccountTitle,
          closeLabel: t.dialogClose,
          onClose: closeAdd,
          cardClass: 'osubs-dsw-card osubs-dsw-card--add',
          bodyClass: 'osubs-dsw-body osubs-dsw-body--stack',
        },
        pending?.userCode && busy && h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { className: 'osubs-eyebrow' }, t.userCode),
          h('code', { style: { fontSize: 20, letterSpacing: '0.14em', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }, pending.userCode),
        ),
        pending?.authorizeUrl && busy && h('a', {
          className: 'osubs-link',
          href: pending.authorizeUrl,
          target: '_blank',
          rel: 'noreferrer',
        }, t.openUrl),
        busy && h(Button, { onClick: () => onCancel(id), label: t.cancel }),
        id !== 'glm' && id !== 'kiro' && id !== 'ollama' && id !== 'opencode' && !busy && h('div', { className: 'osubs-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => onLogin(id),
          },
            h('span', null, id === 'grok' || id === 'kimi' ? t.device : loggedIn ? t.addAccount : t.login),
          ),
          id === 'grok' && h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => onLogin(id, 'pkce'),
          },
            h('span', null, t.pkce),
          ),
          id === 'kimi' && h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => setShowKey((open) => !open),
          },
            h('span', null, t.kimiLoginApiKey),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            onClick: () => { onImport(id); closeAdd() },
          },
            h('span', null, id === 'cursor' ? t.cursorImport : id === 'kimi' ? t.kimiImport : t.import),
          ),
        ),
        id === 'kimi' && showKey && !busy && h('form', {
          className: 'osubs-fields',
          onSubmit: (event) => {
            event.preventDefault()
            onUseKey(id, apiKey)
            setApiKey('')
            setShowKey(false)
            closeAdd()
          },
        },
          h('input', {
            className: 'osubs-input',
            value: apiKey,
            onChange: (event) => setApiKey(event.target.value),
            placeholder: t.kimiKeyPlaceholder,
            'aria-label': t.kimiLoginApiKey,
            autoComplete: 'off',
          }),
          h('p', { className: 'osubs-hint' }, t.kimiKeyHint),
          h('div', { className: 'osubs-actions' },
            h(Button, { type: 'submit', variant: 'primary', label: t.kimiKeyGo }),
          ),
        ),
        id === 'ollama' && !busy && h('div', { className: 'osubs-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => setShowKey((open) => !open),
          },
            h('span', null, t.ollamaLoginApiKey),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            onClick: () => { onImport(id); closeAdd() },
          },
            h('span', null, t.ollamaImport),
          ),
        ),
        id === 'ollama' && showKey && !busy && h('form', {
          className: 'osubs-fields',
          onSubmit: (event) => {
            event.preventDefault()
            onUseKey(id, apiKey)
            setApiKey('')
            setShowKey(false)
            closeAdd()
          },
        },
          h('input', {
            className: 'osubs-input',
            value: apiKey,
            onChange: (event) => setApiKey(event.target.value),
            placeholder: t.ollamaKeyPlaceholder,
            'aria-label': t.ollamaLoginApiKey,
            autoComplete: 'off',
          }),
          h('p', { className: 'osubs-hint' }, t.ollamaKeyHint),
          h('div', { className: 'osubs-actions' },
            h(Button, { type: 'submit', variant: 'primary', label: t.ollamaKeyGo }),
          ),
        ),
        id === 'opencode' && !busy && h('div', { className: 'osubs-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => { onLogin(id); closeAdd() },
          },
            h('span', null, t.opencodeEnable),
          ),
        ),
        id === 'opencode' && !busy && h('p', { className: 'osubs-hint' }, t.opencodeEnableHint),
        id === 'glm' && !busy && h('div', { className: 'osubs-glm-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-glm-login',
            onClick: () => onLogin(id, 'zai'),
          },
            h('span', null, loggedIn ? t.glmAddZai : t.glmLoginZai),
            h('span', { className: 'osubs-tag' }, t.glmRegionGlobal),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-glm-login',
            onClick: () => onLogin(id, 'bigmodel'),
          },
            h('span', null, loggedIn ? t.glmAddBigmodel : t.glmLoginBigmodel),
            h('span', { className: 'osubs-tag' }, t.glmRegionCn),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-glm-login osubs-glm-ghost',
            onClick: () => setShowKey((open) => !open),
          },
            h('span', null, t.glmLoginApiKey),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-glm-login osubs-glm-ghost',
            onClick: () => { onImport(id); closeAdd() },
          },
            h('span', null, t.import),
          ),
        ),
        id === 'glm' && showKey && !busy && h('form', {
          onSubmit: (event) => {
            event.preventDefault()
            onUseKey(id, apiKey, keyRegion)
            setApiKey('')
            setShowKey(false)
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
            'aria-label': t.glmKeyLabel,
            autoComplete: 'off',
          }),
          h('p', { className: 'osubs-hint' }, t.glmKeyHint),
          h('div', { className: 'osubs-actions' },
            h(Button, { type: 'submit', variant: 'primary', label: t.glmKeyGo }),
          ),
        ),
        id === 'kiro' && !busy && h('div', { className: 'osubs-logins' },
          h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => onLogin(id, 'social'),
          },
            h('span', null, loggedIn ? t.kiroAddSocial : t.kiroLoginSocial),
            h('span', { className: 'osubs-tag' }, 'Social'),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => onLogin(id, 'builder'),
          },
            h('span', null, loggedIn ? t.kiroAddBuilder : t.kiroLoginBuilder),
            h('span', { className: 'osubs-tag' }, 'Builder'),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login',
            onClick: () => setShowIdc((open) => !open),
          },
            h('span', null, loggedIn ? t.kiroAddIdc : t.kiroLoginIdc),
            h('span', { className: 'osubs-tag' }, 'IdC'),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            onClick: () => setShowEntra((open) => !open),
          },
            h('span', null, t.kiroLoginEntra),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            onClick: () => setShowKey((open) => !open),
          },
            h('span', null, t.kiroLoginApiKey),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            onClick: () => setShowRefresh((open) => !open),
          },
            h('span', null, t.kiroLoginRefresh),
          ),
          h('button', {
            type: 'button',
            className: 'osubs-login osubs-login-ghost',
            onClick: () => { onImport(id); closeAdd() },
          },
            h('span', null, t.import),
          ),
        ),
        id === 'kiro' && showIdc && !busy && h('form', {
          className: 'osubs-fields',
          onSubmit: (event) => {
            event.preventDefault()
            onLogin(id, 'idc', { startUrl })
          },
        },
          h('input', {
            className: 'osubs-input',
            value: startUrl,
            onChange: (event) => setStartUrl(event.target.value),
            placeholder: t.kiroStartUrlPlaceholder,
            'aria-label': t.kiroStartUrl,
            autoComplete: 'off',
          }),
          h('p', { className: 'osubs-hint' }, t.kiroStartUrlHint),
          h('div', { className: 'osubs-actions' },
            h(Button, { type: 'submit', variant: 'primary', label: t.kiroStartUrlGo }),
          ),
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
            setShowEntra(false)
            closeAdd()
          },
        },
          h('input', {
            className: 'osubs-input',
            value: entraEndpoint,
            onChange: (event) => setEntraEndpoint(event.target.value),
            placeholder: t.kiroEntraEndpointPlaceholder,
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
            h(Button, { type: 'submit', variant: 'primary', label: t.kiroEntraGo }),
          ),
        ),
        id === 'kiro' && showKey && !busy && h('form', {
          className: 'osubs-fields',
          onSubmit: (event) => {
            event.preventDefault()
            onUseKey(id, apiKey, { mode: 'api_key' })
            setApiKey('')
            setShowKey(false)
            closeAdd()
          },
        },
          h('input', {
            className: 'osubs-input',
            value: apiKey,
            onChange: (event) => setApiKey(event.target.value),
            placeholder: t.kiroKeyPlaceholder,
            'aria-label': t.kiroLoginApiKey,
            autoComplete: 'off',
          }),
          h('p', { className: 'osubs-hint' }, t.kiroKeyHint),
          h('div', { className: 'osubs-actions' },
            h(Button, { type: 'submit', variant: 'primary', label: t.kiroKeyGo }),
          ),
        ),
        id === 'kiro' && showRefresh && !busy && h('form', {
          className: 'osubs-fields',
          onSubmit: (event) => {
            event.preventDefault()
            onUseKey(id, refreshToken, { mode: 'social' })
            setRefreshToken('')
            setShowRefresh(false)
            closeAdd()
          },
        },
          h('textarea', {
            className: 'osubs-textarea',
            value: refreshToken,
            onChange: (event) => setRefreshToken(event.target.value),
            placeholder: t.kiroRefreshPlaceholder,
            'aria-label': t.kiroLoginRefresh,
          }),
          h('p', { className: 'osubs-hint' }, t.kiroRefreshHint),
          h('div', { className: 'osubs-actions' },
            h(Button, { type: 'submit', variant: 'primary', label: t.kiroRefreshGo }),
          ),
        ),
        busy && (pending?.mode === 'pkce' || pending?.mode === 'oauth') && h('form', {
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
            placeholder: id === 'antigravity' ? t.antigravityPastePlaceholder : t.pastePlaceholder,
            'aria-label': t.paste,
          }),
          h(Button, { type: 'submit', variant: 'primary', label: t.submitPaste }),
        ),
        ),
      )
    }

    function ModelRow({ t, model, onToggle, locked }) {
      return h('label', { className: 'osubs-model' },
        h('input', {
          type: 'checkbox',
          checked: Boolean(model.enabled),
          disabled: Boolean(locked),
          onChange: () => { if (!locked) onToggle(model.key, !model.enabled) },
        }),
        h('span', null, model.name),
        model.large && h('span', { className: 'osubs-tag' }, t.largeTag),
        model.fast && h('span', { className: 'osubs-tag' }, t.fastTag),
      )
    }

    function ModelFamily({ t, group, onToggle, onFamily }) {
      const models = Array.isArray(group.models) ? group.models : []
      const enabledCount = models.filter((model) => model.enabled).length
      const locked = !group.loggedIn
      return h('div', { className: 'osubs-family', style: { opacity: locked ? 0.72 : 1 } },
        h('div', { className: 'osubs-family-head' },
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
            h('h4', { style: { fontSize: 13, fontWeight: 600 } }, group.displayName),
            h('span', { className: 'osubs-note' }, fill(t.modelsOn, `${enabledCount} / ${models.length}`)),
            locked && h('span', { className: 'osubs-note' }, `· ${t.modelsNeedLogin}`),
          ),
          h('div', { className: 'osubs-seg' },
            h(Button, { size: 'sm', disabled: locked, onClick: () => onFamily(group.family, true), label: t.modelsAll }),
            h(Button, { size: 'sm', disabled: locked, onClick: () => onFamily(group.family, false), label: t.modelsNone }),
          ),
        ),
        h('div', { className: 'osubs-models' },
          models.map((model) => h(ModelRow, { t, model, onToggle, locked, key: model.key })),
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

    function platformLabel(t, id) {
      if (id === 'win') return t.platformWin
      if (id === 'mac') return t.platformMac
      return t.platformLinux
    }

    function statusLabel(t, update) {
      if (!update) return ''
      if (update.status === 'update') return fill(t.updateReady, update.latest?.tag || update.latest?.name || '')
      if (update.status === 'current') return t.updateCurrent
      if (update.status === 'ahead') return t.updateAhead
      if (update.status === 'unknown') return t.updateUnknown
      if (update.status === 'error') return `${t.updateError}${update.error ? ` · ${update.error}` : ''}`
      return ''
    }

    function applyLabel(t, update) {
      const apply = update?.apply
      if (!apply || apply.status === 'none') return ''
      if (apply.status === 'installed') return t.updateInstalled
      if (apply.status === 'missing-dsh') return t.updateMissingDsh
      if (apply.status === 'timeout') return t.updateTimeout
      if (apply.status === 'unchanged') return fill(t.updateUnchanged, apply.error || '')
      if (apply.status === 'failed') return fill(t.updateFailed, apply.error || '')
      return ''
    }

    function parseAboutVersion(tag) {
      const match = String(tag ?? '').trim().match(/(\d+)\.(\d+)\.(\d+)/)
      if (!match) return
      return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), raw: `${match[1]}.${match[2]}.${match[3]}` }
    }

    function fresherAboutVersion(left, right) {
      const a = parseAboutVersion(left)
      const b = parseAboutVersion(right)
      if (a && b) {
        if (a.major !== b.major) return a.major > b.major ? a.raw : b.raw
        if (a.minor !== b.minor) return a.minor > b.minor ? a.raw : b.raw
        return a.patch >= b.patch ? a.raw : b.raw
      }
      if (a) return a.raw
      if (b) return b.raw
      return left || right || ''
    }

    function AboutPanel({ t, local, update, busy, applying, onCheck }) {
      const repo = local?.repo || update?.repo || 'https://github.com/xxww0098/dsh-plugin-oauth-subs'
      const slug = local?.repoSlug || update?.repoSlug || 'xxww0098/dsh-plugin-oauth-subs'
      const version = fresherAboutVersion(update?.version, local?.version) || '—'
      const host = local?.platform || update?.platform
      const latest = update?.latest
      const apply = applyLabel(t, update)
      const applyTone = update?.apply?.status === 'installed' ? '' : 'osubs-bad'
      const stale = update?.staleProcess || local?.staleProcess
      const disk = update?.disk || local?.disk
      const loaded = update?.runningPath || local?.runningPath
      const tone = update?.status === 'update' ? 'osubs-warn' : update?.status === 'error' ? 'osubs-bad' : ''
      const shortPath = (path) => {
        const s = String(path || '').replace(/\\/g, '/')
        return s.length > 72 ? `…${s.slice(-70)}` : s
      }
      return h('section', { className: 'osubs-card' },
        h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } },
          h('h3', { style: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }, t.aboutTitle),
          h(Button, { size: 'sm', onClick: onCheck, disabled: busy, label: busy ? (applying ? t.updateInstalling : t.checking) : t.checkUpdate }),
        ),
        h('div', { className: 'osubs-about' },
          h('div', { className: 'osubs-kv' },
            h('div', { className: 'osubs-kv-row' },
              h('span', null, t.repo),
              h('a', { className: 'osubs-link', href: repo, target: '_blank', rel: 'noreferrer' }, slug),
            ),
            h('div', { className: 'osubs-kv-row' },
              h('span', null, t.installed),
              h('span', null, version),
            ),
            disk && disk !== version && h('div', { className: 'osubs-kv-row' },
              h('span', null, t.onDisk),
              h('span', null, disk),
            ),
            stale && loaded && h('div', { className: 'osubs-kv-row' },
              h('span', null, t.loadedFrom),
              h('span', { className: 'osubs-note', title: loaded }, shortPath(loaded)),
            ),
            h('div', { className: 'osubs-kv-row' },
              h('span', null, t.os),
              h('span', null, platformLabel(t, host)),
            ),
            latest?.tag && h('div', { className: 'osubs-kv-row' },
              h('span', null, t.latest),
              h('span', null, latest.tag),
            ),
            latest?.publishedAt && h('p', { className: 'osubs-note' }, fill(t.published, latest.publishedAt)),
            update?.status && h('p', { className: `osubs-hint${tone ? ` ${tone}` : ''}` }, statusLabel(t, update)),
            stale && disk && h('p', { className: 'osubs-hint osubs-warn' }, fill(t.updateStaleProcess, disk)),
            apply && h('p', { className: `osubs-hint${applyTone ? ` ${applyTone}` : ''}` }, apply),
          ),
        ),
      )
    }

    function SettingsSection({ rpc, close: _close }) {
      const t = COPY[localeOf()]
      const [snap, setSnap] = useState(null)
      const [pending, setPending] = useState({})
      const [error, setError] = useState('')
      const [tab, setTab] = useState('codex')
      const [update, setUpdate] = useState(null)
      const [updateBusy, setUpdateBusy] = useState(false)
      const [applying, setApplying] = useState(false)

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
          await refresh()
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : String(caught)
          setError(message === 'cursor-import-empty' ? t.cursorImportEmpty : message === 'ollama-import-empty' ? t.ollamaImportEmpty : message === 'kimi-import-empty' ? t.kimiImportEmpty : message)
        }
      }

      const checkUpdate = async (apply = false) => {
        setUpdateBusy(true)
        if (apply) setApplying(true)
        try {
          await run('update', { apply })
        } finally {
          setUpdateBusy(false)
          setApplying(false)
        }
      }

      useEffect(() => {
        if (tab === 'about' && update === null && !updateBusy) void checkUpdate(false)
      }, [tab])

      if (rpc === undefined) {
        return h('p', { className: 'osubs-hint' }, t.noRpc)
      }

      const card = (id, title) => h(ProviderCard, {
        t,
        id,
        title,
        account: snap?.accounts?.[id],
        pending: pending[id],
        onLogin: (provider, mode, extra) => run('login', { provider, mode, ...extra }),
        onImport: (provider) => run('import', { provider }),
        onLogout: (provider, accountId) => run('logout', { provider, id: accountId }),
        onCancel: (provider) => run('cancel', { provider }),
        onManual: (provider, input) => run('manual', { provider, input }),
        onSwitch: (provider, accountId) => run('switch', { provider, id: accountId }),
        onRefreshQuota: (provider, accountId) => run('quota', { provider, id: accountId }),
        onResetQuota: id === 'codex' ? (provider, accountId) => run('reset', { provider, id: accountId }) : undefined,
        onUseKey: (provider, key, extra) => run('key', { provider, key, ...(typeof extra === 'string' ? { region: extra } : extra || {}) }),
      })

      return h('div', { className: 'osubs' },
        h('div', { className: 'osubs-nav', role: 'tablist' },
          h('div', { className: 'osubs-tabs' },
            h(Tab, { id: 'codex', label: t.codexTitle, current: tab, onSelect: setTab, icon: 'codex' }),
            h(Tab, { id: 'grok', label: t.grokTitle, current: tab, onSelect: setTab, icon: 'grok' }),
            h(Tab, { id: 'glm', label: t.glmTitle, current: tab, onSelect: setTab, icon: 'zai' }),
            h(Tab, { id: 'kiro', label: t.kiroTitle, current: tab, onSelect: setTab, icon: 'kiro' }),
            h(Tab, { id: 'antigravity', label: t.antigravityTitle, current: tab, onSelect: setTab, icon: 'antigravity' }),
            h(Tab, { id: 'cursor', label: t.cursorTitle, current: tab, onSelect: setTab, icon: 'cursor' }),
            h(Tab, { id: 'ollama', label: t.ollamaTitle, current: tab, onSelect: setTab, icon: 'ollama' }),
            h(Tab, { id: 'kimi', label: t.kimiTitle, current: tab, onSelect: setTab, icon: 'kimi' }),
            h(Tab, { id: 'opencode', label: t.opencodeTitle, current: tab, onSelect: setTab, icon: 'opencode' }),
          ),
          h('div', { className: 'osubs-tabs-util' },
            h(Tab, { id: 'models', label: t.modelsTitle, current: tab, onSelect: setTab, icon: 'models' }),
            h(Tab, { id: 'about', label: t.aboutTitle, current: tab, onSelect: setTab, icon: 'github' }),
          ),
        ),
        h('div', { className: 'osubs-pane' },
          error && h('p', { className: 'osubs-hint osubs-bad' }, error),
          tab === 'codex' && card('codex', t.codexTitle),
          tab === 'grok' && card('grok', t.grokTitle),
          tab === 'glm' && card('glm', t.glmTitle),
          tab === 'kiro' && card('kiro', t.kiroTitle),
          tab === 'antigravity' && card('antigravity', t.antigravityTitle),
          tab === 'cursor' && card('cursor', t.cursorTitle),
          tab === 'ollama' && card('ollama', t.ollamaTitle),
          tab === 'kimi' && card('kimi', t.kimiTitle),
          tab === 'opencode' && card('opencode', t.opencodeTitle),
          tab === 'models' && h(ModelPicker, {
            t,
            catalog: snap?.catalog,
            onToggle: (key, on) => run('models', { key, on }),
            onFamily: (family, on) => run('models', { family, on }),
          }),
          tab === 'about' && h(AboutPanel, {
            t,
            local: snap?.update,
            update,
            busy: updateBusy,
            applying,
            onCheck: () => checkUpdate(true),
          }),
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
