import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createProxy } from '../lib/oauth/proxy.js'
import { rewriteUpstreamBody } from '../lib/oauth/proxy-body.js'
import { resetGrokSystemPins } from '../lib/oauth/grok/cache.js'
import { flushGrokCacheLog, setGrokCacheLog } from '../lib/oauth/grok/diagnostics.js'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'grok-diag-'))
  const path = join(root, 'grok-cache.jsonl')
  setGrokCacheLog(path)
  resetGrokSystemPins()
  t.after(async () => {
    setGrokCacheLog(undefined)
    await flushGrokCacheLog()
    resetGrokSystemPins()
    await rm(root, { recursive: true, force: true })
  })
  return { root, path, rows: async () => {
    await flushGrokCacheLog()
    return (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  } }
}
const body = (id, system = 'PRIVATE_SYSTEM_SENTINEL', extra = []) => ({
  model: 'grok-4.7', session_id: id, stream: true,
  tools: [{ type: 'function', name: 'tool', description: 'PRIVATE_TOOL_SENTINEL', parameters: { type: 'object' } }],
  input: [{ role: 'developer', content: system }, { role: 'user', content: 'PRIVATE_USER_SENTINEL' }, ...extra],
})
const prepare = (payload) => rewriteUpstreamBody(JSON.stringify(payload), 'grok')
const begin = (prepared, attempt = 0) => prepared.observeResponse({
  requestId: 'PRIVATE_REQUEST_SENTINEL', accountId: 'PRIVATE_ACCOUNT_SENTINEL', attempt,
  wireBody: Buffer.from(JSON.stringify(prepared.payload)),
})
const terminal = (usage) => 'event: response.completed\r\ndata: ' + JSON.stringify({
  type: 'response.completed', response: { usage, output: [{ text: 'PRIVATE_OUTPUT_SENTINEL' }] },
}) + '\r\n\r\n'

test('Grok logs only salted metadata and genuine terminal cache usage', async (t) => {
  const f = await fixture(t)
  const prepared = prepare(body('PRIVATE_SESSION_SENTINEL'))
  const unchanged = JSON.stringify(prepared.payload)
  const observer = begin(prepared)
  observer.status(200)
  const bytes = Buffer.from(terminal({ input_tokens: 1000, output_tokens: 12, input_tokens_details: { cached_tokens: 896 } }))
  for (let i = 0; i < bytes.length; i += 7) observer.push(bytes.subarray(i, i + 7))
  await observer.finish()
  await observer.finish() // idempotent: no double usage on cleanup
  const rows = await f.rows()
  assert.deepEqual(rows.map(r => r.event), ['request', 'response'])
  assert.equal(rows[1].cacheReadTokens, 896)
  assert.equal(rows[1].inputTokens, 1000)
  assert.equal(rows[1].outputTokens, 12)
  assert.equal(rows[1].terminal, 'response.completed')
  assert.equal(rows[1].pinAction, 'new')
  assert.equal(rows[1].status, 200)
  assert.equal(JSON.stringify(prepared.payload), unchanged)
  const log = await readFile(f.path, 'utf8')
  for (const secret of ['PRIVATE_SYSTEM_SENTINEL', 'PRIVATE_TOOL_SENTINEL', 'PRIVATE_USER_SENTINEL',
    'PRIVATE_SESSION_SENTINEL', 'PRIVATE_REQUEST_SENTINEL', 'PRIVATE_ACCOUNT_SENTINEL', 'PRIVATE_OUTPUT_SENTINEL']) {
    assert.equal(log.includes(secret), false, secret)
  }
  assert.match(rows[1].conversationFingerprint, /^[a-f0-9]{24}$/)
  assert.equal((await stat(f.path)).mode & 0o777, 0o600)
})

test('missing or invalid cache usage remains unknown, while explicit zero remains zero', async (t) => {
  const f = await fixture(t)
  for (const [id, details] of [['missing', undefined], ['zero', { cached_tokens: 0 }], ['bad', { cached_tokens: '896' }]]) {
    const observer = begin(prepare({ ...body(id), stream: false }))
    observer.status(200)
    observer.push(Buffer.from(JSON.stringify({ usage: { input_tokens: 1000, output_tokens: 3, input_tokens_details: details } })))
    await observer.finish()
  }
  const responses = (await f.rows()).filter(r => r.event === 'response')
  assert.deepEqual(responses.map(r => r.cacheReadTokens), [null, 0, null])
})

