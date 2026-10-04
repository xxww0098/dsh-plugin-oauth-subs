#!/usr/bin/env node
/**
 * Price table refresh: every catalog family except command-code gets its
 * src/catalog/rates.json rows (Models-tab price tooltip, USD per 1M tokens)
 * from the source recorded per family below.
 *
 *   npm run build && npm run rates            # dry run: counts + ids with no source
 *   npm run rates -- --write                  # rewrite src/catalog/rates.json
 *
 * Display-only numbers, never route fields. A row whose source has no price
 * stays without a coin; nothing is invented or borrowed from another model.
 * A row its family's source does not price falls back to the vendor list
 * price of the same model (vendorIndex). command-code keeps its hand-copied
 * CLI bundle table (manual). The sources
 * and per-family mapping rules are documented in docs/models.md 费率表.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG_KEYS, catalogRows } from '../lib/catalog/index.js'
import { CLINE_RECOMMENDED_MODELS_URL } from '../lib/oauth/cline/index.js'
import { configureOutbound, outboundFetch, outboundProxyPath } from '../lib/utils/outbound.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RATES_PATH = join(ROOT, 'src/catalog/rates.json')
const DATA_DIR = `${process.env.HOME}/.dsh/profiles/desktop/data/dsh-plugin-oauth-subs`
const TIMEOUT_MS = 60_000
const write = process.argv.includes('--write')

const MODELS_DEV_URL = 'https://models.dev/api.json'
const CURSOR_PRICING_URL = 'https://cursor.com/docs/models-and-pricing.md'
const DEVIN_PRICING_URL = 'https://docs.devin.ai/desktop/models.md'
/** Devin publishes one table per plan; the Pro rows are what a subscriber sees. */
const DEVIN_TIER = 'TEAMS_TIER_PRO'

async function getText(url) {
  const response = await outboundFetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const text = await response.text()
  if (!response.ok) throw new Error(`GET ${url} → HTTP ${response.status}`)
  return text
}

// ── rate rows ─────────────────────────────────────────────────────────────

const num = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined)

/** A rates.json row; `cacheRead` / `cacheWrite` only when the source prices them. */
function rateRow({ input, output, cacheRead, cacheWrite }: any, tier?: any) {
  if (num(input) === undefined || num(output) === undefined) return undefined
  const row: any = { in: input, out: output }
  if (num(cacheRead) !== undefined) row.cacheRead = cacheRead
  // A zero write price means "not billed", not a line worth showing.
  if (num(cacheWrite)) row.cacheWrite = cacheWrite
  if (tier) {
    // Some registries write the boundary as "first token over" (272001).
    row.tierThreshold = tier.size % 1000 === 1 ? tier.size - 1 : tier.size
    row.tiers = [{ in: tier.input, out: tier.output, ...(num(tier.cache_read) !== undefined ? { cacheRead: tier.cache_read } : {}) }]
  }
  return row
}

/** models.dev `cost` → rate row. Only a single context tier is expressible. */
function fromModelsDev(model) {
  const cost = model?.cost
  if (!cost) return undefined
  const tiers = Array.isArray(cost.tiers) ? cost.tiers.filter((t) => t?.tier?.type === 'context') : []
  const tier = tiers.length === 1 && num(tiers[0].input) !== undefined && num(tiers[0].output) !== undefined
    ? { ...tiers[0], size: tiers[0].tier.size }
    : undefined
  return rateRow({ input: cost.input, output: cost.output, cacheRead: cost.cache_read, cacheWrite: cost.cache_write }, tier)
}

// ── sources ───────────────────────────────────────────────────────────────

let dev
function bucket(name) {
  const models = dev?.[name]?.models
  if (!models) throw new Error(`models.dev has no "${name}" bucket`)
  return models
}
const devRate = (name, id) => fromModelsDev(bucket(name)[id])

/** cursor.com docs pricing tables: display name → row ("-" = not priced).
    The notes cell may also state a fast multiplier for variants the table
    prices only in prose ("Fast mode is available at 2x pricing"). */
