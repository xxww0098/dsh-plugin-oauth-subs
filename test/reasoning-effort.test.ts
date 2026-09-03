import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { catalogProviders } from '../lib/oauth/models.js'
import {
  AGENT_DEFAULT_MODEL_NS,
  EffortMemory,
  applyRestoredSelection,
  compatibleEffort,
  decideEffortAction,
  isOwnedOauthProvider,
  lastModelSelection,
  startEffortRestore,
} from '../lib/oauth/reasoning-effort.js'

const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })

function effortsFor(provider, modelId) {
  return catalog[provider]?.models.find((model) => model.id === modelId)?.reasoningEfforts
}

function createHost(initial = {}) {
  const section = { ...initial }
  const updated = new Set()
  const selects = []
  const saves = []
  const mutates = []
  const sessions = []
  const host = {
    section,
    selects,
    saves,
    mutates,
    sessions: { list: () => sessions },
    settings: {
      get(name) {
        if (name !== AGENT_DEFAULT_MODEL_NS) return undefined
        return { ...section }
      },
      async mutate(target, mutations) {
        if (target !== AGENT_DEFAULT_MODEL_NS) throw new Error(`mutate ${target}`)
        const prev = { ...section }
        for (const row of mutations) {
          if (row.op === 'set' && row.path?.[0] === 'reasoningEffort') {
            section.reasoningEffort = row.value
          }
        }
        mutates.push({ target, mutations })
        for (const callback of updated) await callback(AGENT_DEFAULT_MODEL_NS, { ...section }, prev, 'update')
      },
    },
    sessionController: {
      async selectModel(request) {
        selects.push({ ...request })
        const prev = { ...section }
        section.provider = request.provider
        section.model = request.model
        section.reasoningEffort = request.reasoningEffort
        const session = sessions.find((row) => row.id === request.sessionId)
        if (session) {
          session.events.push({
            type: 'model/selection',
            data: { provider: request.provider, model: request.model, reasoningEffort: request.reasoningEffort },
          })
        }
        for (const callback of updated) {
          await callback(AGENT_DEFAULT_MODEL_NS, { ...section }, prev, 'update')
        }
      },
    },
    agentDefaultModel: {
      async saveSelection(next) {
        saves.push({ ...next })
        const prev = { ...section }
        for (const key of Object.keys(section)) delete section[key]
        Object.assign(section, next)
        for (const callback of updated) await callback(AGENT_DEFAULT_MODEL_NS, { ...section }, prev, 'update')
      },
    },
    on(name, callback) {
      if (name === 'settings/updated') updated.add(callback)
      return () => updated.delete(callback)
    },
    off(name, callback) {
      if (name === 'settings/updated') updated.delete(callback)
    },
    addSession(id, selection) {
      sessions.push({
        id,
        events: [{ type: 'model/selection', data: { ...selection } }],
      })
    },
    async emitUpdated(next) {
      const prev = { ...section }
      for (const key of Object.keys(section)) delete section[key]
      Object.assign(section, next)
      for (const callback of updated) await callback(AGENT_DEFAULT_MODEL_NS, { ...section }, prev, 'update')
    },
  }
  return host
}

