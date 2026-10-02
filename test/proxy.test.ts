import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { test } from 'node:test'
import { zstdDecompressSync } from 'node:zlib'
import { createProxy, describeError, quotaFamilyOf } from '../lib/oauth/proxy.js'
import { UPSTREAM_ATTEMPTS, UpstreamFailure } from '../lib/oauth/upstream.js'
import { classifySseFrame, SseFrameScanner } from '../lib/oauth/responses-sse.js'
import { CODEX_API_URL } from '../lib/oauth/codex/index.js'
import { GLM_ANTHROPIC_URL, GLM_ANTHROPIC_VERSION, GLM_CODING_URL, GLM_USER_AGENT } from '../lib/oauth/glm/index.js'
import { resetGlmSystemPins } from '../lib/oauth/glm/cache.js'
import { GROK_STABLE_SESSION, resetGrokSystemPins } from '../lib/oauth/grok/cache.js'
import { codexCacheSessionId } from '../lib/oauth/codex/cache.js'

/** The upstream body as text: Codex sends it zstd-compressed. */
const upstreamText = (init) => init.headers?.['content-encoding'] === 'zstd'
  ? zstdDecompressSync(init.body).toString()
  : init.body?.toString()

function rawRequest(port, { method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
    })
    request.on('error', reject)
    request.end(body)
  })
}

test('proxy requires the local bearer and forwards Codex Responses', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: upstreamText(init) })
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    bind: '0.0.0.0',
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: {
        session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }),
      },
      grok: {
        session: async () => { throw new Error('not logged in') },
      },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  assert.equal(server.address().address, '127.0.0.1')
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      body: '{"model":"gpt-5.3-codex"}',
    })
    assert.equal(denied.status, 401)

    const ok = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"gpt-5.3-codex","prompt_cache_key":"session-cache-1"}',
    })
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), '{"id":"resp"}')
    assert.equal(seen[0].url, CODEX_API_URL)
    assert.equal(seen[0].headers.authorization, 'Bearer codex-tok')
    assert.equal(seen[0].headers['chatgpt-account-id'], 'acct')
    assert.equal(seen[0].headers.originator, 'codex_cli_rs')
    assert.equal(seen[0].headers['user-agent'], 'codex_cli_rs/0.159.3')
    assert.equal(seen[0].headers['openai-version'], '0.159.3')
    assert.equal(seen[0].headers['session-id'], 'session-cache-1')
    assert.equal(seen[0].headers['thread-id'], 'session-cache-1')
    assert.equal(seen[0].headers['x-client-request-id'], 'session-cache-1')
    assert.equal(seen[0].headers['x-grok-conv-id'], undefined)
  } finally {
    await proxy.close()
  }
})

test('quotaFamilyOf names the family only for POST chat paths', () => {
  const at = (method, url) => quotaFamilyOf({ method, url })
  assert.equal(at('POST', '/codex/v1/responses'), 'codex')
  assert.equal(at('POST', '/glm/v1/v1/messages'), 'glm')
  assert.equal(at('POST', '/command-code/chat/completions'), 'command-code')
  assert.equal(at('POST', '/kimi/v1/chat/completions/'), 'kimi')
  assert.equal(at('GET', '/codex/v1/responses'), undefined)
  assert.equal(at('POST', '/codex/v1/models'), undefined)
  assert.equal(at('GET', '/health'), undefined)
})

test('a finished chat request reports its family to onQuotaUsed', async () => {
  const used = []
  let resolveUsed
  const reported = new Promise((resolve) => { resolveUsed = resolve })
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async () => new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } }),
    tokens: { codex: { session: async () => ({ accessToken: 'tok', accountId: 'acct' }) } },
    onQuotaUsed: (family) => { used.push(family); resolveUsed() },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    await (await fetch(`http://127.0.0.1:${port}/codex/v1/models`, { headers: { authorization: 'Bearer secret-key' } })).text()
    const ok = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"gpt-5.5"}',
    })
    await ok.text()
    await reported
    assert.deepEqual(used, ['codex'])
  } finally {
    await proxy.close()
  }
})

test('proxy accepts the Anthropic SDK x-api-key spelling of the proxy key', async () => {
  resetGlmSystemPins()
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers })
    return new Response('{"id":"msg"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    // The Anthropic SDK authenticates with x-api-key, not Authorization —
    // llm-pi-ai anthropic-messages routes arrive exactly like this.
    const ok = await fetch(`http://127.0.0.1:${port}/glm/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': 'secret-key', 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: '{"model":"glm-5.3","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}',
    })
    assert.equal(ok.status, 200)
    assert.equal(seen[0].headers.authorization, 'Bearer id.secret')

    const denied = await fetch(`http://127.0.0.1:${port}/glm/v1/messages`, {
      method: 'POST',
      headers: { 'x-api-key': 'wrong-key', 'content-type': 'application/json' },
      body: '{"model":"glm-5.3","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}',
    })
    assert.equal(denied.status, 401)
  } finally {
    await proxy.close()
    resetGlmSystemPins()
  }
})

test('proxy ends an upstream response with no body instead of hanging', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    tokens: { codex: { session: async () => ({ accessToken: 'token' }) } },
    fetchFn: async () => new Response(null, { status: 204 }),
  })
  const server = await proxy.listen()
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/codex/v1/responses', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key' },
      body: JSON.stringify({ model: 'gpt-5.3-codex' }),
      signal: AbortSignal.timeout(1_000),
    })
    assert.equal(response.status, 204)
    assert.equal(await response.text(), '')
  } finally {
    await proxy.close()
  }
})

