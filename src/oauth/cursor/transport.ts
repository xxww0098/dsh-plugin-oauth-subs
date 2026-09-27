/** Cursor AgentService lifecycle and OpenAI streaming translation. */

import { RequestError, describeError, sendJson } from '../../utils/http.js'
import { cursorConversationId } from './cache.js'
import { cursorToOpenai, createCursorOpenaiStream, openaiToCursor } from './request.js'
import { runCursorAgent } from './h2-session.js'

/**
 * A destroyed response emits 'close', never 'drain', so awaiting 'drain' alone
 * hangs forever when the client goes away. Race drain against close/error/abort
 * so a disconnected client fails fast instead of pinning the upstream run.
 */
function waitForDrain(response, signal) {
  if (response.destroyed) return Promise.reject(new Error('client disconnected'))
  return new Promise((resolve, reject) => {
    const onDrain = () => { cleanup(); resolve(undefined) }
    const onClose = () => { cleanup(); reject(new Error('client disconnected before drain')) }
    const onError = (error) => { cleanup(); reject(error) }
    const onAbort = () => { cleanup(); reject(signal?.reason ?? new Error('aborted')) }
    const cleanup = () => {
      response.off('drain', onDrain)
      response.off('close', onClose)
      response.off('error', onError)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
    response.once('drain', onDrain)
    response.once('close', onClose)
    response.once('error', onError)
    if (signal) {
      if (signal.aborted) { onAbort(); return }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export async function forwardCursor(response, { payload, cacheSessionId, stream, session, signal, runFn = runCursorAgent }: any) {
  const conversationId = cacheSessionId ?? cursorConversationId(payload)
  const built = openaiToCursor(payload, { conversationId })
  const model = built.pickerModel || built.modelId
  const id = `chatcmpl-${Date.now()}`

  if (!stream) {
    const { collected } = await runFn(session, built, { signal })
    if (collected.error) throw new RequestError(502, collected.error)
    sendJson(response, 200, cursorToOpenai(collected, { model, id, conversationId: built.conversationId }))
    return
  }

  const mapper = createCursorOpenaiStream({ model, id, conversationId: built.conversationId })
  let headSent = false
  const head = () => {
    if (headSent) return
    headSent = true
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
  }
  const write = async (chunk) => {
    if (response.destroyed) throw new Error('client disconnected before write')
    if (!response.write(`data: ${JSON.stringify(chunk)}\n\n`)) await waitForDrain(response, signal)
  }
  const fail = async (message) => {
    if (!headSent) {
      sendJson(response, 502, { error: { message } })
      return
    }
    // Once output commits the status, a structured SSE error is the only way
    // to distinguish a failed run from a successfully completed answer.
    console.error(`[oauth-subs] cursor upstream error mid-stream: ${message}`)
    // The client may already be gone: the error report itself must not throw.
    await write({ error: { message, type: 'server_error', code: 'cursor_upstream' } }).catch(() => {})
    if (!response.writableEnded && !response.destroyed) response.end()
  }
  let collected
  try {
    collected = (await runFn(session, built, {
      signal,
      onEvent: async (event) => {
        const chunks = mapper.push(event)
        if (chunks.length) head()
        for (const chunk of chunks) await write(chunk)
      },
    })).collected
  } catch (error) {
    if (signal.aborted) throw error
    await fail(describeError(error))
    return
  }
  if (collected.error) {
    await fail(collected.error)
    return
  }
  head()
  await write(mapper.finish())
  response.write('data: [DONE]\n\n')
  if (!response.writableEnded && !response.destroyed) response.end()
}
