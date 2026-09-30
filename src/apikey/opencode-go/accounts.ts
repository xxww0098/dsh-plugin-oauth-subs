/**
 * OpenCode Go accounts for AuthController: the multi-account vault, the
 * mirrored host `OPENCODE_API_KEY` credential, and the Settings payload.
 */

import { opencodeGoKeyHint } from './index.js'
import { OPENCODE_GO_API_KEY_ENV } from '../../oauth/models.js'
import type { AuthController } from '../../oauth/controller.js'

export async function hasOpencodeGoCredential(ctl: AuthController) {
  if (typeof ctl.credentials?.describe === 'function') {
    const info = await ctl.credentials.describe(OPENCODE_GO_API_KEY_ENV)
    return Boolean(info?.configured)
  }
  return Boolean(String(process.env[OPENCODE_GO_API_KEY_ENV] ?? '').trim())
}

export async function hasOpencodeGoKey(ctl: AuthController) {
  if (ctl.opencodeGo) {
    await ctl.opencodeGo.ready
    if (ctl.opencodeGo.anyKey()) return true
  }
  return hasOpencodeGoCredential(ctl)
}

/** Adopt a pre-multi-account key from the host credential into the vault, once. */
export async function maybeAdoptOpencodeGoKey(ctl: AuthController) {
  if (ctl.opencodeGoAdopted || !ctl.opencodeGo) return
  ctl.opencodeGoAdopted = true
  const id = ctl.opencodeGo.keylessId()
  if (!id || typeof ctl.credentials?.resolve !== 'function') return
  try {
    const resolved = await ctl.credentials.resolve(OPENCODE_GO_API_KEY_ENV)
    if (resolved?.value) await ctl.opencodeGo.adoptKey(id, resolved.value)
  } catch {
    // Unreadable legacy key stays where it is; chat keeps working.
  }
}

/**
 * Mirror a stored account's key into the host `OPENCODE_API_KEY` credential.
 * A keyless account never clears a key another stored account still holds
 * (a quota-only account must keep chat working); once no stored account has
 * a key, the credential is removed so the next `sync()` can take the
 * plugin's `opencode-go-flash` route back out of DSH.
 */
export async function mirrorOpencodeGoKey(ctl: AuthController, id) {
  const key = id ? ctl.opencodeGo?.keyOf(id) : undefined
  if (key) {
    if (typeof ctl.credentials?.set === 'function') await ctl.credentials.set(OPENCODE_GO_API_KEY_ENV, key)
    return
  }
  if (ctl.opencodeGo?.anyKey()) return
  if (typeof ctl.credentials?.unset === 'function') await ctl.credentials.unset(OPENCODE_GO_API_KEY_ENV)
}

export async function opencodeGoSnapshot(ctl: AuthController, options?) {
  if (!ctl.opencodeGo) {
    return {
      id: 'opencode-go', loggedIn: false, busy: false, activeId: undefined, accounts: [],
      cookieSet: false, workspaceId: '', apiKeySet: false, configured: false, quota: { status: 'idle' },
    }
  }
  await maybeAdoptOpencodeGoKey(ctl)
  const raw = await ctl.opencodeGo.snapshot(options)
  const credentialSet = await hasOpencodeGoCredential(ctl)
  const accounts = raw.accounts.map((row) => ({
    ...row,
    account: row.account || opencodeGoKeyHint(ctl.opencodeGo.keyOf(row.id)),
    apiKeySet: row.apiKeySet || (raw.accounts.length === 1 && credentialSet),
  }))
  const active = accounts.find((row) => row.active)
  return {
    id: 'opencode-go',
    loggedIn: accounts.length > 0,
    busy: false,
    activeId: raw.activeId,
    accounts,
    // Flat mirrors keep a client built before multi-account working.
    cookieSet: Boolean(active?.cookieSet),
    workspaceId: active?.workspaceId ?? '',
    apiKeySet: Boolean(active?.apiKeySet ?? credentialSet),
    configured: Boolean(active?.apiKeySet ?? credentialSet) || Boolean(active?.cookieSet),
    quota: active?.quota ?? { status: 'idle' },
  }
}

export async function saveOpencodeGo(ctl: AuthController, payload: any = {}) {
  if (!ctl.opencodeGo) throw new Error('OpenCode Go store is unavailable')
  const raw = payload.apiKey === undefined ? undefined : String(payload.apiKey ?? '').trim()
  const result = await ctl.opencodeGo.save({
    id: payload.id,
    apiKey: raw ? raw : undefined,
    cookie: payload.cookie,
    workspace: payload.workspace,
    displayName: payload.displayName,
  })
  await mirrorOpencodeGoKey(ctl, ctl.opencodeGo.activeId())
  ctl.lastError.delete('opencode-go')
  if (raw) ctl.onAuthChanged?.('opencode-go')
  return ctl.opencodeGoSnapshot()
}

export async function switchOpencodeGo(ctl: AuthController, id) {
  if (!ctl.opencodeGo) throw new Error('OpenCode Go store is unavailable')
  await ctl.opencodeGo.switch(id)
  await mirrorOpencodeGoKey(ctl, id)
  ctl.lastError.delete('opencode-go')
  ctl.onAuthChanged?.('opencode-go')
  return ctl.opencodeGoSnapshot()
}

export async function logoutOpencodeGo(ctl: AuthController, id) {
  if (!ctl.opencodeGo) throw new Error('OpenCode Go store is unavailable')
  const result = await ctl.opencodeGo.remove(id)
  await mirrorOpencodeGoKey(ctl, result.activeId)
  ctl.lastError.delete('opencode-go')
  ctl.onAuthChanged?.('opencode-go')
  return ctl.opencodeGoSnapshot()
}

export async function clearOpencodeGo(ctl: AuthController, field, id) {
  if (!ctl.opencodeGo) throw new Error('OpenCode Go store is unavailable')
  await ctl.opencodeGo.clear(id, field)
  // Clearing the key (or the whole account) can remove the last stored key,
  // which must drop the mirrored credential and re-sync the DSH routes.
  if (field === undefined || field === 'key') {
    const active = ctl.opencodeGo.activeId()
    await mirrorOpencodeGoKey(ctl, active)
    ctl.onAuthChanged?.('opencode-go')
  }
  return ctl.opencodeGoSnapshot()
}

export async function refreshOpencodeGoQuota(ctl: AuthController, id) {
  if (!ctl.opencodeGo) return ctl.opencodeGoSnapshot()
  await ctl.opencodeGo.refreshQuota(id)
  return ctl.opencodeGoSnapshot()
}
