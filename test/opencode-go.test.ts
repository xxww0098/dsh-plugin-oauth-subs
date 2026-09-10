import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseOpencodeGoCookie, normalizeOpencodeGoWorkspaceId } from '../lib/apikey/opencode-go/index.js'
import { parseOpencodeGoUsage } from '../lib/apikey/opencode-go/quota.js'
import { OpencodeGoStore, opencodeGoFilePath } from '../lib/apikey/opencode-go/store.js'

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

test('OpencodeGoStore round-trips cookie + workspace and keeps cookie out of the snapshot', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const path = opencodeGoFilePath(join(dir, 'auth.json'))
  const page = JSON.stringify({ usage: { rolling: { usagePercent: 10, resetInSec: 30 } } })
  const fetchFn = async () => new Response(page, { status: 200, headers: { 'content-type': 'text/javascript' } })
  const store = new OpencodeGoStore({ path, fetchFn })
  const saved = await store.save({ cookie: 'Fe26.2token', workspace: 'wrk_abc123' })
  assert.equal(saved.cookieSet, true)
  assert.equal(saved.workspaceId, 'wrk_abc123')
  assert.equal(saved.quota.status, 'ready')
  assert.equal(saved.quota.rows[0].remainingPercent, 90)
  assert.equal('cookieHeader' in saved, false)

  const snap = await store.snapshot()
  assert.equal(snap.cookieSet, true)
  assert.equal(snap.workspaceId, 'wrk_abc123')

  const afterClear = await store.clear('cookie')
  assert.equal(afterClear.cookieSet, false)
  assert.equal(afterClear.quota.status, 'idle')
})

test('OpencodeGoStore rejects a cookie header without an auth cookie', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opencode-go-'))
  const store = new OpencodeGoStore({
    path: join(dir, 'opencode-go.json'),
    fetchFn: async () => new Response('{}', { status: 200 }),
  })
  await assert.rejects(() => store.save({ cookie: 'theme=dark; lang=en' }), /auth token or Cookie header/)
})
