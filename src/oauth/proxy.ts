/**
 * Local OpenAI Responses proxy. DSH talks to 127.0.0.1:<port> via llm-pi-ai;
 * this process attaches a fresh OAuth bearer and forwards to ChatGPT Codex
 * or xAI Grok. Settings operations stay on the host-owned RPC channel.
 */

import { createServer } from 'node:http'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { CODEX_API_URL, CODEX_CLIENT_VERSION, CODEX_MODELS, CODEX_MODELS_URL, codexRoutingHint, codexUpstreamHeaders } from './codex/index.js'
import { applyCodexCache, codexCacheHeaders } from './codex/cache.js'
import { GROK_API_URL, GROK_MODELS, grokAffinityHeaders, grokUpstreamHeaders } from './grok/index.js'
import { applyGrokCache } from './grok/cache.js'
import { normalizeGrokResponsesBody } from './grok/request.js'
import { GLM_MODELS, glmAnthropicHeaders, glmAnthropicUrl, glmCodingUrl, glmUpstreamHeaders, isGlmStartPlan } from './glm/index.js'
import { glmCacheSessionId } from './glm/cache.js'
import { normalizeGlmAnthropicBody, normalizeGlmChatBody } from './glm/request.js'
import { kiroStreamingProfileArn } from './kiro/index.js'
import { kiroCatalogModels } from './kiro/catalog.js'
import {
  KIRO_STABLE_SESSION,
  classifyKiroHopError,
  kiroChatHeaders,
  kiroChatUrl,
  kiroClientErrorBody,
  kiroConversationId,
  kiroToOpenai,
  kiroToOpenaiChunk,
  KiroEventStreamParser,
  mapKiroUsage,
  mergeKiroText,
  openaiToKiro,
  resolveKiroUsage,
  thinkingTextFromPayload,
  unwrapKiroEventPayload,
} from './kiro/request.js'
import {
  ANTIGRAVITY_GENERATE_URL,
  ANTIGRAVITY_MODELS,
  ANTIGRAVITY_STREAM_URL,
  applyAntigravityValidation,
  antigravityChatHeaders,
  antigravityValidationClientError,
  fetchAntigravityCloudCode,
  parseAntigravityValidation,
} from './antigravity/index.js'
import { antigravityToOpenai, createAntigravityOpenaiStream, openaiToAntigravity, parseAntigravitySseBlocks } from './antigravity/request.js'
import { antigravitySessionIdOf } from './antigravity/cache.js'
import { cursorCatalogModels } from './cursor/catalog.js'
import { applyCursorCache, cursorConversationId } from './cursor/cache.js'
import { OLLAMA_CHAT_URL, ollamaUpstreamHeaders } from './ollama/index.js'
import { ollamaCatalogModels } from './ollama/catalog.js'
import { applyOllamaCache } from './ollama/cache.js'
import { KIMI_CHAT_URL, kimiUpstreamHeaders } from './kimi/index.js'
import { kimiCatalogModels } from './kimi/catalog.js'
import { applyKimiCache } from './kimi/cache.js'
import { applyKimiThinking } from './kimi/request.js'
import {
  copilotChatUrl,
  copilotUpstreamHeaders,
} from './copilot/index.js'
import { copilotCatalogModels } from './copilot/catalog.js'
import { applyCopilotCache, copilotHasVision, copilotInitiatorOf } from './copilot/cache.js'
import { applyCopilotThinking } from './copilot/request.js'
import { cursorToOpenai, createCursorOpenaiStream, openaiToCursor } from './cursor/request.js'
import { runCursorAgent } from './cursor/h2-session.js'
import { applyFastMode } from '../utils/fast-mode.js'
import { normalizeCodexResponsesBody } from './codex/request.js'
import { withPickerVariants } from './models.js'

const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' }
export const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024
/** Upstream attempts before the client is told the stream failed. */
export const STREAM_ATTEMPTS = 3
const RETRY_BACKOFF_MS = [1000, 4000]

/**
 * SSE events that carry no output, so a stream ending here is worth retrying.
 * The `codex.*` frames are handshake metadata; the allow-list mirrors
 * CLIProxyAPI's `isCodexHandshakeMetadataEvent`, which solves the same problem
 * against the same backend.
 */
const PREAMBLE_EVENT_TYPES = new Set([
  'response.created',
  'response.in_progress',
  'response.queued',
  'codex.rate_limits',
  'codex.response.metadata',
])
const MAX_PREAMBLE_BYTES = 64 * 1024
const EVENT_TYPE = /"type"\s*:\s*"([^"]+)"/g
/** Commit anyway rather than risk the client's own header timeout. */
const COMMIT_DEADLINE_MS = 120_000

