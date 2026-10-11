import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createProxy } from '../lib/oauth/proxy.js'
import { QuotaStore } from '../lib/oauth/quota.js'
import { deleteSession, saveSession } from '../lib/oauth/store.js'

// Same forwarding the plugin uses in src/index.ts: the hop passes the session
// it selected, and the store already attributes when that session is present.
function wire(store) {
  return {
    onQuotaUsed: (family, session) => { void store.touch(family, session) },
    onQuotaLearned: (family, data, session) => { void store.learn(family, data, session) },
  }
}

function login(email, token) {
  return { accessToken: token, accountId: email, emailAddress: email }
}

function storedLogin(email, token) {
  return { ...login(email, token), refreshToken: 'refresh-' + token, expiresAt: Date.now() + 3_600_000 }
}

function frame(used) {
  return {
    type: 'codex.rate_limits',
    plan_type: 'pro',
    rate_limits: {
      primary: { used_percent: used, window_minutes: 300, reset_after_seconds: 1 },
      secondary: { used_percent: used, window_minutes: 1, reset_after_seconds: 1 },
    },
  }
}

function accounts(active, ...emails) {
  const rows = new Map(emails.map((email) => [email, login(email, 'tok-' + email[0])]))
  const state = { active, gate: undefined, waiting: undefined }
  return {
    state,
    rows,
    tokens: {
      codex: {
        async session(id) {
          if (id === undefined && state.gate) {
            state.waiting?.()
            await state.gate
          }
          const key = id ?? state.active
          const row = key ? rows.get(key) : undefined
          if (!row) throw new Error('not logged in')
          return row
        },
      },
    },
  }
}

function reading(store, email) {
  const entry = store.cache.get(email ? `codex\0${email}` : 'codex')
  return {
    used: entry?.rows?.[0]?.usedPercent ?? null,
    usedAt: entry?.usedAt ?? null,
  }
}

async function listen(store, tokens, fetchFn) {
  const seen = []
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    tokens,
    fetchFn: async (url, init) => {
      seen.push(init?.headers?.authorization ?? init?.headers?.Authorization ?? '')
      return fetchFn(url, init)
    },
    ...wire(store),
  })
  const server = await proxy.listen()
  return { proxy, port: server.address().port, seen }
}

async function post(port, { signal } = {}) {
  return fetch(`http://127.0.0.1:${port}/codex/v1/responses`, {
    method: 'POST',
    signal,
    headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5.6-luna', stream: true, input: [] }),
  })
}

const SSE = { 'content-type': 'text/event-stream' }
const OUTPUT = 'data: {"type":"response.output_text.delta","delta":"hi"}\n\ndata: {"type":"response.completed","response":{"id":"r1"}}\n\n'

function streamBody(used) {
  return `event: codex.rate_limits\ndata: ${JSON.stringify(frame(used))}\n\n` + OUTPUT
}

function hold() {
  let release
  let entered
  const held = new Promise((resolve) => { release = resolve })
  const started = new Promise((resolve) => { entered = resolve })
  return { started, release, async wait() { entered(); await held } }
}

async function settle() {
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve))
}

