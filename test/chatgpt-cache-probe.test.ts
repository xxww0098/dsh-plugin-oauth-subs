import assert from 'node:assert/strict'
import { test } from 'node:test'
import { probeChatgptCache } from '../lib/oauth/chatgpt/probe.js'

// Agreed seam: actual /chatgpt/v1/responses over loopback; only vendor HTTP is fake.
const session = { accessToken: 'PRIVATE-TOKEN-MARKER', expiresAt: Date.now() + 3_600_000, clientId: 'oaiapp_test', extAgentHostId: 'urn:uuid:test' }
const reply = (details) => new Response('data: {"type":"response.output_text.delta","delta":"OK"}\n\n' + 'data: ' + JSON.stringify({ type: 'response.completed', response: { model: 'gpt-6.1-sol', output: 'PRIVATE-RESPONSE-MARKER', usage: { input_tokens: 2048, output_tokens: 2, total_tokens: 2050, ...details } } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } })

test('probe checkpoints attempts before vendor HTTP without exposing mutable private state', async () => {
  const events = []
  let sent = 0
  const report = await probeChatgptCache({ session, repetitions: 1, onProgress: snapshot => { events.push('checkpoint:' + snapshot.upstreamAttempts); snapshot.upstreamAttempts = 999 }, fetchFn: async () => { events.push('fetch:' + ++sent); return reply({ input_tokens_details: { cached_tokens: 0 } }) } })
  assert.deepEqual(events, ['checkpoint:1', 'fetch:1', 'checkpoint:1', 'checkpoint:2', 'fetch:2', 'checkpoint:2'])
  assert.equal(report.upstreamAttempts, 2)
})

test('a terminal vendor refusal stops the probe without refresh or spending the rest of the budget', async () => {
  let sent = 0
  const report = await probeChatgptCache({ session, fetchFn: async () => { sent++; return new Response('{"error":{"code":"invalid_token"}}', { status: 401, headers: { 'content-type': 'application/json' } }) } })
  assert.equal(sent, 1)
  assert.equal(report.calls.length, 1)
  assert.equal(report.calls[0].httpStatus, 401)
  assert.equal(report.tokenRefreshes, 0)
  assert.equal(report.accountSwitches, 0)
  assert.equal(report.variants['developer-input'].weightedHit, null)
})

test('probe refuses a short-lived token rather than refreshing or switching account', async () => {
  let sent = 0
  await assert.rejects(probeChatgptCache({ session: { ...session, expiresAt: Date.now() + 60_000 }, fetchFn: async () => { sent++; return reply({}) } }), /expiry/)
  assert.equal(sent, 0)
})

test('proxy retries share the six-attempt budget and native input already includes cached tokens', async () => {
  let sent = 0
  const report = await probeChatgptCache({ session, fetchFn: async () => {
    sent++
    return sent === 1 ? new Response('', { headers: { 'content-type': 'text/event-stream' } }) : reply({ input_tokens_details: { cached_tokens: 512 } })
  } })
  assert.equal(sent, 6)
  assert.equal(report.upstreamAttempts, 6)
  assert.equal(report.calls.length, 5)
  assert.equal(report.stopReason, 'upstream budget reached')
  assert.equal(report.variants['developer-input'].weightedHit, 0.25)
  assert.equal(report.attempts.every(a => a.codexAffinityHeadersPresent === false), true)
})

test('probe rejects a request plan above the six-attempt budget before vendor HTTP', async () => {
  let sent = 0
  await assert.rejects(probeChatgptCache({ session, repetitions: 4, fetchFn: async () => { sent++; return reply({}) } }), /repetitions/)
  assert.equal(sent, 0)
})

test('real proxy probe keeps explicit zero distinct from absent native cache usage', async () => {
  const seen = []
  const report = await probeChatgptCache({ session, repetitions: 1, fetchFn: async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses')
    seen.push(JSON.parse(String(init.body)))
    return reply(seen.length === 1 ? { input_tokens_details: { cached_tokens: 0 } } : {})
  } })
  assert.equal(report.upstreamAttempts, 2)
  assert.equal(report.calls.length, 2)
  assert.equal(report.calls[0].nativeUsage.cachedTokens, 0)
  assert.equal(report.calls[0].nativeUsage.cacheFieldPresent, true)
  assert.equal(report.calls[1].nativeUsage.cachedTokens, null)
  assert.equal(report.calls[1].nativeUsage.cacheFieldPresent, false)
  assert.equal(report.variants['developer-input'].weightedHit, 0)
  assert.equal(report.variants['developer-input'].zeroReuseCalls, 1)
  assert.equal(report.variants['request-instructions'].weightedHit, null)
  // No write counter in the payload is unknown, never a zero.
  assert.equal(report.calls[0].nativeUsage.cacheWriteFieldPresent, false)
  assert.equal(report.calls[0].nativeUsage.cacheWriteTokens, null)
  assert.equal(report.variants['developer-input'].cacheWriteReportedCalls, 0)
  assert.equal(seen[0].prompt_cache_key, 'dsh-chatgpt:cache-probe:v1')
  assert.equal(seen[1].prompt_cache_key, seen[0].prompt_cache_key)
  assert.equal(seen[0].input[0].content, seen[1].instructions)
  assert.equal(report.cacheKeyStable, true)
  assert.equal(report.sameInstructionTextAcrossVariants, true)
  const json = JSON.stringify(report)
  for (const secret of ['PRIVATE-TOKEN-MARKER', 'PRIVATE-RESPONSE-MARKER', 'immutable reference', 'urn:uuid:test', 'oaiapp_test']) assert.equal(json.includes(secret), false)
})

test('a route that reports cache writes keeps the write counter separate from the read counter', async () => {
  const report = await probeChatgptCache({ session, repetitions: 1, fetchFn: async () => reply({ input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } }) })
  assert.equal(report.upstreamAttempts, 2)
  for (const variant of ['developer-input', 'request-instructions']) {
    const measured = report.variants[variant]
    assert.equal(measured.measuredCalls, 1)
    assert.equal(measured.zeroReuseCalls, 1)
    assert.equal(measured.cacheWriteReportedCalls, 1)
    assert.equal(measured.cacheWriteTokens, 0)
    assert.equal(measured.weightedHit, 0)
  }
  assert.equal(report.calls[0].nativeUsage.cacheWriteFieldPresent, true)
  assert.equal(report.calls[0].nativeUsage.cacheWriteTokens, 0)
})

