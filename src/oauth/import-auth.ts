/**
 * Shared, vendor-agnostic helpers for the per-family local-session importers
 * (probe-read JSON, token-expiry normalisation, Hermes multi-provider store
 * parsing). Every family-specific importer lives in its family folder
 * (`src/oauth/<id>/import.ts`); this file re-exports those entry points as a
 * compatibility barrel so existing `from './import-auth.js'` callers keep
 * working. The barrel is scheduled to shrink as callers migrate to the family
 * paths — no importer logic stays here.
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { errorCode } from '../utils/http.js'
import { decodeJwtPayload } from '../utils/jwt.js'

export { importCodexAuth, codexImported } from './codex/import.js'
export {
  GROK_HERMES_KEYS,
  grokAuthSearchPaths,
  tokensFromGrokCli,
  importGrokAuth,
} from './grok/import.js'
export {
  glmZcodeDisabledReason,
  glmKeyCandidateFromZcodeConfig,
  glmKeyFromZcodeConfig,
  decodeZcodeCredentialValue,
  glmKeyFromZcodeCredentials,
  glmAuthSearchPaths,
  importGlmAuth,
} from './glm/import.js'
export { antigravityAuthSearchPaths, importAntigravityAuth } from './antigravity/import.js'
export { kiroAuthSearchPaths, sessionFromKiroAuth, importKiroAuth } from './kiro/import.js'

export function homeFile(...parts) {
  return join(homedir(), ...parts)
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    // Probe semantics: a candidate that is missing, unreadable (EACCES/EPERM/
    // ELOOP/EISDIR) or malformed means "no session here". One bad file must not
    // abort the whole multi-path import search.
    const code = errorCode(error)
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'ELOOP' || code === 'EISDIR') {
      return undefined
    }
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export function asPositiveNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

export function parseTime(value) {
  if (value == null) return undefined
  if (value instanceof Date) {
    const ms = value.getTime()
    return Number.isFinite(ms) ? ms : undefined
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1e12 ? value : value * 1000
  }
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (/^\d+(\.\d+)?$/.test(trimmed)) return parseTime(Number(trimmed))
  const iso = trimmed.replace(/(\.\d{3})\d+/, '$1').replace(' ', 'T')
  const stamp = Date.parse(iso)
  return Number.isFinite(stamp) ? stamp : undefined
}

export function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return undefined
}

function hermesEntryTokens(entry) {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined
  const nested = entry.tokens ?? entry
  const access = pickString(nested.access_token, nested.accessToken, entry.access_token, entry.accessToken)
  const refresh = pickString(nested.refresh_token, nested.refreshToken, entry.refresh_token, entry.refreshToken)
  if (typeof access !== 'string') return undefined
  const payload = decodeJwtPayload(access)
  return {
    access_token: access,
    refresh_token: refresh,
    id_token: pickString(nested.id_token, nested.idToken, entry.id_token, entry.idToken),
    expires_in: nested.expires_in ?? nested.expiresIn ?? entry.expires_in ?? entry.expiresIn,
    expires_at: nested.expires_at ?? nested.expiresAt ?? entry.expires_at ?? entry.expiresAt,
    last_refresh: pickString(entry.last_refresh, entry.lastRefresh, nested.last_refresh, nested.lastRefresh),
    token_endpoint: pickString(
      entry.token_endpoint,
      entry.tokenEndpoint,
      nested.token_endpoint,
      entry.discovery?.token_endpoint,
      entry.discovery?.tokenEndpoint,
    ),
    account: pickString(entry.email, entry.account, nested.email, payload?.email, payload?.preferred_username),
  }
}

export function tokensFromHermes(raw, keys) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const providers = raw.providers ?? raw.auth ?? raw
  for (const key of keys) {
    const tokens = hermesEntryTokens(providers[key] ?? raw[key])
    if (tokens !== undefined) return tokens
  }
  const pool = raw.credential_pool ?? raw.credentialPool
  if (typeof pool === 'object' && pool !== null) {
    for (const key of keys) {
      const rows = pool[key]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const tokens = hermesEntryTokens(row)
        if (tokens !== undefined) return tokens
      }
    }
  }
  return undefined
}

export function withExpiry(tokens, lastRefresh) {
  const existing = asPositiveNumber(tokens.expires_in)
  if (existing !== undefined) return { ...tokens, expires_in: existing }
  const fromAt = parseTime(tokens.expires_at)
  if (fromAt !== undefined) {
    return { ...tokens, expires_in: Math.max(Math.round((fromAt - Date.now()) / 1000), 60) }
  }
  const stamp = parseTime(lastRefresh ?? tokens.last_refresh)
  if (stamp !== undefined) {
    const remaining = Math.round((stamp + 3_600_000 - Date.now()) / 1000)
    return { ...tokens, expires_in: Math.max(remaining, 60) }
  }
  return { ...tokens, expires_in: 3600 }
}
