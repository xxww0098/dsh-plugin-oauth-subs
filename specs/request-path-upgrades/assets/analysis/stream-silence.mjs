// Longest silence inside successful streams (first chunk .. last chunk), per provider.
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const root = join(process.env.HOME, '.dsh/sessions'); const cutoff = Date.now() - 30 * 86400e3
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/^session.*\.jsonl(\.zstd)?$/.test(n) && st.mtimeMs >= cutoff) files.push(p) } }; walk(root)
const agg = {}; const seen = new Set()
for (const file of files) {
  let text; try { text = execFileSync('zstd', ['-dcq', file], { maxBuffer: 1 << 30 }).toString('utf8') } catch { continue }
  for (const l of text.split('\n')) {
    if (!l.includes('"assistant/message"')) continue
    let e; try { e = JSON.parse(l) } catch { continue }
    const p = e.data?.message?.source?.provider; const s = e.data?.stream
    if (!p?.startsWith('oauth-') || !Array.isArray(s) || s.length < 2) continue
    const k = `${e.time}:${p}`; if (seen.has(k)) continue; seen.add(k)
    const ts = s.map((f) => f.time).filter((t) => typeof t === "number"); if (ts.length < 2) continue; let max = 0; for (let i = 1; i < ts.length; i++) max = Math.max(max, ts[i] - ts[i - 1])
    const a = agg[p] ??= []; a.push(max / 1000)
  }
}
for (const [p, a] of Object.entries(agg).sort((x, y) => y[1].length - x[1].length)) {
  const s = a.sort((x, y) => x - y); const q = (f) => s[Math.floor(f * (s.length - 1))].toFixed(1)
  console.log(`${p}: n=${a.length} maxGap p50=${q(.5)}s p99=${q(.99)}s max=${s.at(-1).toFixed(1)}s  >60s=${a.filter((g) => g > 60).length} >90s=${a.filter((g) => g > 90).length} >110s=${a.filter((g) => g > 110).length}`)
}
