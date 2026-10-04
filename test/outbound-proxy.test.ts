import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  OUTBOUND_PROXY_FILE,
  configureOutbound,
  createOutboundSession,
  defaultOutboundPrefs,
  envNoProxy,
  envProxyUrl,
  normalizeOutboundPrefs,
  normalizeProxyUrl,
  outboundFetch,
  outboundProxyFor,
  outboundProxyPath,
  proxySource,
  readOutboundPrefs,
  redactProxyUrl,
  resolveProxyUrl,
  shouldBypassProxy,
  writeOutboundPrefs,
} from '../lib/utils/outbound.js'

// This file must be the first in the process to touch the module-level owner:
// every later test calls configureOutbound, which replaces it. The
// "unconfigured owner goes direct" contract therefore lives HERE — each test
// file is a fresh child process, so a plain import is already unconfigured and
// no cache-busting query-string import is needed (loading the same file under
// two specifiers corrupts V8 coverage attribution for the whole suite).
test('the unconfigured owner sends undici-direct with a node user-agent and no proxy', async (t) => {
  const seen: string[] = []
  const server = createServer((req, res) => {
    seen.push(String(req.headers['user-agent']))
    res.end('ok')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const url = `http://127.0.0.1:${(server.address() as any).port}/`
  assert.equal(await (await outboundFetch(url)).text(), 'ok')
  await outboundFetch(url, { headers: { 'user-agent': 'custom/1' } })
  assert.deepEqual(seen, ['node', 'custom/1'])
  assert.equal(await outboundProxyFor('https://api.x.ai/'), undefined)
})

// --- normalizeProxyUrl ----------------------------------------------------------

test('normalizeProxyUrl rejects unparseable and non-http schemes', () => {
  assert.equal(normalizeProxyUrl('http://'), undefined, 'empty authority does not parse')
  assert.equal(normalizeProxyUrl('://h:1'), undefined)
  assert.equal(normalizeProxyUrl('not a url'), undefined)
  assert.equal(normalizeProxyUrl('ftp://h:1'), undefined, 'only http(s) tunnels')
  assert.equal(normalizeProxyUrl(42), undefined)
  assert.equal(normalizeProxyUrl(null), undefined)
})

test('normalizeProxyUrl defaults a missing scheme to http and keeps IPv6 and case normalized', () => {
  assert.equal(normalizeProxyUrl('proxy:8080'), 'http://proxy:8080')
  assert.equal(normalizeProxyUrl('user@host:8080'), 'http://user@host:8080')
  assert.equal(normalizeProxyUrl('http://[::1]:7890'), 'http://[::1]:7890')
  assert.equal(normalizeProxyUrl('HTTP://P.Example:1'), 'http://p.example:1')
  assert.equal(normalizeProxyUrl('  http://h:1  '), 'http://h:1')
})

test('normalizeProxyUrl decodes userinfo and drops an empty password', () => {
  assert.equal(normalizeProxyUrl('http://alice@10.0.0.2:8080'), 'http://alice@10.0.0.2:8080', 'username only')
  assert.equal(normalizeProxyUrl('http://alice:@10.0.0.2:8080'), 'http://alice@10.0.0.2:8080', 'empty password is not kept as a bare colon')
  assert.equal(normalizeProxyUrl('http://a%40b:p%40ss@10.0.0.2:8080'), 'http://a@b:p@ss@10.0.0.2:8080', 'percent-escapes decode')
})

// --- env parsing ----------------------------------------------------------------

test('envProxyUrl resolves the first set variable, then normalizes it once', () => {
  // First-truthy variable wins the whole chain: an unusable HTTPS_PROXY
  // suppresses a set HTTP_PROXY instead of falling through (current contract).
  assert.equal(envProxyUrl({ HTTPS_PROXY: 'socks5://h:1', HTTP_PROXY: 'http://b:2' }), undefined, 'an unusable HTTPS_PROXY wins and yields nothing')
  assert.equal(envProxyUrl({ HTTPS_PROXY: 'http://', HTTP_PROXY: 'http://ok:1' }), undefined, 'a hostless HTTPS_PROXY wins and yields nothing')
  assert.equal(envProxyUrl({ http_proxy: 'http://lc:1' }), 'http://lc:1')
  assert.equal(envProxyUrl({ ALL_PROXY: 'dead beef' }), undefined, 'invalid ALL_PROXY yields nothing')
  assert.equal(envProxyUrl({ all_proxy: 'http://all-lc:3' }), 'http://all-lc:3')
  assert.equal(envProxyUrl({}), undefined)
})

test('envNoProxy splits on commas and whitespace, drops blanks, NO_PROXY over no_proxy', () => {
  assert.deepEqual(envNoProxy({ NO_PROXY: 'a.com, b.com' }), ['a.com', 'b.com'])
  assert.deepEqual(envNoProxy({ NO_PROXY: 'a.com\tb.com  c.com' }), ['a.com', 'b.com', 'c.com'])
  assert.deepEqual(envNoProxy({ NO_PROXY: '  ,, , ' }), [])
  assert.deepEqual(envNoProxy({ NO_PROXY: '' }), [])
  assert.deepEqual(envNoProxy({ no_proxy: 'x.com' }), ['x.com'])
  assert.deepEqual(envNoProxy({ NO_PROXY: 'a.com', no_proxy: 'x.com' }), ['a.com'])
})

// --- precedence -----------------------------------------------------------------

test('an invalid config or settings value falls through to the next source', () => {
  const env = { HTTPS_PROXY: 'http://e:1' }
  assert.equal(resolveProxyUrl('socks5://c:1', 'http://s:2', env), 'http://s:2')
  assert.equal(proxySource('socks5://c:1', 'http://s:2', env), 'settings')
  assert.equal(resolveProxyUrl('', 'http://', env), 'http://e:1')
  assert.equal(proxySource('', 'http://', env), 'env')
  assert.equal(resolveProxyUrl('', 'http://s:2', env), 'http://s:2', 'settings beats env')
  assert.equal(resolveProxyUrl(undefined, undefined, {}), undefined)
  // A bare word is a valid http hostname after scheme-defaulting; only an
  // unnormalizable scheme falls all the way through to off.
  assert.equal(proxySource('nope', '', {}), 'config')
  assert.equal(proxySource('socks5://x:1', '', {}), 'off')
})

// --- NO_PROXY matching ----------------------------------------------------------

test('shouldBypassProxy accepts Request-like and URL targets and bypasses unparseable ones', () => {
  assert.equal(shouldBypassProxy({ url: 'https://api.x.ai/x' }, []), false, 'Request-like object with .url')
  assert.equal(shouldBypassProxy({ url: 'http://localhost:1/' }, []), true)
  assert.equal(shouldBypassProxy(new URL('https://api.x.ai/x'), []), false, 'URL instance stringifies')
  assert.equal(shouldBypassProxy('not a url', []), true, 'an unparseable target never goes through the proxy')
  assert.equal(shouldBypassProxy({ toString() { throw new Error('no') } }, []), true)
})

test('shouldBypassProxy suffix rules match whole labels, stay case-insensitive, and skip blank entries', () => {
  assert.equal(shouldBypassProxy('http://api.localhost:1/', []), true, '.localhost subdomain is loopback')
  assert.equal(shouldBypassProxy('http://LOCALHOST:1/', []), true)
  assert.equal(shouldBypassProxy('http://0.0.0.0/', []), true)
  assert.equal(shouldBypassProxy('https://foo.example.com/', ['example.com']), true, 'a bare rule matches subdomains')
  assert.equal(shouldBypassProxy('https://deep.a.example.com/', ['.example.com']), true, 'a dot rule matches any depth')
  assert.equal(shouldBypassProxy('https://fooexample.com/', ['example.com']), false, 'no partial-label match')
  assert.equal(shouldBypassProxy('https://EXAMPLE.com/', ['example.com']), true)
  assert.equal(shouldBypassProxy('https://x.example.com/', ['  ', 'example.com']), true, 'blank entries are skipped')
  assert.equal(shouldBypassProxy('https://api.x.ai/', ['*.x.ai']), false, 'no glob support beyond exact *')
})

// --- redaction ------------------------------------------------------------------

test('redactProxyUrl masks any userinfo and blanks unusable input', () => {
  assert.equal(redactProxyUrl('http://alice@10.0.0.2:8080'), 'http://***@10.0.0.2:8080')
  assert.equal(redactProxyUrl('https://u:p@p.example:8443'), 'https://***@p.example:8443')
  assert.equal(redactProxyUrl('http://:pw@10.0.0.2:8080'), 'http://10.0.0.2:8080', 'password-only userinfo never survives normalization')
  assert.equal(redactProxyUrl('socks5://h:1'), '')
  assert.equal(redactProxyUrl(undefined), '')
})

// --- prefs files ----------------------------------------------------------------

test('normalizeOutboundPrefs trims, tolerates junk, and writeOutboundPrefs round-trips', async () => {
  assert.deepEqual(normalizeOutboundPrefs(null), { url: '' })
  assert.deepEqual(normalizeOutboundPrefs({}), { url: '' })
  assert.deepEqual(normalizeOutboundPrefs({ url: '  http://p:1  ' }), { url: 'http://p:1' })
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-outbound-'))
  const path = outboundProxyPath(dir)
  assert.ok(path.endsWith(join(dir, OUTBOUND_PROXY_FILE)))
  const saved = await writeOutboundPrefs(path, { url: '  http://127.0.0.1:7890  ' })
  assert.deepEqual(saved, { url: 'http://127.0.0.1:7890' }, 'saved value is normalized')
  assert.equal(await readFile(path, 'utf8'), '{"url":"http://127.0.0.1:7890"}\n')
  assert.deepEqual(await readOutboundPrefs(path), { url: 'http://127.0.0.1:7890' })
})

test('readOutboundPrefs falls back to defaults on unreadable or malformed files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-outbound-'))
  const bad = join(dir, 'bad.json')
  await writeFile(bad, '{nope', 'utf8')
  assert.deepEqual(await readOutboundPrefs(bad), defaultOutboundPrefs(), 'broken JSON')
  await writeFile(bad, '[1,2]', 'utf8')
  assert.deepEqual(await readOutboundPrefs(bad), { url: '' }, 'non-object JSON')
  const asDir = join(dir, 'as-dir.json')
  await mkdir(asDir)
  assert.deepEqual(await readOutboundPrefs(asDir), defaultOutboundPrefs(), 'a directory is unreadable')
})

