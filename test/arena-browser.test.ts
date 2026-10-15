import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { arenaChromePaths, fetchArenaWithChrome } from '../lib/utils/arena-browser.js'
import { ARENA_LEADERBOARD_URL } from '../lib/utils/arena.js'

const snapshot = {
  lastUpdated: '2026-10-13T22:00:00Z', totalSessions: 12, modelCount: 1,
  rows: [{ model: '模型 A', contenderName: 'a', avgScore: { value: .2, ci: .01 }, sessions: 12,
    signalScores: { bash_reliability_no_prereq: .3 }, signalCi: { bash_reliability_no_prereq: .02 } }],
}
const costs = { entries: [{ contenderName: 'a', totalSampleCount: 100, pricedSampleCount: 100, medianUsd: .5, p25Usd: .1, p95Usd: 1,
  outputMtokPerTask: { totalSampleCount: 100, tokenedSampleCount: 100, medianMtok: .04, p25Mtok: .01, p95Mtok: .08 } }] }
const flight = JSON.stringify({ snapshot, costStats: costs })
const rscResponse = (text = flight) => new Response(text, { headers: { 'content-type': 'text/x-component; charset=utf-8' } })

function fakeChrome(mode = 'good', fetchImpl: (input: string, init: any) => Promise<Response> = async () => rscResponse(), resourceHtml = '') {
  let profile = ''
  let currentUrl = ARENA_LEADERBOARD_URL
  const navigations: string[] = []
  const resourceReads: string[] = []
  let loaderId = 'initial'
  let nextLoader = ''
  let pendingTreeReads = 0
  let verificationFrames = 0
  const document = {
    readyState: 'complete', title: 'Agent Arena Leaderboard', querySelector: () => null,
    get documentElement(): never { throw new Error('Do not read page HTML to collect a board') },
  }
  const child: any = new EventEmitter()
  child.pid = 123
  child.exitCode = null
  child.signalCode = null
  child.stdio = [null, null, null, new PassThrough(), new PassThrough()]
  child.kill = signal => { child.signalCode = signal; child.emit('exit'); return true }
  const spawnImpl: any = (_bin, args, options) => {
    profile = args.find(arg => arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length)
    assert.equal(existsSync(profile), true)
    assert.ok(args.includes('--remote-debugging-pipe'))
    assert.ok(!args.includes('--headless') && !args.includes('--disable-web-security'))
    assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'])
    return child
  }
  child.stdio[3].on('data', async chunk => {
    const message = JSON.parse(String(chunk).replace(/\0$/, ''))
    if (mode === 'closed') { queueMicrotask(() => child.kill('SIGTERM')); return }
    if (mode === 'error') { queueMicrotask(() => child.emit('error', new Error('spawn failed'))); return }
    if (mode === 'timeout') return
    if (mode === 'malformed') { child.stdio[4].write('not-json\0'); return }
    if (mode === 'target-closed') { child.stdio[4].write(JSON.stringify({ id: message.id, error: { message: 'No session with given id' } }) + '\0'); return }
    let result: any = {}
    if (message.method === 'Target.createTarget') {
      if (message.params.url !== 'about:blank') navigations.push(message.params.url)
      currentUrl = message.params.url
      result = { targetId: 't' }
    }
    if (message.method === 'Target.attachToTarget') result = { sessionId: 's' }
    if (message.method === 'Page.navigate') {
      currentUrl = message.params.url; navigations.push(currentUrl)
      if (mode === 'pending-navigation' && currentUrl.endsWith('/code')) { nextLoader = currentUrl; pendingTreeReads = 0 }
      else loaderId = currentUrl
      result = { loaderId: currentUrl }
      child.stdio[4].write(JSON.stringify({ method: 'Network.responseReceived', sessionId: 's', params: {
        type: 'Document', frameId: 'frame', loaderId: currentUrl, requestId: 'document:' + currentUrl,
        response: { url: currentUrl, status: mode === 'pending-verification' && currentUrl.endsWith('/code') ? 403 : 200, mimeType: 'text/html' },
      } }) + '\0')
      if (mode === 'navigation-error') result = { errorText: 'net::ERR_INTERNET_DISCONNECTED' }
      if (mode === 'challenge-query' && currentUrl.endsWith('/code')) currentUrl += '?__cf_chl_rt_tk=temporary'
    }
    if (message.method === 'Page.getResourceTree' || message.method === 'Page.getFrameTree') {
      result = { frameTree: { frame: { id: 'frame', loaderId, url: mode === 'wrong-frame' && currentUrl.endsWith('/code') ? 'https://example.org/' : currentUrl } } }
      if (mode === 'pending-verification' && currentUrl.endsWith('/code') && ++verificationFrames === 2) {
        loaderId = currentUrl + ':verified'
        child.stdio[4].write(JSON.stringify({ method: 'Network.responseReceived', sessionId: 's', params: {
          type: 'Document', frameId: 'frame', loaderId, requestId: 'document:' + currentUrl,
          response: { url: currentUrl, status: 200, mimeType: 'text/html' },
        } }) + '\0')
      }
      if (nextLoader && ++pendingTreeReads === 2) { loaderId = nextLoader; nextLoader = '' }
      if (mode === 'challenge-query' && currentUrl.includes('?__cf_chl_rt_tk=')) currentUrl = currentUrl.split('?')[0]
    }
    if (message.method === 'Page.getResourceContent' || message.method === 'Network.getResponseBody') {
      if (message.method === 'Page.getResourceContent') {
        assert.equal(message.params.frameId, 'frame')
        assert.equal(message.params.url, currentUrl)
      } else assert.equal(message.params.requestId, 'document:' + currentUrl)
      resourceReads.push(currentUrl)
      const stale = (mode === 'pending-navigation' && loaderId !== currentUrl)
        || (mode === 'cached-challenge' && currentUrl !== ARENA_LEADERBOARD_URL && message.method === 'Page.getResourceContent')
      const html = stale ? '<html>stale challenge response</html>' : resourceHtml
      result = { [message.method === 'Network.getResponseBody' ? 'body' : 'content']: Buffer.from(html).toString('base64'), base64Encoded: true }
    }
    if (message.method === 'Runtime.evaluate') {
      try {
        const value = runInNewContext(message.params.expression, { location: { href: currentUrl }, document, fetch: fetchImpl, AbortSignal, URL })
        result = { result: { value: message.params.awaitPromise ? await value : value } }
      } catch (error) {
        result = { exceptionDetails: { text: 'Uncaught', exception: { description: String(error) } } }
      }
    }
    // UTF-8 and NUL-delimited messages may arrive across multiple pipe reads.
    const bytes = Buffer.from(JSON.stringify({ id: message.id, result }) + '\0')
    for (let i = 0; i < bytes.length; i += 7) child.stdio[4].write(bytes.subarray(i, i + 7))
  })
  return { spawnImpl, child, document, navigations, resourceReads, profile: () => profile }
}

