import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { AuthController } from '../lib/oauth/controller.js'
import { accountIdOf, listStoredSessions, publicSession, saveSession } from '../lib/oauth/store.js'
import { OAuthFlowManager } from '../lib/oauth/flow.js'
import { buildProviders, catalogProviders, familyOfProvider, HARNESS_COMPLETIONS_API, ownedProviderIds } from '../lib/oauth/models.js'
import {
  COMMAND_CODE_API_KEY_ENV,
  COMMAND_CODE_CREDITS_URL,
  COMMAND_CODE_GENERATE_URL,
  COMMAND_CODE_MAX_TOKENS,
  COMMAND_CODE_MODELS,
  COMMAND_CODE_SUBSCRIPTIONS_URL,
  COMMAND_CODE_USAGE_URL,
  COMMAND_CODE_WHOAMI_URL,
  commandCodeAuthFilePath,
  commandCodeDefaultAccount,
  commandCodeFlow,
  commandCodeSession,
  commandCodeSessionFromCallback,
  commandCodeSourceLabel,
  commandCodeUpstreamHeaders,
  isCommandCodeOpaqueAccount,
  isCommandCodePermanentRefreshError,
  parseCommandCodeApiKey,
  parseCommandCodeWhoami,
  pickCommandCodeHumanAccount,
  refreshCommandCode,
} from '../lib/apikey/command-code/index.js'
import { commandCodeCatalogModels } from '../lib/apikey/command-code/catalog.js'
import { COMMAND_CODE_IMPORT_EMPTY, importCommandCodeAuth, readCommandCodeAuthFile } from '../lib/apikey/command-code/import.js'
import { applyCommandCodeCache, commandCodeThreadId, deterministicCommandCodeId } from '../lib/apikey/command-code/cache.js'
import { commandCodeToOpenai, createCommandCodeOpenaiStream, openaiToCommandCode } from '../lib/apikey/command-code/request.js'
import { runCommandCodeChat } from '../lib/apikey/command-code/transport.js'
import { commandCodePlanInfo, commandCodePlanLabel, parseCommandCodeUsage } from '../lib/apikey/command-code/quota.js'
import { formatPlanLabel } from '../lib/oauth/plan.js'
import { createProxy } from '../lib/oauth/proxy.js'
import { assembleUi } from '../scripts/ui-bundle.ts'

const KEY = 'user_test_3snjwc45CAe2b56LYBoLnXVuoJcQCP6d3rVZHUHqkVw'
const USER_UUID = 'e97a02d4-b06f-4c0c-9b87-a5aeebb363d9'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function jsonl(events) {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join('\n') + '\n'))
      controller.close()
    },
  }), { status: 200, headers: { 'content-type': 'application/jsonl' } })
}

const LIVE_WHOAMI = {
  success: true,
  user: { id: USER_UUID, name: 'Xx Ww', email: '970685525@qq.com', userName: 'xxww0098' },
  org: null,
}

const LIVE_CREDITS = {
  credits: { monthlyCredits: 22.5, purchasedCredits: 4, freeCredits: 0.5 },
  windowLimits: {
    fiveHour: { used: 40, cap: 100, resetAt: '2099-01-01T05:00:00Z' },
    weekly: { used: 200, cap: 500, resetAt: '2099-01-08T00:00:00Z' },
  },
}

const LIVE_SUBSCRIPTION = {
  data: {
    planId: 'individual-pro',
    status: 'active',
    currentPeriodStart: '2099-01-01T00:00:00Z',
    currentPeriodEnd: '2099-02-01T00:00:00Z',
  },
}

const LIVE_USAGE = { totalCost: 12.34, requests: 88 }

test('parseCommandCodeApiKey trims and rejects multiline / short secrets', () => {
  assert.equal(parseCommandCodeApiKey(`  ${KEY}  `), KEY)
  assert.throws(() => parseCommandCodeApiKey(''), /empty/)
  assert.throws(() => parseCommandCodeApiKey('  '), /empty/)
  assert.throws(() => parseCommandCodeApiKey('short'), /invalid/)
  assert.throws(() => parseCommandCodeApiKey(`${KEY}\n${KEY}`), /invalid/)
  assert.throws(() => parseCommandCodeApiKey(KEY.slice(0, 20) + '\t' + KEY.slice(20)), /invalid/)
})

