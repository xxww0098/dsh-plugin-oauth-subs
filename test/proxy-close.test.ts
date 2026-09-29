import assert from 'node:assert/strict'
import http from 'node:http'
import { test } from 'node:test'
import { createProxy } from '../lib/oauth/proxy.js'
import { encodeKiroEventStream } from '../lib/oauth/kiro/request.js'

const session = { accessToken: 'tok', region: 'us-east-1', authMethod: 'social' }
const body = JSON.stringify({ model: 'deepseek-3.2', stream: false, messages: [{ role: 'user', content: 'hi' }] })

/** One request over the shared keep-alive agent; resolves on the response end. */
function send(port: number, agent: http.Agent, { method = 'GET', path = '/health', payload = undefined as string | undefined } = {}) {
  return new Promise<{ status: number, connection: string | undefined }>((resolve, reject) => {
    const request = http.request({ port, agent, method, path, headers: { authorization: 'Bearer k', 'content-type': 'application/json' } }, (response) => {
      response.resume()
      response.on('end', () => resolve({ status: response.statusCode ?? 0, connection: response.headers.connection }))
    })
    request.on('error', reject)
    request.end(payload)
  })
}

test('close() waits for the in-flight request; the next request on its socket is answered and told to reconnect', async () => {
  let release
  const gate = new Promise<void>((resolve) => { release = resolve })
  const fetchFn = async () => { await gate; return new Response(encodeKiroEventStream([{ type: 'assistantResponseEvent', payload: { content: 'ok' } }])) }
  const proxy = createProxy({ port: 0, apiKey: 'k', tokens: { kiro: { session: async () => session } }, fetchFn })
  const server = await proxy.listen()
  const port = server.address().port
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
  try {
    const inFlight = send(port, agent, { method: 'POST', path: '/kiro/v1/chat/completions', payload: body })
    await new Promise((resolve) => setTimeout(resolve, 50))
    let closed = false
    const closing = proxy.close().then(() => { closed = true })
    await new Promise((resolve) => setTimeout(resolve, 400))
    assert.equal(closed, false, 'the request in flight holds close()')
    release()
    assert.equal((await inFlight).status, 200)
    // Same pooled socket, straight after: the old instance still answers it, but ends the connection.
    const next = await send(port, agent)
    assert.equal(next.status, 200)
    assert.equal(next.connection, 'close')
    await closing
    assert.equal(closed, true)
  } finally {
    agent.destroy()
    await proxy.close()
  }
})

test('close() with nothing in flight resolves at once and refuses new connections', async () => {
  const proxy = createProxy({ port: 0, apiKey: 'k', tokens: {} })
  const server = await proxy.listen()
  const port = server.address().port
  await proxy.close()
  await assert.rejects(send(port, new http.Agent()), (error: any) => error.code === 'ECONNREFUSED')
  await proxy.close() // idempotent
})