class RetryableUpstream extends Error {
  constructor(message, extra = {}) {
    super(message)
    if (typeof extra.turnState === 'string' && extra.turnState.trim()) {
      this.turnState = extra.turnState.trim()
    }
  }
}

function retryableUpstream(message, family, upstream) {
  const extra = {}
  if (family === 'codex') {
    const turnState = upstream?.headers?.get?.('x-codex-turn-state')
    if (typeof turnState === 'string' && turnState.trim()) extra.turnState = turnState.trim()
  }
  return new RetryableUpstream(message, extra)
}

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function send(response, status, body, extraHeaders = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const headers = {
    ...JSON_TYPE,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
    'x-content-type-options': 'nosniff',
  }
  for (const [key, value] of Object.entries(extraHeaders ?? {})) {
    if (value != null && String(value) !== '') headers[key] = String(value)
  }
  response.writeHead(status, headers)
  response.end(text)
}

function readBody(request, limit = MAX_REQUEST_BODY_BYTES) {
  if (request.aborted || request.destroyed) {
    return Promise.reject(new RequestError(400, 'request body was aborted'))
  }
  const declared = Number(request.headers['content-length'])
  if (Number.isSafeInteger(declared) && declared > limit) {
    request.resume()
    return Promise.reject(new RequestError(413, 'request body is too large'))
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const onData = (chunk) => {
      size += chunk.length
      if (size <= limit) {
        chunks.push(chunk)
        return
      }
      cleanup()
      request.resume()
      reject(new RequestError(413, 'request body is too large'))
    }
    const onEnd = () => {
      cleanup()
      resolve(Buffer.concat(chunks, size))
    }
    const onError = () => {
      cleanup()
      reject(new RequestError(400, 'request body could not be read'))
    }
    const onAborted = () => {
      cleanup()
      reject(new RequestError(400, 'request body was aborted'))
    }
    const cleanup = () => {
      request.removeListener('data', onData)
      request.removeListener('end', onEnd)
      request.removeListener('error', onError)
      request.removeListener('aborted', onAborted)
    }
    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    request.once('aborted', onAborted)
  })
}

function originOf(port) {
  return `http://127.0.0.1:${port}`
}

/** undici reports socket faults as a bare "fetch failed"; the cause carries the reason. */
export function describeError(error) {
  const cause = error?.cause
  const detail = cause?.code ?? cause?.message
  return detail === undefined ? String(error?.message ?? error) : `${error.message}: ${detail}`
}

function rewriteUpstreamBody(buffer, family, wire) {
  if (!buffer.length) throw new RequestError(400, 'request body must contain JSON')
  let payload
  try {
    payload = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new RequestError(400, 'request body must contain valid JSON')
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new RequestError(400, 'request body must contain a JSON object')
  }
  if (family === 'cursor') {
    // Cursor Fast is RequestedModel `{ id: 'fast' }`, not Codex Priority.
    // Keep the picker `-fast` suffix for openaiToCursor; do not peel here.
    const { payload: next, cacheSessionId } = applyCursorCache(payload)
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  const fast = applyFastMode(payload)
  if (family === 'codex') {
    const { payload: next, cacheSessionId } = applyCodexCache(normalizeCodexResponsesBody(fast))
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId,
      stream: next.stream === true,
      routingHint: codexRoutingHint(typeof next.model === 'string' ? next.model : '', next.service_tier),
    }
  }
  if (family === 'grok') {
    const { payload: next, cacheSessionId } = applyGrokCache(normalizeGrokResponsesBody(fast))
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId,
      stream: next.stream === true,
      grokModel: typeof next.model === 'string' ? next.model : undefined,
    }
  }
  if (family === 'glm') {
    const next = wire === 'anthropic' ? normalizeGlmAnthropicBody(fast) : normalizeGlmChatBody(fast)
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId: glmCacheSessionId(next.user)
        || glmCacheSessionId(next.metadata?.user_id)
        || glmCacheSessionId(next.session_id),
      stream: next.stream === true,
    }
  }
  if (family === 'antigravity') {
    const next = { ...fast }
    delete next.prompt_cache_retention
    delete next.prompt_cache_options
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId: antigravitySessionIdOf(next),
      stream: next.stream === true,
    }
  }
  if (family === 'kiro') {
    const next = { ...fast }
    delete next.prompt_cache_retention
    delete next.prompt_cache_options
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId: kiroConversationId(next),
      stream: next.stream === true,
    }
  }
  if (family === 'ollama') {
    const { payload: next, cacheSessionId } = applyOllamaCache(fast)
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  if (family === 'kimi') {
    const { payload: cached, cacheSessionId } = applyKimiCache(fast)
    const next = applyKimiThinking(cached)
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId,
      stream: next.stream === true,
    }
  }
  if (family === 'copilot') {
    const { payload: cached, cacheSessionId } = applyCopilotCache(fast)
    const next = applyCopilotThinking(cached)
    return {
      body: Buffer.from(JSON.stringify(next)),
      cacheSessionId,
      stream: next.stream === true,
      copilotVision: copilotHasVision(next.messages),
      copilotInitiator: copilotInitiatorOf(next.messages),
    }
  }
  throw new RequestError(400, `unknown oauth family: ${family}`)
}

