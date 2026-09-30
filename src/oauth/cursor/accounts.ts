/**
 * Cursor account lifecycle for AuthController: live catalog discovery, auto-import from the
 * CLI / IDE, identity from the token or state.vscdb, and plan write-back.
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
import { cursorAccountFromToken, pickCursorHumanAccount } from './index.js'
import { CURSOR_IMPORT_EMPTY, importCursorAuth, readCursorVscdbTokens } from './import.js'
import { cursorCatalogModels } from './catalog.js'
import { identityDue, signedOutOf } from '../account-marks.js'
import type { AuthController } from '../controller.js'

export async function discoverCursor(ctl: AuthController, session) {
  if (!session || typeof ctl.cursorDiscover !== 'function') return cursorCatalogModels()
  try {
    return await ctl.cursorDiscover(session)
  } catch {
    return cursorCatalogModels()
  }
}

export async function rememberCursorPlan(ctl: AuthController, row, quota) {
  if (!quota || quota.status !== 'ready') return
  const email = pickCursorHumanAccount(quota.account, row.session.cachedEmail)
  const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
  const cachedEmail = pickCursorHumanAccount(email, row.session.cachedEmail)
  if (!email && !planType && cachedEmail === row.session.cachedEmail) return
  if (
    (!email || row.session.account === email)
    && (!planType || row.session.planType === planType)
    && row.session.cachedEmail === cachedEmail
  ) return
  const next = { ...row.session }
  if (email) next.account = email
  if (planType) next.planType = planType
  if (cachedEmail) next.cachedEmail = cachedEmail
  await rewriteCursorIdentity(ctl, row, next)
}

export async function resolveCursorIdentities(ctl: AuthController) {
  const rows = identityDue(ctl, 'cursor', await listStoredSessions('cursor', ctl.authPath), pickCursorHumanAccount)
  if (rows.length === 0) return
  const vscdb = await readCursorVscdbHint(ctl)
  await Promise.all(rows.map(async (row) => {
    const account = pickCursorHumanAccount(
      cursorAccountFromToken(row.session?.accessToken),
      cachedEmailFor(ctl, row.session, vscdb),
    )
    if (!account) return
    await rewriteCursorIdentity(ctl, row, { ...row.session, account })
  }))
}

export function cachedEmailFor(ctl: AuthController, session, vscdb) {
  const email = pickCursorHumanAccount(vscdb?.cachedEmail)
  if (!email || !session) return undefined
  const sameAccess = typeof vscdb.accessToken === 'string' && vscdb.accessToken === session.accessToken
  const sameRefresh = typeof vscdb.refreshToken === 'string' && vscdb.refreshToken === session.refreshToken
  if (session.source === 'ide_vscdb' || sameAccess || sameRefresh) return email
  return undefined
}

export async function readCursorVscdbHint(ctl: AuthController) {
  const opts = ctl.cursorImport ?? {}
  if (process.env.NODE_TEST_CONTEXT && !opts.readVscdbFn && !opts.paths && !opts.home) {
    return {}
  }
  try {
    return await readCursorVscdbTokens({
      platform: opts.platform,
      env: opts.env,
      home: opts.home,
      paths: opts.paths,
      readDb: opts.readVscdbFn,
      now: opts.now,
    })
  } catch {
    return {}
  }
}

export async function rewriteCursorIdentity(ctl: AuthController, row, next) {
  const nextId = accountIdOf('cursor', next)
  if (nextId !== row.id) {
    const saved = await replaceAccountId('cursor', row, next, ctl.authPath)
    if (!saved) return
    ctl.quota.clear('cursor', row.id)
    await ctl.quota.ensure('cursor', saved.id, saved.session)
    return
  }
  await updateAccountSession('cursor', row, next, ctl.authPath)
}

export async function maybeAutoImportCursor(ctl: AuthController) {
  if (!ctl.cursorAutoImport || ctl.cursorAutoImportTried) return
  ctl.cursorAutoImportTried = true
  if (await signedOutOf(ctl, 'cursor')) return
  const rows = await listStoredSessions('cursor', ctl.authPath)
  if (rows.length > 0) return
  try {
    const result = await importCursorAuth(ctl.cursorImport)
    if (result?.session) {
      await saveSession('cursor', result.session, ctl.authPath)
      await discoverCursor(ctl, result.session)
      ctl.onAuthChanged?.('cursor')
      void ctl.quota.refresh('cursor')
    }
  } catch (error) {
    if (errorCode(error) !== CURSOR_IMPORT_EMPTY && errorMessage(error) !== CURSOR_IMPORT_EMPTY) {
      // empty machine is fine; other faults stay off the Settings banner
    }
  }
}

export async function importCursor(ctl: AuthController) {
  const existing = await listStoredSessions('cursor', ctl.authPath)
  const result = await importCursorAuth(ctl.cursorImport)
  const incomingId = accountIdOf('cursor', result.session)
  const hit = existing.find((row) => row.id === incomingId)
  if (hit?.session?.source === 'pkce') {
    return { source: 'pkce', session: hit.session, skipped: true }
  }
  return result
}

export async function completeCursor(ctl: AuthController, attempt) {
  try {
    const session = await attempt.waitToken()
    await saveSession('cursor', session, ctl.authPath)
    ctl.lastError.delete('cursor')
    await discoverCursor(ctl, session)
    ctl.onAuthChanged?.('cursor')
    void ctl.quota.refresh('cursor')
  } catch (error) {
    if (!(error instanceof Error && error.message === 'login cancelled')) {
      ctl.lastError.set('cursor', error instanceof Error ? error.message : String(error))
    }
  } finally {
    ctl.finalizing.delete('cursor')
  }
}
