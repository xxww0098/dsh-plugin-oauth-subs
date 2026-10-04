/**
 * Codex account lifecycle for AuthController: PKCE login start and the
 * loopback code exchange. Functions take the controller as their first
 * argument; the class keeps the public entry points.
 */

import { codexFlow, exchangeCodexCode } from './index.js'
import type { AuthController } from '../controller.js'

export async function loginCodex(ctl: AuthController) {
  const attempt = await ctl.flows.start('codex', codexFlow)
  const claim = ctl.claim('codex')
  void ctl.completePkce('codex', attempt, claim)
  return { authorizeUrl: attempt.authorizeUrl, redirectUri: attempt.redirectUri, mode: 'pkce' }
}

export async function completeCodexPaste(ctl: AuthController, code, attempt) {
  return exchangeCodexCode(code, attempt.pkce.verifier, attempt.redirectUri)
}
