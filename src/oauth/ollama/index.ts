/**
 * Ollama Cloud subscription on ollama.com — not the local 127.0.0.1:11434
 * daemon that already hosts DSH (`ollama launch dsh`).
 *
 * Programmatic auth is an API key from https://ollama.com/settings/keys
 * sent as `Authorization: Bearer`. `ollama signin` is local-daemon SSH
 * signing (`~/.ollama/id_ed25519`); that public key is not a Bearer.
 *
 * Chat hop is OpenAI Completions at https://ollama.com/v1/chat/completions
 * (official Factory docs + 401-not-404 probe). Native `/api/chat` stays
 * unused unless that /v1 route disappears.
 */

import { createHash } from 'node:crypto'

export const OLLAMA_CLOUD_ORIGIN = 'https://ollama.com'
export const OLLAMA_CHAT_URL = `${OLLAMA_CLOUD_ORIGIN}/v1/chat/completions`
export const OLLAMA_TAGS_URL = `${OLLAMA_CLOUD_ORIGIN}/api/tags`
export const OLLAMA_ME_URL = `${OLLAMA_CLOUD_ORIGIN}/api/me`
export const OLLAMA_KEYS_URL = 'https://ollama.com/settings/keys'
/** Official docs: API keys do not expire. */
export const OLLAMA_NEVER_EXPIRES = 8.64e15
export const OLLAMA_DEFAULT_CONTEXT = 128_000
export const OLLAMA_DEFAULT_MAX_TOKENS = 16_384
export const OLLAMA_TEXT_INPUT = Object.freeze(['text'])
export const OLLAMA_VISION_INPUT = Object.freeze(['text', 'image'])

/**
 * DSH picker keys → Ollama OpenAI-compat wire
 * (`reasoning_effort` / `effort`: high|medium|low|max|none).
 * Never use a vendor spelling as a key.
 */
export const OLLAMA_REASONING = Object.freeze({
  off: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  max: 'max',
})

export const OLLAMA_SOURCES = Object.freeze(['paste', 'env'])

/**
 * Official Cloud retirement table (docs.ollama.com/cloud). Upcoming
 * 2026-07-31 rows are already past as of this family. Do not list them.
 */
export const OLLAMA_RETIRED_MODELS = Object.freeze(new Set([
  'minimax-m2.5',
  'kimi-k2.5',
  'deepseek-v3.1:671b',
  'deepseek-v3.2',
  'devstral-2:123b',
  'devstral-small-2:24b',
  'ministral-3:14b',
  'ministral-3:3b',
  'ministral-3:8b',
  'gemini-3-flash-preview',
  'gemma3:12b',
  'gemma3:27b',
  'gemma3:4b',
  'glm-4.7',
  'glm-5',
  'minimax-m2.1',
  'qwen3-coder-next',
  'qwen3-coder:480b',
  'rnj-1:8b',
  'kimi-k2-thinking',
  'kimi-k2:1t',
  'minimax-m2',
  'glm-4.6',
  'qwen3-next:80b',
  'qwen3-vl:235b',
  'qwen3-vl:235b-instruct',
  'cogito-2.1:671b',
]))

export function inferOllamaInput(id) {
  const text = String(id ?? '').toLowerCase()
  if (/gemma|vision|\bvl\b|-vl/.test(text)) return [...OLLAMA_VISION_INPUT]
  return [...OLLAMA_TEXT_INPUT]
}

export function inferOllamaContextWindow(id) {
  const text = String(id ?? '').toLowerCase()
  if (/qwen3\.5/.test(text)) return 262_144
  if (/kimi/.test(text)) return 256_000
  if (/mistral-large|minimax|glm-5/.test(text)) return 200_000
  return OLLAMA_DEFAULT_CONTEXT
}

function ollamaModel(id, name) {
  return {
    id,
    name,
    contextWindow: inferOllamaContextWindow(id),
    maxTokens: OLLAMA_DEFAULT_MAX_TOKENS,
    input: inferOllamaInput(id),
    reasoningEfforts: OLLAMA_REASONING,
  }
}

