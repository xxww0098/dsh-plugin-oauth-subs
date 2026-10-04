/**
 * GLM account lifecycle for AuthController: CLI login start and completion,
 * pasted API keys, identity re-resolution, and legacy bearer upgrades.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */

import {
  accountIdOf,
  listStoredSessions,
  replaceAccountId,
  saveSession,
  updateAccountSession,
} from '../store.js'
import {
  glmSession,
  isGlmJwtShape,
  mintGlmApiKey,
  normalizeGlmRegion,
  pickGlmHumanAccount,
  resolveGlmIdentity,
} from './index.js'
import { identityDue } from '../account-marks.js'
import type { AuthController } from '../controller.js'

export async function resolveGlmIdentities(ctl: AuthController) {
  // Keep the strict check: an opaque letters+digits id (poll user.id like
  // dnarplz6) must re-resolve to an email/name. A resolved username that is
  // also letters+digits (xxww0098) re-resolves once and is a no-op when
  // userinfo returns the same value — displayGlmAccount shows it meanwhile.
  const rows = identityDue(ctl, 'glm', await listStoredSessions('glm', ctl.authPath), pickGlmHumanAccount)
  await Promise.all(rows.map(async (row) => {
    const account = await resolveGlmIdentity(row.session, { fetchFn: ctl.fetchFn }).catch(() => undefined)
    if (!account || account === row.session.account) return
    const next = { ...row.session, account, displayName: account }
    const nextId = accountIdOf('glm', next)
    if (nextId !== row.id) {
      await replaceAccountId('glm', row, next, ctl.authPath)
      ctl.quota.clear('glm', row.id)
    } else {
      await updateAccountSession('glm', row, next, ctl.authPath)
    }
  }))
}

/** BigModel bearers already re-minted this process, keyed `authPath\0accountId`. */
const GLM_MINT_TRIED = new Set<string>()

/**
 * Sessions written before the issue #168 fix carry BigModel's OAuth business
 * token in the bearer slot — it 500s on the Coding Plan hop and the direct
 * fallback's 401/500 chain never reaches a forced token refresh, so the sweep
 * here is the only reliable upgrade moment. The poll OAuth token doubles as
 * the BigModel biz bearer, so this is the same mint the login path does;
 * tried once per account per process, and a failed mint keeps the legacy
 * bearer (identity/quota still work; chat is no worse than before the fix).
 */
export async function upgradeGlmLegacyBearers(ctl: AuthController) {
  const rows = await listStoredSessions('glm', ctl.authPath)
  await Promise.all(rows.map(async (row) => {
    const session = row.session ?? {}
    if (normalizeGlmRegion(session.region) !== 'bigmodel') return
    if (!isGlmJwtShape(session.accessToken)) return
    const key = `${ctl.authPath}\0${row.id}`
    if (GLM_MINT_TRIED.has(key)) return
    GLM_MINT_TRIED.add(key)
    const oauthAccess = typeof session.oauthAccess === 'string' && session.oauthAccess.trim()
      ? session.oauthAccess.trim()
      : session.accessToken
    try {
      const minted = await mintGlmApiKey(oauthAccess, { fetchFn: ctl.fetchFn, region: 'bigmodel' })
      const next = { ...session, accessToken: minted, oauthAccess }
      const nextId = accountIdOf('glm', next)
      if (nextId !== row.id) {
        await replaceAccountId('glm', row, next, ctl.authPath)
      } else {
        await updateAccountSession('glm', row, next, ctl.authPath)
      }
    } catch {
      // keep the legacy bearer; a retry waits for the next process
    }
  }))
}

export async function completeGlm(ctl: AuthController, attempt) {
  try {
    const session = await attempt.waitToken()
    await saveSession('glm', session, ctl.authPath)
    ctl.lastError.delete('glm')
    ctl.onAuthChanged?.('glm')
    void ctl.quota.refresh('glm')
  } catch (error) {
    if (!(error instanceof Error && error.message === 'login cancelled')) {
      ctl.lastError.set('glm', error instanceof Error ? error.message : String(error))
    }
  } finally {
    ctl.finalizing.delete('glm')
  }
}

export async function loginGlm(ctl: AuthController, payload: any = {}) {
  const region = normalizeGlmRegion(payload.mode ?? payload.region)
  const attempt = await ctl.glmFlows.start('glm', { region, fetchFn: ctl.fetchFn })
  ctl.finalizing.add('glm')
  void ctl.completeGlm(attempt)
  return { authorizeUrl: attempt.authorizeUrl, mode: 'cli', region }
}

export async function useGlmKey(ctl: AuthController, key, payload: any = {}) {
  const accessToken = typeof key === 'string' ? key.trim() : ''
  if (accessToken.length < 8) throw new Error('glm API key is empty')
  ctl.claim('glm')
  ctl.glmFlows.pending('glm')?.cancel()
  const resolved = normalizeGlmRegion(payload.region ?? payload.mode)
  await saveSession('glm', glmSession({
    accessToken,
    account: 'api-key',
    region: resolved,
  }), ctl.authPath)
  ctl.lastError.delete('glm')
  ctl.onAuthChanged?.('glm')
  void ctl.quota.refresh('glm')
  return { region: resolved }
}
