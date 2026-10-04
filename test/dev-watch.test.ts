import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBuildQueue, inspectHmrWiring } from '../lib/utils/dev-watch.js'

const flush = () => new Promise((resolve) => setImmediate(resolve))

interface Deferred {
  resolve: () => void
  reject: (error: unknown) => void
}

function makeQueue(overrides: Record<string, unknown> = {}) {
  const armed: Array<() => void> = []
  const events: string[] = []
  const deferreds: Deferred[] = []
  const queue = createBuildQueue(() => new Promise<void>((resolve, reject) => {
    deferreds.push({ resolve, reject })
  }), {
    setTimer: (fn: () => void) => {
      armed.push(fn)
      return fn
    },
    clearTimer: (handle: unknown) => {
      const index = armed.indexOf(handle as () => void)
      if (index >= 0) armed.splice(index, 1)
    },
    onStart: () => events.push('start'),
    onDone: (ok: boolean) => events.push(ok ? 'ok' : 'fail'),
    onError: (error: unknown) => events.push('error:' + (error as Error).message),
    ...overrides,
  })
  const fire = () => {
    const fn = armed.shift()
    if (!fn) throw new Error('no armed debounce window')
    fn()
  }
  const settle = (n: number, ok = true) => {
    const deferred = deferreds[n]
    if (!deferred) throw new Error('no run #' + n)
    if (ok) deferred.resolve()
    else deferred.reject(new Error('boom'))
  }
  return { queue, armed, events, deferreds, fire, settle }
}

test('a burst inside the window collapses into one run', async () => {
  const h = makeQueue()
  h.queue.push()
  h.queue.push()
  h.queue.push()
  assert.equal(h.armed.length, 1, 'one window, opened by the first push')
  assert.equal(h.queue.waiting(), true)
  assert.equal(h.queue.running(), false)
  h.fire()
  assert.equal(h.queue.running(), true)
  assert.deepEqual(h.events, ['start'])
  h.settle(0)
  await flush()
  assert.deepEqual(h.events, ['start', 'ok'])
  assert.equal(h.queue.running(), false)
  assert.equal(h.queue.waiting(), false)
})

test('changes during a build mark dirty and rerun once, never overlapping', async () => {
  const h = makeQueue()
  h.queue.push()
  h.fire()
  h.queue.push()
  h.queue.push()
  assert.equal(h.armed.length, 0, 'no new window while a build is in flight')
  h.settle(0)
  await flush()
  assert.deepEqual(h.events, ['start', 'ok'], 'first run finished')
  assert.equal(h.armed.length, 1, 'dirty re-run armed a new window')
  assert.equal(h.queue.waiting(), true)
  h.fire()
  assert.equal(h.deferreds.length, 2, 'the second run started only after the first settled')
  h.settle(1)
  await flush()
  assert.deepEqual(h.events, ['start', 'ok', 'start', 'ok'])
})

test('a failing run reports through onError and the queue keeps watching', async () => {
  const h = makeQueue()
  h.queue.push()
  h.fire()
  h.settle(0, false)
  await flush()
  assert.deepEqual(h.events, ['start', 'error:boom', 'fail'])
  h.queue.push()
  assert.equal(h.armed.length, 1)
  h.fire()
  h.settle(1)
  await flush()
  assert.deepEqual(h.events, ['start', 'error:boom', 'fail', 'start', 'ok'])
})

test('a throwing onError does not break the queue', async () => {
  const h = makeQueue({
    onError: () => { throw new Error('observer bug') },
    onDone: (ok: boolean) => { if (!ok) h.events.push('done-fail') },
  })
  h.queue.push()
  h.fire()
  h.settle(0, false)
  await flush()
  assert.deepEqual(h.events, ['start', 'done-fail'])
  h.queue.push()
  h.fire()
  h.settle(1)
  await flush()
  assert.deepEqual(h.events, ['start', 'done-fail', 'start'])
})

test('stop cancels the pending window and later pushes are ignored', async () => {
  const h = makeQueue()
  h.queue.push()
  assert.equal(h.armed.length, 1)
  await h.queue.stop()
  assert.equal(h.armed.length, 0)
  assert.equal(h.queue.waiting(), false)
  h.queue.push()
  assert.equal(h.armed.length, 0, 'a stopped queue never arms again')
})

test('stop waits for the in-flight run and resolves even when it fails', async () => {
  const h = makeQueue()
  h.queue.push()
  h.fire()
  const stopping = h.queue.stop()
  h.settle(0, false)
  await stopping
  assert.deepEqual(h.events, ['start', 'error:boom', 'fail'])
  h.queue.push()
  assert.equal(h.armed.length, 0)
})
test('inspectHmrWiring reports link vs copy and hmr coverage per profile', () => {
  const probe = {
    listProfiles: () => ['web', 'desktop', 'empty', 'bare'],
    packageRealPath: (profile: string) =>
      profile === 'web' ? '/repo' : profile === 'desktop' ? '/somewhere/copy' : profile === 'bare' ? '/repo' : undefined,
    readPatch: (profile: string) =>
      profile === 'web'
        ? '- id: hmr\n  name: "@deepseek-ai/dsh-hmr"\n  config:\n    root:\n      - /repo\n'
        : profile === 'bare'
          ? '- id: hmr\n  name: "@deepseek-ai/dsh-hmr"\n'
          : '',
  }
  assert.deepEqual(inspectHmrWiring({ root: '/repo', probe }), [
    { profile: 'bare', kind: 'linked', hmrEntryPresent: true, hmrCoversRepo: false },
    { profile: 'desktop', kind: 'copy', hmrEntryPresent: false, hmrCoversRepo: false },
    { profile: 'web', kind: 'linked', hmrEntryPresent: true, hmrCoversRepo: true },
  ])
})

test('inspectHmrWiring skips profiles without the package and tolerates a missing profiles root', () => {
  const none = { listProfiles: () => [] as string[], packageRealPath: () => undefined, readPatch: () => undefined }
  assert.deepEqual(inspectHmrWiring({ root: '/repo', probe: none }), [])
  const skipped = {
    listProfiles: () => ['a', 'b'],
    packageRealPath: (profile: string) => (profile === 'a' ? '/repo' : undefined),
    readPatch: () => undefined,
  }
  assert.deepEqual(inspectHmrWiring({ root: '/repo', probe: skipped }), [
    { profile: 'a', kind: 'linked', hmrEntryPresent: false, hmrCoversRepo: false },
  ])
})
