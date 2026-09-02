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
  ANTIGRAVITY_QUOTA_SUMMARY_URL,
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
  antigravityPlanType,
  antigravityPlatform,
  antigravityRequestUserAgent,
  antigravitySession,
  ANTIGRAVITY_VERIFY_CODE,
  ANTIGRAVITY_VERIFY_MESSAGE,
  antigravityValidationClientError,
  antigravityVersion,
  applyAntigravityValidation,
  completeAntigravityLogin,
  parseAntigravityValidation,
  detectAntigravityVersion,
  exchangeAntigravityCode,
  fetchAntigravityProject,
  isAntigravityPermanentRefreshError,
  normalizeAntigravityVersion,
  parseAntigravityPlistVersion,
  parseAntigravityVersionText,
} from '../lib/oauth/antigravity/index.js'
import {
  ANTIGRAVITY_STABLE_SESSION,
  antigravityEventsToOpenaiChunks,
  antigravityToOpenai,
  cachedTokensOf,
  functionResponsePayload,
  openaiToAntigravity,
  resetAntigravitySystemPins,
  resetAntigravityThoughtSignatures,
} from '../lib/oauth/antigravity/request.js'
import { antigravitySessionIdOf } from '../lib/oauth/antigravity/cache.js'
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
  resetAntigravitySystemPins()
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
  assert.equal(body.request.sessionId, `${ANTIGRAVITY_STABLE_SESSION}:claude-sonnet-4-6`)
  assert.equal(/^-\d+$/.test(body.request.sessionId), false)
  assert.equal(body.request.implicitCacheConfig, undefined)
  assert.equal(body.request.cachedContent, undefined)
  assertCleanIdentity(body)
  assert.throws(() => openaiToAntigravity({ model: 'claude-sonnet-4-6', messages: [] }, { projectId: '' }), /project_id/)
  resetAntigravitySystemPins()
})

test('openaiToAntigravity sessionId is the DSH pin, never a Date.now stamp', () => {
  const pinned = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-dsh-1',
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p' })
  assert.equal(pinned.request.sessionId, 'session-dsh-1')
  assert.equal(/^-\d+$/.test(pinned.request.sessionId), false)

  const fromCache = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    prompt_cache_key: 'cache-key-9',
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p' })
  assert.equal(fromCache.request.sessionId, 'cache-key-9')

  const explicit = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p', sessionId: 'session 772f/foo' })
  assert.equal(explicit.request.sessionId, 'session-772f-foo')
  assert.equal(/^-\d+$/.test(explicit.request.sessionId), false)
})

