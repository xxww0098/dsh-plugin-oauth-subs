/**
 * Devin model catalog. Live rows come from
 * `ApiServerService/GetCliModelConfigs` — 200+ `ClientModelConfig` entries
 * covering every effort tier of every family. The picker is projected as one
 * row per (family × modifier bucket): effort is a `chat_model_uid` suffix
 * upstream, so each row carries `variants: { effortKey → uid }` and the
 * family default (`is_default_model_in_family`) as `defaultUid`.
 *
 * Row id = family uid (`swe-2`), with `-thinking` / `-fast` / `-priority` /
 * `-1m` appended for configs whose label marks that bucket. A raw uid
 * (`swe-2-high`) still resolves as-is — `devinWireModelId` falls through.
 */

import {
  DEVIN_MODELS,
  devinApiServer,
  DEVIN_MODELS_PATH,
  DEVIN_MODEL_DISPLAYS,
} from './index.js'
import { devinBasicAuth, devinMetadataBytes } from './request.js'
import {
  decodeGetCliModelConfigsResponse,
  decodeUnaryBody,
  encodeGetCliModelConfigsRequest,
} from './proto.js'
import { describeError } from '../../utils/http.js'

const EFFORT_WORDS = Object.freeze({
  none: 'off',
  'no thinking': 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  'x-high': 'xhigh',
  'extra high': 'xhigh',
  max: 'max',
})

const MODIFIER_WORDS = Object.freeze({
  fast: 'fast',
  priority: 'priority',
  '1m': '1m',
})

/**
 * Label suffix after the family label, e.g. "Claude Opus 5" + "Low Fast"
 * → { effort: 'low', mods: ['fast'] }. "Thinking" is a bucket of its own
 * unless an effort word is also present ("… Medium Thinking" = effort only).
 */
export function devinLabelVariant(label, familyLabel) {
  const rest = String(label ?? '').trim().toLowerCase()
  const base = String(familyLabel ?? '').trim().toLowerCase()
  let suffix = rest
  if (base && rest.startsWith(base)) suffix = rest.slice(base.length).trim()
  if (!suffix) return { effort: undefined, thinking: false, mods: [] }
  // Multi-word efforts ("no thinking", "x-high", "extra high") before splitting.
  const direct = EFFORT_WORDS[suffix]
  if (direct !== undefined) return { effort: direct, thinking: false, mods: [] }
  const words = suffix.split(/\s+/)
  const mods = []
  let thinking = false
  const kept = []
  for (const word of words) {
    if (MODIFIER_WORDS[word]) {
      mods.push(MODIFIER_WORDS[word])
    } else if (word === 'thinking' || word === 'think') {
      thinking = true
    } else {
      kept.push(word)
    }
  }
  const joined = kept.join(' ')
  const effort = EFFORT_WORDS[joined]
  // "No Thinking" already lands on `off` via EFFORT_WORDS; a bare "Thinking"
  // variant (claude-4.6 style) is the thinking bucket, not an effort.
  if (effort !== undefined) return { effort, thinking: false, mods }
  return { effort: undefined, thinking, mods }
}

function familyKeyOf(config) {
  return config?.modelInfo?.modelFamilyUid
    || (typeof config?.familyLabel === 'string' ? config.familyLabel.trim().toLowerCase().replace(/[\s.]+/g, '-') : undefined)
}

function rowIdFor(family, bucket) {
  return bucket ? `${family}-${bucket}` : family
}

function bucketSuffix(bucket) {
  if (!bucket) return ''
  return ` ${bucket.split('-').map((part) => (part === '1m' ? '1M' : part[0].toUpperCase() + part.slice(1))).join(' ')}`
}

/**
 * Collapse ClientModelConfig[] into picker rows. Internal rows carry
 * `variants` + `defaultUid`; `toHarnessModel` projects only the public fields.
 */
