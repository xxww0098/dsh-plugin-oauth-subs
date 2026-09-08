/** Cloud Code HTTP lifecycle and OpenAI streaming translation. */

import { once } from 'node:events'
import { RequestError, describeError, sendJson } from '../../utils/http.js'
import {
  ANTIGRAVITY_GENERATE_URL,
  ANTIGRAVITY_STREAM_URL,
  applyAntigravityValidation,
  antigravityChatHeaders,
  antigravityValidationClientError,
  fetchAntigravityCloudCode,
  parseAntigravityValidation,
} from './index.js'
import { antigravityToOpenai, createAntigravityOpenaiStream, openaiToAntigravity, parseAntigravitySseBlocks } from './request.js'
import { antigravitySessionIdOf } from './cache.js'

async function rememberAntigravityValidation(session, info, tokens, onValidation) {
  if (!info?.required) return
  const next = applyAntigravityValidation(session, info)
  if (tokens && typeof tokens.remember === 'function') {
    await tokens.remember(session, {
      needsValidation: true,
      ...(next.validationUrl ? { validationUrl: next.validationUrl } : {}),
    })
  }
  onValidation?.(next)
}

export async function forwardAntigravity(response, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, onValidation }) {
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
      sendJson(response, 400, antigravityValidationClientError(validation))
      return
    }
    sendJson(response, upstream.status, parsed ?? { error: { message: `antigravity upstream ${upstream.status}` } })
    return
  }

  const model = typeof payload.model === 'string' ? payload.model : 'antigravity'
  if (!stream) {
    const text = await upstream.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : {} } catch {
      throw new RequestError(502, 'antigravity upstream returned invalid JSON')
    }
    sendJson(response, 200, antigravityToOpenai(parsed, { model, sessionId }))
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
  const decoder = new TextDecoder()
  const reader = upstream.body?.getReader()
  if (!reader) {
    response.write(`data: ${JSON.stringify(streamMapper.finish())}\n\n`)
    response.write('data: [DONE]\n\n')
    response.end()
    return
  }
  while (true) {
    const { done, value } = await reader.read()
    rest += decoder.decode(value, { stream: !done })
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
