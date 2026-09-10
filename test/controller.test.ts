import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { saveSession } from '../lib/oauth/store.js'
import { installedVersion } from '../lib/utils/update.js'
import { HARNESS_ANTHROPIC_API, HARNESS_COMPLETIONS_API, assertDshServiceableProvider, ModelSwitch, catalogKeys, catalogProviders } from '../lib/oauth/models.js'
import { glmSession } from '../lib/oauth/glm/index.js'
import { OPENCODE_GO_BUILTIN_ROUTE_ID, OPENCODE_GO_EXTRA_ROUTE } from '../lib/apikey/opencode-go/models.js'
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
  assert.equal(snap.catalog.length, 10)
  assert.equal(snap.catalog.some((row) => row.family === 'kimi'), true)
  assert.equal(snap.catalog.some((row) => row.family === 'opencode'), false)
  const go = snap.catalog.find((row) => row.family === OPENCODE_GO_EXTRA_ROUTE.id)
  assert.equal(go.loggedIn, false)
  assert.deepEqual(go.models.map((model) => model.id), ['deepseek-flash'])
  assert.equal(go.models.every((model) => model.enabled), true)
  assert.equal(snap.catalog.filter((row) => row.family.startsWith('opencode-go')).length, 1)
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
  // Built-in catalog profile carries no models; the supplemental route adds the one.
  assert.deepEqual(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], { apiKeyEnv: 'OPENCODE_API_KEY' })
  assert.deepEqual(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models.map((model) => model.id), ['deepseek-flash'])

  await controller.setModels({ key: `${OPENCODE_GO_EXTRA_ROUTE.id}/deepseek-flash`, on: false })
  assert.equal(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id], undefined)
  assert.deepEqual(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], { apiKeyEnv: 'OPENCODE_API_KEY' })

  await controller.setModels({ family: OPENCODE_GO_EXTRA_ROUTE.id, on: true })
  assert.deepEqual(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models.map((model) => model.id), ['deepseek-flash'])
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
  await controller.sync()
  assert.equal(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], undefined)
  assert.equal(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id], undefined)

  const saved = await controller.saveOpencodeGo({ apiKey: 'sk-test' })
  assert.equal(keys.get('OPENCODE_API_KEY'), 'sk-test')
  await controller.sync()
  assert.deepEqual(store.section.providers[OPENCODE_GO_BUILTIN_ROUTE_ID], { apiKeyEnv: 'OPENCODE_API_KEY' })
  assert.deepEqual(store.section.providers[OPENCODE_GO_EXTRA_ROUTE.id].models.map((model) => model.id), ['deepseek-flash'])

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
  assert.equal(glm.value.compat, undefined)
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
  assert.equal(route.value.compat, undefined)
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
  let running = '0.0.1'
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v9.9.9'),
    spawnFn: () => { spawned += 1; running = '9.9.9'; return spawnChild(0) },
    profile: 'web',
    updateEnv: { DSH_HOME: dir },
    readFileFn: (path) => {
      const p = String(path).replace(/\\/g, '/')
      if (p.includes('/node_modules/dsh-plugin-oauth-subs/package.json')) {
        return JSON.stringify({ version: running })
      }
      return JSON.stringify({ version: running })
    },
  })
  const check = await controller.checkUpdate({ apply: false })
  assert.equal(check.status, 'update')
  assert.equal(check.version, '0.0.1')
  assert.equal(check.apply.status, 'none')
  assert.equal(spawned, 0)
  const current = await controller.checkUpdate({ apply: true })
  assert.equal(current.apply.status, 'installed')
  assert.equal(current.apply.restart, true)
  assert.equal(current.version, '9.9.9')
  assert.match(current.apply.command, /dsh plugin --profile web (update dsh-plugin-oauth-subs|add https:\/\/github.com\/xxww0098\/dsh-plugin-oauth-subs#v9\.9\.9)/)
  assert.equal(spawned >= 1, true)
})

test('checkUpdate re-reads installed version after a successful apply', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  let running = '0.0.70'
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: githubLatest('v0.0.71'),
    spawnFn: () => { running = '0.0.71'; return spawnChild(0) },
    profile: 'web',
    updateEnv: { DSH_HOME: dir },
    readFileFn: () => JSON.stringify({ version: running }),
  })
  const before = await controller.checkUpdate({ apply: false })
  assert.equal(before.version, '0.0.70')
  assert.equal(before.status, 'update')
  const after = await controller.checkUpdate({ apply: true })
  assert.equal(after.apply.status, 'installed')
  assert.equal(after.version, '0.0.71')
  assert.notEqual(after.version, before.version)
})

