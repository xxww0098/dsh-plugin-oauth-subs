import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Reload complete real module graphs, not just cache.js with a query string:
// request.ts must actually resolve the new cache module too.
test('Grok request graphs retain compatible pins across reload', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'grok-hmr-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
  await symlink(fileURLToPath(new URL('../node_modules/', import.meta.url)), join(root, 'node_modules'), 'dir')
  for (const generation of ['before', 'after']) {
    await cp(fileURLToPath(new URL('../lib/', import.meta.url)), join(root, generation, 'lib'), { recursive: true })
  }
  const load = (generation, file) => import(pathToFileURL(join(root, generation, 'lib', 'oauth', file)).href)
  const before = await load('before', 'proxy-body.js')
  const beforeCache = await load('before', 'grok/cache.js')
  beforeCache.resetGrokSystemPins()
  t.after(() => beforeCache.resetGrokSystemPins())
  const original = ['Stable agent instructions.', 'Keep tools and contracts unchanged.', 'Runtime: initial'].join(String.fromCharCode(10))
  const updated = original.replace('Runtime: initial', 'Runtime: updated')
  const request = (graph, id, system, history = []) => graph.rewriteUpstreamBody(JSON.stringify({
    model: 'grok-4.7', session_id: id,
    input: [{ role: 'developer', content: system }, { role: 'user', content: 'hi' }, ...history],
  }), 'grok')
  request(before, 'hmr-main', original)
  const after = await load('after', 'proxy-body.js')

  await t.test('the reloaded graph replays the old leading prefix and routing key', () => {
    const out = request(after, 'hmr-main', updated, [{ role: 'assistant', content: 'working' }])
    assert.equal(out.payload.input[0].content, original)
    assert.deepEqual(out.payload.input.at(-1), {
      role: 'developer', content: [{ type: 'input_text', text: 'Runtime: updated' }],
    })
    assert.equal(out.cacheSessionId, 'hmr-main')
    assert.equal(out.payload.prompt_cache_key, 'hmr-main')
    assert.equal(Object.hasOwn(out.payload, 'session_id'), false)
  })

  await t.test('an explicit reset through the old graph clears the reloaded graph too', () => {
    request(after, 'hmr-reset', original)
    beforeCache.resetGrokSystemPins()
    assert.equal(request(after, 'hmr-reset', updated).payload.input[0].content, updated)
  })

  await t.test('the 64-entry LRU is shared rather than doubled by reload', () => {
    beforeCache.resetGrokSystemPins()
    request(before, 'hmr-hot', original)
    request(before, 'hmr-idle', original)
    for (let i = 0; i < 62; i++) request(i % 2 ? before : after, 'hmr-other-' + i, original)
    assert.equal(request(after, 'hmr-hot', updated).payload.input[0].content, original)
    request(before, 'hmr-overflow', original)
    assert.equal(request(before, 'hmr-hot', updated).payload.input[0].content, original)
    assert.equal(request(before, 'hmr-idle', updated).payload.input[0].content, updated)
  })

  await t.test('diagnostic salts and logical baselines survive compatible graph reload too', async () => {
    const a = await load('before', 'grok/diagnostics.js')
    const b = await load('after', 'grok/diagnostics.js')
    const path = join(root, 'grok-cache.jsonl')
    a.setGrokCacheLog(path)
    b.setGrokCacheLog(path)
    try {
      const observe = (out, attempt) => out.observeResponse({ attempt, accountId: 'account', requestId: 'request',
        wireBody: Buffer.from(JSON.stringify(out.payload)) })
      await observe(request(before, 'hmr-diagnostic', original), 0).finish()
      await observe(request(after, 'hmr-diagnostic', updated), 0).finish()
      await b.flushGrokCacheLog()
      const rows = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
        .filter(row => row.event === 'request')
      assert.equal(rows[0].conversationFingerprint, rows[1].conversationFingerprint)
      assert.equal(rows[0].prefixFingerprint, rows[1].prefixFingerprint)
      assert.equal(rows[1].prefixChanged, false)
      assert.equal(rows[1].sharedInputItems, 2)
      assert.equal(rows[1].previousPinGeneration, rows[0].pinGeneration)
      assert.notEqual(rows[0].pinGeneration, rows[1].pinGeneration)
    } finally { a.setGrokCacheLog(undefined); b.setGrokCacheLog(undefined) }
  })
})