// --- request input shapes -------------------------------------------------------

test('requestUrl accepts strings, Request-like .url objects, URL instances, and hostile toStrings', async () => {
  const seen: any[] = []
  const session = createOutboundSession({
    env: {},
    fetchFn: async (input: any, init: any = {}) => {
      seen.push({ input, init })
      return { ok: true }
    },
  })
  await session.ready
  await session.request('http://127.0.0.1:1/x')
  await session.request({ url: 'https://obj.example/x', headers: { 'x-a': '1' } })
  await session.request(new URL('http://127.0.0.1:2/y'))
  await session.request({ toString() { throw new Error('no string for you') } })
  assert.equal(seen.length, 4)
  assert.ok(seen.every((call) => call.init.dispatcher), 'every direct call carries the direct dispatcher')
  const headers = seen[1].init.headers
  assert.equal(headers.get('x-a'), '1', 'input.headers are the fallback when init has none')
  assert.equal(headers.get('user-agent'), 'node')
  await session.request('http://127.0.0.1:3/z', { headers: { 'user-agent': 'keep/2' } })
  assert.equal(seen[4].init.headers.get('user-agent'), 'keep/2', 'an explicit user-agent is never overridden')
  await session.close()
})

// --- proxied failures and telemetry ---------------------------------------------