test('catalog is the live cloudcode-pa list, not Vertex-direct names', () => {
  const ids = ANTIGRAVITY_MODELS.map((model) => model.id)
  assert.equal(ids.includes('claude-sonnet-4-6'), true)
  assert.equal(ids.includes('gemini-pro-agent'), true)
  assert.equal(ids.includes('gemini-3.1-pro-low'), true)
  assert.equal(ids.includes('gemini-3.6-flash-high'), true)
  assert.equal(ids.includes('gemini-3.7-flash-high'), true)
  assert.equal(ids.includes('gemini-3.8-flash-high'), true)
  assert.equal(ids.includes('gemini-3.8-flash'), false)
  assert.equal(ids.includes('gpt-oss-120b-medium'), true)
  assert.equal(ids.some((id) => id.startsWith('publishers/') || id.includes('vertex')), false)
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  assert.equal(catalog['oauth-antigravity'].api, 'openai-completions')
  assert.equal(catalog['oauth-antigravity'].baseURL, 'http://x/antigravity/v1')
  assert.deepEqual(catalog['oauth-antigravity'].models.find((model) => model.id === 'gpt-oss-120b-medium').input, ['text'])
  const flash38 = catalog['oauth-antigravity'].models.find((model) => model.id === 'gemini-3.8-flash-high')
  assert.equal(flash38.name, 'Gemini 3.8 Flash')
  assert.equal(flash38.contextWindow, 1_048_576)
  assert.equal(flash38.maxTokens, 65_536)
  assert.deepEqual(flash38.input, ['text', 'image'])
  assert.deepEqual(flash38.reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' })
  assert.deepEqual(
    catalog['oauth-antigravity'].models.find((model) => model.id === 'gemini-3.7-flash-high').reasoningEfforts,
    flash38.reasoningEfforts,
  )
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
          paidTier: auth.includes('tok-b') ? undefined : { id: 'g1-pro-tier' },
          currentTier: { id: 'STANDARD TIER' },
          cloudaicompanionProject: auth.includes('tok-b') ? 'p2' : 'p1',
        })
      }
      if (href === ANTIGRAVITY_QUOTA_SUMMARY_URL) {
        return new Response('not found', { status: 404 })
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
  assert.equal(first.quota.planLabel, 'Pro')
  assert.equal(second.quota.planLabel, undefined)
  assert.equal(seen.every((href) => !href.startsWith(ANTIGRAVITY_PROD_API_URL)), true)
  assert.equal(seen.every((href) => href.startsWith(ANTIGRAVITY_DAILY_API_URL)), true)
  assert.equal(formatPlanLabel('free-tier', 'antigravity'), 'Free')
  assert.equal(antigravityPlanType({
    paidTier: { id: 'g1-pro-tier' },
    currentTier: { id: 'STANDARD TIER' },
  }), 'g1-pro-tier')
  assert.equal(antigravityPlanType({
    paidTier: { name: 'Google AI Pro' },
    currentTier: { id: 'STANDARD TIER' },
  }), 'Google AI Pro')
  assert.equal(antigravityPlanType({
    paidTier: { name: 'Google AI Pro' },
    currentTier: { id: 'free-tier' },
  }), 'Google AI Pro')
  assert.equal(antigravityPlanType({ currentTier: { id: 'STANDARD TIER' } }), undefined)
  assert.equal(antigravityPlanType({ currentTier: { id: 'free-tier' } }), 'free-tier')
  assert.equal(first.planLabel, 'Pro')
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
    assert.equal(body.request.sessionId, `${ANTIGRAVITY_STABLE_SESSION}:claude-sonnet-4-6`)
    assert.equal(/^-\d+$/.test(body.request.sessionId), false)
    assertCleanIdentity(seen[0])
    assertCleanIdentity(body)

    const pinned = await fetch(`http://127.0.0.1:${port}/antigravity/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        session_id: 'session-dsh-ag',
        prompt_cache_retention: '24h',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(pinned.status, 200)
    const pinnedBody = JSON.parse(seen[1].body)
    assert.equal(pinnedBody.request.sessionId, 'session-dsh-ag')
    assert.equal(/^-\d+$/.test(pinnedBody.request.sessionId), false)
    assert.equal(pinnedBody.request.prompt_cache_retention, undefined)
    assert.equal(pinnedBody.prompt_cache_retention, undefined)

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

function googleValidationDenied() {
  return {
    error: {
      code: 403,
      message: 'Verify your account to continue.',
      status: 'PERMISSION_DENIED',
      details: [{
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'VALIDATION_REQUIRED',
        domain: 'cloudcode-pa.googleapis.com',
        metadata: {
          validation_url: 'https://accounts.google.com/signin/continue?continue=https://developers.google.com/gemini-code-assist/auth/auth_success_gemini&plt=one-time-test',
        },
      }],
    },
  }
}

test('parseAntigravityValidation detects VALIDATION_REQUIRED and strips nothing from the URL', () => {
  const info = parseAntigravityValidation(googleValidationDenied())
  assert.equal(info.required, true)
  assert.equal(info.code, ANTIGRAVITY_VERIFY_CODE)
  assert.equal(info.message, ANTIGRAVITY_VERIFY_MESSAGE)
  assert.equal(info.validationUrl?.startsWith('https://accounts.google.com/signin/continue'), true)
  assert.equal(parseAntigravityValidation({ error: { message: 'quota exceeded' } }), undefined)
  const body = antigravityValidationClientError(info)
  assert.equal(body.error.message, 'Google 需要验证此账号才能对话')
  assert.equal(body.error.code, 'VALIDATION_REQUIRED')
  assert.equal(JSON.stringify(body).includes('plt='), false)
})

test('proxy rewrites Cloud Code VALIDATION_REQUIRED to a 400, not a 403', async () => {
  const remembered = []
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async () => jsonResponse(googleValidationDenied(), 403),
    tokens: {
      antigravity: {
        session: async () => antigravitySession({
          accessToken: 'ag-tok',
          refreshToken: 'r',
          expiresAt: Date.now() + 60_000,
          account: 'dev@x',
          projectId: 'proj-1',
        }),
        remember: async (fields) => { remembered.push(fields) },
      },
    },
  })
  const server = await proxy.listen()
  try {
    const denied = await fetch(`http://127.0.0.1:${server.address().port}/antigravity/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gemini-3.7-flash-high', messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(denied.status, 400)
    assert.equal([401, 403].includes(denied.status), false)
    const payload = await denied.json()
    assert.equal(payload.error.message, ANTIGRAVITY_VERIFY_MESSAGE)
    assert.equal(payload.error.code, ANTIGRAVITY_VERIFY_CODE)
    assert.equal(payload.error.type, 'invalid_request')
    assert.equal(String(payload.error.message).includes('密钥'), false)
    assert.equal(JSON.stringify(payload).includes('plt='), false)
    assert.equal(isAntigravityPermanentRefreshError({ code: ANTIGRAVITY_VERIFY_CODE }), false)
    assert.equal(isAntigravityPermanentRefreshError(googleValidationDenied()), false)
    assert.equal(isAntigravityPermanentRefreshError({ code: 'invalid_grant' }), true)
    assert.equal(remembered[0].needsValidation, true)
    assert.equal(remembered[0].validationUrl.startsWith('https://accounts.google.com/'), true)
  } finally {
    await proxy.close()
  }
})

