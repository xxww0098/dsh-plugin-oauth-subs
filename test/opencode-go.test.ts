import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseOpencodeGoCookie, normalizeOpencodeGoWorkspaceId, opencodeGoAccountId, opencodeGoKeyHint } from '../lib/apikey/opencode-go/index.js'
import { parseOpencodeGoEmail, parseOpencodeGoUsage, parseOpencodeGoWorkspaceName, parseOpencodeGoBilling } from '../lib/apikey/opencode-go/quota.js'
import { OpencodeGoStore, opencodeGoFilePath } from '../lib/apikey/opencode-go/store.js'
import { writePrivateText } from '../lib/utils/private-text.js'

test('parseOpencodeGoCookie keeps only auth cookies or wraps a raw token', () => {
  assert.equal(parseOpencodeGoCookie('Fe26.2abc'), 'auth=Fe26.2abc')
  assert.equal(parseOpencodeGoCookie('auth=Fe26.2abc; theme=dark'), 'auth=Fe26.2abc')
  assert.equal(parseOpencodeGoCookie('__Host-auth=xyz'), '__Host-auth=xyz')
  assert.equal(parseOpencodeGoCookie('theme=dark'), undefined)
  assert.equal(parseOpencodeGoCookie(''), undefined)
})

test('normalizeOpencodeGoWorkspaceId accepts raw ids and dashboard urls', () => {
  assert.equal(normalizeOpencodeGoWorkspaceId('wrk_abc123'), 'wrk_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('https://opencode.ai/workspace/wrk_abc123/go'), 'wrk_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('see wrk_abc123 here'), 'wrk_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('nope'), undefined)
})

test('parseOpencodeGoUsage reads JSON usage and serialized dashboard JS', () => {
  const now = 1_700_000_000_000
  const json = parseOpencodeGoUsage(JSON.stringify({
    usage: {
      rolling: { usagePercent: 20, resetInSec: 60 },
      weekly: { usagePercent: 5, resetInSec: 120 },
      monthly: { usagePercent: 1, resetInSec: 180 },
    },
  }), now)
  assert.equal(json.rows.length, 3)
  assert.equal(json.rows[0].kind, 'primary')
  assert.equal(json.rows[0].remainingPercent, 80)
  assert.equal(json.rows[0].resetAt, now + 60_000)
  assert.equal(json.rows[1].kind, 'weekly')
  assert.equal(json.rows[2].kind, 'monthly')

  const js = parseOpencodeGoUsage(
    'const x={rollingUsage:{usagePercent:50,resetInSec:10},weeklyUsage:{usagePercent:2,resetInSec:20}}',
    now,
  )
  assert.equal(js.rows[0].remainingPercent, 50)
  assert.equal(js.rows[1].remainingPercent, 98)

  assert.throws(() => parseOpencodeGoUsage('nothing', now), /Missing usage fields/)
})

test('parseOpencodeGoEmail reads the dashboard hydration payload', () => {
  const html = '<script>_$HY.r["userEmail[\\"wrk_abc123\\"]"]=$R[0]=($R[2]=r=>(r.p=s))(($R[1]={p:0,s:0,f:0}));'
    + '$R[28]($R[1],"dev@example.com");</script>'
  assert.equal(parseOpencodeGoEmail(html, 'wrk_abc123'), 'dev@example.com')
  // RSC call shape drift: fall back to the first email after the key.
  assert.equal(parseOpencodeGoEmail('userEmail[\\"wrk_abc123\\"] then dev@example.com', 'wrk_abc123'), 'dev@example.com')
  assert.equal(parseOpencodeGoEmail('<p>no identity</p>', 'wrk_abc123'), undefined)
})

test('parseOpencodeGoUsage reads tokens, status, and serialized dashboard JS', () => {
  const now = 1_700_000_000_000
  const page = 'rollingUsage:$R[35]={status:"ok",resetInSec:12126,usagePercent:8.6,usage:103691253,limit:1200000000},'
    + 'weeklyUsage:$R[36]={status:"throttled",resetInSec:283278,usagePercent:10.7,usage:319783821,limit:3000000000}'
  const parsed = parseOpencodeGoUsage(page, now)
  assert.equal(parsed.rows.length, 2)
  const [rolling, weekly] = parsed.rows
  assert.equal(rolling.usedPercent, 9)
  assert.equal(rolling.remainingPercent, 91)
  assert.equal(rolling.resetAt, now + 12_126_000)
  assert.equal(rolling.status, 'ok')
  assert.deepEqual([rolling.used, rolling.total, rolling.unit], [103_691_253, 1_200_000_000, 'tokens'])
  assert.equal(weekly.status, 'throttled')
  assert.equal(weekly.used, 319_783_821)
})

test('parseOpencodeGoUsage reads the key /usage shape with ISO resetsAt', () => {
  const parsed = parseOpencodeGoUsage(JSON.stringify({
    usage: {
      rolling: { status: 'ok', percent: 8, resetsAt: '2026-09-10T20:40:48.869Z' },
      weekly: { status: 'ok', percent: 10, resetsAt: '2026-09-14T00:00:00.869Z' },
    },
  }))
  assert.equal(parsed.rows[0].usedPercent, 8)
  assert.equal(parsed.rows[0].remainingPercent, 92)
  assert.equal(parsed.rows[0].resetAt, Date.parse('2026-09-10T20:40:48.869Z'))
  assert.equal(parsed.rows[0].used, undefined)
})

test('parseOpencodeGoWorkspaceName and parseOpencodeGoBilling read the dashboard payload', () => {
  const html = '$R[29]=[$R[30]={id:"wrk_abc123",name:"Default",slug:null}];'
    + '$R[33]={mine:!0,useBalance:!0,allowTraining:!1,region:$R[34]=["us"]};'
    + '$R[31]={customerID:"cus_x",balance:12.5,reload:null,subscriptionPlan:null};'
  assert.equal(parseOpencodeGoWorkspaceName(html, 'wrk_abc123'), 'Default')
  assert.deepEqual(parseOpencodeGoBilling(html), { useBalance: true, balance: 12.5 })
  assert.deepEqual(parseOpencodeGoBilling('useBalance:!1,balance:0'), { useBalance: false, balance: 0 })
})

test('opencodeGoAccountId prefers workspace and key hints stay masked', () => {
  assert.equal(opencodeGoAccountId({ workspaceId: 'wrk_abc123', apiKey: 'sk-x' }), 'wrk_abc123')
  assert.match(opencodeGoAccountId({ apiKey: 'sk-x' }), /^go_[0-9a-f]{12}$/)
  assert.equal(opencodeGoAccountId({}), undefined)
  assert.equal(opencodeGoKeyHint('sk-1234567890'), 'sk-…7890')
  assert.equal(opencodeGoKeyHint('plain-token'), '…oken')
  assert.equal(opencodeGoKeyHint(''), '')
})

test('OpencodeGoStore keeps many accounts, activates on save, and never exposes secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const path = opencodeGoFilePath(join(dir, 'auth.json'))
  const page = JSON.stringify({ usage: { rolling: { usagePercent: 10, resetInSec: 30 } } })
  const fetchFn = async () => new Response(page, { status: 200, headers: { 'content-type': 'text/javascript' } })
  const store = new OpencodeGoStore({ path, fetchFn })
  const first = await store.save({ apiKey: 'sk-one', cookie: 'Fe26.2one', workspace: 'wrk_abc123' })
  assert.equal(first.created, true)
  assert.equal(first.id, 'wrk_abc123')
  const second = await store.save({ apiKey: 'sk-two', cookie: 'Fe26.2two', workspace: 'wrk_def456' })
  assert.equal(second.created, true)
  assert.equal(second.id, 'wrk_def456')

  const snap = await store.snapshot()
  assert.equal(snap.accounts.length, 2)
  assert.equal(snap.activeId, 'wrk_def456')
  const active = snap.accounts.find((row) => row.active)
  assert.equal(active.workspaceId, 'wrk_def456')
  assert.equal(active.apiKeySet, true)
  assert.equal(active.cookieSet, true)
  assert.equal(active.quota.status, 'ready')
  assert.equal(active.quota.rows[0].remainingPercent, 90)
  assert.equal('apiKey' in active, false)
  assert.equal('cookieHeader' in active, false)
  assert.equal(store.keyOf('wrk_abc123'), 'sk-one')
  assert.equal(store.anyKey(), true)

  const switched = await store.switch('wrk_abc123')
  assert.equal(switched.activeId, 'wrk_abc123')

  const removed = await store.remove('wrk_abc123')
  assert.equal(removed.wasActive, true)
  assert.equal(removed.activeId, 'wrk_def456')

  const afterClear = await store.clear('wrk_def456', 'cookie')
  const row = afterClear.accounts.find((entry) => entry.id === 'wrk_def456')
  assert.equal(row.cookieSet, false)
  assert.equal(row.quota.status, 'idle')
})

