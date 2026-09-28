import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const root = join(process.env.HOME, '.dsh/sessions'); const cutoff = Date.now() - 30 * 86400e3
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/^session.*\.jsonl(\.zstd)?$/.test(n) && st.mtimeMs >= cutoff) files.push(p) } }; walk(root)
const agg = {}; const seen = new Set()
for (const file of files) {
  let text; try { text = execFileSync('zstd', ['-dcq', file], { maxBuffer: 1 << 30 }).toString('utf8') } catch { continue }
  let provider = null
  for (const l of text.split('\n')) {
    if (!l.includes('"failure"') && !l.includes('"request/context"')) continue
    let e; try { e = JSON.parse(l) } catch { continue }
    if (e.type === 'request/context') { provider = e.data?.provider; continue }
    if (e.type !== 'assistant/attempt') continue
    for (const f of e.data?.stream ?? []) {
      const fail = f.chunk?.reason?.failure; if (!fail) continue
      const k = `${e.time}:${fail.message}`; if (seen.has(k)) continue; seen.add(k)
      const p = provider ?? '?'; const code = fail.code ?? '?'
      const a = agg[p] ??= {}; const b = a[code] ??= { n: 0, ex: new Map() }; b.n++
      const m = String(fail.message).replace(/\s+/g, ' ').replace(/\d{3,}/g, 'N').slice(0, 90); b.ex.set(m, (b.ex.get(m) ?? 0) + 1)
    }
  }
}
for (const [p, codes] of Object.entries(agg)) {
  if (!p.startsWith('oauth-')) continue
  console.log(p, Object.entries(codes).map(([c, b]) => `${c}=${b.n}`).join(' '))
  for (const [c, b] of Object.entries(codes)) if (!['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE'].includes(c)) for (const [m, n] of [...b.ex].sort((x, y) => y[1] - x[1]).slice(0, 3)) console.log(`   [not retried] ${c} x${n}: ${m}`)
}