test('snapshot exposes Antigravity needsValidation and validationUrl on the card row', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-ag-val-'))
  const authPath = join(dir, 'auth.json')
  const later = Date.now() + 60 * 60_000
  const verifyUrl = 'https://accounts.google.com/signin/continue?continue=https://developers.google.com/gemini-code-assist/auth/auth_success_gemini&plt=card-test'
  await saveSession('antigravity', applyAntigravityValidation(antigravitySession({
    accessToken: 'tok-v', refreshToken: 'r', expiresAt: later, account: 'need@x', projectId: 'p1',
    planType: 'STANDARD TIER',
  }), { required: true, validationUrl: verifyUrl }), authPath)
  const daily = antigravityFetchModelsUrls()[0]
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    settings: { mutate: async () => undefined },
    fetchFn: async (url) => {
      const href = String(url)
      if (href === ANTIGRAVITY_LOAD_CODE_ASSIST_URL) {
        return jsonResponse({ currentTier: { id: 'STANDARD TIER' }, cloudaicompanionProject: 'p1' })
      }
      if (href === ANTIGRAVITY_QUOTA_SUMMARY_URL) {
        return new Response('not found', { status: 404 })
      }
      if (href === daily) {
        return jsonResponse({ models: { 'gemini-3-flash': { quotaInfo: { remainingFraction: 0.5 } } } })
      }
      if (href.includes(':generateContent')) {
        return jsonResponse(googleValidationDenied(), 403)
      }
      throw new Error(`unexpected ${href}`)
    },
  })
  const snap = await controller.snapshot()
  const row = snap.accounts.antigravity.accounts.find((item) => item.account === 'need@x')
  assert.equal(row.needsValidation, true)
  assert.equal(row.validationUrl, verifyUrl)
})

function googleSseEvent({ text, thought, finishReason, usage, functionCall, parts } = {}) {
  const contentParts = parts ?? [
    ...(thought != null ? [{ text: thought, thought: true }] : []),
    ...(text != null ? [{ text }] : []),
    ...(functionCall ? [{ functionCall }] : []),
  ]
  return {
    response: {
      candidates: [{
        content: { parts: contentParts },
        ...(finishReason ? { finishReason } : {}),
      }],
      ...(usage ? { usageMetadata: usage } : {}),
    },
  }
}

function parseOpenaiSse(text) {
  const chunks = []
  let done = false
  for (const block of String(text).split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!data) continue
    if (data === '[DONE]') {
      done = true
      continue
    }
    chunks.push(JSON.parse(data))
  }
  return { chunks, done }
}

const STREAM_USAGE = {
  promptTokenCount: 120,
  candidatesTokenCount: 18,
  thoughtsTokenCount: 42,
  totalTokenCount: 180,
}

