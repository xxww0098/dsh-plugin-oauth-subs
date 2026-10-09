import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { assembleUi } from '../scripts/ui-bundle.ts'

test('settings language follows the host page before the OS browser language', async () => {
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  const body = src.match(/function localeOf\(\) \{[\s\S]*?\n        \}/)?.[0]
  assert.ok(body)
  const localeOf = new Function('document', 'navigator', `${body}; return localeOf()`) as (document: any, navigator: any) => string
  assert.equal(localeOf({ documentElement: { lang: 'zh-CN' } }, { language: 'en-US' }), 'zh')
  assert.equal(localeOf({ documentElement: { lang: 'en' } }, { language: 'zh-CN' }), 'en')
  assert.equal(localeOf({ documentElement: { lang: '' } }, { language: 'zh-CN' }), 'zh')

  const stampBody = src.match(/function formatStamp\(resetAt\) \{[\s\S]*?\n        \}/)?.[0]
  assert.ok(stampBody)
  const formatStamp = new Function('localeOf', `${stampBody}; return formatStamp`)(() => 'zh') as (timestamp: number) => string
  assert.match(formatStamp(Date.UTC(2026, 9, 5, 12, 20)), /10月5日/)
})

test('panelVisible needs a visible window and a rendered panel', async () => {
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  const body = src.match(/function panelVisible\(el, doc\) \{[\s\S]*?\n        \}/)?.[0]
  assert.ok(body)
  const panelVisible = new Function(`${body}; return panelVisible`)() as (el: any, doc: any) => boolean
  const shown = { checkVisibility: () => true }
  const retained = { checkVisibility: () => false }
  assert.equal(panelVisible(shown, { hidden: false }), true)
  assert.equal(panelVisible(shown, { hidden: true }), false)
  assert.equal(panelVisible(retained, { hidden: false }), false)
  // Engines without checkVisibility (and the no-rpc early return, which has
  // no root) fall back to the window check alone.
  assert.equal(panelVisible({}, { hidden: false }), true)
  assert.equal(panelVisible(null, { hidden: false }), true)
  assert.equal(panelVisible(null, { hidden: true }), false)
})

test('parseContextInput accepts plain tokens and k/m shorthand only', async () => {
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  const body = src.match(/function parseContextInput\(text\) \{[\s\S]*?\n        \}/)?.[0]
  assert.ok(body)
  const parseContextInput = new Function(`${body}; return parseContextInput`)() as (text: string) => number | undefined
  assert.equal(parseContextInput('400000'), 400_000)
  assert.equal(parseContextInput(' 400000 '), 400_000)
  assert.equal(parseContextInput('400k'), 400_000)
  assert.equal(parseContextInput('400K'), 400_000)
  assert.equal(parseContextInput('1m'), 1_000_000)
  assert.equal(parseContextInput('1.5m'), 1_500_000)
  assert.equal(parseContextInput('1.5M'), 1_500_000)
  assert.equal(parseContextInput('4096'), 4_096)
  assert.equal(parseContextInput(''), undefined)
  assert.equal(parseContextInput('400 k'), undefined)
  assert.equal(parseContextInput('k400'), undefined)
  assert.equal(parseContextInput('-400k'), undefined)
  assert.equal(parseContextInput('400k '), 400_000)
  assert.equal(parseContextInput('1e6'), undefined)
  assert.equal(parseContextInput('9'.repeat(20)), undefined)
})

test('Settings workbench enters as a sidebar panel below 插件', async () => {
  const src = assembleUi()
  assert.match(src, /ctx\.slots\.inject\('main'/)
  assert.match(src, /name: 'main',\s*key: 'oauth-subs'/)
  assert.match(src, /ctx\.slots\.inject\('sidebar\.panellist'/)
  assert.match(src, /name: 'sidebar\.panellist',\s*id: 'oauth-subs',\s*order: 5/)
  assert.match(src, /function PanelGlyph\(\{ size \}\)/)
  assert.equal(src.includes("ctx.slots.inject('settings.section'"), false)
  assert.equal(src.includes('plugins.detail.section'), false)
  // Retained main panels stay mounted — the poll gates on real visibility,
  // re-arms only after the previous refresh settles, wakes on
  // visibilitychange, and treats first-show plus every hidden→shown
  // transition as entering the page (quota revalidated behind the answer).
  assert.match(src, /const entered = shown && !wasShown/)
  assert.match(src, /if \(shown\) \{\s*await Promise\.race\(\[refresh\(false, entered\), new Promise\(\(resolve\) => setTimeout\(resolve, 30_000\)\)\]\)/)
  // Returning to the quota view counts as entering the page too.
  assert.match(src, /if \(view === 'quota' && before !== 'quota'\) void refresh\(false, true\)/)
  // After the user's own action the status read must not join a stale poll build.
  assert.match(src, /callRpc\(rpc, 'status', payload\)/)
  // models already returns a fresh snapshot — adopt it; everything else
  // still forces a fresh status read.
  assert.match(src, /return result\s*\}\s*if \(method === 'models' && result && typeof result === 'object'\) \{\s*\/\/ setModels already returns a fresh snapshot[^\n]*\n[^\n]*\n\s*setSnap\(result\)\s*writeStoredSnap\(result\)\s*\} else \{\s*await refresh\(true\)\s*\}/)
  assert.match(src, /if \(live\) timer = setTimeout\(tick, loginPending\.current \? 1500 : 3000\)/)
  assert.match(src, /document\.addEventListener\('visibilitychange', onVisibility\)/)
  assert.match(src, /className: 'osubs', ref: root/)
  assert.equal(src.includes('setInterval'), false)
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-layout'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar'))
})

test('settings bundle ships self-update but no host-lifecycle surface', async () => {
  const text = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  // Gone for good: dsh-cli update, host restart, dsh auto-update channel.
  assert.equal(text.includes('dshRestart'), false)
  assert.equal(text.includes('checkDshUpdate'), false)
  assert.equal(text.includes('Restart DSH'), false)
  // Kept: the plugin auto-update switch, now backed by self-install.
  assert.match(text, /autoUpdate/)
  assert.match(text, /osubs-auto-row/)
  assert.match(text, /自动更新/)
  assert.match(text, /Auto-update/)
})

test('Settings GLM card hides opaque ZCode user.id in identityOf', async () => {
  const src = assembleUi()
  assert.match(src, /function isGlmOpaqueIdentity/)
  assert.match(src, /family === 'glm'\) return account && !isGlmOpaqueIdentity\(account\) \? account : ''/)
  // Unambiguous ids are hidden (digits / UUID / long hex); a letters+digits
  // username like xxww0098 is a real display name and must NOT be filtered.
  assert.match(src, /\^\\d\+\$/)
  assert.match(src, /\[0-9a-f\]\{16,\}/)
  assert.equal(/\[A-Za-z0-9\]\{2,24\}/.test(src), false)
})

test('GLM card carries no 150% quota claim', async () => {
  // The 1.5x is granted server-side and never slope-tested; the card must not
  // advertise it (docs/error.md 2026-09-29 GLM 150%).
  const src = assembleUi()
  assert.equal(src.includes('glmBoost'), false)
  assert.equal(src.includes('150%'), false)
})

