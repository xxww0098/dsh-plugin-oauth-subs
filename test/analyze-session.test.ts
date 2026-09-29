import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { zstdCompressSync } from 'node:zlib'
import {
  analyzeSession,
  analyzeSessionDir,
  compareReports,
  formatAggregate,
  formatComparison,
  formatReport,
  normalizeFailureMessage,
  parseSessionEvents,
  readSessionText,
} from '../lib/utils/analyze-session.js'

function event(type, data = {}, extra = {}) {
  return { type, data, time: extra.time ?? 1_000, seq: extra.seq ?? 1 }
}

function sessionJsonl(events) {
  return events.map((item) => JSON.stringify(item)).join('\n')
}

test('parseSessionEvents reads JSONL and JSON arrays', () => {
  const events = [event('session', {}, { seq: 0 })]
  assert.equal(parseSessionEvents(sessionJsonl(events)).length, 1)
  assert.equal(parseSessionEvents(JSON.stringify(events)).length, 1)
})

test('usage is taken once per turn/step from assistant/message, not the usage chunk', () => {
  const text = sessionJsonl([
    event('session', {}, { seq: 0 }),
    {
      type: 'request/header',
      data: { header: { config: { provider: 'oauth-codex', model: 'gpt-5.6-terra-fast', reasoningEffort: 'max', maxTokens: 128000 } } },
    },
    { type: 'request/context', data: { provider: 'oauth-codex', model: 'gpt-5.6-terra-fast', contextWindow: 258000 } },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 100, outputTokens: 10 } },
      time: 10,
    },
    {
      type: 'assistant/chunk',
      data: { turn: 1, step: 1, chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 10 } } },
      time: 11,
    },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 2, usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 800 } },
      time: 20,
    },
    {
      type: 'assistant/chunk',
      data: { turn: 1, step: 2, chunk: { type: 'usage', usage: { inputTokens: 20, outputTokens: 5, cacheReadTokens: 800 } } },
      time: 21,
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.callCount, 2)
  assert.equal(report.inputTokens, 120)
  assert.equal(report.cacheReadTokens, 800)
  assert.equal(report.outputTokens, 15)
  assert.equal(report.provider, 'oauth-codex')
  assert.equal(report.model, 'gpt-5.6-terra-fast')
  assert.equal(report.contextWindow, 258000)
  assert.ok(Math.abs(report.weightedCacheHit - 800 / 920) < 1e-9)
  assert.equal(report.zeroCacheCount, 1)
  assert.equal(report.zeroCacheAfterWarmup, 0)
  assert.equal(report.affinityMissCount, 0)
  assert.equal(report.calls[0].kind, 'cold_start')
  assert.equal(report.calls[1].kind, 'delta')
  assert.equal(report.healthy, true)
  assert.match(formatReport(report), /HEALTHY/)
})

test('a later zero-cache call is a cache affinity regression', () => {
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 50, outputTokens: 1 } },
    },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 2, usage: { inputTokens: 50, outputTokens: 1, cacheReadTokens: 0 } },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.zeroCacheAfterWarmup, 1)
  assert.equal(report.affinityMissCount, 1)
  assert.equal(report.calls[1].kind, 'affinity_miss')
  assert.equal(report.healthy, false)
  assert.match(report.verdict, /regression/)
})

test('no cache field on any call is unmeasured, not an affinity regression', () => {
  const text = sessionJsonl([
    { type: 'assistant/message', data: { turn: 1, step: 1, usage: { inputTokens: 50, outputTokens: 1, totalTokens: 51 } } },
    { type: 'assistant/message', data: { turn: 1, step: 2, usage: { inputTokens: 60, outputTokens: 2, totalTokens: 62 } } },
  ])
  const report = analyzeSession(text)
  assert.equal(report.cacheMeasured, false)
  assert.equal(report.affinityMissCount, 0)
  assert.equal(report.healthy, true)
  assert.match(report.verdict, /unmeasured/)
  assert.match(formatReport(report), /UNMEASURED/)
})

test('compaction rewrite is not an affinity miss', () => {
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 20, outputTokens: 1, cacheReadTokens: 800 } },
      time: 10,
    },
    { type: 'compaction/prune', data: { shadowedTokenCount: 50 }, time: 15 },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 2, usage: { inputTokens: 60, outputTokens: 1, cacheReadTokens: 0 } },
      time: 20,
    },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 3, usage: { inputTokens: 5, outputTokens: 1, cacheReadTokens: 55 } },
      time: 30,
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.calls[1].kind, 'compaction')
  assert.equal(report.affinityMissCount, 0)
  assert.equal(report.compactionCallCount, 1)
  assert.equal(report.zeroCacheAfterWarmup, 1)
  assert.equal(report.healthy, true)
  assert.match(formatReport(report), /HEALTHY/)
})

