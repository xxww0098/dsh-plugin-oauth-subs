import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseOpencodeGoCookie, normalizeOpencodeGoWorkspaceId, opencodeGoAccountId, opencodeGoKeyHint } from '../lib/apikey/opencode-go/index.js'
import { parseOpencodeGoEmail, parseOpencodeGoUsage, parseOpencodeGoWorkspaceName, parseOpencodeGoBilling, parseOpencodeGoConsoleStatus, parseOpencodeGoConsoleBilling, fetchOpencodeGoQuota } from '../lib/apikey/opencode-go/quota.js'
import { OpencodeGoStore, opencodeGoFilePath } from '../lib/apikey/opencode-go/store.js'
import { writePrivateText } from '../lib/utils/private-text.js'

test('parseOpencodeGoCookie keeps only auth cookies or wraps a raw token', () => {
  assert.equal(parseOpencodeGoCookie('Fe26.2abc'), 'auth=Fe26.2abc')
  assert.equal(parseOpencodeGoCookie('auth=Fe26.2abc; theme=dark'), 'auth=Fe26.2abc')
  assert.equal(parseOpencodeGoCookie('__Host-auth=xyz'), '__Host-auth=xyz')
  assert.equal(parseOpencodeGoCookie('__Host-console_session=cs.abc'), '__Host-console_session=cs.abc')
  assert.equal(parseOpencodeGoCookie('console_session=cs.abc; auth=Fe26.2x'), 'console_session=cs.abc; auth=Fe26.2x')
  assert.equal(parseOpencodeGoCookie('theme=dark'), undefined)
  assert.equal(parseOpencodeGoCookie(''), undefined)
})

