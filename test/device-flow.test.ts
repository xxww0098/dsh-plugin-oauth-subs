import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DeviceFlowManager } from '../lib/oauth/grok/device-flow.js'
import { GROK_CLIENT_ID, grokDiscovery, resetGrokDiscovery } from '../lib/oauth/grok/index.js'

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

test('device flow omits scope when spec has none', async () => {
  const calls = []
  const fetchFn = async (url, init) => {
    calls.push(String(init.body ?? ''))
    if (String(url).includes('device')) {
      return jsonResponse(200, {
        device_code: 'dev',
        user_code: 'ABCD',
        verification_uri: 'https://auth.kimi.com/device',
        interval: 0.01,
        expires_in: 5,
      })
    }
    return jsonResponse(400, { error: 'authorization_pending' })
  }
  const devices = new DeviceFlowManager()
  const attempt = await devices.start('kimi', {
    clientId: '17e5f671-d194-4dfb-9706-5516cb48c098',
    deviceCodeUrl: 'https://auth.kimi.com/api/oauth/device_authorization',
    tokenUrl: 'https://auth.kimi.com/api/oauth/token',
    fetchFn,
  })
  assert.equal(calls[0].includes('client_id='), true)
  assert.equal(calls[0].includes('scope='), false)
  attempt.cancel()
})

test('device flow restarts device auth on expired_token when spec.restartOnExpired', async () => {
  let devices = 0
  let polls = 0
  const fetchFn = async (url) => {
    if (String(url).includes('device')) {
      devices += 1
      return jsonResponse(200, {
        device_code: `dev-${devices}`,
        user_code: devices === 1 ? 'OLD-CODE' : 'NEW-CODE',
        verification_uri: 'https://auth.kimi.com/device',
        verification_uri_complete: `https://auth.kimi.com/device?user_code=${devices === 1 ? 'OLD-CODE' : 'NEW-CODE'}`,
        interval: 0.01,
        expires_in: 30,
      })
    }
    polls += 1
    if (polls === 1) return jsonResponse(400, { error: 'expired_token' })
    return jsonResponse(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 })
  }
  const manager = new DeviceFlowManager()
  const attempt = await manager.start('kimi', {
    clientId: '17e5f671-d194-4dfb-9706-5516cb48c098',
    deviceCodeUrl: 'https://auth.kimi.com/api/oauth/device_authorization',
    tokenUrl: 'https://auth.kimi.com/api/oauth/token',
    fetchFn,
    restartOnExpired: true,
  })
  const tokens = await attempt.waitToken()
  assert.equal(tokens.access_token, 'tok')
  assert.equal(devices, 2)
  assert.equal(attempt.userCode, 'NEW-CODE')
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
