/**
 * OpenCode Go API-key family (quota only).
 *
 * Chat is DSH's builtin opencode-go + OPENCODE_API_KEY (Responses, no
 * loopback hop). This module stores a web session cookie + workspace id
 * so Settings can show remaining quota.
 *
 * Many accounts share the one OPENCODE_API_KEY env: the vault keeps each
 * account's key, and the controller mirrors the active account's key into
 * the host credential so DSH keeps reading a single ref.
 */

import { createHash } from 'node:crypto'

export const OPENCODE_GO_ID = 'opencode-go'
export const OPENCODE_GO_ORIGIN = 'https://opencode.ai'
export const OPENCODE_GO_RESPONSES_URL = 'https://opencode.ai/zen/go/v1'
export const OPENCODE_GO_COOKIE_MASK = '••••••••'

const AUTH_COOKIE_NAMES = new Set(['auth', '__host-auth'])
const WORKSPACE_RE = /wrk_[A-Za-z0-9]+/

export function parseOpencodeGoCookie(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return undefined
  const parts = text.split(';').map((part) => part.trim()).filter(Boolean)
  const picked = []
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (!value) continue
    if (AUTH_COOKIE_NAMES.has(name.toLowerCase())) picked.push(`${name}=${value}`)
  }
  if (picked.length > 0) return picked.join('; ')
  if (text.includes('=') || /\s/.test(text)) return undefined
  return `auth=${text}`
}

export function normalizeOpencodeGoWorkspaceId(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return undefined
  if (/^wrk_[A-Za-z0-9]+$/.test(text)) return text
  try {
    const url = new URL(text)
    const parts = url.pathname.split('/').filter(Boolean)
    const index = parts.indexOf('workspace')
    if (index >= 0) {
      const candidate = parts[index + 1]
      if (typeof candidate === 'string' && /^wrk_[A-Za-z0-9]+$/.test(candidate)) return candidate
    }
  } catch {
    // not a URL
  }
  const match = text.match(WORKSPACE_RE)
  return match ? match[0] : undefined
}

/** Stable account id: workspace when known, else a hash of the secret. */
export function opencodeGoAccountId({ workspaceId, apiKey, cookieHeader } = {}) {
  const workspace = normalizeOpencodeGoWorkspaceId(workspaceId)
  if (workspace) return workspace
  const secret = String(apiKey ?? '').trim() || String(cookieHeader ?? '').trim()
  if (!secret) return undefined
  return `go_${createHash('sha256').update(secret).digest('hex').slice(0, 12)}`
}

/** Masked identity for a keyed account that has no workspace id yet. */
export function opencodeGoKeyHint(apiKey) {
  const key = String(apiKey ?? '').trim()
  if (!key) return ''
  const tail = key.slice(-4)
  return key.startsWith('sk-') ? `sk-…${tail}` : `…${tail}`
}

export function publicOpencodeGoAccount(id, entry, quota, active) {
  const workspaceId = String(entry?.workspaceId ?? '').trim()
  const email = String(entry?.email ?? '').trim()
  return {
    id,
    active: Boolean(active),
    // Human title first: the dashboard email when the cookie scraped one,
    // else the workspace id (or the controller's key hint).
    account: email || workspaceId,
    email,
    workspaceId,
    cookieSet: Boolean(entry?.cookieHeader),
    apiKeySet: Boolean(entry?.apiKey),
    quota: quota ?? { status: 'idle' },
  }
}

export function publicOpencodeGo(vault, quotas) {
  const accounts = Object.entries(vault?.accounts ?? {})
    .map(([id, entry]) => publicOpencodeGoAccount(id, entry, quotas?.get?.(id), id === vault?.activeId))
    .sort((left, right) => Number(right.active) - Number(left.active) || left.id.localeCompare(right.id))
  return {
    id: OPENCODE_GO_ID,
    activeId: vault?.activeId,
    accounts,
  }
}

export function isOpencodeGoCookieMask(value) {
  return String(value ?? '').trim() === OPENCODE_GO_COOKIE_MASK
}
