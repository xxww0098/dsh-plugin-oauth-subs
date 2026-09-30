/**
 * Live Kiro picker catalog. ListAvailableModels on management.<region>.kiro.dev,
 * asked with the chat origin, is the picker + oauth-kiro.models yaml: the
 * backend gates chat per origin, so a model missing from that list 400s
 * INVALID_MODEL_ID. KIRO_MODELS is the offline fallback only. Chat still hops
 * q.<region>.amazonaws.com.
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
  kiroProfileArn,
  kiroUsageHeaders,
  kiroUsageRegions,
} from './index.js'
import { KIRO_CHAT_ORIGIN } from './request.js'
import { outboundFetch, outboundProxyFor } from '../../utils/outbound.js'

export const KIRO_CATALOG_TTL_MS = 5 * 60_000

const cached: { tokenHash: string; models?: any[]; expiresAt: number } = { tokenHash: '', models: undefined, expiresAt: 0 }

export function resetKiroCatalogCache() {
  cached.tokenHash = ''
  cached.models = undefined
  cached.expiresAt = 0
}

export function kiroCatalogTokenHash(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex').slice(0, 16)
}

export function kiroCatalogModels() {
  return cached.models?.length ? [...cached.models] : [...KIRO_MODELS]
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
  if (key.startsWith('claude-') || key.startsWith('gpt-')) return [...KIRO_VISION_INPUT]
  return [...KIRO_TEXT_INPUT]
}

function inferKiroReasoning(id) {
  const key = id.toLowerCase()
  if (key.startsWith('gpt-')) return { ...KIRO_REASONING_GPT }
  if (/claude-(?:opus-5|opus-4\.[78]|sonnet-5|fable-5(?:\.1|-1)?)/.test(key)) {
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
  if (/claude-(?:opus-5|opus-4\.[6-8]|sonnet-5|sonnet-4\.6|fable-5(?:\.1|-1)?)/.test(key)) {
    return KIRO_LARGE_CONTEXT
  }
  return KIRO_CONTEXT_WINDOW
}

function liveInputOf(model) {
  const types = model?.supportedInputTypes ?? model?.supported_input_types
  if (Array.isArray(types) && types.some((t) => String(t).toUpperCase() === 'IMAGE')) {
    return [...KIRO_VISION_INPUT]
  }
  if (Array.isArray(types) && types.length > 0) {
    return [...KIRO_TEXT_INPUT]
  }
  return undefined
}

const KIRO_DSH_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/**
 * Effort ladder from the row's request-field schema: Claude
 * `output_config.effort`, GPT `reasoning.effort` (`none` → DSH `off`).
 * A null schema means no reasoning fields; an absent one defers to fallback.
 */
function liveEffortsOf(model) {
  const schema = model?.additionalModelRequestFieldsSchema
  if (schema === undefined) return undefined
  const props = schema?.properties
  const values = props?.output_config?.properties?.effort?.enum ?? props?.reasoning?.properties?.effort?.enum
  const efforts = {}
  for (const value of Array.isArray(values) ? values : []) {
    const key = value === 'none' ? 'off' : value
    if (key === 'off' || KIRO_DSH_EFFORTS.has(key)) efforts[key] = value
  }
  return Object.keys(efforts).length ? efforts : false
}

function liveRows(models) {
  const out: any[] = []
  for (const model of models ?? []) {
    const id = kiroModelIdOf(model)
    // Auto stays out of the picker even when the live list offers it.
    if (!id || id === 'auto') continue
    const limits = model.tokenLimits && typeof model.tokenLimits === 'object' ? model.tokenLimits : {}
    out.push({
      id,
      name: trimmed(model.displayName ?? model.display_name ?? model.modelName ?? model.name),
      contextWindow: asPositive(limits.maxInputTokens ?? limits.max_input_tokens ?? model.contextWindow),
      maxTokens: asPositive(limits.maxOutputTokens ?? limits.max_output_tokens ?? model.maxTokens),
      input: liveInputOf(model),
      reasoningEfforts: liveEffortsOf(model),
      rate: asPositive(model.rateMultiplier),
    })
  }
  return out
}

