import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import { ARENA_CATEGORIES, ARENA_LEADERBOARD_URL, createArenaSource, extractFlightObject, extractFlightTextFromHtml, isArenaChallenge, newestWaybackCapture, parseArenaBoard } from '../lib/utils/arena.js'

const T0 = 1_790_000_000_000

/** A flight-like payload: chunk noise around the two JSON objects. */
function flight(snapshot, costStats) {
  return [
    '2:I[1234,"chunk with \\"escaped quotes\\" and {braces} inside strings"]',
    `3a:{"arena":{"slug":"agent"},"snapshot":${JSON.stringify(snapshot)}}`,
    `40:["$","script"]`,
    `41:{"costStats":${JSON.stringify(costStats)}}`,
  ].join('\n')
}

const SNAPSHOT = {
  lastUpdated: '2026-10-08T12:00:00.000Z',
  totalSessions: 2378129,
  modelCount: 2,
  rows: [
    {
      rank: 1,
      contenderName: 'contenders/a-agent',
      model: 'Model A (High)',
      modelOrganization: 'Anthropic',
      license: 'Proprietary',
      provider: null,
      modelUrl: 'https://example.com/a',
      inputPricePerMillion: 4,
      outputPricePerMillion: 20,
      isPublic: true,
      releaseType: null,
      rankSpread: { min: 1, max: 6 },
      avgScore: { value: 0.14331280058415052, ci: 0.021806161454452216, pipelines: 5 },
      sessions: 6103,
      observations: 940970,
      overallRank: 1,
      signalScores: {
        task_outcome_explicit: 0.13934578755388138,
        praise_complaint: 0.33692731397631004,
        steering_burden: 0.09979487638874607,
        bash_reliability_no_prereq: 0.1355335853279116,
        tool_hallucination: 0.004962439673903418,
      },
      signalCi: {
        task_outcome_explicit: 0.03839787543782533,
        praise_complaint: 0.09122676598700652,
        steering_burden: 0.02124018972526591,
        bash_reliability_no_prereq: 0.008022201765124776,
        tool_hallucination: 0.00037583721971619875,
      },
    },
    {
      rank: 2,
      contenderName: 'contenders/b-agent',
      model: 'Model B',
      modelOrganization: 'Xiaomi',
      license: 'MIT',
      // no modelUrl, no prices, no costStats entry, negative score
      rankSpread: { min: 3, max: 9 },
      avgScore: { value: -0.05, ci: 0.01 },
      sessions: 42,
      signalScores: { task_outcome_explicit: -0.02 },
      signalCi: {},
    },
  ],
}

const COSTS = {
  costWindowDays: 14,
  entries: [
    {
      contenderName: 'contenders/a-agent',
      medianUsd: 1.7305867999999998,
      p25Usd: 0.4,
      p95Usd: 4.2,
      pricedSampleCount: 1475,
      totalSampleCount: 1664,
      outputMtokPerTask: { medianMtok: 0.028727, p25Mtok: 0.01, p95Mtok: 0.2, tokenedSampleCount: 1475, totalSampleCount: 1664 },
    },
  ],
}

test('extractFlightObject: balanced JSON with braces/quotes inside strings', () => {
  const text = flight(SNAPSHOT, COSTS)
  assert.deepEqual(extractFlightObject(text, 'snapshot').rows[0].model, 'Model A (High)')
  assert.equal(extractFlightObject(text, 'costStats').entries.length, 1)
  assert.equal(extractFlightObject(text, 'missing'), undefined)
  // A string containing a brace and escaped quotes must not end the scan early.
  assert.deepEqual(extractFlightObject('"x":' + JSON.stringify({ k: '{"q":"}' }), 'x'), { k: '{"q":"}' })
  assert.equal(extractFlightObject('"x":{"k":"never closes', 'x'), undefined)
})

