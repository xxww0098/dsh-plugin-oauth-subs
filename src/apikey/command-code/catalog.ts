/**
 * Command Code model catalog: the pinned registry, refreshed from the
 * vendor's own list.
 *
 * The registry comes from the CLI bundle (dist/cli.mjs, command-code 1.82.1):
 * its 97 rows less the 8 hidden ones, each carrying the row's own effort
 * list. /alpha/models does not exist — but the Provider API does, and its
 * GET /provider/v1/models answers without a key (live 2026-10-10: 200,
 * {object:'list', data:[…]}, 87 rows whose ids, names and context_length
 * matched the then-pinned 1.79.1 registry row for row; 2026-10-14: 89 rows,
 * matching the 1.82.1 registry). Community reference
 * @magpie-community/opencode-commandcode-auth reads its picker from that
 * list; this hop takes it as the vendor's answer on membership and window
 * and keeps the pinned registry as the offline floor.
 *
 * The live list says nothing about reasoning levels or image input, so a row
 * it adds carries only what it does say (id, name, contextWindow) — the same
 * 'say nothing rather than invent it' rule magpie applies to modalities.
 * 'npm run models -- command-code' writes full rows from it for a maintainer
 * to review.
 */

import { outboundFetch } from '../../utils/outbound.js'
import { createLiveCatalog } from '../../catalog/live-refresh.js'
import { catalogRateTable, catalogRateTimeOfDay } from '../../catalog/index.js'
import {
  COMMAND_CODE_MODELS,
  COMMAND_CODE_PROVIDER_MODELS_URL,
  commandCodeModelById,
} from './index.js'

export const COMMAND_CODE_CATALOG_TTL_MS = 10 * 60_000

const live = createLiveCatalog<any>({ fallback: () => [...COMMAND_CODE_MODELS] })

export function resetCommandCodeCatalogCache() {
  live.reset()
}

/** The live rows when a refresh landed, else the pinned registry. */
export function commandCodeCatalogModels() {
  const stored = live.stored()
  return stored?.length ? [...stored] : COMMAND_CODE_MODELS
}

/**
 * Rows of the vendor's list: {id, name, context_length, supported_endpoints}.
 * A row with no positive window cannot become a catalog row (the loader
 * requires one), so it is dropped; duplicates keep the first.
 */
export function commandCodeProviderRows(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
  const out: any[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) continue
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    if (!id || seen.has(id)) continue
    const contextWindow = Number.isInteger(row.context_length) && row.context_length > 0 ? row.context_length : undefined
    if (contextWindow === undefined) continue
    seen.add(id)
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
      contextWindow,
      endpoints: Array.isArray(row.supported_endpoints)
        ? row.supported_endpoints.filter((endpoint) => typeof endpoint === 'string')
        : [],
    })
  }
  return out
}

/**
 * Source membership for the update script: what the vendor list actually
 * returned, with no static floor filled back in. The picker merge stays
 * `mergeCommandCodeProviderModels`.
 */
export function commandCodeSourceModels(liveRows) {
  return (liveRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    contextWindow: row.contextWindow,
  }))
}

/**
 * The vendor's list over the pinned registry. A known id keeps its curated
 * name, its effort list and its image input — the list carries none of them —
 * and takes the live window (the registry is a snapshot of the pin). An id
 * the list adds is appended with exactly what the list says. A registry id
 * the list no longer has stays: the pinned registry is what /alpha/generate
 * is attributed to, and 'npm run models' reports the drift instead of a
 * silent drop.
 */
export function mergeCommandCodeProviderModels(live, { models = COMMAND_CODE_MODELS }: { models?: readonly any[] } = {}) {
  const source = models ?? []
  const byId = new Map<string, any>((live ?? []).map((row) => [row.id, row]))
  const rows: any[] = []
  const known = new Set<string>()
  for (const row of source) {
    known.add(row.id)
    const hit = byId.get(row.id)
    rows.push(hit ? { ...row, contextWindow: hit.contextWindow } : { ...row })
  }
  for (const row of live ?? []) {
    if (known.has(row.id)) continue
    rows.push({ id: row.id, name: row.name, contextWindow: row.contextWindow })
  }
  return rows
}

async function readProviderModels(fetchFn, signal) {
  try {
    const response = await fetchFn(COMMAND_CODE_PROVIDER_MODELS_URL, {
      headers: { accept: 'application/json' },
      signal,
    })
    if (!response?.ok) return []
    return commandCodeProviderRows(await response.json())
  } catch {
    return []
  }
}

/**
 * Refresh the picker from the vendor's list. The endpoint is public, so no
 * credential is sent; the session is taken to match the other families'
 * discover signature. A failed or empty read leaves the pinned registry.
 */
export async function refreshCommandCodeCatalog(_session, options: any = {}) {
  return live.refresh({
    credential: 'public',
    ttlMs: options.ttlMs ?? COMMAND_CODE_CATALOG_TTL_MS,
    now: options.now,
    fetch: async () => {
      const listed = await readProviderModels(options.fetchFn ?? outboundFetch, options.signal)
      if (listed.length === 0) return null
      return mergeCommandCodeProviderModels(listed, { models: options.models ?? COMMAND_CODE_MODELS })
    },
  })
}

/**
 * models.json-keyed billing-rate map for the Models-tab price tooltip —
 * '<family>/<model id>' → USD-per-1M-token row straight out of
 * src/catalog/rates.json. Display-only, mirrors the CLI's bundled
 * display-rates tables; never a route-row field.
 */
export function commandCodePricing() {
  const table = catalogRateTable('command-code') ?? {}
  return Object.fromEntries(Object.keys(table).map((id) => [`command-code/${id}`, table[id]]))
}

export { catalogRateTimeOfDay, commandCodeModelById }
