import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { catalogProviders } from '../lib/oauth/models.js'
import {
  EffortMemory,
  compatibleEffort,
  decideEffortAction,
  isOwnedOauthProvider,
  providerReasoning,
  startEffortRestore,
} from '../lib/oauth/reasoning-effort.js'

const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })

function effortsFor(provider, modelId) {
  return catalog[provider]?.models.find((model) => model.id === modelId)?.reasoningEfforts
}

function createDefaultModelSettings(initial = {}) {
  const section = { ...initial }
  const watchers = new Set()
  const ops = []
  const settings = {
    ops,
    section,
    get(name) {
      if (name !== 'agent-default-model') return undefined
      return { ...section }
    },
    watch(name, callback) {
      if (name !== 'agent-default-model') throw new Error(`watch ${name}`)
      watchers.add(callback)
      return () => watchers.delete(callback)
    },
    async mutate(target, mutations) {
      if (target !== 'agent-default-model') throw new Error(`mutate ${target}`)
      const prev = { ...section }
      for (const row of mutations) {
        if (row.op === 'set' && row.path?.[0] === 'reasoningEffort') {
          section.reasoningEffort = row.value
        } else if (row.op === 'unset' && row.path?.[0] === 'reasoningEffort') {
          delete section.reasoningEffort
        }
      }
      ops.push({ target, mutations })
      for (const callback of watchers) await callback({ ...section }, prev)
    },
    async setSelection(next) {
      const prev = { ...section }
      for (const key of Object.keys(section)) delete section[key]
      Object.assign(section, next)
      for (const callback of watchers) await callback({ ...section }, prev)
    },
  }
  return settings
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

test('compatibleEffort restores a key the model declares and clamps xhigh to high', () => {
  const grok46 = effortsFor('oauth-grok', 'grok-4.6')
  const ag = effortsFor('oauth-antigravity', 'gemini-3.7-flash-high')
  const turbo = effortsFor('oauth-glm', 'glm-5-turbo')
  const gpt55 = effortsFor('oauth-codex', 'gpt-5.5')
  assert.equal(compatibleEffort('high', grok46), 'high')
  assert.equal(compatibleEffort('xhigh', grok46), 'xhigh')
  assert.equal(compatibleEffort('xhigh', ag), 'high')
  assert.equal(compatibleEffort('max', gpt55), 'xhigh')
  assert.equal(compatibleEffort('medium', effortsFor('oauth-glm', 'glm-5.3')), undefined)
  assert.equal(compatibleEffort('off', gpt55), 'off')
  assert.equal(compatibleEffort('off', ag), undefined)
  assert.equal(compatibleEffort('high', turbo), undefined)
  assert.equal(compatibleEffort('high', false), undefined)
})

test('decideEffortAction restores on oauth switch and no-ops other providers', () => {
  const high = decideEffortAction({
    selection: { provider: 'oauth-grok', model: 'grok-4.6' },
    previous: { provider: 'oauth-codex', model: 'gpt-5.6-sol', reasoningEffort: 'high' },
    remembered: 'high',
    prefix: 'oauth',
    efforts: effortsFor('oauth-grok', 'grok-4.6'),
  })
  assert.deepEqual(high, { restore: 'high' })

  const clamp = decideEffortAction({
    selection: { provider: 'oauth-antigravity', model: 'gemini-3.7-flash-high' },
    previous: { provider: 'oauth-codex', model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' },
    remembered: 'xhigh',
    prefix: 'oauth',
    efforts: effortsFor('oauth-antigravity', 'gemini-3.7-flash-high'),
  })
  assert.deepEqual(clamp, { restore: 'high' })

  const foreign = decideEffortAction({
    selection: { provider: 'openai', model: 'gpt-5.4' },
    previous: { provider: 'oauth-codex', model: 'gpt-5.5', reasoningEffort: 'high' },
    remembered: 'high',
    prefix: 'oauth',
    efforts: undefined,
  })
  assert.deepEqual(foreign, {})

  const keep = decideEffortAction({
    selection: { provider: 'oauth-codex', model: 'gpt-5.5', reasoningEffort: 'low' },
    previous: { provider: 'oauth-grok', model: 'grok-4.6' },
    remembered: 'high',
    prefix: 'oauth',
    efforts: effortsFor('oauth-codex', 'gpt-5.5'),
  })
  assert.deepEqual(keep, { remember: 'low' })

  const same = decideEffortAction({
    selection: { provider: 'oauth-codex', model: 'gpt-5.5' },
    previous: { provider: 'oauth-codex', model: 'gpt-5.5', reasoningEffort: 'high' },
    remembered: 'high',
    prefix: 'oauth',
    efforts: effortsFor('oauth-codex', 'gpt-5.5'),
  })
  assert.deepEqual(same, {})

  assert.equal(isOwnedOauthProvider('oauth', 'oauth-kiro'), true)
  assert.equal(isOwnedOauthProvider('oauth', 'openai'), false)
})

test('EffortMemory persists a last effort next to models.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-effort-'))
  const path = join(dir, 'reasoning-effort.json')
  const first = new EffortMemory({ path })
  await first.ready
  assert.equal(first.last(), undefined)
  await first.remember('default')
  assert.equal(first.last(), undefined)
  await first.remember('high')
  assert.equal(first.last(), 'high')
  const raw = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(raw.effort, 'high')
  assert.equal((await stat(path)).mode & 0o777, 0o600)
  const second = new EffortMemory({ path })
  await second.ready
  assert.equal(second.last(), 'high')
  await second.remember('off')
  assert.equal(second.last(), 'off')
})