test('parseArenaBoard: rows map with signals, spread, cost join, nulls stay null', () => {
  const board = parseArenaBoard(flight(SNAPSHOT, COSTS))
  assert.equal(board.lastUpdated, '2026-10-08T12:00:00.000Z')
  assert.equal(board.totalSessions, 2378129)
  assert.equal(board.modelCount, 2)
  const [a, b] = board.rows
  assert.equal(a.rank, 1)
  assert.equal(a.value, 0.14331280058415052)
  assert.equal(a.success, 0.13934578755388138)
  assert.equal(a.successCi, 0.03839787543782533)
  // The bash signal was renamed upstream (bash_recovery_steps →
  // bash_reliability_no_prereq); the column reads the new key.
  assert.equal(a.bash, 0.1355335853279116)
  assert.equal(a.bashCi, 0.008022201765124776)
  assert.equal(a.observations, 940970)
  assert.equal(a.overallRank, 1)
  assert.equal(a.halluc, 0.004962439673903418)
  assert.equal(a.spreadMin, 1)
  assert.equal(a.spreadMax, 6)
  assert.equal(a.costUsd, 1.7305867999999998)
  assert.equal(a.tokensM, 0.028727)
  assert.equal(a.priceIn, 4)
  // The unpriced/unlinked row keeps null instead of 0.
  assert.equal(b.url, '')
  assert.equal(b.overallRank, null)
  assert.equal(b.observations, null)
  assert.equal(b.priceIn, null)
  assert.equal(b.costUsd, null)
  assert.equal(b.tokensM, null)
  assert.equal(b.successCi, null)
  assert.equal(b.praise, null)
})

test('parseArenaBoard: sample gates hide thin cost and token figures', () => {
  const entry = (over) => parseArenaBoard(flight(SNAPSHOT, { costWindowDays: 14, entries: [{
    contenderName: 'contenders/a-agent', medianUsd: 2, p25Usd: 1, p95Usd: 3,
    pricedSampleCount: 400, totalSampleCount: 400,
    outputMtokPerTask: { medianMtok: 0.5, tokenedSampleCount: 400, totalSampleCount: 400 },
    ...over,
  }] })).rows[0]
  // The site's own gate (chunk 0pxzy916nkaqk.js): cost needs >= 50 priced
  // samples AND >= half the samples priced; tokens only the half share.
  assert.equal(entry({ pricedSampleCount: 49, totalSampleCount: 51 }).costUsd, null) // one short of the floor
  assert.equal(entry({ pricedSampleCount: 18, totalSampleCount: 18 }).costUsd, null) // live: Claude Opus 4.8
  assert.equal(entry({ pricedSampleCount: 49, totalSampleCount: 100 }).costUsd, null) // the share is a floor, not a pass
  assert.equal(entry({}).costUsd, 2)
  assert.equal(entry({}).costUsd25, 1)
  assert.equal(entry({}).tokensM, 0.5)
  assert.equal(entry({ outputMtokPerTask: { medianMtok: 0.5, tokenedSampleCount: 199, totalSampleCount: 400 } }).tokensM, null)
  assert.equal(entry({ outputMtokPerTask: { medianMtok: 0.5, tokenedSampleCount: 200, totalSampleCount: 400 } }).tokensM, 0.5)
})

test('parseArenaBoard: rejects a payload without snapshot rows', () => {
  assert.throws(() => parseArenaBoard('<html>challenge</html>'), /snapshot rows missing/)
})

function stubFetch(boards: Record<string, unknown>, failures: Record<string, Error> = {}) {
  const calls: string[] = []
  const fetchImpl: any = async (input: string) => {
    calls.push(input)
    for (const [needle, error] of Object.entries(failures)) {
      if (input.includes(needle)) throw error
    }
    for (const [needle, payload] of Object.entries(boards)) {
      if (!input.includes(needle)) continue
      return { ok: true, status: 200, text: async () => String(payload) }
    }
    return { ok: false, status: 404, text: async () => '' }
  }
  return { calls, fetchImpl }
}