test('antigravityToOpenai maps thoughtsTokenCount into completion_tokens', () => {
  const out = antigravityToOpenai({
    response: {
      candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
      usageMetadata: STREAM_USAGE,
    },
  }, { model: 'gemini-3.7-flash-high', id: 'chatcmpl-usage' })
  assert.deepEqual(out.usage, {
    prompt_tokens: 120,
    completion_tokens: 60,
    total_tokens: 180,
    completion_tokens_details: { reasoning_tokens: 42 },
  })

  const noTotal = antigravityToOpenai({
    response: {
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, thoughtsTokenCount: 7 },
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(noTotal.usage.prompt_tokens, 10)
  assert.equal(noTotal.usage.completion_tokens, 10)
  assert.equal(noTotal.usage.total_tokens, 20)
  assert.equal(noTotal.usage.completion_tokens_details.reasoning_tokens, 7)
})

test('antigravityToOpenai maps cachedContentTokenCount into prompt_tokens_details', () => {
  const out = antigravityToOpenai({
    response: {
      candidates: [{ content: { parts: [{ text: 'hi' }] }, finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 25598,
        candidatesTokenCount: 4768,
        totalTokenCount: 30366,
        cachedContentTokenCount: 18360,
      },
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(out.usage.prompt_tokens, 25598)
  assert.equal(out.usage.prompt_tokens_details.cached_tokens, 18360)
  assert.equal(out.usage.completion_tokens, 4768)

  const snake = antigravityToOpenai({
    response: {
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: { promptTokenCount: 100, cached_content_token_count: 80, candidatesTokenCount: 1 },
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(snake.usage.prompt_tokens_details.cached_tokens, 80)

  const details = antigravityToOpenai({
    response: {
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: {
        promptTokenCount: 50,
        cacheTokensDetails: [{ tokenCount: 20 }, { token_count: 10 }],
        candidatesTokenCount: 1,
      },
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(details.usage.prompt_tokens_details.cached_tokens, 30)

  const zero = antigravityToOpenai({
    response: {
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
      usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 0, candidatesTokenCount: 1 },
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(zero.usage.prompt_tokens_details.cached_tokens, 0)
  assert.equal(zero.usage.prompt_tokens_details === undefined, false)

  assert.equal(cachedTokensOf({ cache_read_tokens: 12 }), 12)
  assert.equal(cachedTokensOf({ cacheReadTokens: 34 }), 34)
  assert.equal(cachedTokensOf({ cacheReadInputTokens: 56 }), 56)
  assert.equal(cachedTokensOf({ cachedContentTokenCount: 9, cacheReadTokens: 99 }), 9)
})

test('openaiToAntigravity parks extra system snapshots after the pinned prefix', () => {
  resetAntigravitySystemPins()
  const first = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-cache-1',
    messages: [
      { role: 'system', content: 'You are an AI agent.' },
      { role: 'user', content: 'analyze the repo' },
    ],
  }, { projectId: 'p' })
  assert.deepEqual(first.request.systemInstruction.parts, [{ text: 'You are an AI agent.' }])
  assert.equal(first.request.contents.at(-1).parts[0].text, 'analyze the repo')

  const later = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-cache-1',
    messages: [
      { role: 'system', content: 'You are an AI agent.' },
      { role: 'system', content: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.' },
      { role: 'user', content: 'analyze the repo' },
      { role: 'assistant', content: 'ok' },
    ],
  }, { projectId: 'p' })
  assert.deepEqual(later.request.systemInstruction.parts, [{ text: 'You are an AI agent.' }])
  assert.equal(later.request.contents.at(-1).role, 'user')
  assert.match(later.request.contents.at(-1).parts[0].text, /Current runtime context/)
  resetAntigravitySystemPins()
})

test('cumulative Google SSE becomes incremental OpenAI deltas', () => {
  const chunks = antigravityEventsToOpenaiChunks([
    googleSseEvent({ text: 'Hello' }),
    googleSseEvent({ text: 'Hello world' }),
  ], { model: 'gemini-3.7-flash-high', id: 'chatcmpl-delta' })
  assert.equal(chunks[0].choices[0].delta.content, 'Hello')
  assert.equal(chunks[1].choices[0].delta.content, ' world')
  assert.equal(chunks.some((chunk) => chunk.choices[0].delta.content === 'Hello world'), false)
  const terminal = chunks.at(-1)
  assert.deepEqual(terminal.choices[0].delta, {})
  assert.equal(terminal.choices[0].finish_reason, 'stop')
  assert.equal(terminal.usage, undefined)

  const reset = antigravityEventsToOpenaiChunks([
    googleSseEvent({ text: 'Hello world' }),
    googleSseEvent({ text: 'Hi' }),
  ], { id: 'chatcmpl-reset' })
  assert.equal(reset[0].choices[0].delta.content, 'Hello world')
  assert.equal(reset[1].choices[0].delta.content, 'Hi')
})

test('thought-only frames stay out of delta.content; usage still counts thoughts', () => {
  const chunks = antigravityEventsToOpenaiChunks([
    googleSseEvent({ thought: 'planning the answer' }),
    googleSseEvent({
      thought: 'planning the answer',
      text: '可见正文从这里开始',
      finishReason: 'STOP',
      usage: STREAM_USAGE,
    }),
  ], { model: 'gemini-3.7-flash-high', id: 'chatcmpl-thought' })
  const contents = chunks.map((chunk) => chunk.choices[0].delta.content).filter(Boolean)
  assert.deepEqual(contents, ['可见正文从这里开始'])
  assert.equal(contents[0].includes('planning'), false)
  const terminal = chunks.at(-1)
  assert.equal(terminal.choices[0].finish_reason, 'stop')
  assert.equal(terminal.usage.prompt_tokens, 120)
  assert.equal(terminal.usage.completion_tokens, 60)
  assert.equal(terminal.usage.total_tokens, 180)
  assert.equal(terminal.usage.completion_tokens_details.reasoning_tokens, 42)
})

test('tool-call stream emits tool_calls and finish_reason tool_calls', () => {
  const chunks = antigravityEventsToOpenaiChunks([
    googleSseEvent({ functionCall: { name: 'Read', args: { path: 'a.ts' } } }),
    googleSseEvent({
      functionCall: { name: 'Read', args: { path: 'a.ts' } },
      finishReason: 'STOP',
    }),
  ], { model: 'gemini-3.7-flash-high', id: 'chatcmpl-tools' })
  const toolChunk = chunks.find((chunk) => chunk.choices[0].delta.tool_calls)
  assert.equal(toolChunk.choices[0].delta.tool_calls[0].function.name, 'Read')
  assert.equal(toolChunk.choices[0].delta.tool_calls[0].function.arguments, '{"path":"a.ts"}')
  assert.equal(chunks.filter((chunk) => chunk.choices[0].delta.tool_calls).length, 1)
  const terminal = chunks.at(-1)
  assert.deepEqual(terminal.choices[0].delta, {})
  assert.equal(terminal.choices[0].finish_reason, 'tool_calls')
})

function assertNoThoughtSignature(part) {
  assert.equal(Object.hasOwn(part, 'thoughtSignature'), false)
  assert.equal(Object.hasOwn(part, 'thought_signature'), false)
  assert.equal(part.thoughtSignature, undefined)
  assert.equal(part.functionCall?.thoughtSignature, undefined)
}

test('functionCall thoughtSignature round-trips on the matching part', () => {
  resetAntigravityThoughtSignatures()
  resetAntigravitySystemPins()
  const google = {
    response: {
      candidates: [{
        content: {
          parts: [{
            functionCall: { name: 'default_api:run_code', args: { code: 'print(1)' } },
            thoughtSignature: 'sig-run-code-A',
          }],
        },
        finishReason: 'STOP',
      }],
    },
  }
  const openai = antigravityToOpenai(google, { model: 'gemini-3.7-flash-high' })
  const call = openai.choices[0].message.tool_calls[0]
  assert.equal(call.id, 'call_1')
  assert.equal(call.function.name, 'default_api:run_code')
  assert.equal(call.function.arguments, '{"code":"print(1)"}')
  assert.equal(call.thoughtSignature, 'sig-run-code-A')
  assert.equal(call.thought_signature, 'sig-run-code-A')
  assert.equal(call.extra_content.google.thought_signature, 'sig-run-code-A')

  resetAntigravityThoughtSignatures()
  const back = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-inband-1',
    messages: [
      { role: 'user', content: 'run' },
      { role: 'assistant', content: null, tool_calls: [call] },
      { role: 'tool', tool_call_id: call.id, name: 'default_api:run_code', content: '1' },
    ],
  }, { projectId: 'p' })
  const model = back.request.contents.find((content) => content.role === 'model')
  assert.equal(model.parts[0].thoughtSignature, 'sig-run-code-A')
  assert.deepEqual(model.parts[0].functionCall, { name: 'default_api:run_code', args: { code: 'print(1)' } })
  assert.equal(Object.hasOwn(model.parts[0].functionCall, 'thoughtSignature'), false)
  resetAntigravityThoughtSignatures()
  resetAntigravitySystemPins()
})

test('nested functionCall.thoughtSignature inbound becomes part-level outbound', () => {
  resetAntigravityThoughtSignatures()
  const openai = antigravityToOpenai({
    response: {
      candidates: [{
        content: {
          parts: [{
            functionCall: {
              name: 'Read',
              args: { path: 'a.ts' },
              thoughtSignature: 'sig-nested',
            },
          }],
        },
      }],
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(openai.choices[0].message.tool_calls[0].thoughtSignature, 'sig-nested')
  resetAntigravityThoughtSignatures()
  const back = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-nested-1',
    messages: [
      { role: 'user', content: 'read' },
      { role: 'assistant', content: null, tool_calls: openai.choices[0].message.tool_calls },
    ],
  }, { projectId: 'p' })
  assert.equal(back.request.contents[1].parts[0].thoughtSignature, 'sig-nested')
  assert.deepEqual(back.request.contents[1].parts[0].functionCall, { name: 'Read', args: { path: 'a.ts' } })
  resetAntigravityThoughtSignatures()
})

test('missing thoughtSignature still emits tool_calls and outbound omits the field', () => {
  resetAntigravityThoughtSignatures()
  const openai = antigravityToOpenai({
    response: {
      candidates: [{
        content: { parts: [{ functionCall: { name: 'Read', args: { path: 'a.ts' } } }] },
      }],
    },
  }, { model: 'gemini-3.7-flash-high' })
  const call = openai.choices[0].message.tool_calls[0]
  assert.equal(call.function.name, 'Read')
  assert.equal(call.thoughtSignature, undefined)
  assert.equal(call.extra_content, undefined)

  const empty = antigravityToOpenai({
    response: {
      candidates: [{
        content: {
          parts: [{
            functionCall: { name: 'Read', args: {} },
            thoughtSignature: '   ',
            thought_signature: '',
          }],
        },
      }],
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(empty.choices[0].message.tool_calls[0].function.name, 'Read')
  assert.equal(empty.choices[0].message.tool_calls[0].thoughtSignature, undefined)

  const back = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-missing-1',
    messages: [
      { role: 'user', content: 'read' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'Read', arguments: '{"path":"a.ts"}' }, thoughtSignature: '' },
        ],
      },
    ],
  }, { projectId: 'p' })
  assertNoThoughtSignature(back.request.contents[1].parts[0])
  assert.deepEqual(back.request.contents[1].parts[0].functionCall, { name: 'Read', args: { path: 'a.ts' } })
  resetAntigravityThoughtSignatures()
})

test('each parallel functionCall keeps its own thoughtSignature', () => {
  resetAntigravityThoughtSignatures()
  const openai = antigravityToOpenai({
    response: {
      candidates: [{
        content: {
          parts: [
            { functionCall: { name: 'Read', args: { path: 'a.ts' } }, thoughtSignature: 'sig-a' },
            { functionCall: { name: 'Grep', args: { q: 'src' } }, thoughtSignature: 'sig-b' },
            { functionCall: { name: 'Read', args: { path: 'b.ts' } } },
          ],
        },
      }],
    },
  }, { model: 'gemini-3.7-flash-high' })
  const calls = openai.choices[0].message.tool_calls
  assert.equal(calls.length, 3)
  assert.equal(calls[0].thoughtSignature, 'sig-a')
  assert.equal(calls[1].thoughtSignature, 'sig-b')
  assert.equal(calls[2].thoughtSignature, undefined)
  resetAntigravityThoughtSignatures()
  const back = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-multi-1',
    messages: [
      { role: 'user', content: 'look' },
      { role: 'assistant', content: null, tool_calls: calls },
    ],
  }, { projectId: 'p' })
  const parts = back.request.contents[1].parts
  assert.equal(parts[0].thoughtSignature, 'sig-a')
  assert.equal(parts[1].thoughtSignature, 'sig-b')
  assertNoThoughtSignature(parts[2])
  assert.deepEqual(parts[0].functionCall, { name: 'Read', args: { path: 'a.ts' } })
  assert.deepEqual(parts[1].functionCall, { name: 'Grep', args: { q: 'src' } })
  resetAntigravityThoughtSignatures()
})

test('session map reattaches thoughtSignature when DSH strips extra tool_call keys', () => {
  resetAntigravityThoughtSignatures()
  resetAntigravitySystemPins()
  antigravityToOpenai({
    response: {
      candidates: [{
        content: {
          parts: [{
            functionCall: { name: 'default_api:run_code', args: { code: 'print(1)' } },
            thoughtSignature: 'sig-map-A',
          }],
        },
      }],
    },
  }, { model: 'gemini-3.7-flash-high', sessionId: 'session-sig-1' })
  const back = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-sig-1',
    messages: [
      { role: 'user', content: 'run' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'default_api:run_code', arguments: '{"code":"print(1)"}' },
        }],
      },
      { role: 'tool', tool_call_id: 'call_1', name: 'default_api:run_code', content: '1' },
    ],
  }, { projectId: 'p' })
  assert.equal(back.request.contents[1].parts[0].thoughtSignature, 'sig-map-A')
  resetAntigravityThoughtSignatures()
  resetAntigravitySystemPins()
})

test('thought-only part signature moves onto the following unsigned functionCall', () => {
  resetAntigravityThoughtSignatures()
  const openai = antigravityToOpenai({
    response: {
      candidates: [{
        content: {
          parts: [
            { thought: true, text: 'planning run_code', thoughtSignature: 'sig-thought' },
            { functionCall: { name: 'default_api:run_code', args: { code: '1+1' } } },
          ],
        },
      }],
    },
  }, { model: 'gemini-3.7-flash-high' })
  assert.equal(openai.choices[0].message.content, null)
  assert.equal(openai.choices[0].message.tool_calls[0].thoughtSignature, 'sig-thought')
  resetAntigravityThoughtSignatures()
  const back = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-thought-1',
    messages: [
      { role: 'user', content: 'run' },
      { role: 'assistant', content: openai.choices[0].message.content, tool_calls: openai.choices[0].message.tool_calls },
    ],
  }, { projectId: 'p' })
  assert.equal(back.request.contents[1].parts.length, 1)
  assert.equal(back.request.contents[1].parts[0].thoughtSignature, 'sig-thought')
  assert.equal(JSON.stringify(back.request.contents).includes('planning run_code'), false)
  resetAntigravityThoughtSignatures()
})

