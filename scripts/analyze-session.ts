#!/usr/bin/env node
/**
 * Diagnose a DeepSeek Harness session.jsonl for oauth-subs cache affinity.
 *
 *   node --experimental-strip-types scripts/analyze-session.ts path/to/session.jsonl
 *   node --experimental-strip-types scripts/analyze-session.ts --json path/to/session.jsonl
 *   node --experimental-strip-types scripts/analyze-session.ts --fail-below 80 path/to/session.jsonl
 *
 * Directory mode aggregates every session file under a root per provider:
 *
 *   node --experimental-strip-types scripts/analyze-session.ts --dir ~/.dsh/sessions --since 30d [--until ISO] [--json] [--compare base.json]
 */

import { readFileSync } from 'node:fs'
import {
  analyzeSession,
  analyzeSessionDir,
  compareReports,
  formatAggregate,
  formatComparison,
  formatReport,
  readSessionText,
} from '../lib/utils/analyze-session.js'

/** `30d` → now − 30 days; otherwise an ISO date/time. */
function parseTime(flag, value) {
  const days = /^(\d+)d$/.exec(value ?? '')
  const ms = days ? Date.now() - Number(days[1]) * 86_400_000 : Date.parse(value)
  if (!Number.isFinite(ms)) throw new Error(`${flag} needs an ISO date or Nd`)
  return ms
}

function parseArgs(argv) {
  const args = { json: false, failBelow: null, path: null, dir: null, since: null, until: null, compare: null }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--json') args.json = true
    else if (token === '--dir') args.dir = argv[++i]
    else if (token === '--since') args.since = parseTime(token, argv[++i])
    else if (token === '--until') args.until = parseTime(token, argv[++i])
    else if (token === '--compare') args.compare = argv[++i]
    else if (token === '--fail-below') {
      args.failBelow = Number(argv[++i])
      if (!Number.isFinite(args.failBelow)) throw new Error('--fail-below needs a number')
    } else if (token.startsWith('-')) {
      throw new Error(`unknown flag ${token}`)
    } else {
      args.path = token
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.dir) {
    const report = analyzeSessionDir(args.dir, { since: args.since, until: args.until })
    const output = args.compare ? compareReports(JSON.parse(readFileSync(args.compare, 'utf8')), report) : report
    const text = args.json ? JSON.stringify(output, null, 2) : args.compare ? formatComparison(output) : formatAggregate(output)
    process.stdout.write(`${text}\n`)
    return
  }
  if (!args.path) {
    console.error('usage: node --experimental-strip-types scripts/analyze-session.ts [--json] [--fail-below N] <session.jsonl[.zstd]>')
    console.error('       node --experimental-strip-types scripts/analyze-session.ts --dir <path> [--since ISO|Nd] [--until ISO] [--json] [--compare base.json]')
    process.exit(2)
  }
  const report = analyzeSession(readSessionText(args.path))
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatReport(report)}\n`)
  }
  if (args.failBelow != null && report.weightedCacheHit * 100 < args.failBelow) {
    console.error(`cache hit ${(report.weightedCacheHit * 100).toFixed(1)}% is below ${args.failBelow}%`)
    // process.exit() would truncate the buffered stdout report when piped (the
    // exact --fail-below CI case); set the code and let the process drain.
    process.exitCode = 1
    return
  }
  if (!report.healthy && args.failBelow != null) process.exitCode = 1
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
