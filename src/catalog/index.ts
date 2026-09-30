/**
 * Unified model catalog — one JSON, one row shape, every family.
 *
 * `src/catalog/models.json` holds the static catalog rows for all families
 * (structure mirrors CLIProxyAPI `internal/registry/models/models.json`:
 * one top-level family key → flat array of model rows). A row keeps the
 * exact in-memory shape `toHarnessModel` consumes, so JSON row = catalog
 * row = DSH route row with no mapping layer. Family route metadata (api
 * protocol / baseURL / displayName / route compat) stays in
 * `src/oauth/models.ts` `buildProviders`.
 *
 * Validation runs once at module load and throws on the first bad row —
 * the same fail-early contract as `assertDshServiceableProvider`: a broken
 * catalog must fail here, not silently keep the last good settings write.
 * Family-specific extras (`variants` / `defaultUid` on Devin, `compat` on
 * OpenCode Go, `fastTier` on Codex) pass through untouched; only the
 * DSH-gating fields (closed-set effort keys, input kinds, numeric floors)
 * are checked.
 *
 * This module must not import any family module or `src/oauth/models.ts`:
 * those import the families, which import this loader — a cycle. The
 * closed-set literals below are local copies kept in sync by tests.
 *
 * The JSON is read via `readFileSync` rather than a JSON import: the project
 * compiles with `module: node16`, where import attributes (`with {
 * type: 'json' }`) are a compile error, and the fs read also sidesteps any
 * import-attribute support gap in the host's bundled Node.
 */

import { readFileSync } from 'node:fs'

/** Mirrors DSH_THINKING_LEVELS (src/oauth/models.ts); vendor spellings are values, never keys. */
export const CATALOG_EFFORT_KEYS = Object.freeze(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

const INPUT_KINDS = Object.freeze(['text', 'image'])

/**
 * Every top-level key the JSON must carry, nothing more. `ollamaRetired`
 * is a flat array of retired model ids, not rows; OpenCode Go is split per
 * wire-protocol route (`opencode-go-flash` completions + `opencode-go-responses`).
 */
export const CATALOG_KEYS = Object.freeze([
  'codex', 'chatgpt', 'grok', 'glm', 'kiro', 'antigravity', 'cursor', 'kimi', 'copilot', 'devin', 'cline',
  'ollama', 'ollamaRetired', 'command-code', 'opencode-go-flash', 'opencode-go-responses',
])

const RETIRED_KEY = 'ollamaRetired'

const data: Record<string, any> = JSON.parse(readFileSync(new URL('./models.json', import.meta.url), 'utf8'))

function fail(key: string, detail: string): never {
  throw new Error(`catalog models.json "${key}": ${detail}`)
}

function positiveInteger(value: any) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateRows(key: string, rows: any) {
  if (!Array.isArray(rows) || rows.length === 0) fail(key, 'must be a non-empty array of model rows')
  const ids = new Set<string>()
  for (const row of rows) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) fail(key, 'every row must be an object')
    if (typeof row.id !== 'string' || !row.id.trim()) fail(key, 'row id must be a non-empty string')
    if (ids.has(row.id)) fail(key, `duplicate model id "${row.id}"`)
    ids.add(row.id)
    if (typeof row.name !== 'string' || !row.name.trim()) fail(key, `model "${row.id}" name must be a non-empty string`)
    if (!positiveInteger(row.contextWindow)) fail(key, `model "${row.id}" contextWindow must be a positive integer`)
    if (row.maxTokens !== undefined && !positiveInteger(row.maxTokens)) {
      fail(key, `model "${row.id}" maxTokens must be a positive integer`)
    }
    if (row.input !== undefined) {
      if (!Array.isArray(row.input) || row.input.length === 0 || row.input.some((kind: any) => !INPUT_KINDS.includes(kind))) {
        fail(key, `model "${row.id}" input must be a non-empty subset of text|image`)
      }
    }
    const efforts = row.reasoningEfforts
    if (efforts !== undefined && efforts !== false) {
      if (efforts == null || typeof efforts !== 'object' || Array.isArray(efforts)) {
        fail(key, `model "${row.id}" reasoningEfforts must be a level→wire mapping or false`)
      }
      const levels = Object.keys(efforts)
      if (levels.length === 0) {
        fail(key, `model "${row.id}" has an empty reasoningEfforts; declare the levels or set false for a non-reasoning model`)
      }
      for (const level of levels) {
        if (!CATALOG_EFFORT_KEYS.includes(level)) {
          fail(key, `model "${row.id}" reasoningEfforts key "${level}" is not ${CATALOG_EFFORT_KEYS.join('|')} (vendor spelling belongs in the value)`)
        }
        const wire = efforts[level]
        if (wire !== null && (typeof wire !== 'string' || !wire)) {
          fail(key, `model "${row.id}" reasoningEfforts["${level}"] must be a vendor spelling string or null`)
        }
      }
    }
    if (row.maxContextWindow !== undefined && !positiveInteger(row.maxContextWindow)) {
      fail(key, `model "${row.id}" maxContextWindow must be a positive integer`)
    }
    if (row.fastTier !== undefined && typeof row.fastTier !== 'boolean') {
      fail(key, `model "${row.id}" fastTier must be a boolean`)
    }
    if (row.variants !== undefined) {
      if (row.variants == null || typeof row.variants !== 'object' || Array.isArray(row.variants)
        || Object.values(row.variants).some((uid: any) => typeof uid !== 'string' || !uid)) {
        fail(key, `model "${row.id}" variants must map effort levels to backend uid strings`)
      }
    }
    if (row.defaultUid !== undefined && (typeof row.defaultUid !== 'string' || !row.defaultUid)) {
      fail(key, `model "${row.id}" defaultUid must be a non-empty string`)
    }
    if (row.compat !== undefined && (row.compat == null || typeof row.compat !== 'object' || Array.isArray(row.compat))) {
      fail(key, `model "${row.id}" compat must be an object`)
    }
  }
}