test('SSE functionCall thoughtSignature lands on the first tool_calls delta', () => {
  resetAntigravityThoughtSignatures()
  const chunks = antigravityEventsToOpenaiChunks([
    googleSseEvent({
      parts: [{
        functionCall: { name: 'default_api:run_code', args: { code: 'print(1)' } },
        thoughtSignature: 'sig-sse',
      }],
    }),
  ], { model: 'gemini-3.7-flash-high', id: 'chatcmpl-sig', sessionId: 'session-sse-1' })
  const toolChunk = chunks.find((chunk) => chunk.choices[0].delta.tool_calls)
  const call = toolChunk.choices[0].delta.tool_calls[0]
  assert.equal(call.function.name, 'default_api:run_code')
  assert.equal(call.thoughtSignature, 'sig-sse')
  assert.equal(call.extra_content.google.thought_signature, 'sig-sse')
  resetAntigravityThoughtSignatures()
})

test('proxy stream writes incremental deltas then a terminal usage chunk before [DONE]', async () => {
  const sse = [
    googleSseEvent({ text: 'Hello' }),
    googleSseEvent({ text: 'Hello world' }),
    googleSseEvent({
      thought: 'done thinking',
      finishReason: 'STOP',
      usage: STREAM_USAGE,
    }),
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
  const fetchFn = async (url) => {
    assert.equal(String(url).includes('streamGenerateContent'), true)
    return new Response(sse, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
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
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/antigravity/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3.7-flash-high',
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
    assert.equal(response.status, 200)
    const { chunks, done } = parseOpenaiSse(await response.text())
    assert.equal(done, true)
    const contents = chunks.map((chunk) => chunk.choices[0].delta.content).filter(Boolean)
    assert.deepEqual(contents, ['Hello', ' world'])
    const terminal = chunks.at(-1)
    assert.deepEqual(terminal.choices[0].delta, {})
    assert.equal(terminal.choices[0].finish_reason, 'stop')
    assert.equal(terminal.usage.prompt_tokens > 0, true)
    assert.equal(terminal.usage.completion_tokens > 0, true)
    assert.equal(terminal.usage.total_tokens > 0, true)
    assert.equal(terminal.usage.prompt_tokens, 120)
    assert.equal(terminal.usage.completion_tokens, 60)
    assert.equal(terminal.usage.total_tokens, 180)
    assert.equal(terminal.usage.completion_tokens_details.reasoning_tokens, 42)
  } finally {
    await proxy.close()
  }
})

test('proxy remembers functionCall thoughtSignature across a stripped DSH tool turn', async () => {
  resetAntigravityThoughtSignatures()
  resetAntigravitySystemPins()
  const seen = []
  const sse = `data: ${JSON.stringify(googleSseEvent({
    parts: [{
      functionCall: { name: 'default_api:run_code', args: { code: 'print(1)' } },
      thoughtSignature: 'sig-proxy-live',
    }],
    finishReason: 'STOP',
  }))}\n\n`
  const fetchFn = async (url, init) => {
    seen.push({ url: String(url), body: String(init.body) })
    if (String(url).includes('streamGenerateContent')) {
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    return jsonResponse({
      response: { candidates: [{ content: { parts: [{ text: 'done' }] }, finishReason: 'STOP' }] },
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
  try {
    const first = await fetch(`http://127.0.0.1:${server.address().port}/antigravity/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3.7-flash-high',
        stream: true,
        session_id: 'session-proxy-sig',
        messages: [{ role: 'user', content: 'run code' }],
      }),
    })
    assert.equal(first.status, 200)
    const { chunks } = parseOpenaiSse(await first.text())
    const toolChunk = chunks.find((chunk) => chunk.choices[0].delta.tool_calls)
    assert.equal(toolChunk.choices[0].delta.tool_calls[0].thoughtSignature, 'sig-proxy-live')

    const second = await fetch(`http://127.0.0.1:${server.address().port}/antigravity/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3.7-flash-high',
        session_id: 'session-proxy-sig',
        messages: [
          { role: 'user', content: 'run code' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'default_api:run_code', arguments: '{"code":"print(1)"}' },
            }],
          },
          { role: 'tool', tool_call_id: 'call_1', name: 'default_api:run_code', content: '1' },
        ],
      }),
    })
    assert.equal(second.status, 200)
    const replay = JSON.parse(seen[1].body)
    const model = replay.request.contents.find((content) => content.role === 'model')
    assert.equal(model.parts[0].thoughtSignature, 'sig-proxy-live')
    assert.deepEqual(model.parts[0].functionCall, { name: 'default_api:run_code', args: { code: 'print(1)' } })
    assert.equal(replay.request.implicitCacheConfig, undefined)
    assert.equal(JSON.stringify(replay).includes('skip_thought_signature'), false)
  } finally {
    await proxy.close()
    resetAntigravityThoughtSignatures()
    resetAntigravitySystemPins()
  }
})

