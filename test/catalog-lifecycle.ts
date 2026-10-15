/**
 * Drive one family's shipped refresh through the live-catalog races.
 * The adapter's `fetch` runs only when that refresh's upstream read starts.
 */
import assert from 'node:assert/strict'

export async function exerciseLiveCatalog(spec) {
  const label = spec.label
  const idFor = spec.idFor ?? ((kind) => `live-only-${kind}`)
  const ttlMs = spec.ttlMs
  const gates = []
  const hang = () => {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    const gate = { promise, resolve }
    gates.push(gate)
    return gate
  }
  const releaseAll = () => {
    for (const gate of gates) gate.resolve()
  }
  const idsOf = (rows) => (rows ?? []).map((row) => row.id)
  const has = (rows, id) => idsOf(rows).includes(id)
  const waitFor = async (ready, what) => {
    const start = Date.now()
    while (!ready()) {
      if (Date.now() - start > 3000) {
        releaseAll()
        throw new Error(`${label}: timed out waiting for ${what}`)
      }
      await new Promise((done) => setTimeout(done, 5))
    }
  }
  const published = (rows, kind) => {
    assert.equal(has(rows, idFor(kind)), true, `${label}: published ${kind}`)
    assert.equal(has(rows, idFor(kind === 'a' ? 'b' : 'a')), false, `${label}: the other exclusive id stays out`)
    if (spec.keepStaticId) assert.equal(has(rows, spec.keepStaticId), true, `${label}: static floor stays`)
    if (spec.dropStaticId) assert.equal(has(rows, spec.dropStaticId), false, `${label}: non-empty live does not backfill static rows`)
    if (spec.windows) {
      const row = rows.find((item) => item.id === idFor(kind))
      assert.equal(row.contextWindow, spec.windows[kind], `${label}: ${kind} window`)
    }
  }
  const staticAgain = (rows) => {
    assert.equal(has(rows, idFor('a')), false, `${label}: exclusive a is not the fallback`)
    assert.equal(has(rows, idFor('b')), false, `${label}: exclusive b is not the fallback`)
    if (spec.dropStaticId) assert.equal(has(rows, spec.dropStaticId), true, `${label}: static fallback is back`)
    if (spec.keepStaticId) assert.equal(has(rows, spec.keepStaticId), true, `${label}: static floor remains`)
  }

  try {
    spec.reset()

    // Same-turn overlap: the newer fetch replaces the one that has not started.
    // Resolving the superseded 100K body must not overwrite the published 200K.
    let readsA = 0
    let readsB = 0
    const older = hang()
    const newer = hang()
    const first = spec.refresh({
      token: 'same',
      now: 1_000,
      ttlMs,
      fetch: async () => {
        readsA += 1
        await older.promise
        return 'a'
      },
    })
    const second = spec.refresh({
      token: 'same',
      now: 1_000,
      ttlMs,
      fetch: async () => {
        readsB += 1
        await newer.promise
        return 'b'
      },
    })
    await waitFor(() => readsA + readsB > 0, 'coalesced read')
    assert.equal(readsA, 0, `${label}: superseded fetch never starts`)
    assert.equal(readsB, 1, `${label}: one upstream read for one credential`)
    newer.resolve()
    published(await first, 'b')
    published(await second, 'b')
    if (spec.httpPerRefresh) assert.equal(spec.httpCount(), spec.httpPerRefresh, `${label}: overlapping refresh does not double the upstream calls`)
    older.resolve()
    await Promise.resolve()
    published(spec.models(), 'b')

    // A read that has already started is joined: the second fetch does not run.
    spec.reset()
    const started = hang()
    let joined = 0
    let open = false
    const leader = spec.refresh({
      token: 'join',
      now: 1_000,
      ttlMs,
      fetch: async () => {
        open = true
        await started.promise
        return 'a'
      },
    })
    await waitFor(() => open, 'in-flight read')
    const follower = spec.refresh({
      token: 'join',
      now: 1_000,
      ttlMs,
      fetch: async () => {
        joined += 1
        return 'b'
      },
    })
    assert.equal(joined, 0, `${label}: an in-flight read is joined`)
    started.resolve()
    published(await leader, 'a')
    published(await follower, 'a')

    if (!spec.shared) {
      spec.reset()
      const leftGate = hang()
      const rightGate = hang()
      let left = 0
      let right = 0
      const leftRead = spec.refresh({
        token: 'account-a',
        now: 1_000,
        ttlMs,
        fetch: async () => {
          left += 1
          await leftGate.promise
          return 'a'
        },
      })
      const rightRead = spec.refresh({
        token: 'account-b',
        now: 1_000,
        ttlMs,
        fetch: async () => {
          right += 1
          await rightGate.promise
          return 'b'
        },
      })
      await waitFor(() => left === 1 && right === 1, 'two credentials')
      leftGate.resolve()
      rightGate.resolve()
      published(await leftRead, 'a')
      published(await rightRead, 'b')
    } else {
      spec.reset()
      const gate = hang()
      let reads = 0
      const one = spec.refresh({
        token: 'session-a',
        now: 1_500,
        ttlMs,
        fetch: async () => {
          reads += 1
          await gate.promise
          return 'a'
        },
      })
      const two = spec.refresh({
        token: 'session-b',
        now: 1_500,
        ttlMs,
        fetch: async () => {
          reads += 1
          await gate.promise
          return 'b'
        },
      })
      await waitFor(() => reads > 0, 'public catalog read')
      assert.equal(reads, 1, `${label}: a public catalog coalesces across sessions`)
      gate.resolve()
      published(await one, 'b')
      published(await two, 'b')
    }

    // Account B's failure returns the static floor (or B's own previous
    // success) and must not stamp that floor. It must not drop A's published
    // rows: the getter is what a later settings sync reads. A public catalog
    // has one identity, so a later failure keeps that shared success.
    spec.reset()
    await spec.refresh({
      token: 'account-a',
      now: 2_000,
      ttlMs,
      fetch: async () => 'a',
    })
    published(spec.models(), 'a')
    let failed = 0
    // A public catalog is one identity, so this read has to be past the TTL
    // or the fresh shared success short-circuits before the failure.
    const failedRows = await spec.refresh({
      token: 'account-b',
      now: spec.shared ? 2_000 + ttlMs : 2_000,
      ttlMs,
      fetch: async () => {
        failed += 1
        return 'fail'
      },
    })
    assert.equal(failed, 1, `${label}: the failure reached upstream`)
    if (spec.shared) {
      published(failedRows, 'a')
      published(spec.models(), 'a')
    } else {
      staticAgain(failedRows)
      published(spec.models(), 'a')
      const again = await spec.refresh({
        token: 'account-b',
        now: 2_000,
        ttlMs,
        fetch: async () => {
          failed += 1
          return 'fail'
        },
      })
      assert.equal(failed, 2, `${label}: a failed read does not stamp the fallback`)
      staticAgain(again)
      published(spec.models(), 'a')
      let remembered = 0
      const restored = await spec.refresh({
        token: 'account-a',
        now: 2_000,
        ttlMs,
        fetch: async () => {
          remembered += 1
          return 'fail'
        },
      })
      published(restored, 'a')
      published(spec.models(), 'a')
      if (spec.alwaysFetch) assert.equal(remembered, 1, `${label}: Devin still asks, then falls back to the same identity`)
      else assert.equal(remembered, 0, `${label}: A's fresh success is reused`)
    }

    // B has its own previous success. The failure's return value is that
    // success. A's published rows stay. A public catalog has one identity,
    // so the stored success is whatever was published last.
    spec.reset()
    await spec.refresh({
      token: 'account-b',
      now: 4_000,
      ttlMs,
      fetch: async () => 'b',
    })
    published(spec.models(), 'b')
    // A public catalog is one identity, so this read has to be past B's TTL
    // or the fresh shared success short-circuits and never publishes A.
    await spec.refresh({
      token: 'account-a',
      now: 4_000 + ttlMs,
      ttlMs,
      fetch: async () => 'a',
    })
    published(spec.models(), 'a')
    const priorFail = await spec.refresh({
      token: 'account-b',
      now: 4_000 + ttlMs + ttlMs,
      ttlMs,
      fetch: async () => 'fail',
    })
    if (spec.shared) {
      published(priorFail, 'a')
    } else {
      published(priorFail, 'b')
    }
    published(spec.models(), 'a')

    spec.reset()
    let unstamped = 0
    await spec.refresh({
      token: 'nobody',
      now: 3_000,
      ttlMs,
      fetch: async () => {
        unstamped += 1
        return 'empty'
      },
    })
    staticAgain(spec.models())
    await spec.refresh({
      token: 'nobody',
      now: 3_000,
      ttlMs,
      fetch: async () => {
        unstamped += 1
        return 'empty'
      },
    })
    assert.equal(unstamped, 2, `${label}: an empty read does not stamp the static fallback`)
    staticAgain(spec.models())

    // A fetch that started before reset must not refill the catalog.
    spec.reset()
    const flight = hang()
    let flying = false
    const pending = spec.refresh({
      token: 'reset-me',
      now: 4_000,
      ttlMs,
      fetch: async () => {
        flying = true
        await flight.promise
        return 'a'
      },
    })
    await waitFor(() => flying, 'read started before reset')
    spec.reset()
    flight.resolve()
    staticAgain(await pending)
    staticAgain(spec.models())
    let afterReset = 0
    const refilled = await spec.refresh({
      token: 'reset-me',
      now: 4_000,
      ttlMs,
      fetch: async () => {
        afterReset += 1
        return 'b'
      },
    })
    assert.equal(afterReset, 1, `${label}: reset cleared the in-flight generation`)
    published(refilled, 'b')

    spec.reset()
    if (spec.alwaysFetch) {
      let calls = 0
      await spec.refresh({
        token: 'always',
        now: 5_000,
        ttlMs: -1,
        fetch: async () => {
          calls += 1
          return 'a'
        },
      })
      await spec.refresh({
        token: 'always',
        now: 5_000,
        ttlMs: -1,
        fetch: async () => {
          calls += 1
          return 'b'
        },
      })
      assert.equal(calls, 2, `${label}: no TTL, so a negative ttl does not skip the read`)
      published(spec.models(), 'b')
    } else {
      let calls = 0
      const body = async (kind) => {
        calls += 1
        return kind
      }
      published(await spec.refresh({
        token: 'clock',
        now: 10_000,
        ttlMs,
        fetch: () => body('a'),
      }), 'a')
      await spec.refresh({
        token: 'clock',
        now: 10_000,
        ttlMs: -1,
        fetch: () => body('b'),
      })
      assert.equal(calls, 1, `${label}: a negative ttl does not expire a fresh entry`)
      published(spec.models(), 'a')
      await spec.refresh({
        token: 'clock',
        now: 10_000 + ttlMs - 1,
        ttlMs: -1,
        fetch: () => body('b'),
      })
      assert.equal(calls, 1, `${label}: still inside the stored TTL`)
      const stale = await spec.refresh({
        token: 'clock',
        now: 10_000 + ttlMs,
        ttlMs,
        fetch: async () => {
          calls += 1
          return 'fail'
        },
      })
      assert.equal(calls, 2, `${label}: the read runs once the stored TTL has passed`)
      published(stale, 'a')
      published(await spec.refresh({
        token: 'clock',
        now: 10_000 + ttlMs,
        ttlMs,
        fetch: () => body('b'),
      }), 'b')
      assert.equal(calls, 3, `${label}: the failed read did not refresh the expiry`)
    }
  } finally {
    releaseAll()
    spec.reset()
  }
}
