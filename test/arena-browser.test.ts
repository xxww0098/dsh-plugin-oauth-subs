import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import { test } from 'node:test'
import { arenaChromePaths, fetchArenaWithChrome } from '../lib/utils/arena-browser.js'
import { ARENA_LEADERBOARD_URL } from '../lib/utils/arena.js'

const snapshot = {
  lastUpdated: '2026-10-13T22:00:00Z', totalSessions: 12, modelCount: 1,
  rows: [{ model: '模型 A', contenderName: 'a', avgScore: { value: .2, ci: .01 }, sessions: 12,
    signalScores: { bash_reliability_no_prereq: .3 }, signalCi: { bash_reliability_no_prereq: .02 } }],
}
const costs = { entries: [{ contenderName: 'a', totalSampleCount: 100, pricedSampleCount: 100, medianUsd: .5, p25Usd: .1, p95Usd: 1,
  outputMtokPerTask: { totalSampleCount: 100, tokenedSampleCount: 100, medianMtok: .04, p25Mtok: .01, p95Mtok: .08 } }] }
const html = '<script>self.__next_f.push([1,' + JSON.stringify(JSON.stringify({ snapshot, costStats: costs })) + '])</script>'

function fakeChrome(mode = 'good') {
  let profile = ''
  let currentUrl = ARENA_LEADERBOARD_URL
  let reads = 0
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
  child.stdio[3].on('data', chunk => {
    const message = JSON.parse(String(chunk).replace(/\0$/, ''))
    if (mode === 'closed') { queueMicrotask(() => child.kill('SIGTERM')); return }
    if (mode === 'error') { queueMicrotask(() => child.emit('error', new Error('spawn failed'))); return }
    if (mode === 'timeout') return
    if (mode === 'malformed') { child.stdio[4].write('not-json\0'); return }
    if (mode === 'target-closed') { child.stdio[4].write(JSON.stringify({ id: message.id, error: { message: 'No session with given id' } }) + '\0'); return }
    let result: any = {}
    if (message.method === 'Target.createTarget') result = { targetId: 't' }
    if (message.method === 'Target.attachToTarget') result = { sessionId: 's' }
    if (message.method === 'Page.navigate') currentUrl = message.params.url
    if (message.method === 'Runtime.evaluate') {
      reads++
      const ready = mode !== 'partial' || reads > 1
      const document = ready ? html : '<script>self.__next_f.push([1,' + JSON.stringify(JSON.stringify({ snapshot })) + '])</script>'
      result = { result: { value: JSON.stringify({ url: currentUrl, html: document }) } }
    }
    // UTF-8 and NUL-delimited messages may arrive across multiple pipe reads.
    const bytes = Buffer.from(JSON.stringify({ id: message.id, result }) + '\0')
    for (let i = 0; i < bytes.length; i += 7) child.stdio[4].write(bytes.subarray(i, i + 7))
  })
  return { spawnImpl, child, profile: () => profile, reads: () => reads }
}

test('Chrome paths cover supported installations without a shell command', () => {
  assert.ok(arenaChromePaths('darwin')[0].startsWith('/Applications/Google Chrome.app/'))
  assert.deepEqual(arenaChromePaths('win32', { LOCALAPPDATA: 'C:\\Users\\A B\\AppData\\Local' }),
    ['C:\\Users\\A B\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'])
  assert.ok(arenaChromePaths('linux').includes('/usr/bin/google-chrome'))
  assert.deepEqual(arenaChromePaths('freebsd'), [])
})

test('Chrome reads four complete boards, decodes split pipe frames and cleans its profile', async () => {
  const fake = fakeChrome('partial')
  const boards = await fetchArenaWithChrome({ chromePath: '/fake/chrome', spawnImpl: fake.spawnImpl, timeoutMs: 2000 })
  assert.deepEqual(Object.keys(boards), ['overall', 'code', 'chat', 'work'])
  assert.equal(boards.overall.rows[0].model, '模型 A')
  assert.equal(boards.code.rows[0].costUsd, .5)
  assert.equal(boards.work.rows[0].tokensM95, .08)
  assert.equal(boards.chat.rows[0].bash, .3)
  assert.equal(fake.reads(), 5, 'wait for the costStats chunk before accepting the first board')
  assert.equal(fake.child.signalCode, 'SIGTERM')
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
