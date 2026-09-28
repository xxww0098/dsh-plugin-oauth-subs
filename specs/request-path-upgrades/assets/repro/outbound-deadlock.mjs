// F1 repro: a saved outbound proxy URL leaves `outbound.ready` pending forever
// when `undici` cannot be resolved, so the loopback proxy never starts.
// Run from the repo root after `npm run build`:
//   node specs/request-path-upgrades/assets/repro/outbound-deadlock.mjs
// Before the fix: unhandledRejection + "STILL PENDING". After: "ready resolved".
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { createOutboundSession } = await import(new URL('../../../../lib/utils/outbound.js', import.meta.url))
process.on('unhandledRejection', (error) => console.log('unhandledRejection:', String(error?.message).split('\n')[0]))

const path = join(mkdtempSync(join(tmpdir(), 'outbound-')), 'outbound-proxy.json')
writeFileSync(path, JSON.stringify({ url: 'http://127.0.0.1:7890' }))
const session = createOutboundSession({ path, env: {} })
console.log(await Promise.race([
  session.ready.then(() => 'ready resolved'),
  new Promise((resolve) => setTimeout(() => resolve('ready STILL PENDING after 2s'), 2000)),
]))
process.exit(0)
