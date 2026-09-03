/**
 * Live Kiro picker catalog. ListAvailableModels on management.<region>.kiro.dev
 * merges into the Settings picker + oauth-kiro.models yaml. KIRO_MODELS is
 * the offline fallback only. Chat still hops q.<region>.amazonaws.com.
 */

import { createHash } from 'node:crypto'
import {
  KIRO_CONTEXT_WINDOW,
  KIRO_DEEPSEEK_CONTEXT,
  KIRO_GPT_CONTEXT,
  KIRO_LARGE_CONTEXT,
  KIRO_LIST_MODELS_PATH,
  KIRO_LIST_PROFILES_PATH,
  KIRO_MAX_TOKENS,
  KIRO_MODELS,
  KIRO_QWEN_CONTEXT,
  KIRO_REASONING_CLAUDE,
  KIRO_REASONING_CLAUDE_XHIGH,
  KIRO_REASONING_GPT,
  KIRO_TEXT_INPUT,
  KIRO_USAGE_REGIONS,
  KIRO_VISION_INPUT,
  kiroManagementHost,
  kiroStreamingProfileArn,
  kiroUsageHeaders,
  kiroUsageRegions,
} from './index.js'

export const KIRO_CATALOG_TTL_MS = 5 * 60_000
export const KIRO_STATIC_FALLBACK_COUNT = 18

const cached = { tokenHash: '', models: /** @type {any[] | undefined} */ (undefined), expiresAt: 0 }

export function resetKiroCatalogCache() {
  cached.tokenHash = ''
  cached.models = undefined
  cached.expiresAt = 0
}

export function kiroCatalogTokenHash(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16)
}

export function kiroCatalogModels() {
  return cached.models?.length ? cached.models : [...KIRO_MODELS]
}

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asPositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function kiroModelIdOf(raw) {
  const id = trimmed(raw?.modelId ?? raw?.model_id ?? raw?.id)
  return id || undefined
}