test('proxy GLM chat hop forwards ZCode Desktop 3.10.1 headers', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers })
    return new Response('{"id":"chat"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const first = await fetch(`http://127.0.0.1:${port}/glm/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"glm-5.3","messages":[{"role":"user","content":"hi"}]}',
    })
    const second = await fetch(`http://127.0.0.1:${port}/glm/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"glm-5.3","messages":[{"role":"user","content":"hi"}]}',
    })
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(seen[0].url, GLM_CODING_URL)
    assert.equal(seen[0].url.endsWith('/api/coding/paas/v4/chat/completions'), true)
    for (const row of seen) {
      const headers = row.headers
      assert.equal(headers.authorization, 'Bearer id.secret')
      assert.equal(headers['user-agent'], GLM_USER_AGENT)
      assert.equal(headers['user-agent'], 'ZCode/3.10.1 ai-sdk/anthropic/3.0.81')
      assert.equal(headers['X-ZCode-App-Version'], '3.10.1')
      assert.equal(headers['X-ZCode-Agent'], 'glm')
      assert.equal(headers['HTTP-Referer'], 'https://zcode.z.ai')
      assert.equal(headers.referer, 'https://zcode.z.ai')
      assert.equal(headers['X-Title'], 'Z Code@electron')
      assert.equal(headers['X-Release-Channel'], 'production')
      assert.equal(headers['x-zcode-session-type'], 'main')
      assert.equal(headers['x-session-id'], 'dsh-glm')
      assert.equal(JSON.stringify(headers).includes('dsh-plugin-oauth-subs'), false)
    }
    assert.equal(seen[0].headers['x-session-id'], seen[1].headers['x-session-id'])
    assert.notEqual(seen[0].headers['x-zcode-trace-id'], seen[1].headers['x-zcode-trace-id'])
    assert.equal(seen[0].headers['anthropic-version'], undefined)
    assert.equal(seen[0].headers['session-id'], undefined)
    assert.equal(seen[0].headers['x-grok-conv-id'], undefined)
  } finally {
    await proxy.close()
  }
})

test('proxy GLM Anthropic hop is ZCode default: /api/anthropic + cache_control', async () => {
  resetGlmSystemPins()
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: JSON.parse(upstreamText(init)) })
    return new Response('{"id":"msg"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    const first = await fetch(`http://127.0.0.1:${port}/glm/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'glm-5.3',
        session_id: 'session-dsh-glm-anth',
        prompt_cache_key: 'drop-me',
        system: 'You are an AI agent.',
        messages: [{ role: 'user', content: 'analyze the repo' }],
      }),
    })
    const leftover = await fetch(`http://127.0.0.1:${port}/glm/v1/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'glm-5.3',
        session_id: 'session-dsh-glm-anth',
        system: 'You are an AI agent.\n\nCurrent runtime context. This snapshot supersedes earlier runtime-context snapshots.',
        messages: [
          { role: 'user', content: 'analyze the repo' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    })
    assert.equal(first.status, 200)
    assert.equal(leftover.status, 200)
    // Official ZCode hop: the Coding Plan endpoint rewritten to the gateway.
    // GLM_ANTHROPIC_URL stays the direct endpoint used as the fallback.
    assert.equal(seen[0].url, 'https://zcode.z.ai/api/v1/ultra-zai/anthropic/v1/messages')
    assert.equal(seen[0].url.endsWith('/api/v1/ultra-zai/anthropic/v1/messages'), true)
    assert.notEqual(seen[0].url, GLM_ANTHROPIC_URL)
    assert.equal(seen[1].url, seen[0].url)
    for (const row of seen) {
      assert.equal(row.headers.authorization, 'Bearer id.secret')
      assert.equal(row.headers['user-agent'], GLM_USER_AGENT)
      assert.equal(row.headers['anthropic-version'], GLM_ANTHROPIC_VERSION)
      assert.equal(row.headers['anthropic-version'], '2023-06-01')
      assert.equal(row.headers['X-ZCode-App-Version'], '3.10.1')
      assert.equal(row.headers['X-ZCode-Agent'], 'glm')
      assert.equal(row.headers['X-Title'], 'Z Code@electron')
      assert.equal(row.headers['x-zcode-session-type'], 'main')
      assert.equal(row.headers['x-session-id'], 'session-dsh-glm-anth')
      assert.equal(row.headers['session-id'], undefined)
      assert.equal(row.headers['x-client-request-id'], undefined)
      assert.equal(row.headers['x-grok-conv-id'], undefined)
      assert.equal(JSON.stringify(row.headers).includes('dsh-plugin-oauth-subs'), false)
    }
    assert.equal(seen[0].body.prompt_cache_key, undefined)
    assert.equal(seen[0].body.max_tokens, 128_000)
    assert.equal(seen[0].body.metadata.user_id, 'session-dsh-glm-anth')
    assert.deepEqual(seen[0].body.system, [
      { type: 'text', text: 'You are an AI agent.', cache_control: { type: 'ephemeral' } },
    ])
    assert.equal(seen[0].body.thinking.type, 'enabled')
    assert.equal(seen[0].body.thinking.clear_thinking, false)
    assert.equal(seen[1].body.system[0].text, 'You are an AI agent.')
    assert.deepEqual(seen[1].body.system[0].cache_control, { type: 'ephemeral' })
    assert.equal(seen[1].body.system[1].text.includes('Current runtime context'), true)
    assert.equal(seen[1].body.system[1].cache_control, undefined)
    assert.equal(seen[1].body.metadata.user_id, 'session-dsh-glm-anth')
  } finally {
    await proxy.close()
    resetGlmSystemPins()
  }
})

test('proxy GLM Anthropic hop falls back to the direct endpoint when the gateway refuses', async () => {
  resetGlmSystemPins()
  const seen = []
  const fetchFn = async (url) => {
    seen.push(String(url))
    if (String(url).startsWith('https://zcode.z.ai/')) {
      return new Response('{"error":{"message":"forbidden"}}', {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('{"id":"msg"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${port}/glm/v1/messages`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"glm-5.3","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}',
    })
    assert.equal(response.status, 200)
    assert.deepEqual(seen, [
      'https://zcode.z.ai/api/v1/ultra-zai/anthropic/v1/messages',
      GLM_ANTHROPIC_URL,
    ])
  } finally {
    await proxy.close()
    resetGlmSystemPins()
  }
})

test('proxy asks upstream for SSE when the body streams', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push(init.headers)
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => { throw new Error('not logged in') } },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const post = (body) => fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body,
    })
    await post('{"model":"gpt-5.3-codex","stream":true}')
    assert.equal(seen[0].accept, 'text/event-stream')
    await post('{"model":"gpt-5.3-codex"}')
    assert.equal(seen[1].accept, 'application/json')
  } finally {
    await proxy.close()
  }
})

test('proxy peels -fast and injects Codex Priority; never sets Grok service_tier', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ headers: init.headers, body: JSON.parse(upstreamText(init)) })
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'grok-tok' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.5-fast"}',
    })
    assert.equal(seen[0].body.model, 'gpt-5.5')
    assert.equal(seen[0].body.service_tier, 'priority')
    assert.equal(seen[0].body.store, false)
    assert.equal(seen[0].body.instructions, 'You are a helpful assistant.')
    assert.equal(seen[0].headers['x-codex-routing-hint'], 'model=gpt-5.5;tier=priority')

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.3-codex","service_tier":"priority"}',
    })
    assert.equal(seen[1].body.model, 'gpt-5.3-codex')
    assert.equal(seen[1].body.service_tier, undefined)
    assert.equal(seen[1].headers['x-codex-routing-hint'], 'model=gpt-5.3-codex')

    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"grok-4.6-fast"}',
    })
    assert.equal(seen[2].body.model, 'grok-4.6')
    assert.equal(seen[2].body.service_tier, undefined)
    assert.equal(seen[2].body.prompt_cache_key, GROK_STABLE_SESSION)
    assert.equal(seen[2].headers['x-codex-routing-hint'], undefined)

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.6-sol-900k-fast"}',
    })
    assert.equal(seen[3].body.model, 'gpt-5.6-sol')
    assert.equal(seen[3].body.service_tier, 'priority')
    assert.equal(seen[3].headers['x-codex-routing-hint'], 'model=gpt-5.6-sol;tier=priority')

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-5.6-luna-fast',
        reasoning: { effort: 'max' },
        input: [
          { role: 'developer', content: 'sys' },
          { role: 'user', content: 'go' },
        ],
      }),
    })
    assert.equal(seen[4].body.model, 'gpt-5.6-luna')
    assert.equal(seen[4].body.service_tier, 'priority')
    assert.equal(seen[4].body.store, false)
    assert.equal(seen[4].headers['x-codex-routing-hint'], 'model=gpt-5.6-luna;tier=priority')
    assert.equal(seen[4].body.instructions, 'sys')
    assert.equal(seen[4].body.reasoning.effort, 'max')
    assert.deepEqual(seen[4].body.input, [{ role: 'user', content: 'go' }])

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.4-fast"}',
    })
    assert.equal(seen[5].body.model, 'gpt-5.4')
    assert.equal(seen[5].body.service_tier, undefined)
    assert.equal(seen[5].headers['x-codex-routing-hint'], 'model=gpt-5.4')
  } finally {
    await proxy.close()
  }
})

