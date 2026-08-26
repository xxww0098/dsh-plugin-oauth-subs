/**
 * Generic OAuth authorization-code flow engine: one temporary loopback HTTP
 * server per login attempt receives the provider's redirect, validates
 * `state`, and yields the authorization `code`. A pasted callback URL carrying
 * the matching state can substitute for the browser redirect (`manual`).
 */

import { createServer } from 'node:http'
import { createPkce, randomHex, randomToken } from './pkce.js'

export const DEFAULT_FLOW_TIMEOUT_MS = 180_000

const SUCCESS_PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>Login successful</title></head>'
  + '<body style="font-family:sans-serif;background:#0a0a0b;color:#f4f4f5;padding:48px">'
  + '<h1>Login successful</h1><p>You can close this tab and return to DeepSeek Harness.</p></body></html>'

function failurePage(detail) {
  const safe = String(detail).replace(/[<>&]/g, '')
  return '<!doctype html><html><head><meta charset="utf-8"><title>Login failed</title></head>'
    + `<body style="font-family:sans-serif;background:#0a0a0b;color:#f4f4f5;padding:48px"><h1>Login failed</h1><p>${safe}</p></body></html>`
}

function listenHosts(host) {
  return host === 'localhost' ? ['127.0.0.1', '::1'] : [host]
}

function familyUnavailable(error) {
  return error?.code === 'EADDRNOTAVAIL' || error?.code === 'EPROTONOSUPPORT'
}

async function listen(handler, spec) {
  const hosts = listenHosts(spec.host)
  const candidates = spec.ports.flatMap((port) => (port === 0 ? [0, 0, 0] : [port]))
  let lastError
  for (const candidate of candidates) {
    const servers = []
    let port = candidate
    let unusable = false
    for (const host of hosts) {
      const server = createServer(handler)
      try {
        await new Promise((resolve, reject) => {
          const onError = (error) => reject(error)
          server.once('error', onError)
          server.listen(port, host, () => {
            server.removeListener('error', onError)
            resolve()
          })
        })
        const address = server.address()
        if (address === null) throw new Error(`callback server on ${host}:${port} has no address`)
        if (port === 0) port = address.port
        servers.push(server)
      } catch (error) {
        server.close()
        if (familyUnavailable(error)) continue
        lastError = error
        unusable = true
        break
      }
    }
    if (unusable || servers.length === 0) {
      for (const server of servers) server.close()
      continue
    }
    return { servers, port }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`callback server could not listen on ${spec.host} (ports ${spec.ports.join(', ')})`)
}

export class OAuthFlowManager {
  constructor() {
    this.attempts = new Map()
  }

  isBusy(provider) {
    return this.attempts.has(provider)
  }

  pending(provider) {
    return this.attempts.get(provider)
  }

  async start(provider, spec) {
    if (this.attempts.has(provider)) {
      throw new Error(`a ${provider} login attempt is already in progress`)
    }
    const input = {
      redirectUri: '',
      state: randomToken(32),
      pkce: createPkce(),
      nonce: randomHex(8),
    }
    const timeoutMs = spec.timeoutMs ?? DEFAULT_FLOW_TIMEOUT_MS

    let resolveCode
    let rejectCode
    const codePromise = new Promise((resolve, reject) => {
      resolveCode = resolve
      rejectCode = reject
    })
    codePromise.catch(() => undefined)

    let settled = false
    let timer
    let servers = []

    const settle = (error, code) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      for (const server of servers) {
        server.close()
        server.closeAllConnections?.()
      }
      this.attempts.delete(provider)
      if (error !== undefined) rejectCode(error)
      else if (code !== undefined) resolveCode(code)
    }

    const handler = (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (url.pathname !== spec.callbackPath) {
        response.writeHead(404, { 'content-type': 'text/plain' })
        response.end('not found')
        return
      }
      const errorDescription = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      if (errorDescription !== null) {
        response.writeHead(200, { 'content-type': 'text/html' })
        response.end(failurePage(errorDescription))
        settle(new Error(`authorization failed: ${errorDescription}`))
        return
      }
      if (url.searchParams.get('state') !== input.state) {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('state mismatch')
        return
      }
      const code = url.searchParams.get('code')
      if (code === null || code.length === 0) {
        response.writeHead(400, { 'content-type': 'text/plain' })
        response.end('missing authorization code')
        return
      }
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(SUCCESS_PAGE)
      settle(undefined, code)
    }

    const bound = await listen(handler, spec.listen)
    servers = bound.servers
    input.redirectUri = `http://${spec.listen.host}:${bound.port}${spec.callbackPath}`

    timer = setTimeout(() => {
      settle(new Error(`login timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)
    timer.unref()

    const attempt = {
      authorizeUrl: spec.buildAuthorizeUrl(input),
      redirectUri: input.redirectUri,
      pkce: input.pkce,
      state: input.state,
      waitCode: () => codePromise,
      manual(rawInput) {
        if (settled) throw new Error(`the ${provider} login attempt already finished`)
        const trimmed = rawInput.trim()
        let code
        let pastedState
        if (/^https?:\/\//i.test(trimmed)) {
          const url = new URL(trimmed)
          code = url.searchParams.get('code') ?? undefined
          pastedState = url.searchParams.get('state') ?? undefined
        } else if (trimmed.includes('code=')) {
          const params = new URLSearchParams(trimmed)
          code = params.get('code') ?? undefined
          pastedState = params.get('state') ?? undefined
        }
        if (code === undefined || code.length === 0) {
          throw new Error('no authorization code found in the pasted input')
        }
        if (pastedState !== input.state) {
          throw new Error('state mismatch: paste the complete callback URL from this login attempt')
        }
        settle(undefined, code)
      },
      cancel() {
        settle(new Error('login cancelled'))
      },
    }
    this.attempts.set(provider, attempt)
    return attempt
  }
}