test('Chrome paths cover supported installations without a shell command', () => {
  assert.ok(arenaChromePaths('darwin')[0].startsWith('/Applications/Google Chrome.app/'))
  assert.deepEqual(arenaChromePaths('win32', { LOCALAPPDATA: 'C:\\Users\\A B\\AppData\\Local' }),
    ['C:\\Users\\A B\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'])
  assert.ok(arenaChromePaths('linux').includes('/usr/bin/google-chrome'))
  assert.deepEqual(arenaChromePaths('freebsd'), [])
})

test('Chrome fetches four complete RSC boards concurrently without leaving the verification page', async () => {
  const requested: string[] = []
  let release: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const fake = fakeChrome('good', async (input, init) => {
    const url = new URL(input)
    assert.equal(url.origin, 'https://arena.ai')
    assert.equal(url.searchParams.get('_rsc'), '1')
    assert.equal(new Headers(init.headers).get('RSC'), '1')
    assert.equal(new Headers(init.headers).get('accept'), 'text/x-component')
    assert.equal(init.mode, 'same-origin')
    assert.equal(init.credentials, 'same-origin')
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal instanceof AbortSignal)
    requested.push(url.pathname)
    if (requested.length === 4) release()
    await gate // No response can finish unless all four requests are in flight.
    const model = url.pathname.endsWith('/work') ? '模型 Work' : '模型 A'
    return rscResponse(JSON.stringify({ snapshot: { ...snapshot, rows: [{ ...snapshot.rows[0], model }] }, costStats: costs }))
  })
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.deepEqual(Object.keys(boards), ['overall', 'code', 'chat', 'work'])
  assert.equal(boards.overall.rows[0].model, '模型 A')
  assert.equal(boards.work.rows[0].model, '模型 Work')
  assert.equal(boards.code.rows[0].costUsd, .5)
  assert.equal(boards.code.rows[0].costUsd25, .1)
  assert.equal(boards.work.rows[0].tokensM95, .08)
  assert.equal(boards.chat.rows[0].bash, .3)
  assert.deepEqual(requested.sort(), ['/leaderboard/agent', '/leaderboard/agent/chat', '/leaderboard/agent/code', '/leaderboard/agent/work'])
  assert.deepEqual(fake.navigations, [ARENA_LEADERBOARD_URL])
  assert.equal(fake.child.signalCode, 'SIGTERM')
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome rescues challenged RSC requests from navigation resources without reading the DOM', async () => {
  const html = '<script>self.__next_f.push([1,' + JSON.stringify(flight) + '])</script>'
  const fake = fakeChrome('good', async () => new Response('challenge', { status: 403,
    headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' } }), html)
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.deepEqual(Object.keys(boards), ['overall', 'code', 'chat', 'work'])
  assert.equal(boards.overall.rows[0].model, '模型 A')
  assert.equal(boards.code.rows[0].costUsd95, 1)
  assert.equal(boards.work.rows[0].tokensM25, .01)
  assert.deepEqual(fake.navigations, [ARENA_LEADERBOARD_URL, ARENA_LEADERBOARD_URL + '/code', ARENA_LEADERBOARD_URL + '/chat', ARENA_LEADERBOARD_URL + '/work'])
  assert.deepEqual(fake.resourceReads, fake.navigations, 'read each complete navigation response exactly once')
  assert.equal(fake.child.signalCode, 'SIGTERM')
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome reads the current navigation request body rather than a cached challenge for the same URL', async () => {
  const html = '<script>self.__next_f.push([1,' + JSON.stringify(flight) + '])</script>'
  const fake = fakeChrome('cached-challenge', async () => new Response('challenge', { status: 403,
    headers: { 'cf-mitigated': 'challenge' } }), html)
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.equal(boards.code.rows[0].costUsd95, 1)
  assert.equal(boards.chat.rows[0].tokensM, .04)
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome waits through a same-page Cloudflare token URL until the clean URL is restored', async () => {
  const html = '<script>self.__next_f.push([1,' + JSON.stringify(flight) + '])</script>'
  const fake = fakeChrome('challenge-query', async input => new URL(input).pathname.endsWith('/code')
    ? new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) : rscResponse(), html)
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.equal(boards.code.rows[0].costUsd, .5)
  assert.deepEqual(fake.resourceReads, [ARENA_LEADERBOARD_URL + '/code'])
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome waits for a successful document response even after the challenge title disappears', async () => {
  const html = '<script>self.__next_f.push([1,' + JSON.stringify(flight) + '])</script>'
  const fake = fakeChrome('pending-verification', async input => new URL(input).pathname.endsWith('/code')
    ? new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) : rscResponse(), html)
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 3000 })
  assert.equal(boards.code.rows[0].costUsd, .5)
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome waits for a new navigation document instead of accepting the previous ready DOM', async () => {
  const html = '<script>self.__next_f.push([1,' + JSON.stringify(flight) + '])</script>'
  const fake = fakeChrome('pending-navigation', async input => new URL(input).pathname.endsWith('/code')
    ? new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) : rscResponse(), html)
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.equal(boards.code.rows[0].costUsd, .5)
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome navigates only challenged categories and keeps successful RSC boards', async () => {
  const fallback = JSON.stringify({ snapshot: { ...snapshot, rows: [{ ...snapshot.rows[0], model: '导航 Code' }] }, costStats: costs })
  const html = '<script>self.__next_f.push([1,' + JSON.stringify(fallback) + '])</script>'
  const fake = fakeChrome('good', async input => new URL(input).pathname.endsWith('/code')
    ? new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } }) : rscResponse(), html)
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.equal(boards.code.rows[0].model, '导航 Code')
  assert.equal(boards.work.rows[0].model, '模型 A')
  assert.deepEqual(fake.navigations, [ARENA_LEADERBOARD_URL, ARENA_LEADERBOARD_URL + '/code'])
  assert.deepEqual(fake.resourceReads, [ARENA_LEADERBOARD_URL + '/code'])
})