function abortOnDisconnect(request, response) {
  const controller = new AbortController()
  const abort = () => controller.abort(new Error('client disconnected'))
  const onClose = () => {
    if (!response.writableEnded) abort()
  }
  request.once('aborted', abort)
  response.once('close', onClose)
  if (request.aborted || response.destroyed) abort()
  return {
    signal: controller.signal,
    cleanup() {
      request.removeListener('aborted', abort)
      response.removeListener('close', onClose)
    },
  }
}

export function createProxy({ port, apiKey, tokens, fetchFn = fetch, maxRequestBodyBytes = MAX_REQUEST_BODY_BYTES, onAntigravityValidation, cursorRpc }) {
  let server

  const authorized = (request) => {
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    return token.length > 0 && token === apiKey
  }

  const handle = async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname.replace(/\/+$/, '') || '/'

    if (path === '/health' && request.method === 'GET') {
      send(response, 200, { ok: true, plugin: 'dsh-plugin-oauth-subs' })
      return
    }

    if (!authorized(request)) {
      send(response, 401, { error: 'unauthorized' })
      return
    }

    if (path === '/v1/models' && request.method === 'GET') {
      const data = []
      try {
        await tokens.codex.session()
        data.push(...withPickerVariants(CODEX_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'codex' })))
      } catch { /* not logged in */ }
      try {
        await tokens.grok.session()
        data.push(...withPickerVariants(GROK_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'grok' })))
      } catch { /* not logged in */ }
      try {
        await tokens.glm.session()
        data.push(...GLM_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'glm' })))
      } catch { /* not logged in */ }
      try {
        if (tokens.kiro) {
          await tokens.kiro.session()
          data.push(...kiroCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kiro' })))
        }
      } catch { /* not logged in */ }
      try {
        if (tokens.antigravity) {
          await tokens.antigravity.session()
          data.push(...ANTIGRAVITY_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'antigravity' })))
        }
      } catch { /* not logged in */ }
      try {
        if (tokens.cursor) {
          await tokens.cursor.session()
          data.push(...cursorCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'cursor' })))
        }
      } catch { /* not logged in */ }
      try {
        if (tokens.ollama) {
          await tokens.ollama.session()
          data.push(...ollamaCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'ollama' })))
        }
      } catch { /* not logged in */ }
      try {
        if (tokens.kimi) {
          await tokens.kimi.session()
          data.push(...kimiCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kimi' })))
        }
      } catch { /* not logged in */ }
      try {
        if (tokens.copilot) {
          await tokens.copilot.session()
          data.push(...copilotCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'copilot' })))
        }
      } catch { /* not logged in */ }
      send(response, 200, { object: 'list', data })
      return
    }

    if (path === '/codex/v1/models' && request.method === 'GET') {
      const client = abortOnDisconnect(request, response)
      try {
        const session = await tokens.codex.session()
        const upstream = await fetchFn(`${CODEX_MODELS_URL}?client_version=${CODEX_CLIENT_VERSION}`, {
          headers: {
            ...codexUpstreamHeaders(session),
          },
          signal: client.signal,
        })
        if (!upstream.ok) {
          send(response, upstream.status, { error: await upstream.text() })
          return
        }
        const payload = await upstream.json()
        send(response, 200, payload)
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/codex/v1/responses' && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        await forward(request, response, {
          url: CODEX_API_URL,
          session: await tokens.codex.session(),
          headersOf: codexUpstreamHeaders,
          fetchFn,
          family: 'codex',
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/grok/v1/responses' && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        await forward(request, response, {
          url: GROK_API_URL,
          session: await tokens.grok.session(),
          headersOf: grokUpstreamHeaders,
          fetchFn,
          family: 'grok',
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/glm/v1/chat/completions' && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        const session = await tokens.glm.session()
        if (isGlmStartPlan(session)) {
          send(response, 501, {
            error: {
              message: 'GLM Start Plan is Anthropic-only. Point llm-pi-ai at POST /glm/v1/messages.',
            },
          })
          return
        }
        await forward(request, response, {
          url: glmCodingUrl(session.region),
          session,
          headersOf: glmUpstreamHeaders,
          fetchFn,
          family: 'glm',
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if ((path === '/glm/v1/messages' || path === '/glm/v1/v1/messages') && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        const session = await tokens.glm.session()
        await forward(request, response, {
          url: glmAnthropicUrl(session.region, session.planKind),
          session,
          headersOf: glmAnthropicHeaders,
          fetchFn,
          family: 'glm',
          wire: 'anthropic',
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/glm/v1/models' && request.method === 'GET') {
      send(response, 200, {
        object: 'list',
        data: GLM_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'glm' })),
      })
      return
    }

    if (path === '/kiro/v1/models' && request.method === 'GET') {
      send(response, 200, {
        object: 'list',
        data: kiroCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kiro' })),
      })
      return
    }

    if (path === '/antigravity/v1/models' && request.method === 'GET') {
      send(response, 200, {
        object: 'list',
        data: ANTIGRAVITY_MODELS.map((model) => ({ id: model.id, object: 'model', owned_by: 'antigravity' })),
      })
      return
    }

    if ((path === '/cursor/v1/models' || path === '/cursor/models') && request.method === 'GET') {
      send(response, 200, {
        object: 'list',
        data: cursorCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'cursor' })),
      })
      return
    }

    if (path === '/kiro/v1/chat/completions' && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        await forwardKiro(request, response, {
          session: await tokens.kiro.session(),
          fetchFn,
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/kiro/v1/responses') {
      send(response, 501, {
        error: {
          message: 'Kiro chat is AWS generateAssistantResponse. Point llm-pi-ai at POST /kiro/v1/chat/completions.',
        },
      })
      return
    }

    if ((path === '/cursor/v1/chat/completions' || path === '/cursor/chat/completions') && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        await forwardCursor(request, response, {
          session: await tokens.cursor.session(),
          maxRequestBodyBytes,
          signal: client.signal,
          runFn: cursorRpc ?? runCursorAgent,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/cursor/v1/responses') {
      send(response, 501, {
        error: {
          message: 'Cursor chat is Connect AgentService/Run. Point llm-pi-ai at POST /cursor/v1/chat/completions.',
        },
      })
      return
    }

    if ((path === '/ollama/v1/models' || path === '/ollama/models') && request.method === 'GET') {
      send(response, 200, {
        object: 'list',
        data: ollamaCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'ollama' })),
      })
      return
    }

    if ((path === '/ollama/v1/chat/completions' || path === '/ollama/chat/completions') && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        await forward(request, response, {
          url: OLLAMA_CHAT_URL,
          session: await tokens.ollama.session(),
          headersOf: ollamaUpstreamHeaders,
          fetchFn,
          family: 'ollama',
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/ollama/v1/responses') {
      send(response, 501, {
        error: {
          message: 'Ollama Cloud is Completions. Point llm-pi-ai at POST /ollama/v1/chat/completions.',
        },
      })
      return
    }

    if ((path === '/kimi/v1/models' || path === '/kimi/models') && request.method === 'GET') {
      send(response, 200, {
        object: 'list',
        data: kimiCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'kimi' })),
      })
      return
    }

    if ((path === '/kimi/v1/chat/completions' || path === '/kimi/chat/completions') && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        await forward(request, response, {
          url: KIMI_CHAT_URL,
          session: await tokens.kimi.session(),
          headersOf: kimiUpstreamHeaders,
          fetchFn,
          family: 'kimi',
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/kimi/v1/responses') {
      send(response, 501, {
        error: {
          message: 'Kimi Code is Completions. Point llm-pi-ai at POST /kimi/v1/chat/completions.',
        },
      })
      return
    }

    if ((path === '/copilot/v1/models' || path === '/copilot/models') && request.method === 'GET') {
      send(response, 200, {
        object: 'list',
        data: copilotCatalogModels().map((model) => ({ id: model.id, object: 'model', owned_by: 'copilot' })),
      })
      return
    }

    if ((path === '/copilot/v1/chat/completions' || path === '/copilot/chat/completions') && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        const session = await tokens.copilot.session()
        await forward(request, response, {
          url: copilotChatUrl(session),
          session,
          headersOf: (sess, pin) => copilotUpstreamHeaders(sess, pin),
          fetchFn,
          family: 'copilot',
          maxRequestBodyBytes,
          signal: client.signal,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/copilot/v1/responses') {
      send(response, 501, {
        error: {
          message: 'GitHub Copilot is Completions. Point llm-pi-ai at POST /copilot/v1/chat/completions.',
        },
      })
      return
    }

    if (path === '/antigravity/v1/chat/completions' && request.method === 'POST') {
      const client = abortOnDisconnect(request, response)
      try {
        await forwardAntigravity(request, response, {
          session: await tokens.antigravity.session(),
          tokens: tokens.antigravity,
          fetchFn,
          maxRequestBodyBytes,
          signal: client.signal,
          onValidation: onAntigravityValidation,
        })
      } finally {
        client.cleanup()
      }
      return
    }

    if (path === '/codex/v1/chat/completions' || path === '/grok/v1/chat/completions') {
      send(response, 400, {
        error: {
          message: 'this proxy speaks the OpenAI Responses API (POST /v1/responses). Point llm-pi-ai api at openai-responses.',
        },
      })
      return
    }

    send(response, 404, { error: `not found: ${path}` })
  }

  return {
    origin: () => originOf(port),
    async listen() {
      server = createServer((request, response) => {
        handle(request, response).catch((error) => {
          if (!response.headersSent) {
            const extra = {}
            if (error?.retryAfter != null && String(error.retryAfter).trim()) {
              extra['retry-after'] = String(error.retryAfter).trim()
            }
            send(response, error.status ?? 500, { error: describeError(error) }, extra)
          }
          else response.end()
        })
      })
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, '127.0.0.1', resolve)
      })
      return server
    },
    async close() {
      if (server === undefined) return
      await new Promise((resolve) => server.close(() => resolve()))
      server = undefined
    },
  }
}

