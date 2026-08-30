import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { saveSession } from '../lib/oauth/store.js'
import { catalogProviders } from '../lib/oauth/models.js'
import { importAntigravityAuth } from '../lib/oauth/import-auth.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_GOOG_API_CLIENT_UA,
  ANTIGRAVITY_LOAD_CODE_ASSIST_URL,
  ANTIGRAVITY_MODELS,
  ANTIGRAVITY_NODE_API_CLIENT_UA,
  ANTIGRAVITY_ONBOARD_USER_URL,
  ANTIGRAVITY_STREAM_URL,
  antigravityChatHeaders,
  antigravityFlow,
  antigravityLoadCodeAssistHeaders,
  antigravityLoadCodeAssistMetadata,
  antigravityOnboardUserHeaders,
  antigravityRequestUserAgent,
  antigravitySession,
  completeAntigravityLogin,
  exchangeAntigravityCode,
  fetchAntigravityProject,
} from '../lib/oauth/antigravity/index.js'
import { antigravityToOpenai, openaiToAntigravity } from '../lib/oauth/antigravity/request.js'
import { createProxy } from '../lib/oauth/proxy.js'

const FORBIDDEN = ['IDE_UNSPECIFIED', 'dsh-plugin', 'DeepSeek', 'CLIProxy', 'undici', 'node-fetch']

function assertCleanIdentity(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  for (const needle of FORBIDDEN) {
    assert.equal(text.includes(needle), false, `fingerprint leaked ${needle}: ${text}`)
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('authorize URL is the official Google installed-app client', () => {
  const url = new URL(antigravityFlow.buildAuthorizeUrl({
    redirectUri: 'http://localhost:51121/oauth-callback',
    state: 'st',
  }))
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
  assert.equal(url.searchParams.get('client_id'), ANTIGRAVITY_CLIENT_ID)
  assert.equal(url.searchParams.get('access_type'), 'offline')
  assert.equal(url.searchParams.get('prompt'), 'consent')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:51121/oauth-callback')
  assert.equal(url.searchParams.get('scope')?.includes('cloud-platform'), true)
  assert.equal(url.searchParams.has('code_challenge'), false)
})

test('fingerprint is one Antigravity IDE identity on loadCodeAssist, onboardUser, and chat', () => {
  const load = antigravityLoadCodeAssistHeaders('tok')
  const onboard = antigravityOnboardUserHeaders('tok')
  const chat = antigravityChatHeaders({ accessToken: 'tok', projectId: 'proj' })
  for (const headers of [load, onboard, chat]) {
    assert.equal(headers['user-agent'].startsWith('antigravity/hub/'), true)
    assert.equal(headers['user-agent'].includes(antigravityRequestUserAgent().split(' ')[1]), true)
    assertCleanIdentity(headers)
    assert.equal(/^node\/|^undici\//i.test(headers['user-agent']), false)
  }
  assert.equal(load['user-agent'].includes(ANTIGRAVITY_NODE_API_CLIENT_UA), false)
  assert.equal(load['x-goog-api-client'], undefined)
  assert.equal(onboard['user-agent'].includes(ANTIGRAVITY_NODE_API_CLIENT_UA), true)
  assert.equal(onboard['x-goog-api-client'], ANTIGRAVITY_GOOG_API_CLIENT_UA)
  assert.equal(chat['user-agent'], load['user-agent'])
  assert.deepEqual(antigravityLoadCodeAssistMetadata(), { ideType: 'ANTIGRAVITY' })
  assert.equal(JSON.stringify(antigravityLoadCodeAssistMetadata()).includes('IDE_UNSPECIFIED'), false)
})

test('login discovers project via loadCodeAssist and stores it', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: init.body })
    if (String(url).includes('oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'acc', refresh_token: 'ref', expires_in: 3600 })
    }
    if (String(url).includes('userinfo')) {
      return jsonResponse({ email: 'dev@gmail.com' })
    }
    if (String(url) === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
      return jsonResponse({ cloudaicompanionProject: 'cogent-snow-4mnnp', currentTier: { id: 'free-tier' } })
    }
    throw new Error(`unexpected ${url}`)
  }
  const session = await exchangeAntigravityCode('code', 'http://localhost:51121/oauth-callback', { fetchFn })
  assert.equal(session.account, 'dev@gmail.com')
  assert.equal(session.projectId, 'cogent-snow-4mnnp')
  assert.equal(session.planType, 'free-tier')
  const load = seen.find((row) => row.url === ANTIGRAVITY_LOAD_CODE_ASSIST_URL)
  assert.equal(load.headers['user-agent'], antigravityRequestUserAgent())
  assert.equal(JSON.parse(load.body).metadata.ideType, 'ANTIGRAVITY')
  assertCleanIdentity(load)
})

