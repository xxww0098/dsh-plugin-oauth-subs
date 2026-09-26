import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { saveSession } from '../lib/oauth/store.js'
import { installedVersion } from '../lib/utils/update.js'
import { HARNESS_ANTHROPIC_API, HARNESS_COMPLETIONS_API, assertDshServiceableProvider, ModelSwitch, catalogKeys, catalogProviders } from '../lib/oauth/models.js'
import { glmSession } from '../lib/oauth/glm/index.js'
import { OPENCODE_GO_BUILTIN_ROUTE_ID, OPENCODE_GO_EXTRA_MODELS, OPENCODE_GO_EXTRA_ROUTE, OPENCODE_GO_ROUTES } from '../lib/apikey/opencode-go/models.js'
import { kiroSession, KIRO_MODELS } from '../lib/oauth/kiro/index.js'
import { antigravitySession } from '../lib/oauth/antigravity/index.js'

const KIRO_RT = `rt_${'x'.repeat(120)}`

function createPiAiSettings(initialProviders = {}) {
  const section = { providers: structuredClone(initialProviders) }
  const ops = []
  return {
    ops,
    section,
    get(name) {
      if (name !== 'llm-pi-ai') return undefined
      return structuredClone(section)
    },
    async mutate(target, mutations) {
      if (target !== 'llm-pi-ai') throw new Error(`unknown settings namespace ${target}`)
      const next = { providers: { ...section.providers } }
      for (const row of mutations) {
        const key = row.path?.[1]
        if (row.path?.[0] !== 'providers' || typeof key !== 'string') throw new Error('bad path')
        if (row.op === 'unset') {
          delete next.providers[key]
        } else if (row.op === 'set') {
          assertDshServiceableProvider(key, row.value)
          next.providers[key] = structuredClone(row.value)
        }
      }
      section.providers = next.providers
      ops.push({ target, mutations })
    },
  }
}

const GLM_CURRENT = ['oauth-glm/glm-5.3', 'oauth-glm/glm-5.3-flash', 'oauth-glm/glm-5-turbo']
const GLM_STALE = ['oauth-glm/glm-4.7', 'oauth-glm/glm-5', 'oauth-glm/glm-5.1', 'oauth-glm/glm-5.2']

