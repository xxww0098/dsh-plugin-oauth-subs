/**
 * OpenCode Go Free — OpenCode Go relay (https://opencode.ai/zen/go/v1).
 *
 * This is not OpenCode Zen anonymous free (`/zen/v1` big-pickle / *-free).
 * Official Go is a keyed subscription: paste an API key from
 * https://opencode.ai/auth (env OPENCODE_API_KEY / OPENCODE_GO_API_KEY).
 * Store never sends a sentinel as Bearer.
 */

import { createHash } from 'node:crypto'

export { applyOpencodeCache, opencodeCacheHeaders, opencodeCacheSessionId, resetOpencodePins } from './cache.js'

export const OPENCODE_GO_ORIGIN = 'https://opencode.ai/zen/go/v1'
export const OPENCODE_CHAT_URL = `${OPENCODE_GO_ORIGIN}/chat/completions`
export const OPENCODE_RESPONSES_URL = `${OPENCODE_GO_ORIGIN}/responses`
export const OPENCODE_MODELS_URL = `${OPENCODE_GO_ORIGIN}/models`
export const OPENCODE_MODELS_DEV_URL = 'https://models.dev/api.json'
export const OPENCODE_DOCS_URL = 'https://opencode.ai/docs/go'
export const OPENCODE_AUTH_URL = 'https://opencode.ai/auth'
export const OPENCODE_USER_AGENT = 'dsh-plugin-oauth-subs'
export const OPENCODE_REFERER = 'https://github.com/xxww0098/dsh-plugin-oauth-subs'
export const OPENCODE_TITLE = 'dsh-plugin-oauth-subs'
/** Leftover vault sentinel from the old Zen-anonymous family. Never send. */
export const OPENCODE_ANON_TOKEN = 'anonymous'
export const OPENCODE_NEVER_EXPIRES = 8.64e15
export const OPENCODE_DEFAULT_CONTEXT = 128_000
export const OPENCODE_DEFAULT_MAX_TOKENS = 16_384
export const OPENCODE_INPUT = Object.freeze(['text'])
export const OPENCODE_VISION_INPUT = Object.freeze(['text', 'image'])
export const OPENCODE_REASONING_MUSE = Object.freeze({
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
})
export const OPENCODE_REASONING_GLM = Object.freeze({ low: 'low', high: 'high', max: 'max' })
export const OPENCODE_REASONING_HY3 = Object.freeze({ off: 'none', low: 'low', high: 'high' })
export const OPENCODE_REASONING_LUNA = Object.freeze({
  off: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
})
export const OPENCODE_REASONING_GROK = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
})
export const OPENCODE_SOURCES = Object.freeze(['paste', 'env'])
/**
 * Zen-only free slugs. Never put these on the Go picker even if a stale
 * models.dev `opencode` row or a mistaken live payload lists them.
 */
export const OPENCODE_ZEN_FREE = Object.freeze(new Set([
  'big-pickle',
  'deepseek-v4-flash-free',
  'hy3-free',
  'hy3-preview-free',
  'laguna-s-2.1-free',
  'ling-3.0-flash-fin-free',
  'ling-3.0-flash-free',
  'longcat-2.0-free',
  'minimax-m2.1-free',
  'minimax-m3-free',
  'mimo-v2.5-free',
  'muse-spark-1.2-contributor-free',
  'muse-spark-1.3-contributor-free',
  'nemotron-3-ultra-free',
  'nemotron-3.5-lightning-free',
  'north-mini-code-free',
  'trinity-large-preview-free',
]))
export const OPENCODE_DEFAULT_MODEL = 'glm-5.3-flash'

export const OPENCODE_PLAN_NAMES = Object.freeze({
  go: 'Go Free',
  free: 'Go Free',
  gofree: 'Go Free',
  go_free: 'Go Free',
})

function model(id, name, extra = {}) {
  return {
    id,
    name,
    contextWindow: extra.contextWindow ?? OPENCODE_DEFAULT_CONTEXT,
    maxTokens: extra.maxTokens ?? OPENCODE_DEFAULT_MAX_TOKENS,
    input: extra.input ? [...extra.input] : [...OPENCODE_INPUT],
    ...(extra.reasoningEfforts ? { reasoningEfforts: { ...extra.reasoningEfforts } } : {}),
  }
}

/**
 * Offline floor: live Go Completions / Responses ids + models.dev
 * `opencode-go` caps (2026-09-05). Zen free slugs stay out.
 */