test('request/header rebuild is not an affinity miss', () => {
  const text = sessionJsonl([
    { type: 'request/header', data: { reason: 'initial', header: { config: { provider: 'oauth-codex' } } }, time: 1 },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 900 } },
      time: 10,
    },
    { type: 'request/header', data: { reason: 'change', header: { config: { provider: 'oauth-codex' } } }, time: 15 },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 2, usage: { inputTokens: 100, outputTokens: 1, cacheReadTokens: 0 } },
      time: 20,
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.calls[1].kind, 'rebuild')
  assert.equal(report.affinityMissCount, 0)
  assert.equal(report.rebuildCallCount, 1)
  assert.equal(report.healthy, true)
})

test('tool timeouts are recorded without being treated as transport faults', () => {
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 90 } },
    },
    {
      type: 'tool/code-dispatch',
      data: {
        name: 'glob',
        isError: true,
        args: { pattern: '*', path: '/repo' },
        content: [{ type: 'text', text: 'Error: tool call timed out after 30000ms' }],
      },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.toolErrors.length, 1)
  assert.equal(report.toolErrors[0].name, 'glob')
  assert.equal(report.toolErrors[0].cause, 'host_timeout')
  assert.equal(report.toolErrors[0].timeoutMs, 30000)
  assert.equal(report.toolErrors[0].pattern, '*')
  assert.equal(report.toolErrors[0].path, '/repo')
  assert.equal(report.toolErrors[0].step, 1)
  assert.equal(report.toolCauseCounts.host_timeout, 1)
  assert.equal(report.transportFaults.length, 0)
  assert.equal(report.healthy, true)
})

test('sibling abort after a host timeout is cascade, not transport', () => {
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 2, usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 90 } },
    },
    {
      type: 'tool/code-dispatch',
      data: {
        name: 'glob',
        isError: true,
        args: { pattern: 'docs/**', path: '/repo' },
        content: [{ type: 'text', text: 'Error: glob was aborted before completion (tool timeout or caller cancellation)' }],
      },
    },
    {
      type: 'tool/code-dispatch',
      data: {
        name: 'read',
        isError: true,
        args: { file_path: '/repo/package.json' },
        content: [{ type: 'text', text: 'Error: read aborted' }],
      },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.toolErrors[0].cause, 'cascade_abort')
  assert.equal(report.toolErrors[1].cause, 'cascade_abort')
  assert.equal(report.toolErrors[1].path, '/repo/package.json')
  assert.equal(report.toolCauseCounts.cascade_abort, 2)
  assert.equal(report.transportFaults.length, 0)
  assert.equal(report.healthy, true)
})

test('ripgrep parse failures are invalid args, not host timeouts', () => {
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 3, usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 90 } },
    },
    {
      type: 'tool/code-dispatch',
      data: {
        name: 'grep',
        isError: true,
        args: { pattern: '<Settings|describe("Settings', path: '/repo/src' },
        content: [{ type: 'text', text: 'Error: grep pattern rejected by ripgrep: rg: regex parse error:\n    (?:<Settings|describe("Settings)\n    ^\nerror: unclosed group' }],
      },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.toolErrors[0].cause, 'invalid')
  assert.equal(report.toolCauseCounts.invalid, 1)
  assert.match(formatReport(report), /host-timeout 0  cascade 0  invalid 1/)
  assert.equal(report.healthy, true)
})

test('stream-ended signatures are transport faults', () => {
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 90 } },
    },
    {
      type: 'tool/result',
      data: { message: 'OpenAI Responses stream ended before a terminal response event' },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.transportFaults.length, 1)
  assert.equal(report.healthy, false)
})

test('a later Grok 512-token block with <10% reuse is an affinity miss, not a prefix rewrite', () => {
  const text = sessionJsonl([
    {
      type: 'request/header',
      data: { header: { config: { provider: 'oauth-grok', model: 'grok-4.6-fast' } } },
    },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 7, usage: { inputTokens: 7250, outputTokens: 10, cacheReadTokens: 46464 } },
      time: 10,
    },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 8, usage: { inputTokens: 57900, outputTokens: 10, cacheReadTokens: 512 } },
      time: 20,
    },
    {
      type: 'assistant/message',
      data: { turn: 1, step: 9, usage: { inputTokens: 4094, outputTokens: 10, cacheReadTokens: 58368 } },
      time: 30,
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.calls[1].kind, 'affinity_miss')
  assert.equal(report.calls[2].kind, 'delta')
  assert.equal(report.affinityMissCount, 1)
  assert.equal(report.healthy, false)
  assert.match(report.verdict, /regression/)
})

