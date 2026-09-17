/**
 * Devin chat transport: Connect-RPC v1 over HTTP/1.1 to
 * `server.codeium.com/exa.api_server_pb.ApiServerService/GetChatMessage`.
 *
 *   request : one frame, flag 0x01, gzipped GetChatMessageRequest
 *   response: data frames (flag 0x01 = gzipped proto) + a 0x02 end frame
 *             carrying JSON trailers ({ error: { code, message } })
 *
 * Auth rides inside `Metadata.api_key` (the devin-session-token$… string), so
 * no Authorization header is sent. `GetUserJwt` (unary application/proto)
 * optionally mints a short-lived `user_jwt` + custom api server; failures are
 * non-fatal — chat works with the session token alone (verified live).
 */

import { once } from 'node:events'
import { RequestError, describeError, sendJson } from '../../utils/http.js'
import {
  DEVIN_TIER_NAMES,
  devinApiServer,
  pickDevinHumanAccount,
  DEVIN_CHAT_PATH,
  DEVIN_USER_JWT_PATH,
  DEVIN_USER_STATUS_PATH,
} from './index.js'
import { deterministicDevinId } from './cache.js'
import {
  createDevinOpenaiStream,
  devinBasicAuth,
  devinMetadataBytes,
  devinToOpenai,
  openaiToDevin,
} from './request.js'
import {
  connectTrailerError,
  decodeGetUserJwtResponse,
  decodeGetChatMessageResponse,
  decodeGetUserStatusResponse,
  decodeUnaryBody,
  encodeGetChatMessageRequest,
  encodeGetUserJwtRequest,
  encodeGetUserStatusRequest,
  frameConnect,
  splitConnectFrames,
  unframePayload,
} from './proto.js'

const CHAT_HEADERS = Object.freeze({
  'content-type': 'application/connect+proto',
  'connect-protocol-version': '1',
  'connect-content-encoding': 'gzip',
  'accept-encoding': 'identity',
  'connect-accept-encoding': 'gzip',
  'user-agent': 'connect-go/1.18.1 (go1.26.3)',
})

const UNARY_HEADERS = Object.freeze({
  'content-type': 'application/proto',
  'connect-protocol-version': '1',
  accept: '*/*',
})

export class DevinTransportError extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'DevinTransportError'
    this.status = status
  }
}

/**
 * Best-effort GetUserJwt: mints metadata.user_jwt and may redirect to a
 * deployment-specific api server (custom_api_server_url). Returns undefined
 * on any failure — the session token alone is accepted (verified live).
 */
export async function devinUserJwt(session, { fetchFn = fetch, signal } = {}) {
  const base = devinApiServer(session)
  const body = encodeGetUserJwtRequest(devinMetadataBytes(session))
  try {
    const response = await fetchFn(`${base}${DEVIN_USER_JWT_PATH}`, {
      method: 'POST',
      headers: { ...UNARY_HEADERS, authorization: devinBasicAuth(session) },
      body,
      signal,
    })
    const payload = Buffer.from(await response.arrayBuffer())
    if (!response.ok) return undefined
    const decoded = decodeGetUserJwtResponse(decodeUnaryBody(payload))
    const baseUrl = decoded.customApiServerUrl?.trim()
    return {
      userJwt: decoded.userJwt || undefined,
      baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : undefined,
    }
  } catch {
    return undefined
  }
}

/**
 * SeatManagementService/GetUserStatus (unary application/proto, raw body) —
 * the quota + identity RPC. Throws on HTTP errors; 401/403 are permanent.
 */
export async function devinUserStatus(session, { fetchFn = fetch, signal } = {}) {
  const base = devinApiServer(session)
  const body = encodeGetUserStatusRequest(devinMetadataBytes(session))
  const response = await fetchFn(`${base}${DEVIN_USER_STATUS_PATH}`, {
    method: 'POST',
    headers: { ...UNARY_HEADERS, authorization: devinBasicAuth(session) },
    body,
    signal,
  })
  const payload = Buffer.from(await response.arrayBuffer())
  if (!response.ok) {
    const error = new DevinTransportError(
      `Devin GetUserStatus failed (HTTP ${response.status}): ${payload.toString('utf8').slice(0, 300)}`,
      { status: response.status },
    )
    if (response.status === 401 || response.status === 403) error.permanent = true
    throw error
  }
  return decodeGetUserStatusResponse(decodeUnaryBody(payload))
}

