/**
 * Browser half. Registers the "OAuth 订阅" settings section.
 *
 * DSH client-modules serves the compiled classic script and requires the
 * `__ModuleLoader__.load` handoff (id = package name). Shared requires are
 * only `react` plus the shell table; everything else stays inlined.
 */
window.__ModuleLoader__.load({
    id: 'dsh-plugin-oauth-subs',
    factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;
        const { createElement: h, useCallback, useEffect, useState } = require('react');
        function tryHost(id) {
            try {
                return require(id);
            }
            catch {
                return undefined;
            }
        }
        const primitives = tryHost('@deepseek-ai/dsh-client-ui-primitives');
        const HostRisk = primitives && (primitives.RiskConfirmation || primitives.default && primitives.default.RiskConfirmation);
        const name = 'dsh-plugin-oauth-subs-client';
        const inject = ['slots', 'connection'];
        const COPY = {
            zh: {
                nav: 'OAuth 订阅',
                codexTitle: 'ChatGPT Codex',
                grokTitle: 'xAI Grok',
                glmTitle: '智谱 GLM',
                login: '登录',
                addAccount: '添加账号',
                glmLoginZai: '连接 Z.ai 继续使用',
                glmLoginBigmodel: '连接 BigModel 继续使用',
                glmAddZai: '添加 Z.ai 账号',
                glmAddBigmodel: '添加 BigModel 账号',
                glmLoginApiKey: '使用 API key',
                glmRegionGlobal: '全球',
                glmRegionCn: '中国',
                glmKeyLabel: 'API key',
                glmKeyPlaceholder: 'id.secret 或 Coding Plan 密钥',
                glmKeyGo: '保存密钥',
                glmKeyHint: '贴 Z.ai 或 BigModel 的 Coding Plan 密钥。对话走对应站点的 /api/coding/paas/v4。',
                glmPickRegion: '站点',
                switchTo: '切换',
                inUse: '使用中',
                noAccounts: '还没有登录账号',
                accountsHint: '可登录多个账号。点一行切换；当前账号用于对话和额度。',
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
                quotaUnknown: '周额度未返回。点刷新重试。',
                quotaReset: '重置',
                quotaResetBank: '重置券',
                quotaResetHint: '每张券过期时间不同，按钮按券单独渲染。点一次消耗一张，刷新周额度窗口。',
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
                modelsHint: '勾选即同步。Fast 更快更耗额度；900K 大上下文，默认关。',
                modelsOn: '已开启 {n}',
                modelsAll: '全选',
                modelsNone: '全关',
                modelsNeedLogin: '登录后同步',
                fastTag: 'Fast',
                largeTag: '900K',
                inputTextTag: '文本',
                inputImageTag: '图文',
                aboutTitle: '关于',
                repo: '仓库',
                repoOpen: '打开仓库',
                installed: '当前版本',
                latest: '最新版本',
                os: '系统',
                checkUpdate: '检查更新',
                checking: '正在检查…',
                updateReady: '有新版本 {n}',
                updateCurrent: '已是最新',
                updateAhead: '本地版本领先发布',
                updateUnknown: 'GitHub 没有可用的版本号',
                updateError: '检查失败',
                download: '下载',
                platformWin: 'Windows',
                platformMac: 'macOS',
                platformLinux: 'Linux',
                thisOs: '本机',
                platformAny: '通用包',
                published: '发布于 {n}',
                releasePage: '打开发布页',
            },
            en: {
                nav: 'OAuth subs',
                codexTitle: 'ChatGPT Codex',
                grokTitle: 'xAI Grok',
                glmTitle: 'Zhipu GLM',
                login: 'Sign in',
                addAccount: 'Add account',
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
                glmKeyHint: 'Paste a Z.ai or BigModel Coding Plan key. Chat uses that site’s /api/coding/paas/v4.',
                glmPickRegion: 'Site',
                switchTo: 'Switch',
                inUse: 'In use',
                noAccounts: 'No accounts yet',
                accountsHint: 'Sign in more than once. Click a row to switch. The active account is used for chat and quota.',
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
                quotaUnknown: 'Weekly usage was not in the xAI payload. Refresh to retry.',
                quotaReset: 'Reset',
                quotaResetBank: 'Reset credits',
                quotaResetHint: 'Each credit expires on its own clock. One button per credit; spending one refreshes the weekly window.',
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
                modelsHint: 'Check to sync. Fast is faster and spends more. 900K is the large window, off by default.',
                modelsOn: '{n} on',
                modelsAll: 'All on',
                modelsNone: 'All off',
                modelsNeedLogin: 'Syncs after sign-in',
                fastTag: 'Fast',
                largeTag: '900K',
                inputTextTag: 'Text',
                inputImageTag: 'Image',
                aboutTitle: 'About',
                repo: 'Repository',
                repoOpen: 'Open repo',
                installed: 'Installed',
                latest: 'Latest',
                os: 'OS',
                checkUpdate: 'Check for updates',
                checking: 'Checking…',
                updateReady: 'Update available {n}',
                updateCurrent: 'Up to date',
                updateAhead: 'Local version is ahead of the latest release',
                updateUnknown: 'GitHub did not return a version',
                updateError: 'Update check failed',
                download: 'Download',
                platformWin: 'Windows',
                platformMac: 'macOS',
                platformLinux: 'Linux',
                thisOs: 'This machine',
                platformAny: 'Universal',
                published: 'Published {n}',
                releasePage: 'Open release',
            },
        };
        function localeOf() {
            const lang = typeof navigator !== 'undefined' ? navigator.language : 'zh';
            return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        }
        function callRpc(rpc, method, payload) {
            if (rpc && typeof rpc.call === 'function') {
                return Promise.resolve(rpc.call('/oauth-subs-auth', method, payload ?? {})).then((result) => {
                    if (result && typeof result === 'object' && 'ok' in result) {
                        if (result.ok)
                            return result.value;
                        throw new Error(result.error?.message ?? 'rpc');
                    }
                    return result;
                });
            }
            if (rpc && typeof rpc.request === 'function') {
                return rpc.request(`/oauth-subs-auth/${method}`, payload);
            }
            const nested = rpc?.['/oauth-subs-auth'] ?? rpc?.oauthSubs;
            if (nested && typeof nested[method] === 'function')
                return nested[method](payload);
            throw new Error('rpc');
        }
        function fill(template, n) {
            return String(template).replace('{n}', String(n));
        }
        function formatReset(resetAt, t, kind = 'reset') {
            if (typeof resetAt !== 'number' || resetAt <= 0)
                return '';
            const delta = resetAt - Date.now();
            const labels = kind === 'expires'
                ? { minutes: t.expiresMinutes, hours: t.expiresHours, days: t.expiresDays, soon: t.expiresSoon }
                : { minutes: t.resetMinutes, hours: t.resetHours, days: t.resetDays, soon: t.resetSoon };
            if (delta <= 0)
                return labels.soon;
            const minutes = Math.max(1, Math.round(delta / 60_000));
            if (minutes < 60)
                return fill(labels.minutes, minutes);
            const hours = Math.round(minutes / 60);
            if (hours < 48)
                return fill(labels.hours, hours);
            const days = Math.round(hours / 24);
            if (days < 14)
                return fill(labels.days, days);
            return formatStamp(resetAt);
        }
        function formatStamp(resetAt) {
            if (typeof resetAt !== 'number' || resetAt <= 0)
                return '';
            try {
                return new Date(resetAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });
            }
            catch {
                return '';
            }
        }
        function formatAmount(value) {
            if (typeof value !== 'number' || !Number.isFinite(value))
                return '';
            if (Number.isInteger(value))
                return String(value);
            return String(Math.round(value * 10) / 10);
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
        };
        function formatPlanLabel(raw) {
            if (raw === undefined || raw === null || raw === '')
                return '';
            if (typeof raw === 'number' && Number.isInteger(raw))
                return PLAN_LABELS[raw] ?? String(raw);
            const trimmed = String(raw).trim();
            if (!trimmed)
                return '';
            const slug = trimmed.toLowerCase().replace(/\+/g, 'plus').replace(/[_\-\s]+/g, '_').replace(/^_|_$/g, '');
            const compact = slug.replace(/_/g, '');
            return PLAN_LABELS[slug] || PLAN_LABELS[compact] || trimmed;
        }
        function planOf(account) {
            return account?.quota?.planLabel
                || account?.planLabel
                || formatPlanLabel(account?.quota?.planType || account?.planType);
        }
        const STYLE_ID = 'dsh-oauth-subs-style';
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
  display: flex; flex-direction: column; gap: 14px;
  padding: 16px 18px 18px;
  border: 1px solid var(--osubs-line); border-radius: 14px;
}
.osubs-tabs {
  display: flex; gap: 4px; padding: 4px;
  border: 1px solid var(--osubs-line); border-radius: 12px;
  background: var(--osubs-fill);
}
.osubs-tab {
  flex: 1 1 0; height: 36px; padding: 0 12px;
  border: 0; border-radius: 9px;
  background: transparent; color: inherit;
  font: inherit; font-size: 12px; font-weight: 500; line-height: 1;
  cursor: pointer;
}
.osubs-tab--on { background: var(--osubs-fill-2); font-weight: 600; }
.osubs-tab:focus-visible { outline: 2px solid var(--osubs-ring); outline-offset: 1px; }
.osubs-about { display: flex; flex-direction: column; gap: 12px; }
.osubs-kv { display: grid; gap: 8px; }
.osubs-kv-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
.osubs-dl {
  display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--osubs-line); border-radius: 10px;
}
.osubs-dl--on { border-color: var(--osubs-edge); background: var(--osubs-fill); }
.osubs-acct {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; flex-wrap: wrap; width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--osubs-line); border-radius: 10px;
  background: transparent; color: inherit; font: inherit; text-align: left;
  cursor: pointer;
}
.osubs-acct--on { border-color: var(--osubs-edge); background: var(--osubs-fill); }
.osubs-acct-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.osubs-acct-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
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
.osubs-dsw-body { display: flex; flex-direction: column; padding: 0 24px; }
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
.osubs-model:has(input:focus-visible) { outline: 2px solid var(--osubs-ring); outline-offset: -1px; }
.osubs-model input { flex: none; width: 14px; height: 14px; margin: 0; accent-color: currentColor; cursor: pointer; }
.osubs-model > span { flex: 1 1 auto; font-size: 12.5px; overflow-wrap: anywhere; }

