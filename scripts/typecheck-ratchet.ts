#!/usr/bin/env node
/**
 * Type-debt ratchet.
 *
 * The host build type-checks with `strictNullChecks` on, so `npm test` already
 * fails on a host type error. This script additionally guards the two switches
 * a future edit could quietly remove:
 *
 *   1. `host` — re-checks with `--noCheck false`, so re-adding `noCheck: true`
 *      to tsconfig.json cannot silently disable checking again.
 *   2. `strict` — re-checks with `--strictNullChecks --useUnknownInCatchVariables`,
 *      so dropping either flag from tsconfig.json cannot silently give up
 *      null-safety or unknown-typed catch variables.
 *
 * `noImplicitAny` is deliberately NOT tracked here: it currently reports ~2000
 * errors that are almost all "annotate this parameter", i.e. a typing project
 * rather than a cleanup. See docs/error.md before attempting it.
 *
 * Both counts must stay at 0.
 *
 * Each count is compared against `scripts/typecheck-baseline.json`:
 *
 *   - more errors than the baseline -> exit 1 (new debt slipped in)
 *   - fewer errors than the baseline -> exit 0, and tell you to lower it
 *
 *   node --experimental-strip-types scripts/typecheck-ratchet.ts
 *   node --experimental-strip-types scripts/typecheck-ratchet.ts --update
 *   node --experimental-strip-types scripts/typecheck-ratchet.ts --json
 *
 * Baselines only move down on their own; `--update` is the deliberate escape
 * hatch for accepting new debt, and a reviewer should see that diff.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const BASELINE_PATH = join(HERE, 'typecheck-baseline.json')
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')

/** Each tracked check: baseline key, human label, and the tsc flags to run. */
export const CHECKS = [
  { key: 'errors', label: 'host type errors', args: ['--noEmit', '--noCheck', 'false'] },
  { key: 'strict', label: 'strict-flag guard', args: ['--noEmit', '--strictNullChecks', '--useUnknownInCatchVariables'] },
]

export function parseArgs(argv) {
  const args = { update: false, json: false }
  for (const token of argv) {
    if (token === '--update') args.update = true
    else if (token === '--json') args.json = true
    else throw new Error(`unknown flag ${token}`)
  }
  return args
}

/** Run one type check and return tsc's combined output. */
export function runTypecheck(args, { spawnFn = spawnSync, tsc = TSC } = {}) {
  const result = spawnFn(process.execPath, [tsc, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  return `${result.stdout ?? ''}${result.stderr ?? ''}`
}

/** Count errors and group them by file, so the report points somewhere. */
export function summarize(output) {
  const byFile = new Map()
  let total = 0
  for (const line of output.split('\n')) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS\d+:/)
    if (!match) continue
    total += 1
    byFile.set(match[1], (byFile.get(match[1]) ?? 0) + 1)
  }
  const files = [...byFile].sort((a, b) => b[1] - a[1])
  return { total, files }
}

export function readBaseline(path = BASELINE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const baseline = readBaseline()
  const results = CHECKS.map((check) => ({ ...check, ...summarize(runTypecheck(check.args)) }))

  if (args.update) {
    const next = {}
    for (const r of results) next[r.key] = r.total
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`)
    process.stdout.write(`typecheck baselines updated: ${results.map((r) => `${r.key}=${r.total}`).join(' ')}\n`)
    return
  }

  if (args.json) {
    const payload = {}
    for (const r of results) payload[r.key] = { total: r.total, baseline: baseline[r.key] ?? 0, delta: r.total - (baseline[r.key] ?? 0) }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  }

  let failed = false
  let shrank = false
  for (const r of results) {
    const allowed = baseline[r.key] ?? 0
    if (r.total > allowed) {
      failed = true
      console.error(`${r.label} grew: ${r.total}, baseline ${allowed} (+${r.total - allowed})`)
      for (const [file, count] of r.files.slice(0, 8)) console.error(`  ${String(count).padStart(4)}  ${file}`)
    } else if (r.total < allowed) {
      shrank = true
      process.stdout.write(`${r.label} shrank: ${allowed} -> ${r.total}\n`)
    } else {
      process.stdout.write(`${r.label} unchanged: ${r.total}\n`)
    }
  }

  if (failed) {
    console.error('Fix the new errors, or accept them with:')
    console.error('  node --experimental-strip-types scripts/typecheck-ratchet.ts --update')
    process.exit(1)
  }
  if (shrank) {
    process.stdout.write('Lower the baseline with:\n')
    process.stdout.write('  node --experimental-strip-types scripts/typecheck-ratchet.ts --update\n')
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main()
