/**
 * User-owned local Cursor login reuse. This is not a second OAuth.
 *
 * Resolution (Import click / empty-roster auto-import):
 *   1. CURSOR_ACCESS_TOKEN env (no refresh)
 *   2. macOS Keychain + IDE state.vscdb concurrently
 *   3. Prefer a still-valid local access token (Keychain first, then vscdb)
 *      with zero network
 *   4. Else refresh Keychain; if that fails and vscdb refresh differs, refresh vscdb
 *
 * Never scan sibling OS profiles. WSL uses only the current Windows user.
 * Adapted from MIT Rahularya01/pi-cursor src/auth/cli-credentials.ts — not copied.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  cursorAccessStillValid,
  cursorSession,
  refreshCursorTokens,
} from './index.js'
import { isCursorRefreshKnownBad } from './refresh-guard.js'

const execFileAsync = promisify(execFile)
const KEYCHAIN_TIMEOUT_MS = 2000

export const CURSOR_IMPORT_EMPTY = 'cursor-import-empty'

/** Windows account that owns this WSL session — never Public / Default / others. */
export function windowsUsernameFromEnv(env = process.env) {
  const profile = typeof env.USERPROFILE === 'string' ? env.USERPROFILE.trim() : ''
  if (profile) {
    const normalized = profile.replace(/\\/g, '/')
    const match = /\/Users\/([^/]+)/i.exec(normalized)
    const fromProfile = match?.[1]?.trim()
    if (fromProfile && fromProfile !== 'Public' && fromProfile !== 'Default' && !fromProfile.startsWith('.')) {
      return fromProfile
    }
  }
  const username = typeof env.USERNAME === 'string' ? env.USERNAME.trim() : ''
  if (username && username !== 'Public' && username !== 'Default' && !username.startsWith('.')) {
    return username
  }
  return undefined
}

export function cursorVscdbPaths({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  const paths = []
  if (platform === 'darwin') {
    paths.push(join(home, 'Library/Application Support/Cursor/User/globalStorage/state.vscdb'))
  } else if (platform === 'win32') {
    if (env.APPDATA) paths.push(join(env.APPDATA, 'Cursor/User/globalStorage/state.vscdb'))
  } else {
    paths.push(join(home, '.config/Cursor/User/globalStorage/state.vscdb'))
    const wsl = Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP || existsSync('/mnt/c/Users'))
    if (wsl) {
      const windowsUser = windowsUsernameFromEnv(env)
      if (windowsUser) {
        paths.push(join('/mnt/c/Users', windowsUser, 'AppData/Roaming/Cursor/User/globalStorage/state.vscdb'))
      }
    }
  }
  return paths
}

async function defaultReadVscdb(dbPath) {
  let DatabaseSync
  try {
    ;({ DatabaseSync } = await import('node:sqlite'))
  } catch {
    return {}
  }
  if (!existsSync(dbPath)) return {}
  let db
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const accessRow = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get()
    const refreshRow = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/refreshToken'").get()
    return {
      accessToken: typeof accessRow?.value === 'string' ? accessRow.value.trim() : undefined,
      refreshToken: typeof refreshRow?.value === 'string' ? refreshRow.value.trim() : undefined,
    }
  } catch {
    return {}
  } finally {
    try { db?.close() } catch { /* already closed */ }
  }
}

export async function readCursorVscdbTokens({
  platform = process.platform,
  env = process.env,
  home = homedir(),
  paths,
  readDb = defaultReadVscdb,
  now = Date.now(),
} = {}) {
  const dbPaths = paths ?? cursorVscdbPaths({ platform, env, home })
  const fallback = {}
  for (const dbPath of dbPaths) {
    const tokens = await readDb(dbPath)
    const access = typeof tokens.accessToken === 'string' ? tokens.accessToken.trim() : undefined
    const refresh = typeof tokens.refreshToken === 'string' ? tokens.refreshToken.trim() : undefined
    if (cursorAccessStillValid(access, now)) return { accessToken: access, refreshToken: refresh }
    if (!fallback.refreshToken && refresh) fallback.refreshToken = refresh
    if (!fallback.accessToken && access) fallback.accessToken = access
  }
  return fallback
}

export async function readCursorKeychainTokens({
  platform = process.platform,
  execFileFn = execFileAsync,
} = {}) {
  if (platform !== 'darwin') return {}
  const run = (service) => execFileFn(
    'security',
    ['find-generic-password', '-s', service, '-a', 'cursor-user', '-w'],
    { encoding: 'utf8', timeout: KEYCHAIN_TIMEOUT_MS },
  )
  const [accessResult, refreshResult] = await Promise.allSettled([
    run('cursor-access-token'),
    run('cursor-refresh-token'),
  ])
  const tokens = {}
  if (accessResult.status === 'fulfilled') {
    const raw = String(accessResult.value?.stdout ?? '').trim()
    if (raw) tokens.accessToken = raw
  }
  if (refreshResult.status === 'fulfilled') {
    const raw = String(refreshResult.value?.stdout ?? '').trim()
    if (raw) tokens.refreshToken = raw
  }
  return tokens
}

async function tryRefresh(refreshToken, fetchFn) {
  if (!refreshToken || isCursorRefreshKnownBad(refreshToken)) return undefined
  try {
    return await refreshCursorTokens(refreshToken, { fetchFn })
  } catch {
    return undefined
  }
}

export async function resolveCursorLocalCredentials({
  fetchFn = fetch,
  env = process.env,
  platform = process.platform,
  home = homedir(),
  execFileFn = execFileAsync,
  readVscdbFn,
  now = Date.now(),
} = {}) {
  const envToken = typeof env.CURSOR_ACCESS_TOKEN === 'string' ? env.CURSOR_ACCESS_TOKEN.trim() : ''
  if (envToken) {
    return cursorSession({ accessToken: envToken, refreshToken: envToken, source: 'env' })
  }

  const readDb = readVscdbFn
    ?? ((dbPath) => defaultReadVscdb(dbPath))
  const [keychain, vscdb] = await Promise.all([
    readCursorKeychainTokens({ platform, execFileFn }),
    readCursorVscdbTokens({ platform, env, home, readDb, now }),
  ])

  if (cursorAccessStillValid(keychain.accessToken, now)) {
    return cursorSession({
      accessToken: keychain.accessToken,
      refreshToken: keychain.refreshToken,
      source: 'cli_keychain',
    })
  }
  if (cursorAccessStillValid(vscdb.accessToken, now)) {
    return cursorSession({
      accessToken: vscdb.accessToken,
      refreshToken: vscdb.refreshToken,
      source: 'ide_vscdb',
    })
  }

  const keychainRefresh = await tryRefresh(keychain.refreshToken, fetchFn)
  if (keychainRefresh) {
    return cursorSession({ ...keychainRefresh, source: 'cli_keychain' })
  }
  if (vscdb.refreshToken && vscdb.refreshToken !== keychain.refreshToken) {
    const vscdbRefresh = await tryRefresh(vscdb.refreshToken, fetchFn)
    if (vscdbRefresh) {
      return cursorSession({ ...vscdbRefresh, source: 'ide_vscdb' })
    }
  }
  return undefined
}

export async function importCursorAuth(options = {}) {
  const session = await resolveCursorLocalCredentials(options)
  if (!session) {
    const error = new Error(CURSOR_IMPORT_EMPTY)
    error.code = CURSOR_IMPORT_EMPTY
    throw error
  }
  return { source: session.source, session }
}