async function forward(request, response, { url, session, headersOf, fetchFn, family, wire, maxRequestBodyBytes, signal }) {
  const raw = await readBody(request, maxRequestBodyBytes)
  const { body, cacheSessionId, stream, routingHint, grokModel, copilotVision, copilotInitiator } = rewriteUpstreamBody(raw, family, wire)
  const grokReqId = family === 'grok' ? randomUUID() : undefined
  const baseHeaders = {
    ...headersOf(session, cacheSessionId),
    'content-type': request.headers['content-type'] ?? 'application/json',
    ...(stream ? { accept: 'text/event-stream' } : {}),
    ...(family === 'codex' ? {
      ...codexCacheHeaders(cacheSessionId),
      ...(routingHint ? { 'x-codex-routing-hint': routingHint } : {}),
    } : {}),
    ...(family === 'copilot' ? {
      'x-initiator': copilotInitiator === 'agent' ? 'agent' : 'user',
      ...(copilotVision ? { 'copilot-vision-request': 'true' } : {}),
    } : {}),
  }

  let lastFailure
  let codexTurnState
  for (let attempt = 0; attempt < STREAM_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await delay(RETRY_BACKOFF_MS[attempt - 1], signal)
      console.error(`[oauth-subs] ${family} retrying upstream (attempt ${attempt + 1}/${STREAM_ATTEMPTS}): ${lastFailure}`)
    }
    const headers = {
      ...baseHeaders,
      ...(family === 'grok' ? grokAffinityHeaders(cacheSessionId, {
        model: grokModel,
        reqId: grokReqId,
        retryAttempt: attempt,
      }) : {}),
      ...(family === 'codex' && codexTurnState ? { 'x-codex-turn-state': codexTurnState } : {}),
    }
    try {
      return await attemptUpstream(response, { url, headers, body, stream, fetchFn, family, signal })
    } catch (error) {
      if (signal.aborted || response.headersSent || !(error instanceof RetryableUpstream)) throw error
      lastFailure = error.message
      if (typeof error.turnState === 'string' && error.turnState) codexTurnState = error.turnState
    }
  }
  throw new RequestError(502, `${family} upstream failed ${STREAM_ATTEMPTS} times: ${lastFailure}`)
}

