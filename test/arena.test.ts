import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ARENA_CATEGORIES, ARENA_LEADERBOARD_URL, createArenaSource, extractFlightObject, parseArenaBoard } from '../lib/utils/arena.js'

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
      signalScores: {
        task_outcome_explicit: 0.13934578755388138,
        praise_complaint: 0.33692731397631004,
        steering_burden: 0.09979487638874607,
        bash_recovery_steps: 0.1355335853279116,
        tool_hallucination: 0.004962439673903418,
      },
      signalCi: {
        task_outcome_explicit: 0.03839787543782533,
        praise_complaint: 0.09122676598700652,
        steering_burden: 0.02124018972526591,
        bash_recovery_steps: 0.008022201765124776,
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
      outputMtokPerTask: { medianMtok: 0.028727 },
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
  assert.equal(a.halluc, 0.004962439673903418)
  assert.equal(a.spreadMin, 1)
  assert.equal(a.spreadMax, 6)
  assert.equal(a.costUsd, 1.7305867999999998)
  assert.equal(a.tokensM, 0.028727)
  assert.equal(a.priceIn, 4)
  // The unpriced/unlinked row keeps null instead of 0.
  assert.equal(b.url, '')
  assert.equal(b.priceIn, null)
  assert.equal(b.costUsd, null)
  assert.equal(b.tokensM, null)
  assert.equal(b.successCi, null)
  assert.equal(b.praise, null)
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