test('OpencodeGoStore caches email, workspace name, tokens, and billing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const path = opencodeGoFilePath(join(dir, 'auth.json'))
  const page = 'rollingUsage:$R[35]={status:"ok",resetInSec:30,usagePercent:10,usage:100000000,limit:1000000000},'
    + 'weeklyUsage:$R[36]={status:"ok",resetInSec:60,usagePercent:5},'
    + 'monthlyUsage:$R[37]={status:"ok",resetInSec:90,usagePercent:1},'
    + 'userEmail[\\"wrk_abc123\\"]=$R[0]=$R[2](($R[1]={p:0,s:0,f:0}));$R[28]($R[1],"dev@example.com");'
    + '$R[29]=[$R[30]={id:"wrk_abc123",name:"Default",slug:null}];'
    + '$R[33]={mine:!0,useBalance:!0,allowTraining:!1,region:$R[34]=["us"]};'
    + '$R[31]={customerID:"cus_x",balance:12.5,reload:null};'
  const store = new OpencodeGoStore({
    path,
    fetchFn: async () => new Response(page, { status: 200, headers: { 'content-type': 'text/javascript' } }),
  })
  const saved = await store.save({ apiKey: 'sk-one', cookie: 'Fe26.2one', workspace: 'wrk_abc123' })
  const snap = await store.snapshot()
  const row = snap.accounts.find((entry) => entry.id === saved.id)
  assert.equal(row.email, 'dev@example.com')
  assert.equal(row.account, 'dev@example.com')
  assert.equal(row.workspaceId, 'wrk_abc123')
  assert.equal(row.workspaceName, 'Default')
  assert.equal(row.quota.status, 'ready')
  assert.equal(row.quota.useBalance, true)
  assert.equal(row.quota.balance, 12.5)
  assert.deepEqual(
    row.quota.rows.map((entry) => [entry.kind, entry.used, entry.total, entry.unit]),
    [['primary', 100_000_000, 1_000_000_000, 'tokens'], ['weekly', undefined, undefined, undefined], ['monthly', undefined, undefined, undefined]],
  )
  const vault = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(vault.accounts[saved.id].email, 'dev@example.com')
  assert.equal(vault.accounts[saved.id].workspaceName, 'Default')
})

