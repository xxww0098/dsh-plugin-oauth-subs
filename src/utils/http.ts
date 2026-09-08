/** Provider-independent HTTP responses and transport error descriptions. */

import type { ServerResponse } from 'node:http'

export class RequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, unknown> = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const headers: Record<string, string | number> = {
    'content-type': 'application/json; charset=utf-8',
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

/** undici reports socket faults as a bare "fetch failed"; the cause carries the reason. */
export function describeError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : error
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined
  const detail = cause && typeof cause === 'object'
    ? (('code' in cause ? cause.code : undefined) ?? ('message' in cause ? cause.message : undefined))
    : undefined
  return detail === undefined ? String(message) : String(message) + ': ' + String(detail)
}
