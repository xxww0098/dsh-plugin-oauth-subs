/**
 * Project Codex / Grok catalogs into llm-pi-ai provider routes and atomically
 * replace only the routes this plugin owns.
 */

import { CODEX_MODELS, CODEX_REASONING_EFFORTS } from './codex/index.js'
import { GROK_MODELS } from './grok/index.js'
import { GLM_MODELS } from './glm/index.js'
import { KIRO_MODELS } from './kiro/index.js'
import { ANTIGRAVITY_MODELS } from './antigravity/index.js'
import { CURSOR_MODELS } from './cursor/index.js'
import { OLLAMA_MODELS } from '../apikey/ollama/index.js'
import { KIMI_MODELS } from './kimi/index.js'
import { COPILOT_MODELS } from './copilot/index.js'
import {
  OPENCODE_GO_BUILTIN_ROUTE_ID,
  OPENCODE_GO_EXTRA_ROUTE,
  OPENCODE_GO_SESSION_HEADER,
  OPENCODE_GO_SESSION_ID,
  opencodeGoSessionHeaders,
} from '../apikey/opencode-go/models.js'

import { modelSupportsFastMode } from '../utils/fast-mode.js'
import { readPrivateText, writePrivateText } from './store.js'
import {
  CONTEXT_VARIANT_SUFFIX,
  codexLargeContext,
  isLargeContextKey,
} from '../utils/context-mode.js'

export const OAUTH_CREDENTIAL_REF = 'DSH_OAUTH_SUBS_API_KEY'

/**
 * DSH llm-pi-ai `api` is a closed union (`openai-completions` |
 * `openai-responses` | `anthropic-messages`). Bare `openai` is refused
 * and the whole section write is dropped, so Codex/Grok stay and GLM /
 * Kiro / Antigravity never land in settings.yaml.
 */
export const HARNESS_RESPONSES_API = 'openai-responses'
export const HARNESS_COMPLETIONS_API = 'openai-completions'
export const HARNESS_ANTHROPIC_API = 'anthropic-messages'
/**
 * DSH `reasoningEfforts` keys (`packages/llm/llm-pi-ai` THINKING_LEVELS).
 * Vendor wire spellings belong in the *value* (`off: "none"`), never as a
 * key. An unknown key fails the whole `llm-pi-ai` mutate, so the family
 * never lands in settings.yaml.
 */
export const DSH_THINKING_LEVELS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/**
 * Completions-only `compat` switches. DSH `@deepseek-ai/dsh-llm-pi-ai`
 * `assertServiceable` (0.1.2-alpha.2 `catalog.ts`) refuses a route-level
 * field that no model on the route can read:
 * `sets compat "${field}", but no model on the route speaks a protocol that takes it`.
 * `supportsReasoningEffort` / `thinkingFormat` live on
 * `openai-completions` only — not `anthropic-messages` or `openai-responses`.
 * Stamping either on GLM's Anthropic hop aborts the atomic `llm-pi-ai`
 * mutate, so `oauth-kiro` never lands in settings.yaml.
 */
export const DSH_COMPLETIONS_ONLY_COMPAT = Object.freeze(['supportsReasoningEffort', 'thinkingFormat'])

export { CODEX_REASONING_EFFORTS }

/**
 * Local stand-in for DSH `assertServiceable` on one owned route. The host
 * package is not a dependency; this matches the JSON shape it rejects so a
 * bad payload fails here instead of silently keeping the last good section.
 */
