import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  CHATGPT_AUTHORIZE_URL,
  CHATGPT_DYNAMIC_CLIENT_ID,
  CHATGPT_JWKS_URL,
  CHATGPT_RESOURCE,
  CHATGPT_RESPONSES_URL,
  CHATGPT_REVOKE_URL,
  CHATGPT_TOKEN_URL,
  chatgptCallbackClientId,
  chatgptFlow,
  refreshChatgpt,
  revokeChatgpt,
  verifyChatgptIdToken,
} from '../lib/oauth/chatgpt/index.js'
import { applyChatgptCache, CHATGPT_STABLE_SESSION } from '../lib/oauth/chatgpt/cache.js'
import { chatgptQuotaFailure, normalizeChatgptResponsesBody } from '../lib/oauth/chatgpt/request.js'
import { refreshChatgptCatalog, resetChatgptCatalogCache, toChatgptPickerModels } from '../lib/oauth/chatgpt/catalog.js'
import { ensureChatgptHostId, isChatgptHostId } from '../lib/oauth/chatgpt/host.js'
import { AuthController } from '../lib/oauth/controller.js'
import { buildProviders, familyOfProvider } from '../lib/oauth/models.js'
import { listStoredSessions, publicSession } from '../lib/oauth/store.js'
import { createProxy } from '../lib/oauth/proxy.js'

const CLIENT = 'oaiapp_test123'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }

