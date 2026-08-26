import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController, dispatchManage } from '../lib/controller.js'
import { saveSession } from '../lib/store.js'

test('snapshot reports logged-out accounts and empty providers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts.codex.loggedIn, false)
  assert.equal(snap.accounts.grok.loggedIn, false)
  assert.equal(snap.fast.on, false)
  assert.deepEqual(snap.providers, [])
  assert.equal(snap.catalog.length, 2)
  assert.equal(snap.catalog.every((row) => row.models.every((model) => model.enabled === !model.large)), true)
  assert.equal(snap.selected.includes('oauth-codex/gpt-5.5'), true)
  assert.equal(snap.selected.includes('oauth-codex/gpt-5.6-sol-900k'), false)
})

test('sync after a stored session writes llm-pi-ai providers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('grok', {
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 60 * 60_000,
    tokenEndpoint: 'https://auth.x.ai/oauth2/token',
    account: 'grok-user',
  }, authPath)
  const ops = []
  const fetchFn = async () => new Response('{"config":{"subscription_tier":"SuperGrok","creditUsagePercent":10}}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async (target, mutations) => { ops.push({ target, mutations }) } },
    fetchFn,
  })
  const result = await controller.sync()
  assert.equal(result.routes[0].provider, 'oauth-grok')
  assert.equal(ops[0].target, 'llm-pi-ai')
  const status = await dispatchManage(controller, 'GET', '/v0/oauth/status', {})
  assert.equal(status.body.accounts.grok.account, 'grok-user')
  assert.equal(status.body.accounts.grok.quota.status, 'ready')
  assert.equal(status.body.accounts.grok.quota.planType, 'SuperGrok')
  assert.equal(status.body.accounts.grok.quota.planLabel, 'SuperGrok')
  assert.equal(status.body.accounts.grok.quota.rows[0].remainingPercent, 90)
})

test('dispatchManage maps unknown routes to 404', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
  })
  const result = await dispatchManage(controller, 'POST', '/v0/oauth/nope', {})
  assert.equal(result.status, 404)
})

test('dispatchManage toggles Fast on|off', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
  })
  const on = await dispatchManage(controller, 'POST', '/v0/oauth/fast', { on: true })
  assert.equal(on.body.note, 'fast')
  assert.equal(on.body.serviceTier, 'priority')
  const snap = await controller.snapshot()
  assert.equal(snap.fast.on, true)
})

test('dispatchManage refreshes quota on POST /quota', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('codex', {
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 60 * 60_000,
    accountId: 'acct',
  }, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn: async (url) => {
      if (String(url).includes('rate-limit-reset-credits')) {
        return new Response(JSON.stringify({ available_count: 0 }), { status: 200 })
      }
      return new Response(JSON.stringify({
        plan_type: 'plus',
        rate_limit: {
          primary_window: { used_percent: 40, limit_window_seconds: 18_000, reset_after_seconds: 60 },
        },
      }), { status: 200 })
    },
  })
  const result = await dispatchManage(controller, 'POST', '/v0/oauth/quota', { provider: 'codex' })
  assert.equal(result.body.status, 'ready')
  assert.equal(result.body.planType, 'plus')
  assert.equal(result.body.planLabel, 'Plus')
  assert.equal(result.body.rows[0].remainingPercent, 60)
  assert.equal(result.body.resetCredits.availableCount, 0)
})

test('dispatchManage consumes Codex reset on POST /quota/reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('codex', {
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 60 * 60_000,
    accountId: 'acct',
  }, authPath)
  const posts = []
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    fetchFn: async (url, init) => {
      const href = String(url)
      if (href.endsWith('/rate-limit-reset-credits/consume')) {
        posts.push(JSON.parse(init.body))
        return new Response('{}', { status: 200 })
      }
      if (href.endsWith('/rate-limit-reset-credits')) {
        return new Response(JSON.stringify({ available_count: 1 }), { status: 200 })
      }
      return new Response(JSON.stringify({
        plan_type: 'plus',
        rate_limit: {
          primary_window: { used_percent: 8, limit_window_seconds: 18_000, reset_after_seconds: 60 },
        },
      }), { status: 200 })
    },
  })
  const result = await dispatchManage(controller, 'POST', '/v0/oauth/quota/reset', { provider: 'codex' })
  assert.equal(result.status, 200)
  assert.equal(result.body.status, 'ready')
  assert.equal(result.body.resetCredits.availableCount, 1)
  assert.equal(result.body.rows[0].remainingPercent, 92)
  assert.equal(typeof posts[0].redeem_request_id, 'string')
})

test('dispatchManage rejects Grok quota reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
  })
  const result = await dispatchManage(controller, 'POST', '/v0/oauth/quota/reset', { provider: 'grok' })
  assert.equal(result.status, 400)
  assert.match(result.body.error, /Codex/)
})

test('dispatchManage toggles models and sync uses the persisted set', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('codex', {
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 60 * 60_000,
    accountId: 'acct',
  }, authPath)
  const ops = []
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async (target, mutations) => { ops.push({ target, mutations }) } },
    fetchFn: async (url) => {
      if (String(url).includes('rate-limit-reset-credits')) {
        return new Response(JSON.stringify({ available_count: 0 }), { status: 200 })
      }
      return new Response(JSON.stringify({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 1 } } }), { status: 200 })
    },
  })
  const off = await dispatchManage(controller, 'POST', '/v0/oauth/models', { key: 'oauth-codex/gpt-5.5-fast', on: false })
  assert.equal(off.status, 200)
  assert.equal(off.body.catalog.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.5-fast').enabled, false)
  assert.equal(off.body.catalog.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.5').enabled, true)
  const last = ops.at(-1)
  const set = last.mutations.filter((row) => row.op === 'set')
  assert.equal(set.length, 1)
  assert.equal(set[0].value.models.some((model) => model.id === 'gpt-5.5-fast'), false)
  assert.equal(set[0].value.models.some((model) => model.id === 'gpt-5.5'), true)
  const familyOff = await dispatchManage(controller, 'POST', '/v0/oauth/models', { family: 'codex', on: false })
  assert.equal(familyOff.body.selected.some((key) => key.startsWith('oauth-codex/')), false)
  const empty = ops.at(-1).mutations.filter((row) => row.op === 'set')
  assert.equal(empty.length, 0)
})

