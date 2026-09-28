import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  OUTBOUND_PROXY_FILE,
  configureOutbound,
  createOutboundSession,
  defaultOutboundPrefs,
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

test('configureOutbound injects dispatcher except for loopback', async () => {
  const seen = []
  const agent = { kind: 'proxy-agent' }
  const session = configureOutbound({
    configUrl: 'http://127.0.0.1:7890',
    env: {},
    fetchFn: async (input, init: any = {}) => {
      seen.push({ input, dispatcher: init.dispatcher })
      return { ok: true }
    },
    agentFor: () => agent,
  })
  await session.ready
  await outboundFetch('https://api.x.ai/v1/responses', { method: 'POST' })
  await outboundFetch('http://127.0.0.1:8318/health')
  assert.equal(seen.length, 2)
  assert.equal(seen[0].dispatcher, agent)
  assert.ok(seen[1].dispatcher, 'loopback still uses the direct undici Agent')
  assert.notEqual(seen[1].dispatcher, agent)
  assert.equal(await outboundProxyFor('https://api.x.ai/v1/responses'), 'http://127.0.0.1:7890')
  assert.equal(await outboundProxyFor('http://127.0.0.1:8318/health'), undefined)
  await session.close()
})

test('configureOutbound without agentFor resolves ready and fails loudly on a dead proxy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  const session = configureOutbound({
    path: outboundProxyPath(dir),
    env: { HTTPS_PROXY: 'http://127.0.0.1:9' },
  })
  await session.ready
  assert.equal(session.snapshot().configured, true)
  await assert.rejects(
    () => outboundFetch('https://example.invalid/v1/models'),
    /^Error: outbound proxy unavailable: .*ECONNREFUSED via http:\/\/127\.0\.0\.1:9$/,
  )
  assert.match(session.snapshot().error, /ECONNREFUSED/)
  await session.close()
})

test('configureOutbound keeps ready settling when the agent cannot be built', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  const path = outboundProxyPath(dir)
  await writeOutboundPrefs(path, { url: 'http://127.0.0.1:7890' })
  const seen = []
  const session = configureOutbound({
    path,
    env: {},
    fetchFn: async (input) => {
      seen.push(input)
      return { ok: true }
    },
    agentFor: () => {
      throw new Error('boom')
    },
  })
  await session.ready
  assert.equal(session.snapshot().error, 'boom')
  await assert.rejects(() => outboundFetch('https://chatgpt.com/backend-api/codex/models'), /outbound proxy unavailable: boom/)
  await outboundFetch('http://127.0.0.1:8318/health')
  assert.deepEqual(seen, ['http://127.0.0.1:8318/health'])
})

test('configureOutbound setUrl leaves prefs and state alone when the agent cannot be built', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  const path = outboundProxyPath(dir)
  await writeOutboundPrefs(path, { url: 'http://127.0.0.1:7890' })
  const seen = []
  const session = configureOutbound({
    path,
    env: {},
    fetchFn: async (input, init: any = {}) => {
      seen.push(init.dispatcher)
      return { ok: true }
    },
    agentFor: (url) => {
      if (url.includes('10.0.0.9')) throw new Error('cannot build')
      return { uri: url }
    },
  })
  await session.ready
  const before = session.snapshot()
  await assert.rejects(() => session.setUrl('http://10.0.0.9:8080'), /cannot build/)
  assert.deepEqual(session.snapshot(), before)
  assert.equal(await readFile(path, 'utf8'), '{"url":"http://127.0.0.1:7890"}\n')
  await outboundFetch('https://chatgpt.com/backend-api/codex/models')
  assert.deepEqual(seen.at(-1), { uri: 'http://127.0.0.1:7890' })
})