test('prefix comparisons reuse the prior logical request, not a failed retry of themselves', async (t) => {
  const f = await fixture(t)
  const initial = body('prefix-case')
  await begin(prepare(initial)).finish()
  const updated = prepare(body('prefix-case', 'PRIVATE_SYSTEM_SENTINEL\nRuntime changed', [{ role: 'assistant', content: 'ok' }]))
  await begin(updated, 0).finish()
  await begin(updated, 1).finish()
  const rows = (await f.rows()).filter(r => r.event === 'request')
  assert.equal(rows[1].pinAction, 'append')
  assert.equal(rows[1].prefixChanged, false)
  assert.equal(rows[1].sharedInputItems, 2)
  assert.equal(rows[1].sharedInputBytes, rows[2].sharedInputBytes)
  assert.equal(rows[1].previousRequestGapMs, rows[2].previousRequestGapMs)
  assert.equal(rows[1].requestFingerprint, rows[2].requestFingerprint)
  const changedTools = body('prefix-case')
  changedTools.tools[0].description = 'DIFFERENT_TOOL_SENTINEL'
  await begin(prepare(changedTools)).finish()
  const last = (await f.rows()).filter(r => r.event === 'request').at(-1)
  assert.equal(last.prefixChanged, true)
  assert.equal(last.sharedInputBytes, 0)
})

test('oversized SSE frames are skipped without losing a later terminal usage frame', async (t) => {
  const f = await fixture(t)
  const observer = begin(prepare(body('oversized')))
  const huge = Buffer.from('event: response.created\ndata: ' + 'x'.repeat(2 * 1024 * 1024 + 100) + '\n\n')
  for (let i = 0; i < huge.length; i += 1024) observer.push(huge.subarray(i, i + 1024))
  observer.push(Buffer.from(terminal({ input_tokens: 1024, input_tokens_details: { cached_tokens: 512 } })))
  await observer.finish()
  const last = (await f.rows()).at(-1)
  assert.equal(last.observationTruncated, true)
  assert.equal(last.cacheReadTokens, 512)
})

test('diagnostic files rotate privately and input baselines retain only a bounded prefix', async (t) => {
  const f = await fixture(t)
  await writeFile(f.path, 'x'.repeat(1_000_100), { mode: 0o644 })
  const many = Array.from({ length: 600 }, (_, i) => ({ role: 'user', content: 'item ' + i }))
  await begin(prepare(body('bounded', 'PRIVATE_SYSTEM_SENTINEL', many))).finish()
  await begin(prepare(body('bounded', 'PRIVATE_SYSTEM_SENTINEL', many))).finish()
  assert.equal((await stat(f.path + '.1')).mode & 0o777, 0o600)
  const last = (await f.rows()).filter(r => r.event === 'request').at(-1)
  assert.equal(last.baselineTruncated, true)
  assert.equal(last.sharedInputItems, 512)
})

test('the real Grok proxy observes usage after commit and forwards every byte unchanged', async (t) => {
  const f = await fixture(t)
  const wire = 'event: response.created\ndata: {"type":"response.created"}\n\n'
    + 'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"PRIVATE_OUTPUT_SENTINEL"}\n\n'
    + terminal({ input_tokens: 2000, output_tokens: 20, input_tokens_details: { cached_tokens: 1792 } })
  const seen = []
  const proxy = createProxy({ port: 0, apiKey: 'local-test-key', tokens: {
    grok: { session: async () => ({ accessToken: 'PRIVATE_ACCESS_TOKEN_SENTINEL', account: 'PRIVATE_ACCOUNT_SENTINEL' }) },
  }, fetchFn: async (_url, init) => {
    seen.push(JSON.parse(init.body.toString()))
    const bytes = Buffer.from(wire)
    return new Response(new ReadableStream({ start(controller) {
      for (let i = 0; i < bytes.length; i += 19) controller.enqueue(bytes.subarray(i, i + 19))
      controller.close()
    } }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  } })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/grok/v1/responses', {
    method: 'POST', headers: { authorization: 'Bearer local-test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body('PRIVATE_PROXY_SESSION_SENTINEL')), signal: AbortSignal.timeout(2000),
  })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), wire)
  const rows = await f.rows()
  assert.equal(rows.at(-1).cacheReadTokens, 1792)
  assert.equal(rows.at(-1).status, 200)
  assert.equal(Object.hasOwn(seen[0], 'observeResponse'), false)
  assert.equal(Object.hasOwn(seen[0], 'pinAction'), false)
  const log = await readFile(f.path, 'utf8')
  assert.equal(log.includes('PRIVATE_ACCESS_TOKEN_SENTINEL'), false)
  assert.equal(log.includes('PRIVATE_PROXY_SESSION_SENTINEL'), false)
})