function glmQuotaFetch() {
  return async () => new Response(JSON.stringify({
    data: { level: 'pro', list: [] },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

async function glmController({ dir, models, ops = [], settings }) {
  const authPath = join(dir, 'auth.json')
  await saveSession('glm', glmSession({
    accessToken: 'glm-token',
    account: 'dev@x',
    region: 'bigmodel',
  }), authPath)
  const store = settings ?? {
    mutate: async (target, mutations) => { ops.push({ target, mutations }) },
  }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: store,
    models,
    fetchFn: glmQuotaFetch(),
  })
  return { controller, ops: store.ops ?? ops, authPath, settings: store }
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
  assert.equal(snap.accounts.kimi.loggedIn, false)
  assert.equal(snap.accounts.copilot.loggedIn, false)
  assert.equal(snap.accounts.opencode, undefined)
  assert.equal(snap.accounts['opencode-go'].loggedIn, false)
  assert.deepEqual(snap.accounts['opencode-go'].accounts, [])
  assert.equal(snap.opencodeGo.cookieSet, false)
  assert.equal(snap.opencodeGo.apiKeySet, false)
  assert.equal(snap.opencodeGo.quota.status, 'idle')
  assert.deepEqual(snap.providers, [])
  assert.equal(snap.catalog.length, 13)
  assert.equal(snap.catalog.some((row) => row.family === 'kimi'), true)
  assert.equal(snap.catalog.some((row) => row.family === 'devin'), true)
  assert.equal(snap.accounts.devin.loggedIn, false)
  assert.equal(snap.catalog.some((row) => row.family === 'opencode'), false)
  const go = snap.catalog.find((row) => row.family === OPENCODE_GO_EXTRA_ROUTE.id)
  assert.equal(go.loggedIn, false)
  assert.deepEqual(go.models.map((model) => model.id), OPENCODE_GO_EXTRA_MODELS.map((model) => model.id))
  assert.equal(go.models.every((model) => model.enabled), true)
  assert.equal(snap.catalog.filter((row) => row.family.startsWith('opencode-go')).length, OPENCODE_GO_ROUTES.length)
  const copilot = snap.catalog.find((row) => row.family === 'copilot')
  assert.equal(copilot.loggedIn, false)
  assert.equal(copilot.displayName, 'OAuth · GitHub Copilot')
  assert.ok(copilot.models.length > 0)
  assert.equal(copilot.models.some((model) => model.id === 'gpt-4.1'), true)
  assert.equal(snap.catalog.every((row) => row.models.every((model) => model.enabled === !model.large)), true)
  assert.equal(snap.selected.includes('oauth-codex/gpt-5.5'), true)
  assert.equal(snap.selected.includes('oauth-codex/gpt-5.6-sol-900k'), false)
  assert.equal(typeof snap.update.version, 'string')
  assert.equal(snap.update.repoSlug, 'xxww0098/dsh-plugin-oauth-subs')
  assert.equal(['win', 'mac', 'linux'].includes(snap.update.platform), true)
})

test('saveOpencodeGo stores the key in the vault, mirrors OPENCODE_API_KEY, and hides secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const keys = new Map()
  const credentials = {
    async describe(ref) { return { configured: keys.has(ref), writable: true } },
    async resolve(ref) { return keys.has(ref) ? { value: keys.get(ref), source: 'file' } : undefined },
    async set(ref, value) { keys.set(ref, value) },
    async unset(ref) { keys.delete(ref) },
  }
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    credentials,
  })
  const saved = await controller.saveOpencodeGo({ apiKey: 'sk-test' })
  assert.equal(saved.accounts.length, 1)
  assert.equal(saved.accounts[0].apiKeySet, true)
  assert.equal(saved.loggedIn, true)
  assert.equal(saved.activeId, saved.accounts[0].id)
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-test')
  assert.equal('cookieHeader' in saved.accounts[0], false)
  const vault = JSON.parse(await readFile(join(dir, 'opencode-go.json'), 'utf8'))
  assert.equal(vault.accounts[vault.activeId].apiKey, 'sk-test')

  const cleared = await controller.clearOpencodeGo('key', saved.activeId)
  assert.equal(cleared.accounts[0].apiKeySet, false)
  assert.equal(keys.has('OPENCODE_API_KEY'), false)
})

test('OpenCode Go switch mirrors the active account key and logout drops the last one', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const keys = new Map()
  const credentials = {
    async describe(ref) { return { configured: keys.has(ref), writable: true } },
    async resolve(ref) { return keys.has(ref) ? { value: keys.get(ref), source: 'file' } : undefined },
    async set(ref, value) { keys.set(ref, value) },
    async unset(ref) { keys.delete(ref) },
  }
  const fetchFn = async () => new Response(
    JSON.stringify({ usage: { rolling: { usagePercent: 10, resetInSec: 30 } } }),
    { status: 200, headers: { 'content-type': 'text/javascript' } },
  )
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    credentials,
    fetchFn,
  })
  await controller.saveOpencodeGo({ apiKey: 'sk-one', cookie: 'Fe26.2one', workspace: 'wrk_one' })
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-one')
  const second = await controller.saveOpencodeGo({ apiKey: 'sk-two', cookie: 'Fe26.2two', workspace: 'wrk_two' })
  assert.equal(second.accounts.length, 2)
  assert.equal(second.activeId, 'wrk_two')
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-two')

  const switched = await controller.switchAccount('opencode-go', 'wrk_one')
  assert.equal(switched.accounts['opencode-go'].activeId, 'wrk_one')
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-one')

  const afterLogout = await controller.logout('opencode-go', 'wrk_one')
  assert.equal(afterLogout.activeId, 'wrk_two')
  assert.equal(afterLogout.accounts.length, 1)
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-two')

  const empty = await controller.logout('opencode-go', 'wrk_two')
  assert.equal(empty.accounts.length, 0)
  assert.equal(keys.has('OPENCODE_API_KEY'), false)
})

