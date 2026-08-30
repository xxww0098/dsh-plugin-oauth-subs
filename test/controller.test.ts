import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { saveSession } from '../lib/oauth/store.js'
import { installedVersion } from '../lib/utils/update.js'
import { ModelSwitch, catalogProviders } from '../lib/oauth/models.js'
import { glmSession } from '../lib/oauth/glm/index.js'

const GLM_CURRENT = ['oauth-glm/glm-5.3', 'oauth-glm/glm-5.3-flash', 'oauth-glm/glm-5-turbo']
const GLM_STALE = ['oauth-glm/glm-4.7', 'oauth-glm/glm-5', 'oauth-glm/glm-5.1', 'oauth-glm/glm-5.2']

function glmQuotaFetch() {
  return async () => new Response(JSON.stringify({
    data: { level: 'pro', list: [] },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function glmController({ dir, models, ops = [] }) {
  const authPath = join(dir, 'auth.json')
  await saveSession('glm', glmSession({
    accessToken: 'glm-token',
    account: 'zcode',
    region: 'bigmodel',
  }), authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async (target, mutations) => { ops.push({ target, mutations }) } },
    models,
    fetchFn: glmQuotaFetch(),
  })
  return { controller, ops, authPath }
}

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
  assert.deepEqual(snap.providers, [])
  assert.equal(snap.catalog.length, 3)
  assert.equal(snap.catalog.every((row) => row.models.every((model) => model.enabled === !model.large)), true)
  assert.equal(snap.selected.includes('oauth-codex/gpt-5.5'), true)
  assert.equal(snap.selected.includes('oauth-codex/gpt-5.6-sol-900k'), false)
  assert.equal(typeof snap.update.version, 'string')
  assert.equal(snap.update.repoSlug, 'xxww0098/dsh-plugin-oauth-subs')
  assert.equal(['win', 'mac', 'linux'].includes(snap.update.platform), true)
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
  const status = await controller.snapshot()
  assert.equal(status.accounts.grok.account, 'grok-user')
  assert.equal(status.accounts.grok.quota.status, 'ready')
  assert.equal(status.accounts.grok.quota.planType, 'SuperGrok')
  assert.equal(status.accounts.grok.quota.planLabel, 'SuperGrok')
  assert.equal(status.accounts.grok.quota.rows[0].remainingPercent, 90)
})

test('controller refreshes quota', async () => {
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
  const result = await controller.refreshQuota('codex')
  assert.equal(result.status, 'ready')
  assert.equal(result.planType, 'plus')
  assert.equal(result.planLabel, 'Plus')
  assert.equal(result.rows[0].remainingPercent, 60)
  assert.equal(result.resetCredits.availableCount, 0)
})

test('controller consumes Codex reset', async () => {
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
  const result = await controller.consumeReset('codex')
  assert.equal(result.status, 'ready')
  assert.equal(result.resetCredits.availableCount, 1)
  assert.equal(result.rows[0].remainingPercent, 92)
  assert.equal(typeof posts[0].redeem_request_id, 'string')
})

test('controller rejects Grok quota reset', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
  })
  await assert.rejects(controller.consumeReset('grok'), /Codex/)
})

test('snapshot marks GLM catalog loggedIn for a vault account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const { controller } = await glmController({ dir, models: new ModelSwitch() })
  const snap = await controller.snapshot()
  const glm = snap.catalog.find((row) => row.family === 'glm')
  assert.equal(snap.accounts.glm.loggedIn, true)
  assert.equal(snap.accounts.glm.activeId, 'zcode@bigmodel')
  assert.equal(glm.loggedIn, true)
  assert.equal(glm.models.length, 3)
})

