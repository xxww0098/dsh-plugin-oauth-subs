/**
 * Import GitHub Copilot credentials.
 *
 *   ~/.config/github-copilot/hosts.json   (VS Code / copilot.vim)
 *   ~/.config/github-copilot/apps.json
 *   ~/.local/share/opencode/auth.json     (provider github-copilot)
 *
 * Optional KEY source: COPILOT_GITHUB_TOKEN / GITHUB_TOKEN / GH_TOKEN / pasted ghu_|ghp_.
 * Auto-import only local files, and only when the roster is empty.
 * Never overwrite a stored session. Never write back to those files.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  copilotSession,
  isGithubUserToken,
  mintCopilotSessionFromGithub,
  parseCopilotApiKey,
} from './index.js'

export const COPILOT_IMPORT_EMPTY = 'copilot-import-empty'

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function copilotHomePaths({ env = process.env, home = homedir() } = {}) {
  const config = trimmed(env.XDG_CONFIG_HOME) || join(home, '.config')
  const share = trimmed(env.XDG_DATA_HOME) || join(home, '.local', 'share')
  return {
    hosts: join(config, 'github-copilot', 'hosts.json'),
    apps: join(config, 'github-copilot', 'apps.json'),
    opencode: join(share, 'opencode', 'auth.json'),
  }
}

function tokenFromHosts(data) {
  if (!data || typeof data !== 'object') return undefined
  const github = data['github.com'] ?? data.github
  if (github && typeof github === 'object') {
    return trimmed(github.oauth_token) ?? trimmed(github.token) ?? trimmed(github.access_token)
  }
  for (const value of Object.values(data)) {
    if (!value || typeof value !== 'object') continue
    const token = trimmed(value.oauth_token) ?? trimmed(value.token)
    if (token && isGithubUserToken(token)) return token
  }
  return undefined
}

function tokenFromOpencode(data) {
  if (!data || typeof data !== 'object') return undefined
  const row = data['github-copilot'] ?? data.github_copilot ?? data.copilot
  if (!row || typeof row !== 'object') return undefined
  return trimmed(row.refresh) ?? trimmed(row.access) ?? trimmed(row.access_token)
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return undefined
  }
}

export async function resolveCopilotCliCredentials(options = {}) {
  const paths = copilotHomePaths(options)
  const hosts = tokenFromHosts(await readJson(paths.hosts))
  if (hosts) {
    return mintCopilotSessionFromGithub(hosts, { fetchFn: options.fetchFn, source: 'cli' })
  }
  const apps = tokenFromHosts(await readJson(paths.apps))
  if (apps) {
    return mintCopilotSessionFromGithub(apps, { fetchFn: options.fetchFn, source: 'cli' })
  }
  const opencode = tokenFromOpencode(await readJson(paths.opencode))
  if (opencode) {
    return mintCopilotSessionFromGithub(opencode, { fetchFn: options.fetchFn, source: 'cli' })
  }
  return undefined
}

export function resolveCopilotEnvKey({ env = process.env } = {}) {
  const raw = trimmed(env.COPILOT_GITHUB_TOKEN) || trimmed(env.GITHUB_TOKEN) || trimmed(env.GH_TOKEN)
  if (!raw) return undefined
  return { githubToken: parseCopilotApiKey(raw), source: 'env' }
}

export async function importCopilotAuth(options = {}) {
  const cli = await resolveCopilotCliCredentials(options)
  if (cli) return { source: 'cli', session: cli }
  if (options.allowEnv !== false) {
    const envSession = resolveCopilotEnvKey(options)
    if (envSession) {
      const session = await mintCopilotSessionFromGithub(envSession.githubToken, {
        fetchFn: options.fetchFn,
        source: 'env',
      })
      return { source: 'env', session }
    }
  }
  const error = new Error(COPILOT_IMPORT_EMPTY)
  error.code = COPILOT_IMPORT_EMPTY
  throw error
}

/** Build a stored session from a pasted GitHub token (controller useKey). */
export function copilotSessionFromGithubToken(token, extra = {}) {
  const github = parseCopilotApiKey(token)
  return copilotSession({
    accessToken: github,
    refreshToken: github,
    githubToken: github,
    source: extra.source ?? 'paste',
    account: extra.account,
    expiresAt: extra.expiresAt,
  })
}
