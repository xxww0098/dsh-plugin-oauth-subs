import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { GLM_BOOST_HINT, GLM_BOOST_LABEL, glmCardBoost } from '../lib/oauth/glm/boost.js'

function accountCardPills(family, locale, { plan, active, region } = {}) {
  const tags = []
  if (plan) tags.push(plan)
  if (active) tags.push(locale === 'en' ? 'In use' : '使用中')
  if (family === 'glm' && region) tags.push(region)
  const boost = glmCardBoost(family, locale)
  if (boost) tags.push(boost.label)
  return tags
}

test('GLM card boost wording is exactly 150%配额 / 150% quota', () => {
  assert.equal(GLM_BOOST_LABEL.zh, '150%配额')
  assert.equal(GLM_BOOST_LABEL.en, '150% quota')
  assert.equal(GLM_BOOST_HINT.zh, 'ZCode 登录使用享 150%配额')
  assert.equal(GLM_BOOST_HINT.en, 'ZCode session: 150% quota')
  assert.deepEqual(glmCardBoost('glm', 'zh'), {
    label: '150%配额',
    hint: 'ZCode 登录使用享 150%配额',
  })
  assert.deepEqual(glmCardBoost('glm', 'en'), {
    label: '150% quota',
    hint: 'ZCode session: 150% quota',
  })
})

test('GLM logged-in card render includes the 150% boost pill; other families do not', () => {
  const glmZh = accountCardPills('glm', 'zh', { plan: 'LITE', active: true, region: '中国' })
  const glmEn = accountCardPills('glm', 'en', { plan: 'LITE', active: true, region: 'China' })
  assert.deepEqual(glmZh, ['LITE', '使用中', '中国', '150%配额'])
  assert.deepEqual(glmEn, ['LITE', 'In use', 'China', '150% quota'])
  assert.equal(glmZh.includes('150%配额'), true)
  assert.equal(glmEn.includes('150% quota'), true)

  for (const family of ['codex', 'grok', 'antigravity']) {
    const zh = accountCardPills(family, 'zh', { plan: 'Pro', active: true })
    const en = accountCardPills(family, 'en', { plan: 'Pro', active: true })
    assert.equal(zh.includes('150%配额'), false)
    assert.equal(en.includes('150% quota'), false)
    assert.equal(glmCardBoost(family, 'zh'), undefined)
    assert.equal(glmCardBoost(family, 'en'), undefined)
  }
})

test('Settings GLM card hides opaque ZCode user.id in identityOf', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /function isGlmOpaqueIdentity/)
  assert.match(src, /family === 'glm'\) return account && !isGlmOpaqueIdentity\(account\) \? account : ''/)
  assert.match(src, /\[A-Za-z0-9\]\{2,24\}/)
})

test('Settings client paints the GLM boost pill and hint only on the GLM card', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /glmBoost:\s*'150%配额'/)
  assert.match(src, /glmBoost:\s*'150% quota'/)
  assert.match(src, /glmBoostHint:\s*'ZCode 登录使用享 150%配额'/)
  assert.match(src, /glmBoostHint:\s*'ZCode session: 150% quota'/)
  assert.match(src, /id === 'glm' && h\('span', \{ className: 'osubs-tag osubs-tag--plain' \}, t\.glmBoost\)/)
  assert.match(src, /family === 'glm' && h\('p', \{ className: 'osubs-note' \}, t\.glmBoostHint\)/)
  assert.equal((src.match(/t\.glmBoost\b/g) || []).length, 1)
  assert.equal((src.match(/t\.glmBoostHint\b/g) || []).length, 1)
})

test('Settings Ollama card hides ollama-hex title and uses remaining row labels', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /function isOllamaOpaqueIdentity/)
  assert.match(src, /family === 'ollama'\) return account && !isOllamaOpaqueIdentity\(account\) \? account : ''/)
  assert.match(src, /family === 'ollama'/)
  assert.match(src, /if \(row\.kind === 'primary'\) return t\.primary/)
  assert.match(src, /if \(row\.kind === 'weekly'\) return t\.weekly/)
  assert.match(src, /row\.note && h\('span', \{ className: 'osubs-note' \}, row\.note\)/)
  assert.match(src, /if \(family === 'ollama'\) \{[\s\S]*return 'Pro'/)
  assert.match(src, /\.osubs-note \{[^}]*white-space: pre-wrap/)
  assert.match(src, /\.osubs-note \{[^}]*overflow-wrap: anywhere/)
  assert.equal(/\.osubs-note \{[^}]*white-space: nowrap/.test(src), false)
})

