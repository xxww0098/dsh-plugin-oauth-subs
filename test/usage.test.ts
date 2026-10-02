import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readUsage, scanSessionText, scanUsage } from '../lib/utils/usage.js'

const HOUR = 3_600_000
const T0 = 1_790_000_000_000

function message(turn, step, time, provider, model, usage, stream: any[] = []) {
  return { type: 'assistant/message', seq: turn * 10 + step, time, data: { turn, step, stream, message: { source: { provider, model }, usage } } }
}

function session(dir, name, version, events) {
  mkdirSync(dir, { recursive: true })
  const head = { type: 'session', version, id: 'session-a' }
  writeFileSync(join(dir, name), [head, ...events].map((event) => JSON.stringify(event)).join('\n'))
}

test('scanUsage: hourly rows per provider/model, one count per step, highest session version wins', () => {
  const root = mkdtempSync(join(tmpdir(), 'osubs-usage-'))
  const u = { inputTokens: 100, outputTokens: 10, cacheReadTokens: 50 }
  // Older v3 copy of the same session: must be ignored in favor of v4.
  session(join(root, 'p', 's'), 'session.jsonl', 3, [message(1, 1, T0, 'oauth-kiro', 'm', u)])
  session(join(root, 'p', 's'), 'session.v4.jsonl', 4, [
    message(1, 1, T0, 'oauth-kiro', 'm', u),
    message(1, 1, T0, 'oauth-kiro', 'm', u), // rewritten step: counted once
    message(1, 2, T0 + 60_000, 'oauth-kiro', 'm', u),
    message(2, 1, T0 + 2 * HOUR, 'oauth-codex', 'gpt', { inputTokens: 5, outputTokens: 1 }),
    { type: 'assistant/chunk', time: T0, data: { chunk: { type: 'usage', usage: u } } },
  ])
  const first = scanUsage(root, T0 - HOUR)
  const rows = first.rows.sort((a, b) => a[0] - b[0])
  assert.deepEqual(rows, [
    // cachePrompt counts input + cacheRead of calls that report a cache field
    [Math.floor(T0 / HOUR), 'oauth-kiro', 'm', 2, 200, 20, 100, 0, 0, 300, 0, 0, 0, 0],
    // no cacheReadTokens field: cachePrompt stays 0 (hit rate n/a, not 0%)
    [Math.floor(T0 / HOUR) + 2, 'oauth-codex', 'gpt', 1, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  ])
  // The same session as v3 + v4 files is one 按会话 entry, newest-first by
  // file mtime, carrying only the in-window rows.
  assert.equal(first.sessions.length, 1)
  assert.equal(first.sessions[0].id, 'session-a')
  assert.equal(first.sessions[0].rows.length, rows.length)

  // Unchanged files come from the cache without being read again.
  let reads = 0
  const again = scanUsage(root, T0 - HOUR, first.files, (path) => {
    reads += 1
    const entry = first.files[path]
    return { mtimeMs: entry.mtimeMs, size: entry.size }
  })
  assert.equal(reads, 2)
  assert.deepEqual(Object.values(again.files), Object.values(first.files))

  // Rows before the window are dropped.
  const late = scanUsage(root, T0 + HOUR)
  assert.deepEqual(late.rows.map((row) => row[1]), ['oauth-codex'])
  assert.deepEqual(late.sessions[0].rows.map((row) => row[1]), ['oauth-codex'])
})

test('readUsage: scans in a worker and persists the per-file cache', async () => {
  const root = mkdtempSync(join(tmpdir(), 'osubs-usage-'))
  session(join(root, 'p', 's'), 'session.jsonl', 1, [message(1, 1, Date.now(), 'oauth-glm', 'glm-5', { inputTokens: 3, outputTokens: 4 })])
  const cachePath = join(mkdtempSync(join(tmpdir(), 'osubs-usage-cache-')), 'usage-cache.json')
  const { rows, sessions } = await readUsage({ root, cachePath, days: 1 })
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].slice(1, 8), ['oauth-glm', 'glm-5', 1, 3, 4, 0, 0])
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].id, 'session-a')
  assert.equal(sessions[0].rows.length, 1)
  const { readFileSync } = await import('node:fs')
  assert.equal(JSON.parse(readFileSync(cachePath, 'utf8')).v, 3)
})

test('scanSessionText: terminal failures by header model, first-frame wait, decode speed past a 1 s floor', () => {
  const failure = (turn, step, time) => ({ type: 'assistant/attempt', time, data: { turn, step, stream: [{ chunk: { type: 'finish', reason: { failure: { code: 'X', message: 'boom' } } } }] } })
  const events = [
    { type: 'session', version: 4, id: 's' },
    { type: 'request/header', time: T0, data: { header: { config: { provider: 'oauth-grok', model: 'grok-4.7' } } } },
    // retried failure: not counted; the retry then succeeds
    { type: 'step/start', time: T0, data: { turn: 1, step: 1 } },
    failure(1, 1, T0 + 100),
    { type: 'llm/retry', time: T0 + 200, data: { turn: 1, step: 1, failure: { code: 'X' } } },
    { type: 'llm/retry-started', time: T0 + 1000, data: { turn: 1, step: 1 } },
    // first frame 500 ms after the retry started, 2 s of writing, 100 tokens out
    message(1, 1, T0 + 4000, 'oauth-grok', 'grok-4.7', { inputTokens: 10, outputTokens: 100, cacheReadTokens: 0 },
      [{ time: T0 + 1500 }, { time0: T0 + 1600, dt: [900, 1000] }]),
    // a burst reply (all frames within 1 s) is timed but not a decode sample
    { type: 'step/start', time: T0, data: { turn: 1, step: 2 } },
    message(1, 2, T0 + 900, 'oauth-grok', 'grok-4.7', { inputTokens: 10, outputTokens: 50 }, [{ time: T0 + 300 }, { time: T0 + 400 }]),
    // terminal failure: counted against the header's model
    { type: 'step/start', time: T0, data: { turn: 2, step: 1 } },
    failure(2, 1, T0 + 5000),
    // a tool result that merely mentions the event name is never parsed as one
    { type: 'tool/result', time: T0, data: { text: '{"type":"assistant/message"}' } },
  ]
  const { rows } = scanSessionText(events.map((event) => JSON.stringify(event)).join('\n'), 'fallback')
  assert.equal(rows.length, 1)
  const [, provider, model, calls, input, output, , , failed, , timed, ttftMs, decodeMs, decodeOut] = rows[0]
  assert.deepEqual([provider, model, calls, input, output, failed], ['oauth-grok', 'grok-4.7', 2, 20, 150, 1])
  assert.deepEqual([timed, ttftMs, decodeMs, decodeOut], [2, 500 + 300, 3500 - 1500, 100])
})