test('proxy GLM chat hop remaps developer; Grok pins leading input as system', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(upstreamText(init)) })
    return new Response('{"id":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
      grok: { session: async () => ({ accessToken: 'grok-tok' }) },
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    const glm = await fetch(`http://127.0.0.1:${port}/glm/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'glm-5.3-flash',
        messages: [
          { role: 'developer', content: 'You are DSH.\n\n# AGENTS.md' },
          { role: 'user', content: 'hello' },
        ],
      }),
    })
    assert.equal(glm.status, 200)
    assert.deepEqual(seen[0].body.messages, [
      { role: 'system', content: 'You are DSH.\n\n# AGENTS.md' },
      { role: 'user', content: 'hello' },
    ])
    assert.equal(seen[0].body.thinking.clear_thinking, false)
    assert.equal(seen[0].body.thinking.type, 'enabled')

    const grok = await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'grok-4.6',
        messages: [{ role: 'developer', content: 'sys' }],
        input: [{ role: 'developer', content: 'sys' }],
      }),
    })
    assert.equal(grok.status, 200)
    assert.equal(seen[1].body.messages[0].role, 'developer')
    assert.equal(seen[1].body.input[0].role, 'system')
    assert.equal(seen[1].body.input[0].content, 'sys')
    assert.equal(Object.hasOwn(seen[1].body, 'instructions'), false)

    const codex = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-5.3-codex',
        messages: [{ role: 'developer', content: 'sys' }],
        input: [{ role: 'user', content: 'go' }],
      }),
    })
    assert.equal(codex.status, 200)
    assert.equal(seen[2].body.messages[0].role, 'developer')
  } finally {
    await proxy.close()
  }
})

test('proxy health remains public and the removed HTTP management plane stays unreachable', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    tokens: {
      codex: { session: async () => { throw new Error('no') } },
      grok: { session: async () => { throw new Error('no') } },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal((await health.json()).ok, true)
    const manage = await fetch(`http://127.0.0.1:${port}/v0/oauth/status`, {
      headers: { authorization: 'Bearer k' },
    })
    assert.equal(manage.status, 404)
    const preflight = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, { method: 'OPTIONS' })
    assert.equal(preflight.status, 401)
    assert.equal(preflight.headers.get('access-control-allow-origin'), null)
  } finally {
    await proxy.close()
  }
})

test('proxy health counts inbound prompt_cache_key per family without exposing ids', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    fetchFn: async () => new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } }),
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => { throw new Error('no') } },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const counts = async () => (await (await fetch(`http://127.0.0.1:${port}/health`)).json()).inboundCacheKeys.codex ?? { with: 0, without: 0 }
  const post = (body) => fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
    method: 'POST',
    headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.text())
  try {
    const before = await counts()
    await post({ model: 'gpt-5.5', prompt_cache_key: 'session-secret-id' })
    await post({ model: 'gpt-5.5' })
    const after = await counts()
    assert.deepEqual(after, { with: before.with + 1, without: before.without + 1 })
    const raw = await (await fetch(`http://127.0.0.1:${port}/health`)).text()
    assert.equal(raw.includes('session-secret-id'), false)
  } finally {
    await proxy.close()
  }
})

test('proxy rejects malformed and oversized request bodies before upstream fetch', async () => {
  let calls = 0
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    maxRequestBodyBytes: 16,
    fetchFn: async () => {
      calls += 1
      return new Response('{}', { status: 200 })
    },
    tokens: {
      codex: { session: async () => ({ accessToken: 'a', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'g' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer k', 'content-type': 'application/json' }
  try {
    const malformed = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers,
      body: '{',
    })
    assert.equal(malformed.status, 400)

    const scalar = await rawRequest(port, {
      method: 'POST',
      path: '/grok/v1/responses',
      headers,
      body: '"x"',
    })
    assert.equal(scalar.status, 400)

    const array = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers,
      body: '[]',
    })
    assert.equal(array.status, 400)

    const oversizedChunked = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers,
      body: '{"model":"this is too long"}',
    })
    assert.equal(oversizedChunked.status, 413)

    const oversizedDeclared = await rawRequest(port, {
      method: 'POST',
      path: '/codex/v1/responses',
      headers: { ...headers, 'content-length': '17' },
      body: '12345678901234567',
    })
    assert.equal(oversizedDeclared.status, 413)
    assert.equal(calls, 0)
  } finally {
    await proxy.close()
  }
})

test('proxy aborts the upstream request when the local client disconnects', async () => {
  let signal
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    fetchFn: async (_url, init) => {
      signal = init.signal
      started()
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      })
    },
    tokens: {
      codex: { session: async () => ({ accessToken: 'a', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'g' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/codex/v1/responses',
      headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    })
    request.on('error', () => undefined)
    request.end('{"model":"gpt-5.3-codex"}')
    await startedPromise
    request.destroy()
    await Promise.race([
      new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('upstream signal was not aborted')), 1_000)),
    ])
  } finally {
    await proxy.close()
  }
})

test('proxy skips upstream work after a disconnect during token loading', async () => {
  let releaseSession
  let sessionStarted
  const sessionStartedPromise = new Promise((resolve) => { sessionStarted = resolve })
  const sessionPromise = new Promise((resolve) => { releaseSession = resolve })
  let upstreamCalls = 0
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    fetchFn: async () => {
      upstreamCalls += 1
      return new Response('{}', { status: 200 })
    },
    tokens: {
      codex: {
        session: async () => {
          sessionStarted()
          return sessionPromise
        },
      },
      grok: { session: async () => ({ accessToken: 'g' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const request = httpRequest({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: '/codex/v1/responses',
      headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
    })
    request.on('error', () => undefined)
    request.end('{"model":"gpt-5.3-codex"}')
    await sessionStartedPromise
    request.destroy()
    await new Promise((resolve) => setTimeout(resolve, 20))
    releaseSession({ accessToken: 'a', accountId: 'acct' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(upstreamCalls, 0)
  } finally {
    await proxy.close()
  }
})

// --- upstream stream resilience -------------------------------------------
// The 2026-08-26 incident: every failed Codex stream carried `response.created`
// and no output event, and the proxy ended the client response cleanly, which
// llm-pi-ai reports as "stream ended before a terminal response event".

const SSE = { 'content-type': 'text/event-stream' }
const sse = (...events) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')
// Live captures (2026-09-28): every frame before the first output event, with
// instructions, tool descriptions and ids blanked to same-length placeholders.
// The capture's instructions were 20 B; DSH's own system prompt is ~128 KB and
// both preamble frames echo it, so pad to 200 KiB here — past the old 64 KiB cap.
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
  .replace(/"instructions":"x*"/g, `"instructions":"${'x'.repeat(200 * 1024)}"`)
const CODEX_PREAMBLE = fixture('codex-preamble.sse')
const GROK_PREAMBLE = fixture('grok-preamble.sse')
const DELTA = { type: 'response.output_text.delta', delta: 'hi' }
const DONE = { type: 'response.completed', response: { id: 'r1' } }

// Enqueued in 16 KiB slices, as the network delivers them: frames and UTF-8
// sequences straddle chunk boundaries.
function streamingUpstream(chunks, { failAfter, headers = SSE } = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const bytes = new TextEncoder().encode(chunk)
        for (let i = 0; i < bytes.length; i += 16 * 1024) controller.enqueue(bytes.subarray(i, i + 16 * 1024))
      }
      if (failAfter === undefined) controller.close()
      else setTimeout(() => controller.error(Object.assign(new Error('terminated'), { code: 'UND_ERR_SOCKET' })), failAfter)
    },
  }), { status: 200, headers })
}