test('Settings Ollama card hides ollama-hex title and uses remaining row labels', async () => {
  const src = assembleUi()
  assert.match(src, /function isOllamaOpaqueIdentity/)
  assert.match(src, /family === 'ollama'\) return account && !isOllamaOpaqueIdentity\(account\) \? account : ''/)
  assert.match(src, /family === 'ollama'/)
  assert.match(src, /if \(row\.kind === 'primary'\) return t\.primary/)
  assert.match(src, /if \(row\.kind === 'weekly'\) return t\.weekly/)
  assert.match(src, /row\.note && h\('span', \{ className: 'osubs-note' \}, row\.note\)/)
  assert.match(src, /if \(family === 'ollama'\) \{[\s\S]*return 'Pro'/)
  assert.match(src, /\.osubs-note \{[^}]*white-space: pre-wrap/)
  assert.match(src, /\.osubs-note \{[^}]*overflow-wrap: anywhere/)
  assert.equal(/\.osubs-note \{ font-size: 11px;[^}]*white-space: nowrap/.test(src), false)
})

test('Settings Cursor tab uses Import local Cursor copy and shows source, never tokens', async () => {
  const src = assembleUi()
  assert.match(src, /cursorImport:\s*'导入本机 Cursor'/)
  assert.match(src, /cursorImport:\s*'Import local Cursor'/)
  assert.match(src, /cursorImportEmpty:\s*'本机没有 Cursor CLI 或 IDE 登录'/)
  assert.match(src, /id === 'cursor' \? t\.cursorImport : id === 'kimi' \? t\.kimiImport : id === 'copilot' \? t\.copilotImport : id === 'devin' \? t\.devinImport : id === 'cline' \? t\.clineImport : id === 'command-code' \? t\.commandCodeImport : t\.import/)
  assert.match(src, /\(id === 'cursor' \|\| id === 'ollama' \|\| id === 'kimi' \|\| id === 'copilot' \|\| id === 'devin' \|\| id === 'cline' \|\| id === 'command-code'\) && row\.methodLabel/)
  assert.match(src, /message === 'cursor-import-empty' \? t\.cursorImportEmpty/)
  assert.match(src, /quotaPanel\('cursor'\)/)
  assert.match(src, /icons\/\{grok,zai,cursor,ollama,cline,github,opencode,openai\}\.svg/)
  assert.match(src, /icons\/\{codex,kiro,antigravity,kimi,copilot,devin,deepseek\}-color\.svg/)
  // Usage-only: DSH's own DeepSeek providers, brand color from deepseek-color.svg
  assert.match(src, /deepseek: \{ raw: '<path d="M23\.748 4\.482[^']*fill="#4D6BFE"\/>' \}/)
  assert.match(src, /const USAGE_ONLY_FAMILIES = \['deepseek'\]/)
  assert.match(src, /cursor: \{ d: 'M22\.106 5\.68L12\.5\.135a\.998\.998 0 00-\.998 0L1\.893 5\.68/)
  assert.match(src, /cursor: \{ d: '[^']+', clip: true \}/)
  assert.equal(src.includes('M11.925 24l10.425-6'), false)
  assert.equal(src.includes('session.accessToken'), false)
  assert.equal(/cursor[\s\S]{0,200}accessToken/.test(src), false)
  const panelOrder = src.match(/quotaPanel\('([\w-]+)'/g) ?? []
  const ids = panelOrder.map((row) => /quotaPanel\('([\w-]+)'/.exec(row)?.[1])
  assert.deepEqual(ids, ['codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'copilot', 'devin', 'cline', 'opencode-go', 'command-code'])
})

test('Settings Ollama tab is Cloud key paste after Cursor, never localhost', async () => {
  const src = assembleUi()
  assert.match(src, /ollama: 'Ollama'/)
  assert.match(src, /ollamaLoginApiKey:\s*'粘贴 API Key'/)
  assert.match(src, /ollamaLoginApiKey:\s*'Paste API key'/)
  assert.match(src, /ollamaImport:\s*'导入 OLLAMA_API_KEY'/)
  assert.match(src, /quotaPanel\('ollama'\)/)
  assert.match(src, /ollama: \{ d: 'M7\.905 1\.09/)
  assert.match(src, /id === 'ollama' && !busy && h\('div', \{ className: 'osubs-logins' \}/)
  assert.match(src, /h\('span', null, t\.ollamaImport\)/)
  assert.match(src, /id !== 'glm' && id !== 'kiro' && id !== 'ollama' && id !== 'opencode-go' && !busy/)
  assert.equal(src.includes('127.0.0.1:11434'), false)
  assert.equal(src.includes('localhost:11434'), false)
  assert.match(src, /\.osubs-ptabs \{[\s\S]*border-bottom: 1px solid var\(--osubs-line\)/)
  assert.match(src, /\.osubs-pane \{[\s\S]*overflow-y: auto/)
  assert.equal((src.match(/\.osubs-rail \{[^}]*position: sticky/) || []).length, 0)
  assert.match(src, /\.osubs-rail-item \{[\s\S]*border-radius: 8px/)
})

test('Settings entry is horizontal page tabs over a family rail, page padded', async () => {
  const src = assembleUi()
  assert.match(src, /className: 'osubs-ptabs', role: 'tablist'/)
  const pageTabs = src.match(/h\(PageTab, \{ id: '(\w+)'/g) ?? []
  const pageIds = pageTabs.map((row) => /id: '(\w+)'/.exec(row)?.[1])
  assert.deepEqual(pageIds, ['quota', 'models', 'usage', 'version', 'donate'])

  // No family tabs in the top bar; families live in the rail below.
  assert.equal(/id: 'codex'/.test(pageTabs.join(' ')), false)
  assert.equal(/id: 'apikey'/.test(pageTabs.join(' ')), false)

  const rootCss = src.match(/^\.osubs \{[^}]*\}/m)?.[0] ?? ''
  const ptabsCss = src.match(/\.osubs-ptabs \{[^}]*\}/)?.[0] ?? ''
  const ptabCss = src.match(/\.osubs-ptab \{[^}]*\}/)?.[0] ?? ''
  const ptabOnCss = src.match(/\.osubs-ptab--on \{[^}]*\}/)?.[0] ?? ''
  const railCss = src.match(/\.osubs-rail \{[^}]*\}/)?.[0] ?? ''
  const railItemCss = src.match(/\.osubs-rail-item \{[^}]*\}/)?.[0] ?? ''
  // Fixed three-region layout: the page itself does not scroll; the
  // topbar + family rail are fixed regions and only the right pane
  // scrolls, so the scrollbar never overlaps the tab strip.
  assert.match(rootCss, /padding: 0 var\(--osubs-s5\) var\(--osubs-s5\)/)
  assert.match(rootCss, /overflow: hidden/)
  assert.equal(rootCss.includes('overflow-y'), false)
  assert.match(src, /\.osubs-body \{[^}]*min-height: 0/)
  assert.match(src, /\.osubs-pane \{[^}]*overflow-y: auto/)
  assert.match(ptabsCss, /flex: none/)
  assert.equal(ptabsCss.includes('position: sticky'), false)
  assert.match(ptabsCss, /margin: 0 calc\(-1 \* var\(--osubs-s5\)\)/)
  assert.match(ptabsCss, /border-bottom: 1px solid var\(--osubs-line\)/)
  assert.match(ptabsCss, /-webkit-app-region: drag/)
  assert.match(ptabCss, /-webkit-app-region: no-drag/)
  assert.match(ptabCss, /cursor: pointer/)
  assert.match(ptabCss, /appearance: none/)
  assert.match(ptabOnCss, /box-shadow: inset 0 -2px 0 var\(--osubs-accent\)/)
  assert.match(railCss, /display: flex/)
  assert.match(railCss, /flex-direction: column/)
  assert.match(railCss, /overflow-y: auto/)
  assert.match(railItemCss, /cursor: pointer/)
  assert.match(railItemCss, /appearance: none/)
  assert.match(src, /\.osubs-rail-item--on \{[^}]*font-weight: 600/)
  assert.match(src, /className: 'osubs-rail-label'/)

  // Rail lists every family; 'all' entry first, opencode-go bucket last.
  assert.match(src, /\{ id: 'all', name: t\.allFamilies/)
  assert.match(src, /'codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama',/)
  assert.match(src, /'kimi', 'copilot', 'devin', 'cline', 'opencode-go',/)
  const panelOrder = src.match(/quotaPanel\('([\w-]+)'/g) ?? []
  const ids = panelOrder.map((row) => /quotaPanel\('([\w-]+)'/.exec(row)?.[1])
  assert.deepEqual(ids, ['codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'copilot', 'devin', 'cline', 'opencode-go', 'command-code'])
})

test('OpenCode Go renders through the shared account cards and add-account dialog', async () => {
  const src = assembleUi()
  assert.match(src, /opencodeGoKey:\s*'API Key'/)
  assert.match(src, /opencodeGoKey:\s*'API key'/)
  assert.match(src, /opencodeGoHostStale/)
  assert.equal(src.includes('OpencodeGoPanel'), false)
  assert.match(src, /quotaPanel\('opencode-go'\)/)
  assert.match(src, /onGoSave: async \(payload\) => \{\s*await callRpc\(rpc, 'goSave', payload\)\s*await refresh\(true\)\s*\}/)
  assert.match(src, /id === 'opencode-go' && !busy && h\('form'/)
  assert.match(src, /roster\.some\(\(row\) => row\.apiKeySet\) \? t\.opencodeGoKeySet : t\.opencodeGoKeyPlaceholder/)
  assert.match(src, /roster\.some\(\(row\) => row\.cookieSet\) \? t\.opencodeGoCookieSet : t\.opencodeGoCookiePlaceholder/)
  assert.match(src, /id !== 'glm' && id !== 'kiro' && id !== 'ollama' && id !== 'opencode-go'/)
  assert.match(src, /isUnknownOauthMethod\(text\) \? t\.opencodeGoHostStale/)
  assert.match(src, /\.osubs-fields > \.osubs-input \{[\s\S]*flex: none; width: 100%; height: 36px/)
})

test('OpenCode Go rows carry tokens, status, workspace name, and balance fallback', async () => {
  const src = assembleUi()
  assert.match(src, /function formatTokenAmount/)
  assert.match(src, /formatTokenAmount\(row\.used\)/)
  assert.match(src, /row\.status !== 'ok' && h\('span', \{ className: 'osubs-tag osubs-tag--warn' \}, row\.status\)/)
  assert.match(src, /id === 'opencode-go' && row\.workspaceName && h\('span', \{ className: 'osubs-tag osubs-tag--plain' \}, row\.workspaceName\)/)
  assert.match(src, /id === 'opencode-go' && quota\?\.useBalance && Number\(quota\.balance\) > 0/)
  assert.match(src, /opencodeGoBalance: '余额兜底 \{n\}'/)
  assert.match(src, /opencodeGoBalance: 'Balance fallback \{n\}'/)
  assert.match(src, /\.osubs-tag--warn \{/)
  assert.match(src, /const AMOUNT_UNITS_KEY = 'osubs-amount-units'/)
  assert.match(src, /onToggleAmount: tokens \? onToggleUnits : undefined/)
  assert.match(src, /quotaUnitToggle: '切换单位 k\/M'/)
})

test('Settings Kimi tab uses LobeHub Kimi path, device login, and never @lobehub/icons', async () => {
  const src = assembleUi()
  assert.match(src, /kimi: 'Kimi'/)
  assert.match(src, /kimiImport:\s*'导入本机 Kimi Code'/)
  assert.match(src, /kimiImport:\s*'Import local Kimi Code'/)
  assert.match(src, /LobeHub `Kimi` icon/)
  assert.match(src, /kimi: \{ raw: '<rect width="24" height="24" rx="5" fill="#000"\/>/)
  assert.match(src, /quotaPanel\('kimi'\)/)
  assert.match(src, /id === 'grok' \|\| id === 'kimi' \|\| id === 'copilot' \|\| id === 'cline' \? t\.device/)
  assert.match(src, /id === 'kimi' && showKey && !busy/)
  assert.match(src, /family === 'kimi'\) return account && !isKimiOpaqueIdentity/)
  assert.equal(src.includes("from '@lobehub/icons'"), false)
  assert.equal(src.includes('require(\'@lobehub/icons\')'), false)
})

test('Settings Antigravity card shows a verify banner, not API-key-invalid', async () => {
  const src = assembleUi()
  assert.match(src, /antigravityVerify:\s*'Google 需要验证此账号才能对话'/)
  assert.match(src, /antigravityVerifyGo:\s*'去验证'/)
  assert.match(src, /id === 'antigravity' && row\.needsValidation/)
  assert.match(src, /window\.open\(row\.validationUrl/)
  assert.equal(src.includes('API 密钥无效'), false)
})

test('authorize URL and user code hide when the provider is no longer busy', async () => {
  const src = assembleUi()
  assert.match(src, /pending\?\.userCode && busy &&/)
  assert.match(src, /pending\?\.authorizeUrl && busy &&/)
  assert.match(src, /snap\.accounts\[id\]\?\.busy/)
})

function loadFormatQuotaError(src) {
  const start = src.indexOf('function formatQuotaError')
  assert.notEqual(start, -1, 'formatQuotaError is missing')
  const next = src.indexOf('\n    function ', start + 1)
  assert.notEqual(next, -1, 'formatQuotaError is not followed by another function')
  return new Function(`${src.slice(start, next)}; return formatQuotaError`)()
}

test('Settings quota error wraps and does not dump upstream JSON', async () => {
  const src = assembleUi()
  const hintCss = src.match(/^\.osubs-hint \{[^}]*\}/m)?.[0] ?? ''
  const hintBadCss = src.match(/^\.osubs-hint\.osubs-bad \{[^}]*\}/m)?.[0] ?? ''
  const badCss = src.match(/^\.osubs-bad \{[^}]*\}/m)?.[0] ?? ''
  assert.match(hintCss, /display: block/)
  assert.match(hintCss, /max-width: 100%/)
  assert.match(hintCss, /overflow-wrap: anywhere/)
  assert.match(hintCss, /word-break: break-word/)
  assert.match(hintCss, /white-space: pre-wrap/)
  assert.match(hintBadCss, /overflow-y: auto/)
  assert.match(badCss, /overflow-wrap: anywhere/)
  assert.match(badCss, /word-break: break-word/)
  assert.match(src, /function formatQuotaError/)
  assert.match(src, /formatQuotaError\(quota\.error\)/)
  assert.match(src, /title: quota\.error \|\| undefined/)
  assert.equal(src.includes('` · ${quota.error}`'), false)

  const formatQuotaError = loadFormatQuotaError(src)
  const kimi429 = 'kimi usage failed (HTTP 429): {"code":"resource_exhausted","message":"insufficient balance","details":[{"type":"common.error.v1.ErrorDetail","value":"CHQSGQoFZW4tVVMSEENyZWRpdHMgdXNIZCBhbGwgZG93biB0aGUgd2lyZSBhbmQgdGhlbiBzb21lIHByb3RvYnVmIGJsb2IgdGhhdCBnb2VzIG9uIGFuZCBvbiBhbmQgb24={"reason":"'
  const short = formatQuotaError(kimi429)
  assert.match(short, /insufficient balance/)
  assert.match(short, /HTTP 429/)
  assert.equal(short.includes('resource_exhausted'), false)
  assert.equal(short.includes('ErrorDetail'), false)
  assert.equal(short.includes('CHQSGQo'), false)
  assert.equal(short.includes('details'), false)
  assert.ok(short.length <= 160)

  const nested = formatQuotaError('glm usage failed (HTTP 403): {"error":{"message":"plan expired","code":"permission_denied"}}')
  assert.equal(nested, 'plan expired (HTTP 403)')

  const truncated = formatQuotaError('cursor quota failed (HTTP 429): {"message":"too many requests","details":"AAAA')
  assert.equal(truncated, 'too many requests (HTTP 429)')

  const plain = formatQuotaError('kimi usage failed (HTTP 503)')
  assert.equal(plain, 'kimi usage failed (HTTP 503)')

  const longPlain = formatQuotaError(`upstream exploded ${'x'.repeat(200)}`)
  assert.ok(longPlain.endsWith('…'))
  assert.ok(longPlain.length <= 161)
  assert.equal(longPlain.includes('x'.repeat(200)), false)
})

test('QuotaRow is a remaining bar for Codex remainingPercent and Cursor usedPercent', async () => {
  const src = assembleUi()
  assert.match(src, /function remainingPercentOf\(row\)/)
  assert.match(src, /function RemainingBar/)
  assert.match(src, /function QuotaMeter/)
  assert.match(src, /typeof row\?\.remainingPercent === 'number'/)
  assert.match(src, /100 - row\.usedPercent/)
  assert.match(src, /const remaining = remainingPercentOf\(row\)/)
  assert.match(src, /h\(QuotaMeter,/)
  assert.match(src, /function QuotaMeter\(\{ t, remainingPercent, amount, label, reset, onToggleAmount \}\)/)
  assert.match(src, /reset && h\('span', \{ className: 'osubs-qreset' \}, reset\)/)
  assert.match(src, /h\(RemainingBar, \{ remainingPercent \}\)/)
  // Bar fill is a green→red ramp on remaining: full = --osubs-ok, half =
  // --osubs-warn, empty = --osubs-bad (hsl keeps the midpoint clean amber).
  assert.match(src, /function quotaFillColor\(remaining\)/)
  assert.match(src, /color-mix\(in hsl, var\(--osubs-ok\) \$\{Math\.round\(\(pct - 50\) \* 2\)\}%, var\(--osubs-warn\)\)/)
  assert.match(src, /color-mix\(in hsl, var\(--osubs-warn\) \$\{Math\.round\(pct \* 2\)\}%, var\(--osubs-bad\)\)/)
  assert.match(src, /if \(remaining <= 40\) return 'warn'\s*\/\/[^\n]*\n\s*return null/)
  assert.match(src, /fill\(t\.leftPercent, remainingPercent\)/)
  assert.match(src, /scaleX\(\$\{Math\.max\(0, Math\.min\(100, remainingPercent\)\) \/ 100\}\)/)
  assert.match(src, /leftPercent:\s*'剩余 \{n\}%'/)
  assert.match(src, /leftPercent:\s*'\{n\}% left'/)
  assert.match(src, /\.osubs-tag \{[\s\S]*white-space: nowrap/)
  assert.equal(src.includes('showUsed'), false)
  assert.equal(src.includes("usedPercent: '已用"), false)
  assert.equal(src.includes("usedPercent: '{n}% used'"), false)
  assert.equal(src.includes('t.usedPercent'), false)

  function remainingPercentOf(row) {
    if (typeof row?.remainingPercent === 'number' && Number.isFinite(row.remainingPercent)) {
      return Math.max(0, Math.min(100, row.remainingPercent))
    }
    if (typeof row?.usedPercent === 'number' && Number.isFinite(row.usedPercent)) {
      return Math.max(0, Math.min(100, 100 - row.usedPercent))
    }
    return undefined
  }
  assert.equal(remainingPercentOf({ remainingPercent: 73, kind: 'weekly' }), 73)
  assert.equal(remainingPercentOf({ usedPercent: 52, kind: 'product', product: 'auto' }), 48)
  assert.equal(remainingPercentOf({ remainingPercent: 48, usedPercent: 52, kind: 'product' }), 48)
  assert.equal(remainingPercentOf({ usedPercent: 0, kind: 'product', product: 'api' }), 100)
})

test('QuotaMeter owns each window reset; nothing floats between bars', async () => {
  const src = assembleUi()
  const meter = src.match(/function QuotaMeter\([\s\S]*?\n    \}/)?.[0] ?? ''
  const row = src.match(/function QuotaRow\([\s\S]*?\n    \}/)?.[0] ?? ''
  const qmeterCss = src.match(/\.osubs-qmeter \{[^}]*\}/)?.[0] ?? ''
  const qresetCss = src.match(/\.osubs-qreset \{[^}]*\}/)?.[0] ?? ''
  assert.match(meter, /reset && h\('span', \{ className: 'osubs-qreset' \}, reset\)/)
  assert.match(meter, /osubs-qreset[\s\S]*RemainingBar/)
  assert.match(row, /reset,\s*onToggleAmount: tokens \? onToggleUnits : undefined,\s*\}\),/)
  // The reset line is the relative countdown alone: no period date range,
  // and no day formatter left behind for one.
  assert.equal(meter.includes('period'), false)
  assert.equal(row.includes('periodStart'), false)
  assert.equal(src.includes('formatDay'), false)
  assert.equal(/reset && h\('span', \{ className: 'osubs-note' \}, reset\)/.test(row), false)
  assert.match(qmeterCss, /display: flex/)
  assert.match(qmeterCss, /flex-direction: column/)
  assert.equal(qmeterCss.includes('display: contents'), false)
  assert.match(qresetCss, /text-align: right/)
  assert.match(src, /const reset = formatReset\(row\.resetAt, t\)/)
})

test('the active account shows a circled check beside the identity', async () => {
  const src = assembleUi()
  assert.match(src, /className: 'osubs-acct-id'/,)
  assert.match(src, /h\('span', \{ className: 'osubs-mono', 'data-shot-mask': '' \}, identityOf\(row, id\)\),\s*row\.active && h\('span', \{\s*className: 'osubs-acct-mark',/)
  assert.equal(src.includes('osubs-tag--on'), false)
  assert.match(src, /\.osubs-acct-mark \{[^}]*display: inline-flex/)
})

test('Add account opens a centered dialog, not a sheet', async () => {
  const src = assembleUi()
  assert.match(src, /addAccountTitle:\s*'添加账号'/)
  assert.match(src, /addAccountTitle:\s*'Add account'/)
  assert.match(src, /continueAuth:\s*'继续授权'/)
  assert.match(src, /function CenterDialog/)
  assert.match(src, /role: 'dialog'/)
  assert.match(src, /className: 'osubs-dsw'/)
  assert.match(src, /setAddOpen\(true\)/)
  assert.match(src, /onClick: \(\) => setAddOpen\(true\)/)
  assert.match(src, /label: t\.continueAuth/)
  // Plan D: the dashed tail row is the only add/login entry — appended to
  // the account list, or the logged-out card's only row; no head row.
  assert.match(src, /const addRow = !busy && h\('button', \{\s*type: 'button',\s*className: 'osubs-acct-add',\s*'data-noshot': '',\s*onClick: \(\) => setAddOpen\(true\),\s*\},\s*h\(IconPlus\),\s*t\.addAccount,/)
  assert.match(src, /h\('section', \{ className: 'osubs-card osubs-card--legend', 'data-noshot': roster\.length === 0 \? '' : undefined \},\s*h\('h3', \{ className: 'osubs-card-title' \}, title\)/)
  assert.match(src, /roster\.length === 0 && addRow/)
  assert.match(src, /\.osubs-acct-add \{[^}]*border: 1px dashed/)
  assert.match(src, /id === 'glm' && !busy && h\('div', \{ className: 'osubs-glm-logins' \}/)
  assert.match(src, /id === 'kiro' && !busy && h\('div', \{ className: 'osubs-logins' \}/)
  assert.match(src, /id === 'ollama' && !busy && h\('div', \{ className: 'osubs-logins' \}/)
  assert.match(src, /id === 'cursor' \? t\.cursorImport : id === 'kimi' \? t\.kimiImport : id === 'copilot' \? t\.copilotImport : id === 'devin' \? t\.devinImport : id === 'cline' \? t\.clineImport : id === 'command-code' \? t\.commandCodeImport : t\.import/)
  assert.match(src, /h\('span', null, t\.ollamaImport\)/)
  assert.equal(/osubs-sheet|osubs-drawer|role: 'sheet'|side.?sheet|侧边抽屉/i.test(src), false)
})

test('Add-account dialog guides mid-auth, traps focus, and guards double starts', async () => {
  const src = assembleUi()
  // Header names the family with its mark; focus moves in, is trapped, and returns.
  assert.match(src, /subtitle: title,/)
  assert.match(src, /const trap = \(event\) =>/)
  assert.match(src, /opener\.focus\(\{ preventScroll: true \}\)/)
  // Mid-auth: one AuthPanel with status, copyable code, authorize CTA, paste, cancel.
  assert.match(src, /busy && h\(AuthPanel, \{/)
  assert.match(src, /function PairCode\(\{ t, code, large \}\)/)
  assert.match(src, /navigator\.clipboard\.writeText/)
  assert.match(src, /waitingAuth:\s*'等待授权完成'/)
  assert.match(src, /waitingAuth:\s*'Waiting for authorization'/)
  // One inline method form at a time; secrets masked; empty submits disabled.
  assert.match(src, /const toggleMethod = \(next\) =>/)
  assert.match(src, /'aria-expanded': showKey, onClick: \(\) => toggleMethod\('key'\)/)
  assert.match(src, /placeholder: t\.ollamaKeyPlaceholder,\s*type: 'password',\s*autoFocus: true/)
  assert.match(src, /disabled: !apiKey\.trim\(\), label: t\.ollamaKeyGo/)
  // Start guard: pressed row spins, the rest disable until the host answers.
  assert.match(src, /const begin = async \(key, action, close = false\) =>/)
  assert.match(src, /\.osubs-login\[aria-busy="true"\]::after/)
  // Disabled primary never falls back to transparent bg + primary foreground.
  assert.match(src, /\.osubs-btn--primary\[disabled\] \{[^}]*background: var\(--osubs-fill-2\);[^}]*color: var\(--osubs-faint\)/)
  assert.match(src, /\.osubs a\.osubs-btn--primary:visited/)
})

test('Reset-credit confirm stays a centered alertdialog', async () => {
  const src = assembleUi()
  assert.match(src, /function WarnDialog/)
  assert.match(src, /role: 'alertdialog'/)
  assert.match(src, /quotaResetAck/)
  assert.match(src, /quotaResetConfirmOk/)
  assert.match(src, /event\.key === 'Escape'/)
  assert.match(src, /pending && h\(WarnDialog/)
})

test('Settings has no OpenCode Go Free tab or harness family', async () => {
  const src = assembleUi()
  assert.equal(src.includes("id: 'opencode'"), false)
  assert.equal(src.includes('opencodeTitle'), false)
  assert.equal(src.includes('OpenCode Go Free'), false)
  assert.equal(src.includes('OpenCode Free'), false)
  assert.equal(src.includes('启用免费模型'), false)
  assert.equal(src.includes('Enable free models'), false)
  assert.equal(src.includes('opencode: {'), false)
})

test('Settings Models is a searchable switch table; locked groups still offer sign-in', async () => {
  const src = assembleUi()
  const panel = src.match(/function ModelsPanel\([\s\S]*?\n    \}/)?.[0] ?? ''
  const row = src.match(/function ModelRow\([\s\S]*?\n    \}/)?.[0] ?? ''
  const switchCss = src.match(/\.osubs-switch \{[^}]*\}/)?.[0] ?? ''
  assert.equal(panel.includes('osubs-family--locked'), false)
  assert.match(panel, /t\.modelsNeedLogin/)
  // 登录默认: the group explains why a freshly signed-in family is all-off.
  assert.match(panel, /t\.modelsLoginOff/)
  assert.match(panel, /group\.loggedIn && group\.awaitingPick && h\('span'/)
  assert.match(src, /modelsLoginOff:\s*'登录后默认不勾选'/)
  assert.match(src, /modelsLoginOff:\s*'Off until checked'/)
  assert.match(panel, /onOpenFamily\?\.\(group\.family\)/)
  assert.match(panel, /label: t\.login/)
  assert.match(panel, /className: 'osubs-mtable'/)
  assert.match(panel, /placeholder: t\.modelsSearch/)
  // 默认档位: a native select editing the families in scope (全部 = every family,
  // mixed values read 混合); the pick shows at once and the RPC omits families for 全部.
  assert.match(panel, /scope === 'all' \|\| railIdOf\(group\.family\) === scope/)
  assert.match(panel, /onChange: \(event\) => onEffort\?\.\(event\.target\.value \|\| null, effortFamilies, scope === 'all'\)/)
  assert.match(panel, /effort === 'mixed' && h\('option', \{ value: 'mixed', disabled: true \}, t\.modelsEffortMixed\)/)
  assert.match(src, /run\('models', \{ effort: level, \.\.\.\(all \? \{\} : \{ families \}\) \}\)/)
  assert.match(src, /efforts: \{ \.\.\.snap\?\.efforts, \.\.\.effortOverrides \}/)
  assert.match(panel, /onFamily\(group\.family, true\)/)
  assert.match(panel, /onFamily\(group\.family, false\)/)
  assert.equal(panel.includes('style: { opacity: locked'), false)
  assert.match(row, /const enabled = Boolean\(overrides\?\.\[model\.key\] \?\? model\.enabled\) && !locked/)
  assert.match(row, /h\(Switch, \{/)
  assert.match(row, /onToggle\(model\.key, on\)/)
  assert.match(switchCss, /cursor: pointer/)
  // Toggles flip on click and converge on the next snapshot; a failed models
  // RPC reverts the override (the host settings reconcile takes seconds).
  assert.match(src, /onToggle: \(key, on\) => toggleModels\(\{ key, on \}, \[key\], on\)/)
  assert.match(src, /onFamily: \(fam, on\) => toggleModels\(\{ family: fam, on \}, catalogKeysOf\(fam\), on\)/)
  assert.match(src, /onAll: \(on\) => toggleModels\(\{ all: on \}, catalogKeysOf\(\), on\)/)
  assert.match(src, /setModelOverrides/)
  assert.match(src, /overrides: modelOverrides/)
  assert.match(src, /onOpenFamily: \(fam\) => \{ setFamily\(railIdOf\(fam\)\); setView\('quota'\) \}/)
  assert.match(src, /hidden: !show/)
  // Models pane never scrolls — the fill chain clamps the card so only
  // the model table scrolls and its column head stays pinned.
  assert.match(src, /view === 'models', true\)/)
  assert.match(src, /\.osubs-pane-panel--fill \{[^}]*min-height: 0/)
  assert.match(src, /\.osubs-pane-panel--fill \.osubs-mtable \{[^}]*overflow-y: auto/)
  assert.match(src, /\.osubs-pane-panel--fill \.osubs-mhead \{[^}]*position: sticky/)
  assert.match(src, /modelsHint:\s*'勾选即同步。'/)
  assert.match(src, /modelsHint:\s*'Check to sync\.'/)
  assert.equal(src.includes('Fast 仅 Codex Priority'), false)
  assert.equal(src.includes('900K 默认关'), false)
  assert.equal(src.includes('Fast is Codex Priority only'), false)
})

test('Settings Copilot tab is device-code after Kimi, never @lobehub/icons', async () => {
  const src = assembleUi()
  assert.match(src, /copilot: 'Copilot'/)
  assert.match(src, /copilotLoginApiKey:\s*'粘贴 GitHub Token'/)
  assert.match(src, /copilotLoginApiKey:\s*'Paste GitHub token'/)
  assert.match(src, /copilotImport:\s*'导入本机 Copilot'/)
  assert.match(src, /LobeHub `Copilot` icon/)
  assert.match(src, /quotaPanel\('copilot'\)/)
  assert.match(src, /id === 'grok' \|\| id === 'kimi' \|\| id === 'copilot' \|\| id === 'cline' \? t\.device/)
  assert.match(src, /id === 'copilot' && h\('button'/)
  assert.match(src, /t\.copilotImport/)
  assert.equal(src.includes("from '@lobehub/icons'"), false)
})

test('usage totals count the whole prompt — cache reads fold into 输入', async () => {
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  const empty = src.match(/const emptyUsage = \(\) => \(\{[^\n]*\}\)/)?.[0]
  const body = src.match(/function addUsage\(sum, row, cost = null\) \{[\s\S]*?\n        \}/)?.[0]
  const tokens = src.match(/const usageTokens = \(sum\) => sum\.input \+ sum\.output/)?.[0]
  assert.ok(empty && body && tokens, 'usage helpers not found in the assembled client')
  const { emptyUsage, addUsage, usageTokens } = new Function(`${empty}\n${body}\n${tokens}\nreturn { emptyUsage, addUsage, usageTokens }`)() as any
  const sum = emptyUsage()
  // The 2026-09-30 swe-2 session: uncached 32876 · output 48439 · cacheRead
  // 9503232. Token must reconcile with the host's 9.58M session total, not
  // the 81K an uncached-only count reported.
  addUsage(sum, [0, 'oauth-devin', 'swe-2', 104, 32876, 48439, 9503232, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(usageTokens(sum), 32876 + 48439 + 9503232)
  assert.equal(sum.cacheRead, 9503232)
  // Cost rides the same fold: unpriced rows add nothing, priced ones sum.
  assert.equal(sum.cost, 0)
  addUsage(sum, [0, 'x', 'y', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 1.25)
  addUsage(sum, [0, 'x', 'y', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], null)
  assert.equal(sum.cost, 1.25)
})

test('usage range defaults to 今天 and restores the last choice', async () => {
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  const key = src.match(/const USAGE_RANGE_STORE = '[^']*'/)
  const read = src.match(/function readStoredRange\(\) \{[\s\S]*?\n        \}/)
  const write = src.match(/function writeStoredRange\(range\) \{[\s\S]*?\n        \}/)
  assert.ok(key?.[0] && read?.[0] && write?.[0], 'usage range helpers not found in the assembled client')
  const make = (stored: string | null) => {
    const store = new Map<string, string>()
    if (stored !== null) store.set('dsh-plugin-oauth-subs.usage-range', stored)
    const localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
    }
    const helpers = new Function('localStorage',
      `${key[0]}\n${read[0]}\n${write[0]}\nreturn { readStoredRange, writeStoredRange }`)(localStorage)
    return { ...helpers, store }
  }
  // First open, a stale/garbage value, and a storage that throws all land on 今天.
  assert.equal(make(null).readStoredRange(), 'today')
  assert.equal(make('9').readStoredRange(), 'today')
  assert.equal(make('{}').readStoredRange(), 'today')
  const throwing = new Function('localStorage',
    `${key[0]}\n${read[0]}\nreturn readStoredRange`)({ getItem: () => { throw new Error('private mode') } })
  assert.equal(throwing(), 'today')
  // 7 / 30 restore, and a pick writes the exact value back.
  assert.equal(make('7').readStoredRange(), 7)
  assert.equal(make('30').readStoredRange(), 30)
  const { writeStoredRange, store } = make(null)
  writeStoredRange(7)
  assert.equal(store.get('dsh-plugin-oauth-subs.usage-range'), '7')
  writeStoredRange('today')
  assert.equal(store.get('dsh-plugin-oauth-subs.usage-range'), 'today')
})

test('About Installed prefers the fresher of checkUpdate and snapshot', async () => {
  const src = assembleUi()
  assert.match(src, /function fresherAboutVersion/)
  // One helper for About and the usage share footer, so they never disagree.
  assert.match(src, /return \(linked && devVersion\) \|\| fresherAboutVersion\(update\?\.version, local\?\.version\) \|\| '—'/)
  assert.match(src, /const version = aboutVersionOf\(local, update\)/)
  assert.match(src, /version: aboutVersionOf\(snap\?\.update, update\)/)
  assert.equal(src.includes('const version = local?.version || update?.version'), false)
  assert.match(src, /setSnap\(\(current\) => current \? \{ \.\.\.current, update: \{ \.\.\.current\.update, \.\.\.result \} \}/)
})

test('About shows the derived -dev version for a linked working tree', async () => {
  const src = assembleUi()
  assert.match(src, /const devVersion = update\?\.devVersion \|\| local\?\.devVersion/)
  assert.match(src, /const linkedPath = update\?\.linkedPath \|\| local\?\.linkedPath/)
  // A linked tree fills the 当前版本 slot with the -dev build and keeps the
  // link identity + hot-reload note on the status banner.
  assert.match(src, /title: fill\(t\.verLinkedRun, version\), sub: t\.autoUpdateLinked/)
  // Only 当前版本 / 最新版本 exist as version slots: no 磁盘 / 本地路径 /
  // 加载自 / 发布于 rows, and no status pill in the card head.
  assert.equal(src.includes('t.onDisk'), false)
  assert.equal(src.includes('t.linkedPath'), false)
  assert.equal(src.includes('t.loadedFrom'), false)
  assert.equal(src.includes('null, t.publishedAt'), false)
  assert.equal(src.includes('osubs-pill'), false)
  assert.equal(src.includes('updateLinkedHint'), false)
  assert.equal(src.includes('currentChips: linked'), false)
})

test('About keeps the auto-update switch but states hot reload for a linked tree', async () => {
  const src = assembleUi()
  // The switch stays for every install. A link hot-reloads from the working
  // tree, so the hot-reload note moves to the banner subcopy and the row only
  // reports the last run — a link's release-tag outcome would always read as
  // 「已是最新」.
  assert.match(src, /h\(AutoUpdateRow, \{/)
  assert.match(src, /const bits = linked \? \[\] : \[restartKind === 'app' \? t\.autoUpdateHourlyApp : t\.autoUpdateHourly\]/)
  assert.match(src, /const outcome = linked \? '' : autoRunText\(t, autoState\)/)
  assert.match(src, /autoUpdateLinked: '本地链接：npm run build 后热重载生效，无需重启宿主（需 profile 配 hmr root）'/)
  assert.match(src, /autoUpdateLinked: 'Local link: npm run build hot-reloads the plugin/)
  assert.equal(src.includes("autoUpdateLinked: '每小时检查一次"), false)
})

test('the stale-process hint is link-aware: a linked tree never gets the reinstall advice', async () => {
  const src = assembleUi()
  // The divergence hint picks its copy by install kind. A linked tree's
  // divergence is restart-only (code rides hmr) — the generic tail (remove
  // and re-add from GitHub) would replace the hot link with an installed copy.
  assert.match(src, /fill\(linked \? t\.updateStaleProcessLinked/)
  assert.match(src, /restartKind === 'app' \? t\.updateStaleProcessApp : t\.updateStaleProcess, disk\)/)
  assert.match(src, /updateStaleProcessLinked: '磁盘已是 \{n\}，但当前进程仍加载旧模块，重启宿主后生效；代码改动 npm run build 即热载/)
  assert.match(src, /updateStaleProcessLinked: 'On disk is \{n\}, but this process still runs the old copy — restart the host; code changes hot-reload/)
})

test('restart guidance names what the user actually restarts: the app on desktop, the dsh host elsewhere', async () => {
  const src = assembleUi()
  // 宿主 is plugin jargon; the desktop profile is Electron-managed, so every
  // restart hint there must tell the user to quit and reopen the app.
  assert.match(src, /updateStaleProcessApp: '磁盘已是 \{n\}，但应用仍在运行旧版本。请退出应用后重新打开/)
  assert.match(src, /updateStaleProcessApp: 'On disk is \{n\}, but the app still runs the old copy\. Quit and reopen the app/)
  assert.match(src, /updateInstalledApp: '已安装 \{n\}。请退出应用后重新打开，即可加载新版。'/)
  assert.match(src, /updateInstalledApp: 'Installed \{n\}\. Quit and reopen the app to load it\.'/)
  assert.match(src, /autoUpdateHourlyApp: '每 15 分钟检查一次，装好新版后重启应用生效'/)
  assert.match(src, /autoUpdateHourlyApp: 'Checks every 15 minutes; quit and reopen the app/)
  // The host variants spell out what the host is instead of assuming the term.
  assert.match(src, /updateStaleProcess: '磁盘已是 \{n\}，但当前进程仍在运行旧版本。请重启宿主（运行 dsh 的进程）加载新版/)
  assert.match(src, /updateInstalledHost: '已安装 \{n\}。请重启宿主（运行 dsh 的进程），即可加载新版。'/)
})

test('About status banner: tint encodes actionability, CTA only on an installable update', async () => {
  const src = assembleUi()
  assert.match(src, /function VersionStat\(/)
  // Warn only when a release install can apply — a linked tree keeps its
  // identity and never gets the update CTA.
  assert.match(src, /!linked && update\?\.status === 'update' && latestTag/)
  assert.match(src, /tone: 'warn', icon: h\(IconArrowUp\)/)
  assert.match(src, /tone: 'bad', icon: h\(IconWarning/)
  // 「已是最新」 stays neutral — the ok tint is only the icon tile.
  assert.match(src, /iconTone: 'ok'/)
  assert.equal(src.includes("tone: 'ok'"), false)
})

test('About changelog button sits left of check-update and opens a 3-release dialog', async () => {
  const src = assembleUi()
  const actions = src.match(/className: 'osubs-about-actions'[\s\S]*?label: busy \? t\.checking : t\.checkUpdate/)
  assert.ok(actions, 'about actions block missing')
  assert.match(actions[0], /label: t\.changelog/)
  assert.ok(actions[0].indexOf('t.changelog') < actions[0].lastIndexOf('t.checkUpdate'))
  assert.match(src, /callRpc\(rpc, 'changelog'\)/)
  assert.match(src, /result\.releases\.slice\(0, 3\)/)
  assert.match(src, /osubs-dsw-card osubs-dsw-card--notes/)
  assert.match(src, /changelogTitle: '\{n\} 更新内容'/)
  assert.match(src, /changelog: 'Release notes'/)
  assert.match(src, /changelogTitle: 'What\\'s new in \{n\}'/)
})

test('About panel carries no DSH-cli version rows', async () => {
  const src = assembleUi()
  assert.equal(src.includes('dshLatestTag'), false)
  assert.equal(src.includes('dshStableVersion'), false)
  assert.equal(src.includes('dshTag'), false)
})

test('ResetBank serves Codex, Grok and GLM: one row per window, spends the earliest-expiring card', async () => {
  const src = assembleUi()
  // One shared bank; no per-family boxes.
  assert.match(src, /h\(ResetBank, \{ t, quota, family, onReset \}\)/)
  assert.equal(src.includes('GlmResetBox'), false)
  assert.equal(src.includes('QuotaResetBox'), false)
  // GLM splits by card type, Codex is one weekly row.
  assert.match(src, /\[\{ key: 'FIVE_HOUR', window: 'resetWinFive' \}, \{ key: 'WEEK', window: 'resetWinWeek' \}\]/)
  assert.match(src, /: \[\{ key: 'all', window: 'resetWinWeek' \}\]/)
  // Grok cards go through the same bank and carry the picked card id.
  assert.match(src, /onReset: \(id === 'codex' \|\| id === 'glm' \|\| id === 'grok'\) && onResetQuota/)
  assert.match(src, /provider === 'glm' \|\| provider === 'grok' \? \{ credit \}/)
  assert.match(src, /\.sort\(\(a, b\) => expiryOf\(a\) - expiryOf\(b\)\)/)
  assert.match(src, /const next = group\.cards\[0\]/)
  assert.match(src, /disabled: busyKey !== null \|\| count === 0/)
  // A drop in count plays the spend animation; reduced motion keeps a fade.
  assert.match(src, /group\.cards\.length < was/)
  assert.match(src, /@keyframes osubs-card-spend/)
  assert.match(src, /\.osubs-rcard--ghost \{ animation: osubs-fade-out/)
  // Hover / focus on the count card lists one expiry line per banked card.
  assert.match(src, /h\(ResetStack, \{ t, count, cards: group\.cards,/)
  assert.match(src, /hasTip && tipOpen && h\('span', \{ id: tipId, role: 'tooltip', className: 'osubs-rtip' \},\s*cards\.map\(/)
  assert.match(src, /onMouseEnter: open,\s*onMouseLeave: shut,\s*onFocus: open,\s*onBlur: shut,/)
  // One drawn card per banked card; the white edge stays inset.
  assert.match(src, /const behind = Math.max\(0, count - 1\)/)
  assert.equal(/Math\.min\(count, 3\)/.test(src), false)
  assert.match(src, /className: 'osubs-rcard-back'/)
  assert.match(src, /--rcard-step: 8px/)
  assert.match(src, /--rcard-edge: inset 0 0 0 1px var\(--dsw-alias-bg-layer-2, #fff\)/)
  assert.equal(src.includes('top: -4px'), false)
})

test('resetGroups drops a lapsed card at render time, before the next quota read', async () => {
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  const pick = (name: string) => src.match(new RegExp(`function ${name}\\(.*\\) \\{[\\s\\S]*?\\n        \\}`))?.[0]
  const bodies = ['expiryOf', 'resetCreditRows', 'resetGroups'].map(pick)
  assert.ok(bodies.every(Boolean))
  const resetGroups = new Function(`${bodies.join('\n')}; return resetGroups`)() as
    (quota: any, family: string, now?: number) => Array<{ key: string, cards: Array<{ id: string }> }>
  const now = 1_000_000
  const quota = { resetCredits: { credits: [
    { id: 'lapsed', expiresAt: now - 1 },
    { id: 'edge', expiresAt: now },
    { id: 'later', expiresAt: now + 60_000 },
    { id: 'open' },
  ] } }
  // Expiry at or before now is gone; a card with no expiry stays last.
  assert.deepEqual(resetGroups(quota, 'codex', now)[0].cards.map((card) => card.id), ['later', 'open'])
  // A minute later the next card lapses too.
  assert.deepEqual(resetGroups(quota, 'codex', now + 60_000)[0].cards.map((card) => card.id), ['open'])
})

test('分享 on 额度: identities masked in the image, add-account row and account actions left out', async () => {
  const src = assembleUi()
  assert.match(src, /h\('span', \{ className: 'osubs-mono', 'data-shot-mask': '' \}, identityOf\(row, id\)\)/)
  assert.match(src, /className: 'osubs-acct-add',\n\s*'data-noshot': '',/)
  assert.match(src, /className: 'osubs-actions', 'data-noshot': ''/)
  // A family with no account drops out of the image, wrapper included.
  assert.match(src, /'data-noshot': roster\.length === 0 \? '' : undefined/)
  assert.match(src, /\.osubs-shooting \.osubs-pane-panel:has\(> \[data-noshot\]\)/)
  // Masking lives in the clone only; the page keeps the full identity.
  assert.match(src, /if \(source\.hasAttribute\('data-shot-mask'\)\) \{\n\s*copy\.textContent = maskIdentity\(source\.textContent\)/)
})

test('account card 切换/刷新/退出 are icon-only buttons that keep their names', async () => {
  const src = assembleUi()
  // The glyph is the whole label for all three account actions.
  assert.match(src, /!row\.active && h\(Button, \{\n\s*size: 'sm',\n\s*icon: true,/)
  assert.match(src, /function IconSwitch\(\) \{/)
  assert.match(src, /label: h\(IconSwitch\),/)
  assert.match(src, /title: t\.switchTo,\n\s*ariaLabel: t\.switchTo,/)
  assert.match(src, /icon: true,\n\s*disabled: refreshing,/)
  assert.match(src, /h\('span', \{ className: 'osubs-refresh' \+ \(refreshing \? ' osubs-refresh--spin' : ''\) \},\n\s*h\(IconRefresh\)\),/)
  // Only the account card went icon-only: the 用量 head's 刷新 keeps its text.
  assert.equal(src.includes("label: t.switchTo"), false)
  assert.equal(src.split('h(IconRefresh), t.quotaRefresh)').length - 1, 1)
  assert.match(src, /function IconLogout\(\) \{/)
  assert.match(src, /label: h\(IconLogout\),/)
  // Losing the text must not lose the accessible name: Button forwards both.
  assert.match(src, /title: t\.quotaRefresh,\n\s*ariaLabel: t\.quotaRefresh,/)
  assert.match(src, /title: t\.logout,\n\s*ariaLabel: t\.logout,/)
  assert.match(src, /'aria-label': ariaLabel,/)
  // Square comes from the size modifier's height, so no fixed width.
  assert.match(src, /\.osubs-btn--icon \{ padding: 0; aspect-ratio: 1; flex: none; \}/)
})

test('Settings formatReset no longer rounds remaining hours', async () => {
  const src = assembleUi()
  assert.match(src, /const hours = Math\.floor\(\(totalMinutes % 1440\) \/ 60\)/)
  assert.match(src, /const minutes = totalMinutes % 60/)
  assert.match(src, /resetIn:\s*'\{n\}后重置'/)
  assert.match(src, /resetIn:\s*'resets in \{n\}'/)
  assert.equal(src.includes('Math.round(minutes / 60)'), false)
  assert.equal(src.includes('resetHours:'), false)
  assert.equal(src.includes('if (days >= 14) return formatStamp(resetAt)'), false)
})
