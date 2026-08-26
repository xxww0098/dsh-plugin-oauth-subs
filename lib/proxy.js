/**
 * Local OpenAI Responses proxy. DSH talks to 127.0.0.1:<port> via llm-pi-ai;
 * this process attaches a fresh OAuth bearer and forwards to ChatGPT Codex
 * or xAI Grok. Management routes under /v0/oauth drive the Settings page.
 */

import { createServer } from 'node:http'
import { CODEX_API_URL, CODEX_MODELS, CODEX_MODELS_URL, codexUpstreamHeaders } from './codex.js'
import { GROK_API_URL, GROK_MODELS, grokUpstreamHeaders } from './grok.js'
import { applyFastMode, withFastVariants } from './fast-mode.js'

const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' }

function send(response, status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  response.writeHead(status, { ...JSON_TYPE, 'content-length': Buffer.byteLength(text) })
  response.end(text)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

function parseJsonBody(buffer) {
  if (buffer.length === 0) return {}
  return JSON.parse(buffer.toString('utf8'))
}

function originOf(port, bind) {
  return `http://${bind === '0.0.0.0' ? '127.0.0.1' : bind}:${port}`
}

function rewriteFastBody(buffer, defaultOn) {
  if (!buffer.length) return buffer
  try {
    const payload = JSON.parse(buffer.toString('utf8'))
    return Buffer.from(JSON.stringify(applyFastMode(payload, { defaultOn })))
  } catch {
    return buffer
  }
}

export function createProxy({ port, bind = '127.0.0.1', apiKey, tokens, fetchFn = fetch, onManage, fastMode = false }) {
  let server
  const fastOn = () => (typeof fastMode === 'function' ? Boolean(fastMode()) : Boolean(fastMode))

  const authorized = (request) => {
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    return token.length > 0 && token === apiKey
  }

  const handle = async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${bind}`)
    const path = url.pathname.replace(/\/+$/, '') || '/'

    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
      })
      response.end()
      return
    }

    if (path === '/health' && request.method === 'GET') {
      send(response, 200, { ok: true, plugin: 'dsh-plugin-oauth-subs' })
      return
    }

    if (path.startsWith('/v0/oauth')) {
      if (!authorized(request)) {
        send(response, 401, { error: 'unauthorized' })
        return
      }
      const body = request.method === 'GET' ? {} : parseJsonBody(await readBody(request))
      const result = await onManage(request.method, path, body, url.searchParams)
      send(response, result.status ?? 200, result.body ?? result)
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
        data.push(...withFastVariants(CODEX_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'codex' })))
      } catch { /* not logged in */ }
      try {
        await tokens.grok.session()
        data.push(...withFastVariants(GROK_MODELS).map((model) => ({ id: model.id, object: 'model', owned_by: 'grok' })))
      } catch { /* not logged in */ }
      send(response, 200, { object: 'list', data })
      return
    }

    if (path === '/codex/v1/models' && request.method === 'GET') {
      const session = await tokens.codex.session()
      const upstream = await fetchFn(CODEX_MODELS_URL, {
        headers: {
          ...codexUpstreamHeaders(session),
        },
      })
      if (!upstream.ok) {
        send(response, upstream.status, { error: await upstream.text() })
        return
      }
      const payload = await upstream.json()
      send(response, 200, payload)
      return
    }

    if (path === '/codex/v1/responses' && request.method === 'POST') {
      await forward(request, response, {
        url: CODEX_API_URL,
        session: await tokens.codex.session(),
        headersOf: codexUpstreamHeaders,
        fetchFn,
        fastOn: fastOn(),
      })
      return
    }

    if (path === '/grok/v1/responses' && request.method === 'POST') {
      await forward(request, response, {
        url: GROK_API_URL,
        session: await tokens.grok.session(),
        headersOf: grokUpstreamHeaders,
        fetchFn,
        fastOn: fastOn(),
      })
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
    origin: () => originOf(port, bind),
    async listen() {
      server = createServer((request, response) => {
        handle(request, response).catch((error) => {
          if (!response.headersSent) send(response, 500, { error: error.message })
          else response.end()
        })
      })
      await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, bind, resolve)
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

async function forward(request, response, { url, session, headersOf, fetchFn, fastOn = false }) {
  const raw = await readBody(request)
  const body = rewriteFastBody(raw, fastOn)
  const upstream = await fetchFn(url, {
    method: 'POST',
    headers: {
      ...headersOf(session),
      'content-type': request.headers['content-type'] ?? 'application/json',
    },
    body,
  })

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
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      response.write(value)
    }
  } finally {
    response.end()
  }
}
