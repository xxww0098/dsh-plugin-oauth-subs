/**
 * Login entry points behind the Settings RPC: browser / device / CLI flow
 * start, paste completion, pasted keys, and local imports. Every family
 * specific flow lives in that family's accounts.ts / import.ts; this module
 * only dispatches through the family registry (families.ts) and owns the
 * shared attempt lifecycle and error shaping.
 */

import { describeError } from '../utils/http.js'
import { PROVIDER_IDS, publicSession, saveSession } from './store.js'
import { oauthFamily } from './families.js'
import type { AuthController } from './controller.js'

export async function login(ctl: AuthController, provider, options) {
  const payload = typeof options === 'string' || options == null ? { mode: options } : options
  const row = oauthFamily(provider)?.login
  if (!row) throw new Error(`unknown provider ${provider}`)
  return row.attempt(ctl, payload)
}

/** Grok's device-flow completion; the other device families own theirs in accounts.ts. */
export { completeGrokDeviceFlow as completeDevice } from './grok/accounts.js'

export async function completePkce(ctl: AuthController, provider, attempt, claim) {
  const hooks = oauthFamily(provider)?.login.completePaste
  if (!hooks) return
  try {
    const code = await attempt.waitCode()
    // Kiro (#167): the portal can pivot an organization login to the IdC
    // device flow; resume settles it through that attempt instead of a code
    // exchange (and cancels it when the claim went stale).
    if (hooks.resume?.(ctl, code, claim)) return
    const session = await hooks.exchange(ctl, code, attempt)
    if (ctl.claims.get(provider) !== claim) return
    const saved = await saveSession(provider, hooks.finish ? await hooks.finish(ctl, session) : session, ctl.authPath)
    ctl.lastError.delete(provider)
    const discover = hooks.discover ?? oauthFamily(provider)?.quota?.discover?.run
    if (discover) await discover(ctl, session)
    ctl.onAuthChanged?.(provider)
    void ctl.quota.refresh(provider)
    if (hooks.probe) void hooks.probe(ctl, saved)
  } catch (error) {
    if (ctl.claims.get(provider) !== claim) return
    if (!(error instanceof Error && error.message === 'login cancelled')) {
      ctl.lastError.set(provider, describeError(error))
    }
  }
}

export async function useKey(ctl: AuthController, provider, key, extra) {
  const payload = typeof extra === 'string' || extra == null ? { region: extra } : extra
  const accept = oauthFamily(provider)?.login.useKey
  if (!accept) throw new Error(`only GLM, Kiro, Ollama Cloud, Kimi, Copilot, Devin, and Command Code accept a pasted key`)
  return accept(ctl, key, payload)
}

export async function importFrom(ctl: AuthController, provider) {
  // A newer Settings page can name a family this host build does not know;
  // never fall through to another family's importer — that writes a foreign
  // session under the caller's provider key (observed: Grok tokens stored
  // as `devin`).
  if (!PROVIDER_IDS.includes(provider)) throw new Error(`unknown provider ${provider}`)
  // No local CLI store holds a Sign in with ChatGPT grant (its client id is per install).
  if (provider === 'chatgpt') throw new Error('Sign in with ChatGPT has no local session to import; use Continue with ChatGPT')
  const run = oauthFamily(provider)?.login.importLocal
  if (!run) throw new Error(`${provider} has no local session to import`)
  const result: any = await run(ctl)
  ctl.claim(provider)
  ctl.flows.pending(provider)?.cancel()
  ctl.devices.pending(provider)?.cancel()
  ctl.glmFlows.pending(provider)?.cancel()
  ctl.kiroFlows.pending(provider)?.cancel()
  ctl.cursorFlows.pending(provider)?.cancel()
  const sessions = provider === 'kiro' && Array.isArray(result.sessions) && result.sessions.length > 0
    ? result.sessions
    : [result.session]
  for (let i = 0; i < sessions.length; i++) {
    await saveSession(provider, sessions[i], ctl.authPath, { activate: i === 0 })
  }
  ctl.lastError.delete(provider)
  const discover = oauthFamily(provider)?.quota?.discover?.run
  if (discover) await discover(ctl, sessions[0])
  ctl.onAuthChanged?.(provider)
  void ctl.quota.refresh(provider)
  return {
    source: result.source,
    account: publicSession(provider, sessions[0]),
    count: sessions.length,
  }
}
