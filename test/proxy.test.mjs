import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProxy } from '../lib/proxy.js'
import { CODEX_API_URL } from '../lib/codex.js'

test('proxy requires the local bearer and forwards Codex Responses', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: init.body?.toString() })
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
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
    onManage: async () => ({ status: 200, body: { ok: true } }),
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      body: '{"model":"gpt-5.3-codex"}',
    })
    assert.equal(denied.status, 401)

    const ok = await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: '{"model":"gpt-5.3-codex"}',
    })
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), '{"id":"resp"}')
    assert.equal(seen[0].url, CODEX_API_URL)
    assert.equal(seen[0].headers.authorization, 'Bearer codex-tok')
    assert.equal(seen[0].headers['chatgpt-account-id'], 'acct')
    assert.equal(seen[0].headers.originator, 'codex_cli_rs')
    assert.equal(seen[0].headers['user-agent'], 'codex_cli_rs/0.147.0')
    assert.equal(seen[0].headers['openai-version'], '0.147.0')
  } finally {
    await proxy.close()
  }
})

test('proxy peels -fast and injects service_tier on GPT; strips it on Codex', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push(JSON.parse(init.body.toString()))
    return new Response('{"id":"resp"}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    fastMode: true,
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
    assert.deepEqual(seen[0], { model: 'gpt-5.5', service_tier: 'priority' })

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.3-codex","service_tier":"priority"}',
    })
    assert.deepEqual(seen[1], { model: 'gpt-5.3-codex' })

    await fetch(`http://127.0.0.1:${port}/grok/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"grok-4.6"}',
    })
    assert.deepEqual(seen[2], { model: 'grok-4.6', service_tier: 'priority' })

    await fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
      method: 'POST',
      headers,
      body: '{"model":"gpt-5.6-sol-900k-fast"}',
    })
    assert.deepEqual(seen[3], { model: 'gpt-5.6-sol', service_tier: 'priority' })
  } finally {
    await proxy.close()
  }
})

test('proxy health and manage routes', async () => {
  const proxy = createProxy({
    port: 0,
    apiKey: 'k',
    tokens: {
      codex: { session: async () => { throw new Error('no') } },
      grok: { session: async () => { throw new Error('no') } },
    },
    onManage: async (method, path) => ({ status: 200, body: { method, path } }),
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`)
    assert.equal((await health.json()).ok, true)
    const manage = await fetch(`http://127.0.0.1:${port}/v0/oauth/status`, {
      headers: { authorization: 'Bearer k' },
    })
    const body = await manage.json()
    assert.equal(body.method, 'GET')
    assert.equal(body.path, '/v0/oauth/status')
  } finally {
    await proxy.close()
  }
})
