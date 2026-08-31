/**
 * Remember the last reasoning effort the user picked on an oauth-* family
 * and put it back when DSH's model switch drops `agent-default-model.reasoningEffort`.
 */

import { readPrivateText, writePrivateText } from './store.js'

export const AGENT_DEFAULT_MODEL_NS = 'agent-default-model'
export const LAST_EFFORT_FILE = 'reasoning-effort.json'

const FAMILIES = Object.freeze(['codex', 'grok', 'glm', 'kiro', 'antigravity'])
const REMEMBERABLE = new Set(['off', 'low', 'medium', 'high', 'xhigh', 'max'])
/** Highest-first when the remembered level is above what the model offers. */
const CLAMP_ORDER = Object.freeze(['max', 'xhigh', 'high', 'medium', 'low'])

export function isOwnedOauthProvider(prefix, provider) {
  const route = String(prefix ?? '').trim() || 'oauth'
  return FAMILIES.some((family) => String(provider ?? '') === `${route}-${family}`)
}

export function isRememberableEffort(value) {
  return typeof value === 'string' && REMEMBERABLE.has(value)
}

export function isDefaultishEffort(value) {
  return value == null || value === '' || value === 'default'
}

/**
 * Keep the remembered key when the model declares it. `xhigh` / `max` that
 * the model does not list fall to the highest key it does declare.
 * `reasoningEfforts: false` and unknown keys stay unset.
 */
export function compatibleEffort(remembered, reasoningEfforts) {
  if (!isRememberableEffort(remembered)) return undefined
  if (reasoningEfforts === false || reasoningEfforts == null || typeof reasoningEfforts !== 'object') {
    return undefined
  }
  if (Object.prototype.hasOwnProperty.call(reasoningEfforts, remembered)) return remembered
  if (remembered !== 'xhigh' && remembered !== 'max') return undefined
  for (const level of CLAMP_ORDER) {
    if (Object.prototype.hasOwnProperty.call(reasoningEfforts, level)) return level
  }
  return undefined
}

export function providerReasoning(remembered, models) {
  if (isRememberableEffort(remembered)) return remembered
  const rows = Array.isArray(models) ? models : []
  if (rows.some((model) => model?.reasoningEfforts && typeof model.reasoningEfforts === 'object'
    && Object.prototype.hasOwnProperty.call(model.reasoningEfforts, 'high'))) {
    return 'high'
  }
  return undefined
}

export function decideEffortAction({ selection, previous, remembered, prefix, efforts }) {
  const provider = selection?.provider
  const model = selection?.model
  if (!isOwnedOauthProvider(prefix, provider) || typeof model !== 'string' || model.length === 0) {
    return {}
  }
  const effort = selection?.reasoningEffort
  const out = {}
  if (isRememberableEffort(effort)) out.remember = effort
  const switched = previous == null
    || previous.provider !== provider
    || previous.model !== model
  if (switched && isDefaultishEffort(effort)) {
    const restored = compatibleEffort(remembered, efforts)
    if (restored !== undefined) out.restore = restored
  }
  return out
}

export class EffortMemory {
  constructor({ path } = {}) {
    this.path = path
    this.effort = undefined
    this.ready = path ? this.load() : Promise.resolve()
  }

  last() {
    return this.effort
  }

  async load() {
    const text = await readPrivateText(this.path, 'oauth-subs reasoning effort', { allowBroadMode: true })
    if (text === undefined) return
    try {
      const raw = JSON.parse(text)
      if (isRememberableEffort(raw?.effort)) this.effort = raw.effort
    } catch {
      // Corrupt file: stay empty rather than crash the proxy.
    }
  }

  async remember(effort) {
    if (!isRememberableEffort(effort) || this.effort === effort) return
    this.effort = effort
    await this.save()
  }

  async save() {
    if (!this.path) return
    await writePrivateText(this.path, `${JSON.stringify({ effort: this.effort })}\n`)
  }
}

function snapshotSelection(value) {
  if (value == null || typeof value !== 'object') return undefined
  return {
    provider: value.provider,
    model: value.model,
    reasoningEffort: value.reasoningEffort,
  }
}

function selectionKey(value) {
  const snap = snapshotSelection(value)
  if (!snap) return ''
  return `${snap.provider ?? ''}\0${snap.model ?? ''}\0${snap.reasoningEffort ?? ''}`
}

async function writeRestoredEffort(settings, value) {
  if (typeof settings?.mutate === 'function') {
    await settings.mutate(AGENT_DEFAULT_MODEL_NS, [
      { op: 'set', path: ['reasoningEffort'], value },
    ])
    return
  }
  if (typeof settings?.replace === 'function') {
    const current = typeof settings.get === 'function' ? await settings.get(AGENT_DEFAULT_MODEL_NS) : {}
    await settings.replace(AGENT_DEFAULT_MODEL_NS, {
      ...(current && typeof current === 'object' ? current : {}),
      reasoningEffort: value,
    })
  }
}

/**
 * Prefer `settings.watch('agent-default-model', cb)` when the host exposes it.
 * DSH 0.1.x only watches via `register()` (already owned by agent-default-model),
 * so we poll `settings.get` — `saveSelection` already writes that namespace.
 */
export function attachDefaultModelWatch(settings, onChange, { intervalMs = 250 } = {}) {
  if (settings == null) return () => {}
  let stopped = false
  const emit = (next, prev) => {
    if (stopped) return
    void Promise.resolve(onChange(next, prev)).catch(() => undefined)
  }

  if (typeof settings.watch === 'function') {
    let stop
    try {
      stop = settings.watch(AGENT_DEFAULT_MODEL_NS, emit)
    } catch {
      stop = undefined
    }
    if (typeof stop === 'function') {
      if (typeof settings.get === 'function') {
        void Promise.resolve(settings.get(AGENT_DEFAULT_MODEL_NS)).then((current) => {
          if (current != null) emit(current, undefined)
        })
      }
      return () => {
        stopped = true
        stop()
      }
    }
  }

  if (typeof settings.get !== 'function') return () => {}
  let prevKey = selectionKey(undefined)
  const tick = () => {
    if (stopped) return
    void Promise.resolve(settings.get(AGENT_DEFAULT_MODEL_NS)).then((current) => {
      const key = selectionKey(current)
      if (key === prevKey) return
      prevKey = key
      emit(current)
    })
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

export function startEffortRestore({ settings, memory, prefix, effortsFor }) {
  let previous
  let pendingRestore
  const handle = async (next) => {
    const snap = snapshotSelection(next)
    if (pendingRestore) {
      const echo = snap
        && snap.provider === pendingRestore.provider
        && snap.model === pendingRestore.model
        && snap.reasoningEffort === pendingRestore.effort
      pendingRestore = undefined
      if (echo) {
        previous = snap
        return
      }
    }
    const action = decideEffortAction({
      selection: snap,
      previous,
      remembered: memory.last(),
      prefix,
      efforts: typeof effortsFor === 'function' ? effortsFor(snap?.provider, snap?.model) : undefined,
    })
    previous = snap
    if (action.remember) await memory.remember(action.remember)
    if (action.restore && action.restore !== snap?.reasoningEffort) {
      pendingRestore = { provider: snap.provider, model: snap.model, effort: action.restore }
      await writeRestoredEffort(settings, action.restore)
      previous = { provider: snap.provider, model: snap.model, reasoningEffort: action.restore }
    }
  }
  return attachDefaultModelWatch(settings, handle)
}
