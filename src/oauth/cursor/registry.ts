/**
 * Shared Cursor registry state: the picker row cache plus the per-family
 * RequestedModel parameter styles derived from live AvailableModels.
 *
 * Lives apart from catalog.ts / request.ts on purpose: catalog.ts writes
 * both after a refresh and request.ts reads both while building a Run, and
 * h2-session.ts already imports request.ts — putting this state in
 * catalog.ts would close an import cycle.
 */

import { CURSOR_MODELS, CURSOR_PARAM_STYLES } from './index.js'

/** Picker row cache (tokenHash + egress keyed, 5 min TTL — see catalog.ts). */
export const cursorCatalogCache: { tokenHash: string; models?: any[]; expiresAt: number } = {
  tokenHash: '',
  models: undefined,
  expiresAt: 0,
}

export function resetCursorCatalogCache() {
  cursorCatalogCache.tokenHash = ''
  cursorCatalogCache.models = undefined
  cursorCatalogCache.expiresAt = 0
  liveStyles.clear()
}

export function cursorCatalogModels() {
  return cursorCatalogCache.models?.length ? cursorCatalogCache.models : [...CURSOR_MODELS]
}

/** Live AvailableModels-derived parameter styles, keyed by picker family. */
const liveStyles = new Map()

export function setCursorParamStyles(styles) {
  liveStyles.clear()
  for (const [family, style] of styles ?? []) liveStyles.set(family, style)
}

/**
 * The parameter style one picker family sends on Run. A family present in the
 * live catalog wins over the static table — including a family whose live
 * variants carry no parameters at all (empty style = send nothing).
 */
export function cursorParamStyle(family) {
  if (liveStyles.has(family)) return liveStyles.get(family)
  return CURSOR_PARAM_STYLES[family]
}
