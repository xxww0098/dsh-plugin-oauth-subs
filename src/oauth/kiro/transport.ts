/** AWS EventStream HTTP lifecycle and OpenAI streaming translation. */

import { sendJson } from '../../utils/http.js'
import { UpstreamFailure, pumpBody, quotaFailure, upstreamRequest, writeSse } from '../upstream.js'
import { forcedRefresh } from '../tokens.js'
import { recordKiroPrefix } from './cache.js'
import { kiroCatalogModels } from './catalog.js'
import { headerOf, kiroProfileArn } from './index.js'
import {
  classifyKiroHopError,
  kiroChatHeaders,
  kiroChatUrl,
  kiroClientErrorBody,
  kiroToOpenai,
  kiroToOpenaiChunk,
  KiroEventStreamParser,
  isKiroOutputCap,
  mapKiroUsage,
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
 * The first try must show real output within 90s. Live (2026-09-29), twice:
 * first chunk at ~105s, then 242s of silence until the stream was cut; the
 * host's retry answered in 6s. Slow but healthy starts measured up to 61s
 * (upstream overload) and 12–23s (cold 288K-token prefix). ponytail: fixed
 * window; a cold near-1M prompt under load may need more — its retry still
 * has the rest of the 270s budget.
 */
const KIRO_FIRST_OUTPUT_MS = 90_000

/**
 * One Kiro hop inside the attempt primitive: timers, transport retries and a
 * single refresh on 401/403. Nothing reaches the client before the first
 * mapped output chunk; a failure after it destroys the response.
 */
export async function forwardKiro(response, { payload, cacheSessionId, stream, session, tokens, fetchFn, signal, startedAt, timeouts }) {
  // One cacheable-prefix estimate per request, not per retry of it.
  let recorded = false
  const onBody = (body) => {
    if (recorded) return
    recorded = true
    recordKiroPrefix({ conversationId: cacheSessionId, session: payload.prompt_cache_key ?? payload.session_id, model: payload.model, body })
  }
  try {
    await upstreamRequest({ family: 'kiro', signal, startedAt, stream, response, timeouts: { firstOutputMs: KIRO_FIRST_OUTPUT_MS, ...timeouts } }).run(
      (attempt) => attemptKiro(response, { payload, cacheSessionId, stream, session, fetchFn, attempt, onBody }),
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

async function attemptKiro(response, { payload, cacheSessionId, stream, session, fetchFn, attempt, onBody }) {
  const { signal } = attempt
  const row = kiroCatalogModels().find((model) => model.id === payload.model)
  const kiroBody = openaiToKiro(payload, {
    conversationId: cacheSessionId,
    profileArn: kiroProfileArn(session),
    efforts: row?.reasoningEfforts,
  })
  onBody(kiroBody)
  const body = Buffer.from(JSON.stringify(kiroBody))
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
    const openai = kiroToOpenai(Buffer.from(await upstream.arrayBuffer()), { model, id, window: row?.contextWindow })
    // Same answer as a streamed exception: a vendor fault is retryable (502), the
    // classifier still turns quota / capacity / too-big into their own codes.
    if (openai.error) throw kiroHopFailure(502, openai.error, openai.error.message)
    sendJson(response, 200, openai)
    return
  }

  const parser = new KiroEventStreamParser()
  let accText = ''
  let accThinking = ''
  let accToolText = ''
  const toolIndexes = new Map<string, number>()
  const toolWithArgs = new Set<string>()
  let usage
  let contextPercentage
  let capped = false
  if (!upstream.body) throw new Error('kiro upstream returned no event stream')
  await pumpBody(upstream.body, attempt, async (value) => {
    for (const event of parser.feed(value)) {
      if (isKiroOutputCap(event)) {
        capped = true
        continue
      }
      const type = event.type
      const data = unwrapKiroEventPayload(event.payload, type)
      if (type === 'exception' || type === 'invalidStateEvent' || event.messageType === 'exception') {
        // After output `run` rethrows it and answerFailure destroys the response.
        throw kiroHopFailure(502, data, data.message || data.reason || 'kiro upstream exception')
      }
      const thought = thinkingTextFromPayload(type, data)
      if (thought) {
        accThinking += thought
        await writeSse(response, kiroToOpenaiChunk({ reasoning_content: thought }, { model, id }), signal)
        continue
      }
      if ((type === 'assistantResponseEvent' || typeof data.content === 'string') && typeof data.content === 'string' && data.content) {
        // Chunks are deltas (live: a run of `-` arrives as `-`×12 then `-`×48).
        accText += data.content
        await writeSse(response, kiroToOpenaiChunk({ content: data.content }, { model, id }), signal)
      } else if (type === 'toolUseEvent') {
        const toolUseId = data.toolUseId ?? data.tool_use_id
        if (!toolUseId || data.stop) continue
        if (!toolIndexes.has(toolUseId)) toolIndexes.set(toolUseId, toolIndexes.size)
        const args = typeof data.input === 'string' ? data.input : (data.input != null ? JSON.stringify(data.input) : '')
        accToolText += `${data.name ?? ''}${args}`
        if (args) toolWithArgs.add(toolUseId)
        const delta = { tool_calls: [{
          index: toolIndexes.get(toolUseId),
          id: toolUseId,
          type: 'function',
          function: {
            ...(data.name ? { name: data.name } : {}),
            arguments: args,
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
  // A tool with no parameters streams no argument text; the buffered path
  // answers `{}` for it, so the stream does too rather than an empty string.
  for (const [toolUseId, index] of toolIndexes) {
    if (toolWithArgs.has(toolUseId)) continue
    await writeSse(response, kiroToOpenaiChunk({ tool_calls: [{ index, function: { arguments: '{}' } }] }, { model, id }), signal)
  }
  await writeSse(response, kiroToOpenaiChunk({}, {
    model,
    id,
    done: true,
    finishReason: capped ? 'length' : toolIndexes.size ? 'tool_calls' : 'stop',
    usage: resolveKiroUsage({ usage, contextPercentage, text: accText, thinking: accThinking, toolText: accToolText }, model, row?.contextWindow),
  }), signal)
  await writeSse(response, '[DONE]', signal)
  if (!response.writableEnded && !response.destroyed) response.end()
}