test('a proxied failure is wrapped with the redacted via-url unless the caller already aborted', async () => {
  const agent = { uri: 'stub' }
  let mode = 'fail'
  const session = createOutboundSession({
    configUrl: 'http://127.0.0.1:7890',
    env: {},
    agentFor: () => agent,
    fetchFn: async () => {
      if (mode === 'ok') return { ok: true }
      throw new TypeError('wire dead')
    },
  })
  await session.ready
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(
    () => session.request('https://chatgpt.com/x', { signal: aborted.signal }),
    (error: any) => error instanceof TypeError && error.message === 'wire dead',
    'an aborted caller gets the original error, not the wrapper',
  )
  await assert.rejects(
    () => session.request('https://chatgpt.com/x'),
    /^Error: outbound proxy unavailable: wire dead via http:\/\/127\.0\.0\.1:7890$/,
  )
  assert.match(session.snapshot().error ?? '', /wire dead via http:\/\/127\.0\.0\.1:7890/)
  assert.equal(session.snapshot().url, 'http://127.0.0.1:7890', 'the snapshot stays redacted')
  mode = 'ok'
  assert.equal((await session.request('https://chatgpt.com/x')).ok, true)
  assert.equal(session.snapshot().error, undefined, 'a later success clears the failure')
  await session.close()
})

