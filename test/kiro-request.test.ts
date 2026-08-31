import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProxy } from '../lib/oauth/proxy.js'
import { SOCIAL_PROFILE_ARN, kiroSession, kiroUsageHeaders } from '../lib/oauth/kiro/index.js'
import {
  KIRO_AMZ_TARGET,
  KIRO_CHAT_ORIGIN,
  KIRO_EVENTSTREAM_TYPE,
  KIRO_STABLE_SESSION,
  encodeKiroEventStream,
  kiroChatHeaders,
  kiroChatUrl,
  kiroClientErrorStatus,
  kiroConversationId,
  kiroToOpenai,
  kiroToOpenaiChunk,
  openaiToKiro,
  parseKiroEventStream,
} from '../lib/oauth/kiro/request.js'

const RT = `rt_${'x'.repeat(120)}`

function session(fields = {}) {
  return kiroSession({
    accessToken: 'kiro-tok',
    refreshToken: RT,
    expiresAt: Date.now() + 60_000,
    account: 'dev@x',
    authMethod: 'social',
    profileArn: SOCIAL_PROFILE_ARN,
    region: 'us-east-1',
    ...fields,
  })
}

function helloStream(text = 'Hello from Kiro') {
  return encodeKiroEventStream([
    { type: 'initial-response', payload: { conversationId: 'c1' } },
    { type: 'assistantResponseEvent', payload: { content: text, modelId: 'deepseek-3.2' } },
    { type: 'contextUsageEvent', payload: { contextUsagePercentage: 1.2 } },
  ])
}

test('openai messages become conversationState with dotted modelId and pinned conversationId', () => {
  const first = openaiToKiro({
    model: 'deepseek-3.2',
    session_id: 'session-dsh-1',
    messages: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'hello' },
    ],
  }, { profileArn: SOCIAL_PROFILE_ARN })

  const user = first.conversationState.currentMessage.userInputMessage
  assert.equal(user.modelId, 'deepseek-3.2')
  assert.equal(user.modelId.includes('.'), true)
  assert.equal(user.origin, KIRO_CHAT_ORIGIN)
  assert.equal(user.origin, 'AI_EDITOR')
  assert.equal(user.content.startsWith('You are DSH.\nBe brief.\n'), true)
  assert.equal(user.content.endsWith('hello'), true)
  assert.equal(first.conversationState.conversationId, 'session-dsh-1')
  assert.equal(/^-\d+$/.test(first.conversationState.conversationId), false)
  assert.equal(first.conversationState.chatTriggerType, 'MANUAL')
  assert.equal(first.conversationState.history.length, 0)
  assert.equal(first.profileArn, SOCIAL_PROFILE_ARN)

  const second = openaiToKiro({
    model: 'deepseek-3.2',
    session_id: 'session-dsh-1',
    messages: [
      { role: 'developer', content: 'You are DSH.' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'again' },
    ],
  }, { conversationId: 'session-dsh-1', profileArn: SOCIAL_PROFILE_ARN })
  assert.equal(second.conversationState.conversationId, first.conversationState.conversationId)
  assert.equal(second.conversationState.history.length, 2)
  assert.equal(second.conversationState.history[0].userInputMessage.content, 'hello')
  assert.equal(second.conversationState.history[1].assistantResponseMessage.content, 'Hi!')
  assert.equal(second.conversationState.currentMessage.userInputMessage.content.endsWith('again'), true)
})

test('developer role is rewritten like GLM and unknown roles do not reach Kiro', () => {
  const body = openaiToKiro({
    model: 'claude-sonnet-4.6',
    messages: [
      { role: 'developer', content: 'AGENTS.md' },
      { role: 'user', content: 'hi' },
    ],
  })
  const json = JSON.stringify(body)
  assert.equal(json.includes('"developer"'), false)
  assert.equal(body.conversationState.currentMessage.userInputMessage.content.includes('AGENTS.md'), true)
})