async function withProxy(fetchFn, run, options = {}) {
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    ...options,
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'grok-tok' }) },
    },
  })
  const server = await proxy.listen()
  const logs = []
  const consoleError = console.error
  console.error = (...args) => logs.push(args.join(' '))
  try {
    return await run(server.address().port, logs)
  } finally {
    console.error = consoleError
    await proxy.close()
  }
}

const post = (port, body = { model: 'gpt-5.6-luna', stream: true, input: [] }) => fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
  method: 'POST',
  headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

test('a stream that ends carrying only the preamble is retried, and the client sees one clean stream', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return calls === 1
      ? streamingUpstream([CODEX_PREAMBLE])
      : streamingUpstream([CODEX_PREAMBLE + sse(DELTA, DONE)])
  }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    const text = await response.text()
    assert.equal(calls, 2, 'the dead first attempt must be retried')
    assert.equal(response.status, 200)
    assert.equal(text.match(/^event: response\.created$/gm).length, 1, 'the retried preamble must not reach the client twice')
    assert.match(text, /response\.completed/)
  })
})

test('Codex retries replay x-codex-turn-state from the failed attempt', async () => {
  const seen = []
  let calls = 0
  const fetchFn = async (_url, init) => {
    calls += 1
    seen.push(init.headers)
    return calls === 1
      ? streamingUpstream([CODEX_PREAMBLE], { headers: { ...SSE, 'x-codex-turn-state': 'turn-abc' } })
      : streamingUpstream([CODEX_PREAMBLE + sse(DELTA, DONE)])
  }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    await response.text()
    assert.equal(response.status, 200)
    assert.equal(calls, 2)
    assert.equal(seen[0]['x-codex-turn-state'], undefined)
    assert.equal(seen[1]['x-codex-turn-state'], 'turn-abc')
  })
})

test('Codex request bodies go upstream zstd-compressed once; retries resend the same Buffer', async () => {
  const seen = []
  const fetchFn = async (_url, init) => {
    seen.push(init)
    return seen.length === 1
      ? streamingUpstream([CODEX_PREAMBLE])
      : streamingUpstream([CODEX_PREAMBLE + sse(DELTA, DONE)])
  }
  const instructions = 'You are DSH. '.repeat(10_000) // ~128KB, the size of the real system prompt
  await withProxy(fetchFn, async (port) => {
    const response = await post(port, { model: 'gpt-5.6-luna', stream: true, instructions, input: [{ role: 'user', content: 'hi' }] })
    await response.text()
    assert.equal(response.status, 200)
  })
  assert.equal(seen.length, 2)
  assert.equal(seen[0].headers['content-encoding'], 'zstd')
  assert.equal(seen[1].body, seen[0].body, 'a retry must reuse the compressed bytes, not recompress')
  const plain = zstdDecompressSync(seen[0].body)
  const payload = JSON.parse(plain.toString())
  assert.equal(payload.instructions, instructions.trim())
  assert.ok(plain.equals(Buffer.from(JSON.stringify(payload))), 'decompresses to the exact JSON the proxy serialised')
  console.log(`codex zstd: ${plain.length} B -> ${seen[0].body.length} B`)
})

test('non-Codex families still send a plaintext request body', async () => {
  const seen = []
  const fetchFn = async (_url, init) => {
    seen.push(init)
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await withProxy(fetchFn, async (port) => {
    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"grok-4.6","input":[]}',
    })
  })
  assert.equal(seen[0].headers['content-encoding'], undefined)
  assert.equal(JSON.parse(seen[0].body.toString()).model, 'grok-4.6')
})

test('a genuine response.failed is forwarded, never retried away', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return streamingUpstream([CODEX_PREAMBLE + sse({ type: 'response.failed', response: { error: { code: 'server_error', message: 'boom' } } })])
  }
  await withProxy(fetchFn, async (port) => {
    const text = await (await post(port)).text()
    assert.equal(calls, 1, 'a terminal error event is an answer, not a transport fault')
    assert.match(text, /response\.failed/)
  })
})

test('a break after output has been committed reaches the client as a broken stream, not a clean end', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return streamingUpstream([CODEX_PREAMBLE + sse(DELTA)], { failAfter: 10 })
  }
  await withProxy(fetchFn, async (port, logs) => {
    const response = await post(port)
    await assert.rejects(response.text(), 'a clean EOF here reads as a completed response')
    assert.equal(calls, 1, 'committed bytes cannot be replayed, so no retry')
    assert.match(logs.join('\n'), /failed mid-response.*terminated.*committed=true/s)
  })
})

test('a stall after output is cut by the idle timer and destroyed, one attempt', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(CODEX_PREAMBLE + sse(DELTA))) },
    }), { status: 200, headers: SSE })
  }
  await withProxy(fetchFn, async (port, logs) => {
    const response = await post(port)
    assert.equal(response.status, 200)
    await assert.rejects(response.text(), 'a stalled stream must break, not hang or end cleanly')
    assert.equal(calls, 1)
    assert.match(logs.join('\n'), /failed mid-response: upstream sent no data for 0\.05s/)
  }, { upstreamTimeouts: { idleMs: 50 } })
})

test('exhausting the retries answers with a real error instead of a silent EOF', async () => {
  let calls = 0
  const fetchFn = async () => { calls += 1; return streamingUpstream([CODEX_PREAMBLE]) }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    assert.equal(calls, UPSTREAM_ATTEMPTS)
    assert.equal(response.status, 502)
    assert.match((await response.json()).error, /failed 3 times.*no output events/s)
  })
})

test('an upstream that never sends a byte is cut by the first-byte timer, retried within budget, then 504', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return new Response(new ReadableStream({ start() {} }), { status: 200, headers: SSE })
  }
  await withProxy(fetchFn, async (port, logs) => {
    const response = await post(port)
    // 40ms + ≤1s backoff + 40ms fits 1.1s; the 4s backoff does not.
    assert.equal(calls, 2, 'a silent upstream must be retried, not held for the client timeout')
    assert.equal(response.status, 504)
    assert.match((await response.json()).error, /codex upstream: no output within 1\.1s \(2 attempts\): no first byte within 0\.04s/)
    assert.match(logs.join('\n'), /retrying upstream \(attempt 2\/3\).*no first byte/)
  }, { upstreamTimeouts: { firstByteMs: 40, budgetMs: 1100 } })
})

