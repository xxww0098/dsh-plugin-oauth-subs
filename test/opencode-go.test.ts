import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseOpencodeGoCookie, normalizeOpencodeGoWorkspaceId, opencodeGoAccountId, opencodeGoKeyHint } from '../lib/apikey/opencode-go/index.js'
import { parseOpencodeGoEmail, parseOpencodeGoUsage } from '../lib/apikey/opencode-go/quota.js'
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

test('OpencodeGoStore caches the dashboard email as the account title', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const path = opencodeGoFilePath(join(dir, 'auth.json'))
  const page = 'rollingUsage:$R[35]={status:"ok",resetInSec:30,usagePercent:10},'
    + 'weeklyUsage:$R[36]={status:"ok",resetInSec:60,usagePercent:5},'
    + 'userEmail[\\"wrk_abc123\\"]=$R[0]=$R[2](($R[1]={p:0,s:0,f:0}));$R[28]($R[1],"dev@example.com");'
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
  const vault = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(vault.accounts[saved.id].email, 'dev@example.com')
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
