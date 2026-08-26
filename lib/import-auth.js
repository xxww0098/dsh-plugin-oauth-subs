/**
 * Import existing Codex CLI / Hermes Agent OAuth sessions so a user who has
 * already logged in on this machine does not have to repeat the browser flow.
 *
 * Recognised files:
 *   ~/.codex/auth.json          Codex CLI
 *   ~/.hermes/auth.json         Hermes Agent multi-provider store
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { codexProfileClaims, codexSession } from './codex.js'
import { grokSession } from './grok.js'

function homeFile(...parts) {
  return join(homedir(), ...parts)
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

function tokensFromCodexCli(raw) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const tokens = raw.tokens ?? raw
  if (typeof tokens.access_token !== 'string') return undefined
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? raw.refresh_token,
    id_token: tokens.id_token ?? raw.id_token,
    expires_in: tokens.expires_in ?? raw.expires_in,
  }
}

function tokensFromHermes(raw, keys) {
  if (typeof raw !== 'object' || raw === null) return undefined
  const providers = raw.providers ?? raw.auth ?? raw
  for (const key of keys) {
    const entry = providers[key] ?? raw[key]
    if (typeof entry !== 'object' || entry === null) continue
    const tokens = entry.tokens ?? entry
    if (typeof tokens.access_token === 'string') {
      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? entry.refresh_token,
        id_token: tokens.id_token ?? entry.id_token,
        expires_in: tokens.expires_in ?? entry.expires_in,
        token_endpoint: entry.token_endpoint ?? entry.tokenEndpoint,
      }
    }
    if (typeof entry.accessToken === 'string') {
      return {
        access_token: entry.accessToken,
        refresh_token: entry.refreshToken,
        id_token: entry.idToken,
        expires_in: undefined,
        token_endpoint: entry.tokenEndpoint,
      }
    }
  }
  return undefined
}

function withExpiry(tokens, lastRefresh) {
  if (typeof tokens.expires_in === 'number' && tokens.expires_in > 0) return tokens
  const stamp = Date.parse(lastRefresh ?? '')
  if (Number.isFinite(stamp)) {
    const remaining = Math.round((stamp + 3_600_000 - Date.now()) / 1000)
    return { ...tokens, expires_in: Math.max(remaining, 60) }
  }
  return { ...tokens, expires_in: 3600 }
}

export async function importCodexAuth() {
  const tried = []
  const paths = [homeFile('.codex', 'auth.json'), homeFile('.hermes', 'auth.json')]
  for (const path of paths) {
    tried.push(path)
    const raw = await readJson(path)
    if (raw === undefined) continue
    const fromCli = path.includes('.codex') ? tokensFromCodexCli(raw) : undefined
    const fromHermes = tokensFromHermes(raw, ['openai-codex', 'openai_codex', 'codex', 'chatgpt'])
    const tokens = fromCli ?? fromHermes
    if (tokens === undefined) continue
    const session = codexSession(withExpiry(tokens, raw.last_refresh ?? raw.lastRefresh))
    return {
      session: {
        ...session,
        ...codexProfileClaims(session.idToken),
      },
      source: path,
    }
  }
  throw new Error(`no Codex session found in ${tried.join(' or ')}`)
}

export async function importGrokAuth() {
  const path = homeFile('.hermes', 'auth.json')
  const raw = await readJson(path)
  if (raw === undefined) throw new Error(`no Grok session found in ${path}`)
  const tokens = tokensFromHermes(raw, ['xai', 'x-ai', 'grok', 'xai-grok'])
  if (tokens === undefined) throw new Error(`Hermes auth.json has no xAI / Grok entry`)
  const session = grokSession(
    withExpiry(tokens),
    tokens.token_endpoint ?? 'https://auth.x.ai/oauth2/token',
  )
  return { session, source: path }
}