function kiroModelRow(id, name, contextWindow, maxTokens, input, reasoningEfforts, rate = undefined) {
  return {
    id,
    name,
    contextWindow,
    maxTokens: maxTokens || KIRO_MAX_TOKENS,
    input: input.includes('image') ? [...KIRO_VISION_INPUT] : [...KIRO_TEXT_INPUT],
    reasoningEfforts,
    // Credits per unit of work relative to the base rate, as the live list states it.
    ...(rate ? { rate } : {}),
  }
}

/**
 * Live ListAvailableModels is the picker: fallback rows it omits are dropped
 * (they would 400 INVALID_MODEL_ID). Fallback only lends order, pretty names,
 * and anything the live row lacks. Empty live → [].
 */
export function toKiroPickerModels(live, fallback = KIRO_MODELS) {
  const known = new Map((fallback ?? []).map((row, index) => [row.id, { row, index }]))
  const byId = new Map()
  for (const row of liveRows(live)) {
    const existing = known.get(row.id)?.row
    byId.set(row.id, kiroModelRow(
      row.id,
      existing?.name || row.name || humanizeKiroModelId(row.id),
      row.contextWindow || existing?.contextWindow || inferKiroWindow(row.id),
      row.maxTokens || existing?.maxTokens || KIRO_MAX_TOKENS,
      row.input ?? existing?.input ?? inferKiroInput(row.id),
      row.reasoningEfforts ?? existing?.reasoningEfforts ?? inferKiroReasoning(row.id),
      row.rate,
    ))
  }
  const rank = (id) => known.get(id)?.index ?? known.size
  return [...byId.values()].sort((a, b) => rank(a.id) - rank(b.id))
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

const KIRO_MANAGEMENT_TIMEOUT_MS = 15_000

/**
 * Discovery must not block chat or login — and must not hang either: bound the
 * management call so a stalled or half-open endpoint cannot pin the caller.
 */
function managementSignal(ms = KIRO_MANAGEMENT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  if (typeof timer.unref === 'function') timer.unref()
  return controller.signal
}

async function requestManagement(session, { region, path, method, query, fetchFn }) {
  const url = new URL(path, `https://${kiroManagementHost(region)}/`)
  const headers = { ...kiroUsageHeaders(session), accept: 'application/json' }
  const init: any = { method, headers, signal: managementSignal() }
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

async function listAvailableModels(session, { region, profileArn, fetchFn, origin = KIRO_CHAT_ORIGIN }) {
  const response = await requestManagement(session, {
    region,
    path: KIRO_LIST_MODELS_PATH,
    method: 'GET',
    query: { origin, profileArn },
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
 * `options.origin` defaults to the chat origin (the picker); `scripts/models.ts`
 * asks `KIRO_CONSOLE` for the governance list the static snapshot mirrors.
 */
export async function fetchKiroLiveModels(session, options: any = {}) {
  const fetchFn = options.fetchFn ?? outboundFetch
  const origin = options.origin ?? KIRO_CHAT_ORIGIN
  const regions = [...new Set([
    ...(options.regions ?? kiroUsageRegions(session)),
    ...KIRO_USAGE_REGIONS,
  ].filter(Boolean))]
  let profileArn = trimmed(options.profileArn) || kiroProfileArn(session)
  for (const region of regions) {
    try {
      if (profileArn) {
        const listed = await listAvailableModels(session, { region, profileArn, fetchFn, origin })
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
      const listed = await listAvailableModels(session, { region, profileArn, fetchFn, origin })
      if (listed.status === 403) continue
      const models = modelsFrom(listed.body)
      if (models.length) return models
    } catch {
      // Discovery must not block chat or login.
    }
  }
  return []
}

export async function refreshKiroCatalog(session, options: any = {}) {
  const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : ''
  if (!token) return [...KIRO_MODELS]
  // The live list is region-filtered by egress (a CN egress gets no Claude),
  // so a proxy change must miss the cache just like a new token.
  const tokenHash = kiroCatalogTokenHash(`${token}\n${await outboundProxyFor(`https://${kiroManagementHost()}/`) ?? ''}`)
  if (cached.tokenHash === tokenHash && cached.models?.length && Date.now() < cached.expiresAt) {
    return [...cached.models]
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
  if (cached.tokenHash === tokenHash && cached.models?.length) return [...cached.models]
  return [...KIRO_MODELS]
}