test('configureOutbound setUrl persists and rebuilds the agent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  const path = outboundProxyPath(dir)
  const seen = []
  const session = configureOutbound({
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
  await outboundFetch('https://chatgpt.com/backend-api/codex/responses')
  assert.deepEqual(seen.at(-1), { uri: 'http://user:secret@10.0.0.2:8080' })
  await session.setUrl('')
  assert.equal(session.snapshot().source, 'env')
  await assert.rejects(() => session.setUrl('socks5://127.0.0.1:7891'), /Invalid proxy URL/)
})

test('outboundFetch goes direct through undici before configuration and defaults user-agent to node', async (t) => {
  const { createServer } = await import('node:http')
  const seen = []
  const server = createServer((req, res) => {
    seen.push(req.headers['user-agent'])
    res.end('ok')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  t.after(() => server.close())
  const url = `http://127.0.0.1:${(server.address() as any).port}/`
  // Fresh module instance: nothing has called configureOutbound yet.
  const fresh = await import(`../lib/utils/outbound.js?unconfigured=${Date.now()}`)
  assert.equal(await (await fresh.outboundFetch(url)).text(), 'ok')
  await fresh.outboundFetch(url, { headers: { 'user-agent': 'custom/1' } })
  assert.deepEqual(seen, ['node', 'custom/1'])
  assert.equal(await fresh.outboundProxyFor('https://api.x.ai/'), undefined)
})

test('configureOutbound honors NO_PROXY and waits for saved settings before choosing a route', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'oauth-subs-proxy-'))
  const path = outboundProxyPath(dir)
  await writeOutboundPrefs(path, { url: 'http://127.0.0.1:7890' })
  const seen = []
  const agent = { kind: 'proxy-agent' }
  const session = configureOutbound({
    path,
    env: { NO_PROXY: 'api2.cursor.sh' },
    fetchFn: async (input, init: any = {}) => {
      seen.push(init.dispatcher)
      return { ok: true }
    },
    agentFor: () => agent,
  })
  // No await on ready: the first request must still see the saved proxy.
  await outboundFetch('https://chatgpt.com/backend-api/codex/models')
  await outboundFetch('https://api2.cursor.sh/x')
  assert.equal(seen[0], agent)
  assert.notEqual(seen[1], agent)
  assert.equal(await outboundProxyFor('https://api2.cursor.sh/x'), undefined)
  await session.close()
})

test('outboundFetch keeps an idle connection past undici\'s 4s default, direct and through the proxy', async (t) => {
  const { createServer } = await import('node:http')
  const { connect } = await import('node:net')
  const { setTimeout: sleep } = await import('node:timers/promises')
  const sockets = new Set<any>()
  // Like chatgpt.com / ollama.com: no Keep-Alive response header.
  async function listen(server) {
    server.on('connection', (socket) => sockets.add(socket))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    return (server.address() as any).port
  }
  async function origin() {
    const server = createServer((req, res) => res.end('ok'))
    server.keepAliveTimeout = 0
    let connections = 0
    server.on('connection', () => connections++)
    const port = await listen(server)
    return { server, port, connections: () => connections }
  }
  const direct = await origin()
  const tunneled = await origin()
  const control = await origin()
  // CONNECT proxy that tunnels every host to the tunneled origin, so a
  // non-loopback URL (loopback always bypasses the proxy) reaches it.
  const proxy = createServer()
  proxy.on('connect', (req, client, head) => {
    sockets.add(client)
    const upstream = connect(tunneled.port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      upstream.write(head)
      upstream.pipe(client)
      client.pipe(upstream)
    })
    sockets.add(upstream)
  })
  const proxyPort = await listen(proxy)
  const plain = createOutboundSession({ env: {} })
  const proxied = createOutboundSession({ configUrl: `http://127.0.0.1:${proxyPort}`, env: {} })
  t.after(async () => {
    await Promise.all([plain.close(), proxied.close()])
    for (const socket of sockets) socket.destroy()
    for (const server of [direct.server, tunneled.server, control.server, proxy]) server.close()
  })

  const hit = () => Promise.all([
    plain.request(`http://127.0.0.1:${direct.port}/`, { method: 'POST', body: '{}' }).then((r) => r.text()),
    proxied.request('http://keepalive.example/', { method: 'POST', body: '{}' }).then((r) => r.text()),
    // Global fetch is the control: its 4s default must drop the socket in the same gap.
    fetch(`http://127.0.0.1:${control.port}/`, { method: 'POST', body: '{}' }).then((r) => r.text()),
  ])
  assert.deepEqual(await hit(), ['ok', 'ok', 'ok'])
  await sleep(6000)
  assert.deepEqual(await hit(), ['ok', 'ok', 'ok'])
  assert.equal(control.connections(), 2)
  assert.equal(direct.connections(), 1)
  assert.equal(tunneled.connections(), 1)
})
