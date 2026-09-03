import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCodexCache, codexCacheHeaders, codexCacheSessionId } from '../lib/oauth/codex/cache.js'
import { applyGrokCache, grokAffinityHeaders, grokCacheSessionId } from '../lib/oauth/grok/cache.js'
import { applyGlmAnthropicCache, applyGlmCache, glmCacheSessionId, resetGlmSystemPins } from '../lib/oauth/glm/cache.js'
import { antigravityCacheSessionId, antigravitySessionIdOf, ANTIGRAVITY_STABLE_SESSION } from '../lib/oauth/antigravity/cache.js'
import { kiroCacheSessionId, kiroConversationId, pinKiroSystemPrefix, KIRO_STABLE_SESSION, resetKiroSystemPins } from '../lib/oauth/kiro/cache.js'
import { applyCursorCache, cursorCacheHeaders, cursorCacheSessionId, cursorConversationId, CURSOR_STABLE_SESSION } from '../lib/oauth/cursor/cache.js'

const dirty = 'session 772f7f3a/foo'

test('each family owns its cache id helper (same clip, separate modules)', () => {
  assert.equal(codexCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(grokCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(glmCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(antigravityCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(kiroCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(cursorCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(codexCacheSessionId(''), undefined)
  assert.equal(grokCacheSessionId(null), undefined)
})

test('Codex cache writes prompt_cache_key and session-id headers', () => {
  const { payload, cacheSessionId } = applyCodexCache({ session_id: 'sess-codex', prompt_cache_retention: '24h' })
  assert.equal(payload.prompt_cache_key, 'sess-codex')
  assert.equal(Object.hasOwn(payload, 'session_id'), false)
  assert.deepEqual(codexCacheHeaders(cacheSessionId), {
    'session-id': 'sess-codex',
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

test('Grok cache writes prompt_cache_key and x-grok-conv-id, never Codex headers', () => {
  const { payload, cacheSessionId } = applyGrokCache({ session_id: 'sess-grok' })
  assert.equal(payload.prompt_cache_key, 'sess-grok')
  assert.deepEqual(grokAffinityHeaders(cacheSessionId), { 'x-grok-conv-id': 'sess-grok' })
  assert.equal(Object.hasOwn(grokAffinityHeaders(cacheSessionId), 'session-id'), false)
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