test('empty loadCodeAssist falls back to daily onboardUser', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: init.body })
    if (String(url) === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
      return jsonResponse({ allowedTiers: [{ id: 'free-tier', isDefault: true }] })
    }
    if (String(url) === ANTIGRAVITY_ONBOARD_USER_URL) {
      return jsonResponse({
        done: true,
        response: { cloudaicompanionProject: { id: 'cogent-snow-4mnnp' } },
      })
    }
    throw new Error(`unexpected ${url}`)
  }
  const found = await fetchAntigravityProject({ accessToken: 'acc', fetchFn, sleep: async () => undefined })
  assert.equal(found.projectId, 'cogent-snow-4mnnp')
  const onboard = seen.find((row) => row.url === ANTIGRAVITY_ONBOARD_USER_URL)
  assert.equal(onboard.headers['user-agent'].includes(ANTIGRAVITY_NODE_API_CLIENT_UA), true)
  assert.equal(onboard.headers['x-goog-api-client'], ANTIGRAVITY_GOOG_API_CLIENT_UA)
  assert.equal(JSON.parse(onboard.body).metadata.ide_type, 'ANTIGRAVITY')
  assertCleanIdentity(onboard)
})

test('generateContent body is official-shaped and rejects an empty project', () => {
  const body = openaiToAntigravity({
    model: 'claude-sonnet-4-6',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hi' },
    ],
  }, { projectId: 'cogent-snow-4mnnp' })
  assert.equal(body.model, 'claude-sonnet-4-6')
  assert.equal(body.project, 'cogent-snow-4mnnp')
  assert.equal(body.userAgent, 'antigravity')
  assert.deepEqual(body.request.systemInstruction.parts, [{ text: 'You are helpful.' }])
  assert.equal(body.request.contents[0].role, 'user')
  assertCleanIdentity(body)
  assert.throws(() => openaiToAntigravity({ model: 'claude-sonnet-4-6', messages: [] }, { projectId: '' }), /project_id/)
})

test('catalog is the live cloudcode-pa list, not Vertex-direct names', () => {
  const ids = ANTIGRAVITY_MODELS.map((model) => model.id)
  assert.equal(ids.includes('claude-sonnet-4-6'), true)
  assert.equal(ids.includes('gemini-pro-agent'), true)
  assert.equal(ids.includes('gemini-3.1-pro-low'), true)
  assert.equal(ids.includes('gpt-oss-120b-medium'), true)
  assert.equal(ids.some((id) => id.startsWith('publishers/') || id.includes('vertex')), false)
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  assert.equal(catalog['oauth-antigravity'].api, 'openai')
  assert.equal(catalog['oauth-antigravity'].baseURL, 'http://x/antigravity/v1')
  assert.deepEqual(catalog['oauth-antigravity'].models.find((model) => model.id === 'gpt-oss-120b-medium').input, ['text'])
})

test('snapshot shows idle quota on every Antigravity account', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-ag-'))
  const authPath = join(dir, 'auth.json')
  const later = Date.now() + 60 * 60_000
  await saveSession('antigravity', antigravitySession({
    accessToken: 'a', refreshToken: 'r', expiresAt: later, account: 'a@x', projectId: 'p1',
  }), authPath)
  await saveSession('antigravity', antigravitySession({
    accessToken: 'b', refreshToken: 's', expiresAt: later, account: 'b@x', projectId: 'p2',
  }), authPath)
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async () => { throw new Error('antigravity must not hit a quota API') },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.catalog.length, 5)
  assert.equal(snap.accounts.antigravity.loggedIn, true)
  assert.equal(snap.accounts.antigravity.accounts.length, 2)
  assert.equal(snap.accounts.antigravity.accounts.every((row) => row.quota.status === 'idle'), true)
  assert.equal(formatPlanLabel('free-tier', 'antigravity'), 'Free')
})