test('toggle glm-5.3 on writes oauth-glm when all current GLM keys were disabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  const models = new ModelSwitch()
  await models.ready
  models.disabled = new Set([...GLM_CURRENT, ...GLM_STALE])
  const ops = []
  const { controller } = await glmController({ dir, models, ops })
  const before = await controller.snapshot()
  assert.equal(before.catalog.find((row) => row.family === 'glm').loggedIn, true)
  assert.equal(before.catalog.find((row) => row.family === 'glm').models.every((model) => model.enabled === false), true)
  const snap = await controller.setModels({ key: 'oauth-glm/glm-5.3', on: true })
  assert.equal(snap.catalog.find((row) => row.family === 'glm').models.find((model) => model.id === 'glm-5.3').enabled, true)
  const last = ops.at(-1)
  assert.equal(last.target, 'llm-pi-ai')
  const set = last.mutations.filter((row) => row.op === 'set')
  const glm = set.find((row) => row.path[1] === 'oauth-glm')
  assert.equal(glm.value.api, 'openai')
  assert.equal(glm.value.baseURL, 'http://127.0.0.1:8318/glm/v1')
  assert.equal(glm.value.compat.thinkingFormat, 'openai')
  assert.deepEqual(glm.value.models.map((model) => model.id), ['glm-5.3'])
})

test('login/sync recovers leftover GLM 全关 and writes the current catalog route', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const models = new ModelSwitch()
  await models.ready
  models.disabled = new Set([...GLM_CURRENT, ...GLM_STALE])
  const ops = []
  const { controller } = await glmController({ dir, models, ops })
  const result = await controller.sync()
  const glm = result.routes.find((row) => row.provider === 'oauth-glm')
  assert.deepEqual(glm.models, ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  for (const key of GLM_CURRENT) assert.equal(models.isEnabled(key), true)
  for (const key of GLM_STALE) assert.equal(models.disabled.has(key), true)
  const set = ops.at(-1).mutations.filter((row) => row.op === 'set')
  const route = set.find((row) => row.path[1] === 'oauth-glm')
  assert.equal(route.value.api, 'openai')
  assert.equal(route.value.compat.thinkingFormat, 'openai')
  assert.deepEqual(route.value.models.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
})

test('setModels 全关 still unsets oauth-glm and does not recover', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const ops = []
  const { controller } = await glmController({ dir, models: new ModelSwitch(), ops })
  await controller.setModels({ family: 'glm', on: true })
  const off = await controller.setModels({ family: 'glm', on: false })
  assert.equal(off.catalog.find((row) => row.family === 'glm').models.every((model) => model.enabled === false), true)
  const empty = ops.at(-1).mutations.filter((row) => row.op === 'set')
  assert.equal(empty.some((row) => row.path[1] === 'oauth-glm'), false)
})

test('controller toggles models and sync uses the persisted set', async () => {
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
  const off = await controller.setModels({ key: 'oauth-codex/gpt-5.5-fast', on: false })
  assert.equal(off.catalog.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.5-fast').enabled, false)
  assert.equal(off.catalog.find((row) => row.family === 'codex').models.find((m) => m.id === 'gpt-5.5').enabled, true)
  const last = ops.at(-1)
  const set = last.mutations.filter((row) => row.op === 'set')
  assert.equal(set.length, 1)
  assert.equal(set[0].value.models.some((model) => model.id === 'gpt-5.5-fast'), false)
  assert.equal(set[0].value.models.some((model) => model.id === 'gpt-5.5'), true)
  const familyOff = await controller.setModels({ family: 'codex', on: false })
  assert.equal(familyOff.selected.some((key) => key.startsWith('oauth-codex/')), false)
  const empty = ops.at(-1).mutations.filter((row) => row.op === 'set')
  assert.equal(empty.length, 0)
})

test('controller lists Codex accounts and switchAccount changes the active session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('codex', {
    accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() + 60 * 60_000, emailAddress: 'one@x',
  }, authPath)
  await saveSession('codex', {
    accessToken: 'a2', refreshToken: 'r2', expiresAt: Date.now() + 60 * 60_000, emailAddress: 'two@x',
  }, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async (url) => {
      if (String(url).includes('rate-limit-reset-credits')) {
        return new Response(JSON.stringify({ available_count: 0 }), { status: 200 })
      }
      return new Response(JSON.stringify({ plan_type: 'plus', rate_limit: { primary_window: { used_percent: 1 } } }), { status: 200 })
    },
  })
  const first = await controller.snapshot()
  assert.equal(first.accounts.codex.activeId, 'two@x')
  assert.equal(first.accounts.codex.accounts.length, 2)
  const switched = await controller.switchAccount('codex', 'one@x')
  assert.equal(switched.accounts.codex.activeId, 'one@x')
  assert.equal(switched.accounts.codex.account, 'one@x')
  await controller.logout('codex', 'one@x')
  const after = await controller.snapshot()
  assert.equal(after.accounts.codex.activeId, 'two@x')
  assert.equal(after.accounts.codex.accounts.length, 1)
})

