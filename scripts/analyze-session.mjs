#!/usr/bin/env node
/**
 * Diagnose a DeepSeek Harness session.jsonl for oauth-subs cache affinity.
 *
 *   node scripts/analyze-session.mjs path/to/session.jsonl
 *   node scripts/analyze-session.mjs --json path/to/session.jsonl
 *   node scripts/analyze-session.mjs --fail-below 80 path/to/session.jsonl
 */

import { readFile } from 'node:fs/promises'
import { analyzeSession, formatReport } from '../lib/analyze-session.js'

function parseArgs(argv) {
  const args = { json: false, failBelow: null, path: null }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--json') args.json = true
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
  if (!args.path) {
    console.error('usage: node scripts/analyze-session.mjs [--json] [--fail-below N] <session.jsonl>')
    process.exit(2)
  }
  const text = await readFile(args.path, 'utf8')
  const report = analyzeSession(text)
  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  } else {
    process.stdout.write(`${formatReport(report)}\n`)
  }
  if (args.failBelow != null && report.weightedCacheHit * 100 < args.failBelow) {
    console.error(`cache hit ${(report.weightedCacheHit * 100).toFixed(1)}% is below ${args.failBelow}%`)
    process.exit(1)
  }
  if (!report.healthy && args.failBelow != null) process.exit(1)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
