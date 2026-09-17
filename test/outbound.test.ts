import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  OUTBOUND_PROXY_FILE,
  createOutboundFetch,
  createOutboundSession,
  defaultOutboundPrefs,
  envProxyUrl,
  normalizeOutboundPrefs,
  normalizeProxyUrl,
  outboundProxyPath,
  proxySource,
  readOutboundPrefs,
  redactProxyUrl,
  resolveProxyUrl,
  shouldBypassProxy,
  writeOutboundPrefs,
} from '../lib/utils/outbound.js'

test('normalizeProxyUrl accepts http(s) and host:port, rejects socks',
  () => {
    assert.equal(normalizeProxyUrl('http://127.0.0.1:7890'), 'http://127.0.0.1:7890')
    assert.equal(normalizeProxyUrl('https://proxy.example:8443'), 'https://proxy.example:8443')
    assert.equal(normalizeProxyUrl('127.0.0.1:7890'), 'http://127.0.0.1:7890')
    assert.equal(normalizeProxyUrl('  http://user:pass@10.0.0.2:8080  '), 'http://user:pass@10.0.0.2:8080')
    assert.equal(normalizeProxyUrl('socks5://127.0.0.1:7891'), undefined)
    assert.equal(normalizeProxyUrl(''), undefined)
    assert.equal(normalizeProxyUrl('   '), undefined)
    assert.equal(normalizeProxyUrl(undefined), undefined)
  })

test('resolveProxyUrl prefers config, then settings, then env', () => {
  const env = { HTTPS_PROXY: 'http://env:9', HTTP_PROXY: 'http://http-env:8' }
  assert.equal(resolveProxyUrl('http://cfg:1', 'http://set:2', env), 'http://cfg:1')
  assert.equal(resolveProxyUrl('', 'http://set:2', env), 'http://set:2')
  assert.equal(resolveProxyUrl('', '', env), 'http://env:9')
  assert.equal(resolveProxyUrl('', '', { HTTP_PROXY: 'http://http-env:8' }), 'http://http-env:8')
  assert.equal(resolveProxyUrl('', '', {}), undefined)
  assert.equal(proxySource('http://cfg:1', 'http://set:2', env), 'config')
  assert.equal(proxySource('', 'http://set:2', env), 'settings')
  assert.equal(proxySource('', '', env), 'env')
  assert.equal(proxySource('', '', {}), 'off')
})

test('envProxyUrl reads HTTPS_PROXY before HTTP_PROXY and ALL_PROXY', () => {
  assert.equal(envProxyUrl({ HTTPS_PROXY: 'http://a:1', HTTP_PROXY: 'http://b:2' }), 'http://a:1')
  assert.equal(envProxyUrl({ https_proxy: 'http://a:1' }), 'http://a:1')
  assert.equal(envProxyUrl({ ALL_PROXY: 'http://c:3' }), 'http://c:3')
})

test('shouldBypassProxy always skips loopback and honors NO_PROXY', () => {
  assert.equal(shouldBypassProxy('http://127.0.0.1:8318/v1/responses'), true)
  assert.equal(shouldBypassProxy('http://localhost:8318/health'), true)
  assert.equal(shouldBypassProxy('http://[::1]/'), true)
  assert.equal(shouldBypassProxy('https://api.x.ai/v1/responses', []), false)
  assert.equal(shouldBypassProxy('https://api.x.ai/v1/responses', ['api.x.ai']), true)
  assert.equal(shouldBypassProxy('https://foo.example.com/x', ['.example.com']), true)
  assert.equal(shouldBypassProxy('https://api.openai.com/v1', ['*']), true)
})

test('redactProxyUrl hides userinfo', () => {
  assert.equal(redactProxyUrl('http://127.0.0.1:7890'), 'http://127.0.0.1:7890')
  assert.equal(redactProxyUrl('http://alice:secret@10.0.0.2:8080'), 'http://***@10.0.0.2:8080')
  assert.equal(redactProxyUrl(''), '')
})

test('writeOutboundPrefs round-trips the url', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  const path = outboundProxyPath(dir)
  assert.equal(path.endsWith(OUTBOUND_PROXY_FILE), true)
  const saved = await writeOutboundPrefs(path, { url: 'http://127.0.0.1:7890' })
  assert.deepEqual(saved, { url: 'http://127.0.0.1:7890' })
  const text = await readFile(path, 'utf8')
  assert.equal(JSON.parse(text).url, 'http://127.0.0.1:7890')
  const loaded = await readOutboundPrefs(path)
  assert.deepEqual(loaded, { url: 'http://127.0.0.1:7890' })
})

test('readOutboundPrefs returns defaults when the file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  assert.deepEqual(await readOutboundPrefs(join(dir, 'nope.json')), defaultOutboundPrefs())
  assert.deepEqual(normalizeOutboundPrefs({ url: 1 }), { url: '' })
})

test('createOutboundFetch injects dispatcher except for loopback', async () => {
  const seen = []
  const fakeFetch = async (input, init = {}) => {
    seen.push({ input, dispatcher: init.dispatcher })
    return { ok: true }
  }
  const agent = { kind: 'proxy-agent' }
  const fetchFn = createOutboundFetch({
    proxyUrl: 'http://127.0.0.1:7890',
    env: {},
    fetchFn: fakeFetch,
    agentFor: () => agent,
  })
  await fetchFn('https://api.x.ai/v1/responses', { method: 'POST' })
  await fetchFn('http://127.0.0.1:8318/health')
  assert.equal(seen.length, 2)
  assert.equal(seen[0].dispatcher, agent)
  assert.equal(seen[1].dispatcher, undefined)
})

test('createOutboundSession setUrl persists and rebuilds the agent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  const path = outboundProxyPath(dir)
  const seen = []
  const session = createOutboundSession({
    path,
    env: { HTTPS_PROXY: 'http://env:9' },
    fetchFn: async (input, init = {}) => {
      seen.push(init.dispatcher)
      return { ok: true }
    },
    agentFor: (url) => ({ uri: url }),
  })
  await session.ready
  assert.deepEqual(session.snapshot(), {
    url: 'http://env:9',
    source: 'env',
    configured: true,
  })
  await session.setUrl('http://user:secret@10.0.0.2:8080')
  assert.equal(session.snapshot().source, 'settings')
  assert.equal(session.snapshot().url, 'http://***@10.0.0.2:8080')
  assert.equal((await readOutboundPrefs(path)).url, 'http://user:secret@10.0.0.2:8080')
  await session.fetchFn('https://chatgpt.com/backend-api/codex/responses')
  assert.deepEqual(seen.at(-1), { uri: 'http://user:secret@10.0.0.2:8080' })
  await session.setUrl('')
  assert.equal(session.snapshot().source, 'env')
  await assert.rejects(() => session.setUrl('socks5://127.0.0.1:7891'), /Invalid proxy URL/)
})