function parseCursorTable(markdown) {
  const money = (cell) => (/^\$\d/.test(cell) ? Number(cell.slice(1)) : undefined)
  const rows = new Map()
  const fastX = new Map()
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (cells.length < 6 || money(cells[2]) === undefined) continue
    const name = cells[0].replace(/^\[([^\]]+)\]\([^)]*\)$/, '$1')
    rows.set(name, rateRow({ input: money(cells[2]), cacheWrite: money(cells[3]), cacheRead: money(cells[4]), output: money(cells[5]) }))
    const stated = /fast mode is available at (\d+(?:\.\d+)?)x pricing/i.exec(cells.slice(6).join(' '))
    if (stated) fastX.set(name, Number(stated[1]))
  }
  return { rows, fastX }
}

/** docs.devin.ai `modelCostData` (the page's per-uid cost table), one plan tier. */
function parseDevinTable(markdown) {
  const start = markdown.indexOf('[', markdown.indexOf('export const modelCostData'))
  if (start === -1) throw new Error('Devin models page has no modelCostData table')
  let depth = 0
  let end = start
  for (; end < markdown.length; end++) {
    if (markdown[end] === '[') depth++
    else if (markdown[end] === ']' && --depth === 0) break
  }
  const rows = new Map()
  for (const entry of JSON.parse(markdown.slice(start, end + 1))) {
    if (entry.tier !== DEVIN_TIER) continue
    rows.set(entry.model_uid, rateRow({
      input: entry.input_cost_per_million_usd,
      output: entry.output_cost_per_million_usd,
      cacheRead: entry.cache_read_cost_per_million_usd,
      cacheWrite: entry.cache_write_cost_per_million_usd,
    }))
  }
  return rows
}

const BEDROCK_REGION = /^(global|us|eu|jp|au|apac|in)\./
/** Bedrock id → Kiro row spelling: `global.anthropic.claude-opus-4-5-20251101-v1:0` → `claude-opus-4-5`. */
const bedrockKey = (id) => String(id).toLowerCase()
  .replace(BEDROCK_REGION, '').replace(/^[a-z0-9-]+\./, '')
  .replace(/-v\d+(:\d+)?$/, '').replace(/-\d{8}$/, '').replace(/[._]/g, '-')

function bedrockIndex() {
  const index = new Map()
  const models = bucket('amazon-bedrock')
  // Global (list-price) endpoints first; regional ones carry surcharges.
  for (const id of Object.keys(models).filter((id) => id.startsWith('global.'))) index.set(bedrockKey(id), id)
  for (const id of Object.keys(models).filter((id) => !BEDROCK_REGION.test(id))) {
    if (!index.has(bedrockKey(id))) index.set(bedrockKey(id), id)
  }
  return index
}

// ── one resolver per catalog key ──────────────────────────────────────────
//
// `resolve(row)` returns a rate row or undefined (no source → no coin).
// `twins(row)` adds `<id>-fast` keys the family grows outside models.json.

const ANTIGRAVITY_ALIASES = {
  'gemini-pro-agent': ['google', 'gemini-3.1-pro-preview'],
  'gemini-3.1-pro-low': ['google', 'gemini-3.1-pro-preview'],
  'gemini-3-flash': ['google', 'gemini-3-flash-preview'],
  'gpt-oss-120b-medium': ['google-vertex', 'openai/gpt-oss-120b-maas'],
}
/** Kimi Code ids → the Moonshot API model the official models page names (kimi-for-coding is K2.8 Preview: unpriced). */
const KIMI_ALIASES = { k3: 'kimi-k3', 'k3-256k': 'kimi-k3', 'kimi-for-coding-highspeed': 'kimi-k2.7-code-highspeed' }
const KIRO_ALIASES = { 'deepseek-3.2': 'v3-2' }
/** The one real backend Grok Fast id: the upstream picker prices it at 2× its
    base row ("Fast variant. 2x the price.", docs/error.md 2026-09-22). */