test('createArenaSource: fetches all categories, caches, TTL serves without re-fetch', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const cachePath = join(dir, 'arena-cache.json')
  const overall = flight(SNAPSHOT, COSTS)
  const code = flight({ ...SNAPSHOT, rows: SNAPSHOT.rows.slice(0, 1) }, COSTS)
  const stub = stubFetch(Object.fromEntries(ARENA_CATEGORIES.map((category) => [
    `${ARENA_LEADERBOARD_URL}${category.path}?`,
    category.id === 'overall' ? overall : code,
  ])))
  let now = T0
  const source = createArenaSource({ cachePath, fetchImpl: stub.fetchImpl as any, now: () => now })

  const first = await source.read()
  assert.equal(Object.keys(first.boards).length, 4)
  assert.equal(first.error, undefined)
  assert.equal(first.at, T0)
  assert.deepEqual(stub.calls.slice().sort(), ARENA_CATEGORIES.map((c) => `${ARENA_LEADERBOARD_URL}${c.path}?_rsc=1`).sort())
  assert.ok(existsSync(cachePath))

  // Within the TTL: no new fetch.
  const callsAfterFirst = stub.calls.length
  now += 5 * 60_000
  const cached = await source.read()
  assert.equal(cached.at, T0)
  assert.equal(stub.calls.length, callsAfterFirst)

  // Past the TTL: one round per category again.
  now += 61 * 60_000
  await source.read()
  assert.equal(stub.calls.length, callsAfterFirst + 4)
})

test('createArenaSource: a failed refresh falls back to the stale cache with the error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const cachePath = join(dir, 'arena-cache.json')
  const good = flight(SNAPSHOT, COSTS)
  const ok = stubFetch(Object.fromEntries(ARENA_CATEGORIES.map((c) => [`${ARENA_LEADERBOARD_URL}${c.path}?`, good])))
  let now = T0
  let mode: 'ok' | 'down' = 'ok'
  const fetchImpl: any = async (input: string) => {
    if (mode === 'down') throw new Error('fetch failed: socket hung up')
    return (ok.fetchImpl as any)(input)
  }
  const source = createArenaSource({ cachePath, fetchImpl, now: () => now })
  await source.read()

  now += 61 * 60_000
  mode = 'down'
  const stale = await source.read()
  assert.equal(stale.boards.overall.rows.length, 2)
  assert.match(stale.error, /socket hung up/)
  // The stale fallback is what got persisted, not an empty answer.
  const persisted = JSON.parse(readFileSync(cachePath, 'utf8'))
  assert.equal(persisted.boards.overall.rows.length, 2)
})

/** What Cloudflare answers a gated route with (docs/error.md 2026-10-14). */
function challengeResponse() {
  return {
    ok: false,
    status: 403,
    headers: { get: (name: string) => (name.toLowerCase() === 'cf-mitigated' ? 'challenge' : null) },
    text: async () => '<html>Just a moment...</html>',
  }
}

test('isArenaChallenge: only 403 with cf-mitigated: challenge counts', () => {
  assert.equal(isArenaChallenge({ status: 403, headers: { get: () => 'challenge' } }), true)
  assert.equal(isArenaChallenge({ status: 403, headers: { get: () => null } }), false)
  assert.equal(isArenaChallenge({ status: 403 }), false)
  assert.equal(isArenaChallenge({ status: 200, headers: { get: () => 'challenge' } }), false)
})

test('createArenaSource: a wholly gated refresh reports the challenge, not a bare 403', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const cachePath = join(dir, 'arena-cache.json')
  const good = flight(SNAPSHOT, COSTS)
  const ok = stubFetch(Object.fromEntries(ARENA_CATEGORIES.map((c) => [`${ARENA_LEADERBOARD_URL}${c.path}?`, good])))
  let now = T0
  let gated = false
  const fetchImpl: any = async (input: string) => (gated ? challengeResponse() : (ok.fetchImpl as any)(input))
  const source = createArenaSource({ cachePath, fetchImpl, now: () => now })
  await source.read()

  now += 61 * 60_000
  gated = true
  const stale = await source.read()
  assert.equal(stale.blocked, true)
  assert.equal(stale.boards.overall.rows.length, 2)
  assert.match(stale.error, /arena \/overall: HTTP 403 \(Cloudflare challenge\)/)
  // The flag rides the cache, so a reload still explains itself before retrying.
  assert.equal(JSON.parse(readFileSync(cachePath, 'utf8')).blocked, true)
  const reloaded = await createArenaSource({ cachePath, fetchImpl, now: () => now }).read()
  assert.equal(reloaded.blocked, true)

  // A later good round clears both the flag and the error.
  gated = false
  now += 61 * 60_000
  const fresh = await source.read()
  assert.equal(fresh.blocked, undefined)
  assert.equal(fresh.error, undefined)
})