test('OpenCode Go keeps OPENCODE_API_KEY only while some stored account holds a key', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const keys = new Map()
  const credentials = {
    async describe(ref) { return { configured: keys.has(ref), writable: true } },
    async resolve(ref) { return keys.has(ref) ? { value: keys.get(ref), source: 'file' } : undefined },
    async set(ref, value) { keys.set(ref, value) },
    async unset(ref) { keys.delete(ref) },
  }
  const fetchFn = async () => new Response(
    JSON.stringify({ usage: { rolling: { usagePercent: 10, resetInSec: 30 } } }),
    { status: 200, headers: { 'content-type': 'text/javascript' } },
  )
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    credentials,
    fetchFn,
  })
  await controller.saveOpencodeGo({ apiKey: 'sk-one', cookie: 'Fe26.2one', workspace: 'wrk_one' })
  await controller.saveOpencodeGo({ cookie: 'Fe26.2two', workspace: 'wrk_two' })
  const roster = await controller.switchAccount('opencode-go', 'wrk_two')
  assert.equal(roster.accounts['opencode-go'].activeId, 'wrk_two')
  // A keyless quota-only account keeps the other stored account's key alive.
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-one')

  // Removing the last keyed account drops the credential, so sync() takes the
  // plugin route back out of DSH instead of leaving models with no key.
  await controller.logout('opencode-go', 'wrk_one')
  assert.equal(keys.has('OPENCODE_API_KEY'), false)

  // Clearing a whole account (field undefined) mirrors the credential too.
  await controller.saveOpencodeGo({ apiKey: 'sk-three', workspace: 'wrk_two' })
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-three')
  const cleared = await controller.clearOpencodeGo(undefined, 'wrk_two')
  assert.equal(keys.has('OPENCODE_API_KEY'), false)
  assert.equal(cleared.accounts.length, 1)
})

test('OpenCode Go card title uses the dashboard email the cookie scrapes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const page = 'rollingUsage:$R[35]={status:"ok",resetInSec:30,usagePercent:10},'
    + 'userEmail[\\"wrk_abc123\\"]=$R[0]=$R[2](($R[1]={p:0,s:0,f:0}));$R[28]($R[1],"dev@example.com");'
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async () => new Response(page, { status: 200, headers: { 'content-type': 'text/javascript' } }),
  })
  const snap = await controller.saveOpencodeGo({ apiKey: 'sk-test', cookie: 'Fe26.2token', workspace: 'wrk_abc123' })
  const row = snap.accounts.find((entry) => entry.active)
  assert.equal(row.email, 'dev@example.com')
  assert.equal(row.account, 'dev@example.com')
  assert.equal(row.workspaceId, 'wrk_abc123')
})

test('OpenCode Go unlock needs a key; picker selection filters the supplemental route', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const keys = new Map([['OPENCODE_API_KEY', 'sk-test']])
  const credentials = {
    async describe(ref) { return { configured: keys.has(ref), writable: true } },
    async set(ref, value) { keys.set(ref, value) },
    async unset(ref) { keys.delete(ref) },
  }
  const store = createPiAiSettings()
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: store,
    credentials,
    models: new ModelSwitch(),
    cursorAutoImport: false,
    ollamaAutoImport: false,
    kimiAutoImport: false,
    copilotAutoImport: false,
  })
  const snap = await controller.snapshot()
  assert.equal(snap.catalog.find((row) => row.family === OPENCODE_GO_EXTRA_ROUTE.id).loggedIn, true)
  await controller.sync()
  // The plugin only writes its supplemental route; DSH's built-in opencode-go
  // catalog route is never registered by the plugin.
  assert.equal(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
  assert.deepEqual(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models.map((model) => model.id), OPENCODE_GO_EXTRA_MODELS.map((model) => model.id))

  await controller.setModels({ family: OPENCODE_GO_EXTRA_ROUTE.id, on: false })
  assert.equal(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id], undefined)
  assert.equal(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)

  await controller.setModels({ family: OPENCODE_GO_EXTRA_ROUTE.id, on: true })
  assert.deepEqual(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models.map((model) => model.id), OPENCODE_GO_EXTRA_MODELS.map((model) => model.id))
})