function validateRetired(ids: any) {
  if (!Array.isArray(ids) || ids.length === 0) fail(RETIRED_KEY, 'must be a non-empty array of retired model ids')
  const seen = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || !id.trim()) fail(RETIRED_KEY, 'every retired id must be a non-empty string')
    if (seen.has(id)) fail(RETIRED_KEY, `duplicate retired id "${id}"`)
    seen.add(id)
  }
}

/**
 * Throws on the first rule a catalog object breaks. The loader runs it on the
 * shipped JSON; `scripts/models.ts` runs it on the merged catalog before it
 * writes, so a refresh can never produce a file this loader would reject.
 */
export function assertCatalog(catalog: Record<string, any>) {
  const unknown = Object.keys(catalog).filter((key) => !CATALOG_KEYS.includes(key))
  if (unknown.length > 0) fail(unknown[0], 'unknown top-level key (expected exactly the CATALOG_KEYS set)')
  for (const key of CATALOG_KEYS) {
    if (catalog[key] === undefined) fail(key, 'missing top-level key')
  }
  for (const key of CATALOG_KEYS) {
    if (key === RETIRED_KEY) continue
    validateRows(key, catalog[key])
  }
  validateRetired(catalog[RETIRED_KEY])
}

const ROWS: Record<string, readonly any[]> = {}

{
  assertCatalog(data)
  for (const key of CATALOG_KEYS) {
    const rows = data[key]
    // Freeze each row and its input array; nested effort/variant/compat maps
    // stay plain because consumers only ever spread-copy them.
    ROWS[key] = Object.freeze(rows.map((row: any) => {
      if (row.input !== undefined) Object.freeze(row.input)
      return Object.freeze(row)
    }))
  }
}

/** The frozen static rows for one top-level key (`'codex'`, `'ollamaRetired'`, …). */
export function catalogRows(key: string): readonly any[] {
  const rows = ROWS[key]
  if (rows === undefined) throw new Error(`catalog models.json has no key "${key}" (expected one of ${CATALOG_KEYS.join(', ')})`)
  return rows
}
/*
 * Per-model billing rates — display-only, never ride in a route row.
 *
 * `src/catalog/rates.json` is keyed by family then model id (same keys as
 * models.json rows; a family that grows `-fast` twins at runtime may also key
 * `<id>-fast`). A rate entry carries USD-per-1M-token prices for the model's
 * primary upstream: `in` / `out` are mandatory; `cacheRead` appears when
 * the source prices cache hits (absent ≠ free);
 * `cacheWrite` / `cacheWrite1h` appear when the upstream prices cache writes;
 * `tod.peak` / `tod.offPeak` describe scheduled peak/off-peak bands that use
 * the shared `timeOfDay` schedule; `tierThreshold` / `tiers` describe an
 * above-threshold context tier. The top-level `timeOfDay` block holds the
 * shared schedule (effectiveFrom, peakWindowsUtc, peakDaysUtc,
 * offPeakDatesUtc) that the `tod` bands refer to.
 *
 * The numbers mirror the upstream pricing tables attributed in
 * docs/models.md (Command Code `command-code@1.72.2` kD/lD/xD/CD/bD/ED/TD/MD
 * display-rates; every other family via `npm run rates`) — never invent them.
 */