/** 19-row Cloud snapshot from GET /api/tags (same 19 as /v1/models). Live tags replace this after login. */
export const OLLAMA_MODELS = Object.freeze([
  ollamaModel('deepseek-v4-flash:0731', 'DeepSeek V4 Flash'),
  ollamaModel('deepseek-v4-pro:0813', 'DeepSeek V4 Pro'),
  ollamaModel('gemma4:31b', 'Gemma 4 31B'),
  ollamaModel('glm-5.1', 'GLM-5.1'),
  ollamaModel('glm-5.2', 'GLM-5.2'),
  ollamaModel('glm-5.3', 'GLM-5.3'),
  ollamaModel('glm-5.3-flash', 'GLM-5.3 Flash'),
  ollamaModel('gpt-oss:120b', 'GPT-OSS 120B'),
  ollamaModel('gpt-oss:20b', 'GPT-OSS 20B'),
  ollamaModel('kimi-k2.6', 'Kimi K2.6'),
  ollamaModel('kimi-k2.7-code', 'Kimi K2.7 Code'),
  ollamaModel('kimi-k3', 'Kimi K3'),
  ollamaModel('minimax-m2.7', 'MiniMax M2.7'),
  ollamaModel('minimax-m3', 'MiniMax M3'),
  ollamaModel('mistral-large-3:675b', 'Mistral Large 3 675B'),
  ollamaModel('nemotron-3-nano:30b', 'Nemotron 3 Nano 30B'),
  ollamaModel('nemotron-3-super', 'Nemotron 3 Super'),
  ollamaModel('nemotron-3-ultra', 'Nemotron 3 Ultra'),
  ollamaModel('qwen3.5:397b', 'Qwen 3.5 397B'),
])

export function ollamaSourceLabel(source) {
  if (source === 'env') return 'env'
  if (source === 'paste') return 'key'
  return undefined
}

function trimmed(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function parseOllamaApiKey(value) {
  const key = trimmed(value)
  if (!key || key.length < 8) throw new Error('ollama API key is empty')
  if (key.includes('BEGIN') && key.includes('PUBLIC KEY')) {
    throw new Error('ollama id_ed25519.pub is the registry public key, not a cloud API key')
  }
  return key
}

/** Stable vault id that is not the raw key. */
export function ollamaAccountFingerprint(key) {
  return createHash('sha256').update(String(key ?? '')).digest('hex').slice(0, 8)
}

export function ollamaDefaultAccount(key) {
  return `ollama-${ollamaAccountFingerprint(key)}`
}

export function isOllamaRetiredModel(id) {
  const name = String(id ?? '').trim().toLowerCase()
  if (!name) return true
  if (OLLAMA_RETIRED_MODELS.has(name)) return true
  const bare = name.split(':')[0]
  return OLLAMA_RETIRED_MODELS.has(bare)
}

export function ollamaPrettyName(id) {
  return String(id ?? '')
    .replace(/[:_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim() || 'Ollama'
}

export function ollamaSession({
  accessToken,
  account,
  source = 'paste',
} = {}) {
  const key = parseOllamaApiKey(accessToken)
  return {
    accessToken: key,
    refreshToken: key,
    expiresAt: OLLAMA_NEVER_EXPIRES,
    account: trimmed(account) ?? ollamaDefaultAccount(key),
    source: OLLAMA_SOURCES.includes(source) ? source : 'paste',
  }
}

export async function refreshOllama(session) {
  if (!session || typeof session.accessToken !== 'string' || !session.accessToken.trim()) {
    throw new Error('ollama session needs an API key')
  }
  return session
}

export function isOllamaPermanentRefreshError() {
  return false
}

export function ollamaUpstreamHeaders(session) {
  return {
    authorization: `Bearer ${session.accessToken}`,
  }
}

function accountFromMe(value) {
  if (!value || typeof value !== 'object') return undefined
  const user = value.user && typeof value.user === 'object' ? value.user : value
  return trimmed(user.email)
    || trimmed(user.preferred_username)
    || trimmed(user.username)
    || trimmed(user.name)
    || trimmed(value.email)
}

export async function resolveOllamaIdentity(session, { fetchFn = fetch, signal } = {}) {
  const key = trimmed(session?.accessToken)
  if (!key) return undefined
  try {
    const response = await fetchFn(OLLAMA_ME_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: '{}',
      signal,
    })
    if (!response.ok) return undefined
    const email = accountFromMe(await response.json())
    return email
  } catch {
    return undefined
  }
}
