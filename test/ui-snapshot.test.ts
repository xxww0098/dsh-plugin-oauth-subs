import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'

// jsdom / react / react-dom are not devDependencies of this repo, so the
// snapshot tests borrow a local copy. Point DSH_TEST_JSDOM / DSH_TEST_REACT /
// DSH_TEST_REACT_DOM at your own install; when any of them is missing the
// tests skip (naming the missing path) instead of failing the run at import.
const JSDOM_API = process.env.DSH_TEST_JSDOM || '/Users/xxww/Code/REPO/ai-gateway/frontend/node_modules/jsdom/lib/api.js'
const REACT = process.env.DSH_TEST_REACT || '/Users/xxww/Code/REPO/folio/node_modules/react/index.js'
const REACT_DOM = process.env.DSH_TEST_REACT_DOM || '/Users/xxww/Code/REPO/folio/node_modules/react-dom/client.js'
const STATUS_STORE = 'dsh-plugin-oauth-subs.status'

const missing = [JSDOM_API, REACT, REACT_DOM].filter((path) => !existsSync(path))
const run: typeof test = missing.length === 0
  ? test
  : ((name: string, fn: any) => test.skip(`${name} (skipped: ${missing[0]} not found; set DSH_TEST_JSDOM/DSH_TEST_REACT/DSH_TEST_REACT_DOM)`, fn)) as any

// Every mounted panel is torn down after the file: an unmounted root plus a
// closed jsdom window stops the client's polling timers, so the process exits
// instead of hanging `npm test` on a live event loop.
const mounted: { dom: any, root: any, act: any }[] = []
after(async () => {
  for (const { dom, root, act } of mounted.splice(0)) {
    try { await act(async () => { root.unmount() }) } catch { /* already gone */ }
    dom.window.close()
  }
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((ok, no) => { resolve = ok; reject = no })
  return { promise, resolve, reject }
}

function snap(autoUpdate) {
  return { autoUpdate, accounts: [], catalog: [] }
}

async function mountPanel(hooks: { status?: (payload: any) => Promise<any> } = {}) {
  const { JSDOM } = await import(JSDOM_API)
  const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1/',
    pretendToBeVisual: true,
  })
  const g = globalThis as any
  g.window = dom.window
  g.document = dom.window.document
  g.HTMLElement = dom.window.HTMLElement
  g.Element = dom.window.Element
  g.Node = dom.window.Node
  g.localStorage = dom.window.localStorage
  g.IS_REACT_ACT_ENVIRONMENT = true
  const React = await import(REACT)
  const { createRoot } = await import(REACT_DOM)
  const { act } = React
  const statusCalls = []
  const modelCalls = []
  // Every other method is recorded so a test can assert that an action did
  // (or did not) reach the host.
  const calls = []
  const rpc = {
    call(_route, method, payload) {
      if (method !== 'status' && method !== 'models') calls.push({ method, payload })
      if (method === 'status') {
        if (hooks.status) return hooks.status(payload)
        const gate = deferred()
        statusCalls.push({ payload, gate })
        return gate.promise
      }
      if (method === 'models') {
        const gate = deferred()
        modelCalls.push({ payload, gate })
        return gate.promise
      }
      if (method === 'update') return Promise.resolve({})
      if (method === 'proxyGet') return new Promise(() => undefined)
      if (method === 'autoUpdate') return Promise.resolve(true)
      return Promise.resolve(undefined)
    },
  }
  let panel
  dom.window.__ModuleLoader__ = {
    load(mod) {
      const plugin = mod.factory((id) => {
        if (id === 'react') return React
        throw new Error(id)
      })
      plugin.apply({
        get: () => ({ rpc }),
        slots: {
          inject(_name, fill) { fill() },
          register(desc, component) {
            if (desc.name === 'main') panel = component
            return component
          },
        },
      })
    },
  }
  const src = await readFile(new URL('../lib/ui/client.js', import.meta.url), 'utf8')
  dom.window.eval(src)
  const root = createRoot(dom.window.document.getElementById('root'))
  await act(async () => {
    root.render(React.createElement(panel, { rpc, close() {} }))
  })
  mounted.push({ dom, root, act })
  return { React, act, statusCalls, modelCalls, calls, root, document: dom.window.document }
}

async function shown(act, read) {
  const start = Date.now()
  for (;;) {
    const value = read()
    if (value) return value
    if (Date.now() - start > 2000) throw new Error('timed out waiting for the panel')
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
  }
}