const READ_TOOL = {
  type: 'function',
  function: {
    name: 'Read',
    description: 'read a file',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
}
const GREP_TOOL = {
  type: 'function',
  function: {
    name: 'Grep',
    description: 'search',
    parameters: { type: 'object', properties: { q: { type: 'string' } } },
  },
}

test('openaiToAntigravity two-turn same session keeps systemInstruction and tools JSON', () => {
  resetAntigravitySystemPins()
  const first = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-stable-1',
    reasoning_effort: 'high',
    tools: [READ_TOOL, GREP_TOOL],
    messages: [
      { role: 'system', content: 'You are an AI agent.' },
      { role: 'user', content: 'analyze the repo' },
    ],
  }, { projectId: 'p' })
  const later = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-stable-1',
    tools: [
      {
        type: 'function',
        function: {
          name: 'Grep',
          description: 'search (reshuffled)',
          parameters: { properties: { q: { type: 'string' } }, type: 'object' },
        },
      },
      {
        type: 'function',
        function: {
          name: 'Read',
          description: 'read a file (reshuffled)',
          parameters: { required: ['path'], type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    ],
    messages: [
      { role: 'system', content: 'You are an AI agent.' },
      { role: 'system', content: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.' },
      { role: 'user', content: 'analyze the repo' },
      { role: 'assistant', content: 'ok' },
    ],
  }, { projectId: 'p' })

  assert.deepEqual(later.request.systemInstruction.parts, first.request.systemInstruction.parts)
  assert.deepEqual(later.request.systemInstruction.parts, [{ text: 'You are an AI agent.' }])
  assert.equal(JSON.stringify(later.request.tools), JSON.stringify(first.request.tools))
  assert.equal(later.request.tools[0].functionDeclarations[0].name, 'Read')
  assert.equal(later.request.tools[0].functionDeclarations[0].description, 'read a file')
  assert.deepEqual(later.request.generationConfig.thinkingConfig, { thinkingLevel: 'high' })
  assert.deepEqual(later.request.generationConfig.thinkingConfig, first.request.generationConfig.thinkingConfig)
  assert.notEqual(later.requestId, first.requestId)
  assert.equal(later.request.implicitCacheConfig, undefined)
  assert.equal(later.request.cachedContent, undefined)
  assert.equal(later.implicitCacheConfig, undefined)
  resetAntigravitySystemPins()
})

test('antigravity tools pin reuses first JSON when names+schemas match; add/remove is a real change', () => {
  resetAntigravitySystemPins()
  const first = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-tools-1',
    tools: [READ_TOOL, GREP_TOOL],
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p' })
  const shuffled = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-tools-1',
    tools: [
      { type: 'function', function: { name: 'Grep', parameters: { properties: { q: { type: 'string' } }, type: 'object' } } },
      { type: 'function', function: { name: 'Read', parameters: { required: ['path'], properties: { path: { type: 'string' } }, type: 'object' } } },
    ],
    messages: [{ role: 'user', content: 'again' }],
  }, { projectId: 'p' })
  assert.equal(JSON.stringify(shuffled.request.tools), JSON.stringify(first.request.tools))

  const removed = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-tools-1',
    tools: [READ_TOOL],
    messages: [{ role: 'user', content: 'only read' }],
  }, { projectId: 'p' })
  assert.equal(removed.request.tools[0].functionDeclarations.length, 1)
  assert.equal(removed.request.tools[0].functionDeclarations[0].name, 'Read')
  assert.notEqual(JSON.stringify(removed.request.tools), JSON.stringify(first.request.tools))
  resetAntigravitySystemPins()
})

