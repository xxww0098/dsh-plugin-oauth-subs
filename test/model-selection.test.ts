import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { glmSession } from '../lib/oauth/glm/index.js'
import { ModelSwitch, catalogProviders } from '../lib/oauth/models.js'
import { saveSession } from '../lib/oauth/store.js'

async function selectionFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-selection-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const authPath = join(dir, 'auth.json')
  const modelsPath = join(dir, 'models.json')
  await saveSession('glm', glmSession({
    accessToken: 'test-glm-key',
    account: 'selection@example.test',
    region: 'bigmodel',
  }), authPath)
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
  return { controller, modelsPath, section }
}

for (const mode of ['family', 'all', 'selected', 'individual']) {
  test('deliberate off via ' + mode + ' survives normal sync and controller restart', async (t) => {
    const fixture = await selectionFixture(t)
    const controller = fixture.controller()
    await controller.sync()
    assert.ok(fixture.section.providers['oauth-glm'])
    const catalog = await controller.catalog()
    const changes = mode === 'family' ? [{ family: 'glm', on: false }]
      : mode === 'all' ? [{ all: false }]
        : mode === 'selected' ? [{ selected: [] }]
          : catalog['oauth-glm'].models.map((row) => ({ key: 'oauth-glm/' + row.id, on: false }))
    for (const change of changes) await controller.setModels(change)
    assert.equal(fixture.section.providers['oauth-glm'], undefined)

    await controller.sync()
    assert.equal(fixture.section.providers['oauth-glm'], undefined)

    const restarted = fixture.controller()
    await restarted.sync()
    assert.equal(fixture.section.providers['oauth-glm'], undefined)
    const snapshot = await restarted.snapshot()
    assert.ok(snapshot.catalog.find((row) => row.family === 'glm').models.every((row) => !row.enabled))
  })
}

test('unmarked legacy settings still recover logged-in families without reviving retired models', async (t) => {
  const fixture = await selectionFixture(t)
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318' })
  const ids = catalog['oauth-glm'].models.map((row) => row.id)
  const retiredKey = 'oauth-glm/retired-model'
  await writeFile(fixture.modelsPath, JSON.stringify({
    disabled: [...ids.map((id) => 'oauth-glm/' + id), retiredKey],
    enabled: [],
  }), { mode: 0o600 })

  const controller = fixture.controller()
  await controller.sync()
  assert.deepEqual(fixture.section.providers['oauth-glm'].models.map((row) => row.id), ids)
  const saved = JSON.parse(await readFile(fixture.modelsPath, 'utf8'))
  assert.deepEqual(saved.disabled, [retiredKey])

  await controller.setModels({ family: 'glm', on: false })
  const restarted = fixture.controller()
  await restarted.sync()
  assert.equal(fixture.section.providers['oauth-glm'], undefined)
})

test('explicit selection keeps new ordinary models on and new large-context aliases opt-in', async (t) => {
  const fixture = await selectionFixture(t)
  const original = { 'oauth-codex': { models: [{ id: 'existing' }] } }
  const models = new ModelSwitch({ path: fixture.modelsPath })
  await models.ready
  await models.setFamily('codex', false, original)

  const expanded = {
    'oauth-codex': { models: [{ id: 'existing' }, { id: 'new-model' }, { id: 'new-model-900k' }] },
  }
  const restarted = new ModelSwitch({ path: fixture.modelsPath })
  await restarted.ready
  assert.deepEqual(restarted.status(expanded).selected, ['oauth-codex/new-model'])
  assert.deepEqual(restarted.status(expanded).disabled, ['oauth-codex/existing', 'oauth-codex/new-model-900k'])
})
