import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'

// src/utils/outbound.ts is the single owner of outbound HTTP. Everything else
// takes `outboundFetch` (or an injected fetchFn) — a stray global fetch or
// undici import silently bypasses the configured proxy.
const ROOT = new URL('..', import.meta.url).pathname
const OWNER = 'src/utils/outbound.ts'
const RULES = [
  ['undici import', /from\s+['"]undici['"]|(?:require|import)\(\s*['"]undici['"]\s*\)/],
  ['global fetch default', /(?:=|\?\?|\|\|)\s*(?:globalThis\.)?fetch\b(?![\w$])/],
  ['bare global fetch call', /(?<![\w$.])(?:globalThis\.)?fetch\s*\(/],
  ['setGlobalDispatcher', /setGlobalDispatcher/],
] as const

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

test('outbound firewall: only src/utils/outbound.ts touches undici or the global fetch', () => {
  const offenders: string[] = []
  for (const file of sources(join(ROOT, 'src'))) {
    const rel = relative(ROOT, file)
    if (rel === OWNER) continue
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      const code = line.trim()
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return
      for (const [name, pattern] of RULES) {
        if (pattern.test(line)) offenders.push(`${rel}:${index + 1} ${name}: ${code}`)
      }
    })
  }
  assert.deepEqual(offenders, [], `outbound HTTP must go through ${OWNER}:\n${offenders.join('\n')}`)
})