const GROK_FAST_BASE = { 'grok-4.7-build-fast': 'grok-4.7' }

/** A Fast multiplier applied to every priced field of the base row — only
    numbers the source itself states (grok picker "2x the price", cursor
    docs "Fast mode is available at Nx pricing"). */
function scaleRate(row, k) {
  const scaled = (value) => (num(value) === undefined ? undefined : value * k)
  const out: any = { in: scaled(row.in), out: scaled(row.out) }
  if (num(row.cacheRead) !== undefined) out.cacheRead = scaled(row.cacheRead)
  if (num(row.cacheWrite) !== undefined) out.cacheWrite = scaled(row.cacheWrite)
  if (num(row.cacheWrite1h) !== undefined) out.cacheWrite1h = scaled(row.cacheWrite1h)
  if (row.tierThreshold !== undefined) out.tierThreshold = row.tierThreshold
  if (Array.isArray(row.tiers)) {
    out.tiers = row.tiers.map((tier) => {
      const t: any = { in: scaled(tier.in), out: scaled(tier.out) }
      if (num(tier.cacheRead) !== undefined) t.cacheRead = scaled(tier.cacheRead)
      return t
    })
  }
  return out
}

/** Comparable model key across registries: last path segment, lowercase, dots → dashes. */
const modelKey = (id) => String(id).toLowerCase().split('/').pop().replace(/[._]/g, '-')

/**
 * Vendor list price for a row its family's own source does not price —
 * the model maker's bucket first, then OpenRouter; `-fast` rows only match
 * Vercel's `<vendor>/<id>-fast` priority rows (never the base price).
 */
function vendorIndex() {
  // An all-zero vendor row is models.dev saying "no price" (e.g. nvidia's
  // deepseek-ai rows), not a free model: it must not shadow the next source in
  // the chain — 缺 ≠ 免费, and a $0 badge would be wrong (docs/models.md 费率表).
  const priced = (name, id) => {
    const rate = fromModelsDev(bucket(name)[id])
    if (!rate) return undefined
    const zero = rate.in === 0 && rate.out === 0 && rate.cacheRead === undefined && rate.cacheWrite === undefined
    return zero ? undefined : rate
  }
  const plain = new Map()
  for (const name of ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'moonshotai', 'zai', 'minimax', 'xiaomi', 'alibaba', 'meta', 'nvidia', 'openrouter']) {
    for (const id of Object.keys(bucket(name))) {
      const key = modelKey(id)
      if (!plain.has(key) && priced(name, id)) plain.set(key, [name, id])
    }
  }
  const fast = new Map()
  for (const id of Object.keys(bucket('vercel'))) if (id.endsWith('-fast') && priced('vercel', id)) fast.set(modelKey(id), ['vercel', id])
  return (rowId) => {
    const key = modelKey(rowId).replace(/-thinking(?=-fast$|$)/, '')
    const hit = key.endsWith('-fast') ? fast.get(key) : plain.get(key)
    return hit ? { rate: priced(hit[0], hit[1]), from: `${hit[0]}:${hit[1]}` } : undefined
  }
}