/**
 * One upstream attempt. The client response stays uncommitted until the stream
 * proves it is producing output, so a break during the silent pre-output window
 * — the signature of the 2026-08-26 incident, where every failed stream carried
 * `response.created` and nothing else — can be retried without the client ever
 * seeing a truncated stream.
 */
async function attemptUpstream(response, { url, headers, body, stream, fetchFn, family, signal }) {
  let upstream
  try {
    upstream = await fetchFn(url, { method: 'POST', headers, body, signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw retryableUpstream(describeError(error), family)
  }

  if (upstream.status >= 400) {
    const text = await upstream.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = { error: { message: text } } }
    if (parsed == null || (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0)) {
      parsed = {
        error: {
          message: `${family} upstream ${upstream.status} with empty body`,
          type: 'invalid_request_error',
          code: 'invalid_request',
        },
      }
    }
    send(response, upstream.status, parsed)
    return
  }

  const gate = new CommitGate(response, upstream, stream)
  let lastByteAt = Date.now()
  try {
    if (upstream.body === null) {
      gate.commit()
      return
    }
    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      lastByteAt = Date.now()
      if (!(await gate.push(value, signal))) continue
      if (!response.write(value)) await once(response, 'drain', { signal })
    }
  } catch (error) {
    if (signal.aborted) throw error
    const silent = Date.now() - lastByteAt
    const detail = `${describeError(error)} (silent ${silent}ms, ${gate.bytes}B seen, committed=${gate.committed})`
    if (gate.committed) {
      // Ending cleanly here reaches llm-pi-ai as a finished SSE stream: it reports
      // "stream ended before a terminal response event" and retries blind.
      console.error(`[oauth-subs] ${family} upstream stream failed mid-response: ${detail}`)
      response.destroy(error)
      throw error
    }
    throw retryableUpstream(detail, family, upstream)
  }

  if (!gate.committed) {
    // Retry only the incident's own signature: an SSE stream that opened, carried
    // nothing but `response.created`, and stopped. Any other shape is forwarded
    // as-is — an unrecognised body is the upstream's answer, not a fault.
    if (gate.gated && (gate.bytes === 0 || gate.sawPreamble)) {
      throw retryableUpstream(`stream ended with no output events (${gate.bytes}B, silent ${Date.now() - lastByteAt}ms)`, family, upstream)
    }
    await gate.release(signal)
  }
  if (!response.writableEnded && !response.destroyed) response.end()
}