test('keywords inside a serialized tool-result envelope are content, not transport', () => {
  // Reading docs/error.md echoes TRANSPORT / stream idle timeout text through
  // tool-result content — the scan must look past payload keys only.
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 90 } },
    },
    {
      type: 'tool/result',
      data: {
        message: JSON.stringify({
          source: { kind: 'tool', callId: 'x' },
          content: [{ type: 'tool-result', content: [{ type: 'text', text: '92: `attemptUpstream` TRANSPORT … stream idle timeout after 300000ms' }] }],
        }),
      },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.transportFaults.length, 0)
  assert.equal(report.healthy, true)
})

test('a nested assistant/attempt stream idle timeout is a transport fault', () => {
  const text = sessionJsonl([
    {
      type: 'assistant/message',
      data: { turn: 1, step: 1, usage: { inputTokens: 10, outputTokens: 1, cacheReadTokens: 990 } },
    },
    {
      type: 'assistant/attempt',
      data: {
        turn: 1,
        step: 2,
        stream: [
          {
            type: 'chunk',
            chunk: {
              type: 'finish',
              reason: {
                kind: 'error',
                failure: { message: 'pi-ai stream idle timeout after 300000ms', code: 'TIMEOUT' },
              },
            },
          },
        ],
      },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.transportFaults.length, 1)
  assert.match(report.transportFaults[0].message, /stream idle timeout/)
  assert.equal(report.healthy, false)
  assert.match(report.verdict, /transport/)
  assert.match(formatReport(report), /transport 1/)
})

// ── Directory mode ──────────────────────────────────────────────────────

/** DSH's on-disk shape: one zstd frame per appended line. */
function zstdFrames(events) {
  return Buffer.concat(events.map((item) => zstdCompressSync(Buffer.from(`${JSON.stringify(item)}\n`))))
}

function sessionDir(sessions) {
  const root = mkdtempSync(join(tmpdir(), 'analyze-dir-'))
  for (const [rel, events] of Object.entries(sessions)) {
    const path = join(root, rel)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, zstdFrames(events))
  }
  return root
}

function call(turn, step, time, provider, usage = { inputTokens: 10, cacheReadTokens: 90 }, model = 'm') {
  return {
    type: 'assistant/message',
    time,
    data: { turn, step, usage, message: provider ? { source: { provider, model } } : {} },
  }
}

test('readSessionText decodes every zstd frame and drops a truncated tail frame', () => {
  const events = Array.from({ length: 50 }, (_, i) => ({ type: 'step/start', time: i, data: { turn: 1, step: i } }))
  const tail = zstdCompressSync(Buffer.from(`${JSON.stringify({ type: 'step/end', data: {} })}\n`))
  const root = mkdtempSync(join(tmpdir(), 'analyze-zstd-'))
  const path = join(root, 'session.v4.jsonl.zstd')
  writeFileSync(path, Buffer.concat([zstdFrames(events), tail.subarray(0, tail.length - 3)]))
  const decoded = parseSessionEvents(readSessionText(path))
  assert.equal(decoded.length, 50)
  assert.deepEqual(decoded.at(-1), events.at(-1))
  // Single-file mode reads .zstd through the same decoder.
  assert.equal(analyzeSession(readSessionText(path)).eventCount, 50)
})

test('calls follow message.source mid-session, else the latest request/header', () => {
  const root = sessionDir({
    'a/session-1/session.v4.jsonl.zstd': [
      { type: 'session', version: 4, id: 'session-1', cwd: '/private/secret' },
      { type: 'request/header', data: { header: { config: { provider: 'oauth-codex', model: 'gpt' } } } },
      call(1, 1, 10, 'oauth-codex'),
      call(1, 2, 20, null),
      { type: 'request/header', data: { header: { config: { provider: 'oauth-grok', model: 'grok' } } } },
      call(2, 1, 30, 'oauth-grok'),
      call(2, 2, 40, null),
    ],
  })
  const report = analyzeSessionDir(root)
  assert.equal(report.providers['oauth-codex'].calls, 2)
  assert.equal(report.providers['oauth-grok'].calls, 2)
  assert.equal(report.models['oauth-grok/grok'].calls, 1)
  assert.equal(report.models['oauth-grok/m'].calls, 1)
  assert.ok(!JSON.stringify(report).includes('secret'))
  assert.ok(!JSON.stringify(report).includes('session-1'))
  assert.match(formatAggregate(report), /oauth-codex/)
})

test('only the highest version of a session counts', () => {
  const head = (version) => ({ type: 'session', version, id: 'session-dup' })
  const root = sessionDir({
    'a/session-dup/session.jsonl.zstd': [head(2), call(1, 1, 10, 'oauth-codex')],
    'a/session-dup/session.v3.jsonl.zstd': [head(3), call(1, 1, 10, 'oauth-codex')],
    'a/session-dup/session.v4.jsonl.zstd': [head(4), call(1, 1, 10, 'oauth-codex'), call(1, 2, 20, 'oauth-codex')],
  })
  const report = analyzeSessionDir(root)
  assert.equal(report.files, 3)
  assert.equal(report.sessions, 1)
  assert.equal(report.duplicateFiles, 2)
  assert.equal(report.providers['oauth-codex'].calls, 2)
})

test('ttfb starts at the latest llm/retry-started; silence is measured after the first frame', () => {
  const root = sessionDir({
    's/session.v4.jsonl.zstd': [
      { type: 'session', version: 4, id: 's' },
      { type: 'step/start', time: 0, data: { turn: 1, step: 1 } },
      { type: 'assistant/attempt', time: 300_000, data: { turn: 1, step: 1, stream: [{ type: 'chunk', time: 300_000, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'TIMEOUT', message: 'pi-ai stream idle timeout after 300000ms' } } } }] } },
      { type: 'llm/retry', time: 300_001, data: { turn: 1, step: 1, provider: 'oauth-ollama', failure: { code: 'TIMEOUT', message: 'pi-ai stream idle timeout after 300000ms' } } },
      { type: 'llm/retry-started', time: 301_000, data: { turn: 1, step: 1 } },
      {
        ...call(1, 1, 500_000, 'oauth-ollama'),
        data: {
          ...call(1, 1, 500_000, 'oauth-ollama').data,
          stream: [
            { type: 'chunk', time: 304_000, chunk: { type: 'block-start' } },
            { type: 'text-chunks', time0: 304_010, dt: [10, 150_000] },
            { type: 'chunk', time: 454_030, chunk: { type: 'finish' } },
          ],
        },
      },
    ],
  })
  const s = analyzeSessionDir(root).providers['oauth-ollama']
  assert.equal(s.ttfbMs.p50, 3_000)
  assert.equal(s.silenceMs.max, 150_000)
  assert.equal(s.silenceMs.over110s, 1)
  assert.deepEqual(s.retries, { TIMEOUT: 1 })
  assert.equal(s.idleTimeout300, 1)
  assert.equal(s.terminalFailures, 0)
})