test('three fast ECONNRESETs still answer 502 with the proxyExhausted wording', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }) })
  }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    assert.equal(calls, UPSTREAM_ATTEMPTS)
    assert.equal(response.status, 502)
    assert.equal((await response.json()).error, 'codex upstream failed 3 times: fetch failed: ECONNRESET')
  })
})

test('a pre-header fetch fault is retried too', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    if (calls === 1) throw new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
    return streamingUpstream([CODEX_PREAMBLE + sse(DELTA, DONE)])
  }
  await withProxy(fetchFn, async (port) => {
    assert.match(await (await post(port)).text(), /response\.completed/)
    assert.equal(calls, 2)
  })
})

test('a client disconnect during the silent window stops the proxy instead of retrying', async () => {
  let calls = 0
  const fetchFn = async (_url, init) => {
    calls += 1
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(CODEX_PREAMBLE))
        init.signal.addEventListener('abort', () => controller.error(init.signal.reason ?? new Error('aborted')), { once: true })
      },
    }), { status: 200, headers: SSE })
  }
  await withProxy(fetchFn, async (port) => {
    const abort = new AbortController()
    const inflight = fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-luna', stream: true, input: [] }),
      signal: abort.signal,
    }).then((r) => r.text())
    await new Promise((resolve) => setTimeout(resolve, 60))
    abort.abort()
    await assert.rejects(inflight)
    await new Promise((resolve) => setTimeout(resolve, 120))
    assert.equal(calls, 1, 'a disconnected client must not trigger upstream retries')
  })
})

test('non-streaming responses bypass the gate untouched', async () => {
  await withProxy(async () => new Response('{"id":"resp","object":"response"}', { status: 200, headers: { 'content-type': 'application/json' } }), async (port) => {
    const response = await post(port, { model: 'gpt-5.6-luna', stream: false, input: [] })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: 'resp', object: 'response' })
  })
})

test('the head waits through a real preamble and goes out once output arrives', async () => {
  for (const [family, preamble] of [['codex', CODEX_PREAMBLE], ['grok', GROK_PREAMBLE]]) {
    let release
    const fetchFn = async () => new Response(new ReadableStream({
      async start(controller) {
        const bytes = new TextEncoder().encode(preamble)
        for (let i = 0; i < bytes.length; i += 16 * 1024) controller.enqueue(bytes.subarray(i, i + 16 * 1024))
        await new Promise((resolve) => { release = resolve })
        controller.enqueue(new TextEncoder().encode(sse(DELTA, DONE)))
        controller.close()
      },
    }), { status: 200, headers: SSE })
    await withProxy(fetchFn, async (port) => {
      let headed = false
      const inflight = fetch(`http://127.0.0.1:${port}/${family}/v1/responses`, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
        body: JSON.stringify({ model: family === 'codex' ? 'gpt-5.6-luna' : 'grok-4.7', stream: true, input: [] }),
      }).then((response) => { headed = true; return response })
      await new Promise((resolve) => setTimeout(resolve, 80))
      assert.equal(headed, false, `${family}: a ${preamble.length}B preamble must not commit the head`)
      release()
      const text = await (await inflight).text()
      assert.equal(text, preamble + sse(DELTA, DONE), `${family}: the preamble is sent exactly once, in order`)
    })
  }
})

test('a codex.rate_limits frame reaches onQuotaLearned and still streams verbatim', async () => {
  // Live shape per the codex CLI's RateLimitSnapshot (codex/quota.ts).
  const RATE_LIMITS = `event: codex.rate_limits\ndata: ${JSON.stringify({
    type: 'codex.rate_limits',
    plan_type: 'pro',
    rate_limits: {
      allowed: true,
      limit_reached: false,
      primary: { used_percent: 3, window_minutes: 300, reset_after_seconds: 100 },
      secondary: { used_percent: 11, window_minutes: 10_080, reset_after_seconds: 500_000 },
    },
  })}\n\n`
  const body = RATE_LIMITS + sse(DELTA, DONE)
  const learned: any[] = []
  const fetchFn = async () => streamingUpstream([body])
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), body, 'the frame is the client\'s bytes too — capture is read-only')
  }, { onQuotaLearned: (family: string, data: any) => learned.push([family, data]) })
  assert.equal(learned.length, 1)
  assert.equal(learned[0][0], 'codex')
  assert.equal(learned[0][1].rate_limits.primary.used_percent, 3)
})

test('past 2 MiB with no output the gate commits rather than kill the response', async () => {
  let calls = 0
  const body = CODEX_PREAMBLE.repeat(6)
  const fetchFn = async () => { calls += 1; return streamingUpstream([body]) }
  await withProxy(fetchFn, async (port, logs) => {
    const response = await post(port)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), body)
    assert.equal(calls, 1, 'a committed body cannot be retried')
    assert.match(logs.join('\n'), /codex buffered \d+B with no output event; committing without retry protection/)
  })
})

test('classifySseFrame reads the top-level type, event line first', () => {
  const frames = CODEX_PREAMBLE.split('\n\n').slice(0, -1)
  assert.deepEqual(frames.map(classifySseFrame), ['preamble', 'preamble'], 'nested "type" keys in the echoed request are not events')
  assert.deepEqual(GROK_PREAMBLE.split('\n\n').slice(0, -1).map(classifySseFrame), ['preamble', 'preamble'])
  assert.equal(classifySseFrame(`data: ${JSON.stringify({ type: 'response.in_progress', response: { text: { format: { type: 'text' } } } })}`), 'preamble')
  assert.equal(classifySseFrame(`data: ${JSON.stringify(DELTA)}`), 'output')
  assert.equal(classifySseFrame('event: response.failed\ndata: {"type":"response.failed"}'), 'output')
  assert.equal(classifySseFrame('event: codex.rate_limits\ndata: {"type":"response.output_text.delta"}'), 'preamble', 'the event line wins')
  assert.equal(classifySseFrame('event: message_start\ndata: {"type":"message_start"}'), 'output')
  assert.equal(classifySseFrame('data: {"type":\ndata: "response.queued"}'), 'preamble', 'multi-line data joins')
  assert.equal(classifySseFrame(': keep-alive'), 'other')
  assert.equal(classifySseFrame('data: [DONE]'), 'other')
  assert.equal(classifySseFrame('data: {"type":"response.created"'), 'other', 'a torn frame is never guessed at')
  assert.equal(classifySseFrame(''), 'other')
})

test('SseFrameScanner classifies only whole frames, across any split', () => {
  const frame = `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: '你好 — ok' })}\r\n\r\n`
  const bytes = new TextEncoder().encode(CODEX_PREAMBLE + frame + 'event: response.comp')
  const kinds = (step) => {
    const scanner = new SseFrameScanner()
    const out = []
    for (let i = 0; i < bytes.length; i += step) out.push(...scanner.push(bytes.subarray(i, i + step)))
    return out
  }
  for (const step of [1, 3, 7, 16 * 1024, bytes.length]) {
    const frames = kinds(step)
    assert.deepEqual(frames.map((f) => f.kind), ['preamble', 'preamble', 'output'], `step ${step}`)
    assert.equal(frames.reduce((n, f) => n + f.bytes, 0), bytes.length - 'event: response.comp'.length, `step ${step}: the tail waits`)
  }
  // Every split point through the multi-byte delta still decodes to one output frame.
  const delta = new TextEncoder().encode(frame)
  for (let cut = 1; cut < delta.length; cut++) {
    const scanner = new SseFrameScanner()
    assert.deepEqual([...scanner.push(delta.subarray(0, cut)), ...scanner.push(delta.subarray(cut))].map((f) => f.kind), ['output'], `cut ${cut}`)
  }
})

