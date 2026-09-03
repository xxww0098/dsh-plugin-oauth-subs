/**
 * In-process Node http2 client for Cursor Connect RPCs.
 * Persistent session is OK; unary GetUsableModels uses a one-shot stream.
 * Do not add Bun.
 */

import http2 from 'node:http2'
import {
  CURSOR_AGENT_URL,
  CURSOR_API2_URL,
  CURSOR_MODELS_PATH,
  CURSOR_RUN_PATH,
  cursorAgentUrl,
  cursorChatHeaders,
} from './index.js'
import {
  encodeCancelAction,
  encodeExecThrow,
  encodeGetUsableModelsRequest,
  encodeKvClientMessage,
  decodeGetUsableModelsResponse,
  frameConnect,
  splitConnectFrames,
} from './proto.js'
import { consumeCursorFrames } from './request.js'

function hexOf(buf) {
  return Buffer.isBuffer(buf) ? buf.toString('hex') : ''
}

export function describeH2TransportError(error, baseUrl) {
  const code = error?.code
  const message = error instanceof Error ? error.message : String(error)
  if (code === 'ERR_HTTP2_ERROR' && /h2 is not supported/i.test(message)) {
    return (
      `Cursor transport could not negotiate HTTP/2 with ${baseUrl}: "h2 is not supported". ` +
      'Cursor RPCs are HTTP/2 only; an ALPN-stripping TLS proxy usually causes this.'
    )
  }
  return message
}

function requestHeaders(session, { path, unary }) {
  const headers = cursorChatHeaders(session, { unary })
  return {
    ':method': 'POST',
    ':path': path,
    ...headers,
  }
}

export async function cursorUnaryRpc({
  session,
  url = CURSOR_API2_URL,
  path,
  body = Buffer.alloc(0),
  connectFn = http2.connect,
  signal,
}) {
  return new Promise((resolve, reject) => {
    const client = connectFn(url)
    const fail = (error) => {
      try { client.close() } catch { /* */ }
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const onAbort = () => fail(new Error('aborted'))
    signal?.addEventListener('abort', onAbort, { once: true })
    client.on('error', (error) => fail(new Error(describeH2TransportError(error, url))))
    const stream = client.request(requestHeaders(session, { path, unary: true }))
    const chunks = []
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', fail)
    stream.on('end', () => {
      signal?.removeEventListener('abort', onAbort)
      try { client.close() } catch { /* */ }
      resolve(Buffer.concat(chunks))
    })
    stream.end(body)
  })
}

export async function fetchCursorUsableModels(session, { connectFn, signal } = {}) {
  const raw = await cursorUnaryRpc({
    session,
    url: cursorAgentUrl() || CURSOR_AGENT_URL,
    path: CURSOR_MODELS_PATH,
    body: encodeGetUsableModelsRequest(),
    connectFn,
    signal,
  })
  return decodeGetUsableModelsResponse(raw)
}

/**
 * Drive AgentService/Run. Answers KV get/set from the local blob store.
 * Native Cursor tools are thrown so DSH Completions can own MCP tools.
 */
export async function runCursorAgent(session, built, {
  signal,
  connectFn = http2.connect,
  url = cursorAgentUrl() || CURSOR_AGENT_URL,
  onEvent,
} = {}) {
  const blobStore = built.blobStore ?? new Map()
  const events = []
  const collected = { text: '', thinking: '', toolCalls: [], usage: {}, error: undefined }

  return new Promise((resolve, reject) => {
    let settled = false
    const client = connectFn(url)
    const finish = (error) => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', onAbort)
      try { client.close() } catch { /* */ }
      if (error) reject(error)
      else resolve({ events, collected })
    }
    const onAbort = () => finish(new Error('aborted'))
    signal?.addEventListener('abort', onAbort, { once: true })
    client.on('error', (error) => finish(new Error(describeH2TransportError(error, url))))

    const stream = client.request(requestHeaders(session, { path: CURSOR_RUN_PATH, unary: false }))
    let rest = Buffer.alloc(0)
    const send = (bytes) => {
      if (stream.destroyed || stream.closed) return
      stream.write(frameConnect(bytes))
    }

    const handle = (msg) => {
      if (msg.kind === 'error') {
        collected.error = msg.message
        events.push(msg)
        onEvent?.(msg)
        finish(new Error(msg.message))
        return
      }
      if (msg.kind === 'kv') {
        const key = hexOf(msg.blobId)
        if (msg.set && msg.blobData && key) blobStore.set(key, Buffer.from(msg.blobData))
        const data = key ? blobStore.get(key) : undefined
        send(encodeKvClientMessage({ id: msg.id ?? 0, blobData: data }))
        return
      }
      if (msg.kind === 'exec') {
        send(encodeExecThrow({ id: msg.id, error: 'dsh owns tool execution' }))
        if (msg.mcp?.name) {
          const tool = { id: msg.mcp.toolCallId || `call_${events.length + 1}`, name: msg.mcp.name }
          collected.toolCalls.push({
            id: tool.id,
            type: 'function',
            function: { name: tool.name, arguments: '{}' },
          })
          const event = { kind: 'interaction', toolCall: tool }
          events.push(event)
          onEvent?.(event)
        }
        return
      }
      if (msg.kind === 'query') {
        send(encodeCancelAction())
        return
      }
      if (msg.kind === 'interaction') {
        if (msg.text) collected.text += msg.text
        if (msg.thinking) collected.thinking += msg.thinking
        if (msg.tokens) {
          collected.usage.completionTokens = (collected.usage.completionTokens ?? 0) + msg.tokens
        }
        if (msg.toolCall) {
          collected.toolCalls.push({
            id: msg.toolCall.id,
            type: 'function',
            function: { name: msg.toolCall.name, arguments: '{}' },
          })
        }
        events.push(msg)
        onEvent?.(msg)
        if (msg.turnEnded) {
          try { stream.end() } catch { /* */ }
          finish()
        }
        return
      }
    }

    stream.on('data', (chunk) => {
      rest = consumeCursorFrames(chunk, rest, handle)
    })
    stream.on('error', (error) => finish(error))
    stream.on('end', () => finish())
    stream.write(frameConnect(built.requestBytes))
  })
}

export { CURSOR_AGENT_URL, CURSOR_RUN_PATH, splitConnectFrames }
