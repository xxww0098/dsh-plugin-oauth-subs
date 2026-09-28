/**
 * Command Code credential import: same order the CLI resolves its key in
 * (`getCommandAuthKey` → `getCommandApiKeyFromEnv` first, then the auth
 * file):
 *
 *   1. `COMMAND_CODE_API_KEY` environment variable → source 'env'
 *   2. `~/.commandcode/auth.json` `{ apiKey, userId, userName, keyName,
 *      authenticatedAt }` → source 'cli'
 *
 * The auth file is what `cmd auth login` writes; its fields map onto the
 * session directly so the imported row shows the same username the CLI does.
 */

import { readFile } from 'node:fs/promises'
import {
  COMMAND_CODE_API_KEY_ENV,
  commandCodeAuthFilePath,
  commandCodeSession,
  parseCommandCodeApiKey,
} from './index.js'

/** Sentinel for "nothing to import" — the UI maps this to a friendly hint. */
export const COMMAND_CODE_IMPORT_EMPTY = 'command-code-import-empty'

function envKey(env) {
  const raw = env?.[COMMAND_CODE_API_KEY_ENV]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/** Parse ~/.commandcode/auth.json; returns undefined when missing/invalid. */
export async function readCommandCodeAuthFile({ home, path, readFileFn = readFile }: any = {}) {
  const file = path ?? commandCodeAuthFilePath(home)
  let parsed
  try {
    parsed = JSON.parse(await readFileFn(file, 'utf8'))
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const apiKey = typeof parsed.apiKey === 'string' && parsed.apiKey.trim() ? parsed.apiKey.trim() : undefined
  if (!apiKey) return undefined
  return {
    apiKey,
    userId: typeof parsed.userId === 'string' && parsed.userId.trim() ? parsed.userId.trim() : undefined,
    userName: typeof parsed.userName === 'string' && parsed.userName.trim() ? parsed.userName.trim() : undefined,
    keyName: typeof parsed.keyName === 'string' && parsed.keyName.trim() ? parsed.keyName.trim() : undefined,
  }
}

/**
 * Import one session. Env wins over the auth file, matching the CLI. Throws
 * COMMAND_CODE_IMPORT_EMPTY-coded errors when neither source has a key.
 */
export async function importCommandCodeAuth(options: any = {}) {
  const env = options.env ?? process.env
  const key = envKey(env)
  if (key) {
    return {
      source: 'env',
      session: commandCodeSession({ accessToken: key, source: 'env' }),
    }
  }
  const auth = await readCommandCodeAuthFile(options)
  if (auth) {
    return {
      source: 'cli',
      session: commandCodeSession({
        accessToken: auth.apiKey,
        userId: auth.userId,
        userName: auth.userName,
        account: auth.userName,
        source: 'cli',
      }),
    }
  }
  const error: any = new Error(COMMAND_CODE_IMPORT_EMPTY)
  error.code = COMMAND_CODE_IMPORT_EMPTY
  throw error
}
