#!/usr/bin/env node
/** Opt-in, read-only-account ChatGPT fixed-prefix probe. Never refreshes or switches. */
import { mkdtemp, open } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { probeChatgptCache } from '../lib/oauth/chatgpt/probe.js'
import { listStoredSessions } from '../lib/oauth/store.js'
import { createOutboundSession } from '../lib/utils/outbound.js'
import { writePrivateText } from '../lib/utils/private-text.js'

const USAGE = 'Usage: node --experimental-strip-types scripts/chatgpt-cache-probe.ts --live [--profile desktop] [--account 0] [--out NEW_PRIVATE_REPORT.json]\nMaximum 6 upstream attempts including retries. Spends quota; never refreshes or writes auth. Without --live, no account or network is accessed.'
let outbound: any
let output: string | undefined
let reserved = false
let latest: any = { kind: 'chatgpt-fixed-prefix-probe', status: 'reserved', upstreamAttempts: 0 }

async function main() {
  const args = process.argv.slice(2)
  if (!args.includes('--live') || args.includes('--help')) { console.log(USAGE); return }
  let profile = 'desktop'
  let account = 0
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--live') continue
    const value = args[++i]
    switch (args[i - 1]) {
      case '--profile': if (!/^[A-Za-z0-9_-]{1,64}$/.test(value ?? '')) throw new Error('invalid profile'); profile = value; break
      case '--account': if (!/^[0-9]{1,6}$/.test(value ?? '')) throw new Error('invalid account index'); account = Number(value); break
      case '--out': if (!value) throw new Error('missing output'); output = resolve(value); break
      default: throw new Error('invalid argument')
    }
  }
  output ??= join(await mkdtemp(join(tmpdir(), 'dsh-chatgpt-cache-')), 'report.json')
  // Refuse existing files: inspect a prior report, never accidentally replay a live run.
  const file = await open(output, 'wx', 0o600)
  await file.close()
  reserved = true
  await writePrivateText(output, JSON.stringify(latest) + '\n')
  const dataDir = join(homedir(), '.dsh', 'profiles', profile, 'data', 'dsh-plugin-oauth-subs')
  const rows = await listStoredSessions('chatgpt', join(dataDir, 'auth.json'))
  const session = rows[account]?.session
  if (!session) throw new Error('no chosen account')
  outbound = createOutboundSession({ path: join(dataDir, 'outbound-proxy.json') })
  await outbound.ready
  const report = await probeChatgptCache({ session, fetchFn: (url, init) => outbound.request(url, init), onProgress: async snapshot => {
    latest = { kind: 'chatgpt-fixed-prefix-probe', status: 'running', ...snapshot }
    await writePrivateText(output, JSON.stringify(latest, null, 2) + '\n')
  } })
  latest = { kind: 'chatgpt-fixed-prefix-probe', status: report.stopReason ? 'stopped' : 'complete', ...report }
  await writePrivateText(output, JSON.stringify(latest, null, 2) + '\n')
  console.log(JSON.stringify({ report: output, upstreamAttempts: report.upstreamAttempts, stopReason: report.stopReason ?? null, variants: report.variants }))
  if (report.stopReason) process.exitCode = 1
}

try { await main() }
catch {
  process.exitCode = 1
  if (reserved && output) {
    latest = { ...latest, status: 'failed', stopReason: 'preflight, checkpoint or transport failure' }
    await writePrivateText(output, JSON.stringify(latest, null, 2) + '\n').catch(() => undefined)
  }
  console.error('Probe refused or failed. Check arguments, chosen token lifetime and output path; existing reports are never overwritten. No token refresh or account switch was attempted.')
}
finally { await outbound?.close() }
