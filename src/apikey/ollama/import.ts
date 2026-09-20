/**
 * Ollama Cloud import is `OLLAMA_API_KEY` only.
 *
 * `ollama signin` stores an SSH identity (`~/.ollama/id_ed25519` /
 * `.pub`) that the local daemon uses to sign registry requests. That
 * is not a Bearer API key. Do not send the public key upstream.
 * Desktop `db.sqlite` / community `credentials.json` schemas are not
 * documented as Bearer stores — do not invent a parser.
 */

import { ollamaSession } from './index.js'

export const OLLAMA_IMPORT_EMPTY = 'ollama-import-empty'

export async function resolveOllamaLocalCredentials({ env = process.env } = {}) {
  const key = typeof env.OLLAMA_API_KEY === 'string' ? env.OLLAMA_API_KEY.trim() : ''
  if (!key) return undefined
  return ollamaSession({ accessToken: key, source: 'env' })
}

export async function importOllamaAuth(options: any = {}) {
  const session = await resolveOllamaLocalCredentials(options)
  if (!session) {
    throw Object.assign(new Error(OLLAMA_IMPORT_EMPTY), { code: OLLAMA_IMPORT_EMPTY })
  }
  return { source: session.source, session }
}