test('startEffortRestore writes the remembered level when the target model has it', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const settings = createDefaultModelSettings({
    provider: 'oauth-codex',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'high',
  })
  const stop = startEffortRestore({ settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  await settings.setSelection({ provider: 'oauth-grok', model: 'grok-4.6' })
  await settle()
  assert.equal(settings.section.reasoningEffort, 'high')
  assert.equal(settings.ops.length, 1)
  assert.deepEqual(settings.ops[0].mutations, [{ op: 'set', path: ['reasoningEffort'], value: 'high' }])
  stop()
})

test('startEffortRestore clamps xhigh to high on Antigravity', async () => {
  const memory = new EffortMemory()
  await memory.remember('xhigh')
  const settings = createDefaultModelSettings({
    provider: 'oauth-codex',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'xhigh',
  })
  const stop = startEffortRestore({ settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  await settings.setSelection({ provider: 'oauth-antigravity', model: 'gemini-3.7-flash-high' })
  await settle()
  assert.equal(settings.section.reasoningEffort, 'high')
  assert.equal(memory.last(), 'xhigh')
  stop()
})

test('startEffortRestore ignores non-oauth providers', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const settings = createDefaultModelSettings({
    provider: 'oauth-codex',
    model: 'gpt-5.5',
    reasoningEffort: 'high',
  })
  const stop = startEffortRestore({ settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  await settings.setSelection({ provider: 'openai', model: 'gpt-5.4' })
  await settle()
  assert.equal(settings.section.reasoningEffort, undefined)
  assert.equal(settings.ops.length, 0)
  assert.equal(memory.last(), 'high')
  stop()
})

test('startEffortRestore does not loop when watch echoes the restore write', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const settings = createDefaultModelSettings({ provider: 'oauth-codex', model: 'gpt-5.5' })
  const stop = startEffortRestore({ settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  assert.equal(settings.section.reasoningEffort, 'high')
  assert.equal(settings.ops.length, 1)
  await settle()
  assert.equal(settings.ops.length, 1)
  await settings.setSelection({ provider: 'oauth-codex', model: 'gpt-5.5', reasoningEffort: 'high' })
  await settle()
  assert.equal(settings.ops.length, 1)
  stop()
})

test('startEffortRestore leaves models with reasoningEfforts false unset', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const settings = createDefaultModelSettings({
    provider: 'oauth-glm',
    model: 'glm-5.3',
    reasoningEffort: 'high',
  })
  const stop = startEffortRestore({ settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  await settings.setSelection({ provider: 'oauth-glm', model: 'glm-5-turbo' })
  await settle()
  assert.equal(settings.section.reasoningEffort, undefined)
  assert.equal(settings.ops.length, 0)
  stop()
})

test('providerReasoning uses the remembered effort or high when the catalog has it', () => {
  assert.equal(providerReasoning('xhigh', catalog['oauth-codex'].models), 'xhigh')
  assert.equal(providerReasoning(undefined, catalog['oauth-codex'].models), 'high')
  assert.equal(providerReasoning(undefined, catalog['oauth-kiro'].models), undefined)
  assert.equal(providerReasoning('off', catalog['oauth-codex'].models), 'off')
})
