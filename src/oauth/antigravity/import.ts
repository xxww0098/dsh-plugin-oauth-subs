/**
 * Antigravity local-session import: a user who has already logged in on this
 * machine does not have to repeat the browser flow.
 *
 * Recognised files:
 *   ~/.gemini/antigravity-cli/antigravity-oauth-token
 *   ~/.cli-proxy-api/antigravity.json   (CLIPROXYAPI_AUTH_DIR / CLI_PROXY_API_AUTH_DIR)
 *   antigravity*.json in the cli-proxy-api / ~/.gemini/antigravity directories
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { antigravitySession, completeAntigravityLogin } from './index.js'
import { errorCode } from '../../utils/http.js'
import { outboundFetch } from '../../utils/outbound.js'
import {
  asPositiveNumber,
  homeFile,
  parseTime,
  pickString,
  readJson,
} from '../import-auth.js'

function antigravityHomeDir() {
  return homeFile('.gemini')
}

function cliProxyAuthDir() {
  const override = process.env.CLIPROXYAPI_AUTH_DIR?.trim() || process.env.CLI_PROXY_API_AUTH_DIR?.trim()
  return override || homeFile('.cli-proxy-api')
}

export function antigravityAuthSearchPaths() {
  return [
    homeFile('.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    join(cliProxyAuthDir(), 'antigravity.json'),
  ]
}

function tokensFromAntigravityRaw(raw) {
  if (!raw || typeof raw !== 'object') return undefined
  const nested = raw.token && typeof raw.token === 'object' ? raw.token : raw
  const access = pickString(
    nested.access_token, nested.accessToken, raw.access_token, raw.accessToken,
  )
  const refresh = pickString(
    nested.refresh_token, nested.refreshToken, raw.refresh_token, raw.refreshToken,
  )
  if (!access || !refresh) return undefined
  const expiresAt = parseTime(nested.expiry ?? nested.expires_at ?? nested.expiresAt ?? raw.expired ?? raw.expires_at)
  let expires_in = asPositiveNumber(nested.expires_in ?? nested.expiresIn ?? raw.expires_in)
  if (expires_in === undefined && expiresAt !== undefined) {
    expires_in = Math.max(Math.round((expiresAt - Date.now()) / 1000), 60)
  }
  return {
    access_token: access,
    refresh_token: refresh,
    expires_in,
    expiresAt,
    account: pickString(raw.email, raw.account, nested.email),
    projectId: pickString(raw.project_id, raw.projectId, nested.project_id, nested.projectId),
    planType: pickString(raw.planType, raw.plan_type, nested.planType),
  }
}

async function readAntigravityJsonFiles(dir) {
  try {
    const names = await readdir(dir)
    const out: any[] = []
    for (const name of names) {
      if (!/^antigravity(-.+)?\.json$/i.test(name)) continue
      const raw = await readJson(join(dir, name))
      if (raw !== undefined) out.push({ path: join(dir, name), raw })
    }
    return out
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return []
    throw error
  }
}

export async function importAntigravityAuth({ paths, fetchFn = outboundFetch }: any = {}) {
  const tried: any[] = []
  const candidates = paths ?? [
    ...antigravityAuthSearchPaths(),
    ...(await readAntigravityJsonFiles(cliProxyAuthDir())).map((row) => row.path),
    ...(await readAntigravityJsonFiles(join(antigravityHomeDir(), 'antigravity'))).map((row) => row.path),
  ]
  const seen = new Set()
  for (const path of candidates) {
    if (!path || seen.has(path)) continue
    seen.add(path)
    tried.push(path)
    const raw = await readJson(path)
    if (raw === undefined) continue
    const tokens = tokensFromAntigravityRaw(raw)
    if (tokens === undefined) continue
    if (tokens.projectId && tokens.account) {
      return {
        session: antigravitySession({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresIn: tokens.expires_in,
          expiresAt: tokens.expiresAt,
          account: tokens.account,
          projectId: tokens.projectId,
          planType: tokens.planType,
        }),
        source: path,
      }
    }
    const session = await completeAntigravityLogin(tokens, {
      fetchFn,
      account: tokens.account,
    })
    return { session, source: path }
  }
  throw new Error(`no Antigravity session found in ${tried.join(' or ')}`)
}
