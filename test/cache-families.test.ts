import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCodexCache, codexCacheHeaders, codexCacheSessionId } from '../lib/oauth/codex/cache.js'
import { applyGrokCache, grokAffinityHeaders, grokCacheSessionId, GROK_STABLE_SESSION, pinGrokSystemPrefix, resetGrokSystemPins } from '../lib/oauth/grok/cache.js'
import { applyGlmAnthropicCache, applyGlmCache, glmCacheSessionId, resetGlmSystemPins } from '../lib/oauth/glm/cache.js'
import { antigravityCacheSessionId, antigravitySessionIdOf, ANTIGRAVITY_STABLE_SESSION } from '../lib/oauth/antigravity/cache.js'
import { kiroCacheSessionId, kiroConversationId, pinKiroSystemPrefix, KIRO_STABLE_SESSION, resetKiroSystemPins } from '../lib/oauth/kiro/cache.js'
import { applyCursorCache, cursorCacheHeaders, cursorCacheSessionId, cursorConversationId, CURSOR_STABLE_SESSION } from '../lib/oauth/cursor/cache.js'
import { applyOllamaCache, ollamaCacheHeaders, ollamaCacheSessionId, OLLAMA_STABLE_SESSION } from '../lib/apikey/ollama/cache.js'
import { applyKimiCache, kimiCacheHeaders, kimiCacheSessionId, KIMI_STABLE_SESSION, resetKimiPins } from '../lib/oauth/kimi/cache.js'
import { applyCopilotCache, copilotCacheHeaders, copilotCacheSessionId, COPILOT_STABLE_SESSION, resetCopilotPins } from '../lib/oauth/copilot/cache.js'
import { applyClineCache, CLINE_STABLE_SESSION, isClineFallback, resetClinePins } from '../lib/oauth/cline/cache.js'
import { applyDevinCache } from '../lib/oauth/devin/cache.js'
import { openaiToKiro } from '../lib/oauth/kiro/request.js'
import { openaiToAntigravity } from '../lib/oauth/antigravity/request.js'
import { openaiToCursor } from '../lib/oauth/cursor/request.js'
import { openaiToDevin } from '../lib/oauth/devin/request.js'
import { isKimiFallback } from '../lib/oauth/kimi/cache.js'
import { isCopilotFallback } from '../lib/oauth/copilot/cache.js'
import { isKiroFallback } from '../lib/oauth/kiro/cache.js'
import { isCursorFallback, resetCursorSystemPins } from '../lib/oauth/cursor/cache.js'
import { isAntigravityFallback, resetAntigravitySystemPins } from '../lib/oauth/antigravity/cache.js'
import { devinConversationId, isDevinFallback } from '../lib/oauth/devin/cache.js'
import { readdirSync, readFileSync } from 'node:fs'

const dirty = 'session 772f7f3a/foo'