export function toDevinPickerModels(configs) {
  const rows = []
  const groups = new Map()
  for (const config of Array.isArray(configs) ? configs : []) {
    if (!config || config.disabled === true) continue
    const uid = String(config.modelUid ?? config.modelInfo?.modelUid ?? '').trim()
    if (!uid) continue
    const family = familyKeyOf(config)
    if (!family) continue // family-less legacy MODEL_PRIVATE_* rows
    const variant = devinLabelVariant(config.label, config.familyLabel)
    const mods = variant.mods.filter((mod) => mod === 'fast' || mod === 'priority' || mod === '1m')
    const bucketId = [variant.effort === undefined && variant.thinking ? 'thinking' : '', ...mods].filter(Boolean).join('-')
    const key = `${family}||${bucketId}`
    let group = groups.get(key)
    if (!group) {
      group = { family, bucket: bucketId, label: config.familyLabel || config.label || family, configs: [] }
      groups.set(key, group)
    }
    group.configs.push({ config, uid, effort: variant.effort })
  }

  for (const group of groups.values()) {
    const variants = {}
    let defaultUid
    let contextWindow = 0
    let maxTokens = 0
    let images = false
    let recommended = false
    for (const { config, uid, effort } of group.configs) {
      if (effort !== undefined && variants[effort] === undefined) variants[effort] = uid
      if (effort === undefined) {
        // bare uid (e.g. `glm-5-2` labelled "High" never reaches here — it has
        // an effort word); a true no-effort config is the bucket default.
        defaultUid = defaultUid ?? uid
      }
      if (config.isDefaultInFamily || config.familyDefault) defaultUid = uid
      const ctx = Number(config.modelInfo?.maxTokens ?? config.maxTokens ?? 0)
      const out = Number(config.modelInfo?.maxOutputTokens ?? 0)
      if (ctx > contextWindow) contextWindow = ctx
      if (out > maxTokens) maxTokens = out
      if (config.supportsImages) images = true
      if (config.isRecommended) recommended = true
    }
    // default: upstream flag > medium effort > first uid
    if (!defaultUid) defaultUid = variants.medium ?? variants.high ?? group.configs[0]?.uid
    if (!defaultUid) continue
    const efforts = Object.keys(variants)
    rows.push({
      id: rowIdFor(group.family, group.bucket),
      name: `${group.label}${bucketSuffix(group.bucket)}`,
      contextWindow: contextWindow || 200_000,
      maxTokens: maxTokens || undefined,
      input: images ? ['text', 'image'] : ['text'],
      recommended,
      variants: Object.freeze(variants),
      defaultUid,
      reasoningEfforts: efforts.length > 0 ? Object.freeze({ ...variants }) : false,
    })
  }
  rows.sort((a, b) => Number(b.recommended === true) - Number(a.recommended === true) || a.name.localeCompare(b.name))
  return rows
}

let devinCatalogCache

export function devinCatalogModels() {
  return devinCatalogCache ?? DEVIN_MODELS
}

export function devinModelById(id) {
  const wanted = String(id ?? '').trim()
  if (!wanted) return undefined
  return devinCatalogModels().find((row) => row.id === wanted)
    ?? devinCatalogModels().find((row) => row.defaultUid === wanted || Object.values(row.variants ?? {}).includes(wanted))
}

/** Some Devin rows declare efforts; the provider compat key must not 400 them. */
export function devinHasEffort() {
  return devinCatalogModels().some((row) => row.reasoningEfforts && typeof row.reasoningEfforts === 'object')
}

/**
 * POST ApiServerService/GetCliModelConfigs (unary application/proto, raw body).
 * Returns the decoded ClientModelConfig list; throws on transport errors.
 */
export async function devinListModelConfigs(session, { fetchFn = fetch, signal } = {}) {
  const base = devinApiServer(session)
  const body = encodeGetCliModelConfigsRequest(devinMetadataBytes(session, { modelDisplays: DEVIN_MODEL_DISPLAYS }))
  const response = await fetchFn(`${base}${DEVIN_MODELS_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/proto',
      'connect-protocol-version': '1',
      accept: '*/*',
      ...(devinBasicAuth(session) ? { authorization: devinBasicAuth(session) } : {}),
    },
    body,
    signal,
  })
  const payload = Buffer.from(await response.arrayBuffer())
  if (!response.ok) {
    throw new Error(`Devin GetCliModelConfigs failed (HTTP ${response.status}): ${payload.toString('utf8').slice(0, 300)}`)
  }
  return decodeGetCliModelConfigsResponse(decodeUnaryBody(payload))
}

/**
 * Refresh the in-memory catalog. Live rows win when any survive filtering;
 * the static floor stays when the RPC fails or returns nothing usable.
 */
export async function refreshDevinCatalog(session, { fetchFn = fetch, signal } = {}) {
  const configs = await devinListModelConfigs(session, { fetchFn, signal })
  const rows = toDevinPickerModels(configs)
  if (rows.length > 0) devinCatalogCache = rows
  return devinCatalogModels()
}

export function setDevinCatalogModels(rows) {
  devinCatalogCache = Array.isArray(rows) && rows.length > 0 ? rows : undefined
  return devinCatalogModels()
}

export function resetDevinCatalog() {
  devinCatalogCache = undefined
}

export function describeDevinCatalogError(error) {
  return describeError(error)
}
