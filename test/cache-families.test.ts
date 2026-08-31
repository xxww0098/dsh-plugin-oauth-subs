import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyCodexCache, codexCacheHeaders, codexCacheSessionId } from '../lib/oauth/codex/cache.js'
import { applyGrokCache, grokAffinityHeaders, grokCacheSessionId } from '../lib/oauth/grok/cache.js'
import { applyGlmCache, glmCacheSessionId, resetGlmSystemPins } from '../lib/oauth/glm/cache.js'
import { antigravityCacheSessionId, antigravitySessionIdOf, ANTIGRAVITY_STABLE_SESSION } from '../lib/oauth/antigravity/cache.js'
import { kiroCacheSessionId, kiroConversationId, KIRO_STABLE_SESSION } from '../lib/oauth/kiro/cache.js'

const dirty = 'session 772f7f3a/foo'

test('each family owns its cache id helper (same clip, separate modules)', () => {
  assert.equal(codexCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(grokCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(glmCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(antigravityCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(kiroCacheSessionId(dirty), 'session-772f7f3a-foo')
  assert.equal(codexCacheSessionId(''), undefined)
  assert.equal(grokCacheSessionId(null), undefined)
})

test('Codex cache writes prompt_cache_key and session-id headers', () => {
  const { payload, cacheSessionId } = applyCodexCache({ session_id: 'sess-codex', prompt_cache_retention: '24h' })
  assert.equal(payload.prompt_cache_key, 'sess-codex')
  assert.deepEqual(codexCacheHeaders(cacheSessionId), {
    'session-id': 'sess-codex',
    'x-client-request-id': 'sess-codex',
  })
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

test('Antigravity cache identity is request.sessionId, with a stable fallback', () => {
  assert.equal(antigravitySessionIdOf({ session_id: 'sess-ag' }), 'sess-ag')
  assert.equal(antigravitySessionIdOf({ prompt_cache_key: 'cache-key-9' }), 'cache-key-9')
  assert.equal(antigravitySessionIdOf({}), ANTIGRAVITY_STABLE_SESSION)
  assert.equal(/^-\d+$/.test(antigravitySessionIdOf({})), false)
})

test('Kiro cache identity is conversationId, with a stable fallback', () => {
  assert.equal(kiroConversationId({ session_id: 'sess-kiro' }), 'sess-kiro')
  assert.equal(kiroConversationId({}), KIRO_STABLE_SESSION)
  assert.equal(/^-\d+$/.test(kiroConversationId({})), false)
})
