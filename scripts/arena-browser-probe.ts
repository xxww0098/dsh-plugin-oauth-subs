/** Live test of the shipped UI/RPC/Chrome reader/cache, without a DSH process.
 * npm run build; node --experimental-strip-types scripts/arena-browser-probe.ts
 * Open the printed URL, select 榜单, then 浏览器验证.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { registerRpc } from '../lib/index.js'
import { fetchArenaWithChrome } from '../lib/utils/arena-browser.js'
import { ARENA_CATEGORIES, createArenaSource, parseArenaBoard } from '../lib/utils/arena.js'
import { writePrivateText } from '../lib/utils/private-text.js'

const dataDir = resolve('.local/arena-browser-live')
const cachePath = resolve(dataDir, 'arena-cache.json')
await mkdir(dataDir, { recursive: true })
for (const [name, url] of [
  ['react.js', 'https://unpkg.com/react@18.3.1/umd/react.development.js'],
  ['react-dom.js', 'https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js'],
]) {
  try { await readFile(resolve(dataDir, name)) } catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    assert.equal(response.status, 200)
    await writeFile(resolve(dataDir, name), await response.text())
  }
}
try { await readFile(cachePath) } catch {
  const board = parseArenaBoard(JSON.stringify({ snapshot: {
    lastUpdated: '2026-10-12T12:00:00Z', totalSessions: 1, modelCount: 1,
    rows: [{ model: '旧缓存测试行', modelOrganization: 'Test fixture', avgScore: { value: 0, ci: 0 }, sessions: 1 }],
  }, costStats: { entries: [] } }))
  await writePrivateText(cachePath, JSON.stringify({ at: Date.now(), blocked: true,
    boards: Object.fromEntries(ARENA_CATEGORIES.map(({ id }) => [id, board])) }))
}
const arena = createArenaSource({ cachePath, browserFetch: signal => fetchArenaWithChrome({ signal }) })
let dispatch: (method: string, payload: unknown) => Promise<any>
const controller = {
  snapshot: async () => ({ accounts: {}, catalog: [], models: [], update: { version: 'test' } }),
  arena: (payload: any = {}) => payload.browser ? arena.browser(payload.browser) : arena.read(payload.fresh === true),
}
const connection = { rpc: { handle: (_channel, handler) => { dispatch = handler } }, fetch: { register: () => {} } }
registerRpc({ connection, inject: (_services, fn) => fn({ connection, get: () => connection }) }, controller)
const nonce = randomUUID()
let origin = ''
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end(); return }
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Arena 正式插件活测</title>
        <style>html,body,#root{margin:0;height:100%;font:13px/1.5 system-ui;color:#1d1d1f;background:#fff}</style>
        <div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script>
        <script>
        const rpc={call:async(channel,method,payload)=>(await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','X-Probe-Nonce':${JSON.stringify(nonce)}},body:JSON.stringify({method,payload})})).json()};
        window.__ModuleLoader__={load:mod=>{
          const plugin=mod.factory(id=>{if(id==='react')return React;throw new Error(id)});
          plugin.apply({get:()=>({rpc}),slots:{inject:(name,fn)=>fn(),register:(spec,Component)=>{
            if(spec.name==='main')ReactDOM.createRoot(document.querySelector('#root')).render(React.createElement(Component,{rpc}));
          }}});
        }};
        </script><script src="/client.js"></script></html>`)
      return
    }
    if (req.method === 'GET' && ['/react.js', '/react-dom.js', '/client.js'].includes(req.url ?? '')) {
      res.setHeader('Content-Type', 'application/javascript')
      res.end(await readFile(req.url === '/client.js' ? resolve('lib/ui/client.js') : resolve(dataDir, req.url!.slice(1))))
      return
    }
    if (req.method === 'GET' && req.url === '/proof') {
      const state = arena.browser('status')
      const persisted = JSON.parse(await readFile(cachePath, 'utf8'))
      if (state.answer) {
        assert.deepEqual(persisted, state.answer)
        assert.equal(persisted.blocked, undefined)
        assert.equal(persisted.error, undefined)
        const reopened = createArenaSource({ cachePath, fetchImpl: async () => { throw new Error('must read cache') } })
        assert.deepEqual(await reopened.read(), state.answer)
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ busy: state.busy, error: state.error, verified: !!state.answer, cachePath,
        boards: Object.fromEntries(Object.entries(persisted.boards).map(([id, board]: [string, any]) => [id, {
          date: board.lastUpdated, rows: board.rows.length,
          costRows: board.rows.filter(row => row.costUsd !== null).length,
          tokenRows: board.rows.filter(row => row.tokensM !== null).length,
        }])) }))
      return
    }
    if (req.method !== 'POST' || req.url !== '/rpc' || req.headers.origin !== origin || req.headers['x-probe-nonce'] !== nonce) {
      res.writeHead(403).end(); return
    }
    let body = ''
    for await (const chunk of req) { body += chunk; if (body.length > 65_536) throw new Error('request too large') }
    const { method, payload } = JSON.parse(body)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(await dispatch!(method, payload)))
  } catch (error) {
    res.writeHead(500).end(JSON.stringify({ error: String(error) }))
  }
})
server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  origin = 'http://127.0.0.1:' + address.port
  console.log(origin)
  console.log('cache: ' + cachePath)
})
process.once('SIGINT', () => { arena.dispose(); server.close() })