test('antigravity thinkingConfig is sticky-first and never adds implicitCacheConfig', () => {
  resetAntigravitySystemPins()
  const sent = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-think-on',
    reasoning_effort: 'high',
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p' })
  const omitted = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-think-on',
    messages: [{ role: 'user', content: 'again' }],
  }, { projectId: 'p' })
  assert.deepEqual(sent.request.generationConfig.thinkingConfig, { thinkingLevel: 'high' })
  assert.deepEqual(omitted.request.generationConfig.thinkingConfig, { thinkingLevel: 'high' })
  assert.equal(omitted.request.implicitCacheConfig, undefined)

  const firstOmit = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-think-off',
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p' })
  const laterEffort = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    session_id: 'session-think-off',
    reasoning_effort: 'low',
    messages: [{ role: 'user', content: 'again' }],
  }, { projectId: 'p' })
  assert.equal(firstOmit.request.generationConfig, undefined)
  assert.equal(laterEffort.request.generationConfig, undefined)
  resetAntigravitySystemPins()
})

test('antigravity fallback sessionId is per model; DSH session_id stays one conversation', () => {
  resetAntigravitySystemPins()
  const flash = openaiToAntigravity({
    model: 'gemini-3.7-flash-high',
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p' })
  const sonnet = openaiToAntigravity({
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'hi' }],
  }, { projectId: 'p' })
  assert.equal(flash.request.sessionId, `${ANTIGRAVITY_STABLE_SESSION}:gemini-3.7-flash-high`)
  assert.equal(sonnet.request.sessionId, `${ANTIGRAVITY_STABLE_SESSION}:claude-sonnet-4-6`)
  assert.notEqual(flash.request.sessionId, sonnet.request.sessionId)
  assert.equal(antigravitySessionIdOf({}), ANTIGRAVITY_STABLE_SESSION)
  assert.equal(
    antigravitySessionIdOf({ session_id: 'session-dsh-1', model: 'gemini-3.7-flash-high' }),
    'session-dsh-1',
  )
  assert.equal(
    openaiToAntigravity({
      model: 'claude-sonnet-4-6',
      session_id: 'session-dsh-1',
      messages: [{ role: 'user', content: 'hi' }],
    }, { projectId: 'p' }).request.sessionId,
    'session-dsh-1',
  )
  resetAntigravitySystemPins()
})