function idToken(claims, key = privateKey) {
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url')
  return `${head}.${body}.${sig}`
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const baseClaims = (nonce, extra = {}) => ({
  iss: 'https://auth.openai.com', aud: CLIENT, sub: 'user-sub-1', nonce,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  email: 'me@example.com', ...extra,
})

const FULL_SCOPE = 'chatgpt.tokens.use.direct email offline_access openid profile resource.invoke'

test('first sign-in registers via dynamic_agent_client with host id, resource and 127.0.0.1 callback', () => {
  const spec = chatgptFlow({ hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000' })
  const url = new URL(spec.buildAuthorizeUrl({ redirectUri: 'http://127.0.0.1:1455/auth/callback', state: 's', pkce: { challenge: 'c' } }))
  assert.equal(`${url.origin}${url.pathname}`, CHATGPT_AUTHORIZE_URL)
  const q = Object.fromEntries(url.searchParams)
  assert.equal(q.client_id, CHATGPT_DYNAMIC_CLIENT_ID)
  assert.ok(q.agent_name_hint)
  assert.equal(q.ext_agent_host_id, 'urn:uuid:00000000-0000-4000-8000-000000000000')
  assert.equal(q.resource, CHATGPT_RESOURCE)
  assert.match(q.scope, /chatgpt\.tokens\.use\.direct/)
  assert.equal(q.nonce, spec.nonce)
  assert.equal(q.code_challenge_method, 'S256')
  assert.equal(spec.listen.host, '127.0.0.1')
  assert.equal(spec.callbackPath, '/auth/callback')
})

test('reauthorization reuses the issued client id, drops agent_name_hint, sends hints', () => {
  const spec = chatgptFlow({ hostId: 'urn:uuid:h', clientId: CLIENT, idTokenHint: 'idt', loginHint: 'me@example.com' })
  const q = Object.fromEntries(new URL(spec.buildAuthorizeUrl({ redirectUri: 'r', state: 's', pkce: { challenge: 'c' } })).searchParams)
  assert.equal(q.client_id, CLIENT)
  assert.equal(q.agent_name_hint, undefined)
  assert.equal(q.id_token_hint, 'idt')
  assert.equal(q.login_hint, 'me@example.com')
  assert.equal(q.prompt, undefined)
})

test('callback client id: registration needs one oaiapp_ id; reauth may omit but never replace it', () => {
  assert.equal(chatgptCallbackClientId({ clientIds: [CLIENT] }, { registering: true }), CLIENT)
  assert.throws(() => chatgptCallbackClientId({ clientIds: [] }, { registering: true }))
  assert.throws(() => chatgptCallbackClientId({ clientIds: ['dynamic_agent_client'] }, { registering: true }))
  assert.throws(() => chatgptCallbackClientId({ clientIds: [CLIENT, 'oaiapp_b'] }, { registering: true }))
  assert.equal(chatgptCallbackClientId({ clientIds: [] }, { registering: false, clientId: CLIENT }), CLIENT)
  assert.throws(() => chatgptCallbackClientId({ clientIds: ['oaiapp_other'] }, { registering: false, clientId: CLIENT }))
})

test('ID token is verified against JWKS: signature, audience and nonce all matter', async () => {
  const fetchFn = async (url) => (String(url) === CHATGPT_JWKS_URL ? json({ keys: [JWK] }) : json({}, 404))
  const ok = await verifyChatgptIdToken(idToken(baseClaims('n1')), { clientId: CLIENT, nonce: 'n1', fetchFn })
  assert.equal(ok.sub, 'user-sub-1')
  await assert.rejects(verifyChatgptIdToken(idToken(baseClaims('n1')), { clientId: CLIENT, nonce: 'other', fetchFn }), /nonce/)
  await assert.rejects(verifyChatgptIdToken(idToken(baseClaims('n1', { aud: 'oaiapp_x' })), { clientId: CLIENT, nonce: 'n1', fetchFn }), /audience/)
  const forged = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  await assert.rejects(verifyChatgptIdToken(idToken(baseClaims('n1'), forged), { clientId: CLIENT, nonce: 'n1', fetchFn }), /signature/)
})

test('refresh posts the issued client id + resource, rotates the refresh token, keeps the grant', async () => {
  let body
  const fetchFn = async (url, init) => {
    assert.equal(String(url), CHATGPT_TOKEN_URL)
    body = new URLSearchParams(init.body)
    return json({ access_token: 'a2', refresh_token: 'r2', token_type: 'Bearer', expires_in: 3600 })
  }
  const next = await refreshChatgpt({ accessToken: 'a1', refreshToken: 'r1', expiresAt: 0, clientId: CLIENT, subject: 's', scopes: FULL_SCOPE.split(' '), accountKey: 'k' }, fetchFn)
  assert.equal(body.get('client_id'), CLIENT)
  assert.equal(body.get('resource'), CHATGPT_RESOURCE)
  assert.equal(body.get('scope'), null)
  assert.equal(next.refreshToken, 'r2')
  assert.equal(next.accountKey, 'k')
})

test('a refreshed grant without chatgpt.tokens.use.direct is a dead login', async () => {
  const fetchFn = async () => json({ access_token: 'a2', refresh_token: 'r2', token_type: 'Bearer', expires_in: 3600, scope: 'openid email' })
  await assert.rejects(
    refreshChatgpt({ refreshToken: 'r1', expiresAt: 0, clientId: CLIENT, scopes: [] }, fetchFn),
    (error: any) => error.status === 401,
  )
})

test('revocation: 200 confirms; 5xx retries then reports unconfirmed', async () => {
  const calls: any[] = []
  const ok = await revokeChatgpt({ refreshToken: 'r', clientId: CLIENT }, { fetchFn: async (url, init) => { calls.push([String(url), String(init.body)]); return new Response('', { status: 200 }) } })
  assert.equal(ok, true)
  assert.equal(calls[0][0], CHATGPT_REVOKE_URL)
  assert.match(calls[0][1], /token_type_hint=refresh_token/)
  let n = 0
  const down = await revokeChatgpt({ refreshToken: 'r', clientId: CLIENT }, { fetchFn: async () => { n++; return new Response('', { status: 503 }) }, sleep: async () => {} })
  assert.equal(down, false)
  assert.equal(n, 3)
})

test('request body: unsupported fields dropped, system → developer, store false, stream true', () => {
  const next = normalizeChatgptResponsesBody({
    model: 'gpt-6-sol', temperature: 0.2, max_output_tokens: 99, prompt_cache_retention: '24h', service_tier: 'priority',
    previous_response_id: 'resp_1', input: [{ type: 'message', role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
  })
  for (const field of ['temperature', 'max_output_tokens', 'prompt_cache_retention', 'service_tier', 'previous_response_id']) {
    assert.equal(field in next, false, field)
  }
  assert.equal(next.input[0].role, 'developer')
  assert.equal(next.store, false)
  assert.equal(next.stream, true)
})

test('cache: DSH session id becomes prompt_cache_key and is never forwarded; missing id falls back to the family constant', () => {
  const pinned = applyChatgptCache({ session_id: 'conv 1' })
  assert.equal(pinned.payload.prompt_cache_key, 'conv-1')
  assert.equal('session_id' in pinned.payload, false)
  assert.equal(applyChatgptCache({}).cacheSessionId, CHATGPT_STABLE_SESSION)
})

test('usage-limit error becomes a usage-limit answer pointing at ChatGPT settings', () => {
  const failure: any = chatgptQuotaFailure(429, { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limit' } })
  assert.equal(failure.status, 429)
  assert.match(failure.message, /^usage limit reached: .*chatgpt\.com\/settings\/usage/)
  assert.equal(chatgptQuotaFailure(429, { error: { code: 'rate_limit_exceeded' } }), undefined)
})

test('live catalog keeps visibility:list rows in server order and never invents a window', () => {
  const rows = toChatgptPickerModels({ models: [
    { slug: 'gpt-6-sol', display_name: 'GPT-6 Sol', visibility: 'list' },
    { slug: 'hidden-1', visibility: 'hide', context_window: 100000 },
    { slug: 'unknown-new', display_name: 'New', visibility: 'list' },
    { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list' },
  ] })
  assert.deepEqual(rows.map((row) => row.id), ['gpt-6-sol', 'gpt-5.5'])
  assert.ok(rows[0].contextWindow > 0)
})

test('live discovery keeps working static rows the account list omits', async () => {
  resetChatgptCatalogCache()
  const rows = await refreshChatgptCatalog({ accessToken: 't' }, { fetchFn: async () => json({ models: [
    { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list' },
    { slug: 'gpt-7-nova', display_name: 'GPT-7 Nova', visibility: 'list', context_window: 272000 },
  ] }) })
  // Unlisted-by-catalog release first, then newest-first catalog order; omitted rows come back.
  assert.deepEqual(rows.slice(0, 3).map((row) => row.id), ['gpt-7-nova', 'gpt-6.1-sol', 'gpt-6-astra'])
  assert.equal(rows.at(-1).id, 'gpt-5.5')
  assert.ok(rows.some((row) => row.id === 'gpt-6-sol'))
  resetChatgptCatalogCache()
})

test('host id is a persisted urn:uuid, stable across calls, written 0600', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'siwc-host-'))
  const authPath = join(dir, 'auth.json')
  const first = await ensureChatgptHostId(authPath)
  assert.ok(isChatgptHostId(first))
  assert.equal(await ensureChatgptHostId(authPath), first)
  assert.equal((await stat(join(dir, 'chatgpt.json'))).mode & 0o077, 0)
})

test('a -fast row is peeled to its base id with service_tier priority; other tiers are dropped', () => {
  const fast = normalizeChatgptResponsesBody({ model: 'gpt-6-sol-fast', input: [] })
  assert.equal(fast.model, 'gpt-6-sol')
  assert.equal(fast.service_tier, 'priority')
  const plain = normalizeChatgptResponsesBody({ model: 'gpt-6-sol', service_tier: 'flex', input: [] })
  assert.equal(plain.model, 'gpt-6-sol')
  assert.equal('service_tier' in plain, false)
  // An id with no Fast-capable base stays as sent and gets no tier.
  const unknown = normalizeChatgptResponsesBody({ model: 'gpt-7-nova-fast', input: [] })
  assert.equal(unknown.model, 'gpt-7-nova-fast')
  assert.equal('service_tier' in unknown, false)
})

test('route is Subs · ChatGPT · Responses on /chatgpt/v1 with a -fast twin per Fast row', () => {
  const providers: any = buildProviders({ prefix: 'oauth', origin: 'http://127.0.0.1:8318', loggedIn: { chatgpt: true } } as any)
  const route = providers['oauth-chatgpt']
  assert.equal(route.displayName, 'Subs · ChatGPT · Responses')
  assert.equal(route.api, 'openai-responses')
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/chatgpt/v1')
  const ids = route.models.map((model) => model.id)
  assert.deepEqual(ids.slice(0, 2), ['gpt-6.1-sol', 'gpt-6.1-sol-fast'])
  assert.equal(ids.filter((id) => id.endsWith('-fast')).length, ids.length / 2)
  const rates = JSON.parse(readFileSync(new URL('../lib/catalog/rates.json', import.meta.url), 'utf8')).chatgpt
  for (const id of ids) assert.ok(rates[id], `chatgpt rate for ${id}`)
  assert.equal(familyOfProvider('oauth-chatgpt'), 'chatgpt')
})

test('end to end: login registers, verifies, saves; proxy sends Bearer to api.openai.com/v1/responses; logout revokes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'siwc-e2e-'))
  const authPath = join(dir, 'auth.json')
  let nonce
  const upstream: any[] = []
  const fetchFn = async (url, init: any = {}) => {
    const href = String(url)
    if (href === CHATGPT_JWKS_URL) return json({ keys: [JWK] })
    if (href === CHATGPT_TOKEN_URL) {
      const form = new URLSearchParams(init.body)
      assert.equal(form.get('client_id'), CLIENT)
      assert.equal(form.get('resource'), CHATGPT_RESOURCE)
      return json({ access_token: 'at-1', refresh_token: 'rt-1', token_type: 'Bearer', expires_in: 3600, scope: FULL_SCOPE, id_token: idToken(baseClaims(nonce)) })
    }
    if (href === CHATGPT_REVOKE_URL) { upstream.push(['revoke', String(init.body)]); return new Response('', { status: 200 }) }
    if (href === CHATGPT_RESPONSES_URL) {
      upstream.push(['responses', init.headers, JSON.parse(String(init.body))])
      return new Response('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: {"type":"response.completed"}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    throw new Error(`unexpected ${href}`)
  }
  const controller = new AuthController({ authPath, prefix: 'oauth', origin: () => 'http://127.0.0.1:8318', fetchFn })
  const started = await controller.login('chatgpt', {})
  const authorize = new URL(started.authorizeUrl)
  nonce = authorize.searchParams.get('nonce')
  const state = authorize.searchParams.get('state')
  const callback = await fetch(`${started.redirectUri}?code=c1&state=${state}&client_id=${CLIENT}&scope=${encodeURIComponent(FULL_SCOPE)}`)
  assert.equal(callback.status, 200)
  for (let i = 0; i < 50 && (await listStoredSessions('chatgpt', authPath)).length === 0; i++) await new Promise((r) => setTimeout(r, 20))
  const [row] = await listStoredSessions('chatgpt', authPath)
  assert.ok(row, JSON.stringify((await controller.status('chatgpt')).detail))
  assert.equal(row.session.clientId, CLIENT)
  const pub = publicSession('chatgpt', row.session)
  assert.equal(pub.account, 'me@example.com')
  assert.equal(JSON.stringify(pub).includes(CLIENT), false)
  assert.equal(JSON.stringify(pub).includes('at-1'), false)
  const registrations = JSON.parse(await readFile(join(dir, 'chatgpt.json'), 'utf8'))
  assert.equal(registrations.registrations[CLIENT].subject, 'user-sub-1')

  const proxy = createProxy({ port: 0, apiKey: 'k', tokens: controller.tokens, fetchFn })
  const server = await proxy.listen()
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/chatgpt/v1/responses`, {
      method: 'POST',
      headers: { authorization: 'Bearer k', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-6-sol', input: [{ role: 'user', content: 'hi' }], stream: true, session_id: 'dsh-conv', temperature: 1 }),
    })
    assert.equal(response.status, 200)
    assert.match(await response.text(), /response\.completed/)
  } finally {
    await proxy.close()
  }
  const [, headers, body] = upstream.find((entry) => entry[0] === 'responses')
  assert.equal(headers.authorization, 'Bearer at-1')
  for (const name of ['session-id', 'thread-id', 'chatgpt-account-id', 'originator']) assert.equal(name in headers, false, name)
  assert.equal(body.prompt_cache_key, 'dsh-conv')
  assert.equal('session_id' in body, false)
  assert.equal('temperature' in body, false)
  assert.equal(body.store, false)
  assert.equal('service_tier' in body, false)

  await controller.logout('chatgpt', row.id)
  assert.ok(upstream.some((entry) => entry[0] === 'revoke' && entry[1].includes(CLIENT)))
  assert.equal((await listStoredSessions('chatgpt', authPath)).length, 0)
  // The registration survives sign-out, so the next sign-in reauthorizes it.
  const again = await controller.login('chatgpt', {})
  assert.equal(new URL(again.authorizeUrl).searchParams.get('client_id'), CLIENT)
  assert.equal(new URL(again.authorizeUrl).searchParams.get('agent_name_hint'), null)
  await controller.cancel('chatgpt')
  const fresh = await controller.login('chatgpt', { mode: 'new' })
  assert.equal(new URL(fresh.authorizeUrl).searchParams.get('client_id'), CHATGPT_DYNAMIC_CLIENT_ID)
  await controller.cancel('chatgpt')
})

test('declined plan use keeps the registration but saves no session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'siwc-decline-'))
  const authPath = join(dir, 'auth.json')
  let nonce
  const fetchFn = async (url) => {
    if (String(url) === CHATGPT_JWKS_URL) return json({ keys: [JWK] })
    return json({ access_token: 'a', refresh_token: 'r', token_type: 'Bearer', expires_in: 3600, scope: 'openid email profile offline_access', id_token: idToken(baseClaims(nonce)) })
  }
  const controller = new AuthController({ authPath, prefix: 'oauth', origin: () => 'http://127.0.0.1:8318', fetchFn })
  const started = await controller.login('chatgpt', {})
  const url = new URL(started.authorizeUrl)
  nonce = url.searchParams.get('nonce')
  await fetch(`${started.redirectUri}?code=c&state=${url.searchParams.get('state')}&client_id=${CLIENT}`)
  for (let i = 0; i < 50 && !(await controller.status('chatgpt')).detail; i++) await new Promise((r) => setTimeout(r, 20))
  assert.match((await controller.status('chatgpt')).detail, /ChatGPT plan/)
  assert.equal((await listStoredSessions('chatgpt', authPath)).length, 0)
  const registrations = JSON.parse(await readFile(join(dir, 'chatgpt.json'), 'utf8'))
  assert.ok(registrations.registrations[CLIENT])
})