function resolvers({ cursor, cursorFastX, devin, clineFree }) {
  const bedrock = bedrockIndex()
  const exact = (name) => (row) => devRate(name, row.id)
  return {
    codex: {
      source: 'models.dev "openai"; -fast twins models.dev "vercel" openai/<id>-fast (priority tier)',
      resolve: exact('openai'),
      twins: (row) => (row.fastTier ? [[`${row.id}-fast`, devRate('vercel', `openai/${row.id}-fast`)]] : []),
    },
    // Same public api.openai.com list prices; -fast twins are the priority tier, as for Codex.
    chatgpt: {
      source: 'models.dev "openai" (public Responses API); -fast twins models.dev "vercel" openai/<id>-fast (priority tier)',
      resolve: exact('openai'),
      twins: (row) => (row.fastTier ? [[`${row.id}-fast`, devRate('vercel', `openai/${row.id}-fast`)]] : []),
    },
    grok: {
      source: 'models.dev "xai" (xAI API); grok-4.7-build-fast = grok-4.7 × 2 (upstream picker: "Fast variant. 2x the price.")',
      resolve: (row) => {
        const base = GROK_FAST_BASE[row.id]
        if (base) {
          const rate = devRate('xai', base)
          return rate ? scaleRate(rate, 2) : undefined
        }
        return devRate('xai', row.id)
      },
    },
    glm: { source: 'models.dev "zai" (Z.AI USD)', resolve: exact('zai') },
    kiro: {
      source: 'models.dev "amazon-bedrock" (global endpoint)',
      resolve: (row) => {
        const id = bedrock.get(KIRO_ALIASES[row.id] ?? modelKey(row.id))
        return id ? devRate('amazon-bedrock', id) : undefined
      },
    },
    antigravity: {
      source: 'models.dev "google" / "anthropic" / "google-vertex"',
      resolve: (row) => {
        const alias = ANTIGRAVITY_ALIASES[row.id]
        if (alias) return devRate(alias[0], alias[1])
        const base = row.id.replace(/-(thinking|high|medium|low)$/, '')
        return row.id.startsWith('claude-') ? devRate('anthropic', base) : devRate('google', base)
      },
    },
    cursor: {
      source: 'cursor.com/docs/models-and-pricing.md (by row name; "<name> (Fast)" → -fast, else the notes\' stated "Fast mode is available at Nx pricing")',
      resolve: (row) => cursor.get(row.name),
      twins: (row) => {
        const explicit = cursor.get(`${row.name} (Fast)`)
        const stated = cursorFastX.get(row.name)
        const base = cursor.get(row.name)
        const rate = explicit ?? (stated && base ? scaleRate(base, stated) : undefined)
        return [[`${row.id}-fast`, rate]]
      },
    },
    kimi: {
      source: 'models.dev "moonshotai" (platform.kimi.ai), mapped via the Kimi Code models page',
      resolve: (row) => (KIMI_ALIASES[row.id] ? devRate('moonshotai', KIMI_ALIASES[row.id]) : undefined),
    },
    copilot: { source: 'models.dev "github-copilot"', resolve: exact('github-copilot') },
    devin: {
      source: `docs.devin.ai/desktop/models.md modelCostData (${DEVIN_TIER}) by defaultUid`,
      resolve: (row) => devin.get(row.defaultUid),
    },
    cline: {
      source: 'Cline feed "free" → $0; others models.dev "openrouter" (spacexai/ → x-ai/)',
      resolve: (row) => (clineFree.has(row.id)
        ? rateRow({ input: 0, output: 0, cacheRead: 0 })
        : devRate('openrouter', row.id.replace(/^spacexai\//, 'x-ai/'))),
    },
    ollama: { source: 'models.dev "ollama-cloud"', resolve: exact('ollama-cloud') },
    'opencode-go-flash': { source: 'models.dev "opencode-go"', resolve: exact('opencode-go') },
    'opencode-go-responses': { source: 'models.dev "opencode-go"', resolve: exact('opencode-go') },
  }
}

// ── serialize (the file's existing hand layout) ───────────────────────────

const pair = ([k, v]) => `"${k}": ${JSON.stringify(v)}`
const band = (b) => `{ ${Object.entries(b).map(pair).join(', ')} }`

function serializeRow(id, row) {
  const lines = [['in', 'out', 'cacheRead', 'cacheWrite', 'cacheWrite1h'].filter((k) => row[k] !== undefined).map((k) => pair([k, row[k]])).join(', ')]
  if (row.tierThreshold !== undefined) lines.push(pair(['tierThreshold', row.tierThreshold]))
  if (row.tiers !== undefined) lines.push(`"tiers": [${row.tiers.map(band).join(', ')}]`)
  for (const key of ['tod.peak', 'tod.offPeak']) if (row[key] !== undefined) lines.push(`"${key}": ${band(row[key])}`)
  return `    ${JSON.stringify(id)}: {\n      ${lines.join(',\n      ')}\n    }`
}

function serialize(raw, tables) {
  const tod = /^  "timeOfDay": .*$/m.exec(raw)?.[0]?.replace(/,$/, '')
  const blocks = Object.entries<any>(tables).map(([key, rows]) => (
    `  ${JSON.stringify(key)}: {\n${Object.entries(rows).map(([id, row]) => serializeRow(id, row)).join(',\n')}\n  }`
  ))
  return `{\n${[...(tod ? [tod] : []), ...blocks].join(',\n')}\n}\n`
}

// ── run ───────────────────────────────────────────────────────────────────

const outbound = configureOutbound({ path: outboundProxyPath(DATA_DIR), env: process.env })
let exitCode = 0
try {
  const [devText, cursorText, devinText, clineText] = await Promise.all([
    getText(MODELS_DEV_URL), getText(CURSOR_PRICING_URL), getText(DEVIN_PRICING_URL), getText(CLINE_RECOMMENDED_MODELS_URL),
  ])
  dev = JSON.parse(devText)
  const { rows: cursorRows, fastX: cursorFastX } = parseCursorTable(cursorText)
  const table = resolvers({
    cursor: cursorRows,
    cursorFastX,
    devin: parseDevinTable(devinText),
    clineFree: new Set((JSON.parse(clineText).free ?? []).map((entry) => entry.id)),
  })

  // Kimi Code ids are plan aliases (kimi-for-coding = K2.8 Preview), so a
  // same-named vendor row is never theirs.
  const vendor = vendorIndex()
  const raw = readFileSync(RATES_PATH, 'utf8')
  // The hand-maintained peak schedule rides through serialize() verbatim; a
  // layout its extractor misses must fail loudly instead of silently writing
  // a rates.json without it (the Models tab loses the peak-band footnote).
  if (!/^  "timeOfDay": /m.test(raw)) {
    throw new Error('rates.json has no top-level "timeOfDay" line — restore it before refreshing rates')
  }
  const current = JSON.parse(raw)
  // command-code stays the hand-copied CLI bundle table (docs/models.md).
  const tables: Record<string, any> = {}
  for (const key of CATALOG_KEYS) {
    if (key === 'command-code' && current[key]) { tables[key] = current[key]; continue }
    const family = table[key]
    if (!family) continue
    const rows: Record<string, any> = {}
    const missing: string[] = []
    const borrowed: string[] = []
    for (const row of catalogRows(key)) {
      let rate = family.resolve(row)
      if (!rate && key !== 'kimi') {
        const hit = vendor(row.id)
        if (hit) { rate = hit.rate; borrowed.push(`${row.id} ← ${hit.from}`) }
      }
      if (rate) rows[row.id] = rate
      else missing.push(row.id)
      for (const [twin, twinRate] of family.twins?.(row) ?? []) if (twinRate) rows[twin] = twinRate
    }
    tables[key] = rows
    console.log(`${key.padEnd(22)} ${String(Object.keys(rows).length).padStart(3)} rows (was ${Object.keys(current[key] ?? {}).length})  ${family.source}`)
    if (borrowed.length) console.log(`  ~ vendor list price: ${borrowed.join(', ')}`)
    if (missing.length) console.log(`  · no price in source: ${missing.join(', ')}`)
  }

  const next = serialize(raw, tables)
  if (write && next !== raw) {
    writeFileSync(RATES_PATH, next)
    console.log(`\nwrote ${RATES_PATH}; run npm run build, then npm test`)
  } else {
    console.log(next === raw ? '\nnothing to write' : '\ndry run; pass --write to apply')
  }
} catch (error: any) {
  console.error(error?.message ?? String(error))
  exitCode = 1
} finally {
  await outbound.close()
}
process.exit(exitCode)