test('normalizeOpencodeGoWorkspaceId accepts raw ids and dashboard urls', () => {
  assert.equal(normalizeOpencodeGoWorkspaceId('wrk_abc123'), 'wrk_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('https://opencode.ai/workspace/wrk_abc123/go'), 'wrk_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('see wrk_abc123 here'), 'wrk_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('org_abc123'), 'org_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('https://opencode.ai/console/wrk_abc123/go'), 'wrk_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('https://opencode.ai/console/org_abc123/go'), 'org_abc123')
  assert.equal(normalizeOpencodeGoWorkspaceId('https://opencode.ai/console/api/orgs'), undefined)
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

const CONSOLE_STATUS = {
  access: {
    startsAt: '2026-09-01T00:00:00.000Z',
    endsAt: '2026-10-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    meters: {
      fiveHour: { startsAt: '2026-09-25T15:00:00.000Z', resetsAt: '2026-09-25T20:00:00.000Z', limitMicroCents: '1200000000', usedMicroCents: '600000000' },
      week: { startsAt: '2026-09-21T00:00:00.000Z', resetsAt: '2026-09-28T00:00:00.000Z', limitMicroCents: '3000000000', usedMicroCents: '300000000' },
      month: { limitMicroCents: '6000000000', usedMicroCents: '60000000' },
    },
  },
}

test('parseOpencodeGoConsoleStatus reads micro-cent meters', () => {
  const parsed = parseOpencodeGoConsoleStatus(CONSOLE_STATUS, 1_700_000_000_000)
  assert.equal(parsed.rows.length, 3)
  const [rolling, weekly, monthly] = parsed.rows
  assert.equal(rolling.kind, 'primary')
  assert.equal(rolling.usedPercent, 50)
  assert.equal(rolling.remainingPercent, 50)
  assert.equal(rolling.resetAt, Date.parse('2026-09-25T20:00:00.000Z'))
  assert.deepEqual([rolling.used, rolling.total, rolling.unit], [6, 12, 'usd'])
  assert.equal(weekly.usedPercent, 10)
  // The month meter carries no resetsAt; the billing period end stands in.
  assert.equal(monthly.resetAt, Date.parse('2026-10-01T00:00:00.000Z'))
  assert.equal(monthly.usedPercent, 1)
})

test('parseOpencodeGoConsoleStatus flags a missing subscription', () => {
  assert.throws(() => parseOpencodeGoConsoleStatus({ access: null }), /not active/)
  assert.throws(() => parseOpencodeGoConsoleStatus(null), /not active/)
  assert.throws(() => parseOpencodeGoConsoleStatus({ access: { meters: {} } }), /Missing usage fields/)
})

test('parseOpencodeGoConsoleBilling reads prepaid balance in USD', () => {
  assert.deepEqual(parseOpencodeGoConsoleBilling({
    billingMode: 'prepaid', mode: 'pay-as-you-go', balanceMicroCents: '1250000000',
  }), { useBalance: true, balance: 12.5 })
  assert.deepEqual(parseOpencodeGoConsoleBilling({ billingMode: 'seat', balanceMicroCents: '0' }),
    { useBalance: false, balance: 0 })
  assert.deepEqual(parseOpencodeGoConsoleBilling(undefined), {})
})

function consoleFetch(routes) {
  return async (url) => {
    const path = String(url).replace('https://opencode.ai', '')
    const hit = Object.entries(routes).find(([prefix]) => path.startsWith(prefix))
    if (!hit) return new Response('not found', { status: 404 })
    const value = hit[1]
    if (value instanceof Response) return value
    if (value && value.status) return new Response(JSON.stringify(value.body ?? ''), { status: value.status })
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

test('Go API key supplies quota when the cookie is absent or expired', async () => {
  const calls = []
  const fetchFn = async (url, init: any = {}) => {
    const path = String(url).replace('https://opencode.ai', '')
    calls.push(path)
    if (path === '/zen/go/v1/usage') {
      assert.equal(init.headers.Authorization, 'Bearer sk-test')
      return new Response(JSON.stringify({ usage: {
        rolling: { status: 'ok', percent: 0, resetsAt: '2026-09-26T15:00:00Z' },
        weekly: { status: 'ok', percent: 12, resetsAt: '2026-09-28T00:00:00Z' },
        monthly: { status: 'ok', percent: 74, resetsAt: '2026-10-10T00:00:00Z' },
      } }), { status: 200 })
    }
    return new Response('sign in', { status: 401 })
  }
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const store = new OpencodeGoStore({ path: join(dir, 'opencode-go.json'), fetchFn })
  const saved = await store.save({ apiKey: 'sk-test' })
  let row = (await store.snapshot()).accounts[0]
  assert.equal(row.quota.status, 'ready')
  assert.deepEqual(row.quota.rows.map((item) => item.remainingPercent), [100, 88, 26])
  assert.equal(row.quota.rows[1].resetAt, Date.parse('2026-09-28T00:00:00Z'))
  assert.deepEqual(calls, ['/zen/go/v1/usage'])

  await store.save({ id: saved.id, cookie: 'auth=Fe26.expired' })
  row = (await store.snapshot()).accounts[0]
  assert.equal(row.quota.status, 'ready')
  assert.equal(row.quota.rows[2].remainingPercent, 26)
  assert.ok(calls.includes('/console/api/orgs'))
  assert.equal(calls.at(-1), '/zen/go/v1/usage')
})

test('fetchOpencodeGoQuota reads the console API for migrated workspaces', async () => {
  const quota = await fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x' }, {
    fetchFn: consoleFetch({
      '/console/api/orgs': [{ id: 'wrk_abc123', name: 'Default' }],
      '/console/api/go/status': CONSOLE_STATUS,
      '/console/api/billing/status': { billingMode: 'prepaid', mode: 'pay-as-you-go', balanceMicroCents: '1250000000' },
      '/console/api/user': { id: 'usr_1', email: 'dev@example.com' },
    }),
  })
  assert.equal(quota.workspaceId, 'wrk_abc123')
  assert.equal(quota.workspaceName, 'Default')
  assert.equal(quota.email, 'dev@example.com')
  assert.equal(quota.rows[0].kind, 'primary')
  assert.equal(quota.rows[0].unit, 'usd')
  assert.equal(quota.useBalance, true)
  assert.equal(quota.balance, 12.5)
})

test('fetchOpencodeGoQuota falls back to the legacy page with an auth cookie', async () => {
  const page = 'rollingUsage:$R[35]={status:"ok",resetInSec:30,usagePercent:10,usage:100000000,limit:1000000000}'
  const quota = await fetchOpencodeGoQuota({ cookieHeader: 'auth=Fe26.2x', workspaceId: 'wrk_abc123' }, {
    fetchFn: consoleFetch({
      '/console/api/': { status: 401, body: { _tag: 'Unauthorized' } },
      '/workspace/': new Response(page, { status: 200 }),
    }),
  })
  assert.equal(quota.rows[0].remainingPercent, 90)
  assert.deepEqual([quota.rows[0].used, quota.rows[0].total], [100_000_000, 1_000_000_000])
})

test('fetchOpencodeGoQuota reports the console error when only a console cookie exists', async () => {
  await assert.rejects(
    () => fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
      fetchFn: consoleFetch({ '/console/api/go/status': { status: 500, body: { message: 'boom' } } }),
    }),
    /console HTTP 500: boom/,
  )
  await assert.rejects(
    () => fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
      fetchFn: consoleFetch({ '/console/api/go/status': { status: 401, body: { _tag: 'Unauthorized' } } }),
    }),
    /invalid or expired/,
  )
})

test('fetchOpencodeGoQuota keeps a balance-only account out of the error state', async () => {
  const quota = await fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
    fetchFn: consoleFetch({
      '/console/api/go/status': { access: null },
      '/console/api/billing/status': { billingMode: 'prepaid', mode: 'pay-as-you-go', balanceMicroCents: '500000000' },
    }),
  })
  assert.equal(quota.rows.length, 0)
  assert.equal(quota.balance, 5)
  await assert.rejects(
    () => fetchOpencodeGoQuota({ cookieHeader: '__Host-console_session=cs.x', workspaceId: 'wrk_abc123' }, {
      fetchFn: consoleFetch({
        '/console/api/go/status': { access: null },
        '/console/api/billing/status': { billingMode: 'seat', mode: 'invoiceable' },
      }),
    }),
    /not active/,
  )
})
