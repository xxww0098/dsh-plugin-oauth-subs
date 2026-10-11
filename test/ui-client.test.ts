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
  assert.match(src, /if \(method === 'models' && result && typeof result === 'object'\) \{[\s\S]*?if \(mine < snapSeen\.current\) return true\s*snapSeen\.current = mine\s*setSnap\(result\)\s*writeStoredSnap\(result\)\s*setError\(''\)\s*\} else if \(method !== 'update'\) \{\s*await refresh\(true\)\s*\}/)
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

test('设置 tab ships a standalone 代理 card with a tri-state seg and a custom URL row', async () => {
  const src = assembleUi()
  // Own card, mounted below the update card in the version panel.
  assert.match(src, /function ProxyCard\(\{ t, proxy, rpc, onProxy \}\)/)
  const aboutAt = src.indexOf('h(AboutPanel, {')
  const proxyAt = src.indexOf('h(ProxyCard, {')
  assert.ok(aboutAt >= 0 && proxyAt > aboutAt, '代理 card renders below the OAuth 订阅 update card')
  // Segmented control: 自动 / 关闭 / 自定义 in that order, active = primary.
  assert.match(src, /\[\['auto', t\.proxyAuto\], \['off', t\.proxyOff\], \['custom', t\.proxyCustom\]\]/)
  assert.match(src, /variant: mode === id \? 'primary' : undefined/)
  // Writes go through the tri-state RPCs; auto/off persist immediately.
  assert.match(src, /callRpc\(rpc, 'proxyGet'\)/)
  assert.match(src, /callRpc\(rpc, 'proxySet', payload\)/)
  // The raw custom URL (credentials included) stays card-local: the snapshot
  // merge only ever sees redacted display fields, so localStorage never holds it.
  assert.match(src, /function proxyDisplayFields\(view\)/)
  assert.match(src, /url: view\.resolved \?\? view\.url \?\? ''/)
  assert.match(src, /onProxy: \(next\) => setSnap\(\(current\) => current \? \{ \.\.\.current, proxy: next \} : current\)/)
  assert.equal(src.includes('writeStoredSnap(result.url'), false)
  // Config-pinned proxy locks the seg; the scope note sets expectations.
  assert.match(src, /proxyConfigLocked: '已由插件配置 proxyUrl 固定，此处的选择不生效'/)
  assert.match(src, /proxyConfigLocked: 'Pinned by the plugin config proxyUrl; choices here have no effect'/)
  assert.match(src, /proxyFollowOs: '跟随系统代理：\{n\}'/)
  assert.match(src, /proxyFollowOs: 'Following system proxy: \{n\}'/)
  assert.match(src, /proxyOffNote: '已关闭：上游请求直连，忽略系统与环境变量代理'/)
  assert.match(src, /proxyScopeNote: '作用于本插件的全部上游请求（对话、额度、登录、目录、更新检查）'/)
  assert.match(src, /proxyUrlPlaceholder: 'http:\/\/127\.0\.0\.1:7890'/)
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
  assert.match(src, /id === 'cursor' \? t\.cursorImport : id === 'kimi' \? t\.kimiImport : id === 'devin' \? t\.devinImport : id === 'cline' \? t\.clineImport : id === 'command-code' \? t\.commandCodeImport : t\.import/)
  assert.match(src, /\(id === 'cursor' \|\| id === 'ollama' \|\| id === 'kimi' \|\| id === 'devin' \|\| id === 'cline' \|\| id === 'command-code'\) && row\.methodLabel/)
  assert.match(src, /message === 'cursor-import-empty' \? t\.cursorImportEmpty/)
  assert.match(src, /quotaPanel\('cursor'\)/)
  assert.match(src, /icons\/\{grok,zai,cursor,ollama,cline,github,opencode,openai\}\.svg/)
  assert.match(src, /icons\/\{codex,kiro,antigravity,kimi,devin,deepseek\}-color\.svg/)
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
  // OpenCode Zen is its own card right after the account it shares a key with.
  assert.deepEqual(ids, ['codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'devin', 'cline', 'opencode-go', 'opencode-zen', 'command-code'])
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
  assert.deepEqual(pageIds, ['quota', 'models', 'usage', 'arena', 'version', 'donate'])

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
  assert.match(src, /'kimi', 'devin', 'cline', 'opencode-go',/)
  const panelOrder = src.match(/quotaPanel\('([\w-]+)'/g) ?? []
  const ids = panelOrder.map((row) => /quotaPanel\('([\w-]+)'/.exec(row)?.[1])
  // OpenCode Zen is its own card right after the account it shares a key with.
  assert.deepEqual(ids, ['codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'devin', 'cline', 'opencode-go', 'opencode-zen', 'command-code'])
})

test('Arena view names its source and links to the official board', async () => {
  const src = assembleUi()
  assert.match(src, /ARENA_SOURCE_URL = 'https:\/\/arena\.ai\/leaderboard\/agent'/)
  // The footer link targets the category route being viewed — routes, not
  // the upstream dataSource slugs (chat → consumer, work → gdp).
  assert.match(src, /\['overall', 'arenaCatOverall', ''\]/)
  assert.match(src, /\['chat', 'arenaCatChat', '\/chat'\]/)
  assert.match(src, /\['work', 'arenaCatWork', '\/work'\]/)
  assert.match(src, /className: 'osubs-link osubs-afoot-link',\n\s*href: ARENA_SOURCE_URL \+ \(ARENA_CATEGORIES\.find\(\(\[id\]\) => id === category\)\?\.\[2\] \?\? ''\),\n\s*target: '_blank', rel: 'noreferrer',/)
  assert.match(src, /t\.arenaSource, ' ',/)
  assert.match(src, /' · ', t\.arenaSourceNote,/)
  // The footline ends with the last-refresh timestamp (data.at — when we
  // pulled the snapshot, distinct from the snapshot's own date in the header).
  assert.match(src, /data\?\.at \? h\('span', \{ className: 'osubs-afoot-at' \},\s*' · ', fill\(t\.arenaFetched, stamp\(data\.at\)\)\) : null/)
  assert.match(src, /arenaFetched: '上次刷新 \{n\}'/)
  assert.match(src, /arenaFetched: 'Refreshed \{n\}'/)
  // Attribution sits in a footline that never takes part in the fill layout.
  assert.match(src, /\.osubs-afoot \{ flex: none; \}/)
  assert.match(src, /arenaSource: '数据来源'/)
  assert.match(src, /arenaSource: 'Data from'/)
  // The 排名 table carries the site's Cost/Task (P50) column: sortable head,
  // right-aligned money figures, — for unpriced models; narrow panes keep it
  // while Confirmed Success drops.
  assert.match(src, /arenaColCost: '每任务成本（P50）'/)
  assert.match(src, /sortButton\('costUsd', t\.arenaColCost, true\)/)
  assert.match(src, /className: 'osubs-atcell osubs-atcell--cost', role: 'cell' \},\n\s+row\.costUsd != null/)
  assert.match(src, /arenaUsd\(row\.costUsd\)\)/)
  assert.match(src, /\.osubs-acost \{ font-size: 12px; color: var\(--osubs-muted\); font-variant-numeric: tabular-nums; white-space: nowrap; \}/)
  assert.match(src, /grid-template-columns: 48px minmax\(0, 1fr\) minmax\(190px, 34%\) minmax\(104px, auto\) minmax\(72px, auto\);/)
  assert.match(src, /\.osubs-atcell--success \{ display: none; \}/)
})

test('Arena view shares a long shot of the table through the usage pipeline', async () => {
  const src = assembleUi()
  // The panel rides the same 分享 pipeline as 用量/额度 and gets the footer facts.
  assert.match(src, /function ArenaPanel\(\{ t, data, error, busy, onRefresh, version, repo \}\)/)
  assert.match(src, /const shot = useShot\(t\)\n\s+const shareRef = useRef\(null\)/)
  assert.match(src, /h\(ShareButton, \{ t, busy: shot\.busy, disabled: !board/)
  assert.match(src, /shot\.start\(shareRef\.current, shotFooter\(t, \{/)
  assert.match(src, /atLabel: fill\(t\.arenaUpdated, stamp\(board\.lastUpdated \|\| data\.at\)\),/)
  assert.match(src, /scope: `\$\{t\.tabArena\} · \$\{t\[ARENA_CATEGORIES\.find/)
  assert.match(src, /`oauth-subs-arena-\$\{stamp\(Date\.now\(\)\)\.slice\(0, 10\)\}\.png`/)
  assert.match(src, /version: aboutVersionOf\(snap\?\.update, update\),\n\s+repo: aboutRepoOf\(snap\?\.update, update\),\n\s+\}\), view === 'arena', true\)/)
  // Only board content enters the image: controls drop out via [data-noshot].
  assert.match(src, /h\('header', \{ className: 'osubs-uhead', 'data-noshot': '' \}/)
  assert.match(src, /h\('div', \{ className: 'osubs-atools', 'data-noshot': '' \}/)
  // During the shot the section leaves the fill layout and the table unscrolls.
  assert.match(src, /\.osubs-arena\.osubs-shooting \{ flex: none; \}/)
  assert.match(src, /\.osubs-arena\.osubs-shooting \.osubs-atable \{ flex: none; overflow: visible; \}/)
  // shotFooter takes an optional date override so arena stamps the snapshot.
  assert.match(src, /date: atLabel \?\? fill\(t\.usageAnalyzed, stamp\(at\)\),/)
})

test('Arena view offers the Pareto frontier chart from cached rows', async () => {
  const src = assembleUi()
  // View switch (排名/性价比 — the site's Ranking/Pareto) persists like the
  // category pick and swaps the
  // pane; both buttons carry the site's glyphs (list / axes-plus-curve).
  assert.match(src, /const ARENA_VIEW_STORE = 'dsh-plugin-oauth-subs\.arena-view'/)
  assert.match(src, /const \[viewMode, setViewMode\] = useState\(readStoredArenaView\)/)
  assert.match(src, /\[\['rank', t\.arenaViewRank\], \['pareto', t\.arenaViewPareto\]\]\.map/)
  assert.match(src, /viewMode === 'pareto' \? h\(ArenaPareto, \{ t, rows: sorted \}\) : table/)
  assert.match(src, /function ViewIconRank\(\)/)
  assert.match(src, /h\('path', \{ d: 'M20 20H4V4' \}\)/)
  assert.match(src, /h\('path', \{ d: 'M4 7l8 8 3-3 4\.5 4\.5' \}\)/)
  assert.match(src, /label: h\('span', \{ className: 'osubs-vseg' \}, id === 'rank' \? h\(ViewIconRank\) : h\(ViewIconPareto\), label\)/)
  // The frontier is a cheapest-first sweep keeping every new best value —
  // parameterised on an X accessor so the metric tab can re-derive it.
  assert.match(src, /function arenaFrontier\(rows, xOf = \(row\) => row\.costUsd\) \{/)
  assert.match(src, /\.sort\(\(a, b\) => xOf\(a\) - xOf\(b\)\)/)
  assert.match(src, /if \(row\.value > best\) \{ front\.push\(row\); best = row\.value \}/)
  // Chart geometry and domains measured off the live site: 788×380 viewBox
  // (the logical coordinate space stays fixed; the browser scales it to the
  // column width so narrow layouts shrink rather than clip), 688×280 plot at
  // (80,30), X = [min×0.7, max×1.3] reversed log, Y pads the rating
  // extremes; dollar ticks sit on the BOTTOM axis (site draws them at
  // B+19 below the plot, not on top).
  assert.match(src, /const W = 788, H = 380, L = 80, T = 30, PW = 688, PH = 280/)
  assert.match(src, /Math\.min\(\.\.\.priced\.map\(\(row\) => xOf\(row\)\)\) \* 0\.7/)
  assert.match(src, /Math\.max\(\.\.\.priced\.map\(\(row\) => xOf\(row\)\)\) \* 1\.3/)
  assert.match(src, /vLo - Math\.abs\(vLo\) \* 0\.34/)
  assert.match(src, /vHi \+ Math\.abs\(vHi\) \* 0\.947/)
  // X is a reversed log scale over the *current* zoom window [lo,hi].
  assert.match(src, /\(hi - Math\.log10\(Math\.max\(c, Math\.pow\(10, lo\)\)\)\) \/ \(hi - lo\) \* PW/)
  assert.match(src, /h\('text', \{ className: 'osubs-aptick', x: px\(c\), y: B \+ 19, textAnchor: 'middle' \}, METRIC\.fmt\(c\)\)/)
  assert.match(src, /h\('svg', \{/)
  assert.match(src, /viewBox: `0 0 \$\{W\} \$\{H\}`/)
  // Dashed grid everywhere, solid frame ticks, 2.5px line with lead-in/out
  // past the plot edges. The r=5 svg circles are VISIBLE green dots (the
  // site fills them #40b841); the white 28×28 marker tiles with a 2px
  // green border + org icon sit on top.
  assert.match(src, /\.osubs-apgrid \{ stroke: var\(--osubs-line\); stroke-width: 1; stroke-dasharray: 4 4; \}/)
  assert.match(src, /\.osubs-apline \{\s*fill: none; stroke: var\(--osubs-ok\); stroke-width: 2\.5;/)
  assert.match(src, /h\('line', \{ className: 'osubs-apline', x1: L - 10, x2: leftEnd\.x, y1: leftEnd\.y, y2: leftEnd\.y \}\)/)
  assert.match(src, /h\('line', \{ className: 'osubs-apline', x1: rightEnd\.x, x2: R \+ 10, y1: rightEnd\.y, y2: rightEnd\.y \}\)/)
  assert.match(src, /className: 'osubs-aphot', cx: x, cy: y, r: 5, fill: '#40b841'/)
  assert.match(src, /className: 'osubs-apmk',/)
  assert.match(src, /border: 2px solid var\(--osubs-ok\)/)
  // Hover is live on all three point layers: circles, scatters and marker
  // tiles all drive `setHovered`, which renders the .osubs-aptip card
  // (icon + name + org·license + Score/Cost). Dots lift like the site's:
  // scatter scale(1.8) + opacity 1, marker scale(1.15), all at 150ms.
  assert.match(src, /const \[hovered, setHovered\] = useState\(null\)/)
  assert.match(src, /onMouseEnter: \(\) => setHovered\(\{ row, x, y \}\)/)
  assert.match(src, /onMouseEnter: \(\) => setHovered\(\{ row, x: px\(xOf\(row\)\), y: py\(row\.value\) \}\)/)
  assert.match(src, /onMouseLeave: \(\) => setHovered\(\(cur\) => cur\?\.row === row \? null : cur\)/)
  assert.match(src, /hovered && h\('div', \{\s*className: `osubs-aptip\$\{hovered\.y < 90 \? ' osubs-aptip--below' : ''\}`, role: 'tooltip',/)
  // Tooltip stays inside the wrap's *clamped* width (the wrap clips at the
  // column edge in the side-by-side layout) — anchor clamps to
  // [HALF, wrapW-HALF], and points near the top flip the card below.
  assert.match(src, /const wrapW = wrapRef\.current \? wrapRef\.current\.clientWidth : W/)
  assert.match(src, /const cx = Math\.min\(Math\.max\(hovered\.x \* \(wrapW \/ W\), HALF\), Math\.max\(HALF, wrapW - HALF\)\)/)
  assert.match(src, /\.osubs-aptip--below \{ transform: translate\(-50%, 14px\); \}/)
  assert.match(src, /h\(ArenaMark, \{ org: hovered\.row\.org \}\)/)
  assert.match(src, /className: 'osubs-aptip-name' \}, hovered\.row\.model\)/)
  assert.match(src, /`\$\{t\.arenaScore\}: `, h\('b', \{ className: 'osubs-aptip-pos' \}, arenaSignPct\(hovered\.row\.value\)\)/)
  assert.match(src, /metric === 'tokens' \? arenaTok\(xOf\(hovered\.row\)\) : arenaUsd\(xOf\(hovered\.row\)\)/)
  assert.match(src, /\.osubs-aphot \{ pointer-events: all; cursor: pointer; \}/)
  assert.match(src, /\.osubs-apsc:hover \{ transform: translate\(-50%, -50%\) scale\(1\.8\); opacity: 1; \}/)
  assert.match(src, /\.osubs-apmk:hover \{ transform: translate\(-50%, -50%\) scale\(1\.15\); \}/)
  // Zoom/pan: an @visx/zoom-style transform on the X log-domain. `win` holds
  // the visible [lo,hi] window (null = full extent); ctrl/trackpad wheel
  // zooms centred on the pointer, drag pans, +/− step it, double-click resets.
  // Only X rescales — Y stays fixed. Scatters/markers clip to the window, the
  // frontier clips to the plot rect via #apclip.
  assert.match(src, /const \[win, setWin\] = useState\(null\)/)
  assert.match(src, /const clampWin = \(a, b\) => \{/)
  assert.match(src, /const zoomAt = \(factor, lx\) => \{/)
  assert.match(src, /const panBy = \(dlx\) => setWin/)
  assert.match(src, /onWheel: onWheel/)
  assert.match(src, /onDoubleClick: \(\) => setWin\(null\)/)
  assert.match(src, /onPointerDown: onDown/)
  assert.match(src, /Math\.exp\(-\(e\.deltaY \|\| 0\) \* 0\.0022\)/)
  assert.match(src, /clipPath: 'url\(#apclip\)'/)
  assert.match(src, /front\.filter\(\(row\) => inWin\(xOf\(row\)\)\)/)
  assert.match(src, /!front\.includes\(row\) && inWin\(xOf\(row\)\)/)
  // The ⌘Scroll hint chip + Zoom in/out buttons in the header.
  assert.match(src, /className: 'osubs-apscroll'/)
  assert.match(src, /'aria-label': t\.arenaZoomIn/)
  assert.match(src, /'aria-label': t\.arenaZoomOut/)
  assert.match(src, /zoomAt\(1\.4, \(lo \+ hi\) \/ 2\)/)
  assert.match(src, /zoomAt\(1 \/ 1\.4, \(lo \+ hi\) \/ 2\)/)
  // Sans chip labels lane-shift around the frontier line and each other;
  // unresolvable labels are dropped, like the site's own chart.
  assert.match(src, /const CHIP_H = 21, LANE = 23/)
  assert.match(src, /for \(let ty = p\.y \+ 30; ty \+ CHIP_H <= B \+ 18 && top === null; ty \+= LANE\)/)
  assert.match(src, /if \(top === null\) continue/)
  // The background scatter layer: every non-frontier priced model as an
  // 8×8 org-coloured square at its own (cost, value), clipped to the plot.
  assert.match(src, /className: 'osubs-apscat', 'aria-hidden': 'true'/)
  assert.match(src, /priced\.filter\(\(row\) => !front\.includes\(row\) && inWin\(xOf\(row\)\)\)/)
  assert.match(src, /osubs-apsc--\$\{ARENA_SCATTER_COLOR\[row\.org\] \?\? 'neutral'\}/)
  // Chart and optimal list sit side-by-side inside ONE card — the site's
  // 4xl:flex-row: chart column (flex-1) on the left, a fixed 288px optimal
  // rail on the right, collapsing to stacked below 940px.
  assert.match(src, /className: 'osubs-aptwo'/)
  assert.match(src, /className: 'osubs-apmain'/)
  assert.match(src, /h\('aside', \{ className: 'osubs-apside' \}/)
  assert.match(src, /\.osubs-aptwo \{ display: flex; flex-direction: row;/)
  assert.match(src, /\.osubs-apside \{\s*flex: 0 0 288px; width: 288px;/)
  assert.match(src, /@media \(max-width: 940px\)/)
  // The list below the chart is the frontier itself as a timeline: green
  // square nodes with connectors, org mark, name + org·license, right side
  // value/cost figures.
  assert.match(src, /const ranked = \[\.\.\.front\]\.sort\(\(a, b\) => b\.value - a\.value\)/)
  assert.match(src, /i < ranked\.length - 1 && h\('i', null\)/)
  assert.match(src, /h\(ArenaMark, \{ org: row\.org \}\)/)
  assert.match(src, /const arenaSignPct = \(v\) => \(v >= 0 \? '\+' : ''\) \+ arenaPct\(v\)/)
  assert.match(src, /className: `osubs-apval\$\{row\.value < 0 \? ' osubs-apval--bad' : ''\}`/)
  // Pareto joins the shared shot: its pane unscrolls during shooting.
  assert.match(src, /\.osubs-arena\.osubs-shooting \.osubs-aparetto \{ flex: none; overflow: visible; \}/)
  assert.match(src, /viewMode === 'pareto' \? ` · \$\{t\.arenaViewPareto\}` : ''/)
  assert.match(src, /arenaViewPareto: '性价比'/)
  assert.match(src, /arenaParetoTitle: '性价比前沿'/)
  assert.equal(src.includes("arenaParetoTitle: 'Pareto Frontier'"), true)
  // The axis caption is ONE string per (projection, percentile): the site
  // prints it under the frontier chart AND under the per-task card, then
  // appends the rolling 14-day window line.
  assert.match(src, /arenaAxisCost: '每任务中位成本'/)
  assert.equal(src.includes("arenaAxisCost: 'Median cost per task'"), true)
  assert.match(src, /arenaAxisTokens: '每任务中位输出 Token'/)
  assert.equal(src.includes("arenaAxisTokens: 'Median output tokens'"), true)
  assert.equal(src.includes("arenaAxisCostP25: 'Short-task cost, P25'"), true)
  assert.equal(src.includes("arenaAxisCostP95: 'Long-task cost, P95'"), true)
  assert.equal(src.includes("arenaAxisTokensP25: 'Short-task output tokens, P25'"), true)
  assert.equal(src.includes("arenaAxisTokensP95: 'Long-task output tokens, P95'"), true)
  assert.match(src, /arenaWindow14: '（近 14 天）'/)
  assert.equal(src.includes("arenaWindow14: ' (last 14 days)'"), true)
  assert.match(src, /function arenaAxisLabel\(t, metric, pct\) \{/)
  assert.match(src, /return t\[key\] \+ t\.arenaWindow14/)
  // X-metric toggle: a role=tablist pair (Cost | Output Tokens) ahead of the
  // zoom chrome. Switching re-derives the frontier over row.tokensM×1e6 and
  // resets the zoom window (the stored [lo,hi] is in the old log space).
  assert.match(src, /const \[metric, setMetric\] = useState\('cost'\)/)
  assert.match(src, /const pickMetric = \(id\) => \{ setMetric\(id\); setWin\(null\); setHovered\(null\) \}/)
  assert.match(src, /return m != null \? m \* 1e6 : null/)
  assert.match(src, /arenaFrontier\(rows, xOf\)/)
  assert.match(src, /role: 'tablist'/)
  assert.match(src, /'aria-selected': metric === id/)
  assert.match(src, /\[\['cost', t\.arenaMetricCost\], \['tokens', t\.arenaMetricTokens\]\]\.map/)
  assert.match(src, /arenaMetricCost: '成本'/)
  assert.match(src, /arenaMetricTokens: '输出 Token'/)
  assert.match(src, /arenaMetricCost: 'Cost'/)
  assert.match(src, /arenaMetricTokens: 'Output Tokens'/)
  // The token axis log-scales over K/M magnitudes with SI-suffixed ticks;
  // the foot line and tooltip second figure follow the metric.
  // The site's own formatTokensPerTask: the Mtok figure rounds to two
  // decimals before the branch, so 999.6K is `1M` (not `1000K`).
  assert.match(src, /const arenaTok = \(n\) => \{\n\s+const mtok = Number\(\(n \/ 1e6\)\.toFixed\(2\)\)/)
  assert.match(src, /ladder: \[1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6\]/)
  assert.match(src, /h\('p', \{ className: 'osubs-apfoot' \}, arenaAxisLabel\(t, metric, pct\)\)/)
  assert.match(src, /metric === 'tokens' \? t\.arenaParetoSubTokens : t\.arenaParetoSub/)
  assert.match(src, /arenaParetoSubTokens: '真实 Agent Mode 任务的净提升 × 输出 Token'/)
  assert.equal(src.includes("arenaParetoSubTokens: 'Net Improvement x Output tokens from real Agent Mode tasks'"), true)
  assert.match(src, /metric === 'tokens' \? t\.arenaMetricTokens : t\.arenaCostPerTask/)
  // Task-length filter: a percentile dropdown (25/50/95) next to the metric
  // tabs — same Radix menu as the cost card's sort. It re-keys the X figure
  // per row (costUsd25/95 or tokensM25/95×1e6), re-derives the frontier, and
  // resets the zoom window like a metric switch.
  assert.match(src, /const \[pct, setPct\] = useState\('50'\)/)
  assert.match(src, /const pickPct = \(id\) => \{ setPct\(id\); setPctOpen\(false\); setWin\(null\); setHovered\(null\) \}/)
  assert.match(src, /pct === '25' \? row\.tokensM25 : pct === '95' \? row\.tokensM95 : null\) \?\? row\.tokensM/)
  assert.match(src, /pct === '25' \? row\.costUsd25 : pct === '95' \? row\.costUsd95 : null\) \?\? row\.costUsd/)
  assert.match(src, /'aria-label': t\.arenaPctLabel/)
  assert.match(src, /t\[`arenaPct\$\{pct\}`\]/)
  assert.match(src, /\[\['25', t\.arenaPct25, t\.arenaPct25Sub\], \['50', t\.arenaPct50, t\.arenaPct50Sub\], \['95', t\.arenaPct95, t\.arenaPct95Sub\]\]\.map/)
  assert.match(src, /arenaPct25: '第 25 百分位'/)
  assert.match(src, /arenaPct95Sub: '较长任务'/)
  assert.match(src, /arenaPct25: '25th percentile'/)
  assert.match(src, /arenaPct95Sub: 'Longer tasks'/)
  // The site's pareto page continues below the frontier timeline with a
  // "Pareto Optimal Models" heading, then the "Cost per Task" card: title +
  // ⓘ/sub, a green-swatch "Pareto optimal" legend chip, a Sort dropdown
  // (Ranking / Highest / Lowest), and 15 priced rows whose green bars scale
  // to the column max (hsl brand-green-8, darker than --osubs-ok). Frontier
  // members carry the green rank tile.
  // The whole page translates — zh copy is Chinese, en keeps arena's terms.
  assert.match(src, /arenaOptimalTitle: '性价比最优模型'/)
  assert.match(src, /arenaCostTitle: '每任务成本'/)
  assert.match(src, /arenaCostLegend: '性价比最优'/)
  assert.equal(src.includes("arenaOptimalTitle: 'Pareto Optimal Models'"), true)
  assert.equal(src.includes("arenaCostTitle: 'Cost per Task'"), true)
  assert.equal(src.includes("arenaCostLegend: 'Pareto optimal'"), true)
  assert.match(src, /arenaScore: '得分'/)
  assert.match(src, /arenaCostPerTask: '每任务成本'/)
  assert.match(src, /arenaScrollHint: '滚动'/)
  assert.match(src, /arenaZoomIn: '放大'/)
  assert.match(src, /arenaZoomOut: '缩小'/)
  assert.match(src, /arenaColRank: '排名'/)
  assert.match(src, /arenaColNet: '净提升'/)
  assert.match(src, /arenaColSuccess: '确认成功率'/)
  assert.match(src, /arenaPerTask: '\/任务'/)
  assert.match(src, /arenaSortRanking: 'Ranking'/)
  assert.match(src, /arenaSortCostDesc: 'Highest Cost per Task'/)
  assert.match(src, /arenaSortCostAsc: 'Lowest Cost per Task'/)
  // The card is projection-aware, not cost-only — the site renders the same
  // component with `kind: cost | output-mtok`, so the Cost | Output Tokens
  // tab also swaps this card's title, sub-line, figures, bar scale, Sort
  // options, ⓘ sentence and the frontier its filter narrows to.
  assert.match(src, /function ArenaCostList\(\{ t, rows, metric, pct, xOf \}\)/)
  assert.match(src, /h\(ArenaCostList, \{ t, rows, metric, pct, xOf \}\)/)
  assert.match(src, /const onFrontier = new Set\(arenaFrontier\(rows, xOf\)\.map\(\(row\) => row\.model\)\)/)
  assert.match(src, /const fig = \(row\) => \(tokens \? arenaTok\(xOf\(row\)\) : arenaUsd\(xOf\(row\)\)\) \+ t\.arenaPerTask/)
  assert.match(src, /tokens \? t\.arenaCostTitleTokens : t\.arenaCostTitle/)
  assert.match(src, /h\('p', \{ className: 'osubs-acost-sub' \}, arenaAxisLabel\(t, metric, pct\)\)/)
  assert.match(src, /const max = Math\.max\(0\.0001, \.\.\.priced\.map\(\(row\) => xOf\(row\)\)\)/)
  assert.match(src, /\['cost-desc', tokens \? t\.arenaSortTokensDesc : t\.arenaSortCostDesc\]/)
  assert.match(src, /\['cost-asc', tokens \? t\.arenaSortTokensAsc : t\.arenaSortCostAsc\]/)
  assert.match(src, /'aria-label': tokens \? t\.arenaCostInfoTokensLabel : t\.arenaCostInfoLabel/)
  assert.match(src, /fill\(tokens \? t\.arenaCostInfoTokens : t\.arenaCostInfo, \{ stat: arenaStatNoun\(t, pct\) \}\)/)
  assert.match(src, /arenaCostTitleTokens: '每任务输出 Token'/)
  assert.equal(src.includes("arenaCostTitleTokens: 'Output Tokens per Task'"), true)
  assert.match(src, /arenaSortTokensDesc: '每任务输出 Token（高→低）'/)
  assert.equal(src.includes("arenaSortTokensDesc: 'Highest Output Tokens per Task'"), true)
  assert.equal(src.includes("arenaSortTokensAsc: 'Lowest Output Tokens per Task'"), true)
  assert.equal(src.includes("arenaCostInfoLabel: 'Explain the cost ranking'"), true)
  assert.equal(src.includes("arenaCostInfoTokensLabel: 'Explain the output token ranking'"), true)
  assert.match(src, /arenaStatMedian: '中位数'/)
  assert.equal(src.includes("arenaStatP95: 'the 95th percentile'"), true)
  // The list always renders in full — the site's own "+ Show N more" cap is
  // deliberately dropped so the Pareto-optimal filter reads as the whole
  // frontier. `sorted` is the entire pool under the current sort.
  assert.match(src, /const sorted = \[\.\.\.pool\]\.sort\(\(a, b\) => \{/)
  assert.match(src, /const TRACK = 404/)
  assert.match(src, /h\('rect', \{ x: 0, y: 6, height: 32, rx: 2, width: barW\(xOf\(row\)\) \}\)/)
  assert.match(src, /style: \{ left: `\$\{barW\(xOf\(row\)\) \+ 8\}px` \}/)
  assert.match(src, /osubs-acost-num--front/)
  assert.match(src, /fill: #2e9440/)
  // No expander: the + Show N more / − Show less button and its copy are gone.
  assert.equal(src.includes('osubs-acost-more'), false)
  assert.equal(src.includes('arenaCostShowMore'), false)
  assert.equal(src.includes('arenaCostShowLess'), false)
  assert.equal(src.includes('setExpanded'), false)
  // the "Pareto optimal" chip is a real filter toggle (aria-pressed), not a label —
  // pressing it narrows the list to frontier members only.
  assert.match(src, /\['aria-pressed'\]: onlyFront|\{'aria-pressed': onlyFront\}|'aria-pressed': onlyFront/)
  assert.match(src, /onlyFront \? priced\.filter\(\(row\) => onFrontier\.has\(row\.model\)\) : priced/)
  assert.match(src, /osubs-acost-legend--on/)
  // Org icons are real site svg inner markup keyed by org, not mono letters:
  // each entry carries its own viewBox so non-square marks (Tencent 1000x1000,
  // Mistral 191x135, Thinky 400x400, SpaceXAI 69 99 832 319) keep their aspect.
  assert.match(src, /const mark = ARENA_EXTRA_MARKS\[org\]/)
  assert.match(src, /viewBox: mark\.viewBox/)
  assert.match(src, /Anthropic: \{ viewBox: '0 0 24 24', raw: '<path d="M13\.827/)
  assert.match(src, /'Z\.ai': \{ viewBox: '0 0 1000 1000'/)
  assert.match(src, /Xiaomi: \{ viewBox: '0 0 24 24', raw: '<rect x="2" y="2" width="20" height="20" rx="4\.5"/)
  assert.match(src, /Thinky: \{ viewBox: '0 0 400 400'/)
})

test('arena projection figures follow the board formatters', async () => {
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  const tokBody = src.match(/const arenaTok = \(n\) => \{[\s\S]*?\n        \};/)?.[0]
  assert.ok(tokBody)
  const arenaTok = new Function(`${tokBody}; return arenaTok`)() as (n: number) => string
  // The site's formatTokensPerTask rounds the Mtok figure to two decimals
  // BEFORE branching, so 999.6K collapses to 1M instead of reading 1000K.
  assert.equal(arenaTok(66_525), '66.5K')
  assert.equal(arenaTok(226_952), '227K')
  assert.equal(arenaTok(999_600), '1M')
  assert.equal(arenaTok(1_500_000), '1.5M')
  assert.equal(arenaTok(14_541), '14.5K')
  assert.equal(arenaTok(145), '145')
  const xOfBody = src.match(/function arenaXOf\(row, metric, pct\) \{[\s\S]*?\n        \}/)?.[0]
  assert.ok(xOfBody)
  const arenaXOf = new Function(`${xOfBody}; return arenaXOf`)() as (row: any, metric: string, pct: string) => number | null
  const row = { costUsd: 3.75, costUsd25: 1.25, costUsd95: 9.5, tokensM: 0.066525, tokensM25: 0.05, tokensM95: 0.2 }
  assert.equal(arenaXOf(row, 'cost', '50'), 3.75)
  assert.equal(arenaXOf(row, 'cost', '95'), 9.5)
  assert.equal(arenaXOf(row, 'tokens', '50'), 66_525)
  assert.equal(arenaXOf(row, 'tokens', '25'), 50_000)
  // P50 stands in when a cached answer predates the percentile fields…
  assert.equal(arenaXOf({ costUsd: 2 }, 'cost', '95'), 2)
  assert.equal(arenaXOf({ tokensM: 0.01 }, 'tokens', '95'), 10_000)
  // …and a row with no sample in the active projection cannot place at all.
  assert.equal(arenaXOf({ costUsd: 2 }, 'tokens', '50'), null)
  assert.equal(arenaXOf({ tokensM: 0.01 }, 'cost', '50'), null)
})

test('OpenCode Go renders through the shared account cards and add-account dialog', async () => {
  const src = assembleUi()
  assert.match(src, /opencodeGoKey:\s*'API Key'/)
  assert.match(src, /opencodeGoKey:\s*'API key'/)
  assert.match(src, /opencodeGoHostStale/)
  assert.equal(src.includes('OpencodeGoPanel'), false)
  // The Go card renders the account's own view (Zen's wallet rows are filtered
  // out of it), and Zen gets its own card next to it — behind the same legend
  // box every family card uses, so it does not read as part of OpenCode Go.
  assert.match(src, /quotaPanel\('opencode-go', card\('opencode-go', opencodeGoView\)\)/)
  assert.match(src, /quotaPanel\('opencode-zen', h\(ZenQuotaPanel, \{/)
  assert.match(src, /function ZenQuotaPanel\(\{ t, title, account, onRefresh \}\) \{\n\s*return h\('section', \{ className: 'osubs-card osubs-card--legend' \},/)
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
  assert.match(src, /id === 'grok' \|\| id === 'kimi' \|\| id === 'cline' \? t\.device/)
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
  // opencode-go uses its meter-style reset; everyone else uses formatReset.
  assert.match(src, /const reset = family === 'opencode-go' \? formatMeterReset\(row\.resetAt, t\) : formatReset\(row\.resetAt, t\)/)
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
  assert.match(src, /id === 'cursor' \? t\.cursorImport : id === 'kimi' \? t\.kimiImport : id === 'devin' \? t\.devinImport : id === 'cline' \? t\.clineImport : id === 'command-code' \? t\.commandCodeImport : t\.import/)
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

test('退出 asks for a second confirmation before the account is dropped', async () => {
  const src = assembleUi()
  // The row button only stages the logout; the RPC runs from the confirm.
  assert.match(src, /h\(Button, \{\s*size: 'sm',\s*icon: true,\s*onClick: \(\) => onLogout\(id, row\.id\),\s*title: t\.logout,/)
  assert.match(src, /onLogout: \(family, accountId\) => requestLogout\(family, accountId, row\)/)
  assert.match(src, /const requestLogout = \(family, accountId, row\) => \{\s*setLogoutAcked\(false\)\s*setLogoutFor\(\{ accountId, label: identityOf\(row, family\) \|\| title \}\)/)
  assert.match(src, /const confirmLogout = async \(\) => \{\s*if \(!logoutFor \|\| !logoutAcked\) return\s*const target = logoutFor\s*closeLogout\(\)\s*await onLogout\(id, target\.accountId\)/)
  // WarnDialog stays the one destructive confirm: logout names its own action
  // and the reset-card copy remains the dialog's default.
  assert.match(src, /logoutFor && h\(WarnDialog, \{/)
  assert.match(src, /idPrefix: 'osubs-logout'/)
  assert.match(src, /title: t\.logoutConfirmTitle/)
  assert.match(src, /description: fill\(t\.logoutConfirmBody, \{ n: logoutFor\.label \}\)/)
  assert.match(src, /acknowledgeLabel: t\.logoutConfirmAck/)
  assert.match(src, /confirmLabel: t\.logoutConfirmOk/)
  assert.match(src, /const heading = title \|\| t\.quotaResetWarnTitle/)
  assert.match(src, /const ack = acknowledgeLabel \|\| t\.quotaResetAck/)
  assert.match(src, /disabled: !acknowledged/)
  // Copy: the dialog names the account and says what the second step costs.
  assert.match(src, /logoutConfirmTitle: '退出账号'/)
  assert.match(src, /logoutConfirmBody: '退出后本机保存的 \{n\} 登录凭据会被删除/)
  assert.match(src, /logoutConfirmAck: '我确认退出此账号'/)
  assert.match(src, /logoutConfirmOk: '确认退出'/)
  assert.match(src, /logoutConfirmTitle: 'Sign out of this account'/)
  assert.match(src, /logoutConfirmBody: 'Signing out deletes the stored credentials for \{n\}/)
  assert.match(src, /logoutConfirmAck: 'I understand this signs the account out'/)
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

test('removed Copilot family leaves no tab, copy, icon, or quota card', async () => {
  const src = assembleUi()
  assert.equal(/copilot/i.test(src), false)
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

test('用量 strip is four cards in one row — TTFT stays on the model rows', async () => {
  const src = assembleUi()
  // Token / 缓存读 / 调用 / 估算成本 — four stat() calls, so the strip's grid
  // (repeat(4, …)) always lands them on one row.
  assert.deepEqual(src.match(/stat\(t\./g) ?? [], ['stat(t.', 'stat(t.', 'stat(t.', 'stat(t.'])
  assert.match(src, /\.osubs-ustats \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  // 首字延迟 is not a card: its label is gone, the per-row short form stays.
  assert.equal(src.includes("usageTtft:"), false)
  assert.match(src, /usageTtftShort: '首字 \{n\}'/)
  assert.match(src, /fill\(t\.usageTtftShort, formatMs\(usageTtft\(row\)\)\)/)
  // The skeleton holds the same four tiles, so the first scan lands flat.
  assert.match(src, /className: 'osubs-ustats' \}, \[0, 1, 2, 3\]\.map/)
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
  // The image resolves the font on its own, so a text-bearing box must not
  // carry the page's frozen pixel width into the clone: pinned to that width,
  // the image's text wraps inside its own box and paints over the line below
  // it (剩余 100% colliding with its reset line on a 额度 shot).
  assert.match(src, /const carriesText = \(Array\.from\(source\.childNodes\) as any\[\]\)\.some\(/)
  assert.match(src, /const releaseWidth = carriesText\n\s*&& style\.position !== 'absolute' && style\.position !== 'fixed'/)
  assert.match(src, /if \(releaseWidth && \(name === 'width' \|\| name === 'inline-size'\)\) continue/)
  // A box that is already truncating its text keeps the page's width, so the
  // image truncates it the same way instead of letting it run wide.
  assert.match(src, /&& source\.scrollWidth <= source\.clientWidth \+ 1/)
  // Heights stay frozen: the remaining bar and the card chrome depend on them.
  assert.equal(/releaseWidth && \(name === 'height'/.test(src), false)
})

test('分享 long shot inlines only what the image would not compute on its own', async () => {
  const src = assembleUi()
  // Custom properties are inherited, so the clone root carries the whole set and
  // a descendant keeps its own only where its inline style resolves var().
  assert.match(src, /const INHERITED = new Set\(`-webkit-border-horizontal-spacing/)
  assert.match(src, /const keepCustom = isRoot \|\| VAR_REF\.test\(raw\)/)
  assert.match(src, /const custom = name\.startsWith\('--'\)\n\s*if \(custom && !keepCustom\) continue/)
  // Everything else is dropped when it matches what the image computes anyway:
  // the parent's value for an inherited property, the tag's UA default otherwise.
  assert.match(src, /if \(value === parentStyle\.getPropertyValue\(name\)/)
  assert.match(src, /else if \(value === defaults\.get\(name\)\) continue/)
  // The UA default comes from a same-origin iframe with no author CSS, one probe
  // per tag, plus one shared probe of initial values.
  assert.match(src, /function tagDefaultOf\(source\) \{/)
  assert.match(src, /const key = `\$\{source\.localName\}|\$\{source\.namespaceURI\}`/)
  assert.match(src, /const probe = doc\.createElement\('div'\)\n\s*probe\.style\.all = 'initial'/)
  // A tag's own UA rule beats inheritance once our value is gone (h3 font-size,
  // p margin, button font), so an inherited value drops only when that rule
  // lands on the same value.
  assert.match(src, /ua === undefined \|\| ua === initialValuesOf\(\)\.get\(name\) \|\| ua === value/)
  // Two families never pruned, each a measured regression: an SVG image
  // resolves fonts per element (a pruned font-family re-measures the text), and
  // min-* keeps a context-dependent auto for flex/grid items that a block-level
  // probe reads as 0px.
  assert.match(src, /const NEVER_PRUNE = new Set\(\['font', 'font-family', 'min-width', 'min-height', 'min-inline-size', 'min-block-size'\]\)/)
  assert.match(src, /if \(!isRoot && !NEVER_PRUNE\.has\(name\)\) \{/)
})

test('分享 paints feedback first and shows the SVG preview before the PNG lands', async () => {
  const src = assembleUi()
  // The capture waits one frame, so the flash and the busy button paint before
  // the clone takes the thread (~150 ms on a 40-row card).
  assert.match(src, /const nextFrame = \(\) => new Promise<void>\(\(resolve\) => \{/)
  assert.match(src, /const capture = nextFrame\(\)\.then\(\(\) => renderLongShot\(node, footer\)\)/)
  assert.match(src, /setShot\(\{ id: seq\.current\+\+, phase: 'busy', from, flash: !reducedMotion\(\), copied: null, fileName \}\)/)
  // The capture returns the decoded SVG preview plus the PNG promise; the
  // clipboard write is still created in the click's own task, so user
  // activation holds.
  assert.match(src, /const png = new Promise<Blob>\(\(resolve, reject\) => canvas\.toBlob/)
  assert.match(src, /return \{ svg, png \}/)
  assert.match(src, /void copyPng\(capture\.then\(\(\{ png \}\) => png\)\)/)
  // Thumbnail and preview read the SVG, copy and save read the PNG.
  assert.match(src, /key: shot\.id,/)
  assert.match(src, /link\.href = shot\.pngUrl/)
  assert.match(src, /disabled: !shot\.pngUrl, onClick: save, label: t\.usageSave/)
})

test('额度 分享 says on hover what the image does to identities; 用量 / 榜单 stay plain', async () => {
  const src = assembleUi()
  // zh / en copy for the hover title: the shot hides the account.
  assert.match(src, /usageShareMask: '分享截图会隐藏账号（邮箱\/用户名打码）',/)
  assert.match(src, /usageShareMask: 'Shared screenshots hide accounts \(email \/ username masked\)',/)
  // ShareButton forwards it as the button's title (hover); the label stays 分享.
  assert.match(src, /function ShareButton\(\{ t, busy, disabled, onClick, hint \}\) \{/)
  assert.match(src, /size: 'sm', disabled: disabled \|\| busy, onClick, title: hint,/)
  // Only 额度 passes the hint: the 用量 / 榜单 images carry no account identity.
  assert.match(src, /busy: quotaShot\.busy,\n\s*\/\/ The image masks account identities; the hover title says so\.\n\s*hint: t\.usageShareMask,/)
  assert.equal(src.split('hint: t.usageShareMask').length - 1, 1)
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
  // Only the account card went icon-only: the 用量 and 榜单 heads' 刷新 keep
  // their text.
  assert.equal(src.includes("label: t.switchTo"), false)
  assert.equal(src.split('h(IconRefresh), t.quotaRefresh)').length - 1, 2)
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
test('the provider rail marks each family with its switched-on models', async () => {
  const src = assembleUi()
  const rail = src.match(/function RailItem\([\s\S]*?\n    \}/)?.[0] ?? ''
  assert.ok(rail, 'RailItem not found')
  // zh / en copy for the mark's tooltip and accessible name.
  assert.match(src, /railModelsOn:\s*'已启用 \{n\} \/ \{m\} 个模型'/)
  assert.match(src, /railModelsOn:\s*'\{n\} \/ \{m\} models on'/)
  // The mark is a switch drawn in its on state (knob right, track an
  // outline) plus the count, in one tail with the view's own count.
  assert.match(src, /function RailOnMark\(\)/)
  assert.match(src, /className: 'osubs-rail-tail'/)
  assert.match(src, /className: 'osubs-rail-on'/)
  assert.match(rail, /role: 'img'/)
  assert.match(rail, /const modelsOn = on > 0 \? fill\(t\.railModelsOn, \{ n: on, m: item\.models\.total \}\) : ''/)
  // Zero renders nothing: an unmarked row means nothing is on.
  assert.match(rail, /modelsOn \? h\('span', \{/)
  // The mark is the rail's only green — the fill a 模型 switch shows when on.
  const onCss = src.match(/\.osubs-rail-on \{[^}]*\}/)?.[0] ?? ''
  assert.match(onCss, /color: var\(--osubs-ok\)/)
  // Both numbers sit in fixed slots, so a 1-to-3-digit value can never shift
  // the column beside it: the switch glyph starts at the same x on every row
  // and the count keeps its own right-aligned slot (otherwise the mark
  // column floats with the neighbouring number's width and reads as broken).
  assert.match(onCss, /width: 40px/)
  const countCss = src.match(/\.osubs-rail-count \{[^}]*\}/)?.[0] ?? ''
  assert.match(countCss, /min-width: 22px/)
  assert.match(countCss, /text-align: right/)
  const swCss = src.match(/\.osubs-rail-sw \{[^}]*\}/)?.[0] ?? ''
  assert.match(swCss, /width: 16px/)
  assert.match(swCss, /height: 10px/)
  // The tally mirrors the 模型 table: a signed-out family counts nothing, and
  // a pending override already counts as clicked.
  assert.match(src, /if \(!group\.loggedIn\) continue/)
  assert.match(src, /Boolean\(modelOverrides\[model\.key\] \?\? model\.enabled\)/)
  assert.match(src, /const modelsOnOf = \(id\) => \(id === 'all' \? allOn : \(modelOn\.get\(id\) \?\? \{ on: 0, total: 0 \}\)\)/)
  assert.match(src, /models: modelsOnOf\('all'\)/)
  assert.match(src, /models: modelsOnOf\(id\)/)
  // Every rail view carries it (额度 / 模型 / 用量), not only the quota page.
  assert.match(src, /h\(RailItem, \{ item, current: family, onSelect: setFamily, t, key: item\.id \}\)/)
})

