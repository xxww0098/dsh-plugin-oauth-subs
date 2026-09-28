import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const root = join(process.env.HOME, '.dsh/sessions'); const cutoff = Date.now() - 40 * 86400e3
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/^session.*\.jsonl(\.zstd)?$/.test(n) && st.mtimeMs >= cutoff) files.push(p) } }; walk(root)
const buckets = {}; const done = new Set()
for (const file of files) {
  let text; try { text = execFileSync('zstd', ['-dcq', file], { maxBuffer: 1 << 30 }).toString('utf8') } catch { continue }
  if (!text.includes('oauth-antigravity')) continue
  const calls = []; const seen = new Set()
  for (const l of text.split('\n')) {
    if (!l.includes('"assistant/message"')) continue
    let e; try { e = JSON.parse(l) } catch { continue }
    const u = e.data?.usage ?? e.data?.message?.usage; if (!u || e.data?.message?.source?.provider !== 'oauth-antigravity') continue
    const k = `${e.data.turn}:${e.data.step}`; if (seen.has(k)) continue; seen.add(k)
    calls.push({ t: e.time, billed: (u.inputTokens ?? 0) + (u.cacheReadTokens ?? 0), read: u.cacheReadTokens ?? 0 })
  }
  const sig = `${calls.length}:${calls[0]?.t}`; if (done.has(sig) || calls.length < 20) continue; done.add(sig)
  for (let i = 1; i < calls.length; i++) {
    const b = Math.min(Math.floor(i / 40) * 40, 280); const key = `${String(b).padStart(3)}-${b + 39}`
    const x = buckets[key] ??= { n: 0, read: 0, billed: 0 }; x.n++; x.read += calls[i].read; x.billed += calls[i].billed
  }
}
for (const [k, x] of Object.entries(buckets).sort()) console.log(`call#${k}: n=${x.n} hit=${(100 * x.read / x.billed).toFixed(1)}% avgBilled=${Math.round(x.billed / x.n / 1000)}k`)
