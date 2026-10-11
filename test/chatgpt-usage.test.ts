import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  chatgptUsageRows,
  parseChatgptUsageEvent,
  recordChatgptUsage,
  resetChatgptUsageLog,
  setChatgptUsageLog,
} from '../lib/oauth/chatgpt/usage.js'
import { chatgptQuota } from '../lib/oauth/chatgpt/index.js'
import { createProxy } from '../lib/oauth/proxy.js'
import { QuotaStore } from '../lib/oauth/quota.js'

function completed(usage: any, model = 'gpt-6-luna') {
  return { type: 'response.completed', response: { id: 'resp_1', model, usage } }
}

const USAGE = {
  input_tokens: 5_422,
  input_tokens_details: { cached_tokens: 3_000 },
  output_tokens: 811,
  output_tokens_details: { reasoning_tokens: 100 },
  total_tokens: 6_233,
}

test('parseChatgptUsageEvent reads the terminal usage block and rejects noise', () => {
  assert.deepEqual(parseChatgptUsageEvent(completed(USAGE)), { model: 'gpt-6-luna', input: 5_422, cached: 3_000, output: 811 })
  // No cached breakdown is fine; the model may be absent.
  assert.deepEqual(
    parseChatgptUsageEvent(completed({ input_tokens: 10, output_tokens: 5 }, '')),
    { model: '', input: 10, cached: 0, output: 5 },
  )
  assert.equal(parseChatgptUsageEvent({ type: 'response.created', response: { id: 'r' } }), undefined)
  assert.equal(parseChatgptUsageEvent(completed({})), undefined)
  assert.equal(parseChatgptUsageEvent(completed({ input_tokens: 0, output_tokens: 0 })), undefined)
})

test('chatgptUsageRows sums rolling 5h and 7d windows per account', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'chatgpt-usage-'))
  t.after(() => { resetChatgptUsageLog(); return rm(dir, { recursive: true, force: true }) })
  const log = join(dir, 'chatgpt-usage.jsonl')
  setChatgptUsageLog(log)
  const now = Date.now()
  const hour = 3_600_000
  const spend = { model: 'gpt-6-luna', input: 1_000, cached: 0, output: 200 }
  await recordChatgptUsage('acct-a', spend, now - hour)
  await recordChatgptUsage('acct-a', spend, now - 6 * hour) // weekly only
  await recordChatgptUsage('acct-a', spend, now - 8 * 24 * hour) // outside both
  await recordChatgptUsage('acct-b', spend, now - hour) // another account

  const rows = await chatgptUsageRows('acct-a', now)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].kind, 'primary')
  assert.equal(rows[0].used, 1_200, '5h keeps only the fresh spend')
  assert.match(rows[0].note, /近 5 小时实测/)
  assert.equal(rows[1].kind, 'weekly')
  assert.equal(rows[1].used, 2_400, '7d keeps both in-window spends')
  assert.match(rows[1].note, /官方额度单位不是 token/)
  assert.deepEqual(await chatgptUsageRows('acct-none', now), [], 'an account without spends has no rows')

  const lines = (await readFile(log, 'utf8')).trim().split('\n')
  assert.equal(lines.length, 4)
  assert.deepEqual(Object.keys(JSON.parse(lines[0])).sort(), ['account', 'at', 'cached', 'input', 'model', 'output'])
})

test('chatgptQuota carries the measured rows for the session account', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'chatgpt-usage-'))
  t.after(() => { resetChatgptUsageLog(); return rm(dir, { recursive: true, force: true }) })
  setChatgptUsageLog(join(dir, 'chatgpt-usage.jsonl'))
  await recordChatgptUsage('acct-a', { model: 'gpt-5.6', input: 700, cached: 0, output: 300 })
  const quota = await chatgptQuota({ accountKey: 'acct-a', emailAddress: 'a@x.test' })
  assert.equal(quota.account, 'a@x.test')
  assert.equal(quota.rows.length, 2)
  assert.equal(quota.rows[0].used, 1_000)
  assert.deepEqual((await chatgptQuota({})).rows, [])
})

const SSE = { 'content-type': 'text/event-stream' }

function streamBody(usage: any) {
  // A delta first (commits the gate), then the terminal usage block — the
  // capture must still see the frame that arrives after commit.
  return ''
    + 'event: response.created\ndata: {"type":"response.created","response":{"id":"r1"}}\n\n'
    + `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hi"}\n\n`
    + `event: response.completed\ndata: ${JSON.stringify(completed(usage))}\n\n`
}

test('the chatgpt hop learns measured usage from the terminal frame, after commit', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'chatgpt-usage-hop-'))
  t.after(() => { resetChatgptUsageLog(); return rm(dir, { recursive: true, force: true }) })
  const log = join(dir, 'chatgpt-usage.jsonl')
  setChatgptUsageLog(log)
  const store = new QuotaStore({ tokens: {} })
  const session = { accessToken: 'tok', accountKey: 'acct-hop', emailAddress: 'hop@x.test' }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    tokens: { chatgpt: { session: async () => session } },
    fetchFn: async () => new Response(streamBody(USAGE), { status: 200, headers: SSE }),
    onQuotaLearned: (family, data, sess) => { void store.learn(family, data, sess) },
  })
  const server = await proxy.listen()
  t.after(() => proxy.close())

  const first = await fetch(`http://127.0.0.1:${server.address().port}/chatgpt/v1/responses`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-6-luna', stream: true, store: false, input: [{ type: 'message', role: 'user', content: 'hi' }] }),
  })
  assert.equal(first.status, 200)
  await first.text()

  // The learn hop is fire-and-forget; let it land before reading the store.
  await new Promise((resolve) => setTimeout(resolve, 50))
  const entry = store.cache.get('chatgpt\0acct-hop')
  assert.ok(entry, 'the chatgpt account appears in the quota cache')
  assert.deepEqual((entry.rows ?? []).map((row) => [row.kind, row.used]), [['primary', 6_233], ['weekly', 6_233]])

  // A second response accumulates into the same windows.
  const second = await fetch(`http://127.0.0.1:${server.address().port}/chatgpt/v1/responses`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-6-luna', stream: true, store: false, input: [{ type: 'message', role: 'user', content: 'again' }] }),
  })
  assert.equal(second.status, 200)
  await second.text()
  await new Promise((resolve) => setTimeout(resolve, 50))
  const rows = await chatgptUsageRows('acct-hop')
  assert.equal(rows[0].used, 12_466, 'both terminal usage blocks are in the window')
})