test('poolIdle spans sessions on the same provider', () => {
  const session = (id, start, end) => [
    { type: 'session', version: 4, id },
    { type: 'step/start', time: start, data: { turn: 1, step: 1 } },
    { ...call(1, 1, end, 'oauth-codex'), data: { ...call(1, 1, end, 'oauth-codex').data, stream: [{ type: 'chunk', time: start + 1_000, chunk: { type: 'finish' } }] } },
  ]
  const root = sessionDir({
    'x/a/session.v4.jsonl.zstd': session('a', 0, 10_000),
    'y/b/session.v4.jsonl.zstd': session('b', 12_000, 20_000),
    'y/c/session.v4.jsonl.zstd': session('c', 30_000, 40_000),
  })
  const report = analyzeSessionDir(root)
  const s = report.providers['oauth-codex']
  assert.equal(s.poolIdle.n, 2)
  assert.equal(s.poolIdle.over4sShare, 0.5)
  assert.equal(s.coldPenaltyMs, 0)
  const later = analyzeSessionDir(root, { since: 11_000 })
  assert.equal(later.providers['oauth-codex'].calls, 2)
  const diff = compareReports(report, later)
  assert.equal(diff.providers['oauth-codex'].calls.next, 2)
  assert.equal(diff.providers['oauth-codex'].hit.delta, 0)
  assert.match(formatComparison(diff), /oauth-codex {2}calls 3 → 2/)
})

