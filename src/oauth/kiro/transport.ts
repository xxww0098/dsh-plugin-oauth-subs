/** AWS EventStream HTTP lifecycle and OpenAI streaming translation. */

import { sendJson } from '../../utils/http.js'
import { UpstreamFailure, pumpBody, quotaFailure, upstreamRequest, writeSse } from '../upstream.js'
import { forcedRefresh } from '../tokens.js'
import { headerOf, kiroStreamingProfileArn } from './index.js'
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

/** A Kiro vendor answer as the failure `run` forwards once, never replays. */
function kiroHopFailure(status, parsed, text, retryAfter = undefined) {
  const classified = classifyKiroHopError(status, parsed, text, { retryAfter })
  const body = kiroClientErrorBody(status, parsed, text)
  if (classified.code === 'kiro_quota') {
    return quotaFailure(body.error.message)
  }
  // 401/403 travel as 401 so `run` refreshes once; forwardKiro maps a survivor to 400.
  const auth = (status === 401 || status === 403) && classified.code === 'kiro_upstream'
  return new UpstreamFailure(auth ? 401 : classified.status, `kiro upstream ${status}`, {
    code: 'http',
    payload: body,
    retryAfter: classified.retryAfter,
  })
}

/**
 * One Kiro hop inside the attempt primitive: timers, transport retries and a
 * single refresh on 401/403. Nothing reaches the client before the first
 * mapped output chunk; a failure after it destroys the response.
 */
export async function forwardKiro(response, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, startedAt, timeouts }) {
  try {
    await upstreamRequest({ family: 'kiro', signal, startedAt, stream, response, timeouts }).run(
      (attempt) => attemptKiro(response, { payload, cacheSessionId, stream, session, fetchFn, attempt }),
      { refresh: forcedRefresh(tokens, () => session, (next) => { session = next }) },
    )
  } catch (error) {
    // Still refused after the refresh: the subscription itself is valid, so
    // keep it off the host's AUTH path ("API key invalid") with a 400.
    if (error instanceof UpstreamFailure && error.code === 'http' && error.status === 401) {
      throw new UpstreamFailure(400, error.message, { code: 'http', payload: error.payload })
    }
    throw error
  }
}

async function attemptKiro(response, { payload, cacheSessionId, stream, session, fetchFn, attempt }) {
  const { signal } = attempt
  const body = Buffer.from(JSON.stringify(openaiToKiro(payload, {
    conversationId: cacheSessionId,
    profileArn: kiroStreamingProfileArn(session),
  })))
  const upstream = await fetchFn(kiroChatUrl(session), { method: 'POST', headers: kiroChatHeaders(session), body, signal })
  if (upstream.status >= 400) {
    const text = await upstream.text()
    let parsed
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = null }
    throw kiroHopFailure(upstream.status, parsed, text, headerOf(upstream, 'retry-after'))
  }

  const model = typeof payload.model === 'string' ? payload.model : 'kiro'
  const id = `chatcmpl-${Date.now()}`

  if (!stream) {
    // A truncated or malformed body is a transport fault: `run` retries it.
    const openai = kiroToOpenai(Buffer.from(await upstream.arrayBuffer()), { model, id })
    if (openai.error) throw kiroHopFailure(400, openai.error, openai.error.message)
    sendJson(response, 200, openai)
    return
  }

  const parser = new KiroEventStreamParser()
  let accText = ''
  let accThinking = ''
  const toolIndexes = new Map<string, number>()
  let usage
  let contextPercentage
  if (!upstream.body) throw new Error('kiro upstream returned no event stream')
  await pumpBody(upstream.body, attempt, async (value) => {
    for (const event of parser.feed(value)) {
      const type = event.type
      const data = unwrapKiroEventPayload(event.payload, type)
      if (type === 'exception' || type === 'invalidStateEvent' || event.messageType === 'exception') {
        // After output `run` rethrows it and answerFailure destroys the response.
        throw kiroHopFailure(502, data, data.message || data.reason || 'kiro upstream exception')
      }
      const thought = thinkingTextFromPayload(type, data)
      if (thought) {
        const merged = mergeKiroText(accThinking, thought)
        accThinking = merged.text
        if (merged.delta) {
          await writeSse(response, kiroToOpenaiChunk({ reasoning_content: merged.delta }, { model, id }), signal)
        }
        continue
      }
      if ((type === 'assistantResponseEvent' || typeof data.content === 'string') && typeof data.content === 'string' && data.content) {
        const merged = mergeKiroText(accText, data.content)
        accText = merged.text
        if (merged.delta) {
          await writeSse(response, kiroToOpenaiChunk({ content: merged.delta }, { model, id }), signal)
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
        await writeSse(response, kiroToOpenaiChunk(delta, { model, id }), signal)
      }
      const tokens = data.tokenUsage ?? data.token_usage
      if (tokens) usage = mapKiroUsage(tokens)
      const percent = data.contextUsagePercentage ?? data.context_usage_percentage
      if (typeof percent === 'number' && Number.isFinite(percent)) contextPercentage = percent
    }
  })
  parser.finish()
  await writeSse(response, kiroToOpenaiChunk({}, {
    model,
    id,
    done: true,
    finishReason: toolIndexes.size ? 'tool_calls' : 'stop',
    usage: resolveKiroUsage({ usage, contextPercentage, text: accText }, model),
  }), signal)
  await writeSse(response, '[DONE]', signal)
  if (!response.writableEnded && !response.destroyed) response.end()
}