export interface CatalogRateBand { in: number; out: number; cacheRead?: number }

export interface CatalogRate {
  in: number
  out: number
  cacheRead?: number
  cacheWrite?: number
  cacheWrite1h?: number
  tierThreshold?: number
  tiers?: CatalogRateBand[]
  tod?: { peak: CatalogRateBand; offPeak: CatalogRateBand }
}

export interface CatalogRateTimeOfDay {
  effectiveFrom: string
  peakWindowsUtc: readonly (readonly [number, number])[]
  peakDaysUtc: readonly number[]
  offPeakDatesUtc: readonly string[]
}

const rateData: Record<string, any> = JSON.parse(readFileSync(new URL('./rates.json', import.meta.url), 'utf8'))

function failRate(detail: string): never {
  throw new Error(`catalog rates.json: ${detail}`)
}

function rateNumber(row: any, id: string, field: string, optional = false) {
  const value = row[field]
  if (value === undefined) {
    if (!optional) failRate(`"${id}" missing required rate field "${field}"`)
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    failRate(`"${id}" rate field "${field}" must be a non-negative finite number`)
  }
  return value
}

function validateBand(value: any, id: string, label: string): CatalogRateBand {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    failRate(`"${id}" ${label} must be an object`)
  }
  const band: CatalogRateBand = {
    in: rateNumber(value, `${id}.${label}`, 'in')!,
    out: rateNumber(value, `${id}.${label}`, 'out')!,
  }
  const cacheRead = rateNumber(value, `${id}.${label}`, 'cacheRead', true)
  if (cacheRead !== undefined) band.cacheRead = cacheRead
  return Object.freeze(band)
}

function validateRate(id: string, row: any): CatalogRate {
  if (row == null || typeof row !== 'object' || Array.isArray(row)) failRate(`"${id}" must be an object`)
  const rate: CatalogRate = {
    in: rateNumber(row, id, 'in')!,
    out: rateNumber(row, id, 'out')!,
  }
  const cacheRead = rateNumber(row, id, 'cacheRead', true)
  if (cacheRead !== undefined) rate.cacheRead = cacheRead
  const cacheWrite = rateNumber(row, id, 'cacheWrite', true)
  if (cacheWrite !== undefined) rate.cacheWrite = cacheWrite
  const cacheWrite1h = rateNumber(row, id, 'cacheWrite1h', true)
  if (cacheWrite1h !== undefined) rate.cacheWrite1h = cacheWrite1h
  if (row.tierThreshold !== undefined) {
    if (!positiveInteger(row.tierThreshold)) failRate(`"${id}" tierThreshold must be a positive integer`)
    rate.tierThreshold = row.tierThreshold
  }
  if (row.tiers !== undefined) {
    if (!Array.isArray(row.tiers) || row.tiers.length === 0) failRate(`"${id}" tiers must be a non-empty array of rate bands`)
    rate.tiers = row.tiers.map((band: any, i: number) => validateBand(band, id, `tiers[${i}]`))
  }
  const peak = row['tod.peak']
  const offPeak = row['tod.offPeak']
  if (peak !== undefined || offPeak !== undefined) {
    if (peak === undefined || offPeak === undefined) failRate(`"${id}" must carry both tod.peak and tod.offPeak`)
    rate.tod = Object.freeze({
      peak: validateBand(peak, id, 'tod.peak'),
      offPeak: validateBand(offPeak, id, 'tod.offPeak'),
    })
  }
  return Object.freeze(rate)
}

