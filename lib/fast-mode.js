/**
 * Fast / Priority Processing for the DSH proxy.
 *
 * OpenAI Priority Processing (`service_tier: "priority"`) is valid on GPT
 * flagships (gpt-*, o1/o3/o4) and Grok 4.6. Codex-series slugs
 * (`gpt-5.3-codex`, …) and older Grok ids reject the field — strip it.
 *
 * Fast is:
 *   1. a Settings toggle (session default)
 *   2. a `-fast` model suffix the picker can select (`gpt-5.5-fast`)
 * The suffix is host-side only and is peeled before the upstream request.
 */

import { peelContextSuffix } from './context-mode.js'

const OPENAI_FAST_PREFIXES = Object.freeze(['gpt-', 'o1', 'o3', 'o4'])
export const FAST_SUFFIX = '-fast'

export function stripVendorPrefix(modelId) {
  let raw = String(modelId ?? '').trim()
  if (raw.includes('/')) raw = raw.slice(raw.lastIndexOf('/') + 1)
  const colon = raw.indexOf(':')
  if (colon > 0) raw = raw.slice(0, colon)
  return raw
}

export function isCodexSeries(modelId) {
  return stripVendorPrefix(modelId).toLowerCase().includes('codex')
}

export function isGrok46Family(modelId) {
  const base = stripVendorPrefix(modelId).toLowerCase()
  return base === 'grok-4.6' || base.startsWith('grok-4.6-')
}

export function modelSupportsFastMode(modelId) {
  const base = stripVendorPrefix(modelId).toLowerCase()
  if (!base) return false
  if (base.includes('codex')) return false
  if (OPENAI_FAST_PREFIXES.some((prefix) => base.startsWith(prefix))) return true
  return isGrok46Family(base)
}

export function peelFastSuffix(modelId) {
  const raw = String(modelId ?? '')
  if (!raw.toLowerCase().endsWith(FAST_SUFFIX)) {
    return { model: raw, requestedFast: false }
  }
  const base = raw.slice(0, -FAST_SUFFIX.length)
  if (modelSupportsFastMode(base)) return { model: base, requestedFast: true }
  return { model: raw, requestedFast: false }
}

export function resolveFastModeOverrides(modelId) {
  if (!modelSupportsFastMode(modelId)) return null
  return { service_tier: 'priority' }
}

export function applyFastMode(payload, { defaultOn = false } = {}) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return payload
  const next = { ...payload }
  const fast = peelFastSuffix(typeof next.model === 'string' ? next.model : '')
  const ctx = peelContextSuffix(fast.model)
  const model = ctx.model
  if (typeof next.model === 'string') next.model = model

  const eligible = modelSupportsFastMode(model)
  if (!eligible) {
    delete next.service_tier
    return next
  }

  const requestedFast = fast.requestedFast
  const explicit = typeof next.service_tier === 'string' ? next.service_tier : undefined
  if (requestedFast) {
    next.service_tier = 'priority'
    return next
  }
  if (explicit !== undefined) return next
  if (defaultOn) next.service_tier = 'priority'
  else delete next.service_tier
  return next
}

export function withFastVariants(models) {
  const out = []
  for (const model of models) {
    out.push(model)
    if (modelSupportsFastMode(model.id) && !String(model.id).endsWith(FAST_SUFFIX)) {
      out.push({ ...model, id: `${model.id}${FAST_SUFFIX}`, name: `${model.name} Fast` })
    }
  }
  return out
}

export class FastSwitch {
  constructor({ path, initial = false } = {}) {
    this.path = path
    this.on = Boolean(initial)
    this.ready = path ? this.load() : Promise.resolve()
  }

  async load() {
    try {
      const { readFile } = await import('node:fs/promises')
      const raw = JSON.parse(await readFile(this.path, 'utf8'))
      if (typeof raw?.on === 'boolean') this.on = raw.on
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        // Corrupt file: keep the constructor default rather than crash the proxy.
      }
    }
  }

  enabled() {
    return this.on
  }

  status() {
    return {
      on: this.on,
      serviceTier: this.on ? 'priority' : null,
      note: this.on ? 'fast' : 'normal',
    }
  }

  async set(on) {
    this.on = Boolean(on)
    if (this.path) {
      const { mkdir, writeFile, chmod } = await import('node:fs/promises')
      const { dirname } = await import('node:path')
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(this.path, `${JSON.stringify({ on: this.on })}\n`, { mode: 0o600 })
      await chmod(this.path, 0o600)
    }
    return this.status()
  }
}
