/**
 * Outbound HTTP(S) proxy for upstream model / quota / login hops.
 * Never used for the 127.0.0.1 loopback server itself.
 *
 * Resolution: plugin config proxyUrl > Settings outbound-proxy.json > env
 * (HTTPS_PROXY / HTTP_PROXY / ALL_PROXY). Loopback and NO_PROXY stay direct.
 * Does not call setGlobalDispatcher — DSH and other plugins keep their fetch.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ProxyAgent, fetch } from 'undici'
import { describeError } from './http.js'

export const OUTBOUND_PROXY_FILE = 'outbound-proxy.json'

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '[::1]'])

export function outboundProxyPath(dataDir) {
  return join(dataDir, OUTBOUND_PROXY_FILE)
}

export function normalizeProxyUrl(raw) {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  let parsed
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (!parsed.hostname) return undefined
  const auth = parsed.username
    ? `${decodeURIComponent(parsed.username)}${parsed.password ? `:${decodeURIComponent(parsed.password)}` : ''}@`
    : ''
  return `${parsed.protocol}//${auth}${parsed.host}`
}

export function envProxyUrl(env = process.env) {
  return normalizeProxyUrl(
    env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || env.ALL_PROXY || env.all_proxy,
  )
}

export function envNoProxy(env = process.env) {
  const raw = env.NO_PROXY || env.no_proxy || ''
  return String(raw).split(/[\s,]+/).map((part) => part.trim()).filter(Boolean)
}

export function resolveProxyUrl(configUrl, settingsUrl, env = process.env) {
  return normalizeProxyUrl(configUrl) || normalizeProxyUrl(settingsUrl) || envProxyUrl(env)
}

export function proxySource(configUrl, settingsUrl, env = process.env) {
  if (normalizeProxyUrl(configUrl)) return 'config'
  if (normalizeProxyUrl(settingsUrl)) return 'settings'
  if (envProxyUrl(env)) return 'env'
  return 'off'
}

export function shouldBypassProxy(target, noProxy = envNoProxy()) {
  let url
  try {
    url = typeof target === 'string' ? new URL(target) : new URL(String(target?.url ?? target))
  } catch {
    return true
  }
  const host = String(url.hostname || '').replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) return true
  if (LOCAL_HOSTS.has(host) || host.endsWith('.localhost')) return true
  for (const rule of noProxy) {
    const needle = String(rule).trim().toLowerCase()
    if (!needle) continue
    if (needle === '*') return true
    const bare = needle.startsWith('.') ? needle.slice(1) : needle
    if (host === bare) return true
    if (needle.startsWith('.') && host.endsWith(needle)) return true
    if (host.endsWith(`.${bare}`)) return true
  }
  return false
}

export function redactProxyUrl(url) {
  const normalized = normalizeProxyUrl(url)
  if (!normalized) return ''
  try {
    const parsed = new URL(normalized)
    if (!parsed.username && !parsed.password) return normalized
    parsed.username = '***'
    parsed.password = ''
    return `${parsed.protocol}//***@${parsed.host}`
  } catch {
    return normalized
  }
}

export function normalizeOutboundPrefs(raw) {
  const url = typeof raw?.url === 'string' ? raw.url.trim() : ''
  return { url }
}

export function defaultOutboundPrefs() {
  return { url: '' }
}

export async function readOutboundPrefs(path) {
  try {
    const text = await readFile(path, 'utf8')
    return normalizeOutboundPrefs(JSON.parse(text))
  } catch {
    return defaultOutboundPrefs()
  }
}

export async function writeOutboundPrefs(path, prefs) {
  const next = normalizeOutboundPrefs(prefs)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(next) + '\n', { encoding: 'utf8', mode: 0o600 })
  return next
}

function makeAgent(url, agentFor) {
  return typeof agentFor === 'function' ? agentFor(url) : new ProxyAgent(url)
}

async function release(agent) {
  try {
    await agent?.close?.()
  } catch { /* already closed */ }
}

function requestUrl(input) {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object' && typeof input.url === 'string') return input.url
  try {
    return String(input)
  } catch {
    return ''
  }
}

/**
 * Owns the proxy agent. `ready` always settles; a build failure is kept as
 * `error` and fails every proxied request instead of silently going direct.
 */
export function createOutboundSession({
  path,
  configUrl,
  env = process.env,
  fetchFn = fetch,
  agentFor,
}: any = {}) {
  let settingsUrl = ''
  let agent = undefined
  let error = ''
  // Last proxied transport failure: an agent that builds fine can still point
  // at a dead proxy, and the settings page must show that too.
  let failure = ''

  function resolvedUrl() {
    return resolveProxyUrl(configUrl, settingsUrl, env)
  }

  async function load() {
    try {
      if (path) settingsUrl = (await readOutboundPrefs(path)).url
      const url = resolvedUrl()
      agent = url ? makeAgent(url, agentFor) : undefined
    } catch (caught) {
      error = describeError(caught)
    }
  }

  const ready = load()

  const wrapped = (input, init: any = {}) => {
    const target = requestUrl(input)
    if (!target || shouldBypassProxy(target, envNoProxy(env))) return fetchFn(input, init)
    if (!agent) {
      return error
        ? Promise.reject(new Error(`outbound proxy unavailable: ${error}`))
        : fetchFn(input, init)
    }
    const via = redactProxyUrl(resolvedUrl())
    return fetchFn(input, { ...init, dispatcher: agent }).then((response) => {
      failure = ''
      return response
    }, (caught) => {
      if (init?.signal?.aborted) throw caught
      failure = `${describeError(caught)} via ${via}`
      throw new Error(`outbound proxy unavailable: ${failure}`)
    })
  }

  return {
    ready,
    fetchFn: wrapped,
    resolvedUrl,
    snapshot() {
      const url = resolvedUrl()
      return {
        url: redactProxyUrl(url),
        source: proxySource(configUrl, settingsUrl, env),
        configured: Boolean(url),
        ...(error || failure ? { error: error || failure } : {}),
      }
    },
    async setUrl(raw) {
      const text = raw == null ? '' : String(raw).trim()
      const nextSettings = text ? normalizeProxyUrl(text) : ''
      if (nextSettings === undefined) {
        throw new Error('Invalid proxy URL; use http(s)://host:port')
      }
      // Build → persist → swap: a failure at either step leaves file and state as they were.
      const url = resolveProxyUrl(configUrl, nextSettings, env)
      const next = url ? makeAgent(url, agentFor) : undefined
      try {
        if (path) await writeOutboundPrefs(path, { url: nextSettings })
      } catch (caught) {
        void release(next)
        throw caught
      }
      const prev = agent
      settingsUrl = nextSettings
      agent = next
      error = ''
      failure = ''
      void release(prev)
      return this.snapshot()
    },
    /** Frees the agent; later proxied requests fail instead of going direct. */
    async close() {
      const prev = agent
      agent = undefined
      if (resolvedUrl()) error = 'closed'
      await release(prev)
    },
  }
}