function humanizeKiroModelId(id) {
  return id
    .split(/[-_]+/)
    .map((word) => (word === 'gpt' ? 'GPT' : word === 'glm' ? 'GLM' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

function inferKiroInput(id) {
  const key = id.toLowerCase()
  if (key === 'auto' || key.startsWith('claude-') || key.startsWith('gpt-')) return [...KIRO_VISION_INPUT]
  return [...KIRO_TEXT_INPUT]
}

function inferKiroReasoning(id) {
  const key = id.toLowerCase()
  if (key.startsWith('gpt-')) return { ...KIRO_REASONING_GPT }
  if (/claude-(?:opus-5|opus-4\.[78]|sonnet-5|fable-5)|(?:^|-)auto$/.test(key) || key === 'auto') {
    return { ...KIRO_REASONING_CLAUDE_XHIGH }
  }
  if (/claude-(?:opus-4\.6|sonnet-4\.6)/.test(key)) return { ...KIRO_REASONING_CLAUDE }
  return false
}

function inferKiroWindow(id) {
  const key = id.toLowerCase()
  if (key.startsWith('gpt-')) return KIRO_GPT_CONTEXT
  if (key.includes('deepseek')) return KIRO_DEEPSEEK_CONTEXT
  if (key.includes('qwen')) return KIRO_QWEN_CONTEXT
  if (/claude-(?:opus-5|opus-4\.[6-8]|sonnet-5|sonnet-4\.6|fable-5)|(?:^|-)auto$/.test(key) || key === 'auto') {
    return KIRO_LARGE_CONTEXT
  }
  return KIRO_CONTEXT_WINDOW
}

function liveRows(models) {
  const out = []
  for (const model of models ?? []) {
    const id = kiroModelIdOf(model)
    if (!id) continue
    const limits = model.tokenLimits && typeof model.tokenLimits === 'object' ? model.tokenLimits : {}
    out.push({
      id,
      name: trimmed(model.displayName ?? model.display_name ?? model.name) || humanizeKiroModelId(id),
      contextWindow: asPositive(limits.maxInputTokens ?? limits.max_input_tokens ?? model.contextWindow),
      maxTokens: asPositive(limits.maxOutputTokens ?? limits.max_output_tokens ?? model.maxTokens),
    })
  }
  return out
}

function kiroModelRow(id, name, contextWindow, maxTokens, input, reasoningEfforts) {
  return {
    id,
    name,
    contextWindow,
    maxTokens: maxTokens || KIRO_MAX_TOKENS,
    input: input.includes('image') ? [...KIRO_VISION_INPUT] : [...KIRO_TEXT_INPUT],
    reasoningEfforts,
  }
}

/** Merge live ListAvailableModels onto the static fallback. Empty live → []. */
export function toKiroPickerModels(live, fallback = KIRO_MODELS) {
  const byId = new Map()
  for (const row of fallback ?? []) byId.set(row.id, { ...row, input: [...row.input] })
  for (const row of liveRows(live)) {
    const existing = byId.get(row.id)
    byId.set(row.id, kiroModelRow(
      row.id,
      row.name || existing?.name || humanizeKiroModelId(row.id),
      row.contextWindow || existing?.contextWindow || inferKiroWindow(row.id),
      row.maxTokens || existing?.maxTokens || KIRO_MAX_TOKENS,
      existing?.input ?? inferKiroInput(row.id),
      existing?.reasoningEfforts ?? inferKiroReasoning(row.id),
    ))
  }
  const out = []
  const seen = new Set()
  for (const row of fallback ?? []) {
    const next = byId.get(row.id)
    if (next) out.push(next)
    seen.add(row.id)
  }
  for (const [id, row] of byId) {
    if (!seen.has(id)) out.push(row)
  }
  return out
}

export function originalKiroFallbackIds() {
  return KIRO_MODELS
    .map((model) => model.id)
    .filter((id) => id !== 'auto' && id !== 'claude-fable-5')
}

async function readManagementJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function requestManagement(session, { region, path, method, query, fetchFn }) {
  const url = new URL(path, `https://${kiroManagementHost(region)}/`)
  const headers = { ...kiroUsageHeaders(session), accept: 'application/json' }
  const init = { method, headers }
  if (method === 'GET') {
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value != null && String(value).trim()) url.searchParams.set(name, String(value))
    }
  } else {
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(query ?? {})
  }
  return fetchFn(url.toString(), init)
}

async function listAvailableModels(session, { region, profileArn, fetchFn }) {
  const response = await requestManagement(session, {
    region,
    path: KIRO_LIST_MODELS_PATH,
    method: 'GET',
    query: { origin: 'KIRO_CLI', profileArn },
    fetchFn,
  })
  return { status: response.status, body: await readManagementJson(response) }
}

async function listAvailableProfiles(session, { region, fetchFn }) {
  const response = await requestManagement(session, {
    region,
    path: KIRO_LIST_PROFILES_PATH,
    method: 'POST',
    query: {},
    fetchFn,
  })
  return { status: response.status, body: await readManagementJson(response) }
}

function profileArnFrom(body) {
  const profiles = Array.isArray(body?.profiles) ? body.profiles : []
  for (const profile of profiles) {
    const arn = trimmed(profile?.arn ?? profile?.profileArn)
    if (arn) return arn
  }
  return undefined
}

function modelsFrom(body) {
  if (Array.isArray(body?.models)) return body.models
  if (Array.isArray(body)) return body
  return []
}

/**
 * Probe both canonical regions. A regional 403 is "no profile here", not
 * a hard stop — keep going. Empty / failed discovery returns [].
 */
export async function fetchKiroLiveModels(session, options = {}) {
  const fetchFn = options.fetchFn ?? fetch
  const regions = [...new Set([
    ...(options.regions ?? kiroUsageRegions(session)),
    ...KIRO_USAGE_REGIONS,
  ].filter(Boolean))]
  let profileArn = trimmed(options.profileArn) || kiroStreamingProfileArn(session)
  for (const region of regions) {
    try {
      if (profileArn) {
        const listed = await listAvailableModels(session, { region, profileArn, fetchFn })
        const models = modelsFrom(listed.body)
        if (listed.status === 403 || (listed.status < 400 && models.length === 0)) {
          // fall through to profiles / next region
        } else if (listed.status < 400 && models.length) {
          return models
        }
      }
      const profiles = await listAvailableProfiles(session, { region, fetchFn })
      if (profiles.status === 403) continue
      const discovered = profileArnFrom(profiles.body)
      if (discovered) profileArn = discovered
      if (!profileArn) continue
      const listed = await listAvailableModels(session, { region, profileArn, fetchFn })
      if (listed.status === 403) continue
      const models = modelsFrom(listed.body)
      if (models.length) return models
    } catch {
      // Discovery must not block chat or login.
    }
  }
  return []
}

export async function refreshKiroCatalog(session, options = {}) {
  const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : ''
  if (!token) return [...KIRO_MODELS]
  const tokenHash = kiroCatalogTokenHash(token)
  if (cached.tokenHash === tokenHash && cached.models?.length && Date.now() < cached.expiresAt) {
    return cached.models
  }
  try {
    const fetchLive = options.fetchLive ?? fetchKiroLiveModels
    const live = await Promise.resolve(fetchLive(session, options)).catch(() => [])
    const models = toKiroPickerModels(live)
    if (live.length > 0 && models.length > 0) {
      cached.tokenHash = tokenHash
      cached.models = models
      cached.expiresAt = Date.now() + (options.ttlMs ?? KIRO_CATALOG_TTL_MS)
      return models
    }
  } catch {
    // Discovery must not block chat or login.
  }
  if (cached.tokenHash === tokenHash && cached.models?.length) return cached.models
  return [...KIRO_MODELS]
}
