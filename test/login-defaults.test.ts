import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { glmSession } from '../lib/oauth/glm/index.js'
import { ModelSwitch } from '../lib/oauth/model-switch.js'
import { catalogProviders } from '../lib/oauth/models.js'
import { deleteSession, saveSession } from '../lib/oauth/store.js'

/**
 * 登录默认: a family that signs in while this plugin runs starts with every
 * catalog row off, and only rows the user picks land in settings.yaml. A
 * family already signed in when the plugin instance started keeps whatever the
 * user had (the upgrade path must not turn existing installs off).
 */
async function loginFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-login-default-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const authPath = join(dir, 'auth.json')
  const modelsPath = join(dir, 'models.json')
  const section = { providers: {} }
  const settings = {
    get: () => structuredClone(section),
    async mutate(name, mutations) {
      assert.equal(name, 'llm-pi-ai')
      const next = { ...section.providers }
      for (const mutation of mutations) {
        const id = mutation.path[1]
        if (mutation.op === 'unset') delete next[id]
        else next[id] = structuredClone(mutation.value)
      }
      section.providers = next
    },
  }
  const controller = () => new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings,
    models: new ModelSwitch({ path: modelsPath }),
    cursorAutoImport: false,
    ollamaAutoImport: false,
    kimiAutoImport: false,
    copilotAutoImport: false,
    updateEnv: { DSH_HOME: dir },
    readFileFn: () => '{"version":"0.0.0"}',
    fetchFn: async (input) => {
      const path = new URL(String(input)).pathname
      assert.ok(path.endsWith('/usage/quota/limit') || path.endsWith('/usage/tool-usage'))
      return Response.json({ data: { level: 'pro', list: [] } })
    },
  })
  const signIn = () => saveSession('glm', glmSession({
    accessToken: 'test-glm-key',
    account: 'login-default@example.test',
    region: 'bigmodel',
  }), authPath)
  return { controller, signIn, modelsPath, authPath, section }
}

const glmIds = () => catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })['oauth-glm'].models.map((row) => row.id)

test('a family that signs in while the plugin runs keeps every row off', async (t) => {
  const fixture = await loginFixture(t)
  const controller = fixture.controller()
  // Nothing signed in yet: the first sync has no family to settle.
  await controller.sync()
  await fixture.signIn()
  await controller.sync()

  // No route: every row is off, so nothing goes into settings.yaml.
  assert.equal(fixture.section.providers['oauth-glm'], undefined)
  const saved = JSON.parse(await readFile(fixture.modelsPath, 'utf8'))
  assert.deepEqual(saved.seenLogins, ['glm'])
  assert.deepEqual(saved.awaitingPick, ['glm'])
  assert.deepEqual(saved.disabled, glmIds().map((id) => 'oauth-glm/' + id).sort())

  const snapshot = await controller.snapshot()
  const group = snapshot.catalog.find((row) => row.family === 'glm')
  assert.equal(group.awaitingPick, true)
  assert.ok(group.models.every((row) => !row.enabled))
  assert.equal(snapshot.selected.some((key) => key.startsWith('oauth-glm/')), false)
})

test('a family already signed in when the plugin starts keeps its default selection', async (t) => {
  const fixture = await loginFixture(t)
  await fixture.signIn()
  const controller = fixture.controller()
  await controller.sync()

  assert.deepEqual(fixture.section.providers['oauth-glm'].models.map((row) => row.id), glmIds())
  const saved = JSON.parse(await readFile(fixture.modelsPath, 'utf8'))
  assert.deepEqual(saved.seenLogins, ['glm'])
  assert.deepEqual(saved.awaitingPick, [])
  const group = (await controller.snapshot()).catalog.find((row) => row.family === 'glm')
  assert.equal('awaitingPick' in group, false)
  assert.ok(group.models.every((row) => row.enabled))
})

test('the first pick lands that row, survives a restart, and is never re-defaulted', async (t) => {
  const fixture = await loginFixture(t)
  const controller = fixture.controller()
  await controller.sync()
  await fixture.signIn()
  await controller.sync()

  const key = 'oauth-glm/' + glmIds()[0]
  await controller.setModels({ key, on: true })
  assert.deepEqual(fixture.section.providers['oauth-glm'].models.map((row) => row.id), [glmIds()[0]])

  // Restart with the session in place: the pick is the user's, not a default.
  const restarted = fixture.controller()
  await restarted.sync()
  assert.deepEqual(fixture.section.providers['oauth-glm'].models.map((row) => row.id), [glmIds()[0]])
  const group = (await restarted.snapshot()).catalog.find((row) => row.family === 'glm')
  assert.equal('awaitingPick' in group, false)
  assert.equal(group.models.find((row) => row.key === key).enabled, true)

  // Sign out and back in: a settled family is not re-defaulted, so the pick
  // the user already made is not wiped.
  await deleteSession('glm', fixture.authPath)
  await controller.sync()
  await fixture.signIn()
  const again = fixture.controller()
  await again.sync()
  assert.deepEqual(fixture.section.providers['oauth-glm'].models.map((row) => row.id), [glmIds()[0]])
})

test('catalog rows discovered while the pick is pending stay off', async (t) => {
  const models = new ModelSwitch()
  await models.seedSeenLogins(['codex'])
  const first = { 'oauth-kiro': { models: [{ id: 'k3' }] } }
  assert.equal(await models.applyLoginDefaults(first, { kiro: true }), true)
  assert.deepEqual(models.status(first).selected, [])

  const expanded = { 'oauth-kiro': { models: [{ id: 'k3' }, { id: 'k4' }] } }
  await models.applyLoginDefaults(expanded, { kiro: true })
  assert.deepEqual(models.status(expanded).disabled, ['oauth-kiro/k3', 'oauth-kiro/k4'])

  // Once the user picks, the family is ordinary again: rows the catalog grows
  // later follow the default-on rule.
  await models.toggle('oauth-kiro/k3', true, expanded)
  assert.deepEqual(models.status(expanded).selected, ['oauth-kiro/k3'])
  const grown = { 'oauth-kiro': { models: [{ id: 'k3' }, { id: 'k4' }, { id: 'k5' }] } }
  await models.applyLoginDefaults(grown, { kiro: true })
  assert.deepEqual(models.status(grown).selected, ['oauth-kiro/k3', 'oauth-kiro/k5'])
})

test('family switches drop the pending login default', async (t) => {
  const models = new ModelSwitch()
  const catalog = { 'oauth-kiro': { models: [{ id: 'k3' }, { id: 'k4' }] } }
  await models.applyLoginDefaults(catalog, { kiro: true })
  assert.deepEqual(models.status(catalog).selected, [])
  await models.setFamily('kiro', true, catalog)
  assert.deepEqual(models.status(catalog).selected, ['oauth-kiro/k3', 'oauth-kiro/k4'])
  assert.equal(models.awaitingPick.size, 0)
})
