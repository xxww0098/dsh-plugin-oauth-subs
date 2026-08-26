import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DeviceFlowManager } from '../lib/device-flow.js'
import { GROK_CLIENT_ID, grokDiscovery, resetGrokDiscovery } from '../lib/grok.js'

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('device flow polls until access_token and honors slow_down', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), body: init.body })
    if (String(url).includes('/device')) {
      return jsonResponse(200, {
        device_code: 'dev',
        user_code: 'WDJB-MJHT',
        verification_uri: 'https://auth.x.ai/device',
        interval: 0.01,
        expires_in: 30,
      })
    }
    if (calls.filter((c) => String(c.url).includes('/token')).length < 2) {
      return jsonResponse(200, { error: 'authorization_pending' })
    }
    return jsonResponse(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 })
  }
  const devices = new DeviceFlowManager()
  const attempt = await devices.start('grok', {
    clientId: GROK_CLIENT_ID,
    scope: 'openid',
    deviceCodeUrl: 'https://auth.x.ai/oauth2/device/code',
    tokenUrl: 'https://auth.x.ai/oauth2/token',
    fetchFn,
  })
  assert.equal(attempt.userCode, 'WDJB-MJHT')
  const tokens = await attempt.waitToken()
  assert.equal(tokens.access_token, 'tok')
  assert.equal(devices.isBusy('grok'), false)
})

test('grokDiscovery rejects non-x.ai endpoints', async () => {
  resetGrokDiscovery()
  const fetchFn = async () => jsonResponse(200, {
    authorization_endpoint: 'https://evil.example/authorize',
    token_endpoint: 'https://auth.x.ai/oauth2/token',
  })
  await assert.rejects(grokDiscovery(fetchFn), /non-x.ai/)
})

test('grokDiscovery caches validated x.ai endpoints including device code', async () => {
  resetGrokDiscovery()
  let hits = 0
  const fetchFn = async () => {
    hits += 1
    return jsonResponse(200, {
      authorization_endpoint: 'https://auth.x.ai/oauth2/auth',
      token_endpoint: 'https://auth.x.ai/oauth2/token',
      device_authorization_endpoint: 'https://auth.x.ai/oauth2/device/code',
    })
  }
  const first = await grokDiscovery(fetchFn)
  const second = await grokDiscovery(fetchFn)
  assert.equal(hits, 1)
  assert.equal(first.deviceAuthorizationEndpoint, 'https://auth.x.ai/oauth2/device/code')
  assert.equal(second.tokenEndpoint, first.tokenEndpoint)
  resetGrokDiscovery()
})
