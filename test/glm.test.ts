import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GLM_CLIENT_ID,
  GLM_CLI_INIT_URL,
  completeGlmCli,
  glmSession,
  parseCliInit,
  parseCliPoll,
  unwrapEnvelope,
} from '../lib/oauth/glm/index.js'
import { parseGlmQuota } from '../lib/oauth/quota.js'
import { buildProviders } from '../lib/oauth/models.js'

test('unwrapEnvelope accepts ZCode code 0 and biz code 200', () => {
  assert.equal(unwrapEnvelope({ code: 0, data: { ok: true } }, 'x').ok, true)
  assert.equal(unwrapEnvelope({ code: 200, success: true, data: { ok: true } }, 'x').ok, true)
  assert.throws(() => unwrapEnvelope({ code: 401, msg: 'denied' }, 'login'), /denied/)
})

test('parseCliInit reads flow_id and authorize_url', () => {
  const started = parseCliInit({
    code: 0,
    data: {
      flow_id: 'flow-1',
      authorize_url: `https://chat.z.ai/api/oauth/authorize?client_id=${GLM_CLIENT_ID}`,
      poll_interval_sec: 2,
      expires_at: Date.now() + 60_000,
    },
  })
  assert.equal(started.flowId, 'flow-1')
  assert.equal(started.authorizeUrl.includes(GLM_CLIENT_ID), true)
  assert.equal(started.intervalMs, 2000)
})

test('parseCliPoll stays pending until ready with zai access_token', () => {
  assert.equal(parseCliPoll({ code: 0, data: { status: 'pending' } }).ready, false)
  const ready = parseCliPoll({
    code: 0,
    data: {
      status: 'ready',
      token: 'zcode-jwt',
      zai: { access_token: 'oauth-access' },
      user: { email: 'dev@z.ai', id: 'u1' },
    },
  })
  assert.equal(ready.ready, true)
  assert.equal(ready.oauthAccess, 'oauth-access')
  assert.equal(ready.email, 'dev@z.ai')
})

test('glmSession stores a durable never-expiring key', () => {
  const session = glmSession({ accessToken: 'id.secret', account: 'dev@z.ai' })
  assert.equal(session.accessToken, 'id.secret')
  assert.equal(session.refreshToken, 'id.secret')
  assert.equal(session.account, 'dev@z.ai')
  assert.ok(session.expiresAt > Date.now() + 1e12)
})

test('completeGlmCli mints id.secret through business login + copy', async () => {
  const calls = []
  const fetchFn = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, method: init.method ?? 'GET', body: init.body })
    if (href.includes('/api/auth/z/login')) {
      return json({ code: 200, success: true, data: { access_token: 'biz' } })
    }
    if (href.includes('/getCustomerInfo')) {
      return json({
        code: 200,
        data: {
          organizations: [{
            organizationId: 'org-1',
            isDefault: true,
            projects: [{ projectId: 'proj-1', isDefault: true }],
          }],
        },
      })
    }
    if (href.endsWith('/api_keys') && (init.method ?? 'GET') === 'GET') {
      return json({ code: 200, data: [] })
    }
    if (href.endsWith('/api_keys') && init.method === 'POST') {
      return json({ code: 200, data: { apiKey: 'aaaa1111', name: 'dsh-plugin-oauth-subs' } })
    }
    if (href.includes('/copy/')) {
      return json({ code: 200, data: { secretKey: 'bbbb222233334444' } })
    }
    throw new Error(`unexpected ${href}`)
  }
  const session = await completeGlmCli(
    { ready: true, oauthAccess: 'oauth-access', email: 'dev@z.ai' },
    { fetchFn },
  )
  assert.equal(session.accessToken, 'aaaa1111.bbbb222233334444')
  assert.equal(session.account, 'dev@z.ai')
  assert.equal(calls[0].href.includes('/api/auth/z/login'), true)
  assert.equal(GLM_CLI_INIT_URL.includes('zcode.z.ai'), true)
})

test('parseGlmQuota maps credit windows and plan level', () => {
  const parsed = parseGlmQuota({
    data: {
      level: 'pro',
      list: [
        { type: 'CREDIT_LIMIT', usage: 12000, currentValue: 3000, duration: '5h' },
        { type: 'CREDIT_LIMIT', usage: 60000, currentValue: 10000, duration: 'week' },
      ],
    },
  })
  assert.equal(parsed.planType, 'Pro')
  assert.equal(parsed.rows.length, 2)
  assert.equal(parsed.rows[0].kind, 'primary')
  assert.equal(parsed.rows[0].remaining, 9000)
  assert.equal(parsed.rows[1].kind, 'weekly')
})

test('catalog includes GLM as openai chat completions', () => {
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { glm: true },
  })
  assert.equal(providers['oauth-glm'].api, 'openai')
  assert.equal(providers['oauth-glm'].baseURL, 'http://127.0.0.1:8318/glm/v1')
  assert.ok(providers['oauth-glm'].models.some((model) => model.id === 'glm-5.3'))
})

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}