test('command-code session round-trip: fingerprint account, no token in public view', () => {
  const session = commandCodeSession({ accessToken: KEY, source: 'paste' })
  assert.equal(session.accessToken, KEY)
  assert.equal(session.refreshToken, KEY)
  assert.equal(session.expiresAt, Number.MAX_SAFE_INTEGER)
  assert.equal(session.source, 'paste')
  assert.equal(session.account, commandCodeDefaultAccount(KEY))
  assert.equal(isCommandCodeOpaqueAccount(session.account), true)
  const pub = publicSession('command-code', session)
  assert.equal(pub.account, session.account)
  assert.equal(pub.method, 'paste')
  assert.equal(pub.methodLabel, 'key')
  assert.equal(pub.accessToken, undefined)
  assert.equal(pub.refreshToken, undefined)
  assert.equal(accountIdOf('command-code', session), session.account)
  assert.notEqual(accountIdOf('command-code', session), accountIdOf('command-code', commandCodeSession({
    accessToken: 'user_other_0000000000000000000000000000000000000000000000',
  })))
})

test('identity: userName > email > name > uuid; fingerprint and uuid stay opaque', async () => {
  const identity = parseCommandCodeWhoami(LIVE_WHOAMI)
  assert.equal(identity.account, 'xxww0098')
  assert.equal(identity.id, USER_UUID)
  assert.equal(identity.userName, 'xxww0098')
  assert.equal(identity.email, '970685525@qq.com')
  assert.equal(identity.orgId, undefined)
  assert.equal(parseCommandCodeWhoami({ user: { id: 'u1', email: 'a@b.c' } }).account, 'a@b.c')
  assert.equal(parseCommandCodeWhoami({ user: { id: 'u1', name: 'Nice Name' } }).account, 'Nice Name')
  assert.equal(parseCommandCodeWhoami({ user: { id: 'u1' } }).account, 'u1')
  assert.equal(parseCommandCodeWhoami({}), undefined)
  assert.equal(pickCommandCodeHumanAccount(commandCodeDefaultAccount(KEY), 'xxww0098'), 'xxww0098')
  assert.equal(pickCommandCodeHumanAccount(USER_UUID, 'a@b.c'), 'a@b.c')
  assert.equal(pickCommandCodeHumanAccount(commandCodeDefaultAccount(KEY), USER_UUID), undefined)
  assert.equal(isCommandCodeOpaqueAccount('command-code-account'), true)
  assert.equal(isCommandCodeOpaqueAccount('xxww0098'), false)
})

test('whoami identity promotes a paste session to the human account', async () => {
  const session = commandCodeSession({ accessToken: KEY, source: 'cli', userName: 'xxww0098', userId: USER_UUID, account: 'xxww0098' })
  assert.equal(accountIdOf('command-code', session), 'xxww0098')
  const pub = publicSession('command-code', session)
  assert.equal(pub.account, 'xxww0098')
  assert.equal(pub.methodLabel, 'CLI')
  assert.equal(commandCodeSourceLabel('env'), 'env')
  assert.equal(commandCodeSourceLabel('browser'), 'browser')
  assert.equal(commandCodeSourceLabel('cli'), 'CLI')
  assert.equal(commandCodeSourceLabel('paste'), 'key')
})

test('plan table: individual-* / teams-* ids resolve to display names', () => {
  assert.equal(commandCodePlanLabel('individual-go'), 'Go')
  assert.equal(commandCodePlanLabel('individual-goat'), 'GOAT')
  assert.equal(commandCodePlanLabel('individual-provider'), 'Provider')
  assert.equal(commandCodePlanLabel('individual-pro'), 'Pro')
  assert.equal(commandCodePlanLabel('individual-pro-v1'), 'Pro')
  assert.equal(commandCodePlanLabel('individual-max'), 'Max')
  assert.equal(commandCodePlanLabel('individual-ultra'), 'Ultra')
  assert.equal(commandCodePlanLabel('teams-pro'), 'Teams Pro')
  assert.equal(commandCodePlanInfo('individual-pro').monthlyCredits, 30)
  assert.equal(commandCodePlanInfo('individual-ultra').monthlyCredits, 300)
  assert.equal(formatPlanLabel('individual-pro', 'command-code'), 'Pro')
  assert.equal(formatPlanLabel('individual-goat', 'command-code'), 'GOAT')
  assert.equal(formatPlanLabel('teams-pro', 'command-code'), 'Teams Pro')
  assert.equal(commandCodePlanLabel('individual-mystery-9'), 'Mystery-9')
})

