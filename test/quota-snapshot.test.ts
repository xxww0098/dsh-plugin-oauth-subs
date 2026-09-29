import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { QuotaStore } from '../lib/oauth/quota.js'
import { kiroSession } from '../lib/oauth/kiro/index.js'

const session = kiroSession({ accessToken: 'tok', region: 'us-east-1', authMethod: 'social', profileArn: 'arn:aws:codewhisperer:us-east-1:123456789012:profile/ABC' })
const tokens = { kiro: { session: async () => session } }
const usage = (used: number) => new Response(JSON.stringify({
  subscriptionInfo: { subscriptionTitle: 'KIRO POWER' },
  usageBreakdownList: [{ currentUsageWithPrecision: used, usageLimitWithPrecision: 10000, nextDateReset: 1.7908128e9, resourceType: 'CREDIT' }],
  userInfo: { email: 'a@example.com' },
}), { status: 200 })
const never = () => new Promise<Response>(() => {})
const pathIn = async () => join(await mkdtemp(join(tmpdir(), 'osubs-quota-')), 'quota-snapshot.json')

test('a restart shows the last reading at once and re-reads behind it', async () => {
  const path = await pathIn()
  const first = new QuotaStore({ tokens, fetchFn: async () => usage(555), snapshotPath: path })
  const fresh = await first.ensure('kiro')
  assert.equal(fresh.status, 'ready')
  await first.flush()

  // The next process: the upstream is unreachable, yet the panel has numbers immediately.
  let reads = 0
  await new Promise((resolve) => setTimeout(resolve, 20)) // the saved reading is now older than the 10ms window
  const second = new QuotaStore({ tokens, fetchFn: () => { reads += 1; return never() }, snapshotPath: path, ttlMs: 10 })
  const restored = await Promise.race([second.ensure('kiro'), new Promise((resolve) => setTimeout(() => resolve('blocked'), 500))]) as any
  assert.notEqual(restored, 'blocked', 'ensure must not wait for the network')
  assert.equal(restored.status, 'ready')
  assert.equal(restored.rows[0].used, 555)
  assert.equal(restored.account, 'a@example.com')
  assert.equal(restored.updatedAt, fresh.updatedAt, 'the restored reading keeps its own age')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(reads, 1, 'and the refresh behind it has started')
})

test('logout clears the saved reading; a stale, corrupt or foreign file starts empty', async () => {
  const path = await pathIn()
  const store = new QuotaStore({ tokens, fetchFn: async () => usage(1), snapshotPath: path })
  await store.ensure('kiro')
  await store.flush()
  assert.match(await readFile(path, 'utf8'), /"version":1/)

  store.clear('kiro')
  await store.flush()
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).entries, {})
  assert.equal(new QuotaStore({ tokens, snapshotPath: path }).peek('kiro').status, 'idle')

  const row = { key: 'cycle', kind: 'cycle', used: 1, total: 2 }
  const day = 86_400_000
  await writeFile(path, JSON.stringify({ version: 1, entries: {
    'kiro\0old': { status: 'ready', updatedAt: Date.now() - 8 * day, rows: [row] },
    'kiro\0new': { status: 'ready', updatedAt: Date.now() - day, rows: [row] },
    'kiro\0empty': { status: 'ready', updatedAt: Date.now(), rows: [] },
  } }))
  const aged = new QuotaStore({ tokens, snapshotPath: path })
  assert.deepEqual([...aged.cache.keys()], ['kiro\0new'], 'past a week, or without numbers, a reading is not restored')

  for (const junk of ['{not json', JSON.stringify({ version: 99, entries: { a: {} } }), '[]']) {
    await writeFile(path, junk)
    assert.equal(new QuotaStore({ tokens, snapshotPath: path }).cache.size, 0)
  }
})

test('a failed re-read keeps the saved numbers, and the error is not what gets restored', async () => {
  const path = await pathIn()
  const store = new QuotaStore({ tokens, fetchFn: async () => usage(7), snapshotPath: path, ttlMs: 0 })
  await store.ensure('kiro')
  store.fetchFn = async () => new Response('down', { status: 500 })
  const failed = await store.refresh('kiro')
  assert.equal(failed.status, 'error')
  await store.flush()
  const restored = new QuotaStore({ tokens, snapshotPath: path }).peek('kiro')
  assert.equal(restored.status, 'ready')
  assert.equal(restored.error, undefined)
  assert.equal(restored.rows[0].used, 7)
})

test('without a snapshot path nothing is written and the cache is a plain Map', async () => {
  const store = new QuotaStore({ tokens, fetchFn: async () => usage(3) })
  await store.ensure('kiro')
  await store.flush()
  assert.equal(store.cache.constructor, Map)
})