for (const [mode, message] of [['navigation-error', /Chrome navigation failed/], ['wrong-frame', /Chrome navigation changed/]] as const) {
  test('Chrome navigation fallback ' + mode + ' fails without returning partial boards', async () => {
    const html = '<script>self.__next_f.push([1,' + JSON.stringify(flight) + '])</script>'
    const fake = fakeChrome(mode, async () => new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge' } }), html)
    await assert.rejects(fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 }), message)
    assert.equal(existsSync(fake.profile()), false)
  })
}

test('Chrome rejects HTML even when an HTTP 200 body contains board-shaped data', async () => {
  const fake = fakeChrome('good', async input => new URL(input).pathname.endsWith('/code')
    ? new Response(flight, { headers: { 'content-type': 'text/html' } }) : rscResponse())
  await assert.rejects(fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 }),
    /code: unexpected content type/)
  assert.equal(existsSync(fake.profile()), false)
})

for (const [label, reply, message] of [
  ['challenge', () => new Response('challenge', { status: 403, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' } }), /code: Cloudflare challenge/],
  ['HTTP failure', () => new Response('unavailable', { status: 503 }), /code: HTTP 503/],
  ['missing costs', () => rscResponse(JSON.stringify({ snapshot })), /costStats missing/],
  ['missing rows', () => rscResponse(JSON.stringify({ snapshot: { ...snapshot, rows: [] }, costStats: costs })), /snapshot rows missing/],
  ['invalid date', () => rscResponse(JSON.stringify({ snapshot: { ...snapshot, lastUpdated: 'invalid' }, costStats: costs })), /invalid snapshot date/],
  ['network failure', () => { throw new TypeError('Failed to fetch') }, /could not fetch Arena RSC data/],
] as const) {
  test('Chrome rejects the entire board set on one category ' + label + ' and cleans up', async () => {
    const fake = fakeChrome('good', async input => new URL(input).pathname.endsWith('/code') ? reply() : rscResponse())
    await assert.rejects(fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 }), message)
    assert.equal(fake.child.signalCode, 'SIGTERM')
    assert.equal(existsSync(fake.profile()), false)
  })
}

test('Chrome cancellation aborts an in-flight RSC batch and cleans up', async () => {
  let started: () => void
  const requestsStarted = new Promise<void>(resolve => { started = resolve })
  let requests = 0
  const fake = fakeChrome('good', async () => {
    if (++requests === 4) started()
    return new Promise<Response>(() => {})
  })
  const abort = new AbortController()
  const result = fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, signal: abort.signal })
  const check = assert.rejects(result, /cancelled/)
  await requestsStarted
  abort.abort()
  await check
  assert.equal(fake.child.signalCode, 'SIGTERM')
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome total timeout also bounds an in-flight RSC batch', async () => {
  let requests = 0
  const fake = fakeChrome('good', async () => { requests++; return new Promise<Response>(() => {}) })
  await assert.rejects(fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 1000 }), /timed out/)
  assert.equal(requests, 4)
  assert.equal(existsSync(fake.profile()), false)
})