test('snapshot shows quota on every Grok account, not only the active one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  const later = Date.now() + 60 * 60_000
  await saveSession('grok', {
    accessToken: 'tok-a', refreshToken: 'r-a', expiresAt: later, account: 'a@x',
  }, authPath)
  await saveSession('grok', {
    accessToken: 'tok-b', refreshToken: 'r-b', expiresAt: later, account: 'b@x',
  }, authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async (_url, init) => {
      const auth = String(init?.headers?.authorization ?? '')
      const used = auth.includes('tok-b') ? 10 : 40
      return new Response(JSON.stringify({
        config: { subscription_tier: 'SuperGrok', creditUsagePercent: used },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
  })
  const snap = await controller.snapshot()
  const roster = snap.accounts.grok.accounts
  assert.equal(roster.length, 2)
  const first = roster.find((row) => row.id === 'a@x')
  const second = roster.find((row) => row.id === 'b@x')
  assert.equal(first.quota.status, 'ready')
  assert.equal(second.quota.status, 'ready')
  assert.equal(first.quota.rows[0].remainingPercent, 60)
  assert.equal(second.quota.rows[0].remainingPercent, 90)
  assert.equal(second.active, true)
})

function githubLatest(tag) {
  return async () => new Response(JSON.stringify({
    tag_name: tag,
    name: tag,
    html_url: `https://github.com/xxww0098/dsh-plugin-oauth-subs/releases/tag/${tag}`,
    published_at: '2026-08-30T15:07:49Z',
    assets: [],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function spawnChild(code = 0) {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = () => undefined
  queueMicrotask(() => child.emit('close', code))
  return child
}

test('checkUpdate compare-only never spawns dsh', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  let spawned = 0
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    spawnFn: () => { spawned += 1; return spawnChild(0) },
    profile: 'web',
  })
  const check = await controller.checkUpdate({ apply: false })
  assert.equal(check.status, 'update')
  assert.equal(check.apply.status, 'none')
  assert.equal(spawned, 0)
  const current = await controller.checkUpdate({ apply: true })
  assert.equal(current.status, 'update')
  assert.equal(current.apply.status, 'installed')
  assert.equal(current.apply.restart, true)
  assert.equal(current.apply.command, 'dsh plugin --profile web update dsh-plugin-oauth-subs')
  assert.equal(spawned, 1)
})

test('checkUpdate does not reinstall when already current', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  let spawned = 0
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest(`v${installedVersion()}`),
    spawnFn: () => { spawned += 1; return spawnChild(0) },
    profile: 'web',
  })
  const result = await controller.checkUpdate({ apply: true })
  assert.equal(result.status, 'current')
  assert.equal(result.apply.status, 'none')
  assert.equal(spawned, 0)
})

test('checkUpdate reports a failed dsh plugin update', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    spawnFn: () => spawnChild(1),
    profile: 'web',
  })
  const result = await controller.checkUpdate({ apply: true })
  assert.equal(result.status, 'update')
  assert.equal(result.apply.status, 'failed')
  assert.match(result.apply.command, /dsh plugin --profile web update/)
})