test('catalog is Completions at /command-code; efforts stay in the closed set', () => {
  assert.equal(ownedProviderIds('oauth').includes('oauth-command-code'), true)
  assert.equal(familyOfProvider('oauth-command-code'), 'command-code')
  const providers = buildProviders({
    prefix: 'oauth',
    origin: 'http://127.0.0.1:8318',
    loggedIn: { 'command-code': true },
  })
  const route = providers['oauth-command-code']
  assert.equal(route.api, HARNESS_COMPLETIONS_API)
  assert.equal(route.baseURL, 'http://127.0.0.1:8318/command-code')
  assert.equal(route.baseURL.endsWith('/command-code'), true)
  assert.equal(route.models.length, COMMAND_CODE_MODELS.length)
  assert.equal(COMMAND_CODE_MODELS.length, 85)
  for (const model of route.models) {
    for (const key of Object.keys(model.reasoningEfforts ?? {})) {
      assert.match(key, /^(off|minimal|low|medium|high|xhigh|max)$/)
    }
    for (const input of model.input) assert.match(input, /^(text|image)$/)
    assert.equal(typeof model.contextWindow, 'number')
    assert.equal(model.contextWindow > 0, true)
  }
  const catalog = catalogProviders({ prefix: 'oauth', origin: 'http://x' })
  assert.equal(catalog['oauth-command-code'].models.length, 85)
  assert.equal(commandCodeCatalogModels().length, 85)
  assert.equal(catalog['oauth-command-code'].models.some((row) => row.id === 'claude-sonnet-5'), true)
})

test('applyCommandCodeCache: uuid threads pass, foreign fields strip, fallback is deterministic', () => {
  const uuid = 'a97a02d4-b06f-4c0c-9b87-a5aeebb363d9'
  const kept = applyCommandCodeCache({ model: 'claude-sonnet-5', prompt_cache_key: uuid })
  assert.equal(kept.threadId, uuid)
  const derived = applyCommandCodeCache({ model: 'claude-sonnet-5', session_id: 'sess-dsh-1' })
  assert.match(derived.threadId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  assert.equal(derived.threadId, deterministicCommandCodeId('sess-dsh-1'))
  const again = applyCommandCodeCache({ model: 'claude-sonnet-5', session_id: 'sess-dsh-1' })
  assert.equal(again.threadId, derived.threadId)
  const other = applyCommandCodeCache({ model: 'claude-sonnet-5', session_id: 'sess-dsh-2' })
  assert.notEqual(other.threadId, derived.threadId)
  const fallback = applyCommandCodeCache({ model: 'gpt-5.5' })
  assert.equal(fallback.threadId, deterministicCommandCodeId('dsh-command-code:gpt-5.5'))
  assert.equal(commandCodeThreadId({}), deterministicCommandCodeId('dsh-command-code:default'))
  const stripped = applyCommandCodeCache({
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'hi' }],
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    prompt_cache_options: { retention: '24h' },
    session_id: 'sess-dsh',
    cache_control: { type: 'ephemeral' },
    service_tier: 'priority',
    store: true,
    user: 'u',
    metadata: {},
    parallel_tool_calls: true,
    logprobs: true,
    top_logprobs: 5,
    logit_bias: {},
    n: 2,
    seed: 42,
    stream_options: { include_usage: true },
    response_format: { type: 'json_object' },
    frequency_penalty: 1,
    presence_penalty: 1,
    stop: ['x'],
  })
  for (const key of Object.keys(stripped.payload)) {
    assert.equal([
      'model', 'messages', 'tools', 'max_tokens', 'max_completion_tokens',
      'temperature', 'reasoning_effort', 'stream',
    ].includes(key), true, `unexpected upstream field: ${key}`)
  }
})

test('openaiToCommandCode maps messages/tools/effort onto the /alpha/generate wire', () => {
  const { payload: rewritten, threadId } = applyCommandCodeCache({
    model: 'claude-sonnet-5',
    messages: [
      { role: 'system', content: 'You are terse.' },
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: 'checking',
        reasoning_content: 'let me think',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'ls', arguments: '{"dir":"."}' } }],
      },
      { role: 'tool', tool_call_id: 'call_1', content: 'file.ts' },
      { role: 'user', content: [
        { type: 'text', text: 'what is this' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      ] },
    ],
    tools: [{ type: 'function', function: { name: 'ls', description: 'list', parameters: { type: 'object' } } }],
    max_tokens: 200_000,
    temperature: 0.3,
    reasoning_effort: 'xhigh',
    session_id: 'sess-cc-1',
  })
  const body = openaiToCommandCode(rewritten, { threadId })
  assert.equal(body.mode, 'chat')
  assert.equal(body.permissionMode, 'standard')
  assert.equal(body.threadId, deterministicCommandCodeId('sess-cc-1'))
  assert.equal(body.memory, null)
  assert.equal(body.taste, null)
  assert.equal(body.skills, null)
  assert.equal(body.config.workingDir, '')
  assert.equal(body.config.isGitRepo, false)
  const params = body.params
  assert.equal(params.model, 'claude-sonnet-5')
  assert.equal(params.stream, true)
  assert.equal(params.system, 'You are terse.')
  assert.equal(params.max_tokens, COMMAND_CODE_MAX_TOKENS)
  assert.equal(params.temperature, 0.3)
  assert.equal(params.reasoning_effort, 'xhigh')
  assert.deepEqual(params.tools, [{ name: 'ls', description: 'list', input_schema: { type: 'object' } }])
  assert.equal(params.messages.length, 4)
  assert.equal(params.messages[0].role, 'user')
  assert.equal(params.messages[0].content, 'hi')
  assert.deepEqual(params.messages[1].content, [
    { type: 'reasoning', text: 'let me think' },
    { type: 'text', text: 'checking' },
    { toolCallId: 'call_1', toolName: 'ls', input: { dir: '.' } },
  ])
  assert.equal(params.messages[2].role, 'tool')
  assert.deepEqual(params.messages[2].content, [{
    type: 'tool-result',
    toolCallId: 'call_1',
    toolName: 'ls',
    output: { type: 'text', value: 'file.ts' },
  }])
  assert.equal(params.messages[3].role, 'user')
  assert.deepEqual(params.messages[3].content, [
    { type: 'text', text: 'what is this' },
    { type: 'image', image: 'data:image/png;base64,AAA' },
  ])
})

