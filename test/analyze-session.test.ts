import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeSession, formatReport, parseSessionEvents } from '../lib/utils/analyze-session.js'

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
