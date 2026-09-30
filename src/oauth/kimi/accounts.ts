/**
 * Kimi account lifecycle for AuthController: live catalog discovery, local Kimi Code
 * auto-import, identity, and device-code completion.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */

import { errorCode, errorMessage } from '../../utils/http.js'
import {
  accountIdOf,
  listStoredSessions,
  replaceAccountId,
  saveSession,
  updateAccountSession,
} from '../store.js'
import {
  completeKimiDevice as sessionFromKimiDevice,
  isKimiOpaqueAccount,
  resolveKimiIdentity,
} from './index.js'
import { importKimiAuth, KIMI_IMPORT_EMPTY } from './import.js'
import { kimiCatalogModels } from './catalog.js'
import { signedOutOf } from '../account-marks.js'
import type { AuthController } from '../controller.js'

export async function discoverKimi(ctl: AuthController, session) {
  if (!session || typeof ctl.kimiDiscover !== 'function') return kimiCatalogModels()
  try {
    return await ctl.kimiDiscover(session, { fetchFn: ctl.fetchFn })
  } catch {
    return kimiCatalogModels()
  }
}

export async function maybeAutoImportKimi(ctl: AuthController) {
  if (!ctl.kimiAutoImport || ctl.kimiAutoImportTried) return
  ctl.kimiAutoImportTried = true
  if (await signedOutOf(ctl, 'kimi')) return
  const rows = await listStoredSessions('kimi', ctl.authPath)
  if (rows.length > 0) return
  try {
    const result = await importKimiAuth({ env: process.env, allowEnv: false })
    if (result?.session) {
      const session = await finishKimiSession(ctl, result.session)
      await saveSession('kimi', session, ctl.authPath)
      await discoverKimi(ctl, session)
      ctl.onAuthChanged?.('kimi')
      void ctl.quota.refresh('kimi')
    }
  } catch (error) {
    if (errorCode(error) !== KIMI_IMPORT_EMPTY && errorMessage(error) !== KIMI_IMPORT_EMPTY) {
      // empty CLI file is fine
    }
  }
}

export async function importKimi(ctl: AuthController) {
  const existing = await listStoredSessions('kimi', ctl.authPath)
  const result = await importKimiAuth({ env: process.env })
  const incomingId = accountIdOf('kimi', result.session)
  const hit = existing.find((row) => row.id === incomingId)
  if (hit) {
    return { source: hit.session.source, session: hit.session, skipped: true }
  }
  return { ...result, session: await finishKimiSession(ctl, result.session) }
}

export async function finishKimiSession(ctl: AuthController, session) {
  const identity = await resolveKimiIdentity(session, { fetchFn: ctl.fetchFn })
  if (!identity) return session
  const next = { ...session }
  if (identity.account) next.account = identity.account
  if (identity.planType) next.planType = identity.planType
  return next
}

export async function rememberKimiIdentity(ctl: AuthController, row, quota) {
  if (!quota || quota.status !== 'ready') return
  const account = typeof quota.account === 'string' && quota.account.trim() ? quota.account.trim() : undefined
  const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
  if (!account && !planType) return
  if (
    (!account || row.session.account === account)
    && (!planType || row.session.planType === planType)
  ) return
  const next = { ...row.session }
  if (account) next.account = account
  if (planType) next.planType = planType
  const nextId = accountIdOf('kimi', next)
  if (nextId !== row.id && isKimiOpaqueAccount(row.id)) {
    const saved = await replaceAccountId('kimi', row, next, ctl.authPath)
    if (!saved) return
    ctl.quota.clear('kimi', row.id)
    await ctl.quota.ensure('kimi', saved.id, saved.session)
    return
  }
  await updateAccountSession('kimi', row, next, ctl.authPath)
}

export async function completeKimiDevice(ctl: AuthController, attempt) {
  try {
    const tokens = await attempt.waitToken()
    const session = await finishKimiSession(ctl, await sessionFromKimiDevice(tokens))
    await saveSession('kimi', session, ctl.authPath)
    ctl.lastError.delete('kimi')
    await discoverKimi(ctl, session)
    ctl.onAuthChanged?.('kimi')
    void ctl.quota.refresh('kimi')
  } catch (error) {
    if (!(error instanceof Error && error.message === 'login cancelled')) {
      ctl.lastError.set('kimi', error instanceof Error ? error.message : String(error))
    }
  } finally {
    ctl.finalizing.delete('kimi')
  }
}