test('disabled or failing diagnostics do not affect request normalization or response forwarding', async (t) => {
  const f = await fixture(t)
  setGrokCacheLog(undefined)
  assert.equal(prepare(body('disabled')).observeResponse, undefined)
  assert.equal(rewriteUpstreamBody(JSON.stringify({ model: 'gpt-5.3-codex', input: [] }), 'codex').observeResponse, undefined)
  await writeFile(join(f.root, 'not-a-directory'), 'file')
  setGrokCacheLog(join(f.root, 'not-a-directory', 'grok-cache.jsonl'))
  const observer = begin(prepare(body('failed-log')))
  observer.push(Buffer.from(terminal({ input_tokens: 1, input_tokens_details: { cached_tokens: 0 } })))
  await assert.doesNotReject(observer.finish())
})

test('real Grok stored accounts isolate diagnostic baselines through the proxy', async (t) => {
  const f = await fixture(t)
  let account = 'PRIVATE_REAL_ACCOUNT_A'
  const proxy = createProxy({ port: 0, apiKey: 'test-key', tokens: {
    grok: { session: async () => ({ accessToken: 'private-test-token', account }),
      sourceOf: session => ({ id: 'stored-' + session.account }) },
  }, fetchFn: async () => new Response(JSON.stringify({ usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 896 } } }), {
    headers: { 'content-type': 'application/json' },
  }) })
  const server = await proxy.listen()
  t.after(() => proxy.close())
  for (const next of ['PRIVATE_REAL_ACCOUNT_A', 'PRIVATE_REAL_ACCOUNT_B', 'PRIVATE_REAL_ACCOUNT_A']) {
    account = next
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/grok/v1/responses', {
      method: 'POST', headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ ...body('real-accounts'), stream: false }), signal: AbortSignal.timeout(2000),
    })
    assert.equal(response.status, 200)
    await response.text()
  }
  const rows = (await f.rows()).filter(r => r.event === 'request')
  assert.equal(rows[1].previousRequestGapMs, null)
  assert.equal(rows[1].sharedInputItems, 0)
  assert.equal(rows[2].sharedInputItems, 2)
  assert.notEqual(rows[0].accountFingerprint, rows[1].accountFingerprint)
  assert.equal(rows[0].accountFingerprint, rows[2].accountFingerprint)
  assert.equal((await readFile(f.path, 'utf8')).includes('PRIVATE_REAL_ACCOUNT'), false)
})

test('identity-changing retries A to B to A preserve each original comparison', async (t) => {
  const f = await fixture(t)
  const invoke = (prepared, accountId, attempt) => prepared.observeResponse({ accountId, attempt,
    requestId: 'retry-identity', wireBody: Buffer.from(JSON.stringify(prepared.payload)) })
  await invoke(prepare(body('identity-retries')), 'A', 0).finish()
  const next = prepare(body('identity-retries', 'PRIVATE_SYSTEM_SENTINEL', [{ role: 'assistant', content: 'ok' }]))
  for (const [attempt, account] of ['A', 'B', 'A'].entries()) await invoke(next, account, attempt).finish()
  const rows = (await f.rows()).filter(r => r.event === 'request')
  assert.equal(rows[1].sharedInputItems, 2)
  assert.equal(rows[2].previousRequestGapMs, null)
  assert.equal(rows[2].sharedInputItems, 0)
  assert.equal(rows[3].sharedInputItems, 2)
  assert.equal(rows[3].previousRequestGapMs, rows[1].previousRequestGapMs)
})