test('describeError unwraps the undici cause behind "fetch failed"', () => {
  const error = new TypeError('fetch failed', { cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }) })
  assert.equal(describeError(error), 'fetch failed: UND_ERR_SOCKET')
  assert.equal(describeError(new Error('plain')), 'plain')
})

test('a streamed body that never looked like an SSE preamble is forwarded, not retried', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    assert.equal(calls, 1, 'an unrecognised body is the upstream answer, not a fault')
    assert.equal(await response.text(), '{"id":"resp"}')
  })
})

test('a streamed 200 with an empty body is retried', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return calls === 1
      ? new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200, headers: SSE })
      : streamingUpstream([CODEX_PREAMBLE + sse(DELTA, DONE)])
  }
  await withProxy(fetchFn, async (port) => {
    assert.match(await (await post(port)).text(), /response\.completed/)
    assert.equal(calls, 2)
  })
})

test('codexCacheSessionId sanitizes and clips instead of dropping the key', () => {
  assert.equal(codexCacheSessionId('session-cache-1'), 'session-cache-1')
  assert.equal(codexCacheSessionId('session 772f7f3a/foo'), 'session-772f7f3a-foo')
  const long = `session-${'a'.repeat(80)}`
  assert.equal(codexCacheSessionId(long).length, 64)
  assert.equal(codexCacheSessionId(''), undefined)
  assert.equal(codexCacheSessionId(null), undefined)
})

async function captureCodex(run) {
  const seen = []
  const fetchFn = async (_url, init) => {
    seen.push({ headers: init.headers, body: JSON.parse(upstreamText(init)) })
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: { session: async () => ({ accessToken: 'codex-tok', accountId: 'acct' }) },
      grok: { session: async () => ({ accessToken: 'grok-tok' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    await run({ port, headers, seen })
  } finally {
    await proxy.close()
  }
}

test('proxy falls back to session_id and writes the clipped cache key back into the body', async () => {
  await captureCodex(async ({ port, headers, seen }) => {
    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'gpt-5.6-terra', session_id: 'sess-from-dsh' }),
    })
    assert.equal(seen[0].headers['session-id'], 'sess-from-dsh')
    assert.equal(seen[0].headers['thread-id'], 'sess-from-dsh')
    assert.equal(seen[0].headers['x-client-request-id'], 'sess-from-dsh')
    assert.equal(seen[0].body.prompt_cache_key, 'sess-from-dsh')
    assert.equal(Object.hasOwn(seen[0].body, 'session_id'), false)

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        prompt_cache_key: '   ',
        session_id: 'sess-from-dsh',
      }),
    })
    assert.equal(seen[1].headers['session-id'], 'sess-from-dsh')
    assert.equal(seen[1].headers['thread-id'], 'sess-from-dsh')
    assert.equal(seen[1].body.prompt_cache_key, 'sess-from-dsh')
    assert.equal(Object.hasOwn(seen[1].body, 'session_id'), false)

    const long = `session-${'a'.repeat(80)}`
    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'gpt-5.6-terra', prompt_cache_key: long }),
    })
    assert.equal(seen[2].headers['session-id'].length, 64)
    assert.equal(seen[2].headers['thread-id'], seen[2].headers['session-id'])
    assert.equal(seen[2].headers['x-client-request-id'], seen[2].headers['session-id'])
    assert.equal(seen[2].body.prompt_cache_key.length, 64)
    assert.equal(seen[2].body.prompt_cache_key, seen[2].headers['session-id'])
    assert.equal(seen[2].body.prompt_cache_key, long.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 64))
  })
})

test('proxy drops an unusable Codex cache key rather than forwarding it', async () => {
  await captureCodex(async ({ port, headers, seen }) => {
    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'gpt-5.6-terra', prompt_cache_key: '   ' }),
    })
    assert.equal(seen[0].headers['session-id'], undefined)
    assert.equal(seen[0].headers['thread-id'], undefined)
    assert.equal(seen[0].headers['x-client-request-id'], undefined)
    assert.equal(seen[0].body.prompt_cache_key, undefined)
  })
})

test('proxy parks extra leading developer and strips prompt_cache_retention on the way through', async () => {
  await captureCodex(async ({ port, headers, seen }) => {
    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'gpt-5.6-terra',
        instructions: 'You are DSH.',
        prompt_cache_key: 'session-cache-1',
        prompt_cache_retention: '24h',
        input: [
          { role: 'developer', content: 'You are DSH.\n\nPlan: toggle all skills.' },
          { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
          { role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
        ],
      }),
    })
    assert.equal(seen[0].body.instructions, 'You are DSH.')
    assert.equal(seen[0].body.prompt_cache_retention, undefined)
    assert.equal(seen[0].body.prompt_cache_key, 'session-cache-1')
    assert.equal(seen[0].body.input[0].role, 'user')
    assert.equal(seen[0].body.input[1].role, 'assistant')
    assert.equal(seen[0].body.input[2].role, 'developer')
    assert.deepEqual(seen[0].body.input[2].content, [{ type: 'input_text', text: 'Plan: toggle all skills.' }])
    assert.equal(seen[0].headers['session-id'], 'session-cache-1')
    assert.equal(seen[0].headers['thread-id'], 'session-cache-1')
    assert.equal(seen[0].headers['x-client-request-id'], 'session-cache-1')
  })
})

test('GLM hop pins x-session-id from DSH and strips prompt_cache_retention', async () => {
  const seen = []
  const fetchFn = async (_url, init) => {
    seen.push({ headers: init.headers, body: JSON.parse(upstreamText(init)) })
    return new Response('{"id":"chat"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/glm/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'glm-5.3',
        session_id: 'session-dsh-glm',
        prompt_cache_retention: '24h',
        messages: [
          { role: 'developer', content: 'sys' },
          { role: 'assistant', content: 'hi', reasoning: 'thought' },
          { role: 'user', content: 'go' },
        ],
      }),
    })
    assert.equal(ok.status, 200)
    assert.equal(seen[0].headers['x-session-id'], 'session-dsh-glm')
    assert.equal(seen[0].headers['session-id'], undefined)
    assert.equal(seen[0].headers['x-grok-conv-id'], undefined)
    assert.equal(seen[0].body.prompt_cache_key, undefined)
    assert.equal(seen[0].body.prompt_cache_retention, undefined)
    assert.equal(seen[0].body.messages[0].role, 'system')
    assert.equal(seen[0].body.messages[1].reasoning_content, 'thought')
    assert.equal(seen[0].body.thinking.clear_thinking, false)
    assert.equal(seen[0].body.user, 'session-dsh-glm')
  } finally {
    await proxy.close()
  }
})