async function until(read, expected) {
  const start = Date.now()
  for (;;) {
    const value = read()
    if (Object.is(value, expected) || Date.now() - start > 1000) return value
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('a chat hop writes quota to the account it selected', async () => {
  const book = accounts('a@example.com', 'a@example.com', 'b@example.com')
  const store = new QuotaStore({ tokens: book.tokens, fetchFn: async () => new Response('{}', { status: 200 }) })
  await store.learn('codex', frame(1), login('a@example.com', 'tok-a'))
  await store.learn('codex', frame(9), login('b@example.com', 'tok-b'))
  const gate = hold()
  const { proxy, port, seen } = await listen(store, book.tokens, async () => {
    await gate.wait()
    return new Response(streamBody(42), { status: 200, headers: SSE })
  })
  try {
    const pending = post(port)
    await gate.started
    book.state.active = 'b@example.com'
    gate.release()
    const response = await pending
    const body = await response.text()
    await settle()
    assert.equal(response.status, 200)
    assert.match(body, /"used_percent":42/)
    assert.equal(seen[0], 'Bearer tok-a')
    assert.deepEqual(reading(store, 'a@example.com'), { used: 42, usedAt: reading(store, 'a@example.com').usedAt })
    assert.equal(reading(store, 'a@example.com').usedAt === null, false)
    assert.deepEqual(reading(store, 'b@example.com'), { used: 9, usedAt: null })
    assert.equal(store.cache.has('codex'), false)
  } finally {
    await proxy.close()
  }
})

test('a hop whose login is gone does not write that quota anywhere', async () => {
  const book = accounts('a@example.com', 'a@example.com', 'b@example.com')
  const store = new QuotaStore({ tokens: book.tokens, fetchFn: async () => new Response('{}', { status: 200 }) })
  await store.learn('codex', frame(1), login('a@example.com', 'tok-a'))
  await store.learn('codex', frame(9), login('b@example.com', 'tok-b'))
  const gate = hold()
  const { proxy, port } = await listen(store, book.tokens, async () => {
    await gate.wait()
    return new Response(streamBody(42), { status: 200, headers: SSE })
  })
  try {
    const pending = post(port)
    await gate.started
    book.rows.delete('a@example.com')
    book.state.active = 'b@example.com'
    gate.release()
    const response = await pending
    await response.text()
    await settle()
    assert.equal(response.status, 200)
    assert.deepEqual(reading(store, 'a@example.com'), { used: 1, usedAt: null })
    assert.deepEqual(reading(store, 'b@example.com'), { used: 9, usedAt: null })
    assert.equal(store.cache.has('codex'), false)
  } finally {
    await proxy.close()
  }
})

test('a disconnect before a session is selected does not touch when login later resolves', async () => {
  let release
  let selected
  const selecting = new Promise((resolve) => { selected = resolve })
  const book = accounts('a@example.com', 'a@example.com')
  book.state.waiting = selected
  book.state.gate = new Promise((resolve) => { release = resolve })
  const store = new QuotaStore({ tokens: book.tokens, fetchFn: async () => new Response('{}', { status: 200 }) })
  await store.learn('codex', frame(1), login('a@example.com', 'tok-a'))
  let fetches = 0
  const { proxy, port } = await listen(store, book.tokens, async () => {
    fetches += 1
    return new Response('data: [DONE]\n\n', { status: 200, headers: SSE })
  })
  const controller = new AbortController()
  try {
    const pending = post(port, { signal: controller.signal })
    await selecting
    controller.abort()
    await pending.catch(() => undefined)
    await settle()
    assert.equal(reading(store, 'a@example.com').usedAt, null)
    release()
    book.state.gate = undefined
    await settle()
    assert.equal(fetches, 0)
    assert.equal(reading(store, 'a@example.com').usedAt, null)
    assert.equal(reading(store, 'a@example.com').used, 1)
  } finally {
    await proxy.close()
  }
})

test('rotating the same account token still writes that account', async () => {
  const book = accounts('a@example.com', 'a@example.com', 'b@example.com')
  const store = new QuotaStore({ tokens: book.tokens, fetchFn: async () => new Response('{}', { status: 200 }) })
  await store.learn('codex', frame(1), login('a@example.com', 'tok-a'))
  await store.learn('codex', frame(9), login('b@example.com', 'tok-b'))
  const gate = hold()
  const { proxy, port, seen } = await listen(store, book.tokens, async () => {
    await gate.wait()
    return new Response(streamBody(42), { status: 200, headers: SSE })
  })
  try {
    const pending = post(port)
    await gate.started
    book.rows.set('a@example.com', login('a@example.com', 'tok-a-rotated'))
    gate.release()
    const response = await pending
    await response.text()
    await settle()
    assert.equal(seen[0], 'Bearer tok-a')
    assert.equal(reading(store, 'a@example.com').used, 42)
    assert.equal(reading(store, 'b@example.com').used, 9)
  } finally {
    await proxy.close()
  }
})

test('a stored login is kept when session(id) would return another account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-hop-'))
  const authPath = join(dir, 'auth.json')
  const kept = storedLogin('a@example.com', 'tok-a')
  await saveSession('codex', kept, authPath, { activate: false })
  await saveSession('codex', storedLogin('b@example.com', 'tok-b'), authPath)
  const tokens = {
    codex: {
      authPath,
      async session(id) {
        if (id !== undefined) return storedLogin('b@example.com', 'tok-b')
        return kept
      },
    },
  }
  const store = new QuotaStore({ tokens, fetchFn: async () => new Response('{}', { status: 200 }) })
  await store.learn('codex', frame(1), login('a@example.com', 'tok-a'))
  await store.learn('codex', frame(9), login('b@example.com', 'tok-b'))
  const { proxy, port, seen } = await listen(store, tokens, async () => {
    return new Response(streamBody(42), { status: 200, headers: SSE })
  })
  try {
    const response = await post(port)
    await response.text()
    assert.equal(await until(() => reading(store, 'a@example.com').used, 42), 42)
    assert.equal(seen[0], 'Bearer tok-a')
    assert.equal(reading(store, 'b@example.com').used, 9)
    assert.equal(store.cache.has('codex'), false)
  } finally {
    await proxy.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('removing the stored login drops the observation even if session(id) still returns it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-hop-'))
  const authPath = join(dir, 'auth.json')
  const kept = storedLogin('a@example.com', 'tok-a')
  await saveSession('codex', kept, authPath)
  await saveSession('codex', storedLogin('b@example.com', 'tok-b'), authPath, { activate: false })
  const gate = hold()
  const tokens = {
    codex: {
      authPath,
      async session() {
        return kept
      },
    },
  }
  const store = new QuotaStore({ tokens, fetchFn: async () => new Response('{}', { status: 200 }) })
  await store.learn('codex', frame(1), login('a@example.com', 'tok-a'))
  await store.learn('codex', frame(9), login('b@example.com', 'tok-b'))
  const { proxy, port } = await listen(store, tokens, async () => {
    await gate.wait()
    return new Response(streamBody(42), { status: 200, headers: SSE })
  })
  try {
    const pending = post(port)
    await gate.started
    assert.equal(await deleteSession('codex', authPath, 'a@example.com'), true)
    gate.release()
    const response = await pending
    await response.text()
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(reading(store, 'a@example.com').used, 1)
    assert.equal(reading(store, 'a@example.com').usedAt, null)
    assert.equal(reading(store, 'b@example.com').used, 9)
    assert.equal(store.cache.has('codex'), false)
  } finally {
    await proxy.close()
    await rm(dir, { recursive: true, force: true })
  }
})
