/**
 * OpenCode Free — anonymous Zen relay (https://opencode.ai/zen/v1).
 *
 * Matches Hermes `opencode-free`: no account, no API key. The relay 401s
 * any unrecognized Authorization bearer, so hop headers never include one.
 * Store keeps a sentinel token so auth.json shape stays non-empty.
 */

export { applyOpencodeCache, opencodeCacheHeaders, opencodeCacheSessionId, resetOpencodePins } from './cache.js'

export const OPENCODE_ZEN_ORIGIN = 'https://opencode.ai/zen/v1'
export const OPENCODE_CHAT_URL = `${OPENCODE_ZEN_ORIGIN}/chat/completions`
export const OPENCODE_MODELS_URL = `${OPENCODE_ZEN_ORIGIN}/models`
export const OPENCODE_MODELS_DEV_URL = 'https://models.dev/api.json'
export const OPENCODE_DOCS_URL = 'https://opencode.ai/docs/zen'
export const OPENCODE_USER_AGENT = 'dsh-plugin-oauth-subs'
export const OPENCODE_REFERER = 'https://github.com/xxww0098/dsh-plugin-oauth-subs'
export const OPENCODE_TITLE = 'dsh-plugin-oauth-subs'
/** Store sentinel — never sent as Authorization. */
export const OPENCODE_ANON_TOKEN = 'anonymous'
export const OPENCODE_ACCOUNT = 'Anonymous'
export const OPENCODE_NEVER_EXPIRES = 8.64e15
export const OPENCODE_DEFAULT_CONTEXT = 128_000
export const OPENCODE_DEFAULT_MAX_TOKENS = 16_384
export const OPENCODE_INPUT = Object.freeze(['text'])
export const OPENCODE_VISION_INPUT = Object.freeze(['text', 'image'])
/** models.dev effort values that are DSH picker keys. Vendor `none` is `off`. */
export const OPENCODE_REASONING_DEEPSEEK = Object.freeze({ low: 'low', high: 'high', max: 'max' })
export const OPENCODE_REASONING_LAGUNA = Object.freeze({ low: 'low', medium: 'medium', high: 'high' })
export const OPENCODE_REASONING_MUSE = Object.freeze({
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
})
/** models.dev `type: toggle`. Completions hop: off → `reasoning_effort: none`. */
export const OPENCODE_REASONING_TOGGLE = Object.freeze({ off: 'none', high: 'high' })
export const OPENCODE_SOURCES = Object.freeze(['anonymous'])
/** Go-subscription slugs that look free. Never put these on the keyless picker. */
export const OPENCODE_KEYED_FREE = Object.freeze(new Set(['ox-alpha-free']))
export const OPENCODE_DEFAULT_MODEL = 'laguna-s-2.1-free'

export const OPENCODE_PLAN_NAMES = Object.freeze({
  free: 'Free',
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
 * Offline floor: Zen live ids on 2026-09-03 + models.dev caps.
 * Delisted slugs (hy3-free, x-preview-f-free) stay out — they 401.
 * Empty reasoning_options + reasoning true omit reasoningEfforts.
 */
export const OPENCODE_MODELS = Object.freeze([
  model('deepseek-v4-flash-free', 'DeepSeek V4 Flash', {
    contextWindow: 200_000,
    maxTokens: 128_000,
    reasoningEfforts: OPENCODE_REASONING_DEEPSEEK,
  }),
  model('laguna-s-2.1-free', 'Laguna S 2.1', {
    contextWindow: 256_000,
    maxTokens: 32_000,
    reasoningEfforts: OPENCODE_REASONING_LAGUNA,
  }),
  model('ling-3.0-flash-fin-free', 'Ling 3.0 Flash Fin', {
    contextWindow: 262_144,
    maxTokens: 32_768,
    reasoningEfforts: OPENCODE_REASONING_TOGGLE,
  }),
  model('mimo-v2.5-free', 'MiMo V2.5', {
    contextWindow: 200_000,
    maxTokens: 32_000,
    input: OPENCODE_VISION_INPUT,
  }),
  model('muse-spark-1.2-contributor-free', 'Muse Spark 1.2', {
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    input: OPENCODE_VISION_INPUT,
    reasoningEfforts: OPENCODE_REASONING_MUSE,
  }),
  model('muse-spark-1.3-contributor-free', 'Muse Spark 1.3', {
    contextWindow: 1_048_576,
    maxTokens: 131_072,
    input: OPENCODE_VISION_INPUT,
    reasoningEfforts: OPENCODE_REASONING_MUSE,
  }),
  model('nemotron-3-ultra-free', 'Nemotron 3 Ultra', {
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  }),
  model('nemotron-3.5-lightning-free', 'Nemotron 3.5 Lightning', {
    contextWindow: 262_144,
    maxTokens: 262_144,
  }),
])

export function isOpencodeFreeSlug(id) {
  const bare = String(id ?? '').trim()
  const slug = bare.includes('/') ? bare.slice(bare.lastIndexOf('/') + 1) : bare
  const lower = slug.toLowerCase()
  if (!lower) return false
  if (OPENCODE_KEYED_FREE.has(lower)) return false
  return lower.endsWith('-free')
}

export function opencodePrettyName(id) {
  const slug = String(id ?? '').trim()
  const bare = slug.replace(/-free$/i, '').replace(/[:_]+/g, ' ').replace(/-/g, ' ').trim()
  return bare.replace(/\b\w/g, (char) => char.toUpperCase()) || 'OpenCode'
}

export function opencodeSourceLabel(source) {
  if (source === 'anonymous') return undefined
  return undefined
}

export function opencodeSession() {
  return {
    accessToken: OPENCODE_ANON_TOKEN,
    refreshToken: OPENCODE_ANON_TOKEN,
    expiresAt: OPENCODE_NEVER_EXPIRES,
    account: OPENCODE_ACCOUNT,
    source: 'anonymous',
    planType: 'free',
  }
}

export async function refreshOpencode(session) {
  if (!session) throw new Error('opencode session missing')
  return {
    ...session,
    accessToken: OPENCODE_ANON_TOKEN,
    refreshToken: OPENCODE_ANON_TOKEN,
    expiresAt: OPENCODE_NEVER_EXPIRES,
    account: session.account?.trim() || OPENCODE_ACCOUNT,
    source: 'anonymous',
    planType: session.planType || 'free',
  }
}

export function isOpencodePermanentRefreshError() {
  return false
}

/** Never send Authorization. Empty / sentinel / stale Zen keys all 401. */
export function opencodeUpstreamHeaders() {
  return {
    'user-agent': OPENCODE_USER_AGENT,
    'http-referer': OPENCODE_REFERER,
    'x-title': OPENCODE_TITLE,
  }
}
