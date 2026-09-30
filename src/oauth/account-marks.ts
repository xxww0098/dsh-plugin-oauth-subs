/**
 * Per-account bookkeeping outside the credential store: the signed-out list
 * that keeps auto-import from reviving a family the user left, and the
 * identity-lookup throttle for the snapshot poll.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { writePrivateText } from '../utils/private-text.js'
import type { AuthController } from './controller.js'

// Auto-import restores an empty family from local CLI/IDE credentials on
// every start (and every hot reload). A family the user signed out of must
// stay signed out; an explicit import or login still works.
export function signedOutFile(ctl: AuthController) {
  return join(dirname(ctl.authPath), 'signed-out.json')
}

export async function signedOut(ctl: AuthController): Promise<string[]> {
  try {
    const list = JSON.parse(await readFile(signedOutFile(ctl), 'utf8'))
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export async function signedOutOf(ctl: AuthController, provider) {
  return (await signedOut(ctl)).includes(provider)
}

export async function markSignedOut(ctl: AuthController, provider) {
  const list = await signedOut(ctl)
  if (list.includes(provider)) return
  await writePrivateText(signedOutFile(ctl), `${JSON.stringify([...list, provider])}\n`)
}

/**
 * Rows still missing a readable identity, minus those tried within the
 * passive quota TTL — the snapshot poll must not re-hit userinfo / state.vscdb
 * every tick. `onAuthChanged` clears the table.
 */
export function identityDue(ctl: AuthController, provider, rows, hasIdentity) {
  const now = Date.now()
  return rows.filter((row) => {
    if (hasIdentity(row.session?.account)) return false
    const key = `${provider}\0${row.id}`
    const last = ctl.identityTried.get(key)
    if (last !== undefined && now - last < ctl.quota.ttlMs) return false
    ctl.identityTried.set(key, now)
    return true
  })
}