test('Settings Cursor tab uses Import local Cursor copy and shows source, never tokens', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /cursorImport:\s*'导入本机 Cursor'/)
  assert.match(src, /cursorImport:\s*'Import local Cursor'/)
  assert.match(src, /cursorImportEmpty:\s*'本机没有 Cursor CLI 或 IDE 登录'/)
  assert.match(src, /id === 'cursor' \? t\.cursorImport : id === 'kimi' \? t\.kimiImport : t\.import/)
  assert.match(src, /\(id === 'cursor' \|\| id === 'ollama' \|\| id === 'kimi'\) && row\.methodLabel/)
  assert.match(src, /message === 'cursor-import-empty' \? t\.cursorImportEmpty/)
  assert.match(src, /h\(Tab, \{ id: 'cursor'/)
  assert.match(src, /icons\/\{codex,grok,zai,kiro,antigravity,cursor,ollama,kimi,opencode,github\}\.svg/)
  assert.match(src, /cursor: \{ d: 'M22\.106 5\.68L12\.5\.135a\.998\.998 0 00-\.998 0L1\.893 5\.68/)
  assert.match(src, /cursor: \{ d: '[^']+', clip: true \}/)
  assert.equal(src.includes('M11.925 24l10.425-6'), false)
  assert.equal(src.includes('session.accessToken'), false)
  assert.equal(/cursor[\s\S]{0,200}accessToken/.test(src), false)
  const tabOrder = src.match(/h\(Tab, \{ id: '(\w+)'/g) ?? []
  const ids = tabOrder.map((row) => /id: '(\w+)'/.exec(row)?.[1])
  assert.deepEqual(ids.slice(0, 11), ['codex', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'opencode', 'models', 'about'])
})

test('Settings Ollama tab is Cloud key paste after Cursor, never localhost', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /ollamaTitle:\s*'Ollama Cloud'/)
  assert.equal((src.match(/ollamaTitle:\s*'Ollama Cloud'/g) || []).length, 2)
  assert.match(src, /ollamaLoginApiKey:\s*'粘贴 API Key'/)
  assert.match(src, /ollamaLoginApiKey:\s*'Paste API key'/)
  assert.match(src, /ollamaImport:\s*'导入 OLLAMA_API_KEY'/)
  assert.match(src, /h\(Tab, \{ id: 'ollama'/)
  assert.match(src, /tab === 'ollama' && card\('ollama'/)
  assert.match(src, /ollama: \{ d: 'M7\.905 1\.09/)
  assert.match(src, /id === 'ollama' && !busy && h\('div', \{ className: 'osubs-logins' \}/)
  assert.match(src, /h\('span', null, t\.ollamaImport\)/)
  assert.match(src, /id !== 'glm' && id !== 'kiro' && id !== 'ollama' && id !== 'opencode'/)
  assert.equal(src.includes('127.0.0.1:11434'), false)
  assert.equal(src.includes('localhost:11434'), false)
  assert.match(src, /\.osubs-tabs \{[\s\S]*grid-template-columns: repeat\(8, 36px\)/)
  assert.match(src, /\.osubs-tab \{[\s\S]*width: 36px; height: 36px; min-width: 36px/)
  assert.equal(/\.osubs-tab \{[\s\S]*flex: 1 1 0/.test(src), false)
  assert.equal(/\.osubs-tabs \{[\s\S]*flex: 1 1 0/.test(src), false)
  assert.match(src, /\.osubs-nav \{[\s\S]*position: sticky/)
})

test('Settings tab bar is two docked capsules; OAuth spreads leftover width between 8 icons', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  const oauth = src.match(/className: 'osubs-tabs'[\s\S]*?className: 'osubs-tabs-util'/)?.[0] ?? ''
  const util = src.match(/className: 'osubs-tabs-util'[\s\S]*?\),\s*\),/)?.[0] ?? ''
  assert.match(src, /className: 'osubs-nav', role: 'tablist'/)
  const navCss = src.match(/\.osubs-nav \{[^}]*\}/)?.[0] ?? ''
  const tabsCss = src.match(/\.osubs-tabs \{[^}]*\}/)?.[0] ?? ''
  const utilCss = src.match(/\.osubs-tabs-util \{[^}]*\}/)?.[0] ?? ''
  const tabCss = src.match(/\.osubs-tab \{[^}]*\}/)?.[0] ?? ''
  assert.match(navCss, /display: flex;/)
  assert.match(navCss, /justify-content: flex-start/)
  assert.match(navCss, /gap: 4px/)
  assert.equal(navCss.includes('space-between'), false)
  assert.match(tabsCss, /grid-template-columns: repeat\(8, 36px\)/)
  assert.match(tabsCss, /justify-content: space-between/)
  assert.match(tabsCss, /flex: 1 1 auto/)
  assert.equal(tabsCss.includes('max-content'), false)
  assert.equal(tabsCss.includes('flex: none'), false)
  assert.match(tabCss, /width: 36px; height: 36px; min-width: 36px/)
  assert.equal(tabCss.includes('flex: 1 1 0'), false)
  assert.match(utilCss, /grid-template-columns: 36px/)
  assert.equal(utilCss.includes('margin-left: auto'), false)
  assert.match(oauth, /id: 'codex'/)
  assert.match(oauth, /id: 'kimi'/)
  assert.match(oauth, /id: 'opencode'/)
  assert.equal(/id: 'models'/.test(oauth), false)
  assert.equal(/id: 'about'/.test(oauth), false)
  assert.match(util, /id: 'models'/)
  assert.match(util, /id: 'about'/)
  assert.equal(/id: 'kimi'/.test(util), false)
  assert.equal(/id: 'opencode'/.test(util), false)
  const tabOrder = src.match(/h\(Tab, \{ id: '(\w+)'/g) ?? []
  const ids = tabOrder.map((row) => /id: '(\w+)'/.exec(row)?.[1])
  assert.deepEqual(ids, ['codex', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'opencode', 'models', 'about'])
})

test('Settings Kimi tab uses LobeHub Kimi path, device login, and never @lobehub/icons', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /kimiTitle:\s*'月之暗面'/)
  assert.match(src, /kimiTitle:\s*'Kimi'/)
  assert.match(src, /kimiImport:\s*'导入本机 Kimi Code'/)
  assert.match(src, /kimiImport:\s*'Import local Kimi Code'/)
  assert.match(src, /LobeHub `Kimi` icon/)
  assert.match(src, /kimi: \{ d: 'M21\.846 0a1\.923/)
  assert.match(src, /h\(Tab, \{ id: 'kimi', label: t\.kimiTitle, current: tab, onSelect: setTab, icon: 'kimi' \}/)
  assert.match(src, /tab === 'kimi' && card\('kimi'/)
  assert.match(src, /id === 'grok' \|\| id === 'kimi' \? t\.device/)
  assert.match(src, /id === 'kimi' && showKey && !busy/)
  assert.match(src, /family === 'kimi'\) return account && !isKimiOpaqueIdentity/)
  assert.equal(src.includes("from '@lobehub/icons'"), false)
  assert.equal(src.includes('require(\'@lobehub/icons\')'), false)
})

test('Settings Antigravity card shows a verify banner, not API-key-invalid', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /antigravityVerify:\s*'Google 需要验证此账号才能对话'/)
  assert.match(src, /antigravityVerifyGo:\s*'去验证'/)
  assert.match(src, /id === 'antigravity' && row\.needsValidation/)
  assert.match(src, /window\.open\(row\.validationUrl/)
  assert.equal(src.includes('API 密钥无效'), false)
})

test('authorize URL and user code hide when the provider is no longer busy', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
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
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  const hintCss = src.match(/\.osubs-hint \{[^}]*\}/)?.[0] ?? ''
  const badCss = src.match(/\.osubs-bad \{[^}]*\}/)?.[0] ?? ''
  assert.match(hintCss, /display: block/)
  assert.match(hintCss, /max-width: 100%/)
  assert.match(hintCss, /overflow-wrap: anywhere/)
  assert.match(hintCss, /word-break: break-word/)
  assert.match(hintCss, /white-space: pre-wrap/)
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
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /function remainingPercentOf\(row\)/)
  assert.match(src, /function RemainingBar/)
  assert.match(src, /function QuotaMeter/)
  assert.match(src, /typeof row\?\.remainingPercent === 'number'/)
  assert.match(src, /100 - row\.usedPercent/)
  assert.match(src, /const remaining = remainingPercentOf\(row\)/)
  assert.match(src, /h\(QuotaMeter,/)
  assert.match(src, /h\(RemainingBar, \{ remainingPercent, tone \}\)/)
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

test('Add account opens a centered dialog, not a sheet', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /addAccountTitle:\s*'添加账号'/)
  assert.match(src, /addAccountTitle:\s*'Add account'/)
  assert.match(src, /continueAuth:\s*'继续授权'/)
  assert.match(src, /function CenterDialog/)
  assert.match(src, /role: 'dialog'/)
  assert.match(src, /className: 'osubs-dsw'/)
  assert.match(src, /setAddOpen\(true\)/)
  assert.match(src, /id === 'opencode' \? onLogin\(id\) : setAddOpen\(true\)/)
  assert.match(src, /id === 'opencode' \? t\.opencodeEnable : loggedIn \? t\.addAccount : t\.login/)
  assert.match(src, /id === 'glm' && !busy && h\('div', \{ className: 'osubs-glm-logins' \}/)
  assert.match(src, /id === 'kiro' && !busy && h\('div', \{ className: 'osubs-logins' \}/)
  assert.match(src, /id === 'ollama' && !busy && h\('div', \{ className: 'osubs-logins' \}/)
  assert.match(src, /id === 'cursor' \? t\.cursorImport : id === 'kimi' \? t\.kimiImport : t\.import/)
  assert.match(src, /h\('span', null, t\.ollamaImport\)/)
  assert.equal(/osubs-sheet|osubs-drawer|role: 'sheet'|side.?sheet|侧边抽屉/i.test(src), false)
})

test('Reset-credit confirm stays a centered alertdialog', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /function WarnDialog/)
  assert.match(src, /role: 'alertdialog'/)
  assert.match(src, /quotaResetAck/)
  assert.match(src, /quotaResetConfirmOk/)
  assert.match(src, /event\.key === 'Escape'/)
  assert.match(src, /pending && h\(WarnDialog/)
})

test('Settings OpenCode tab is anonymous enable after Kimi, never Authorization or @lobehub/icons', async () => {
  const src = await readFile(new URL('../src/ui/client.ts', import.meta.url), 'utf8')
  assert.match(src, /opencodeTitle:\s*'OpenCode Free'/)
  assert.equal((src.match(/opencodeTitle:\s*'OpenCode Free'/g) || []).length, 2)
  assert.match(src, /opencodeEnable:\s*'启用免费模型'/)
  assert.match(src, /opencodeEnable:\s*'Enable free models'/)
  assert.match(src, /LobeHub `OpenCode` icon/)
  assert.match(src, /opencode: \{ d: 'M16 6H8v12h8V6zm4 16H4V2h16v20z', clip: true \}/)
  assert.match(src, /h\(Tab, \{ id: 'opencode', label: t\.opencodeTitle, current: tab, onSelect: setTab, icon: 'opencode' \}/)
  assert.match(src, /tab === 'opencode' && card\('opencode'/)
  assert.match(src, /id === 'opencode' && !busy && h\('div', \{ className: 'osubs-logins' \}/)
  assert.match(src, /t\.opencodeEnable/)
  assert.match(src, /id === 'opencode' \? onLogin\(id\) : setAddOpen\(true\)/)
  assert.match(src, /id === 'opencode' \? t\.opencodeEnable : loggedIn \? t\.addAccount : t\.login/)
  assert.match(src, /quota\.status === 'ready' && !hasUsage && family !== 'opencode'/)
  assert.equal(src.includes("from '@lobehub/icons'"), false)
  assert.equal(src.includes('Authorization'), false)
})