export const OPENCODE_MODELS = Object.freeze([
  model('deepseek-v4-flash', 'DeepSeek V4 Flash', {
    contextWindow: 1_000_000,
    maxTokens: 384_000,
    reasoningEfforts: OPENCODE_REASONING_GLM,
  }),
  model('glm-5.3-flash', 'GLM-5.3-Flash', {
    contextWindow: 1_000_000,
    maxTokens: 131_072,
    input: OPENCODE_VISION_INPUT,
    reasoningEfforts: OPENCODE_REASONING_GLM,
  }),
  model('gpt-5.6-luna', 'GPT-5.6 Luna', {
    contextWindow: 1_050_000,
    maxTokens: 128_000,
    input: OPENCODE_VISION_INPUT,
    reasoningEfforts: OPENCODE_REASONING_LUNA,
  }),
  model('grok-4.6', 'Grok 4.6', {
    contextWindow: 500_000,
    maxTokens: 500_000,
    input: OPENCODE_VISION_INPUT,
    reasoningEfforts: OPENCODE_REASONING_GROK,
  }),
  model('hy3', 'Hy3', {
    contextWindow: 256_000,
    maxTokens: 128_000,
    reasoningEfforts: OPENCODE_REASONING_HY3,
  }),
  model('kimi-k2.7-code', 'Kimi K2.7 Code', {
    contextWindow: 262_144,
    maxTokens: 262_144,
    input: OPENCODE_VISION_INPUT,
  }),
  model('mimo-v2.5', 'MiMo V2.5', {
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    input: OPENCODE_VISION_INPUT,
  }),
  model('muse-spark-1.3-contributor', 'Muse Spark 1.3 Contributor', {
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    input: OPENCODE_VISION_INPUT,
    reasoningEfforts: OPENCODE_REASONING_MUSE,
  }),
])

export function opencodeBareId(id) {
  const bare = String(id ?? '').trim()
  const slug = bare.includes('/') ? bare.slice(bare.lastIndexOf('/') + 1) : bare
  return slug.toLowerCase()
}

export function isOpencodeZenFreeSlug(id) {
  const lower = opencodeBareId(id)
  return Boolean(lower) && OPENCODE_ZEN_FREE.has(lower)
}

/** Live Go row is eligible unless it is a Zen-only free slug. */
export function isOpencodeGoSlug(id) {
  const lower = opencodeBareId(id)
  if (!lower) return false
  return !OPENCODE_ZEN_FREE.has(lower)
}

/** Go docs: Luna / Grok 4.x / Muse Spark Contributor are `/zen/go/v1/responses`. */
export function isOpencodeResponsesModel(id) {
  const slug = opencodeBareId(id)
  return /^(muse-spark|gpt-5\.6-luna|grok-4\.)/i.test(slug)
}

export function opencodePrettyName(id) {
  const slug = String(id ?? '').trim()
  const bare = slug.replace(/[:_]+/g, ' ').replace(/-/g, ' ').trim()
  return bare.replace(/\b\w/g, (char) => char.toUpperCase()) || 'OpenCode Go'
}

export function opencodeSourceLabel(source) {
  if (source === 'env') return 'env'
  if (source === 'paste') return undefined
  return undefined
}

export function parseOpencodeApiKey(value) {
  const key = typeof value === 'string' ? value.trim() : ''
  if (!key || key.length < 8) throw new Error('opencode API key is empty')
  if (key === OPENCODE_ANON_TOKEN) throw new Error('opencode anonymous sentinel is not a Go API key')
  return key
}

export function opencodeAccountFingerprint(key) {
  return createHash('sha256').update(String(key ?? '')).digest('hex').slice(0, 8)
}

export function opencodeDefaultAccount(key) {
  return `opencode-${opencodeAccountFingerprint(key)}`
}

export function isOpencodeOpaqueAccount(value) {
  return /^opencode-[0-9a-f]{8}$/i.test(String(value ?? '').trim())
}

export function isOpencodeAnonSession(session) {
  const token = typeof session?.accessToken === 'string' ? session.accessToken.trim() : ''
  return token === OPENCODE_ANON_TOKEN || session?.source === 'anonymous'
}

export function opencodeSession({
  accessToken,
  account,
  source = 'paste',
  planType = 'go',
} = {}) {
  const key = parseOpencodeApiKey(accessToken)
  return {
    accessToken: key,
    refreshToken: key,
    expiresAt: OPENCODE_NEVER_EXPIRES,
    account: typeof account === 'string' && account.trim() ? account.trim() : opencodeDefaultAccount(key),
    source: OPENCODE_SOURCES.includes(source) ? source : 'paste',
    planType: planType === 'free' ? 'free' : 'go',
  }
}

export async function refreshOpencode(session) {
  if (isOpencodeAnonSession(session)) throw new Error('opencode anonymous sentinel is not a Go API key')
  if (!session || typeof session.accessToken !== 'string' || !session.accessToken.trim()) {
    throw new Error('opencode session needs an API key')
  }
  return {
    ...session,
    accessToken: session.accessToken.trim(),
    refreshToken: session.refreshToken?.trim() || session.accessToken.trim(),
    expiresAt: OPENCODE_NEVER_EXPIRES,
    account: session.account?.trim() || opencodeDefaultAccount(session.accessToken),
    source: OPENCODE_SOURCES.includes(session.source) ? session.source : 'paste',
    planType: session.planType === 'free' ? 'free' : 'go',
  }
}

export function isOpencodePermanentRefreshError() {
  return false
}

/** Catalog GETs stay keyless. Chat hops pass the session so Bearer is set. */
export function opencodeUpstreamHeaders(session) {
  const headers = {
    'user-agent': OPENCODE_USER_AGENT,
    'http-referer': OPENCODE_REFERER,
    'x-title': OPENCODE_TITLE,
  }
  const key = typeof session?.accessToken === 'string' ? session.accessToken.trim() : ''
  if (key && key !== OPENCODE_ANON_TOKEN) headers.authorization = `Bearer ${key}`
  return headers
}