test('import reads the official CLI token file and CLIProxyAPI auth json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-ag-imp-'))
  const official = join(dir, 'antigravity-oauth-token')
  const cliproxy = join(dir, 'antigravity-dev@x.json')
  await writeFile(official, JSON.stringify({
    token: { access_token: 'acc', refresh_token: 'ref', expiry: new Date(Date.now() + 3600_000).toISOString() },
    auth_method: 'consumer',
  }))
  const fetchFn = async (url) => {
    if (String(url).includes('userinfo')) return jsonResponse({ email: 'cli@x' })
    if (String(url) === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
      return jsonResponse({ cloudaicompanionProject: 'proj-cli' })
    }
    throw new Error(`unexpected ${url}`)
  }
  const fromOfficial = await importAntigravityAuth({ paths: [official], fetchFn })
  assert.equal(fromOfficial.source, official)
  assert.equal(fromOfficial.session.projectId, 'proj-cli')
  assert.equal(fromOfficial.session.account, 'cli@x')

  await writeFile(cliproxy, JSON.stringify({
    type: 'antigravity',
    access_token: 'acc2',
    refresh_token: 'ref2',
    email: 'proxy@x',
    project_id: 'proj-proxy',
    expires_in: 3600,
  }))
  const fromProxy = await importAntigravityAuth({ paths: [cliproxy], fetchFn })
  assert.equal(fromProxy.session.account, 'proxy@x')
  assert.equal(fromProxy.session.projectId, 'proj-proxy')
})

test('proxy translates OpenAI chat to cloudcode-pa with the same fingerprint', async () => {
  const seen = []
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers, body: String(init.body) })
    return jsonResponse({
      response: {
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      },
    })
  }
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn,
    tokens: {
      antigravity: {
        session: async () => antigravitySession({
          accessToken: 'ag-tok',
          refreshToken: 'r',
          expiresAt: Date.now() + 60_000,
          account: 'dev@x',
          projectId: 'cogent-snow-4mnnp',
        }),
      },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/antigravity/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(ok.status, 200)
    const payload = await ok.json()
    assert.equal(payload.choices[0].message.content, 'ok')
    assert.equal(seen[0].url, ANTIGRAVITY_STREAM_URL.replace('streamGenerateContent?alt=sse', 'generateContent'))
    assert.equal(seen[0].headers['user-agent'], antigravityRequestUserAgent())
    const body = JSON.parse(seen[0].body)
    assert.equal(body.project, 'cogent-snow-4mnnp')
    assert.equal(body.userAgent, 'antigravity')
    assertCleanIdentity(seen[0])
    assertCleanIdentity(body)

    const missing = createProxy({
      port: 0,
      apiKey: 'secret-key',
      fetchFn,
      tokens: {
        antigravity: {
          session: async () => ({ accessToken: 'x', refreshToken: 'y', expiresAt: Date.now() + 1000, account: 'z' }),
        },
      },
    })
    const other = await missing.listen()
    try {
      const denied = await fetch(`http://127.0.0.1:${other.address().port}/antigravity/v1/chat/completions`, {
        method: 'POST',
        headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'hi' }] }),
      })
      assert.equal(denied.status, 403)
    } finally {
      await missing.close()
    }
  } finally {
    await proxy.close()
  }
})

test('session builder refuses a missing project_id', () => {
  assert.throws(() => antigravitySession({
    accessToken: 'a', refreshToken: 'r', account: 'x',
  }), /project_id/)
})

test('completeAntigravityLogin keeps fingerprint after token exchange', async () => {
  const fetchFn = async (url, init) => {
    assertCleanIdentity(init.headers)
    if (String(url).includes('userinfo')) return jsonResponse({ email: 'keep@x' })
    if (String(url) === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
      return jsonResponse({ cloudaicompanionProject: 'p' })
    }
    throw new Error(`unexpected ${url}`)
  }
  const session = await completeAntigravityLogin({
    access_token: 'acc',
    refresh_token: 'ref',
    expires_in: 120,
  }, { fetchFn })
  assert.equal(session.projectId, 'p')
  assert.deepEqual(antigravityToOpenai({
    response: { candidates: [{ content: { parts: [{ text: 'hi' }] } }] },
  }, { model: 'claude-sonnet-4-6' }).choices[0].message.content, 'hi')
})