test('non-vision models drop image parts; unknown/effortless models omit reasoning_effort', () => {
  const body = openaiToCommandCode({
    model: 'zai-org/GLM-5.3',
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ] }],
    reasoning_effort: 'minimal',
  })
  assert.equal(body.params.reasoning_effort, undefined)
  assert.deepEqual(body.params.messages[0].content, 'look')
  const effortless = openaiToCommandCode({
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'hi' }],
    reasoning_effort: 'off',
  })
  assert.equal(effortless.params.reasoning_effort, undefined)
  const capped = openaiToCommandCode({
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 999_999,
  })
  assert.equal(capped.params.max_tokens, COMMAND_CODE_MAX_TOKENS)
  const remote = openaiToCommandCode({
    model: 'claude-sonnet-5',
    messages: [{ role: 'user', content: [
      { type: 'image_url', image_url: { url: 'https://example.com/x.png' } },
    ] }],
  })
  assert.equal(remote.params.messages.length, 0)
})

test('JSONL events collect into a chat.completion with usage + tool calls', async () => {
  const events = [
    { type: 'reasoning-start' },
    { type: 'reasoning-delta', text: 'ponder ' },
    { type: 'reasoning-delta', text: 'ing' },
    { type: 'reasoning-end' },
    { type: 'text-delta', text: 'Hello ' },
    { type: 'text-delta', text: 'world' },
    { type: 'tool-call', toolCallId: 'call_1', toolName: 'ls', input: { dir: '.' } },
    { type: 'finish', finishReason: 'tool-calls', totalUsage: {
      inputTokens: 100,
      outputTokens: 42,
      inputTokenDetails: { cacheReadTokens: 64, cacheWriteTokens: 8 },
    } },
  ]
  const session = commandCodeSession({ accessToken: KEY })
  const emitted = []
  const collected = await runCommandCodeChat(session, { fake: true }, {
    fetchFn: async (url, init) => {
      assert.equal(url, COMMAND_CODE_GENERATE_URL)
      assert.equal(init.headers.authorization, `Bearer ${KEY}`)
      assert.equal(init.headers['x-command-code-version'], '1.74.1')
      assert.equal(init.headers['x-cli-environment'], 'production')
      return jsonl(events)
    },
    onEvent: (event) => emitted.push(event.type),
  })
  assert.equal(collected.text, 'Hello world')
  assert.equal(collected.reasoning, 'ponder ing')
  assert.equal(collected.toolCalls.length, 1)
  assert.equal(collected.toolCalls[0].id, 'call_1')
  assert.equal(collected.toolCalls[0].name, 'ls')
  assert.equal(collected.toolCalls[0].argumentsJson, '{"dir":"."}')
  assert.equal(collected.finishReason, 'tool-calls')
  assert.deepEqual(emitted, ['reasoning', 'reasoning', 'text', 'text', 'tool', 'usage', 'finish'])
  const completion = commandCodeToOpenai(collected, { model: 'claude-sonnet-5', id: 'chatcmpl-test' })
  assert.equal(completion.object, 'chat.completion')
  assert.equal(completion.choices[0].finish_reason, 'tool_calls')
  assert.equal(completion.choices[0].message.content, 'Hello world')
  assert.equal(completion.choices[0].message.reasoning_content, 'ponder ing')
  assert.equal(completion.choices[0].message.tool_calls[0].function.name, 'ls')
  assert.equal(completion.choices[0].message.tool_calls[0].function.arguments, '{"dir":"."}')
  assert.equal(completion.usage.prompt_tokens, 100)
  assert.equal(completion.usage.completion_tokens, 42)
  assert.equal(completion.usage.total_tokens, 142)
  assert.equal(completion.usage.prompt_tokens_details.cached_tokens, 64)
  assert.equal(completion.usage.prompt_tokens_details.cache_write_tokens, 8)
})