test('Chrome waits for a complete challenge page to be verified before fetching data', async () => {
  let titleReads = 0
  const fake = fakeChrome('good', async () => {
    assert.ok(titleReads >= 2, 'do not fetch while the verification page is still challenged')
    return rscResponse()
  })
  Object.defineProperty(fake.document, 'title', {
    get: () => titleReads++ === 0 ? 'Just a moment...' : 'Agent Arena Leaderboard',
  })
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.equal(boards.overall.rows[0].costUsd95, 1)
  assert.equal(existsSync(fake.profile()), false)
})

for (const [mode, message] of [['closed', /Chrome closed/], ['target-closed', /page was closed/], ['error', /Could not start Chrome/], ['malformed', /Invalid Chrome response/], ['timeout', /timed out/]] as const) {
  test('Chrome ' + mode + ' fails promptly and cleans up', async () => {
    const fake = fakeChrome(mode)
    await assert.rejects(fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: mode === 'timeout' ? 30 : 2000 }), message)
    assert.equal(existsSync(fake.profile()), false)
  })
}

test('Chrome cancellation rejects the pending protocol call and cleans up', async () => {
  const fake = fakeChrome('timeout')
  const abort = new AbortController()
  const result = fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, signal: abort.signal })
  const check = assert.rejects(result, /cancelled/)
  setTimeout(() => abort.abort(), 20)
  await check
  assert.equal(existsSync(fake.profile()), false)
})
