/**
 * Command Code model catalog — static floor only.
 *
 * The CLI's registry is bundle-defined (`uD` in dist/cli.mjs, command-code
 * 1.66.0): there is no `/alpha/models` endpoint to refresh from, so unlike
 * Cursor/Kimi/Devin this family keeps a pure static catalog. The rows in
 * index.ts are the registry's non-hidden entries with per-model effort lists
 * merged from the CLI's `kr` effort map; models with no entry keep no
 * `reasoningEfforts` (the CLI itself returns null there — no invented
 * fallback).
 */

import { COMMAND_CODE_MODELS, commandCodeModelById } from './index.js'

export function commandCodeCatalogModels() {
  return COMMAND_CODE_MODELS
}

export { commandCodeModelById }
