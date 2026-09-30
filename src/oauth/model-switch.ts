/**
 * Persisted Settings picker state: which catalog keys are on, per-model
 * context-window overrides, and per-family default reasoning effort.
 */

import { errorCode } from '../utils/http.js'
import { readPrivateText, writePrivateText } from './store.js'
import {
  catalogKeys,
  FAMILY_IDS,
  familyCatalogKeys,
  familyOfKey,
  isOptInKey,
  maxContextOfRow,
  MODEL_CONTEXT_MAX,
  MODEL_CONTEXT_MIN,
  MODEL_FAMILY_IDS,
} from './models.js'

/** Look up the catalog row behind a `provider/id` key. */
function findCatalogRow(catalog: Record<string, any>, key: string) {
  const slash = key.indexOf('/')
  if (slash <= 0) return undefined
  const rows = catalog?.[key.slice(0, slash)]?.models
  if (!Array.isArray(rows)) return undefined
  const id = key.slice(slash + 1)
  return rows.find((model) => model?.id === id)
}

/** Levels the Models page offers as a family's default effort. */
export const DEFAULT_EFFORT_LEVELS = Object.freeze(['off', 'low', 'medium', 'high', 'xhigh', 'max'])

function assertKeyList(keys, label) {
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must be an array of model keys`)
  }
}

/** Keep only in-bounds context overrides from a persisted/untrusted map. */
function validContextEntries(raw) {
  const out: Record<string, number> = {}
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw)) {
    const tokens = Number(value)
    if (!key.includes('/') || !Number.isInteger(tokens) || tokens < MODEL_CONTEXT_MIN || tokens > MODEL_CONTEXT_MAX) continue
    out[key] = tokens
  }
  return out
}

/**
 * Persisted enable/disable set for the Settings picker.
 * Default is all-on except context variants (`-900k` / `-1m`; opt-in, they
 * burn quota).
 * New non-opt-in catalog ids stay on. Explicit picker choices persist across
 * restarts so automatic recovery cannot mistake all-off for leftover settings.
 */
export class ModelSwitch {
  #selectionExplicit = false
  declare path: string | undefined
  declare disabled: Set<string>
  declare enabled: Set<string>
  declare contexts: Record<string, number>
  declare efforts: Record<string, string>
  declare ready: Promise<any>

  constructor({ path }: any = {}) {
    this.path = path
    this.disabled = new Set()
    this.enabled = new Set()
    this.contexts = {}
    this.efforts = {}
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
      this.contexts = validContextEntries(raw?.contexts)
      this.efforts = Object.fromEntries(Object.entries(raw?.efforts ?? {})
        .filter(([family, level]) => MODEL_FAMILY_IDS.includes(family) && DEFAULT_EFFORT_LEVELS.includes(level as string))) as Record<string, string>
      this.#selectionExplicit = raw?.selectionExplicit === true
    } catch (error) {
      if (error && errorCode(error) !== 'ENOENT') {
        // Corrupt file: keep all-on rather than crash the proxy.
      }
    }
  }

  async save() {
    if (!this.path) return
    await writePrivateText(this.path, `${JSON.stringify({
      disabled: [...this.disabled].sort(),
      enabled: [...this.enabled].sort(),
      contexts: Object.fromEntries(Object.entries(this.contexts).sort(([a], [b]) => a.localeCompare(b))),
      selectionExplicit: this.#selectionExplicit,
      ...(Object.keys(this.efforts).length ? { efforts: Object.fromEntries(Object.entries(this.efforts).sort(([a], [b]) => a.localeCompare(b))) } : {}),
    })}\n`)
  }

  /**
   * Default effort per family (`null` clears); `withDefaultEffort` writes it
   * at sync. No `families` means every family: the 全部 control unifies
   * whatever single families were set to.
   */
  async setEffort(level, families: readonly string[] = MODEL_FAMILY_IDS) {
    const next = level === null || level === undefined || level === '' ? undefined : level
    if (next !== undefined && !DEFAULT_EFFORT_LEVELS.includes(next)) {
      throw new Error(`effort must be one of ${DEFAULT_EFFORT_LEVELS.join('|')}`)
    }
    if (!Array.isArray(families) || families.length === 0 || families.some((family) => !MODEL_FAMILY_IDS.includes(family))) {
      throw new Error('effort families must be model family ids')
    }
    const efforts = { ...this.efforts }
    for (const family of families) {
      if (next === undefined) delete efforts[family]
      else efforts[family] = next
    }
    if (JSON.stringify(efforts) === JSON.stringify(this.efforts)) return
    this.efforts = efforts
    await this.save()
  }

  isEnabled(key) {
    if (this.disabled.has(key)) return false
    if (isOptInKey(key)) return this.enabled.has(key)
    return true
  }

  /** The custom input-context window for a key, or undefined (catalog default). */
  contextOf(key) {
    return this.contexts[key]
  }

  /**
   * Set (or reset with `null`) a per-model input-context window. The catalog
   * must be an un-overridden build: the row's own maximum (`maxContextWindow`
   * ceiling, else its window) caps the value. Not an enable choice:
   * `selectionExplicit` stays untouched so all-off recovery semantics are
   * unaffected. Unknown keys throw so the RPC surfaces them.
   */
  async setContext(key, tokens, catalog) {
    if (typeof key !== 'string' || !key.includes('/')) {
      throw new Error('model key is required')
    }
    const known = new Set(catalogKeys(catalog))
    if (!known.has(key)) throw new Error(`unknown model ${key}`)
    if (tokens === null || tokens === undefined) {
      if (this.contexts[key] !== undefined) {
        const next = { ...this.contexts }
        delete next[key]
        this.contexts = next
        await this.save()
      }
      return
    }
    const window = Number(tokens)
    const row = findCatalogRow(catalog, key)
    const max = row ? maxContextOfRow(row, familyOfKey(key)) : MODEL_CONTEXT_MAX
    if (!Number.isInteger(window) || window < MODEL_CONTEXT_MIN || window > max) {
      throw new Error(`context window must be an integer between ${MODEL_CONTEXT_MIN} and ${max}`)
    }
    if (this.contexts[key] === window) return
    this.contexts = { ...this.contexts, [key]: window }
    await this.save()
  }

  /** Clear every custom input-context override at once (恢复默认). */
  async resetContexts() {
    if (Object.keys(this.contexts).length === 0) return
    this.contexts = {}
    await this.save()
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
   * Does not resurrect retired ids or opt-in context variants.
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
