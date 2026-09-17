/**
 * Import the Devin CLI's `credentials.toml`. The CLI writes a tiny flat TOML
 * document — four top-level `key = "value"` lines — so a quoted-string scan
 * is the whole parser; no TOML dependency for one shape.
 *
 *   windsurf_api_key  = "devin-session-token$…"   ← the session credential
 *   api_server_url    = "https://server.codeium.com"
 *   devin_webapp_host = "https://app.devin.ai"
 *   devin_api_url     = "https://api.devin.ai"
 *
 * Locations (XDG data dir / macOS / Windows):
 *   ~/.local/share/devin/credentials.toml
 *   %LOCALAPPDATA%/devin/credentials.toml
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeDevinToken, devinSession } from './index.js'
import { readPrivateText } from '../store.js'

export const DEVIN_IMPORT_EMPTY = 'devin-import-empty'

export function devinCredentialsPaths() {
  const paths = []
  const home = homedir()
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    if (localAppData) paths.push(join(localAppData, 'devin', 'credentials.toml'))
    paths.push(join(home, 'AppData', 'Local', 'devin', 'credentials.toml'))
  }
  const xdg = process.env.XDG_DATA_HOME
  if (xdg && process.platform !== 'win32') paths.push(join(xdg, 'devin', 'credentials.toml'))
  paths.push(join(home, '.local', 'share', 'devin', 'credentials.toml'))
  return paths
}

/** Flat `key = "value"` scan — the CLI only writes quoted top-level keys. */
export function parseDevinCredentialsToml(text) {
  if (typeof text !== 'string' || !text.trim()) return undefined
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(line)
    if (!match) continue
    const value = match[2].replace(/\\(["\\nrt])/g, (whole, esc) => (
      esc === 'n' ? '\n' : esc === 'r' ? '\r' : esc === 't' ? '\t' : esc
    ))
    out[match[1]] = value
  }
  const apiKey = normalizeDevinToken(out.windsurf_api_key)
  if (!apiKey) return undefined
  return {
    apiKey,
    apiServer: typeof out.api_server_url === 'string' && out.api_server_url.trim()
      ? out.api_server_url.trim().replace(/\/+$/, '')
      : undefined,
    webappHost: typeof out.devin_webapp_host === 'string' && out.devin_webapp_host.trim()
      ? out.devin_webapp_host.trim().replace(/\/+$/, '')
      : undefined,
    apiUrl: typeof out.devin_api_url === 'string' && out.devin_api_url.trim()
      ? out.devin_api_url.trim().replace(/\/+$/, '')
      : undefined,
  }
}

export function isDevinCredentialsToml(text) {
  return /^\s*windsurf_api_key\s*=\s*"devin-session-token\$/m.test(String(text ?? ''))
    || parseDevinCredentialsToml(text) !== undefined
}

/**
 * Read the first credentials.toml that parses. Returns
 * `{ session, source:'cli_toml', path }` — the token never leaves the session.
 * Throws DEVIN_IMPORT_EMPTY when no path yields a credential.
 */
export async function importDevinAuth({ paths = devinCredentialsPaths() } = {}) {
  for (const path of paths) {
    const text = await readPrivateText(path, 'devin credentials', { allowBroadMode: true })
    if (text === undefined) continue
    const parsed = parseDevinCredentialsToml(text)
    if (!parsed) continue
    return {
      source: 'cli_toml',
      session: devinSession({
        accessToken: parsed.apiKey,
        apiServer: parsed.apiServer,
        source: 'cli_toml',
      }),
      path,
    }
  }
  const error = new Error(DEVIN_IMPORT_EMPTY)
  error.code = DEVIN_IMPORT_EMPTY
  throw error
}
