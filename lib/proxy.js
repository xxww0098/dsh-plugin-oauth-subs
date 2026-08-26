/**
 * Local OpenAI Responses proxy. DSH talks to 127.0.0.1:<port> via llm-pi-ai;
 * this process attaches a fresh OAuth bearer and forwards to ChatGPT Codex
 * or xAI Grok. Settings operations stay on the host-owned RPC channel.
 */

import { createServer } from 'node:http'
import { once } from 'node:events'
import { CODEX_API_URL, CODEX_MODELS, CODEX_MODELS_URL, codexUpstreamHeaders } from './codex.js'
import { GROK_API_URL, GROK_MODELS, grokUpstreamHeaders } from './grok.js'
import { applyFastMode } from './fast-mode.js'
import { normalizeCodexResponsesBody } from './codex-request.js'
import { withPickerVariants } from './models.js'

const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' }
export const MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function send(response, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  response.writeHead(status, {
    ...JSON_TYPE,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
    'x-content-type-options': 'nosniff',
  })
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

function rewriteUpstreamBody(buffer, family) {
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
  const fast = applyFastMode(payload)
  const next = family === 'codex' ? normalizeCodexResponsesBody(fast) : fast
  const cacheSessionId = family === 'codex'
    && typeof next.prompt_cache_key === 'string'
    && /^[A-Za-z0-9._:-]{1,64}$/.test(next.prompt_cache_key)
    ? next.prompt_cache_key
    : undefined
  return { body: Buffer.from(JSON.stringify(next)), cacheSessionId }
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

export function createProxy({ port, apiKey, tokens, fetchFn = fetch, maxRequestBodyBytes = MAX_REQUEST_BODY_BYTES }) {
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
      send(response, 200, { object: 'list', data })
      return
    }

    if (path === '/codex/v1/models' && request.method === 'GET') {
      const client = abortOnDisconnect(request, response)
      try {
        const session = await tokens.codex.session()
        const upstream = await fetchFn(CODEX_MODELS_URL, {
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
          if (!response.headersSent) send(response, error.status ?? 500, { error: error.message })
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

async function forward(request, response, { url, session, headersOf, fetchFn, family, maxRequestBodyBytes, signal }) {
  const raw = await readBody(request, maxRequestBodyBytes)
  const { body, cacheSessionId } = rewriteUpstreamBody(raw, family)
  try {
    const upstream = await fetchFn(url, {
      method: 'POST',
      headers: {
        ...headersOf(session),
        'content-type': request.headers['content-type'] ?? 'application/json',
        ...(cacheSessionId === undefined ? {} : {
          'session-id': cacheSessionId,
          'x-client-request-id': cacheSessionId,
        }),
      },
      body,
      signal,
    })

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

    const hopByHop = new Set(['connection', 'keep-alive', 'transfer-encoding', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'upgrade'])
    const headers = { 'cache-control': 'no-store' }
    upstream.headers.forEach((value, key) => {
      if (!hopByHop.has(key.toLowerCase())) headers[key] = value
    })
    response.writeHead(upstream.status, headers)
    if (upstream.body === null) {
      response.end()
      return
    }
    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!response.write(value)) await once(response, 'drain', { signal })
    }
  } finally {
    if (!response.writableEnded) response.end()
  }
}
