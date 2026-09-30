/**
 * Antigravity account lifecycle for AuthController: plan write-back and the Google validation probe.
 * Functions take the controller as their first argument; the class keeps
 * the public entry points.
 */

import { updateAccountSession } from '../store.js'
import { applyAntigravityValidation, probeAntigravityValidation } from './index.js'
import type { AuthController } from '../controller.js'

export async function rememberAntigravityPlan(ctl: AuthController, row, quota) {
  if (!quota || quota.status !== 'ready') return
  const planType = typeof quota.planType === 'string' && quota.planType.trim() ? quota.planType.trim() : undefined
  if (!planType || row.session.planType === planType) return
  await updateAccountSession('antigravity', row, { ...row.session, planType }, ctl.authPath)
}

export async function probeAntigravity(ctl: AuthController, source) {
  try {
    const info = await probeAntigravityValidation(source.session, { fetchFn: ctl.fetchFn })
    if (info === undefined) return
    const next = applyAntigravityValidation(source.session, info)
    await updateAccountSession('antigravity', source, next, ctl.authPath)
  } catch {
    // probe is best-effort; quota / login must still succeed
  }
}