test('checkUpdate does not claim installed when dsh exits 0 but version stays', async () => {
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
    updateEnv: { DSH_HOME: dir },
    readFileFn: () => JSON.stringify({ version: '0.0.1' }),
  })
  const result = await controller.checkUpdate({ apply: true })
  assert.equal(result.status, 'update')
  assert.equal(result.apply.status, 'unchanged')
  assert.match(result.apply.error, /still 0\.0\.1/)
  assert.match(result.apply.command, /dsh plugin --profile web add /)
  assert.equal(spawned, 2)
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
    updateEnv: { DSH_HOME: dir },
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
    updateEnv: { DSH_HOME: dir },
  })
  const result = await controller.checkUpdate({ apply: true })
  assert.equal(result.status, 'update')
  assert.equal(result.apply.status, 'failed')
  assert.match(result.apply.command, /dsh plugin --profile web (update|add)/)
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
    spawnFn: () => spawnChild(0),
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

test('controller.snapshot includes dshUpdate info', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
  })
  const snap = await controller.snapshot()
  assert.equal(typeof snap.dshUpdate, 'object')
  assert.equal(snap.dshUpdate.repoSlug, 'deepseek-ai/deepseek-harness')
  assert.equal(snap.dshUpdate.npmPackage, '@deepseek-ai/dsh')
})

/** `<root>/bin/dsh -> <root>/lib/node_modules/@deepseek-ai/dsh/lib/bin.js`, the npm -g layout. */
async function fakeDshInstall(version) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-prefix-')))
  const pkgDir = join(root, 'lib', 'node_modules', '@deepseek-ai', 'dsh')
  await mkdir(join(pkgDir, 'lib'), { recursive: true })
  await mkdir(join(root, 'bin'), { recursive: true })
  await writeFile(join(pkgDir, 'lib', 'bin.js'), '')
  await symlink(join(pkgDir, 'lib', 'bin.js'), join(root, 'bin', 'dsh'))
  const write = (next) => writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: next }))
  write(version)
  return { root, bin: join(root, 'bin', 'dsh'), write }
}

const dshRegistry = (latest, extra = {}) => async (url) => {
  const s = String(url)
  if (s.includes('/tags')) return new Response(JSON.stringify([{ name: `dsh-v${latest}` }]))
  if (s.includes('registry.npmjs.org')) {
    const versions = Object.fromEntries([latest, ...Object.values(extra)].map((v) => [v, {}]))
    return new Response(JSON.stringify({ 'dist-tags': { latest, ...extra }, versions }))
  }
  return new Response('{}')
}

test('checkDshUpdate compare-only fetches info without spawning npm', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const dsh = await fakeDshInstall('0.1.2')
  let spawned = false
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: dshRegistry('0.1.3'),
    updateEnv: { DSH_BIN_PATH: dsh.bin, PATH: '' },
    spawnFn: () => { spawned = true; throw new Error('spawn') },
  })
  const info = await controller.checkDshUpdate({ apply: false })
  assert.equal(spawned, false)
  assert.equal(info.status, 'update')
  assert.equal(info.canUpdate, true)
  assert.equal(info.apply.status, 'none')
})

test('checkDshUpdate with apply: true installs into the running prefix and restarts once the copy matches', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const dsh = await fakeDshInstall('0.1.2')
  const seen = []
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: dshRegistry('0.1.3'),
    updateEnv: { DSH_BIN_PATH: dsh.bin, PATH: '' },
    spawnFn: (cmd, args) => {
      seen.push({ cmd, args })
      if (cmd === 'npm') dsh.write('0.1.3')
      return spawnChild(0)
    },
  })
  const result = await controller.checkDshUpdate({ apply: true })
  assert.equal(result.apply.status, 'installed')
  assert.equal(result.apply.restart, true)
  assert.equal(result.version, '0.1.3')
  assert.equal(result.status, 'current')
  assert.equal(seen[0].cmd, 'npm')
  assert.deepEqual(seen[0].args, ['install', '-g', '--prefix', dsh.root, '@deepseek-ai/dsh@0.1.3'])
  assert.equal(seen[1].cmd, '/bin/sh')
})

test('checkDshUpdate never restarts when npm exits 0 but the running copy is unchanged', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const dsh = await fakeDshInstall('0.1.2-alpha.5')
  const seen = []
  let exited = false
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: dshRegistry('0.1.2-rc.1', { alpha: '0.1.2-alpha.5' }),
    updateEnv: { DSH_BIN_PATH: dsh.bin, PATH: '' },
    exitFn: () => { exited = true },
    spawnFn: (cmd, args) => {
      seen.push({ cmd, args })
      return spawnChild(0)
    },
  })
  const result = await controller.checkDshUpdate({ apply: true })
  assert.equal(result.apply.status, 'installed-unchanged')
  assert.equal(result.apply.restart, false)
  assert.equal(result.version, '0.1.2-alpha.5')
  assert.equal(result.status, 'update')
  assert.equal(seen.length, 1)
  await new Promise((resolve) => setTimeout(resolve, 300))
  assert.equal(exited, false)
})