test('createArenaSource: one gated category is not the gated case', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const good = flight(SNAPSHOT, COSTS)
  const ok = stubFetch(Object.fromEntries(ARENA_CATEGORIES
    .filter((c) => c.id !== 'work')
    .map((c) => [`${ARENA_LEADERBOARD_URL}${c.path}?`, good])))
  const fetchImpl: any = async (input: string) => (input.includes('/work?') ? challengeResponse() : (ok.fetchImpl as any)(input))
  const source = createArenaSource({ cachePath: join(dir, 'arena-cache.json'), fetchImpl, now: () => T0 })
  const answer = await source.read()
  assert.equal(Object.keys(answer.boards).length, 3)
  assert.equal(answer.blocked, undefined)
  assert.match(answer.error, /arena \/work: HTTP 403 \(Cloudflare challenge\)/)
})

test('createArenaSource: a plain 403 keeps the HTTP status line only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const plain: any = async () => ({ ok: false, status: 403, text: async () => 'nope' })
  const source = createArenaSource({ cachePath: join(dir, 'arena-cache.json'), fetchImpl: plain, now: () => T0 })
  await assert.rejects(() => source.read(), (error: any) => error.message === 'arena /overall: HTTP 403')
})

/** Wrap flight text the way the live document ships it: escaped push chunks. */
function archivedDocument(flightText: string) {
  const split = Math.floor(flightText.length / 2) // a cut mid-object proves the join
  return ['<!doctype html><script>self.__next_f=[]</script>',
    ...[flightText.slice(0, split), flightText.slice(split)]
      .map((part) => `<script>self.__next_f.push([1,${JSON.stringify(part)}])</script>`),
    '</html>'].join('')
}

/** A CDX reply row set: header + captures, newest last like the live API. */
function cdxReply(...rows: Array<[string, string]>) {
  return JSON.stringify([['urlkey', 'timestamp', 'statuscode'], ...rows.map(([timestamp, code]) => ['ai,arena)/leaderboard/agent', timestamp, code])])
}

test('extractFlightTextFromHtml: joins escaped push chunks back into the flight stream', () => {
  const text = flight(SNAPSHOT, COSTS)
  assert.equal(extractFlightTextFromHtml(archivedDocument(text)), text)
  assert.equal(parseArenaBoard(extractFlightTextFromHtml(archivedDocument(text))).rows.length, 2)
  assert.equal(extractFlightTextFromHtml('<html>challenge</html>'), '')
})

test('newestWaybackCapture: newest 200 timestamp wins, non-200 rows skip', () => {
  assert.equal(newestWaybackCapture(cdxReply(['20261009033450', '200'], ['20261011170817', '200'], ['20261012031550', '301'])), '20261011170817')
  assert.equal(newestWaybackCapture('[]'), undefined)
  assert.equal(newestWaybackCapture('not json'), undefined)
})

test('createArenaSource: a gated refresh rescues boards from the Wayback archive', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const cachePath = join(dir, 'arena-cache.json')
  const doc = archivedDocument(flight({ ...SNAPSHOT, lastUpdated: '2026-10-13T11:00:00.000Z' }, COSTS))
  const gz = gzipSync(Buffer.from(doc, 'utf8')) // id_ replay arrives gzip-coded with no header
  const archiveBytes = gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength)
  const fetchImpl: any = async (input: string) => {
    if (input.includes('/cdx/search/cdx')) return { ok: true, status: 200, text: async () => cdxReply(['20261014000000', '200']) }
    if (input.includes('/web/')) return { ok: true, status: 200, arrayBuffer: async () => archiveBytes, text: async () => doc }
    return challengeResponse()
  }
  let now = T0
  const source = createArenaSource({ cachePath, fetchImpl, now: () => now })
  const answer = await source.read()
  assert.equal(answer.archived, true)
  assert.equal(answer.blocked, undefined)
  assert.equal(answer.error, undefined)
  assert.equal(answer.boards.overall.lastUpdated, '2026-10-13T11:00:00.000Z')
  assert.equal(answer.boards.overall.rows.length, 2)
  // The flag rides the cache, so a reload still explains itself before retrying.
  assert.equal(JSON.parse(readFileSync(cachePath, 'utf8')).archived, true)
  const reloaded = await createArenaSource({ cachePath, fetchImpl, now: () => now }).read()
  assert.equal(reloaded.archived, true)

  // A later direct round clears the flag.
  now += 61 * 60_000
  const good = flight({ ...SNAPSHOT, lastUpdated: '2026-10-14T11:00:00.000Z' }, COSTS)
  const direct: any = async () => ({ ok: true, status: 200, text: async () => good })
  const fresh = await createArenaSource({ cachePath, fetchImpl: direct, now: () => now }).read()
  assert.equal(fresh.archived, undefined)
  assert.equal(fresh.error, undefined)
})