test('OpencodeGoStore dedupes a re-pasted key instead of adding a card', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const store = new OpencodeGoStore({
    path: opencodeGoFilePath(join(dir, 'auth.json')),
    fetchFn: async () => new Response('{}', { status: 200 }),
  })
  const first = await store.save({ apiKey: 'sk-same' })
  const again = await store.save({ apiKey: 'sk-same', cookie: 'Fe26.2rotated' })
  assert.equal(again.id, first.id)
  assert.equal(again.created, false)
  const snap = await store.snapshot()
  assert.equal(snap.accounts.length, 1)
  const row = snap.accounts[0]
  assert.equal(row.active, true)
  assert.equal(row.cookieSet, true)
})

test('OpencodeGoStore migrates a legacy single-account file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const path = join(dir, 'opencode-go.json')
  await writePrivateText(path, JSON.stringify({ cookieHeader: 'auth=Fe26.legacy', workspaceId: 'wrk_legacy' }))
  const fetchFn = async () => new Response(
    JSON.stringify({ usage: { rolling: { usagePercent: 5, resetInSec: 10 } } }),
    { status: 200, headers: { 'content-type': 'text/javascript' } },
  )
  const store = new OpencodeGoStore({ path, fetchFn })
  const snap = await store.snapshot()
  assert.equal(snap.activeId, 'wrk_legacy')
  assert.equal(snap.accounts.length, 1)
  assert.equal(snap.accounts[0].cookieSet, true)
  assert.equal(snap.accounts[0].apiKeySet, false)
  assert.equal(snap.accounts[0].quota.status, 'ready')
  assert.equal(store.keylessId(), 'wrk_legacy')

  await store.adoptKey('wrk_legacy', 'sk-legacy')
  assert.equal(store.keyOf('wrk_legacy'), 'sk-legacy')
  assert.equal(store.keylessId(), undefined)
})

test('OpencodeGoStore rejects a cookie header without an auth cookie', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const store = new OpencodeGoStore({
    path: join(dir, 'opencode-go.json'),
    fetchFn: async () => new Response('{}', { status: 200 }),
  })
  await assert.rejects(() => store.save({ cookie: 'theme=dark; lang=en' }), /auth token or Cookie header/)
})