export function assertDshServiceableProvider(provider, value) {
  if (value == null || typeof value !== 'object') return
  const api = value.api
  if (typeof api === 'string' && api !== HARNESS_COMPLETIONS_API && api !== HARNESS_RESPONSES_API && api !== HARNESS_ANTHROPIC_API) {
    throw new Error(`llm-pi-ai: provider "${provider}" api must be openai-completions | openai-responses | anthropic-messages`)
  }
  for (const model of value.models ?? []) {
    const efforts = model.reasoningEfforts
    if (efforts && typeof efforts === 'object') {
      if (Object.keys(efforts).length === 0) {
        throw new Error(
          `llm-pi-ai: model "${model.id}" has an empty reasoningEfforts; declare the offered levels, set false for a non-reasoning model, or omit the field to keep the installed catalog's capability`,
        )
      }
      for (const level of Object.keys(efforts)) {
        if (!DSH_THINKING_LEVELS.includes(level)) {
          throw new Error(
            `llm-pi-ai: model "${model.id}" reasoningEfforts key "${level}" is not ${DSH_THINKING_LEVELS.join('|')} (vendor spelling belongs in the value, e.g. off: "none")`,
          )
        }
      }
    }
  }
  const compat = value.compat
  if (compat && typeof compat === 'object' && api !== HARNESS_COMPLETIONS_API) {
    for (const field of DSH_COMPLETIONS_ONLY_COMPAT) {
      if (compat[field] !== undefined) {
        throw new Error(
          `llm-pi-ai: provider "${provider}" sets compat "${field}", but no model on the route speaks a protocol that takes it; it exists on openai-completions`,
        )
      }
    }
  }
}

export function isOptInKey(key) {
  return isLargeContextKey(key)
}

export function modelKey(provider, id) {
  return `${provider}/${id}`
}

export const FAMILY_IDS = Object.freeze(['codex', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'ollama', 'kimi', 'copilot'])

/**
 * OpenCode Go picker families: direct API-key routes, not OAuth logins, and
 * no loopback hop. The picker lists only the supplemental model(s) the plugin
 * writes itself; DSH's built-in `opencode-go` catalog route carries the rest.
 * Without `OPENCODE_API_KEY` the family is only locked (checkbox disabled).
 */
export const APIKEY_FAMILY_IDS = Object.freeze([OPENCODE_GO_EXTRA_ROUTE.id])

/** Every family the Settings picker can toggle. */
export const MODEL_FAMILY_IDS = Object.freeze([...FAMILY_IDS, ...APIKEY_FAMILY_IDS])

/** Dropped families. Still unset leftover harness routes; never written back. */
export const RETIRED_FAMILY_IDS = Object.freeze(['opencode'])

export function ownedProviderIds(prefix) {
  return [...FAMILY_IDS, ...RETIRED_FAMILY_IDS].map((id) => `${prefix}-${id}`)
}

function harnessInput(model) {
  if (Array.isArray(model.input) && model.input.length > 0) return [...model.input]
  return ['text', 'image']
}

function harnessReasoningEfforts(model) {
  const raw = model.reasoningEfforts
  if (raw === false) return false
  if (!raw || typeof raw !== 'object') return undefined
  const efforts = {}
  for (const [level, wire] of Object.entries(raw)) {
    if (!DSH_THINKING_LEVELS.includes(level)) {
      throw new Error(
        `llm-pi-ai: model "${model.id}" reasoningEfforts key "${level}" is not ${DSH_THINKING_LEVELS.join('|')} (vendor spelling belongs in the value, e.g. off: "none")`,
      )
    }
    efforts[level] = wire
  }
  return efforts
}

function toHarnessModel(model) {
  const row = {
    id: model.id,
    name: model.name,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    input: harnessInput(model),
  }
  const efforts = harnessReasoningEfforts(model)
  if (efforts !== undefined) row.reasoningEfforts = efforts
  return row
}

/** 872000 -> "872K", 1000000 -> "1M". */
function formatWindow(tokens) {
  return tokens % 1_000_000 === 0 ? `${tokens / 1_000_000}M` : `${Math.round(tokens / 1000)}K`
}

export function withPickerVariants(models) {
  const out = []
  for (const model of models) {
    out.push(model)
    const large = codexLargeContext(model.id)
    if (large !== undefined) {
      out.push({
        ...model,
        id: `${model.id}${CONTEXT_VARIANT_SUFFIX}`,
        name: `${model.name} ${formatWindow(large)}`,
        contextWindow: large,
      })
    }
    if (modelSupportsFastMode(model.id) && !String(model.id).endsWith('-fast')) {
      out.push({ ...model, id: `${model.id}-fast`, name: `${model.name} Fast` })
    }
  }
  return out
}