test('stream mapper emits role/content/tool_calls chunks then finish + DONE', () => {
  const mapper = createCommandCodeOpenaiStream({ model: 'claude-sonnet-5', id: 'chatcmpl-sse' })
  const out = []
  for (const event of [
    { type: 'reasoning', delta: 'hmm ' },
    { type: 'text', delta: 'hi' },
    { type: 'tool', call: { id: 'call_9', name: 'ls', argumentsJson: '{"a":1}' } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: 'tool-calls' },
  ]) out.push(...mapper.push(event))
  out.push(...mapper.finish())
  const lines = out.map((chunk) => chunk.replace(/^data: /, '').trim())
  assert.equal(lines.at(-1), '[DONE]')
  const bodies = lines.slice(0, -1).map((line) => JSON.parse(line))
  assert.equal(bodies[0].choices[0].delta.role, 'assistant')
  assert.equal(bodies[1].choices[0].delta.reasoning_content, 'hmm ')
  assert.equal(bodies[2].choices[0].delta.content, 'hi')
  const toolDelta = bodies[3].choices[0].delta.tool_calls[0]
  assert.equal(toolDelta.id, 'call_9')
  assert.equal(toolDelta.function.name, 'ls')
  assert.equal(toolDelta.function.arguments, '{"a":1}')
  const last = bodies.at(-1)
  assert.equal(last.choices[0].finish_reason, 'tool_calls')
  assert.equal(last.usage.total_tokens, 15)
})

test('runCommandCodeChat: error event, missing finish, and non-ok statuses', async () => {
  const session = commandCodeSession({ accessToken: KEY })
  await assert.rejects(() => runCommandCodeChat(session, {}, {
    fetchFn: async () => jsonl([{ type: 'error', message: 'bad model', statusCode: 400, isRetryable: false }]),
  }), (error) => error.status === 400 && /bad model/.test(error.message))
  // A vendor-flagged retryable error event is still the upstream's answer.
  await assert.rejects(() => runCommandCodeChat(session, {}, {
    fetchFn: async () => jsonl([{ type: 'error', message: 'Overloaded', statusCode: 529, isRetryable: true }]),
  }), (error) => error.status === 529 && error.retryable !== true)
  await assert.rejects(() => runCommandCodeChat(session, {}, {
    fetchFn: async () => jsonl([{ type: 'text-delta', text: 'partial' }]),
  }), (error) => /ended before a finish event/.test(error.message) && error.retryable === true)
  await assert.rejects(() => runCommandCodeChat(session, {}, {
    fetchFn: async () => new Response(null, { status: 200 }),
  }), (error) => /empty body/.test(error.message) && error.retryable === true)
  for (const status of [429, 503]) {
    await assert.rejects(() => runCommandCodeChat(session, {}, {
      fetchFn: async () => json({ error: { message: 'busy' } }, status),
    }), (error) => error.status === status && error.retryable !== true)
  }
  await assert.rejects(() => runCommandCodeChat(session, {}, {
    fetchFn: async () => json({ error: { message: 'insufficient credits' } }, 402),
  }), (error) => error.status === 402 && error.permanent !== true && /insufficient credits/.test(error.message))
  await assert.rejects(() => runCommandCodeChat(session, {}, {
    fetchFn: async () => json({ error: { message: 'unauthorized' } }, 401),
  }), (error) => error.status === 401 && error.permanent === true)
  const aborted = await runCommandCodeChat(session, {}, {
    fetchFn: async () => jsonl([{ type: 'text-delta', text: 'par' }, { type: 'abort' }]),
  })
  assert.equal(aborted.text, 'par')
})