/**
 * Identity for a stored session: email (or display name) + plan label from
 * GetUserStatus. Opaque ids never become the account name.
 */
export async function resolveDevinIdentity(session, { fetchFn = fetch, statusFn = devinUserStatus } = {}) {
  const status = await statusFn(session, { fetchFn })
  const user = status?.userStatus ?? {}
  const plan = status?.planInfo ?? user.planStatus?.planInfo ?? {}
  const devinInfo = plan.devinInfo ?? {}
  const tier = user.teamsTier ?? plan.teamsTier
  const planType = plan.planName || (typeof tier === 'number' ? DEVIN_TIER_NAMES[tier] : undefined)
  return {
    account: pickDevinHumanAccount(user.email, user.name, devinInfo.accountDisplayName),
    planType,
    userId: user.userId,
    teamId: user.teamId,
  }
}

/**
 * Run one GetChatMessage turn. `built` is what openaiToDevin returns.
 * `onEvent` receives {type:'text'|'thinking'|'tool'|'usage'|'stop', …} deltas;
 * the resolved value is the fully collected turn.
 */
export async function runDevinChat(session, built, { signal, onEvent, fetchFn = fetch } = {}) {
  if (!session?.accessToken) throw new DevinTransportError('Devin chat needs a session token', { status: 401 })
  const auth = await devinUserJwt(session, { fetchFn, signal })
  const base = auth?.baseUrl ?? devinApiServer(session)
  const metadata = devinMetadataBytes(session, { userJwt: auth?.userJwt })
  const requestBytes = encodeGetChatMessageRequest({ metadata, ...built.fields })
  const frame = frameConnect(requestBytes, { compress: true })

  const response = await fetchFn(`${base}${DEVIN_CHAT_PATH}`, {
    method: 'POST',
    headers: { ...CHAT_HEADERS, authorization: devinBasicAuth(session) },
    body: frame,
    signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error = new DevinTransportError(
      `Devin chat failed (HTTP ${response.status})${text ? `: ${text.slice(0, 300)}` : ''}`,
      { status: response.status },
    )
    if (response.status === 401 || response.status === 403) error.permanent = true
    throw error
  }
  if (!response.body) throw new DevinTransportError('Devin chat returned an empty body')

  const collected = {
    text: '',
    thinking: '',
    toolCalls: [],
    usage: undefined,
    stopReason: undefined,
    messageId: undefined,
    actualModelUid: undefined,
  }
  const toolCalls = new Map()
  const toolJson = new Map()
  let activeToolCallId

  const pendingWrites = []
  const emit = (event) => {
    if (typeof onEvent !== 'function') return
    const next = onEvent(event)
    if (next && typeof next.then === 'function') pendingWrites.push(next)
  }
  const consume = (msg) => {
    if (msg.messageId && !collected.messageId) collected.messageId = msg.messageId
    if (msg.actualModelUid) collected.actualModelUid = msg.actualModelUid
    if (msg.deltaThinking) {
      collected.thinking += msg.deltaThinking
      emit({ type: 'thinking', delta: msg.deltaThinking })
    }
    if (msg.deltaText) {
      collected.text += msg.deltaText
      emit({ type: 'text', delta: msg.deltaText })
    }
    for (const call of msg.deltaToolCalls ?? []) {
      const callId = call.id || activeToolCallId
      if (!callId) continue
      activeToolCallId = callId
      let entry = toolCalls.get(callId)
      if (!entry) {
        entry = { id: callId, name: call.name ?? '', argumentsJson: '' }
        toolCalls.set(callId, entry)
        toolJson.set(callId, '')
      }
      if (call.name) entry.name = call.name
      if (call.argumentsJson) {
        // The server may resend the whole buffer or stream deltas; keep
        // whichever grows the accumulated JSON (reference-client behavior).
        const previous = toolJson.get(callId) ?? ''
        const accumulated = call.argumentsJson.startsWith(previous) ? call.argumentsJson : previous + call.argumentsJson
        toolJson.set(callId, accumulated)
        entry.argumentsJson = accumulated
        emit({ type: 'tool', call: { id: callId, name: entry.name, argumentsJson: accumulated } })
      }
    }
    if (msg.stopReason !== undefined && msg.stopReason !== 0) {
      collected.stopReason = msg.stopReason
      emit({ type: 'stop', reason: msg.stopReason })
    }
    if (msg.usage) {
      collected.usage = msg.usage
      emit({ type: 'usage', usage: msg.usage })
    }
  }

  const reader = response.body.getReader()
  let pending = Buffer.alloc(0)
  for (;;) {
    const { done, value } = await reader.read()
    if (value && value.length > 0) pending = Buffer.concat([pending, Buffer.from(value)])
    const { frames, rest } = splitConnectFrames(pending)
    pending = rest
    for (const item of frames) {
      if (item.end) {
        const trailer = connectTrailerError(unframePayload(item).toString('utf8'))
        if (trailer) throw new DevinTransportError(`Devin chat stream error: ${trailer}`)
        continue
      }
      consume(decodeGetChatMessageResponse(unframePayload(item)))
    }
    if (pendingWrites.length) await Promise.all(pendingWrites.splice(0))
    if (done) break
  }

  collected.toolCalls = [...toolCalls.values()]
  if (!collected.text && collected.toolCalls.length === 0 && !collected.thinking && collected.stopReason === undefined) {
    throw new DevinTransportError('Devin chat stream ended without a message')
  }
  return collected
}

/**
 * Proxy-facing forward, same contract as forwardCursor: writes the OpenAI
 * response itself — Completions JSON or SSE. `runFn`/`fetchFn` are test seams.
 */
export async function forwardDevin(response, {
  payload,
  cacheSessionId,
  stream,
  session,
  signal,
  fetchFn = fetch,
  runFn = runDevinChat,
} = {}) {
  if (!session?.accessToken) {
    throw new RequestError(401, 'Devin needs a logged-in session token (login or import the CLI credentials)')
  }
  const source = payload && typeof payload === 'object' ? payload : {}
  const cascadeId = cacheSessionId
    ? deterministicDevinId(cacheSessionId)
    : deterministicDevinId(`dsh-devin:${String(source.model ?? 'default')}`)
  const built = openaiToDevin(source, { cascadeId })
  const model = source.model ?? built.chatModelUid
  const id = `chatcmpl-${Date.now()}`

  if (!stream) {
    const collected = await runFn(session, built, { signal, fetchFn })
    sendJson(response, 200, devinToOpenai(collected, { model, id }))
    return
  }

  const mapper = createDevinOpenaiStream({ model, id })
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
    if (!response.write(chunk)) await once(response, 'drain', { signal })
  }
  const fail = async (message) => {
    if (!headSent) {
      sendJson(response, 502, { error: { message } })
      return
    }
    // Once output commits the status, a structured SSE error is the only way
    // to distinguish a failed run from a successfully completed answer.
    console.error(`[oauth-subs] devin upstream error mid-stream: ${message}`)
    await write(`data: ${JSON.stringify({ error: { message, type: 'server_error', code: 'devin_upstream' } })}\n\n`)
    if (!response.writableEnded && !response.destroyed) response.end()
  }
  try {
    await runFn(session, built, {
      signal,
      fetchFn,
      onEvent: async (event) => {
        const chunks = mapper.push(event)
        if (chunks.length) head()
        for (const chunk of chunks) await write(chunk)
      },
    })
  } catch (error) {
    if (signal?.aborted) throw error
    await fail(describeError(error))
    return
  }
  head()
  for (const chunk of mapper.finish()) await write(chunk)
  if (!response.writableEnded && !response.destroyed) response.end()
}