test('checkDshUpdate apply rolls back to an older npm version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const dsh = await fakeDshInstall('0.1.2-rc.1')
  const seen = []
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: dshRegistry('0.1.2-rc.1', { alpha: '0.1.2-alpha.5' }),
    updateEnv: { DSH_BIN_PATH: dsh.bin, PATH: '' },
    spawnFn: (cmd, args) => {
      seen.push({ cmd, args })
      if (cmd === 'npm') dsh.write('0.1.2-alpha.5')
      return spawnChild(0)
    },
  })
  const result = await controller.checkDshUpdate({ apply: true, targetVersion: '0.1.2-alpha.5' })
  assert.equal(seen[0].cmd, 'npm')
  assert.deepEqual(seen[0].args, ['install', '-g', '--prefix', dsh.root, '@deepseek-ai/dsh@0.1.2-alpha.5'])
  assert.equal(result.apply.status, 'installed')
  assert.equal(result.apply.restart, true)
  assert.equal(result.version, '0.1.2-alpha.5')
})

test('snapshot includes autoUpdate prefs defaulting to off', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
  })
  const snap = await controller.snapshot()
  assert.deepEqual(snap.autoUpdate, { plugin: false, dsh: false })
})

test('setAutoUpdate persists plugin and dsh flags independently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    spawnFn: () => { throw new Error('spawn') },
    fetchFn: async () => new Response('{}'),
  })
  const pluginOn = await controller.setAutoUpdate({ plugin: true })
  assert.deepEqual(pluginOn, { plugin: true, dsh: false })
  const both = await controller.setAutoUpdate({ dsh: true })
  assert.deepEqual(both, { plugin: true, dsh: true })
  const pluginOff = await controller.setAutoUpdate({ plugin: false })
  assert.deepEqual(pluginOff, { plugin: false, dsh: true })
  const snap = await controller.snapshot()
  assert.deepEqual(snap.autoUpdate, { plugin: false, dsh: true })
})

test('runAutoUpdate applies DSH when checkbox is on and npm has a newer version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const dsh = await fakeDshInstall('0.1.2')
  const seen = []
  const fetchFn = async (url) => {
    const s = String(url)
    if (s.includes('/tags')) return new Response(JSON.stringify([{ name: 'dsh-v0.1.3' }]))
    if (s.includes('registry.npmjs.org')) {
      return new Response(JSON.stringify({ 'dist-tags': { latest: '0.1.3' }, versions: { '0.1.3': {} } }))
    }
    if (s.includes('/releases/latest')) {
      return new Response(JSON.stringify({ tag_name: 'v0.0.78', published_at: '2026-09-06T00:00:00Z' }))
    }
    return new Response('{}')
  }
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn,
    updateEnv: { DSH_BIN_PATH: dsh.bin, PATH: '' },
    spawnFn: (cmd, args) => {
      seen.push({ cmd, args })
      if (cmd === 'npm') dsh.write('0.1.3')
      return spawnChild(0)
    },
  })
  // Turning the checkbox on runs one auto-update, which installs; the next tick sees a current copy and does nothing.
  const first = await controller.setAutoUpdate({ dsh: true })
  assert.equal(first.dsh, true)
  const result = await controller.runAutoUpdate()
  assert.equal(seen.filter((row) => row.cmd === 'npm' && row.args.includes('@deepseek-ai/dsh@0.1.3')).length, 1)
  assert.equal(result.dsh.status, 'current')
  assert.equal(result.dsh.apply.status, 'none')
})

test('runAutoUpdate skips a target that never reached the running copy; a click retries it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const dsh = await fakeDshInstall('0.1.2-alpha.5')
  const seen = []
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: dshRegistry('0.1.2-rc.1', { alpha: '0.1.2-alpha.5' }),
    updateEnv: { DSH_BIN_PATH: dsh.bin, PATH: '' },
    spawnFn: (cmd, args) => {
      seen.push({ cmd, args })
      return spawnChild(0)
    },
  })
  const npmRuns = () => seen.filter((row) => row.cmd === 'npm').length
  await controller.setAutoUpdate({ dsh: true })
  assert.equal(npmRuns(), 1)
  const tick = await controller.runAutoUpdate()
  assert.equal(npmRuns(), 1)
  assert.equal(tick.dsh.apply.status, 'none')
  const click = await controller.checkDshUpdate({ apply: true, targetVersion: '0.1.2-rc.1' })
  assert.equal(npmRuns(), 2)
  assert.equal(click.apply.status, 'installed-unchanged')
  assert.equal(click.apply.restart, false)
})