/**
 * Withholds the client response head until the upstream stream proves useful.
 * Non-streaming bodies and anything past the preamble commit immediately, so
 * only the silent pre-output window is ever buffered.
 */
class CommitGate {
  constructor(response, upstream, stream) {
    this.response = response
    this.upstream = upstream
    this.buffered = []
    this.bytes = 0
    this.committed = false
    this.sawPreamble = false
    this.gated = stream === true
    this.deadline = Date.now() + COMMIT_DEADLINE_MS
    this.text = ''
  }

  /** Returns true once the caller should write `chunk` through itself. */
  async push(chunk, signal) {
    if (this.committed) return true
    if (!this.gated) {
      this.commit()
      return true
    }
    this.buffered.push(chunk)
    this.bytes += chunk.length
    // Byte-exact and stateless: the scan only ever matches ASCII.
    this.text += Buffer.from(chunk).toString('latin1')
    if (!this.sawPreamble) this.sawPreamble = hasPreambleEvent(this.text)
    if (this.bytes > MAX_PREAMBLE_BYTES || Date.now() > this.deadline || hasOutputEvent(this.text)) {
      await this.#flush(signal)
    }
    return false
  }

  /** Commit and emit whatever is buffered, for a body we decided not to retry. */
  async release(signal) {
    await this.#flush(signal)
  }

  commit() {
    if (this.committed) return
    this.committed = true
    this.response.writeHead(this.upstream.status, forwardedHeaders(this.upstream.headers))
  }

  async #flush(signal) {
    this.commit()
    for (const chunk of this.buffered) {
      if (!this.response.write(chunk)) await once(this.response, 'drain', { signal })
    }
    this.buffered = []
    this.text = ''
  }
}

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'])

function forwardedHeaders(upstreamHeaders) {
  const headers = { 'cache-control': 'no-store' }
  upstreamHeaders.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers[key] = value
  })
  return headers
}

/**
 * True once the buffered SSE text carries an event beyond the preamble. Any
 * terminal or error event counts, so a genuine `response.failed` commits and
 * reaches the client instead of being retried.
 */
export function hasPreambleEvent(text) {
  for (const match of text.matchAll(EVENT_TYPE)) {
    if (PREAMBLE_EVENT_TYPES.has(match[1])) return true
  }
  return false
}

export function hasOutputEvent(text) {
  for (const match of text.matchAll(EVENT_TYPE)) {
    if (!PREAMBLE_EVENT_TYPES.has(match[1])) return true
  }
  return false
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason) }, { once: true })
  })
}

async function rememberAntigravityValidation(session, info, tokens, onValidation) {
  if (!info?.required) return
  const next = applyAntigravityValidation(session, info)
  if (tokens && typeof tokens.remember === 'function') {
    await tokens.remember({
      needsValidation: true,
      ...(next.validationUrl ? { validationUrl: next.validationUrl } : {}),
    })
  }
  onValidation?.(next)
}

