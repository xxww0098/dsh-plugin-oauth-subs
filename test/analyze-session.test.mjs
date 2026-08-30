import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeSession, formatReport, parseSessionEvents } from '../lib/analyze-session.js'

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
  assert.equal(report.healthy, false)
  assert.match(report.verdict, /regression/)
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
        content: [{ type: 'text', text: 'Error: tool call timed out after 30000ms' }],
      },
    },
  ])
  const report = analyzeSession(text)
  assert.equal(report.toolErrors.length, 1)
  assert.equal(report.toolErrors[0].name, 'glob')
  assert.equal(report.transportFaults.length, 0)
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