test('OpenCode Go routes appear only while a key is stored', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const keys = new Map()
  const credentials = {
    async describe(ref) { return { configured: keys.has(ref), writable: true } },
    async resolve(ref) { return keys.has(ref) ? { value: keys.get(ref), source: 'file' } : undefined },
    async set(ref, value) { keys.set(ref, value) },
    async unset(ref) { keys.delete(ref) },
  }
  // Start from the auto-written built-in profile of older plugin versions:
  // it must be taken back, and a key must only ever add the supplemental route.
  const store = createPiAiSettings({
    'opencode-go': {
      apiKeyEnv: 'OPENCODE_API_KEY',
      headers: { 'x-opencode-session': 'dsh-opencode-go' },
    },
  })
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: store,
    credentials,
    models: new ModelSwitch(),
    cursorAutoImport: false,
    ollamaAutoImport: false,
    kimiAutoImport: false,
    copilotAutoImport: false,
  })
  await controller.sync()
  assert.equal(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
  assert.equal(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id], undefined)

  const saved = await controller.saveOpencodeGo({ apiKey: 'sk-test' })
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-test')
  await controller.sync()
  assert.equal(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
  assert.deepEqual(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models.map((model) => model.id), OPENCODE_GO_EXTRA_MODELS.map((model) => model.id))

  await controller.clearOpencodeGo('key', saved.activeId)
  assert.equal(keys.has('OPENCODE_API_KEY'), false)
  await controller.sync()
  assert.equal(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
  assert.equal(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id], undefined)
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
  assert.equal(snap.accounts.glm.activeId, 'dev@x@bigmodel')
  assert.equal(snap.accounts.glm.account, 'dev@x')
  assert.equal(glm.loggedIn, true)
  assert.equal(glm.models.length, 3)
  assert.deepEqual(glm.models.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  assert.equal(glm.models.find((model) => model.id === 'glm-5.3-flash').name, 'GLM-5.3-Flash')
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
  assert.equal(glm.value.api, HARNESS_ANTHROPIC_API)
  assert.equal(glm.value.baseURL, 'http://127.0.0.1:8318/glm')
  assert.deepEqual(glm.value.compat, { forceAdaptiveThinking: true, allowEmptySignature: true })
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
  assert.equal(route.value.api, HARNESS_ANTHROPIC_API)
  assert.equal(route.value.compat.forceAdaptiveThinking, true)
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

test('setModels 全选 persists logged-in GLM 3/3 into the settings store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const store = createPiAiSettings()
  const { controller } = await glmController({ dir, models: new ModelSwitch(), settings: store })
  await controller.setModels({ family: 'glm', on: true })
  const set = store.ops.at(-1).mutations.filter((row) => row.op === 'set')
  const glm = set.find((row) => row.path[1] === 'oauth-glm')
  assert.equal(glm.value.api, HARNESS_ANTHROPIC_API)
  assert.deepEqual(glm.value.models.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  assert.equal(store.section.providers['oauth-glm'].api, 'anthropic-messages')
  assert.deepEqual(store.section.providers['oauth-glm'].models.map((model) => model.id), ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
})

test('Antigravity 全选 clears leftover disabled keys and writes oauth-antigravity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('antigravity', antigravitySession({
    accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60 * 60_000, account: 'dev@x', projectId: 'proj',
  }), authPath)
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  const agKeys = catalogKeys(catalog).filter((key) => key.startsWith('oauth-antigravity/'))
  const models = new ModelSwitch()
  await models.ready
  models.disabled = new Set(agKeys.filter((key) => key !== 'oauth-antigravity/gemini-3.7-flash-high'))
  const store = createPiAiSettings()
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: store,
    models,
    fetchFn: async () => { throw new Error('antigravity must not hit a quota API') },
  })
  const before = await controller.snapshot()
  assert.equal(before.catalog.find((row) => row.family === 'antigravity').loggedIn, true)
  assert.equal(before.catalog.find((row) => row.family === 'antigravity').models.filter((model) => model.enabled).length, 1)
  assert.equal(store.section.providers['oauth-antigravity'], undefined)
  await controller.setModels({ family: 'antigravity', on: true })
  for (const key of agKeys) assert.equal(models.disabled.has(key), false)
  assert.equal(store.section.providers['oauth-antigravity'].api, HARNESS_COMPLETIONS_API)
  assert.equal(store.section.providers['oauth-antigravity'].models.length, agKeys.length)
})