test('createArenaSource: an archive capture older than the cache is rejected, not merged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const cachePath = join(dir, 'arena-cache.json')
  const later = flight({ ...SNAPSHOT, lastUpdated: '2026-10-13T11:00:00.000Z' }, COSTS)
  const ok = stubFetch(Object.fromEntries(ARENA_CATEGORIES.map((c) => [`${ARENA_LEADERBOARD_URL}${c.path}?`, later])))
  const olderDoc = archivedDocument(flight(SNAPSHOT, COSTS)) // 2026-10-08, behind the cache
  let now = T0
  let gated = false
  const fetchImpl: any = async (input: string) => {
    if (!gated) return (ok.fetchImpl as any)(input)
    if (input.includes('/cdx/search/cdx')) return { ok: true, status: 200, text: async () => cdxReply(['20261011170817', '200']) }
    if (input.includes('/web/')) return { ok: true, status: 200, text: async () => olderDoc } // text-only stub: no arrayBuffer
    return challengeResponse()
  }
  const source = createArenaSource({ cachePath, fetchImpl, now: () => now })
  await source.read()

  now += 61 * 60_000
  gated = true
  const answer = await source.read()
  assert.equal(answer.blocked, true)
  assert.equal(answer.archived, undefined)
  assert.match(answer.error, /arena \/overall: HTTP 403 \(Cloudflare challenge\)/)
  assert.equal(answer.boards.overall.lastUpdated, '2026-10-13T11:00:00.000Z')
})

test('createArenaSource: no cache and a dead network throws', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const failing: any = async () => { throw new Error('offline') }
  const source = createArenaSource({ cachePath: join(dir, 'arena-cache.json'), fetchImpl: failing, now: () => T0 })
  await assert.rejects(() => source.read(), /offline/)
})

test('createArenaSource: concurrent reads share one in-flight round', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'osubs-arena-'))
  const good = flight(SNAPSHOT, COSTS)
  let inFlight = 0
  let peak = 0
  const slow: any = async (input: string) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((resolve) => setTimeout(resolve, 20))
    inFlight -= 1
    return { ok: true, status: 200, text: async () => good }
  }
  const source = createArenaSource({ cachePath: join(dir, 'arena-cache.json'), fetchImpl: slow, now: () => T0 })
  const [a, b] = await Promise.all([source.read(), source.read()])
  assert.equal(a, b)
  assert.equal(peak, 4)
})

async function browserFinished(source) {
  while (source.browser('status').busy) await new Promise(resolve => setTimeout(resolve, 1))
  return source.browser('status')
}

function seedBrowserCache() {
  const cachePath = join(mkdtempSync(join(tmpdir(), 'osubs-arena-browser-')), 'arena-cache.json')
  const board = parseArenaBoard(flight(SNAPSHOT, COSTS))
  const previous = { at: T0, blocked: true, archived: true, error: 'challenge', boards: { overall: board } }
  writeFileSync(cachePath, JSON.stringify(previous), { mode: 0o600 })
  return { cachePath, board, previous }
}