test('SSE CR, LF, CRLF and mixed line endings survive byte-wise fragmentation', async (t) => {
  const f = await fixture(t)
  for (const [i, ending] of ['\r', '\n', '\r\n', 'mixed'].entries()) {
    const observer = begin(prepare(body('line-endings-' + i)))
    const base = terminal({ input_tokens: 1000, input_tokens_details: { cached_tokens: 896 } })
      .replace('PRIVATE_OUTPUT_SENTINEL', '值😀')
    const text = ending === 'mixed' ? base.replace('\r\n', '\r').replace('\r\n\r\n', '\n\r\n')
      : base.replaceAll('\r\n', ending)
    for (const byte of Buffer.from(text)) observer.push(Uint8Array.of(byte))
    await observer.finish()
  }
  const responses = (await f.rows()).filter(r => r.event === 'response')
  assert.deepEqual(responses.map(r => r.cacheReadTokens), [896, 896, 896, 896])
})

test('exact-cap SSE bodies do not count split closing delimiter bytes as content', async (t) => {
  const f = await fixture(t)
  const limit = 2 * 1024 * 1024
  for (const delta of [-1, 0, 1]) {
    const observer = begin(prepare(body('frame-boundary-' + delta)))
    const base = terminal({ input_tokens: 1000, input_tokens_details: { cached_tokens: 896 } })
      .replaceAll('\r\n', '\n').slice(0, -2)
    // A JSON string field makes padding meaningful but does not enter the log.
    const empty = base.replace('PRIVATE_OUTPUT_SENTINEL', '')
    const frame = base.replace('PRIVATE_OUTPUT_SENTINEL', 'x'.repeat(limit + delta - Buffer.byteLength(empty)))
    observer.push(Buffer.from(frame))
    observer.push(Buffer.from('\n'))
    observer.push(Buffer.from('\n'))
    await observer.finish()
  }
  const responses = (await f.rows()).filter(r => r.event === 'response')
  assert.deepEqual(responses.map(r => r.cacheReadTokens), [896, 896, null])
  assert.deepEqual(responses.map(r => r.observationTruncated), [false, false, true])
})

test('diagnostics serialize retained items once and mark over-budget work unknown', async (t) => {
  const f = await fixture(t)
  const stringify = JSON.stringify
  let itemSerializations = 0
  const raw = stringify(body('serialization-budget'))
  t.mock.method(JSON, 'stringify', function(value, ...args) {
    if (value?.role === 'system' && value.content === 'PRIVATE_SYSTEM_SENTINEL') itemSerializations++
    return stringify(value, ...args)
  })
  await begin(rewriteUpstreamBody(raw, 'grok')).finish()
  assert.ok(itemSerializations <= 1)
  const huge = prepare(body('over-budget', 'x'.repeat(3 * 1024 * 1024)))
  await begin(huge).finish()
  const row = (await f.rows()).filter(r => r.event === 'request').at(-1)
  assert.equal(row.diagnosticWorkTruncated, true)
  assert.equal(row.requestFingerprintTruncated, true)
  assert.equal(row.prefixFingerprint, null)
  assert.equal(row.sharedInputBytes, null)
})

test('a planted diagnostic link is refused without changing its target', async (t) => {
  const f = await fixture(t)
  const target = join(f.root, 'untouched-target')
  await writeFile(target, 'do not append', { mode: 0o644 })
  await symlink(target, f.path)
  await begin(prepare(body('symlink'))).finish()
  await flushGrokCacheLog()
  assert.equal(await readFile(target, 'utf8'), 'do not append')
  assert.equal((await stat(target)).mode & 0o777, 0o644)
})

test('pending log pressure drops bounded evidence and later reports the loss', async (t) => {
  const f = await fixture(t)
  const finishes = []
  for (let i = 0; i < 100; i++) finishes.push(begin(prepare(body('pressure-' + i))).finish())
  await Promise.all(finishes)
  const pressureRows = await f.rows()
  assert.ok(pressureRows.length <= 128)
  await begin(prepare(body('pressure-recovered'))).finish()
  const recovered = (await f.rows()).at(-1)
  assert.ok(recovered.droppedLogLines > 0)
})

test('diagnostic baselines evict the idle identity at 64 entries, not the recent one', async (t) => {
  const f = await fixture(t)
  for (let i = 0; i < 64; i++) await begin(prepare(body('baseline-' + i))).finish()
  await begin(prepare(body('baseline-0'))).finish()
  await begin(prepare(body('baseline-overflow'))).finish()
  await begin(prepare(body('baseline-0'))).finish()
  await begin(prepare(body('baseline-1'))).finish()
  const rows = (await f.rows()).filter(r => r.event === 'request')
  assert.equal(rows.at(-2).sharedInputItems, 2)
  assert.equal(rows.at(-1).previousRequestGapMs, null)
})
