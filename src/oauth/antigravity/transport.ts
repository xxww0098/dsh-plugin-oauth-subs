/** Cloud Code HTTP lifecycle and OpenAI streaming translation. */

import { RequestError, sendJson } from '../../utils/http.js'
import { UpstreamFailure, pumpBody, upstreamRequest, writeSse } from '../upstream.js'
import { forcedRefresh } from '../tokens.js'
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

const finishReasonOf = (event) => (event?.response ?? event)?.candidates?.[0]?.finishReason

/**
 * Runs inside `upstreamRequest`: the head waits for the first mapped chunk, so
 * a stall, a transport fault, or a Google error before output is still a JSON
 * error with a real status; after output it destroys the response.
 */
export async function forwardAntigravity(response, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, startedAt, upstreamTimeouts, onValidation }) {
  const projectId = session.projectId
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new RequestError(403, 'antigravity session is missing project_id')
  }
  const built = openaiToAntigravity(payload, { projectId, sessionId: cacheSessionId })
  const sessionId = built.request.sessionId
  const body = Buffer.from(JSON.stringify(built))
  const url = stream ? ANTIGRAVITY_STREAM_URL : ANTIGRAVITY_GENERATE_URL
  const model = typeof payload.model === 'string' ? payload.model : 'antigravity'

  await upstreamRequest({ family: 'antigravity', signal, startedAt, stream, response, timeouts: upstreamTimeouts }).run(async (attempt) => {
    const headers = {
      ...antigravityChatHeaders(session),
      ...(stream ? { accept: 'text/event-stream' } : {}),
    }
    const upstream = await fetchAntigravityCloudCode(url, { method: 'POST', headers, body, signal: attempt.signal }, fetchFn)
    attempt.signal.throwIfAborted()

    if (upstream.status >= 400) {
      const text = await upstream.text()
      let parsed
      try { parsed = text ? JSON.parse(text) : null } catch { parsed = { error: { message: text } } }
      const validation = parseAntigravityValidation(parsed) ?? parseAntigravityValidation(text)
      if (validation) {
        await rememberAntigravityValidation(session, validation, tokens, onValidation)
        throw new UpstreamFailure(400, 'antigravity account needs validation', { code: 'http', payload: antigravityValidationClientError(validation) })
      }
      throw new UpstreamFailure(upstream.status, `antigravity upstream ${upstream.status}`, {
        code: 'http',
        payload: parsed ?? { error: { message: `antigravity upstream ${upstream.status}` } },
      })
    }

    if (!stream) {
      const text = await upstream.text()
      let parsed
      try { parsed = text ? JSON.parse(text) : {} } catch {
        throw new UpstreamFailure(502, 'antigravity upstream returned invalid JSON', { code: 'http' })
      }
      sendJson(response, 200, antigravityToOpenai(parsed, { model, sessionId }))
      return
    }

    const streamMapper = createAntigravityOpenaiStream({ model, id: `chatcmpl-${Date.now()}`, sessionId })
    let finished = false
    let rest = ''
    const decoder = new TextDecoder()
    const forward = async (text) => {
      const parsed = parseAntigravitySseBlocks(text)
      rest = parsed.rest
      for (const event of parsed.events) {
        if (finishReasonOf(event)) finished = true
        const chunk = streamMapper.push(event)
        if (chunk) await writeSse(response, chunk, attempt.signal)
      }
    }
    await pumpBody(upstream.body, attempt, (value) => forward(rest + decoder.decode(value, { stream: true })))
    await forward(`${rest}${decoder.decode()}\n\n`)
    // Cloud Code always closes with a finishReason frame; an EOF without one
    // is a cut stream — retried before output, destroyed after.
    if (!finished) throw new UpstreamFailure(502, 'antigravity stream ended without a finishReason', { code: 'transport' })
    await writeSse(response, streamMapper.finish(), attempt.signal)
    await writeSse(response, '[DONE]', attempt.signal)
    if (!response.writableEnded && !response.destroyed) response.end()
  }, {
    refresh: forcedRefresh(tokens, () => session, (next) => { session = next }),
  })
}
