// Idle gap between an LLM response ending and the next LLM request starting, per provider.
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const root = join(process.env.HOME, '.dsh/sessions'); const cutoff = Date.now() - 14 * 86400e3
const files = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); const st = statSync(p); if (st.isDirectory()) walk(p); else if (/^session.*\.jsonl(\.zstd)?$/.test(n) && st.mtimeMs >= cutoff) files.push(p) } }; walk(root)
const gaps = {}
for (const file of files) {
  let text; try { text = execFileSync('zstd', ['-dcq', file], { maxBuffer: 1 << 30 }).toString('utf8') } catch { continue }
  const events = []; for (const l of text.split('\n')) { if (l.trim()) try { events.push(JSON.parse(l)) } catch {} }
  let lastEnd = null, lastProvider = null
  for (const e of events) {
    if (e.type === 'assistant/message') { lastEnd = e.time; lastProvider = e.data?.message?.source?.provider }
    else if (e.type === 'step/start' && lastEnd != null && lastProvider) {
      const g = (e.time - lastEnd) / 1000
      if (g >= 0 && g < 3600) (gaps[lastProvider] ??= []).push(g)
      lastEnd = null
    }
  }
}
for (const [p, a] of Object.entries(gaps).sort((x, y) => y[1].length - x[1].length)) {
  if (a.length < 50) continue
  const s = a.sort((x, y) => x - y); const q = (f) => s[Math.floor(f * (s.length - 1))].toFixed(1)
  console.log(`${p}: n=${a.length} gap p50=${q(.5)}s p75=${q(.75)}s p90=${q(.9)}s  share>4s=${(100 * a.filter((g) => g > 4).length / a.length).toFixed(0)}%  share>30s=${(100 * a.filter((g) => g > 30).length / a.length).toFixed(0)}%`)
}
