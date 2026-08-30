import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  GLM_CLIENT_ID,
  GLM_CLI_INIT_URL,
  completeGlmCli,
  glmCliInit,
  glmCliProvider,
  glmCodingUrl,
  glmQuotaUrl,
  glmSession,
  normalizeGlmRegion,
  parseCliInit,
  parseCliPoll,
  unwrapEnvelope,
} from '../lib/oauth/glm/index.js'
import { parseGlmQuota } from '../lib/oauth/quota.js'
import { buildProviders } from '../lib/oauth/models.js'
import { AuthController } from '../lib/oauth/controller.js'
import { accountIdOf, listAccounts, saveSession } from '../lib/oauth/store.js'

test('unwrapEnvelope accepts ZCode code 0 and biz code 200', () => {
  assert.equal(unwrapEnvelope({ code: 0, data: { ok: true } }, 'x').ok, true)
  assert.equal(unwrapEnvelope({ code: 200, success: true, data: { ok: true } }, 'x').ok, true)
  assert.throws(() => unwrapEnvelope({ code: 401, msg: 'denied' }, 'login'), /denied/)
})

test('normalizeGlmRegion maps ZCode ids to zai / bigmodel', () => {
  assert.equal(normalizeGlmRegion('zai'), 'zai')
  assert.equal(normalizeGlmRegion('bigmodel'), 'bigmodel')
  assert.equal(normalizeGlmRegion('zcode'), 'bigmodel')
  assert.equal(normalizeGlmRegion('cn'), 'bigmodel')
  assert.equal(glmCliProvider('zai'), 'zai')
  assert.equal(glmCliProvider('bigmodel'), 'bigmodel')
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

test('parseCliPoll reads BigModel zcode access_token', () => {
  const ready = parseCliPoll({
    code: 0,
    data: {
      status: 'ready',
      token: 'bm-jwt',
      zcode: { access_token: 'bm-oauth' },
      user: { email: 'dev@bigmodel.cn' },
    },
  })
  assert.equal(ready.oauthAccess, 'bm-oauth')
  assert.equal(ready.zcodeJwt, 'bm-jwt')
})

test('glmSession stores a durable never-expiring key', () => {
  const session = glmSession({ accessToken: 'id.secret', account: 'dev@z.ai' })
  assert.equal(session.accessToken, 'id.secret')
  assert.equal(session.refreshToken, 'id.secret')
  assert.equal(session.account, 'dev@z.ai')
  assert.equal(session.region, 'zai')
  assert.ok(session.expiresAt > Date.now() + 1e12)
})

test('glmCodingUrl and glmQuotaUrl split Z.ai vs BigModel', () => {
  assert.equal(glmCodingUrl('zai').startsWith('https://api.z.ai/'), true)
  assert.equal(glmCodingUrl('bigmodel').startsWith('https://open.bigmodel.cn/'), true)
  assert.equal(glmQuotaUrl('zcode').includes('open.bigmodel.cn'), true)
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
  assert.equal(session.region, 'zai')
  assert.equal(calls[0].href.includes('/api/auth/z/login'), true)
  assert.equal(GLM_CLI_INIT_URL.includes('zcode.z.ai'), true)
})

test('completeGlmCli for BigModel uses poll JWT and skips biz mint', async () => {
  const fetchFn = async (url) => {
    throw new Error(`unexpected ${url}`)
  }
  const session = await completeGlmCli(
    { ready: true, oauthAccess: 'oauth', zcodeJwt: 'jwt', email: 'cn@bigmodel.cn' },
    { fetchFn, region: 'bigmodel' },
  )
  assert.equal(session.accessToken, 'jwt')
  assert.equal(session.region, 'bigmodel')
  assert.equal(session.account, 'cn@bigmodel.cn')
})

test('glmCliInit posts provider id bigmodel for BigModel', async () => {
  let body
  const fetchFn = async (url, init = {}) => {
    body = init.body
    return json({
      code: 0,
      data: {
        flow_id: 'flow-cn',
        authorize_url: 'https://bigmodel.cn/login?app_id=zcode',
        poll_interval_sec: 2,
        expires_at: Date.now() + 60_000,
      },
    })
  }
  const started = await glmCliInit({ region: 'bigmodel', fetchFn, pollToken: 'poll' })
  assert.equal(JSON.parse(body).provider, 'bigmodel')
  assert.equal(started.region, 'bigmodel')
  assert.equal(started.authorizeUrl.includes('bigmodel.cn'), true)
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
  const ids = providers['oauth-glm'].models.map((model) => model.id)
  assert.deepEqual(ids, ['glm-5.3', 'glm-5.3-flash', 'glm-5-turbo'])
  assert.deepEqual(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.3').input, ['text'])
  assert.deepEqual(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.3-flash').input, ['text', 'image'])
  assert.deepEqual(providers['oauth-glm'].models.find((model) => model.id === 'glm-5-turbo').input, ['text'])
  assert.equal(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.3-flash').name, 'GLM-5.3-Flash')
  assert.equal(providers['oauth-glm'].models.find((model) => model.id === 'glm-5-turbo').name, 'GLM-5-Turbo')
  assert.equal(providers['oauth-glm'].models.find((model) => model.id === 'glm-5-turbo').contextWindow, 200_000)
  assert.deepEqual(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.3').reasoningEfforts, {
    low: 'low',
    high: 'high',
    max: 'max',
  })
  assert.deepEqual(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.3-flash').reasoningEfforts, {
    low: 'low',
    high: 'high',
    max: 'max',
  })
  assert.equal(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.3').reasoningEfforts.off, undefined)
  assert.equal(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.3').reasoningEfforts.medium, undefined)
  assert.equal(providers['oauth-glm'].models.find((model) => model.id === 'glm-5-turbo').reasoningEfforts, false)
  assert.equal(providers['oauth-glm'].compat.supportsReasoningEffort, true)
  assert.equal(providers['oauth-glm'].compat.thinkingFormat, 'openai')
  assert.equal(providers['oauth-glm'].models.find((model) => model.id === 'glm-5.2'), undefined)
})

test('Z.ai and BigModel accounts can coexist in the glm vault', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const path = join(dir, 'auth.json')
  await saveSession('glm', glmSession({ accessToken: 'a.b', account: 'dev@z.ai', region: 'zai' }), path)
  await saveSession('glm', glmSession({ accessToken: 'c.d', account: 'dev@z.ai', region: 'bigmodel' }), path)
  const roster = await listAccounts('glm', path)
  assert.equal(roster.length, 2)
  assert.equal(accountIdOf('glm', glmSession({ accessToken: 'a.b', account: 'dev@z.ai', region: 'zai' })), 'dev@z.ai@zai')
  assert.ok(roster.some((row) => row.region === 'zai'))
  assert.ok(roster.some((row) => row.region === 'bigmodel' && row.active))
})

test('controller GLM login sends BigModel region to cli init', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const calls = []
  const fetchFn = async (url, init = {}) => {
    const href = String(url)
    calls.push({ href, body: init.body })
    if (href.includes('/oauth/cli/init')) {
      return json({
        code: 0,
        data: {
          flow_id: 'f',
          authorize_url: 'https://bigmodel.cn/login?app_id=zcode',
          poll_interval_sec: 2,
          expires_at: Date.now() + 60_000,
        },
      })
    }
    if (href.includes('/oauth/cli/poll')) {
      return json({ code: 0, data: { status: 'pending' } })
    }
    throw new Error(`unexpected ${href}`)
  }
  const controller = new AuthController({
    authPath: join(dir, 'auth.json'),
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn,
  })
  const result = await controller.login('glm', 'bigmodel')
  assert.equal(result.region, 'bigmodel')
  assert.equal(result.mode, 'cli')
  assert.equal(JSON.parse(calls[0].body).provider, 'bigmodel')
  await controller.cancel('glm')
})

test('controller useKey stores a pasted GLM key on the chosen region', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-'))
  const authPath = join(dir, 'auth.json')
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async () => new Response('{}', { status: 200 }),
  })
  const result = await controller.useKey('glm', 'id.secretkey', 'bigmodel')
  assert.equal(result.region, 'bigmodel')
  const roster = await listAccounts('glm', authPath)
  assert.equal(roster[0].region, 'bigmodel')
  assert.equal(roster[0].account, 'api-key')
})

function json(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}