@keyframes osubs-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .3 } }
@media (prefers-reduced-motion: reduce) { .osubs *, .osubs *::before { animation: none !important; transition: none !important; } }
`;
        function ensureStyles() {
            if (typeof document === 'undefined' || document.getElementById(STYLE_ID))
                return;
            const el = document.createElement('style');
            el.id = STYLE_ID;
            el.textContent = CSS;
            document.head.appendChild(el);
        }
        ensureStyles();
        function quotaTone(remaining) {
            if (typeof remaining !== 'number' || !Number.isFinite(remaining))
                return null;
            if (remaining <= 15)
                return 'bad';
            if (remaining <= 40)
                return 'warn';
            return 'ok';
        }
        function Button({ label, onClick, variant, size, type = 'button', disabled }) {
            const classes = ['osubs-btn'];
            if (variant)
                classes.push(`osubs-btn--${variant}`);
            if (size)
                classes.push(`osubs-btn--${size}`);
            return h('button', { type, onClick, disabled, className: classes.join(' ') }, label);
        }
        function PlanBadge({ t, label }) {
            if (!label)
                return null;
            return h('span', { className: 'osubs-badge' }, h('i', null, t.plan), label);
        }
        function rowLabel(row, t) {
            if (row.kind === 'product' && row.product)
                return row.product;
            if (row.kind === 'primary') {
                const minutes = row.windowMinutes;
                if (typeof minutes === 'number' && minutes > 0 && (minutes < 240 || minutes > 360)) {
                    if (minutes % 60 === 0)
                        return `${minutes / 60}h`;
                    return `${minutes}m`;
                }
                return t.primary;
            }
            if (row.kind === 'weekly')
                return t.weekly;
            if (row.kind === 'cycle')
                return t.cycle;
            if (row.kind === 'prepaid')
                return t.prepaid;
            return row.kind ?? t.quota;
        }
        function QuotaRow({ t, row }) {
            if (row.kind === 'prepaid') {
                return h('div', { className: 'osubs-qrow-head' }, h('span', { style: { color: 'var(--osubs-muted)' } }, t.prepaid), h('span', { className: 'osubs-mono' }, formatAmount(row.remaining)));
            }
            const remaining = typeof row.remainingPercent === 'number' ? row.remainingPercent : undefined;
            const tone = quotaTone(remaining);
            const color = tone ? `var(--osubs-${tone})` : 'inherit';
            const amount = row.used !== undefined && row.total !== undefined
                ? `${formatAmount(row.used)} / ${formatAmount(row.total)}`
                : '';
            const reset = formatReset(row.resetAt, t);
            return h('div', { className: 'osubs-qrow' }, h('div', { className: 'osubs-qrow-head' }, h('span', { style: { color: 'var(--osubs-muted)' } }, rowLabel(row, t)), h('span', { style: { color, fontWeight: 500 } }, amount ? `${amount} · ` : '', remaining === undefined ? '' : fill(t.leftPercent, remaining))), remaining !== undefined && h('div', { className: 'osubs-bar' }, h('i', {
                style: {
                    background: color,
                    transform: `scaleX(${Math.max(0, Math.min(100, remaining)) / 100})`,
                },
            })), reset && h('span', { className: 'osubs-note' }, reset));
        }
        function resetCreditRows(quota) {
            const bank = quota?.resetCredits;
            if (!bank)
                return [];
            if (Array.isArray(bank.credits) && bank.credits.length > 0)
                return bank.credits;
            const count = bank.availableCount ?? 0;
            if (count <= 0)
                return [];
            return Array.from({ length: count }, (_, index) => ({
                id: `available-${index + 1}`,
                expiresAt: bank.nextExpiresAt,
            }));
        }
        function IconWarning({ size = 18 }) {
            return h('svg', {
                width: size, height: size, viewBox: '0 0 14 14', fill: 'none',
                className: 'osubs-dsw-icon', 'aria-hidden': 'true',
            }, h('path', { d: 'M6.3002 3.32843H7.69986V7.79657H6.3002V3.32843Z', fill: 'currentColor' }), h('path', { d: 'M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z', fill: 'currentColor' }), h('path', { d: 'M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z', fill: 'currentColor' }));
        }
        function IconClose({ size = 14 }) {
            return h('svg', {
                width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
            }, h('path', { d: 'M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z', fill: 'currentColor' }), h('path', { d: 'M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z', fill: 'currentColor' }));
        }
        function WarnDialog({ t, when, acknowledged, onAcknowledgedChange, onCancel, onConfirm }) {
            const description = fill(t.quotaResetConfirm, when);
            useEffect(() => {
                const onKey = (event) => {
                    if (event.key === 'Escape')
                        onCancel();
                };
                window.addEventListener('keydown', onKey);
                return () => window.removeEventListener('keydown', onKey);
            }, [onCancel]);
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
                });
            }
            return h('div', { className: 'osubs-dsw', role: 'presentation' }, h('div', { className: 'osubs-dsw-mask', 'aria-hidden': 'true', onClick: onCancel }), h('div', {
                className: 'osubs-dsw-card',
                role: 'alertdialog',
                'aria-modal': 'true',
                'aria-labelledby': 'osubs-warn-title',
                'aria-describedby': 'osubs-warn-body',
            }, h('div', { className: 'osubs-dsw-head' }, h('h2', { id: 'osubs-warn-title', className: 'osubs-dsw-title' }, t.quotaResetWarnTitle), h('button', {
                type: 'button',
                className: 'osubs-dsw-x',
                'aria-label': t.quotaResetClose,
                onClick: onCancel,
            }, h(IconClose))), h('div', { className: 'osubs-dsw-body' }, h('div', { className: 'osubs-dsw-warning' }, h(IconWarning), h('p', { id: 'osubs-warn-body' }, description)), h('label', { className: 'osubs-dsw-ack' }, h('input', {
                type: 'checkbox',
                checked: acknowledged,
                autoFocus: true,
                onChange: (event) => onAcknowledgedChange(event.currentTarget.checked),
            }), h('span', null, t.quotaResetAck))), h('div', { className: 'osubs-dsw-foot' }, h('button', { type: 'button', className: 'osubs-dsw-btn osubs-dsw-btn--outline', onClick: onCancel }, t.cancel), h('button', {
                type: 'button',
                className: 'osubs-dsw-btn osubs-dsw-btn--primary',
                disabled: !acknowledged,
                onClick: onConfirm,
            }, t.quotaResetConfirmOk))));
        }
        function QuotaResetBox({ t, quota, onReset }) {
            const [busyId, setBusyId] = useState(null);
            const [pending, setPending] = useState(null);
            const [acked, setAcked] = useState(false);
            const credits = resetCreditRows(quota);
            if (typeof onReset !== 'function')
                return null;
            const ask = (credit) => {
                if (busyId)
                    return;
                setAcked(false);
                setPending(credit);
            };
            const close = () => {
                setPending(null);
                setAcked(false);
            };
            const confirm = async () => {
                if (!pending || busyId || !acked)
                    return;
                const credit = pending;
                const key = credit.id ?? 'reset';
                setPending(null);
                setAcked(false);
                setBusyId(key);
                try {
                    await onReset(credit);
                }
                finally {
                    setBusyId(null);
                }
            };
            const pendingWhen = pending
                ? (formatStamp(pending.expiresAt) || formatReset(pending.expiresAt, t, 'expires') || '—')
                : '';
            return h('div', { className: 'osubs-qbox' }, h('div', { className: 'osubs-qbox-head' }, h('span', { className: 'osubs-eyebrow' }, t.quotaResetBank), h('p', { className: 'osubs-hint' }, t.quotaResetHint)), credits.length === 0
                ? h('p', { className: 'osubs-note' }, t.quotaResetEmpty)
                : credits.map((credit, index) => {
                    const stamp = formatStamp(credit.expiresAt);
                    const relative = formatReset(credit.expiresAt, t, 'expires');
                    const key = credit.id ?? `credit-${index}`;
                    const busy = busyId !== null;
                    return h('div', { className: 'osubs-reset-row', key }, h('div', { className: 'osubs-reset-meta' }, h('span', { className: 'osubs-reset-when' }, stamp ? fill(t.quotaResetExpires, stamp) : t.quotaReset), relative && relative !== stamp && h('span', { className: 'osubs-reset-rel' }, relative)), h(Button, {
                        size: 'sm',
                        disabled: busy,
                        onClick: () => ask(credit),
                        label: busyId === key ? t.quotaResetBusy : t.quotaReset,
                    }));
                }), pending && h(WarnDialog, {
                t,
                when: pendingWhen,
                acknowledged: acked,
                onAcknowledgedChange: setAcked,
                onCancel: close,
                onConfirm: confirm,
            }));
        }
        function QuotaBlock({ t, quota, onRefresh, onReset }) {
            if (!quota || quota.status === 'idle')
                return null;
            const rows = Array.isArray(quota.rows) ? quota.rows : [];
            const hasUsage = rows.some((row) => (typeof row.usedPercent === 'number'
                || typeof row.remainingPercent === 'number'
                || (row.kind === 'prepaid' && typeof row.remaining === 'number' && row.remaining > 0)
                || (row.used !== undefined && row.total !== undefined)));
            return h('div', { className: 'osubs-quota' }, h('div', { className: 'osubs-quota-head' }, h('span', { className: 'osubs-eyebrow' }, t.quota), h('div', { className: 'osubs-actions' }, h(Button, { size: 'sm', onClick: onRefresh, label: t.quotaRefresh }))), quota.status === 'loading' && rows.length === 0 && h('p', { className: 'osubs-hint' }, t.quotaLoading), quota.status === 'error' && !hasUsage && h('p', { className: 'osubs-hint osubs-bad' }, `${t.quotaFailed}${quota.error ? ` · ${quota.error}` : ''}`), quota.status === 'ready' && !hasUsage && h('p', { className: 'osubs-hint' }, t.quotaUnknown), rows.map((row) => h(QuotaRow, { t, row, key: row.key })), h(QuotaResetBox, { t, quota, onReset }));
        }
        function ProviderCard({ t, id, title, account, pending, onLogin, onImport, onLogout, onCancel, onManual, onSwitch, onRefreshQuota, onResetQuota, onUseKey }) {
            const [paste, setPaste] = useState('');
            const [apiKey, setApiKey] = useState('');
            const [keyRegion, setKeyRegion] = useState('zai');
            const [showKey, setShowKey] = useState(false);
            const roster = Array.isArray(account?.accounts) ? account.accounts : [];
            const loggedIn = Boolean(account?.loggedIn) || roster.length > 0;
            const busy = Boolean(account?.busy);
            const status = busy ? t.busy : loggedIn ? t.loggedIn : t.loggedOut;
            const planLabel = loggedIn ? planOf(account) : '';
            const regionLabel = (region) => region === 'bigmodel' ? t.glmRegionCn : t.glmRegionGlobal;
            return h('section', { className: 'osubs-card' }, h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 180px' } }, h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } }, h('h3', { style: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }, title), planLabel && h(PlanBadge, { t, label: planLabel })), h('p', { className: 'osubs-hint' }, t.accountsHint)), h('span', {
                className: `osubs-status${loggedIn ? ' osubs-status--on' : busy ? ' osubs-status--busy' : ''}`,
            }, status)), roster.length === 0 && !busy && h('p', { className: 'osubs-note' }, t.noAccounts), roster.map((row) => h('div', {
                key: row.id,
                className: `osubs-acct${row.active ? ' osubs-acct--on' : ''}`,
                role: 'button',
                tabIndex: 0,
                onClick: () => { if (!row.active)
                    onSwitch(id, row.id); },
                onKeyDown: (event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !row.active) {
                        event.preventDefault();
                        onSwitch(id, row.id);
                    }
                },
            }, h('div', { className: 'osubs-acct-main' }, h('div', { className: 'osubs-acct-row' }, h('span', { className: 'osubs-mono' }, row.account || row.id), row.active && h('span', { className: 'osubs-tag' }, t.inUse), id === 'glm' && row.region && h('span', { className: 'osubs-tag' }, regionLabel(row.region)), row.planLabel && h(PlanBadge, { t, label: row.planLabel }))), h('div', { className: 'osubs-actions', onClick: (event) => event.stopPropagation() }, !row.active && h(Button, { size: 'sm', onClick: () => onSwitch(id, row.id), label: t.switchTo }), h(Button, { size: 'sm', onClick: () => onLogout(id, row.id), label: t.logout })))), account?.detail && h('p', { className: 'osubs-hint osubs-bad' }, `${t.error}: ${account.detail}`), pending?.userCode && h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } }, h('span', { className: 'osubs-eyebrow' }, t.userCode), h('code', { style: { fontSize: 20, letterSpacing: '0.14em', fontWeight: 600, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }, pending.userCode)), pending?.authorizeUrl && h('a', {
                className: 'osubs-link',
                href: pending.authorizeUrl,
                target: '_blank',
                rel: 'noreferrer',
            }, t.openUrl), h('div', { className: 'osubs-actions' }, id !== 'glm' && !busy && h(Button, { variant: 'primary', onClick: () => onLogin(id), label: loggedIn ? t.addAccount : t.login }), id === 'grok' && !busy && h(Button, { onClick: () => onLogin(id, 'pkce'), label: t.pkce }), !busy && h(Button, { onClick: () => onImport(id), label: t.import }), busy && h(Button, { onClick: () => onCancel(id), label: t.cancel })), id === 'glm' && !busy && h('div', { className: 'osubs-glm-logins' }, h('button', {
                type: 'button',
                className: 'osubs-glm-login',
                onClick: () => onLogin(id, 'zai'),
            }, h('span', null, loggedIn ? t.glmAddZai : t.glmLoginZai), h('span', { className: 'osubs-tag' }, t.glmRegionGlobal)), h('button', {
                type: 'button',
                className: 'osubs-glm-login',
                onClick: () => onLogin(id, 'bigmodel'),
            }, h('span', null, loggedIn ? t.glmAddBigmodel : t.glmLoginBigmodel), h('span', { className: 'osubs-tag' }, t.glmRegionCn)), h('button', {
                type: 'button',
                className: 'osubs-glm-login osubs-glm-ghost',
                onClick: () => setShowKey((open) => !open),
            }, h('span', null, t.glmLoginApiKey))), id === 'glm' && showKey && !busy && h('form', {
                onSubmit: (event) => {
                    event.preventDefault();
                    onUseKey(id, apiKey, keyRegion);
                    setApiKey('');
                    setShowKey(false);
                },
                style: { display: 'flex', flexDirection: 'column', gap: 8 },
            }, h('div', { className: 'osubs-actions' }, h(Button, {
                size: 'sm',
                variant: keyRegion === 'zai' ? 'primary' : undefined,
                onClick: () => setKeyRegion('zai'),
                label: t.glmRegionGlobal,
            }), h(Button, {
                size: 'sm',
                variant: keyRegion === 'bigmodel' ? 'primary' : undefined,
                onClick: () => setKeyRegion('bigmodel'),
                label: t.glmRegionCn,
            })), h('input', {
                className: 'osubs-input',
                value: apiKey,
                onChange: (event) => setApiKey(event.target.value),
                placeholder: t.glmKeyPlaceholder,
                'aria-label': t.glmKeyLabel,
                autoComplete: 'off',
            }), h('p', { className: 'osubs-hint' }, t.glmKeyHint), h('div', { className: 'osubs-actions' }, h(Button, { type: 'submit', variant: 'primary', label: t.glmKeyGo }))), busy && pending?.mode === 'pkce' && h('form', {
                onSubmit: (event) => {
                    event.preventDefault();
                    onManual(id, paste);
                },
                style: { display: 'flex', gap: 8, flexWrap: 'wrap' },
            }, h('input', {
                className: 'osubs-input',
                value: paste,
                onChange: (event) => setPaste(event.target.value),
                placeholder: t.pastePlaceholder,
                'aria-label': t.paste,
            }), h(Button, { type: 'submit', variant: 'primary', label: t.submitPaste })), loggedIn && h(QuotaBlock, {
                t,
                quota: account.quota,
                onRefresh: () => onRefreshQuota(id),
                onReset: id === 'codex' && onResetQuota ? () => onResetQuota(id) : undefined,
            }));
        }
        function ModelRow({ t, model, onToggle, showInput }) {
            return h('label', { className: 'osubs-model' }, h('input', {
                type: 'checkbox',
                checked: Boolean(model.enabled),
                onChange: () => onToggle(model.key, !model.enabled),
            }), h('span', null, model.name), model.large && h('span', { className: 'osubs-tag' }, t.largeTag), model.fast && h('span', { className: 'osubs-tag' }, t.fastTag), showInput && model.input?.includes('image') && h('span', { className: 'osubs-tag' }, t.inputImageTag), showInput && Array.isArray(model.input) && !model.input.includes('image') && h('span', { className: 'osubs-tag' }, t.inputTextTag));
        }
        function ModelFamily({ t, group, onToggle, onFamily }) {
            const models = Array.isArray(group.models) ? group.models : [];
            const enabledCount = models.filter((model) => model.enabled).length;
            const showInput = models.some((model) => model.input?.includes('image'))
                && models.some((model) => Array.isArray(model.input) && !model.input.includes('image'));
            return h('div', { className: 'osubs-family', style: { opacity: group.loggedIn ? 1 : 0.72 } }, h('div', { className: 'osubs-family-head' }, h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } }, h('h4', { style: { fontSize: 13, fontWeight: 600 } }, group.displayName), h('span', { className: 'osubs-note' }, fill(t.modelsOn, `${enabledCount} / ${models.length}`)), !group.loggedIn && h('span', { className: 'osubs-note' }, `· ${t.modelsNeedLogin}`)), h('div', { className: 'osubs-seg' }, h(Button, { size: 'sm', onClick: () => onFamily(group.family, true), label: t.modelsAll }), h(Button, { size: 'sm', onClick: () => onFamily(group.family, false), label: t.modelsNone }))), h('div', { className: 'osubs-models' }, models.map((model) => h(ModelRow, { t, model, onToggle, showInput, key: model.key }))));
        }
        function ModelPicker({ t, catalog, onToggle, onFamily }) {
            const groups = Array.isArray(catalog) ? catalog : [];
            const total = groups.reduce((sum, group) => sum + (group.models?.length ?? 0), 0);
            const enabled = groups.reduce((sum, group) => sum + (group.models ?? []).filter((model) => model.enabled).length, 0);
            if (groups.length === 0)
                return null;
            return h('section', { className: 'osubs-card', style: { padding: '18px 20px 20px', gap: 18 } }, h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' } }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 320px', maxWidth: '62ch' } }, h('h3', { style: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }, t.modelsTitle), h('p', { className: 'osubs-hint' }, t.modelsHint)), h('span', { className: 'osubs-badge' }, fill(t.modelsOn, `${enabled} / ${total}`))), groups.map((group) => h(ModelFamily, { t, group, onToggle, onFamily, key: group.provider })));
        }
        function platformLabel(t, id) {
            if (id === 'win')
                return t.platformWin;
            if (id === 'mac')
                return t.platformMac;
            return t.platformLinux;
        }
        function statusLabel(t, update) {
            if (!update)
                return '';
            if (update.status === 'update')
                return fill(t.updateReady, update.latest?.tag || update.latest?.name || '');
            if (update.status === 'current')
                return t.updateCurrent;
            if (update.status === 'ahead')
                return t.updateAhead;
            if (update.status === 'unknown')
                return t.updateUnknown;
            if (update.status === 'error')
                return `${t.updateError}${update.error ? ` · ${update.error}` : ''}`;
            return '';
        }
        function AboutPanel({ t, local, update, busy, onCheck }) {
            const repo = local?.repo || update?.repo || 'https://github.com/xxww0098/dsh-plugin-oauth-subs';
            const slug = local?.repoSlug || update?.repoSlug || 'xxww0098/dsh-plugin-oauth-subs';
            const version = local?.version || update?.version || '—';
            const host = local?.platform || update?.platform;
            const assets = Array.isArray(update?.assets) ? update.assets : [];
            const latest = update?.latest;
            const tone = update?.status === 'update' ? 'osubs-warn' : update?.status === 'error' ? 'osubs-bad' : '';
            return h('section', { className: 'osubs-card' }, h('header', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' } }, h('h3', { style: { fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' } }, t.aboutTitle), h(Button, { size: 'sm', onClick: onCheck, disabled: busy, label: busy ? t.checking : t.checkUpdate })), h('div', { className: 'osubs-about' }, h('div', { className: 'osubs-kv' }, h('div', { className: 'osubs-kv-row' }, h('span', { className: 'osubs-eyebrow' }, t.repo), h('a', { className: 'osubs-link', href: repo, target: '_blank', rel: 'noreferrer' }, slug)), h('div', { className: 'osubs-kv-row' }, h('span', { className: 'osubs-eyebrow' }, t.installed), h('span', { className: 'osubs-mono' }, version)), h('div', { className: 'osubs-kv-row' }, h('span', { className: 'osubs-eyebrow' }, t.os), h('span', null, `${platformLabel(t, host)}${host ? ` · ${t.thisOs}` : ''}`)), latest?.tag && h('div', { className: 'osubs-kv-row' }, h('span', { className: 'osubs-eyebrow' }, t.latest), h('a', { className: 'osubs-link', href: latest.url, target: '_blank', rel: 'noreferrer' }, latest.tag)), latest?.publishedAt && h('p', { className: 'osubs-note' }, fill(t.published, latest.publishedAt.replace('T', ' ').replace(/Z$/, ' UTC'))), update?.status && h('p', { className: `osubs-hint${tone ? ` ${tone}` : ''}` }, statusLabel(t, update))), assets.map((row) => h('div', {
                key: row.platform,
                className: `osubs-dl${row.current ? ' osubs-dl--on' : ''}`,
            }, h('div', { className: 'osubs-acct-main' }, h('div', { className: 'osubs-acct-row' }, h('span', { style: { fontSize: 13, fontWeight: 600 } }, platformLabel(t, row.platform)), row.current && h('span', { className: 'osubs-tag' }, t.thisOs), row.generic && h('span', { className: 'osubs-tag' }, t.platformAny)), h('span', { className: 'osubs-note' }, row.name)), h('a', {
                className: 'osubs-link',
                href: row.url,
                target: '_blank',
                rel: 'noreferrer',
            }, t.download))), latest?.url && assets.length === 0 && h('a', {
                className: 'osubs-link',
                href: latest.url,
                target: '_blank',
                rel: 'noreferrer',
            }, t.releasePage)));
        }
        function SettingsSection({ rpc, close: _close }) {
            const t = COPY[localeOf()];
            const [snap, setSnap] = useState(null);
            const [pending, setPending] = useState({});
            const [error, setError] = useState('');
            const [tab, setTab] = useState('codex');
            const [update, setUpdate] = useState(null);
            const [updateBusy, setUpdateBusy] = useState(false);
            const refresh = useCallback(async () => {
                if (rpc === undefined)
                    return;
                try {
                    const next = await callRpc(rpc, 'status');
                    setSnap(next);
                    setError('');
                }
                catch (caught) {
                    setError(caught instanceof Error ? caught.message : t.noRpc);
                }
            }, [rpc, t.noRpc]);
            useEffect(() => {
                void refresh();
                const timer = setInterval(() => void refresh(), 1500);
                return () => clearInterval(timer);
            }, [refresh]);
            const run = async (method, payload) => {
                try {
                    const result = await callRpc(rpc, method, payload);
                    if (method === 'login') {
                        setPending((current) => ({ ...current, [payload.provider]: result }));
                        if (result?.authorizeUrl && typeof window !== 'undefined') {
                            window.open(result.authorizeUrl, '_blank', 'noopener');
                        }
                    }
                    if (method === 'logout' || method === 'cancel' || method === 'key') {
                        setPending((current) => ({ ...current, [payload.provider]: undefined }));
                    }
                    if (method === 'update') {
                        setUpdate(result);
                        return result;
                    }
                    await refresh();
                }
                catch (caught) {
                    setError(caught instanceof Error ? caught.message : String(caught));
                }
            };
            const checkUpdate = async () => {
                setUpdateBusy(true);
                try {
                    await run('update', {});
                }
                finally {
                    setUpdateBusy(false);
                }
            };
            useEffect(() => {
                if (tab === 'about' && update === null && !updateBusy)
                    void checkUpdate();
            }, [tab]);
            if (rpc === undefined) {
                return h('p', { className: 'osubs-hint' }, t.noRpc);
            }
            const card = (id, title) => h(ProviderCard, {
                t,
                id,
                title,
                account: snap?.accounts?.[id],
                pending: pending[id],
                onLogin: (provider, mode) => run('login', { provider, mode }),
                onImport: (provider) => run('import', { provider }),
                onLogout: (provider, accountId) => run('logout', { provider, id: accountId }),
                onCancel: (provider) => run('cancel', { provider }),
                onManual: (provider, input) => run('manual', { provider, input }),
                onSwitch: (provider, accountId) => run('switch', { provider, id: accountId }),
                onRefreshQuota: (provider) => run('quota', { provider }),
                onResetQuota: id === 'codex' ? (provider) => run('reset', { provider }) : undefined,
                onUseKey: (provider, key, region) => run('key', { provider, key, region }),
            });
            return h('div', { className: 'osubs' }, error && h('p', { className: 'osubs-hint osubs-bad' }, error), h('div', { className: 'osubs-tabs', role: 'tablist' }, h('button', {
                type: 'button', role: 'tab', 'aria-selected': tab === 'codex',
                className: `osubs-tab${tab === 'codex' ? ' osubs-tab--on' : ''}`,
                onClick: () => setTab('codex'),
            }, t.codexTitle), h('button', {
                type: 'button', role: 'tab', 'aria-selected': tab === 'grok',
                className: `osubs-tab${tab === 'grok' ? ' osubs-tab--on' : ''}`,
                onClick: () => setTab('grok'),
            }, t.grokTitle), h('button', {
                type: 'button', role: 'tab', 'aria-selected': tab === 'glm',
                className: `osubs-tab${tab === 'glm' ? ' osubs-tab--on' : ''}`,
                onClick: () => setTab('glm'),
            }, t.glmTitle), h('button', {
                type: 'button', role: 'tab', 'aria-selected': tab === 'models',
                className: `osubs-tab${tab === 'models' ? ' osubs-tab--on' : ''}`,
                onClick: () => setTab('models'),
            }, t.modelsTitle), h('button', {
                type: 'button', role: 'tab', 'aria-selected': tab === 'about',
                className: `osubs-tab${tab === 'about' ? ' osubs-tab--on' : ''}`,
                onClick: () => setTab('about'),
            }, t.aboutTitle)), tab === 'codex' && card('codex', t.codexTitle), tab === 'grok' && card('grok', t.grokTitle), tab === 'glm' && card('glm', t.glmTitle), tab === 'models' && h(ModelPicker, {
                t,
                catalog: snap?.catalog,
                onToggle: (key, on) => run('models', { key, on }),
                onFamily: (family, on) => run('models', { family, on }),
            }), tab === 'about' && h(AboutPanel, {
                t,
                local: snap?.update,
                update,
                busy: updateBusy,
                onCheck: checkUpdate,
            }));
        }
        function apply(ctx) {
            const connection = ctx.get('connection');
            ctx.slots.inject('settings.section', () => ctx.slots.register({
                name: 'settings.section',
                id: 'oauth-subs',
                order: 91,
                label: () => COPY[localeOf()].nav,
                inject: () => ({ rpc: connection?.rpc }),
            }, SettingsSection));
        }
        exports.name = name;
        exports.inject = inject;
        exports.apply = apply;
        return module.exports;
    },
});
