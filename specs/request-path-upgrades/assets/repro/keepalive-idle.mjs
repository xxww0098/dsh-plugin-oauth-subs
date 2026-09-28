// F9 repro: with no `Keep-Alive` hint from the server (chatgpt.com and
// ollama.com send none), undici's default drops a pooled connection after
// ~4s idle, so the next request pays a fresh TCP + TLS handshake.
//   npm run build && node specs/request-path-upgrades/assets/repro/keepalive-idle.mjs
// Before the fix (4s default): 1 connection after a 3s gap, 2 after a 6s gap.
// After the fix (outboundFetch keeps 60s): 1 after both gaps.
import http from 'node:http'
import { setTimeout as sleep } from 'node:timers/promises'
import { outboundFetch } from '../../../../lib/utils/outbound.js'

let connections = 0
const server = http.createServer((request, response) => response.end('ok'))
server.keepAliveTimeout = 0 // no Keep-Alive response header
server.on('connection', () => connections++)
server.listen(0)
await new Promise((resolve) => server.once('listening', resolve))
const url = `http://127.0.0.1:${server.address().port}/`
const hit = async () => (await outboundFetch(url, { method: 'POST', body: '{}' })).text()

await hit()
await sleep(3000)
await hit()
console.log('after 3s idle, connections =', connections)
await sleep(6000)
await hit()
console.log('after 6s idle, connections =', connections)
server.close()
process.exit(0)