test('browser verification coalesces starts, atomically updates cache and clears stale flags', async () => {
  const { cachePath, board } = seedBrowserCache()
  let calls = 0
  let finish
  const source = createArenaSource({ cachePath, now: () => T0 + 1,
    browserFetch: async () => { calls++; return new Promise(resolve => { finish = resolve }) } })
  assert.equal(source.browser('start').busy, true)
  assert.equal(source.browser('start').busy, true)
  assert.equal(calls, 1)
  const pendingRead = source.read(true)
  finish(Object.fromEntries(ARENA_CATEGORIES.map(({ id }) => [id, board])))
  const answer = await pendingRead
  const state = await browserFinished(source)
  assert.equal(state.answer, answer)
  assert.equal(answer.at, T0 + 1)
  assert.equal(answer.blocked, undefined)
  assert.equal(answer.archived, undefined)
  assert.equal(answer.error, undefined)
  assert.deepEqual(JSON.parse(readFileSync(cachePath, 'utf8')), answer)
  if (process.platform !== 'win32') assert.equal(statSync(cachePath).mode & 0o777, 0o600)
  const reopened = createArenaSource({ cachePath, now: () => T0 + 2, fetchImpl: async () => { throw new Error('must use persisted cache') } })
  assert.deepEqual(await reopened.read(), answer)
})

for (const kind of ['failed', 'partial', 'older']) {
  test('browser ' + kind + ' keeps the previous cache byte for byte', async () => {
    const { cachePath, board } = seedBrowserCache()
    const previousBytes = readFileSync(cachePath, 'utf8')
    const source = createArenaSource({ cachePath, browserFetch: async () => {
      if (kind === 'failed') throw new Error('Chrome closed')
      if (kind === 'partial') return { overall: board }
      return Object.fromEntries(ARENA_CATEGORIES.map(({ id }) => [id, { ...board, lastUpdated: '2026-10-01T12:00:00Z' }]))
    } })
    source.browser('start')
    const state = await browserFinished(source)
    assert.ok(state.error)
    assert.equal(readFileSync(cachePath, 'utf8'), previousBytes)
  })
}

for (const action of ['cancel', 'dispose']) {
  test('browser ' + action + ' aborts its worker and preserves cache', async () => {
    const { cachePath } = seedBrowserCache()
    const bytes = readFileSync(cachePath, 'utf8')
    let signal: AbortSignal
    const source = createArenaSource({ cachePath, browserFetch: async incoming => {
      signal = incoming
      return new Promise((_resolve, reject) => incoming.addEventListener('abort', () => reject(incoming.reason), { once: true }))
    } })
    source.browser('start')
    if (action === 'cancel') source.browser('cancel')
    else source.dispose()
    const state = await browserFinished(source)
    assert.equal(signal!.aborted, true)
    assert.equal(state.cancelled, true)
    assert.equal(readFileSync(cachePath, 'utf8'), bytes)
  })
}

test('browser commit waits for an existing direct refresh and wins the write race', async () => {
  const { cachePath, board } = seedBrowserCache()
  const newer = { ...board, lastUpdated: '2026-10-13T22:00:00Z' }
  let release
  const gate = new Promise(resolve => { release = resolve })
  const source = createArenaSource({ cachePath, fetchImpl: async () => {
    await gate
    return { ok: true, status: 200, text: async () => flight(SNAPSHOT, COSTS) }
  }, browserFetch: async () => Object.fromEntries(ARENA_CATEGORIES.map(({ id }) => [id, newer])) })
  const direct = source.read(true)
  source.browser('start')
  release()
  await direct
  const state = await browserFinished(source)
  assert.equal(state.answer?.boards.overall.lastUpdated, newer.lastUpdated)
  assert.equal(JSON.parse(readFileSync(cachePath, 'utf8')).boards.overall.lastUpdated, newer.lastUpdated)
})

test('browser cache write failure is reported instead of claiming success', async () => {
  const { board } = seedBrowserCache()
  const cachePath = join(mkdtempSync(join(tmpdir(), 'osubs-arena-write-failure-')), 'arena-cache.json')
  mkdirSync(cachePath)
  const source = createArenaSource({ cachePath, browserFetch: async () => Object.fromEntries(ARENA_CATEGORIES.map(({ id }) => [id, board])) })
  source.browser('start')
  const state = await browserFinished(source)
  assert.ok(state.error)
  assert.equal(state.answer, undefined)
  assert.equal(statSync(cachePath).isDirectory(), true)
})