const RATES: Record<string, Record<string, CatalogRate>> = {}
let RATE_TOD: CatalogRateTimeOfDay | undefined

{
  const tod = rateData.timeOfDay
  if (tod != null) {
    if (typeof tod !== 'object' || Array.isArray(tod)) failRate('"timeOfDay" must be an object')
    if (typeof tod.effectiveFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tod.effectiveFrom)) {
      failRate('"timeOfDay.effectiveFrom" must be a YYYY-MM-DD string')
    }
    if (!Array.isArray(tod.peakWindowsUtc) || tod.peakWindowsUtc.length === 0
      || tod.peakWindowsUtc.some((w: any) => !Array.isArray(w) || w.length !== 2 || w.some((v: any) => !Number.isInteger(v) || v < 0 || v > 24))) {
      failRate('"timeOfDay.peakWindowsUtc" must be a non-empty array of [startHour, endHour] pairs')
    }
    if (!Array.isArray(tod.peakDaysUtc) || tod.peakDaysUtc.length === 0
      || tod.peakDaysUtc.some((d: any) => !Number.isInteger(d) || d < 0 || d > 6)) {
      failRate('"timeOfDay.peakDaysUtc" must be a non-empty array of 0–6 weekday numbers')
    }
    if (tod.offPeakDatesUtc !== undefined && (!Array.isArray(tod.offPeakDatesUtc)
      || tod.offPeakDatesUtc.some((d: any) => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)))) {
      failRate('"timeOfDay.offPeakDatesUtc" must be an array of YYYY-MM-DD strings')
    }
    RATE_TOD = Object.freeze({
      effectiveFrom: tod.effectiveFrom,
      peakWindowsUtc: Object.freeze(tod.peakWindowsUtc.map((w: any) => Object.freeze([w[0], w[1]]))),
      peakDaysUtc: Object.freeze([...tod.peakDaysUtc]),
      offPeakDatesUtc: Object.freeze([...(tod.offPeakDatesUtc ?? [])]),
    })
  }
  for (const key of Object.keys(rateData)) {
    if (key === 'timeOfDay') continue
    if (!CATALOG_KEYS.includes(key)) failRate(`unknown family key "${key}" (expected a CATALOG_KEYS member)`)
    const rows = rateData[key]
    if (rows == null || typeof rows !== 'object' || Array.isArray(rows)) failRate(`"${key}" must be an object keyed by model id`)
    const catalogIds = new Set((ROWS[key] ?? []).map((row: any) => row.id))
    const table: Record<string, CatalogRate> = {}
    for (const [id, row] of Object.entries(rows)) {
      // `<id>-fast` is a runtime twin of a catalog row (Codex fastTier, Cursor live Fast).
      const base = id.endsWith('-fast') ? id.slice(0, -5) : undefined
      if (!catalogIds.has(id) && !(base && catalogIds.has(base))) failRate(`"${key}" rate id "${id}" has no matching models.json row`)
      table[id] = validateRate(`${key}/${id}`, row)
    }
    RATES[key] = Object.freeze(table)
  }
}

/** The frozen billing-rate row for `<family>/<model id>`, or undefined when the family ships no rate table for it. */
export function catalogRate(key: string): CatalogRate | undefined {
  const slash = key.indexOf('/')
  const family = slash === -1 ? key : key.slice(0, slash)
  const id = slash === -1 ? '' : key.slice(slash + 1)
  return RATES[family]?.[id]
}

/** The shared peak/off-peak schedule a rate row's `tod` band refers to, when rates.json declares one. */
export function catalogRateTimeOfDay(): CatalogRateTimeOfDay | undefined {
  return RATE_TOD
}

/** The whole frozen rate table for one family keyed by model id, or undefined when the family has none. */
export function catalogRateTable(family: string): Record<string, CatalogRate> | undefined {
  return RATES[family]
}

/**
 * Every rates.json row keyed `<family>/<model id>` — the Models-tab
 * `pricing` map for `describeCatalog`. Display-only; never a route field.
 */
export function catalogPricing(): Record<string, CatalogRate> {
  const out: Record<string, CatalogRate> = {}
  for (const [family, table] of Object.entries(RATES)) {
    for (const [id, rate] of Object.entries(table)) out[`${family}/${id}`] = rate
  }
  return out
}
