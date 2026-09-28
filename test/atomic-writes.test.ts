import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

// State the plugin keeps on disk (signed-out.json, the outbound proxy URL,
// update prefs, …) goes through src/utils/private-text.ts: temp file + rename,
// mode 0600. A bare writeFile truncates first, so a crash mid-write leaves a
// torn file — and for signed-out.json or the proxy URL a torn file reads as
// "nothing set": a signed-out family logs itself back in, the proxy is
// silently bypassed.
const ROOT = new URL('..', import.meta.url).pathname
const OWNERS = new Set([
  'src/utils/private-text.ts',
  'src/oauth/models.ts', // temp file + rename of the user's own cordis.patch.yml, which must keep its mode
])

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

test('state files are written atomically: no bare writeFile outside private-text.ts', () => {
  const offenders: string[] = []
  for (const file of sources(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file)
    if (OWNERS.has(rel)) continue
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const code = line.trim()
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
      if (/(?<![\w$.])writeFile\s*\(/.test(line)) offenders.push(`${rel}:${index + 1} ${code}`)
    })
  }
  assert.deepEqual(offenders, [], `write state through writePrivateText:\n${offenders.join('\n')}`)
})
