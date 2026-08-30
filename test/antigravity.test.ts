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
  ANTIGRAVITY_API_URL,
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_DAILY_API_URL,
  ANTIGRAVITY_FALLBACK_VERSION,
  ANTIGRAVITY_GENERATE_URL,
  ANTIGRAVITY_GOOG_API_CLIENT_UA,
  ANTIGRAVITY_LOAD_CODE_ASSIST_URL,
  ANTIGRAVITY_MAC_APP_PLIST,
  ANTIGRAVITY_MODELS,
  ANTIGRAVITY_MODELS_URL,
  ANTIGRAVITY_NODE_API_CLIENT_UA,
  ANTIGRAVITY_ONBOARD_USER_URL,
  ANTIGRAVITY_PROD_API_URL,
  ANTIGRAVITY_STREAM_URL,
  antigravityChatHeaders,
  antigravityFetchModelsUrls,
  antigravityFlow,
  antigravityLoadCodeAssistBody,
  antigravityLoadCodeAssistHeaders,
  antigravityLoadCodeAssistMetadata,
  antigravityOnboardUserHeaders,
  antigravityPlatform,
  antigravityRequestUserAgent,
  antigravitySession,
  antigravityVersion,
  completeAntigravityLogin,
  detectAntigravityVersion,
  exchangeAntigravityCode,
  fetchAntigravityProject,
  normalizeAntigravityVersion,
  parseAntigravityPlistVersion,
  parseAntigravityVersionText,
} from '../lib/oauth/antigravity/index.js'
import { antigravityToOpenai, functionResponsePayload, openaiToAntigravity } from '../lib/oauth/antigravity/request.js'
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

test('fallback version is current official Antigravity.app 2.11.0', () => {
  assert.equal(ANTIGRAVITY_FALLBACK_VERSION, '2.11.0')
  assert.equal(detectAntigravityVersion({
    platform: 'linux',
    execFile: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
  }), '2.11.0')
  assert.equal(detectAntigravityVersion({
    platform: 'darwin',
    readFile: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
    execFile: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) },
  }), '2.11.0')
})