function cursorHarnessModels(cursorModels) {
  if (Array.isArray(cursorModels) && cursorModels.length > 0) return cursorModels
  return CURSOR_MODELS
}

function ollamaHarnessModels(ollamaModels) {
  if (Array.isArray(ollamaModels) && ollamaModels.length > 0) return ollamaModels
  return OLLAMA_MODELS
}

function kimiHarnessModels(kimiModels) {
  if (Array.isArray(kimiModels) && kimiModels.length > 0) return kimiModels
  return KIMI_MODELS
}

function copilotHarnessModels(copilotModels) {
  if (Array.isArray(copilotModels) && copilotModels.length > 0) return copilotModels
  return COPILOT_MODELS
}

function kiroHarnessModels(kiroModels) {
  if (Array.isArray(kiroModels) && kiroModels.length > 0) return kiroModels
  return KIRO_MODELS
}

function glmHarnessModels(glmModels) {
  if (Array.isArray(glmModels) && glmModels.length > 0) return glmModels
  return GLM_MODELS
}

export function buildProviders({ prefix, origin, loggedIn, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, glmModels }) {
  const providers = {}
  if (loggedIn.codex) {
    providers[`${prefix}-codex`] = {
      displayName: 'OAuth · ChatGPT Codex',
      api: HARNESS_RESPONSES_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      baseURL: `${origin}/codex/v1`,
      models: withPickerVariants(CODEX_MODELS).map(toHarnessModel),
    }
  }
  if (loggedIn.grok) {
    providers[`${prefix}-grok`] = {
      displayName: 'OAuth · Grok',
      api: HARNESS_RESPONSES_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      baseURL: `${origin}/grok/v1`,
      models: withPickerVariants(GROK_MODELS).map(toHarnessModel),
    }
  }
  if (loggedIn.glm) {
    providers[`${prefix}-glm`] = {
      displayName: 'OAuth · GLM',
      api: HARNESS_ANTHROPIC_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      // Anthropic SDK posts `{baseURL}/v1/messages`. Completions leftover
      // still lives at /glm/v1/chat/completions until the next sync.
      // Anthropic thinking is hop `thinking: { type: enabled }`, not
      // completions-only compat. DSH rejects `supportsReasoningEffort` /
      // `thinkingFormat` on this protocol and the whole atomic mutate dies.
      baseURL: `${origin}/glm`,
      models: glmHarnessModels(glmModels).map(toHarnessModel),
    }
  }
  if (loggedIn.kiro) {
    providers[`${prefix}-kiro`] = {
      displayName: 'OAuth · Kiro',
      api: HARNESS_COMPLETIONS_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      baseURL: `${origin}/kiro/v1`,
      compat: {
        supportsReasoningEffort: true,
        thinkingFormat: 'openai',
      },
      models: kiroHarnessModels(kiroModels).map(toHarnessModel),
    }
  }
  if (loggedIn.antigravity) {
    providers[`${prefix}-antigravity`] = {
      displayName: 'OAuth · Antigravity',
      api: HARNESS_COMPLETIONS_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      baseURL: `${origin}/antigravity/v1`,
      compat: {
        supportsReasoningEffort: true,
        thinkingFormat: 'openai',
      },
      models: ANTIGRAVITY_MODELS.map(toHarnessModel),
    }
  }
  if (loggedIn.cursor) {
    providers[`${prefix}-cursor`] = {
      displayName: 'OAuth · Cursor',
      api: HARNESS_COMPLETIONS_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      // Completions hop is /cursor/v1/chat/completions. DSH posts
      // `{baseURL}/v1/chat/completions`, so baseURL is `${origin}/cursor`.
      baseURL: `${origin}/cursor`,
      compat: {
        supportsReasoningEffort: true,
        thinkingFormat: 'openai',
      },
      models: cursorHarnessModels(cursorModels).map(toHarnessModel),
    }
  }
  if (loggedIn.ollama) {
    providers[`${prefix}-ollama`] = {
      displayName: 'OAuth · Ollama Cloud',
      api: HARNESS_COMPLETIONS_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      // Completions hop is /ollama/v1/chat/completions. DSH posts
      // `{baseURL}/v1/chat/completions`, so baseURL is `${origin}/ollama`.
      baseURL: `${origin}/ollama`,
      compat: {
        supportsReasoningEffort: true,
        thinkingFormat: 'openai',
      },
      models: ollamaHarnessModels(ollamaModels).map(toHarnessModel),
    }
  }
  if (loggedIn.kimi) {
    providers[`${prefix}-kimi`] = {
      displayName: 'OAuth · Kimi',
      api: HARNESS_COMPLETIONS_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      // Completions hop is /kimi/v1/chat/completions. DSH posts
      // `{baseURL}/v1/chat/completions`, so baseURL is `${origin}/kimi`.
      baseURL: `${origin}/kimi`,
      compat: {
        supportsReasoningEffort: true,
        thinkingFormat: 'openai',
      },
      models: kimiHarnessModels(kimiModels).map(toHarnessModel),
    }
  }
  if (loggedIn.copilot) {
    const copilotRows = copilotHarnessModels(copilotModels).map(toHarnessModel)
    const copilotHasEffort = copilotRows.some((model) => model.reasoningEfforts && typeof model.reasoningEfforts === 'object')
    providers[`${prefix}-copilot`] = {
      displayName: 'OAuth · GitHub Copilot',
      api: HARNESS_COMPLETIONS_API,
      apiKeyEnv: OAUTH_CREDENTIAL_REF,
      // Completions hop is /copilot/v1/chat/completions. DSH posts
      // `{baseURL}/v1/chat/completions`, so baseURL is `${origin}/copilot`.
      baseURL: `${origin}/copilot`,
      ...(copilotHasEffort ? {
        compat: {
          supportsReasoningEffort: true,
          thinkingFormat: 'openai',
        },
      } : {}),
      models: copilotRows,
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

export function catalogProviders({ prefix, origin, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, glmModels }) {
  const providers = buildProviders({
    prefix,
    origin,
    loggedIn: { codex: true, grok: true, glm: true, kiro: true, antigravity: true, cursor: true, ollama: true, kimi: true, copilot: true },
    cursorModels,
    ollamaModels,
    kiroModels,
    kimiModels,
    copilotModels,
    glmModels,
  })
  // OpenCode Go is API key, not OAuth: the picker lists only the supplemental
  // route this plugin writes; the controller decides locked vs usable from
  // OPENCODE_API_KEY. DSH serves the built-in `opencode-go` catalog itself.
  providers[OPENCODE_GO_EXTRA_ROUTE.id] = {
    displayName: OPENCODE_GO_EXTRA_ROUTE.displayName,
    api: OPENCODE_GO_EXTRA_ROUTE.api,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
    baseURL: OPENCODE_GO_EXTRA_ROUTE.baseURL,
    models: OPENCODE_GO_EXTRA_ROUTE.models.map(toHarnessModel),
  }
  return providers
}

export function catalogKeys(providers) {
  return Object.entries(providers).flatMap(([provider, value]) =>
    (value.models ?? []).map((model) => modelKey(provider, model.id)),
  )
}

export function familyOfProvider(provider) {
  if (String(provider).endsWith('-codex')) return 'codex'
  if (String(provider).endsWith('-grok')) return 'grok'
  if (String(provider).endsWith('-glm')) return 'glm'
  if (String(provider).endsWith('-kiro')) return 'kiro'
  if (String(provider).endsWith('-antigravity')) return 'antigravity'
  if (String(provider).endsWith('-cursor')) return 'cursor'
  if (String(provider).endsWith('-ollama')) return 'ollama'
  if (String(provider).endsWith('-kimi')) return 'kimi'
  if (String(provider).endsWith('-copilot')) return 'copilot'
  return String(provider)
}

export function familyOfKey(key) {
  const slash = String(key).indexOf('/')
  return familyOfProvider(slash === -1 ? key : key.slice(0, slash))
}

export function familyCatalogKeys(catalog, family) {
  return catalogKeys(catalog).filter((key) => familyOfKey(key) === family)
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
          enabled: enabled === null ? !isOptInKey(key) : enabled.has(key),
          fast: String(model.id).endsWith('-fast'),
          large: isLargeContextKey(key),
          input: Array.isArray(model.input) ? [...model.input] : ['text', 'image'],
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
 * Default is all-on except `-900k` (opt-in; it burns quota).
 * New non-opt-in catalog ids stay on. Explicit picker choices persist across
 * restarts so automatic recovery cannot mistake all-off for leftover settings.
 */
export class ModelSwitch {
  #selectionExplicit = false

  constructor({ path } = {}) {
    this.path = path
    this.disabled = new Set()
    this.enabled = new Set()
    this.ready = path ? this.load() : Promise.resolve()
  }

  async load() {
    const text = await readPrivateText(this.path, 'oauth-subs model settings', { allowBroadMode: true })
    if (text === undefined) return
    try {
      const raw = JSON.parse(text)
      const disabled = Array.isArray(raw?.disabled) ? raw.disabled : []
      const enabled = Array.isArray(raw?.enabled) ? raw.enabled : []
      this.disabled = new Set(disabled.filter((key) => typeof key === 'string' && key.includes('/')))
      this.enabled = new Set(enabled.filter((key) => typeof key === 'string' && key.includes('/')))
      this.#selectionExplicit = raw?.selectionExplicit === true
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        // Corrupt file: keep all-on rather than crash the proxy.
      }
    }
  }

  async save() {
    if (!this.path) return
    await writePrivateText(this.path, `${JSON.stringify({
      disabled: [...this.disabled].sort(),
      enabled: [...this.enabled].sort(),
      selectionExplicit: this.#selectionExplicit,
    })}\n`)
  }

  isEnabled(key) {
    if (this.disabled.has(key)) return false
    if (isOptInKey(key)) return this.enabled.has(key)
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
    this.enabled = new Set(known.filter((key) => enabled.has(key) && isOptInKey(key)))
    this.#selectionExplicit = true
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
      if (isOptInKey(key)) this.enabled.add(key)
    } else {
      this.enabled.delete(key)
      this.disabled.add(key)
    }
    this.#selectionExplicit = true
    await this.save()
    return this.status(catalog)
  }

  async setFamily(family, on, catalog) {
    if (!MODEL_FAMILY_IDS.includes(family)) throw new Error(`family must be one of ${MODEL_FAMILY_IDS.join(', ')}`)
    // Only current catalog ids. Retired leftovers (glm-4.7, …) stay in
    // `disabled` and are not resurrected.
    for (const key of familyCatalogKeys(catalog, family)) {
      if (on) {
        this.disabled.delete(key)
        if (isOptInKey(key)) this.enabled.add(key)
      } else {
        this.enabled.delete(key)
        this.disabled.add(key)
      }
    }
    this.#selectionExplicit = true
    await this.save()
    return this.status(catalog)
  }

  /**
   * Leftover 全关: every *current* catalog key for a signed-in family is
   * off (often after a catalog shrink left stale ids in `disabled`).
   * Enable the current keys so login/sync can write the DSH route.
   * Only unmarked settings need recovery; an explicit picker choice stays off.
   * Does not resurrect retired ids or opt-in `-900k` rows.
   */
  async recoverEmptyLoggedInFamilies(catalog, loggedIn) {
    if (this.#selectionExplicit) return false
    let changed = false
    for (const family of FAMILY_IDS) {
      if (!loggedIn?.[family]) continue
      const keys = familyCatalogKeys(catalog, family)
      if (keys.length === 0 || keys.some((key) => this.isEnabled(key))) continue
      for (const key of keys) this.disabled.delete(key)
      changed = true
    }
    if (changed) await this.save()
    return changed
  }

  async setAll(on, catalog) {
    const known = catalogKeys(catalog)
    if (on) {
      this.disabled = new Set()
      this.enabled = new Set(known.filter((key) => isOptInKey(key)))
    } else {
      this.disabled = new Set(known)
      this.enabled = new Set()
    }
    this.#selectionExplicit = true
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

/** `undefined` when the host has no readable settings.get; `{}` when the section is empty. */
export async function peekPiAiProviders(settings) {
  if (settings == null || typeof settings.get !== 'function') return undefined
  try {
    const raw = await settings.get('llm-pi-ai')
    if (raw == null || typeof raw !== 'object') return {}
    const providers = raw.providers
    if (providers == null || typeof providers !== 'object' || Array.isArray(providers)) return {}
    return providers
  } catch {
    return undefined
  }
}

export const OPENCODE_GO_API_KEY_ENV = 'OPENCODE_API_KEY'

function opencodeGoRouteValue(route, models) {
  return {
    displayName: route.displayName,
    apiKeyEnv: OPENCODE_GO_API_KEY_ENV,
    api: route.api,
    baseURL: route.baseURL,
    headers: { ...route.headers },
    models,
  }
}

/** The catalog route profile this plugin writes: enabling key + session header. */
function opencodeGoBuiltinValue() {
  return { apiKeyEnv: OPENCODE_GO_API_KEY_ENV, headers: opencodeGoSessionHeaders() }
}

/** A route this plugin owns: same key env, protocol, origin, and only catalog ids. */
function isOwnedOpencodeGoRoute(route, existing) {
  if (existing == null || typeof existing !== 'object') return false
  if (existing.apiKeyEnv !== OPENCODE_GO_API_KEY_ENV) return false
  if (existing.api !== route.api || existing.baseURL !== route.baseURL) return false
  const known = new Set(route.models.map((model) => model.id))
  const models = existing.models
  if (!Array.isArray(models) || models.length === 0) return false
  return models.every((model) => known.has(model?.id))
}

/**
 * The catalog-enabling profile this plugin wrote, in either shape: apiKeyEnv
 * alone (pre-session release) or apiKeyEnv + the session header. Any extra
 * user field means the profile is not ours.
 */
function isPluginOpencodeGoBuiltin(existing) {
  if (existing == null || typeof existing !== 'object') return false
  if (existing.apiKeyEnv !== OPENCODE_GO_API_KEY_ENV) return false
  const keys = Object.keys(existing)
  if (keys.length === 1) return true
  if (keys.length !== 2 || existing.headers == null || typeof existing.headers !== 'object') return false
  const headerKeys = Object.keys(existing.headers)
  return headerKeys.length === 1 && existing.headers[OPENCODE_GO_SESSION_HEADER] === OPENCODE_GO_SESSION_ID
}

function sameOpencodeGoHeaders(existing, route) {
  const headers = existing?.headers
  if (headers == null || typeof headers !== 'object') return false
  const keys = Object.keys(headers)
  return keys.length === 1 && headers[OPENCODE_GO_SESSION_HEADER] === route.headers?.[OPENCODE_GO_SESSION_HEADER]
}

function sameOpencodeGoRoute(route, existing, models) {
  if (existing.displayName !== route.displayName) return false
  if (existing.api !== route.api || existing.baseURL !== route.baseURL) return false
  if (existing.apiKeyEnv !== OPENCODE_GO_API_KEY_ENV) return false
  if (!sameOpencodeGoHeaders(existing, route)) return false
  return Array.isArray(existing.models)
    && existing.models.length === models.length
    && existing.models.every((model, index) => model?.id === models[index]?.id)
}

/**
 * Ensure OpenCode Go is configured while only supplying what the installed
 * catalog lacks.
 *
 * DSH's built-in `opencode-go` catalog provider carries the other 27 official
 * models. A profile naming no `api` and no `models` reuses that provider
 * (ambient auth + per-model protocol/compat/thinking ladder); a non-empty
 * `models` list would replace the whole catalog, so the missing
 * `deepseek-flash` lives on its own supplemental route that follows the
 * picker (`selected` undefined = all). Both routes carry the required
 * `x-opencode-session` header (see `opencodeGoSessionHeaders`). An existing
 * user-configured route is never overwritten, and without
 * `OPENCODE_API_KEY` nothing is served: the plugin's own routes are unset so
 * DSH's model list stays clean.
 */
export async function ensureOpencodeGoRoute(settings, { selected, apiKeySet = true } = {}) {
  if (settings == null || typeof settings.mutate !== 'function') return { status: 'unavailable' }
  const providers = await peekPiAiProviders(settings)
  if (providers === undefined) return { status: 'unreadable' }
  const locked = apiKeySet === false
  const selection = selected === undefined ? null : new Set(selected)
  const mutations = []
  const routes = []

  // Built-in catalog route: fill it in when absent, refresh the plugin's own
  // older shape, and with no key take back what this plugin wrote — never a
  // user-shaped profile.
  const builtin = providers[OPENCODE_GO_BUILTIN_ROUTE_ID]
  if (!locked && builtin === undefined) {
    mutations.push({ op: 'set', path: ['providers', OPENCODE_GO_BUILTIN_ROUTE_ID], value: opencodeGoBuiltinValue() })
    routes.push(OPENCODE_GO_BUILTIN_ROUTE_ID)
  } else if (!locked && isPluginOpencodeGoBuiltin(builtin)) {
    // Refresh the pre-session shape (apiKeyEnv only) with the required header.
    if (Object.keys(builtin).length === 1) {
      mutations.push({ op: 'set', path: ['providers', OPENCODE_GO_BUILTIN_ROUTE_ID], value: opencodeGoBuiltinValue() })
      routes.push(OPENCODE_GO_BUILTIN_ROUTE_ID)
    }
  } else if (locked && isPluginOpencodeGoBuiltin(builtin)) {
    mutations.push({ op: 'unset', path: ['providers', OPENCODE_GO_BUILTIN_ROUTE_ID] })
    routes.push(OPENCODE_GO_BUILTIN_ROUTE_ID)
  }

  // Supplemental route: the model(s) the installed catalog lacks.
  const route = OPENCODE_GO_EXTRA_ROUTE
  const models = locked
    ? []
    : selection === null
      ? route.models
      : route.models.filter((model) => selection.has(`${route.id}/${model.id}`))
  const existing = providers[route.id]
  if (existing === undefined) {
    if (models.length > 0) {
      mutations.push({ op: 'set', path: ['providers', route.id], value: opencodeGoRouteValue(route, models) })
      routes.push(route.id)
    }
  } else if (isOwnedOpencodeGoRoute(route, existing)) {
    if (models.length === 0) {
      mutations.push({ op: 'unset', path: ['providers', route.id] })
      routes.push(route.id)
    } else if (!sameOpencodeGoRoute(route, existing, models)) {
      mutations.push({ op: 'set', path: ['providers', route.id], value: opencodeGoRouteValue(route, models) })
      routes.push(route.id)
    }
  }

  if (mutations.length === 0) return { status: 'present' }
  try {
    await settings.mutate('llm-pi-ai', mutations)
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
  return { status: 'written', routes }
}

async function assertPersistedProviders(settings, expectedIds) {
  const providers = await peekPiAiProviders(settings)
  if (providers === undefined) return
  for (const id of expectedIds) {
    const row = providers[id]
    if (!row || !Array.isArray(row.models) || row.models.length === 0) {
      throw new Error(`llm-pi-ai did not persist providers.${id}`)
    }
  }
}

export async function syncHarnessModels({ settings, prefix, origin, loggedIn, selected, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, glmModels }) {
  const routePrefix = String(prefix ?? '').trim()
  if (!routePrefix) throw new Error('Harness route prefix cannot be empty')
  const providers = filterProviders(buildProviders({
    prefix: routePrefix, origin, loggedIn, cursorModels, ollamaModels, kiroModels, kimiModels, copilotModels, glmModels,
  }), selected)
  for (const [id, value] of Object.entries(providers)) {
    assertDshServiceableProvider(id, value)
  }
  const owned = ownedProviderIds(routePrefix)
  try {
    await settings.mutate('llm-pi-ai', [
      ...owned.map((provider) => ({ op: 'unset', path: ['providers', provider] })),
      ...Object.entries(providers).map(([provider, value]) => ({
        op: 'set', path: ['providers', provider], value,
      })),
    ])
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`llm-pi-ai mutate failed: ${detail}`)
  }
  await assertPersistedProviders(settings, Object.keys(providers))
  return {
    routes: Object.entries(providers).map(([provider, value]) => ({
      provider,
      api: value.api,
      models: value.models.map((model) => model.id),
    })),
  }
}
