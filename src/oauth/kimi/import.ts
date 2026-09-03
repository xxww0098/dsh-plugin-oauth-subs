/**
 * Import official Kimi Code CLI credentials.
 *
 *   ~/.kimi-code/credentials/kimi-code.json
 *   ~/.kimi/credentials/kimi-code.json   (read-only fallback)
 *
 * Optional KEY source: KIMI_API_KEY / pasted sk- (no refresh).
 * Auto-import only the CLI json, and only when the roster is empty.
 * Never overwrite a stored session. Never write back to ~/.kimi-code.
 */

import { readFile } from 'node:fs/promises'
import { kimiHomePaths, kimiSession, parseKimiApiKey } from './index.js'

export const KIMI_IMPORT_EMPTY = 'kimi-import-empty'

function asUnixMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return value > 1e12 ? value : value * 1000
}

export function kimiSessionFromCliFile(data) {
  if (!data || typeof data !== 'object') return undefined
  const access = typeof data.access_token === 'string' ? data.access_token.trim() : ''
  const refresh = typeof data.refresh_token === 'string' ? data.refresh_token.trim() : ''
  if (!access || !refresh) return undefined
  const expiresAt = asUnixMs(data.expires_at)
    ?? (typeof data.expires_in === 'number' && data.expires_in > 0
      ? Date.now() + data.expires_in * 1000
      : undefined)
  return kimiSession({
    accessToken: access,
    refreshToken: refresh,
    expiresAt,
    source: 'cli',
  })
}

async function readCliFile(path) {
  try {
    const text = await readFile(path, 'utf8')
    return kimiSessionFromCliFile(JSON.parse(text))
  } catch {
    return undefined
  }
}

export async function resolveKimiCliCredentials(options = {}) {
  for (const path of kimiHomePaths(options)) {
    const session = await readCliFile(path)
    if (session) return session
  }
  return undefined
}

export function resolveKimiEnvKey({ env = process.env } = {}) {
  const raw = typeof env.KIMI_API_KEY === 'string' ? env.KIMI_API_KEY.trim() : ''
  if (!raw) return undefined
  return kimiSession({ accessToken: parseKimiApiKey(raw), source: 'env' })
}

export async function importKimiAuth(options = {}) {
  const cli = await resolveKimiCliCredentials(options)
  if (cli) return { source: 'cli', session: cli }
  if (options.allowEnv !== false) {
    const envSession = resolveKimiEnvKey(options)
    if (envSession) return { source: 'env', session: envSession }
  }
  const error = new Error(KIMI_IMPORT_EMPTY)
  error.code = KIMI_IMPORT_EMPTY
  throw error
}