test('Kiro login sync writes oauth-kiro; picker stays locked while logged out', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  const store = createPiAiSettings()
  const loggedOut = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: store,
  })
  const empty = await loggedOut.snapshot()
  assert.equal(empty.catalog.find((row) => row.family === 'kiro').loggedIn, false)
  await saveSession('kiro', kiroSession({
    accessToken: 'tok', refreshToken: KIRO_RT, authMethod: 'social', account: 'dev@x',
  }), authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: store,
    fetchFn: async () => new Response(JSON.stringify({
      subscriptionInfo: { subscriptionTitle: 'KIRO PRO' },
      userInfo: { email: 'dev@x' },
      usageBreakdownList: [{ currentUsageWithPrecision: 10, usageLimitWithPrecision: 100 }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  })
  await controller.sync()
  assert.equal(store.section.providers['oauth-kiro'].api, HARNESS_COMPLETIONS_API)
  assert.deepEqual(store.section.providers['oauth-kiro'].models.map((model) => model.id), KIRO_MODELS.map((model) => model.id))
})

test('setModels surfaces a mutate failure instead of swallowing it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const { controller } = await glmController({
    dir,
    models: new ModelSwitch(),
    settings: {
      async mutate() {
        throw new Error('llm-pi-ai: provider "oauth-glm" api must be openai-completions | openai-responses | anthropic-messages')
      },
    },
  })
  await assert.rejects(controller.setModels({ family: 'glm', on: true }), /llm-pi-ai mutate failed/)
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

test('checkUpdate compare-only never installs; apply forwards the tag to installRelease', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const installs = []
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    profile: 'web',
    updateEnv: { DSH_HOME: dir },
    readFileFn: () => JSON.stringify({ version: '0.0.1' }),
    installReleaseFn: async (opts) => {
      installs.push(opts)
      return { status: 'installed', version: '9.9.9', restart: 'host' }
    },
  })
  const check = await controller.checkUpdate({ apply: false })
  assert.equal(check.status, 'update')
  assert.equal(check.version, '0.0.1')
  assert.equal(check.apply.status, 'none')
  assert.equal(installs.length, 0)
  const apply = await controller.checkUpdate({ apply: true })
  assert.equal(apply.status, 'update')
  assert.equal(apply.apply.status, 'installed')
  assert.equal(apply.apply.restart, 'host')
  assert.equal(installs[0].tag, 'v9.9.9')
  assert.equal(installs[0].profile, 'web')
})

test('checkUpdate apply reports manual instructions when no installed copy exists', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    profile: 'web',
    updateEnv: { DSH_HOME: dir },
    readFileFn: () => JSON.stringify({ version: '0.0.1' }),
    installReleaseFn: async () => ({
      status: 'manual',
      command: 'dsh plugin --profile web update dsh-plugin-oauth-subs',
    }),
  })
  const result = await controller.checkUpdate({ apply: true })
  assert.equal(result.status, 'update')
  assert.equal(result.apply.status, 'manual')
  assert.match(result.apply.command, /dsh plugin --profile web update/)
})