async function settle() {
  await Promise.resolve()
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

  const omittedDefault = decideEffortAction({
    selection: { provider: 'oauth-codex', model: 'gpt-5.5' },
    previous: { provider: 'oauth-codex', model: 'gpt-5.5', reasoningEffort: 'high' },
    remembered: 'high',
    prefix: 'oauth',
    efforts: effortsFor('oauth-codex', 'gpt-5.5'),
  })
  assert.deepEqual(omittedDefault, {})

  assert.equal(isOwnedOauthProvider('oauth', 'oauth-kiro'), true)
  assert.equal(isOwnedOauthProvider('oauth', 'oauth-kimi'), true)
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

test('applyRestoredSelection calls selectModel so the live picker gets the effort', async () => {
  const host = createHost({ provider: 'oauth-grok', model: 'grok-4.6' })
  host.addSession('session-1', { provider: 'oauth-grok', model: 'grok-4.6' })
  host.addSession('session-2', { provider: 'oauth-codex', model: 'gpt-5.5', reasoningEffort: 'high' })
  const result = await applyRestoredSelection(host, {
    provider: 'oauth-grok',
    model: 'grok-4.6',
    reasoningEffort: 'high',
  })
  assert.equal(result.via, 'selectModel')
  assert.equal(result.livePicker, true)
  assert.deepEqual(host.selects, [{
    sessionId: 'session-1',
    provider: 'oauth-grok',
    model: 'grok-4.6',
    reasoningEffort: 'high',
  }])
  assert.equal(lastModelSelection(host.sessions.list()[0]).reasoningEffort, 'high')
  assert.equal(host.mutates.length, 0)
})

test('applyRestoredSelection falls back to saveSelection when no live session matches', async () => {
  const host = createHost({ provider: 'oauth-grok', model: 'grok-4.6' })
  const result = await applyRestoredSelection(host, {
    provider: 'oauth-grok',
    model: 'grok-4.6',
    reasoningEffort: 'high',
  })
  assert.equal(result.via, 'saveSelection')
  assert.equal(result.livePicker, false)
  assert.deepEqual(host.saves, [{ provider: 'oauth-grok', model: 'grok-4.6', reasoningEffort: 'high' }])
})

test('startEffortRestore calls selectModel on an oauth switch', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const host = createHost({
    provider: 'oauth-codex',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'high',
  })
  host.addSession('live', { provider: 'oauth-codex', model: 'gpt-5.6-sol', reasoningEffort: 'high' })
  const stop = startEffortRestore({ ctx: host, settings: host.settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  host.sessions.list()[0].events.push({ type: 'model/selection', data: { provider: 'oauth-grok', model: 'grok-4.6' } })
  await host.emitUpdated({ provider: 'oauth-grok', model: 'grok-4.6' })
  await settle()
  assert.equal(host.selects.length, 1)
  assert.deepEqual(host.selects[0], {
    sessionId: 'live',
    provider: 'oauth-grok',
    model: 'grok-4.6',
    reasoningEffort: 'high',
  })
  stop()
})

test('startEffortRestore clamps xhigh to high on Antigravity', async () => {
  const memory = new EffortMemory()
  await memory.remember('xhigh')
  const host = createHost({
    provider: 'oauth-codex',
    model: 'gpt-5.6-sol',
    reasoningEffort: 'xhigh',
  })
  host.addSession('live', { provider: 'oauth-codex', model: 'gpt-5.6-sol', reasoningEffort: 'xhigh' })
  const stop = startEffortRestore({ ctx: host, settings: host.settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  host.sessions.list()[0].events.push({
    type: 'model/selection',
    data: { provider: 'oauth-antigravity', model: 'gemini-3.7-flash-high' },
  })
  await host.emitUpdated({ provider: 'oauth-antigravity', model: 'gemini-3.7-flash-high' })
  await settle()
  assert.equal(host.selects[0].reasoningEffort, 'high')
  assert.equal(memory.last(), 'xhigh')
  stop()
})

test('startEffortRestore ignores non-oauth providers', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const host = createHost({
    provider: 'oauth-codex',
    model: 'gpt-5.5',
    reasoningEffort: 'high',
  })
  const stop = startEffortRestore({ ctx: host, settings: host.settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  await host.emitUpdated({ provider: 'openai', model: 'gpt-5.4' })
  await settle()
  assert.equal(host.selects.length, 0)
  assert.equal(host.saves.length, 0)
  assert.equal(host.mutates.length, 0)
  assert.equal(memory.last(), 'high')
  stop()
})

test('startEffortRestore does not loop when selectModel echoes settings/updated', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const host = createHost({ provider: 'oauth-codex', model: 'gpt-5.5' })
  host.addSession('live', { provider: 'oauth-codex', model: 'gpt-5.5' })
  const stop = startEffortRestore({ ctx: host, settings: host.settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  assert.equal(host.selects.length, 1)
  assert.equal(host.selects[0].reasoningEffort, 'high')
  await settle()
  assert.equal(host.selects.length, 1)
  await host.emitUpdated({ provider: 'oauth-codex', model: 'gpt-5.5', reasoningEffort: 'high' })
  await settle()
  assert.equal(host.selects.length, 1)
  stop()
})

test('startEffortRestore leaves models with reasoningEfforts false unset', async () => {
  const memory = new EffortMemory()
  await memory.remember('high')
  const host = createHost({
    provider: 'oauth-glm',
    model: 'glm-5.3',
    reasoningEffort: 'high',
  })
  const stop = startEffortRestore({ ctx: host, settings: host.settings, memory, prefix: 'oauth', effortsFor })
  await settle()
  await host.emitUpdated({ provider: 'oauth-glm', model: 'glm-5-turbo' })
  await settle()
  assert.equal(host.selects.length, 0)
  assert.equal(host.saves.length, 0)
  stop()
})