run('a later snapshot stays checked after an earlier poll returns', async () => {
  const { act, statusCalls, document } = await mountPanel()
  const stale = await shown(act, () => statusCalls[0])
  await act(async () => {
    document.querySelector('[role="tab"]').parentElement.querySelectorAll('[role="tab"]')
      .forEach((tab) => { if (tab.textContent === '设置') tab.click() })
  })
  const box = await shown(act, () => document.querySelector('input[aria-label="检测到新版本时自动更新"]'))
  await act(async () => { box.click() })
  const fresh = await shown(act, () => statusCalls.find((call) => call.payload?.fresh === true))
  await act(async () => { fresh.gate.resolve(snap(true)) })
  await shown(act, () => box.checked === true)
  await act(async () => { stale.gate.resolve(snap(false)) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  const stored = JSON.parse(localStorage.getItem(STATUS_STORE) ?? 'null')
  assert.equal(box.checked, true)
  assert.equal(stored.autoUpdate, true)
})

run('an earlier poll failure does not paint over a newer snapshot', async () => {
  const { act, statusCalls, document } = await mountPanel()
  const stale = await shown(act, () => statusCalls[0])
  await act(async () => {
    document.querySelectorAll('[role="tab"]').forEach((tab) => {
      if (tab.textContent === '设置') tab.click()
    })
  })
  const box = await shown(act, () => document.querySelector('input[aria-label="检测到新版本时自动更新"]'))
  await act(async () => { box.click() })
  const fresh = await shown(act, () => statusCalls.find((call) => call.payload?.fresh === true))
  await act(async () => { fresh.gate.resolve(snap(true)) })
  await shown(act, () => box.checked === true)
  await act(async () => { stale.gate.reject(new Error('STALE_POLL_FAILED')) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  const stored = JSON.parse(localStorage.getItem(STATUS_STORE) ?? 'null')
  assert.equal(box.checked, true)
  assert.equal(stored.autoUpdate, true)
  assert.equal(document.body.textContent.includes('STALE_POLL_FAILED'), false)
})

run('a model snapshot stays after an earlier poll returns', async () => {
  let hold = false
  const held = []
  const older = {
    autoUpdate: false,
    accounts: [],
    catalog: [{ family: 'codex', provider: 'codex', displayName: 'Codex', loggedIn: true, models: [{ key: 'probe', name: 'Probe', enabled: false, id: 'probe' }] }],
  }
  const { act, modelCalls, document } = await mountPanel({
    status() {
      if (!hold) return Promise.resolve(older)
      const gate = deferred()
      held.push(gate)
      return gate.promise
    },
  })
  await act(async () => {
    document.querySelectorAll('[role="tab"]').forEach((tab) => { if (tab.textContent === '模型') tab.click() })
  })
  const box = await shown(act, () => document.querySelector('input[aria-label="Probe"]'))
  let hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  hold = true
  hidden = true
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  hidden = false
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  const stale = await shown(act, () => held[0])
  await act(async () => { box.click() })
  const learned = await shown(act, () => modelCalls[0])
  const newer = {
    autoUpdate: true,
    accounts: [],
    catalog: [{ family: 'codex', provider: 'codex', displayName: 'Codex', loggedIn: true, models: [{ key: 'probe', name: 'Probe', enabled: true, id: 'probe' }] }],
  }
  await act(async () => { learned.gate.resolve(newer) })
  await shown(act, () => JSON.parse(localStorage.getItem(STATUS_STORE) ?? 'null')?.autoUpdate === true)
  await act(async () => { stale.resolve(older) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  const stored = JSON.parse(localStorage.getItem(STATUS_STORE) ?? 'null')
  assert.equal(stored.autoUpdate, true)
  assert.equal(stored.catalog[0].models[0].enabled, true)
})

run('a checkbox click stays on when an earlier poll returns before the fresh snapshot', async () => {
  let hold = false
  const held = []
  const { act, statusCalls, document } = await mountPanel({
    status(payload) {
      if (!hold) return Promise.resolve(snap(false))
      const gate = deferred()
      held.push({ payload, gate })
      return gate.promise
    },
  })
  await act(async () => {
    document.querySelectorAll('[role="tab"]').forEach((tab) => { if (tab.textContent === '设置') tab.click() })
  })
  const box = await shown(act, () => document.querySelector('input[aria-label="检测到新版本时自动更新"]'))
  let hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  hold = true
  hidden = true
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  hidden = false
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  const stale = await shown(act, () => held[0])
  await act(async () => { box.click() })
  const fresh = await shown(act, () => held.find((call) => call.payload?.fresh === true))
  await act(async () => { stale.gate.resolve(snap(false)) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  assert.equal(box.checked, true)
  await act(async () => { fresh.gate.resolve(snap(true)) })
  await shown(act, () => JSON.parse(localStorage.getItem(STATUS_STORE) ?? 'null')?.autoUpdate === true)
  assert.equal(box.checked, true)
  assert.equal(statusCalls.length, 0)
})

run('a newer poll stays after a model snapshot that started earlier returns', async () => {
  let hold = false
  const held = []
  const older = {
    autoUpdate: false,
    accounts: [],
    catalog: [{ family: 'codex', provider: 'codex', displayName: 'Codex', loggedIn: true, models: [{ key: 'probe', name: 'Probe', enabled: false, id: 'probe' }] }],
  }
  const newer = {
    autoUpdate: true,
    accounts: [],
    catalog: [{ family: 'codex', provider: 'codex', displayName: 'Codex', loggedIn: true, models: [{ key: 'probe', name: 'Probe', enabled: true, id: 'probe' }] }],
  }
  const { act, modelCalls, document } = await mountPanel({
    status() {
      if (!hold) return Promise.resolve(older)
      const gate = deferred()
      held.push(gate)
      return gate.promise
    },
  })
  await act(async () => {
    document.querySelectorAll('[role="tab"]').forEach((tab) => { if (tab.textContent === '模型') tab.click() })
  })
  const box = await shown(act, () => document.querySelector('input[aria-label="Probe"]'))
  hold = true
  await act(async () => { box.click() })
  const learned = await shown(act, () => modelCalls[0])
  let hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  hidden = true
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  hidden = false
  document.dispatchEvent(new document.defaultView.Event('visibilitychange'))
  const poll = await shown(act, () => held[0])
  await act(async () => { poll.resolve(newer) })
  await shown(act, () => JSON.parse(localStorage.getItem(STATUS_STORE) ?? 'null')?.autoUpdate === true)
  await act(async () => { learned.gate.resolve(older) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
  const stored = JSON.parse(localStorage.getItem(STATUS_STORE) ?? 'null')
  assert.equal(stored.autoUpdate, true)
  assert.equal(stored.catalog[0].models[0].enabled, true)
})
run('退出 opens the second confirm, and the host sees nothing until it is ticked', async () => {
  const snapshot = {
    autoUpdate: false,
    catalog: [],
    accounts: {
      codex: {
        loggedIn: true,
        busy: false,
        accounts: [{ id: 'a1', account: 'a@example.com', active: true }],
      },
    },
  }
  const { act, document, calls } = await mountPanel({ status: () => Promise.resolve(snapshot) })
  const row = await shown(act, () => document.querySelector('.osubs-acct button[aria-label="退出"]'))
  await act(async () => { row.click() })
  // First click only opens the dialog: the account is still signed in.
  const dialog = await shown(act, () => document.querySelector('[role="alertdialog"]'))
  assert.equal(calls.some((call) => call.method === 'logout'), false)
  assert.match(dialog.textContent, /a@example\.com/)
  const confirmOf = () => [...dialog.querySelectorAll('.osubs-dsw-foot button')]
    .find((button) => button.textContent === '确认退出')
  assert.equal(confirmOf().disabled, true)
  // The acknowledgement checkbox is what unlocks 确认退出; cancel sends nothing.
  await act(async () => { dialog.querySelector('input[type="checkbox"]').click() })
  assert.equal(confirmOf().disabled, false)
  await act(async () => { confirmOf().click() })
  const logout = await shown(act, () => calls.find((call) => call.method === 'logout'))
  assert.deepEqual(logout.payload, { provider: 'codex', id: 'a1' })
  await shown(act, () => document.querySelector('[role="alertdialog"]') === null)
})

run('the rail mark counts switched-on models per family, and nothing at zero', async () => {
  const snapshot = {
    autoUpdate: false,
    accounts: {},
    catalog: [
      {
        family: 'codex',
        provider: 'codex',
        displayName: 'Codex',
        loggedIn: true,
        models: [
          { key: 'oauth-codex/a', name: 'A', id: 'a', enabled: true },
          { key: 'oauth-codex/b', name: 'B', id: 'b', enabled: true },
          { key: 'oauth-codex/c', name: 'C', id: 'c', enabled: false },
        ],
      },
      {
        family: 'cline',
        provider: 'cline',
        displayName: 'Cline',
        loggedIn: true,
        models: [{ key: 'oauth-cline/d', name: 'D', id: 'd', enabled: false }],
      },
      {
        family: 'kiro',
        provider: 'kiro',
        displayName: 'Kiro',
        loggedIn: false,
        models: [{ key: 'oauth-kiro/e', name: 'E', id: 'e', enabled: true }],
      },
    ],
  }
  const { act, document } = await mountPanel({ status: () => Promise.resolve(snapshot) })
  const rows = await shown(act, () => {
    const list = [...document.querySelectorAll('.osubs-rail-item')]
    return list.length > 1 ? list : null
  })
  const rowOf = (name) => rows.find((el) => el.querySelector('.osubs-rail-name')?.textContent === name)

  const mark = rowOf('Codex').querySelector('.osubs-rail-on')
  assert.ok(mark, 'Codex has two of three models on')
  assert.equal(mark.textContent, '2')
  assert.equal(mark.getAttribute('role'), 'img')
  assert.equal(mark.getAttribute('title'), '已启用 2 / 3 个模型')
  assert.equal(mark.getAttribute('aria-label'), '已启用 2 / 3 个模型')
  // A switch drawn on: the knob sits at the right of the track.
  assert.equal(mark.querySelector('.osubs-rail-sw').getAttribute('viewBox'), '0 0 16 10')
  assert.equal(mark.querySelector('circle').getAttribute('cx'), '11.5')

  // All off (signed in, awaiting a pick) and signed out: no mark at all.
  assert.equal(rowOf('Cline').querySelector('.osubs-rail-on'), null)
  assert.equal(rowOf('Kiro').querySelector('.osubs-rail-on'), null)
  // 全部 sums the families that may count.
  assert.equal(rowOf('全部').querySelector('.osubs-rail-on').textContent, '2')
})