test('each family owns its cache id helper (same clip, separate modules)', () => {
  assert.equal(codexCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(grokCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(glmCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(antigravityCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(kiroCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(cursorCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(ollamaCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(kimiCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(copilotCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(codexCacheSessionId(''), undefined)
  assert.equal(grokCacheSessionId(null), undefined)
})

test('Codex cache writes prompt_cache_key and session/thread headers', () => {
  const { payload, cacheSessionId } = applyCodexCache({ session_id: 'sess-codex', prompt_cache_retention: '24h' })
  assert.equal(payload.prompt_cache_key, 'sess-codex')
  assert.equal(Object.hasOwn(payload, 'session_id'), false)
  assert.deepEqual(codexCacheHeaders(cacheSessionId), {
    'session-id': 'sess-codex',
    'thread-id': 'sess-codex',
    'x-client-request-id': 'sess-codex',
  })
})

test('Codex cache strips session_id after copying onto prompt_cache_key', () => {
  const onlySession = applyCodexCache({ model: 'gpt-5.6-terra', session_id: 'sess-from-dsh' })
  assert.equal(onlySession.payload.prompt_cache_key, 'sess-from-dsh')
  assert.equal(Object.hasOwn(onlySession.payload, 'session_id'), false)
  assert.equal(onlySession.cacheSessionId, 'sess-from-dsh')

  const both = applyCodexCache({
    model: 'gpt-5.6-terra',
    session_id: 'sess-from-dsh',
    prompt_cache_key: 'pck-keep',
  })
  assert.equal(both.payload.prompt_cache_key, 'pck-keep')
  assert.equal(Object.hasOwn(both.payload, 'session_id'), false)
  assert.equal(both.cacheSessionId, 'pck-keep')

  const neither = { model: 'gpt-5.6-terra', instructions: 'You are DSH.' }
  const { payload, cacheSessionId } = applyCodexCache(neither)
  assert.deepEqual(payload, neither)
  assert.equal(cacheSessionId, undefined)
  assert.equal(Object.hasOwn(payload, 'prompt_cache_key'), false)
  assert.equal(Object.hasOwn(payload, 'session_id'), false)
})

test('Grok cache writes prompt_cache_key and grok-build headers, never Codex headers', () => {
  const { payload, cacheSessionId } = applyGrokCache({ session_id: 'sess-grok', prompt_cache_retention: '24h' })
  assert.equal(payload.prompt_cache_key, 'sess-grok')
  assert.equal(Object.hasOwn(payload, 'session_id'), false)
  assert.equal(Object.hasOwn(payload, 'prompt_cache_retention'), false)
  const headers = grokAffinityHeaders(cacheSessionId, { reqId: 'req-1', model: 'grok-4.6' })
  assert.deepEqual(headers, {
    'x-grok-conv-id': 'sess-grok',
    'x-grok-session-id': 'sess-grok',
    'x-grok-req-id': 'req-1',
    'x-grok-model-override': 'grok-4.6',
  })
  assert.equal(Object.hasOwn(headers, 'session-id'), false)
  assert.equal(Object.hasOwn(headers, 'thread-id'), false)
  assert.equal(Object.hasOwn(headers, 'x-client-request-id'), false)

  const retry = grokAffinityHeaders(cacheSessionId, { reqId: 'req-1', retryAttempt: 2 })
  assert.equal(retry['x-grok-req-id'], 'req-1')
  assert.equal(retry['x-grok-transient-retry'], '2')

  const neither = applyGrokCache({ model: 'grok-4.6' })
  assert.equal(neither.payload.prompt_cache_key, GROK_STABLE_SESSION)
  assert.equal(neither.cacheSessionId, GROK_STABLE_SESSION)
})

test('Grok pins the first system blob per conv and returns extras for suffix parking', () => {
  resetGrokSystemPins()
  const first = pinGrokSystemPrefix('sess-a', 'You are DSH.')
  assert.deepEqual(first, { pinned: 'You are DSH.', extra: '' })
  const extra = pinGrokSystemPrefix('sess-a', 'You are DSH.\n\nCurrent runtime context.')
  assert.equal(extra.pinned, 'You are DSH.')
  assert.equal(extra.extra, 'Current runtime context.')
  const other = pinGrokSystemPrefix('sess-b', 'Other agent.')
  assert.deepEqual(other, { pinned: 'Other agent.', extra: '' })
  const fallback = pinGrokSystemPrefix(GROK_STABLE_SESSION, 'You are DSH.\n\nSnapshot.')
  assert.deepEqual(fallback, { pinned: 'You are DSH.\n\nSnapshot.', extra: '' })
  resetGrokSystemPins()
})

test('GLM cache strips Codex/Grok fields and pins user', () => {
  resetGlmSystemPins()
  const { payload, cacheSessionId } = applyGlmCache({
    session_id: 'sess-glm',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    prompt_cache_options: { mode: 'explicit' },
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
  })
  assert.equal(cacheSessionId, 'sess-glm')
  assert.equal(payload.user, 'sess-glm')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.prompt_cache_options, undefined)
  resetGlmSystemPins()
})

test('GLM Anthropic cache pins metadata.user_id and first-block cache_control', () => {
  resetGlmSystemPins()
  const { payload, cacheSessionId } = applyGlmAnthropicCache({
    session_id: 'sess-glm-anth',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    system: 'You are GLM.',
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(cacheSessionId, 'sess-glm-anth')
  assert.equal(payload.metadata.user_id, 'sess-glm-anth')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.deepEqual(payload.system, [
    { type: 'text', text: 'You are GLM.', cache_control: { type: 'ephemeral' } },
  ])
  resetGlmSystemPins()
})

test('Antigravity cache identity is request.sessionId, with a stable fallback', () => {
  assert.equal(antigravitySessionIdOf({ session_id: 'sess-ag' }), 'sess-ag')
  assert.equal(antigravitySessionIdOf({ prompt_cache_key: 'cache-key-9' }), 'cache-key-9')
  assert.equal(antigravitySessionIdOf({}), ANTIGRAVITY_STABLE_SESSION)
  assert.equal(/^-\d+$/.test(antigravitySessionIdOf({})), false)
  assert.equal(antigravitySessionIdOf({ session_id: 'sess-ag', model: 'gemini-3.7-flash-high' }), 'sess-ag')
  assert.equal(
    antigravitySessionIdOf({ model: 'gemini-3.7-flash-high' }),
    `${ANTIGRAVITY_STABLE_SESSION}:gemini-3.7-flash-high`,
  )
  assert.notEqual(
    antigravitySessionIdOf({ model: 'gemini-3.7-flash-high' }),
    antigravitySessionIdOf({ model: 'claude-sonnet-4-6' }),
  )
})

test('Kiro cache identity is conversationId, with a stable fallback', () => {
  resetKiroSystemPins()
  assert.equal(kiroConversationId({ session_id: 'sess-kiro' }), 'sess-kiro')
  assert.equal(kiroConversationId({}), KIRO_STABLE_SESSION)
  assert.equal(/^-\d+$/.test(kiroConversationId({})), false)
  assert.equal(kiroConversationId({ session_id: 'sess-kiro', model: 'glm-5' }), 'sess-kiro:glm-5')
  assert.notEqual(
    kiroConversationId({ model: 'claude-opus-5' }),
    kiroConversationId({ model: 'qwen3-coder-next' }),
  )
  const first = pinKiroSystemPrefix('sess-kiro:glm-5', 'You are DSH.')
  const extra = pinKiroSystemPrefix('sess-kiro:glm-5', 'You are DSH.\nSnapshot')
  assert.equal(first.pinned, 'You are DSH.')
  assert.equal(first.extra, '')
  assert.equal(extra.pinned, 'You are DSH.')
  assert.equal(extra.extra, 'Snapshot')
})

test('Cursor cache identity is conversation_id, never Codex/Grok headers', () => {
  const { payload, cacheSessionId } = applyCursorCache({
    session_id: 'sess-cursor',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    model: 'composer-2',
  })
  assert.equal(cacheSessionId, 'sess-cursor:composer-2')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.deepEqual(cursorCacheHeaders(), {})
  assert.equal(Object.hasOwn(cursorCacheHeaders(), 'session-id'), false)
  assert.equal(Object.hasOwn(cursorCacheHeaders(), 'x-grok-conv-id'), false)
  assert.equal(cursorConversationId({}), CURSOR_STABLE_SESSION)
  assert.equal(cursorConversationId({ session_id: 'sess-cursor', model: 'composer-2' }), cursorConversationId({ session_id: 'sess-cursor', model: 'composer-2' }))
})

test('Ollama cache strips Codex/Grok fields and does not invent a sticky wire id', () => {
  const { payload, cacheSessionId } = applyOllamaCache({
    session_id: 'sess-ollama',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    model: 'gpt-oss:120b',
  })
  assert.equal(cacheSessionId, 'sess-ollama')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.session_id, undefined)
  assert.deepEqual(ollamaCacheHeaders(), {})
  assert.equal(Object.hasOwn(ollamaCacheHeaders(), 'session-id'), false)
  assert.equal(Object.hasOwn(ollamaCacheHeaders(), 'x-grok-conv-id'), false)
  assert.equal(applyOllamaCache({}).cacheSessionId, OLLAMA_STABLE_SESSION)
})

test('Kimi cache strips Codex/Grok fields and does not invent a shard header', () => {
  resetKimiPins()
  const { payload, cacheSessionId } = applyKimiCache({
    session_id: 'sess-kimi',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    model: 'k3',
  })
  assert.equal(cacheSessionId, 'sess-kimi')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.session_id, undefined)
  assert.deepEqual(kimiCacheHeaders(), {})
  assert.equal(Object.hasOwn(kimiCacheHeaders(), 'session-id'), false)
  assert.equal(Object.hasOwn(kimiCacheHeaders(), 'x-grok-conv-id'), false)
  assert.equal(applyKimiCache({}).cacheSessionId, KIMI_STABLE_SESSION)
  resetKimiPins()
})

test('Copilot cache strips Codex/Grok fields and writes X-Interaction-Id', () => {
  resetCopilotPins()
  const { payload, cacheSessionId } = applyCopilotCache({
    session_id: 'sess-copilot',
    prompt_cache_key: 'codex-style',
    prompt_cache_retention: '24h',
    model: 'gpt-4.1',
  })
  assert.equal(cacheSessionId, 'sess-copilot')
  assert.equal(payload.prompt_cache_key, undefined)
  assert.equal(payload.prompt_cache_retention, undefined)
  assert.equal(payload.session_id, undefined)
  assert.deepEqual(copilotCacheHeaders(cacheSessionId), { 'x-interaction-id': 'sess-copilot' })
  assert.equal(Object.hasOwn(copilotCacheHeaders(cacheSessionId), 'session-id'), false)
  assert.equal(Object.hasOwn(copilotCacheHeaders(cacheSessionId), 'x-grok-conv-id'), false)
  assert.equal(applyCopilotCache({}).cacheSessionId, COPILOT_STABLE_SESSION)
  assert.deepEqual(copilotCacheHeaders(), { 'x-interaction-id': COPILOT_STABLE_SESSION })
  resetCopilotPins()
})

// What pi-ai sends once a Completions route has `cacheRetention: 'long'`.
const HOST_ID = 'session-6f1c2a9e-0b7d-4c55-9a43-2e8f7d1b3c60'
const hostBody = (model) => ({
  model,
  messages: [{ role: 'system', content: 'You are DSH.' }, { role: 'user', content: 'hi' }],
  stream: true,
  prompt_cache_key: HOST_ID,
  prompt_cache_retention: '24h',
})

test('Cursor derives the conversation id from prompt_cache_key before deleting it', () => {
  const { payload, cacheSessionId } = applyCursorCache(hostBody('composer-2'))
  assert.equal(cacheSessionId, `${HOST_ID}:composer-2`)
  assert.equal(Object.hasOwn(payload, 'prompt_cache_key'), false)
  assert.equal(Object.hasOwn(payload, 'prompt_cache_retention'), false)
})

test('every Completions family keys on the host session id and sends no prompt_cache_* upstream', () => {
  resetKiroSystemPins()
  resetKimiPins()
  resetCopilotPins()
  resetClinePins()
  const families = {
    cursor: () => applyCursorCache(hostBody('composer-2')),
    ollama: () => applyOllamaCache(hostBody('deepseek-v4.1-flash')),
    kimi: () => applyKimiCache(hostBody('k3')),
    copilot: () => applyCopilotCache(hostBody('gpt-4.1')),
    cline: () => applyClineCache(hostBody('cline-free/deepseek-v4.1-flash')),
    devin: () => applyDevinCache(hostBody('swe-2')),
    // Custom transports build a fresh wire body from the host payload.
    kiro: () => {
      const conversationId = kiroConversationId(hostBody('claude-sonnet-4.5'))
      return { cacheSessionId: conversationId, payload: openaiToKiro(hostBody('claude-sonnet-4.5'), { conversationId }) }
    },
    antigravity: () => {
      const sessionId = antigravitySessionIdOf(hostBody('gemini-3.7-flash-high'))
      return { cacheSessionId: sessionId, payload: openaiToAntigravity(hostBody('gemini-3.7-flash-high'), { projectId: 'p', sessionId }) }
    },
  }
  for (const [family, run] of Object.entries(families)) {
    const { payload, cacheSessionId } = run()
    assert.ok(String(cacheSessionId).includes(HOST_ID), `${family} id ${cacheSessionId}`)
    const wire = JSON.stringify(payload)
    assert.equal(wire.includes('prompt_cache_key'), false, family)
    assert.equal(wire.includes('prompt_cache_retention'), false, family)
  }
  resetKiroSystemPins()
  resetKimiPins()
  resetCopilotPins()
  resetClinePins()
})

// Each family's system prompt as it reaches the wire, via the same id the proxy derives.
const FALLBACK_FAMILIES = {
  kimi: (body) => applyKimiCache(body).payload.messages[0].content,
  copilot: (body) => applyCopilotCache(body).payload.messages[0].content,
  cline: (body) => applyClineCache(body).payload.messages[0].content,
  kiro: (body) => openaiToKiro(body, { conversationId: kiroConversationId(body) })
    .conversationState.history[0].userInputMessage.content,
  cursor: (body) => openaiToCursor(body, { conversationId: applyCursorCache(body).cacheSessionId }).systemPrompt,
  antigravity: (body) => openaiToAntigravity(body, { projectId: 'p', sessionId: antigravitySessionIdOf(body) })
    .request.systemInstruction.parts[0].text,
  devin: (body) => openaiToDevin(body).fields.prompt,
}
const MODELS = {
  kimi: 'k3', copilot: 'gpt-4.1', cline: 'cline-free/deepseek-v4.1-flash', kiro: 'claude-sonnet-4.5',
  cursor: 'composer-2', antigravity: 'gemini-3.7-flash-high', devin: 'swe-2',
}
const resetAllPins = () => {
  resetKimiPins(); resetCopilotPins(); resetClinePins(); resetKiroSystemPins(); resetCursorSystemPins(); resetAntigravitySystemPins()
}

test('two id-less sessions each keep their own system prompt (fallback ids never pin)', () => {
  resetAllPins()
  for (const [family, systemOf] of Object.entries(FALLBACK_FAMILIES)) {
    const body = (system) => ({
      model: MODELS[family],
      messages: [{ role: 'system', content: system }, { role: 'user', content: 'hi' }],
    })
    // The last one extends A: a fallback pin would park it and serve A's head.
    for (const system of ['You are session A.', 'You are session B.', 'You are session A.', 'You are session A. Also C.']) {
      assert.ok(String(systemOf(body(system))).includes(system), `${family}: ${system}`)
    }
  }
  resetAllPins()
})

// DSH's session-title request shares the chat's session id. When it pins
// first, the chat must still lead with its own prompt, not the title's.
const TITLE_PROMPT = 'Create a concise title for an AI coding-assistant session.'
const MAIN_PROMPT = 'You are an AI agent powered by DeepSeek Harness.\n\nYour working directory is /repo.'
const { devin: _devinPinsNothing, ...PINNING_FAMILIES } = {
  ...FALLBACK_FAMILIES,
  glm: (body) => applyGlmCache(body).payload.messages[0].content,
  'glm-anthropic': (body) => applyGlmAnthropicCache({ ...body, system: body.messages[0].content, messages: body.messages.slice(1) })
    .payload.system[0].text,
}
for (const [family, systemOf] of Object.entries(PINNING_FAMILIES)) {
  test(`${family}: a session-title prompt pinned first does not lead the chat`, () => {
    resetAllPins(); resetGlmSystemPins()
    const body = (system) => ({
      model: MODELS[family] ?? 'glm-5.3',
      prompt_cache_key: HOST_ID,
      messages: [{ role: 'system', content: system }, { role: 'user', content: 'tps' }],
    })
    assert.ok(String(systemOf(body(TITLE_PROMPT))).includes(TITLE_PROMPT))
    for (let step = 0; step < 2; step += 1) {
      const lead = String(systemOf(body(MAIN_PROMPT)))
      assert.ok(lead.includes(MAIN_PROMPT) && !lead.includes(TITLE_PROMPT), `${family} step ${step}: ${lead}`)
    }
    resetAllPins(); resetGlmSystemPins()
  })
}

test('fallback predicates match the bare constant and its model-suffixed form only', () => {
  const cases = {
    kimi: [isKimiFallback, KIMI_STABLE_SESSION],
    copilot: [isCopilotFallback, COPILOT_STABLE_SESSION],
    cline: [isClineFallback, CLINE_STABLE_SESSION],
    kiro: [isKiroFallback, KIRO_STABLE_SESSION],
    cursor: [isCursorFallback, CURSOR_STABLE_SESSION],
    antigravity: [isAntigravityFallback, ANTIGRAVITY_STABLE_SESSION],
    devin: [isDevinFallback, 'dsh-devin'],
  }
  for (const [family, [isFallback, constant]] of Object.entries(cases)) {
    assert.equal(isFallback(constant), true, family)
    assert.equal(isFallback(`${constant}:some-model`), true, family)
    assert.equal(isFallback(undefined), true, family)
    assert.equal(isFallback(HOST_ID), false, family)
    assert.equal(isFallback(`${HOST_ID}:some-model`), false, family)
    assert.equal(isFallback(`${constant}x`), false, family)
  }
  // The resolvers' own fallbacks are what the predicates recognise.
  assert.equal(isKiroFallback(kiroConversationId({ model: 'claude-sonnet-4.5' })), true)
  assert.equal(isCursorFallback(cursorConversationId({ model: 'composer-2' })), true)
  assert.equal(isAntigravityFallback(antigravitySessionIdOf({ model: 'gemini-3.7-flash-high' })), true)
  assert.equal(isDevinFallback(devinConversationId({ model: 'swe-2' })), true)
  assert.equal(isKimiFallback(applyKimiCache({}).cacheSessionId), true)
  assert.equal(isCopilotFallback(applyCopilotCache({}).cacheSessionId), true)
  assert.equal(isClineFallback(applyClineCache({}).cacheSessionId), true)
})

// Firewall: no clock or RNG in a session-id position — in any cache.ts nor in
// any module exporting a request-header builder (GLM's per-process random
// `x-session-id` lived in glm/index.ts).
const RANDOM = /Date\.now|Math\.random|randomUUID|randomBytes|randomHex/
const ID_WORD = /session[-_]?id|conversation[-_]?id|conv[-_]id|cascade|interaction[-_]id|task[-_]id|thread[-_]id|prompt_cache_key/i
const ID_CONST = /[A-Z][A-Z_]*SESSION/
const inSessionPosition = (line) => RANDOM.test(line) && (ID_WORD.test(line) || ID_CONST.test(line))

test('firewall: no Date.now / Math.random / randomUUID / randomBytes in session-id positions', () => {
  assert.equal(inSessionPosition("const GLM_PROCESS_SESSION_ID = `sess_${randomBytes(12).toString('hex')}`"), true)
  assert.equal(inSessionPosition("conversationId: `-${Date.now()}`,"), true)
  assert.equal(inSessionPosition("'x-grok-req-id': extra.reqId ? extra.reqId : randomUUID(),"), false)
  const roots = ['src/oauth', 'src/apikey']
  const files = roots.flatMap((root) => readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => readdirSync(`${root}/${entry.name}`)
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `${root}/${entry.name}/${name}`)))
  const scanned = files.filter((file) => file.endsWith('/cache.ts')
    || /export (async )?function \w*Headers\(/.test(readFileSync(file, 'utf8')))
  assert.ok(scanned.includes('src/oauth/glm/index.ts'))
  assert.ok(scanned.length >= 20, `scanned ${scanned.length}`)
  const hits = scanned.flatMap((file) => readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ''))
    .split('\n')
    .map((line, index) => ({ at: `${file}:${index + 1}`, code: line.replace(/(^|[^:'"`])\/\/.*$/, '$1') }))
    .filter(({ code }) => inSessionPosition(code))
    .map(({ at }) => at))
  assert.deepEqual(hits, [])
})
