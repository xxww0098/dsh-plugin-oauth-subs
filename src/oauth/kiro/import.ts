/**
 * Kiro credential import. Formats distilled from kiro-manager-lite
 * (https://github.com/lucks-cloud/kiro-manager-lite) plus kiro.rs dumps
 * and the Kiro IDE SSO cache. Original parsers — do not copy AGPL source.
 *
 * Recognised:
 *   卡密        email----password----refreshToken----clientId----clientSecret----provider
 *   compact JSON  [{ email, refreshToken, provider, clientId, clientSecret }]
 *   full backup   { app: "kiro-account-lite", accounts: [{ credentials, idp, email }] }
 *   CSV / TXT     header aliases 邮箱/email/refreshToken/登录方式
 *   kiro.rs       credentials.json array or object
 *   IDE token     ~/.aws/sso/cache/kiro-auth-token.json (+ client registration json)
 *   API keys      ksk_… lines
 */

import { createHash } from 'node:crypto'
import { BUILDER_ID_START_URL, isKiroCredential, kiroSessionFromImport } from './index.js'

const CSV_HEADERS = Object.freeze({
  email: 'email',
  邮箱: 'email',
  nickname: 'nickname',
  昵称: 'nickname',
  provider: 'provider',
  idp: 'provider',
  登录方式: 'provider',
  password: 'password',
  密码: 'password',
  refreshtoken: 'refreshToken',
  'refresh token': 'refreshToken',
  clientid: 'clientId',
  clientsecret: 'clientSecret',
  region: 'region',
  kiroapikey: 'kiroApiKey',
  'api key': 'kiroApiKey',
})

export function kiroSsoClientIdHash(startUrl = BUILDER_ID_START_URL) {
  return createHash('sha1').update(JSON.stringify({ startUrl: startUrl || BUILDER_ID_START_URL })).digest('hex')
}

/** Merge Kiro IDE token file with the hashed OIDC client registration next to it. */
export function hydrateKiroSsoToken(token, registration) {
  if (!token || typeof token !== 'object') return token
  const method = String(token.authMethod ?? token.auth_method ?? '').toLowerCase()
  if (method === 'social') return token
  if (token.clientId && token.clientSecret) return token
  if (!registration || typeof registration !== 'object') return token
  return {
    ...token,
    clientId: token.clientId ?? token.client_id ?? registration.clientId ?? registration.client_id,
    clientSecret: token.clientSecret ?? token.client_secret ?? registration.clientSecret ?? registration.client_secret,
    startUrl: token.startUrl ?? token.start_url ?? BUILDER_ID_START_URL,
  }
}

export function flattenKiroImport(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw.filter((row) => row && typeof row === 'object')
  if (typeof raw !== 'object') return []
  if (Array.isArray(raw.credentials) && raw.credentials.every((row) => row && typeof row === 'object')) {
    return raw.credentials
  }
  if (Array.isArray(raw.accounts)) return raw.accounts.filter((row) => row && typeof row === 'object')
  if (raw.credentials && typeof raw.credentials === 'object' && !Array.isArray(raw.credentials)
    && (raw.email || raw.idp || raw.account)) {
    return [raw]
  }
  return [raw]
}

export function sessionsFromKiroAuth(raw) {
  const out = []
  for (const entry of flattenKiroImport(raw)) {
    if (!isKiroCredential(entry)) continue
    try {
      out.push(kiroSessionFromImport(entry))
    } catch {
      continue
    }
  }
  return out
}

function splitKamiLine(line) {
  if (line.includes('----')) return line.split('----')
  if (line.includes('\t')) return line.split('\t')
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/)
  return line.split(',')
}

function kamiEntry(parts) {
  const cells = parts.map((part) => String(part ?? '').trim())
  const refreshToken = cells[2] || ''
  const kiroApiKey = cells[0]?.startsWith('ksk_') && cells.length === 1 ? cells[0] : undefined
  if (kiroApiKey) return { kiroApiKey, authMethod: 'api_key' }
  if (!refreshToken) return undefined
  return {
    email: cells[0] || undefined,
    refreshToken,
    clientId: cells[3] || undefined,
    clientSecret: cells[4] || undefined,
    provider: cells[5] || undefined,
  }
}

function parseKamiText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => kamiEntry(splitKamiLine(line)))
    .filter(Boolean)
}

function parseCsvRow(row) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (quoted) {
      if (ch === '"') {
        if (row[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += ch
    } else if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((cell) => cell.trim())
}

function parseCsvText(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const headers = parseCsvRow(lines[0]).map((h) => CSV_HEADERS[h.toLowerCase()])
  if (headers.filter(Boolean).length < 2) return parseKamiText(text)
  return lines.slice(1).map((line) => {
    const cells = parseCsvRow(line)
    const item = {}
    headers.forEach((key, i) => {
      if (!key) return
      const value = cells[i]
      if (value) item[key] = value
    })
    return item
  }).filter((item) => item.refreshToken || item.kiroApiKey)
}

function looksLikeCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || ''
  if (!first.includes(',')) return false
  if (first.includes('----')) return false
  const lower = first.toLowerCase()
  return /email|邮箱|refreshtoken|登录方式|provider|clientid|kiroapikey/.test(lower)
}

function jsonSessions(parsed) {
  return sessionsFromKiroAuth(parsed)
}

/**
 * @returns {{ kind: string, sessions: object[] }}
 * kind: json | kami | csv | keys | raw-token | empty
 */
export function parseKiroImportText(raw) {
  const text = String(raw ?? '').replace(/^\uFEFF/, '').trim()
  if (!text) return { kind: 'empty', sessions: [] }

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      return { kind: 'json', sessions: jsonSessions(parsed) }
    } catch {
      // fall through to line formats
    }
  }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  if (lines.length === 1 && lines[0].startsWith('ksk_') && !lines[0].includes('----') && !lines[0].includes(',')) {
    try {
      return { kind: 'keys', sessions: [kiroSessionFromImport({ kiroApiKey: lines[0], authMethod: 'api_key' })] }
    } catch {
      return { kind: 'keys', sessions: [] }
    }
  }

  if (looksLikeCsv(text)) {
    return { kind: 'csv', sessions: sessionsFromKiroAuth(parseCsvText(text)) }
  }

  if (text.includes('----') || (lines.length > 1 && (text.includes('\t') || text.includes(',')))) {
    return { kind: 'kami', sessions: sessionsFromKiroAuth(parseKamiText(text)) }
  }

  if (lines.length === 1 && !lines[0].includes('----') && !lines[0].includes(',')) {
    return { kind: 'raw-token', sessions: [] }
  }

  return { kind: 'kami', sessions: sessionsFromKiroAuth(parseKamiText(text)) }
}

export function isKiroBatchImport(kind) {
  return kind === 'json' || kind === 'kami' || kind === 'csv' || kind === 'keys'
}