test('checkUpdate apply on desktop self-installs and asks for an app restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    profile: 'desktop',
    updateEnv: { DSH_HOME: dir },
    readFileFn: () => JSON.stringify({ version: '0.0.1' }),
    installReleaseFn: async ({ profile }) => {
      assert.equal(profile, 'desktop')
      return { status: 'installed', version: '9.9.9', restart: 'app' }
    },
  })
  const result = await controller.checkUpdate({ apply: true })
  assert.equal(result.status, 'update')
  assert.equal(result.apply.status, 'installed')
  assert.equal(result.apply.restart, 'app')
})

test('checkUpdate apply when already current reports no-op', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest(`v${installedVersion()}`),
    profile: 'web',
    updateEnv: { DSH_HOME: dir },
  })
  const result = await controller.checkUpdate({ apply: true })
  assert.equal(result.status, 'current')
  assert.equal(result.apply.status, 'none')
})

test('checkUpdate stays update when disk is latest but this process is older', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const home = join(dir, 'dsh-home')
  const manifest = join(home, 'profiles', 'web', 'node_modules', 'dsh-plugin-oauth-subs', 'package.json')
  await mkdir(dirname(manifest), { recursive: true })
  await writeFile(manifest, `${JSON.stringify({ name: 'dsh-plugin-oauth-subs', version: '9.9.9' })}\n`)
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    profile: 'web',
    updateEnv: { DSH_HOME: home },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.update.disk, '9.9.9')
  assert.equal(snap.update.version, installedVersion())
  assert.equal(snap.update.staleProcess, snap.update.running !== '9.9.9')
  const result = await controller.checkUpdate({ apply: false })
  assert.equal(result.status, 'update')
  assert.equal(result.disk, '9.9.9')
  assert.equal(result.version, installedVersion())
})

test('controller.snapshot exposes plugin update info only — no host-cli state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
  })
  const snap = await controller.snapshot()
  assert.equal(typeof snap.update, 'object')
  assert.equal(snap.update.repoSlug, 'xxww0098/dsh-plugin-oauth-subs')
  assert.equal(snap.dshUpdate, undefined)
  assert.equal(snap.autoUpdate, false)
  assert.equal(snap.autoUpdateState, undefined)
})

test('setAutoUpdate persists the switch and snapshot exposes it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest(`v${installedVersion()}`),
    updateEnv: { DSH_HOME: dir },
  })
  const on = await controller.setAutoUpdate({ autoUpdate: true })
  assert.equal(on.autoUpdate, true)
  const prefs = JSON.parse(await readFile(join(dir, 'update-prefs.json'), 'utf8'))
  assert.equal(prefs.autoUpdate, true)
  const snap = await controller.snapshot()
  assert.equal(snap.autoUpdate, true)
  await controller.setAutoUpdate({ autoUpdate: false })
  const off = await controller.snapshot()
  assert.equal(off.autoUpdate, false)
})

test('runAutoUpdate installs a newer tag and records the outcome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const installs = []
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    profile: 'desktop',
    updateEnv: { DSH_HOME: dir },
    readFileFn: () => JSON.stringify({ version: '0.0.1' }),
    installReleaseFn: async ({ tag }) => {
      installs.push(tag)
      return { status: 'installed', version: '9.9.9', restart: 'app' }
    },
  })
  const skipped = await controller.runAutoUpdate()
  assert.equal(skipped.skipped, true)
  assert.equal(installs.length, 0)
  await controller.setAutoUpdate({ autoUpdate: true })
  await controller.runAutoUpdate()
  const result = await controller.runAutoUpdate()
  assert.equal(result.apply.status, 'installed')
  assert.equal(installs.length >= 1, true)
  assert.equal(installs[0], 'v9.9.9')
  const state = JSON.parse(await readFile(join(dir, 'update-state.json'), 'utf8'))
  assert.equal(state.status, 'installed')
  assert.equal(typeof state.at, 'string')
  const snap = await controller.snapshot()
  assert.equal(snap.autoUpdateState.status, 'installed')
})