test('tools map into userInputMessageContext and tool results stay in history', () => {
  const body = openaiToKiro({
    model: 'deepseek-3.2',
    tools: [{ type: 'function', function: { name: 'run_code', description: 'run', parameters: { type: 'object', properties: { code: { type: 'string' } } } } }],
    messages: [
      { role: 'user', content: 'run it' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'run_code', arguments: '{"code":"1"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
      { role: 'user', content: 'thanks' },
    ],
  })
  const current = body.conversationState.currentMessage.userInputMessage
  assert.equal(current.userInputMessageContext.tools[0].toolSpecification.name, 'run_code')
  const assistant = body.conversationState.history.find((row) => row.assistantResponseMessage)
  assert.equal(assistant.assistantResponseMessage.toolUses[0].name, 'run_code')
  assert.equal(assistant.assistantResponseMessage.toolUses[0].toolUseId.startsWith('tooluse_'), true)
})

test('eventstream fixture becomes chat.completion content', () => {
  const frames = helloStream('Hello from Kiro')
  const events = parseKiroEventStream(frames)
  assert.equal(events.some((event) => event.type === 'assistantResponseEvent'), true)
  const openai = kiroToOpenai(frames, { model: 'deepseek-3.2', id: 'chatcmpl-test' })
  assert.equal(openai.object, 'chat.completion')
  assert.equal(openai.choices[0].message.content, 'Hello from Kiro')
  assert.equal(openai.choices[0].finish_reason, 'stop')
  assert.equal(openai.model, 'deepseek-3.2')
})

test('kiroToOpenaiChunk emits SSE-shaped deltas', () => {
  const chunk = kiroToOpenaiChunk({ content: 'Hel' }, { model: 'deepseek-3.2', id: 'chatcmpl-s' })
  assert.equal(chunk.object, 'chat.completion.chunk')
  assert.equal(chunk.choices[0].delta.content, 'Hel')
  assert.equal(chunk.choices[0].finish_reason, null)
  const done = kiroToOpenaiChunk({}, { model: 'deepseek-3.2', id: 'chatcmpl-s', done: true })
  assert.equal(done.choices[0].finish_reason, 'stop')
})

test('conversationId is the DSH pin across two turns, never a Date.now stamp', () => {
  const a = kiroConversationId({ session_id: 'session-dsh-9', prompt_cache_key: 'ignored-when-session' })
  const b = kiroConversationId({ session_id: 'session-dsh-9' })
  assert.equal(a, 'session-dsh-9')
  assert.equal(b, a)
  assert.equal(kiroConversationId({}), KIRO_STABLE_SESSION)
  assert.equal(/^-\d+$/.test(kiroConversationId({})), false)
  const cleaned = kiroConversationId({}, 'session 772f/foo')
  assert.equal(cleaned, 'session-772f-foo')
})

test('chat headers ask for eventstream; quota headers stay JSON', () => {
  const sess = session()
  const usage = kiroUsageHeaders(sess)
  const chat = kiroChatHeaders(sess)
  assert.equal(usage.accept, 'application/json')
  assert.equal(chat.accept, KIRO_EVENTSTREAM_TYPE)
  assert.equal(chat['content-type'], 'application/x-amz-json-1.0')
  assert.equal(chat['x-amz-target'], KIRO_AMZ_TARGET)
  assert.equal(chat.authorization, 'Bearer kiro-tok')
  assert.equal(chat['user-agent'], usage['user-agent'])
  assert.equal(kiroChatUrl(sess), 'https://q.us-east-1.amazonaws.com/')
  assert.equal([401, 403].includes(kiroClientErrorStatus(403)), false)
  assert.equal(kiroClientErrorStatus(403), 400)
  assert.equal(kiroClientErrorStatus(429), 429)
})

test('proxy translates hello on /kiro/v1/chat/completions and does not 501', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: String(init.body) })
    return new Response(helloStream('hello'), {
      status: 200,
      headers: { 'content-type': KIRO_EVENTSTREAM_TYPE },
    })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      kiro: { session: async () => session() },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/kiro/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-3.2',
        session_id: 'session-dsh-kiro',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    })
    assert.notEqual(ok.status, 501)
    assert.equal(ok.status, 200)
    const payload = await ok.json()
    assert.equal(payload.choices[0].message.content, 'hello')
    assert.equal(seen[0].url, 'https://q.us-east-1.amazonaws.com/')
    assert.equal(seen[0].headers['x-amz-target'], KIRO_AMZ_TARGET)
    assert.equal(seen[0].headers.accept, KIRO_EVENTSTREAM_TYPE)
    assert.equal(seen[0].headers['content-type'], 'application/x-amz-json-1.0')
    assert.equal(seen[0].headers.authorization, 'Bearer kiro-tok')
    const body = JSON.parse(seen[0].body)
    assert.equal(body.conversationState.currentMessage.userInputMessage.modelId, 'deepseek-3.2')
    assert.equal(body.conversationState.conversationId, 'session-dsh-kiro')
    assert.equal(body.profileArn, SOCIAL_PROFILE_ARN)

    const again = await fetch(`http://127.0.0.1:${port}/kiro/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-3.2',
        session_id: 'session-dsh-kiro',
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'again' },
        ],
      }),
    })
    assert.equal(again.status, 200)
    const second = JSON.parse(seen[1].body)
    assert.equal(second.conversationState.conversationId, body.conversationState.conversationId)
    assert.equal(second.conversationState.conversationId, 'session-dsh-kiro')

    const streamed = await fetch(`http://127.0.0.1:${port}/kiro/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-3.2',
        stream: true,
        session_id: 'session-dsh-kiro',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    })
    assert.notEqual(streamed.status, 501)
    assert.equal(streamed.status, 200)
    assert.equal(streamed.headers.get('content-type')?.includes('text/event-stream'), true)
    const sse = await streamed.text()
    assert.equal(sse.includes('"object":"chat.completion.chunk"'), true)
    assert.equal(sse.includes('hello'), true)
    assert.equal(sse.includes('data: [DONE]'), true)
  } finally {
    await proxy.close()
  }
})

test('proxy remaps Kiro 403 to a non-AUTH 400', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async () => new Response(JSON.stringify({ message: 'expired token' }), { status: 403 }),
    tokens: { kiro: { session: async () => session() } },
  })
  const server = await proxy.listen()
  try {
    const denied = await fetch(`http://127.0.0.1:${server.address().port}/kiro/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-3.2', messages: [{ role: 'user', content: 'hello' }] }),
    })
    assert.equal(denied.status, 400)
    assert.equal([401, 403, 501].includes(denied.status), false)
    const payload = await denied.json()
    assert.equal(payload.error.message, 'expired token')
    assert.equal(payload.error.code, 'kiro_upstream')
  } finally {
    await proxy.close()
  }
})