test('setUrl leaves file and state untouched when persisting fails', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-outbound-'))
  const path = outboundProxyPath(dir)
  await writeOutboundPrefs(path, { url: 'http://127.0.0.1:7890' })
  const dispatchers: any[] = []
  const session = createOutboundSession({
    path,
    env: {},
    agentFor: (url: string) => ({ uri: url }),
    fetchFn: async (_input: any, init: any = {}) => {
      dispatchers.push(init.dispatcher)
      return { ok: true }
    },
  })
  await session.ready
  const before = session.snapshot()
  // Replace the prefs file with a directory so the temp-file rename fails.
  await rm(path)
  await mkdir(path)
  await assert.rejects(
    () => session.setUrl('http://10.0.0.2:8080'),
    (error: any) => ['EISDIR', 'ENOTDIR', 'EPERM'].includes(error?.code),
  )
  assert.deepEqual(session.snapshot(), before, 'state is exactly what it was')
  assert.equal((await readOutboundPrefs(join(dir, OUTBOUND_PROXY_FILE))).url, '', 'the directory was not turned into prefs')
  await session.request('https://chatgpt.com/backend-api/codex/models')
  assert.deepEqual(dispatchers.at(-1), { uri: 'http://127.0.0.1:7890' }, 'the old agent is still the active one')
  await session.close()
})

test('agent close failures during a swap are swallowed, not surfaced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-outbound-'))
  const path = outboundProxyPath(dir)
  await writeOutboundPrefs(path, { url: 'http://127.0.0.1:7890' })
  const session = createOutboundSession({
    path,
    env: {},
    agentFor: (url: string) => ({
      uri: url,
      close: url.includes('7890') ? async () => { throw new Error('close boom') } : async () => {},
    }),
    fetchFn: async () => ({ ok: true }),
  })
  await session.ready
  await session.setUrl('http://10.0.0.2:8080')
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve))
  assert.equal(session.snapshot().url, 'http://10.0.0.2:8080', 'the swap completed despite the old agent refusing to close')
  await session.close()
})

// --- module-level owner wiring --------------------------------------------------

test('configureOutbound routes per host and keeps the proxy even while prefs load', async () => {
  const agent = { uri: 'stub' }
  const seen: any[] = []
  const session = configureOutbound({
    configUrl: 'http://127.0.0.1:7890',
    env: { NO_PROXY: 'skip.example,.nested.org' },
    agentFor: () => agent,
    fetchFn: async (input: any, init: any = {}) => {
      seen.push({ input: String(input?.url ?? input), init })
      return { ok: true }
    },
  })
  assert.equal(await outboundProxyFor('https://api.x.ai/v1/responses'), 'http://127.0.0.1:7890')
  assert.equal(await outboundProxyFor('https://skip.example/x'), undefined, 'exact NO_PROXY entry')
  assert.equal(await outboundProxyFor('https://deep.nested.org/y'), undefined, 'dot NO_PROXY rule')
  assert.equal(await outboundProxyFor('http://localhost:1/'), undefined, 'loopback never tunnels')
  assert.equal(await outboundProxyFor(''), undefined, 'an empty target goes direct')
  assert.equal(await outboundProxyFor(undefined), undefined)
  assert.equal(await outboundProxyFor('not a url'), undefined, 'an unparseable target goes direct')
  assert.equal((await outboundFetch('https://chatgpt.com/x', { headers: { 'x-q': '1' } })).ok, true)
  assert.equal(seen.at(-1).input, 'https://chatgpt.com/x')
  assert.equal(seen.at(-1).init.dispatcher, agent, 'external hosts ride the proxy agent')
  assert.equal(seen.at(-1).init.headers.get('x-q'), '1')
  await session.close()
  await assert.rejects(
    () => outboundFetch('https://chatgpt.com/x'),
    /^Error: outbound proxy unavailable: closed$/,
    'after close a proxied hop fails loudly instead of going direct',
  )
})
