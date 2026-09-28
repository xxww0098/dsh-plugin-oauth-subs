// Aggregate cache hit rate + retry causes per provider across recent DSH sessions.
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { annotateCacheCalls } from '../../../../lib/utils/analyze-session.js'

const DAYS = Number(process.argv[2] ?? 30)
const root = join(process.env.HOME, '.dsh/sessions')
const cutoff = Date.now() - DAYS * 86400e3
const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/^session.*\.jsonl(\.zstd)?$/.test(name) && st.mtimeMs >= cutoff) files.push(p)
  }
}
walk(root)

const stats = new Map()
const get = (provider) => {
  if (!stats.has(provider)) stats.set(provider, { sessions: 0, calls: 0, input: 0, read: 0, write: 0, noCacheField: 0, kinds: {}, kindCalls: {}, retries: {}, samples: {}, hits: [] })
  return stats.get(provider)
}

for (const file of files) {
  let text
  try {
    text = file.endsWith('.zstd') ? execFileSync('zstd', ['-dcq', file], { maxBuffer: 1 << 30 }).toString('utf8') : execFileSync('cat', [file], { maxBuffer: 1 << 30 }).toString('utf8')
  } catch { continue }
  const events = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { events.push(JSON.parse(line)) } catch {}
  }
  const byProvider = new Map()
  const seen = new Set()
  for (const e of events) {
    if (e.type === 'assistant/message') {
      const usage = e.data?.usage ?? e.data?.message?.usage
      const provider = e.data?.message?.source?.provider
      if (!usage || !provider) continue
      const key = `${e.data?.turn}:${e.data?.step}:${provider}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!byProvider.has(provider)) byProvider.set(provider, [])
      byProvider.get(provider).push({
        time: e.time, turn: e.data?.turn, step: e.data?.step,
        inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0,
        cacheReadTokens: usage.cacheReadTokens ?? 0, cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        hasCacheField: Object.prototype.hasOwnProperty.call(usage, 'cacheReadTokens'),
      })
    } else if (e.type === 'llm/retry') {
      const s = get(e.data?.provider ?? '?')
      const code = e.data?.failure?.code ?? '?'
      s.retries[code] = (s.retries[code] ?? 0) + 1
      const msg = String(e.data?.failure?.message ?? '').replace(/\s+/g, ' ').slice(0, 140)
      s.samples[code] ??= new Map()
      const bucket = msg.replace(/\d+/g, 'N').slice(0, 80)
      s.samples[code].set(bucket, (s.samples[code].get(bucket) ?? 0) + 1)
    }
  }
  for (const [provider, calls] of byProvider) {
    const s = get(provider)
    s.sessions++
    annotateCacheCalls(calls, events)
    for (const c of calls) {
      s.calls++
      s.input += c.inputTokens
      s.read += c.cacheReadTokens
      s.write += c.cacheWriteTokens
      if (!c.hasCacheField) s.noCacheField++
      s.kinds[c.kind] = (s.kinds[c.kind] ?? 0) + c.inputTokens
      s.kindCalls[c.kind] = (s.kindCalls[c.kind] ?? 0) + 1
    }
  }
}

console.log(`${files.length} session files in last ${DAYS}d\n`)
const rows = [...stats.entries()].sort((a, b) => (b[1].input + b[1].read) - (a[1].input + a[1].read))
for (const [provider, s] of rows) {
  const total = s.input + s.read
  const hit = total ? (100 * s.read / total).toFixed(1) : '-'
  console.log(`${provider}: sessions=${s.sessions} calls=${s.calls} prompt=${(total / 1e6).toFixed(2)}M hit=${hit}% cacheWrite=${(s.write / 1e6).toFixed(2)}M noCacheField=${s.noCacheField}`)
  if (s.calls) {
    const kinds = Object.entries(s.kinds).map(([k, v]) => `${k}:${s.kindCalls[k]}calls/${(v / 1e6).toFixed(2)}M`).join(' ')
    console.log(`   uncached by kind: ${kinds}`)
  }
  const retries = Object.entries(s.retries)
  if (retries.length) {
    console.log(`   host retries: ${retries.map(([k, v]) => `${k}=${v}`).join(' ')}`)
    for (const [code, m] of Object.entries(s.samples)) {
      for (const [msg, n] of [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)) console.log(`     ${code} x${n}: ${msg}`)
    }
  }
}
