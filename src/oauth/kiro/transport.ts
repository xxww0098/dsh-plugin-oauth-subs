/** AWS EventStream HTTP lifecycle and OpenAI streaming translation. */

import { once } from 'node:events'
import { RequestError, describeError, sendJson } from '../../utils/http.js'
import { kiroStreamingProfileArn } from './index.js'
import { KIRO_STABLE_SESSION, kiroConversationId } from './cache.js'
import {
  classifyKiroHopError,
  kiroChatHeaders,
  kiroChatUrl,
  kiroClientErrorBody,
  kiroToOpenai,
  kiroToOpenaiChunk,
  KiroEventStreamParser,
  mapKiroUsage,
  mergeKiroText,
  openaiToKiro,
  resolveKiroUsage,
  thinkingTextFromPayload,
  unwrapKiroEventPayload,
} from './request.js'

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
  sendJson(
    response,
    classified.status,
    kiroClientErrorBody(status, parsed, text),
    classified.retryAfter ? { 'retry-after': classified.retryAfter } : {},
  )
}

async function writeKiroSse(response, chunk, signal) {
  if (!response.headersSent) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
  }
  if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`)) await once(response, 'drain', { signal })
}

export async function forwardKiro(response, { payload, cacheSessionId, stream, session, fetchFn, signal }) {
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
    let openai
    try {
      openai = kiroToOpenai(buffer, { model, id })
    } catch (error) {
      throw new RequestError(502, describeError(error))
    }
    if (openai.error) {
      sendJson(response, 400, kiroClientErrorBody(400, openai.error, openai.error.message))
      return
    }
    sendJson(response, 200, openai)
    return
  }

  const parser = new KiroEventStreamParser()
  let accText = ''
  let accThinking = ''
  const toolIndexes = new Map<string, number>()
  let usage
  let contextPercentage
  const reader = upstream.body?.getReader()
  if (!reader) {
    throw new RequestError(502, 'kiro upstream returned no event stream')
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      const events = parser.feed(value ?? Buffer.alloc(0))
      for (const event of events) {
        const type = event.type
        const data = unwrapKiroEventPayload(event.payload, type)
        if (type === 'exception' || type === 'invalidStateEvent' || event.messageType === 'exception') {
          throw new RequestError(502, data.message || data.reason || 'kiro upstream exception')
        }
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
          if (!toolIndexes.has(toolUseId)) toolIndexes.set(toolUseId, toolIndexes.size)
          const delta = { tool_calls: [{
            index: toolIndexes.get(toolUseId),
            id: toolUseId,
            type: 'function',
            function: {
              ...(data.name ? { name: data.name } : {}),
              arguments: typeof data.input === 'string' ? data.input : (data.input != null ? JSON.stringify(data.input) : ''),
            },
          }] }
          await writeKiroSse(response, kiroToOpenaiChunk(delta, { model, id }), signal)
        }
        const tokens = data.tokenUsage ?? data.token_usage
        if (tokens) usage = mapKiroUsage(tokens)
        const percent = data.contextUsagePercentage ?? data.context_usage_percentage
        if (typeof percent === 'number' && Number.isFinite(percent)) contextPercentage = percent
      }
      if (done) {
        parser.finish()
        break
      }
    }
  } catch (error) {
    if (signal.aborted) throw error
    const message = describeError(error)
    console.error('[oauth-subs] kiro stream failed: ' + message)
    if (!response.headersSent) sendKiroUpstreamError(response, 502, message, upstream.headers)
    else {
      await writeKiroSse(response, kiroClientErrorBody(502, undefined, message), signal)
      response.end()
    }
    return
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  await writeKiroSse(response, kiroToOpenaiChunk({}, {
    model,
    id,
    done: true,
    finishReason: toolIndexes.size ? 'tool_calls' : 'stop',
    usage: resolveKiroUsage({ usage, contextPercentage, text: accText }, model),
  }), signal)
  response.write('data: [DONE]\n\n')
  if (!response.writableEnded && !response.destroyed) response.end()
}