test('GLM Completions leftover maps cache_read; Anthropic usage stays native', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async (url) => {
      if (String(url).includes('/anthropic/')) {
        return new Response(JSON.stringify({
          usage: { input_tokens: 20, cache_read_input_tokens: 16 },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        usage: { prompt_tokens: 20, cache_read_input_tokens: 16 },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  const body = JSON.stringify({ model: 'glm-5.3', messages: [{ role: 'user', content: 'hi' }] })
  try {
    const chat = await fetch(`http://127.0.0.1:${port}/glm/v1/chat/completions`, { method: 'POST', headers, body })
    assert.equal(chat.status, 200)
    assert.equal((await chat.json()).usage.prompt_tokens_details.cached_tokens, 16)
    const anth = await fetch(`http://127.0.0.1:${port}/glm/v1/messages`, { method: 'POST', headers, body })
    assert.equal(anth.status, 200)
    const anthUsage = (await anth.json()).usage
    assert.equal(anthUsage.cache_read_input_tokens, 16)
    assert.equal(anthUsage.prompt_tokens_details, undefined)
  } finally {
    await proxy.close()
  }
})

test('GLM hop parks extra leading system snapshots after the conversation', async () => {
  resetGlmSystemPins()
  const seen = []
  const fetchFn = async (_url, init) => {
    seen.push(JSON.parse(upstreamText(init)))
    return new Response('{"id":"chat"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      glm: { session: async () => ({ accessToken: 'id.secret', region: 'zai' }) },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    await fetch(`http://127.0.0.1:${port}/glm/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'glm-5.3-flash',
        session_id: 'session-glm-park',
        messages: [
          { role: 'developer', content: 'You are an AI agent.' },
          { role: 'user', content: 'analyze the repo' },
        ],
      }),
    })
    await fetch(`http://127.0.0.1:${port}/glm/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'glm-5.3-flash',
        session_id: 'session-glm-park',
        messages: [
          { role: 'system', content: 'You are an AI agent.' },
          { role: 'system', content: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.' },
          { role: 'user', content: 'analyze the repo' },
          { role: 'assistant', content: 'ok' },
        ],
      }),
    })
    assert.equal(seen[0].messages[0].content, 'You are an AI agent.')
    assert.equal(seen[1].messages[0].content, 'You are an AI agent.')
    assert.equal(seen[1].messages[1].role, 'user')
    assert.match(seen[1].messages.at(-1).content, /Current runtime context/)
    assert.equal(seen[1].user, 'session-glm-park')
    assert.equal(seen[1].prompt_cache_key, undefined)
  } finally {
    await proxy.close()
    resetGlmSystemPins()
  }
})

test('Grok 4.7 Fast keeps its real backend id and does not ride Codex Priority', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ headers: init.headers, body: JSON.parse(upstreamText(init)) })
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: { grok: { session: async () => ({ accessToken: 'grok-tok' }) } },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const headers = { authorization: 'Bearer secret-key', 'content-type': 'application/json' }
  try {
    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'grok-4.7-build-fast', service_tier: 'priority', prompt_cache_key: 'k-47' }),
    })
    assert.equal(seen[0].body.model, 'grok-4.7-build-fast')
    assert.equal(seen[0].body.service_tier, undefined)
    assert.equal(seen[0].headers['x-grok-model-override'], 'grok-4.7-build-fast')
    assert.equal(seen[0].headers['x-codex-routing-hint'], undefined)

    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'grok-4.6-fast' }),
    })
    assert.equal(seen[1].body.model, 'grok-4.6')
    assert.equal(seen[1].headers['x-grok-model-override'], 'grok-4.6')
  } finally {
    await proxy.close()
  }
})

test('Grok pins cache with grok-build headers and does not inherit Codex headers', async () => {
  await captureCodex(async ({ port, headers, seen }) => {
    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'grok-4.6', session_id: 'sess-from-dsh', prompt_cache_key: 'k1' }),
    })
    assert.equal(seen[0].headers['session-id'], undefined)
    assert.equal(seen[0].headers['thread-id'], undefined)
    assert.equal(seen[0].headers['x-client-request-id'], undefined)
    assert.equal(seen[0].headers['x-grok-conv-id'], 'k1')
    assert.equal(seen[0].headers['x-grok-session-id'], 'k1')
    assert.equal(seen[0].headers['x-grok-model-override'], 'grok-4.6')
    assert.match(seen[0].headers['x-grok-req-id'], /^[0-9a-f-]{36}$/i)
    assert.equal(seen[0].headers['x-grok-transient-retry'], undefined)
    assert.equal(seen[0].body.prompt_cache_key, 'k1')
    assert.equal(Object.hasOwn(seen[0].body, 'session_id'), false)

    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'grok-4.6', session_id: 'sess-from-dsh' }),
    })
    assert.equal(seen[1].headers['x-grok-conv-id'], 'sess-from-dsh')
    assert.equal(seen[1].headers['x-grok-session-id'], 'sess-from-dsh')
    assert.equal(seen[1].headers['session-id'], undefined)
    assert.equal(seen[1].body.prompt_cache_key, 'sess-from-dsh')
    assert.notEqual(seen[1].headers['x-grok-req-id'], seen[0].headers['x-grok-req-id'])

    const long = `session-${'a'.repeat(80)}`
    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'grok-4.6', prompt_cache_key: long }),
    })
    assert.equal(seen[2].headers['x-grok-conv-id'].length, 64)
    assert.equal(seen[2].headers['x-grok-session-id'], seen[2].headers['x-grok-conv-id'])
    assert.equal(seen[2].body.prompt_cache_key, seen[2].headers['x-grok-conv-id'])

    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: 'grok-4.6', prompt_cache_key: '   ' }),
    })
    assert.equal(seen[3].headers['x-grok-conv-id'], GROK_STABLE_SESSION)
    assert.equal(seen[3].headers['x-grok-session-id'], GROK_STABLE_SESSION)
    assert.equal(seen[3].headers['session-id'], undefined)
    assert.equal(seen[3].body.prompt_cache_key, GROK_STABLE_SESSION)
  })
})

test('Grok hop parks extra leading system snapshots after the conversation', async () => {
  resetGrokSystemPins()
  try {
    await captureCodex(async ({ port, headers, seen }) => {
      await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'grok-4.6',
          session_id: 'session-grok-park',
          input: [
            { role: 'developer', content: 'You are DSH.' },
            { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
          ],
        }),
      })
      await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'grok-4.6',
          session_id: 'session-grok-park',
          input: [
            { role: 'developer', content: 'You are DSH.\n\nCurrent runtime context. This snapshot supersedes earlier runtime-context snapshots.' },
            { role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
            { role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] },
          ],
        }),
      })
      assert.equal(seen[0].body.input[0].role, 'system')
      assert.equal(seen[0].body.input[0].content, 'You are DSH.')
      assert.equal(Object.hasOwn(seen[0].body, 'instructions'), false)
      assert.equal(seen[1].body.input[0].role, 'system')
      assert.equal(seen[1].body.input[0].content, 'You are DSH.')
      assert.equal(seen[1].body.input[1].role, 'user')
      assert.equal(seen[1].body.input[2].role, 'assistant')
      assert.equal(seen[1].body.input[3].role, 'developer')
      assert.deepEqual(seen[1].body.input[3].content, [{
        type: 'input_text',
        text: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.',
      }])
      assert.equal(seen[1].body.prompt_cache_key, 'session-grok-park')
      assert.equal(seen[1].headers['x-grok-conv-id'], 'session-grok-park')
      assert.equal(seen[1].headers['session-id'], undefined)
    })
  } finally {
    resetGrokSystemPins()
  }
})

test('cursor streaming surfaces a pre-output Connect error as JSON with its status, never retried', async () => {
  let calls = 0
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async () => { throw new Error('unused') },
    tokens: {
      cursor: {
        session: async () => ({ accessToken: 'cursor-tok' }),
      },
    },
    cursorRpc: async () => {
      calls += 1
      // What runCursorAgent rejects with for an `invalid_argument` end frame.
      const message = "Composer 2 is retired: We're upgrading you to Composer 2.5, our most powerful model yet."
      throw new UpstreamFailure(400, message, { code: 'http', payload: { error: { message, code: 'invalid_argument' } } })
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/cursor/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'composer-2', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.equal(body.error.message, "Composer 2 is retired: We're upgrading you to Composer 2.5, our most powerful model yet.")
    assert.equal(calls, 1)
  } finally {
    await proxy.close()
  }
})

test('cursor mid-stream failure drops the stream instead of writing an SSE error block', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async () => { throw new Error('unused') },
    tokens: {
      cursor: {
        session: async () => ({ accessToken: 'cursor-tok' }),
      },
    },
    cursorRpc: async (session, built, { onEvent }) => {
      assert.equal(session.accessToken, 'cursor-tok')
      assert.ok(Buffer.isBuffer(built.requestBytes))
      await onEvent({ kind: 'interaction', text: 'partial' })
      // Let the committed chunk reach the socket before the break.
      await new Promise((resolve) => setTimeout(resolve, 20))
      throw new Error("Composer 2 is retired: We're upgrading you to Composer 2.5, our most powerful model yet.")
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/cursor/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'composer-2', stream: true, messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(res.status, 200)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    await assert.rejects(async () => {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        text += decoder.decode(value, { stream: true })
      }
    }, /terminated/)
    assert.match(text, /partial/)
    assert.equal(text.includes('cursor_upstream'), false)
    assert.equal(text.includes('[DONE]'), false)
  } finally {
    await proxy.close()
  }
})

test('proxy strips upstream content-encoding/content-length after undici decompressed the body', async () => {
  // undici fetch auto-decompresses gzip, so the proxy reads a plain body while
  // the upstream headers still say content-encoding: gzip. Forwarding those
  // headers makes the client gunzip plain JSON (or wait for a body of the
  // wrong size), so the proxy must drop them and let Node re-frame the body.
  const fetchFn = async () => new Response('{"id":"resp","ok":true}', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip',
      'content-length': '123',
      'x-upstream-marker': 'kept',
    },
  })
  const proxy = createProxy({
    port: 0,
    bind: '0.0.0.0',
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: {
        session: async () => { throw new Error('not logged in') },
      },
      grok: {
        session: async () => ({ accessToken: 'grok-tok' }),
      },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/grok/v1/responses', {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'grok-4.6', input: [{ role: 'user', content: [{ type: 'input_text', text: 'ping' }] }] }),
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-encoding'), null)
    assert.equal(res.headers.get('content-length'), null)
    assert.equal(res.headers.get('x-upstream-marker'), 'kept')
    assert.equal(await res.text(), '{"id":"resp","ok":true}')
  } finally {
    await proxy.close()
  }
})


test('a 401 refresh retry keeps the route overrides: stream accept, zstd, Copilot agent initiator', { timeout: 5000 }, async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push(init.headers)
    if (seen.length % 2 === 1) return new Response('{"error":{"message":"expired"}}', { status: 401, headers: { 'content-type': 'application/json' } })
    return new Response(`${CODEX_PREAMBLE}${sse(DELTA, DONE)}`, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  const tokens = () => ({
    session: async () => ({ accessToken: 'stale-tok', accountId: 'acct', expiresAt: Date.now() + 3_600_000 }),
    sourceOf: (session) => ({ id: 'acct-1', session }),
    refreshNow: async () => ({ session: { accessToken: 'fresh-tok', accountId: 'acct', expiresAt: Date.now() + 3_600_000 } }),
  })
  const proxy = createProxy({ port: 0, apiKey: 'secret-key', fetchFn, tokens: { codex: tokens(), copilot: tokens() } })
  const server = await proxy.listen()
  const port = server.address().port
  const send = (path, body) => fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((response) => response.text())
  try {
    await send('/codex/v1/responses', { model: 'gpt-5.6-luna', stream: true, input: [] })
    await send('/copilot/v1/chat/completions', {
      model: 'gpt-4.1',
      stream: true,
      messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }, { role: 'tool', tool_call_id: 't', content: 'z' }],
    })
    assert.equal(seen.length, 4)
    const [codexFirst, codexRetry, copilotFirst, copilotRetry] = seen
    assert.equal(codexRetry.authorization, 'Bearer fresh-tok')
    for (const key of ['accept', 'content-encoding']) assert.equal(codexRetry[key], codexFirst[key], `codex ${key}`)
    assert.equal(codexRetry.accept, 'text/event-stream')
    assert.equal(codexRetry['content-encoding'], 'zstd')
    assert.equal(copilotFirst['x-initiator'], 'agent')
    assert.equal(copilotRetry['x-initiator'], 'agent')
    assert.equal(copilotRetry.accept, 'text/event-stream')
  } finally {
    await proxy.close()
  }
})

test('a forwarded 429 also carries the retry-after-ms header when upstream sends one', async () => {
  let calls = 0
  const fetchFn = async () => {
    calls += 1
    return new Response('{"error":{"message":"slow down"}}', {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after-ms': '700' },
    })
  }
  await withProxy(fetchFn, async (port) => {
    const response = await post(port)
    assert.equal(calls, 1, 'status answers are the client\u2019s to pace, not the proxy\u2019s')
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('retry-after-ms'), '700')
    assert.match((await response.json()).error.message, /slow down/)
  })
})

test('a 401 refresh retry does not pay the retry backoff', { timeout: 5000 }, async () => {
  let calls = 0
  const started = Date.now()
  const fetchFn = async () => {
    calls += 1
    if (calls === 1) {
      return new Response('{"error":{"message":"token revoked"}}', { status: 401, headers: { 'content-type': 'application/json' } })
    }
    return streamingUpstream([CODEX_PREAMBLE + sse(DELTA, DONE)])
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      codex: {
        session: async () => ({ accessToken: 'stale-tok', accountId: 'acct' }),
        sourceOf: (session) => ({ id: 'acct-1', session }),
        refreshNow: async () => ({ session: { accessToken: 'fresh-tok', accountId: 'acct' } }),
      },
      grok: { session: async () => { throw new Error('not logged in') } },
    },
  })
  const server = await proxy.listen()
  try {
    const response = await post(server.address().port, { model: 'gpt-5.6-luna', stream: true, input: [], prompt_cache_key: 'refresh-pacing' })
    assert.equal(calls, 2, 'the refreshed token is retried once')
    assert.equal(response.status, 200)
    const elapsed = Date.now() - started
    assert.ok(elapsed < 900, `refreshed retry must be immediate, took ${elapsed}ms`)
  } finally {
    await proxy.close()
  }
})