test('forwardCommandCode replays transport faults only; upstream statuses pass through once', async () => {
  const session = commandCodeSession({ accessToken: KEY })
  let calls = 0
  let answer = (_n) => json({}, 200)
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async () => {
      calls += 1
      return answer(calls)
    },
    tokens: { 'command-code': { session: async () => session } },
  })
  const server = await proxy.listen()
  const post = () => fetch(`http://127.0.0.1:${server.address().port}/command-code/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret-key', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', messages: [{ role: 'user', content: 'hi' }] }),
  })
  try {
    for (const status of [429, 503]) {
      calls = 0
      answer = () => json({ error: { message: 'busy' } }, status)
      const res = await post()
      assert.equal(res.status, status)
      assert.equal(calls, 1)
    }
    calls = 0
    answer = (n) => {
      if (n === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
      return jsonl([
        { type: 'text-delta', text: 'hi' },
        { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 1, outputTokens: 1 } },
      ])
    }
    const ok = await post()
    assert.equal(ok.status, 200)
    assert.equal(calls, 2)
  } finally {
    await proxy.close()
  }
})

test('import: env wins over auth.json; empty raises the sentinel; file fields map', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'command-code-import-'))
  const authPath = join(dir, '.commandcode', 'auth.json')
  await import('node:fs/promises').then((fs) => fs.mkdir(join(dir, '.commandcode'), { recursive: true }))
  await import('node:fs/promises').then((fs) => fs.writeFile(authPath, JSON.stringify({
    apiKey: KEY,
    userId: USER_UUID,
    userName: 'xxww0098',
    keyName: 'CLI login',
    authenticatedAt: '2026-01-01T00:00:00Z',
  })))
  assert.equal(commandCodeAuthFilePath(dir), authPath)
  const file = await readCommandCodeAuthFile({ path: authPath })
  assert.equal(file.apiKey, KEY)
  assert.equal(file.userName, 'xxww0098')
  const fromFile = await importCommandCodeAuth({ env: {}, path: authPath })
  assert.equal(fromFile.source, 'cli')
  assert.equal(fromFile.session.account, 'xxww0098')
  assert.equal(fromFile.session.userId, USER_UUID)
  assert.equal(accountIdOf('command-code', fromFile.session), 'xxww0098')
  const fromEnv = await importCommandCodeAuth({ env: { [COMMAND_CODE_API_KEY_ENV]: 'user_env_0000000000000000000000000000000000000000000000' }, path: authPath })
  assert.equal(fromEnv.source, 'env')
  assert.equal(fromEnv.session.accessToken, 'user_env_0000000000000000000000000000000000000000000000')
  await assert.rejects(importCommandCodeAuth({ env: {}, path: join(dir, 'missing.json') }), (error) => error.code === COMMAND_CODE_IMPORT_EMPTY)
  await assert.rejects(importCommandCodeAuth({ env: {}, readFileFn: async () => '{broken' }), (error) => error.code === COMMAND_CODE_IMPORT_EMPTY)
})

test('commandCodeFlow: studio URL + collect resolves the credential callback', async () => {
  const flows = new OAuthFlowManager()
  const attempt = await flows.start('command-code', commandCodeFlow)
  const authorize = new URL(attempt.authorizeUrl)
  assert.equal(authorize.origin + authorize.pathname, 'https://commandcode.ai/studio/auth/cli')
  assert.equal(authorize.searchParams.get('callback'), attempt.redirectUri)
  assert.equal(authorize.searchParams.get('state'), attempt.state)
  assert.equal(authorize.searchParams.get('mode'), 'redirect')
  assert.match(attempt.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/callback$/)
  attempt.manual(`${attempt.redirectUri}?apiKey=${KEY}&userId=${USER_UUID}&userName=xxww0098&keyName=CLI%20login&state=${attempt.state}`)
  const credentials = await attempt.waitCode()
  assert.deepEqual(credentials, {
    apiKey: KEY,
    userId: USER_UUID,
    userName: 'xxww0098',
    keyName: 'CLI login',
  })
  const session = commandCodeSessionFromCallback(credentials)
  assert.equal(session.source, 'browser')
  assert.equal(session.account, 'xxww0098')
  assert.equal(session.userId, USER_UUID)
  assert.equal(accountIdOf('command-code', session), 'xxww0098')
})

test('commandCodeFlow collect rejects incomplete or mismatched callbacks', async () => {
  const flows = new OAuthFlowManager()
  const attempt = await flows.start('command-code', commandCodeFlow)
  try {
    // manual() throws synchronously — these are assert.throws, not rejects.
    assert.throws(
      () => attempt.manual(`${attempt.redirectUri}?apiKey=${KEY}&userId=${USER_UUID}&userName=xxww0098&keyName=k&state=wrong`),
      /state mismatch/,
    )
    assert.throws(
      () => attempt.manual(`${attempt.redirectUri}?apiKey=${KEY}&state=${attempt.state}`),
      /no credentials/,
    )
    attempt.cancel()
    await assert.rejects(attempt.waitCode(), /login cancelled/)
  } finally {
    // If an assertion above fires early, the loopback attempt must still die —
    // an unsettled attempt holds its listener for the full flow timeout.
    attempt.cancel()
  }
})

async function commandCodeQuotaFetch(url, init) {
  const href = String(url)
  assert.equal(init?.headers?.authorization, `Bearer ${KEY}`)
  if (href === `${COMMAND_CODE_WHOAMI_URL}?limits=1`) return json(LIVE_WHOAMI)
  if (href === COMMAND_CODE_CREDITS_URL) return json(LIVE_CREDITS)
  if (href === COMMAND_CODE_SUBSCRIPTIONS_URL) return json(LIVE_SUBSCRIPTION)
  if (href.startsWith(COMMAND_CODE_USAGE_URL)) {
    assert.equal(href.includes('since=2099-01-01'), true)
    return json(LIVE_USAGE)
  }
  throw new Error(`unexpected ${href}`)
}

test('parseCommandCodeUsage: credits usd row + window rows + plan/account', () => {
  const parsed = parseCommandCodeUsage({
    whoami: LIVE_WHOAMI,
    credits: LIVE_CREDITS,
    subscription: LIVE_SUBSCRIPTION,
    summary: LIVE_USAGE,
  })
  assert.equal(parsed.account, 'xxww0098')
  assert.equal(parsed.planType, 'individual-pro')
  assert.equal(parsed.userId, USER_UUID)
  assert.equal(parsed.rows.length, 3)
  const credits = parsed.rows.find((row) => row.kind === 'credits')
  assert.equal(credits.unit, 'usd')
  assert.equal(credits.remaining, undefined)
  // plan monthly ($30) > pool monthly ($22.5): total = 30 + 4 + 0.5
  assert.equal(credits.total, 34.5)
  assert.equal(credits.used, 7.5)
  assert.equal(Math.round(credits.remainingPercent), 78)
  assert.equal(credits.resetAt, Date.parse('2099-02-01T00:00:00Z'))
  const fiveHour = parsed.rows.find((row) => row.kind === 'primary')
  assert.equal(fiveHour.usedPercent, 40)
  assert.equal(fiveHour.resetAt, Date.parse('2099-01-01T05:00:00Z'))
  const weekly = parsed.rows.find((row) => row.kind === 'weekly')
  assert.equal(weekly.usedPercent, 40)
  assert.equal(weekly.resetAt, Date.parse('2099-01-08T00:00:00Z'))
  // No subscription + empty pools → no credits row, no crash.
  const bare = parseCommandCodeUsage({ whoami: LIVE_WHOAMI, credits: {}, subscription: { data: null }, summary: {} })
  assert.equal(bare.planType, undefined)
  assert.equal(bare.rows.some((row) => row.kind === 'credits'), false)
  const none = parseCommandCodeUsage({})
  assert.deepEqual(none.rows, [])
})

test('snapshot shows quota on every command-code account and promotes the vault id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cc-'))
  const authPath = join(dir, 'auth.json')
  const session = commandCodeSession({ accessToken: KEY, source: 'paste' })
  assert.equal(isCommandCodeOpaqueAccount(session.account), true)
  await saveSession('command-code', session, authPath)
  const yaml = { providers: {} }
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    commandCodeAutoImport: false,
    settings: {
      get: async (name) => name === 'llm-pi-ai' ? yaml : undefined,
      mutate: async (target, mutations) => {
        if (target !== 'llm-pi-ai') return
        for (const row of mutations) {
          const key = row.path?.[1]
          if (row.op === 'unset') delete yaml.providers[key]
          else if (row.op === 'set') yaml.providers[key] = row.value
        }
      },
    },
    fetchFn: commandCodeQuotaFetch,
  })
  const snap = await controller.snapshot()
  assert.equal(snap.accounts['command-code'].loggedIn, true)
  assert.equal(snap.accounts['command-code'].accounts.length, 1)
  const row = snap.accounts['command-code'].accounts[0]
  // whoami landed through the quota chain: opaque fingerprint id is replaced
  // by the human account name, and the plan label renders.
  assert.equal(row.id, 'xxww0098')
  assert.equal(row.account, 'xxww0098')
  assert.equal(row.planLabel, 'Pro')
  assert.equal(row.quota?.status, 'ready')
  assert.equal(row.quota.rows.length, 3)
  assert.equal(row.quota.rows.find((entry) => entry.kind === 'credits')?.total, 34.5)
  const stored = await listStoredSessions('command-code', authPath)
  assert.equal(stored[0].id, 'xxww0098')
  assert.equal(stored[0].session.account, 'xxww0098')
  assert.equal(stored[0].session.planType, 'individual-pro')
  assert.equal(snap.catalog.some((entry) => entry.provider === 'oauth-command-code'), true)
  const synced = await controller.sync()
  assert.equal(yaml.providers['oauth-command-code'].api, HARNESS_COMPLETIONS_API)
  assert.equal(yaml.providers['oauth-command-code'].baseURL, 'http://127.0.0.1:8318/command-code')
  assert.equal(synced.routes.some((entry) => entry.provider === 'oauth-command-code'), true)
})

test('refreshQuota re-reads one command-code account instead of falling into the all-families sweep', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-cc-'))
  const authPath = join(dir, 'auth.json')
  await saveSession('command-code', commandCodeSession({ accessToken: KEY, source: 'paste' }), authPath)
  let calls = 0
  const controller = new AuthController({
    authPath,
    prefix: 'oauth',
    origin: () => 'http://127.0.0.1:8318',
    commandCodeAutoImport: false,
    settings: { mutate: async () => undefined },
    fetchFn: (url, init) => { calls += 1; return commandCodeQuotaFetch(url, init) },
  })
  await controller.snapshot()
  calls = 0
  const quota = await controller.refreshQuota('command-code', 'xxww0098')
  assert.equal(quota.status, 'ready')
  assert.equal(quota.rows.find((entry) => entry.kind === 'credits')?.total, 34.5)
  assert.ok(calls > 0, 'the manual refresh must reach the vendor')
})

test('proxy: models list, completions hop to /alpha/generate, SSE stream, /responses 501', async () => {
  const seen = []
  const session = commandCodeSession({ accessToken: KEY, source: 'paste', account: 'xxww0098' })
  const proxy = createProxy({
    port: 0,
    apiKey: 'secret-key',
    fetchFn: async (url, init) => {
      seen.push({ url: String(url), headers: init.headers, body: init.body?.toString() })
      return jsonl([
        { type: 'text-delta', text: 'hi' },
        { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 5, outputTokens: 2 } },
      ])
    },
    tokens: {
      'command-code': { session: async () => session },
    },
  })
  const server = await proxy.listen()
  const { port } = server.address()
  const auth = { authorization: 'Bearer secret-key' }
  try {
    const models = await fetch(`http://127.0.0.1:${port}/command-code/v1/models`, { headers: auth })
    assert.equal(models.status, 200)
    const listing = await models.json()
    assert.equal(listing.data.length, 85)
    assert.equal(listing.data[0].owned_by, 'command-code')

    const ok = await fetch(`http://127.0.0.1:${port}/command-code/v1/chat/completions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'hi' }],
        prompt_cache_key: 'codex-style',
        session_id: 'sess-dsh',
      }),
    })
    assert.equal(ok.status, 200)
    const completion = await ok.json()
    assert.equal(completion.object, 'chat.completion')
    assert.equal(completion.choices[0].message.content, 'hi')
    assert.equal(completion.usage.total_tokens, 7)
    assert.equal(seen[0].url, COMMAND_CODE_GENERATE_URL)
    assert.equal(seen[0].headers.authorization, `Bearer ${KEY}`)
    assert.equal(seen[0].headers['x-command-code-version'], '1.74.1')
    const wire = JSON.parse(seen[0].body)
    assert.equal(wire.params.model, 'claude-sonnet-5')
    assert.equal(wire.params.stream, true)
    assert.equal(wire.mode, 'chat')
    assert.match(wire.threadId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.equal(wire.params.prompt_cache_key, undefined)
    assert.equal(wire.params.session_id, undefined)

    const sse = await fetch(`http://127.0.0.1:${port}/command-code/v1/chat/completions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
      }),
    })
    assert.equal(sse.status, 200)
    assert.match(sse.headers.get('content-type'), /text\/event-stream/)
    const text = await sse.text()
    assert.equal(text.includes('"chat.completion.chunk"'), true)
    assert.equal(text.includes('"content":"hi"'), true)
    assert.equal(text.includes('[DONE]'), true)

    const refused = await fetch(`http://127.0.0.1:${port}/command-code/v1/responses`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(refused.status, 501)
  } finally {
    await proxy.close()
  }
})

test('permanent key: refresh is a no-op and never fails permanently', async () => {
  const session = commandCodeSession({ accessToken: KEY })
  assert.equal(await refreshCommandCode(session), session)
  assert.equal(isCommandCodePermanentRefreshError(new Error('whatever')), false)
  await assert.rejects(() => refreshCommandCode({ accessToken: '' }), /API key/)
  const headers = commandCodeUpstreamHeaders(session)
  assert.equal(headers.authorization, `Bearer ${KEY}`)
  assert.equal(headers['x-command-code-version'], '1.74.1')
  assert.equal(headers['x-cli-environment'], 'production')
})

test('Command Code UI icon uses official command symbol (⌘), not prompt fallback', async () => {
  const src = assembleUi()
  assert.match(src, /commandCode: \{ d: 'M6,2A4,4 0 0,1 10,6V8H14V6/)
  assert.equal(src.includes('M5 4.5l7.5 7.5L5 19.5v-3.3l4.2-4.2L5 7.8V4.5z'), false)
  // Monochrome official mark, no artificial tint in FAMILY_COLOR
  assert.equal(src.includes("'command-code': '#22c55e'"), false)
})