test('plist helper reads CFBundleShortVersionString from Antigravity.app XML', () => {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleIdentifier</key>
	<string>com.google.antigravity</string>
	<key>CFBundleShortVersionString</key>
	<string>2.11.0</string>
	<key>CFBundleVersion</key>
	<string>99.0.0</string>
</dict>
</plist>`
  assert.equal(parseAntigravityPlistVersion(plist), '2.11.0')
  assert.equal(parseAntigravityVersionText('Antigravity 2.11.0\n'), '2.11.0')
  assert.equal(normalizeAntigravityVersion('2.11.0.0'), '2.11.0')
  const seen = []
  const detected = detectAntigravityVersion({
    platform: 'darwin',
    readFile: (path) => {
      seen.push(path)
      return plist
    },
    execFile: () => { throw new Error('plist parse should not need plutil') },
  })
  assert.equal(detected, '2.11.0')
  assert.deepEqual(seen, [ANTIGRAVITY_MAC_APP_PLIST])
  assert.equal(ANTIGRAVITY_MAC_APP_PLIST, '/Applications/Antigravity.app/Contents/Info.plist')
  assert.equal(ANTIGRAVITY_MAC_APP_PLIST.includes('IDE.app'), false)
  const win = detectAntigravityVersion({
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local' },
    execFile: (file, args) => {
      assert.equal(file, 'powershell.exe')
      const command = args.join(' ')
      assert.equal(command.includes('Antigravity.exe'), true)
      assert.equal(command.includes('IDE.app') || command.includes('Antigravity IDE'), false)
      return '2.11.0.0\r\n'
    },
  })
  assert.equal(win, '2.11.0')
  const linux = detectAntigravityVersion({
    platform: 'linux',
    execFile: (file, args) => {
      assert.equal(file, 'antigravity')
      assert.deepEqual(args, ['--version'])
      return '2.11.0\n'
    },
  })
  assert.equal(linux, '2.11.0')
})

test('request UA is CLIProxyAPI hub shape and never the plugin name', () => {
  const ua = antigravityRequestUserAgent()
  const ver = antigravityVersion()
  assert.equal(ua, `antigravity/hub/${ver} ${antigravityPlatform()}`)
  assert.match(ua, /^antigravity\/hub\/\d+\.\d+\.\d+ (darwin|windows|linux)\/(arm64|amd64)$/)
  assert.equal(ua.includes('dsh-plugin'), false)
  assert.equal(ua.includes('2.5.5'), false)
})

test('hub Cloud Code RPCs use daily, not IDE prod', () => {
  assert.equal(ANTIGRAVITY_API_URL, 'https://daily-cloudcode-pa.googleapis.com')
  assert.equal(ANTIGRAVITY_DAILY_API_URL, ANTIGRAVITY_API_URL)
  assert.equal(ANTIGRAVITY_PROD_API_URL, 'https://cloudcode-pa.googleapis.com')
  assert.equal(ANTIGRAVITY_LOAD_CODE_ASSIST_URL, 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist')
  assert.equal(ANTIGRAVITY_MODELS_URL, 'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels')
  assert.equal(ANTIGRAVITY_GENERATE_URL, 'https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent')
  assert.equal(ANTIGRAVITY_STREAM_URL, 'https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent?alt=sse')
  assert.equal(ANTIGRAVITY_ONBOARD_USER_URL, 'https://daily-cloudcode-pa.googleapis.com/v1internal:onboardUser')
  for (const url of [
    ANTIGRAVITY_LOAD_CODE_ASSIST_URL,
    ANTIGRAVITY_MODELS_URL,
    ANTIGRAVITY_GENERATE_URL,
    ANTIGRAVITY_STREAM_URL,
  ]) {
    assert.equal(url.startsWith('https://daily-cloudcode-pa.googleapis.com/'), true)
    assert.equal(url.startsWith('https://cloudcode-pa.googleapis.com/'), false)
  }
})

test('fingerprint is one Antigravity hub identity on loadCodeAssist, onboardUser, and chat', () => {
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
  assert.equal(load['Client-Metadata'], undefined)
  assert.equal(onboard['user-agent'].includes(ANTIGRAVITY_NODE_API_CLIENT_UA), true)
  assert.equal(onboard['x-goog-api-client'], ANTIGRAVITY_GOOG_API_CLIENT_UA)
  assert.equal(chat['user-agent'], load['user-agent'])
  assert.deepEqual(Object.keys(chat).sort(), ['accept', 'authorization', 'content-type', 'user-agent'])
  assert.equal(chat['x-goog-api-client'], undefined)
  assert.equal(chat['Client-Metadata'], undefined)
  assert.deepEqual(antigravityLoadCodeAssistMetadata(), { ideType: 'ANTIGRAVITY' })
  assert.equal(JSON.stringify(antigravityLoadCodeAssistMetadata()).includes('IDE_UNSPECIFIED'), false)
  assert.deepEqual(antigravityLoadCodeAssistBody(), { metadata: { ideType: 'ANTIGRAVITY' } })
  assert.deepEqual(antigravityLoadCodeAssistBody('proj-9'), {
    metadata: { ideType: 'ANTIGRAVITY', duetProject: 'proj-9' },
    cloudaicompanionProject: 'proj-9',
  })
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
  assert.equal(load.url, 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist')
  assert.equal(seen.some((row) => String(row.url).startsWith('https://cloudcode-pa.googleapis.com/')), false)
  assertCleanIdentity(load)
})

test('hub 5xx on daily falls back to IDE prod; 4xx does not', async () => {
  const seen = []
  const fetchFn = async (url) => {
    seen.push(String(url))
    if (String(url) === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) return new Response('busy', { status: 503 })
    if (String(url) === `${ANTIGRAVITY_PROD_API_URL}/v1internal:loadCodeAssist`) {
      return jsonResponse({ cloudaicompanionProject: 'from-prod' })
    }
    throw new Error(`unexpected ${url}`)
  }
  const found = await fetchAntigravityProject({ accessToken: 'acc', fetchFn })
  assert.equal(found.projectId, 'from-prod')
  assert.deepEqual(seen, [
    ANTIGRAVITY_LOAD_CODE_ASSIST_URL,
    `${ANTIGRAVITY_PROD_API_URL}/v1internal:loadCodeAssist`,
  ])

  const denied = []
  await assert.rejects(() => fetchAntigravityProject({
    accessToken: 'acc',
    fetchFn: async (url) => {
      denied.push(String(url))
      return new Response('no', { status: 403 })
    },
  }), /HTTP 403/)
  assert.deepEqual(denied, [ANTIGRAVITY_LOAD_CODE_ASSIST_URL])
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
  assert.deepEqual(seen.map((row) => row.url), [
    'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
    'https://daily-cloudcode-pa.googleapis.com/v1internal:onboardUser',
  ])
  const onboard = seen.find((row) => row.url === ANTIGRAVITY_ONBOARD_USER_URL)
  assert.equal(onboard.headers['user-agent'].includes(ANTIGRAVITY_NODE_API_CLIENT_UA), true)
  assert.equal(onboard.headers['x-goog-api-client'], ANTIGRAVITY_GOOG_API_CLIENT_UA)
  assert.equal(JSON.parse(onboard.body).metadata.ide_type, 'ANTIGRAVITY')
  assertCleanIdentity(onboard)
})

function assertSingularFunctionWire(contents) {
  for (const content of contents) {
    for (const part of content.parts ?? []) {
      if (part.functionResponse) {
        assert.equal(Array.isArray(part.functionResponse), false, 'functionResponse must be an object')
        assert.equal(typeof part.functionResponse, 'object')
        const response = part.functionResponse.response
        assert.equal(response !== null && typeof response === 'object' && !Array.isArray(response), true, 'functionResponse.response must be a plain object')
      }
      if (part.functionCall) {
        assert.equal(Array.isArray(part.functionCall), false, 'functionCall must be an object')
        assert.equal(Array.isArray(part.functionCall.args), false, 'functionCall.args must be a Struct')
      }
    }
  }
  const json = JSON.stringify(contents)
  assert.equal(json.includes('"functionResponse":['), false)
  assert.equal(json.includes('"functionCall":['), false)
  assert.equal(json.includes('"response":['), false)
}

function toolResponseOf(content) {
  const body = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    messages: [{ role: 'tool', name: 'Read', content }],
  }, { projectId: 'p' })
  const part = body.request.contents[0].parts[0]
  assertSingularFunctionWire(body.request.contents)
  return part.functionResponse
}

test('functionResponsePayload wraps non-plain-objects; non-JSON strings stay { text }', () => {
  assert.deepEqual(functionResponsePayload({ ok: true }), { ok: true })
  assert.deepEqual(functionResponsePayload([{ type: 'text', text: 'a' }]), {
    result: [{ type: 'text', text: 'a' }],
  })
  assert.deepEqual(functionResponsePayload('[{"path":"a.ts"}]'), { result: [{ path: 'a.ts' }] })
  assert.deepEqual(functionResponsePayload('{"already":"object"}'), { already: 'object' })
  assert.deepEqual(functionResponsePayload('plain tool output'), { text: 'plain tool output' })
  assert.deepEqual(functionResponsePayload('null'), { result: null })
  assert.deepEqual(functionResponsePayload('42'), { result: 42 })
  assert.deepEqual(functionResponsePayload('true'), { result: true })
  assert.deepEqual(functionResponsePayload(''), {})
  assert.deepEqual(functionResponsePayload(null), {})
})

test('openaiToAntigravity tool content: JSON array string, array, object string, plain string, null/empty', () => {
  assert.deepEqual(toolResponseOf('["a.ts","b.ts"]'), {
    name: 'Read',
    response: { result: ['a.ts', 'b.ts'] },
  })
  assert.deepEqual(toolResponseOf([{ type: 'text', text: 'hit 1' }, { type: 'text', text: 'hit 2' }]), {
    name: 'Read',
    response: { result: [{ type: 'text', text: 'hit 1' }, { type: 'text', text: 'hit 2' }] },
  })
  assert.deepEqual(toolResponseOf('{"stdout":"ok","files":2}'), {
    name: 'Read',
    response: { stdout: 'ok', files: 2 },
  })
  assert.deepEqual(toolResponseOf('file a contents'), {
    name: 'Read',
    response: { text: 'file a contents' },
  })
  assert.deepEqual(toolResponseOf(null), { name: 'Read', response: {} })
  assert.deepEqual(toolResponseOf(''), { name: 'Read', response: {} })
})

test('consecutive tool messages become multiple functionResponse parts', () => {
  const body = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    messages: [
      { role: 'user', content: 'read files' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'Read', arguments: '{"path":"a.ts"}' } },
          { id: 'call_2', type: 'function', function: { name: 'Grep', arguments: '{"q":"src"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', name: 'Read', content: 'file a contents' },
      {
        role: 'tool',
        tool_call_id: 'call_2',
        name: 'Grep',
        content: [{ type: 'text', text: 'hit 1' }, { type: 'text', text: 'hit 2' }],
      },
    ],
  }, { projectId: 'cogent-snow-4mnnp' })

  const [user, model, tools] = body.request.contents
  assert.equal(user.role, 'user')
  assert.equal(model.role, 'model')
  assert.deepEqual(model.parts[0].functionCall, { name: 'Read', args: { path: 'a.ts' } })
  assert.deepEqual(model.parts[1].functionCall, { name: 'Grep', args: { q: 'src' } })
  assert.equal(tools.parts.length, 2)
  assert.deepEqual(tools.parts[0].functionResponse, {
    name: 'Read',
    response: { text: 'file a contents' },
  })
  assert.deepEqual(tools.parts[1].functionResponse, {
    name: 'Grep',
    response: { result: [{ type: 'text', text: 'hit 1' }, { type: 'text', text: 'hit 2' }] },
  })
  assertSingularFunctionWire(body.request.contents)
})

test('Google 400 fixture: array-shaped functionResponse / response never emitted', () => {
  // DSH long session (~151 steps) sent tool content as a JSON array. Old tryJson
  // put that array on functionResponse.response → daily-cloudcode-pa 400:
  // Unknown name "response" at function_response: Proto field is not repeating.
  const body = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    messages: [
      { role: 'user', content: 'continue' },
      {
        role: 'assistant',
        tool_calls: [
          { id: 'call_read', type: 'function', function: { name: 'Read', arguments: '{}' } },
        ],
      },
      {
        role: 'tool',
        name: 'Read',
        content: [
          { type: 'text', text: 'chunk A' },
          { type: 'text', text: 'chunk B' },
        ],
      },
    ],
  }, { projectId: 'p' })

  const toolTurn = body.request.contents.find((content) => content.parts.some((part) => part.functionResponse))
  const fn = toolTurn.parts[0].functionResponse
  assert.equal(Array.isArray(fn), false)
  assert.equal(Array.isArray(fn.response), false)
  assert.deepEqual(fn.response, {
    result: [{ type: 'text', text: 'chunk A' }, { type: 'text', text: 'chunk B' }],
  })
  assertSingularFunctionWire(body.request.contents)
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
  assert.equal(catalog['oauth-antigravity'].api, 'openai-completions')
  assert.equal(catalog['oauth-antigravity'].baseURL, 'http://x/antigravity/v1')
  assert.deepEqual(catalog['oauth-antigravity'].models.find((model) => model.id === 'gpt-oss-120b-medium').input, ['text'])
})

test('snapshot shows quota on every Antigravity account via daily hub', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-ag-'))
  const authPath = join(dir, 'auth.json')
  const later = Date.now() + 60 * 60_000
  await saveSession('antigravity', antigravitySession({
    accessToken: 'tok-a', refreshToken: 'r', expiresAt: later, account: 'a@x', projectId: 'p1',
    planType: 'STANDARD TIER',
  }), authPath)
  await saveSession('antigravity', antigravitySession({
    accessToken: 'tok-b', refreshToken: 's', expiresAt: later, account: 'b@x', projectId: 'p2',
    planType: 'STANDARD TIER',
  }), authPath)
  const daily = antigravityFetchModelsUrls()[0]
  const seen = []
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async (url, init) => {
      const href = String(url)
      seen.push(href)
      const auth = String(init?.headers?.authorization ?? '')
      const remaining = auth.includes('tok-b') ? 0.9 : 0.4
      if (href === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
        return jsonResponse({
          currentTier: { id: 'STANDARD TIER' },
          cloudaicompanionProject: auth.includes('tok-b') ? 'p2' : 'p1',
        })
      }
      if (href === daily) {
        return jsonResponse({
          models: {
            'gemini-3-flash': { quotaInfo: { remainingFraction: remaining } },
          },
        })
      }
      throw new Error(`unexpected ${href}`)
    },
  })
  const snap = await controller.snapshot()
  assert.equal(snap.catalog.length, 5)
  assert.equal(snap.accounts.antigravity.loggedIn, true)
  const roster = snap.accounts.antigravity.accounts
  assert.equal(roster.length, 2)
  const first = roster.find((row) => row.account === 'a@x')
  const second = roster.find((row) => row.account === 'b@x')
  assert.equal(first.quota.status, 'ready')
  assert.equal(second.quota.status, 'ready')
  assert.equal(first.quota.rows[0].product, 'Gemini 3 Flash')
  assert.equal(first.quota.rows[0].remainingPercent, 40)
  assert.equal(second.quota.rows[0].remainingPercent, 90)
  assert.equal(first.quota.planLabel, 'STANDARD TIER')
  assert.equal(seen.every((href) => !href.startsWith(ANTIGRAVITY_PROD_API_URL)), true)
  assert.equal(seen.every((href) => href.startsWith(ANTIGRAVITY_DAILY_API_URL)), true)
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

test('proxy translates OpenAI chat to daily-cloudcode-pa with the same fingerprint', async () => {
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
    assert.equal(seen[0].url, ANTIGRAVITY_GENERATE_URL)
    assert.equal(seen[0].url, 'https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent')
    assert.equal(seen.some((row) => String(row.url).startsWith('https://cloudcode-pa.googleapis.com/')), false)
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