async function forwardAntigravity(request, response, { session, tokens, fetchFn, maxRequestBodyBytes, signal, onValidation }) {
  const raw = await readBody(request, maxRequestBodyBytes)
  const { body: rewritten, cacheSessionId, stream } = rewriteUpstreamBody(raw, 'antigravity')
  const payload = JSON.parse(rewritten.toString('utf8'))
  const projectId = session.projectId
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new RequestError(403, 'antigravity session is missing project_id')
  }
  const sessionId = cacheSessionId ?? antigravitySessionIdOf(payload)
  const body = Buffer.from(JSON.stringify(openaiToAntigravity(payload, {
    projectId,
    sessionId,
  })))
  const url = stream ? ANTIGRAVITY_STREAM_URL : ANTIGRAVITY_GENERATE_URL
  const headers = {
    ...antigravityChatHeaders(session),
    ...(stream ? { accept: 'text/event-stream' } : {}),
  }

  let upstream
  try {
    upstream = await fetchAntigravityCloudCode(url, { method: 'POST', headers, body, signal }, fetchFn)
  } catch (error) {
    if (signal.aborted) throw error
    throw new RequestError(502, describeError(error))
  }

  if (upstream.status >= 400) {
    const text = await upstream.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = { error: { message: text } } }
    const validation = parseAntigravityValidation(parsed) ?? parseAntigravityValidation(text)
    if (validation) {
      await rememberAntigravityValidation(session, validation, tokens, onValidation)
      send(response, 400, antigravityValidationClientError(validation))
      return
    }
    send(response, upstream.status, parsed ?? { error: { message: `antigravity upstream ${upstream.status}` } })
    return
  }

  const model = typeof payload.model === 'string' ? payload.model : 'antigravity'
  if (!stream) {
    const text = await upstream.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : {} } catch {
      throw new RequestError(502, 'antigravity upstream returned invalid JSON')
    }
    send(response, 200, antigravityToOpenai(parsed, { model, sessionId }))
    return
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  const id = `chatcmpl-${Date.now()}`
  const streamMapper = createAntigravityOpenaiStream({ model, id, sessionId })
  let rest = ''
  const reader = upstream.body?.getReader()
  if (!reader) {
    response.write(`data: ${JSON.stringify(streamMapper.finish())}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  while (true) {
    const { done, value } = await reader.read()
    rest += value ? Buffer.from(value).toString('utf8') : ''
    const parsed = parseAntigravitySseBlocks(done ? `${rest}\n\n` : rest)
    rest = parsed.rest
    for (const event of parsed.events) {
      const chunk = streamMapper.push(event)
      if (chunk) {
        if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`)) await once(response, 'drain', { signal })
      }
    }
    if (done) break
  }
  if (!response.write(`data: ${JSON.stringify(streamMapper.finish())}\n\n`)) {
    await once(response, 'drain', { signal })
  }
  response.write('data: [DONE]\n\n')
  if (!response.writableEnded && !response.destroyed) response.end()
}

function headerValue(headers, name) {
  if (!headers) return undefined
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined
  return headers[name] ?? headers[name.toLowerCase()]
}

function sendKiroUpstreamError(response, status, text, headers) {
  let parsed
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = null }
  const classified = classifyKiroHopError(status, parsed, text, {
    retryAfter: headerValue(headers, 'retry-after'),
  })
  send(
    response,
    classified.status,
    kiroClientErrorBody(status, parsed, text),
    classified.retryAfter ? { 'retry-after': classified.retryAfter } : {},
  )
}

