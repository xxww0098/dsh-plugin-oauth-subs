/**
 * Project Codex / Grok catalogs into llm-pi-ai provider routes and atomically
 * replace only the routes this plugin owns.
 */

import { CODEX_MODELS, CODEX_REASONING } from './codex.js'
import { GROK_MODELS } from './grok.js'
import { modelSupportsFastMode } from './fast-mode.js'
import {
  CONTEXT_VARIANT_SUFFIX,
  CODEX_LARGE_CONTEXT,
  isCodex900kBase,
  isLargeContextKey,
} from './context-mode.js'

export const OAUTH_CREDENTIAL_REF = 'DSH_OAUTH_SUBS_API_KEY'

export const CODEX_REASONING_EFFORTS = Object.freeze({
  off: null,
  ...CODEX_REASONING,
})

export function modelKey(provider, id) {
  return `${provider}/${id}`
}

export function ownedProviderIds(prefix) {
  return [`${prefix}-codex`, `${prefix}-grok`]
}

export function withPickerVariants(models) {
  const out = []
  for (const model of models) {
    out.push(model)
    if (isCodex900kBase(model.id)) {
      out.push({
        ...model,
        id: `${model.id}${CONTEXT_VARIANT_SUFFIX}`,
        name: `${model.name} 900K`,
        contextWindow: CODEX_LARGE_CONTEXT,
      })
    }
    if (modelSupportsFastMode(model.id) && !String(model.id).endsWith('-fast')) {
      out.push({ ...model, id: `${model.id}-fast`, name: `${model.name} Fast` })
    }
  }
  return out
}

export function buildProviders({ prefix, origin, loggedIn }) {
  const providers = {}
  if (loggedIn.codex) {
    providers[`${prefix}-codex`] = {
      displayName: 'OAuth · ChatGPT Codex',
      api: 'openai-responses',
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      baseURL: `${origin}/codex/v1`,
      models: withPickerVariants(CODEX_MODELS).map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        input: ['text', 'image'],
        reasoningEfforts: { ...CODEX_REASONING_EFFORTS },
      })),
    }
  }
  if (loggedIn.grok) {
    providers[`${prefix}-grok`] = {
      displayName: 'OAuth · Grok',
      api: 'openai-responses',
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      baseURL: `${origin}/grok/v1`,
      models: withPickerVariants(GROK_MODELS).map((model) => ({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        input: ['text', 'image'],
      })),
    }
  }
  return providers
}

export function describeProviders(providers) {
  return Object.entries(providers).map(([provider, value]) => ({
    provider,
    api: value.api,
    models: value.models.map((model) => ({ ...model, key: modelKey(provider, model.id) })),
  }))
}

export function catalogProviders({ prefix, origin }) {
  return buildProviders({ prefix, origin, loggedIn: { codex: true, grok: true } })
}

export function catalogKeys(providers) {
  return Object.entries(providers).flatMap(([provider, value]) =>
    (value.models ?? []).map((model) => modelKey(provider, model.id)),
  )
}

export function familyOfProvider(provider) {
  if (String(provider).endsWith('-codex')) return 'codex'
  if (String(provider).endsWith('-grok')) return 'grok'
  return String(provider)
}

export function describeCatalog(providers, { enabledKeys, loggedIn } = {}) {
  const enabled = enabledKeys === undefined ? null : new Set(enabledKeys)
  return Object.entries(providers).map(([provider, value]) => {
    const family = familyOfProvider(provider)
    return {
      provider,
      displayName: value.displayName,
      family,
      loggedIn: loggedIn ? Boolean(loggedIn[family]) : true,
      models: value.models.map((model) => {
        const key = modelKey(provider, model.id)
        return {
          id: model.id,
          name: model.name,
          key,
          enabled: enabled === null ? !isLargeContextKey(key) : enabled.has(key),
          fast: String(model.id).endsWith('-fast'),
          large: isLargeContextKey(key),
        }
      }),
    }
  })
}