test('hitByCallIndex buckets by per-session call index, token-weighted', () => {
  const events: any[] = [{ type: 'session', version: 4, id: 'long' }]
  for (let i = 0; i < 201; i++) events.push(call(1, i + 1, i + 1, 'oauth-antigravity', i < 40 ? { inputTokens: 10, cacheReadTokens: 90 } : { inputTokens: 50, cacheReadTokens: 50 }))
  const buckets = analyzeSessionDir(sessionDir({ 'l/session.v4.jsonl.zstd': events })).providers['oauth-antigravity'].hitByCallIndex
  assert.deepEqual(Object.keys(buckets), ['0-39', '40-79', '80-119', '120-159', '160-199', '200+'])
  assert.equal(buckets['0-39'].calls, 40)
  assert.equal(buckets['0-39'].hit, 0.9)
  assert.equal(buckets['40-79'].hit, 0.5)
  assert.equal(buckets['160-199'].calls, 40)
  assert.equal(buckets['200+'].calls, 1)
})

test('terminal failures are normalized and scrubbed before aggregation', () => {
  assert.equal(
    normalizeFailureMessage('502: {"message":"Internal Server Error (ref: d8a1138d-2f66-4331-b15f-37c65ff4eecd)"}'),
    'N: {"message":"Internal Server Error (ref: <h>)"}',
  )
  assert.equal(normalizeFailureMessage('429 request_id req_011CfTY5yxDcYmfA1DgBxSDz'), 'N request_id <t>')
  assert.equal(normalizeFailureMessage("Cannot find module '/Users/me/lib/x.js'\n  at 12"), "Cannot find module '<path>' at 12")
  assert.equal(normalizeFailureMessage('x'.repeat(200)).length, 120)

  const root = sessionDir({
    'f/session.v4.jsonl.zstd': [
      { type: 'session', version: 4, id: 'f' },
      { type: 'request/header', data: { header: { config: { provider: 'oauth-codex', model: 'gpt' } } } },
      { type: 'step/start', time: 1, data: { turn: 1, step: 1 } },
      { type: 'assistant/chunk', time: 2, data: { turn: 1, step: 1, chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: '502 "codex upstream failed 3 times: fetch failed: ECONNRESET"' } } } } },
      { type: 'step/start', time: 3, data: { turn: 2, step: 1 } },
      { type: 'assistant/attempt', time: 4, data: { turn: 2, step: 1, stream: [{ type: 'chunk', chunk: { type: 'finish', reason: { kind: 'error', failure: { code: 'SERVER', message: '502 "codex upstream failed 3 times: fetch failed: ECONNRESET"' } } } }] } },
    ],
  })
  const s = analyzeSessionDir(root).providers['oauth-codex']
  assert.equal(s.calls, 0)
  assert.equal(s.terminalFailures, 2)
  assert.equal(s.proxyExhausted, 2)
  assert.deepEqual(s.failures, [{ code: 'SERVER', message: 'N "codex upstream failed 3 times: fetch failed: ECONNRESET"', n: 2 }])
})

test('a provider that never reports a cache field is n/a, not a 0% hit', () => {
  const root = sessionDir({
    'a/session-1/session.v4.jsonl.zstd': [
      { type: 'session', version: 4, id: 'session-1' },
      call(1, 1, 10, 'oauth-kiro', { inputTokens: 100 }),
      call(1, 2, 20, 'oauth-kiro', { inputTokens: 100 }),
      call(2, 1, 30, 'oauth-codex'),
    ],
  })
  const report = analyzeSessionDir(root)
  const kiro = report.providers['oauth-kiro']
  assert.equal(kiro.cacheMeasured, false)
  assert.equal(kiro.weightedCacheHit, null)
  assert.equal(kiro.hitByCallIndex['0-39'].hit, null)
  assert.equal(report.models['oauth-kiro/m'].weightedCacheHit, null)
  assert.equal(report.providers['oauth-codex'].cacheMeasured, true)
  assert.equal(report.providers['oauth-codex'].weightedCacheHit, 0.9)
  const text = formatAggregate(report)
  assert.match(text, /oauth-kiro\s+2\s+\S+\s+n\/a/)
  assert.match(text, /n\/a = upstream reports no cache field/)
  assert.doesNotMatch(formatAggregate(analyzeSessionDir(sessionDir({
    'b/session-2/session.v4.jsonl.zstd': [{ type: 'session', version: 4, id: 'session-2' }, call(1, 1, 10, 'oauth-codex')],
  }))), /n\/a/)
})