async function writeKiroSse(response, chunk, signal) {
  if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`)) await once(response, 'drain', { signal })
}

async function forwardKiro(request, response, { session, fetchFn, maxRequestBodyBytes, signal }) {
  const raw = await readBody(request, maxRequestBodyBytes)
  const { body: rewritten, cacheSessionId, stream } = rewriteUpstreamBody(raw, 'kiro')
  const payload = JSON.parse(rewritten.toString('utf8'))
  const conversationId = cacheSessionId
    ?? kiroConversationId(payload)
    ?? KIRO_STABLE_SESSION
  const body = Buffer.from(JSON.stringify(openaiToKiro(payload, {
    conversationId,
    profileArn: kiroStreamingProfileArn(session),
  })))
  const url = kiroChatUrl(session)
  const headers = kiroChatHeaders(session)

  let upstream
  try {
    upstream = await fetchFn(url, { method: 'POST', headers, body, signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new RequestError(502, describeError(error))
  }

  if (upstream.status >= 400) {
    sendKiroUpstreamError(response, upstream.status, await upstream.text(), upstream.headers)
    return
  }

  const model = typeof payload.model === 'string' ? payload.model : 'kiro'
  const id = `chatcmpl-${Date.now()}`

  if (!stream) {
    const buffer = Buffer.from(await upstream.arrayBuffer())
    const openai = kiroToOpenai(buffer, { model, id })
    if (openai.error) {
      send(response, 400, kiroClientErrorBody(400, openai.error, openai.error.message))
      return
    }
    send(response, 200, openai)
    return
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  const parser = new KiroEventStreamParser()
  let accText = ''
  let accThinking = ''
  let sawTools = false
  let usage
  let contextPercentage
  const reader = upstream.body?.getReader()
  if (!reader) {
    await writeKiroSse(response, kiroToOpenaiChunk({}, { model, id, done: true }), signal)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  while (true) {
    const { done, value } = await reader.read()
    const events = parser.feed(value ?? Buffer.alloc(0))
    for (const event of events) {
      const type = event.type
      const data = unwrapKiroEventPayload(event.payload, type)
      const thought = thinkingTextFromPayload(type, data)
      if (thought) {
        const merged = mergeKiroText(accThinking, thought)
        accThinking = merged.text
        if (merged.delta) {
          await writeKiroSse(response, kiroToOpenaiChunk({ reasoning_content: merged.delta }, { model, id }), signal)
        }
        continue
      }
      if ((type === 'assistantResponseEvent' || typeof data.content === 'string') && typeof data.content === 'string' && data.content) {
        const merged = mergeKiroText(accText, data.content)
        accText = merged.text
        if (merged.delta) {
          await writeKiroSse(response, kiroToOpenaiChunk({ content: merged.delta }, { model, id }), signal)
        }
      } else if (type === 'toolUseEvent') {
        const toolUseId = data.toolUseId ?? data.tool_use_id
        if (!toolUseId || data.stop) continue
        sawTools = true
        const delta = { tool_calls: [{ index: 0, id: toolUseId, type: 'function', function: { name: data.name ?? '', arguments: data.input ?? '' } }] }
        if (data.input === undefined || data.name) {
          delta.tool_calls[0].function = {
            name: data.name ?? '',
            arguments: typeof data.input === 'string' ? data.input : (data.input ? JSON.stringify(data.input) : ''),
          }
        }
        await writeKiroSse(response, kiroToOpenaiChunk(delta, { model, id }), signal)
      } else if (type === 'exception' || type === 'invalidStateEvent' || event.messageType === 'exception') {
        const message = data.message || data.reason || 'kiro upstream exception'
        await writeKiroSse(response, kiroToOpenaiChunk({ content: '' }, { model, id, done: true, finishReason: 'stop' }), signal)
        console.error(`[oauth-subs] kiro upstream exception: ${message}`)
      }
      const tokens = data.tokenUsage ?? data.token_usage
      if (tokens) usage = mapKiroUsage(tokens)
      const percent = data.contextUsagePercentage ?? data.context_usage_percentage
      if (typeof percent === 'number' && Number.isFinite(percent)) contextPercentage = percent
    }
    if (done) break
  }
  await writeKiroSse(response, kiroToOpenaiChunk({}, {
    model,
    id,
    done: true,
    finishReason: sawTools ? 'tool_calls' : 'stop',
    usage: resolveKiroUsage({ usage, contextPercentage, text: accText }, model),
  }), signal)
  response.write('data: [DONE]\n\n')
  if (!response.writableEnded && !response.destroyed) response.end()
}

async function forwardCursor(request, response, { session, maxRequestBodyBytes, signal, runFn }) {
  const raw = await readBody(request, maxRequestBodyBytes)
  const { body: rewritten, cacheSessionId, stream } = rewriteUpstreamBody(raw, 'cursor')
  const payload = JSON.parse(rewritten.toString('utf8'))
  const conversationId = cacheSessionId ?? cursorConversationId(payload)
  const built = openaiToCursor(payload, { conversationId })
  const model = built.pickerModel || built.modelId
  const id = `chatcmpl-${Date.now()}`

  if (!stream) {
    const { collected } = await runFn(session, built, { signal })
    if (collected.error) throw new RequestError(502, collected.error)
    send(response, 200, cursorToOpenai(collected, { model, id, conversationId: built.conversationId }))
    return
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  const mapper = createCursorOpenaiStream({ model, id, conversationId: built.conversationId })
  const write = async (chunk) => {
    if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`)) await once(response, 'drain', { signal })
  }
  const { collected } = await runFn(session, built, {
    signal,
    onEvent: (event) => {
      const chunks = mapper.push(event)
      for (const chunk of chunks) void write(chunk)
    },
  })
  if (collected.error && !response.writableEnded) {
    throw new RequestError(502, collected.error)
  }
  await write(mapper.finish())
  response.write('data: [DONE]\n\n')
  if (!response.writableEnded && !response.destroyed) response.end()
}