function assertKeyList(keys, label) {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must be an array of model keys`)
  }
}

/**
 * Persisted enable/disable set for the Settings picker.
 * Default is all-on except `-900k` variants (opt-in; they burn quota faster).
 * New non-900K catalog ids stay on. Stored as
 * `{ "disabled": ["oauth-codex/gpt-5.4-mini"], "enabled": ["oauth-codex/gpt-5.4-900k"] }`.
 */
export class ModelSwitch {
  constructor({ path } = {}) {
    this.path = path
    this.disabled = new Set()
    this.enabled = new Set()
    this.ready = path ? this.load() : Promise.resolve()
  }

  async load() {
    try {
      const { readFile } = await import('node:fs/promises')
      const raw = JSON.parse(await readFile(this.path, 'utf8'))
      const disabled = Array.isArray(raw?.disabled) ? raw.disabled : []
      const enabled = Array.isArray(raw?.enabled) ? raw.enabled : []
      this.disabled = new Set(disabled.filter((key) => typeof key === 'string' && key.includes('/')))
      this.enabled = new Set(enabled.filter((key) => typeof key === 'string' && key.includes('/')))
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        // Corrupt file: keep all-on rather than crash the proxy.
      }
    }
  }

  async save() {
    if (!this.path) return
    const { mkdir, writeFile, chmod } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, `${JSON.stringify({
      disabled: [...this.disabled].sort(),
      enabled: [...this.enabled].sort(),
    })}\n`, { mode: 0o600 })
    await chmod(this.path, 0o600)
  }

  isEnabled(key) {
    if (this.disabled.has(key)) return false
    if (isLargeContextKey(key)) return this.enabled.has(key)
    return true
  }

  enabledKeys(catalog) {
    return catalogKeys(catalog).filter((key) => this.isEnabled(key))
  }

  selectedForSync(catalog) {
    const known = catalogKeys(catalog)
    const selected = known.filter((key) => this.isEnabled(key))
    if (selected.length === known.length) return undefined
    return selected
  }

  status(catalog) {
    const known = catalogKeys(catalog)
    const selected = known.filter((key) => this.isEnabled(key))
    const disabled = known.filter((key) => !this.isEnabled(key))
    return {
      selected,
      disabled,
      allOn: disabled.length === 0,
    }
  }

  async setEnabled(keys, catalog) {
    assertKeyList(keys, 'enabled models')
    const known = catalogKeys(catalog)
    const enabled = new Set(keys.filter((key) => known.includes(key)))
    this.disabled = new Set(known.filter((key) => !enabled.has(key)))
    this.enabled = new Set(known.filter((key) => enabled.has(key) && isLargeContextKey(key)))
    await this.save()
    return this.status(catalog)
  }

  async toggle(key, on, catalog) {
    if (typeof key !== 'string' || !key.includes('/')) {
      throw new Error('model key is required')
    }
    const known = new Set(catalogKeys(catalog))
    if (!known.has(key)) throw new Error(`unknown model ${key}`)
    if (on) {
      this.disabled.delete(key)
      if (isLargeContextKey(key)) this.enabled.add(key)
    } else {
      this.enabled.delete(key)
      this.disabled.add(key)
    }
    await this.save()
    return this.status(catalog)
  }

  async setFamily(family, on, catalog) {
    if (family !== 'codex' && family !== 'grok') throw new Error('family must be codex or grok')
    for (const key of catalogKeys(catalog)) {
      const provider = key.slice(0, key.indexOf('/'))
      if (familyOfProvider(provider) !== family) continue
      if (on) {
        this.disabled.delete(key)
        if (isLargeContextKey(key)) this.enabled.add(key)
      } else {
        this.enabled.delete(key)
        this.disabled.add(key)
      }
    }
    await this.save()
    return this.status(catalog)
  }

  async setAll(on, catalog) {
    const known = catalogKeys(catalog)
    if (on) {
      this.disabled = new Set()
      this.enabled = new Set(known.filter((key) => isLargeContextKey(key)))
    } else {
      this.disabled = new Set(known)
      this.enabled = new Set()
    }
    await this.save()
    return this.status(catalog)
  }
}


export function filterProviders(providers, selected) {
  if (selected === undefined) return providers
  if (!Array.isArray(selected) || selected.some((key) => typeof key !== 'string')) {
    throw new Error('enabled models must be an array of model keys')
  }
  const selectedKeys = new Set(selected)
  return Object.fromEntries(Object.entries(providers).flatMap(([provider, value]) => {
    const models = value.models.filter((model) => selectedKeys.has(modelKey(provider, model.id)))
    return models.length ? [[provider, { ...value, models }]] : []
  }))
}

export async function syncHarnessModels({ settings, prefix, origin, loggedIn, selected }) {
  const routePrefix = String(prefix ?? '').trim()
  if (!routePrefix) throw new Error('Harness route prefix cannot be empty')
  const providers = filterProviders(buildProviders({ prefix: routePrefix, origin, loggedIn }), selected)
  const owned = ownedProviderIds(routePrefix)
  await settings.mutate('llm-pi-ai', [
    ...owned.map((provider) => ({ op: 'unset', path: ['providers', provider] })),
    ...Object.entries(providers).map(([provider, value]) => ({
      op: 'set', path: ['providers', provider], value,
    })),
  ])
  return {
    routes: Object.entries(providers).map(([provider, value]) => ({
      provider,
      api: value.api,
      models: value.models.map((model) => model.id),
    })),
  }
}
